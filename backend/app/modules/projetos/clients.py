"""
Operação Assistida — cadastro de clientes e vínculo cliente ↔ projeto.

Regras (ver `.claude/invariantes.md`):
- Quem cadastra é o PO (`projetos.client.manage`). E-mail é único: antes de criar, o PO
  verifica (`lookup`) e reaproveita o cadastro existente.
- Cliente externo → `public.users` novo com a Função de sistema CLIENT_ROLE_NAME, que só
  acessa o Portal (bloqueio em `require_module`). A senha nasce no primeiro acesso
  (`/primeiro-acesso`, fluxo já existente: usuário com `last_login` nulo).
- Colaborador interno do tenant que também é cliente mantém o login e a Função dele.
- Vínculo só com card-raiz do kanban Projetos e Programas.
"""
import secrets
import uuid
from datetime import datetime
from typing import Optional

from fastapi import HTTPException
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.dependencies import CLIENT_ROLE_NAME
from app.core.security import get_password_hash
from app.modules.projetos.models import (
    ProjectClient,
    ProjectClientAccess,
    ProjectFunnel,
    ProjectStatusConfig,
    ProjectTask,
)
from app.modules.projetos.schemas import (
    ProjectClientCreate,
    ProjectClientLookupResponse,
    ProjectClientProjectRef,
    ProjectClientResponse,
    ProjectClientUpdate,
)
from app.modules.super_admin.models import Role, User, UserRole


def _is_planning_funnel_name(name: Optional[str]) -> bool:
    # Espelha ProjectTaskService._is_planning_funnel_name (kanban Projetos/Programas).
    n = (name or "").strip().lower()
    return ("projeto" in n or "programa" in n) and "feature" not in n and "user story" not in n


class ProjectClientService:

    # ── Função de sistema ────────────────────────────────────────────────────
    @staticmethod
    async def _get_or_create_client_role(db: AsyncSession, tenant_id: uuid.UUID) -> Role:
        role = (await db.execute(
            select(Role).where(Role.tenant_id == tenant_id, Role.name == CLIENT_ROLE_NAME)
        )).scalar_one_or_none()
        if role is None:
            role = Role(
                tenant_id=tenant_id,
                name=CLIENT_ROLE_NAME,
                description="Cliente externo da Operação Assistida: acessa só o Portal do Cliente.",
                is_system=True,
            )
            db.add(role)
            await db.flush()
        return role

    # ── Leitura ──────────────────────────────────────────────────────────────
    @staticmethod
    async def _projects_by_task(
        db: AsyncSession, task_ids: set[uuid.UUID]
    ) -> dict[uuid.UUID, ProjectClientProjectRef]:
        if not task_ids:
            return {}
        rows = await db.execute(
            select(ProjectTask.id, ProjectTask.title, ProjectTask.planning_kind, ProjectStatusConfig.name)
            .outerjoin(ProjectStatusConfig, ProjectStatusConfig.id == ProjectTask.status_id)
            .where(ProjectTask.id.in_(task_ids))
        )
        return {
            r[0]: ProjectClientProjectRef(task_id=r[0], title=r[1], planning_kind=r[2], status_name=r[3])
            for r in rows.all()
        }

    @staticmethod
    async def _to_responses(
        db: AsyncSession,
        clients: list[ProjectClient],
        scope: Optional[set[uuid.UUID]] = None,
    ) -> list[ProjectClientResponse]:
        user_ids = [c.user_id for c in clients if c.user_id]
        users: dict[uuid.UUID, User] = {}
        if user_ids:
            rows = await db.execute(select(User).where(User.id.in_(user_ids)))
            users = {u.id: u for u in rows.scalars().all()}
        client_role_ids = set((await db.execute(
            select(Role.id).where(Role.name == CLIENT_ROLE_NAME)
        )).scalars().all())
        all_task_ids = {a.task_id for c in clients for a in c.access}
        projects = await ProjectClientService._projects_by_task(db, all_task_ids)

        out: list[ProjectClientResponse] = []
        for c in clients:
            u = users.get(c.user_id) if c.user_id else None
            refs = [
                projects[a.task_id] for a in c.access
                if a.task_id in projects and (scope is None or a.task_id in scope)
            ]
            out.append(ProjectClientResponse(
                id=c.id,
                email=c.email,
                full_name=c.full_name,
                phone=c.phone,
                organization=c.organization,
                department=c.department,
                notes=c.notes,
                user_id=c.user_id,
                is_active=c.is_active,
                is_internal_user=bool(u and u.role_id not in client_role_ids),
                first_access_pending=bool(u and u.last_login is None),
                projects=sorted(refs, key=lambda r: r.title.lower()),
                created_at=c.created_at,
            ))
        return out

    @staticmethod
    async def _get(db: AsyncSession, client_id: uuid.UUID) -> ProjectClient:
        item = (await db.execute(
            select(ProjectClient)
            .options(selectinload(ProjectClient.access))
            .where(ProjectClient.id == client_id)
        )).scalar_one_or_none()
        if item is None:
            raise HTTPException(status_code=404, detail="Cliente não encontrado.")
        return item

    @staticmethod
    async def list_clients(
        db: AsyncSession,
        search: Optional[str] = None,
        include_inactive: bool = False,
        scope: Optional[set[uuid.UUID]] = None,
    ) -> list[ProjectClientResponse]:
        """`scope` (PO Externo) limita aos clientes vinculados aos projetos dele e esconde
        os vínculos com projetos de terceiros."""
        q = select(ProjectClient).options(selectinload(ProjectClient.access))
        if not include_inactive:
            q = q.where(ProjectClient.is_active == True)  # noqa: E712
        if search:
            like = f"%{search.strip().lower()}%"
            q = q.where(
                func.lower(ProjectClient.full_name).like(like)
                | func.lower(ProjectClient.email).like(like)
                | func.lower(func.coalesce(ProjectClient.organization, "")).like(like)
            )
        clients = list((await db.execute(q.order_by(ProjectClient.full_name))).scalars().all())
        if scope is not None:
            clients = [c for c in clients if any(a.task_id in scope for a in c.access)]
        return await ProjectClientService._to_responses(db, clients, scope)

    @staticmethod
    async def get(db: AsyncSession, client_id: uuid.UUID) -> ProjectClientResponse:
        item = await ProjectClientService._get(db, client_id)
        return (await ProjectClientService._to_responses(db, [item]))[0]

    @staticmethod
    async def lookup(
        db: AsyncSession, email: str, tenant_id: uuid.UUID
    ) -> ProjectClientLookupResponse:
        normalized = (email or "").strip().lower()
        if not normalized:
            raise HTTPException(status_code=400, detail="Informe o e-mail.")
        client = (await db.execute(
            select(ProjectClient)
            .options(selectinload(ProjectClient.access))
            .where(func.lower(ProjectClient.email) == normalized)
        )).scalar_one_or_none()
        if client is not None:
            resp = (await ProjectClientService._to_responses(db, [client]))[0]
            return ProjectClientLookupResponse(status="client", client=resp)
        user = (await db.execute(
            select(User).where(func.lower(User.email) == normalized)
        )).scalar_one_or_none()
        if user is None:
            return ProjectClientLookupResponse(status="new")
        if user.tenant_id != tenant_id:
            return ProjectClientLookupResponse(status="other_tenant")
        return ProjectClientLookupResponse(status="internal_user", user_full_name=user.full_name)

    # ── Escrita ──────────────────────────────────────────────────────────────
    @staticmethod
    async def _assert_linkable_projects(
        db: AsyncSession,
        task_ids: list[uuid.UUID],
        scope: Optional[set[uuid.UUID]] = None,
    ) -> list[uuid.UUID]:
        ids = list(dict.fromkeys(task_ids))
        if not ids:
            return []
        if scope is not None and any(t not in scope for t in ids):
            raise HTTPException(status_code=404, detail="Projeto não encontrado.")
        rows = await db.execute(
            select(ProjectTask.id, ProjectTask.parent_task_id, ProjectFunnel.name)
            .join(ProjectStatusConfig, ProjectStatusConfig.id == ProjectTask.status_id)
            .join(ProjectFunnel, ProjectFunnel.id == ProjectStatusConfig.funnel_id)
            .where(ProjectTask.id.in_(ids))
        )
        found = {r[0]: r for r in rows.all()}
        for t in ids:
            r = found.get(t)
            if r is None:
                raise HTTPException(status_code=404, detail="Projeto não encontrado.")
            if r[1] is not None or not _is_planning_funnel_name(r[2]):
                raise HTTPException(
                    status_code=400,
                    detail="Cliente só pode ser vinculado a projetos/programas do kanban Projetos e Programas.",
                )
        return ids

    @staticmethod
    async def create(
        db: AsyncSession,
        data: ProjectClientCreate,
        tenant_id: uuid.UUID,
        created_by: uuid.UUID,
        scope: Optional[set[uuid.UUID]] = None,
    ) -> ProjectClientResponse:
        exists = (await db.execute(
            select(ProjectClient.id).where(func.lower(ProjectClient.email) == data.email)
        )).scalar_one_or_none()
        if exists is not None:
            raise HTTPException(
                status_code=409,
                detail="Já existe um cliente com este e-mail. Vincule o cadastro existente ao projeto.",
            )
        task_ids = await ProjectClientService._assert_linkable_projects(db, data.project_task_ids, scope)

        user = (await db.execute(
            select(User).where(func.lower(User.email) == data.email)
        )).scalar_one_or_none()
        if user is not None and user.tenant_id != tenant_id:
            raise HTTPException(status_code=409, detail="E-mail já usado por usuário de outra empresa.")
        if user is None:
            # Cliente externo: login novo só com o Portal. A senha real nasce no primeiro
            # acesso — a daqui é aleatória e ninguém a conhece. Não conta no limite de
            # usuários do plano (não é colaborador).
            role = await ProjectClientService._get_or_create_client_role(db, tenant_id)
            user = User(
                email=data.email,
                full_name=data.full_name.strip(),
                hashed_password=get_password_hash(secrets.token_urlsafe(32)),
                role=UserRole.COMPANY_USER,
                role_id=role.id,
                tenant_id=tenant_id,
                is_active=True,
            )
            db.add(user)
            await db.flush()

        client = ProjectClient(
            user_id=user.id,
            full_name=data.full_name.strip(),
            email=data.email,
            phone=data.phone,
            organization=data.organization,
            department=data.department,
            notes=data.notes,
            created_by=created_by,
        )
        db.add(client)
        await db.flush()
        for t in task_ids:
            db.add(ProjectClientAccess(client_id=client.id, task_id=t, created_by=created_by))
        await db.commit()
        return await ProjectClientService.get(db, client.id)

    @staticmethod
    async def update(
        db: AsyncSession, client_id: uuid.UUID, data: ProjectClientUpdate
    ) -> ProjectClientResponse:
        from app.core.cache import invalidate_user

        client = await ProjectClientService._get(db, client_id)
        payload = data.model_dump(exclude_unset=True)
        for field in ("full_name", "phone", "organization", "department", "notes"):
            if field in payload:
                value = payload[field]
                setattr(client, field, value.strip() if isinstance(value, str) and field == "full_name" else value)

        user = None
        if client.user_id:
            user = (await db.execute(select(User).where(User.id == client.user_id))).scalar_one_or_none()
        is_external = False
        if user is not None and user.role_id:
            role_name = (await db.execute(
                select(Role.name).where(Role.id == user.role_id)
            )).scalar_one_or_none()
            is_external = (role_name or "").strip() == CLIENT_ROLE_NAME

        if is_external and user is not None:
            if "full_name" in payload and payload["full_name"]:
                user.full_name = client.full_name
            # Inativar o cliente externo desliga o login; o do colaborador interno fica.
            if "is_active" in payload and payload["is_active"] is not None:
                user.is_active = bool(payload["is_active"])
            user.updated_at = datetime.utcnow()
        if "is_active" in payload and payload["is_active"] is not None:
            client.is_active = bool(payload["is_active"])
        client.updated_at = datetime.utcnow()
        await db.commit()
        if user is not None:
            await invalidate_user(user.id)
        return await ProjectClientService.get(db, client_id)

    @staticmethod
    async def set_projects(
        db: AsyncSession,
        client_id: uuid.UUID,
        task_ids: list[uuid.UUID],
        created_by: uuid.UUID,
        scope: Optional[set[uuid.UUID]] = None,
    ) -> ProjectClientResponse:
        """Substitui os vínculos. Com `scope` (PO Externo), mexe só nos projetos dele —
        vínculos com projetos de terceiros ficam intactos."""
        client = await ProjectClientService._get(db, client_id)
        wanted = set(await ProjectClientService._assert_linkable_projects(db, task_ids, scope))
        current = {a.task_id: a for a in client.access}
        for tid, access in current.items():
            if tid not in wanted and (scope is None or tid in scope):
                await db.delete(access)
        for tid in wanted - set(current):
            db.add(ProjectClientAccess(client_id=client.id, task_id=tid, created_by=created_by))
        client.updated_at = datetime.utcnow()
        await db.commit()
        db.expire_all()
        return await ProjectClientService.get(db, client_id)

    @staticmethod
    async def list_linkable_projects(
        db: AsyncSession, scope: Optional[set[uuid.UUID]] = None
    ) -> list[ProjectClientProjectRef]:
        """Cards-raiz do kanban Projetos e Programas (candidatos a vínculo)."""
        rows = await db.execute(
            select(ProjectTask.id, ProjectTask.title, ProjectTask.planning_kind,
                   ProjectStatusConfig.name, ProjectFunnel.name)
            .join(ProjectStatusConfig, ProjectStatusConfig.id == ProjectTask.status_id)
            .join(ProjectFunnel, ProjectFunnel.id == ProjectStatusConfig.funnel_id)
            .where(ProjectTask.parent_task_id.is_(None))
            .order_by(ProjectTask.title)
        )
        return [
            ProjectClientProjectRef(task_id=r[0], title=r[1], planning_kind=r[2], status_name=r[3])
            for r in rows.all()
            if _is_planning_funnel_name(r[4]) and (scope is None or r[0] in scope)
        ]

    @staticmethod
    async def list_for_project(db: AsyncSession, task_id: uuid.UUID) -> list[ProjectClientResponse]:
        clients = list((await db.execute(
            select(ProjectClient)
            .options(selectinload(ProjectClient.access))
            .join(ProjectClientAccess, ProjectClientAccess.client_id == ProjectClient.id)
            .where(ProjectClientAccess.task_id == task_id)
            .order_by(ProjectClient.full_name)
        )).scalars().unique().all())
        return await ProjectClientService._to_responses(db, clients)

    # ── Portal ───────────────────────────────────────────────────────────────
    @staticmethod
    async def get_by_user(db: AsyncSession, user_id: uuid.UUID) -> Optional[ProjectClient]:
        return (await db.execute(
            select(ProjectClient)
            .options(selectinload(ProjectClient.access))
            .where(ProjectClient.user_id == user_id, ProjectClient.is_active == True)  # noqa: E712
        )).scalar_one_or_none()

    @staticmethod
    async def portal_projects(db: AsyncSession, user_id: uuid.UUID) -> list[ProjectClientProjectRef]:
        client = await ProjectClientService.get_by_user(db, user_id)
        if client is None:
            raise HTTPException(status_code=403, detail="Usuário sem acesso ao Portal do Cliente.")
        projects = await ProjectClientService._projects_by_task(db, {a.task_id for a in client.access})
        return sorted(projects.values(), key=lambda r: r.title.lower())
