import uuid
from datetime import datetime
from typing import Optional, List

from pydantic import BaseModel, Field

from app.modules.propostas_contratos.models import ProposalStatus


# ══════════════════════════════════════════════
# ITEMS
# ══════════════════════════════════════════════

class ProposalItemCreate(BaseModel):
    description: str = Field(..., min_length=1)
    quantity: float = Field(1, gt=0)
    unit: Optional[str] = Field(None, max_length=20)
    unit_price: float = Field(0, ge=0)
    order: int = Field(0, ge=0)
    custom_data: Optional[dict] = None


class ProposalItemUpdate(BaseModel):
    description: Optional[str] = Field(None, min_length=1)
    quantity: Optional[float] = Field(None, gt=0)
    unit: Optional[str] = Field(None, max_length=20)
    unit_price: Optional[float] = Field(None, ge=0)
    order: Optional[int] = Field(None, ge=0)
    custom_data: Optional[dict] = None


class ProposalItemResponse(BaseModel):
    id: uuid.UUID
    proposal_id: uuid.UUID
    description: str
    quantity: float
    unit: Optional[str]
    unit_price: float
    total: float
    order: int
    custom_data: Optional[dict]
    created_at: datetime

    model_config = {"from_attributes": True}


# ══════════════════════════════════════════════
# PROPOSTAS
# ══════════════════════════════════════════════

class ProposalCreate(BaseModel):
    title: str = Field(..., min_length=2, max_length=300)
    description: Optional[str] = None

    attendance_id: Optional[uuid.UUID] = None
    client_id: Optional[uuid.UUID] = None
    company_id: Optional[uuid.UUID] = None

    # Snapshot manual (caso não use atendimento/cliente)
    client_name: Optional[str] = Field(None, max_length=200)
    client_email: Optional[str] = Field(None, max_length=255)
    client_phone: Optional[str] = Field(None, max_length=30)
    client_document: Optional[str] = Field(None, max_length=20)

    discount: float = Field(0, ge=0)
    payment_terms: Optional[str] = None
    delivery_terms: Optional[str] = None
    notes: Optional[str] = None
    valid_until: Optional[datetime] = None

    items: List[ProposalItemCreate] = Field(default_factory=list)
    custom_data: Optional[dict] = None


class ProposalUpdate(BaseModel):
    title: Optional[str] = Field(None, min_length=2, max_length=300)
    description: Optional[str] = None
    client_name: Optional[str] = Field(None, max_length=200)
    client_email: Optional[str] = Field(None, max_length=255)
    client_phone: Optional[str] = Field(None, max_length=30)
    client_document: Optional[str] = Field(None, max_length=20)
    discount: Optional[float] = Field(None, ge=0)
    payment_terms: Optional[str] = None
    delivery_terms: Optional[str] = None
    notes: Optional[str] = None
    valid_until: Optional[datetime] = None
    custom_data: Optional[dict] = None


class ProposalStatusChange(BaseModel):
    to_status: ProposalStatus
    notes: Optional[str] = Field(None, max_length=1000)


class ProposalStatusLogResponse(BaseModel):
    id: uuid.UUID
    proposal_id: uuid.UUID
    from_status: Optional[ProposalStatus]
    to_status: ProposalStatus
    changed_by: Optional[uuid.UUID]
    notes: Optional[str]
    changed_at: datetime

    model_config = {"from_attributes": True}


class ProposalResponse(BaseModel):
    id: uuid.UUID
    number: str
    version: int
    title: str
    description: Optional[str]
    status: ProposalStatus

    attendance_id: Optional[uuid.UUID]
    client_id: Optional[uuid.UUID]
    company_id: Optional[uuid.UUID]

    client_name: Optional[str]
    client_email: Optional[str]
    client_phone: Optional[str]
    client_document: Optional[str]

    total_value: float
    discount: float

    payment_terms: Optional[str]
    delivery_terms: Optional[str]
    notes: Optional[str]

    valid_until: Optional[datetime]
    sent_at: Optional[datetime]
    accepted_at: Optional[datetime]
    rejected_at: Optional[datetime]
    created_by: Optional[uuid.UUID]

    public_token: Optional[str] = None
    public_acceptance: Optional[dict] = None

    items: List[ProposalItemResponse] = Field(default_factory=list)

    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class ProposalTemplateItemCreate(BaseModel):
    description: str = Field(..., min_length=1)
    quantity: float = Field(1, gt=0)
    unit: Optional[str] = Field(None, max_length=20)
    unit_price: float = Field(0, ge=0)
    order: int = Field(0, ge=0)


class ProposalTemplateItemResponse(BaseModel):
    id: uuid.UUID
    template_id: uuid.UUID
    description: str
    quantity: float
    unit: Optional[str]
    unit_price: float
    order: int

    model_config = {"from_attributes": True}


class ProposalTemplateCreate(BaseModel):
    name: str = Field(..., min_length=2, max_length=200)
    description: Optional[str] = None
    title: Optional[str] = None
    body: Optional[str] = None
    payment_terms: Optional[str] = None
    delivery_terms: Optional[str] = None
    notes: Optional[str] = None
    discount: float = Field(0, ge=0)
    validity_days: Optional[int] = Field(None, ge=0)
    is_active: bool = True
    items: List[ProposalTemplateItemCreate] = Field(default_factory=list)


class ProposalTemplateUpdate(BaseModel):
    name: Optional[str] = Field(None, min_length=2, max_length=200)
    description: Optional[str] = None
    title: Optional[str] = None
    body: Optional[str] = None
    payment_terms: Optional[str] = None
    delivery_terms: Optional[str] = None
    notes: Optional[str] = None
    discount: Optional[float] = Field(None, ge=0)
    validity_days: Optional[int] = Field(None, ge=0)
    is_active: Optional[bool] = None
    items: Optional[List[ProposalTemplateItemCreate]] = None  # se fornecido, substitui


class ProposalTemplateResponse(BaseModel):
    id: uuid.UUID
    name: str
    description: Optional[str]
    title: Optional[str]
    body: Optional[str]
    payment_terms: Optional[str]
    delivery_terms: Optional[str]
    notes: Optional[str]
    discount: float
    validity_days: Optional[int]
    is_active: bool
    items: List[ProposalTemplateItemResponse] = Field(default_factory=list)
    created_at: datetime

    model_config = {"from_attributes": True}


class ProposalFromTemplate(BaseModel):
    """Cria proposta a partir de template, opcionalmente sobrescrevendo campos."""
    template_id: uuid.UUID
    attendance_id: Optional[uuid.UUID] = None
    client_id: Optional[uuid.UUID] = None
    company_id: Optional[uuid.UUID] = None
    client_name: Optional[str] = None
    client_email: Optional[str] = None
    client_phone: Optional[str] = None
    client_document: Optional[str] = None


class ProposalSummary(BaseModel):
    id: uuid.UUID
    number: str
    version: int
    title: str
    status: ProposalStatus
    attendance_id: Optional[uuid.UUID]
    client_id: Optional[uuid.UUID]
    company_id: Optional[uuid.UUID]
    client_name: Optional[str]
    total_value: float
    valid_until: Optional[datetime]
    sent_at: Optional[datetime]
    accepted_at: Optional[datetime]
    created_at: datetime

    model_config = {"from_attributes": True}


# ══════════════════════════════════════════════
# CONTRATOS
# ══════════════════════════════════════════════

from app.modules.propostas_contratos.models import ContractStatus  # noqa: E402


class ContractTemplateCreate(BaseModel):
    name: str = Field(..., min_length=2, max_length=200)
    description: Optional[str] = None
    body: str = Field(..., min_length=1)
    is_active: bool = True


class ContractTemplateUpdate(BaseModel):
    name: Optional[str] = Field(None, min_length=2, max_length=200)
    description: Optional[str] = None
    body: Optional[str] = Field(None, min_length=1)
    is_active: Optional[bool] = None


class ContractTemplateResponse(BaseModel):
    id: uuid.UUID
    name: str
    description: Optional[str]
    body: str
    is_active: bool
    created_at: datetime

    model_config = {"from_attributes": True}


class ContractCreate(BaseModel):
    title: str = Field(..., min_length=2, max_length=300)
    body: str = Field(..., min_length=1)
    proposal_id: Optional[uuid.UUID] = None
    attendance_id: Optional[uuid.UUID] = None
    client_id: Optional[uuid.UUID] = None
    company_id: Optional[uuid.UUID] = None
    client_name: Optional[str] = None
    client_document: Optional[str] = None
    client_email: Optional[str] = None
    client_phone: Optional[str] = None
    total_value: float = Field(0, ge=0)
    start_date: Optional[datetime] = None
    end_date: Optional[datetime] = None
    custom_data: Optional[dict] = None


class ContractUpdate(BaseModel):
    title: Optional[str] = None
    body: Optional[str] = None
    status: Optional[ContractStatus] = None
    total_value: Optional[float] = Field(None, ge=0)
    start_date: Optional[datetime] = None
    end_date: Optional[datetime] = None
    custom_data: Optional[dict] = None


class ContractFromProposal(BaseModel):
    proposal_id: uuid.UUID
    template_id: Optional[uuid.UUID] = None  # se nulo, usa body simples
    title: Optional[str] = None
    start_date: Optional[datetime] = None
    end_date: Optional[datetime] = None


class ContractSign(BaseModel):
    signer_name: str = Field(..., min_length=2, max_length=200)
    signer_document: Optional[str] = None
    signer_email: Optional[str] = None
    accept_terms: bool = True


class ContractResponse(BaseModel):
    id: uuid.UUID
    number: str
    title: str
    body: str
    status: ContractStatus
    proposal_id: Optional[uuid.UUID]
    attendance_id: Optional[uuid.UUID]
    client_id: Optional[uuid.UUID]
    company_id: Optional[uuid.UUID]
    client_name: Optional[str]
    client_document: Optional[str]
    client_email: Optional[str]
    client_phone: Optional[str]
    total_value: float
    start_date: Optional[datetime]
    end_date: Optional[datetime]
    signed_at: Optional[datetime]
    signer_name: Optional[str]
    signer_document: Optional[str]
    signer_email: Optional[str]
    signer_ip: Optional[str]
    signature_hash: Optional[str]
    public_token: Optional[str]
    created_by: Optional[uuid.UUID]
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class ContractSummary(BaseModel):
    id: uuid.UUID
    number: str
    title: str
    status: ContractStatus
    client_name: Optional[str]
    total_value: float
    start_date: Optional[datetime]
    signed_at: Optional[datetime]
    created_at: datetime

    model_config = {"from_attributes": True}
