"""
Integração WhatsApp Cloud API (Meta Graph API v19+).

Fluxo de entrada:
  GET  /webhooks/whatsapp/{tenant_slug}  — verificação do webhook (hub.challenge)
  POST /webhooks/whatsapp/{tenant_slug}  — recebimento de mensagens

Fluxo de saída:
  send_whatsapp_message() — envia mensagem de texto ou template via Graph API
"""
import hashlib
import hmac
import json
import logging
from typing import Optional

import httpx

logger = logging.getLogger(__name__)

GRAPH_API_URL = "https://graph.facebook.com/v19.0"


# ─────────────────────────────────────────────
# Verificação de assinatura
# ─────────────────────────────────────────────

def verify_signature(payload: bytes, signature_header: str, app_secret: str) -> bool:
    """Valida o header X-Hub-Signature-256 enviado pela Meta."""
    if not signature_header.startswith("sha256="):
        return False
    expected = "sha256=" + hmac.new(
        app_secret.encode(), payload, hashlib.sha256
    ).hexdigest()
    return hmac.compare_digest(expected, signature_header)


# ─────────────────────────────────────────────
# Parser de webhook payload
# ─────────────────────────────────────────────

def parse_whatsapp_webhook(body: dict) -> list[dict]:
    """
    Extrai lista de mensagens de um payload de webhook WhatsApp Cloud API.
    Cada item retornado tem: phone_number, wa_message_id, message_type, content, media_id
    """
    messages = []
    for entry in body.get("entry", []):
        for change in entry.get("changes", []):
            value = change.get("value", {})
            for msg in value.get("messages", []):
                from_number = msg.get("from", "")
                wa_id = msg.get("id", "")
                msg_type = msg.get("type", "text")

                content = ""
                media_id = None

                if msg_type == "text":
                    content = msg.get("text", {}).get("body", "")
                elif msg_type in ("image", "video", "audio", "document", "sticker"):
                    media = msg.get(msg_type, {})
                    media_id = media.get("id")
                    content = media.get("caption", f"[{msg_type}]") or f"[{msg_type}]"
                elif msg_type == "location":
                    loc = msg.get("location", {})
                    content = f"[localização: {loc.get('latitude')},{loc.get('longitude')}]"
                elif msg_type == "interactive":
                    interactive = msg.get("interactive", {})
                    if interactive.get("type") == "button_reply":
                        content = interactive.get("button_reply", {}).get("title", "")
                    else:
                        content = interactive.get("list_reply", {}).get("title", "")
                else:
                    content = f"[{msg_type}]"

                messages.append({
                    "phone_number": from_number,
                    "wa_message_id": wa_id,
                    "message_type": msg_type,
                    "content": content,
                    "media_id": media_id,
                    "timestamp": msg.get("timestamp"),
                    "contacts": value.get("contacts", []),
                })
    return messages


# ─────────────────────────────────────────────
# Envio de mensagens
# ─────────────────────────────────────────────

async def send_text_message(
    phone_number_id: str,
    access_token: str,
    to: str,
    text: str,
) -> Optional[str]:
    """Envia mensagem de texto. Retorna o wa_message_id ou None em caso de erro."""
    url = f"{GRAPH_API_URL}/{phone_number_id}/messages"
    payload = {
        "messaging_product": "whatsapp",
        "to": to,
        "type": "text",
        "text": {"preview_url": False, "body": text},
    }
    async with httpx.AsyncClient(timeout=10) as client:
        resp = await client.post(
            url,
            json=payload,
            headers={"Authorization": f"Bearer {access_token}"},
        )
    if resp.status_code == 200:
        data = resp.json()
        messages = data.get("messages", [])
        return messages[0].get("id") if messages else None
    else:
        logger.error("WhatsApp send failed %s: %s", resp.status_code, resp.text)
        return None


async def send_template_message(
    phone_number_id: str,
    access_token: str,
    to: str,
    template_name: str,
    language_code: str = "pt_BR",
    components: Optional[list] = None,
) -> Optional[str]:
    """Envia mensagem de template aprovado pelo WhatsApp Business."""
    url = f"{GRAPH_API_URL}/{phone_number_id}/messages"
    payload = {
        "messaging_product": "whatsapp",
        "to": to,
        "type": "template",
        "template": {
            "name": template_name,
            "language": {"code": language_code},
            "components": components or [],
        },
    }
    async with httpx.AsyncClient(timeout=10) as client:
        resp = await client.post(
            url,
            json=payload,
            headers={"Authorization": f"Bearer {access_token}"},
        )
    if resp.status_code == 200:
        data = resp.json()
        messages = data.get("messages", [])
        return messages[0].get("id") if messages else None
    else:
        logger.error("WhatsApp template send failed %s: %s", resp.status_code, resp.text)
        return None


async def download_media(media_id: str, access_token: str) -> Optional[bytes]:
    """Baixa mídia do WhatsApp Cloud API pelo media_id."""
    async with httpx.AsyncClient(timeout=30) as client:
        # 1. Obtém URL de download
        meta_resp = await client.get(
            f"{GRAPH_API_URL}/{media_id}",
            headers={"Authorization": f"Bearer {access_token}"},
        )
        if meta_resp.status_code != 200:
            return None
        download_url = meta_resp.json().get("url")
        if not download_url:
            return None

        # 2. Baixa o arquivo
        dl_resp = await client.get(
            download_url,
            headers={"Authorization": f"Bearer {access_token}"},
        )
        if dl_resp.status_code == 200:
            return dl_resp.content
    return None
