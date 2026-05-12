"""
Modelos do módulo Propostas e Contratos — vivem no schema isolado de cada tenant.

Cross-module:
- attendance_id: referência por UUID (sem FK) para o módulo Atendimento.
- client_id: idem para Client do Atendimento.
- company_id: idem para Company do Atendimento.

Mantemos sem FK porque os módulos podem ser ativados/desativados independentemente.
A validação acontece no service quando necessário.
"""
import uuid
import enum
from datetime import datetime
from typing import Optional

from sqlalchemy import (
    String, Boolean, DateTime, ForeignKey,
    Text, Integer, Numeric, Enum as SAEnum,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.dialects.postgresql import UUID, JSONB

from app.core.database import TenantBase


# Faz o SQLAlchemy gravar/ler o .value do enum em vez do .name.
_enum_values = lambda obj: [e.value for e in obj]  # noqa: E731


# ─────────────────────────────────────────────
# ENUMS
# ─────────────────────────────────────────────

class ProposalStatus(str, enum.Enum):
    DRAFT     = "draft"      # rascunho, editável
    SENT      = "sent"       # enviada ao cliente
    ACCEPTED  = "accepted"   # cliente aceitou
    REJECTED  = "rejected"   # cliente rejeitou
    EXPIRED   = "expired"    # passou a validade
    CANCELLED = "cancelled"  # cancelada antes de fechar


class ContractStatus(str, enum.Enum):
    DRAFT     = "draft"
    READY     = "ready"      # pronto pra enviar
    SENT      = "sent"
    SIGNED    = "signed"     # assinado por ambas as partes
    CANCELLED = "cancelled"


# ─────────────────────────────────────────────
# PROPOSTA
# ─────────────────────────────────────────────

class Proposal(TenantBase):
    """
    Proposta comercial. Pode estar vinculada a um atendimento (lead) ou ser standalone.
    Versionada: quando uma proposta aceita é editada, cria-se nova versão.
    """
    __tablename__ = "proposals"

    id: Mapped[uuid.UUID]      = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    number: Mapped[str]        = mapped_column(String(30), nullable=False, unique=True)  # PROP-0001
    version: Mapped[int]       = mapped_column(Integer, nullable=False, default=1)
    title: Mapped[str]         = mapped_column(String(300), nullable=False)
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    status: Mapped[ProposalStatus] = mapped_column(
        SAEnum(ProposalStatus, native_enum=False, values_callable=_enum_values),
        nullable=False, default=ProposalStatus.DRAFT,
    )

    # Cross-module (UUIDs sem FK)
    attendance_id: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), nullable=True)
    client_id: Mapped[Optional[uuid.UUID]]     = mapped_column(UUID(as_uuid=True), nullable=True)
    company_id: Mapped[Optional[uuid.UUID]]    = mapped_column(UUID(as_uuid=True), nullable=True)

    # Snapshot do cliente (caso o registro original mude/seja deletado)
    client_name: Mapped[Optional[str]]      = mapped_column(String(200), nullable=True)
    client_email: Mapped[Optional[str]]     = mapped_column(String(255), nullable=True)
    client_phone: Mapped[Optional[str]]     = mapped_column(String(30), nullable=True)
    client_document: Mapped[Optional[str]]  = mapped_column(String(20), nullable=True)

    total_value: Mapped[float] = mapped_column(Numeric(12, 2), nullable=False, default=0)
    discount: Mapped[float]    = mapped_column(Numeric(12, 2), nullable=False, default=0)

    payment_terms: Mapped[Optional[str]]   = mapped_column(Text, nullable=True)
    delivery_terms: Mapped[Optional[str]]  = mapped_column(Text, nullable=True)
    notes: Mapped[Optional[str]]           = mapped_column(Text, nullable=True)

    valid_until: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    sent_at: Mapped[Optional[datetime]]     = mapped_column(DateTime, nullable=True)
    accepted_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    rejected_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)

    # Link público de aceitação
    public_token: Mapped[Optional[str]] = mapped_column(String(64), nullable=True, unique=True)
    public_acceptance: Mapped[Optional[dict]] = mapped_column(JSONB, nullable=True)  # {name, email, ip, accepted_at}

    # FK em public.users (referência por UUID — sem FK no schema do tenant)
    created_by: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), nullable=True)

    custom_data: Mapped[Optional[dict]] = mapped_column(JSONB, nullable=True, default=dict)

    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    items: Mapped[list["ProposalItem"]] = relationship(
        back_populates="proposal", cascade="all, delete-orphan", order_by="ProposalItem.order"
    )
    status_logs: Mapped[list["ProposalStatusLog"]] = relationship(
        back_populates="proposal", cascade="all, delete-orphan", order_by="ProposalStatusLog.changed_at"
    )


class ProposalItem(TenantBase):
    __tablename__ = "proposal_items"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    proposal_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("proposals.id", ondelete="CASCADE"), nullable=False
    )
    description: Mapped[str] = mapped_column(Text, nullable=False)
    quantity: Mapped[float]  = mapped_column(Numeric(12, 3), nullable=False, default=1)
    unit: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)  # un, h, kg, m, etc.
    unit_price: Mapped[float] = mapped_column(Numeric(12, 2), nullable=False, default=0)
    total: Mapped[float]      = mapped_column(Numeric(12, 2), nullable=False, default=0)  # qty * unit_price
    order: Mapped[int]        = mapped_column(Integer, nullable=False, default=0)
    custom_data: Mapped[Optional[dict]] = mapped_column(JSONB, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    proposal: Mapped["Proposal"] = relationship(back_populates="items")


class ProposalStatusLog(TenantBase):
    """Histórico de mudanças de status da proposta."""
    __tablename__ = "proposal_status_logs"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    proposal_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("proposals.id", ondelete="CASCADE"), nullable=False
    )
    from_status: Mapped[Optional[ProposalStatus]] = mapped_column(
        SAEnum(ProposalStatus, native_enum=False, values_callable=_enum_values),
        nullable=True,
    )
    to_status: Mapped[ProposalStatus] = mapped_column(
        SAEnum(ProposalStatus, native_enum=False, values_callable=_enum_values),
        nullable=False,
    )
    changed_by: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), nullable=True)
    notes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    changed_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    proposal: Mapped["Proposal"] = relationship(back_populates="status_logs")


# ─────────────────────────────────────────────
# TEMPLATES
# ─────────────────────────────────────────────

class ProposalTemplate(TenantBase):
    """
    Template reusável de proposta. Quando aplicado em "nova proposta",
    os campos e items são copiados como ponto de partida.
    """
    __tablename__ = "proposal_templates"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name: Mapped[str]     = mapped_column(String(200), nullable=False)
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    # Campos pré-preenchidos
    title: Mapped[Optional[str]]         = mapped_column(String(300), nullable=True)
    body: Mapped[Optional[str]]          = mapped_column(Text, nullable=True)  # descrição da proposta
    payment_terms: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    delivery_terms: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    notes: Mapped[Optional[str]]         = mapped_column(Text, nullable=True)
    discount: Mapped[float]              = mapped_column(Numeric(12, 2), default=0)
    validity_days: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)  # ex: 30

    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    items: Mapped[list["ProposalTemplateItem"]] = relationship(
        back_populates="template", cascade="all, delete-orphan", order_by="ProposalTemplateItem.order"
    )


class ProposalTemplateItem(TenantBase):
    __tablename__ = "proposal_template_items"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    template_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("proposal_templates.id", ondelete="CASCADE"), nullable=False
    )
    description: Mapped[str] = mapped_column(Text, nullable=False)
    quantity: Mapped[float]  = mapped_column(Numeric(12, 3), nullable=False, default=1)
    unit: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)
    unit_price: Mapped[float] = mapped_column(Numeric(12, 2), nullable=False, default=0)
    order: Mapped[int]        = mapped_column(Integer, nullable=False, default=0)

    template: Mapped["ProposalTemplate"] = relationship(back_populates="items")


# ─────────────────────────────────────────────
# CONTRATOS
# ─────────────────────────────────────────────

class ContractTemplate(TenantBase):
    """Template de contrato (cláusulas e estrutura padrão)."""
    __tablename__ = "contract_templates"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    body: Mapped[str] = mapped_column(Text, nullable=False)  # texto com {{placeholders}}
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


class Contract(TenantBase):
    """
    Contrato. Pode ser criado standalone ou a partir de proposta aceita.
    O body é renderizado pelo template + dados (snapshot na criação).
    """
    __tablename__ = "contracts"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    number: Mapped[str]   = mapped_column(String(30), nullable=False, unique=True)  # CTR-0001
    title: Mapped[str]    = mapped_column(String(300), nullable=False)
    body: Mapped[str]     = mapped_column(Text, nullable=False)  # texto final (já interpolado)

    status: Mapped[ContractStatus] = mapped_column(
        SAEnum(ContractStatus, native_enum=False, values_callable=_enum_values),
        nullable=False, default=ContractStatus.DRAFT,
    )

    # Cross-module refs (UUIDs sem FK)
    proposal_id: Mapped[Optional[uuid.UUID]]   = mapped_column(UUID(as_uuid=True), nullable=True)
    attendance_id: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), nullable=True)
    client_id: Mapped[Optional[uuid.UUID]]     = mapped_column(UUID(as_uuid=True), nullable=True)
    company_id: Mapped[Optional[uuid.UUID]]    = mapped_column(UUID(as_uuid=True), nullable=True)

    # Snapshot do cliente
    client_name: Mapped[Optional[str]]      = mapped_column(String(200), nullable=True)
    client_document: Mapped[Optional[str]]  = mapped_column(String(20), nullable=True)
    client_email: Mapped[Optional[str]]     = mapped_column(String(255), nullable=True)
    client_phone: Mapped[Optional[str]]     = mapped_column(String(30), nullable=True)

    total_value: Mapped[float] = mapped_column(Numeric(12, 2), nullable=False, default=0)

    start_date: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    end_date: Mapped[Optional[datetime]]   = mapped_column(DateTime, nullable=True)

    # Assinatura (stub — sem integração externa)
    signed_at: Mapped[Optional[datetime]]      = mapped_column(DateTime, nullable=True)
    signer_name: Mapped[Optional[str]]         = mapped_column(String(200), nullable=True)
    signer_document: Mapped[Optional[str]]     = mapped_column(String(20), nullable=True)
    signer_email: Mapped[Optional[str]]        = mapped_column(String(255), nullable=True)
    signer_ip: Mapped[Optional[str]]           = mapped_column(String(45), nullable=True)
    signature_hash: Mapped[Optional[str]]      = mapped_column(String(128), nullable=True)
    # Link público de assinatura
    public_token: Mapped[Optional[str]]        = mapped_column(String(64), nullable=True, unique=True)

    created_by: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), nullable=True)
    custom_data: Mapped[Optional[dict]]      = mapped_column(JSONB, nullable=True)

    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
