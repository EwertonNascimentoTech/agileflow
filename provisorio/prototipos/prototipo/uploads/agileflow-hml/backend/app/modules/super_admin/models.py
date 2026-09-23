"""
Modelos do schema PUBLIC (escopo Super Admin).
Cada tenant terá seu próprio schema com os modelos de negócio.
"""
import uuid
import enum
from datetime import datetime
from typing import Optional

from sqlalchemy import (
    String, Boolean, DateTime, ForeignKey,
    Text, Numeric, Integer, Enum as SAEnum, UniqueConstraint
)
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.dialects.postgresql import UUID, JSONB

from app.core.database import Base

# Faz o SQLAlchemy usar o .value do enum (ex: "super_admin") em vez do .name ("SUPER_ADMIN")
_enum_values = lambda obj: [e.value for e in obj]  # noqa: E731


class UserRole(str, enum.Enum):
    SUPER_ADMIN    = "super_admin"
    COMPANY_ADMIN  = "company_admin"
    COMPANY_USER   = "company_user"


class Module(Base):
    """
    Registro de módulo desenvolvido na plataforma.
    Apenas módulos cadastrados aqui podem ser incluídos em planos / ativados em tenants.
    """
    __tablename__ = "modules"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    slug: Mapped[str]        = mapped_column(String(50), nullable=False, unique=True)
    name: Mapped[str]        = mapped_column(String(100), nullable=False)
    description: Mapped[Optional[str]] = mapped_column(Text)
    icon: Mapped[Optional[str]]        = mapped_column(String(50))
    color: Mapped[str]       = mapped_column(String(7), nullable=False, default="#3B82F6")
    backend_path: Mapped[str]  = mapped_column(String(255), nullable=False)
    frontend_path: Mapped[str] = mapped_column(String(255), nullable=False)
    is_active: Mapped[bool]  = mapped_column(Boolean, default=True, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow, onupdate=datetime.utcnow
    )


class Plan(Base):
    __tablename__ = "plans"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    name: Mapped[str]        = mapped_column(String(100), nullable=False, unique=True)
    description: Mapped[Optional[str]] = mapped_column(Text)
    price: Mapped[float]     = mapped_column(Numeric(10, 2), nullable=False, default=0)
    max_users: Mapped[int]   = mapped_column(Integer, nullable=False, default=5)
    is_active: Mapped[bool]  = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow, onupdate=datetime.utcnow
    )

    allowed_modules: Mapped[list["PlanModule"]] = relationship(
        back_populates="plan", cascade="all, delete-orphan"
    )
    tenants: Mapped[list["Tenant"]] = relationship(back_populates="plan")


class PlanModule(Base):
    __tablename__ = "plan_modules"
    __table_args__ = (UniqueConstraint("plan_id", "module_slug"),)

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    plan_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("plans.id", ondelete="CASCADE"), nullable=False
    )
    module_slug: Mapped[str] = mapped_column(String(50), nullable=False)

    plan: Mapped["Plan"] = relationship(back_populates="allowed_modules")


class Tenant(Base):
    __tablename__ = "tenants"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    name: Mapped[str]        = mapped_column(String(200), nullable=False)
    slug: Mapped[str]        = mapped_column(String(100), nullable=False, unique=True)
    schema_name: Mapped[str] = mapped_column(String(100), nullable=False, unique=True)
    plan_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True), ForeignKey("plans.id", ondelete="SET NULL"), nullable=True
    )
    is_active: Mapped[bool]  = mapped_column(Boolean, default=True)
    plan_expires_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    logo_url: Mapped[Optional[str]]      = mapped_column(String(500), nullable=True)
    primary_color: Mapped[Optional[str]] = mapped_column(String(7), nullable=True)
    created_at: Mapped[datetime]  = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime]  = mapped_column(
        DateTime, default=datetime.utcnow, onupdate=datetime.utcnow
    )

    plan: Mapped[Optional["Plan"]]               = relationship(back_populates="tenants")
    active_modules: Mapped[list["TenantModule"]] = relationship(
        back_populates="tenant", cascade="all, delete-orphan"
    )
    users: Mapped[list["User"]] = relationship(back_populates="tenant")


class TenantModule(Base):
    __tablename__ = "tenant_modules"
    __table_args__ = (UniqueConstraint("tenant_id", "module_slug"),)

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    tenant_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False
    )
    module_slug: Mapped[str] = mapped_column(String(50), nullable=False)
    is_active: Mapped[bool]    = mapped_column(Boolean, default=True)
    activated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    tenant: Mapped["Tenant"] = relationship(back_populates="active_modules")


class ModulePermission(Base):
    """
    Catálogo global de permissões disponíveis (sincronizado do código dos módulos).
    Cada `code` é referenciado por roles para conceder acesso.
    """
    __tablename__ = "module_permissions"
    __table_args__ = (UniqueConstraint("module_slug", "code"),)

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    module_slug: Mapped[str] = mapped_column(String(50), nullable=False)
    code: Mapped[str]        = mapped_column(String(100), nullable=False, unique=True)
    name: Mapped[str]        = mapped_column(String(200), nullable=False)
    description: Mapped[Optional[str]] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)


class Role(Base):
    """
    Função (custom role) por tenant.
    Ex: 'Atendente', 'Gerente'. Concede um conjunto de permissões a usuários do tenant.
    """
    __tablename__ = "roles"
    __table_args__ = (UniqueConstraint("tenant_id", "name"),)

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    tenant_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False
    )
    name: Mapped[str]        = mapped_column(String(100), nullable=False)
    description: Mapped[Optional[str]] = mapped_column(Text)
    is_system: Mapped[bool]  = mapped_column(Boolean, default=False, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow, onupdate=datetime.utcnow
    )

    permissions: Mapped[list["RolePermission"]] = relationship(
        back_populates="role", cascade="all, delete-orphan"
    )
    users: Mapped[list["User"]] = relationship(back_populates="role_obj")


class RolePermission(Base):
    __tablename__ = "role_permissions"
    __table_args__ = (UniqueConstraint("role_id", "permission_code"),)

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    role_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("roles.id", ondelete="CASCADE"), nullable=False
    )
    permission_code: Mapped[str] = mapped_column(String(100), nullable=False)

    role: Mapped["Role"] = relationship(back_populates="permissions")


class User(Base):
    __tablename__ = "users"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    tenant_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True), ForeignKey("tenants.id", ondelete="CASCADE"), nullable=True
    )
    email: Mapped[str]           = mapped_column(String(255), nullable=False, unique=True)
    hashed_password: Mapped[str] = mapped_column(String(255), nullable=False)
    full_name: Mapped[str]       = mapped_column(String(200), nullable=False)
    role: Mapped[UserRole]       = mapped_column(
        SAEnum(UserRole, values_callable=_enum_values), nullable=False, default=UserRole.COMPANY_USER
    )
    role_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True), ForeignKey("roles.id", ondelete="SET NULL"), nullable=True
    )
    is_active: Mapped[bool]      = mapped_column(Boolean, default=True)
    last_login: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow, onupdate=datetime.utcnow
    )

    tenant: Mapped[Optional["Tenant"]] = relationship(back_populates="users")
    role_obj: Mapped[Optional["Role"]] = relationship(back_populates="users")


class AuditLog(Base):
    """Log de auditoria no schema público."""
    __tablename__ = "audit_logs"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    tenant_id: Mapped[Optional[uuid.UUID]]  = mapped_column(UUID(as_uuid=True), nullable=True)
    user_id: Mapped[Optional[uuid.UUID]]    = mapped_column(UUID(as_uuid=True), nullable=True)
    action: Mapped[str]                     = mapped_column(String(100), nullable=False)
    entity_type: Mapped[str]                = mapped_column(String(50), nullable=False)
    entity_id: Mapped[Optional[uuid.UUID]]  = mapped_column(UUID(as_uuid=True), nullable=True)
    details: Mapped[Optional[dict]]         = mapped_column(JSONB, nullable=True)
    ip_address: Mapped[Optional[str]]       = mapped_column(String(45), nullable=True)
    created_at: Mapped[datetime]            = mapped_column(DateTime, default=datetime.utcnow)
