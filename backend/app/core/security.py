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


def create_first_access_token(
    *,
    user_id: uuid.UUID | None = None,
    person_id: uuid.UUID | None = None,
    tenant_id: uuid.UUID | None = None,
) -> str:
    """Token de primeiro acesso — válido por 30 minutos."""
    payload: dict = {"typ": "first_access"}
    if user_id:
        payload["sub"] = str(user_id)
    if person_id:
        payload["person_id"] = str(person_id)
    if tenant_id:
        payload["tenant_id"] = str(tenant_id)
    return _create_token(payload, timedelta(minutes=30))


def decode_first_access_token(token: str) -> dict:
    """Decodifica e valida token de primeiro acesso."""
    try:
        payload = jwt.decode(token, settings.SECRET_KEY, algorithms=[settings.JWT_ALGORITHM])
    except JWTError:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Token de primeiro acesso inválido ou expirado.",
        )
    if payload.get("typ") != "first_access":
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

# ─────────────────────────────────────────────
# CACHE DO USUÁRIO AUTENTICADO
# ─────────────────────────────────────────────
# O current_user já é detached após get_current_user (a sessão fecha), então
# reconstruir um User transiente a partir do cache é equivalente para os
# consumidores (só leem colunas escalares; nenhum acessa relações lazy).
# hashed_password NÃO é cacheado — não é usado no current_user injetado e
# manter credencial fora do Redis é defense-in-depth.

def _serialize_user(u: User) -> dict:
    return {
        "id": str(u.id),
        "tenant_id": str(u.tenant_id) if u.tenant_id else None,
        "email": u.email,
        "full_name": u.full_name,
        "role": u.role.value if hasattr(u.role, "value") else u.role,
        "role_id": str(u.role_id) if u.role_id else None,
        "is_active": u.is_active,
        "last_login": u.last_login.isoformat() if u.last_login else None,
        "created_at": u.created_at.isoformat() if u.created_at else None,
        "updated_at": u.updated_at.isoformat() if u.updated_at else None,
    }


def _deserialize_user(d: dict) -> User:
    return User(
        id=uuid.UUID(d["id"]),
        tenant_id=uuid.UUID(d["tenant_id"]) if d["tenant_id"] else None,
        email=d["email"],
        full_name=d["full_name"],
        hashed_password="",  # não cacheado
        role=UserRole(d["role"]),
        role_id=uuid.UUID(d["role_id"]) if d["role_id"] else None,
        is_active=d["is_active"],
        last_login=datetime.fromisoformat(d["last_login"]) if d["last_login"] else None,
        created_at=datetime.fromisoformat(d["created_at"]) if d["created_at"] else None,
        updated_at=datetime.fromisoformat(d["updated_at"]) if d["updated_at"] else None,
    )


async def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(bearer_scheme),
) -> User:
    from app.core.database import AsyncSessionLocal
    from app.core.cache import cache_get, cache_set, user_key

    payload = decode_token(credentials.credentials)
    user_id = payload.get("sub")
    if not user_id:
        raise HTTPException(status_code=401, detail="Token sem identificação.")

    if settings.AUTH_CACHE_TTL > 0:
        cached = await cache_get(user_key(user_id))
        if cached is not None:
            return _deserialize_user(cached)

    from sqlalchemy import text
    async with AsyncSessionLocal() as session:
        await session.execute(text("SET search_path TO public"))
        result = await session.execute(select(User).where(User.id == uuid.UUID(user_id)))
        user = result.scalar_one_or_none()

    if not user or not user.is_active:
        raise HTTPException(status_code=401, detail="Usuário não encontrado ou inativo.")

    # Só cacheia usuários ativos (evita persistir estados que resultam em 401).
    if settings.AUTH_CACHE_TTL > 0:
        await cache_set(user_key(user_id), _serialize_user(user), settings.AUTH_CACHE_TTL)

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
