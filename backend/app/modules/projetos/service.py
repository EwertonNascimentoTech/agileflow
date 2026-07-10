from __future__ import annotations

import asyncio
import json
import math
import time
import re
import uuid
from datetime import date, datetime, timedelta, timezone
from decimal import Decimal
from typing import Optional

import httpx
from fastapi import HTTPException, status
from sqlalchemy import and_, delete as sa_delete, func, or_, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.config import settings
from app.core.anonymize import anonymize_text
from app.modules.projetos.models import (
    ProjectAgentExecution,
    ProjectAutomationAction,
    ProjectAutomationRule,
    ProjectCardField,
    ProjectDefaultFormField,
    ProjectDemandFormField,
    ProjectDemandFormSection,
    ProjectDemandFormSubmission,
    ProjectDemandType,
    ProjectFunnel,
    Project,
    ProjectMember,
    ProjectPriorityConfidenceLevel,
    ProjectPriorityCriterion,
    ProjectPriorityPillar,
    ProjectPriorityQuadrant,
    ProjectPriorityScore,
    ProjectPriorityScoreHistory,
    ProjectPrioritySettings,
    ProjectProgram,
    ProjectScheduleBaseline,
    ProjectScheduleBinding,
    ProjectStageAgentBinding,
    ProjectStatusDefaultFormLink,
    ProjectStatusSectionLink,
    ProjectStatusConfig,
    ProjectStatusReport,
    ProjectTask,
    ProjectTaskComment,
    ProjectTaskDependency,
)
from app.modules.projetos.schemas import (
    ProjectAutomationRuleCreate,
    ProjectAutomationRuleUpdate,
    ProjectCreate,
    ProjectProgramCreate,
    ProjectProgramUpdate,
    ProjectProgramResponse,
    ProjectDefaultFormFieldUpdateItem,
    ProjectDefaultFormFieldsUpdate,
    ProjectDemandFormFieldCreate,
    ProjectDemandFormFieldUpdate,
    ProjectDemandFormSubmissionUpsert,
    ProjectDemandFormSectionCreate,
    ProjectDemandFormSectionUpdate,
    ProjectDemandTypeCreate,
    ProjectDemandTypeUpdate,
    ProjectFunnelCreate,
    ProjectFunnelUpdate,
    ProjectCardFieldsUpdate,
    ProjectMemberCreate,
    PriorityCriteriaUpsert,
    PriorityConfidenceUpsert,
    PriorityPillarsUpsert,
    PriorityQuadrantsUpsert,
    PriorityScoreInput,
    PrioritySettingsUpdate,
    ProjectScheduleBindingItem,
    ProjectStageAgentBindingCreate,
    ProjectStageAgentBindingResponse,
    ProjectStageAgentBindingUpdate,
    ScheduleStageCreate,
    TaskDependencyCreate,
    WorkloadCell,
    WorkloadCellItem,
    CapacityPersonMeta,
    CapacitySummary,
    CapacityHeatmapResponse,
    CapacityProjectRow,
    CapacityByProjectResponse,
    CapacityGapRow,
    CapacityGapsResponse,
    FreePersonRow,
    FreePeopleResponse,
    SimTaskMeta,
    SimTasksResponse,
    ScenarioMutation,
    ScenarioDiff,
    ScenarioResult,
    CrossTeamAwayItem,
    CrossTeamPersonRow,
    CrossTeamResponse,
    SuggestedScenario,
    ScenarioSuggestionsResponse,
    ProjectStatusCreate,
    ProjectStatusUpdate,
    ProjectTaskCommentCreate,
    ProjectTaskCreate,
    ProjectTaskUpdate,
    ProjectTaskWithContextResponse,
    ProjectUpdate,
)
from sqlalchemy import text as _sa_text
from app.modules.super_admin.models import User, UserRole
from app.modules.teamops.calendar import load_calendar, project_hours_per_day
from app.modules.teamops.models import (
    Absence,
    AbsenceStatus,
    AbsenceType,
    Area,
    Person,
    PersonStack,
    PersonStatus,
    Position,
    StackLevel,
    team_person_areas,
)
from app.modules.projetos.schedule_engine import (
    EngineEdge,
    EngineNode,
    ScheduleCycleError,
    compute_cpm,
    schedule_tree,
)

import logging

logger = logging.getLogger(__name__)


def _to_naive_utc(value: Optional[datetime]) -> Optional[datetime]:
    if value is None:
        return None
    if value.tzinfo is None:
        return value
    return value.astimezone(timezone.utc).replace(tzinfo=None)


# Cronograma: capacidade diária padrão e helpers de dias úteis (seg–sex, sem feriados).
HOURS_PER_DAY = 8.0


def _is_business_day(d: datetime | date) -> bool:
    return d.weekday() < 5  # 0=seg … 4=sex


def _add_business_days(d: datetime, n: int) -> datetime:
    """Soma `n` dias úteis a `d` (pula sáb/dom). n pode ser 0 (apenas alinha em dia útil
    para frente)."""
    cur = d
    # Se já cair em fim de semana e n>=0, primeiro joga para o próximo dia útil.
    while not _is_business_day(cur):
        cur = cur + timedelta(days=1)
    step = 0
    while step < n:
        cur = cur + timedelta(days=1)
        if _is_business_day(cur):
            step += 1
    return cur


def _business_days_between(start: datetime, end: datetime) -> int:
    """Número de dias úteis no intervalo inclusivo [start, end]. Mínimo 1."""
    if end < start:
        start, end = end, start
    count = 0
    cur = start
    while cur.date() <= end.date():
        if _is_business_day(cur):
            count += 1
        cur = cur + timedelta(days=1)
    return max(1, count)


def _duration_days_from_hours(estimated_hours: Optional[Decimal], hours_per_day: float = HOURS_PER_DAY) -> Optional[int]:
    if estimated_hours is None:
        return None
    h = float(estimated_hours)
    if h <= 0:
        return None
    return max(1, math.ceil(h / hours_per_day))


def _normalize_slug(value: str) -> str:
    return value.strip().lower().replace("-", "_")


class ProjectService:
    @staticmethod
    async def list(db: AsyncSession, active_only: bool = False) -> list[Project]:
        q = select(Project).order_by(Project.created_at.desc())
        if active_only:
            q = q.where(Project.is_active == True)  # noqa: E712
        result = await db.execute(q)
        return list(result.scalars().all())

    @staticmethod
    async def create(db: AsyncSession, data: ProjectCreate) -> Project:
        payload = data.model_dump()
        payload["start_date"] = _to_naive_utc(payload.get("start_date"))
        payload["due_date"] = _to_naive_utc(payload.get("due_date"))
        project = Project(**payload)
        db.add(project)
        await db.commit()
        await db.refresh(project)

        default_funnel = ProjectFunnel(
            project_id=project.id,
            name="Padrão",
            description="Funil padrão do processo.",
            color="#7C3AED",
            order=0,
            is_default=True,
            is_active=True,
        )
        db.add(default_funnel)
        await db.commit()
        await db.refresh(default_funnel)

        # Status padrão para projeto recém-criado.
        defaults = [
            ProjectStatusConfig(
                project_id=project.id,
                funnel_id=default_funnel.id,
                name="Backlog",
                color="#64748B",
                order=0,
                is_initial=True,
            ),
            ProjectStatusConfig(
                project_id=project.id,
                funnel_id=default_funnel.id,
                name="Em andamento",
                color="#2563EB",
                order=1,
            ),
            ProjectStatusConfig(
                project_id=project.id,
                funnel_id=default_funnel.id,
                name="Concluído",
                color="#16A34A",
                order=2,
                is_final=True,
            ),
        ]
        db.add_all(defaults)
        await db.commit()
        return project

    @staticmethod
    async def get(db: AsyncSession, project_id: uuid.UUID) -> Project:
        result = await db.execute(select(Project).where(Project.id == project_id))
        project = result.scalar_one_or_none()
        if not project:
            raise HTTPException(status_code=404, detail="Projeto não encontrado.")
        return project

    @staticmethod
    async def update(db: AsyncSession, project_id: uuid.UUID, data: ProjectUpdate) -> Project:
        project = await ProjectService.get(db, project_id)
        payload = data.model_dump(exclude_unset=True)
        if "start_date" in payload:
            payload["start_date"] = _to_naive_utc(payload.get("start_date"))
        if "due_date" in payload:
            payload["due_date"] = _to_naive_utc(payload.get("due_date"))
        for key, value in payload.items():
            setattr(project, key, value)
        project.updated_at = datetime.utcnow()
        await db.commit()
        await db.refresh(project)
        return project

    @staticmethod
    async def delete(db: AsyncSession, project_id: uuid.UUID) -> None:
        project = await ProjectService.get(db, project_id)
        await db.delete(project)
        await db.commit()


class ProjectDemandTypeService:
    @staticmethod
    async def _validate_funnel(db: AsyncSession, funnel_id: Optional[uuid.UUID]) -> None:
        if funnel_id is None:
            return
        result = await db.execute(select(ProjectFunnel).where(ProjectFunnel.id == funnel_id))
        if result.scalar_one_or_none() is None:
            raise HTTPException(status_code=400, detail="Funil informado não existe neste tenant.")

    @staticmethod
    async def list(db: AsyncSession, active_only: bool = False) -> list[ProjectDemandType]:
        q = (
            select(ProjectDemandType)
            .options(selectinload(ProjectDemandType.funnel))
            .order_by(ProjectDemandType.order.asc(), ProjectDemandType.created_at.asc())
        )
        if active_only:
            q = q.where(ProjectDemandType.is_active == True)  # noqa: E712
        result = await db.execute(q)
        return list(result.scalars().all())

    @staticmethod
    async def get(db: AsyncSession, demand_type_id: uuid.UUID) -> ProjectDemandType:
        result = await db.execute(
            select(ProjectDemandType)
            .options(selectinload(ProjectDemandType.funnel))
            .where(ProjectDemandType.id == demand_type_id)
        )
        item = result.scalar_one_or_none()
        if not item:
            raise HTTPException(status_code=404, detail="Tipo de demanda não encontrado.")
        return item

    @staticmethod
    def _normalize_child_ids(value) -> Optional[list[str]]:
        """JSONB não serializa UUID — converte para strings."""
        if value is None:
            return None
        return [str(x) for x in value]

    @staticmethod
    async def create(db: AsyncSession, data: ProjectDemandTypeCreate) -> ProjectDemandType:
        payload = data.model_dump()
        payload["slug"] = _normalize_slug(payload["slug"])
        if "allowed_child_type_ids" in payload:
            payload["allowed_child_type_ids"] = ProjectDemandTypeService._normalize_child_ids(
                payload["allowed_child_type_ids"]
            )
        await ProjectDemandTypeService._validate_funnel(db, payload.get("funnel_id"))
        item = ProjectDemandType(**payload)
        db.add(item)
        await db.commit()
        return await ProjectDemandTypeService.get(db, item.id)

    @staticmethod
    async def update(db: AsyncSession, demand_type_id: uuid.UUID, data: ProjectDemandTypeUpdate) -> ProjectDemandType:
        item = await ProjectDemandTypeService.get(db, demand_type_id)
        payload = data.model_dump(exclude_unset=True)
        if payload.get("slug"):
            payload["slug"] = _normalize_slug(payload["slug"])
        if "allowed_child_type_ids" in payload:
            payload["allowed_child_type_ids"] = ProjectDemandTypeService._normalize_child_ids(
                payload["allowed_child_type_ids"]
            )
        if "funnel_id" in payload:
            await ProjectDemandTypeService._validate_funnel(db, payload["funnel_id"])
        for key, value in payload.items():
            setattr(item, key, value)
        item.updated_at = datetime.utcnow()
        await db.commit()
        return await ProjectDemandTypeService.get(db, item.id)

    @staticmethod
    async def reorder(db: AsyncSession, items: list[dict]) -> list[ProjectDemandType]:
        if not items:
            return await ProjectDemandTypeService.list(db)
        ids = [i.get("id") for i in items if i.get("id")]
        if not ids:
            return await ProjectDemandTypeService.list(db)
        result = await db.execute(select(ProjectDemandType).where(ProjectDemandType.id.in_(ids)))
        current = {str(x.id): x for x in result.scalars().all()}
        for item in items:
            sid = str(item.get("id"))
            if sid in current and item.get("order") is not None:
                current[sid].order = int(item["order"])
                current[sid].updated_at = datetime.utcnow()
        await db.commit()
        return await ProjectDemandTypeService.list(db)

    @staticmethod
    async def delete(db: AsyncSession, demand_type_id: uuid.UUID) -> None:
        item = await ProjectDemandTypeService.get(db, demand_type_id)
        await db.delete(item)
        await db.commit()


_DEFAULT_FORM_SEED: list[dict] = [
    {"field_key": "title", "label": "Título", "field_type": "text", "options": None, "is_visible": True, "is_required": True, "order": 0},
    {"field_key": "description", "label": "Descrição", "field_type": "text_long", "options": None, "is_visible": True, "is_required": False, "order": 1},
    {"field_key": "assigned_to", "label": "Responsável", "field_type": "user", "options": None, "is_visible": True, "is_required": False, "order": 2},
    {"field_key": "diretoria", "label": "Diretoria", "field_type": "select", "options": {"items": []}, "is_visible": True, "is_required": False, "order": 3},
    {"field_key": "area", "label": "Área", "field_type": "select", "options": {"items": []}, "is_visible": True, "is_required": False, "order": 4},
    {"field_key": "start_date", "label": "Data de início", "field_type": "date", "options": None, "is_visible": True, "is_required": False, "order": 5},
    {"field_key": "due_date", "label": "Prazo", "field_type": "date", "options": None, "is_visible": True, "is_required": False, "order": 6},
    {"field_key": "anexos", "label": "Anexos", "field_type": "file", "options": None, "is_visible": True, "is_required": False, "order": 7},
]

_DEFAULT_FORM_KEYS = {row["field_key"] for row in _DEFAULT_FORM_SEED}

_DEFAULT_FORM_ALLOWED_TYPES: dict[str, set[str]] = {
    "title": {"text", "text_long"},
    "description": {"text", "text_long", "url"},
    "assigned_to": {"user"},
    "diretoria": {"select"},
    "area": {"select"},
    "start_date": {"date", "datetime"},
    "due_date": {"date", "datetime"},
    "anexos": {"file"},
}

_DEFAULT_FORM_TYPE_FALLBACK: dict[str, str] = {
    row["field_key"]: row["field_type"] for row in _DEFAULT_FORM_SEED
}


class ProjectDefaultFormService:
    @staticmethod
    def _slug_option_value(label: str, fallback: str = "opcao") -> str:
        import re
        slug = re.sub(r"[^a-z0-9]+", "_", (label or "").strip().lower()).strip("_")
        return slug[:80] if slug else fallback

    @staticmethod
    def _normalize_options(raw: Optional[dict]) -> Optional[dict]:
        if raw is None:
            return None
        items = raw.get("items") if isinstance(raw, dict) else None
        if not isinstance(items, list):
            return {"items": []}
        out: list[dict] = []
        seen: set[str] = set()
        for idx, item in enumerate(items):
            if not isinstance(item, dict):
                continue
            label = str(item.get("label") or "").strip()
            if not label:
                continue
            value = str(item.get("value") or "").strip()
            if not value:
                value = ProjectDefaultFormService._slug_option_value(label, f"opcao_{idx + 1}")
            base = value
            n = 2
            while value in seen:
                value = f"{base}_{n}"
                n += 1
            seen.add(value)
            row: dict = {"value": value, "label": label}
            if isinstance(item.get("color"), str) and item["color"].strip():
                row["color"] = item["color"].strip()
            out.append(row)
        return {"items": out}

    @staticmethod
    def _option_values(cfg: ProjectDefaultFormField) -> set[str]:
        opts = cfg.options or {}
        items = opts.get("items") if isinstance(opts, dict) else []
        if not isinstance(items, list):
            return set()
        return {str(i.get("value")) for i in items if isinstance(i, dict) and i.get("value")}

    @staticmethod
    def _normalize_field_type(field_key: str, field_type: str) -> str:
        raw = (field_type or "").strip().lower()
        legacy = {"textarea": "text_long"}
        normalized = legacy.get(raw, raw)
        allowed = _DEFAULT_FORM_ALLOWED_TYPES.get(field_key, {"text"})
        fallback = _DEFAULT_FORM_TYPE_FALLBACK.get(field_key, "text")
        return normalized if normalized in allowed else fallback

    @staticmethod
    async def ensure_seeded(db: AsyncSession) -> None:
        result = await db.execute(select(ProjectDefaultFormField).limit(1))
        if result.scalar_one_or_none() is not None:
            await ProjectDefaultFormService.ensure_missing_fields(db)
            return
        for row in _DEFAULT_FORM_SEED:
            db.add(ProjectDefaultFormField(**row, is_system=True))
        await db.commit()

    @staticmethod
    async def ensure_missing_fields(db: AsyncSession) -> None:
        result = await db.execute(select(ProjectDefaultFormField.field_key))
        existing = {row[0] for row in result.all()}
        added = False
        for row in _DEFAULT_FORM_SEED:
            if row["field_key"] in existing:
                continue
            db.add(ProjectDefaultFormField(**row, is_system=True))
            added = True
        if added:
            await db.commit()

    @staticmethod
    async def list(db: AsyncSession) -> list[ProjectDefaultFormField]:
        await ProjectDefaultFormService.ensure_seeded(db)
        await ProjectDefaultFormService.ensure_missing_fields(db)
        result = await db.execute(
            select(ProjectDefaultFormField).order_by(
                ProjectDefaultFormField.order.asc(),
                ProjectDefaultFormField.field_key.asc(),
            )
        )
        return list(result.scalars().all())

    @staticmethod
    async def replace_all(
        db: AsyncSession,
        data: ProjectDefaultFormFieldsUpdate,
    ) -> list[ProjectDefaultFormField]:
        await ProjectDefaultFormService.ensure_seeded(db)
        by_key = {item.field_key: item for item in data.fields}
        if set(by_key.keys()) != _DEFAULT_FORM_KEYS:
            raise HTTPException(
                status_code=400,
                detail="Envie todos os campos do formulário padrão.",
            )
        title = by_key["title"]
        if not title.is_visible or not title.is_required:
            raise HTTPException(
                status_code=400,
                detail="O campo Título deve permanecer visível e obrigatório.",
            )
        existing = await ProjectDefaultFormService.list(db)
        for row in existing:
            patch = by_key[row.field_key]
            row.label = patch.label.strip()
            row.field_type = ProjectDefaultFormService._normalize_field_type(
                row.field_key, patch.field_type
            )
            if patch.options is not None or row.field_type == "select":
                row.options = ProjectDefaultFormService._normalize_options(
                    patch.options if patch.options is not None else row.options
                )
            row.is_visible = patch.is_visible if row.field_key != "title" else True
            row.is_required = patch.is_required if row.field_key != "title" else True
            row.order = patch.order
            row.updated_at = datetime.utcnow()
        await db.commit()
        return await ProjectDefaultFormService.list(db)

    @staticmethod
    def _value_empty(field_key: str, value) -> bool:
        if field_key == "title":
            return value is None or not str(value).strip()
        if field_key == "description":
            return value is None or not str(value).strip()
        if field_key == "assigned_to":
            return value is None
        if field_key in ("start_date", "due_date"):
            return value is None
        if field_key in ("diretoria", "area"):
            return value is None or not str(value).strip()
        if field_key == "anexos":
            return not isinstance(value, list) or len(value) == 0
        return value in (None, "")

    @staticmethod
    async def validate_task_data(
        db: AsyncSession,
        *,
        title: Optional[str] = None,
        description: Optional[str] = None,
        assigned_to: Optional[uuid.UUID] = None,
        diretoria: Optional[str] = None,
        area: Optional[str] = None,
        start_date=None,
        due_date=None,
        anexos=None,
        existing: Optional[ProjectTask] = None,
    ) -> None:
        fields = await ProjectDefaultFormService.list(db)
        merged = {
            "title": title if title is not None else (existing.title if existing else None),
            "description": description if description is not None else (existing.description if existing else None),
            "assigned_to": assigned_to if assigned_to is not None else (existing.assigned_to if existing else None),
            "diretoria": diretoria if diretoria is not None else (existing.diretoria if existing else None),
            "area": area if area is not None else (existing.area if existing else None),
            "start_date": start_date if start_date is not None else (existing.start_date if existing else None),
            "due_date": due_date if due_date is not None else (existing.due_date if existing else None),
            "anexos": anexos if anexos is not None else (existing.anexos if existing else None),
        }
        missing: list[str] = []
        for cfg in fields:
            if not cfg.is_visible:
                continue
            val = merged.get(cfg.field_key)
            if cfg.is_required and ProjectDefaultFormService._value_empty(cfg.field_key, val):
                missing.append(cfg.label)
                continue
            if cfg.field_type == "select" and val not in (None, ""):
                allowed = ProjectDefaultFormService._option_values(cfg)
                if allowed and str(val) not in allowed:
                    raise HTTPException(
                        status_code=400,
                        detail=f"Valor inválido para o campo {cfg.label}.",
                    )
        if missing:
            raise HTTPException(
                status_code=400,
                detail=f"Campos obrigatórios não preenchidos: {', '.join(missing)}",
            )

    @staticmethod
    async def validate_task_data_for_status(
        db: AsyncSession,
        status_id: uuid.UUID,
        *,
        title: Optional[str] = None,
        description: Optional[str] = None,
        assigned_to: Optional[uuid.UUID] = None,
        diretoria: Optional[str] = None,
        area: Optional[str] = None,
        start_date=None,
        due_date=None,
        anexos=None,
        existing: Optional[ProjectTask] = None,
    ) -> None:
        """Valida campos padrão obrigatórios conforme vínculos da etapa (status)."""
        fields = await ProjectDefaultFormService.list(db)
        links_result = await db.execute(
            select(ProjectStatusDefaultFormLink).where(
                ProjectStatusDefaultFormLink.status_id == status_id,
            )
        )
        links = {link.field_key: link.mode for link in links_result.scalars().all()}
        merged = {
            "title": title if title is not None else (existing.title if existing else None),
            "description": description if description is not None else (existing.description if existing else None),
            "assigned_to": assigned_to if assigned_to is not None else (existing.assigned_to if existing else None),
            "diretoria": diretoria if diretoria is not None else (existing.diretoria if existing else None),
            "area": area if area is not None else (existing.area if existing else None),
            "start_date": start_date if start_date is not None else (existing.start_date if existing else None),
            "due_date": due_date if due_date is not None else (existing.due_date if existing else None),
            "anexos": anexos if anexos is not None else (existing.anexos if existing else None),
        }
        missing: list[str] = []
        for cfg in fields:
            mode = links.get(cfg.field_key)
            if mode == "hidden":
                continue
            if mode is None:
                if not cfg.is_visible:
                    continue
                is_required = cfg.is_required
            elif mode == "visible":
                continue
            elif mode == "required":
                is_required = True
            else:
                is_required = cfg.is_required
            if is_required and ProjectDefaultFormService._value_empty(cfg.field_key, merged.get(cfg.field_key)):
                missing.append(cfg.label)
        if missing:
            raise HTTPException(
                status_code=400,
                detail=f"Campos obrigatórios não preenchidos: {', '.join(missing)}",
            )


class ProjectDemandFormSectionService:
    @staticmethod
    async def list(db: AsyncSession, demand_type_id: uuid.UUID, active_only: bool = False) -> list[ProjectDemandFormSection]:
        await ProjectDemandTypeService.get(db, demand_type_id)
        q = select(ProjectDemandFormSection).where(ProjectDemandFormSection.demand_type_id == demand_type_id)
        if active_only:
            q = q.where(ProjectDemandFormSection.is_active == True)  # noqa: E712
        q = q.order_by(ProjectDemandFormSection.order.asc(), ProjectDemandFormSection.created_at.asc())
        result = await db.execute(q)
        return list(result.scalars().all())

    @staticmethod
    async def get(db: AsyncSession, demand_type_id: uuid.UUID, section_id: uuid.UUID) -> ProjectDemandFormSection:
        result = await db.execute(
            select(ProjectDemandFormSection).where(
                ProjectDemandFormSection.id == section_id,
                ProjectDemandFormSection.demand_type_id == demand_type_id,
            )
        )
        item = result.scalar_one_or_none()
        if not item:
            raise HTTPException(status_code=404, detail="Sessão não encontrada.")
        return item

    @staticmethod
    async def create(
        db: AsyncSession,
        demand_type_id: uuid.UUID,
        data: ProjectDemandFormSectionCreate,
    ) -> ProjectDemandFormSection:
        await ProjectDemandTypeService.get(db, demand_type_id)
        payload = data.model_dump()
        payload["key"] = _normalize_slug(payload["key"])
        item = ProjectDemandFormSection(demand_type_id=demand_type_id, **payload)
        db.add(item)
        await db.commit()
        await db.refresh(item)
        return item

    @staticmethod
    async def update(
        db: AsyncSession,
        demand_type_id: uuid.UUID,
        section_id: uuid.UUID,
        data: ProjectDemandFormSectionUpdate,
    ) -> ProjectDemandFormSection:
        item = await ProjectDemandFormSectionService.get(db, demand_type_id, section_id)
        payload = data.model_dump(exclude_unset=True)
        if payload.get("key"):
            payload["key"] = _normalize_slug(payload["key"])
        for key, value in payload.items():
            setattr(item, key, value)
        item.updated_at = datetime.utcnow()
        await db.commit()
        await db.refresh(item)
        return item

    @staticmethod
    async def reorder(db: AsyncSession, demand_type_id: uuid.UUID, items: list[dict]) -> list[ProjectDemandFormSection]:
        if not items:
            return await ProjectDemandFormSectionService.list(db, demand_type_id)
        ids = [i.get("id") for i in items if i.get("id")]
        if not ids:
            return await ProjectDemandFormSectionService.list(db, demand_type_id)
        result = await db.execute(
            select(ProjectDemandFormSection).where(
                ProjectDemandFormSection.demand_type_id == demand_type_id,
                ProjectDemandFormSection.id.in_(ids),
            )
        )
        current = {str(x.id): x for x in result.scalars().all()}
        for item in items:
            sid = str(item.get("id"))
            if sid in current and item.get("order") is not None:
                current[sid].order = int(item["order"])
                current[sid].updated_at = datetime.utcnow()
        await db.commit()
        return await ProjectDemandFormSectionService.list(db, demand_type_id)

    @staticmethod
    async def delete(db: AsyncSession, demand_type_id: uuid.UUID, section_id: uuid.UUID) -> None:
        item = await ProjectDemandFormSectionService.get(db, demand_type_id, section_id)
        await db.delete(item)
        await db.commit()


class ProjectDemandFormFieldService:
    @staticmethod
    async def list(
        db: AsyncSession,
        demand_type_id: uuid.UUID,
        section_id: uuid.UUID,
        active_only: bool = False,
    ) -> list[ProjectDemandFormField]:
        await ProjectDemandFormSectionService.get(db, demand_type_id, section_id)
        q = select(ProjectDemandFormField).where(ProjectDemandFormField.section_id == section_id)
        if active_only:
            q = q.where(ProjectDemandFormField.is_active == True)  # noqa: E712
        q = q.order_by(ProjectDemandFormField.order.asc(), ProjectDemandFormField.created_at.asc())
        result = await db.execute(q)
        return list(result.scalars().all())

    @staticmethod
    async def get(
        db: AsyncSession,
        demand_type_id: uuid.UUID,
        section_id: uuid.UUID,
        field_id: uuid.UUID,
    ) -> ProjectDemandFormField:
        await ProjectDemandFormSectionService.get(db, demand_type_id, section_id)
        result = await db.execute(
            select(ProjectDemandFormField).where(
                ProjectDemandFormField.id == field_id,
                ProjectDemandFormField.section_id == section_id,
            )
        )
        item = result.scalar_one_or_none()
        if not item:
            raise HTTPException(status_code=404, detail="Campo não encontrado.")
        return item

    @staticmethod
    async def create(
        db: AsyncSession,
        demand_type_id: uuid.UUID,
        section_id: uuid.UUID,
        data: ProjectDemandFormFieldCreate,
    ) -> ProjectDemandFormField:
        await ProjectDemandFormSectionService.get(db, demand_type_id, section_id)
        payload = data.model_dump()
        payload["field_key"] = _normalize_slug(payload["field_key"])
        item = ProjectDemandFormField(section_id=section_id, **payload)
        db.add(item)
        await db.commit()
        await db.refresh(item)
        return item

    @staticmethod
    async def update(
        db: AsyncSession,
        demand_type_id: uuid.UUID,
        section_id: uuid.UUID,
        field_id: uuid.UUID,
        data: ProjectDemandFormFieldUpdate,
    ) -> ProjectDemandFormField:
        item = await ProjectDemandFormFieldService.get(db, demand_type_id, section_id, field_id)
        payload = data.model_dump(exclude_unset=True)
        if payload.get("field_key"):
            payload["field_key"] = _normalize_slug(payload["field_key"])
        for key, value in payload.items():
            setattr(item, key, value)
        item.updated_at = datetime.utcnow()
        await db.commit()
        await db.refresh(item)
        return item

    @staticmethod
    async def reorder(
        db: AsyncSession,
        demand_type_id: uuid.UUID,
        section_id: uuid.UUID,
        items: list[dict],
    ) -> list[ProjectDemandFormField]:
        if not items:
            return await ProjectDemandFormFieldService.list(db, demand_type_id, section_id)
        ids = [i.get("id") for i in items if i.get("id")]
        if not ids:
            return await ProjectDemandFormFieldService.list(db, demand_type_id, section_id)
        result = await db.execute(
            select(ProjectDemandFormField).where(
                ProjectDemandFormField.section_id == section_id,
                ProjectDemandFormField.id.in_(ids),
            )
        )
        current = {str(x.id): x for x in result.scalars().all()}
        for item in items:
            sid = str(item.get("id"))
            if sid in current and item.get("order") is not None:
                current[sid].order = int(item["order"])
                current[sid].updated_at = datetime.utcnow()
        await db.commit()
        return await ProjectDemandFormFieldService.list(db, demand_type_id, section_id)

    @staticmethod
    async def delete(
        db: AsyncSession,
        demand_type_id: uuid.UUID,
        section_id: uuid.UUID,
        field_id: uuid.UUID,
    ) -> None:
        item = await ProjectDemandFormFieldService.get(db, demand_type_id, section_id, field_id)
        await db.delete(item)
        await db.commit()


class ProjectStatusService:
    @staticmethod
    async def list(
        db: AsyncSession,
        project_id: uuid.UUID,
        funnel_id: Optional[uuid.UUID] = None,
        active_only: bool = False,
    ) -> list[ProjectStatusConfig]:
        await ProjectService.get(db, project_id)
        filters = [ProjectStatusConfig.project_id == project_id]
        if funnel_id:
            filters.append(ProjectStatusConfig.funnel_id == funnel_id)
        if active_only:
            filters.append(ProjectStatusConfig.is_active == True)  # noqa: E712
        result = await db.execute(
            select(ProjectStatusConfig)
            .where(and_(*filters))
            .order_by(ProjectStatusConfig.order.asc(), ProjectStatusConfig.created_at.asc())
        )
        return list(result.scalars().all())

    @staticmethod
    def _normalize_role_ids(value):
        """JSONB não serializa UUID — converte para strings."""
        if value is None:
            return None
        return [str(x) for x in value]

    @staticmethod
    async def create(db: AsyncSession, project_id: uuid.UUID, data: ProjectStatusCreate) -> ProjectStatusConfig:
        await ProjectService.get(db, project_id)
        funnel = await ProjectFunnelService.get(db, project_id, data.funnel_id)
        if funnel.project_id != project_id:
            raise HTTPException(status_code=400, detail="Funil inválido para este projeto.")
        payload = data.model_dump()
        if "move_in_role_ids" in payload:
            payload["move_in_role_ids"] = ProjectStatusService._normalize_role_ids(payload["move_in_role_ids"])
        if "move_out_role_ids" in payload:
            payload["move_out_role_ids"] = ProjectStatusService._normalize_role_ids(payload["move_out_role_ids"])
        item = ProjectStatusConfig(project_id=project_id, **payload)
        db.add(item)
        try:
            await db.commit()
        except IntegrityError:
            await db.rollback()
            raise HTTPException(
                status_code=400,
                detail=f"Já existe uma etapa com o nome \"{data.name}\" neste funil.",
            )
        await db.refresh(item)
        return item

    @staticmethod
    async def update(
        db: AsyncSession,
        project_id: uuid.UUID,
        funnel_id: uuid.UUID,
        status_id: uuid.UUID,
        data: ProjectStatusUpdate,
    ) -> ProjectStatusConfig:
        result = await db.execute(
            select(ProjectStatusConfig).where(
                ProjectStatusConfig.id == status_id,
                ProjectStatusConfig.project_id == project_id,
                ProjectStatusConfig.funnel_id == funnel_id,
            )
        )
        item = result.scalar_one_or_none()
        if not item:
            raise HTTPException(status_code=404, detail="Coluna não encontrada.")
        payload = data.model_dump(exclude_unset=True)
        if "move_in_role_ids" in payload:
            payload["move_in_role_ids"] = ProjectStatusService._normalize_role_ids(payload["move_in_role_ids"])
        if "move_out_role_ids" in payload:
            payload["move_out_role_ids"] = ProjectStatusService._normalize_role_ids(payload["move_out_role_ids"])
        if "updates_origin_status_id" in payload and payload["updates_origin_status_id"]:
            origin_status_res = await db.execute(
                select(ProjectStatusConfig).where(
                    ProjectStatusConfig.id == payload["updates_origin_status_id"],
                    ProjectStatusConfig.project_id == project_id,
                )
            )
            if not origin_status_res.scalar_one_or_none():
                raise HTTPException(status_code=400, detail="Etapa de origem inválida para este projeto.")
        if payload.get("is_active") is False:
            has_tasks = await db.execute(
                select(ProjectTask.id).where(ProjectTask.status_id == status_id).limit(1)
            )
            if has_tasks.scalar_one_or_none():
                raise HTTPException(
                    status_code=400,
                    detail="Não é possível inativar uma coluna com tarefas vinculadas.",
                )
        for key, value in payload.items():
            setattr(item, key, value)
        item.updated_at = datetime.utcnow()
        await db.commit()
        await db.refresh(item)
        return item

    @staticmethod
    async def reorder(
        db: AsyncSession,
        project_id: uuid.UUID,
        funnel_id: uuid.UUID,
        items: list[dict],
    ) -> list[ProjectStatusConfig]:
        if not items:
            return await ProjectStatusService.list(db, project_id, funnel_id=funnel_id)
        ids = [i.get("id") for i in items if i.get("id")]
        if not ids:
            return await ProjectStatusService.list(db, project_id, funnel_id=funnel_id)
        result = await db.execute(
            select(ProjectStatusConfig).where(
                ProjectStatusConfig.project_id == project_id,
                ProjectStatusConfig.funnel_id == funnel_id,
                ProjectStatusConfig.id.in_(ids),
            )
        )
        current = {str(s.id): s for s in result.scalars().all()}
        for item in items:
            sid = str(item.get("id"))
            if sid in current and item.get("order") is not None:
                current[sid].order = int(item["order"])
                current[sid].updated_at = datetime.utcnow()
        await db.commit()
        return await ProjectStatusService.list(db, project_id, funnel_id=funnel_id)

    @staticmethod
    async def delete(db: AsyncSession, project_id: uuid.UUID, funnel_id: uuid.UUID, status_id: uuid.UUID) -> None:
        result = await db.execute(
            select(ProjectStatusConfig).where(
                ProjectStatusConfig.id == status_id,
                ProjectStatusConfig.project_id == project_id,
                ProjectStatusConfig.funnel_id == funnel_id,
            )
        )
        item = result.scalar_one_or_none()
        if not item:
            raise HTTPException(status_code=404, detail="Coluna não encontrada.")

        has_tasks = await db.execute(
            select(ProjectTask.id).where(ProjectTask.status_id == status_id).limit(1)
        )
        if has_tasks.scalar_one_or_none():
            raise HTTPException(
                status_code=400,
                detail="Não é possível excluir uma coluna com tarefas vinculadas.",
            )

        await db.delete(item)
        await db.commit()


class ProjectFunnelService:
    @staticmethod
    async def list(
        db: AsyncSession,
        project_id: uuid.UUID,
        active_only: bool = False,
        current_user: Optional[User] = None,
    ) -> list[ProjectFunnel]:
        await ProjectService.get(db, project_id)
        q = select(ProjectFunnel).where(ProjectFunnel.project_id == project_id)
        if active_only:
            q = q.where(ProjectFunnel.is_active == True)  # noqa: E712
        q = q.order_by(ProjectFunnel.order.asc(), ProjectFunnel.created_at.asc())
        result = await db.execute(q)
        funnels = list(result.scalars().all())
        # Esconde kanbans com acesso "none" para a função do usuário. Admins veem tudo.
        if (
            current_user is not None
            and current_user.role not in (UserRole.SUPER_ADMIN, UserRole.COMPANY_ADMIN)
            and current_user.role_id
        ):
            funnels = [
                f
                for f in funnels
                if ProjectFunnelService.access_level(f.access_control, current_user.role_id) != "none"
            ]
        return funnels

    @staticmethod
    async def get(db: AsyncSession, project_id: uuid.UUID, funnel_id: uuid.UUID) -> ProjectFunnel:
        result = await db.execute(
            select(ProjectFunnel).where(
                ProjectFunnel.id == funnel_id,
                ProjectFunnel.project_id == project_id,
            )
        )
        funnel = result.scalar_one_or_none()
        if not funnel:
            raise HTTPException(status_code=404, detail="Funil não encontrado.")
        return funnel

    # Níveis de acesso por função (cargo) a um kanban.
    ACCESS_LEVELS = ("manage", "view", "none")

    @staticmethod
    def _normalize_type_ids(value) -> Optional[list[str]]:
        """JSONB não serializa UUID — converte para strings."""
        if value is None:
            return None
        return [str(x) for x in value]

    @staticmethod
    def _normalize_access_control(value) -> Optional[dict]:
        """Mapa { role_id(str): nível }. Mantém só níveis válidos; descarta "manage"
        (é o padrão, não precisa persistir). None/{} = sem restrição."""
        if not value:
            return None
        clean = {
            str(k): v
            for k, v in value.items()
            if v in ProjectFunnelService.ACCESS_LEVELS and v != "manage"
        }
        return clean or None

    @staticmethod
    def access_level(access_control: Optional[dict], role_id) -> str:
        """Nível efetivo de uma função no kanban. Função ausente do mapa = "manage"."""
        if not access_control or not role_id:
            return "manage"
        return access_control.get(str(role_id)) or "manage"

    @staticmethod
    async def create(db: AsyncSession, project_id: uuid.UUID, data: ProjectFunnelCreate) -> ProjectFunnel:
        await ProjectService.get(db, project_id)
        payload = data.model_dump()
        if "allowed_demand_type_ids" in payload:
            payload["allowed_demand_type_ids"] = ProjectFunnelService._normalize_type_ids(payload["allowed_demand_type_ids"])
        if "access_control" in payload:
            payload["access_control"] = ProjectFunnelService._normalize_access_control(payload["access_control"])
        existing_default = await db.execute(
            select(ProjectFunnel).where(
                ProjectFunnel.project_id == project_id,
                ProjectFunnel.is_default == True,  # noqa: E712
            )
        )
        has_default = existing_default.scalar_one_or_none() is not None
        if not has_default:
            payload["is_default"] = True
        if payload.get("is_default"):
            existing = await db.execute(
                select(ProjectFunnel).where(
                    ProjectFunnel.project_id == project_id,
                    ProjectFunnel.is_default == True,  # noqa: E712
                )
            )
            for row in existing.scalars().all():
                row.is_default = False
        funnel = ProjectFunnel(project_id=project_id, **payload)
        db.add(funnel)
        await db.commit()
        await db.refresh(funnel)
        return funnel

    @staticmethod
    async def reorder(db: AsyncSession, project_id: uuid.UUID, items: list[dict]) -> list[ProjectFunnel]:
        if not items:
            return await ProjectFunnelService.list(db, project_id)
        ids = [i.get("id") for i in items if i.get("id")]
        if not ids:
            return await ProjectFunnelService.list(db, project_id)
        result = await db.execute(
            select(ProjectFunnel).where(
                ProjectFunnel.project_id == project_id,
                ProjectFunnel.id.in_(ids),
            )
        )
        current = {str(f.id): f for f in result.scalars().all()}
        for item in items:
            fid = str(item.get("id"))
            if fid in current and item.get("order") is not None:
                current[fid].order = int(item["order"])
                current[fid].updated_at = datetime.utcnow()
        await db.commit()
        return await ProjectFunnelService.list(db, project_id)

    @staticmethod
    async def update(
        db: AsyncSession,
        project_id: uuid.UUID,
        funnel_id: uuid.UUID,
        data: ProjectFunnelUpdate,
    ) -> ProjectFunnel:
        funnel = await ProjectFunnelService.get(db, project_id, funnel_id)
        payload = data.model_dump(exclude_unset=True)
        if "allowed_demand_type_ids" in payload:
            payload["allowed_demand_type_ids"] = ProjectFunnelService._normalize_type_ids(payload["allowed_demand_type_ids"])
        if "access_control" in payload:
            payload["access_control"] = ProjectFunnelService._normalize_access_control(payload["access_control"])
        if payload.get("is_default") is True:
            existing = await db.execute(
                select(ProjectFunnel).where(
                    ProjectFunnel.project_id == project_id,
                    ProjectFunnel.id != funnel_id,
                    ProjectFunnel.is_default == True,  # noqa: E712
                )
            )
            for row in existing.scalars().all():
                row.is_default = False
        for key, value in payload.items():
            setattr(funnel, key, value)
        funnel.updated_at = datetime.utcnow()
        await db.commit()
        await db.refresh(funnel)
        return funnel

    @staticmethod
    async def delete(db: AsyncSession, project_id: uuid.UUID, funnel_id: uuid.UUID) -> None:
        funnel = await ProjectFunnelService.get(db, project_id, funnel_id)
        # Só bloqueia se houver cards em alguma etapa deste kanban — não queremos
        # destruir cards silenciosamente. Colunas vazias são removidas em cascata.
        has_tasks = await db.execute(
            select(ProjectTask.id)
            .join(ProjectStatusConfig, ProjectStatusConfig.id == ProjectTask.status_id)
            .where(ProjectStatusConfig.funnel_id == funnel_id)
            .limit(1)
        )
        if has_tasks.scalar_one_or_none():
            raise HTTPException(
                status_code=400,
                detail="Há cards neste kanban. Mova ou exclua os cards antes de excluir o kanban.",
            )
        if funnel.is_default:
            replacement = await db.execute(
                select(ProjectFunnel).where(
                    ProjectFunnel.project_id == project_id,
                    ProjectFunnel.id != funnel_id,
                ).order_by(ProjectFunnel.order.asc(), ProjectFunnel.created_at.asc()).limit(1)
            )
            replacement_item = replacement.scalar_one_or_none()
            if replacement_item:
                replacement_item.is_default = True
                replacement_item.updated_at = datetime.utcnow()
        # Remoção via DB: o FK CASCADE de project_status_configs.funnel_id apaga as
        # etapas (e, em cascata, seus section_links e automações); moves_to_funnel_id
        # e demand_types.funnel_id ficam SET NULL. Usamos Core delete para evitar o
        # lazy-load do cascade ORM em contexto async.
        db.expunge(funnel)
        await db.execute(sa_delete(ProjectFunnel).where(ProjectFunnel.id == funnel_id))
        await db.commit()


class ProjectStatusSectionLinkService:
    @staticmethod
    async def list(db: AsyncSession, project_id: uuid.UUID, status_id: uuid.UUID) -> list[ProjectStatusSectionLink]:
        status_row = await db.execute(
            select(ProjectStatusConfig).where(
                ProjectStatusConfig.id == status_id,
                ProjectStatusConfig.project_id == project_id,
            )
        )
        if not status_row.scalar_one_or_none():
            raise HTTPException(status_code=404, detail="Coluna não encontrada.")
        result = await db.execute(
            select(ProjectStatusSectionLink).where(ProjectStatusSectionLink.status_id == status_id)
        )
        return list(result.scalars().all())

    @staticmethod
    async def upsert(
        db: AsyncSession,
        project_id: uuid.UUID,
        status_id: uuid.UUID,
        section_id: uuid.UUID,
        mode: str,
    ) -> ProjectStatusSectionLink:
        status_row = await db.execute(
            select(ProjectStatusConfig).where(
                ProjectStatusConfig.id == status_id,
                ProjectStatusConfig.project_id == project_id,
            )
        )
        if not status_row.scalar_one_or_none():
            raise HTTPException(status_code=404, detail="Coluna não encontrada.")
        section_row = await db.execute(select(ProjectDemandFormSection).where(ProjectDemandFormSection.id == section_id))
        section = section_row.scalar_one_or_none()
        if not section:
            raise HTTPException(status_code=404, detail="Sessão não encontrada.")
        existing = await db.execute(
            select(ProjectStatusSectionLink).where(
                ProjectStatusSectionLink.status_id == status_id,
                ProjectStatusSectionLink.section_id == section_id,
            )
        )
        item = existing.scalar_one_or_none()
        if item:
            item.mode = mode
            await db.commit()
            await db.refresh(item)
            return item
        item = ProjectStatusSectionLink(status_id=status_id, section_id=section_id, mode=mode)
        db.add(item)
        await db.commit()
        await db.refresh(item)
        return item

    @staticmethod
    async def delete(db: AsyncSession, project_id: uuid.UUID, status_id: uuid.UUID, link_id: uuid.UUID) -> None:
        status_row = await db.execute(
            select(ProjectStatusConfig).where(
                ProjectStatusConfig.id == status_id,
                ProjectStatusConfig.project_id == project_id,
            )
        )
        if not status_row.scalar_one_or_none():
            raise HTTPException(status_code=404, detail="Coluna não encontrada.")
        result = await db.execute(
            select(ProjectStatusSectionLink).where(
                ProjectStatusSectionLink.id == link_id,
                ProjectStatusSectionLink.status_id == status_id,
            )
        )
        item = result.scalar_one_or_none()
        if not item:
            raise HTTPException(status_code=404, detail="Vínculo não encontrado.")
        await db.delete(item)
        await db.commit()


class ProjectStatusDefaultFormLinkService:
    @staticmethod
    async def list(db: AsyncSession, project_id: uuid.UUID, status_id: uuid.UUID) -> list[ProjectStatusDefaultFormLink]:
        status_row = await db.execute(
            select(ProjectStatusConfig).where(
                ProjectStatusConfig.id == status_id,
                ProjectStatusConfig.project_id == project_id,
            )
        )
        if not status_row.scalar_one_or_none():
            raise HTTPException(status_code=404, detail="Coluna não encontrada.")
        result = await db.execute(
            select(ProjectStatusDefaultFormLink).where(ProjectStatusDefaultFormLink.status_id == status_id)
        )
        return list(result.scalars().all())

    @staticmethod
    async def upsert(
        db: AsyncSession,
        project_id: uuid.UUID,
        status_id: uuid.UUID,
        field_key: str,
        mode: str,
    ) -> ProjectStatusDefaultFormLink:
        status_row = await db.execute(
            select(ProjectStatusConfig).where(
                ProjectStatusConfig.id == status_id,
                ProjectStatusConfig.project_id == project_id,
            )
        )
        if not status_row.scalar_one_or_none():
            raise HTTPException(status_code=404, detail="Coluna não encontrada.")
        field_row = await db.execute(
            select(ProjectDefaultFormField).where(ProjectDefaultFormField.field_key == field_key)
        )
        if not field_row.scalar_one_or_none():
            raise HTTPException(status_code=404, detail="Campo do formulário padrão não encontrado.")
        existing = await db.execute(
            select(ProjectStatusDefaultFormLink).where(
                ProjectStatusDefaultFormLink.status_id == status_id,
                ProjectStatusDefaultFormLink.field_key == field_key,
            )
        )
        item = existing.scalar_one_or_none()
        if item:
            item.mode = mode
            await db.commit()
            await db.refresh(item)
            return item
        item = ProjectStatusDefaultFormLink(status_id=status_id, field_key=field_key, mode=mode)
        db.add(item)
        await db.commit()
        await db.refresh(item)
        return item

    @staticmethod
    async def delete(db: AsyncSession, project_id: uuid.UUID, status_id: uuid.UUID, link_id: uuid.UUID) -> None:
        status_row = await db.execute(
            select(ProjectStatusConfig).where(
                ProjectStatusConfig.id == status_id,
                ProjectStatusConfig.project_id == project_id,
            )
        )
        if not status_row.scalar_one_or_none():
            raise HTTPException(status_code=404, detail="Coluna não encontrada.")
        result = await db.execute(
            select(ProjectStatusDefaultFormLink).where(
                ProjectStatusDefaultFormLink.id == link_id,
                ProjectStatusDefaultFormLink.status_id == status_id,
            )
        )
        item = result.scalar_one_or_none()
        if not item:
            raise HTTPException(status_code=404, detail="Vínculo não encontrado.")
        await db.delete(item)
        await db.commit()


class ProjectDemandFormSubmissionService:
    @staticmethod
    async def get_by_task(db: AsyncSession, project_id: uuid.UUID, task_id: uuid.UUID) -> Optional[ProjectDemandFormSubmission]:
        await ProjectTaskService.get(db, project_id, task_id)
        result = await db.execute(select(ProjectDemandFormSubmission).where(ProjectDemandFormSubmission.task_id == task_id))
        return result.scalar_one_or_none()

    @staticmethod
    async def values_map_by_project(db: AsyncSession, project_id: uuid.UUID) -> dict[str, dict]:
        """Mapa { task_id: values } das submissões de todas as tarefas do projeto.
        Usado pelo quadro para renderizar campos personalizados nos cards sem N+1."""
        await ProjectService.get(db, project_id)
        result = await db.execute(
            select(ProjectDemandFormSubmission.task_id, ProjectDemandFormSubmission.values)
            .join(ProjectTask, ProjectTask.id == ProjectDemandFormSubmission.task_id)
            .where(ProjectTask.project_id == project_id)
        )
        return {str(task_id): (values or {}) for task_id, values in result.all()}

    @staticmethod
    async def upsert(
        db: AsyncSession,
        project_id: uuid.UUID,
        task_id: uuid.UUID,
        data: ProjectDemandFormSubmissionUpsert,
        updated_by: Optional[uuid.UUID],
    ) -> ProjectDemandFormSubmission:
        await ProjectTaskService.get(db, project_id, task_id)
        result = await db.execute(select(ProjectDemandFormSubmission).where(ProjectDemandFormSubmission.task_id == task_id))
        item = result.scalar_one_or_none()
        if item:
            item.values = data.values
            item.updated_by = updated_by
            item.updated_at = datetime.utcnow()
            await db.commit()
            await db.refresh(item)
            return item
        item = ProjectDemandFormSubmission(task_id=task_id, values=data.values, updated_by=updated_by)
        db.add(item)
        await db.commit()
        await db.refresh(item)
        return item


class ProjectTaskService:
    @staticmethod
    async def _is_forward_status_move(
        db: AsyncSession,
        from_status_id: uuid.UUID,
        to_status_id: uuid.UUID,
    ) -> bool:
        """True quando o card avança no fluxo (mesmo kanban: order maior; entre kanbans: order do funil)."""
        if from_status_id == to_status_id:
            return False
        from_st = await db.get(ProjectStatusConfig, from_status_id)
        to_st = await db.get(ProjectStatusConfig, to_status_id)
        if not from_st or not to_st:
            return True
        if from_st.funnel_id == to_st.funnel_id:
            return to_st.order > from_st.order
        from_f = await db.get(ProjectFunnel, from_st.funnel_id)
        to_f = await db.get(ProjectFunnel, to_st.funnel_id)
        if from_f and to_f:
            return to_f.order > from_f.order
        return True

    @staticmethod
    async def _validate_form_values_for_status(
        db: AsyncSession,
        demand_type_id: Optional[uuid.UUID],
        status_id: Optional[uuid.UUID],
        form_values: Optional[dict],
    ) -> None:
        if not demand_type_id or not status_id:
            return
        values = form_values or {}
        links_result = await db.execute(
            select(ProjectStatusSectionLink).where(
                ProjectStatusSectionLink.status_id == status_id,
                ProjectStatusSectionLink.mode == "required",
            )
        )
        required_section_ids = [link.section_id for link in links_result.scalars().all()]
        if not required_section_ids:
            return
        fields_result = await db.execute(
            select(ProjectDemandFormField)
            .join(ProjectDemandFormSection, ProjectDemandFormSection.id == ProjectDemandFormField.section_id)
            .where(
                ProjectDemandFormSection.demand_type_id == demand_type_id,
                ProjectDemandFormField.section_id.in_(required_section_ids),
                ProjectDemandFormField.is_required == True,  # noqa: E712
                ProjectDemandFormField.is_active == True,  # noqa: E712
            )
        )
        missing: list[str] = []
        for field in fields_result.scalars().all():
            value = values.get(field.field_key)
            if value in (None, "", []):
                missing.append(field.label)
        if missing:
            raise HTTPException(
                status_code=400,
                detail=f"Campos obrigatórios não preenchidos: {', '.join(missing)}",
            )

    @staticmethod
    async def _upsert_form_submission(
        db: AsyncSession,
        task_id: uuid.UUID,
        values: Optional[dict],
        updated_by: Optional[uuid.UUID],
    ) -> None:
        if values is None:
            return
        result = await db.execute(select(ProjectDemandFormSubmission).where(ProjectDemandFormSubmission.task_id == task_id))
        item = result.scalar_one_or_none()
        if item:
            item.values = values
            item.updated_by = updated_by
            item.updated_at = datetime.utcnow()
            return
        db.add(ProjectDemandFormSubmission(task_id=task_id, values=values, updated_by=updated_by))

    @staticmethod
    async def _validate_parent(
        db: AsyncSession,
        project_id: uuid.UUID,
        child_demand_type_id: Optional[uuid.UUID],
        parent_task_id: Optional[uuid.UUID],
        self_id: Optional[uuid.UUID],
    ) -> None:
        """Valida vínculo pai/filho: pai existe no projeto, tipo permitido e sem ciclo."""
        if parent_task_id is None:
            return
        if self_id is not None and parent_task_id == self_id:
            raise HTTPException(status_code=400, detail="Um card não pode ser pai de si mesmo.")
        parent_res = await db.execute(
            select(ProjectTask).where(
                ProjectTask.id == parent_task_id,
                ProjectTask.project_id == project_id,
            )
        )
        parent = parent_res.scalar_one_or_none()
        if parent is None:
            raise HTTPException(status_code=400, detail="Card pai não encontrado neste projeto.")
        # Regra de tipo: se o tipo do pai define filhos permitidos, o tipo do filho precisa estar na lista.
        if parent.demand_type_id:
            ptype_res = await db.execute(
                select(ProjectDemandType).where(ProjectDemandType.id == parent.demand_type_id)
            )
            ptype = ptype_res.scalar_one_or_none()
            allowed = (ptype.allowed_child_type_ids or []) if ptype else []
            if allowed:  # lista vazia/None = sem restrição (retrocompatível)
                allowed_str = {str(x) for x in allowed}
                if not child_demand_type_id or str(child_demand_type_id) not in allowed_str:
                    raise HTTPException(
                        status_code=400,
                        detail="Este tipo de card não é permitido como filho do tipo do card pai.",
                    )
        # Detecta ciclo (parent não pode ser descendente de self).
        if self_id is not None:
            cursor: Optional[uuid.UUID] = parent_task_id
            visited: set[uuid.UUID] = set()
            while cursor is not None:
                if cursor in visited:
                    break
                visited.add(cursor)
                if cursor == self_id:
                    raise HTTPException(
                        status_code=400,
                        detail="Hierarquia inválida: o card pai escolhido é descendente deste card.",
                    )
                nxt = await db.execute(
                    select(ProjectTask.parent_task_id).where(ProjectTask.id == cursor)
                )
                cursor = nxt.scalar_one_or_none()

    @staticmethod
    async def list_programs(db: AsyncSession, project_id: uuid.UUID) -> list[dict]:
        """Programas do cadastro próprio (ProjectProgram) ativos — para o seletor
        'vincular a um programa' na conversão."""
        rows = await db.execute(
            select(ProjectProgram.id, ProjectProgram.name)
            .where(ProjectProgram.is_active == True)  # noqa: E712
            .order_by(ProjectProgram.name.asc())
        )
        return [{"id": r[0], "name": r[1]} for r in rows.all()]

    @staticmethod
    async def _maybe_convert_on_status(
        db: AsyncSession,
        project_id: uuid.UUID,
        task: ProjectTask,
        status_obj: Optional[ProjectStatusConfig],
        conversion_title: Optional[str] = None,
        conversion_kind: Optional[str] = None,
        conversion_description: Optional[str] = None,
        conversion_items: Optional[list] = None,
        conversion_assigned_to: Optional[uuid.UUID] = None,
        conversion_program_id: Optional[uuid.UUID] = None,
    ) -> None:
        """Se a fase de destino dispara conversão, cria um novo card do tipo configurado
        vinculado à task de origem (origin_task_id). O nome vem de `conversion_title`.

        `conversion_kind` ('projeto' | 'programa') é apenas a classificação (planning_kind)
        do card — em ambos os casos cria UM único card (título + descrição + PO). Idempotente."""
        if not status_obj or not status_obj.creates_demand_type_id:
            return
        target_type_id = status_obj.creates_demand_type_id
        existing = await db.execute(
            select(ProjectTask.id).where(
                ProjectTask.origin_task_id == task.id,
                ProjectTask.demand_type_id == target_type_id,
            ).limit(1)
        )
        if existing.scalar_one_or_none():
            return  # já convertido
        ttype_res = await db.execute(
            select(ProjectDemandType).where(ProjectDemandType.id == target_type_id)
        )
        ttype = ttype_res.scalar_one_or_none()
        if not ttype:
            return
        if not ttype.funnel_id:
            raise HTTPException(
                status_code=400,
                detail=f"O tipo '{ttype.name}' precisa estar vinculado a um kanban para a conversão.",
            )
        init_res = await db.execute(
            select(ProjectStatusConfig)
            .where(
                ProjectStatusConfig.funnel_id == ttype.funnel_id,
                ProjectStatusConfig.is_active == True,  # noqa: E712
            )
            .order_by(ProjectStatusConfig.is_initial.desc(), ProjectStatusConfig.order.asc())
            .limit(1)
        )
        init_status = init_res.scalar_one_or_none()
        if not init_status:
            raise HTTPException(
                status_code=400,
                detail=f"O kanban do tipo '{ttype.name}' não tem etapa inicial para receber a conversão.",
            )
        new_title = (conversion_title or "").strip() or task.title
        kind = (conversion_kind or "projeto")
        # PO responsável escolhido na aprovação; se não informado, herda o da origem.
        assignee = conversion_assigned_to or task.assigned_to
        # Herança da solicitação do card de origem: respostas do formulário de demanda
        # (ProjectDemandFormSubmission.values). Os campos padrão (diretoria/área/datas)
        # são colunas e são herdados direto na construção dos cards abaixo.
        origin_values = (await db.execute(
            select(ProjectDemandFormSubmission.values).where(
                ProjectDemandFormSubmission.task_id == task.id
            )
        )).scalar_one_or_none()
        main = ProjectTask(
            project_id=project_id,
            status_id=init_status.id,
            demand_type_id=ttype.id,
            title=new_title[:200],
            description=(conversion_description if conversion_description is not None else task.description),
            assigned_to=assignee,
            diretoria=task.diretoria,
            area=task.area,
            start_date=task.start_date,
            due_date=task.due_date,
            created_by=task.created_by,
            origin_task_id=task.id,
            planning_kind=kind,
            # Vínculo (etiqueta) a um programa do cadastro, se escolhido na conversão.
            linked_program_id=conversion_program_id,
        )
        db.add(main)
        # 'projeto' e 'programa' são apenas classificações do card: a conversão cria UM
        # único card (sem cards filhos/extras).
        children: list[ProjectTask] = []
        # Um único flush resolve os ids de main e filhos para vincular hierarquia + submissions.
        await db.flush()
        for child in children:
            child.parent_task_id = main.id
        # Herda TODAS as respostas da solicitação do pai para o card principal e os filhos.
        if origin_values:
            for t in (main, *children):
                db.add(ProjectDemandFormSubmission(
                    task_id=t.id,
                    values=dict(origin_values),
                    updated_by=task.created_by,
                ))

    @staticmethod
    def _sla_initial(status_obj: Optional[ProjectStatusConfig]) -> str:
        """Estado de SLA ao entrar numa etapa: 'ok' se a etapa tem SLA, senão 'none'."""
        if status_obj is not None and status_obj.sla_hours:
            return "ok"
        return "none"

    @staticmethod
    def _role_allowed_for_move_list(
        current_user: Optional[User],
        role_ids: list,
    ) -> bool:
        if current_user is None:
            return True
        if current_user.role in (UserRole.SUPER_ADMIN, UserRole.COMPANY_ADMIN):
            return True
        if not role_ids:
            return True
        if not current_user.role_id:
            return True
        return str(current_user.role_id) in {str(x) for x in role_ids}

    @staticmethod
    def _check_move_permission(status_obj: Optional[ProjectStatusConfig], current_user: Optional[User]) -> None:
        """Bloqueia se a função do usuário não pode mover o card PARA esta etapa (destino)."""
        if status_obj is None or current_user is None:
            return
        allowed = status_obj.move_in_role_ids or []
        if not allowed:
            return
        if ProjectTaskService._role_allowed_for_move_list(current_user, allowed):
            return
        raise HTTPException(
            status_code=403,
            detail="Sua função não tem permissão para mover o card para esta etapa.",
        )

    @staticmethod
    def _check_move_out_permission(status_obj: Optional[ProjectStatusConfig], current_user: Optional[User]) -> None:
        """Bloqueia se a função do usuário não pode mover cards que ESTÃO nesta etapa (origem)."""
        if status_obj is None or current_user is None:
            return
        allowed = status_obj.move_out_role_ids or []
        if not allowed:
            return
        if ProjectTaskService._role_allowed_for_move_list(current_user, allowed):
            return
        raise HTTPException(
            status_code=403,
            detail="Sua função não tem permissão para mover cards desta etapa.",
        )

    @staticmethod
    async def _funnel_access(
        db: AsyncSession, funnel_id: Optional[uuid.UUID], current_user: Optional[User]
    ) -> str:
        """Nível de acesso da função do usuário ao kanban: manage | view | none.
        Sem usuário (ações internas) ou admin = "manage"."""
        if current_user is None or funnel_id is None:
            return "manage"
        if current_user.role in (UserRole.SUPER_ADMIN, UserRole.COMPANY_ADMIN):
            return "manage"
        if not current_user.role_id:
            return "manage"
        row = await db.execute(
            select(ProjectFunnel.access_control).where(ProjectFunnel.id == funnel_id)
        )
        return ProjectFunnelService.access_level(row.scalar_one_or_none(), current_user.role_id)

    @staticmethod
    async def _person_id_for_user(db: AsyncSession, user_id: uuid.UUID) -> Optional[uuid.UUID]:
        from app.modules.teamops.models import Person
        res = await db.execute(select(Person.id).where(Person.user_id == user_id))
        return res.scalar_one_or_none()

    @staticmethod
    async def _is_task_assignee(
        db: AsyncSession,
        current_user: Optional[User],
        task: Optional[ProjectTask],
    ) -> bool:
        if not current_user or not task or not task.assigned_to:
            return False
        person_id = await ProjectTaskService._person_id_for_user(db, current_user.id)
        return person_id is not None and task.assigned_to == person_id

    @staticmethod
    def _role_can_work_in_status(
        current_user: Optional[User],
        status_obj: Optional[ProjectStatusConfig],
    ) -> bool:
        """Função autorizada a editar cards nesta etapa (move_in e/ou move_out configurados)."""
        if not status_obj or not current_user:
            return False
        if current_user.role in (UserRole.SUPER_ADMIN, UserRole.COMPANY_ADMIN):
            return True
        move_in = status_obj.move_in_role_ids or []
        move_out = status_obj.move_out_role_ids or []
        if not move_in and not move_out:
            return False
        in_ok = not move_in or ProjectTaskService._role_allowed_for_move_list(current_user, move_in)
        out_ok = not move_out or ProjectTaskService._role_allowed_for_move_list(current_user, move_out)
        return in_ok and out_ok

    @staticmethod
    async def _check_funnel_writable(
        db: AsyncSession,
        funnel_id: Optional[uuid.UUID],
        current_user: Optional[User],
        *,
        task: Optional[ProjectTask] = None,
        status_id: Optional[uuid.UUID] = None,
    ) -> None:
        """Bloqueia escrita num kanban view/none — exceto responsável ou função autorizada na etapa."""
        level = await ProjectTaskService._funnel_access(db, funnel_id, current_user)
        if level == "manage":
            return
        if level == "none":
            raise HTTPException(
                status_code=403,
                detail="Você não tem acesso a este kanban.",
            )
        if task and await ProjectTaskService._is_task_assignee(db, current_user, task):
            return
        sid = status_id or (task.status_id if task else None)
        if sid:
            status_obj = await db.get(ProjectStatusConfig, sid)
            if status_obj and ProjectTaskService._role_can_work_in_status(current_user, status_obj):
                return
        raise HTTPException(
            status_code=403,
            detail="Você só pode visualizar este kanban — sem permissão para gerenciar os cards.",
        )

    @staticmethod
    async def _check_funnel_access_for_move(
        db: AsyncSession,
        source_status: ProjectStatusConfig,
        target_status: ProjectStatusConfig,
        current_user: Optional[User],
        task: Optional[ProjectTask],
    ) -> None:
        """Kanban 'view' ainda permite mover se move_out/move_in da etapa autorizam a função."""
        if current_user is None:
            return
        for st in (source_status, target_status):
            level = await ProjectTaskService._funnel_access(db, st.funnel_id, current_user)
            if level == "none":
                raise HTTPException(
                    status_code=403,
                    detail="Você não tem acesso a este kanban.",
                )
        if task and await ProjectTaskService._is_task_assignee(db, current_user, task):
            return
        src_level = await ProjectTaskService._funnel_access(db, source_status.funnel_id, current_user)
        tgt_level = await ProjectTaskService._funnel_access(db, target_status.funnel_id, current_user)
        if src_level == "manage" and tgt_level == "manage":
            return
        # view (parcial ou total): move_in/move_out já validados pelo chamador.

    @staticmethod
    async def _funnel_id_of_status(db: AsyncSession, status_id: Optional[uuid.UUID]) -> Optional[uuid.UUID]:
        if status_id is None:
            return None
        row = await db.execute(
            select(ProjectStatusConfig.funnel_id).where(ProjectStatusConfig.id == status_id)
        )
        return row.scalar_one_or_none()

    @staticmethod
    def _is_user_story_type(slug: Optional[str], name: Optional[str]) -> bool:
        s = (slug or "").strip().lower()
        n = (name or "").strip().lower()
        if s in ("us", "user_story", "user-story", "historia", "história"):
            return True
        return (
            n == "us"
            or "user story" in n
            or "história" in n
            or "historia" in n
        )

    @staticmethod
    def _normalize_us_checklist(raw) -> list[dict]:
        if not raw:
            return []
        items: list[dict] = []
        for i, item in enumerate(raw):
            if not isinstance(item, dict):
                continue
            label = str(item.get("label") or "").strip()
            if not label:
                continue
            item_id = str(item.get("id") or uuid.uuid4())
            items.append({
                "id": item_id,
                "label": label[:300],
                "done": bool(item.get("done")),
                "order": int(item.get("order", i)),
            })
        items.sort(key=lambda x: x["order"])
        for idx, it in enumerate(items):
            it["order"] = idx
        return items

    @staticmethod
    def _percent_from_us_checklist(items: list) -> Optional[int]:
        if not items:
            return 0
        done = sum(1 for x in items if x.get("done"))
        return round(done * 100 / len(items))

    @staticmethod
    async def _is_user_story_task(db: AsyncSession, task: ProjectTask) -> bool:
        if not task.demand_type_id:
            return False
        row = await db.execute(
            select(ProjectDemandType.slug, ProjectDemandType.name).where(
                ProjectDemandType.id == task.demand_type_id,
            )
        )
        dt = row.one_or_none()
        if not dt:
            return False
        return ProjectTaskService._is_user_story_type(dt.slug, dt.name)

    @staticmethod
    def _is_user_story_funnel_name(name: Optional[str]) -> bool:
        if not name or not str(name).strip():
            return False
        n = str(name).lower()
        if "feature" in n:
            return False
        return bool(re.search(r"\bus\b|user story|user-story|hist[oó]ria", n))

    @staticmethod
    async def _can_use_us_checklist(db: AsyncSession, task: ProjectTask) -> bool:
        if await ProjectTaskService._is_user_story_task(db, task):
            return True
        funnel_id = await ProjectTaskService._funnel_id_of_status(db, task.status_id)
        if not funnel_id:
            return False
        row = await db.execute(
            select(ProjectFunnel.name).where(ProjectFunnel.id == funnel_id)
        )
        funnel_name = row.scalar_one_or_none()
        return ProjectTaskService._is_user_story_funnel_name(funnel_name)

    @staticmethod
    def _is_feature_or_us_funnel_name(name: Optional[str]) -> bool:
        if not name or not str(name).strip():
            return False
        n = str(name).lower()
        return "feature" in n or ProjectTaskService._is_user_story_funnel_name(name)

    @staticmethod
    async def _check_assignee_for_feature_us_kanban_move(
        db: AsyncSession,
        source_status: Optional[ProjectStatusConfig],
        task: ProjectTask,
        payload: dict,
    ) -> None:
        """No kanban de Feature/US, cards sem responsável não podem mudar de etapa."""
        if not source_status:
            return
        funnel_row = await db.execute(
            select(ProjectFunnel.name).where(ProjectFunnel.id == source_status.funnel_id)
        )
        funnel_name = funnel_row.scalar_one_or_none()
        if not ProjectTaskService._is_feature_or_us_funnel_name(funnel_name):
            return
        effective = payload.get("assigned_to") if "assigned_to" in payload else task.assigned_to
        if not effective:
            raise HTTPException(
                status_code=400,
                detail="Defina um responsável no card antes de movê-lo no kanban de Feature ou User Story.",
            )

    @staticmethod
    async def _validate_type_allowed_in_funnel(
        db: AsyncSession,
        funnel_id: uuid.UUID,
        demand_type_id: Optional[uuid.UUID],
    ) -> None:
        """Se o kanban define tipos permitidos, o tipo do card precisa estar na lista.
        Lista None/vazia = sem restrição (retrocompatível)."""
        if demand_type_id is None:
            return
        fn = await db.execute(select(ProjectFunnel).where(ProjectFunnel.id == funnel_id))
        funnel = fn.scalar_one_or_none()
        allowed = (funnel.allowed_demand_type_ids or []) if funnel else []
        if allowed and str(demand_type_id) not in {str(x) for x in allowed}:
            raise HTTPException(
                status_code=400,
                detail="Este tipo de card não é permitido neste kanban.",
            )

    # ------------------------------------------------------------------
    # Reconcile Feature ← User Stories
    # A cada mudança de status de uma US, a Feature-pai é reconciliada a partir do
    # agregado das suas US filhas: a coluna-alvo é decidida por precedência e a Feature
    # é movida (respeitando as travas de governança), além do selo de impedimento.
    # ------------------------------------------------------------------
    @staticmethod
    def _norm_col(name: Optional[str]) -> str:
        """lower + remove acentos, para casar nomes de coluna entre os dois kanbans."""
        import unicodedata
        if not name:
            return ""
        s = str(name).strip().lower()
        return "".join(
            c for c in unicodedata.normalize("NFD", s) if unicodedata.category(c) != "Mn"
        )

    @staticmethod
    async def _is_feature_task(
        db: AsyncSession, task: ProjectTask, funnel_name: Optional[str] = None
    ) -> bool:
        """Reconhece um card 'Feature' por tipo de demanda ou pelo nome do funil."""
        if task.demand_type_id:
            row = await db.execute(
                select(ProjectDemandType.slug, ProjectDemandType.name).where(
                    ProjectDemandType.id == task.demand_type_id,
                )
            )
            dt = row.one_or_none()
            if dt and "feature" in f"{dt.slug or ''} {dt.name or ''}".lower():
                return True
        if funnel_name is None:
            fid = await ProjectTaskService._funnel_id_of_status(db, task.status_id)
            if fid:
                r = await db.execute(select(ProjectFunnel.name).where(ProjectFunnel.id == fid))
                funnel_name = r.scalar_one_or_none()
        return "feature" in (funnel_name or "").lower()

    @staticmethod
    async def _us_children(db: AsyncSession, feature_id: uuid.UUID) -> list[ProjectTask]:
        """US filhas de uma Feature (ignora sub-tarefas de cronograma sem demand_type)."""
        res = await db.execute(
            select(ProjectTask).where(ProjectTask.parent_task_id == feature_id)
        )
        out: list[ProjectTask] = []
        for child in res.scalars().all():
            if await ProjectTaskService._is_user_story_task(db, child):
                out.append(child)
        return out

    @staticmethod
    async def _statuses_by_id(
        db: AsyncSession, ids: list[uuid.UUID]
    ) -> dict[uuid.UUID, ProjectStatusConfig]:
        uniq = list({i for i in ids if i is not None})
        if not uniq:
            return {}
        res = await db.execute(
            select(ProjectStatusConfig).where(ProjectStatusConfig.id.in_(uniq))
        )
        return {s.id: s for s in res.scalars().all()}

    @staticmethod
    async def _funnel_statuses(
        db: AsyncSession, funnel_id: Optional[uuid.UUID]
    ) -> list[ProjectStatusConfig]:
        if not funnel_id:
            return []
        res = await db.execute(
            select(ProjectStatusConfig)
            .where(
                ProjectStatusConfig.funnel_id == funnel_id,
                ProjectStatusConfig.is_active == True,  # noqa: E712
            )
            .order_by(ProjectStatusConfig.order.asc())
        )
        return list(res.scalars().all())

    @staticmethod
    def _feature_target_status(
        feature_cols: list[ProjectStatusConfig],
        us_statuses: list[ProjectStatusConfig],
    ) -> Optional[ProjectStatusConfig]:
        """Decide a coluna-alvo da Feature a partir do agregado das US (precedência).
        Retorna None quando nenhuma regra casa ou a coluna correspondente não existe."""
        if not us_statuses or not feature_cols:
            return None
        N = lambda s: ProjectTaskService._norm_col(getattr(s, "name", None))

        def col(pred):
            for c in feature_cols:
                if pred(c):
                    return c
            return None

        def col_last(pred):
            found = None
            for c in feature_cols:
                if pred(c):
                    found = c
            return found

        is_final = lambda s: bool(getattr(s, "is_final", False))
        is_initial = lambda s: bool(getattr(s, "is_initial", False))
        has_concluido = lambda s: "conclu" in N(s)
        has_ajustar = lambda s: "ajustar" in N(s)
        has_homolog = lambda s: "homolog" in N(s)
        has_dev = lambda s: "desenvolvimento" in N(s)
        # "Concluída" no sentido de negócio: coluna final OU nomeada "Concluído". Isso torna
        # a regra robusta a funis onde o nome e a flag is_final não estão perfeitamente alinhados.
        is_done = lambda s: is_final(s) or has_concluido(s)

        # 1. todas as US Concluídas → Feature Concluída.
        # Alvo por NOME primeiro ("Concluído"); só então cai para is_final. Usa-se a ÚLTIMA
        # coluna is_final (maior order) para não casar por engano uma etapa intermediária
        # marcada is_final indevidamente (ex.: "Em Desenvolvimento" com is_final=true).
        if all(is_done(s) for s in us_statuses):
            return col(has_concluido) or col_last(is_final)
        # 2. alguma US em Ajustar (retrabalho) → Feature em Ajustar
        if any(has_ajustar(s) for s in us_statuses):
            return col(has_ajustar)
        # 3. todas as US em Homologação → Feature em Homologação
        if all(has_homolog(s) for s in us_statuses):
            return col(has_homolog)
        # 4. alguma US fora do backlog → Feature em Desenvolvimento
        if any(not is_initial(s) for s in us_statuses):
            return col(has_dev)
        # 5. todas as US no backlog → Feature no backlog
        if all(is_initial(s) for s in us_statuses):
            return col(is_initial)
        return None

    @staticmethod
    async def _maybe_reconcile_parent_feature(
        db: AsyncSession,
        project_id: uuid.UUID,
        us_task: ProjectTask,
        current_user: Optional[User],
    ) -> None:
        """Reconcilia a Feature-pai a partir do agregado das US filhas (movimento + selo
        de impedimento). Respeita as travas de governança; se alguma barrar, apenas
        registra em log e mantém a Feature onde está — sem nunca desfazer o move da US."""
        if not us_task.parent_task_id:
            return
        if not await ProjectTaskService._is_user_story_task(db, us_task):
            return
        feature = await db.get(ProjectTask, us_task.parent_task_id)
        if feature is None or feature.project_id != project_id:
            return
        feature_funnel_id = await ProjectTaskService._funnel_id_of_status(db, feature.status_id)
        feature_funnel_name = None
        if feature_funnel_id:
            row = await db.execute(
                select(ProjectFunnel.name).where(ProjectFunnel.id == feature_funnel_id)
            )
            feature_funnel_name = row.scalar_one_or_none()
        if not await ProjectTaskService._is_feature_task(db, feature, feature_funnel_name):
            return

        us_children = await ProjectTaskService._us_children(db, feature.id)
        if not us_children:
            return
        status_map = await ProjectTaskService._statuses_by_id(
            db, [c.status_id for c in us_children]
        )
        us_statuses = [status_map[c.status_id] for c in us_children if c.status_id in status_map]
        if not us_statuses:
            return

        # (a) selos informativos — sempre recalculados (independem de mover a Feature).
        imped = any(
            "impediment" in ProjectTaskService._norm_col(s.name) for s in us_statuses
        )
        codereview = any(
            "code review" in ProjectTaskService._norm_col(s.name) for s in us_statuses
        )
        if bool(feature.us_impediment_active) != imped:
            feature.us_impediment_active = imped
            feature.updated_at = datetime.utcnow()
        if bool(feature.us_codereview_active) != codereview:
            feature.us_codereview_active = codereview
            feature.updated_at = datetime.utcnow()

        # (b) movimento da Feature.
        feature_cols = await ProjectTaskService._funnel_statuses(db, feature_funnel_id)
        target = ProjectTaskService._feature_target_status(feature_cols, us_statuses)
        if target is None or target.id == feature.status_id:
            return

        source_status = await db.get(ProjectStatusConfig, feature.status_id)
        try:
            ProjectTaskService._check_move_out_permission(source_status, current_user)
            ProjectTaskService._check_move_permission(target, current_user)
            if source_status is not None:
                await ProjectTaskService._check_funnel_access_for_move(
                    db, source_status, target, current_user, feature
                )
            await ProjectTaskService._check_assignee_for_feature_us_kanban_move(
                db, source_status, feature, {}
            )
            # Campos obrigatórios da etapa de origem só valem ao AVANÇAR de raia.
            if await ProjectTaskService._is_forward_status_move(
                db, feature.status_id, target.id
            ):
                sub_row = await db.execute(
                    select(ProjectDemandFormSubmission).where(
                        ProjectDemandFormSubmission.task_id == feature.id
                    )
                )
                sub = sub_row.scalar_one_or_none()
                await ProjectTaskService._validate_form_values_for_status(
                    db,
                    demand_type_id=feature.demand_type_id,
                    status_id=feature.status_id,
                    form_values=(sub.values if sub else None) or {},
                )
        except HTTPException as exc:
            logger.info(
                "reconcile Feature %s: movimento para '%s' barrado por trava (%s); "
                "mantendo etapa atual",
                feature.id,
                getattr(target, "name", "?"),
                getattr(exc, "detail", exc),
            )
            return

        # Aplica o movimento espelhando o mini-bloco de entrada, SEM re-invocar o pipeline
        # completo (evita loop de volta nas US), no padrão de _maybe_move_to_funnel.
        feature.status_id = target.id
        feature.completed_at = datetime.utcnow() if target.is_final else None
        feature.status_entered_at = datetime.utcnow()
        feature.sla_state = ProjectTaskService._sla_initial(target)
        feature.updated_at = datetime.utcnow()

    @staticmethod
    async def _maybe_move_to_funnel(
        db: AsyncSession,
        project_id: uuid.UUID,
        task: ProjectTask,
        status_obj: Optional[ProjectStatusConfig],
    ) -> None:
        """Se a fase de destino aponta para outro kanban, transita o MESMO card para a
        etapa inicial desse kanban (mantém identidade/histórico)."""
        if not status_obj or not status_obj.moves_to_funnel_id:
            return
        target_funnel_id = status_obj.moves_to_funnel_id
        if status_obj.funnel_id == target_funnel_id:
            return  # já está no kanban destino
        init_res = await db.execute(
            select(ProjectStatusConfig)
            .where(
                ProjectStatusConfig.funnel_id == target_funnel_id,
                ProjectStatusConfig.is_active == True,  # noqa: E712
            )
            .order_by(ProjectStatusConfig.is_initial.desc(), ProjectStatusConfig.order.asc())
            .limit(1)
        )
        init_status = init_res.scalar_one_or_none()
        if not init_status:
            raise HTTPException(
                status_code=400,
                detail="O kanban de destino não tem etapa inicial para receber o card.",
            )
        task.status_id = init_status.id
        task.completed_at = None  # card continua ativo no novo kanban
        task.status_entered_at = datetime.utcnow()
        task.sla_state = ProjectTaskService._sla_initial(init_status)

        # Cascata: se a etapa estiver configurada, leva os DESCENDENTES (etapas do
        # cronograma) junto para a etapa inicial do mesmo kanban de destino.
        if getattr(status_obj, "cascade_children_on_move", False):
            await ProjectTaskService._cascade_children_to_status(db, task.id, init_status)

    @staticmethod
    async def _cascade_children_to_status(
        db: AsyncSession, root_id: uuid.UUID, init_status: ProjectStatusConfig
    ) -> None:
        """Move todos os descendentes (filhos, netos…) para `init_status` (kanban destino).
        Usado quando o pai transita de kanban e a etapa pede para levar os filhos junto."""
        visited: set[uuid.UUID] = set()
        frontier: list[uuid.UUID] = [root_id]
        now = datetime.utcnow()
        sla = ProjectTaskService._sla_initial(init_status)
        while frontier:
            res = await db.execute(
                select(ProjectTask).where(ProjectTask.parent_task_id.in_(frontier))
            )
            children = list(res.scalars().all())
            next_frontier: list[uuid.UUID] = []
            for child in children:
                if child.id in visited:
                    continue
                visited.add(child.id)
                next_frontier.append(child.id)
                if child.status_id != init_status.id:
                    child.status_id = init_status.id
                    child.completed_at = None
                    child.status_entered_at = now
                    child.sla_state = sla
                    child.updated_at = now
            frontier = next_frontier

    @staticmethod
    async def _cascade_children_split(
        db: AsyncSession,
        root_id: uuid.UUID,
        level1_status: ProjectStatusConfig,
        deeper_status: ProjectStatusConfig,
    ) -> None:
        """Move os FILHOS diretos para `level1_status` e os NETOS/descendentes mais
        profundos para `deeper_status`. Quando `deeper_status is level1_status`, equivale
        ao comportamento antigo (todos os descendentes no mesmo kanban)."""
        visited: set[uuid.UUID] = set()
        frontier: list[uuid.UUID] = [root_id]
        depth = 0
        now = datetime.utcnow()
        while frontier:
            depth += 1
            target = level1_status if depth == 1 else deeper_status
            sla = ProjectTaskService._sla_initial(target)
            res = await db.execute(
                select(ProjectTask).where(ProjectTask.parent_task_id.in_(frontier))
            )
            next_frontier: list[uuid.UUID] = []
            for child in res.scalars().all():
                if child.id in visited:
                    continue
                visited.add(child.id)
                next_frontier.append(child.id)
                if child.status_id != target.id:
                    child.status_id = target.id
                    child.completed_at = None
                    child.status_entered_at = now
                    child.sla_state = sla
                    child.updated_at = now
            frontier = next_frontier

    @staticmethod
    async def _initial_status_of_funnel(
        db: AsyncSession, funnel_id: uuid.UUID
    ) -> ProjectStatusConfig:
        """Etapa inicial (ativa) de um funil destino. Levanta 400 se não houver."""
        res = await db.execute(
            select(ProjectStatusConfig)
            .where(
                ProjectStatusConfig.funnel_id == funnel_id,
                ProjectStatusConfig.is_active == True,  # noqa: E712
            )
            .order_by(ProjectStatusConfig.is_initial.desc(), ProjectStatusConfig.order.asc())
            .limit(1)
        )
        status = res.scalar_one_or_none()
        if not status:
            raise HTTPException(
                status_code=400,
                detail="O kanban de destino das tarefas não tem etapa inicial.",
            )
        return status

    @staticmethod
    async def _maybe_send_children_to_funnel(
        db: AsyncSession,
        project_id: uuid.UUID,
        task: ProjectTask,
        status_obj: Optional[ProjectStatusConfig],
    ) -> None:
        """Se a etapa define `children_to_funnel_id`, envia os FILHOS (tarefas do cronograma)
        para a etapa inicial desse kanban. O card atual (projeto) PERMANECE onde está —
        usado para mandar as tarefas ao Desenvolvimento como cards visíveis.

        Se também define `grandchildren_to_funnel_id`, os NETOS (e descendentes mais
        profundos) descem mais um nível, para a etapa inicial desse outro kanban."""
        target_funnel_id = getattr(status_obj, "children_to_funnel_id", None) if status_obj else None
        if not target_funnel_id:
            return
        init_status = await ProjectTaskService._initial_status_of_funnel(db, target_funnel_id)
        deeper_status = init_status
        grand_funnel_id = getattr(status_obj, "grandchildren_to_funnel_id", None) if status_obj else None
        if grand_funnel_id and grand_funnel_id != target_funnel_id:
            deeper_status = await ProjectTaskService._initial_status_of_funnel(db, grand_funnel_id)
        await ProjectTaskService._cascade_children_split(db, task.id, init_status, deeper_status)

    @staticmethod
    async def _maybe_update_origin_on_status(
        db: AsyncSession,
        project_id: uuid.UUID,
        task: ProjectTask,
        status_obj: Optional[ProjectStatusConfig],
    ) -> None:
        """Se a fase de destino define updates_origin_status_id, move o card de origem
        (origin_task_id) para essa etapa. Ação interna: sem automações/conversão."""
        if not status_obj or not status_obj.updates_origin_status_id:
            return
        if not task.origin_task_id:
            return
        target_status_id = status_obj.updates_origin_status_id
        origin_res = await db.execute(
            select(ProjectTask).where(
                ProjectTask.id == task.origin_task_id,
                ProjectTask.project_id == project_id,
            )
        )
        origin = origin_res.scalar_one_or_none()
        if not origin or origin.status_id == target_status_id:
            return
        target_res = await db.execute(
            select(ProjectStatusConfig).where(
                ProjectStatusConfig.id == target_status_id,
                ProjectStatusConfig.project_id == project_id,
                ProjectStatusConfig.is_active == True,  # noqa: E712
            )
        )
        target_origin_status = target_res.scalar_one_or_none()
        if not target_origin_status:
            return
        origin.status_id = target_status_id
        origin.status_entered_at = datetime.utcnow()
        origin.sla_state = ProjectTaskService._sla_initial(target_origin_status)
        if target_origin_status.is_final:
            origin.completed_at = datetime.utcnow()
        else:
            origin.completed_at = None
        origin.updated_at = datetime.utcnow()

    @staticmethod
    async def list_children(db: AsyncSession, project_id: uuid.UUID, task_id: uuid.UUID) -> list[ProjectTask]:
        await ProjectTaskService.get(db, project_id, task_id)
        result = await db.execute(
            select(ProjectTask)
            .where(ProjectTask.parent_task_id == task_id)
            .options(selectinload(ProjectTask.status), selectinload(ProjectTask.demand_type))
            .order_by(ProjectTask.order.asc(), ProjectTask.created_at.asc())
        )
        return list(result.scalars().all())

    @staticmethod
    async def list(
        db: AsyncSession,
        project_id: uuid.UUID,
        status_id: Optional[uuid.UUID] = None,
        assigned_to: Optional[uuid.UUID] = None,
    ) -> list[ProjectTask]:
        await ProjectService.get(db, project_id)
        filters = [ProjectTask.project_id == project_id]
        if status_id:
            filters.append(ProjectTask.status_id == status_id)
        if assigned_to:
            filters.append(ProjectTask.assigned_to == assigned_to)
        result = await db.execute(
            select(ProjectTask)
            .where(and_(*filters))
            .order_by(ProjectTask.order.asc(), ProjectTask.created_at.asc())
        )
        return list(result.scalars().all())

    @staticmethod
    async def list_planning_nodes(db: AsyncSession, project_id: uuid.UUID) -> list[ProjectTask]:
        """Nós de planejamento (Projeto/Programa) do projeto — destino da importação de Features/US."""
        await ProjectService.get(db, project_id)
        result = await db.execute(
            select(ProjectTask)
            .where(ProjectTask.project_id == project_id, ProjectTask.planning_kind.isnot(None))
            .order_by(ProjectTask.planning_kind.desc(), ProjectTask.title.asc())
        )
        return list(result.scalars().all())

    @staticmethod
    async def list_for_user(
        db: AsyncSession,
        user_id: uuid.UUID,
        basic_only_available: bool = False,
    ) -> list[ProjectTask]:
        q = (
            select(ProjectTask)
            .where(ProjectTask.created_by == user_id)
            .options(
                selectinload(ProjectTask.project),
                selectinload(ProjectTask.status),
                selectinload(ProjectTask.demand_type),
            )
        )
        # Usuário basic não enxerga demandas cujo tipo está indisponível para basic.
        if basic_only_available:
            q = q.outerjoin(ProjectDemandType, ProjectDemandType.id == ProjectTask.demand_type_id).where(
                or_(
                    ProjectTask.demand_type_id.is_(None),
                    ProjectDemandType.available_for_basic.is_(True),
                )
            )
        q = q.order_by(ProjectTask.created_at.desc())
        result = await db.execute(q)
        return list(result.scalars().all())

    @staticmethod
    async def _load_project_funnels(db: AsyncSession, project_id: uuid.UUID) -> list[ProjectFunnel]:
        res = await db.execute(
            select(ProjectFunnel)
            .where(
                ProjectFunnel.project_id == project_id,
                ProjectFunnel.is_active == True,  # noqa: E712
            )
            .order_by(ProjectFunnel.order.asc(), ProjectFunnel.name.asc())
        )
        return list(res.scalars().all())

    @staticmethod
    async def _collect_request_chain_roots(
        db: AsyncSession,
        origin: ProjectTask,
        extra: Optional[list[ProjectTask]] = None,
    ) -> list[ProjectTask]:
        """Solicitação + cards raiz convertidos (origin_task_id) em cadeia."""
        task_opts = (
            selectinload(ProjectTask.project),
            selectinload(ProjectTask.status).selectinload(ProjectStatusConfig.funnel),
            selectinload(ProjectTask.demand_type),
        )
        chain: list[ProjectTask] = [origin]
        seen = {origin.id}
        frontier = [origin.id]
        if extra:
            for t in extra:
                if t.id not in seen:
                    seen.add(t.id)
                    chain.append(t)
                    frontier.append(t.id)
        while frontier:
            rows = list(
                (
                    await db.execute(
                        select(ProjectTask)
                        .where(
                            ProjectTask.origin_task_id.in_(frontier),
                            ProjectTask.parent_task_id.is_(None),
                        )
                        .options(*task_opts)
                    )
                ).scalars().all()
            )
            next_frontier: list[uuid.UUID] = []
            for task in rows:
                if task.id not in seen:
                    seen.add(task.id)
                    chain.append(task)
                    next_frontier.append(task.id)
            frontier = next_frontier
        return chain

    @staticmethod
    async def _collect_request_chains_batch(
        db: AsyncSession,
        origins: list[ProjectTask],
        extra_by_origin: dict[uuid.UUID, list[ProjectTask]],
    ) -> dict[uuid.UUID, list[ProjectTask]]:
        """Versão batcheada de _collect_request_chain_roots para múltiplas origens.

        BFS por origin_task_id em UMA query por nível (profundidade), não por origem
        (era N×profundidade). Cada card raiz tem um único origin_task_id, então
        pertence a exatamente uma cadeia — o `seen` global equivale ao `seen`
        por-origem do método single. A ordem interna não importa: os consumidores
        (`_map_tasks_to_funnels`) reordenam por updated_at.
        """
        task_opts = (
            selectinload(ProjectTask.project),
            selectinload(ProjectTask.status).selectinload(ProjectStatusConfig.funnel),
            selectinload(ProjectTask.demand_type),
        )
        chains: dict[uuid.UUID, list[ProjectTask]] = {}
        owner: dict[uuid.UUID, uuid.UUID] = {}   # task_id -> origem raiz da cadeia
        seen: set[uuid.UUID] = set()
        frontier: list[uuid.UUID] = []

        for origin in origins:
            chains[origin.id] = [origin]
            owner[origin.id] = origin.id
            seen.add(origin.id)
            frontier.append(origin.id)
            for t in extra_by_origin.get(origin.id, []):
                if t.id not in seen:
                    seen.add(t.id)
                    owner[t.id] = origin.id
                    chains[origin.id].append(t)
                    frontier.append(t.id)

        while frontier:
            rows = list((await db.execute(
                select(ProjectTask)
                .where(
                    ProjectTask.origin_task_id.in_(frontier),
                    ProjectTask.parent_task_id.is_(None),
                )
                .options(*task_opts)
            )).scalars().all())
            next_frontier: list[uuid.UUID] = []
            for task in rows:
                if task.id in seen:
                    continue
                origin_id = owner.get(task.origin_task_id)
                if origin_id is None:
                    continue
                seen.add(task.id)
                owner[task.id] = origin_id
                chains[origin_id].append(task)
                next_frontier.append(task.id)
            frontier = next_frontier

        return chains

    @staticmethod
    def _map_tasks_to_funnels(tasks: list[ProjectTask]) -> dict[uuid.UUID, ProjectTask]:
        by_funnel: dict[uuid.UUID, ProjectTask] = {}
        for task in sorted(tasks, key=lambda row: row.updated_at):
            if task.status and task.status.funnel_id:
                by_funnel[task.status.funnel_id] = task
        return by_funnel

    @staticmethod
    def _build_funnel_stages(
        funnels: list[ProjectFunnel],
        chain_tasks: list[ProjectTask],
        primary: ProjectTask,
        origin: ProjectTask,
        has_conversion: bool,
    ) -> list[dict]:
        funnel_tasks = ProjectTaskService._map_tasks_to_funnels(chain_tasks)
        primary_funnel_id = primary.status.funnel_id if primary.status else None
        primary_order = next((f.order for f in funnels if f.id == primary_funnel_id), 0)

        stages: list[dict] = []
        for funnel in funnels:
            task = funnel_tasks.get(funnel.id)
            superseded = bool(task and task.id == origin.id and has_conversion)
            is_current = funnel.id == primary_funnel_id
            if task:
                task_complete = ProjectTaskService._stage_is_complete(task, superseded=superseded)
            else:
                task_complete = False
            is_complete = funnel.order < primary_order or task_complete
            is_pending = not task and funnel.order > primary_order

            stage_task = None
            if task:
                stage_task = ProjectTaskWithContextResponse.model_validate(task).model_dump()

            stages.append({
                "label": funnel.name,
                "funnel_id": funnel.id,
                "funnel_order": funnel.order,
                "task": stage_task,
                "is_complete": is_complete,
                "is_current": is_current,
                "is_pending": is_pending,
            })

        if not any(s["is_current"] for s in stages) and stages:
            for stage in stages:
                if stage["task"] and not stage["is_complete"]:
                    stage["is_current"] = True
                    break
            else:
                stages[-1]["is_current"] = True

        return stages

    @staticmethod
    def _my_request_stage_label(task: ProjectTask) -> str:
        if task.planning_kind == "programa":
            return "Programa"
        if task.planning_kind == "projeto":
            return "Projeto"
        if task.demand_type:
            name = task.demand_type.name.lower()
            if "programa" in name:
                return "Programa"
            if "solicit" in name or "prospect" in name:
                return "Solicitação"
            return task.demand_type.name
        return "Solicitação"

    @staticmethod
    def _pick_converted_primary(converted: list[ProjectTask]) -> ProjectTask:
        for kind in ("programa", "projeto"):
            for task in converted:
                if task.planning_kind == kind:
                    return task
        return converted[0]

    @staticmethod
    def _stage_is_complete(task: ProjectTask, *, superseded: bool = False) -> bool:
        if superseded:
            return True
        if task.completed_at:
            return True
        status = task.status
        if status and getattr(status, "is_final", False):
            return True
        return False

    @staticmethod
    async def list_my_requests(
        db: AsyncSession,
        user_id: uuid.UUID,
        basic_only_available: bool = False,
    ) -> list[dict]:
        """Solicitações raiz criadas pelo usuário, mesclando conversões (programa/projeto)
        e filhos vinculados para acompanhamento unificado."""
        root_q = (
            select(ProjectTask)
            .where(
                ProjectTask.created_by == user_id,
                ProjectTask.parent_task_id.is_(None),
            )
            .options(
                selectinload(ProjectTask.project),
                selectinload(ProjectTask.status).selectinload(ProjectStatusConfig.funnel),
                selectinload(ProjectTask.demand_type),
            )
        )
        if basic_only_available:
            root_q = root_q.outerjoin(
                ProjectDemandType, ProjectDemandType.id == ProjectTask.demand_type_id
            ).where(
                or_(
                    ProjectTask.demand_type_id.is_(None),
                    ProjectDemandType.available_for_basic.is_(True),
                )
            )
        root_q = root_q.order_by(ProjectTask.created_at.desc())
        roots = list((await db.execute(root_q)).scalars().all())
        if not roots:
            return []

        origin_ids = [r.id for r in roots]
        converted_q = (
            select(ProjectTask)
            .where(
                ProjectTask.origin_task_id.in_(origin_ids),
                ProjectTask.parent_task_id.is_(None),
            )
            .options(
                selectinload(ProjectTask.project),
                selectinload(ProjectTask.status).selectinload(ProjectStatusConfig.funnel),
                selectinload(ProjectTask.demand_type),
            )
            .order_by(ProjectTask.created_at.asc())
        )
        converted_roots = list((await db.execute(converted_q)).scalars().all())

        root_by_id = {r.id: r for r in roots}
        for conv in converted_roots:
            root_by_id[conv.id] = conv

        converted_ids: set[uuid.UUID] = set()
        converted_by_origin: dict[uuid.UUID, list[ProjectTask]] = {}
        for conv in converted_roots:
            if conv.origin_task_id and conv.origin_task_id in origin_ids:
                converted_ids.add(conv.id)
                converted_by_origin.setdefault(conv.origin_task_id, []).append(conv)

        for root in roots:
            if root.origin_task_id and root.origin_task_id in origin_ids:
                converted_ids.add(root.id)
                bucket = converted_by_origin.setdefault(root.origin_task_id, [])
                if root.id not in {t.id for t in bucket}:
                    bucket.append(root)

        visible_roots = [r for r in roots if r.id not in converted_ids]

        primary_ids = [r.id for r in visible_roots]
        for origin_id, converted in converted_by_origin.items():
            primary_ids.append(ProjectTaskService._pick_converted_primary(converted).id)

        child_q = (
            select(ProjectTask)
            .where(ProjectTask.parent_task_id.in_(primary_ids))
            .options(
                selectinload(ProjectTask.project),
                selectinload(ProjectTask.status).selectinload(ProjectStatusConfig.funnel),
                selectinload(ProjectTask.demand_type),
            )
            .order_by(ProjectTask.order.asc(), ProjectTask.created_at.asc())
        )
        children = list((await db.execute(child_q)).scalars().all())
        by_parent: dict[uuid.UUID, list[ProjectTask]] = {}
        for child in children:
            if child.parent_task_id:
                by_parent.setdefault(child.parent_task_id, []).append(child)

        # Funnels de todos os projetos numa única query (era 1 por projeto).
        # O order_by global preserva a ordem por-projeto ao agrupar.
        funnels_by_project: dict[uuid.UUID, list[ProjectFunnel]] = {}
        project_ids = {r.project_id for r in visible_roots}
        if project_ids:
            fres = await db.execute(
                select(ProjectFunnel)
                .where(
                    ProjectFunnel.project_id.in_(project_ids),
                    ProjectFunnel.is_active == True,  # noqa: E712
                )
                .order_by(ProjectFunnel.order.asc(), ProjectFunnel.name.asc())
            )
            for f in fres.scalars().all():
                funnels_by_project.setdefault(f.project_id, []).append(f)

        # Coleta as cadeias de conversão de TODAS as origens de uma vez (era 1 BFS
        # por origem = N+1). Equivalente por origem — ver _collect_request_chains_batch.
        chains_by_origin = await ProjectTaskService._collect_request_chains_batch(
            db, visible_roots, converted_by_origin
        )

        out: list[dict] = []
        for origin in visible_roots:
            converted = converted_by_origin.get(origin.id, [])
            primary = (
                ProjectTaskService._pick_converted_primary(converted)
                if converted
                else origin
            )

            chain_tasks = chains_by_origin.get(origin.id, [origin])
            funnels = funnels_by_project.get(origin.project_id, [])
            stages = ProjectTaskService._build_funnel_stages(
                funnels,
                chain_tasks,
                primary,
                origin,
                has_conversion=bool(converted),
            )

            primary_data = ProjectTaskWithContextResponse.model_validate(primary).model_dump()
            child_rows = by_parent.get(primary.id, [])
            out.append({
                **primary_data,
                "children": [
                    ProjectTaskWithContextResponse.model_validate(c).model_dump()
                    for c in child_rows
                ],
                "stages": stages,
                "origin_request_id": origin.id if primary.id != origin.id else None,
            })

        out.sort(key=lambda row: row["created_at"], reverse=True)
        return out

    @staticmethod
    async def list_all(
        db: AsyncSession,
        project_id: Optional[uuid.UUID] = None,
    ) -> list[ProjectTask]:
        """Lista todas as demandas/cards do tenant (com contexto de projeto, etapa e
        tipo) para a tela administrativa de gestão. Filtro opcional por projeto."""
        q = (
            select(ProjectTask)
            .options(
                selectinload(ProjectTask.project),
                selectinload(ProjectTask.status),
                selectinload(ProjectTask.demand_type),
            )
        )
        if project_id:
            q = q.where(ProjectTask.project_id == project_id)
        q = q.order_by(ProjectTask.created_at.desc())
        result = await db.execute(q)
        return list(result.scalars().all())

    @staticmethod
    async def get(db: AsyncSession, project_id: uuid.UUID, task_id: uuid.UUID) -> ProjectTask:
        result = await db.execute(
            select(ProjectTask).where(
                ProjectTask.id == task_id,
                ProjectTask.project_id == project_id,
            )
        )
        task = result.scalar_one_or_none()
        if not task:
            raise HTTPException(status_code=404, detail="Tarefa não encontrada.")
        return task

    @staticmethod
    async def set_planning_classification(
        db: AsyncSession,
        project_id: uuid.UUID,
        task_id: uuid.UUID,
        kind: str,
        program_id: Optional[uuid.UUID] = None,
        new_program_name: Optional[str] = None,
        new_program_desc: Optional[str] = None,
        current_user_id: Optional[uuid.UUID] = None,
    ) -> ProjectTask:
        """Edita a classificação de planejamento (projeto/programa) e propaga ao card de
        planejamento convertido a partir desta origem (ou ao próprio card, se já for raiz).
        Em 'programa', vincula a um programa do catálogo (existente ou recém-criado)."""
        origin = await ProjectTaskService.get(db, project_id, task_id)
        if origin.planning_kind in ("projeto", "programa"):
            target = origin
        else:
            res = await db.execute(
                select(ProjectTask)
                .where(
                    ProjectTask.origin_task_id == origin.id,
                    ProjectTask.planning_kind.isnot(None),
                )
                .limit(1)
            )
            target = res.scalar_one_or_none()
            if not target:
                raise HTTPException(
                    status_code=404,
                    detail="Este card ainda não gerou um card de Projeto/Programa para classificar.",
                )
        if kind == "programa":
            if program_id is None:
                name = (new_program_name or "").strip()
                if len(name) < 2:
                    raise HTTPException(
                        status_code=400,
                        detail="Informe um programa existente ou o nome do novo programa.",
                    )
                prog = ProjectProgram(
                    name=name,
                    description=(new_program_desc or None),
                    created_by=current_user_id,
                )
                db.add(prog)
                await db.flush()
                program_id = prog.id
            else:
                prog = await db.get(ProjectProgram, program_id)
                if not prog or not prog.is_active:
                    raise HTTPException(status_code=400, detail="Programa inválido ou inativo.")
            target.planning_kind = "programa"
            target.linked_program_id = program_id
        elif kind == "projeto":
            target.planning_kind = "projeto"
            target.linked_program_id = None
        else:
            raise HTTPException(status_code=400, detail="Classificação inválida.")
        target.updated_at = datetime.utcnow()
        await db.commit()
        await db.refresh(target)
        return target

    @staticmethod
    async def create(
        db: AsyncSession,
        project_id: uuid.UUID,
        data: ProjectTaskCreate,
        current_user_id: Optional[uuid.UUID] = None,
        current_user: Optional[User] = None,
        enforce_funnel_access: bool = True,
    ) -> ProjectTask:
        await ProjectService.get(db, project_id)
        status_row = await db.execute(
            select(ProjectStatusConfig).where(
                ProjectStatusConfig.id == data.status_id,
                ProjectStatusConfig.project_id == project_id,
            )
        )
        status_obj = status_row.scalar_one_or_none()
        if not status_obj:
            raise HTTPException(status_code=400, detail="Coluna inválida para este projeto.")
        # Abrir solicitação (auto-atribuída a si) é uma funcionalidade básica de TODO usuário —
        # não depende do acesso do Cargo ao funil. Só a gestão do board (mover/editar cards de
        # terceiros) respeita o access_control. Por isso a checagem só vale quando enforce=True.
        if enforce_funnel_access:
            await ProjectTaskService._check_funnel_writable(db, status_obj.funnel_id, current_user)

        payload = data.model_dump()
        form_values = payload.pop("form_values", None)
        demand_type_id = payload.get("demand_type_id")
        if demand_type_id:
            demand_type = await ProjectDemandTypeService.get(db, demand_type_id)
            if not demand_type.is_active:
                raise HTTPException(status_code=400, detail="Tipo de demanda está inativo.")
            await ProjectTaskService._validate_type_allowed_in_funnel(db, status_obj.funnel_id, demand_type_id)
        await ProjectTaskService._validate_parent(
            db,
            project_id=project_id,
            child_demand_type_id=demand_type_id,
            parent_task_id=payload.get("parent_task_id"),
            self_id=None,
        )
        await ProjectTaskService._validate_form_values_for_status(
            db,
            demand_type_id=demand_type_id,
            status_id=payload.get("status_id"),
            form_values=form_values,
        )
        await ProjectDefaultFormService.validate_task_data_for_status(
            db,
            payload["status_id"],
            title=payload.get("title"),
            description=payload.get("description"),
            assigned_to=payload.get("assigned_to"),
            diretoria=payload.get("diretoria"),
            area=payload.get("area"),
            start_date=payload.get("start_date"),
            due_date=payload.get("due_date"),
            anexos=payload.get("anexos"),
        )
        for key in ("diretoria", "area"):
            if payload.get(key) == "":
                payload[key] = None
        payload["due_date"] = _to_naive_utc(payload.get("due_date"))
        payload["start_date"] = _to_naive_utc(payload.get("start_date"))
        task = ProjectTask(
            project_id=project_id,
            **payload,
            created_by=current_user_id,
        )
        task.sla_state = ProjectTaskService._sla_initial(status_obj)
        # Horas + início sem prazo explícito → deriva o prazo (dias úteis).
        if task.due_date is None:
            hpd = await ProjectTaskService._project_hours_per_day_for_task(db, task)
            ProjectTaskService._apply_hours(task, hpd)
        db.add(task)
        await db.flush()
        await ProjectTaskService._upsert_form_submission(db, task.id, form_values, current_user_id)
        # Automações de "ao entrar na etapa" valem também para a criação direta do card
        # na coluna — não só no arraste. Atribui responsável, cria subtarefa, notifica, etc.
        await ProjectAutomationRunner.run_on_enter(db, project_id, task, status_obj)
        await db.commit()
        await db.refresh(task)
        if status_obj:
            await ProjectAgentRunner.run_on_enter(db, project_id, task, status_obj)
        # Card novo com pai/origem herda a priorização da família, se houver.
        if task.parent_task_id or task.origin_task_id:
            await PriorityScoreService.sync_family(db, task.id)
        return task

    @staticmethod
    async def _enforce_schedule_gate(
        db: AsyncSession,
        task: ProjectTask,
        payload: dict,
    ) -> None:
        """Bloqueia a saída de uma etapa vinculada ao Cronograma sem início+prazo.

        Aplica-se quando a etapa de ORIGEM (status atual do card) tem um vínculo de
        cronograma ativo com `require_fill`.
        """
        binding = await db.execute(
            select(ProjectScheduleBinding).where(
                ProjectScheduleBinding.status_id == task.status_id,
                ProjectScheduleBinding.is_active == True,  # noqa: E712
                ProjectScheduleBinding.require_fill == True,  # noqa: E712
            )
        )
        if not binding.scalar_one_or_none():
            return
        # Datas efetivas (cobre preencher datas + mover no mesmo PATCH).
        start = payload.get("start_date", task.start_date)
        due = payload.get("due_date", task.due_date)
        if start is None or due is None:
            raise HTTPException(
                status_code=400,
                detail="Preencha início e prazo no cronograma antes de sair desta etapa.",
            )

    @staticmethod
    async def _enforce_priority_gate(db: AsyncSession, task: ProjectTask) -> None:
        """Bloqueia a saída de uma etapa marcada como OBRIG. na priorização sem que a
        demanda esteja pontuada (Impacto × Esforço)."""
        status_obj = await db.get(ProjectStatusConfig, task.status_id)
        if not status_obj or not getattr(status_obj, "priority_required", False):
            return
        score = await db.execute(
            select(ProjectPriorityScore.id).where(ProjectPriorityScore.task_id == task.id).limit(1)
        )
        if score.scalar_one_or_none() is None:
            raise HTTPException(
                status_code=400,
                detail="Pontue a priorização (Impacto × Esforço) antes de sair desta etapa.",
            )

    @staticmethod
    def _validate_card_classification(
        classification: Optional[str],
        product_id: Optional[uuid.UUID],
        release_id: Optional[uuid.UUID],
    ) -> None:
        """Valida tipo + vínculos obrigatórios ao portfólio de produtos."""
        if classification not in ("desenvolvimento", "implantacao", "melhoria"):
            raise HTTPException(
                status_code=400,
                detail="Classifique o card (desenvolvimento, implantação ou melhoria).",
            )
        if classification in ("desenvolvimento", "implantacao") and not product_id:
            raise HTTPException(
                status_code=400,
                detail="Vincule um produto ao card.",
            )
        if classification == "melhoria" and (not product_id or not release_id):
            raise HTTPException(
                status_code=400,
                detail="Para 'melhoria', vincule um produto e uma release.",
            )

    @staticmethod
    async def count_unclassified_past_backlog(
        db: AsyncSession, project_id: uuid.UUID, funnel_id: uuid.UUID,
    ) -> int:
        """Cards no funil que já saíram do backlog e ainda não foram classificados."""
        res = await db.execute(
            select(func.count(ProjectTask.id))
            .join(ProjectStatusConfig, ProjectStatusConfig.id == ProjectTask.status_id)
            .where(
                ProjectTask.project_id == project_id,
                ProjectStatusConfig.funnel_id == funnel_id,
                ProjectStatusConfig.is_initial.is_(False),
                ProjectTask.card_classification.is_(None),
            )
        )
        return int(res.scalar() or 0)

    @staticmethod
    async def _enforce_backlog_classification_gate(
        db: AsyncSession, task: ProjectTask, payload: dict
    ) -> None:
        """Bloqueia a saída do backlog quando enforcement está ativo na etapa/funil."""
        source_status = await db.get(ProjectStatusConfig, task.status_id)
        if (
            not source_status
            or not source_status.is_initial
            or not getattr(source_status, "classification_required", False)
        ):
            return
        funnel = await db.get(ProjectFunnel, source_status.funnel_id)
        if not funnel or not getattr(funnel, "classification_enforcement_enabled", False):
            return
        classification = payload.get("card_classification", task.card_classification)
        product_id = payload.get("linked_product_id", task.linked_product_id)
        release_id = payload.get("linked_release_id", task.linked_release_id)
        ProjectTaskService._validate_card_classification(classification, product_id, release_id)

    @staticmethod
    async def update(
        db: AsyncSession,
        project_id: uuid.UUID,
        task_id: uuid.UUID,
        data: ProjectTaskUpdate,
        current_user: Optional[User] = None,
    ) -> ProjectTask:
        task = await ProjectTaskService.get(db, project_id, task_id)
        payload_preview = data.model_dump(exclude_unset=True)
        status_will_change_early = (
            "status_id" in payload_preview and payload_preview["status_id"] != task.status_id
        )
        # Kanban "somente visualizar": bloqueia edição, exceto mudança de etapa (validada depois).
        if current_user is not None and not status_will_change_early:
            source_funnel_id = await ProjectTaskService._funnel_id_of_status(db, task.status_id)
            await ProjectTaskService._check_funnel_writable(
                db, source_funnel_id, current_user, task=task,
            )
        payload = payload_preview
        if "due_date" in payload:
            payload["due_date"] = _to_naive_utc(payload.get("due_date"))
        if "start_date" in payload:
            payload["start_date"] = _to_naive_utc(payload.get("start_date"))
        form_values = payload.pop("form_values", None)
        conversion_title = payload.pop("conversion_title", None)
        conversion_kind = payload.pop("conversion_kind", None)
        conversion_description = payload.pop("conversion_description", None)
        conversion_items = payload.pop("conversion_items", None)
        conversion_assigned_to = payload.pop("conversion_assigned_to", None)
        conversion_program_id = payload.pop("conversion_program_id", None)

        target_demand_type_id = payload.get("demand_type_id", task.demand_type_id)
        if target_demand_type_id:
            demand_type = await ProjectDemandTypeService.get(db, target_demand_type_id)
            if not demand_type.is_active:
                raise HTTPException(status_code=400, detail="Tipo de demanda está inativo.")
        if "parent_task_id" in payload:
            await ProjectTaskService._validate_parent(
                db,
                project_id=project_id,
                child_demand_type_id=target_demand_type_id,
                parent_task_id=payload.get("parent_task_id"),
                self_id=task.id,
            )
        target_status_id = payload.get("status_id", task.status_id)
        current_values = {}
        existing_submission = await db.execute(
            select(ProjectDemandFormSubmission).where(ProjectDemandFormSubmission.task_id == task.id)
        )
        submission_obj = existing_submission.scalar_one_or_none()
        if submission_obj:
            current_values = submission_obj.values or {}
        merged_values = current_values if form_values is None else {**current_values, **form_values}
        status_will_change = "status_id" in payload and payload["status_id"] != task.status_id
        is_forward = (
            await ProjectTaskService._is_forward_status_move(db, task.status_id, target_status_id)
            if status_will_change
            else False
        )
        # Obrigatoriedade por etapa: só ao avançar de raia (não ao voltar nem ao salvar sem mover).
        if status_will_change and is_forward:
            await ProjectTaskService._validate_form_values_for_status(
                db,
                demand_type_id=target_demand_type_id,
                status_id=task.status_id,
                form_values=merged_values,
            )
            await ProjectDefaultFormService.validate_task_data_for_status(
                db,
                task.status_id,
                title=payload.get("title"),
                description=payload.get("description"),
                assigned_to=payload.get("assigned_to"),
                diretoria=payload.get("diretoria"),
                area=payload.get("area"),
                start_date=payload.get("start_date"),
                due_date=payload.get("due_date"),
                anexos=payload.get("anexos"),
                existing=task,
            )
        for key in ("diretoria", "area"):
            if payload.get(key) == "":
                payload[key] = None

        if payload.get("status_id"):
            status_row = await db.execute(
                select(ProjectStatusConfig).where(
                    ProjectStatusConfig.id == payload["status_id"],
                    ProjectStatusConfig.project_id == project_id,
                )
            )
            target_status = status_row.scalar_one_or_none()
            if not target_status:
                raise HTTPException(status_code=400, detail="Coluna inválida para este projeto.")
            # Permissão de movimentação: só funções autorizadas movem o card para esta etapa.
            if payload["status_id"] != task.status_id:
                source_status_row = await db.execute(
                    select(ProjectStatusConfig).where(
                        ProjectStatusConfig.id == task.status_id,
                        ProjectStatusConfig.project_id == project_id,
                    )
                )
                source_status = source_status_row.scalar_one_or_none()
                ProjectTaskService._check_move_out_permission(source_status, current_user)
                ProjectTaskService._check_move_permission(target_status, current_user)
                await ProjectTaskService._check_funnel_access_for_move(
                    db, source_status, target_status, current_user, task,
                )
                await ProjectTaskService._check_assignee_for_feature_us_kanban_move(
                    db, source_status, task, payload,
                )
                # Guard-rail: uma Feature só pode ser concluída manualmente quando todas as
                # User Stories filhas estiverem concluídas. (O auto-move do reconcile não passa
                # por aqui, então este guard vale apenas para o movimento manual/API.)
                if target_status.is_final and await ProjectTaskService._is_feature_task(db, task):
                    us_children = await ProjectTaskService._us_children(db, task.id)
                    if us_children:
                        smap = await ProjectTaskService._statuses_by_id(
                            db, [c.status_id for c in us_children]
                        )
                        pendentes = sum(
                            1
                            for c in us_children
                            if not (smap.get(c.status_id) and smap[c.status_id].is_final)
                        )
                        if pendentes:
                            raise HTTPException(
                                status_code=400,
                                detail=(
                                    f"Não é possível concluir a Feature: {pendentes} "
                                    f"User Story(s) ainda não concluída(s)."
                                ),
                            )

        # O card mudou de etapa? (calculado antes do setattr)
        status_changed = bool(payload.get("status_id")) and payload["status_id"] != task.status_id

        class_fields = ("card_classification", "linked_product_id", "linked_release_id")
        if any(k in payload for k in class_fields):
            merged_cls = payload.get("card_classification", task.card_classification)
            merged_pid = payload.get("linked_product_id", task.linked_product_id)
            merged_rid = payload.get("linked_release_id", task.linked_release_id)
            if merged_cls:
                ProjectTaskService._validate_card_classification(merged_cls, merged_pid, merged_rid)

        # Cronograma / priorização / classificação: gates só ao avançar de etapa.
        if status_changed and is_forward:
            await ProjectTaskService._enforce_schedule_gate(db, task, payload)
            await ProjectTaskService._enforce_priority_gate(db, task)
            await ProjectTaskService._enforce_backlog_classification_gate(db, task, payload)

        # "Mudou de fato" — compara com o valor atual. Assim um save de título/etc. que reenvia
        # as mesmas datas (ex.: drawer) NÃO é tratado como alteração de cronograma.
        schedule_changed = (
            ("start_date" in payload and payload["start_date"] != task.start_date)
            or ("due_date" in payload and payload["due_date"] != task.due_date)
            or ("estimated_hours" in payload and payload["estimated_hours"] != task.estimated_hours)
        )
        # Trava de cronograma: se o projeto está comprometido (em desenvolvimento) e sem revisão
        # aberta, alterar datas/horas é bloqueado (423). Progresso/etapa/metadados seguem livres.
        if schedule_changed:
            await ScheduleBaselineService.assert_editable(db, project_id, task.id)
        prev_hours = task.estimated_hours
        hours_changed = "estimated_hours" in payload and payload["estimated_hours"] != prev_hours

        if "us_checklist" in payload:
            raw_checklist = payload.pop("us_checklist")
            if not await ProjectTaskService._can_use_us_checklist(db, task):
                raise HTTPException(
                    status_code=400,
                    detail="Checklist disponível apenas em cards User Story.",
                )
            normalized = ProjectTaskService._normalize_us_checklist(raw_checklist)
            task.us_checklist = normalized or None
            task.percent_complete = ProjectTaskService._percent_from_us_checklist(normalized) or 0
            payload.pop("percent_complete", None)

        if task.us_checklist and "percent_complete" in payload:
            payload.pop("percent_complete")

        for key, value in payload.items():
            setattr(task, key, value)

        if task.us_checklist:
            task.percent_complete = ProjectTaskService._percent_from_us_checklist(task.us_checklist) or 0

        # Horas estimadas + início → recalcula o prazo (dias úteis), a menos que o
        # prazo tenha sido informado explicitamente nesta mesma edição.
        if ("estimated_hours" in payload or "start_date" in payload or "assigned_to" in payload) and "due_date" not in payload:
            hpd = await ProjectTaskService._project_hours_per_day_for_task(db, task)
            ProjectTaskService._apply_hours(task, hpd)

        # Gatilhos de "entrada na etapa" — só quando o card realmente muda de fase.
        if status_changed:
            status_obj = target_status
            if status_obj and status_obj.is_final:
                task.completed_at = datetime.utcnow()
            else:
                task.completed_at = None
            # Reinicia o relógio de SLA ao entrar numa nova etapa.
            task.status_entered_at = datetime.utcnow()
            task.sla_state = ProjectTaskService._sla_initial(status_obj)
            # Controle de baseline: entrada do card-raiz de planejamento numa etapa que trava o
            # cronograma compromete o baseline — a partir daqui, alterar exige baseline+justificativa.
            if (
                status_obj is not None and getattr(status_obj, "locks_schedule", False)
                and task.planning_kind in ("programa", "projeto")
                and task.schedule_committed_at is None
            ):
                task.schedule_committed_at = datetime.utcnow()
            # Automações da fase em que o card entrou (atribuir, subtarefa, notificar, comentar).
            await ProjectAutomationRunner.run_on_enter(db, project_id, task, status_obj)
            # Gatilho de conversão: se a fase de destino gera outro tipo de card.
            await ProjectTaskService._maybe_convert_on_status(
                db, project_id, task, status_obj, conversion_title,
                conversion_kind=conversion_kind,
                conversion_description=conversion_description,
                conversion_items=conversion_items,
                conversion_assigned_to=conversion_assigned_to,
                conversion_program_id=conversion_program_id,
            )
            # Gatilho de transição: se a fase de destino move o card para outro kanban.
            await ProjectTaskService._maybe_move_to_funnel(db, project_id, task, status_obj)
            # Envia as tarefas (filhos) para o kanban de execução, mantendo este card.
            await ProjectTaskService._maybe_send_children_to_funnel(db, project_id, task, status_obj)
            # Sincroniza card de origem (ex.: Planejamento concluído → Triagem avança).
            await ProjectTaskService._maybe_update_origin_on_status(db, project_id, task, status_obj)
            # Reconcilia a Feature-pai a partir do agregado das US filhas (movimento + selo).
            await ProjectTaskService._maybe_reconcile_parent_feature(db, project_id, task, current_user)

        task.updated_at = datetime.utcnow()
        await ProjectTaskService._upsert_form_submission(db, task.id, form_values, None)
        # Auto-scheduling. Mudar horas estimadas recalcula TODA a subárvore do cronograma
        # (âncora no início do projeto + sequência por ordem + predecessoras). Já um ajuste
        # manual de datas (arrastar a barra) só empurra as sucessoras (FS) para frente,
        # preservando a edição manual.
        if "start_date" in payload and task.planning_kind in ("programa", "projeto"):
            # Mudar o início do card raiz = redefinir a data-base do projeto. Grava em
            # Project.start_date e recalcula TODA a subárvore (sequência + horas + predecessoras).
            project = await db.get(Project, project_id)
            if project is not None and task.start_date is not None:
                project.start_date = task.start_date
            await ProjectTaskService._reschedule_root(db, project_id, task.id)
        elif hours_changed:
            # Horas mudam a duração → recalcula a subárvore.
            root_id = await ProjectTaskService._planning_root_id(db, project_id, task.id)
            await ProjectTaskService._reschedule_root(db, project_id, root_id)
        elif schedule_changed:
            await ProjectTaskService._reschedule_dependents(db, project_id, task.id)
        await db.commit()
        await db.refresh(task)
        if status_changed:
            final_status = await db.get(ProjectStatusConfig, task.status_id)
            if final_status:
                await ProjectAgentRunner.run_on_enter(db, project_id, task, final_status)
        # Propaga/herdar a priorização para a família — cobre vínculo de pai, conversão
        # (novo Projeto com origin_task_id) e subtarefas criadas por automação.
        await PriorityScoreService.sync_family(db, task.id)
        return task

    @staticmethod
    async def _effective_type_id(
        db: AsyncSession, task: ProjectTask
    ) -> Optional[uuid.UUID]:
        """Tipo EFETIVO de um item no cronograma, seguindo a corrente de amarração:
        - item tipado → seu próprio tipo;
        - etapa sem tipo → avança N passos (N = distância até o ancestral tipado) na
          corrente de filhos permitidos, exigindo exatamente 1 filho permitido por nível.
        Retorna None quando o nível é indefinido (sem ancestral tipado, nível terminal
        sem filhos, ou ambíguo com vários filhos permitidos)."""
        if task.demand_type_id:
            return task.demand_type_id
        steps = 0
        cur: Optional[ProjectTask] = task
        while cur is not None and not cur.demand_type_id:
            if cur.parent_task_id is None:
                return None
            cur = await db.get(ProjectTask, cur.parent_task_id)
            steps += 1
        if cur is None or not cur.demand_type_id:
            return None
        type_id: uuid.UUID = cur.demand_type_id
        for _ in range(steps):
            dt = await db.get(ProjectDemandType, type_id)
            allowed = (dt.allowed_child_type_ids or []) if dt else []
            if len(allowed) != 1:
                return None
            type_id = uuid.UUID(str(allowed[0]))
        return type_id

    @staticmethod
    async def _can_add_schedule_child(db: AsyncSession, parent: ProjectTask) -> bool:
        """Só permite etapa-filha onde o tipo EFETIVO do pai tem filhos permitidos."""
        eff = await ProjectTaskService._effective_type_id(db, parent)
        if eff is None:
            return False
        dt = await db.get(ProjectDemandType, eff)
        return bool(dt and dt.allowed_child_type_ids)

    @staticmethod
    async def create_schedule_stage(
        db: AsyncSession,
        project_id: uuid.UUID,
        parent_task_id: uuid.UUID,
        data: "ScheduleStageCreate",
        current_user_id: Optional[uuid.UUID] = None,
    ) -> ProjectTask:
        """Cria uma ETAPA do cronograma do projeto: atividade-filha simples (sem tipo de
        demanda), no mesmo status do pai. Respeita a amarração de tipos: só permite criar
        etapa onde o tipo EFETIVO do pai (corrente de allowed_child_type_ids) ainda tem um
        nível-filho definido — evita criar níveis que não existem na hierarquia."""
        parent = await ProjectTaskService.get(db, project_id, parent_task_id)
        # Criar etapa altera o cronograma → bloqueado se o projeto estiver travado.
        await ScheduleBaselineService.assert_editable(db, project_id, parent.id)
        if not await ProjectTaskService._can_add_schedule_child(db, parent):
            raise HTTPException(
                status_code=400,
                detail="Este item não tem um nível-filho definido na amarração de tipos; não é possível adicionar etapa.",
            )
        status_obj = await db.get(ProjectStatusConfig, parent.status_id)
        stage = ProjectTask(
            project_id=project_id,
            status_id=parent.status_id,
            parent_task_id=parent.id,
            demand_type_id=None,
            title=data.title.strip()[:200],
            start_date=_to_naive_utc(data.start_date),
            due_date=_to_naive_utc(data.due_date),
            created_by=current_user_id,
            sla_state=ProjectTaskService._sla_initial(status_obj),
        )
        db.add(stage)
        await db.commit()
        await db.refresh(stage)
        # A etapa entra na família do projeto e herda a priorização, se houver.
        await PriorityScoreService.sync_family(db, stage.id)
        return stage

    @staticmethod
    async def reorder(db: AsyncSession, project_id: uuid.UUID, items: list[dict]) -> list[ProjectTask]:
        """Reordena tarefas (irmãs do mesmo nível) no cronograma. Recebe [{id, order}]
        e grava o novo `order`. Não mexe em datas nem em vínculo (pai)."""
        ids = [i.get("id") for i in items if i.get("id")]
        if not ids:
            return []
        result = await db.execute(
            select(ProjectTask).where(
                ProjectTask.project_id == project_id,
                ProjectTask.id.in_(ids),
            )
        )
        current = {str(t.id): t for t in result.scalars().all()}
        # Reordenar muda a sequência (e as datas) → bloqueado se o cronograma estiver travado.
        first_task = next(iter(current.values()), None)
        if first_task is not None:
            await ScheduleBaselineService.assert_editable(db, project_id, first_task.id)
        for item in items:
            tid = str(item.get("id"))
            if tid in current and item.get("order") is not None:
                current[tid].order = int(item["order"])
                current[tid].updated_at = datetime.utcnow()
        # Mudar a ordem reordena as datas: recalcula a subárvore do cronograma envolvida.
        first = next(iter(current.values()), None)
        if first is not None:
            await db.flush()
            root_id = await ProjectTaskService._planning_root_id(db, project_id, first.id)
            await ProjectTaskService._reschedule_root(db, project_id, root_id)
        await db.commit()
        return list(current.values())

    @staticmethod
    def _apply_hours(task: ProjectTask, hours_per_day: float = HOURS_PER_DAY) -> None:
        """Deriva due_date a partir de estimated_hours + start_date (dias úteis).
        Não faz nada se faltar horas ou início. A barra cobre [start, due] inclusive."""
        duration = _duration_days_from_hours(task.estimated_hours, hours_per_day)
        if duration is None or task.start_date is None:
            return
        task.due_date = _add_business_days(task.start_date, duration - 1)

    @staticmethod
    async def _project_hours_per_day_for_task(
        db: AsyncSession,
        task: ProjectTask,
        calendar=None,
        persons_by_id: Optional[dict[uuid.UUID, Person]] = None,
    ) -> float:
        """Taxa efetiva de horas de projeto/dia para a tarefa (conforme alocação do responsável)."""
        if calendar is None:
            calendar = await load_calendar(db)
        if not task.assigned_to:
            return calendar.hours_per_day()
        person = (persons_by_id or {}).get(task.assigned_to)
        if person is None:
            person = await db.get(Person, task.assigned_to)
        return project_hours_per_day(person, calendar)

    @staticmethod
    async def _reschedule_dependents(
        db: AsyncSession,
        project_id: uuid.UUID,
        changed_task_id: uuid.UUID,
        *,
        visited: Optional[set[uuid.UUID]] = None,
    ) -> None:
        """Empurrão FS de sucessoras (horas úteis) usado no ARRASTO MANUAL de uma barra
        (mudar start/due sem mexer nas horas): preserva a data manual da tarefa movida e só
        empurra as sucessoras para frente, mantendo a duração de cada uma. Os demais gatilhos
        (horas/ordem/predecessora) usam o motor completo (`_reschedule_root`). Commit a cargo
        do chamador."""
        calendar = await load_calendar(db)
        rows = await db.execute(
            select(
                ProjectTaskDependency.predecessor_id,
                ProjectTaskDependency.successor_id,
                ProjectTaskDependency.dep_type,
                ProjectTaskDependency.lag_hours,
            ).where(ProjectTaskDependency.project_id == project_id)
        )
        succ_by_pred: dict[uuid.UUID, list[tuple[uuid.UUID, str, float]]] = {}
        for pred_id, succ_id, dt, lag in rows.all():
            succ_by_pred.setdefault(pred_id, []).append((succ_id, dt or "FS", float(lag or 0)))

        if visited is None:
            visited = set()
        # BFS empurrando sucessoras (apenas FS no caminho de arrasto; tipos completos no motor).
        queue: list[uuid.UUID] = [changed_task_id]
        while queue:
            pred_id = queue.pop(0)
            if pred_id in visited:
                continue
            visited.add(pred_id)
            edges = succ_by_pred.get(pred_id)
            if not edges:
                continue
            pred = await db.get(ProjectTask, pred_id)
            if pred is None or pred.due_date is None:
                continue
            for succ_id, dep_type, lag in edges:
                if dep_type != "FS":
                    continue
                succ = await db.get(ProjectTask, succ_id)
                if succ is None:
                    continue
                new_start = calendar.add_working_hours(pred.due_date, lag)
                # Só empurra para frente.
                if succ.start_date is not None and succ.start_date >= new_start:
                    continue
                # Preserva a duração (horas): das horas estimadas, senão do span atual, senão 0.
                if succ.estimated_hours is not None and float(succ.estimated_hours) > 0:
                    duration = float(succ.estimated_hours)
                elif succ.start_date is not None and succ.due_date is not None:
                    duration = calendar.working_hours_between(succ.start_date, succ.due_date)
                else:
                    duration = 0.0
                succ.start_date = new_start
                succ.due_date = calendar.add_working_hours(new_start, duration)
                succ.updated_at = datetime.utcnow()
                queue.append(succ_id)

    @staticmethod
    async def _planning_root_id(db: AsyncSession, project_id: uuid.UUID, task_id: uuid.UUID) -> uuid.UUID:
        """Sobe pela cadeia de pais até o card de planejamento (planning_kind programa/projeto),
        que é a raiz do cronograma. Se nenhum ancestral for de planejamento, devolve o ancestral
        mais ao topo (parent_task_id == None)."""
        cur = await db.get(ProjectTask, task_id)
        last = cur
        while cur is not None:
            last = cur
            if cur.planning_kind in ("programa", "projeto"):
                return cur.id
            if cur.parent_task_id is None:
                break
            cur = await db.get(ProjectTask, cur.parent_task_id)
        return last.id if last is not None else task_id

    @staticmethod
    async def _reschedule_root(db: AsyncSession, project_id: uuid.UUID, root_id: uuid.UUID) -> None:
        """Recalcula em cascata as datas de TODA a subárvore de `root_id` (um card de
        planejamento), gravando start_date/due_date.

        Critérios:
        - Âncora = Project.start_date (alinhada em dia útil); se ausente, hoje.
        - Irmãos (mesmo pai) são sequenciais pela ordem quando compartilham o mesmo
          responsável; com responsáveis diferentes, iniciam em paralelo na data-base.
        - Predecessoras explícitas (FS, dias úteis + lag) empurram a sucessora para frente —
          vence a data mais tarde entre a sequência e as predecessoras.
        - Pais herdam start = menor início e due = maior término dos filhos agendados (rollup).
        - Folha agendável = tem horas estimadas OU já tem início+prazo. Duração = horas (ceil/8h)
          ou, na falta, a duração atual; folhas sem horas e sem datas são ignoradas.

        Commit a cargo do chamador.
        """
        root = await db.get(ProjectTask, root_id)
        if root is None:
            return

        # Calendário corporativo (expediente/almoço/dias úteis/feriados) do módulo Pessoa.
        calendar = await load_calendar(db)

        project = await db.get(Project, project_id)
        base = project.start_date if (project is not None and project.start_date is not None) else datetime.utcnow()
        anchor = datetime.combine(base.date(), calendar.day_start)

        rows = await db.execute(select(ProjectTask).where(ProjectTask.project_id == project_id))
        by_id: dict[uuid.UUID, ProjectTask] = {t.id: t for t in rows.scalars().all()}

        assignee_ids = {t.assigned_to for t in by_id.values() if t.assigned_to}
        persons_by_id: dict[uuid.UUID, Person] = {}
        if assignee_ids:
            person_rows = await db.execute(select(Person).where(Person.id.in_(assignee_ids)))
            persons_by_id = {p.id: p for p in person_rows.scalars().all()}

        cal_hpd = calendar.hours_per_day()

        # Duração planejada em HORAS de calendário: escala horas de projeto conforme
        # alocação do responsável (ex.: 10h projeto @ 5h/dia → 16h calendário = 2 dias).
        def duration_hours(t: ProjectTask) -> Optional[float]:
            if t.estimated_hours is not None and float(t.estimated_hours) > 0:
                raw = float(t.estimated_hours)
                person = persons_by_id.get(t.assigned_to) if t.assigned_to else None
                phpd = project_hours_per_day(person, calendar)
                return raw * (cal_hpd / phpd)
            if t.start_date is not None and t.due_date is not None:
                return calendar.working_hours_between(t.start_date, t.due_date)
            return None

        nodes = [
            EngineNode(
                id=t.id,
                parent_id=t.parent_task_id,
                order=t.order,
                duration_hours=duration_hours(t),
                tiebreak=t.created_at.isoformat() if t.created_at else "",
                assignee_id=t.assigned_to,
            )
            for t in by_id.values()
        ]

        dep_rows = await db.execute(
            select(
                ProjectTaskDependency.predecessor_id,
                ProjectTaskDependency.successor_id,
                ProjectTaskDependency.dep_type,
                ProjectTaskDependency.lag_hours,
            ).where(ProjectTaskDependency.project_id == project_id)
        )
        edges = [
            EngineEdge(predecessor=p, successor=s, dep_type=(dt or "FS"), lag_hours=float(lag or 0))
            for p, s, dt, lag in dep_rows.all()
        ]

        try:
            sched = schedule_tree(nodes, edges, root_id, anchor, calendar)
        except ScheduleCycleError:
            return  # Ciclo (não deveria ocorrer — criação já bloqueia); não reescala.

        now = datetime.utcnow()
        for tid, (s, e) in sched.items():
            t = by_id.get(tid)
            if t is None:
                continue
            if t.start_date != s or t.due_date != e:
                t.start_date = s
                t.due_date = e
                t.updated_at = now

        # Rollup de horas: assim como as datas, o pai herda a SOMA das horas estimadas dos
        # filhos (folhas mantêm a sua). O motor ignora horas de nós com filhos (usa min/max
        # das datas dos filhos), então isto é só consolidação para exibição/relatórios.
        children_map: dict[uuid.UUID, list[ProjectTask]] = {}
        for t in by_id.values():
            if t.parent_task_id is not None:
                children_map.setdefault(t.parent_task_id, []).append(t)

        def rollup_hours(tid: uuid.UUID) -> Decimal:
            t = by_id.get(tid)
            if t is None:
                return Decimal(0)
            kids = children_map.get(tid, [])
            if not kids:
                return t.estimated_hours if t.estimated_hours is not None else Decimal(0)
            total = sum((rollup_hours(k.id) for k in kids), Decimal(0))
            if t.estimated_hours != total:
                t.estimated_hours = total
                t.updated_at = now
            return total

        rollup_hours(root_id)

        # Rollup de progresso: o pai herda a média ponderada pelas horas do progresso das US
        # FOLHAS (folha = 100 se completed_at, senão percent_complete; peso = estimated_hours
        # ou 1). Mesma fórmula do Gantt (GanttPage.progressById) e do portfólio do PO.
        # Ao chegar a 100% o pai é marcado como concluído (completed_at); abaixo disso, reaberto.
        def rollup_progress(tid: uuid.UUID) -> tuple[float, float]:
            t = by_id.get(tid)
            if t is None:
                return (0.0, 0.0)
            kids = children_map.get(tid, [])
            if not kids:
                pct = 100.0 if t.completed_at is not None else float(t.percent_complete or 0)
                w = float(t.estimated_hours) if t.estimated_hours and float(t.estimated_hours) > 0 else 1.0
                return (pct * w, w)
            acc = 0.0
            wsum = 0.0
            for k in kids:
                a, w = rollup_progress(k.id)
                acc += a
                wsum += w
            pct = round(acc / wsum) if wsum > 0 else 0
            if t.percent_complete != pct:
                t.percent_complete = pct
                t.updated_at = now
            if pct >= 100 and t.completed_at is None:
                t.completed_at = now
                t.updated_at = now
            elif pct < 100 and t.completed_at is not None:
                t.completed_at = None
                t.updated_at = now
            return (acc, wsum)

        rollup_progress(root_id)

    @staticmethod
    async def critical_path(db: AsyncSession, project_id: uuid.UUID, root_id: uuid.UUID) -> list[dict]:
        """CPM (caminho crítico) da subárvore de `root_id`: backward pass + folgas sobre as datas
        JÁ persistidas (early schedule do motor). Sem escrever no banco. Retorna por tarefa:
        is_critical, total_float_hours, free_float_hours, late_start, late_finish."""
        root = await db.get(ProjectTask, root_id)
        if root is None:
            return []
        calendar = await load_calendar(db)
        rows = await db.execute(select(ProjectTask).where(ProjectTask.project_id == project_id))
        by_id: dict[uuid.UUID, ProjectTask] = {t.id: t for t in rows.scalars().all()}

        children: dict[uuid.UUID, list[uuid.UUID]] = {}
        for t in by_id.values():
            if t.parent_task_id:
                children.setdefault(t.parent_task_id, []).append(t.id)
        subtree: set[uuid.UUID] = set()
        stack = [root_id]
        while stack:
            cur = stack.pop()
            if cur in subtree:
                continue
            subtree.add(cur)
            stack.extend(children.get(cur, []))

        nodes = [
            EngineNode(
                id=t.id, parent_id=t.parent_task_id, order=t.order, duration_hours=None,
                tiebreak=t.created_at.isoformat() if t.created_at else "",
                assignee_id=t.assigned_to,
            )
            for t in by_id.values()
        ]
        dep_rows = await db.execute(
            select(
                ProjectTaskDependency.predecessor_id,
                ProjectTaskDependency.successor_id,
                ProjectTaskDependency.dep_type,
                ProjectTaskDependency.lag_hours,
            ).where(ProjectTaskDependency.project_id == project_id)
        )
        edges = [
            EngineEdge(predecessor=p, successor=s, dep_type=(dt or "FS"), lag_hours=float(lag or 0))
            for p, s, dt, lag in dep_rows.all()
        ]
        # Early schedule = datas persistidas, restritas à subárvore e com início+fim.
        sched = {
            t.id: (t.start_date, t.due_date)
            for t in by_id.values()
            if t.id in subtree and t.start_date is not None and t.due_date is not None
        }
        if root_id not in sched:
            return []
        cpm = compute_cpm(nodes, edges, root_id, sched, calendar)
        return [
            {
                "task_id": tid,
                "is_critical": r.is_critical,
                "total_float_hours": r.total_float_hours,
                "free_float_hours": r.free_float_hours,
                "late_start": r.late_start,
                "late_finish": r.late_finish,
            }
            for tid, r in cpm.items()
        ]

    @staticmethod
    async def delete(
        db: AsyncSession,
        project_id: uuid.UUID,
        task_id: uuid.UUID,
        current_user: Optional[User] = None,
    ) -> None:
        task = await ProjectTaskService.get(db, project_id, task_id)
        if current_user is not None:
            funnel_id = await ProjectTaskService._funnel_id_of_status(db, task.status_id)
            await ProjectTaskService._check_funnel_writable(
                db, funnel_id, current_user, task=task,
            )
        # Não permite excluir um item que tenha filhos abaixo (amarração para baixo) —
        # evita órfãos (o FK parent_task_id é SET NULL). Exclua os filhos primeiro.
        child_check = await db.execute(
            select(ProjectTask.id).where(ProjectTask.parent_task_id == task_id).limit(1)
        )
        if child_check.scalar_one_or_none():
            raise HTTPException(
                status_code=400,
                detail="Não é possível excluir um item que tem itens filhos. Exclua os filhos primeiro.",
            )
        await db.delete(task)
        await db.commit()


class ScheduleBaselineService:
    """Controle de baseline/travamento do cronograma (change-control).

    Estados (derivados do card-raiz de planejamento):
      - `open`     — schedule_committed_at IS NULL (antes do desenvolvimento): edição livre.
      - `revision` — schedule_revision_open = True: janela de edição aberta.
      - `locked`   — comprometido sem revisão aberta: edição de cronograma bloqueada.

    A entrada do card-raiz numa etapa `locks_schedule` grava `schedule_committed_at` (em
    ProjectTaskService.update). Para editar um cronograma travado é preciso salvar um baseline
    (snapshot atual + justificativa), o que abre a revisão; concluir a revisão re-trava.
    Read-mostly; só `save_baseline`/`close_revision` mutam estado."""

    @staticmethod
    def _state_of_root(root: ProjectTask) -> str:
        if root.schedule_committed_at is None:
            return "open"
        if root.schedule_revision_open:
            return "revision"
        return "locked"

    @staticmethod
    async def _get_root(db: AsyncSession, project_id: uuid.UUID, root_id: uuid.UUID) -> ProjectTask:
        res = await db.execute(
            select(ProjectTask).where(
                ProjectTask.id == root_id,
                ProjectTask.project_id == project_id,
            )
        )
        root = res.scalar_one_or_none()
        if root is None or root.planning_kind not in ("projeto", "programa"):
            raise HTTPException(status_code=404, detail="Projeto (card-raiz de planejamento) não encontrado.")
        return root

    @staticmethod
    async def assert_editable(db: AsyncSession, project_id: uuid.UUID, task_id: uuid.UUID) -> None:
        """Guard: bloqueia edição de cronograma quando o projeto está travado. Sobe até a raiz
        de planejamento e checa o estado. `open`/`revision` liberam; `locked` levanta 423."""
        root_id = await ProjectTaskService._planning_root_id(db, project_id, task_id)
        root = await db.get(ProjectTask, root_id)
        if root is None:
            return
        if ScheduleBaselineService._state_of_root(root) == "locked":
            raise HTTPException(
                status_code=423,
                detail="Cronograma travado (projeto em desenvolvimento). Salve um baseline com "
                       "justificativa para liberar a edição.",
            )

    @staticmethod
    def _state_payload(root: ProjectTask, count: int, latest: Optional[int]) -> dict:
        return {
            "root_task_id": str(root.id),
            "root_title": root.title,
            "state": ScheduleBaselineService._state_of_root(root),
            "committed_at": root.schedule_committed_at.isoformat() if root.schedule_committed_at else None,
            "revision_open": root.schedule_revision_open,
            "baseline_count": count or 0,
            "latest_version": latest,
        }

    @staticmethod
    async def lock_state(db: AsyncSession, project_id: uuid.UUID, root_id: uuid.UUID) -> dict:
        root = await ScheduleBaselineService._get_root(db, project_id, root_id)
        agg = await db.execute(
            select(func.count(), func.max(ProjectScheduleBaseline.version)).where(
                ProjectScheduleBaseline.root_task_id == root_id
            )
        )
        count, latest = agg.one()
        return ScheduleBaselineService._state_payload(root, count, latest)

    @staticmethod
    async def lock_state_for_task(db: AsyncSession, project_id: uuid.UUID, task_id: uuid.UUID) -> dict:
        """Estado da trava da raiz de planejamento à qual a tarefa pertence (resolve o root).
        Se a tarefa não tem raiz de planejamento, devolve estado 'open' (sem trava)."""
        root_id = await ProjectTaskService._planning_root_id(db, project_id, task_id)
        root = await db.get(ProjectTask, root_id)
        if root is None or root.planning_kind not in ("projeto", "programa"):
            return {
                "root_task_id": str(root_id), "root_title": root.title if root else None,
                "state": "open", "committed_at": None, "revision_open": False,
                "baseline_count": 0, "latest_version": None,
            }
        return await ScheduleBaselineService.lock_state(db, project_id, root_id)

    @staticmethod
    async def lock_states(db: AsyncSession, project_id: uuid.UUID) -> list[dict]:
        """Estado da trava de TODAS as raízes de planejamento do projeto (para a visão completa
        do cronograma). Uma query de contagem agregada — sem N+1."""
        res = await db.execute(
            select(ProjectTask).where(
                ProjectTask.project_id == project_id,
                ProjectTask.planning_kind.in_(["projeto", "programa"]),
            )
        )
        roots = list(res.scalars().all())
        if not roots:
            return []
        counts = await db.execute(
            select(
                ProjectScheduleBaseline.root_task_id, func.count(), func.max(ProjectScheduleBaseline.version)
            )
            .where(ProjectScheduleBaseline.root_task_id.in_([r.id for r in roots]))
            .group_by(ProjectScheduleBaseline.root_task_id)
        )
        by_root = {rid: (c, mx) for rid, c, mx in counts.all()}
        out = []
        for r in roots:
            c, mx = by_root.get(r.id, (0, None))
            out.append(ScheduleBaselineService._state_payload(r, c, mx))
        return out

    @staticmethod
    async def _build_snapshot(db: AsyncSession, project_id: uuid.UUID, root: ProjectTask) -> dict:
        """Snapshot imutável do cronograma da subárvore do root: tarefas (datas/horas/%/etapa,
        em DFS preorder com nível) + dependências internas."""
        tasks_res = await db.execute(
            select(ProjectTask)
            .where(ProjectTask.project_id == project_id)
            .options(selectinload(ProjectTask.status))
        )
        all_tasks = list(tasks_res.scalars().all())
        by_id = {t.id: t for t in all_tasks}
        children: dict = {}
        for t in all_tasks:
            if t.parent_task_id:
                children.setdefault(t.parent_task_id, []).append(t.id)

        # Nomes dos responsáveis (assigned_to = Person.id) para o diff "troca de responsável".
        person_ids = {t.assigned_to for t in all_tasks if t.assigned_to}
        person_name: dict = {}
        if person_ids:
            prows = await db.execute(
                select(Person.id, Person.full_name).where(Person.id.in_(person_ids))
            )
            person_name = {pid: name for pid, name in prows.all()}

        snap_tasks: list = []
        sub_ids: list = []

        def walk(tid, level):
            t = by_id.get(tid)
            if t is None:
                return
            sub_ids.append(tid)
            snap_tasks.append({
                "task_id": str(t.id), "title": t.title, "level": level,
                "parent_task_id": str(t.parent_task_id) if t.parent_task_id else None,
                "start_date": t.start_date.isoformat() if t.start_date else None,
                "due_date": t.due_date.isoformat() if t.due_date else None,
                "estimated_hours": float(t.estimated_hours) if t.estimated_hours is not None else None,
                "percent_complete": t.percent_complete or 0,
                "status_name": t.status.name if t.status else None,
                "assigned_to": str(t.assigned_to) if t.assigned_to else None,
                "assigned_to_name": person_name.get(t.assigned_to),
            })
            for c in sorted(children.get(tid, []), key=lambda k: (by_id[k].order or 0, by_id[k].title or "")):
                walk(c, level + 1)

        walk(root.id, 0)
        sub_set = set(sub_ids)

        deps_res = await db.execute(
            select(ProjectTaskDependency).where(ProjectTaskDependency.project_id == project_id)
        )
        snap_deps = [
            {
                "predecessor_id": str(d.predecessor_id), "successor_id": str(d.successor_id),
                "dep_type": d.dep_type, "lag_hours": float(d.lag_hours or 0),
            }
            for d in deps_res.scalars().all()
            if d.predecessor_id in sub_set and d.successor_id in sub_set
        ]
        return {"tasks": snap_tasks, "dependencies": snap_deps}

    @staticmethod
    async def save_baseline(
        db: AsyncSession,
        project_id: uuid.UUID,
        root_id: uuid.UUID,
        justification: str,
        user_id: Optional[uuid.UUID],
    ) -> ProjectScheduleBaseline:
        """Salva o baseline (snapshot atual + justificativa) e ABRE a janela de revisão.
        Só é permitido quando o cronograma está `locked`."""
        root = await ScheduleBaselineService._get_root(db, project_id, root_id)
        state = ScheduleBaselineService._state_of_root(root)
        if state == "open":
            raise HTTPException(
                status_code=400,
                detail="O cronograma ainda não foi comprometido (projeto não entrou em desenvolvimento).",
            )
        if state == "revision":
            raise HTTPException(
                status_code=409,
                detail="Já existe uma revisão aberta. Conclua a revisão atual antes de salvar um novo baseline.",
            )
        justification = (justification or "").strip()
        if len(justification) < 3:
            raise HTTPException(status_code=400, detail="Informe uma justificativa para a alteração do cronograma.")
        snapshot = await ScheduleBaselineService._build_snapshot(db, project_id, root)
        max_v = await db.execute(
            select(func.max(ProjectScheduleBaseline.version)).where(
                ProjectScheduleBaseline.root_task_id == root_id
            )
        )
        version = (max_v.scalar() or 0) + 1
        baseline = ProjectScheduleBaseline(
            project_id=project_id, root_task_id=root_id, version=version,
            justification=justification, snapshot=snapshot, created_by=user_id,
        )
        db.add(baseline)
        root.schedule_revision_open = True
        root.updated_at = datetime.utcnow()
        await db.commit()
        await db.refresh(baseline)
        return baseline

    @staticmethod
    async def close_revision(db: AsyncSession, project_id: uuid.UUID, root_id: uuid.UUID) -> ProjectTask:
        """Conclui a revisão e RE-TRAVA o cronograma. Próxima alteração exige novo baseline."""
        root = await ScheduleBaselineService._get_root(db, project_id, root_id)
        if not root.schedule_revision_open:
            raise HTTPException(status_code=400, detail="Não há revisão aberta para concluir.")
        root.schedule_revision_open = False
        root.updated_at = datetime.utcnow()
        await db.commit()
        await db.refresh(root)
        return root

    @staticmethod
    async def list_baselines(
        db: AsyncSession, project_id: uuid.UUID, root_id: uuid.UUID
    ) -> list[ProjectScheduleBaseline]:
        res = await db.execute(
            select(ProjectScheduleBaseline)
            .where(
                ProjectScheduleBaseline.project_id == project_id,
                ProjectScheduleBaseline.root_task_id == root_id,
            )
            .order_by(ProjectScheduleBaseline.version.desc())
        )
        return list(res.scalars().all())


class TaskDependencyService:
    """Dependências entre tarefas do cronograma (FS por ora). A criação valida ciclo no
    grafo de dependências e dispara o auto-scheduling das sucessoras."""

    @staticmethod
    async def list(db: AsyncSession, project_id: uuid.UUID) -> list[ProjectTaskDependency]:
        result = await db.execute(
            select(ProjectTaskDependency)
            .where(ProjectTaskDependency.project_id == project_id)
            .order_by(ProjectTaskDependency.created_at.asc())
        )
        return list(result.scalars().all())

    @staticmethod
    async def _task_in_project(db: AsyncSession, project_id: uuid.UUID, task_id: uuid.UUID) -> ProjectTask:
        res = await db.execute(
            select(ProjectTask).where(
                ProjectTask.id == task_id,
                ProjectTask.project_id == project_id,
            )
        )
        task = res.scalar_one_or_none()
        if task is None:
            raise HTTPException(status_code=400, detail="Tarefa não encontrada neste projeto.")
        return task

    @staticmethod
    async def _would_cycle(
        db: AsyncSession,
        project_id: uuid.UUID,
        predecessor_id: uuid.UUID,
        successor_id: uuid.UUID,
    ) -> bool:
        """Adicionar predecessor→successor cria ciclo se, partindo de successor pelas
        arestas existentes, conseguimos alcançar predecessor."""
        rows = await db.execute(
            select(
                ProjectTaskDependency.predecessor_id,
                ProjectTaskDependency.successor_id,
            ).where(ProjectTaskDependency.project_id == project_id)
        )
        succ_by_pred: dict[uuid.UUID, list[uuid.UUID]] = {}
        for pred_id, succ_id in rows.all():
            succ_by_pred.setdefault(pred_id, []).append(succ_id)
        stack = [successor_id]
        visited: set[uuid.UUID] = set()
        while stack:
            cur = stack.pop()
            if cur == predecessor_id:
                return True
            if cur in visited:
                continue
            visited.add(cur)
            stack.extend(succ_by_pred.get(cur, []))
        return False

    @staticmethod
    async def create(
        db: AsyncSession,
        project_id: uuid.UUID,
        data: TaskDependencyCreate,
    ) -> ProjectTaskDependency:
        if data.predecessor_id == data.successor_id:
            raise HTTPException(status_code=400, detail="Uma tarefa não pode depender de si mesma.")
        await TaskDependencyService._task_in_project(db, project_id, data.predecessor_id)
        await TaskDependencyService._task_in_project(db, project_id, data.successor_id)
        # Criar dependência altera o cronograma → bloqueado se o projeto estiver travado.
        await ScheduleBaselineService.assert_editable(db, project_id, data.successor_id)
        if await TaskDependencyService._would_cycle(db, project_id, data.predecessor_id, data.successor_id):
            raise HTTPException(status_code=400, detail="Esta dependência criaria um ciclo entre as tarefas.")
        dep = ProjectTaskDependency(
            project_id=project_id,
            predecessor_id=data.predecessor_id,
            successor_id=data.successor_id,
            dep_type=data.dep_type,
            lag_hours=data.lag_hours,
        )
        db.add(dep)
        try:
            await db.flush()
        except IntegrityError:
            await db.rollback()
            raise HTTPException(status_code=400, detail="Esta dependência já existe.")
        # Nova predecessora recalcula a subárvore do cronograma da sucessora.
        root_id = await ProjectTaskService._planning_root_id(db, project_id, data.successor_id)
        await ProjectTaskService._reschedule_root(db, project_id, root_id)
        await db.commit()
        await db.refresh(dep)
        return dep

    @staticmethod
    async def delete(db: AsyncSession, project_id: uuid.UUID, dep_id: uuid.UUID) -> None:
        res = await db.execute(
            select(ProjectTaskDependency).where(
                ProjectTaskDependency.id == dep_id,
                ProjectTaskDependency.project_id == project_id,
            )
        )
        dep = res.scalar_one_or_none()
        if dep is None:
            raise HTTPException(status_code=404, detail="Dependência não encontrada.")
        succ_id = dep.successor_id
        # Remover dependência altera o cronograma → bloqueado se o projeto estiver travado.
        await ScheduleBaselineService.assert_editable(db, project_id, succ_id)
        await db.delete(dep)
        await db.flush()
        # Remover a predecessora pode liberar a sucessora para mais cedo: recalcula a subárvore.
        root_id = await ProjectTaskService._planning_root_id(db, project_id, succ_id)
        await ProjectTaskService._reschedule_root(db, project_id, root_id)
        await db.commit()

    @staticmethod
    async def compute_workload(
        db: AsyncSession,
        project_id: uuid.UUID,
        date_from: Optional[date] = None,
        date_to: Optional[date] = None,
        unit: str = "day",
    ) -> list[WorkloadCell]:
        """Distribui as horas estimadas pelos DIAS ÚTEIS do calendário corporativo (pula
        fim de semana e feriados) e agrega por (responsável, dia). A capacidade por dia vem da
        jornada da Pessoa (Person.daily_hours) e é reduzida pelas Ausências aprovadas que afetam
        a capacidade (dia inteiro → 0, ou menos as horas parciais). Superlotação = alocado > capacidade.

        A matemática vive em CapacityService (reutilizada pelo cockpit cross-project e pelo
        futuro simulador what-if). Esta rota apenas restringe ao projeto."""
        calendar = await load_calendar(db)
        result = await db.execute(
            select(ProjectTask).where(
                ProjectTask.project_id == project_id,
                ProjectTask.assigned_to.isnot(None),
                ProjectTask.start_date.isnot(None),
                ProjectTask.due_date.isnot(None),
                ProjectTask.estimated_hours.isnot(None),
            )
        )
        tasks = list(result.scalars().all())
        acc, _by_project, user_ids = CapacityService._distribute_hours(tasks, calendar, date_from, date_to)
        capacity_for = await CapacityService._capacity_resolver(db, user_ids, calendar)
        return CapacityService._build_cells(acc, capacity_for)

    @staticmethod
    async def assignee_absences(
        db: AsyncSession,
        project_id: uuid.UUID,
        today: Optional[date] = None,
    ) -> dict[uuid.UUID, list[tuple[date, date, str, Optional[float], str]]]:
        """Ausências APROVADAS e PENDENTES (que afetam capacidade) dos responsáveis das
        tarefas do projeto, com end_date >= hoje. assigned_to == Person.id (responsável é Pessoa).
        Cada item é (start, end, type_name, partial_hours, status) — aprovada é risco
        confirmado; pendente é aviso/atenção. Chave do dict = person_id (== assigned_to)."""
        today = today or date.today()
        res = await db.execute(
            select(ProjectTask.assigned_to)
            .where(ProjectTask.project_id == project_id, ProjectTask.assigned_to.isnot(None))
            .distinct()
        )
        person_ids = {r for (r,) in res.all() if r is not None}
        out: dict[uuid.UUID, list[tuple[date, date, str, Optional[float], str]]] = {}
        if not person_ids:
            return out
        rows = (await db.execute(
            select(Absence, AbsenceType.name)
            .join(AbsenceType, Absence.absence_type_id == AbsenceType.id)
            .where(
                Absence.person_id.in_(person_ids),
                Absence.status.in_([AbsenceStatus.APROVADA, AbsenceStatus.PENDENTE]),
                AbsenceType.affects_capacity.is_(True),
                Absence.end_date >= today,
            )
        )).all()
        for ab, type_name in rows:
            partial = float(ab.partial_hours) if ab.partial_hours is not None else None
            status = ab.status.value if hasattr(ab.status, "value") else str(ab.status)
            out.setdefault(ab.person_id, []).append((ab.start_date, ab.end_date, type_name, partial, status))
        return out


class CapacityService:
    """Cockpit de planejamento de capacidade: cruza a demanda estimada de TODO o portfólio
    do tenant (schema atual) com a capacidade real das pessoas, descontando ausências e
    feriados. Reaproveita a mesma matemática do workload por-projeto
    (TaskDependencyService.compute_workload delega para os helpers daqui)."""

    # ── Núcleo reutilizável (também alimentará o simulador what-if) ──
    @staticmethod
    def _distribute_hours(
        tasks: list[ProjectTask],
        calendar,
        date_from: Optional[date],
        date_to: Optional[date],
    ) -> tuple[
        dict[tuple[uuid.UUID, date], float],
        dict[tuple[uuid.UUID, uuid.UUID, date], float],
        set[uuid.UUID],
    ]:
        """Espalha estimated_hours de cada tarefa pelos dias úteis cobertos, agregando por
        (pessoa, dia) e por (projeto, pessoa, dia). Recorta pela janela [date_from, date_to].
        Retorna (acc_por_pessoa_dia, acc_por_projeto_pessoa_dia, person_ids)."""
        acc: dict[tuple[uuid.UUID, date], float] = {}
        by_project: dict[tuple[uuid.UUID, uuid.UUID, date], float] = {}
        user_ids: set[uuid.UUID] = set()
        for t in tasks:
            hours = float(t.estimated_hours or 0)
            if hours <= 0:
                continue
            # Dias úteis (calendário) cobertos pela tarefa.
            work_days: list[date] = []
            cur = t.start_date
            while cur.date() <= t.due_date.date():
                if calendar.is_working_day(cur.date()):
                    work_days.append(cur.date())
                cur = cur + timedelta(days=1)
            if not work_days:
                continue
            per_day = hours / len(work_days)
            for d in work_days:
                if (date_from is None or d >= date_from) and (date_to is None or d <= date_to):
                    acc[(t.assigned_to, d)] = acc.get((t.assigned_to, d), 0.0) + per_day
                    key = (t.project_id, t.assigned_to, d)
                    by_project[key] = by_project.get(key, 0.0) + per_day
            user_ids.add(t.assigned_to)
        return acc, by_project, user_ids

    @staticmethod
    async def _capacity_resolver(db: AsyncSession, user_ids: set[uuid.UUID], calendar):
        """Monta capacity_for(person_id, dia) → horas de capacidade de projeto no dia,
        descontando ausências APROVADAS que afetam capacidade. person_id == assigned_to
        (responsável é Pessoa do teamops); assignees sem Person caem na jornada padrão."""
        default_cap = calendar.hours_per_day()
        daily_by_user: dict[uuid.UUID, float] = {}
        absences_by_user: dict[uuid.UUID, list[tuple[date, date, Optional[float]]]] = {}
        if user_ids:
            persons = (await db.execute(select(Person).where(Person.id.in_(user_ids)))).scalars().all()
            for p in persons:
                daily_by_user[p.id] = project_hours_per_day(p, calendar)
            person_ids = [p.id for p in persons]
            if person_ids:
                abs_rows = (await db.execute(
                    select(Absence, AbsenceType.affects_capacity)
                    .join(AbsenceType, Absence.absence_type_id == AbsenceType.id)
                    .where(
                        Absence.person_id.in_(person_ids),
                        Absence.status == AbsenceStatus.APROVADA,
                        AbsenceType.affects_capacity.is_(True),
                    )
                )).all()
                for ab, _affects in abs_rows:
                    partial = float(ab.partial_hours) if ab.partial_hours is not None else None
                    absences_by_user.setdefault(ab.person_id, []).append((ab.start_date, ab.end_date, partial))

        def capacity_for(user_id: uuid.UUID, d: date) -> float:
            if not calendar.is_working_day(d):
                return 0.0
            cap = daily_by_user.get(user_id, default_cap)
            for s, e, partial in absences_by_user.get(user_id, []):
                if s <= d <= e:
                    cap = max(0.0, cap - partial) if partial is not None else 0.0
            return cap

        return capacity_for

    @staticmethod
    def _build_cells(acc: dict[tuple[uuid.UUID, date], float], capacity_for) -> list[WorkloadCell]:
        cells: list[WorkloadCell] = []
        for (user_id, d), allocated in sorted(acc.items(), key=lambda kv: (str(kv[0][0]), kv[0][1])):
            capacity = capacity_for(user_id, d)
            cells.append(WorkloadCell(
                user_id=user_id,
                date=d,
                allocated_hours=round(allocated, 2),
                capacity_hours=round(capacity, 2),
                overallocated=allocated > capacity + 1e-6,
            ))
        return cells

    @staticmethod
    async def _select_tasks_in_window(
        db: AsyncSession,
        date_from: date,
        date_to: date,
        person_ids: Optional[list[uuid.UUID]] = None,
    ) -> list[ProjectTask]:
        """Todas as tarefas agendadas do tenant que cruzam a janela. O filtro de datas é
        empurrado para o SQL (importa quando se varre o portfólio inteiro)."""
        lower = datetime.combine(date_from, datetime.min.time())
        upper = datetime.combine(date_to, datetime.min.time()) + timedelta(days=1)
        q = select(ProjectTask).where(
            ProjectTask.assigned_to.isnot(None),
            ProjectTask.start_date.isnot(None),
            ProjectTask.due_date.isnot(None),
            ProjectTask.estimated_hours.isnot(None),
            ProjectTask.due_date >= lower,
            ProjectTask.start_date < upper,
        )
        if person_ids:
            q = q.where(ProjectTask.assigned_to.in_(person_ids))
        return list((await db.execute(q)).scalars().all())

    @staticmethod
    async def _root_index(db: AsyncSession):
        """Grafo de cards → (root_of, root_title). O 'projeto' de verdade (no kanban) é o card-raiz
        de planejamento: sobe `parent_task_id` até `planning_kind in ('projeto','programa')`
        (senão o ancestral mais alto). NÃO é a entidade Project ('TD'), que é só o container."""
        graph = (await db.execute(
            select(ProjectTask.id, ProjectTask.parent_task_id, ProjectTask.planning_kind, ProjectTask.title)
        )).all()
        parent: dict[uuid.UUID, Optional[uuid.UUID]] = {}
        kind: dict[uuid.UUID, Optional[str]] = {}
        title: dict[uuid.UUID, str] = {}
        for tid, pid, pk, ttl in graph:
            parent[tid] = pid
            kind[tid] = pk
            title[tid] = ttl
        ROOT_KINDS = ("projeto", "programa")
        cache: dict[uuid.UUID, uuid.UUID] = {}

        def root_of(tid: uuid.UUID) -> uuid.UUID:
            seen: list[uuid.UUID] = []
            cur: Optional[uuid.UUID] = tid
            r = tid
            while cur is not None:
                if cur in cache:
                    r = cache[cur]
                    break
                seen.append(cur)
                if kind.get(cur) in ROOT_KINDS:
                    r = cur
                    break
                nxt = parent.get(cur)
                if nxt is None or nxt == cur or nxt in seen:
                    r = cur
                    break
                cur = nxt
            for s in seen:
                cache[s] = r
            return r

        def root_title(rid: uuid.UUID) -> str:
            return title.get(rid) or "—"

        return root_of, root_title

    @staticmethod
    def _distribute_detail(tasks, calendar, date_from: Optional[date], date_to: Optional[date]):
        """Como _distribute_hours, mas guarda por (pessoa, dia) a lista de (tarefa, horas_no_dia) —
        base para o detalhamento do tooltip e para agregar por card-raiz (projeto/programa)."""
        from collections import defaultdict

        detail: dict[tuple[uuid.UUID, date], list[tuple]] = defaultdict(list)
        acc: dict[tuple[uuid.UUID, date], float] = defaultdict(float)
        user_ids: set[uuid.UUID] = set()
        for t in tasks:
            hours = float(t.estimated_hours or 0)
            if hours <= 0:
                continue
            work_days: list[date] = []
            cur = t.start_date
            while cur.date() <= t.due_date.date():
                if calendar.is_working_day(cur.date()):
                    work_days.append(cur.date())
                cur = cur + timedelta(days=1)
            if not work_days:
                continue
            per_day = hours / len(work_days)
            for d in work_days:
                if (date_from is None or d >= date_from) and (date_to is None or d <= date_to):
                    detail[(t.assigned_to, d)].append((t, per_day))
                    acc[(t.assigned_to, d)] += per_day
            user_ids.add(t.assigned_to)
        return detail, dict(acc), user_ids

    # ── Lente por PESSOA (heatmap cross-project) ──
    @staticmethod
    async def compute_capacity_heatmap(
        db: AsyncSession,
        date_from: date,
        date_to: date,
        unit: str = "week",
        area_id: Optional[uuid.UUID] = None,
        position_slug: Optional[str] = None,
        person_ids: Optional[list[uuid.UUID]] = None,
    ) -> CapacityHeatmapResponse:
        calendar = await load_calendar(db)
        tasks = await CapacityService._select_tasks_in_window(db, date_from, date_to, person_ids)
        acc, _by_project, all_ids = CapacityService._distribute_hours(tasks, calendar, date_from, date_to)

        # Resolve pessoas (+ áreas) e aplica filtros de área/cargo. Assignees sem Person = "unmapped".
        persons_by_id: dict[uuid.UUID, Person] = {}
        if all_ids:
            persons = (await db.execute(
                select(Person).options(selectinload(Person.areas)).where(Person.id.in_(all_ids))
            )).scalars().all()
            persons_by_id = {p.id: p for p in persons}
        unmapped = sorted(str(uid) for uid in all_ids if uid not in persons_by_id)

        def person_allowed(uid: uuid.UUID) -> bool:
            p = persons_by_id.get(uid)
            if p is None:
                return False  # sem Person nunca casa filtro de área/cargo
            if position_slug and (p.position is None or p.position.slug != position_slug):
                return False
            if area_id and area_id not in {a.id for a in p.areas}:
                return False
            return True

        if position_slug or area_id:
            acc = {k: v for k, v in acc.items() if person_allowed(k[0])}

        present_ids = {k[0] for k in acc}
        capacity_for = await CapacityService._capacity_resolver(db, present_ids, calendar)
        cells = CapacityService._build_cells(acc, capacity_for)
        await CapacityService._attach_breakdown(db, cells, tasks, calendar, date_from, date_to)
        return CapacityService._assemble_heatmap(cells, persons_by_id, unmapped)

    @staticmethod
    async def _attach_breakdown(db, cells, tasks, calendar, date_from: date, date_to: date) -> None:
        """Anexa a cada célula a lista de demandas (projeto · tarefa · horas no dia) que compõem
        a carga — alimenta o tooltip do heatmap. 'Projeto' = card-raiz de planejamento
        (projeto/programa) da tarefa, não a entidade Project ('TD')."""
        root_of, root_title = await CapacityService._root_index(db)
        detail, _acc, _ids = CapacityService._distribute_detail(tasks, calendar, date_from, date_to)
        for c in cells:
            items = sorted(detail.get((c.user_id, c.date), []), key=lambda x: x[1], reverse=True)
            c.items = [
                WorkloadCellItem(project_name=root_title(root_of(t.id)), task_title=t.title, hours=round(h, 2))
                for (t, h) in items
            ]

    @staticmethod
    def _assemble_heatmap(
        cells: list[WorkloadCell],
        persons_by_id: dict[uuid.UUID, Person],
        unmapped: list[str],
        virtual_meta: Optional[dict[uuid.UUID, CapacityPersonMeta]] = None,
    ) -> CapacityHeatmapResponse:
        """Monta CapacityHeatmapResponse (meta de pessoas + summary) a partir das células.
        `virtual_meta` injeta pessoas sintéticas (freelancers do simulador)."""
        virtual_meta = virtual_meta or {}
        present_ids = {c.user_id for c in cells}
        persons_meta: list[CapacityPersonMeta] = []
        for uid in present_ids:
            if uid in virtual_meta:
                persons_meta.append(virtual_meta[uid])
                continue
            p = persons_by_id.get(uid)
            if p is None:
                continue
            persons_meta.append(CapacityPersonMeta(
                id=p.id,
                full_name=p.full_name,
                position_slug=(p.position.slug if p.position else None),
                position_label=(p.position.name if p.position else None),
                area_ids=[a.id for a in p.areas],
            ))
        persons_meta.sort(key=lambda m: m.full_name.lower())
        summary = CapacitySummary(
            overallocated_cells=sum(1 for c in cells if c.overallocated),
            persons_over=len({c.user_id for c in cells if c.overallocated}),
            total_capacity_h=round(sum(c.capacity_hours for c in cells), 2),
            total_allocated_h=round(sum(c.allocated_hours for c in cells), 2),
            unmapped_assignees=unmapped,
        )
        return CapacityHeatmapResponse(unit="day", cells=cells, persons=persons_meta, summary=summary)

    # ── Lente por PROJETO (viabilidade) ──
    @staticmethod
    async def compute_capacity_by_project(
        db: AsyncSession,
        date_from: date,
        date_to: date,
        area_id: Optional[uuid.UUID] = None,
    ) -> CapacityByProjectResponse:
        calendar = await load_calendar(db)
        tasks = await CapacityService._select_tasks_in_window(db, date_from, date_to)
        detail, acc, all_ids = CapacityService._distribute_detail(tasks, calendar, date_from, date_to)
        root_of, root_title = await CapacityService._root_index(db)

        # Filtro opcional por área (restringe às pessoas da área).
        allowed_ids: Optional[set[uuid.UUID]] = None
        if area_id and all_ids:
            persons = (await db.execute(
                select(Person).options(selectinload(Person.areas)).where(Person.id.in_(all_ids))
            )).scalars().all()
            allowed_ids = {p.id for p in persons if area_id in {a.id for a in p.areas}}

        capacity_for = await CapacityService._capacity_resolver(db, all_ids, calendar)
        # Sobrecarga GLOBAL por (pessoa, dia) — capacidade é compartilhada entre projetos.
        overloaded_cell = {
            (uid, d) for (uid, d), alloc in acc.items() if alloc > capacity_for(uid, d) + 1e-6
        }
        window_days = [date_from + timedelta(days=i) for i in range((date_to - date_from).days + 1)]
        person_cap_total: dict[uuid.UUID, float] = {
            uid: sum(capacity_for(uid, d) for d in window_days) for uid in all_ids
        }

        # Agrega por CARD-RAIZ (projeto/programa), não pela entidade Project.
        proj_demand: dict[uuid.UUID, float] = {}
        proj_people: dict[uuid.UUID, set[uuid.UUID]] = {}
        proj_overloaded: dict[uuid.UUID, set[uuid.UUID]] = {}
        for (uid, d), items in detail.items():
            if allowed_ids is not None and uid not in allowed_ids:
                continue
            over = (uid, d) in overloaded_cell
            for (t, h) in items:
                rid = root_of(t.id)
                proj_demand[rid] = proj_demand.get(rid, 0.0) + h
                proj_people.setdefault(rid, set()).add(uid)
                if over:
                    proj_overloaded.setdefault(rid, set()).add(uid)

        result_rows: list[CapacityProjectRow] = []
        for rid, demand in proj_demand.items():
            people = proj_people.get(rid, set())
            cap = sum(person_cap_total.get(uid, 0.0) for uid in people)
            result_rows.append(CapacityProjectRow(
                project_id=rid,
                project_name=root_title(rid),
                demand_hours=round(demand, 2),
                capacity_hours=round(cap, 2),
                people_count=len(people),
                overloaded_people=len(proj_overloaded.get(rid, set())),
                overallocated=demand > cap + 1e-6,
            ))
        result_rows.sort(key=lambda r: r.demand_hours, reverse=True)
        return CapacityByProjectResponse(rows=result_rows)

    # ── Fase 1: detecção de gargalos e finder de pessoas livres ──
    _STACK_ORDER = {
        StackLevel.BASICO: 0,
        StackLevel.JUNIOR: 1,
        StackLevel.PLENO: 2,
        StackLevel.SENIOR: 3,
        StackLevel.ESPECIALISTA: 4,
        StackLevel.REFERENCIA: 5,
    }

    @staticmethod
    def _work_days(calendar, date_from: date, date_to: date) -> list[date]:
        return [
            d
            for d in (date_from + timedelta(days=i) for i in range((date_to - date_from).days + 1))
            if calendar.is_working_day(d)
        ]

    @staticmethod
    async def _next_absences(
        db: AsyncSession, person_ids: set[uuid.UUID], since: date
    ) -> dict[uuid.UUID, str]:
        """Próxima ausência (aprovada/pendente, afeta capacidade, end >= since) por pessoa,
        já formatada. Ordenado por start_date, então a primeira por pessoa é a mais próxima."""
        out: dict[uuid.UUID, str] = {}
        if not person_ids:
            return out
        rows = (await db.execute(
            select(Absence, AbsenceType.name)
            .join(AbsenceType, Absence.absence_type_id == AbsenceType.id)
            .where(
                Absence.person_id.in_(person_ids),
                Absence.status.in_([AbsenceStatus.APROVADA, AbsenceStatus.PENDENTE]),
                AbsenceType.affects_capacity.is_(True),
                Absence.end_date >= since,
            )
            .order_by(Absence.start_date.asc())
        )).all()
        for ab, type_name in rows:
            if ab.person_id in out:
                continue
            out[ab.person_id] = f"{ab.start_date.isoformat()} a {ab.end_date.isoformat()} ({type_name})"
        return out

    @staticmethod
    async def find_available_people(
        db: AsyncSession,
        date_from: date,
        date_to: date,
        position_slug: Optional[str] = None,
        area_id: Optional[uuid.UUID] = None,
        stack_id: Optional[uuid.UUID] = None,
        min_level: Optional[StackLevel] = None,
        min_free_hours: float = 0.0,
    ) -> FreePeopleResponse:
        """Pessoas ATIVAS com folga de capacidade no período (capacidade − alocação, descontando
        férias), opcionalmente filtradas por cargo, área e skill (com nível mínimo). Ordena por
        folga desc — o topo é quem o PO pode puxar para o projeto / de outros times."""
        calendar = await load_calendar(db)
        tasks = await CapacityService._select_tasks_in_window(db, date_from, date_to)
        acc, _bp, _ids = CapacityService._distribute_hours(tasks, calendar, date_from, date_to)

        persons = list((await db.execute(
            select(Person)
            .options(
                selectinload(Person.areas),
                selectinload(Person.stacks).selectinload(PersonStack.stack),
            )
            .where(Person.status == PersonStatus.ATIVO)
        )).scalars().all())

        def matches(p: Person) -> bool:
            if position_slug and (p.position is None or p.position.slug != position_slug):
                return False
            if area_id and area_id not in {a.id for a in p.areas}:
                return False
            if stack_id:
                have = [ps for ps in p.stacks if ps.stack_id == stack_id]
                if not have:
                    return False
                if min_level is not None:
                    need = CapacityService._STACK_ORDER.get(min_level, 0)
                    if not any(CapacityService._STACK_ORDER.get(ps.level, 0) >= need for ps in have):
                        return False
            return True

        persons = [p for p in persons if matches(p)]
        pids = {p.id for p in persons}
        capacity_for = await CapacityService._capacity_resolver(db, pids, calendar)
        work_days = CapacityService._work_days(calendar, date_from, date_to)
        next_abs = await CapacityService._next_absences(db, pids, date_from)

        rows: list[FreePersonRow] = []
        for p in persons:
            cap_total = alloc_total = free_total = 0.0
            free_days = 0
            for d in work_days:
                cap = capacity_for(p.id, d)
                alloc = acc.get((p.id, d), 0.0)
                cap_total += cap
                alloc_total += alloc
                free = cap - alloc
                if free > 1e-6:
                    free_total += free
                    free_days += 1
            if free_total < min_free_hours - 1e-6:
                continue
            util = (alloc_total / cap_total * 100.0) if cap_total > 0 else 0.0
            rows.append(FreePersonRow(
                person_id=p.id,
                full_name=p.full_name,
                position_slug=(p.position.slug if p.position else None),
                position_label=(p.position.name if p.position else None),
                area_ids=[a.id for a in p.areas],
                stacks=[ps.stack.name for ps in p.stacks if ps.stack],
                capacity_hours_total=round(cap_total, 2),
                allocated_hours_total=round(alloc_total, 2),
                free_hours_total=round(free_total, 2),
                free_days=free_days,
                utilization_pct=round(util, 1),
                next_absence=next_abs.get(p.id),
            ))
        rows.sort(key=lambda r: r.free_hours_total, reverse=True)
        return FreePeopleResponse(rows=rows)

    @staticmethod
    async def detect_bottlenecks(
        db: AsyncSession,
        date_from: date,
        date_to: date,
        group_by: str = "position",
    ) -> CapacityGapsResponse:
        """Agrega capacidade × demanda por cargo (ou área) em janelas SEMANAIS. Onde a demanda do
        grupo excede a capacidade numa semana, acumula o déficit e sugere reforço (headcount) para
        cobrir o pico — o sinal de 'preciso de freela/contratação'."""
        calendar = await load_calendar(db)
        tasks = await CapacityService._select_tasks_in_window(db, date_from, date_to)
        acc, _bp, _ids = CapacityService._distribute_hours(tasks, calendar, date_from, date_to)

        persons = list((await db.execute(
            select(Person).options(selectinload(Person.areas)).where(Person.status == PersonStatus.ATIVO)
        )).scalars().all())
        pids = {p.id for p in persons}
        capacity_for = await CapacityService._capacity_resolver(db, pids, calendar)

        work_days = CapacityService._work_days(calendar, date_from, date_to)
        monday = lambda d: d - timedelta(days=d.weekday())  # noqa: E731
        weeks = sorted({monday(d) for d in work_days})
        workdays_in_week: dict[date, int] = {}
        for d in work_days:
            workdays_in_week[monday(d)] = workdays_in_week.get(monday(d), 0) + 1

        # Pessoa → grupo(s).
        groups: dict[str, dict] = {}
        if group_by == "area":
            area_names = {aid: name for aid, name in (await db.execute(select(Area.id, Area.name))).all()}
            for p in persons:
                for a in p.areas:
                    g = groups.setdefault(str(a.id), {"label": area_names.get(a.id, "—"), "members": set()})
                    g["members"].add(p.id)
            gtype = "area"
        else:
            for p in persons:
                if p.position is None:
                    continue
                g = groups.setdefault(p.position.slug, {"label": p.position.name, "members": set()})
                g["members"].add(p.id)
            gtype = "position"

        rows: list[CapacityGapRow] = []
        for key, g in groups.items():
            members = g["members"]
            cap_week = {w: 0.0 for w in weeks}
            alloc_week = {w: 0.0 for w in weeks}
            for pid in members:
                for d in work_days:
                    w = monday(d)
                    cap_week[w] += capacity_for(pid, d)
                    alloc_week[w] += acc.get((pid, d), 0.0)
            deficit_total = peak_def = cap_total = alloc_total = 0.0
            peak_w: Optional[date] = None
            for w in weeks:
                cap_total += cap_week[w]
                alloc_total += alloc_week[w]
                dfc = alloc_week[w] - cap_week[w]
                if dfc > 1e-6:
                    deficit_total += dfc
                    if dfc > peak_def:
                        peak_def, peak_w = dfc, w
            if deficit_total <= 1e-6:
                continue
            ref_week_cap = calendar.hours_per_day() * workdays_in_week.get(peak_w, 5)
            headcount = int(math.ceil(peak_def / ref_week_cap)) if ref_week_cap > 0 else 0
            rows.append(CapacityGapRow(
                group_type=gtype,
                group_key=key,
                group_label=g["label"],
                people_count=len(members),
                capacity_hours=round(cap_total, 2),
                allocated_hours=round(alloc_total, 2),
                deficit_hours=round(deficit_total, 2),
                peak_week=(peak_w.isoformat() if peak_w else None),
                peak_deficit_hours=round(peak_def, 2),
                suggested_headcount=headcount,
            ))
        rows.sort(key=lambda r: r.deficit_hours, reverse=True)
        return CapacityGapsResponse(rows=rows)

    # ── Fase 2: simulador de cenários (what-if efêmero) ──
    @staticmethod
    async def list_simulatable_tasks(
        db: AsyncSession, date_from: date, date_to: date
    ) -> SimTasksResponse:
        """Tarefas agendadas na janela — alimenta o construtor de mutações do simulador. O 'projeto'
        exibido é o card-raiz de planejamento (projeto/programa), não a entidade Project ('TD')."""
        tasks = await CapacityService._select_tasks_in_window(db, date_from, date_to)
        root_of, root_title = await CapacityService._root_index(db)
        person_ids = {t.assigned_to for t in tasks if t.assigned_to}
        anames = {}
        if person_ids:
            anames = {pid: fn for pid, fn in (await db.execute(
                select(Person.id, Person.full_name).where(Person.id.in_(person_ids))
            )).all()}
        out = [
            SimTaskMeta(
                task_id=t.id,
                title=t.title,
                project_name=root_title(root_of(t.id)),
                assigned_to=t.assigned_to,
                assignee_name=anames.get(t.assigned_to),
                start_date=t.start_date.date(),
                due_date=t.due_date.date(),
                estimated_hours=float(t.estimated_hours or 0),
            )
            for t in tasks
        ]
        out.sort(key=lambda x: (x.project_name, x.title))
        return SimTasksResponse(tasks=out)

    @staticmethod
    def _apply_and_measure(
        base_tasks,
        calendar,
        mutations: list[ScenarioMutation],
        date_from: date,
        date_to: date,
        base_over_set: set[tuple[uuid.UUID, date]],
        cap_base_fn,
    ) -> dict:
        """Núcleo do simulador: aplica mutações sobre CÓPIAS plain (nunca no ORM) e mede o impacto
        contra `base_over_set`, usando `cap_base_fn(uid, dia)` (capacidade das pessoas reais, já
        resolvida uma vez pelo chamador). Puro/síncrono → o recomendador chama N vezes sem tocar o DB."""
        from types import SimpleNamespace

        after = [
            SimpleNamespace(
                id=t.id,
                project_id=t.project_id,
                assigned_to=t.assigned_to,
                start_date=t.start_date,
                due_date=t.due_date,
                estimated_hours=float(t.estimated_hours or 0),
            )
            for t in base_tasks
        ]
        by_id = {t.id: t for t in after}
        removed: set[uuid.UUID] = set()
        virtual_caps: dict[uuid.UUID, float] = {}
        virtual_meta: dict[uuid.UUID, CapacityPersonMeta] = {}

        for m in mutations:
            if m.op == "move_task" and m.task_id in by_id:
                t = by_id[m.task_id]
                if m.new_start:
                    t.start_date = datetime.combine(m.new_start, datetime.min.time())
                if m.new_due:
                    t.due_date = datetime.combine(m.new_due, datetime.min.time())
            elif m.op == "reassign" and m.task_id in by_id and m.new_person_id:
                by_id[m.task_id].assigned_to = m.new_person_id
            elif m.op == "scale_hours" and m.task_id in by_id and m.factor is not None:
                by_id[m.task_id].estimated_hours = max(0.0, by_id[m.task_id].estimated_hours * float(m.factor))
            elif m.op == "remove_person" and m.person_id:
                removed.add(m.person_id)
            elif m.op == "add_freelancer" and m.daily_hours:
                vid = uuid.uuid4()
                virtual_caps[vid] = float(m.daily_hours)
                virtual_meta[vid] = CapacityPersonMeta(
                    id=vid,
                    full_name=(m.freelancer_name or "Freelancer"),
                    position_slug="freelancer",
                    position_label="Freelancer",
                    area_ids=[],
                )
                for tid in m.assign_task_ids:
                    if tid in by_id:
                        by_id[tid].assigned_to = vid

        acc_a, _bp_a, ids_a = CapacityService._distribute_hours(after, calendar, date_from, date_to)

        def cap_after(uid: uuid.UUID, d: date) -> float:
            if uid in removed:
                return 0.0
            if uid in virtual_caps:
                return virtual_caps[uid] if calendar.is_working_day(d) else 0.0
            return cap_base_fn(uid, d)

        cells_a = CapacityService._build_cells(acc_a, cap_after)
        over_a = {(c.user_id, c.date) for c in cells_a if c.overallocated}
        return {
            "acc_a": acc_a,
            "ids_a": ids_a,
            "cells_a": cells_a,
            "over_a": over_a,
            "virtual_meta": virtual_meta,
            "virtual_caps": virtual_caps,
            "resolved": len(base_over_set - over_a),
            "new": len(over_a - base_over_set),
            "after_over_cells": len(over_a),
            "persons_over_after": len({u for u, _ in over_a}),
        }

    @staticmethod
    async def simulate(
        db: AsyncSession,
        date_from: date,
        date_to: date,
        mutations: list[ScenarioMutation],
    ) -> ScenarioResult:
        """Aplica mutações hipotéticas sobre CÓPIAS em memória (nunca no ORM — zero flush/commit)
        e recalcula o heatmap, devolvendo o antes/depois. Efêmero: nada é persistido."""
        calendar = await load_calendar(db)
        tasks = await CapacityService._select_tasks_in_window(db, date_from, date_to)
        acc_b, _bp_b, ids_b = CapacityService._distribute_hours(tasks, calendar, date_from, date_to)

        # Capacidade das pessoas reais (executores base + alvos de reassign) — resolvida uma vez.
        target_ids = {m.new_person_id for m in mutations if m.op == "reassign" and m.new_person_id}
        real_ids = set(ids_b) | target_ids
        cap_base = await CapacityService._capacity_resolver(db, real_ids, calendar)

        cells_b = CapacityService._build_cells(acc_b, cap_base)
        over_b = {(c.user_id, c.date) for c in cells_b if c.overallocated}

        res = CapacityService._apply_and_measure(
            tasks, calendar, mutations, date_from, date_to, over_b, cap_base
        )
        cells_a = res["cells_a"]
        virtual_meta = res["virtual_meta"]
        virtual_caps = res["virtual_caps"]

        all_real = {i for i in (ids_b | res["ids_a"]) if i not in virtual_caps}
        persons_by_id: dict[uuid.UUID, Person] = {}
        if all_real:
            ps = (await db.execute(
                select(Person).options(selectinload(Person.areas)).where(Person.id.in_(all_real))
            )).scalars().all()
            persons_by_id = {p.id: p for p in ps}
        unmapped_b = sorted(str(i) for i in ids_b if i not in persons_by_id and i not in virtual_caps)
        unmapped_a = sorted(str(i) for i in res["ids_a"] if i not in persons_by_id and i not in virtual_caps)

        before = CapacityService._assemble_heatmap(cells_b, persons_by_id, unmapped_b)
        after_hm = CapacityService._assemble_heatmap(cells_a, persons_by_id, unmapped_a, virtual_meta)
        over_a = res["over_a"]
        diff = ScenarioDiff(
            before_over_cells=len(over_b),
            after_over_cells=len(over_a),
            before_persons_over=len({u for u, _ in over_b}),
            after_persons_over=len({u for u, _ in over_a}),
            resolved_cells=res["resolved"],
            new_cells=res["new"],
            before_allocated_h=before.summary.total_allocated_h,
            after_allocated_h=after_hm.summary.total_allocated_h,
            before_capacity_h=before.summary.total_capacity_h,
            after_capacity_h=after_hm.summary.total_capacity_h,
        )
        return ScenarioResult(before=before, after=after_hm, diff=diff)

    # ── Simulador inteligente: cenários auto-gerados ──
    @staticmethod
    async def suggest_scenarios(
        db: AsyncSession, date_from: date, date_to: date
    ) -> ScenarioSuggestionsResponse:
        """Detecta as sobrecargas e gera cenários prontos (com impacto já medido), na escada de
        mercado: realocar interno (grátis) → freelancer (custo) → adiar prazo. Efêmero/read-only."""
        from collections import Counter, defaultdict
        from datetime import timedelta as _td

        calendar = await load_calendar(db)
        tasks = await CapacityService._select_tasks_in_window(db, date_from, date_to)
        acc_b, _bp, ids_b = CapacityService._distribute_hours(tasks, calendar, date_from, date_to)

        free = [f for f in (await CapacityService.find_available_people(db, date_from, date_to)).rows if f.free_hours_total > 0]
        free_ids = {f.person_id for f in free}

        cap_base = await CapacityService._capacity_resolver(db, set(ids_b) | free_ids, calendar)
        cells_b = CapacityService._build_cells(acc_b, cap_base)
        base_over = {(c.user_id, c.date) for c in cells_b if c.overallocated}
        if not base_over:
            return ScenarioSuggestionsResponse(has_overload=False, rows=[])
        base_over_cells = len(base_over)
        base_persons_over = len({u for u, _ in base_over})
        over_days_by_person = Counter(u for u, _ in base_over)

        person_ids = set(ids_b) | free_ids
        persons: dict[uuid.UUID, Person] = {}
        if person_ids:
            ps = (await db.execute(
                select(Person).options(selectinload(Person.areas)).where(Person.id.in_(person_ids))
            )).scalars().all()
            persons = {p.id: p for p in ps}

        def pname(pid):
            p = persons.get(pid)
            return p.full_name if p else "?"

        def pslug(pid):
            p = persons.get(pid)
            return p.position.slug if p and p.position else None

        def pposname(pid):
            p = persons.get(pid)
            return p.position.name if p and p.position else "dev"

        tasks_by_person: dict[uuid.UUID, list] = defaultdict(list)
        for t in tasks:
            if t.assigned_to:
                tasks_by_person[t.assigned_to].append(t)

        def twh(t):
            return CapacityService._task_window_hours(t, calendar, date_from, date_to)

        def measure(muts):
            return CapacityService._apply_and_measure(tasks, calendar, muts, date_from, date_to, base_over, cap_base)

        hpd = round(calendar.hours_per_day()) or 6
        rows: list[SuggestedScenario] = []
        TITLE = {"reassign": "Realocar", "freelancer": "Freelancer", "defer": "Adiar prazo"}

        for pid, _od in over_days_by_person.most_common():
            ptasks = sorted(tasks_by_person.get(pid, []), key=twh, reverse=True)
            if not ptasks:
                continue
            heavy = ptasks[0]
            heavy_h = twh(heavy)
            if heavy_h <= 0:
                continue
            slug = pslug(pid)

            # Melhor pessoa livre: mesmo cargo com folga → mesmo cargo → qualquer livre.
            pool = [f for f in free if f.position_slug == slug and f.person_id != pid and f.free_hours_total >= heavy_h]
            if not pool:
                pool = [f for f in free if f.position_slug == slug and f.person_id != pid]
            if not pool:
                pool = [f for f in free if f.person_id != pid]
            pool.sort(key=lambda f: f.free_hours_total, reverse=True)
            cand = pool[0] if pool else None

            remedies = []
            if cand:
                same = cand.position_slug == slug
                remedies.append(("reassign", "gratis",
                    ScenarioMutation(op="reassign", task_id=heavy.id, new_person_id=cand.person_id),
                    f"Passar \"{heavy.title}\" ({round(heavy_h)}h) de {pname(pid)} (sobrecarregado) para "
                    f"{cand.full_name} (livre{', mesmo cargo' if same else ', outro cargo'})"))
            remedies.append(("freelancer", "custo",
                ScenarioMutation(op="add_freelancer", freelancer_name=f"Freela ({pposname(pid)})",
                                 daily_hours=hpd, assign_task_ids=[heavy.id]),
                f"Contratar 1 freelancer ({hpd}h/dia) para assumir \"{heavy.title}\" ({round(heavy_h)}h) de {pname(pid)}"))
            remedies.append(("defer", "prazo",
                ScenarioMutation(op="move_task", task_id=heavy.id,
                                 new_start=(heavy.start_date + _td(days=14)).date(),
                                 new_due=(heavy.due_date + _td(days=14)).date()),
                f"Adiar \"{heavy.title}\" em 2 semanas para aliviar {pname(pid)}"))

            added = 0
            for kind, cost, mut, desc in remedies:
                r = measure([mut])
                if r["resolved"] <= r["new"]:  # só net positivo (resolve mais do que cria)
                    continue
                rows.append(SuggestedScenario(
                    id=f"{kind}:{heavy.id}:{pid}",
                    title=f"{TITLE[kind]} — {pname(pid)}",
                    description=desc, kind=kind, cost_tag=cost, target_person_name=pname(pid),
                    mutations=[mut],
                    resolved_cells=r["resolved"], new_cells=r["new"],
                    before_over_cells=base_over_cells, after_over_cells=r["after_over_cells"],
                    persons_over_before=base_persons_over, persons_over_after=r["persons_over_after"],
                ))
                added += 1
                if added >= 2:
                    break

        kind_rank = {"reassign": 0, "freelancer": 1, "defer": 2, "combo": -1}
        rows.sort(key=lambda s: (kind_rank[s.kind], -s.resolved_cells, s.new_cells))
        rows = rows[:10]

        # "Plano completo": realocações internas não-conflitantes (mesmo cargo, folga restante).
        combo_muts: list[ScenarioMutation] = []
        remaining = {f.person_id: f.free_hours_total for f in free}
        for pid, _od in over_days_by_person.most_common():
            slug = pslug(pid)
            for t in sorted(tasks_by_person.get(pid, []), key=twh, reverse=True):
                h = twh(t)
                if h <= 0:
                    continue
                best = next((f for f in sorted(free, key=lambda f: remaining.get(f.person_id, 0), reverse=True)
                             if f.person_id != pid and f.position_slug == slug and remaining.get(f.person_id, 0) >= h), None)
                if best:
                    combo_muts.append(ScenarioMutation(op="reassign", task_id=t.id, new_person_id=best.person_id))
                    remaining[best.person_id] -= h
                    break  # a tarefa realocável mais pesada por pessoa
        if combo_muts:
            rc = measure(combo_muts)
            if rc["resolved"] > rc["new"]:
                rows.insert(0, SuggestedScenario(
                    id="combo:full",
                    title=f"Plano completo — {len(combo_muts)} realocação(ões)",
                    description=f"Redistribui {len(combo_muts)} tarefa(s) para pessoas livres do mesmo cargo, "
                                f"resolvendo o máximo sem custo.",
                    kind="combo", cost_tag="gratis", target_person_name=None,
                    mutations=combo_muts,
                    resolved_cells=rc["resolved"], new_cells=rc["new"],
                    before_over_cells=base_over_cells, after_over_cells=rc["after_over_cells"],
                    persons_over_before=base_persons_over, persons_over_after=rc["persons_over_after"],
                ))

        return ScenarioSuggestionsResponse(has_overload=True, rows=rows)

    # ── Vazamento entre times (cross-team) ──
    @staticmethod
    def _task_window_hours(task, calendar, date_from: date, date_to: date) -> float:
        """Horas da tarefa que caem na janela [date_from, date_to], usando a MESMA distribuição
        por dias úteis de _distribute_hours (per_day × nº de dias úteis na janela)."""
        hours = float(task.estimated_hours or 0)
        if hours <= 0:
            return 0.0
        work_days: list[date] = []
        cur = task.start_date
        while cur.date() <= task.due_date.date():
            if calendar.is_working_day(cur.date()):
                work_days.append(cur.date())
            cur = cur + timedelta(days=1)
        if not work_days:
            return 0.0
        per_day = hours / len(work_days)
        in_win = sum(1 for d in work_days if date_from <= d <= date_to)
        return per_day * in_win

    @staticmethod
    async def analyze_cross_team(
        db: AsyncSession, date_from: date, date_to: date
    ) -> CrossTeamResponse:
        """Vazamento de capacidade entre times: para cada pessoa, quanto das horas na janela vai
        para o SEU time (Área) vs para outros times. 'Time dono' de um trabalho = Área do PO
        (assigned_to) do card-raiz de planejamento (sobe parent_task_id até planning_kind
        projeto/programa). Risco = horas fora do time > horas no próprio time."""
        from collections import defaultdict

        calendar = await load_calendar(db)

        # 1. Grafo de cards (leve) + resolvedor memoizado do card-raiz.
        graph = (await db.execute(
            select(
                ProjectTask.id,
                ProjectTask.parent_task_id,
                ProjectTask.planning_kind,
                ProjectTask.assigned_to,
            )
        )).all()
        parent: dict[uuid.UUID, Optional[uuid.UUID]] = {}
        kind: dict[uuid.UUID, Optional[str]] = {}
        owner: dict[uuid.UUID, Optional[uuid.UUID]] = {}
        for tid, pid, pk, asg in graph:
            parent[tid] = pid
            kind[tid] = pk
            owner[tid] = asg

        ROOT_KINDS = ("projeto", "programa")
        root_cache: dict[uuid.UUID, uuid.UUID] = {}

        def root_of(tid: uuid.UUID) -> uuid.UUID:
            seen: list[uuid.UUID] = []
            cur: Optional[uuid.UUID] = tid
            r = tid
            while cur is not None:
                if cur in root_cache:
                    r = root_cache[cur]
                    break
                seen.append(cur)
                if kind.get(cur) in ROOT_KINDS:
                    r = cur
                    break
                nxt = parent.get(cur)
                if nxt is None or nxt == cur or nxt in seen:
                    r = cur
                    break
                cur = nxt
            for s in seen:
                root_cache[s] = r
            return r

        # 2. Tarefas agendadas na janela.
        tasks = await CapacityService._select_tasks_in_window(db, date_from, date_to)

        # 3. Áreas de executores ∪ POs dos roots (uma query).
        root_po: dict[uuid.UUID, Optional[uuid.UUID]] = {}
        for t in tasks:
            r = root_of(t.id)
            root_po[r] = owner.get(r)
        exec_ids = {t.assigned_to for t in tasks if t.assigned_to}
        po_ids = {pid for pid in root_po.values() if pid}
        person_ids = exec_ids | po_ids
        persons_by_id: dict[uuid.UUID, Person] = {}
        if person_ids:
            ps = (await db.execute(
                select(Person).options(selectinload(Person.areas)).where(Person.id.in_(person_ids))
            )).scalars().all()
            persons_by_id = {p.id: p for p in ps}

        def areas_of(pid: Optional[uuid.UUID]) -> dict[uuid.UUID, str]:
            p = persons_by_id.get(pid) if pid else None
            return {a.id: a.name for a in p.areas} if p else {}

        # 4/5. Atribuição e agregação por pessoa.
        home: dict[uuid.UUID, float] = defaultdict(float)
        undef: dict[uuid.UUID, float] = defaultdict(float)
        total: dict[uuid.UUID, float] = defaultdict(float)
        away: dict[uuid.UUID, dict[uuid.UUID, float]] = defaultdict(lambda: defaultdict(float))
        team_name: dict[uuid.UUID, str] = {}

        for t in tasks:
            p = t.assigned_to
            if not p:
                continue
            wh = CapacityService._task_window_hours(t, calendar, date_from, date_to)
            if wh <= 0:
                continue
            total[p] += wh
            po = root_po.get(root_of(t.id))
            owner_areas = areas_of(po) if po else {}
            person_areas = set(areas_of(p).keys())
            if not owner_areas:
                undef[p] += wh
            elif set(owner_areas.keys()) & person_areas:
                home[p] += wh
            else:
                aid = sorted(owner_areas.keys(), key=lambda k: owner_areas[k])[0]
                away[p][aid] += wh
                team_name[aid] = owner_areas[aid]

        rows: list[CrossTeamPersonRow] = []
        for p in total.keys():
            pp = persons_by_id.get(p)
            pareas = pp.areas if pp else []
            away_total = sum(away[p].values())
            tot = total[p]
            away_items = [
                CrossTeamAwayItem(team_area_id=aid, team_name=team_name.get(aid, "—"), hours=round(h, 2))
                for aid, h in sorted(away[p].items(), key=lambda kv: kv[1], reverse=True)
            ]
            rows.append(CrossTeamPersonRow(
                person_id=p,
                full_name=(pp.full_name if pp else str(p)),
                position_label=(pp.position.name if pp and pp.position else None),
                home_area_ids=[a.id for a in pareas],
                home_area_names=[a.name for a in pareas],
                home_hours=round(home[p], 2),
                away_hours=round(away_total, 2),
                undefined_hours=round(undef[p], 2),
                total_hours=round(tot, 2),
                away_pct=round((away_total / tot * 100) if tot > 0 else 0.0, 1),
                at_risk=away_total > home[p] + 1e-6,
                away_by_team=away_items,
            ))
        rows.sort(key=lambda r: (r.away_pct, r.away_hours), reverse=True)
        return CrossTeamResponse(rows=rows)


class ProjectTaskCommentService:
    @staticmethod
    async def _attach_author_names(db: AsyncSession, comments: list[ProjectTaskComment]) -> None:
        """Resolve o nome do autor (public.users) de cada comentário para exibição."""
        ids = {c.author_id for c in comments if c.author_id}
        names: dict = {}
        if ids:
            rows = await db.execute(select(User.id, User.full_name).where(User.id.in_(ids)))
            names = {uid: fn for uid, fn in rows.all()}
        for c in comments:
            c.author_name = names.get(c.author_id) if c.author_id else None

    @staticmethod
    async def list(db: AsyncSession, project_id: uuid.UUID, task_id: uuid.UUID) -> list[ProjectTaskComment]:
        await ProjectTaskService.get(db, project_id, task_id)
        result = await db.execute(
            select(ProjectTaskComment)
            .where(ProjectTaskComment.task_id == task_id)
            .order_by(ProjectTaskComment.created_at.asc())
        )
        comments = list(result.scalars().all())
        await ProjectTaskCommentService._attach_author_names(db, comments)
        return comments

    @staticmethod
    async def create(
        db: AsyncSession,
        project_id: uuid.UUID,
        task_id: uuid.UUID,
        data: ProjectTaskCommentCreate,
        author_id: Optional[uuid.UUID] = None,
    ) -> ProjectTaskComment:
        await ProjectTaskService.get(db, project_id, task_id)
        comment = ProjectTaskComment(task_id=task_id, author_id=author_id, content=data.content)
        db.add(comment)
        await db.commit()
        await db.refresh(comment)
        await ProjectTaskCommentService._attach_author_names(db, [comment])
        return comment


class ProjectMemberService:
    @staticmethod
    async def list(db: AsyncSession, project_id: uuid.UUID) -> list[ProjectMember]:
        await ProjectService.get(db, project_id)
        result = await db.execute(
            select(ProjectMember)
            .where(ProjectMember.project_id == project_id)
            .order_by(ProjectMember.created_at.asc())
        )
        return list(result.scalars().all())

    @staticmethod
    async def add(db: AsyncSession, project_id: uuid.UUID, data: ProjectMemberCreate) -> ProjectMember:
        await ProjectService.get(db, project_id)
        check = await db.execute(
            select(ProjectMember).where(
                ProjectMember.project_id == project_id,
                ProjectMember.user_id == data.user_id,
            )
        )
        existing = check.scalar_one_or_none()
        if existing:
            existing.role = data.role
            await db.commit()
            await db.refresh(existing)
            return existing
        member = ProjectMember(project_id=project_id, **data.model_dump())
        db.add(member)
        await db.commit()
        await db.refresh(member)
        return member

    @staticmethod
    async def remove(db: AsyncSession, project_id: uuid.UUID, member_id: uuid.UUID) -> None:
        result = await db.execute(
            select(ProjectMember).where(
                ProjectMember.id == member_id,
                ProjectMember.project_id == project_id,
            )
        )
        member = result.scalar_one_or_none()
        if not member:
            raise HTTPException(status_code=404, detail="Membro não encontrado.")
        await db.delete(member)
        await db.commit()


class ProjectAutomationService:
    @staticmethod
    async def list(db: AsyncSession, project_id: uuid.UUID, status_id: uuid.UUID) -> list[ProjectAutomationRule]:
        # valida que a etapa existe no projeto
        st = await db.execute(
            select(ProjectStatusConfig).where(
                ProjectStatusConfig.id == status_id,
                ProjectStatusConfig.project_id == project_id,
            )
        )
        if not st.scalar_one_or_none():
            raise HTTPException(status_code=404, detail="Etapa não encontrada.")
        result = await db.execute(
            select(ProjectAutomationRule)
            .where(ProjectAutomationRule.status_id == status_id)
            .order_by(ProjectAutomationRule.order.asc(), ProjectAutomationRule.created_at.asc())
        )
        return list(result.scalars().all())

    @staticmethod
    async def get(db: AsyncSession, project_id: uuid.UUID, rule_id: uuid.UUID) -> ProjectAutomationRule:
        result = await db.execute(
            select(ProjectAutomationRule).where(
                ProjectAutomationRule.id == rule_id,
                ProjectAutomationRule.project_id == project_id,
            )
        )
        item = result.scalar_one_or_none()
        if not item:
            raise HTTPException(status_code=404, detail="Automação não encontrada.")
        return item

    @staticmethod
    async def create(
        db: AsyncSession,
        project_id: uuid.UUID,
        status_id: uuid.UUID,
        data: ProjectAutomationRuleCreate,
    ) -> ProjectAutomationRule:
        st = await db.execute(
            select(ProjectStatusConfig).where(
                ProjectStatusConfig.id == status_id,
                ProjectStatusConfig.project_id == project_id,
            )
        )
        if not st.scalar_one_or_none():
            raise HTTPException(status_code=400, detail="Etapa inválida para este projeto.")
        item = ProjectAutomationRule(
            project_id=project_id,
            status_id=status_id,
            trigger="enter_status",
            **data.model_dump(),
        )
        db.add(item)
        await db.commit()
        await db.refresh(item)
        return item

    @staticmethod
    async def update(
        db: AsyncSession,
        project_id: uuid.UUID,
        rule_id: uuid.UUID,
        data: ProjectAutomationRuleUpdate,
    ) -> ProjectAutomationRule:
        item = await ProjectAutomationService.get(db, project_id, rule_id)
        for key, value in data.model_dump(exclude_unset=True).items():
            setattr(item, key, value)
        item.updated_at = datetime.utcnow()
        await db.commit()
        await db.refresh(item)
        return item

    @staticmethod
    async def delete(db: AsyncSession, project_id: uuid.UUID, rule_id: uuid.UUID) -> None:
        item = await ProjectAutomationService.get(db, project_id, rule_id)
        await db.delete(item)
        await db.commit()


class ProjectAutomationRunner:
    """Executa as automações de uma etapa quando um card entra nela.
    Não derruba a transação principal — falhas por regra são ignoradas individualmente."""

    @staticmethod
    async def run_on_enter(
        db: AsyncSession,
        project_id: uuid.UUID,
        task: ProjectTask,
        status_obj: Optional[ProjectStatusConfig],
    ) -> None:
        if not status_obj:
            return
        result = await db.execute(
            select(ProjectAutomationRule)
            .where(
                ProjectAutomationRule.status_id == status_obj.id,
                ProjectAutomationRule.is_active == True,  # noqa: E712
            )
            .order_by(ProjectAutomationRule.order.asc(), ProjectAutomationRule.created_at.asc())
        )
        for rule in result.scalars().all():
            try:
                await ProjectAutomationRunner._apply(db, project_id, task, rule)
            except Exception:  # noqa: BLE001 — uma regra com falha não invalida as demais
                pass

    @staticmethod
    async def _apply(
        db: AsyncSession,
        project_id: uuid.UUID,
        task: ProjectTask,
        rule: ProjectAutomationRule,
    ) -> None:
        cfg = rule.action_config or {}

        if rule.action == ProjectAutomationAction.ASSIGN_USER:
            # source="field" → atribui o responsável a partir do valor de um campo do
            # formulário (ex.: "requisitante"); senão usa o usuário fixo configurado.
            if cfg.get("source") == "field":
                field_key = cfg.get("field_key")
                if field_key:
                    sub_res = await db.execute(
                        select(ProjectDemandFormSubmission).where(
                            ProjectDemandFormSubmission.task_id == task.id
                        )
                    )
                    submission = sub_res.scalar_one_or_none()
                    raw = (submission.values or {}).get(field_key) if submission else None
                    if isinstance(raw, list):
                        raw = raw[0] if raw else None
                    resolved = await ProjectAutomationRunner._resolve_person_id(db, raw)
                    if resolved is not None:
                        task.assigned_to = resolved
            else:
                user_id = cfg.get("user_id")
                if user_id:
                    resolved = await ProjectAutomationRunner._resolve_person_id(db, user_id)
                    if resolved is not None:
                        task.assigned_to = resolved

        elif rule.action == ProjectAutomationAction.CREATE_SUBTASK:
            title = cfg.get("title") or f"Atividade: {rule.name}"
            assignee = task.assigned_to if cfg.get("assign_to_parent_assignee") else None
            db.add(ProjectTask(
                project_id=project_id,
                status_id=task.status_id,
                demand_type_id=cfg.get("demand_type_id"),
                parent_task_id=task.id,
                title=title,
                description=cfg.get("description"),
                assigned_to=assignee,
                created_by=task.created_by,
            ))

        elif rule.action == ProjectAutomationAction.NOTIFY:
            target = cfg.get("target", "assignee")
            target_user = task.assigned_to if target == "assignee" else cfg.get("user_id")
            if target_user:
                msg = cfg.get("message") or f"O card '{task.title}' entrou em uma nova etapa."
                await db.execute(
                    _sa_text(
                        "INSERT INTO notifications (id, user_id, title, body, entity_type, entity_id, is_read, created_at) "
                        "VALUES (gen_random_uuid(), :uid, :title, :body, 'project_task', :eid, FALSE, now())"
                    ),
                    {"uid": str(target_user), "title": "Automação de projetos", "body": msg, "eid": str(task.id)},
                )

        elif rule.action == ProjectAutomationAction.ADD_COMMENT:
            content = cfg.get("content") or f"[automação] {rule.name}"
            db.add(ProjectTaskComment(task_id=task.id, author_id=None, content=content))

    @staticmethod
    async def _resolve_person_id(db: AsyncSession, raw) -> Optional[uuid.UUID]:
        """Resolve o valor de um campo (requisitante etc.) para um person_id (responsável).

        O valor pode vir como person_id, user_id (legado) ou nome — campos do tipo
        `current_user`/`user` ora guardam id, ora guardam o nome do usuário."""
        if raw is None:
            return None
        from app.modules.teamops.models import Person

        s = str(raw).strip()
        if not s:
            return None

        try:
            as_uuid = uuid.UUID(s)
        except (ValueError, TypeError):
            as_uuid = None
        if as_uuid is not None:
            by_pid = await db.execute(select(Person.id).where(Person.id == as_uuid))
            if by_pid.scalar_one_or_none():
                return as_uuid
            by_uid = await db.execute(select(Person.id).where(Person.user_id == as_uuid))
            pid = by_uid.scalar_one_or_none()
            if pid:
                return pid
            return as_uuid

        by_name = await db.execute(
            select(Person.id).where(func.lower(Person.full_name) == s.lower())
        )
        return by_name.scalar_one_or_none()


class ProjectSlaService:
    """Recalcula o estado de SLA dos cards e dispara alertas (notificação + comentário)."""

    @staticmethod
    async def scan_schema(db: AsyncSession) -> dict:
        """Varre os cards ativos do schema atual (search_path já apontado) cuja etapa
        tem SLA definido, atualiza o estado (ok/warning/breached) e, nas transições para
        warning/breached, notifica o responsável e registra um comentário. Idempotente:
        só age quando o estado muda."""
        now = datetime.utcnow()
        rows = await db.execute(
            select(ProjectTask, ProjectStatusConfig)
            .join(ProjectStatusConfig, ProjectStatusConfig.id == ProjectTask.status_id)
            .where(
                ProjectTask.completed_at.is_(None),
                ProjectStatusConfig.sla_hours.isnot(None),
            )
        )
        changed = warning = breached = 0
        for task, status in rows.all():
            entered = task.status_entered_at or task.created_at or now
            elapsed_h = (now - entered).total_seconds() / 3600.0
            limit = float(status.sla_hours)
            warn_at = limit * (status.sla_warning_pct or 80) / 100.0
            if elapsed_h >= limit:
                new_state = "breached"
            elif elapsed_h >= warn_at:
                new_state = "warning"
            else:
                new_state = "ok"
            if new_state == task.sla_state:
                continue
            task.sla_state = new_state
            changed += 1
            if new_state in ("warning", "breached"):
                if new_state == "breached":
                    breached += 1
                    msg = f"SLA estourado: o card '{task.title}' excedeu {status.sla_hours}h na etapa '{status.name}'."
                else:
                    warning += 1
                    msg = f"Alerta de SLA: o card '{task.title}' está próximo do limite na etapa '{status.name}'."
                if task.assigned_to:
                    # assigned_to é person_id; notifica o usuário vinculado à Pessoa (se tiver login).
                    notify_uid = (await db.execute(
                        _sa_text("SELECT user_id FROM team_persons WHERE id = :pid"),
                        {"pid": str(task.assigned_to)},
                    )).scalar()
                    if notify_uid:
                        await db.execute(
                            _sa_text(
                                "INSERT INTO notifications (id, user_id, title, body, entity_type, entity_id, is_read, created_at) "
                                "VALUES (gen_random_uuid(), :uid, :t, :b, 'project_task', :eid, FALSE, now())"
                            ),
                            {"uid": str(notify_uid), "t": "SLA de projetos", "b": msg, "eid": str(task.id)},
                        )
                db.add(ProjectTaskComment(task_id=task.id, author_id=None, content=f"[SLA] {msg}"))
        await db.commit()
        return {"changed": changed, "warning": warning, "breached": breached}


class ProjectReportsService:
    """Agrega métricas do board (tenant-wide) para a página de Relatórios."""

    @staticmethod
    async def build(
        db: AsyncSession,
        po: Optional[uuid.UUID] = None,
        diretoria: Optional[str] = None,
        area: Optional[str] = None,
    ) -> dict:
        now = datetime.utcnow()
        rows = await db.execute(
            select(ProjectTask).options(
                selectinload(ProjectTask.status),
                selectinload(ProjectTask.demand_type),
            )
        )
        all_tasks = list(rows.scalars().all())
        # Opções disponíveis para os filtros — derivadas de TODOS os cards (não dos filtrados),
        # para que os selects continuem estáveis após aplicar um filtro.
        available_diretorias = sorted({t.diretoria for t in all_tasks if t.diretoria})
        available_areas = sorted({t.area for t in all_tasks if t.area})

        # Aplica os filtros (PO = responsável, diretoria e área são strings do card).
        tasks = all_tasks
        if po is not None:
            tasks = [t for t in tasks if t.assigned_to == po]
        if diretoria:
            tasks = [t for t in tasks if t.diretoria == diretoria]
        if area:
            tasks = [t for t in tasks if t.area == area]

        funnels = (await db.execute(select(ProjectFunnel))).scalars().all()
        funnel_by_id = {f.id: f for f in funnels}

        total_active = 0
        total_completed = 0
        stage_acc: dict[tuple, dict] = {}
        assignee_acc: dict[Optional[uuid.UUID], dict] = {}
        type_acc: dict[Optional[uuid.UUID], dict] = {}
        sla = {"ok": 0, "warning": 0, "breached": 0, "none": 0, "overdue": 0}
        month_acc: dict[str, int] = {}
        lead_times: list[float] = []

        for t in tasks:
            is_completed = t.completed_at is not None
            if is_completed:
                total_completed += 1
            else:
                total_active += 1

            overdue = (not is_completed) and (
                t.sla_state == "breached" or (t.due_date is not None and t.due_date < now)
            )

            if not is_completed:
                st = t.status
                fn = funnel_by_id.get(st.funnel_id) if st else None
                key = (st.funnel_id if st else None, t.status_id)
                row = stage_acc.get(key)
                if row is None:
                    row = {
                        "funnel_id": st.funnel_id if st else None,
                        "funnel_name": fn.name if fn else "—",
                        "status_id": t.status_id,
                        "status_name": st.name if st else "—",
                        "status_color": st.color if st else "#6B7280",
                        "count": 0,
                    }
                    stage_acc[key] = row
                row["count"] += 1

                a = assignee_acc.setdefault(t.assigned_to, {"active": 0, "overdue": 0})
                a["active"] += 1
                if overdue:
                    a["overdue"] += 1

                state = t.sla_state if t.sla_state in ("ok", "warning", "breached") else "none"
                sla[state] += 1
                if overdue:
                    sla["overdue"] += 1

            ty = type_acc.setdefault(
                t.demand_type_id,
                {"name": t.demand_type.name if t.demand_type else "Sem tipo", "count": 0},
            )
            ty["count"] += 1

            if is_completed and t.completed_at:
                mk = t.completed_at.strftime("%Y-%m")
                month_acc[mk] = month_acc.get(mk, 0) + 1
                base = t.start_date or t.created_at
                if base:
                    lead_times.append((t.completed_at - base).total_seconds() / 86400.0)

        by_stage = sorted(stage_acc.values(), key=lambda r: (r["funnel_name"], r["status_name"]))
        by_assignee = sorted(
            (
                {"user_id": uid, "active": v["active"], "overdue": v["overdue"]}
                for uid, v in assignee_acc.items()
            ),
            key=lambda r: r["active"],
            reverse=True,
        )
        by_type = sorted(
            (
                {"type_id": tid, "type_name": v["name"], "count": v["count"]}
                for tid, v in type_acc.items()
            ),
            key=lambda r: r["count"],
            reverse=True,
        )
        by_month = [{"month": m, "count": c} for m, c in sorted(month_acc.items())]
        avg_lead = round(sum(lead_times) / len(lead_times), 1) if lead_times else None

        return {
            "total_active": total_active,
            "total_completed": total_completed,
            "by_stage": by_stage,
            "by_assignee": by_assignee,
            "by_type": by_type,
            "sla": sla,
            "throughput": {
                "by_month": by_month,
                "completed_total": total_completed,
                "avg_lead_time_days": avg_lead,
            },
            "available_diretorias": available_diretorias,
            "available_areas": available_areas,
        }


class ProjectScheduleBindingService:
    """CRUD dos vínculos do Cronograma (fluxo + etapa). Configurado pelo card
    "Cronograma" nas configurações do módulo Projetos."""

    @staticmethod
    async def list(db: AsyncSession) -> list[ProjectScheduleBinding]:
        result = await db.execute(select(ProjectScheduleBinding))
        return list(result.scalars().all())

    @staticmethod
    async def save(
        db: AsyncSession, items: list[ProjectScheduleBindingItem]
    ) -> list[ProjectScheduleBinding]:
        """Upsert em lote por `status_id`: cria/atualiza os informados e remove o resto.

        Valida que cada etapa existe e pertence ao fluxo informado.
        """
        for item in items:
            row = await db.execute(
                select(ProjectStatusConfig).where(ProjectStatusConfig.id == item.status_id)
            )
            status = row.scalar_one_or_none()
            if not status:
                raise HTTPException(status_code=400, detail="Etapa inválida no vínculo do cronograma.")
            if status.funnel_id != item.funnel_id:
                raise HTTPException(
                    status_code=400,
                    detail="A etapa informada não pertence ao fluxo selecionado.",
                )

        keep_status_ids = {item.status_id for item in items}
        existing_result = await db.execute(select(ProjectScheduleBinding))
        existing = {b.status_id: b for b in existing_result.scalars().all()}

        to_remove = [sid for sid in existing if sid not in keep_status_ids]
        if to_remove:
            await db.execute(
                sa_delete(ProjectScheduleBinding).where(
                    ProjectScheduleBinding.status_id.in_(to_remove)
                )
            )

        for item in items:
            current = existing.get(item.status_id)
            if current is None:
                db.add(ProjectScheduleBinding(
                    funnel_id=item.funnel_id,
                    status_id=item.status_id,
                    require_fill=item.require_fill,
                    is_active=item.is_active,
                ))
            else:
                current.funnel_id = item.funnel_id
                current.require_fill = item.require_fill
                current.is_active = item.is_active
                current.updated_at = datetime.utcnow()

        await db.commit()
        return await ProjectScheduleBindingService.list(db)

    @staticmethod
    async def delete(db: AsyncSession, status_id: uuid.UUID) -> None:
        await db.execute(
            sa_delete(ProjectScheduleBinding).where(ProjectScheduleBinding.status_id == status_id)
        )
        await db.commit()


DEFAULT_AGENT_PROMPT = """Você recebeu um card do kanban para processar nesta etapa.

Título: {{title}}
Descrição: {{description}}

Dados do formulário:
{{form_values}}
"""

DEFAULT_CLASSIFY_PROMPT = """Você é um analista de priorização. Leia os dados completos da solicitação abaixo e classifique-a na matriz Impacto × Esforço.

{{task_context}}

{{priority_rubric}}

Responda APENAS com um JSON válido (sem markdown, sem texto extra), neste formato exato:
{
  "pillar_codes": ["F1"],
  "impact_scores": {
    "aderencia_estrategica": 1,
    "cliente": 1,
    "financeiro": 1,
    "eficiencia": 1,
    "risco": 1,
    "alcance": 1
  },
  "effort_scores": {
    "documentacao": 1,
    "areas": 1,
    "maturidade": 1,
    "complexidade": 1,
    "integracoes": 1
  },
  "justificativa": "Breve explicação da classificação"
}

Regras:
- Cada score deve ser inteiro de 1 a 5.
- pillar_codes: liste um ou mais códigos de pilar estratégico (ex.: F1, I2, C3) que a demanda atende.
- Use os códigos exatos listados na rubrica.
"""


class ProjectStageAgentService:
    """CRUD dos vínculos de agentes IDCortex por etapa do kanban."""

    @staticmethod
    def _to_response(item: ProjectStageAgentBinding) -> ProjectStageAgentBindingResponse:
        return ProjectStageAgentBindingResponse(
            id=item.id,
            project_id=item.project_id,
            funnel_id=item.funnel_id,
            status_id=item.status_id,
            name=item.name,
            agent_kind=item.agent_kind or "ask",
            agent_id=item.agent_id,
            usuario=item.usuario,
            prompt_template=item.prompt_template,
            gateway_url=item.gateway_url,
            gateway_client_id=item.gateway_client_id,
            has_gateway_client_secret=bool(item.gateway_client_secret),
            continue_thread=item.continue_thread,
            add_comment_on_success=item.add_comment_on_success,
            advance_to_status_id=item.advance_to_status_id,
            is_active=item.is_active,
            created_at=item.created_at,
            updated_at=item.updated_at,
        )

    @staticmethod
    async def _validate_status(
        db: AsyncSession,
        project_id: uuid.UUID,
        funnel_id: uuid.UUID,
        status_id: uuid.UUID,
    ) -> ProjectStatusConfig:
        row = await db.execute(
            select(ProjectStatusConfig).where(
                ProjectStatusConfig.id == status_id,
                ProjectStatusConfig.project_id == project_id,
            )
        )
        status_obj = row.scalar_one_or_none()
        if not status_obj:
            raise HTTPException(status_code=400, detail="Etapa inválida para este projeto.")
        if status_obj.funnel_id != funnel_id:
            raise HTTPException(status_code=400, detail="A etapa não pertence ao fluxo informado.")
        return status_obj

    @staticmethod
    async def list(
        db: AsyncSession,
        project_id: Optional[uuid.UUID] = None,
    ) -> list[ProjectStageAgentBindingResponse]:
        q = select(ProjectStageAgentBinding).order_by(ProjectStageAgentBinding.created_at.asc())
        if project_id is not None:
            q = q.where(ProjectStageAgentBinding.project_id == project_id)
        result = await db.execute(q)
        return [ProjectStageAgentService._to_response(i) for i in result.scalars().all()]

    @staticmethod
    async def get(db: AsyncSession, binding_id: uuid.UUID) -> ProjectStageAgentBinding:
        row = await db.execute(
            select(ProjectStageAgentBinding).where(ProjectStageAgentBinding.id == binding_id)
        )
        item = row.scalar_one_or_none()
        if not item:
            raise HTTPException(status_code=404, detail="Vínculo de agente não encontrado.")
        return item

    @staticmethod
    async def create(db: AsyncSession, data: ProjectStageAgentBindingCreate) -> ProjectStageAgentBindingResponse:
        await ProjectStageAgentService._validate_status(
            db, data.project_id, data.funnel_id, data.status_id,
        )
        dup = await db.execute(
            select(ProjectStageAgentBinding).where(ProjectStageAgentBinding.status_id == data.status_id)
        )
        if dup.scalar_one_or_none():
            raise HTTPException(status_code=400, detail="Esta etapa já possui um agente vinculado.")
        item = ProjectStageAgentBinding(**data.model_dump())
        db.add(item)
        await db.commit()
        await db.refresh(item)
        return ProjectStageAgentService._to_response(item)

    @staticmethod
    async def update(
        db: AsyncSession,
        binding_id: uuid.UUID,
        data: ProjectStageAgentBindingUpdate,
    ) -> ProjectStageAgentBindingResponse:
        item = await ProjectStageAgentService.get(db, binding_id)
        payload = data.model_dump(exclude_unset=True)
        new_client_id = payload.get("gateway_client_id", item.gateway_client_id)
        new_secret = payload.get("gateway_client_secret", item.gateway_client_secret)
        if payload.get("gateway_client_id") is not None or payload.get("gateway_client_secret") is not None:
            if not (new_client_id and str(new_client_id).strip()):
                raise HTTPException(status_code=400, detail="X-Client-ID é obrigatório nas credenciais do gateway.")
            if not (new_secret and str(new_secret).strip()):
                raise HTTPException(status_code=400, detail="X-Client-Secret é obrigatório nas credenciais do gateway.")
        for key, value in payload.items():
            setattr(item, key, value)
        item.updated_at = datetime.utcnow()
        await db.commit()
        await db.refresh(item)
        return ProjectStageAgentService._to_response(item)

    @staticmethod
    async def delete(db: AsyncSession, binding_id: uuid.UUID) -> None:
        item = await ProjectStageAgentService.get(db, binding_id)
        await db.delete(item)
        await db.commit()

    @staticmethod
    async def list_executions(
        db: AsyncSession,
        task_id: uuid.UUID,
    ) -> list[ProjectAgentExecution]:
        result = await db.execute(
            select(ProjectAgentExecution)
            .where(ProjectAgentExecution.task_id == task_id)
            .order_by(ProjectAgentExecution.created_at.desc())
        )
        return list(result.scalars().all())

    @staticmethod
    async def list_execution_logs(
        db: AsyncSession,
        *,
        status: Optional[str] = None,
        binding_id: Optional[uuid.UUID] = None,
        limit: int = 50,
        offset: int = 0,
    ) -> dict:
        """Lista paginada de execuções com metadados do agente, card e etapa."""
        limit = max(1, min(limit, 200))
        offset = max(0, offset)

        base = (
            select(
                ProjectAgentExecution,
                ProjectStageAgentBinding.name.label("agent_name"),
                ProjectStageAgentBinding.agent_kind.label("agent_kind"),
                ProjectTask.title.label("task_title"),
                ProjectStatusConfig.name.label("status_name"),
            )
            .join(
                ProjectStageAgentBinding,
                ProjectStageAgentBinding.id == ProjectAgentExecution.binding_id,
            )
            .join(ProjectTask, ProjectTask.id == ProjectAgentExecution.task_id)
            .join(
                ProjectStatusConfig,
                ProjectStatusConfig.id == ProjectStageAgentBinding.status_id,
            )
        )
        if status:
            base = base.where(ProjectAgentExecution.status == status)
        if binding_id:
            base = base.where(ProjectAgentExecution.binding_id == binding_id)

        count_q = select(func.count()).select_from(base.subquery())
        total = (await db.execute(count_q)).scalar_one()

        rows = await db.execute(
            base.order_by(ProjectAgentExecution.created_at.desc())
            .limit(limit)
            .offset(offset)
        )
        items = [
            {
                "id": ex.id,
                "task_id": ex.task_id,
                "task_title": task_title or "—",
                "binding_id": ex.binding_id,
                "agent_name": agent_name,
                "agent_kind": agent_kind or "ask",
                "status_name": status_name or "—",
                "status": ex.status,
                "thread_id": ex.thread_id,
                "answer_message": ex.answer_message,
                "error_message": ex.error_message,
                "request_payload": ex.request_payload,
                "response_payload": ex.response_payload,
                "created_at": ex.created_at,
            }
            for ex, agent_name, agent_kind, task_title, status_name in rows.all()
        ]
        return {"items": items, "total": total, "limit": limit, "offset": offset}


class ProjectAgentRunner:
    """Dispara agentes do Azure AI Foundry quando um card entra numa etapa vinculada."""

    # Cache do token Entra ID (compartilhado): {"token": str, "exp": float (time.monotonic)}.
    _AZURE_TOKEN_CACHE: dict = {}

    @staticmethod
    async def run_on_enter(
        db: AsyncSession,
        project_id: uuid.UUID,
        task: ProjectTask,
        status_obj: Optional[ProjectStatusConfig],
    ) -> None:
        if not status_obj:
            return
        result = await db.execute(
            select(ProjectStageAgentBinding).where(
                ProjectStageAgentBinding.status_id == status_obj.id,
                ProjectStageAgentBinding.is_active == True,  # noqa: E712
            )
        )
        binding = result.scalar_one_or_none()
        if not binding:
            return
        try:
            if binding.agent_kind == "classify_and_advance":
                await ProjectAgentRunner._execute_classify_and_advance(
                    db, project_id, task, binding, status_obj=status_obj,
                )
            else:
                await ProjectAgentRunner._execute_ask(db, project_id, task, binding)
        except Exception:  # noqa: BLE001 — falha do agente não invalida a movimentação
            pass

    @staticmethod
    async def _build_prompt(db: AsyncSession, task: ProjectTask, template: str) -> str:
        sub_res = await db.execute(
            select(ProjectDemandFormSubmission).where(ProjectDemandFormSubmission.task_id == task.id)
        )
        submission = sub_res.scalar_one_or_none()
        form_values = submission.values if submission else {}
        tpl = template.strip() or DEFAULT_AGENT_PROMPT
        replacements = {
            "title": task.title or "",
            "description": task.description or "",
            "task_id": str(task.id),
            "form_values": json.dumps(form_values, ensure_ascii=False, indent=2),
        }
        prompt = tpl
        for key, val in replacements.items():
            prompt = prompt.replace(f"{{{{{key}}}}}", val)
        return prompt

    @staticmethod
    async def _resolve_thread_id(
        db: AsyncSession,
        task_id: uuid.UUID,
        binding_id: uuid.UUID,
    ) -> Optional[str]:
        row = await db.execute(
            select(ProjectAgentExecution)
            .where(
                ProjectAgentExecution.task_id == task_id,
                ProjectAgentExecution.binding_id == binding_id,
                ProjectAgentExecution.status == "success",
                ProjectAgentExecution.thread_id.isnot(None),
            )
            .order_by(ProjectAgentExecution.created_at.desc())
            .limit(1)
        )
        prev = row.scalar_one_or_none()
        return prev.thread_id if prev else None

    @staticmethod
    def _format_gateway_error(exc: Exception, endpoint: str = "") -> str:
        msg = str(exc)
        host = (endpoint or settings.AZURE_AI_ENDPOINT or "").replace("https://", "").replace("http://", "").split("/")[0]
        if "Name or service not known" in msg or "Errno -2" in msg or "nodename nor servname" in msg.lower():
            return (
                f"Não foi possível resolver o host do Azure AI Foundry ({host}). "
                f"Confirme AZURE_AI_ENDPOINT no .env e o DNS/rede deste servidor."
            )
        if "ConnectError" in type(exc).__name__ or "connection" in msg.lower():
            return f"Falha ao conectar ao Azure AI Foundry ({host}): {msg[:500]}"
        return msg[:2000]

    @staticmethod
    def _azure_config(binding: ProjectStageAgentBinding) -> tuple[str, str]:
        """(endpoint_base, api_version). Endpoint vem SEMPRE do .env (AZURE_AI_ENDPOINT) —
        o campo legado binding.gateway_url (IDCortex) é ignorado."""
        endpoint = (settings.AZURE_AI_ENDPOINT or "").strip().rstrip("/")
        api_version = (settings.AZURE_AI_API_VERSION or "2025-05-01").strip()
        return endpoint, api_version

    @staticmethod
    def _azure_sp_configured() -> bool:
        return bool(settings.AZURE_AI_TENANT_ID and settings.AZURE_AI_CLIENT_ID and settings.AZURE_AI_CLIENT_SECRET)

    @staticmethod
    async def _azure_token() -> str:
        """Token Bearer (Microsoft Entra ID) via client-credentials, com cache até ~expirar.
        Escopo do Foundry Agent Service: https://ai.azure.com/.default."""
        now = time.monotonic()
        cache = ProjectAgentRunner._AZURE_TOKEN_CACHE
        if cache.get("token") and (cache.get("exp", 0.0) - 60) > now:
            return cache["token"]
        url = f"https://login.microsoftonline.com/{settings.AZURE_AI_TENANT_ID}/oauth2/v2.0/token"
        data = {
            "grant_type": "client_credentials",
            "client_id": settings.AZURE_AI_CLIENT_ID,
            "client_secret": settings.AZURE_AI_CLIENT_SECRET,
            "scope": "https://ai.azure.com/.default",
        }
        async with httpx.AsyncClient(timeout=30.0) as client:
            r = await client.post(url, data=data)
            r.raise_for_status()
            j = r.json()
        cache["token"] = j["access_token"]
        cache["exp"] = now + float(j.get("expires_in", 3600))
        return cache["token"]

    @staticmethod
    def _credentials_error_message(binding: ProjectStageAgentBinding) -> str:
        endpoint, _ = ProjectAgentRunner._azure_config(binding)
        missing: list[str] = []
        if not endpoint:
            missing.append("AZURE_AI_ENDPOINT (.env)")
        if not ProjectAgentRunner._azure_sp_configured():
            missing.append("credenciais Entra ID — AZURE_AI_TENANT_ID/CLIENT_ID/CLIENT_SECRET (.env)")
        if not (binding.agent_id or "").strip():
            missing.append("ID do agente na config do agente")
        return "Configuração do Azure AI Foundry incompleta: " + "; ".join(missing)

    @staticmethod
    def _notify_agent_failure(
        binding: ProjectStageAgentBinding,
        task_id: uuid.UUID,
        error_message: str,
    ) -> ProjectTaskComment:
        return ProjectTaskComment(
            task_id=task_id,
            author_id=None,
            content=f"[agente: {binding.name}] Falha na execução\n{error_message}",
        )

    @staticmethod
    def _extract_assistant_text(messages: list) -> Optional[str]:
        """Extrai o texto da última mensagem do assistant (formato threads/messages do Azure)."""
        for m in messages:
            if m.get("role") != "assistant":
                continue
            parts = []
            for c in (m.get("content") or []):
                if c.get("type") == "text":
                    parts.append(((c.get("text") or {}).get("value") or ""))
                elif isinstance(c.get("text"), str):
                    parts.append(c["text"])
            txt = "\n".join(p for p in parts if p).strip()
            if txt:
                return txt
        return None

    @staticmethod
    async def _call_azure_agent(
        binding: ProjectStageAgentBinding,
        prompt: str,
        thread_id: Optional[str],
    ) -> tuple[int, dict, Optional[str]]:
        """Executa o agente no Azure AI Foundry (threads → message → run → poll → messages).
        Auth por Microsoft Entra ID (Bearer). Retorna (status_code, body, answer_message)."""
        endpoint, api_version = ProjectAgentRunner._azure_config(binding)
        if not endpoint or not ProjectAgentRunner._azure_sp_configured() or not (binding.agent_id or "").strip():
            raise ValueError(ProjectAgentRunner._credentials_error_message(binding))
        token = await ProjectAgentRunner._azure_token()
        headers = {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}
        params = {"api-version": api_version}
        tid = thread_id
        try:
            async with httpx.AsyncClient(timeout=60.0) as client:
                if not tid:
                    r = await client.post(f"{endpoint}/threads", params=params, headers=headers, json={})
                    r.raise_for_status()
                    tid = r.json().get("id")
                r = await client.post(
                    f"{endpoint}/threads/{tid}/messages", params=params, headers=headers,
                    json={"role": "user", "content": prompt},
                )
                r.raise_for_status()
                r = await client.post(
                    f"{endpoint}/threads/{tid}/runs", params=params, headers=headers,
                    json={"assistant_id": binding.agent_id},
                )
                r.raise_for_status()
                run = r.json()
                run_id, status = run.get("id"), run.get("status")
                waited = 0.0
                while status in ("queued", "in_progress", "cancelling", "requires_action"):
                    if waited >= 110:
                        raise RuntimeError("Tempo esgotado aguardando a resposta do agente Azure (run não concluído).")
                    await asyncio.sleep(1.5)
                    waited += 1.5
                    r = await client.get(f"{endpoint}/threads/{tid}/runs/{run_id}", params=params, headers=headers)
                    r.raise_for_status()
                    status = r.json().get("status")
                if status != "completed":
                    le = (r.json().get("last_error") or {}) if r.content else {}
                    detail = le.get("message", "")
                    if "rate limit" in detail.lower() or le.get("code") == "rate_limit_exceeded":
                        raise RuntimeError(
                            "Limite de requisições da Azure atingido (rate limit) no modelo do agente. "
                            "Tente novamente em instantes ou aumente a cota (TPM) do deployment no Azure AI Foundry."
                        )
                    raise RuntimeError(
                        f"Run do agente Azure terminou como '{status}'. {detail}".strip()
                    )
                r = await client.get(f"{endpoint}/threads/{tid}/messages", params=params, headers=headers)
                r.raise_for_status()
                answer_message = ProjectAgentRunner._extract_assistant_text(r.json().get("data") or [])
        except httpx.HTTPStatusError as exc:
            # Erro HTTP do Azure → devolve o status para o chamador reportar mensagem amigável.
            return exc.response.status_code, {"thread_id": tid, "error": (exc.response.text or "")[:300]}, None
        body = {"thread_id": tid, "run_status": status, "answer": {"message": answer_message}}
        return 200, body, answer_message

    @staticmethod
    def _gateway_http_message(status_code: int) -> str:
        """Mensagem amigável para falhas HTTP do Azure (em vez de só o código cru)."""
        if status_code in (502, 503, 504):
            return (f"Azure AI Foundry indisponível no momento (HTTP {status_code}). "
                    f"Tente novamente em alguns minutos.")
        if status_code in (401, 403):
            return (f"Azure retornou HTTP {status_code} — token Entra ID inválido ou o service "
                    f"principal não tem a role 'Cognitive Services User'/'Foundry User' no projeto.")
        if status_code == 404:
            return ("Azure retornou HTTP 404 — verifique AZURE_AI_ENDPOINT, a api-version e o "
                    "ID do agente (assistant).")
        return f"Azure retornou HTTP {status_code}"

    @staticmethod
    async def _anonymize_prompt(db: AsyncSession, prompt: str) -> tuple[str, dict]:
        """Anonimiza o prompt antes de enviar ao Azure (EXTERNO): nomes→papéis funcionais,
        e-mails→marcadores, dados sensíveis e sistemas generalizados. Retorna (texto, relatório)."""
        if not isinstance(prompt, str) or not prompt:
            return prompt, {}
        names = set((await db.execute(select(Person.full_name))).scalars().all())
        return anonymize_text(prompt, names)

    @staticmethod
    def _extract_json_from_text(text: str) -> Optional[dict]:
        if not text:
            return None
        raw = text.strip()
        try:
            parsed = json.loads(raw)
            return parsed if isinstance(parsed, dict) else None
        except json.JSONDecodeError:
            pass
        fenced = re.search(r"```(?:json)?\s*(\{.*?\})\s*```", raw, re.DOTALL)
        if fenced:
            try:
                parsed = json.loads(fenced.group(1))
                return parsed if isinstance(parsed, dict) else None
            except json.JSONDecodeError:
                pass
        start = raw.find("{")
        end = raw.rfind("}")
        if start >= 0 and end > start:
            try:
                parsed = json.loads(raw[start : end + 1])
                return parsed if isinstance(parsed, dict) else None
            except json.JSONDecodeError:
                pass
        return None

    @staticmethod
    async def _build_rich_task_context(
        db: AsyncSession,
        project_id: uuid.UUID,
        task: ProjectTask,
    ) -> str:
        lines: list[str] = []
        project = await db.get(Project, project_id)
        if project:
            lines.append(f"Processo: {project.name}")

        status = await db.get(ProjectStatusConfig, task.status_id)
        if status:
            funnel = await db.get(ProjectFunnel, status.funnel_id)
            funnel_name = funnel.name if funnel else "—"
            lines.append(f"Etapa atual: {status.name} (funil: {funnel_name})")

        if task.demand_type_id:
            dt = await db.get(ProjectDemandType, task.demand_type_id)
            if dt:
                lines.append(f"Tipo de demanda: {dt.name}")

        lines.extend([
            f"Título: {task.title or ''}",
            f"Descrição: {task.description or ''}",
            f"Diretoria: {task.diretoria or '—'}",
            f"Área: {task.area or '—'}",
            f"Início: {task.start_date.isoformat() if task.start_date else '—'}",
            f"Prazo: {task.due_date.isoformat() if task.due_date else '—'}",
            f"Horas estimadas: {task.estimated_hours if task.estimated_hours is not None else '—'}",
        ])

        sub_res = await db.execute(
            select(ProjectDemandFormSubmission).where(ProjectDemandFormSubmission.task_id == task.id)
        )
        submission = sub_res.scalar_one_or_none()
        form_values = submission.values if submission else {}

        if task.demand_type_id and form_values:
            fields_res = await db.execute(
                select(ProjectDemandFormField, ProjectDemandFormSection)
                .join(ProjectDemandFormSection, ProjectDemandFormSection.id == ProjectDemandFormField.section_id)
                .where(ProjectDemandFormSection.demand_type_id == task.demand_type_id)
                .order_by(ProjectDemandFormSection.order.asc(), ProjectDemandFormField.order.asc())
            )
            label_by_key = {f.field_key: f.label for f, _ in fields_res.all()}
            lines.append("\nFormulário da demanda:")
            for key, val in form_values.items():
                label = label_by_key.get(key, key)
                if isinstance(val, list):
                    val = ", ".join(str(v) for v in val)
                lines.append(f"  - {label}: {val}")
        elif form_values:
            lines.append("\nFormulário da demanda:")
            lines.append(json.dumps(form_values, ensure_ascii=False, indent=2))

        return "\n".join(lines)

    @staticmethod
    async def _build_priority_rubric(db: AsyncSession) -> str:
        await PriorityConfigService.ensure_seeded(db)
        impact_criteria, effort_criteria, pillars_map, _, settings = await PriorityScoreService._load_config(db)
        lines = [
            "Rubrica de priorização (Impacto × Esforço):",
            f"Corte de impacto efetivo: {settings.impact_cut} | Corte de esforço: {settings.effort_cut}",
            "\nCritérios de IMPACTO (nota 1-5 por código):",
        ]
        for c in sorted(impact_criteria, key=lambda x: x.order):
            if not c.is_active:
                continue
            scale = c.scale or []
            scale_txt = "; ".join(
                f"{s.get('value')}={s.get('description', '')}" for s in scale if isinstance(s, dict)
            )
            lines.append(f"  - {c.code} ({c.label}, peso {c.weight}): {scale_txt}")
        lines.append("\nCritérios de ESFORÇO (nota 1-5 por código):")
        for c in sorted(effort_criteria, key=lambda x: x.order):
            if not c.is_active:
                continue
            scale = c.scale or []
            scale_txt = "; ".join(
                f"{s.get('value')}={s.get('description', '')}" for s in scale if isinstance(s, dict)
            )
            lines.append(f"  - {c.code} ({c.label}, peso {c.weight}): {scale_txt}")
        lines.append("\nPilares estratégicos (use os códigos em pillar_codes):")
        for p in sorted(pillars_map.values(), key=lambda x: x.order):
            if not p.is_active:
                continue
            lines.append(f"  - {p.code}: {p.label} ({p.perspective})")
        return "\n".join(lines)

    @staticmethod
    async def _build_classify_prompt(
        db: AsyncSession,
        project_id: uuid.UUID,
        task: ProjectTask,
        template: str,
    ) -> str:
        task_context = await ProjectAgentRunner._build_rich_task_context(db, project_id, task)
        priority_rubric = await ProjectAgentRunner._build_priority_rubric(db)
        tpl = template.strip() or DEFAULT_CLASSIFY_PROMPT
        return (
            tpl.replace("{{task_context}}", task_context)
            .replace("{{priority_rubric}}", priority_rubric)
            .replace("{{title}}", task.title or "")
            .replace("{{description}}", task.description or "")
            .replace("{{task_id}}", str(task.id))
        )

    @staticmethod
    async def _resolve_pillar_ids(db: AsyncSession, raw_codes) -> list[uuid.UUID]:
        if not raw_codes:
            raise ValueError("pillar_codes é obrigatório na resposta do agente.")
        await PriorityConfigService.ensure_seeded(db)
        pillars = {p.code.upper(): p.id for p in await PriorityConfigService.list_pillars(db) if p.is_active}
        by_id = {str(p.id): p.id for p in await PriorityConfigService.list_pillars(db)}
        out: list[uuid.UUID] = []
        for item in raw_codes:
            s = str(item).strip().upper()
            if not s:
                continue
            if s in pillars:
                out.append(pillars[s])
                continue
            try:
                as_uuid = uuid.UUID(s)
            except (ValueError, TypeError):
                as_uuid = None
            if as_uuid is not None and str(as_uuid) in by_id:
                out.append(as_uuid)
                continue
            raise ValueError(f"Pilar estratégico inválido: {item}")
        if not out:
            raise ValueError("Nenhum pilar estratégico válido informado pelo agente.")
        return out

    @staticmethod
    async def _parse_classify_response(db: AsyncSession, answer_text: str) -> PriorityScoreInput:
        data = ProjectAgentRunner._extract_json_from_text(answer_text)
        if not data:
            raise ValueError("Resposta do agente não contém JSON válido para classificação.")
        pillar_ids = await ProjectAgentRunner._resolve_pillar_ids(
            db, data.get("pillar_codes") or data.get("pillar_ids") or [],
        )
        impact_scores = data.get("impact_scores") or {}
        effort_scores = data.get("effort_scores") or {}
        if not isinstance(impact_scores, dict) or not isinstance(effort_scores, dict):
            raise ValueError("impact_scores e effort_scores devem ser objetos JSON.")
        impact_clean = {str(k): int(v) for k, v in impact_scores.items()}
        effort_clean = {str(k): int(v) for k, v in effort_scores.items()}
        return PriorityScoreInput(
            pillar_ids=pillar_ids,
            impact_scores=impact_clean,
            effort_scores=effort_clean,
        )

    @staticmethod
    async def _next_status_in_funnel(
        db: AsyncSession,
        funnel_id: uuid.UUID,
        current_order: int,
    ) -> Optional[ProjectStatusConfig]:
        row = await db.execute(
            select(ProjectStatusConfig)
            .where(
                ProjectStatusConfig.funnel_id == funnel_id,
                ProjectStatusConfig.is_active == True,  # noqa: E712
                ProjectStatusConfig.order > current_order,
            )
            .order_by(ProjectStatusConfig.order.asc())
            .limit(1)
        )
        return row.scalar_one_or_none()

    @staticmethod
    async def _execute_ask(
        db: AsyncSession,
        project_id: uuid.UUID,
        task: ProjectTask,
        binding: ProjectStageAgentBinding,
    ) -> None:
        endpoint, _ = ProjectAgentRunner._azure_config(binding)
        if not endpoint or not ProjectAgentRunner._azure_sp_configured() or not (binding.agent_id or "").strip():
            err = ProjectAgentRunner._credentials_error_message(binding)
            exec_row = ProjectAgentExecution(
                task_id=task.id,
                binding_id=binding.id,
                status="failed",
                error_message=err,
            )
            db.add(exec_row)
            db.add(ProjectAgentRunner._notify_agent_failure(binding, task.id, err))
            await db.commit()
            return

        prompt = await ProjectAgentRunner._build_prompt(db, task, binding.prompt_template)
        thread_id = None
        if binding.continue_thread:
            thread_id = await ProjectAgentRunner._resolve_thread_id(db, task.id, binding.id)

        # Anonimiza ANTES de registrar e enviar (DLP/PII): o registro guarda o conteúdo já
        # anonimizado + relatório de categorias tratadas (nunca os dados reais removidos).
        send_msg, anon_report = await ProjectAgentRunner._anonymize_prompt(db, prompt)
        exec_row = ProjectAgentExecution(
            task_id=task.id,
            binding_id=binding.id,
            status="pending",
            thread_id=thread_id,
            request_payload={"agent_id": binding.agent_id, "mensagem": send_msg,
                             "thread_id": thread_id, "_anonimizacao": anon_report},
        )
        db.add(exec_row)
        await db.flush()

        try:
            status_code, body, answer_message = await ProjectAgentRunner._call_azure_agent(
                binding, send_msg, thread_id,
            )
            if status_code >= 400:
                exec_row.status = "failed"
                exec_row.response_payload = body
                exec_row.error_message = ProjectAgentRunner._gateway_http_message(status_code)
            else:
                exec_row.status = "success"
                exec_row.response_payload = body
                exec_row.thread_id = body.get("thread_id")
                exec_row.answer_message = answer_message
                if binding.add_comment_on_success and exec_row.answer_message:
                    db.add(ProjectTaskComment(
                        task_id=task.id,
                        author_id=None,
                        content=f"[agente: {binding.name}]\n{exec_row.answer_message}",
                    ))
        except Exception as exc:  # noqa: BLE001
            exec_row.status = "failed"
            exec_row.error_message = ProjectAgentRunner._format_gateway_error(exc)
            db.add(ProjectAgentRunner._notify_agent_failure(binding, task.id, exec_row.error_message))
        await db.commit()

    @staticmethod
    async def _execute_classify_and_advance(
        db: AsyncSession,
        project_id: uuid.UUID,
        task: ProjectTask,
        binding: ProjectStageAgentBinding,
        status_obj: Optional[ProjectStatusConfig] = None,
    ) -> None:
        current_status = status_obj or await db.get(ProjectStatusConfig, task.status_id)
        if not current_status:
            return

        prompt = await ProjectAgentRunner._build_classify_prompt(
            db, project_id, task, binding.prompt_template,
        )
        thread_id = None
        if binding.continue_thread:
            thread_id = await ProjectAgentRunner._resolve_thread_id(db, task.id, binding.id)

        # Anonimiza ANTES de registrar e enviar (DLP/PII): o registro guarda o conteúdo já
        # anonimizado + relatório de categorias tratadas (nunca os dados reais removidos).
        send_msg, anon_report = await ProjectAgentRunner._anonymize_prompt(db, prompt)
        exec_row = ProjectAgentExecution(
            task_id=task.id,
            binding_id=binding.id,
            status="pending",
            thread_id=thread_id,
            request_payload={"agent_id": binding.agent_id, "mensagem": send_msg,
                             "thread_id": thread_id, "_anonimizacao": anon_report},
        )
        db.add(exec_row)
        await db.flush()

        try:
            status_code, body, answer_message = await ProjectAgentRunner._call_azure_agent(
                binding, send_msg, thread_id,
            )
            exec_row.response_payload = body
            exec_row.thread_id = body.get("thread_id")
            exec_row.answer_message = answer_message

            if status_code >= 400:
                exec_row.status = "failed"
                exec_row.error_message = ProjectAgentRunner._gateway_http_message(status_code)
                db.add(ProjectAgentRunner._notify_agent_failure(binding, task.id, exec_row.error_message))
                await db.commit()
                return

            if not answer_message:
                exec_row.status = "failed"
                exec_row.error_message = "Agente não retornou mensagem de resposta."
                db.add(ProjectAgentRunner._notify_agent_failure(binding, task.id, exec_row.error_message))
                await db.commit()
                return

            score_input = await ProjectAgentRunner._parse_classify_response(db, answer_message)
            preview = await PriorityScoreService.preview(db, score_input)
            exec_id = exec_row.id
            await PriorityScoreService.score_task(db, task.id, score_input, user_id=None)
            exec_row = await db.get(ProjectAgentExecution, exec_id)
            if exec_row is None:
                raise ValueError("Falha ao registrar execução do agente.")
            await db.refresh(task)

            # Raia de destino: usa a configurada no agente (advance_to_status_id), se válida
            # neste projeto; caso contrário, avança para a próxima etapa do funil.
            next_status = None
            if binding.advance_to_status_id:
                cfg = await db.get(ProjectStatusConfig, binding.advance_to_status_id)
                if cfg is not None and cfg.project_id == project_id:
                    next_status = cfg
            if next_status is None:
                next_status = await ProjectAgentRunner._next_status_in_funnel(
                    db, current_status.funnel_id, current_status.order,
                )
            advanced_to: Optional[str] = None
            if next_status and next_status.id != task.status_id:
                await ProjectTaskService.update(
                    db,
                    project_id,
                    task.id,
                    ProjectTaskUpdate(status_id=next_status.id),
                    current_user=None,
                )
                advanced_to = next_status.name
                exec_row = await db.get(ProjectAgentExecution, exec_id)

            if exec_row is None:
                raise ValueError("Registro de execução do agente não encontrado.")

            exec_row.status = "success"
            if binding.add_comment_on_success:
                parsed = ProjectAgentRunner._extract_json_from_text(answer_message) or {}
                justificativa = parsed.get("justificativa") or answer_message
                quadrant = preview.get("quadrant_code", "—")
                move_note = f"\n\nCard avançado para: {advanced_to}" if advanced_to else "\n\nNão há próxima etapa no funil."
                db.add(ProjectTaskComment(
                    task_id=task.id,
                    author_id=None,
                    content=(
                        f"[agente: {binding.name}] Classificação automática\n"
                        f"Quadrante: {quadrant} | Impacto efetivo: {preview.get('impacto_efetivo')} | "
                        f"Esforço: {preview.get('esforco')}\n\n{justificativa}{move_note}"
                    ),
                ))
            await db.commit()
        except Exception as exc:  # noqa: BLE001
            exec_row.status = "failed"
            exec_row.error_message = ProjectAgentRunner._format_gateway_error(exc)
            db.add(ProjectAgentRunner._notify_agent_failure(binding, task.id, exec_row.error_message))
            await db.commit()

    @staticmethod
    async def _execute(
        db: AsyncSession,
        project_id: uuid.UUID,
        task: ProjectTask,
        binding: ProjectStageAgentBinding,
    ) -> None:
        """Legado — use _execute_ask ou _execute_classify_and_advance."""
        await ProjectAgentRunner._execute_ask(db, project_id, task, binding)


# ─────────────────────────────────────────────
# Priorização: Matriz de Impacto × Esforço
# ─────────────────────────────────────────────

# Defaults da metodologia (Anexo A v2 — Sistema FIEA). Tudo editável por tenant.
def _scale(r1: str, r3: str, r5: str) -> list[dict]:
    """Gera a escala 1-5 a partir das rubricas 1/3/5 da planilha.
    1 e 2 herdam o texto do nível baixo; 3 o médio; 4 e 5 o alto. Editável depois."""
    return [
        {"value": 1, "description": r1},
        {"value": 2, "description": r1},
        {"value": 3, "description": r3},
        {"value": 4, "description": r5},
        {"value": 5, "description": r5},
    ]


_PRIORITY_CRITERIA_SEED: list[dict] = [
    # Eixo Impacto (soma 1.0)
    {"axis": "impact", "code": "aderencia_estrategica", "label": "Aderência Estratégica", "weight": 0.35, "order": 0,
     "scale": _scale("Sem aderência a nenhum dos 19 objetivos do Mapa", "Contribui com profundidade média para um pilar", "Sustentação central de um pilar do Mapa")},
    {"axis": "impact", "code": "cliente", "label": "Cliente", "weight": 0.15, "order": 1,
     "scale": _scale("Não impacta experiência do cliente", "Impacto moderado em satisfação", "Transforma experiência do cliente final")},
    {"axis": "impact", "code": "financeiro", "label": "Financeiro", "weight": 0.15, "order": 2,
     "scale": _scale("Sem impacto financeiro relevante", "Economia ou receita moderada", "Grande potencial de transformação econômica")},
    {"axis": "impact", "code": "eficiencia", "label": "Eficiência Operacional", "weight": 0.10, "order": 3,
     "scale": _scale("Não traz ganho de eficiência", "Ganho moderado de eficiência", "Efeito significativo em indicadores e chamados")},
    {"axis": "impact", "code": "risco", "label": "Risco Regulatório", "weight": 0.15, "order": 4,
     "scale": _scale("Sem implicação regulatória", "Implicação moderada, sem prazo crítico", "Crítico em LGPD, ANPD, TCU ou Sistema S")},
    {"axis": "impact", "code": "alcance", "label": "Alcance", "weight": 0.10, "order": 5,
     "scale": _scale("Afeta < 50 pessoas ou 1 unidade", "Afeta 500-5.000 pessoas ou múltiplas unidades", "Afeta > 10.000 pessoas ou todo o Sistema FIEA")},
    # Eixo Esforço (soma 1.0)
    {"axis": "effort", "code": "documentacao", "label": "Documentação existente", "weight": 0.15, "order": 0,
     "scale": _scale("Documento qualificado do estado atual", "Documento existe mas não qualificado", "Não possui documentação")},
    {"axis": "effort", "code": "areas", "label": "Áreas envolvidas", "weight": 0.15, "order": 1,
     "scale": _scale("Até 2 áreas", "3 a 4 áreas", "5 ou mais áreas")},
    {"axis": "effort", "code": "maturidade", "label": "Maturidade do escopo", "weight": 0.20, "order": 2,
     "scale": _scale("Escopo claro, requisitos definidos", "Escopo parcial, alguns refinamentos", "Escopo em construção, muitos requisitos a definir")},
    {"axis": "effort", "code": "complexidade", "label": "Complexidade técnica", "weight": 0.25, "order": 3,
     "scale": _scale("Solução simples, padrões conhecidos", "Média complexidade, alguns padrões novos", "Alta complexidade, arquitetura ou tecnologia novas")},
    {"axis": "effort", "code": "integracoes", "label": "Integrações e dependências", "weight": 0.25, "order": 4,
     "scale": _scale("Solução isolada, sem integrações", "Integra com 1-2 sistemas internos", "Múltiplas integrações com legados e terceiros")},
]
_CRITERIA_SEED_BY_KEY = {(r["axis"], r["code"]): r for r in _PRIORITY_CRITERIA_SEED}

# Cor por perspectiva do Mapa Estratégico.
_PERSPECTIVE_COLORS: dict[str, str] = {
    "Financeiro & Administrativo": "#2563EB",
    "Marca": "#DB2777",
    "Inovação": "#7C3AED",
    "Cliente": "#059669",
    "Capital Organizacional": "#D97706",
    "Capital Humano": "#0891B2",
}

_PRIORITY_PILLARS_SEED: list[dict] = [
    {"code": "F1", "perspective": "Financeiro & Administrativo", "label": "Sustentabilidade financeira e institucional"},
    {"code": "F2", "perspective": "Financeiro & Administrativo", "label": "Governança Corporativa e Compliance"},
    {"code": "F3", "perspective": "Financeiro & Administrativo", "label": "Impacto ambiental e social positivo"},
    {"code": "M1", "perspective": "Marca", "label": "Fortalecer a marca em atributos e propósito"},
    {"code": "I1", "perspective": "Inovação", "label": "Negócios sustentáveis e inovadores"},
    {"code": "I2", "perspective": "Inovação", "label": "Soluções e produtos inovadores"},
    {"code": "I3", "perspective": "Inovação", "label": "Cultura da inovação como motor"},
    {"code": "C1", "perspective": "Cliente", "label": "Ampliar cobertura da indústria"},
    {"code": "C2", "perspective": "Cliente", "label": "Conquistar, reter e expandir clientes"},
    {"code": "C3", "perspective": "Cliente", "label": "Dominar pontos de contato com cliente"},
    {"code": "O1", "perspective": "Capital Organizacional", "label": "Saúde e Segurança como solução"},
    {"code": "O2", "perspective": "Capital Organizacional", "label": "Qualidade pedagógica Sesi"},
    {"code": "O3", "perspective": "Capital Organizacional", "label": "Qualidade pedagógica Educação Profissional"},
    {"code": "O4", "perspective": "Capital Organizacional", "label": "Expandir Serviços de Tecnologia e Inovação"},
    {"code": "O5", "perspective": "Capital Organizacional", "label": "Gestão por processos"},
    {"code": "O6", "perspective": "Capital Organizacional", "label": "Digitalização integrada"},
    {"code": "O7", "perspective": "Capital Organizacional", "label": "Inteligência institucional e dados"},
    {"code": "H1", "perspective": "Capital Humano", "label": "Talentos estratégicos e alta performance"},
    {"code": "H2", "perspective": "Capital Humano", "label": "Lideranças com visão estratégica"},
]

_PRIORITY_CONFIDENCE_SEED: list[dict] = [
    {"code": "alta", "label": "Alta", "divisor": 1.0, "order": 0},
    {"code": "media", "label": "Média", "divisor": 1.0, "order": 1},
    {"code": "baixa", "label": "Baixa", "divisor": 1.5, "order": 2},
]

_PRIORITY_QUADRANTS_SEED: list[dict] = [
    {"code": "quick_win", "label": "Quick Win", "color": "#16A34A", "order": 0,
     "action_hint": "Alto impacto, baixo esforço. Fazer primeiro."},
    {"code": "big_bet", "label": "Big Bet", "color": "#2563EB", "order": 1,
     "action_hint": "Alto impacto, alto esforço. Planejar com cuidado, exige sponsor."},
    {"code": "fill_in", "label": "Fill In", "color": "#CA8A04", "order": 2,
     "action_hint": "Baixo impacto, baixo esforço. Encaixar quando der."},
    {"code": "money_pit", "label": "Money Pit", "color": "#DC2626", "order": 3,
     "action_hint": "Baixo impacto, alto esforço. Evitar ou recusar."},
]


def compute_priority(
    *,
    impact_scores: dict[str, int],
    effort_scores: dict[str, int],
    impact_criteria: list[ProjectPriorityCriterion],
    effort_criteria: list[ProjectPriorityCriterion],
    pillar_modifier: float,
    confidence_divisor: float,
    impact_cut: float,
    effort_cut: float,
) -> dict:
    """Motor puro da metodologia. Corte aplicado sobre o impacto EFETIVO (já modulado)."""
    impacto_bruto = sum(
        float(c.weight) * float(impact_scores.get(c.code, 0)) for c in impact_criteria if c.is_active
    )
    esforco = sum(
        float(c.weight) * float(effort_scores.get(c.code, 0)) for c in effort_criteria if c.is_active
    )
    divisor = confidence_divisor if confidence_divisor else 1.0
    impacto_efetivo = (impacto_bruto * pillar_modifier) / divisor

    if impacto_efetivo >= impact_cut and esforco < effort_cut:
        quadrant_code = "quick_win"
    elif impacto_efetivo >= impact_cut and esforco >= effort_cut:
        quadrant_code = "big_bet"
    elif impacto_efetivo < impact_cut and esforco < effort_cut:
        quadrant_code = "fill_in"
    else:
        quadrant_code = "money_pit"

    return {
        "impacto_bruto": round(impacto_bruto, 3),
        "modulador": round(float(pillar_modifier), 2),
        "divisor": round(float(divisor), 2),
        "impacto_efetivo": round(impacto_efetivo, 3),
        "esforco": round(esforco, 3),
        "quadrant_code": quadrant_code,
    }


class PriorityConfigService:
    """Config da metodologia de priorização — 100% customizável por tenant.
    Seed lazy (padrão ProjectDefaultFormService) no primeiro GET, idempotente."""

    @staticmethod
    async def ensure_seeded(db: AsyncSession) -> None:
        changed = False

        # Critérios
        res = await db.execute(select(ProjectPriorityCriterion))
        existing_crit = {(c.axis, c.code): c for c in res.scalars().all()}
        for row in _PRIORITY_CRITERIA_SEED:
            current = existing_crit.get((row["axis"], row["code"]))
            if current is None:
                db.add(ProjectPriorityCriterion(**row))
                changed = True
            elif not current.scale:
                # backfill da escala em tenants migrados de rubric_1/3/5 → scale
                current.scale = row["scale"]
                changed = True

        # Pilares
        res = await db.execute(select(ProjectPriorityPillar.code))
        existing_codes = {c for (c,) in res.all()}
        for row in _PRIORITY_PILLARS_SEED:
            if row["code"] not in existing_codes:
                db.add(ProjectPriorityPillar(
                    code=row["code"], label=row["label"], perspective=row["perspective"],
                    modifier=1.0, color=_PERSPECTIVE_COLORS.get(row["perspective"], "#6B7280"),
                    order=_PRIORITY_PILLARS_SEED.index(row),
                ))
                changed = True

        # Confiança
        res = await db.execute(select(ProjectPriorityConfidenceLevel.code))
        existing_codes = {c for (c,) in res.all()}
        for row in _PRIORITY_CONFIDENCE_SEED:
            if row["code"] not in existing_codes:
                db.add(ProjectPriorityConfidenceLevel(**row))
                changed = True

        # Quadrantes
        res = await db.execute(select(ProjectPriorityQuadrant.code))
        existing_codes = {c for (c,) in res.all()}
        for row in _PRIORITY_QUADRANTS_SEED:
            if row["code"] not in existing_codes:
                db.add(ProjectPriorityQuadrant(**row))
                changed = True

        # Settings singleton (com Fator de Confiança GLOBAL da metodologia)
        res = await db.execute(select(ProjectPrioritySettings).limit(1))
        settings = res.scalar_one_or_none()
        if settings is None:
            # confiança ativa default = "media" (divisor 1.0, neutra); PMO ajusta na config
            conf_res = await db.execute(
                select(ProjectPriorityConfidenceLevel).where(ProjectPriorityConfidenceLevel.code == "media")
            )
            default_conf = conf_res.scalar_one_or_none()
            db.add(ProjectPrioritySettings(
                impact_cut=3.0, effort_cut=3.0, is_enabled=True,
                confidence_id=default_conf.id if default_conf else None,
            ))
            changed = True

        if changed:
            await db.commit()

    @staticmethod
    async def list_criteria(db: AsyncSession) -> list[ProjectPriorityCriterion]:
        await PriorityConfigService.ensure_seeded(db)
        res = await db.execute(
            select(ProjectPriorityCriterion).order_by(
                ProjectPriorityCriterion.axis.asc(), ProjectPriorityCriterion.order.asc()
            )
        )
        return list(res.scalars().all())

    @staticmethod
    async def list_pillars(db: AsyncSession) -> list[ProjectPriorityPillar]:
        await PriorityConfigService.ensure_seeded(db)
        res = await db.execute(
            select(ProjectPriorityPillar).order_by(ProjectPriorityPillar.order.asc())
        )
        return list(res.scalars().all())

    @staticmethod
    async def list_confidence(db: AsyncSession) -> list[ProjectPriorityConfidenceLevel]:
        await PriorityConfigService.ensure_seeded(db)
        res = await db.execute(
            select(ProjectPriorityConfidenceLevel).order_by(ProjectPriorityConfidenceLevel.order.asc())
        )
        return list(res.scalars().all())

    @staticmethod
    async def list_quadrants(db: AsyncSession) -> list[ProjectPriorityQuadrant]:
        await PriorityConfigService.ensure_seeded(db)
        res = await db.execute(
            select(ProjectPriorityQuadrant).order_by(ProjectPriorityQuadrant.order.asc())
        )
        return list(res.scalars().all())

    @staticmethod
    async def get_settings(db: AsyncSession) -> ProjectPrioritySettings:
        await PriorityConfigService.ensure_seeded(db)
        res = await db.execute(select(ProjectPrioritySettings).limit(1))
        return res.scalar_one()

    @staticmethod
    async def save_criteria(db: AsyncSession, data: PriorityCriteriaUpsert) -> list[ProjectPriorityCriterion]:
        await PriorityConfigService.ensure_seeded(db)
        keep = {(i.axis, i.code) for i in data.criteria}
        res = await db.execute(select(ProjectPriorityCriterion))
        existing = {(c.axis, c.code): c for c in res.scalars().all()}
        for key, row in existing.items():
            if key not in keep:
                await db.delete(row)
        for item in data.criteria:
            scale = [{"value": p.value, "description": p.description} for p in item.scale]
            current = existing.get((item.axis, item.code))
            if current is None:
                db.add(ProjectPriorityCriterion(
                    axis=item.axis, code=item.code, label=item.label, weight=item.weight,
                    scale=scale, order=item.order, is_active=item.is_active,
                ))
            else:
                current.label = item.label
                current.weight = item.weight
                current.scale = scale
                current.order = item.order
                current.is_active = item.is_active
                current.updated_at = datetime.utcnow()
        await db.commit()
        await PriorityScoreService.recompute_all(db)
        return await PriorityConfigService.list_criteria(db)

    @staticmethod
    async def save_pillars(db: AsyncSession, data: PriorityPillarsUpsert) -> list[ProjectPriorityPillar]:
        await PriorityConfigService.ensure_seeded(db)
        keep = {i.code for i in data.pillars}
        res = await db.execute(select(ProjectPriorityPillar))
        existing = {p.code: p for p in res.scalars().all()}
        for code, row in existing.items():
            if code not in keep:
                await db.delete(row)
        for item in data.pillars:
            current = existing.get(item.code)
            if current is None:
                db.add(ProjectPriorityPillar(
                    code=item.code, label=item.label, perspective=item.perspective,
                    modifier=item.modifier, color=item.color, order=item.order, is_active=item.is_active,
                ))
            else:
                current.label = item.label
                current.perspective = item.perspective
                current.modifier = item.modifier
                current.color = item.color
                current.order = item.order
                current.is_active = item.is_active
                current.updated_at = datetime.utcnow()
        await db.commit()
        await PriorityScoreService.recompute_all(db)
        return await PriorityConfigService.list_pillars(db)

    @staticmethod
    async def save_confidence(db: AsyncSession, data: PriorityConfidenceUpsert) -> list[ProjectPriorityConfidenceLevel]:
        await PriorityConfigService.ensure_seeded(db)
        keep = {i.code for i in data.levels}
        res = await db.execute(select(ProjectPriorityConfidenceLevel))
        existing = {c.code: c for c in res.scalars().all()}
        for code, row in existing.items():
            if code not in keep:
                await db.delete(row)
        for item in data.levels:
            current = existing.get(item.code)
            if current is None:
                db.add(ProjectPriorityConfidenceLevel(
                    code=item.code, label=item.label, divisor=item.divisor,
                    order=item.order, is_active=item.is_active,
                ))
            else:
                current.label = item.label
                current.divisor = item.divisor
                current.order = item.order
                current.is_active = item.is_active
                current.updated_at = datetime.utcnow()
        await db.commit()
        await PriorityScoreService.recompute_all(db)
        return await PriorityConfigService.list_confidence(db)

    @staticmethod
    async def save_quadrants(db: AsyncSession, data: PriorityQuadrantsUpsert) -> list[ProjectPriorityQuadrant]:
        await PriorityConfigService.ensure_seeded(db)
        res = await db.execute(select(ProjectPriorityQuadrant))
        existing = {q.code: q for q in res.scalars().all()}
        for item in data.quadrants:
            current = existing.get(item.code)
            if current is None:
                db.add(ProjectPriorityQuadrant(
                    code=item.code, label=item.label, color=item.color,
                    action_hint=item.action_hint, order=item.order,
                ))
            else:
                current.label = item.label
                current.color = item.color
                current.action_hint = item.action_hint
                current.order = item.order
                current.updated_at = datetime.utcnow()
        await db.commit()  # quadrantes não afetam o cálculo — sem recompute
        return await PriorityConfigService.list_quadrants(db)

    @staticmethod
    async def update_settings(db: AsyncSession, data: PrioritySettingsUpdate) -> ProjectPrioritySettings:
        settings = await PriorityConfigService.get_settings(db)
        if data.confidence_id is not None:
            confidence = {c.id for c in await PriorityConfigService.list_confidence(db)}
            if data.confidence_id not in confidence:
                raise HTTPException(status_code=400, detail="Nível de confiança inválido.")
        settings.impact_cut = data.impact_cut
        settings.effort_cut = data.effort_cut
        settings.confidence_id = data.confidence_id
        settings.is_enabled = data.is_enabled
        settings.updated_at = datetime.utcnow()
        await db.commit()
        await PriorityScoreService.recompute_all(db)
        return await PriorityConfigService.get_settings(db)


class PriorityScoreService:
    """Pontuação das demandas (1:1 com ProjectTask)."""

    @staticmethod
    async def _load_config(db: AsyncSession):
        criteria = await PriorityConfigService.list_criteria(db)
        impact_criteria = [c for c in criteria if c.axis == "impact"]
        effort_criteria = [c for c in criteria if c.axis == "effort"]
        pillars = {p.id: p for p in await PriorityConfigService.list_pillars(db)}
        confidence = {c.id: c for c in await PriorityConfigService.list_confidence(db)}
        settings = await PriorityConfigService.get_settings(db)
        return impact_criteria, effort_criteria, pillars, confidence, settings

    @staticmethod
    def _coerce_pillar_ids(raw) -> list[uuid.UUID]:
        """Normaliza a lista de pilares (JSONB guarda strings) para UUIDs."""
        out: list[uuid.UUID] = []
        for item in raw or []:
            if isinstance(item, uuid.UUID):
                out.append(item)
            else:
                try:
                    out.append(uuid.UUID(str(item)))
                except (ValueError, AttributeError, TypeError):
                    continue
        return out

    @staticmethod
    def _primary_pillar(pillars, pillar_ids: list[uuid.UUID]) -> Optional[uuid.UUID]:
        """Pilar de maior modificador entre os selecionados (desempate: ordem da lista).
        Vira o `pillar_id` materializado para join/filtro da matriz."""
        valid = [pid for pid in pillar_ids if pid in pillars]
        if not valid:
            return None
        return max(valid, key=lambda pid: float(pillars[pid].modifier))

    @staticmethod
    def _compute_with(impact_criteria, effort_criteria, pillars, confidence, settings,
                      *, pillar_ids, impact_scores, effort_scores) -> dict:
        # Vários pilares → usa o MAIOR modificador entre os selecionados.
        mods = [float(pillars[pid].modifier) for pid in pillar_ids if pid in pillars]
        modifier = max(mods) if mods else 1.0
        # Fator de Confiança é GLOBAL: vem de settings.confidence_id, não da demanda.
        conf = confidence.get(settings.confidence_id)
        divisor = float(conf.divisor) if conf else 1.0
        return compute_priority(
            impact_scores=impact_scores, effort_scores=effort_scores,
            impact_criteria=impact_criteria, effort_criteria=effort_criteria,
            pillar_modifier=modifier, confidence_divisor=divisor,
            impact_cut=float(settings.impact_cut), effort_cut=float(settings.effort_cut),
        )

    @staticmethod
    async def preview(db: AsyncSession, data: PriorityScoreInput) -> dict:
        impact_criteria, effort_criteria, pillars, confidence, settings = await PriorityScoreService._load_config(db)
        return PriorityScoreService._compute_with(
            impact_criteria, effort_criteria, pillars, confidence, settings,
            pillar_ids=data.effective_pillar_ids,
            impact_scores=data.impact_scores, effort_scores=data.effort_scores,
        )

    @staticmethod
    async def get_for_task(db: AsyncSession, task_id: uuid.UUID) -> Optional[ProjectPriorityScore]:
        res = await db.execute(select(ProjectPriorityScore).where(ProjectPriorityScore.task_id == task_id))
        return res.scalar_one_or_none()

    @staticmethod
    async def _related_task_ids(db: AsyncSession, task_id: uuid.UUID) -> set[uuid.UUID]:
        """Família do card: conjunto conectado por ORIGEM (conversão Demanda→Projeto)
        e por PAI/FILHO — transitivo. A priorização é compartilhada por toda a família."""
        visited: set[uuid.UUID] = {task_id}
        frontier: list[uuid.UUID] = [task_id]
        while frontier:
            res = await db.execute(
                select(ProjectTask.id, ProjectTask.parent_task_id, ProjectTask.origin_task_id).where(
                    or_(
                        ProjectTask.id.in_(frontier),          # pega pai/origem do frontier
                        ProjectTask.parent_task_id.in_(frontier),  # filhos
                        ProjectTask.origin_task_id.in_(frontier),  # cards convertidos a partir do frontier
                    )
                )
            )
            new_ids: set[uuid.UUID] = set()
            for tid, parent_id, origin_id in res.all():
                for cand in (tid, parent_id, origin_id):
                    if cand is not None and cand not in visited:
                        visited.add(cand)
                        new_ids.add(cand)
            frontier = list(new_ids)
        return visited

    @staticmethod
    def _copy_score(dst: ProjectPriorityScore, src: ProjectPriorityScore) -> None:
        dst.pillar_id = src.pillar_id
        dst.pillar_ids = list(src.pillar_ids or [])
        dst.confidence_id = src.confidence_id
        dst.impact_scores = src.impact_scores
        dst.effort_scores = src.effort_scores
        dst.impacto_bruto = src.impacto_bruto
        dst.modulador = src.modulador
        dst.divisor = src.divisor
        dst.impacto_efetivo = src.impacto_efetivo
        dst.esforco = src.esforco
        dst.quadrant_code = src.quadrant_code
        dst.scored_by = src.scored_by
        dst.scored_at = src.scored_at
        dst.updated_at = datetime.utcnow()

    @staticmethod
    async def score_task(
        db: AsyncSession, task_id: uuid.UUID, data: PriorityScoreInput, user_id: Optional[uuid.UUID]
    ) -> ProjectPriorityScore:
        task = await db.get(ProjectTask, task_id)
        if not task:
            raise HTTPException(status_code=404, detail="Demanda não encontrada.")
        impact_criteria, effort_criteria, pillars, confidence, settings = await PriorityScoreService._load_config(db)
        pillar_ids = data.effective_pillar_ids
        invalid = [pid for pid in pillar_ids if pid not in pillars]
        if invalid:
            raise HTTPException(status_code=400, detail="Pilar estratégico inválido.")
        primary_pillar_id = PriorityScoreService._primary_pillar(pillars, pillar_ids)
        result = PriorityScoreService._compute_with(
            impact_criteria, effort_criteria, pillars, confidence, settings,
            pillar_ids=pillar_ids,
            impact_scores=data.impact_scores, effort_scores=data.effort_scores,
        )
        # Aplica a TODA a família (origem, pai e filhos — transitivo): a priorização é herdada.
        family = await PriorityScoreService._related_task_ids(db, task_id)
        res = await db.execute(
            select(ProjectPriorityScore).where(ProjectPriorityScore.task_id.in_(family))
        )
        rows = {r.task_id: r for r in res.scalars().all()}
        ts = datetime.utcnow()
        stored_pillar_ids = [str(pid) for pid in pillar_ids]
        for tid in family:
            row = rows.get(tid)
            if row is None:
                row = ProjectPriorityScore(task_id=tid)
                db.add(row)
            row.pillar_id = primary_pillar_id
            row.pillar_ids = list(stored_pillar_ids)
            row.confidence_id = settings.confidence_id
            row.impact_scores = data.impact_scores
            row.effort_scores = data.effort_scores
            row.impacto_bruto = result["impacto_bruto"]
            row.modulador = result["modulador"]
            row.divisor = result["divisor"]
            row.impacto_efetivo = result["impacto_efetivo"]
            row.esforco = result["esforco"]
            row.quadrant_code = result["quadrant_code"]
            row.scored_by = user_id
            row.scored_at = ts
            row.updated_at = ts
        # Auditoria: registra o evento de repriorização para a demanda pontuada.
        db.add(ProjectPriorityScoreHistory(
            task_id=task_id,
            pillar_ids=list(stored_pillar_ids),
            impact_scores=data.impact_scores,
            effort_scores=data.effort_scores,
            impacto_efetivo=result["impacto_efetivo"],
            esforco=result["esforco"],
            quadrant_code=result["quadrant_code"],
            scored_by=user_id,
            scored_at=ts,
        ))
        await db.commit()
        return await PriorityScoreService.get_for_task(db, task_id)

    @staticmethod
    async def history(db: AsyncSession, task_id: uuid.UUID) -> list[ProjectPriorityScoreHistory]:
        """Histórico de repriorização de uma demanda (mais recente primeiro)."""
        res = await db.execute(
            select(ProjectPriorityScoreHistory)
            .where(ProjectPriorityScoreHistory.task_id == task_id)
            .order_by(ProjectPriorityScoreHistory.scored_at.desc())
        )
        return list(res.scalars().all())

    @staticmethod
    async def sync_family(db: AsyncSession, anchor_task_id: uuid.UUID) -> None:
        """Garante que toda a família compartilhe a MESMA pontuação. Usa como fonte o
        score mais recente da família. Chamado quando um card novo entra na família
        (conversão, criação de filho, vínculo de pai) para que ele herde a priorização."""
        family = await PriorityScoreService._related_task_ids(db, anchor_task_id)
        if len(family) <= 1:
            return
        res = await db.execute(
            select(ProjectPriorityScore).where(ProjectPriorityScore.task_id.in_(family))
        )
        rows = {r.task_id: r for r in res.scalars().all()}
        if not rows:
            return
        source = max(rows.values(), key=lambda r: r.scored_at or r.updated_at)
        changed = False
        for tid in family:
            if tid == source.task_id:
                continue
            row = rows.get(tid)
            if row is None:
                row = ProjectPriorityScore(task_id=tid)
                db.add(row)
                PriorityScoreService._copy_score(row, source)
                changed = True
            elif row.impacto_efetivo != source.impacto_efetivo or row.esforco != source.esforco or row.quadrant_code != source.quadrant_code or row.impact_scores != source.impact_scores or row.effort_scores != source.effort_scores:
                PriorityScoreService._copy_score(row, source)
                changed = True
        if changed:
            await db.commit()

    @staticmethod
    async def delete(db: AsyncSession, task_id: uuid.UUID) -> None:
        # Remove a pontuação de toda a família (mantém consistência da herança).
        family = await PriorityScoreService._related_task_ids(db, task_id)
        await db.execute(sa_delete(ProjectPriorityScore).where(ProjectPriorityScore.task_id.in_(family)))
        await db.commit()

    @staticmethod
    async def recompute_all(db: AsyncSession) -> None:
        """Recalcula os agregados de todos os scores com a config atual, preservando
        os inputs brutos (1-5). Chamado quando pesos/moduladores/divisores/cortes mudam."""
        impact_criteria, effort_criteria, pillars, confidence, settings = await PriorityScoreService._load_config(db)
        res = await db.execute(select(ProjectPriorityScore))
        scores = list(res.scalars().all())
        for s in scores:
            # Lista de pilares (com fallback para o legado pillar_id de scores antigos).
            pillar_ids = PriorityScoreService._coerce_pillar_ids(s.pillar_ids)
            if not pillar_ids and s.pillar_id is not None:
                pillar_ids = [s.pillar_id]
            s.pillar_ids = [str(pid) for pid in pillar_ids]
            s.pillar_id = PriorityScoreService._primary_pillar(pillars, pillar_ids)
            result = PriorityScoreService._compute_with(
                impact_criteria, effort_criteria, pillars, confidence, settings,
                pillar_ids=pillar_ids,
                impact_scores=s.impact_scores or {}, effort_scores=s.effort_scores or {},
            )
            # confiança global vigente vira o snapshot do score
            s.confidence_id = settings.confidence_id
            s.impacto_bruto = result["impacto_bruto"]
            s.modulador = result["modulador"]
            s.divisor = result["divisor"]
            s.impacto_efetivo = result["impacto_efetivo"]
            s.esforco = result["esforco"]
            s.quadrant_code = result["quadrant_code"]
            s.updated_at = datetime.utcnow()
        if scores:
            await db.commit()

    @staticmethod
    async def quadrant_order_map(db: AsyncSession) -> dict[Optional[str], int]:
        """Mapa {quadrant_code: order} para ordenação quadrante-primeiro. Fonte única
        compartilhada por Matriz e Portfólio."""
        res = await db.execute(
            select(ProjectPriorityQuadrant.code, ProjectPriorityQuadrant.order)
        )
        return {code: order for code, order in res.all()}

    @staticmethod
    def priority_order_key(
        quadrant_order: dict[Optional[str], int],
        *,
        quadrant_code: Optional[str],
        impacto_efetivo: Optional[float],
        esforco: Optional[float],
        unscored: bool,
    ) -> tuple:
        """Chave de ordenação canônica da priorização (igual em Matriz e Portfólio):
        1) itens sem score por último; 2) quadrante primeiro (quick_win → big_bet →
        fill_in → money_pit, via `order`); 3) densidade de valor (impacto ÷ esforço) desc
        como desempate dentro do quadrante; 4) impacto efetivo desc como último desempate."""
        rank = (
            impacto_efetivo / esforco
            if (impacto_efetivo is not None and esforco is not None and esforco > 0)
            else None
        )
        return (
            1 if unscored else 0,
            quadrant_order.get(quadrant_code, 9_999),
            -(rank if rank is not None else 0.0),
            -(impacto_efetivo if impacto_efetivo is not None else 0.0),
        )

    @staticmethod
    async def matrix(
        db: AsyncSession,
        funnel_id: Optional[uuid.UUID] = None,
        quadrant: Optional[str] = None,
        pillar_id: Optional[uuid.UUID] = None,
    ) -> list[dict]:
        stmt = (
            select(ProjectPriorityScore, ProjectTask, ProjectPriorityPillar)
            .join(ProjectTask, ProjectTask.id == ProjectPriorityScore.task_id)
            .join(ProjectStatusConfig, ProjectStatusConfig.id == ProjectTask.status_id)
            .outerjoin(ProjectPriorityPillar, ProjectPriorityPillar.id == ProjectPriorityScore.pillar_id)
        )
        if funnel_id is not None:
            stmt = stmt.where(ProjectStatusConfig.funnel_id == funnel_id)
        if quadrant is not None:
            stmt = stmt.where(ProjectPriorityScore.quadrant_code == quadrant)
        if pillar_id is not None:
            stmt = stmt.where(ProjectPriorityScore.pillar_id == pillar_id)
        res = await db.execute(stmt)
        quadrant_order = await PriorityScoreService.quadrant_order_map(db)
        out: list[dict] = []
        for score, task, pillar in res.all():
            impacto = float(score.impacto_efetivo)
            esforco = float(score.esforco)
            # Densidade de valor (estilo RICE): impacto por unidade de esforço. É o
            # desempate dentro de um mesmo quadrante — quanto maior, mais cedo fazer.
            # None apenas no caso raro de esforço 0 (guarda da divisão por zero).
            priority_rank = (impacto / esforco) if esforco > 0 else None
            out.append({
                "task_id": task.id,
                "title": task.title,
                "impacto_efetivo": impacto,
                "esforco": esforco,
                "quadrant_code": score.quadrant_code,
                "pillar_code": pillar.code if pillar else None,
                "perspective": pillar.perspective if pillar else None,
                "color": pillar.color if pillar else None,
                "priority_rank": round(priority_rank, 3) if priority_rank is not None else None,
            })
        # Ordem canônica: quadrante primeiro, densidade de valor desc como desempate
        # dentro do quadrante, impacto desc por último. A UI agrupa por quadrante
        # preservando esta ordem. Mesma chave usada pelo Portfólio (PoPortfolioService).
        out.sort(
            key=lambda r: PriorityScoreService.priority_order_key(
                quadrant_order,
                quadrant_code=r["quadrant_code"],
                impacto_efetivo=r["impacto_efetivo"],
                esforco=r["esforco"],
                unscored=False,
            )
        )
        return out


class PoPortfolioService:
    """Portfólio de um PO: projetos/programas (planning_kind) que ele POSSUI (assigned_to),
    com prioridade, rollup de progresso da subárvore, riscos, gargalos e previsibilidade.
    Compõe helpers existentes; carrega em poucas queries (sem N+1). Helpers per-project
    (workload, ausências, dependências, CPM) são chamados por container (project_id) e
    atribuídos a cada raiz pela pertença à subárvore."""

    # Progresso abaixo do % de tempo decorrido por mais que esta folga (pontos) → vermelho.
    PROGRESS_LAG_TOLERANCE = 15

    @staticmethod
    def _subtree(root_id, children) -> list:
        """Ids da subárvore (inclui a raiz), via BFS sobre o mapa children."""
        out: list = []
        seen: set = set()
        stack = [root_id]
        while stack:
            cur = stack.pop()
            if cur in seen:
                continue
            seen.add(cur)
            out.append(cur)
            stack.extend(children.get(cur, []))
        return out

    @staticmethod
    def _rollup_progress(root_id, children, by_id) -> int:
        """Rollup ponderado por estimated_hours das FOLHAS — idêntico ao Gantt
        (folha = 100 se completed_at, senão percent_complete; peso = estimated_hours ou 1)."""
        def calc(tid):
            ch = children.get(tid, [])
            t = by_id[tid]
            if not ch:
                pct = 100 if t.completed_at else (t.percent_complete or 0)
                w = float(t.estimated_hours) if t.estimated_hours and float(t.estimated_hours) > 0 else 1.0
                return pct * w, w
            acc = 0.0
            wsum = 0.0
            for c in ch:
                a, w = calc(c)
                acc += a
                wsum += w
            return acc, wsum
        acc, wsum = calc(root_id)
        return round(acc / wsum) if wsum > 0 else 0

    @staticmethod
    def _is_final_stage(t) -> bool:
        """Card finalizado: concluído OU na etapa final (is_final) do kanban atual."""
        return t.completed_at is not None or (t.status is not None and bool(t.status.is_final))

    @staticmethod
    def _tree_progress(sub) -> int:
        """Progresso ponderado por horas sobre TODA a subárvore (inclui raiz e pais): um card
        só conta 100% quando finalizado (etapa final OU concluído). Assim um card pai/raiz
        parado numa etapa não-final impede o projeto de chegar a 100% (trava em 99 no
        arredondamento enquanto houver algo em aberto). `sub` = tarefas da subárvore (com
        `status` carregado)."""
        done_w = tot_w = 0.0
        any_open = False
        for t in sub:
            w = float(t.estimated_hours) if t.estimated_hours and float(t.estimated_hours) > 0 else 1.0
            final = PoPortfolioService._is_final_stage(t)
            done_w += (100 if final else (t.percent_complete or 0)) / 100.0 * w
            tot_w += w
            if not final:
                any_open = True
        p = round(100 * done_w / tot_w) if tot_w else 0
        return 99 if (any_open and p >= 100) else p

    @staticmethod
    async def build(
        db: AsyncSession,
        po_id: Optional[uuid.UUID],
        diretoria: Optional[str] = None,
        area: Optional[str] = None,
    ) -> dict:
        now = datetime.utcnow()
        empty_agg = {
            "rag": {"verde": 0, "amarelo": 0, "vermelho": 0},
            "total_projetos": 0, "total_programas": 0,
            "on_time_pct": None, "avg_progress_pct": None,
            "capacity_vs_demand": {"allocated_hours": 0.0, "capacity_hours": 0.0, "overallocated_user_days": 0},
        }

        # Opções dos filtros — diretoria/área distintas entre TODOS os projetos/programas do
        # tenant (independente do PO/filtros), para os selects ficarem estáveis.
        opt_res = await db.execute(
            select(ProjectTask.diretoria, ProjectTask.area).where(
                ProjectTask.planning_kind.in_(["projeto", "programa"])
            )
        )
        diretorias_set: set[str] = set()
        areas_set: set[str] = set()
        for d, a in opt_res.all():
            if d:
                diretorias_set.add(d)
            if a:
                areas_set.add(a)
        available_diretorias = sorted(diretorias_set)
        available_areas = sorted(areas_set)

        # Sem po_id → portfólio consolidado de TODOS os POs (roots possuídos por qualquer PO).
        roots_filter = [ProjectTask.planning_kind.in_(["projeto", "programa"])]
        if po_id is not None:
            roots_filter.append(ProjectTask.assigned_to == po_id)
        else:
            po_ids = [p["person_id"] for p in await PoPortfolioService.list_pos(db)]
            if not po_ids:
                return {"po_id": None, "items": [], "aggregates": empty_agg,
                        "available_diretorias": available_diretorias, "available_areas": available_areas}
            roots_filter.append(ProjectTask.assigned_to.in_(po_ids))
        if diretoria:
            roots_filter.append(ProjectTask.diretoria == diretoria)
        if area:
            roots_filter.append(ProjectTask.area == area)

        roots_res = await db.execute(
            select(ProjectTask).where(*roots_filter)
        )
        roots = list(roots_res.scalars().all())
        if not roots:
            return {"po_id": po_id, "items": [], "aggregates": empty_agg,
                    "available_diretorias": available_diretorias, "available_areas": available_areas}

        container_ids = {r.project_id for r in roots}
        tasks_res = await db.execute(
            select(ProjectTask)
            .where(ProjectTask.project_id.in_(container_ids))
            .options(selectinload(ProjectTask.status))
        )
        all_tasks = list(tasks_res.scalars().all())
        by_id = {t.id: t for t in all_tasks}
        children: dict = {}
        for t in all_tasks:
            if t.parent_task_id:
                children.setdefault(t.parent_task_id, []).append(t.id)

        # Nome do kanban (funnel) por id — para detalhar as etapas em aberto.
        funnels_res = await db.execute(
            select(ProjectFunnel.id, ProjectFunnel.name).where(ProjectFunnel.project_id.in_(container_ids))
        )
        funnel_name_by_id = {fid: name for fid, name in funnels_res.all()}

        score_rows = await db.execute(
            select(ProjectPriorityScore, ProjectPriorityPillar)
            .outerjoin(ProjectPriorityPillar, ProjectPriorityPillar.id == ProjectPriorityScore.pillar_id)
            .where(ProjectPriorityScore.task_id.in_(list(by_id.keys())))
        )
        score_by_task = {sc.task_id: (sc, pillar) for sc, pillar in score_rows.all()}

        # Workload + ausências por container (uma vez cada).
        overalloc_dates_by_user: dict = {}
        absences_by_user: dict = {}
        cap = {"allocated_hours": 0.0, "capacity_hours": 0.0, "overallocated_user_days": 0}
        for cid in container_ids:
            for c in await TaskDependencyService.compute_workload(db, cid):
                cap["allocated_hours"] += c.allocated_hours
                cap["capacity_hours"] += c.capacity_hours
                if c.overallocated:
                    cap["overallocated_user_days"] += 1
                    overalloc_dates_by_user.setdefault(c.user_id, set()).add(c.date)
            for uid, items in (await TaskDependencyService.assignee_absences(db, cid)).items():
                absences_by_user.setdefault(uid, []).extend(items)

        dep_rows = await db.execute(
            select(ProjectTaskDependency.predecessor_id, ProjectTaskDependency.successor_id)
            .where(ProjectTaskDependency.project_id.in_(container_ids))
        )
        preds_of: dict = {}
        for p, s in dep_rows.all():
            preds_of.setdefault(s, []).append(p)

        def overlaps_absence(t):
            """Status mais forte de ausência que sobrepõe o período: 'aprovada' | 'pendente' | None."""
            if not t.assigned_to or not t.start_date or not t.due_date:
                return None
            ds, de = t.start_date.date(), t.due_date.date()
            lo, hi = (ds, de) if ds <= de else (de, ds)
            sts = [st for (s, e, _tn, _ph, st) in absences_by_user.get(t.assigned_to, []) if e >= lo and s <= hi]
            if not sts:
                return None
            return "aprovada" if "aprovada" in sts else "pendente"

        items: list = []
        for root in roots:
            subtree_ids = PoPortfolioService._subtree(root.id, children)
            sub = [by_id[i] for i in subtree_ids]
            # Progresso/conclusão consideram toda a árvore (inclui raiz e pais); "finalizado"
            # = etapa final OU concluído. Card pai/raiz parado em etapa não-final não fecha 100%.
            progress_pct = PoPortfolioService._tree_progress(sub)
            subtree_total = len(sub)
            subtree_completed = sum(1 for t in sub if PoPortfolioService._is_final_stage(t))

            sc_pillar = score_by_task.get(root.id)
            if sc_pillar:
                sc, pillar = sc_pillar
                quadrant_code = sc.quadrant_code
                impacto_efetivo = float(sc.impacto_efetivo)
                esforco = float(sc.esforco)
                pillar_code = pillar.code if pillar else None
                perspective = pillar.perspective if pillar else None
                color = pillar.color if pillar else None
                unscored = False
            else:
                quadrant_code = impacto_efetivo = esforco = pillar_code = perspective = color = None
                unscored = True

            overdue = any(
                t.completed_at is None and (t.sla_state == "breached" or (t.due_date is not None and t.due_date < now))
                for t in sub
            )
            breached_count = sum(1 for t in sub if t.completed_at is None and t.sla_state == "breached")
            absence_statuses = [s for s in (overlaps_absence(t) for t in sub) if s]
            absence_approved = "aprovada" in absence_statuses
            absence_pending = (not absence_approved) and "pendente" in absence_statuses
            absence_conflict = bool(absence_statuses)
            no_due_date = root.due_date is None

            cpm = await ProjectTaskService.critical_path(db, root.project_id, root.id)
            critical_ids = {c["task_id"] for c in cpm if c["is_critical"]}
            critical_count = sum(1 for i in subtree_ids if i in critical_ids)

            def is_blocked(t) -> bool:
                if t.completed_at is not None:
                    return False
                return any((by_id.get(p) is not None and by_id[p].completed_at is None) for p in preds_of.get(t.id, []))
            blocked_count = sum(1 for t in sub if is_blocked(t))

            win_lo = root.start_date.date() if root.start_date else None
            win_hi = root.due_date.date() if root.due_date else None
            overallocated_users: list = []
            for uid in {t.assigned_to for t in sub if t.assigned_to}:
                dates = overalloc_dates_by_user.get(uid)
                if not dates:
                    continue
                if win_lo and win_hi:
                    if any(win_lo <= d <= win_hi for d in dates):
                        overallocated_users.append(uid)
                else:
                    overallocated_users.append(uid)

            completed_due = [t for t in sub if t.completed_at is not None and t.due_date is not None]
            on_time_completed = sum(1 for t in completed_due if t.completed_at <= t.due_date)
            completed_count = len(completed_due)
            est_hours = round(sum(float(t.estimated_hours) for t in sub if t.estimated_hours), 2)
            actual_hours = round(sum(float(t.actual_hours) for t in sub if t.actual_hours), 2)
            lead = []
            for t in sub:
                if t.completed_at is not None:
                    base = t.start_date or t.created_at
                    if base:
                        lead.append((t.completed_at - base).total_seconds() / 86400.0)
            avg_lead_time_days = round(sum(lead) / len(lead), 1) if lead else None

            expected_progress_pct = None
            if root.start_date and root.due_date and root.due_date > root.start_date:
                span = (root.due_date - root.start_date).total_seconds()
                elapsed = (now - root.start_date).total_seconds()
                expected_progress_pct = max(0, min(100, round(100 * elapsed / span)))

            # Régua da saúde: vermelho = execução em risco confirmado (atraso, SLA, progresso
            # muito atrás, ausência APROVADA no período); amarelo = atenção (ausência pendente,
            # sobrecarga, bloqueio). "Sem score"/"sem prazo" são lacunas de CONFIG — viram só
            # avisos informativos, NÃO afetam a saúde.
            if overdue or breached_count > 0 or absence_approved or (
                expected_progress_pct is not None and progress_pct < expected_progress_pct - PoPortfolioService.PROGRESS_LAG_TOLERANCE
            ):
                health = "vermelho"
            elif absence_pending or overallocated_users or blocked_count > 0:
                health = "amarelo"
            else:
                health = "verde"

            # Próxima entrega: menor due_date futuro entre tarefas incompletas da subárvore.
            upcoming = [t.due_date for t in sub if t.completed_at is None and t.due_date is not None and t.due_date >= now]
            next_due_date = min(upcoming) if upcoming else None

            # Etapas em aberto: cards da subárvore que ainda NÃO chegaram à etapa final.
            # Deduplica por (kanban, etapa), mantendo a entrada mais antiga (espera maior).
            pending_map: dict = {}
            for t in sub:
                if t.completed_at is not None or t.status is None:
                    continue
                fname = funnel_name_by_id.get(t.status.funnel_id, "—")
                key = (fname, t.status.name)
                entered = t.status_entered_at
                if key not in pending_map or (entered and pending_map[key] and entered < pending_map[key]):
                    pending_map[key] = entered
            pending_stages = sorted(
                (
                    {"funnel_name": fname, "status_name": sname, "status_entered_at": entered}
                    for (fname, sname), entered in pending_map.items()
                ),
                key=lambda r: (r["status_entered_at"] is None, r["status_entered_at"] or now),
            )

            items.append({
                "task_id": root.id, "title": root.title, "project_id": root.project_id,
                "planning_kind": root.planning_kind or "projeto",
                "description": root.description, "demand_type_id": root.demand_type_id,
                "start_date": root.start_date, "due_date": root.due_date, "next_due_date": next_due_date,
                "pending_stages": pending_stages,
                "quadrant_code": quadrant_code, "impacto_efetivo": impacto_efetivo, "esforco": esforco,
                "priority_rank": round(impacto_efetivo / esforco, 3)
                    if (impacto_efetivo is not None and esforco is not None and esforco > 0) else None,
                "pillar_code": pillar_code, "perspective": perspective, "color": color,
                "progress_pct": progress_pct, "expected_progress_pct": expected_progress_pct,
                "subtree_total": subtree_total, "subtree_completed": subtree_completed,
                "overdue": overdue, "breached_count": breached_count, "absence_conflict": absence_conflict,
                "unscored": unscored, "no_due_date": no_due_date,
                "critical_count": critical_count, "blocked_count": blocked_count,
                "overallocated_users": overallocated_users,
                "on_time_completed": on_time_completed, "completed_count": completed_count,
                "est_hours": est_hours, "actual_hours": actual_hours, "avg_lead_time_days": avg_lead_time_days,
                "health": health,
            })

        # Ordem de priorização canônica — idêntica à da Matriz (quadrante primeiro,
        # densidade de valor desc como desempate, impacto desc por último, sem-score ao fim).
        quadrant_order = await PriorityScoreService.quadrant_order_map(db)
        items.sort(
            key=lambda it: PriorityScoreService.priority_order_key(
                quadrant_order,
                quadrant_code=it["quadrant_code"],
                impacto_efetivo=it["impacto_efetivo"],
                esforco=it["esforco"],
                unscored=it["unscored"],
            )
        )

        rag = {"verde": 0, "amarelo": 0, "vermelho": 0}
        for it in items:
            rag[it["health"]] += 1
        on_time_total = sum(it["on_time_completed"] for it in items)
        completed_total = sum(it["completed_count"] for it in items)
        aggregates = {
            "rag": rag,
            "total_projetos": sum(1 for it in items if it["planning_kind"] == "projeto"),
            "total_programas": sum(1 for it in items if it["planning_kind"] == "programa"),
            "on_time_pct": round(100 * on_time_total / completed_total, 1) if completed_total else None,
            "avg_progress_pct": round(sum(it["progress_pct"] for it in items) / len(items), 1) if items else None,
            "capacity_vs_demand": {
                "allocated_hours": round(cap["allocated_hours"], 1),
                "capacity_hours": round(cap["capacity_hours"], 1),
                "overallocated_user_days": cap["overallocated_user_days"],
            },
        }
        return {"po_id": po_id, "items": items, "aggregates": aggregates,
                "available_diretorias": available_diretorias, "available_areas": available_areas}

    @staticmethod
    async def list_pos(db: AsyncSession) -> list[dict]:
        """POs do tenant (Cargo 'po'/'product_owner'), com ou sem login vinculado.
        POs sem user_id aparecem mas não podem possuir projetos."""
        from app.modules.teamops.models import Person, PersonStatus, Position
        rows = await db.execute(
            select(Person)
            .join(Position, Position.id == Person.position_id)
            .where(Position.slug.in_(["po", "product_owner"]), Person.status == PersonStatus.ATIVO)
            .order_by(Person.full_name.asc())
        )
        out = []
        for p in rows.scalars().all():
            out.append({
                "person_id": p.id, "user_id": p.user_id, "full_name": p.full_name,
                "has_login": p.user_id is not None,
            })
        return out

    @classmethod
    async def build_overview(
        cls,
        db: AsyncSession,
        diretoria: Optional[str] = None,
        area: Optional[str] = None,
    ) -> dict:
        """Modo gestão: agregados do portfólio de cada PO (responsável = Pessoa). POs são poucos.
        Opcionalmente recorta por diretoria/área (aplicado a cada portfólio)."""
        pos = await cls.list_pos(db)
        out = []
        available_diretorias: list[str] = []
        available_areas: list[str] = []
        for po in pos:
            res = await cls.build(db, po["person_id"], diretoria=diretoria, area=area)
            # As opções de filtro são tenant-wide (iguais em qualquer build) — basta o 1º.
            if not available_diretorias and not available_areas:
                available_diretorias = res.get("available_diretorias", [])
                available_areas = res.get("available_areas", [])
            agg = res["aggregates"]
            if agg["total_projetos"] + agg["total_programas"] == 0:
                continue
            out.append({
                "po_id": po["person_id"], "full_name": po["full_name"],
                "total_projetos": agg["total_projetos"], "total_programas": agg["total_programas"],
                "rag": agg["rag"], "on_time_pct": agg["on_time_pct"], "avg_progress_pct": agg["avg_progress_pct"],
                "overallocated_user_days": agg["capacity_vs_demand"]["overallocated_user_days"],
            })
        # ordena por mais críticos primeiro
        out.sort(key=lambda x: (-x["rag"]["vermelho"], -x["rag"]["amarelo"]))
        return {"items": out, "available_diretorias": available_diretorias, "available_areas": available_areas}



# ─────────────────────────────────────────────
# Layout do card (quadro) — catálogo configurável de atributos
# ─────────────────────────────────────────────

# Catálogo de atributos exibíveis no card. Ordem = ordem default; is_visible = default.
_CARD_FIELDS_SEED: list[dict] = [
    {"field_key": "demand_type", "label": "Tipo da demanda", "is_visible": True, "order": 0},
    {"field_key": "priority_quadrant", "label": "Classificação da prioridade", "is_visible": True, "order": 1},
    {"field_key": "card_classification", "label": "Tipo (portfólio)", "is_visible": True, "order": 2},
    {"field_key": "schedule_sla", "label": "Situação (SLA/cronograma)", "is_visible": True, "order": 3},
    {"field_key": "code", "label": "Código", "is_visible": False, "order": 4},
    {"field_key": "title", "label": "Título", "is_visible": True, "order": 5},
    {"field_key": "description", "label": "Descrição", "is_visible": False, "order": 6},
    {"field_key": "parent", "label": "Projeto pai", "is_visible": True, "order": 7},
    {"field_key": "children_progress", "label": "Conclusão dos filhos", "is_visible": False, "order": 8},
    {"field_key": "diretoria", "label": "Diretoria", "is_visible": False, "order": 9},
    {"field_key": "area", "label": "Área", "is_visible": False, "order": 10},
    {"field_key": "due_date", "label": "Prazo", "is_visible": True, "order": 11},
    {"field_key": "assignee", "label": "Responsável", "is_visible": True, "order": 12},
]
_CARD_FIELD_KEYS = {row["field_key"] for row in _CARD_FIELDS_SEED}
# Prefixo das chaves de campos personalizados do formulário no layout do card.
_CARD_CUSTOM_PREFIX = "form:"


class ProjectCardFieldService:
    """Config do layout do card no quadro, POR KANBAN (funil). Catálogo fixo de chaves;
    rótulo/visibilidade/ordem editáveis por funil. Seed lazy idempotente."""

    @staticmethod
    async def ensure_seeded(db: AsyncSession, funnel_id: uuid.UUID) -> None:
        res = await db.execute(
            select(ProjectCardField.field_key).where(ProjectCardField.funnel_id == funnel_id)
        )
        existing = {row[0] for row in res.all()}
        added = False
        for row in _CARD_FIELDS_SEED:
            if row["field_key"] not in existing:
                db.add(ProjectCardField(funnel_id=funnel_id, **row))
                added = True
        if added:
            await db.commit()

    @staticmethod
    async def list(db: AsyncSession, funnel_id: uuid.UUID) -> list[ProjectCardField]:
        await ProjectCardFieldService.ensure_seeded(db, funnel_id)
        res = await db.execute(
            select(ProjectCardField)
            .where(ProjectCardField.funnel_id == funnel_id)
            .order_by(ProjectCardField.order.asc(), ProjectCardField.field_key.asc())
        )
        return list(res.scalars().all())

    @staticmethod
    async def replace_all(
        db: AsyncSession, funnel_id: uuid.UUID, data: ProjectCardFieldsUpdate
    ) -> list[ProjectCardField]:
        await ProjectCardFieldService.ensure_seeded(db, funnel_id)
        by_key = {f.field_key: f for f in data.fields}
        res = await db.execute(
            select(ProjectCardField).where(ProjectCardField.funnel_id == funnel_id)
        )
        existing_rows = list(res.scalars().all())
        existing_keys = {row.field_key for row in existing_rows}
        for row in existing_rows:
            patch = by_key.get(row.field_key)
            if patch is None:
                # Chave de sistema sem patch: preserva (nunca remove campos nativos).
                # Campo personalizado (form:*) removido do layout: apaga a linha.
                if row.field_key.startswith(_CARD_CUSTOM_PREFIX):
                    await db.delete(row)
                continue
            row.label = patch.label.strip() or row.label
            row.is_visible = patch.is_visible
            row.order = patch.order
            row.updated_at = datetime.utcnow()
        # Inclui campos personalizados novos (form:<field_key>) ainda não presentes.
        for key, patch in by_key.items():
            if key in existing_keys or key in _CARD_FIELD_KEYS:
                continue
            if not key.startswith(_CARD_CUSTOM_PREFIX):
                continue  # só campos de formulário podem ser adicionados ao catálogo
            db.add(ProjectCardField(
                funnel_id=funnel_id,
                field_key=key,
                label=patch.label.strip() or key,
                is_visible=patch.is_visible,
                order=patch.order,
            ))
        await db.commit()
        return await ProjectCardFieldService.list(db, funnel_id)

    @staticmethod
    async def list_available_custom(db: AsyncSession, funnel_id: uuid.UUID) -> list[dict]:
        """Campos personalizados do formulário que podem ser incluídos no layout do card
        deste funil. Reúne os campos ativos dos tipos de demanda vinculados ao funil
        (funnel_id == funil OU sem funil), dedup por field_key (espaço de chaves do
        `values` da submissão é compartilhado)."""
        res = await db.execute(
            select(
                ProjectDemandFormField.field_key,
                ProjectDemandFormField.label,
                ProjectDemandFormField.field_type,
                ProjectDemandFormField.order,
            )
            .join(ProjectDemandFormSection, ProjectDemandFormSection.id == ProjectDemandFormField.section_id)
            .join(ProjectDemandType, ProjectDemandType.id == ProjectDemandFormSection.demand_type_id)
            .where(
                ProjectDemandFormField.is_active == True,  # noqa: E712
                ProjectDemandFormSection.is_active == True,  # noqa: E712
                ProjectDemandType.is_active == True,  # noqa: E712
                or_(
                    ProjectDemandType.funnel_id == funnel_id,
                    ProjectDemandType.funnel_id.is_(None),
                ),
            )
            .order_by(ProjectDemandFormField.order.asc(), ProjectDemandFormField.label.asc())
        )
        seen: set[str] = set()
        out: list[dict] = []
        for field_key, label, field_type, _order in res.all():
            if field_key in seen:
                continue
            seen.add(field_key)
            out.append({"field_key": field_key, "label": label, "field_type": field_type})
        return out


# ─────────────────────────────────────────────
# Importação de Features + User Stories por planilha (XLSX)
# ─────────────────────────────────────────────

class ProjectImportService:
    """Importa Features + User Stories de uma planilha XLSX (migração em lote).
    Layout agrupado por ordem: cada US pertence à Feature da linha imediatamente acima.
    Inserção direta (sem automações), responsável casado por e-mail, dedupe por título."""

    HEADER_ALIASES = {
        "tipo": "tipo",
        "titulo": "title",
        "descricao": "description",
        "responsavel": "email", "email": "email", "e-mail": "email",
        "inicio": "start", "data inicio": "start", "data de inicio": "start",
        "fim": "due", "termino": "due", "prazo": "due", "data fim": "due", "data de fim": "due",
        "horas": "hours", "estimativa": "hours", "horas estimadas": "hours",
    }

    @staticmethod
    def _norm(s) -> str:
        import unicodedata
        if s is None:
            return ""
        s = str(s).strip().lower()
        return "".join(c for c in unicodedata.normalize("NFD", s) if unicodedata.category(c) != "Mn")

    @classmethod
    def _resolve_demand_types(cls, demand_types):
        feature = us = None
        for dt in demand_types:
            n = cls._norm(dt.name)
            if feature is None and "feature" in n:
                feature = dt
            if us is None and (n == "us" or "user story" in n or "user-story" in n or "historia" in n):
                us = dt
        return feature, us

    @staticmethod
    def _parse_date(val):
        if val is None or val == "":
            return None
        if isinstance(val, datetime):
            return val
        if isinstance(val, date):
            return datetime(val.year, val.month, val.day)
        s = str(val).strip()
        for fmt in ("%d/%m/%Y", "%d/%m/%y", "%Y-%m-%d", "%d-%m-%Y"):
            try:
                return datetime.strptime(s[:10], fmt)
            except ValueError:
                continue
        return None

    @staticmethod
    def _parse_hours(val):
        if val in (None, ""):
            return None
        try:
            return Decimal(str(val).replace(",", "."))
        except Exception:
            return None

    @classmethod
    async def import_xlsx(cls, db: AsyncSession, project_id: uuid.UUID, data: bytes,
                          target_status_id: uuid.UUID, current_user,
                          parent_task_id: Optional[uuid.UUID] = None,
                          us_status_id: Optional[uuid.UUID] = None) -> dict:
        import io
        from openpyxl import load_workbook

        await ProjectService.get(db, project_id)

        async def _load_status(sid: uuid.UUID):
            return (await db.execute(
                select(ProjectStatusConfig).where(
                    ProjectStatusConfig.id == sid,
                    ProjectStatusConfig.project_id == project_id,
                )
            )).scalar_one_or_none()

        # Etapa das Features (target_status_id) e etapa das US (us_status_id).
        # Se a etapa das US não for informada, as US herdam a etapa das Features.
        feature_status = await _load_status(target_status_id)
        if not feature_status:
            raise HTTPException(status_code=400, detail="Etapa de destino das Features inválida para este projeto.")
        if us_status_id is None or us_status_id == target_status_id:
            us_status = feature_status
        else:
            us_status = await _load_status(us_status_id)
            if not us_status:
                raise HTTPException(status_code=400, detail="Etapa de destino das US inválida para este projeto.")

        # Projeto/Programa de destino: as Features são criadas SOB ele (senão, no topo).
        if parent_task_id is not None:
            parent_ok = (await db.execute(
                select(ProjectTask.id).where(ProjectTask.id == parent_task_id, ProjectTask.project_id == project_id)
            )).scalar_one_or_none()
            if not parent_ok:
                raise HTTPException(status_code=400, detail="Projeto/Programa de destino inválido para este projeto.")

        demand_types = await ProjectDemandTypeService.list(db, active_only=True)
        feature_t, us_t = cls._resolve_demand_types(demand_types)
        if not feature_t or not us_t:
            raise HTTPException(status_code=400, detail="Crie os tipos de demanda 'Feature' e 'User Story' antes de importar.")

        try:
            wb = load_workbook(io.BytesIO(data), read_only=True, data_only=True)
        except Exception:
            raise HTTPException(status_code=400, detail="Não foi possível ler a planilha (.xlsx).")
        ws = wb.active
        rows = list(ws.iter_rows(values_only=True))
        if not rows:
            return {"features_created": 0, "us_created": 0, "skipped": 0, "warnings": ["Planilha vazia."]}

        colmap: dict = {}
        for i, h in enumerate(rows[0]):
            key = cls.HEADER_ALIASES.get(cls._norm(h))
            if key and key not in colmap:
                colmap[key] = i
        if "tipo" not in colmap or "title" not in colmap:
            raise HTTPException(status_code=400, detail="A planilha precisa ter ao menos as colunas 'Tipo' e 'Título'.")

        def cell(row, key):
            i = colmap.get(key)
            return row[i] if i is not None and i < len(row) else None

        warnings: list = []
        person_cache: dict = {}

        async def resolve_person(raw):
            if raw is None:
                return None
            e = str(raw).strip().lower()
            if not e:
                return None
            if e in person_cache:
                return person_cache[e]
            p = (await db.execute(select(Person).where(func.lower(Person.email) == e))).scalar_one_or_none()
            person_cache[e] = p.id if p else None
            if not p:
                warnings.append(f"Responsável não encontrado pelo e-mail: {raw}")
            return person_cache[e]

        # Dedupe: títulos já existentes no projeto.
        existing = (await db.execute(
            select(ProjectTask.id, ProjectTask.title, ProjectTask.parent_task_id).where(ProjectTask.project_id == project_id)
        )).all()
        feat_by_title: dict = {}
        child_titles: dict = {}
        for tid, title, pid in existing:
            if pid == parent_task_id:  # Features = filhas diretas do destino (ou top-level se None)
                feat_by_title.setdefault(cls._norm(title), tid)
            if pid is not None:
                child_titles.setdefault(pid, set()).add(cls._norm(title))

        order = (await db.execute(
            select(func.coalesce(func.max(ProjectTask.order), -1)).where(ProjectTask.project_id == project_id)
        )).scalar_one() + 1
        uid = getattr(current_user, "id", None)
        feats = uss = skipped = 0
        current_feature_id = None

        for ridx, row in enumerate(rows[1:], start=2):
            if row is None or all(c is None or str(c).strip() == "" for c in row):
                continue
            title = cell(row, "title")
            if title is None or str(title).strip() == "":
                continue
            title = str(title).strip()
            tipo = cls._norm(cell(row, "tipo"))
            is_feature = "feature" in tipo or "epic" in tipo
            is_us = tipo == "us" or "user story" in tipo or "user-story" in tipo or "historia" in tipo
            desc_raw = cell(row, "description")
            desc = str(desc_raw).strip() if desc_raw not in (None, "") else None
            person_id = await resolve_person(cell(row, "email"))
            start = _to_naive_utc(cls._parse_date(cell(row, "start")))
            due = _to_naive_utc(cls._parse_date(cell(row, "due")))
            hours = cls._parse_hours(cell(row, "hours"))

            if is_feature:
                nt = cls._norm(title)
                if nt in feat_by_title:
                    current_feature_id = feat_by_title[nt]
                    warnings.append(f"Linha {ridx}: Feature '{title}' já existe — pulada (US serão vinculadas a ela).")
                    skipped += 1
                    continue
                task = ProjectTask(
                    project_id=project_id, title=title, description=desc, demand_type_id=feature_t.id,
                    parent_task_id=parent_task_id, status_id=feature_status.id, assigned_to=person_id,
                    start_date=start, due_date=due, estimated_hours=hours, order=order, created_by=uid,
                    sla_state=ProjectTaskService._sla_initial(feature_status),
                )
                db.add(task)
                await db.flush()
                current_feature_id = task.id
                feat_by_title[nt] = task.id
                child_titles[task.id] = set()
                order += 1
                feats += 1
            elif is_us:
                if current_feature_id is None:
                    warnings.append(f"Linha {ridx}: US '{title}' sem Feature acima — pulada.")
                    skipped += 1
                    continue
                nt = cls._norm(title)
                if nt in child_titles.get(current_feature_id, set()):
                    warnings.append(f"Linha {ridx}: US '{title}' já existe nesta Feature — pulada.")
                    skipped += 1
                    continue
                task = ProjectTask(
                    project_id=project_id, title=title, description=desc, demand_type_id=us_t.id,
                    parent_task_id=current_feature_id, status_id=us_status.id, assigned_to=person_id,
                    start_date=start, due_date=due, estimated_hours=hours, order=order, created_by=uid,
                    sla_state=ProjectTaskService._sla_initial(us_status),
                )
                db.add(task)
                await db.flush()
                child_titles.setdefault(current_feature_id, set()).add(nt)
                order += 1
                uss += 1
            else:
                warnings.append(f"Linha {ridx}: Tipo '{cell(row, 'tipo')}' não reconhecido (use Feature ou US) — pulada.")
                skipped += 1

        await db.commit()
        return {"features_created": feats, "us_created": uss, "skipped": skipped, "warnings": warnings}

    @staticmethod
    def build_template() -> bytes:
        import io
        from openpyxl import Workbook
        wb = Workbook()
        ws = wb.active
        ws.title = "Importacao"
        ws.append(["Tipo", "Título", "Descrição", "Responsável", "Início", "Fim", "Horas"])
        ws.append(["Feature", "Experiência de Chat com IA", "Feature de exemplo", "ana@empresa.com", "09/03/2026", "17/04/2026", None])
        ws.append(["US", "Conversar com a IA - [Frontend]", "", "bruno@empresa.com", "31/03/2026", "10/04/2026", 16])
        ws.append(["US", "Histórico de Conversas - [Frontend]", "", "bruno@empresa.com", "06/04/2026", "17/04/2026", 24])
        ws.append(["Feature", "Biblioteca de Prompts Corporativos", "", "ana@empresa.com", "31/03/2026", "17/04/2026", None])
        ws.append(["US", "Visualizar Prompts - [Frontend]", "", "carla@empresa.com", "06/04/2026", "17/04/2026", 8])
        widths = [12, 42, 30, 26, 14, 14, 8]
        for i, w in enumerate(widths, start=1):
            ws.column_dimensions[ws.cell(row=1, column=i).column_letter].width = w
        buf = io.BytesIO()
        wb.save(buf)
        return buf.getvalue()


class StatusReportService:
    """Status Report por recorte (diretoria/área): monta o estado atual dos projetos no
    layout executivo e persiste snapshots imutáveis para a série histórica. Compõe os
    helpers de portfólio (subárvore + rollup de progresso) sem restringir aos POs — pega
    todos os projetos/programas do recorte."""

    PROGRESS_LAG_TOLERANCE = PoPortfolioService.PROGRESS_LAG_TOLERANCE

    @staticmethod
    def _iso(value: Optional[datetime]) -> Optional[str]:
        return value.isoformat() if value is not None else None

    @staticmethod
    async def _label_maps(db: AsyncSession) -> dict[str, dict[str, str]]:
        """Mapa value→label dos campos 'diretoria' e 'area' (options.items do formulário)."""
        res = await db.execute(
            select(ProjectDefaultFormField).where(
                ProjectDefaultFormField.field_key.in_(["diretoria", "area"])
            )
        )
        out: dict[str, dict[str, str]] = {"diretoria": {}, "area": {}}
        for cfg in res.scalars().all():
            opts = cfg.options or {}
            items = opts.get("items") if isinstance(opts, dict) else []
            if isinstance(items, list):
                for i in items:
                    if isinstance(i, dict) and i.get("value"):
                        out.setdefault(cfg.field_key, {})[str(i["value"])] = str(i.get("label") or i["value"])
        return out

    _LEGACY_FIELD_TYPES = {"textarea": "text_long", "boolean": "checkbox"}

    @classmethod
    def _norm_field_type(cls, t: Optional[str]) -> str:
        raw = (t or "text").strip().lower()
        return cls._LEGACY_FIELD_TYPES.get(raw, raw)

    @classmethod
    def _resolve_field_value(cls, field, raw, person_name: dict) -> Optional[str]:
        """Valor de exibição de um campo da solicitação (espelha o displayValue do front):
        select/user/multi_select/data/booleano resolvidos; vazio → None (campo omitido)."""
        if raw is None or raw == "" or raw == [] or raw == {}:
            return None
        ftype = cls._norm_field_type(field.field_type)

        def _options_label(v) -> str:
            opts = field.options or {}
            items = opts.get("items") if isinstance(opts, dict) else None
            if isinstance(items, list):
                for it in items:
                    if isinstance(it, dict) and str(it.get("value")) == str(v):
                        return str(it.get("label") or v)
            return str(v)

        if ftype in ("select", "radio"):
            return _options_label(raw)
        if ftype == "multi_select":
            if isinstance(raw, list):
                parts = [_options_label(v) for v in raw if v not in (None, "")]
                return ", ".join(parts) or None
            return _options_label(raw)
        if ftype in ("user", "current_user"):
            try:
                return person_name.get(uuid.UUID(str(raw)), str(raw))
            except (ValueError, AttributeError, TypeError):
                return str(raw)
        if ftype in ("checkbox",):
            return "Sim" if raw in (True, "true", "1", 1) else "Não"
        if ftype in ("date", "current_date"):
            s = str(raw)[:10]
            parts = s.split("-")
            return f"{parts[2]}/{parts[1]}/{parts[0]}" if len(parts) == 3 else s
        if ftype in ("datetime", "current_datetime"):
            return str(raw).replace("T", " ")
        if isinstance(raw, dict):
            named = raw.get("filename") or raw.get("name") or raw.get("label")
            return str(named) if named else None
        if isinstance(raw, list):
            def _item_label(v):
                if isinstance(v, dict):
                    return v.get("filename") or v.get("name") or v.get("label")
                return v
            parts = [str(lbl) for v in raw if (lbl := _item_label(v)) not in (None, "")]
            return ", ".join(parts) or None
        return str(raw)

    @staticmethod
    async def build_preview(
        db: AsyncSession,
        diretoria: Optional[str] = None,
        area: Optional[str] = None,
    ) -> dict:
        now = datetime.utcnow()
        labels = await StatusReportService._label_maps(db)
        diretoria_label = labels["diretoria"].get(diretoria, diretoria) if diretoria else None
        area_label = labels["area"].get(area, area) if area else None

        meta = {
            "diretoria": diretoria,
            "area": area,
            "diretoria_label": diretoria_label,
            "area_label": area_label,
            "generated_at": StatusReportService._iso(now),
        }
        empty = {
            "meta": meta,
            "kpis": {"total": 0, "concluido": 0, "planejado": 0, "sem_data": 0, "avg_progress_pct": None},
            "projects": [],
            "plano": {"d30": "", "d60": "", "d90": ""},
        }

        roots_filter = [ProjectTask.planning_kind.in_(["projeto", "programa"])]
        if diretoria:
            roots_filter.append(ProjectTask.diretoria == diretoria)
        if area:
            roots_filter.append(ProjectTask.area == area)
        roots_res = await db.execute(
            select(ProjectTask).options(selectinload(ProjectTask.status)).where(*roots_filter)
        )
        roots = list(roots_res.scalars().all())
        if not roots:
            return empty

        container_ids = {r.project_id for r in roots}
        tasks_res = await db.execute(
            select(ProjectTask)
            .where(ProjectTask.project_id.in_(container_ids))
            .options(selectinload(ProjectTask.status))
        )
        all_tasks = list(tasks_res.scalars().all())
        by_id = {t.id: t for t in all_tasks}
        children: dict = {}
        for t in all_tasks:
            if t.parent_task_id:
                children.setdefault(t.parent_task_id, []).append(t.id)

        # Nome do kanban (funnel) por id — para evidenciar onde estão os cards em aberto.
        frows = await db.execute(
            select(ProjectFunnel.id, ProjectFunnel.name).where(ProjectFunnel.project_id.in_(container_ids))
        )
        funnel_name_by_id = {fid: name for fid, name in frows.all()}

        def _is_final_stage(t) -> bool:
            """Card finalizado: concluído OU na etapa final do kanban atual."""
            return t.completed_at is not None or (t.status is not None and bool(t.status.is_final))

        # ── Campos personalizados da solicitação ("item pai") ──
        # As definições do formulário (seções/campos) vêm do tipo de demanda da ORIGEM
        # (origin_task_id) — onde a solicitação foi preenchida. O card raiz (projeto/programa)
        # herda só os valores e usa um tipo sem formulário. Fallback: tipo do próprio root.
        origin_ids = {r.origin_task_id for r in roots if r.origin_task_id}
        origin_type_by_id: dict = {}
        if origin_ids:
            ot = await db.execute(
                select(ProjectTask.id, ProjectTask.demand_type_id).where(ProjectTask.id.in_(origin_ids))
            )
            origin_type_by_id = {tid: dt for tid, dt in ot.all()}

        def _solicitation_source(r):
            """(demand_type_id, task_id) de onde vêm o formulário e os valores da solicitação."""
            otype = origin_type_by_id.get(r.origin_task_id) if r.origin_task_id else None
            if otype:
                return otype, r.origin_task_id
            return r.demand_type_id, r.id

        form_type_ids: set = set()
        value_task_ids: set = set()
        for r in roots:
            dt, tid = _solicitation_source(r)
            if dt:
                form_type_ids.add(dt)
            if tid:
                value_task_ids.add(tid)

        # Seções + campos ativos dos tipos de formulário (eager-load de fields).
        sections_by_type: dict = {}
        if form_type_ids:
            sec_res = await db.execute(
                select(ProjectDemandFormSection)
                .where(
                    ProjectDemandFormSection.demand_type_id.in_(form_type_ids),
                    ProjectDemandFormSection.is_active == True,  # noqa: E712
                )
                .options(selectinload(ProjectDemandFormSection.fields))
                .order_by(ProjectDemandFormSection.order.asc(), ProjectDemandFormSection.created_at.asc())
            )
            for sec in sec_res.scalars().all():
                sections_by_type.setdefault(sec.demand_type_id, []).append(sec)

        # Respostas do formulário (a "solicitação") por task de origem.
        values_by_task: dict = {}
        if value_task_ids:
            sub_res = await db.execute(
                select(ProjectDemandFormSubmission.task_id, ProjectDemandFormSubmission.values)
                .where(ProjectDemandFormSubmission.task_id.in_(value_task_ids))
            )
            values_by_task = {tid: (vals or {}) for tid, vals in sub_res.all()}

        # Nomes dos responsáveis (assigned_to = person_id) + pessoas referenciadas em campos
        # do tipo 'user' na solicitação.
        person_ids = {t.assigned_to for t in all_tasks if t.assigned_to}
        user_keys_by_type = {
            dt: [f.field_key for s in secs for f in s.fields
                 if StatusReportService._norm_field_type(f.field_type) in ("user", "current_user")]
            for dt, secs in sections_by_type.items()
        }
        for r in roots:
            dt, tid = _solicitation_source(r)
            vals = values_by_task.get(tid, {})
            for k in user_keys_by_type.get(dt, []):
                raw = vals.get(k)
                if not raw:
                    continue
                for v in (raw if isinstance(raw, list) else [raw]):
                    try:
                        person_ids.add(uuid.UUID(str(v)))
                    except (ValueError, AttributeError, TypeError):
                        pass
        person_name: dict = {}
        if person_ids:
            prows = await db.execute(
                select(Person.id, Person.full_name).where(Person.id.in_(person_ids))
            )
            person_name = {pid: name for pid, name in prows.all()}

        # Dependências → detecção de bloqueio (predecessora incompleta).
        dep_rows = await db.execute(
            select(ProjectTaskDependency.predecessor_id, ProjectTaskDependency.successor_id)
            .where(ProjectTaskDependency.project_id.in_(container_ids))
        )
        preds_of: dict = {}
        for p, s in dep_rows.all():
            preds_of.setdefault(s, []).append(p)

        def is_blocked(t) -> bool:
            if t.completed_at is not None:
                return False
            return any(
                (by_id.get(p) is not None and by_id[p].completed_at is None)
                for p in preds_of.get(t.id, [])
            )

        projects: list = []
        for root in roots:
            sub_ids = PoPortfolioService._subtree(root.id, children)
            sub = [by_id[i] for i in sub_ids]
            subtree_total = len(sub)
            subtree_completed = sum(1 for t in sub if _is_final_stage(t))

            # Progresso considerando TODA a árvore (inclui o card raiz e os pais), ponderado por
            # horas: um card só conta 100% quando finalizado (etapa final OU concluído). Assim um
            # card pai/raiz parado numa etapa não-final impede o projeto de chegar a 100%.
            done_w = tot_w = 0.0
            open_stages: list = []
            for t in sub:
                w = float(t.estimated_hours) if t.estimated_hours and float(t.estimated_hours) > 0 else 1.0
                final = _is_final_stage(t)
                pct = 100 if final else (t.percent_complete or 0)
                done_w += (pct / 100.0) * w
                tot_w += w
                if not final:
                    open_stages.append({
                        "title": t.title,
                        "kanban": funnel_name_by_id.get(t.status.funnel_id) if t.status else None,
                        "stage": t.status.name if t.status else None,
                        "is_root": t.id == root.id,
                    })
            progress_pct = round(100 * done_w / tot_w) if tot_w else 0
            # Garante que nunca exibe 100% enquanto houver card em aberto (arredondamento).
            if open_stages and progress_pct >= 100:
                progress_pct = 99

            overdue_tasks = [
                t for t in sub
                if t.completed_at is None and (
                    t.sla_state == "breached" or (t.due_date is not None and t.due_date < now)
                )
            ]
            breached_count = sum(1 for t in sub if t.completed_at is None and t.sla_state == "breached")
            blocked = [t for t in sub if is_blocked(t)]
            no_due_date = root.due_date is None

            expected_progress_pct = None
            if root.start_date and root.due_date and root.due_date > root.start_date:
                span = (root.due_date - root.start_date).total_seconds()
                elapsed = (now - root.start_date).total_seconds()
                expected_progress_pct = max(0, min(100, round(100 * elapsed / span)))

            if overdue_tasks or breached_count > 0 or (
                expected_progress_pct is not None
                and progress_pct < expected_progress_pct - StatusReportService.PROGRESS_LAG_TOLERANCE
            ):
                health = "vermelho"
            elif blocked:
                health = "amarelo"
            else:
                health = "verde"

            # Próximo marco: menor due_date futuro entre incompletas da subárvore.
            upcoming = [t.due_date for t in sub if t.completed_at is None and t.due_date is not None and t.due_date >= now]
            next_due_date = min(upcoming) if upcoming else None

            # Entregas realizadas: tarefas concluídas da subárvore (exclui a própria raiz).
            entregas = sorted(
                (t for t in sub if t.id != root.id and t.completed_at is not None),
                key=lambda t: t.completed_at,
                reverse=True,
            )
            entregas_realizadas = [
                {
                    "title": t.title,
                    "responsavel": person_name.get(t.assigned_to),
                    "completed_at": StatusReportService._iso(t.completed_at),
                }
                for t in entregas
            ]

            # Próximas atividades: incompletas com prazo, ordenadas por prazo asc.
            proximas = sorted(
                (t for t in sub if t.id != root.id and t.completed_at is None and t.due_date is not None),
                key=lambda t: t.due_date,
            )
            proximas_atividades = [
                {
                    "title": t.title,
                    "responsavel": person_name.get(t.assigned_to),
                    "previsao": StatusReportService._iso(t.due_date),
                    "status": t.status.name if t.status else None,
                }
                for t in proximas
            ]

            # Cronograma hierárquico (cascata pai→filho): DFS preorder a partir da raiz, com
            # `level` de profundidade para indentar (Feature → US → US.x). Irmãos ordenados por
            # data planejada (início/prazo), depois ordem do quadro e título.
            def _sib_key(t):
                d = t.start_date or t.due_date
                return (d is None, d or datetime.max, t.order or 0, t.title or "")
            cronograma: list = []

            def _walk(parent_id, level):
                kids = sorted(
                    (by_id[k] for k in children.get(parent_id, []) if k in by_id),
                    key=_sib_key,
                )
                for t in kids:
                    final = _is_final_stage(t)
                    cronograma.append({
                        "title": t.title,
                        "level": level,
                        "status": t.status.name if t.status else None,
                        "kanban": funnel_name_by_id.get(t.status.funnel_id) if t.status else None,
                        "open": not final,
                        "percent": 100 if final else (t.percent_complete or 0),
                        "planned_date": StatusReportService._iso(t.due_date or t.start_date),
                        "completed_at": StatusReportService._iso(t.completed_at),
                        "responsavel": person_name.get(t.assigned_to),
                    })
                    _walk(t.id, level + 1)

            _walk(root.id, 0)

            # Riscos auto-derivados (ponto + impacto sugeridos; ação fica para a narrativa).
            riscos: list = []
            if overdue_tasks:
                riscos.append({"ponto": f"{len(overdue_tasks)} atividade(s) atrasada(s)", "impacto": "Alto", "acao": ""})
            if breached_count:
                riscos.append({"ponto": f"{breached_count} SLA estourado(s)", "impacto": "Alto", "acao": ""})
            if blocked:
                riscos.append({"ponto": f"{len(blocked)} atividade(s) bloqueada(s) por dependência", "impacto": "Médio", "acao": ""})
            if no_due_date:
                riscos.append({"ponto": "Projeto sem prazo definido", "impacto": "Médio", "acao": ""})

            # Campos personalizados da solicitação (apenas preenchidos), agrupados por seção,
            # com rótulos/valores já resolvidos. Formulário + valores vêm da origem.
            src_type, src_task = _solicitation_source(root)
            root_values = values_by_task.get(src_task, {})
            custom_sections: list = []
            for sec in sections_by_type.get(src_type, []):
                rows = []
                for f in sec.fields:
                    if not f.is_active:
                        continue
                    val = StatusReportService._resolve_field_value(f, root_values.get(f.field_key), person_name)
                    if val:
                        rows.append({
                            "label": f.label,
                            "field_type": StatusReportService._norm_field_type(f.field_type),
                            "value": val,
                        })
                if rows:
                    custom_sections.append({"title": sec.title, "fields": rows})

            projects.append({
                "task_id": str(root.id),
                "project_id": str(root.project_id),
                "title": root.title,
                "description": root.description,
                "planning_kind": root.planning_kind or "projeto",
                "fase": root.status.name if root.status else None,
                "health": health,
                "progress_pct": progress_pct,
                "expected_progress_pct": expected_progress_pct,
                "start_date": StatusReportService._iso(root.start_date),
                "due_date": StatusReportService._iso(root.due_date),
                "next_due_date": StatusReportService._iso(next_due_date),
                "responsavel": person_name.get(root.assigned_to),
                "subtree_total": subtree_total,
                "subtree_completed": subtree_completed,
                "no_due_date": no_due_date,
                "entregas_realizadas": entregas_realizadas,
                "proximas_atividades": proximas_atividades,
                "cronograma": cronograma,
                "open_stages": open_stages,
                "riscos": riscos,
                "custom_sections": custom_sections,
                # Narrativa editável (preenchida no editor).
                "objetivo": "",
                "resumo_executivo": "",
                "decisoes": [],
            })

        def _is_done(p) -> bool:
            return p["progress_pct"] >= 100 or (p["subtree_total"] > 0 and p["subtree_completed"] == p["subtree_total"])

        total = len(projects)
        concluido = sum(1 for p in projects if _is_done(p))
        planejado = sum(1 for p in projects if p["progress_pct"] == 0)
        sem_data = sum(1 for p in projects if p["no_due_date"])
        avg_progress = round(sum(p["progress_pct"] for p in projects) / total) if total else None

        return {
            "meta": meta,
            "kpis": {
                "total": total,
                "concluido": concluido,
                "planejado": planejado,
                "sem_data": sem_data,
                "avg_progress_pct": avg_progress,
            },
            "projects": projects,
            "plano": {"d30": "", "d60": "", "d90": ""},
        }

    @staticmethod
    async def create(db: AsyncSession, data, user_id: Optional[uuid.UUID]) -> ProjectStatusReport:
        report = ProjectStatusReport(
            diretoria=data.diretoria,
            area=data.area,
            diretoria_label=data.diretoria_label,
            area_label=data.area_label,
            title=data.title or "Status Report",
            snapshot=data.snapshot or {},
            kpis=data.kpis or {},
            generated_by=user_id,
        )
        db.add(report)
        await db.commit()
        await db.refresh(report)
        return report

    @staticmethod
    async def list(
        db: AsyncSession,
        diretoria: Optional[str] = None,
        area: Optional[str] = None,
    ) -> list[ProjectStatusReport]:
        """Série histórica (mais recente primeiro), filtrável por recorte."""
        stmt = select(ProjectStatusReport)
        if diretoria:
            stmt = stmt.where(ProjectStatusReport.diretoria == diretoria)
        if area:
            stmt = stmt.where(ProjectStatusReport.area == area)
        stmt = stmt.order_by(ProjectStatusReport.generated_at.desc())
        res = await db.execute(stmt)
        return list(res.scalars().all())

    @staticmethod
    async def get(db: AsyncSession, report_id: uuid.UUID) -> ProjectStatusReport:
        res = await db.execute(
            select(ProjectStatusReport).where(ProjectStatusReport.id == report_id)
        )
        report = res.scalar_one_or_none()
        if not report:
            raise HTTPException(status_code=404, detail="Status Report não encontrado.")
        return report


class PoSyncService:
    """Análise de portfólio no formato da cerimônia **PO Sync**: lidera por PO e aplica as
    regras da metodologia que os serviços existentes NÃO cobrem:
      - Fase derivada da situação REAL dos itens (Planejamento só vira Execução quando algum
        item entrou em desenvolvimento/homologação/conclusão).
      - % de execução descontando do denominador os itens "Não realizado" (Cancelado/Rejeitado).
      - Projetos em Planejamento exibem execução "—" (não 0%).
      - Saúde de prazo (Data Fim Real vs Planejada) com média, mediana e outliers — no nível
        projeto E no nível item, sinalizando quando o baseline não permite comparação.
      - Lacunas de baseline (sem datas comparáveis, datas inconsistentes, sem diretoria).
    Reusa os helpers de subárvore/conclusão do PoPortfolioService e a resolução de rótulos
    de diretoria/área do StatusReportService. Read-only (não persiste)."""

    # Estágios que sinalizam execução iniciada (dev → homologação → produção). A conclusão é
    # detectada por is_final/completed_at; "Não realizado" é detectado à parte.
    _EXEC_PAT = re.compile(
        r"desenvolv|devops|devsecops|homolog|executar|code\s*review|"
        r"produ[çc]|\bprod\b|\bhml\b|pronto\s+para",
        re.IGNORECASE,
    )
    # Estágios de despriorização consciente — itens aqui NÃO entram no denominador de execução.
    _NAO_REALIZADO_PAT = re.compile(
        r"cancel|rejeit|n[ãa]o\s*realiz|descontinu|desprioriz", re.IGNORECASE
    )

    @staticmethod
    def _median(values: list[float]) -> Optional[float]:
        if not values:
            return None
        s = sorted(values)
        n = len(s)
        mid = n // 2
        return s[mid] if n % 2 else (s[mid - 1] + s[mid]) / 2.0

    @classmethod
    def _classify_stages(cls, status_configs: list) -> dict:
        """status_id → bucket em {'planejamento','execucao','encerramento','nao_realizado'}.
        Derivado da ordem do funil: dentro de cada funil, o 1º estágio que casa com o padrão de
        execução marca a fronteira; antes dele (e não-final) é Planejamento, dele em diante é
        Execução. is_final → Encerramento. Cancelado/Rejeitado → Não realizado."""
        by_funnel: dict = {}
        for sc in status_configs:
            by_funnel.setdefault(sc.funnel_id, []).append(sc)
        out: dict = {}
        for _fid, stages in by_funnel.items():
            stages.sort(key=lambda s: (s.order if s.order is not None else 0))
            exec_start = None
            for s in stages:
                if s.is_final or cls._NAO_REALIZADO_PAT.search(s.name or ""):
                    continue
                if cls._EXEC_PAT.search(s.name or ""):
                    exec_start = s.order if s.order is not None else 0
                    break
            for s in stages:
                name = s.name or ""
                order = s.order if s.order is not None else 0
                if cls._NAO_REALIZADO_PAT.search(name):
                    bucket = "nao_realizado"
                elif s.is_final:
                    bucket = "encerramento"
                elif exec_start is not None and order >= exec_start:
                    bucket = "execucao"
                elif cls._EXEC_PAT.search(name):
                    bucket = "execucao"
                else:
                    bucket = "planejamento"
                out[s.id] = bucket
        return out

    @classmethod
    def _exec_progress(cls, sub: list, excl_ids: set) -> int:
        """Progresso ponderado por horas sobre a subárvore, EXCLUINDO itens 'Não realizado'.
        Card finalizado (etapa final/concluído) = 100%; trava em 99 enquanto houver aberto."""
        done_w = tot_w = 0.0
        any_open = False
        for t in sub:
            if t.id in excl_ids:
                continue
            w = float(t.estimated_hours) if t.estimated_hours and float(t.estimated_hours) > 0 else 1.0
            final = PoPortfolioService._is_final_stage(t)
            done_w += (100 if final else (t.percent_complete or 0)) / 100.0 * w
            tot_w += w
            if not final:
                any_open = True
        p = round(100 * done_w / tot_w) if tot_w else 0
        return 99 if (any_open and p >= 100) else p

    @classmethod
    async def build(
        cls,
        db: AsyncSession,
        diretoria: Optional[str] = None,
        area: Optional[str] = None,
    ) -> dict:
        now = datetime.utcnow()
        iso = StatusReportService._iso
        labels = await StatusReportService._label_maps(db)
        dir_labels = labels.get("diretoria", {})
        diretoria_label = dir_labels.get(diretoria, diretoria) if diretoria else None
        area_label = labels.get("area", {}).get(area, area) if area else None

        def dlabel(code: Optional[str]) -> Optional[str]:
            return dir_labels.get(code, code) if code else None

        meta = {
            "generated_at": iso(now),
            "diretoria": diretoria, "area": area,
            "diretoria_label": diretoria_label, "area_label": area_label,
        }

        # Opções de filtro tenant-wide (estáveis nos selects).
        opt_res = await db.execute(
            select(ProjectTask.diretoria, ProjectTask.area).where(
                ProjectTask.planning_kind.in_(["projeto", "programa"])
            )
        )
        dset: set[str] = set()
        aset: set[str] = set()
        for d, a in opt_res.all():
            if d:
                dset.add(d)
            if a:
                aset.add(a)
        available_diretorias = [{"value": v, "label": dlabel(v) or v} for v in sorted(dset)]
        available_areas = [
            {"value": v, "label": labels.get("area", {}).get(v, v)} for v in sorted(aset)
        ]

        empty = {
            "meta": meta,
            "capa": {"total_projetos": 0, "total_programas": 0, "total_pos": 0,
                     "total_itens": 0, "total_concluidos": 0},
            "panorama": {"fases": {"planejamento": 0, "execucao": 0, "encerramento": 0},
                         "backlog_sem_execucao": 0, "avg_exec_pct": None},
            "prazo": {"projetos": None, "itens": None, "sem_datas_comparaveis": 0},
            "ranking_pos": [], "por_po": [], "por_diretoria": [],
            "maiores_atrasos": [], "baseline_gaps": None, "proximos_passos": [],
            "saude_produtos": {"por_po": [], "resumo": {
                "total_produtos": 0, "media_score": 0.0,
                "producao": {"total": 0, "score_medio": None},
                "desenvolvimento": {"total": 0, "score_medio": None},
                "outros": {"total": 0, "score_medio": None},
                "distribuicao": {"saudavel": 0, "atencao": 0, "critico": 0}}},
            "available_diretorias": available_diretorias, "available_areas": available_areas,
        }

        pos = await PoPortfolioService.list_pos(db)
        po_name = {p["person_id"]: p["full_name"] for p in pos}
        po_ids = list(po_name.keys())
        if not po_ids:
            return empty

        roots_filter = [
            ProjectTask.planning_kind.in_(["projeto", "programa"]),
            ProjectTask.assigned_to.in_(po_ids),
        ]
        if diretoria:
            roots_filter.append(ProjectTask.diretoria == diretoria)
        if area:
            roots_filter.append(ProjectTask.area == area)
        roots_res = await db.execute(
            select(ProjectTask).options(selectinload(ProjectTask.status)).where(*roots_filter)
        )
        roots = list(roots_res.scalars().all())
        if not roots:
            return empty

        container_ids = {r.project_id for r in roots}
        tasks_res = await db.execute(
            select(ProjectTask)
            .where(ProjectTask.project_id.in_(container_ids))
            .options(selectinload(ProjectTask.status))
        )
        all_tasks = list(tasks_res.scalars().all())
        by_id = {t.id: t for t in all_tasks}
        children: dict = {}
        for t in all_tasks:
            if t.parent_task_id:
                children.setdefault(t.parent_task_id, []).append(t.id)

        # Classificação de estágios (fase macro por status).
        sc_res = await db.execute(
            select(ProjectStatusConfig).where(ProjectStatusConfig.project_id.in_(container_ids))
        )
        stage_bucket = cls._classify_stages(list(sc_res.scalars().all()))

        # Diretoria de origem (solicitação) para herança quando a raiz não tem diretoria.
        origin_ids = {r.origin_task_id for r in roots if r.origin_task_id}
        origin_dir: dict = {}
        if origin_ids:
            ores = await db.execute(
                select(ProjectTask.id, ProjectTask.diretoria).where(ProjectTask.id.in_(origin_ids))
            )
            origin_dir = {tid: d for tid, d in ores.all()}

        def task_bucket(t) -> str:
            if t.completed_at is not None:
                return "encerramento"
            if t.status is not None and bool(t.status.is_final):
                return "encerramento"
            return stage_bucket.get(t.status_id, "planejamento")

        def resolve_diretoria(root, sub) -> Optional[str]:
            if root.diretoria:
                return root.diretoria
            if root.origin_task_id and origin_dir.get(root.origin_task_id):
                return origin_dir[root.origin_task_id]
            counts: dict = {}
            for t in sub:
                if t.diretoria:
                    counts[t.diretoria] = counts.get(t.diretoria, 0) + 1
            if counts:
                return max(counts.items(), key=lambda kv: kv[1])[0]
            return None

        items: list = []
        item_delays: list = []          # atrasos no nível item (dias) para saúde de prazo
        item_outliers: list = []        # candidatos a maiores atrasos (item)
        for root in roots:
            sub_ids = PoPortfolioService._subtree(root.id, children)
            sub = [by_id[i] for i in sub_ids]
            excl_ids = {t.id for t in sub if task_bucket(t) == "nao_realizado"}
            eff = [t for t in sub if t.id not in excl_ids]      # itens "vivos"

            # Fase do projeto pela situação REAL.
            root_final = root.completed_at is not None or (root.status is not None and bool(root.status.is_final))
            started = any(
                (task_bucket(t) in ("execucao", "encerramento")) or t.completed_at is not None
                or (t.percent_complete or 0) > 0
                for t in eff
            )
            if root_final:
                fase = "encerramento"
            elif started:
                fase = "execucao"
            else:
                fase = "planejamento"

            non_root_eff = [t for t in eff if t.id != root.id]
            backlog_montado = fase == "planejamento" and len(non_root_eff) > 0

            exec_pct = None if fase == "planejamento" else cls._exec_progress(sub, excl_ids)
            subtree_total = len(eff)
            subtree_completed = sum(1 for t in eff if PoPortfolioService._is_final_stage(t))

            overdue = any(
                t.completed_at is None and (t.sla_state == "breached" or (t.due_date is not None and t.due_date < now))
                for t in eff
            )

            # Saúde de prazo — nível PROJETO (raiz com prazo planejado e fim real).
            comparable = root.due_date is not None and root.completed_at is not None
            atraso_dias = None
            prazo_status = "sem_baseline"
            if comparable:
                atraso_dias = (root.completed_at - root.due_date).days
                prazo_status = "atrasado" if atraso_dias > 0 else "no_prazo"

            # Saúde de prazo — nível ITEM (entregas concluídas com prazo, exceto a raiz).
            for t in non_root_eff:
                if t.due_date is not None and t.completed_at is not None:
                    d = (t.completed_at - t.due_date).days
                    item_delays.append(d)
                    if d > 0:
                        item_outliers.append({
                            "title": t.title, "po": po_name.get(root.assigned_to),
                            "projeto": root.title, "nivel": "item",
                            "planejada": iso(t.due_date), "real": iso(t.completed_at),
                            "atraso_dias": d,
                        })

            # Lacunas de baseline.
            sem_datas_planejadas = root.start_date is None and root.due_date is None
            baseline_inconsistente = False
            if root.start_date and root.due_date and root.due_date < root.start_date:
                baseline_inconsistente = True
            if root.start_date and root.created_at and root.start_date.year < root.created_at.year:
                baseline_inconsistente = True

            dir_code = resolve_diretoria(root, sub)

            items.append({
                "task_id": str(root.id), "title": root.title,
                "planning_kind": root.planning_kind or "projeto",
                "po_id": str(root.assigned_to) if root.assigned_to else None,
                "po": po_name.get(root.assigned_to),
                "fase": fase,
                "stage_name": root.status.name if root.status else None,
                "exec_pct": exec_pct,
                "health": "vermelho" if (overdue or prazo_status == "atrasado") else "verde",
                "overdue": overdue,
                "diretoria": dir_code, "diretoria_label": dlabel(dir_code),
                "start_date": iso(root.start_date), "due_date": iso(root.due_date),
                "completed_at": iso(root.completed_at),
                "comparable": comparable, "prazo_status": prazo_status, "atraso_dias": atraso_dias,
                "subtree_total": subtree_total, "subtree_completed": subtree_completed,
                "backlog_montado": backlog_montado,
                "sem_datas_planejadas": sem_datas_planejadas,
                "baseline_inconsistente": baseline_inconsistente,
                "sem_diretoria": dir_code is None,
            })

        # ── Capa ──
        all_item_ids: set = set()
        for root in roots:
            all_item_ids.update(PoPortfolioService._subtree(root.id, children))
        capa = {
            "total_projetos": sum(1 for it in items if it["planning_kind"] == "projeto"),
            "total_programas": sum(1 for it in items if it["planning_kind"] == "programa"),
            "total_pos": len({it["po_id"] for it in items if it["po_id"]}),
            "total_itens": len(all_item_ids),
            "total_concluidos": sum(1 for it in items if it["fase"] == "encerramento"),
        }

        # ── Panorama (3 fases) ──
        fases = {"planejamento": 0, "execucao": 0, "encerramento": 0}
        for it in items:
            fases[it["fase"]] += 1
        exec_vals = [it["exec_pct"] for it in items if it["exec_pct"] is not None]
        panorama = {
            "fases": fases,
            "backlog_sem_execucao": sum(1 for it in items if it["backlog_montado"]),
            "avg_exec_pct": round(sum(exec_vals) / len(exec_vals), 1) if exec_vals else None,
        }

        # ── Saúde de prazo ──
        def prazo_block(delays: list) -> Optional[dict]:
            if not delays:
                return {"avaliaveis": 0, "no_prazo": 0, "atrasados": 0,
                        "atraso_medio": None, "atraso_mediana": None, "pct_atrasados": None}
            atrasados = [d for d in delays if d > 0]
            return {
                "avaliaveis": len(delays),
                "no_prazo": len(delays) - len(atrasados),
                "atrasados": len(atrasados),
                "atraso_medio": round(sum(atrasados) / len(atrasados), 1) if atrasados else 0,
                "atraso_mediana": cls._median([float(d) for d in atrasados]) if atrasados else 0,
                "pct_atrasados": round(100 * len(atrasados) / len(delays), 1),
            }
        proj_delays = [it["atraso_dias"] for it in items if it["comparable"]]
        prazo = {
            "projetos": prazo_block(proj_delays),
            "itens": prazo_block(item_delays),
            "sem_datas_comparaveis": sum(1 for it in items if not it["comparable"]),
        }

        # ── Agrupamento por PO ──
        def po_kpis(group: list) -> dict:
            ge = [g["exec_pct"] for g in group if g["exec_pct"] is not None]
            return {
                "total": len(group),
                "planejamento": sum(1 for g in group if g["fase"] == "planejamento"),
                "execucao": sum(1 for g in group if g["fase"] == "execucao"),
                "encerramento": sum(1 for g in group if g["fase"] == "encerramento"),
                "avg_exec_pct": round(sum(ge) / len(ge), 1) if ge else None,
                "em_risco": sum(1 for g in group if g["health"] == "vermelho"),
                "atrasados": sum(1 for g in group if g["prazo_status"] == "atrasado"),
            }
        by_po: dict = {}
        for it in items:
            by_po.setdefault((it["po_id"], it["po"]), []).append(it)
        por_po = []
        ranking_pos = []
        for (pid, pname), group in by_po.items():
            group_sorted = sorted(group, key=lambda g: (
                {"execucao": 0, "planejamento": 1, "encerramento": 2}.get(g["fase"], 3),
                -(g["exec_pct"] or -1), g["title"] or "",
            ))
            k = po_kpis(group)
            por_po.append({"po_id": pid, "full_name": pname, "kpis": k, "projetos": group_sorted})
            ranking_pos.append({"po_id": pid, "full_name": pname, **k})
        por_po.sort(key=lambda x: -x["kpis"]["total"])
        ranking_pos.sort(key=lambda x: -x["total"])

        # ── Por Diretoria ──
        by_dir: dict = {}
        for it in items:
            key = it["diretoria_label"] or "Sem diretoria"
            by_dir.setdefault(key, []).append(it)
        por_diretoria = []
        for dname, group in by_dir.items():
            ge = [g["exec_pct"] for g in group if g["exec_pct"] is not None]
            por_diretoria.append({
                "diretoria_label": dname, "total": len(group),
                "planejamento": sum(1 for g in group if g["fase"] == "planejamento"),
                "execucao": sum(1 for g in group if g["fase"] == "execucao"),
                "encerramento": sum(1 for g in group if g["fase"] == "encerramento"),
                "avg_exec_pct": round(sum(ge) / len(ge), 1) if ge else None,
                "em_risco": sum(1 for g in group if g["health"] == "vermelho"),
                "sem_baseline": dname == "Sem diretoria",
            })
        por_diretoria.sort(key=lambda x: (x["diretoria_label"] == "Sem diretoria", -x["total"]))

        # ── Maiores atrasos (projeto + item), maiores primeiro ──
        proj_outliers = [
            {"title": it["title"], "po": it["po"], "projeto": it["title"], "nivel": "projeto",
             "planejada": it["due_date"], "real": it["completed_at"], "atraso_dias": it["atraso_dias"]}
            for it in items if it["prazo_status"] == "atrasado"
        ]
        maiores_atrasos = sorted(
            proj_outliers + item_outliers, key=lambda x: -(x["atraso_dias"] or 0)
        )[:12]

        # ── Lacunas de baseline ──
        baseline_gaps = {
            "sem_datas_comparaveis": sum(1 for it in items if not it["comparable"]),
            "sem_datas_planejadas": sum(1 for it in items if it["sem_datas_planejadas"]),
            "baseline_inconsistente": sum(1 for it in items if it["baseline_inconsistente"]),
            "sem_diretoria": sum(1 for it in items if it["sem_diretoria"]),
            "total_projetos": len(items),
        }

        # ── Próximos passos (data-driven) ──
        proximos_passos: list = []
        if panorama["backlog_sem_execucao"]:
            proximos_passos.append(
                f"Destravar o planejamento: {panorama['backlog_sem_execucao']} projeto(s) com "
                f"backlog montado e execução não iniciada — definir data de início e primeira sprint."
            )
        if baseline_gaps["sem_datas_comparaveis"]:
            proximos_passos.append(
                f"Sanear o baseline: {baseline_gaps['sem_datas_comparaveis']} projeto(s) sem datas "
                f"comparáveis (planejada + real) — registrar prazos para tornar a saúde de prazo avaliável."
            )
        if baseline_gaps["sem_diretoria"]:
            proximos_passos.append(
                f"Mapear diretoria: {baseline_gaps['sem_diretoria']} projeto(s) sem diretoria — "
                f"preencher o campo na solicitação para habilitar a visão por diretoria."
            )
        if prazo["projetos"] and prazo["projetos"]["atrasados"]:
            proximos_passos.append(
                f"Atacar atrasos: {prazo['projetos']['atrasados']} projeto(s) entregues fora do prazo — "
                f"revisar os maiores outliers e replanejar."
            )

        # ── Saúde do portfólio de PRODUTOS por PO (módulo Produtos, tenant-wide) ──
        from app.modules.produtos.service import ProductService
        saude_produtos = await ProductService.health_by_po(db)

        return {
            "meta": meta, "capa": capa, "panorama": panorama, "prazo": prazo,
            "ranking_pos": ranking_pos, "por_po": por_po, "por_diretoria": por_diretoria,
            "maiores_atrasos": maiores_atrasos, "baseline_gaps": baseline_gaps,
            "proximos_passos": proximos_passos, "saude_produtos": saude_produtos,
            "available_diretorias": available_diretorias, "available_areas": available_areas,
        }


class ProjectProgramService:
    """CRUD do cadastro próprio de Programas (catálogo do tenant)."""

    @staticmethod
    async def _person_names(db: AsyncSession, ids: set) -> dict:
        ids = {i for i in ids if i}
        if not ids:
            return {}
        rows = await db.execute(select(Person.id, Person.full_name).where(Person.id.in_(ids)))
        return {r[0]: r[1] for r in rows.all()}

    @classmethod
    def _to_response(cls, item: ProjectProgram, names: dict) -> ProjectProgramResponse:
        return ProjectProgramResponse(
            id=item.id, name=item.name, description=item.description,
            responsavel_person_id=item.responsavel_person_id,
            responsavel_nome=names.get(item.responsavel_person_id),
            is_active=item.is_active, created_at=item.created_at, updated_at=item.updated_at,
        )

    @classmethod
    async def list(cls, db: AsyncSession, active_only: bool = False) -> list[ProjectProgramResponse]:
        q = select(ProjectProgram)
        if active_only:
            q = q.where(ProjectProgram.is_active == True)  # noqa: E712
        rows = (await db.execute(q.order_by(ProjectProgram.name.asc()))).scalars().all()
        names = await cls._person_names(db, {p.responsavel_person_id for p in rows})
        return [cls._to_response(p, names) for p in rows]

    @classmethod
    async def create(cls, db: AsyncSession, data: ProjectProgramCreate,
                     user_id: Optional[uuid.UUID] = None) -> ProjectProgramResponse:
        item = ProjectProgram(
            name=data.name.strip(),
            description=(data.description or None),
            responsavel_person_id=data.responsavel_person_id,
            is_active=data.is_active,
            created_by=user_id,
        )
        db.add(item)
        await db.commit()
        await db.refresh(item)
        names = await cls._person_names(db, {item.responsavel_person_id})
        return cls._to_response(item, names)

    @classmethod
    async def update(cls, db: AsyncSession, program_id: uuid.UUID, data: ProjectProgramUpdate,
                     user_id: Optional[uuid.UUID] = None) -> ProjectProgramResponse:
        item = await db.get(ProjectProgram, program_id)
        if not item:
            raise HTTPException(status_code=404, detail="Programa não encontrado.")
        payload = data.model_dump(exclude_unset=True)
        if "name" in payload and payload["name"]:
            item.name = payload["name"].strip()
        if "description" in payload:
            item.description = payload["description"] or None
        if "responsavel_person_id" in payload:
            item.responsavel_person_id = payload["responsavel_person_id"]
        if "is_active" in payload and payload["is_active"] is not None:
            item.is_active = payload["is_active"]
        item.updated_by = user_id
        item.updated_at = datetime.utcnow()
        await db.commit()
        await db.refresh(item)
        names = await cls._person_names(db, {item.responsavel_person_id})
        return cls._to_response(item, names)

    @staticmethod
    async def delete(db: AsyncSession, program_id: uuid.UUID) -> None:
        item = await db.get(ProjectProgram, program_id)
        if not item:
            raise HTTPException(status_code=404, detail="Programa não encontrado.")
        await db.delete(item)
        await db.commit()
