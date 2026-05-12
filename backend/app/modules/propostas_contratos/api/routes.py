import uuid
from typing import List, Optional

from fastapi import APIRouter, Depends, Query, Request
from fastapi.responses import StreamingResponse

from app.core.dependencies import ModuleContext, require_module, require_permission
from app.modules.propostas_contratos.models import ProposalStatus, ContractStatus
from app.modules.propostas_contratos.schemas import (
    ProposalCreate, ProposalUpdate, ProposalResponse, ProposalSummary,
    ProposalItemCreate, ProposalItemUpdate, ProposalItemResponse,
    ProposalStatusChange, ProposalStatusLogResponse,
    ProposalTemplateCreate, ProposalTemplateUpdate, ProposalTemplateResponse,
    ProposalFromTemplate,
    ContractCreate, ContractUpdate, ContractResponse, ContractSummary,
    ContractFromProposal, ContractSign,
    ContractTemplateCreate, ContractTemplateUpdate, ContractTemplateResponse,
)
from app.modules.propostas_contratos.service import (
    ProposalService, ProposalTemplateService,
    ContractService, ContractTemplateService,
)


router = APIRouter(prefix="/propostas-contratos", tags=["Propostas e Contratos"])

# Context do módulo
_ctx = require_module("propostas_contratos")

_can_create = require_permission("propostas_contratos.proposal.create")
_can_update = require_permission("propostas_contratos.proposal.update")
_can_send   = require_permission("propostas_contratos.proposal.send")
_can_accept = require_permission("propostas_contratos.proposal.accept")
_can_delete = require_permission("propostas_contratos.proposal.delete")
_can_template = require_permission("propostas_contratos.template.manage")
_can_contract = require_permission("propostas_contratos.contract.manage")
_can_sign     = require_permission("propostas_contratos.contract.sign")


# ══════════════════════════════════════════════
# PROPOSTAS
# ══════════════════════════════════════════════

@router.get("/proposals", response_model=List[ProposalSummary])
async def list_proposals(
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=200),
    status: Optional[ProposalStatus] = Query(None),
    attendance_id: Optional[uuid.UUID] = Query(None),
    client_id: Optional[uuid.UUID] = Query(None),
    ctx: ModuleContext = Depends(_ctx),
):
    return await ProposalService.list_proposals(
        ctx.db, skip=skip, limit=limit,
        status=status, attendance_id=attendance_id, client_id=client_id,
    )


@router.post("/proposals", response_model=ProposalResponse, status_code=201)
async def create_proposal(
    data: ProposalCreate,
    ctx: ModuleContext = Depends(_ctx),
    _=Depends(_can_create),
):
    return await ProposalService.create_proposal(ctx.db, data, ctx.user)


@router.get("/proposals/{proposal_id}", response_model=ProposalResponse)
async def get_proposal(
    proposal_id: uuid.UUID,
    ctx: ModuleContext = Depends(_ctx),
):
    return await ProposalService.get_proposal(ctx.db, proposal_id)


@router.patch("/proposals/{proposal_id}", response_model=ProposalResponse)
async def update_proposal(
    proposal_id: uuid.UUID,
    data: ProposalUpdate,
    ctx: ModuleContext = Depends(_ctx),
    _=Depends(_can_update),
):
    return await ProposalService.update_proposal(ctx.db, proposal_id, data)


@router.delete("/proposals/{proposal_id}", status_code=204)
async def delete_proposal(
    proposal_id: uuid.UUID,
    ctx: ModuleContext = Depends(_ctx),
    _=Depends(_can_delete),
):
    await ProposalService.delete_proposal(ctx.db, proposal_id)


# ── Status ───────────────────────────────

@router.post("/proposals/{proposal_id}/status", response_model=ProposalResponse)
async def change_proposal_status(
    proposal_id: uuid.UUID,
    data: ProposalStatusChange,
    ctx: ModuleContext = Depends(_ctx),
):
    """
    Mudar status da proposta.
    A permission necessária depende do destino:
    - SENT → permission send
    - ACCEPTED / REJECTED → permission accept
    - outros → permission update
    """
    # Faz a checagem manual aqui pra evitar criar 3 endpoints.
    # super_admin/company_admin já passam direto.
    from app.modules.super_admin.models import UserRole
    if ctx.user.role not in (UserRole.SUPER_ADMIN, UserRole.COMPANY_ADMIN):
        from app.modules.super_admin.service import RoleService
        target = data.to_status
        if target == ProposalStatus.SENT:
            code = "propostas_contratos.proposal.send"
        elif target in (ProposalStatus.ACCEPTED, ProposalStatus.REJECTED):
            code = "propostas_contratos.proposal.accept"
        else:
            code = "propostas_contratos.proposal.update"
        # consulta via service
        from app.core.database import AsyncSessionLocal
        from sqlalchemy import text as _text, select as _select
        from app.modules.super_admin.models import RolePermission as _RP
        async with AsyncSessionLocal() as adb:
            await adb.execute(_text("SET search_path TO public"))
            if not ctx.user.role_id:
                from fastapi import HTTPException
                raise HTTPException(403, "Sua função não tem permissão para essa ação.")
            r = await adb.execute(
                _select(_RP).where(
                    _RP.role_id == ctx.user.role_id,
                    _RP.permission_code == code,
                )
            )
            if not r.scalar_one_or_none():
                from fastapi import HTTPException
                raise HTTPException(403, f"Sua função não tem a permissão '{code}'.")

    return await ProposalService.change_status(ctx.db, proposal_id, data, ctx.user)


@router.get("/proposals/{proposal_id}/status-logs", response_model=List[ProposalStatusLogResponse])
async def list_proposal_status_logs(
    proposal_id: uuid.UUID,
    ctx: ModuleContext = Depends(_ctx),
):
    return await ProposalService.list_status_logs(ctx.db, proposal_id)


@router.post("/proposals/{proposal_id}/new-version", response_model=ProposalResponse, status_code=201)
async def new_proposal_version(
    proposal_id: uuid.UUID,
    ctx: ModuleContext = Depends(_ctx),
    _=Depends(_can_create),
):
    return await ProposalService.create_new_version(ctx.db, proposal_id, ctx.user)


@router.post("/proposals/{proposal_id}/public-token", response_model=ProposalResponse)
async def generate_proposal_public_token(
    proposal_id: uuid.UUID,
    ctx: ModuleContext = Depends(_ctx),
    _=Depends(_can_update),
):
    return await ProposalService.generate_public_token(ctx.db, proposal_id)


@router.delete("/proposals/{proposal_id}/public-token", response_model=ProposalResponse)
async def revoke_proposal_public_token(
    proposal_id: uuid.UUID,
    ctx: ModuleContext = Depends(_ctx),
    _=Depends(_can_update),
):
    return await ProposalService.revoke_public_token(ctx.db, proposal_id)


# ── Items ────────────────────────────────

@router.post(
    "/proposals/{proposal_id}/items",
    response_model=ProposalItemResponse,
    status_code=201,
)
async def add_proposal_item(
    proposal_id: uuid.UUID,
    data: ProposalItemCreate,
    ctx: ModuleContext = Depends(_ctx),
    _=Depends(_can_update),
):
    return await ProposalService.add_item(ctx.db, proposal_id, data)


@router.patch(
    "/proposals/{proposal_id}/items/{item_id}",
    response_model=ProposalItemResponse,
)
async def update_proposal_item(
    proposal_id: uuid.UUID,
    item_id: uuid.UUID,
    data: ProposalItemUpdate,
    ctx: ModuleContext = Depends(_ctx),
    _=Depends(_can_update),
):
    return await ProposalService.update_item(ctx.db, proposal_id, item_id, data)


@router.delete(
    "/proposals/{proposal_id}/items/{item_id}",
    status_code=204,
)
async def delete_proposal_item(
    proposal_id: uuid.UUID,
    item_id: uuid.UUID,
    ctx: ModuleContext = Depends(_ctx),
    _=Depends(_can_update),
):
    await ProposalService.delete_item(ctx.db, proposal_id, item_id)


# ══════════════════════════════════════════════
# TEMPLATES DE PROPOSTA
# ══════════════════════════════════════════════

@router.get("/templates", response_model=List[ProposalTemplateResponse])
async def list_proposal_templates(
    active_only: bool = Query(False),
    ctx: ModuleContext = Depends(_ctx),
):
    return await ProposalTemplateService.list_templates(ctx.db, active_only=active_only)


@router.post("/templates", response_model=ProposalTemplateResponse, status_code=201)
async def create_proposal_template(
    data: ProposalTemplateCreate,
    ctx: ModuleContext = Depends(_ctx),
    _=Depends(_can_template),
):
    return await ProposalTemplateService.create_template(ctx.db, data)


@router.get("/templates/{template_id}", response_model=ProposalTemplateResponse)
async def get_proposal_template(
    template_id: uuid.UUID,
    ctx: ModuleContext = Depends(_ctx),
):
    return await ProposalTemplateService.get_template(ctx.db, template_id)


@router.patch("/templates/{template_id}", response_model=ProposalTemplateResponse)
async def update_proposal_template(
    template_id: uuid.UUID,
    data: ProposalTemplateUpdate,
    ctx: ModuleContext = Depends(_ctx),
    _=Depends(_can_template),
):
    return await ProposalTemplateService.update_template(ctx.db, template_id, data)


@router.delete("/templates/{template_id}", status_code=204)
async def delete_proposal_template(
    template_id: uuid.UUID,
    ctx: ModuleContext = Depends(_ctx),
    _=Depends(_can_template),
):
    await ProposalTemplateService.delete_template(ctx.db, template_id)


@router.post("/proposals/from-template", response_model=ProposalResponse, status_code=201)
async def create_proposal_from_template(
    data: ProposalFromTemplate,
    ctx: ModuleContext = Depends(_ctx),
    _=Depends(_can_create),
):
    return await ProposalTemplateService.create_proposal_from_template(ctx.db, data, ctx.user)


# ══════════════════════════════════════════════
# CONTRATOS — Templates
# ══════════════════════════════════════════════

@router.get("/contract-templates", response_model=List[ContractTemplateResponse])
async def list_contract_templates(
    active_only: bool = Query(False),
    ctx: ModuleContext = Depends(_ctx),
):
    return await ContractTemplateService.list_templates(ctx.db, active_only=active_only)


@router.post("/contract-templates", response_model=ContractTemplateResponse, status_code=201)
async def create_contract_template(
    data: ContractTemplateCreate,
    ctx: ModuleContext = Depends(_ctx),
    _=Depends(_can_template),
):
    return await ContractTemplateService.create_template(ctx.db, data)


@router.patch("/contract-templates/{template_id}", response_model=ContractTemplateResponse)
async def update_contract_template(
    template_id: uuid.UUID,
    data: ContractTemplateUpdate,
    ctx: ModuleContext = Depends(_ctx),
    _=Depends(_can_template),
):
    return await ContractTemplateService.update_template(ctx.db, template_id, data)


@router.delete("/contract-templates/{template_id}", status_code=204)
async def delete_contract_template(
    template_id: uuid.UUID,
    ctx: ModuleContext = Depends(_ctx),
    _=Depends(_can_template),
):
    await ContractTemplateService.delete_template(ctx.db, template_id)


# ══════════════════════════════════════════════
# CONTRATOS
# ══════════════════════════════════════════════

@router.get("/contracts", response_model=List[ContractSummary])
async def list_contracts(
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=200),
    status: Optional[ContractStatus] = Query(None),
    proposal_id: Optional[uuid.UUID] = Query(None),
    client_id: Optional[uuid.UUID] = Query(None),
    ctx: ModuleContext = Depends(_ctx),
):
    return await ContractService.list_contracts(
        ctx.db, skip=skip, limit=limit,
        status=status, proposal_id=proposal_id, client_id=client_id,
    )


@router.post("/contracts", response_model=ContractResponse, status_code=201)
async def create_contract(
    data: ContractCreate,
    ctx: ModuleContext = Depends(_ctx),
    _=Depends(_can_contract),
):
    return await ContractService.create_contract(ctx.db, data, ctx.user)


@router.get("/contracts/{contract_id}", response_model=ContractResponse)
async def get_contract(
    contract_id: uuid.UUID,
    ctx: ModuleContext = Depends(_ctx),
):
    return await ContractService.get_contract(ctx.db, contract_id)


@router.patch("/contracts/{contract_id}", response_model=ContractResponse)
async def update_contract(
    contract_id: uuid.UUID,
    data: ContractUpdate,
    ctx: ModuleContext = Depends(_ctx),
    _=Depends(_can_contract),
):
    return await ContractService.update_contract(ctx.db, contract_id, data)


@router.delete("/contracts/{contract_id}", status_code=204)
async def delete_contract(
    contract_id: uuid.UUID,
    ctx: ModuleContext = Depends(_ctx),
    _=Depends(_can_contract),
):
    await ContractService.delete_contract(ctx.db, contract_id)


@router.post("/contracts/from-proposal", response_model=ContractResponse, status_code=201)
async def create_contract_from_proposal(
    data: ContractFromProposal,
    ctx: ModuleContext = Depends(_ctx),
    _=Depends(_can_contract),
):
    return await ContractService.create_from_proposal(ctx.db, data, ctx.user)


@router.post("/contracts/{contract_id}/sign", response_model=ContractResponse)
async def sign_contract(
    contract_id: uuid.UUID,
    data: ContractSign,
    request: Request,
    ctx: ModuleContext = Depends(_ctx),
    _=Depends(_can_sign),
):
    ip = request.client.host if request.client else None
    return await ContractService.sign_contract(ctx.db, contract_id, data, ip=ip)


# ══════════════════════════════════════════════
# MÉTRICAS / DASHBOARD
# ══════════════════════════════════════════════

@router.get("/metrics/proposals")
async def proposals_metrics(ctx: ModuleContext = Depends(_ctx)):
    """
    Dashboard de propostas:
    - Taxa de aceitação, volume total, propostas por status
    - Propostas expirando nos próximos 7 dias
    """
    from app.modules.propostas_contratos.service import ProposalsMetricsService
    return await ProposalsMetricsService.overview(ctx.db)


@router.get("/reports/proposals")
async def report_proposals(
    period_start: Optional[str] = Query(None, description="YYYY-MM-DD"),
    period_end: Optional[str] = Query(None, description="YYYY-MM-DD"),
    status: Optional[str] = Query(None),
    ctx: ModuleContext = Depends(_ctx),
):
    """Exporta propostas filtradas como CSV."""
    from app.modules.propostas_contratos.service import ProposalsMetricsService
    csv_content = await ProposalsMetricsService.export_csv(ctx.db, period_start, period_end, status)
    return StreamingResponse(
        iter([csv_content]),
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=propostas.csv"},
    )
