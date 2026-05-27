from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import Optional

from fastapi import HTTPException, status
from sqlalchemy import and_, delete as sa_delete, or_, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.modules.projetos.models import (
    ProjectAutomationAction,
    ProjectAutomationRule,
    ProjectDemandFormField,
    ProjectDemandFormSection,
    ProjectDemandFormSubmission,
    ProjectDemandType,
    ProjectFunnel,
    Project,
    ProjectMember,
    ProjectScheduleBinding,
    ProjectStatusSectionLink,
    ProjectStatusConfig,
    ProjectTask,
    ProjectTaskComment,
)
from app.modules.projetos.schemas import (
    ProjectAutomationRuleCreate,
    ProjectAutomationRuleUpdate,
    ProjectCreate,
    ProjectDemandFormFieldCreate,
    ProjectDemandFormFieldUpdate,
    ProjectDemandFormSubmissionUpsert,
    ProjectDemandFormSectionCreate,
    ProjectDemandFormSectionUpdate,
    ProjectDemandTypeCreate,
    ProjectDemandTypeUpdate,
    ProjectFunnelCreate,
    ProjectFunnelUpdate,
    ProjectMemberCreate,
    ProjectScheduleBindingItem,
    ProjectStatusCreate,
    ProjectStatusUpdate,
    ProjectTaskCommentCreate,
    ProjectTaskCreate,
    ProjectTaskUpdate,
    ProjectUpdate,
)
from sqlalchemy import text as _sa_text
from app.modules.super_admin.models import User, UserRole


def _to_naive_utc(value: Optional[datetime]) -> Optional[datetime]:
    if value is None:
        return None
    if value.tzinfo is None:
        return value
    return value.astimezone(timezone.utc).replace(tzinfo=None)


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
    async def list(db: AsyncSession, project_id: uuid.UUID, active_only: bool = False) -> list[ProjectFunnel]:
        await ProjectService.get(db, project_id)
        q = select(ProjectFunnel).where(ProjectFunnel.project_id == project_id)
        if active_only:
            q = q.where(ProjectFunnel.is_active == True)  # noqa: E712
        q = q.order_by(ProjectFunnel.order.asc(), ProjectFunnel.created_at.asc())
        result = await db.execute(q)
        return list(result.scalars().all())

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

    @staticmethod
    def _normalize_type_ids(value) -> Optional[list[str]]:
        """JSONB não serializa UUID — converte para strings."""
        if value is None:
            return None
        return [str(x) for x in value]

    @staticmethod
    async def create(db: AsyncSession, project_id: uuid.UUID, data: ProjectFunnelCreate) -> ProjectFunnel:
        await ProjectService.get(db, project_id)
        payload = data.model_dump()
        if "allowed_demand_type_ids" in payload:
            payload["allowed_demand_type_ids"] = ProjectFunnelService._normalize_type_ids(payload["allowed_demand_type_ids"])
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


class ProjectDemandFormSubmissionService:
    @staticmethod
    async def get_by_task(db: AsyncSession, project_id: uuid.UUID, task_id: uuid.UUID) -> Optional[ProjectDemandFormSubmission]:
        await ProjectTaskService.get(db, project_id, task_id)
        result = await db.execute(select(ProjectDemandFormSubmission).where(ProjectDemandFormSubmission.task_id == task_id))
        return result.scalar_one_or_none()

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
    async def _maybe_convert_on_status(
        db: AsyncSession,
        project_id: uuid.UUID,
        task: ProjectTask,
        status_obj: Optional[ProjectStatusConfig],
        conversion_title: Optional[str] = None,
    ) -> None:
        """Se a fase de destino dispara conversão, cria um novo card do tipo configurado
        vinculado à task de origem (origin_task_id). O nome do card criado vem de
        `conversion_title` (informado na aprovação); se vazio, copia o título da origem.
        Idempotente."""
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
        db.add(ProjectTask(
            project_id=project_id,
            status_id=init_status.id,
            demand_type_id=ttype.id,
            title=new_title[:200],
            description=task.description,
            assigned_to=task.assigned_to,
            created_by=task.created_by,
            origin_task_id=task.id,
        ))

    @staticmethod
    def _sla_initial(status_obj: Optional[ProjectStatusConfig]) -> str:
        """Estado de SLA ao entrar numa etapa: 'ok' se a etapa tem SLA, senão 'none'."""
        if status_obj is not None and status_obj.sla_hours:
            return "ok"
        return "none"

    @staticmethod
    def _check_move_permission(status_obj: Optional[ProjectStatusConfig], current_user: Optional[User]) -> None:
        """Bloqueia a movimentação do card para a etapa se a função do usuário não for permitida.
        Sem current_user (ações internas) ou sem restrição na etapa = liberado.
        super_admin e company_admin sempre podem."""
        if status_obj is None or current_user is None:
            return
        allowed = status_obj.move_in_role_ids or []
        if not allowed:
            return
        if current_user.role in (UserRole.SUPER_ADMIN, UserRole.COMPANY_ADMIN):
            return
        if current_user.role_id and str(current_user.role_id) in {str(x) for x in allowed}:
            return
        raise HTTPException(
            status_code=403,
            detail="Sua função não tem permissão para mover o card para esta etapa.",
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
    async def create(
        db: AsyncSession,
        project_id: uuid.UUID,
        data: ProjectTaskCreate,
        current_user_id: Optional[uuid.UUID] = None,
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
        payload["due_date"] = _to_naive_utc(payload.get("due_date"))
        payload["start_date"] = _to_naive_utc(payload.get("start_date"))
        task = ProjectTask(
            project_id=project_id,
            **payload,
            created_by=current_user_id,
        )
        task.sla_state = ProjectTaskService._sla_initial(status_obj)
        db.add(task)
        await db.flush()
        await ProjectTaskService._upsert_form_submission(db, task.id, form_values, current_user_id)
        await db.commit()
        await db.refresh(task)
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
    async def update(
        db: AsyncSession,
        project_id: uuid.UUID,
        task_id: uuid.UUID,
        data: ProjectTaskUpdate,
        current_user: Optional[User] = None,
    ) -> ProjectTask:
        task = await ProjectTaskService.get(db, project_id, task_id)
        payload = data.model_dump(exclude_unset=True)
        if "due_date" in payload:
            payload["due_date"] = _to_naive_utc(payload.get("due_date"))
        if "start_date" in payload:
            payload["start_date"] = _to_naive_utc(payload.get("start_date"))
        form_values = payload.pop("form_values", None)
        conversion_title = payload.pop("conversion_title", None)

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
        await ProjectTaskService._validate_form_values_for_status(
            db,
            demand_type_id=target_demand_type_id,
            status_id=target_status_id,
            form_values=merged_values,
        )

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
                ProjectTaskService._check_move_permission(target_status, current_user)

        # O card mudou de etapa? (calculado antes do setattr)
        status_changed = bool(payload.get("status_id")) and payload["status_id"] != task.status_id

        # Cronograma: se a etapa de ORIGEM exige preenchimento, bloqueia a saída
        # sem início+prazo.
        if status_changed:
            await ProjectTaskService._enforce_schedule_gate(db, task, payload)

        for key, value in payload.items():
            setattr(task, key, value)

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
            # Automações da fase em que o card entrou (atribuir, subtarefa, notificar, comentar).
            await ProjectAutomationRunner.run_on_enter(db, project_id, task, status_obj)
            # Gatilho de conversão: se a fase de destino gera outro tipo de card.
            await ProjectTaskService._maybe_convert_on_status(db, project_id, task, status_obj, conversion_title)
            # Gatilho de transição: se a fase de destino move o card para outro kanban.
            await ProjectTaskService._maybe_move_to_funnel(db, project_id, task, status_obj)

        task.updated_at = datetime.utcnow()
        await ProjectTaskService._upsert_form_submission(db, task.id, form_values, None)
        await db.commit()
        await db.refresh(task)
        return task

    @staticmethod
    async def delete(db: AsyncSession, project_id: uuid.UUID, task_id: uuid.UUID) -> None:
        task = await ProjectTaskService.get(db, project_id, task_id)
        await db.delete(task)
        await db.commit()


class ProjectTaskCommentService:
    @staticmethod
    async def list(db: AsyncSession, project_id: uuid.UUID, task_id: uuid.UUID) -> list[ProjectTaskComment]:
        await ProjectTaskService.get(db, project_id, task_id)
        result = await db.execute(
            select(ProjectTaskComment)
            .where(ProjectTaskComment.task_id == task_id)
            .order_by(ProjectTaskComment.created_at.asc())
        )
        return list(result.scalars().all())

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
            user_id = cfg.get("user_id")
            if user_id:
                task.assigned_to = uuid.UUID(str(user_id))

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
                    await db.execute(
                        _sa_text(
                            "INSERT INTO notifications (id, user_id, title, body, entity_type, entity_id, is_read, created_at) "
                            "VALUES (gen_random_uuid(), :uid, :t, :b, 'project_task', :eid, FALSE, now())"
                        ),
                        {"uid": str(task.assigned_to), "t": "SLA de projetos", "b": msg, "eid": str(task.id)},
                    )
                db.add(ProjectTaskComment(task_id=task.id, author_id=None, content=f"[SLA] {msg}"))
        await db.commit()
        return {"changed": changed, "warning": warning, "breached": breached}


class ProjectReportsService:
    """Agrega métricas do board (tenant-wide) para a página de Relatórios."""

    @staticmethod
    async def build(db: AsyncSession) -> dict:
        now = datetime.utcnow()
        rows = await db.execute(
            select(ProjectTask).options(
                selectinload(ProjectTask.status),
                selectinload(ProjectTask.demand_type),
            )
        )
        tasks = rows.scalars().all()
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

