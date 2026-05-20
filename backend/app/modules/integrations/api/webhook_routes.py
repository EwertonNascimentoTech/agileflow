"""
Rotas públicas de webhooks para WhatsApp Cloud API e Instagram Direct.

Cada tenant tem seu próprio endpoint com seu slug para isolamento.
As credenciais (phone_number_id, access_token, app_secret, verify_token)
ficam em ChannelConfig.credentials do tenant.
"""
import logging
from typing import Optional

from fastapi import APIRouter, BackgroundTasks, HTTPException, Query, Request, Response
from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import AsyncSessionLocal, engine
from app.modules.integrations import whatsapp as wa_lib
from app.modules.integrations import instagram as ig_lib

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/webhooks", tags=["Webhooks"])


# ─────────────────────────────────────────────
# Helpers: resolução de tenant + canal
# ─────────────────────────────────────────────

async def _get_tenant_schema(slug: str) -> Optional[str]:
    """Retorna o schema_name do tenant pelo slug, ou None se não existir."""
    from app.modules.super_admin.models import Tenant
    async with AsyncSessionLocal() as db:
        await db.execute(text("SET search_path TO public"))
        result = await db.execute(
            select(Tenant.schema_name).where(Tenant.slug == slug, Tenant.is_active == True)  # noqa: E712
        )
        row = result.scalar_one_or_none()
    return row


async def _get_channel_config(schema: str, channel_type: str) -> Optional[dict]:
    """
    Retorna o primeiro ChannelConfig ativo do tipo informado para o tenant.
    Retorna credentials dict ou None.
    """
    async with engine.connect() as conn:
        await conn.execute(text(f"SET search_path TO {schema}, public"))
        result = await conn.execute(
            text("""
                SELECT id, credentials, config
                FROM channel_configs
                WHERE channel = :ch AND is_active = TRUE
                ORDER BY created_at ASC
                LIMIT 1
            """),
            {"ch": channel_type},
        )
        row = result.fetchone()
    if row:
        return {"id": str(row[0]), "credentials": row[1] or {}, "config": row[2] or {}}
    return None


# ─────────────────────────────────────────────
# WHATSAPP
# ─────────────────────────────────────────────

@router.get("/whatsapp/{tenant_slug}")
async def whatsapp_verify(
    tenant_slug: str,
    hub_mode: str = Query("", alias="hub.mode"),
    hub_verify_token: str = Query("", alias="hub.verify_token"),
    hub_challenge: str = Query("", alias="hub.challenge"),
):
    """Verificação de webhook pelo Meta (GET com hub.challenge)."""
    schema = await _get_tenant_schema(tenant_slug)
    if not schema:
        raise HTTPException(status_code=404, detail="Tenant não encontrado")

    cfg = await _get_channel_config(schema, "whatsapp")
    if not cfg:
        raise HTTPException(status_code=404, detail="Canal WhatsApp não configurado")

    verify_token = cfg["credentials"].get("verify_token", "")
    if hub_mode == "subscribe" and hub_verify_token == verify_token:
        return Response(content=hub_challenge, media_type="text/plain")

    raise HTTPException(status_code=403, detail="Token de verificação inválido")


@router.post("/whatsapp/{tenant_slug}", status_code=200)
async def whatsapp_webhook(
    tenant_slug: str,
    request: Request,
    background_tasks: BackgroundTasks,
):
    """Recebe eventos de mensagem do WhatsApp Cloud API."""
    body_bytes = await request.body()
    body = await request.json()

    schema = await _get_tenant_schema(tenant_slug)
    if not schema:
        return {"status": "ignored"}

    cfg = await _get_channel_config(schema, "whatsapp")
    if not cfg:
        return {"status": "ignored"}

    # Valida assinatura se app_secret estiver configurado
    app_secret = cfg["credentials"].get("app_secret", "")
    sig_header = request.headers.get("X-Hub-Signature-256", "")
    if app_secret and sig_header:
        if not wa_lib.verify_signature(body_bytes, sig_header, app_secret):
            raise HTTPException(status_code=403, detail="Assinatura inválida")

    messages = wa_lib.parse_whatsapp_webhook(body)
    if messages:
        background_tasks.add_task(
            _process_whatsapp_messages, schema, cfg, messages
        )

    return {"status": "ok"}


async def _process_whatsapp_messages(schema: str, cfg: dict, messages: list[dict]) -> None:
    """Processa mensagens WhatsApp em background: cria/atualiza atendimento e registra mensagem."""
    from app.modules.crm.models import (
        Attendance, AttendanceMessage, Client,
        ChannelConfig, SenderType, MessageType, ChannelType,
    )
    from app.modules.crm.service import AttendanceService, TimelineService
    from app.modules.crm.models import LeadEventType

    channel_config_id = cfg["id"]

    async with AsyncSessionLocal() as db:
        await db.execute(text(f"SET search_path TO {schema}, public"))
        try:
            for msg_data in messages:
                phone = msg_data["phone_number"]
                content = msg_data["content"]
                wa_id = msg_data["wa_message_id"]
                msg_type_raw = msg_data["message_type"]

                # Descobre client pelo telefone
                client_result = await db.execute(
                    select(Client).where(Client.phone == phone)
                )
                client = client_result.scalar_one_or_none()

                # Descobre atendimento aberto para esse cliente no canal
                attendance = None
                if client:
                    att_result = await db.execute(
                        select(Attendance).where(
                            Attendance.client_id == client.id,
                            Attendance.channel == ChannelType.WHATSAPP,
                        ).order_by(Attendance.opened_at.desc()).limit(1)
                    )
                    attendance = att_result.scalar_one_or_none()

                if not attendance:
                    logger.info(
                        "[WA] Mensagem de %s sem atendimento ativo — ignorando (crie atendimento manual).",
                        phone,
                    )
                    continue

                # Mapeia tipo
                message_type = _map_wa_type(msg_type_raw)

                # Evita duplicatas pelo external_id
                dup = await db.execute(
                    select(AttendanceMessage).where(
                        AttendanceMessage.external_id == wa_id
                    ).limit(1)
                )
                if dup.scalar_one_or_none():
                    continue

                msg = AttendanceMessage(
                    attendance_id=attendance.id,
                    sender_type=SenderType.CLIENT,
                    content=content,
                    message_type=message_type,
                    external_id=wa_id,
                    extra_data={"whatsapp": True, "channel_config_id": channel_config_id},
                )
                db.add(msg)

                from datetime import datetime
                attendance.last_interaction = datetime.utcnow()

                await TimelineService.add_event(
                    db, attendance.id,
                    content=f"📱 Mensagem WhatsApp recebida: {content[:100]}",
                    event_type=LeadEventType.MESSAGE_RECEIVED,
                    author_name="WhatsApp",
                    commit=False,
                )

            await db.commit()
        except Exception as e:  # noqa: BLE001
            logger.error("[WA] Erro ao processar mensagem: %s", e)
            await db.rollback()


def _map_wa_type(wa_type: str) -> "MessageType":
    from app.modules.crm.models import MessageType
    mapping = {
        "text": MessageType.TEXT,
        "image": MessageType.IMAGE,
        "audio": MessageType.AUDIO,
        "document": MessageType.DOCUMENT,
        "video": MessageType.VIDEO,
        "location": MessageType.LOCATION,
    }
    return mapping.get(wa_type, MessageType.TEXT)


# ─────────────────────────────────────────────
# INSTAGRAM
# ─────────────────────────────────────────────

@router.get("/instagram/{tenant_slug}")
async def instagram_verify(
    tenant_slug: str,
    hub_mode: str = Query("", alias="hub.mode"),
    hub_verify_token: str = Query("", alias="hub.verify_token"),
    hub_challenge: str = Query("", alias="hub.challenge"),
):
    """Verificação de webhook pelo Meta (GET com hub.challenge)."""
    schema = await _get_tenant_schema(tenant_slug)
    if not schema:
        raise HTTPException(status_code=404, detail="Tenant não encontrado")

    cfg = await _get_channel_config(schema, "instagram")
    if not cfg:
        raise HTTPException(status_code=404, detail="Canal Instagram não configurado")

    verify_token = cfg["credentials"].get("verify_token", "")
    if hub_mode == "subscribe" and hub_verify_token == verify_token:
        return Response(content=hub_challenge, media_type="text/plain")

    raise HTTPException(status_code=403, detail="Token de verificação inválido")


@router.post("/instagram/{tenant_slug}", status_code=200)
async def instagram_webhook(
    tenant_slug: str,
    request: Request,
    background_tasks: BackgroundTasks,
):
    """Recebe eventos de DM do Instagram."""
    body_bytes = await request.body()
    body = await request.json()

    schema = await _get_tenant_schema(tenant_slug)
    if not schema:
        return {"status": "ignored"}

    cfg = await _get_channel_config(schema, "instagram")
    if not cfg:
        return {"status": "ignored"}

    app_secret = cfg["credentials"].get("app_secret", "")
    sig_header = request.headers.get("X-Hub-Signature-256", "")
    if app_secret and sig_header:
        if not ig_lib.verify_signature(body_bytes, sig_header, app_secret):
            raise HTTPException(status_code=403, detail="Assinatura inválida")

    messages = ig_lib.parse_instagram_webhook(body)
    if messages:
        background_tasks.add_task(
            _process_instagram_messages, schema, cfg, messages
        )

    return {"status": "ok"}


async def _process_instagram_messages(schema: str, cfg: dict, messages: list[dict]) -> None:
    """Processa DMs Instagram em background."""
    from app.modules.crm.models import (
        Attendance, AttendanceMessage, Client,
        SenderType, MessageType, ChannelType,
    )
    from app.modules.crm.service import TimelineService
    from app.modules.crm.models import LeadEventType

    async with AsyncSessionLocal() as db:
        await db.execute(text(f"SET search_path TO {schema}, public"))
        try:
            for msg_data in messages:
                sender_id = msg_data["sender_id"]
                content = msg_data["content"]
                msg_id = msg_data["message_id"]

                # Localiza cliente pelo instagram_id (armazenado em extra_data)
                from sqlalchemy import cast, String
                from sqlalchemy.dialects.postgresql import JSONB
                client_result = await db.execute(
                    select(Client).where(
                        Client.extra_data["instagram_id"].astext == sender_id
                    )
                )
                client = client_result.scalar_one_or_none()

                attendance = None
                if client:
                    att_result = await db.execute(
                        select(Attendance).where(
                            Attendance.client_id == client.id,
                            Attendance.channel == ChannelType.INSTAGRAM,
                        ).order_by(Attendance.opened_at.desc()).limit(1)
                    )
                    attendance = att_result.scalar_one_or_none()

                if not attendance:
                    continue

                dup = await db.execute(
                    select(AttendanceMessage).where(
                        AttendanceMessage.external_id == msg_id
                    ).limit(1)
                )
                if dup.scalar_one_or_none():
                    continue

                msg = AttendanceMessage(
                    attendance_id=attendance.id,
                    sender_type=SenderType.CLIENT,
                    content=content,
                    message_type=MessageType.TEXT,
                    external_id=msg_id,
                    extra_data={"instagram": True},
                )
                db.add(msg)

                from datetime import datetime
                attendance.last_interaction = datetime.utcnow()

                await TimelineService.add_event(
                    db, attendance.id,
                    content=f"📸 Mensagem Instagram recebida: {content[:100]}",
                    event_type=LeadEventType.MESSAGE_RECEIVED,
                    author_name="Instagram",
                    commit=False,
                )

            await db.commit()
        except Exception as e:  # noqa: BLE001
            logger.error("[IG] Erro ao processar mensagem: %s", e)
            await db.rollback()
