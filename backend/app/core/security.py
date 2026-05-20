import re
import uuid
from datetime import datetime, timedelta
from typing import Optional, Tuple

import bcrypt
from jose import JWTError, jwt
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.core.config import settings
from app.modules.super_admin.models import User, UserRole

bearer_scheme = HTTPBearer()


# ─────────────────────────────────────────────
# HASHING
# ─────────────────────────────────────────────

def get_password_hash(password: str) -> str:
    return bcrypt.hashpw(password.encode(), bcrypt.gensalt()).decode()


def verify_password(plain: str, hashed: str) -> bool:
    return bcrypt.checkpw(plain.encode(), hashed.encode())


# ─────────────────────────────────────────────
# POLÍTICA DE SENHA FORTE
# ─────────────────────────────────────────────

PASSWORD_MIN_LENGTH = 8
PASSWORD_POLICY_DESCRIPTION = (
    "Mínimo 8 caracteres, com pelo menos 1 letra maiúscula, 1 letra minúscula, "
    "1 número e 1 caractere especial."
)

_RE_UPPER = re.compile(r"[A-Z]")
_RE_LOWER = re.compile(r"[a-z]")
_RE_DIGIT = re.compile(r"\d")
_RE_SPECIAL = re.compile(r"[^A-Za-z0-9]")


def validate_password_strength(password: str) -> str:
    """
    Valida força da senha. Levanta ValueError com mensagem em PT-BR
    se não atende aos requisitos. Retorna a senha intacta se ok.
    """
    if not isinstance(password, str):
        raise ValueError("Senha inválida.")
    erros: list[str] = []
    if len(password) < PASSWORD_MIN_LENGTH:
        erros.append(f"mínimo {PASSWORD_MIN_LENGTH} caracteres")
    if not _RE_UPPER.search(password):
        erros.append("ao menos 1 letra maiúscula")
    if not _RE_LOWER.search(password):
        erros.append("ao menos 1 letra minúscula")
    if not _RE_DIGIT.search(password):
        erros.append("ao menos 1 número")
    if not _RE_SPECIAL.search(password):
        erros.append("ao menos 1 caractere especial")
    if erros:
        raise ValueError("Senha fraca: " + ", ".join(erros) + ".")
    return password


# ─────────────────────────────────────────────
# JWT
# ─────────────────────────────────────────────

def _create_token(data: dict, expires_delta: timedelta) -> str:
    payload = data.copy()
    payload["exp"] = datetime.utcnow() + expires_delta
    return jwt.encode(payload, settings.SECRET_KEY, algorithm=settings.JWT_ALGORITHM)


def create_tokens(user: User) -> Tuple[str, str]:
    base_payload = {
        "sub": str(user.id),
        "role": user.role.value,
        "tenant_id": str(user.tenant_id) if user.tenant_id else None,
    }
    access_token = _create_token(
        base_payload, timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
    )
    refresh_token = _create_token(
        {**base_payload, "type": "refresh"},
        timedelta(days=settings.REFRESH_TOKEN_EXPIRE_DAYS)
    )
    return access_token, refresh_token


def create_refresh_token(user_id: uuid.UUID) -> str:
    """Cria um refresh token JWT com 7 dias de validade."""
    return _create_token(
        {"sub": str(user_id), "typ": "refresh"},
        timedelta(days=settings.REFRESH_TOKEN_EXPIRE_DAYS),
    )


def decode_refresh_token(token: str) -> dict:
    """Decodifica e valida refresh token. Lança HTTPException se inválido."""
    try:
        payload = jwt.decode(token, settings.SECRET_KEY, algorithms=[settings.JWT_ALGORITHM])
    except JWTError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Refresh token inválido ou expirado.",
        )
    if payload.get("typ") != "refresh" and payload.get("type") != "refresh":
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token não é um refresh token.",
        )
    return payload


def create_password_reset_token(user_id: uuid.UUID) -> str:
    """Cria token de reset de senha com 15 minutos de validade."""
    return _create_token(
        {"sub": str(user_id), "typ": "password_reset"},
        timedelta(minutes=15),
    )


def decode_password_reset_token(token: str) -> dict:
    """Decodifica e valida token de reset de senha."""
    try:
        payload = jwt.decode(token, settings.SECRET_KEY, algorithms=[settings.JWT_ALGORITHM])
    except JWTError:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Token de reset inválido ou expirado.",
        )
    if payload.get("typ") != "password_reset":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Token inválido.",
        )
    return payload


def decode_token(token: str) -> dict:
    try:
        return jwt.decode(token, settings.SECRET_KEY, algorithms=[settings.JWT_ALGORITHM])
    except JWTError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token inválido ou expirado.",
            headers={"WWW-Authenticate": "Bearer"},
        )


# ─────────────────────────────────────────────
# DEPENDENCIES
# ─────────────────────────────────────────────

async def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(bearer_scheme),
) -> User:
    from app.core.database import AsyncSessionLocal

    payload = decode_token(credentials.credentials)
    user_id = payload.get("sub")
    if not user_id:
        raise HTTPException(status_code=401, detail="Token sem identificação.")

    from sqlalchemy import text
    async with AsyncSessionLocal() as session:
        await session.execute(text("SET search_path TO public"))
        result = await session.execute(select(User).where(User.id == uuid.UUID(user_id)))
        user = result.scalar_one_or_none()

    if not user or not user.is_active:
        raise HTTPException(status_code=401, detail="Usuário não encontrado ou inativo.")

    return user


def require_super_admin(current_user: User = Depends(get_current_user)) -> User:
    if current_user.role != UserRole.SUPER_ADMIN:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Apenas Super Admins podem acessar este recurso."
        )
    return current_user


def require_company_admin(current_user: User = Depends(get_current_user)) -> User:
    if current_user.role not in (UserRole.SUPER_ADMIN, UserRole.COMPANY_ADMIN):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Apenas Admins da empresa podem acessar este recurso."
        )
    return current_user


def require_authenticated(current_user: User = Depends(get_current_user)) -> User:
    return current_user


def require_tenant_access(tenant_id: uuid.UUID):
    """
    Guard de isolamento: usuário só acessa dados do próprio tenant.
    Super Admins passam sempre.
    """
    def guard(current_user: User = Depends(get_current_user)) -> User:
        if current_user.role == UserRole.SUPER_ADMIN:
            return current_user
        if current_user.tenant_id != tenant_id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Acesso negado a este tenant."
            )
        return current_user
    return guard
