"""Bootstrap e resolucao do fluxo de contratacao (kanban Contratar)."""

from __future__ import annotations

import uuid
from datetime import date, datetime
from typing import Any, Optional

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.modules.projetos.models import (
    Project,
    ProjectDemandFormField,
    ProjectDemandFormSection,
    ProjectDemandType,
    ProjectFunnel,
    ProjectStatusDefaultFormLink,
    ProjectStatusSectionLink,
    ProjectStatusConfig,
    ProjectTask,
)

_EXTERNAL_CATEGORIES = frozenset({
    "sistema_externo_ia",
    "sistema_externo_implantacao",
    "sistema_externo_hibrido",
    "sistema_externo_dn",
})

_CONTRATAR_STAGES: list[dict[str, Any]] = [
    {"key": "backlog", "name": "Backlog", "color": "#64748B", "order": 0, "is_initial": True},
    {"key": "prospectar", "name": "Prospectar", "color": "#0EA5E9", "order": 1},
    {"key": "aderencia", "name": "Análise de aderência", "color": "#8B5CF6", "order": 2},
    {"key": "proposta", "name": "Proposta", "color": "#F59E0B", "order": 3},
    {"key": "negociacao", "name": "Negociação", "color": "#F97316", "order": 4},
    {
        "key": "concluido",
        "name": "Concluído",
        "color": "#16A34A",
        "order": 5,
        "is_final": True,
        "is_procurement_won": True,
    },
    {
        "key": "cancelado",
        "name": "Cancelado",
        "color": "#DC2626",
        "order": 6,
        "is_final": True,
        "is_procurement_lost": True,
    },
]

_FORM_SECTIONS: list[dict[str, Any]] = [
    {
        "key": "proposta",
        "title": "Proposta comercial",
        "order": 0,
        "stage_keys": ("proposta",),
        "fields": [
            {"field_key": "proposal_anexos", "label": "Anexo da proposta", "field_type": "file", "is_required": True, "order": 0},
            {"field_key": "proposal_valor", "label": "Valor da proposta", "field_type": "number", "is_required": True, "order": 1},
            {"field_key": "proposal_observacoes", "label": "Observações", "field_type": "text_long", "is_required": False, "order": 2},
        ],
    },
    {
        "key": "negociacao",
        "title": "Negociação / Contrato",
        "order": 1,
        "stage_keys": ("negociacao",),
        "fields": [
            {"field_key": "fornecedor_id", "label": "Fornecedor vencedor", "field_type": "text", "is_required": True, "order": 0},
            {"field_key": "contrato_anexo", "label": "Anexo do contrato", "field_type": "file", "is_required": True, "order": 1},
            {"field_key": "contrato_vigencia_inicio", "label": "Vigência início", "field_type": "date", "is_required": True, "order": 2},
            {"field_key": "contrato_vigencia_fim", "label": "Vigência fim", "field_type": "date", "is_required": True, "order": 3},
            {"field_key": "contrato_identificador", "label": "Identificador / número", "field_type": "text", "is_required": False, "order": 4},
        ],
    },
    {
        "key": "cancelamento",
        "title": "Cancelamento",
        "order": 2,
        "stage_keys": ("cancelado",),
        "fields": [
            {"field_key": "cancel_reason", "label": "Motivo do cancelamento", "field_type": "text_long", "is_required": True, "order": 0},
        ],
    },
]


def is_external_product_categoria(categoria: Optional[str]) -> bool:
    if not categoria:
        return False
    return str(categoria) in _EXTERNAL_CATEGORIES or str(categoria).startswith("sistema_externo_")


class ProcurementFlowService:
    """Garante funil Contratar + tipo + raias Contratacao/Cancelado por projeto."""

    @staticmethod
    async def ensure(db: AsyncSession, project_id: uuid.UUID) -> dict[str, Any]:
        project = await db.get(Project, project_id)
        if not project:
            raise HTTPException(status_code=404, detail="Projeto não encontrado.")

        funnel = await ProcurementFlowService._ensure_contratar_funnel(db, project)
        stages = await ProcurementFlowService._ensure_contratar_stages(db, project_id, funnel.id)
        demand_type = await ProcurementFlowService._ensure_demand_type(db, project, funnel)
        await ProcurementFlowService._ensure_forms(db, demand_type, stages)
        await ProcurementFlowService._ensure_planning_hold_lanes(db, project_id)
        await db.flush()
        return {
            "funnel_id": funnel.id,
            "demand_type_id": demand_type.id,
            "stages": {k: s.id for k, s in stages.items()},
        }

    @staticmethod
    async def _ensure_contratar_funnel(db: AsyncSession, project: Project) -> ProjectFunnel:
        res = await db.execute(
            select(ProjectFunnel).where(
                ProjectFunnel.project_id == project.id,
                ProjectFunnel.is_procurement == True,  # noqa: E712
            ).limit(1)
        )
        funnel = res.scalar_one_or_none()
        if funnel:
            if not funnel.is_active:
                funnel.is_active = True
            return funnel
        max_order = (
            await db.execute(
                select(ProjectFunnel.order)
                .where(ProjectFunnel.project_id == project.id)
                .order_by(ProjectFunnel.order.desc())
                .limit(1)
            )
        ).scalar_one_or_none()
        funnel = ProjectFunnel(
            project_id=project.id,
            name="Contratar",
            description="Fluxo de contratação de soluções externas.",
            color="#EA580C",
            order=(max_order or 0) + 1,
            is_default=False,
            is_active=True,
            is_procurement=True,
        )
        db.add(funnel)
        await db.flush()
        return funnel

    @staticmethod
    async def _ensure_contratar_stages(
        db: AsyncSession, project_id: uuid.UUID, funnel_id: uuid.UUID
    ) -> dict[str, ProjectStatusConfig]:
        res = await db.execute(
            select(ProjectStatusConfig).where(
                ProjectStatusConfig.project_id == project_id,
                ProjectStatusConfig.funnel_id == funnel_id,
            )
        )
        existing = list(res.scalars().all())
        by_key = {s.procurement_stage_key: s for s in existing if s.procurement_stage_key}
        by_name = {s.name.lower(): s for s in existing}
        out: dict[str, ProjectStatusConfig] = {}
        for spec in _CONTRATAR_STAGES:
            key = spec["key"]
            status = by_key.get(key) or by_name.get(spec["name"].lower())
            if status:
                status.procurement_stage_key = key
                status.is_procurement_won = bool(spec.get("is_procurement_won"))
                status.is_procurement_lost = bool(spec.get("is_procurement_lost"))
                status.is_final = bool(spec.get("is_final", False))
                status.is_initial = bool(spec.get("is_initial", False))
                status.is_active = True
                status.order = spec["order"]
                status.color = spec["color"]
            else:
                status = ProjectStatusConfig(
                    project_id=project_id,
                    funnel_id=funnel_id,
                    name=spec["name"],
                    color=spec["color"],
                    order=spec["order"],
                    is_initial=bool(spec.get("is_initial", False)),
                    is_final=bool(spec.get("is_final", False)),
                    is_active=True,
                    procurement_stage_key=key,
                    is_procurement_won=bool(spec.get("is_procurement_won")),
                    is_procurement_lost=bool(spec.get("is_procurement_lost")),
                )
                db.add(status)
            out[key] = status
        await db.flush()
        return out

    @staticmethod
    async def _ensure_demand_type(
        db: AsyncSession, project: Project, funnel: ProjectFunnel
    ) -> ProjectDemandType:
        res = await db.execute(
            select(ProjectDemandType)
            .where(
                ProjectDemandType.is_procurement == True,  # noqa: E712
                ProjectDemandType.funnel_id == funnel.id,
            )
            .limit(1)
        )
        dt = res.scalar_one_or_none()
        if dt:
            dt.is_active = True
            dt.show_in_schedule = False
            return dt
        slug = f"contratacao_{project.id.hex[:8]}"
        name = f"Contratação - {project.name}"[:140]
        clash = await db.execute(
            select(ProjectDemandType.id).where(
                (ProjectDemandType.slug == slug) | (ProjectDemandType.name == name)
            ).limit(1)
        )
        if clash.scalar_one_or_none():
            slug = f"contratacao_{project.id.hex}"
            name = (f"Contratação - {project.name}"[:120] + f" ({project.id.hex[:4]})")[:140]
        dt = ProjectDemandType(
            slug=slug,
            name=name,
            description="Card do fluxo de contratação de solução externa.",
            funnel_id=funnel.id,
            available_for_basic=False,
            show_in_schedule=False,
            is_procurement=True,
            order=99,
            is_active=True,
        )
        db.add(dt)
        await db.flush()
        funnel.allowed_demand_type_ids = [str(dt.id)]
        return dt

    @staticmethod
    async def _ensure_forms(
        db: AsyncSession,
        demand_type: ProjectDemandType,
        stages: dict[str, ProjectStatusConfig],
    ) -> None:
        sec_res = await db.execute(
            select(ProjectDemandFormSection)
            .where(ProjectDemandFormSection.demand_type_id == demand_type.id)
            .options(selectinload(ProjectDemandFormSection.fields))
        )
        sections = {s.key: s for s in sec_res.scalars().all()}
        for spec in _FORM_SECTIONS:
            section = sections.get(spec["key"])
            if not section:
                section = ProjectDemandFormSection(
                    demand_type_id=demand_type.id,
                    key=spec["key"],
                    title=spec["title"],
                    order=spec["order"],
                    is_active=True,
                )
                db.add(section)
                await db.flush()
                sections[spec["key"]] = section
                existing_fields: dict = {}
            else:
                existing_fields = {f.field_key: f for f in (section.fields or [])}
            for fspec in spec["fields"]:
                if fspec["field_key"] in existing_fields:
                    continue
                db.add(
                    ProjectDemandFormField(
                        section_id=section.id,
                        field_key=fspec["field_key"],
                        label=fspec["label"],
                        field_type=fspec["field_type"],
                        is_required=bool(fspec.get("is_required")),
                        is_active=True,
                        order=fspec["order"],
                    )
                )
            for stage_key in spec["stage_keys"]:
                status = stages.get(stage_key)
                if not status:
                    continue
                link_res = await db.execute(
                    select(ProjectStatusSectionLink).where(
                        ProjectStatusSectionLink.status_id == status.id,
                        ProjectStatusSectionLink.section_id == section.id,
                    )
                )
                link = link_res.scalar_one_or_none()
                if link:
                    link.mode = "required"
                else:
                    db.add(
                        ProjectStatusSectionLink(
                            status_id=status.id,
                            section_id=section.id,
                            mode="required",
                        )
                    )
        proposta = stages.get("proposta")
        if proposta:
            link_res = await db.execute(
                select(ProjectStatusDefaultFormLink).where(
                    ProjectStatusDefaultFormLink.status_id == proposta.id,
                    ProjectStatusDefaultFormLink.field_key == "anexos",
                )
            )
            if not link_res.scalar_one_or_none():
                db.add(
                    ProjectStatusDefaultFormLink(
                        status_id=proposta.id,
                        field_key="anexos",
                        mode="required",
                    )
                )

    @staticmethod
    async def _ensure_planning_hold_lanes(db: AsyncSession, project_id: uuid.UUID) -> None:
        funnels = (
            await db.execute(select(ProjectFunnel).where(ProjectFunnel.project_id == project_id))
        ).scalars().all()
        for funnel in funnels:
            if funnel.is_procurement:
                continue
            name = (funnel.name or "").strip().lower()
            is_planning = (
                funnel.is_default
                or (("projeto" in name or "programa" in name)
                    and "feature" not in name
                    and "user story" not in name)
            )
            if not is_planning:
                continue
            statuses = (
                await db.execute(
                    select(ProjectStatusConfig).where(
                        ProjectStatusConfig.funnel_id == funnel.id,
                        ProjectStatusConfig.project_id == project_id,
                    )
                )
            ).scalars().all()
            hold = next((s for s in statuses if s.is_procurement_hold), None)
            cancel = next((s for s in statuses if s.is_procurement_cancel), None)
            max_order = max((s.order for s in statuses), default=0)
            if not hold:
                by_name = next(
                    (s for s in statuses if s.name.lower() in ("contratacao", "contratação")),
                    None,
                )
                if by_name:
                    by_name.is_procurement_hold = True
                    hold = by_name
                else:
                    hold = ProjectStatusConfig(
                        project_id=project_id,
                        funnel_id=funnel.id,
                        name="Contratação",
                        color="#EA580C",
                        order=max_order + 1,
                        is_active=True,
                        is_procurement_hold=True,
                    )
                    db.add(hold)
                    max_order += 1
            if not cancel:
                by_name = next((s for s in statuses if s.name.lower() == "cancelado"), None)
                if by_name:
                    by_name.is_procurement_cancel = True
                else:
                    db.add(
                        ProjectStatusConfig(
                            project_id=project_id,
                            funnel_id=funnel.id,
                            name="Cancelado",
                            color="#DC2626",
                            order=max_order + 1,
                            is_final=True,
                            is_active=True,
                            is_procurement_cancel=True,
                        )
                    )

    @staticmethod
    async def hold_status_for_task(
        db: AsyncSession, project_id: uuid.UUID, task: ProjectTask
    ) -> ProjectStatusConfig:
        current = await db.get(ProjectStatusConfig, task.status_id)
        if not current:
            raise HTTPException(status_code=400, detail="Etapa atual do card inválida.")
        res = await db.execute(
            select(ProjectStatusConfig).where(
                ProjectStatusConfig.project_id == project_id,
                ProjectStatusConfig.funnel_id == current.funnel_id,
                ProjectStatusConfig.is_procurement_hold == True,  # noqa: E712
                ProjectStatusConfig.is_active == True,  # noqa: E712
            ).limit(1)
        )
        hold = res.scalar_one_or_none()
        if not hold:
            raise HTTPException(
                status_code=400,
                detail="Raia Contratação não configurada neste kanban.",
            )
        return hold

    @staticmethod
    async def cancel_status_for_origin(
        db: AsyncSession, project_id: uuid.UUID, origin: ProjectTask
    ) -> Optional[ProjectStatusConfig]:
        current = await db.get(ProjectStatusConfig, origin.status_id)
        if not current:
            return None
        res = await db.execute(
            select(ProjectStatusConfig).where(
                ProjectStatusConfig.project_id == project_id,
                ProjectStatusConfig.funnel_id == current.funnel_id,
                ProjectStatusConfig.is_procurement_cancel == True,  # noqa: E712
                ProjectStatusConfig.is_active == True,  # noqa: E712
            ).limit(1)
        )
        return res.scalar_one_or_none()

    @staticmethod
    async def next_status_after_hold(
        db: AsyncSession, project_id: uuid.UUID, hold: ProjectStatusConfig
    ) -> Optional[ProjectStatusConfig]:
        res = await db.execute(
            select(ProjectStatusConfig)
            .where(
                ProjectStatusConfig.project_id == project_id,
                ProjectStatusConfig.funnel_id == hold.funnel_id,
                ProjectStatusConfig.is_active == True,  # noqa: E712
                ProjectStatusConfig.is_procurement_hold == False,  # noqa: E712
                ProjectStatusConfig.is_procurement_cancel == False,  # noqa: E712
                ProjectStatusConfig.order > hold.order,
            )
            .order_by(ProjectStatusConfig.order.asc())
            .limit(1)
        )
        nxt = res.scalar_one_or_none()
        if nxt:
            return nxt
        res2 = await db.execute(
            select(ProjectStatusConfig)
            .where(
                ProjectStatusConfig.project_id == project_id,
                ProjectStatusConfig.funnel_id == hold.funnel_id,
                ProjectStatusConfig.is_active == True,  # noqa: E712
                ProjectStatusConfig.is_initial == False,  # noqa: E712
                ProjectStatusConfig.is_procurement_hold == False,  # noqa: E712
                ProjectStatusConfig.is_procurement_cancel == False,  # noqa: E712
            )
            .order_by(ProjectStatusConfig.order.asc())
            .limit(1)
        )
        return res2.scalar_one_or_none()

    @staticmethod
    async def start_procurement(
        db: AsyncSession,
        project_id: uuid.UUID,
        origin: ProjectTask,
        *,
        created_by: Optional[uuid.UUID] = None,
    ) -> ProjectTask:
        """Trava a origem na raia Contratacao e cria o card no funil Contratar."""
        if origin.procurement_task_id and origin.procurement_locked:
            child = await db.get(ProjectTask, origin.procurement_task_id)
            if child:
                return child

        await ProcurementFlowService.ensure(db, project_id)
        hold = await ProcurementFlowService.hold_status_for_task(db, project_id, origin)

        funnel_res = await db.execute(
            select(ProjectFunnel).where(
                ProjectFunnel.project_id == project_id,
                ProjectFunnel.is_procurement == True,  # noqa: E712
            ).limit(1)
        )
        funnel = funnel_res.scalar_one_or_none()
        if not funnel:
            raise HTTPException(status_code=500, detail="Fluxo de contratação incompleto.")
        dt_res = await db.execute(
            select(ProjectDemandType).where(
                ProjectDemandType.is_procurement == True,  # noqa: E712
                ProjectDemandType.funnel_id == funnel.id,
            ).limit(1)
        )
        demand_type = dt_res.scalar_one_or_none()
        if not demand_type:
            raise HTTPException(status_code=500, detail="Fluxo de contratação incompleto.")

        init_res = await db.execute(
            select(ProjectStatusConfig)
            .where(
                ProjectStatusConfig.funnel_id == funnel.id,
                ProjectStatusConfig.is_active == True,  # noqa: E712
            )
            .order_by(ProjectStatusConfig.is_initial.desc(), ProjectStatusConfig.order.asc())
            .limit(1)
        )
        init_status = init_res.scalar_one_or_none()
        if not init_status:
            raise HTTPException(status_code=500, detail="Funil Contratar sem etapa inicial.")

        child = ProjectTask(
            project_id=project_id,
            status_id=init_status.id,
            demand_type_id=demand_type.id,
            title=f"Contratar - {origin.title}"[:200],
            description=origin.description,
            assigned_to=origin.assigned_to,
            diretoria=origin.diretoria,
            area=origin.area,
            linked_product_id=origin.linked_product_id,
            origin_task_id=origin.id,
            created_by=created_by or origin.created_by,
            procurement_meta={},
        )
        db.add(child)
        await db.flush()

        origin.status_id = hold.id
        origin.procurement_required = True
        origin.procurement_locked = True
        origin.procurement_task_id = child.id
        origin.status_entered_at = datetime.utcnow()
        origin.updated_at = datetime.utcnow()
        return child

    @staticmethod
    def _meta(task: ProjectTask) -> dict:
        return dict(task.procurement_meta or {})

    @staticmethod
    def _meta_has_file(meta: dict, *keys: str) -> bool:
        for key in keys:
            val = meta.get(key)
            if isinstance(val, list) and len(val) > 0:
                return True
            if isinstance(val, dict) and val.get("object_name"):
                return True
            if isinstance(val, str) and val.strip():
                return True
        return False

    @staticmethod
    def enforce_move_gate(
        source: ProjectStatusConfig,
        target: ProjectStatusConfig,
        task: ProjectTask,
        *,
        cancel_reason: Optional[str] = None,
    ) -> None:
        src_key = source.procurement_stage_key
        tgt_key = target.procurement_stage_key
        if not src_key and not tgt_key:
            return
        meta = ProcurementFlowService._meta(task)
        reason = (cancel_reason or task.procurement_cancel_reason or meta.get("cancel_reason") or "").strip()

        if src_key == "proposta" and tgt_key and tgt_key not in ("backlog", "prospectar", "aderencia", "proposta"):
            has_file = (
                ProcurementFlowService._meta_has_file(meta, "proposal_anexos", "proposta_anexos")
                or (isinstance(task.anexos, list) and len(task.anexos) > 0)
            )
            valor = meta.get("proposal_valor", meta.get("valor"))
            if not has_file:
                raise HTTPException(status_code=400, detail="Anexe a proposta comercial antes de avançar.")
            if valor is None or valor == "":
                raise HTTPException(status_code=400, detail="Informe o valor da proposta antes de avançar.")

        if target.is_procurement_won or tgt_key == "concluido":
            fornecedor = meta.get("fornecedor_id")
            has_contrato = ProcurementFlowService._meta_has_file(
                meta, "contrato_anexo", "contrato_object_name", "contrato"
            )
            if not fornecedor:
                raise HTTPException(status_code=400, detail="Informe o fornecedor vencedor.")
            if not has_contrato:
                raise HTTPException(status_code=400, detail="Anexe o contrato antes de concluir.")
            inicio = meta.get("contrato_vigencia_inicio")
            fim = meta.get("contrato_vigencia_fim")
            if not inicio or not fim:
                raise HTTPException(
                    status_code=400,
                    detail="Informe a vigência do contrato (início e fim).",
                )

        if target.is_procurement_lost or tgt_key == "cancelado":
            if not reason:
                raise HTTPException(
                    status_code=400,
                    detail="Informe o motivo do cancelamento da contratação.",
                )

    @staticmethod
    async def resolve_on_status(
        db: AsyncSession,
        project_id: uuid.UUID,
        task: ProjectTask,
        status_obj: ProjectStatusConfig,
        *,
        user_id: Optional[uuid.UUID] = None,
    ) -> None:
        if not (status_obj.is_procurement_won or status_obj.is_procurement_lost):
            return
        if not task.origin_task_id:
            return
        origin = await db.get(ProjectTask, task.origin_task_id)
        if not origin or origin.project_id != project_id:
            return

        if status_obj.is_procurement_won:
            await ProcurementFlowService._attach_contrato(db, task, user_id)
            cur = await db.get(ProjectStatusConfig, origin.status_id)
            hold = cur if (cur and cur.is_procurement_hold) else (
                await ProcurementFlowService.hold_status_for_task(db, project_id, origin)
            )
            nxt = await ProcurementFlowService.next_status_after_hold(db, project_id, hold)
            origin.procurement_locked = False
            if nxt:
                origin.status_id = nxt.id
                origin.status_entered_at = datetime.utcnow()
                origin.completed_at = None
            origin.updated_at = datetime.utcnow()
            return

        reason = (
            (task.procurement_cancel_reason or "")
            or str((task.procurement_meta or {}).get("cancel_reason") or "")
        ).strip()
        origin.procurement_cancel_reason = reason or origin.procurement_cancel_reason
        origin.procurement_locked = False
        cancel = await ProcurementFlowService.cancel_status_for_origin(db, project_id, origin)
        if cancel:
            origin.status_id = cancel.id
            origin.status_entered_at = datetime.utcnow()
            if cancel.is_final:
                origin.completed_at = datetime.utcnow()
        origin.updated_at = datetime.utcnow()

    @staticmethod
    async def _attach_contrato(
        db: AsyncSession,
        task: ProjectTask,
        user_id: Optional[uuid.UUID],
    ) -> None:
        product_id = task.linked_product_id
        if not product_id:
            raise HTTPException(
                status_code=400,
                detail="Card de contratação sem produto vinculado para anexar o contrato.",
            )
        meta = ProcurementFlowService._meta(task)
        fornecedor_raw = meta.get("fornecedor_id")
        try:
            fornecedor_id = uuid.UUID(str(fornecedor_raw))
        except (TypeError, ValueError) as exc:
            raise HTTPException(status_code=400, detail="Fornecedor vencedor inválido.") from exc

        anexo = meta.get("contrato_anexo")
        object_name = meta.get("contrato_object_name")
        filename = meta.get("contrato_filename")
        content_type = meta.get("contrato_content_type")
        size = meta.get("contrato_size")
        if isinstance(anexo, list) and anexo:
            first = anexo[0] if isinstance(anexo[0], dict) else {}
            object_name = object_name or first.get("object_name")
            filename = filename or first.get("filename")
            content_type = content_type or first.get("content_type")
            size = size or first.get("size")
        elif isinstance(anexo, dict):
            object_name = object_name or anexo.get("object_name")
            filename = filename or anexo.get("filename")
            content_type = content_type or anexo.get("content_type")
            size = size or anexo.get("size")

        def _parse_date(val) -> date:
            if isinstance(val, date) and not isinstance(val, datetime):
                return val
            if isinstance(val, datetime):
                return val.date()
            return date.fromisoformat(str(val)[:10])

        try:
            vigencia_inicio = _parse_date(meta.get("contrato_vigencia_inicio"))
            vigencia_fim = _parse_date(meta.get("contrato_vigencia_fim"))
        except (TypeError, ValueError) as exc:
            raise HTTPException(status_code=400, detail="Vigência do contrato inválida.") from exc

        from app.modules.produtos.models import Contrato, ContratoStatus

        valor = meta.get("proposal_valor", meta.get("valor"))
        try:
            valor_f = float(valor) if valor is not None and valor != "" else None
        except (TypeError, ValueError):
            valor_f = None

        c = Contrato(
            product_id=product_id,
            fornecedor_id=fornecedor_id,
            identificador=meta.get("contrato_identificador") or None,
            vigencia_inicio=vigencia_inicio,
            vigencia_fim=vigencia_fim,
            object_name=object_name,
            filename=filename,
            content_type=content_type,
            size=int(size) if size is not None else None,
            valor=valor_f,
            status_contrato=ContratoStatus.VIGENTE,
            observacoes=meta.get("proposal_observacoes"),
            alerta_dias=[90, 60, 30],
            created_by=user_id or task.created_by,
        )
        db.add(c)
        await db.flush()
