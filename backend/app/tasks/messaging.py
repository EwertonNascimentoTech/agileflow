"""
Celery tasks para envio assíncrono de mensagens WhatsApp/Instagram.
"""
import asyncio
import logging
import uuid
from typing import Optional

from app.core.celery_app import celery_app

logger = logging.getLogger(__name__)


def _run(coro):
    """Executa uma coroutine no worker síncrono do Celery."""
    loop = asyncio.new_event_loop()
    try:
        return loop.run_until_complete(coro)
    finally:
        loop.close()


@celery_app.task(
    bind=True,
    max_retries=3,
    default_retry_delay=30,
    name="messaging.send_whatsapp",
)
def send_whatsapp_message_task(
    self,
    schema: str,
    attendance_id: str,
    message_id: str,
    phone_number_id: str,
    access_token: str,
    to: str,
    text: str,
):
    """Envia mensagem de texto no WhatsApp e grava o external_id na mensagem."""
    try:
        from app.modules.integrations.whatsapp import send_text_message
        wa_id = _run(send_text_message(phone_number_id, access_token, to, text))
        if wa_id:
            _run(_update_external_id(schema, message_id, wa_id))
            logger.info("[WA] Mensagem %s enviada — wa_id=%s", message_id, wa_id)
        else:
            raise RuntimeError("WhatsApp API retornou wa_id vazio")
    except Exception as exc:  # noqa: BLE001
        logger.warning("[WA] Tentativa %d falhou: %s", self.request.retries + 1, exc)
        raise self.retry(exc=exc)


@celery_app.task(
    bind=True,
    max_retries=3,
    default_retry_delay=30,
    name="messaging.send_instagram",
)
def send_instagram_message_task(
    self,
    schema: str,
    attendance_id: str,
    message_id: str,
    page_id: str,
    access_token: str,
    recipient_id: str,
    text: str,
):
    """Envia DM no Instagram e grava o external_id na mensagem."""
    try:
        from app.modules.integrations.instagram import send_text_message
        ig_id = _run(send_text_message(page_id, access_token, recipient_id, text))
        if ig_id:
            _run(_update_external_id(schema, message_id, ig_id))
            logger.info("[IG] Mensagem %s enviada — ig_id=%s", message_id, ig_id)
        else:
            raise RuntimeError("Instagram API retornou id vazio")
    except Exception as exc:  # noqa: BLE001
        logger.warning("[IG] Tentativa %d falhou: %s", self.request.retries + 1, exc)
        raise self.retry(exc=exc)


async def _update_external_id(schema: str, message_id: str, external_id: str) -> None:
    from sqlalchemy import text, update
    from app.core.database import AsyncSessionLocal
    from app.modules.atendimento.models import AttendanceMessage

    async with AsyncSessionLocal() as db:
        await db.execute(text(f"SET search_path TO {schema}, public"))
        await db.execute(
            update(AttendanceMessage)
            .where(AttendanceMessage.id == uuid.UUID(message_id))
            .values(external_id=external_id)
        )
        await db.commit()


# ─────────────────────────────────────────────
# Envio de follow-up com delay via Celery
# ─────────────────────────────────────────────

@celery_app.task(name="messaging.send_followup_delayed")
def send_followup_delayed_task(
    schema: str,
    attendance_id: str,
    template_id: str,
):
    """
    Executa o envio de um follow-up com delay configurado no template.
    Chamada com .apply_async(countdown=delay_seconds) pela service layer.
    """
    _run(_send_followup(schema, attendance_id, template_id))


async def _send_followup(schema: str, attendance_id: str, template_id: str) -> None:
    from sqlalchemy import text, select
    from app.core.database import AsyncSessionLocal
    from app.modules.atendimento.models import (
        Attendance, FollowUpTemplate, AttendanceMessage,
        SenderType, MessageType, FollowUpChannel,
    )
    from app.modules.atendimento.service import FollowUpService, TimelineService
    from app.modules.atendimento.models import LeadEventType
    from datetime import datetime

    async with AsyncSessionLocal() as db:
        await db.execute(text(f"SET search_path TO {schema}, public"))

        att_result = await db.execute(
            select(Attendance).where(Attendance.id == uuid.UUID(attendance_id))
        )
        attendance = att_result.scalar_one_or_none()
        if not attendance:
            return

        tpl_result = await db.execute(
            select(FollowUpTemplate).where(
                FollowUpTemplate.id == uuid.UUID(template_id), FollowUpTemplate.is_active == True  # noqa: E712
            )
        )
        tpl = tpl_result.scalar_one_or_none()
        if not tpl:
            return

        # Constrói contexto de variáveis
        ctx = await FollowUpService._build_context(db, attendance, None, None)
        rendered = FollowUpService._interpolate(tpl.message, ctx)

        if tpl.channel == FollowUpChannel.INTERNAL:
            await TimelineService.add_event(
                db, attendance.id,
                content=f"📋 Follow-up '{tpl.name}' (delayed): {rendered}",
                event_type=LeadEventType.AUTOMATION,
                author_name="sistema",
            )
        else:
            msg = AttendanceMessage(
                attendance_id=attendance.id,
                sender_type=SenderType.BOT,
                content=rendered,
                message_type=MessageType.TEXT,
                extra_data={"follow_up_template_id": str(tpl.id), "delayed": True},
            )
            db.add(msg)
            attendance.last_interaction = datetime.utcnow()
            await db.flush()

            # Dispara envio real se canal configurado
            await _dispatch_outbound(db, schema, attendance, msg, tpl.channel)

            await TimelineService.add_event(
                db, attendance.id,
                content=f"📨 Follow-up '{tpl.name}' enviado (delayed) via {tpl.channel.value}.",
                event_type=LeadEventType.MESSAGE_SENT,
                author_name="sistema",
                commit=False,
            )
            await db.commit()


async def _dispatch_outbound(db, schema, attendance, msg, channel) -> None:
    """Despacha mensagem para a fila de envio WhatsApp/Instagram se configurado."""
    from sqlalchemy import select
    from app.modules.atendimento.models import ChannelConfig, Client, ChannelType

    if channel.value not in ("whatsapp", "instagram"):
        return

    cfg_result = await db.execute(
        select(ChannelConfig).where(
            ChannelConfig.channel == ChannelType(channel.value),
            ChannelConfig.is_active == True,  # noqa: E712
        ).limit(1)
    )
    cfg = cfg_result.scalar_one_or_none()
    if not cfg or not cfg.credentials:
        return

    client_result = await db.execute(
        select(Client).where(Client.id == attendance.client_id)
    )
    client = client_result.scalar_one_or_none()
    if not client:
        return

    if channel.value == "whatsapp":
        phone = client.phone or ""
        if not phone:
            return
        send_whatsapp_message_task.delay(
            schema=schema,
            attendance_id=str(attendance.id),
            message_id=str(msg.id),
            phone_number_id=cfg.credentials.get("phone_number_id", ""),
            access_token=cfg.credentials.get("access_token", ""),
            to=phone,
            text=msg.content,
        )
    elif channel.value == "instagram":
        ig_id = (client.extra_data or {}).get("instagram_id", "")
        if not ig_id:
            return
        send_instagram_message_task.delay(
            schema=schema,
            attendance_id=str(attendance.id),
            message_id=str(msg.id),
            page_id=cfg.credentials.get("page_id", ""),
            access_token=cfg.credentials.get("access_token", ""),
            recipient_id=ig_id,
            text=msg.content,
        )
