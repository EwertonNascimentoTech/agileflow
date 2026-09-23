"""
Integração Instagram Direct (via Meta Graph API / Messenger Platform).

O Instagram Direct usa o mesmo framework de webhook da Meta,
com um formato de payload similar ao WhatsApp.

Fluxo de entrada:
  GET  /webhooks/instagram/{tenant_slug}  — verificação hub.challenge
  POST /webhooks/instagram/{tenant_slug}  — recebimento de DMs

Fluxo de saída:
  send_instagram_message() — envia DM via Graph API
"""
import hashlib
import hmac
import logging
from typing import Optional

import httpx

logger = logging.getLogger(__name__)

GRAPH_API_URL = "https://graph.facebook.com/v19.0"


def verify_signature(payload: bytes, signature_header: str, app_secret: str) -> bool:
    """Valida o header X-Hub-Signature-256 enviado pela Meta."""
    if not signature_header.startswith("sha256="):
        return False
    expected = "sha256=" + hmac.new(
        app_secret.encode(), payload, hashlib.sha256
    ).hexdigest()
    return hmac.compare_digest(expected, signature_header)


def parse_instagram_webhook(body: dict) -> list[dict]:
    """
    Extrai mensagens de DM de um payload webhook Instagram.
    Retorna lista de: {sender_id, recipient_id, message_id, message_type, content, attachments}
    """
    messages = []
    for entry in body.get("entry", []):
        for messaging in entry.get("messaging", []):
            sender_id = messaging.get("sender", {}).get("id", "")
            recipient_id = messaging.get("recipient", {}).get("id", "")
            message = messaging.get("message", {})
            if not message:
                continue

            msg_id = message.get("mid", "")
            text = message.get("text", "")
            attachments = message.get("attachments", [])
            msg_type = "text" if text else "attachment"
            content = text or (f"[{attachments[0].get('type', 'media')}]" if attachments else "")

            messages.append({
                "sender_id": sender_id,
                "recipient_id": recipient_id,
                "message_id": msg_id,
                "message_type": msg_type,
                "content": content,
                "attachments": attachments,
                "timestamp": messaging.get("timestamp"),
            })
    return messages


async def send_text_message(
    page_id: str,
    access_token: str,
    recipient_id: str,
    text: str,
) -> Optional[str]:
    """Envia DM de texto no Instagram. Retorna o message_id ou None."""
    url = f"{GRAPH_API_URL}/{page_id}/messages"
    payload = {
        "recipient": {"id": recipient_id},
        "message": {"text": text},
        "messaging_type": "RESPONSE",
    }
    async with httpx.AsyncClient(timeout=10) as client:
        resp = await client.post(
            url,
            json=payload,
            headers={"Authorization": f"Bearer {access_token}"},
        )
    if resp.status_code == 200:
        return resp.json().get("message_id")
    else:
        logger.error("Instagram DM send failed %s: %s", resp.status_code, resp.text)
        return None


async def get_user_profile(user_id: str, access_token: str) -> dict:
    """Obtém nome e avatar do usuário do Instagram."""
    async with httpx.AsyncClient(timeout=10) as client:
        resp = await client.get(
            f"{GRAPH_API_URL}/{user_id}",
            params={"fields": "name,profile_pic", "access_token": access_token},
        )
    if resp.status_code == 200:
        return resp.json()
    return {}
