"""Foto de perfil do usuário: validação, gravação no MinIO e URL assinada.

O front recorta a imagem (quadrada, ~320 px) antes de enviar — o canvas também descarta os
metadados EXIF (localização, aparelho). Aqui só aceitamos JPEG/PNG/WebP de verdade (assinatura
dos bytes, não o content-type que o navegador declara) e até 2 MB.
"""
import asyncio
import uuid
from datetime import datetime
from typing import Optional

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.cache import invalidate_user
from app.core.storage import delete_object, get_presigned_url, upload_file
from app.modules.super_admin.models import User

MAX_AVATAR_BYTES = 2 * 1024 * 1024


def _content_type(data: bytes) -> Optional[str]:
    if data[:3] == b"\xff\xd8\xff":
        return "image/jpeg"
    if data[:8] == b"\x89PNG\r\n\x1a\n":
        return "image/png"
    if data[:4] == b"RIFF" and data[8:12] == b"WEBP":
        return "image/webp"
    return None


def avatar_url(user) -> Optional[str]:
    key = getattr(user, "avatar_key", None)
    return (get_presigned_url(key) or None) if key else None


class AvatarService:
    @staticmethod
    async def _user(db: AsyncSession, user_id: uuid.UUID) -> User:
        user = (await db.execute(select(User).where(User.id == user_id))).scalar_one_or_none()
        if not user:
            raise HTTPException(status_code=404, detail="Usuário não encontrado.")
        return user

    @staticmethod
    async def save(db: AsyncSession, user_id: uuid.UUID, data: bytes) -> Optional[str]:
        if not data:
            raise HTTPException(status_code=400, detail="Envie uma imagem.")
        if len(data) > MAX_AVATAR_BYTES:
            raise HTTPException(status_code=413, detail="A foto pode ter no máximo 2 MB.")
        ctype = _content_type(data)
        if not ctype:
            raise HTTPException(status_code=400, detail="Formato não aceito: use JPG, PNG ou WebP.")
        user = await AvatarService._user(db, user_id)
        old = user.avatar_key
        key = await asyncio.to_thread(upload_file, data, ctype, None, None, f"avatars/{user_id}")
        user.avatar_key = key
        user.avatar_updated_at = datetime.utcnow()
        await db.commit()
        await invalidate_user(user_id)  # o usuário fica em cache (get_current_user)
        if old and old != key:
            await asyncio.to_thread(delete_object, old)
        return avatar_url(user)

    @staticmethod
    async def remove(db: AsyncSession, user_id: uuid.UUID) -> None:
        user = await AvatarService._user(db, user_id)
        old = user.avatar_key
        user.avatar_key = None
        user.avatar_updated_at = datetime.utcnow()
        await db.commit()
        await invalidate_user(user_id)
        if old:
            await asyncio.to_thread(delete_object, old)
