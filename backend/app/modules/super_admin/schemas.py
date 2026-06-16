import uuid
from datetime import datetime
from typing import Optional, List

from pydantic import BaseModel, EmailStr, Field, field_validator
import re

from app.core.security import validate_password_strength
from app.modules.super_admin.models import UserRole


# ══════════════════════════════════════
# MODULE SCHEMAS (registry of developed modules)
# ══════════════════════════════════════

_HEX_RE = re.compile(r"^#[0-9A-Fa-f]{6}$")


class ModuleCreate(BaseModel):
    slug: str = Field(..., min_length=2, max_length=50)
    name: str = Field(..., min_length=2, max_length=100)
    description: Optional[str] = None
    icon: Optional[str] = Field(None, max_length=50)
    color: str = Field(default="#3B82F6", min_length=7, max_length=7)
    backend_path: str = Field(..., min_length=2, max_length=255)
    frontend_path: str = Field(..., min_length=2, max_length=255)
    is_active: bool = True

    @field_validator("slug")
    @classmethod
    def slug_must_be_valid(cls, v: str) -> str:
        if not re.match(r"^[a-z0-9_]+$", v):
            raise ValueError("Slug deve conter apenas letras minúsculas, números e underscores.")
        return v

    @field_validator("color")
    @classmethod
    def color_must_be_hex(cls, v: str) -> str:
        if not _HEX_RE.match(v):
            raise ValueError("Cor deve estar no formato hexadecimal #RRGGBB.")
        return v.upper()


class ModuleUpdate(BaseModel):
    name: Optional[str] = Field(None, min_length=2, max_length=100)
    description: Optional[str] = None
    icon: Optional[str] = Field(None, max_length=50)
    color: Optional[str] = Field(None, min_length=7, max_length=7)
    backend_path: Optional[str] = Field(None, min_length=2, max_length=255)
    frontend_path: Optional[str] = Field(None, min_length=2, max_length=255)
    is_active: Optional[bool] = None

    @field_validator("color")
    @classmethod
    def color_must_be_hex(cls, v: Optional[str]) -> Optional[str]:
        if v is None:
            return v
        if not _HEX_RE.match(v):
            raise ValueError("Cor deve estar no formato hexadecimal #RRGGBB.")
        return v.upper()


class ModuleResponse(BaseModel):
    id: uuid.UUID
    slug: str
    name: str
    description: Optional[str]
    icon: Optional[str]
    color: str
    backend_path: str
    frontend_path: str
    is_active: bool
    created_at: datetime

    model_config = {"from_attributes": True}


# ══════════════════════════════════════
# PLAN SCHEMAS
# ══════════════════════════════════════

class PlanCreate(BaseModel):
    name: str = Field(..., min_length=2, max_length=100)
    description: Optional[str] = None
    price: float = Field(..., ge=0)
    max_users: int = Field(..., ge=1)
    modules: List[str] = Field(default_factory=list)


class PlanUpdate(BaseModel):
    name: Optional[str] = Field(None, min_length=2, max_length=100)
    description: Optional[str] = None
    price: Optional[float] = Field(None, ge=0)
    max_users: Optional[int] = Field(None, ge=1)
    is_active: Optional[bool] = None
    modules: Optional[List[str]] = None


class PlanResponse(BaseModel):
    id: uuid.UUID
    name: str
    description: Optional[str]
    price: float
    max_users: int
    is_active: bool
    modules: List[str]
    created_at: datetime

    model_config = {"from_attributes": True}


# ══════════════════════════════════════
# TENANT SCHEMAS
# ══════════════════════════════════════

class TenantCreate(BaseModel):
    name: str = Field(..., min_length=2, max_length=200)
    slug: str = Field(..., min_length=2, max_length=100)
    plan_id: Optional[uuid.UUID] = None
    plan_expires_at: Optional[datetime] = None

    @field_validator("slug")
    @classmethod
    def slug_must_be_valid(cls, v: str) -> str:
        if not re.match(r"^[a-z0-9\-]+$", v):
            raise ValueError("Slug deve conter apenas letras minúsculas, números e hífens.")
        return v


class TenantUpdate(BaseModel):
    name: Optional[str] = Field(None, min_length=2, max_length=200)
    plan_id: Optional[uuid.UUID] = None
    plan_expires_at: Optional[datetime] = None
    is_active: Optional[bool] = None


class TenantModuleResponse(BaseModel):
    module_slug: str
    is_active: bool
    activated_at: datetime

    model_config = {"from_attributes": True}


class TenantResponse(BaseModel):
    id: uuid.UUID
    name: str
    slug: str
    schema_name: str
    plan_id: Optional[uuid.UUID]
    is_active: bool
    plan_expires_at: Optional[datetime]
    active_modules: List[TenantModuleResponse]
    created_at: datetime

    model_config = {"from_attributes": True}


class TenantSummary(BaseModel):
    id: uuid.UUID
    name: str
    slug: str
    is_active: bool
    plan_id: Optional[uuid.UUID]
    created_at: datetime

    model_config = {"from_attributes": True}


# ══════════════════════════════════════
# MODULE ACTIVATION SCHEMAS
# ══════════════════════════════════════

class ModuleActivate(BaseModel):
    module_slug: str


class ModuleToggle(BaseModel):
    is_active: bool


# ══════════════════════════════════════
# USER SCHEMAS
# ══════════════════════════════════════

class UserCreate(BaseModel):
    email: EmailStr
    full_name: str = Field(..., min_length=2, max_length=200)
    password: str
    role: UserRole = UserRole.COMPANY_USER
    role_id: Optional[uuid.UUID] = None
    tenant_id: Optional[uuid.UUID] = None

    @field_validator("password")
    @classmethod
    def _password_strong(cls, v: str) -> str:
        return validate_password_strength(v)


class UserUpdate(BaseModel):
    full_name: Optional[str] = Field(None, min_length=2, max_length=200)
    is_active: Optional[bool] = None
    role: Optional[UserRole] = None
    role_id: Optional[uuid.UUID] = None


class UserResponse(BaseModel):
    id: uuid.UUID
    email: str
    full_name: str
    role: UserRole
    role_id: Optional[uuid.UUID]
    role_name: Optional[str] = None  # nome da role custom (para o frontend decidir a visão)
    permissions: List[str] = Field(default_factory=list)  # permissões efetivas; ["*"] = acesso total
    position_slug: Optional[str] = None  # slug do cargo no TeamOps (ex: "coordenador") — frontend usa p/ menu
    tenant_id: Optional[uuid.UUID]
    is_active: bool
    last_login: Optional[datetime]
    created_at: datetime

    model_config = {"from_attributes": True}


# ══════════════════════════════════════
# PERMISSIONS / ROLES
# ══════════════════════════════════════

class ModulePermissionResponse(BaseModel):
    code: str
    name: str
    description: Optional[str]
    module_slug: str

    model_config = {"from_attributes": True}


class RoleCreate(BaseModel):
    name: str = Field(..., min_length=2, max_length=100)
    description: Optional[str] = None
    permissions: List[str] = Field(default_factory=list)


class RoleUpdate(BaseModel):
    name: Optional[str] = Field(None, min_length=2, max_length=100)
    description: Optional[str] = None
    permissions: Optional[List[str]] = None


class RoleResponse(BaseModel):
    id: uuid.UUID
    tenant_id: uuid.UUID
    name: str
    description: Optional[str]
    is_system: bool
    permissions: List[str]
    user_count: int = 0
    created_at: datetime

    model_config = {"from_attributes": True}


# ══════════════════════════════════════
# AUTH SCHEMAS
# ══════════════════════════════════════

class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class TokenResponse(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"
    user: UserResponse


class TokenPayload(BaseModel):
    sub: str
    role: UserRole
    tenant_id: Optional[str]
    exp: int
