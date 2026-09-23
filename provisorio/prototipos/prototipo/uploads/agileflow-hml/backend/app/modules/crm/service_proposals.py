import uuid
from datetime import datetime
from typing import Optional, List

from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from sqlalchemy.orm import selectinload
from fastapi import HTTPException

from app.modules.crm.models import (
    Proposal, ProposalItem, ProposalStatusLog, ProposalStatus,
    ProposalTemplate, ProposalTemplateItem,
)
from app.modules.crm.schemas import (
    ProposalCreate, ProposalUpdate,
    ProposalItemCreate, ProposalItemUpdate,
    ProposalStatusChange,
    ProposalTemplateCreate, ProposalTemplateUpdate,
    ProposalFromTemplate,
)
from app.modules.super_admin.models import User


# Transições válidas. None de origem permite criar status sem ter status anterior.
VALID_TRANSITIONS: dict[ProposalStatus, set[ProposalStatus]] = {
    ProposalStatus.DRAFT:     {ProposalStatus.SENT, ProposalStatus.CANCELLED},
    ProposalStatus.SENT:      {ProposalStatus.ACCEPTED, ProposalStatus.REJECTED, ProposalStatus.EXPIRED, ProposalStatus.CANCELLED, ProposalStatus.DRAFT},
    ProposalStatus.ACCEPTED:  set(),                       # estado final (use nova versão)
    ProposalStatus.REJECTED:  {ProposalStatus.DRAFT},      # pode voltar pra rascunho
    ProposalStatus.EXPIRED:   {ProposalStatus.DRAFT},
    ProposalStatus.CANCELLED: set(),                       # final
}


class ProposalService:

    @staticmethod
    async def _generate_number(db: AsyncSession) -> str:
        """Gera próximo número sequencial no formato PROP-NNNN."""
        result = await db.execute(select(func.count(Proposal.id)))
        count = result.scalar() or 0
        return f"PROP-{(count + 1):04d}"

    @staticmethod
    def _compute_item_total(qty: float, unit_price: float) -> float:
        return round(float(qty) * float(unit_price), 2)

    @staticmethod
    def _recompute_proposal_total(proposal: Proposal) -> None:
        items_total = sum(float(i.total or 0) for i in (proposal.items or []))
        proposal.total_value = max(items_total - float(proposal.discount or 0), 0)

    @staticmethod
    async def list_proposals(
        db: AsyncSession,
        skip: int = 0,
        limit: int = 50,
        status: Optional[ProposalStatus] = None,
        attendance_id: Optional[uuid.UUID] = None,
        client_id: Optional[uuid.UUID] = None,
    ) -> List[Proposal]:
        q = select(Proposal).order_by(Proposal.created_at.desc()).offset(skip).limit(limit)
        if status:
            q = q.where(Proposal.status == status)
        if attendance_id:
            q = q.where(Proposal.attendance_id == attendance_id)
        if client_id:
            q = q.where(Proposal.client_id == client_id)
        result = await db.execute(q)
        return list(result.scalars().all())

    @staticmethod
    async def get_proposal(db: AsyncSession, proposal_id: uuid.UUID) -> Proposal:
        result = await db.execute(
            select(Proposal)
            .options(selectinload(Proposal.items))
            .where(Proposal.id == proposal_id)
        )
        p = result.scalar_one_or_none()
        if not p:
            raise HTTPException(status_code=404, detail="Proposta não encontrada.")
        return p

    @staticmethod
    async def create_proposal(
        db: AsyncSession, data: ProposalCreate, current_user: User
    ) -> Proposal:
        number = await ProposalService._generate_number(db)
        proposal = Proposal(
            number=number,
            version=1,
            title=data.title,
            description=data.description,
            attendance_id=data.attendance_id,
            client_id=data.client_id,
            company_id=data.company_id,
            client_name=data.client_name,
            client_email=data.client_email,
            client_phone=data.client_phone,
            client_document=data.client_document,
            discount=data.discount,
            payment_terms=data.payment_terms,
            delivery_terms=data.delivery_terms,
            notes=data.notes,
            valid_until=data.valid_until,
            custom_data=data.custom_data,
            created_by=current_user.id,
            status=ProposalStatus.DRAFT,
        )
        db.add(proposal)
        await db.flush()

        for idx, it in enumerate(data.items):
            total = ProposalService._compute_item_total(it.quantity, it.unit_price)
            db.add(ProposalItem(
                proposal_id=proposal.id,
                description=it.description,
                quantity=it.quantity,
                unit=it.unit,
                unit_price=it.unit_price,
                total=total,
                order=it.order if it.order else idx,
                custom_data=it.custom_data,
            ))

        # Calcula total a partir dos dados — evita lazy-load (MissingGreenlet)
        await db.flush()
        items_total = sum(
            ProposalService._compute_item_total(it.quantity, it.unit_price)
            for it in data.items
        )
        proposal.total_value = max(items_total - float(proposal.discount or 0), 0)

        # Log de status inicial
        db.add(ProposalStatusLog(
            proposal_id=proposal.id,
            from_status=None,
            to_status=ProposalStatus.DRAFT,
            changed_by=current_user.id,
        ))

        await db.commit()
        await db.refresh(proposal, ["items"])
        return proposal

    @staticmethod
    async def update_proposal(
        db: AsyncSession, proposal_id: uuid.UUID, data: ProposalUpdate
    ) -> Proposal:
        proposal = await ProposalService.get_proposal(db, proposal_id)
        if proposal.status not in (ProposalStatus.DRAFT, ProposalStatus.SENT):
            raise HTTPException(
                status_code=400,
                detail="Só é possível editar propostas em rascunho ou enviadas. Reabra ou crie nova versão."
            )
        for field, value in data.model_dump(exclude_unset=True).items():
            setattr(proposal, field, value)
        proposal.updated_at = datetime.utcnow()
        ProposalService._recompute_proposal_total(proposal)
        await db.commit()
        await db.refresh(proposal, ["items"])
        return proposal

    @staticmethod
    async def delete_proposal(db: AsyncSession, proposal_id: uuid.UUID) -> None:
        p = await ProposalService.get_proposal(db, proposal_id)
        if p.status not in (ProposalStatus.DRAFT, ProposalStatus.CANCELLED):
            raise HTTPException(
                status_code=400,
                detail="Só é possível excluir propostas em rascunho ou canceladas."
            )
        await db.delete(p)
        await db.commit()

    # ── Items ────────────────────────────────

    @staticmethod
    async def add_item(
        db: AsyncSession, proposal_id: uuid.UUID, data: ProposalItemCreate
    ) -> ProposalItem:
        proposal = await ProposalService.get_proposal(db, proposal_id)
        if proposal.status not in (ProposalStatus.DRAFT, ProposalStatus.SENT):
            raise HTTPException(400, "Proposta fechada não pode receber novos itens.")
        item = ProposalItem(
            proposal_id=proposal_id,
            description=data.description,
            quantity=data.quantity,
            unit=data.unit,
            unit_price=data.unit_price,
            total=ProposalService._compute_item_total(data.quantity, data.unit_price),
            order=data.order if data.order else len(proposal.items),
            custom_data=data.custom_data,
        )
        db.add(item)
        await db.flush()
        # Refresca itens e recomputa total
        await db.refresh(proposal, ["items"])
        ProposalService._recompute_proposal_total(proposal)
        await db.commit()
        await db.refresh(item)
        return item

    @staticmethod
    async def update_item(
        db: AsyncSession, proposal_id: uuid.UUID, item_id: uuid.UUID, data: ProposalItemUpdate
    ) -> ProposalItem:
        proposal = await ProposalService.get_proposal(db, proposal_id)
        if proposal.status not in (ProposalStatus.DRAFT, ProposalStatus.SENT):
            raise HTTPException(400, "Proposta fechada não pode ter itens alterados.")
        result = await db.execute(
            select(ProposalItem).where(
                ProposalItem.id == item_id, ProposalItem.proposal_id == proposal_id
            )
        )
        item = result.scalar_one_or_none()
        if not item:
            raise HTTPException(404, "Item não encontrado.")
        for field, value in data.model_dump(exclude_unset=True).items():
            setattr(item, field, value)
        item.total = ProposalService._compute_item_total(float(item.quantity), float(item.unit_price))
        await db.flush()
        await db.refresh(proposal, ["items"])
        ProposalService._recompute_proposal_total(proposal)
        await db.commit()
        await db.refresh(item)
        return item

    @staticmethod
    async def delete_item(
        db: AsyncSession, proposal_id: uuid.UUID, item_id: uuid.UUID
    ) -> None:
        proposal = await ProposalService.get_proposal(db, proposal_id)
        if proposal.status not in (ProposalStatus.DRAFT, ProposalStatus.SENT):
            raise HTTPException(400, "Proposta fechada não pode ter itens removidos.")
        result = await db.execute(
            select(ProposalItem).where(
                ProposalItem.id == item_id, ProposalItem.proposal_id == proposal_id
            )
        )
        item = result.scalar_one_or_none()
        if not item:
            raise HTTPException(404, "Item não encontrado.")
        await db.delete(item)
        await db.flush()
        await db.refresh(proposal, ["items"])
        ProposalService._recompute_proposal_total(proposal)
        await db.commit()

    # ── Status ───────────────────────────────

    @staticmethod
    async def change_status(
        db: AsyncSession,
        proposal_id: uuid.UUID,
        data: ProposalStatusChange,
        current_user: User,
    ) -> Proposal:
        proposal = await ProposalService.get_proposal(db, proposal_id)
        if data.to_status == proposal.status:
            return proposal
        allowed = VALID_TRANSITIONS.get(proposal.status, set())
        if data.to_status not in allowed:
            raise HTTPException(
                status_code=400,
                detail=f"Transição de '{proposal.status.value}' para '{data.to_status.value}' não é permitida."
            )

        previous = proposal.status
        proposal.status = data.to_status
        now = datetime.utcnow()
        proposal.updated_at = now

        if data.to_status == ProposalStatus.SENT:
            proposal.sent_at = now
        elif data.to_status == ProposalStatus.ACCEPTED:
            proposal.accepted_at = now
        elif data.to_status == ProposalStatus.REJECTED:
            proposal.rejected_at = now

        db.add(ProposalStatusLog(
            proposal_id=proposal.id,
            from_status=previous,
            to_status=data.to_status,
            changed_by=current_user.id,
            notes=data.notes,
        ))

        # Hook cross-module: proposta aceita → move atendimento pra etapa de ganho
        if data.to_status == ProposalStatus.ACCEPTED and proposal.attendance_id:
            try:
                await ProposalService._move_attendance_to_won(
                    db, proposal, current_user,
                )
            except Exception as e:  # noqa: BLE001
                # Não falha a transição se o hook der erro (módulo atendimento pode estar desativado)
                print(f"[propostas_contratos] hook ACCEPTED falhou: {e}")

        await db.commit()
        await db.refresh(proposal, ["items"])
        return proposal

    @staticmethod
    async def _move_attendance_to_won(
        db: AsyncSession, proposal: Proposal, current_user: User,
    ) -> None:
        """
        Quando proposta vira ACCEPTED e tem attendance_id, busca a etapa
        com outcome=won do funil atual do atendimento e move o atendimento.
        Também registra evento na timeline e dispara automações.
        """
        # Imports locais pra não criar dependência forte de módulo
        from app.modules.crm.models import (
            Attendance, AttendanceStatusConfig, StageOutcome,
            LeadEvent, LeadEventType, AutomationTrigger,
        )
        from app.modules.crm.service import (
            TimelineService, AutomationRunner,
        )

        att_result = await db.execute(
            select(Attendance).where(Attendance.id == proposal.attendance_id)
        )
        attendance = att_result.scalar_one_or_none()
        if not attendance:
            return  # atendimento foi deletado ou módulo atendimento inativo

        # Status atual do atendimento → busca funil
        stage_result = await db.execute(
            select(AttendanceStatusConfig).where(
                AttendanceStatusConfig.id == attendance.status_id
            )
        )
        current_stage = stage_result.scalar_one_or_none()
        if not current_stage:
            return

        # Já está em etapa won? não faz nada
        if current_stage.outcome == StageOutcome.WON:
            return

        # Procura etapa com outcome=won no mesmo funil
        won_result = await db.execute(
            select(AttendanceStatusConfig).where(
                AttendanceStatusConfig.funnel_id == current_stage.funnel_id,
                AttendanceStatusConfig.outcome == StageOutcome.WON,
            ).order_by(AttendanceStatusConfig.order).limit(1)
        )
        won_stage = won_result.scalar_one_or_none()
        if not won_stage:
            # Sem etapa de ganho — só registra na timeline
            db.add(LeadEvent(
                attendance_id=attendance.id,
                type=LeadEventType.AUTOMATION,
                content=f"✅ Proposta {proposal.number} aceita. (Funil sem etapa de ganho configurada.)",
                author_id=current_user.id,
                author_name=current_user.full_name,
                extra_data={"proposal_id": str(proposal.id)},
            ))
            return

        # Move pra won
        old_status_id = attendance.status_id
        attendance.status_id = won_stage.id
        attendance.updated_at = datetime.utcnow()
        # Se valor da proposta > valor do atendimento, atualiza
        if not attendance.value or float(attendance.value) < float(proposal.total_value):
            attendance.value = proposal.total_value

        # Timeline
        await TimelineService.add_event(
            db, attendance.id,
            content=f"✅ Atendimento movido para '{won_stage.name}' por proposta {proposal.number} aceita.",
            event_type=LeadEventType.STATUS_CHANGED,
            author_id=current_user.id,
            author_name=current_user.full_name,
            extra_data={
                "proposal_id": str(proposal.id),
                "from_status_id": str(old_status_id),
                "to_status_id": str(won_stage.id),
            },
            commit=False,
        )

        # Dispara automações de status_won
        await AutomationRunner.run(db, attendance, AutomationTrigger.STATUS_WON, current_user)

    @staticmethod
    async def list_status_logs(
        db: AsyncSession, proposal_id: uuid.UUID
    ) -> List[ProposalStatusLog]:
        result = await db.execute(
            select(ProposalStatusLog)
            .where(ProposalStatusLog.proposal_id == proposal_id)
            .order_by(ProposalStatusLog.changed_at.desc())
        )
        return list(result.scalars().all())

    @staticmethod
    async def generate_public_token(
        db: AsyncSession, proposal_id: uuid.UUID
    ) -> Proposal:
        """Gera/renova token público da proposta. Só pode ser usado em propostas não-finais."""
        import secrets
        proposal = await ProposalService.get_proposal(db, proposal_id)
        if proposal.status in (ProposalStatus.ACCEPTED, ProposalStatus.CANCELLED):
            raise HTTPException(400, "Proposta já encerrada não pode ter link público.")
        proposal.public_token = secrets.token_urlsafe(24)
        await db.commit()
        await db.refresh(proposal, ["items"])
        return proposal

    @staticmethod
    async def revoke_public_token(
        db: AsyncSession, proposal_id: uuid.UUID
    ) -> Proposal:
        proposal = await ProposalService.get_proposal(db, proposal_id)
        proposal.public_token = None
        await db.commit()
        await db.refresh(proposal, ["items"])
        return proposal

    @staticmethod
    async def create_new_version(
        db: AsyncSession, proposal_id: uuid.UUID, current_user: User
    ) -> Proposal:
        """Duplica uma proposta em status final criando nova versão em DRAFT."""
        source = await ProposalService.get_proposal(db, proposal_id)
        new = Proposal(
            number=source.number,
            version=source.version + 1,
            title=source.title,
            description=source.description,
            attendance_id=source.attendance_id,
            client_id=source.client_id,
            company_id=source.company_id,
            client_name=source.client_name,
            client_email=source.client_email,
            client_phone=source.client_phone,
            client_document=source.client_document,
            discount=source.discount,
            payment_terms=source.payment_terms,
            delivery_terms=source.delivery_terms,
            notes=source.notes,
            valid_until=source.valid_until,
            custom_data=source.custom_data,
            created_by=current_user.id,
            status=ProposalStatus.DRAFT,
        )
        # Number deve ser único — vamos sufixar com versão
        new.number = f"{source.number}-V{new.version}"
        db.add(new)
        await db.flush()

        for it in source.items:
            db.add(ProposalItem(
                proposal_id=new.id,
                description=it.description,
                quantity=it.quantity,
                unit=it.unit,
                unit_price=it.unit_price,
                total=it.total,
                order=it.order,
                custom_data=it.custom_data,
            ))

        db.add(ProposalStatusLog(
            proposal_id=new.id,
            from_status=None,
            to_status=ProposalStatus.DRAFT,
            changed_by=current_user.id,
            notes=f"Nova versão criada a partir de {source.number} (v{source.version}).",
        ))

        await db.flush()
        await db.refresh(new, ["items"])
        ProposalService._recompute_proposal_total(new)
        await db.commit()
        await db.refresh(new, ["items"])
        return new


# ══════════════════════════════════════════════
# TEMPLATE SERVICE
# ══════════════════════════════════════════════

class ProposalTemplateService:

    @staticmethod
    async def list_templates(db: AsyncSession, active_only: bool = False) -> List[ProposalTemplate]:
        q = select(ProposalTemplate).options(selectinload(ProposalTemplate.items)).order_by(ProposalTemplate.name)
        if active_only:
            q = q.where(ProposalTemplate.is_active == True)
        result = await db.execute(q)
        return list(result.scalars().all())

    @staticmethod
    async def get_template(db: AsyncSession, template_id: uuid.UUID) -> ProposalTemplate:
        result = await db.execute(
            select(ProposalTemplate)
            .options(selectinload(ProposalTemplate.items))
            .where(ProposalTemplate.id == template_id)
        )
        t = result.scalar_one_or_none()
        if not t:
            raise HTTPException(404, "Template não encontrado.")
        return t

    @staticmethod
    async def create_template(db: AsyncSession, data: ProposalTemplateCreate) -> ProposalTemplate:
        payload = data.model_dump(exclude={"items"})
        t = ProposalTemplate(**payload)
        db.add(t)
        await db.flush()
        for idx, it in enumerate(data.items):
            db.add(ProposalTemplateItem(
                template_id=t.id,
                description=it.description,
                quantity=it.quantity,
                unit=it.unit,
                unit_price=it.unit_price,
                order=it.order if it.order else idx,
            ))
        await db.commit()
        await db.refresh(t, ["items"])
        return t

    @staticmethod
    async def update_template(
        db: AsyncSession, template_id: uuid.UUID, data: ProposalTemplateUpdate
    ) -> ProposalTemplate:
        t = await ProposalTemplateService.get_template(db, template_id)
        update_data = data.model_dump(exclude_unset=True, exclude={"items"})
        for field, value in update_data.items():
            setattr(t, field, value)
        # Substitui items se fornecido
        if data.items is not None:
            await db.execute(
                ProposalTemplateItem.__table__.delete().where(
                    ProposalTemplateItem.template_id == t.id
                )
            )
            for idx, it in enumerate(data.items):
                db.add(ProposalTemplateItem(
                    template_id=t.id,
                    description=it.description,
                    quantity=it.quantity,
                    unit=it.unit,
                    unit_price=it.unit_price,
                    order=it.order if it.order else idx,
                ))
        t.updated_at = datetime.utcnow()
        await db.commit()
        await db.refresh(t, ["items"])
        return t

    @staticmethod
    async def delete_template(db: AsyncSession, template_id: uuid.UUID) -> None:
        t = await ProposalTemplateService.get_template(db, template_id)
        await db.delete(t)
        await db.commit()

    @staticmethod
    async def create_proposal_from_template(
        db: AsyncSession, data: ProposalFromTemplate, current_user: User
    ) -> Proposal:
        from datetime import timedelta as _td
        tpl = await ProposalTemplateService.get_template(db, data.template_id)

        valid_until = None
        if tpl.validity_days:
            valid_until = datetime.utcnow() + _td(days=int(tpl.validity_days))

        proposal_data = ProposalCreate(
            title=tpl.title or tpl.name,
            description=tpl.body,
            attendance_id=data.attendance_id,
            client_id=data.client_id,
            company_id=data.company_id,
            client_name=data.client_name,
            client_email=data.client_email,
            client_phone=data.client_phone,
            client_document=data.client_document,
            discount=float(tpl.discount or 0),
            payment_terms=tpl.payment_terms,
            delivery_terms=tpl.delivery_terms,
            notes=tpl.notes,
            valid_until=valid_until,
            items=[
                ProposalItemCreate(
                    description=it.description,
                    quantity=float(it.quantity),
                    unit=it.unit,
                    unit_price=float(it.unit_price),
                    order=it.order,
                ) for it in tpl.items
            ],
        )
        return await ProposalService.create_proposal(db, proposal_data, current_user)


# ══════════════════════════════════════════════
# CONTRATOS
# ══════════════════════════════════════════════

import hashlib
import secrets
from app.modules.crm.models import Contract, ContractTemplate, ContractStatus  # noqa: E402
from app.modules.crm.schemas import (  # noqa: E402
    ContractCreate, ContractUpdate, ContractFromProposal, ContractSign,
    ContractTemplateCreate, ContractTemplateUpdate,
)


def _interpolate_body(body: str, ctx: dict) -> str:
    out = body
    for k, v in ctx.items():
        out = out.replace("{{" + k + "}}", str(v) if v is not None else "")
    return out


class ContractTemplateService:

    @staticmethod
    async def list_templates(db: AsyncSession, active_only: bool = False) -> List[ContractTemplate]:
        q = select(ContractTemplate).order_by(ContractTemplate.name)
        if active_only:
            q = q.where(ContractTemplate.is_active == True)
        result = await db.execute(q)
        return list(result.scalars().all())

    @staticmethod
    async def get_template(db: AsyncSession, template_id: uuid.UUID) -> ContractTemplate:
        result = await db.execute(select(ContractTemplate).where(ContractTemplate.id == template_id))
        t = result.scalar_one_or_none()
        if not t:
            raise HTTPException(404, "Template de contrato não encontrado.")
        return t

    @staticmethod
    async def create_template(db: AsyncSession, data: ContractTemplateCreate) -> ContractTemplate:
        t = ContractTemplate(**data.model_dump())
        db.add(t)
        await db.commit()
        await db.refresh(t)
        return t

    @staticmethod
    async def update_template(db: AsyncSession, template_id: uuid.UUID, data: ContractTemplateUpdate) -> ContractTemplate:
        t = await ContractTemplateService.get_template(db, template_id)
        for field, value in data.model_dump(exclude_unset=True).items():
            setattr(t, field, value)
        t.updated_at = datetime.utcnow()
        await db.commit()
        await db.refresh(t)
        return t

    @staticmethod
    async def delete_template(db: AsyncSession, template_id: uuid.UUID) -> None:
        t = await ContractTemplateService.get_template(db, template_id)
        await db.delete(t)
        await db.commit()


class ContractService:

    @staticmethod
    async def _generate_number(db: AsyncSession) -> str:
        result = await db.execute(select(func.count(Contract.id)))
        count = result.scalar() or 0
        return f"CTR-{(count + 1):04d}"

    @staticmethod
    async def list_contracts(
        db: AsyncSession,
        skip: int = 0, limit: int = 50,
        status: Optional[ContractStatus] = None,
        proposal_id: Optional[uuid.UUID] = None,
        client_id: Optional[uuid.UUID] = None,
    ) -> List[Contract]:
        q = select(Contract).order_by(Contract.created_at.desc()).offset(skip).limit(limit)
        if status: q = q.where(Contract.status == status)
        if proposal_id: q = q.where(Contract.proposal_id == proposal_id)
        if client_id: q = q.where(Contract.client_id == client_id)
        result = await db.execute(q)
        return list(result.scalars().all())

    @staticmethod
    async def get_contract(db: AsyncSession, contract_id: uuid.UUID) -> Contract:
        result = await db.execute(select(Contract).where(Contract.id == contract_id))
        c = result.scalar_one_or_none()
        if not c:
            raise HTTPException(404, "Contrato não encontrado.")
        return c

    @staticmethod
    async def create_contract(db: AsyncSession, data: ContractCreate, current_user: User) -> Contract:
        number = await ContractService._generate_number(db)
        c = Contract(
            **data.model_dump(),
            number=number,
            created_by=current_user.id,
            status=ContractStatus.DRAFT,
        )
        db.add(c)
        await db.commit()
        await db.refresh(c)
        return c

    @staticmethod
    async def update_contract(db: AsyncSession, contract_id: uuid.UUID, data: ContractUpdate) -> Contract:
        c = await ContractService.get_contract(db, contract_id)
        if c.status == ContractStatus.SIGNED:
            raise HTTPException(400, "Contrato assinado não pode ser alterado.")
        for field, value in data.model_dump(exclude_unset=True).items():
            setattr(c, field, value)
        c.updated_at = datetime.utcnow()
        await db.commit()
        await db.refresh(c)
        return c

    @staticmethod
    async def delete_contract(db: AsyncSession, contract_id: uuid.UUID) -> None:
        c = await ContractService.get_contract(db, contract_id)
        if c.status == ContractStatus.SIGNED:
            raise HTTPException(400, "Contrato assinado não pode ser excluído.")
        await db.delete(c)
        await db.commit()

    @staticmethod
    async def create_from_proposal(
        db: AsyncSession, data: ContractFromProposal, current_user: User,
    ) -> Contract:
        proposal = await ProposalService.get_proposal(db, data.proposal_id)
        if proposal.status != ProposalStatus.ACCEPTED:
            raise HTTPException(400, "Apenas propostas aceitas podem gerar contratos.")

        # Carrega template (opcional)
        body = ""
        if data.template_id:
            tpl = await ContractTemplateService.get_template(db, data.template_id)
            ctx = {
                "client_name":     proposal.client_name or "",
                "client_document": proposal.client_document or "",
                "client_email":    proposal.client_email or "",
                "proposal_number": proposal.number,
                "proposal_title":  proposal.title,
                "total_value":     f"R$ {float(proposal.total_value):,.2f}".replace(",", "X").replace(".", ",").replace("X", "."),
                "payment_terms":   proposal.payment_terms or "",
                "delivery_terms":  proposal.delivery_terms or "",
                "start_date":      data.start_date.strftime("%d/%m/%Y") if data.start_date else "",
                "end_date":        data.end_date.strftime("%d/%m/%Y") if data.end_date else "",
                "current_date":    datetime.utcnow().strftime("%d/%m/%Y"),
            }
            body = _interpolate_body(tpl.body, ctx)
        else:
            # Body simples sumarizando a proposta
            items_lines = "\n".join(
                f"- {i.description} ({float(i.quantity)} {i.unit or 'un'}) — R$ {float(i.total):.2f}"
                for i in proposal.items
            )
            body = (
                f"CONTRATO referente à Proposta {proposal.number}.\n\n"
                f"CONTRATADO/CLIENTE: {proposal.client_name or ''}\n"
                f"DOCUMENTO: {proposal.client_document or ''}\n\n"
                f"OBJETO: {proposal.title}\n\n"
                f"{proposal.description or ''}\n\n"
                f"ITENS:\n{items_lines}\n\n"
                f"VALOR TOTAL: R$ {float(proposal.total_value):.2f}\n\n"
                f"PAGAMENTO: {proposal.payment_terms or '—'}\n"
                f"ENTREGA: {proposal.delivery_terms or '—'}\n\n"
                f"{proposal.notes or ''}"
            )

        contract_data = ContractCreate(
            title=data.title or f"Contrato — {proposal.title}",
            body=body,
            proposal_id=proposal.id,
            attendance_id=proposal.attendance_id,
            client_id=proposal.client_id,
            company_id=proposal.company_id,
            client_name=proposal.client_name,
            client_document=proposal.client_document,
            client_email=proposal.client_email,
            client_phone=proposal.client_phone,
            total_value=float(proposal.total_value),
            start_date=data.start_date,
            end_date=data.end_date,
        )
        return await ContractService.create_contract(db, contract_data, current_user)

    @staticmethod
    async def change_status(
        db: AsyncSession, contract_id: uuid.UUID, new_status: ContractStatus,
    ) -> Contract:
        c = await ContractService.get_contract(db, contract_id)
        c.status = new_status
        c.updated_at = datetime.utcnow()
        await db.commit()
        await db.refresh(c)
        return c

    @staticmethod
    async def generate_public_token(db: AsyncSession, contract_id: uuid.UUID) -> Contract:
        c = await ContractService.get_contract(db, contract_id)
        c.public_token = secrets.token_urlsafe(24)
        await db.commit()
        await db.refresh(c)
        return c

    @staticmethod
    async def sign_contract(
        db: AsyncSession, contract_id: uuid.UUID, data: ContractSign, ip: Optional[str] = None,
    ) -> Contract:
        """Stub de assinatura — armazena dados do signatário + hash."""
        c = await ContractService.get_contract(db, contract_id)
        if c.status == ContractStatus.SIGNED:
            raise HTTPException(400, "Contrato já assinado.")
        if not data.accept_terms:
            raise HTTPException(400, "É necessário aceitar os termos.")

        now = datetime.utcnow()
        # Hash inclui corpo + signatário + timestamp — comprova integridade
        digest_input = f"{c.id}|{c.body}|{data.signer_name}|{data.signer_document or ''}|{now.isoformat()}"
        signature_hash = hashlib.sha256(digest_input.encode()).hexdigest()

        c.status = ContractStatus.SIGNED
        c.signed_at = now
        c.signer_name = data.signer_name
        c.signer_document = data.signer_document
        c.signer_email = data.signer_email
        c.signer_ip = ip
        c.signature_hash = signature_hash
        c.updated_at = now
        await db.commit()
        await db.refresh(c)
        return c


# ══════════════════════════════════════════════
# PROPOSALS METRICS SERVICE
# ══════════════════════════════════════════════

class ProposalsMetricsService:

    @staticmethod
    async def overview(db: AsyncSession) -> dict:
        from datetime import timedelta
        from app.modules.crm.models import ProposalStatus

        # Contagem por status
        by_status_result = await db.execute(
            select(Proposal.status, func.count(Proposal.id), func.coalesce(func.sum(Proposal.total_value), 0))
            .group_by(Proposal.status)
        )
        by_status = {}
        total_value = 0.0
        total_accepted = 0
        total_sent = 0
        for status, count, value in by_status_result:
            by_status[status.value] = {"count": count, "value": float(value)}
            total_value += float(value)
            if status == ProposalStatus.ACCEPTED:
                total_accepted = count
            if status == ProposalStatus.SENT:
                total_sent = count

        total_result = await db.execute(select(func.count(Proposal.id)))
        total = total_result.scalar() or 0

        acceptance_rate = round(total_accepted / total * 100, 1) if total > 0 else 0.0

        # Expirando nos próximos 7 dias
        now = datetime.utcnow()
        soon = now + timedelta(days=7)
        expiring_result = await db.execute(
            select(func.count(Proposal.id)).where(
                Proposal.status.in_([ProposalStatus.DRAFT, ProposalStatus.SENT]),
                Proposal.valid_until.isnot(None),
                Proposal.valid_until >= now,
                Proposal.valid_until <= soon,
            )
        )
        expiring_count = expiring_result.scalar() or 0

        return {
            "total": total,
            "acceptance_rate": acceptance_rate,
            "total_pipeline_value": total_value,
            "expiring_7_days": expiring_count,
            "by_status": by_status,
        }

    @staticmethod
    async def export_csv(
        db: AsyncSession,
        period_start: Optional[str],
        period_end: Optional[str],
        status: Optional[str],
    ) -> str:
        import csv
        import io
        from datetime import date

        q = select(Proposal).order_by(Proposal.created_at.desc())

        if period_start:
            q = q.where(Proposal.created_at >= date.fromisoformat(period_start))
        if period_end:
            q = q.where(Proposal.created_at <= date.fromisoformat(period_end))
        if status:
            q = q.where(Proposal.status == status)

        q = q.limit(5000)
        result = await db.execute(q)
        rows = list(result.scalars().all())

        output = io.StringIO()
        writer = csv.writer(output)
        writer.writerow(["Número", "Título", "Cliente", "Status", "Valor Total", "Válida Até", "Criado Em"])
        for p in rows:
            writer.writerow([
                p.number,
                p.title,
                str(p.client_id),
                p.status.value,
                float(p.total_value),
                p.valid_until.strftime("%d/%m/%Y") if p.valid_until else "",
                p.created_at.strftime("%d/%m/%Y") if p.created_at else "",
            ])
        return output.getvalue()
