"""
Rotas públicas (sem autenticação) do módulo Propostas e Contratos.
Acessadas via token único. Buscam em TODOS os schemas de tenant.

Prefix: /api/v1/public/propostas/{token}
"""
from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Body, HTTPException, Request
from sqlalchemy import select, text
from pydantic import BaseModel, EmailStr, Field

from app.core.database import AsyncSessionLocal
from app.modules.super_admin.models import Tenant, Module
from app.modules.propostas_contratos.models import Proposal, ProposalStatus, ProposalStatusLog


router = APIRouter(prefix="/public/propostas", tags=["Propostas — Público"])


class PublicProposalView(BaseModel):
    number: str
    version: int
    title: str
    description: Optional[str]
    status: str
    client_name: Optional[str]
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
    items: list[dict]
    created_at: datetime
    tenant_name: str  # contexto pra exibir "empresa que enviou"


class PublicAcceptance(BaseModel):
    accepter_name: str = Field(..., min_length=2, max_length=200)
    accepter_email: Optional[EmailStr] = None
    accepter_document: Optional[str] = Field(None, max_length=20)
    notes: Optional[str] = Field(None, max_length=500)


async def _find_proposal_by_token(token: str) -> tuple[Tenant, Proposal]:
    """
    Procura a proposta em TODOS os tenants pelo token único.
    Retorna (tenant, proposal) ou levanta 404.
    """
    async with AsyncSessionLocal() as db:
        await db.execute(text("SET search_path TO public"))
        tenants_q = await db.execute(select(Tenant).where(Tenant.is_active == True))
        tenants = list(tenants_q.scalars().all())

        for tenant in tenants:
            try:
                await db.execute(text(f"SET search_path TO {tenant.schema_name}, public"))
                result = await db.execute(
                    select(Proposal).where(Proposal.public_token == token)
                )
                proposal = result.scalar_one_or_none()
                if proposal:
                    await db.refresh(proposal, ["items"])
                    return tenant, proposal
            except Exception:
                continue
        await db.execute(text("SET search_path TO public"))

    raise HTTPException(status_code=404, detail="Proposta não encontrada ou link inválido.")


@router.get("/{token}", response_model=PublicProposalView)
async def view_public_proposal(token: str):
    tenant, proposal = await _find_proposal_by_token(token)

    return PublicProposalView(
        number=proposal.number,
        version=proposal.version,
        title=proposal.title,
        description=proposal.description,
        status=proposal.status.value,
        client_name=proposal.client_name,
        client_document=proposal.client_document,
        total_value=float(proposal.total_value),
        discount=float(proposal.discount),
        payment_terms=proposal.payment_terms,
        delivery_terms=proposal.delivery_terms,
        notes=proposal.notes,
        valid_until=proposal.valid_until,
        sent_at=proposal.sent_at,
        accepted_at=proposal.accepted_at,
        rejected_at=proposal.rejected_at,
        items=[{
            "description": it.description,
            "quantity": float(it.quantity),
            "unit": it.unit,
            "unit_price": float(it.unit_price),
            "total": float(it.total),
        } for it in proposal.items],
        created_at=proposal.created_at,
        tenant_name=tenant.name,
    )


@router.post("/{token}/accept")
async def public_accept_proposal(
    token: str,
    data: PublicAcceptance,
    request: Request,
):
    tenant, proposal = await _find_proposal_by_token(token)
    if proposal.status not in (ProposalStatus.SENT,):
        raise HTTPException(
            status_code=400,
            detail=f"Esta proposta está em status '{proposal.status.value}' e não pode mais ser aceita."
        )
    if proposal.valid_until and proposal.valid_until < datetime.utcnow():
        raise HTTPException(status_code=400, detail="Proposta expirada.")

    async with AsyncSessionLocal() as db:
        await db.execute(text(f"SET search_path TO {tenant.schema_name}, public"))
        # Recarrega no escopo desta session
        result = await db.execute(select(Proposal).where(Proposal.id == proposal.id))
        p = result.scalar_one()
        previous = p.status
        p.status = ProposalStatus.ACCEPTED
        p.accepted_at = datetime.utcnow()
        p.public_acceptance = {
            "name":     data.accepter_name,
            "email":    str(data.accepter_email) if data.accepter_email else None,
            "document": data.accepter_document,
            "notes":    data.notes,
            "ip":       request.client.host if request.client else None,
            "accepted_at": datetime.utcnow().isoformat(),
        }
        db.add(ProposalStatusLog(
            proposal_id=p.id,
            from_status=previous,
            to_status=ProposalStatus.ACCEPTED,
            changed_by=None,
            notes=f"Aceita publicamente por {data.accepter_name}.",
        ))

        # Cross-module: move atendimento pra etapa de ganho se houver
        if p.attendance_id:
            try:
                # Importa aqui pra não criar dependência forte
                from app.modules.propostas_contratos.service import ProposalService
                from app.modules.super_admin.models import User as _User
                # Cria um "system user" fake — passamos None em changed_by no log
                fake_user = type("U", (), {"id": None, "full_name": "Aceite público"})()
                await ProposalService._move_attendance_to_won(db, p, fake_user)  # type: ignore[arg-type]
            except Exception as e:  # noqa: BLE001
                print(f"[public_accept] hook atendimento falhou: {e}")

        await db.commit()
        await db.execute(text("SET search_path TO public"))

    return {"ok": True, "message": "Proposta aceita com sucesso."}


@router.post("/{token}/reject")
async def public_reject_proposal(
    token: str,
    data: PublicAcceptance,
    request: Request,
):
    tenant, proposal = await _find_proposal_by_token(token)
    if proposal.status != ProposalStatus.SENT:
        raise HTTPException(
            status_code=400,
            detail=f"Esta proposta está em status '{proposal.status.value}' e não pode mais ser rejeitada."
        )

    async with AsyncSessionLocal() as db:
        await db.execute(text(f"SET search_path TO {tenant.schema_name}, public"))
        result = await db.execute(select(Proposal).where(Proposal.id == proposal.id))
        p = result.scalar_one()
        previous = p.status
        p.status = ProposalStatus.REJECTED
        p.rejected_at = datetime.utcnow()
        p.public_acceptance = {
            "name":     data.accepter_name,
            "email":    str(data.accepter_email) if data.accepter_email else None,
            "notes":    data.notes,
            "ip":       request.client.host if request.client else None,
            "rejected_at": datetime.utcnow().isoformat(),
        }
        db.add(ProposalStatusLog(
            proposal_id=p.id,
            from_status=previous,
            to_status=ProposalStatus.REJECTED,
            changed_by=None,
            notes=f"Rejeitada publicamente por {data.accepter_name}." + (f" Motivo: {data.notes}" if data.notes else ""),
        ))
        await db.commit()
        await db.execute(text("SET search_path TO public"))

    return {"ok": True, "message": "Proposta rejeitada."}
