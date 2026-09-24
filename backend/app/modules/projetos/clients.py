"""
Operação Assistida — cadastro de clientes e vínculo cliente ↔ projeto.

Regras (ver `.claude/invariantes.md`):
- Quem cadastra é o PO (`projetos.client.manage`). E-mail é único: antes de criar, o PO
  verifica (`lookup`) e reaproveita o cadastro existente.
- Cliente externo → `public.users` novo com a Função de sistema CLIENT_ROLE_NAME, que só
  acessa o Portal (bloqueio em `require_module`). A senha nasce no primeiro acesso
  (`/primeiro-acesso`, fluxo já existente: usuário com `last_login` nulo).
- Colaborador interno do tenant que também é cliente mantém o login e a Função dele.
  Quem está em Pessoas e ainda não tem login vira cliente SEM login: o login de colaborador
  nasce no 1º acesso/IDigital e o cadastro de cliente é ligado a ele pelo e-mail.
- Vínculo só com card-raiz do kanban Projetos e Programas. No card do projeto, o PO do projeto
  e a coordenação adicionam/retiram clientes em qualquer fase, com a função de cada um.
"""
import secrets
import uuid
from datetime import date, datetime
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
    ClientProjectFeature,
    ClientProjectReport,
    ProjectClientCandidate,
    ProjectClientCandidates,
    ProjectClientCreate,
    ProjectClientLookupResponse,
    ProjectClientMember,
    ProjectClientMemberAdd,
    ProjectClientMembers,
    ProjectClientMemberUpdate,
    ProjectClientProjectRef,
    ProjectClientResponse,
    ProjectClientUpdate,
)
from app.modules.super_admin.models import Role, User, UserRole

# Função do cliente no projeto (vínculo). "outro" usa o texto livre.
PROJECT_CLIENT_ROLES: dict[str, str] = {
    "solicitante": "Solicitante",
    "sponsor": "Sponsor",
    "usuario_chave": "Usuário-chave",
    "homologador": "Homologador",
    "gestor_area": "Gestor da área",
    "outro": "Outro",
}


def project_role_label(role: Optional[str], other: Optional[str]) -> str:
    if role == "outro":
        return (other or "").strip() or "Outro"
    return PROJECT_CLIENT_ROLES.get(role or "", "")


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
                job_title=c.job_title,
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
    async def _active_person_by_email(db: AsyncSession, email: str) -> Optional[tuple[str, Optional[str]]]:
        """(nome, cargo) da Pessoa ativa do TeamOps com este e-mail — no schema do tenant."""
        from app.modules.teamops.models import Person, PersonStatus, Position

        row = (await db.execute(
            select(Person.full_name, Position.name)
            .outerjoin(Position, Position.id == Person.position_id)
            .where(func.lower(Person.email) == email, Person.status != PersonStatus.DESLIGADO)
            .limit(1)
        )).first()
        return (row[0], row[1]) if row else None

    @staticmethod
    async def _login_for_new_client(
        db: AsyncSession, email: str, full_name: str, tenant_id: uuid.UUID,
    ) -> Optional[uuid.UUID]:
        """Login do cadastro de cliente novo:
        - usuário do tenant com este e-mail → reaproveita (colaborador mantém a Função dele);
        - Pessoa (TeamOps) sem login → nenhum: o login de colaborador nasce no 1º acesso/IDigital
          e o cliente é ligado a ele pelo e-mail (`get_by_user`). Criar login de cliente aqui
          transformaria o colaborador em cliente externo;
        - senão → login novo só com o Portal (senha no 1º acesso, ou entra pelo IDigital).
          Não conta no limite de usuários do plano (não é colaborador)."""
        user = (await db.execute(
            select(User).where(func.lower(User.email) == email)
        )).scalar_one_or_none()
        if user is not None:
            if user.tenant_id != tenant_id:
                raise HTTPException(status_code=409, detail="E-mail já usado por usuário de outra empresa.")
            return user.id
        if await ProjectClientService._active_person_by_email(db, email) is not None:
            return None
        role = await ProjectClientService._get_or_create_client_role(db, tenant_id)
        user = User(
            email=email,
            full_name=full_name.strip(),
            hashed_password=get_password_hash(secrets.token_urlsafe(32)),
            role=UserRole.COMPANY_USER,
            role_id=role.id,
            tenant_id=tenant_id,
            is_active=True,
        )
        db.add(user)
        await db.flush()
        return user.id

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
        user_id = await ProjectClientService._login_for_new_client(db, data.email, data.full_name, tenant_id)

        client = ProjectClient(
            user_id=user_id,
            full_name=data.full_name.strip(),
            email=data.email,
            phone=data.phone,
            organization=data.organization,
            department=data.department,
            job_title=data.job_title,
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
        for field in ("full_name", "phone", "organization", "department", "job_title", "notes"):
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
        """Candidatos a vínculo: cards-raiz do kanban Projetos e Programas que estão na raia
        Operação Assistida — só eles recebem ocorrências de cliente. (Vínculos já feitos com
        projetos que saíram da raia continuam no cadastro; a tela os mostra à parte.)"""
        from app.modules.projetos.service import ProjectTaskService
        rows = await db.execute(
            select(ProjectTask.id, ProjectTask.title, ProjectTask.planning_kind,
                   ProjectStatusConfig, ProjectFunnel.name)
            .join(ProjectStatusConfig, ProjectStatusConfig.id == ProjectTask.status_id)
            .join(ProjectFunnel, ProjectFunnel.id == ProjectStatusConfig.funnel_id)
            .where(ProjectTask.parent_task_id.is_(None))
            .order_by(ProjectTask.title)
        )
        return [
            ProjectClientProjectRef(task_id=r[0], title=r[1], planning_kind=r[2], status_name=r[3].name)
            for r in rows.all()
            if _is_planning_funnel_name(r[4])
            and ProjectTaskService._is_assisted_operation_status(r[3])
            and (scope is None or r[0] in scope)
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
        """Cadastro de cliente do usuário. Cliente cadastrado só pelo e-mail (ex.: Pessoa que
        ainda não tinha login) é ligado ao login aqui, no 1º acesso ao Portal."""
        q = select(ProjectClient).options(selectinload(ProjectClient.access))
        client = (await db.execute(
            q.where(ProjectClient.user_id == user_id, ProjectClient.is_active == True)  # noqa: E712
        )).scalar_one_or_none()
        if client is not None:
            return client
        user = await db.get(User, user_id)
        if user is None:
            return None
        client = (await db.execute(
            q.where(
                ProjectClient.user_id.is_(None),
                func.lower(ProjectClient.email) == user.email.strip().lower(),
                ProjectClient.is_active == True,  # noqa: E712
            )
        )).scalar_one_or_none()
        if client is None:
            return None
        client.user_id = user.id
        client.updated_at = datetime.utcnow()
        await db.commit()
        return (await db.execute(q.where(ProjectClient.id == client.id))).scalar_one()

    @staticmethod
    async def portal_projects(db: AsyncSession, user_id: uuid.UUID) -> list[ProjectClientProjectRef]:
        client = await ProjectClientService.get_by_user(db, user_id)
        if client is None:
            raise HTTPException(status_code=403, detail="Usuário sem acesso ao Portal do Cliente.")
        projects = await ProjectClientService._projects_by_task(db, {a.task_id for a in client.access})
        return sorted(projects.values(), key=lambda r: r.title.lower())

    # ── Clientes do projeto (card do projeto) ────────────────────────────────
    @staticmethod
    async def can_manage_project(db: AsyncSession, user: User, task: ProjectTask) -> bool:
        """PO do projeto (responsável do card-raiz), coordenação ou admin."""
        from app.modules.projetos.service import ProjectTaskService

        if await ProjectTaskService._is_coordination(db, user):
            return True
        return await ProjectTaskService._is_planning_root_po(db, user, task)

    @staticmethod
    async def assert_can_manage_project(db: AsyncSession, user: User, task_id: uuid.UUID) -> ProjectTask:
        await ProjectClientService._assert_linkable_projects(db, [task_id])
        task = await db.get(ProjectTask, task_id)
        if not await ProjectClientService.can_manage_project(db, user, task):
            raise HTTPException(
                status_code=403,
                detail="Só o PO do projeto ou a coordenação gerenciam os clientes do projeto.",
            )
        return task

    @staticmethod
    async def list_members(db: AsyncSession, task_id: uuid.UUID, user: User) -> ProjectClientMembers:
        task = await db.get(ProjectTask, task_id)
        if task is None:
            raise HTTPException(status_code=404, detail="Card não encontrado.")
        try:
            await ProjectClientService._assert_linkable_projects(db, [task_id])
        except HTTPException:
            return ProjectClientMembers()  # só card-raiz do kanban Projetos e Programas tem clientes
        rows = (await db.execute(
            select(ProjectClientAccess, ProjectClient)
            .join(ProjectClient, ProjectClient.id == ProjectClientAccess.client_id)
            .where(ProjectClientAccess.task_id == task_id)
            .order_by(ProjectClient.full_name)
        )).all()
        user_ids = [c.user_id for _, c in rows if c.user_id]
        users: dict[uuid.UUID, User] = {}
        if user_ids:
            users = {u.id: u for u in (await db.execute(select(User).where(User.id.in_(user_ids)))).scalars()}
        client_role_ids = set((await db.execute(
            select(Role.id).where(Role.name == CLIENT_ROLE_NAME)
        )).scalars().all())
        members = []
        for access, c in rows:
            u = users.get(c.user_id) if c.user_id else None
            members.append(ProjectClientMember(
                client_id=c.id,
                full_name=c.full_name,
                email=c.email,
                department=c.department,
                organization=c.organization,
                job_title=c.job_title,
                project_role=access.project_role,
                project_role_other=access.project_role_other,
                project_role_label=project_role_label(access.project_role, access.project_role_other),
                has_login=u is not None,
                is_internal_user=bool(u and u.role_id not in client_role_ids),
                is_active=c.is_active,
                added_at=access.created_at,
            ))
        return ProjectClientMembers(
            can_manage=await ProjectClientService.can_manage_project(db, user, task),
            members=members,
        )

    @staticmethod
    async def search_candidates(
        db: AsyncSession, task_id: uuid.UUID, q: str, tenant_id: uuid.UUID,
    ) -> ProjectClientCandidates:
        """Sugestões ao digitar nome ou e-mail: clientes já cadastrados, Pessoas (TeamOps) e
        usuários do tenant. Se a busca for um e-mail, consulta também a folha (Genus), que
        preenche departamento/cargo/organização — ela não devolve nome, então não busca por nome."""
        from app.modules.super_admin.payroll import PayrollService, PayrollUnavailable
        from app.modules.teamops.models import Person, PersonStatus, Position

        term = (q or "").strip().lower()
        if len(term) < 2:
            return ProjectClientCandidates()
        like = f"%{term}%"
        linked_client_ids = set((await db.execute(
            select(ProjectClientAccess.client_id).where(ProjectClientAccess.task_id == task_id)
        )).scalars().all())
        found: dict[str, ProjectClientCandidate] = {}

        def add(c: ProjectClientCandidate) -> None:
            key = c.email.strip().lower()
            if key and key not in found:
                found[key] = c

        clients = (await db.execute(
            select(ProjectClient)
            .where(func.lower(ProjectClient.full_name).like(like) | func.lower(ProjectClient.email).like(like))
            .order_by(ProjectClient.full_name).limit(8)
        )).scalars().all()
        for c in clients:
            add(ProjectClientCandidate(
                source="client", email=c.email, full_name=c.full_name, department=c.department,
                organization=c.organization, job_title=c.job_title, client_id=c.id,
                already_linked=c.id in linked_client_ids,
            ))
        persons = (await db.execute(
            select(Person.full_name, Person.email, Position.name)
            .outerjoin(Position, Position.id == Person.position_id)
            .where(
                Person.status != PersonStatus.DESLIGADO,
                func.lower(Person.full_name).like(like) | func.lower(Person.email).like(like),
            )
            .order_by(Person.full_name).limit(8)
        )).all()
        for name, email, position in persons:
            if email:
                add(ProjectClientCandidate(source="person", email=email.lower(), full_name=name, job_title=position))
        users = (await db.execute(
            select(User.full_name, User.email)
            .where(
                User.tenant_id == tenant_id,
                User.is_active == True,  # noqa: E712
                func.lower(User.full_name).like(like) | func.lower(User.email).like(like),
            )
            .order_by(User.full_name).limit(8)
        )).all()
        for name, email in users:
            add(ProjectClientCandidate(source="user", email=email.lower(), full_name=name))

        genus = "skipped"
        if "@" in term and "." in term.split("@")[-1]:
            if not PayrollService.configured():
                genus = "off"
            else:
                try:
                    data = await PayrollService.fetch_by_email(term)
                except PayrollUnavailable:
                    data, genus = None, "unavailable"
                else:
                    genus = "ok" if data else "not_found"
                if data:
                    extra = {
                        "department": data.get("department"),
                        "organization": data.get("organization"),
                        "job_title": data.get("job_title"),
                    }
                    if term in found:
                        cand = found[term]
                        for k, v in extra.items():
                            if v and not getattr(cand, k):
                                setattr(cand, k, v)
                    else:
                        add(ProjectClientCandidate(source="genus", email=term, **extra))

        # Pessoa/usuário que já é cliente deste projeto (cadastro com o mesmo e-mail).
        if linked_client_ids:
            linked_emails = set((await db.execute(
                select(func.lower(ProjectClient.email)).where(ProjectClient.id.in_(linked_client_ids))
            )).scalars().all())
            for key, cand in found.items():
                if key in linked_emails:
                    cand.already_linked = True
        return ProjectClientCandidates(items=list(found.values())[:15], genus=genus)

    @staticmethod
    async def add_member(
        db: AsyncSession,
        task_id: uuid.UUID,
        data: ProjectClientMemberAdd,
        tenant_id: uuid.UUID,
        created_by: uuid.UUID,
    ) -> None:
        from app.core.cache import invalidate_user

        await ProjectClientService._assert_linkable_projects(db, [task_id])
        client: Optional[ProjectClient] = None
        if data.client_id is not None:
            client = await ProjectClientService._get(db, data.client_id)
        else:
            client = (await db.execute(
                select(ProjectClient)
                .options(selectinload(ProjectClient.access))
                .where(func.lower(ProjectClient.email) == data.email)
            )).scalar_one_or_none()
        if client is None:
            name = (data.full_name or "").strip()
            if not name:
                person = await ProjectClientService._active_person_by_email(db, data.email)
                user = (await db.execute(
                    select(User).where(func.lower(User.email) == data.email)
                )).scalar_one_or_none()
                name = (person[0] if person else None) or (user.full_name if user else "") or ""
            if len(name) < 2:
                raise HTTPException(status_code=400, detail="Informe o nome da pessoa.")
            job_title = data.job_title
            if not job_title:
                person = await ProjectClientService._active_person_by_email(db, data.email)
                job_title = person[1] if person else None
            client = ProjectClient(
                user_id=await ProjectClientService._login_for_new_client(db, data.email, name, tenant_id),
                full_name=name,
                email=data.email,
                organization=data.organization,
                department=data.department,
                job_title=job_title,
                notes=f"Cadastrado como cliente do projeto em {datetime.utcnow():%d/%m/%Y}.",
                created_by=created_by,
            )
            db.add(client)
            await db.flush()
        else:
            for field in ("department", "organization", "job_title"):
                value = getattr(data, field)
                if value and not getattr(client, field):
                    setattr(client, field, value)

        exists = (await db.execute(
            select(ProjectClientAccess.id).where(
                ProjectClientAccess.client_id == client.id, ProjectClientAccess.task_id == task_id,
            )
        )).scalar_one_or_none()
        if exists is not None:
            raise HTTPException(status_code=409, detail=f"{client.full_name} já é cliente deste projeto.")

        reactivated_user: Optional[uuid.UUID] = None
        if not client.is_active:
            # Voltou a ser cliente: reativa o cadastro e, se for externo, o login do Portal.
            client.is_active = True
            if client.user_id:
                user = await db.get(User, client.user_id)
                client_role = await ProjectClientService._get_or_create_client_role(db, tenant_id)
                if user is not None and user.role_id == client_role.id and not user.is_active:
                    user.is_active = True
                    user.updated_at = datetime.utcnow()
                    reactivated_user = user.id
        db.add(ProjectClientAccess(
            client_id=client.id,
            task_id=task_id,
            project_role=data.project_role,
            project_role_other=data.project_role_other,
            created_by=created_by,
        ))
        client.updated_at = datetime.utcnow()
        await db.commit()
        if reactivated_user:
            await invalidate_user(reactivated_user)

    @staticmethod
    async def _access(db: AsyncSession, task_id: uuid.UUID, client_id: uuid.UUID) -> ProjectClientAccess:
        access = (await db.execute(
            select(ProjectClientAccess).where(
                ProjectClientAccess.task_id == task_id, ProjectClientAccess.client_id == client_id,
            )
        )).scalar_one_or_none()
        if access is None:
            raise HTTPException(status_code=404, detail="Esta pessoa não é cliente do projeto.")
        return access

    @staticmethod
    async def update_member(
        db: AsyncSession, task_id: uuid.UUID, client_id: uuid.UUID, data: ProjectClientMemberUpdate,
    ) -> None:
        access = await ProjectClientService._access(db, task_id, client_id)
        access.project_role = data.project_role
        access.project_role_other = data.project_role_other
        await db.commit()

    @staticmethod
    async def remove_member(db: AsyncSession, task_id: uuid.UUID, client_id: uuid.UUID) -> None:
        """Tira o acesso ao projeto; o cadastro do cliente (e os outros projetos dele) fica."""
        access = await ProjectClientService._access(db, task_id, client_id)
        await db.delete(access)
        await db.commit()

    # ── Portal: andamento do projeto ─────────────────────────────────────────
    @staticmethod
    def _feature_state(status: Optional[ProjectStatusConfig]) -> str:
        name = (status.name if status else "") or ""
        n = name.lower()
        if status is not None and (status.is_final or "conclu" in n):
            return "concluida"
        if "homolog" in n or "valid" in n:
            return "validacao"
        if "ajust" in n:
            return "ajuste"
        if status is not None and status.is_initial:
            return "a_iniciar"
        return "andamento"

    @staticmethod
    def _as_date(value) -> Optional[date]:
        """Datas do cronograma são timestamps (meia-noite local gravada em UTC)."""
        return value.date() if isinstance(value, datetime) else value

    @staticmethod
    async def portal_project_report(
        db: AsyncSession, user_id: uuid.UUID, task_id: uuid.UUID,
    ) -> ClientProjectReport:
        from sqlalchemy import text as _text

        from app.modules.projetos.service import PoSyncService, ProjectTaskService

        client = await ProjectClientService.get_by_user(db, user_id)
        if client is None:
            raise HTTPException(status_code=403, detail="Usuário sem acesso ao Portal do Cliente.")
        access = next((a for a in client.access if a.task_id == task_id), None)
        if access is None:
            raise HTTPException(status_code=404, detail="Projeto não encontrado.")
        root = (await db.execute(
            select(ProjectTask).options(selectinload(ProjectTask.status)).where(ProjectTask.id == task_id)
        )).scalar_one_or_none()
        if root is None:
            raise HTTPException(status_code=404, detail="Projeto não encontrado.")

        # Fase e execução: o mesmo cálculo do PO Sync (com cache), para o cliente ver o mesmo
        # número que a gestão.
        item = None
        try:
            data = await PoSyncService.build(db)
            item = next(
                (p for grupo in data.get("por_po", []) for p in grupo.get("projetos", [])
                 if p.get("task_id") == str(task_id)),
                None,
            )
        except Exception:  # noqa: BLE001 — sem o PO Sync, cai no cálculo local da fase
            item = None

        # Features da árvore do projeto (kanban Features) e contagem das User Stories delas.
        rows = (await db.execute(_text("""
            WITH RECURSIVE tree AS (
                SELECT id FROM project_tasks WHERE id = :root
                UNION ALL
                SELECT t.id FROM project_tasks t JOIN tree ON t.parent_task_id = tree.id
            )
            SELECT t.id, t.parent_task_id, t.title, t.start_date, t.due_date, t.status_id, f.name
              FROM project_tasks t
              JOIN tree ON tree.id = t.id
              LEFT JOIN project_status_configs s ON s.id = t.status_id
              LEFT JOIN project_funnels f ON f.id = s.funnel_id
             WHERE t.id <> :root
        """), {"root": task_id})).all()
        status_ids = {r[5] for r in rows if r[5]}
        statuses: dict[uuid.UUID, ProjectStatusConfig] = {}
        if status_ids:
            statuses = {
                s.id: s for s in (await db.execute(
                    select(ProjectStatusConfig).where(ProjectStatusConfig.id.in_(status_ids))
                )).scalars()
            }
        feature_rows = [r for r in rows if ProjectTaskService._is_feature_funnel_name(r[6])]
        us_by_feature: dict[uuid.UUID, list[str]] = {}
        for r in rows:
            if ProjectTaskService._is_user_story_funnel_name(r[6]) and r[1]:
                us_by_feature.setdefault(r[1], []).append(
                    ProjectClientService._feature_state(statuses.get(r[5]))
                )
        features = []
        for r in feature_rows:
            st = statuses.get(r[5])
            us = us_by_feature.get(r[0], [])
            features.append(ClientProjectFeature(
                title=r[2],
                status_name=st.name if st else None,
                state=ProjectClientService._feature_state(st),
                start_date=ProjectClientService._as_date(r[3]),
                due_date=ProjectClientService._as_date(r[4]),
                us_total=len(us),
                us_done=sum(1 for x in us if x == "concluida"),
            ))
        features.sort(key=lambda f: (f.due_date is None, f.due_date or f.start_date or date.max, f.title.lower()))

        stage = root.status.name if root.status else None
        po_name = item.get("po") if item else None
        if po_name is None and root.assigned_to:
            from app.modules.teamops.models import Person

            person = await db.get(Person, root.assigned_to)
            po_name = person.full_name if person else None
        return ClientProjectReport(
            task_id=root.id,
            title=root.title,
            planning_kind=root.planning_kind,
            my_role_label=project_role_label(access.project_role, access.project_role_other) or None,
            po_name=po_name,
            stage_name=stage,
            phase=(item or {}).get("fase") or PoSyncService._project_phase(root),
            in_assisted_operation=ProjectTaskService._is_assisted_operation_status(root.status),
            paused="paus" in (stage or "").lower(),
            exec_pct=(item or {}).get("exec_pct"),
            start_date=ProjectClientService._as_date(root.start_date),
            due_date=ProjectClientService._as_date(root.due_date),
            completed_at=root.completed_at,
            features=features,
            updated_at=root.updated_at,
        )
