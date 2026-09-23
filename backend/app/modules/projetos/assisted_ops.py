"""
Operação Assistida — kanban de Ocorrências (OC-0001) e Portal do Cliente.

Fluxo (spec: `.claude/invariantes.md` → Operação Assistida):
- Projeto/Programa entra na raia `is_assisted_operation` → `ensure()` garante o funil
  "Ocorrências – Operação Assistida" no container do projeto e avisa os clientes vinculados.
- Cliente vinculado abre Ocorrência no Portal (só enquanto o projeto está na raia). O card é
  um ProjectTask no funil de Ocorrências com `origin_task_id` = projeto; os campos próprios
  ficam em ProjectOccurrence.
- Cliente vê todas as ocorrências dos projetos dele, mas só interage nas que abriu.
  Comentário público do time aparece no Portal; nota interna não.
- Resposta do cliente em "Aguardando Cliente" devolve o card para "Ajustando".
- Toda mudança de raia e todo comentário notificam (cliente só do que é público).
- Projeto não vai a Concluído com ocorrência aberta; ocorrência finalizada não reabre.
"""
from __future__ import annotations

import html
import uuid
from datetime import datetime, timezone
from decimal import Decimal
from typing import Any, Optional
from zoneinfo import ZoneInfo

from fastapi import HTTPException
from sqlalchemy import func, select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.notifications import notify_persons, notify_users
from app.modules.projetos.models import (
    Project,
    ProjectAssistedOpsDev,
    ProjectClient,
    ProjectClientAccess,
    ProjectDemandType,
    ProjectFunnel,
    ProjectOccurrence,
    ProjectStatusConfig,
    ProjectTask,
    ProjectTaskComment,
    ProjectTaskStatusHistory,
)
from app.modules.projetos.schemas import (
    AssistedOpsDevResponse,
    OccurrenceForwardRelease,
    OccurrenceHomologation,
    OccurrenceComment,
    OccurrenceCommentCreate,
    OccurrenceCreate,
    OccurrenceDetail,
    OccurrenceSummary,
    OccurrenceTeamUpdate,
    PortalProject,
)
from app.modules.super_admin.models import User, UserRole

FUNNEL_NAME = "Ocorrências – Operação Assistida"

STAGES: list[dict[str, Any]] = [
    {"key": "backlog", "name": "Backlog", "color": "#64748B", "order": 0, "is_initial": True},
    {"key": "aguardando_cliente", "name": "Aguardando Cliente", "color": "#F59E0B", "order": 1},
    {"key": "ajustando", "name": "Ajustando", "color": "#3B82F6", "order": 2},
    {"key": "homologando", "name": "Homologando", "color": "#8B5CF6", "order": 3},
    {"key": "finalizado", "name": "Finalizado", "color": "#16A34A", "order": 4, "is_final": True},
    {"key": "melhoria_analise", "name": "Melhoria – Análise PO", "color": "#0D9488", "order": 5},
    {"key": "encaminhada_release", "name": "Encaminhada p/ Release", "color": "#475569", "order": 6, "is_final": True},
]

# Impacto × Abrangência → prioridade sugerida (o PO pode ajustar).
_PRIORITY = {
    ("impede", "todos"): "P1", ("impede", "setor"): "P1", ("impede", "eu"): "P2",
    ("contorno", "todos"): "P2", ("contorno", "setor"): "P3", ("contorno", "eu"): "P3",
    ("baixo", "todos"): "P3", ("baixo", "setor"): "P4", ("baixo", "eu"): "P4",
}


# Com o cliente (não conta hora do dev) e encerradas (param a contagem).
_PAUSED_KEYS = frozenset({"aguardando_cliente", "homologando"})
_CLOSED_KEYS = frozenset({"finalizado", "encaminhada_release"})


def _is_admin(user: Optional[User]) -> bool:
    return bool(user and user.role in (UserRole.SUPER_ADMIN, UserRole.COMPANY_ADMIN))


def _to_local(dt: datetime, tz: ZoneInfo) -> datetime:
    """Timestamps do sistema são UTC naive; o calendário é relógio de parede do tenant."""
    return dt.replace(tzinfo=timezone.utc).astimezone(tz).replace(tzinfo=None)


def code_label(code: int) -> str:
    return f"OC-{code:04d}"


def suggested_priority(impacto: str, abrangencia: str) -> str:
    return _PRIORITY.get((impacto, abrangencia), "P3")


def _plain_to_html(value: str) -> str:
    """Texto do cliente → HTML seguro (o comentário do time é rich text)."""
    parts = [html.escape(p).replace("\n", "<br>") for p in value.strip().split("\n\n")]
    return "".join(f"<p>{p}</p>" for p in parts if p)


class AssistedOpsService:

    # ── Bootstrap ────────────────────────────────────────────────────────────
    @staticmethod
    async def ensure(db: AsyncSession, project_id: uuid.UUID) -> dict[str, Any]:
        """Funil de Ocorrências + etapas + tipo de demanda no container. Idempotente."""
        project = await db.get(Project, project_id)
        if project is None:
            raise HTTPException(status_code=404, detail="Projeto não encontrado.")

        funnel = (await db.execute(
            select(ProjectFunnel).where(
                ProjectFunnel.project_id == project_id,
                ProjectFunnel.is_assisted_ops == True,  # noqa: E712
            ).limit(1)
        )).scalar_one_or_none()
        if funnel is None:
            max_order = (await db.execute(
                select(func.max(ProjectFunnel.order)).where(ProjectFunnel.project_id == project_id)
            )).scalar()
            funnel = ProjectFunnel(
                project_id=project_id,
                name=FUNNEL_NAME,
                description="Ocorrências abertas pelos clientes dos projetos em Operação Assistida.",
                color="#0D9488",
                order=(max_order or 0) + 1,
                is_default=False,
                is_active=True,
                is_assisted_ops=True,
            )
            db.add(funnel)
            await db.flush()
        elif not funnel.is_active:
            funnel.is_active = True

        existing = list((await db.execute(
            select(ProjectStatusConfig).where(ProjectStatusConfig.funnel_id == funnel.id)
        )).scalars().all())
        by_key = {s.assisted_stage_key: s for s in existing if s.assisted_stage_key}
        by_name = {s.name.strip().lower(): s for s in existing}
        stages: dict[str, ProjectStatusConfig] = {}
        for spec in STAGES:
            st = by_key.get(spec["key"]) or by_name.get(spec["name"].lower())
            if st is None:
                st = ProjectStatusConfig(
                    project_id=project_id,
                    funnel_id=funnel.id,
                    name=spec["name"],
                    color=spec["color"],
                    order=spec["order"],
                    is_initial=bool(spec.get("is_initial")),
                    is_final=bool(spec.get("is_final")),
                    is_active=True,
                    assisted_stage_key=spec["key"],
                )
                db.add(st)
            else:
                # A chave e o papel da etapa são do sistema; nome/cor/ordem ficam com a config.
                st.assisted_stage_key = spec["key"]
                st.is_initial = bool(spec.get("is_initial"))
                st.is_final = bool(spec.get("is_final"))
                st.is_active = True
            stages[spec["key"]] = st
        await db.flush()

        dt = (await db.execute(
            select(ProjectDemandType).where(ProjectDemandType.funnel_id == funnel.id).limit(1)
        )).scalar_one_or_none()
        if dt is None:
            dt = ProjectDemandType(
                slug=f"ocorrencia_oa_{project_id.hex[:8]}",
                name=f"Ocorrência - {project.name}"[:140],
                description="Ocorrência aberta por cliente durante a Operação Assistida.",
                funnel_id=funnel.id,
                available_for_basic=False,
                show_in_schedule=False,
                order=99,
                is_active=True,
            )
            db.add(dt)
            await db.flush()
            funnel.allowed_demand_type_ids = [str(dt.id)]
        return {"funnel": funnel, "stages": stages, "demand_type": dt}

    # ── Leitura auxiliar ─────────────────────────────────────────────────────
    @staticmethod
    async def get_occurrence(db: AsyncSession, task_id: uuid.UUID) -> Optional[ProjectOccurrence]:
        return (await db.execute(
            select(ProjectOccurrence).where(ProjectOccurrence.task_id == task_id)
        )).scalar_one_or_none()

    @staticmethod
    async def _project_in_assisted_operation(db: AsyncSession, root: ProjectTask) -> bool:
        from app.modules.projetos.service import ProjectTaskService

        status = await db.get(ProjectStatusConfig, root.status_id)
        return ProjectTaskService._is_assisted_operation_status(status)

    @staticmethod
    async def _client_for_user(db: AsyncSession, user_id: uuid.UUID) -> ProjectClient:
        from app.modules.projetos.clients import ProjectClientService

        client = await ProjectClientService.get_by_user(db, user_id)
        if client is None:
            raise HTTPException(status_code=403, detail="Usuário sem acesso ao Portal do Cliente.")
        return client

    @staticmethod
    async def _client_user_ids_for_project(db: AsyncSession, project_task_id: uuid.UUID) -> list[uuid.UUID]:
        rows = await db.execute(
            select(ProjectClient.user_id)
            .join(ProjectClientAccess, ProjectClientAccess.client_id == ProjectClient.id)
            .where(
                ProjectClientAccess.task_id == project_task_id,
                ProjectClient.is_active == True,  # noqa: E712
                ProjectClient.user_id.isnot(None),
            )
        )
        return [r[0] for r in rows.all()]

    @staticmethod
    async def _opener_user_id(db: AsyncSession, occ: ProjectOccurrence) -> Optional[uuid.UUID]:
        if occ.opened_by_client_id:
            client = await db.get(ProjectClient, occ.opened_by_client_id)
            if client and client.is_active and client.user_id:
                return client.user_id
        return occ.opened_by_user_id

    @staticmethod
    async def _team_person_ids(db: AsyncSession, task: ProjectTask, occ: ProjectOccurrence) -> list[uuid.UUID]:
        """Quem atende: responsável + PO do projeto; sem responsável, todos os devs fixos."""
        root = await db.get(ProjectTask, occ.project_task_id)
        ids = {task.assigned_to, root.assigned_to if root else None}
        if task.assigned_to is None:
            ids.update(await AssistedOpsService._dev_person_ids(db, occ.project_task_id))
        return [p for p in ids if p]

    @staticmethod
    async def _person_id_for_user(db: AsyncSession, user_id: uuid.UUID) -> Optional[uuid.UUID]:
        from app.modules.teamops.models import Person

        return (await db.execute(select(Person.id).where(Person.user_id == user_id).limit(1))).scalar_one_or_none()

    @staticmethod
    async def _is_project_po(db: AsyncSession, user: Optional[User], root_id: uuid.UUID) -> bool:
        if user is None:
            return False
        root = await db.get(ProjectTask, root_id)
        pid = await AssistedOpsService._person_id_for_user(db, user.id)
        return bool(root and pid and root.assigned_to == pid)

    # ── Devs fixos ───────────────────────────────────────────────────────────
    @staticmethod
    async def _dev_person_ids(db: AsyncSession, root_id: uuid.UUID) -> list[uuid.UUID]:
        return list((await db.execute(
            select(ProjectAssistedOpsDev.person_id).where(ProjectAssistedOpsDev.project_task_id == root_id)
        )).scalars().all())

    @staticmethod
    async def list_devs(db: AsyncSession, root_id: uuid.UUID) -> list[AssistedOpsDevResponse]:
        from app.modules.teamops.models import Person, Position

        rows = await db.execute(
            select(Person, Position.name)
            .join(ProjectAssistedOpsDev, ProjectAssistedOpsDev.person_id == Person.id)
            .outerjoin(Position, Position.id == Person.position_id)
            .where(ProjectAssistedOpsDev.project_task_id == root_id)
            .order_by(Person.full_name)
        )
        return [
            AssistedOpsDevResponse(
                person_id=p.id,
                full_name=p.full_name,
                position_name=pos,
                daily_hours=float(p.daily_hours) if p.daily_hours is not None else None,
                project_allocation_pct=float(p.project_allocation_pct) if p.project_allocation_pct is not None else None,
                assisted_ops_allocation_pct=float(p.assisted_ops_allocation_pct or 0),
                tickets_allocation_pct=max(
                    0.0, 100.0 - float(p.project_allocation_pct or 0) - float(p.assisted_ops_allocation_pct or 0)
                ),
            )
            for p, pos in rows.all()
        ]

    @staticmethod
    async def set_devs(
        db: AsyncSession,
        root_id: uuid.UUID,
        person_ids: list[uuid.UUID],
        user: User,
        allocations: Optional[list] = None,
    ) -> list[AssistedOpsDevResponse]:
        """Define os devs fixos. `allocations` = ajuste da divisão da jornada (Pessoas) feito
        pelo PO na mesma tela — só para os devs escolhidos."""
        from app.modules.teamops.models import Person
        from app.modules.teamops.service import PersonService

        root = await db.get(ProjectTask, root_id)
        if root is None or root.parent_task_id is not None:
            raise HTTPException(status_code=404, detail="Projeto não encontrado.")
        if not (_is_admin(user) or await AssistedOpsService._is_project_po(db, user, root_id)):
            raise HTTPException(status_code=403, detail="Só o PO do projeto define os desenvolvedores de atendimento.")
        wanted = set(person_ids)
        if wanted:
            found = set((await db.execute(select(Person.id).where(Person.id.in_(wanted)))).scalars().all())
            if found != wanted:
                raise HTTPException(status_code=400, detail="Pessoa não encontrada.")
        current = {
            d.person_id: d for d in (await db.execute(
                select(ProjectAssistedOpsDev).where(ProjectAssistedOpsDev.project_task_id == root_id)
            )).scalars().all()
        }
        for pid, row in current.items():
            if pid not in wanted:
                await db.delete(row)
        for pid in wanted - set(current):
            db.add(ProjectAssistedOpsDev(project_task_id=root_id, person_id=pid, created_by=user.id))
        for alloc in allocations or []:
            if alloc.person_id not in wanted:
                continue
            person = await db.get(Person, alloc.person_id)
            person.project_allocation_pct = alloc.project_allocation_pct
            person.assisted_ops_allocation_pct = alloc.assisted_ops_allocation_pct
            PersonService.assert_allocation_split(person)
            person.updated_at = datetime.utcnow()
        await db.commit()
        return await AssistedOpsService.list_devs(db, root_id)

    # ── Horas úteis ──────────────────────────────────────────────────────────
    @staticmethod
    async def _calendar(db: AsyncSession):
        from app.modules.teamops.calendar import load_calendar
        from app.modules.teamops.models import WorkCalendar

        cal = await load_calendar(db)
        tz_name = (await db.execute(select(WorkCalendar.timezone).limit(1))).scalar_one_or_none()
        try:
            tz = ZoneInfo(tz_name or "America/Maceio")
        except Exception:  # noqa: BLE001
            tz = ZoneInfo("America/Maceio")
        return cal, tz

    @staticmethod
    async def _active_intervals(
        db: AsyncSession, task: ProjectTask, occ: ProjectOccurrence
    ) -> list[tuple[datetime, datetime]]:
        """Intervalos (UTC) em que a ocorrência estava com o time: do 1º "Assumir" em diante,
        fora de Aguardando Cliente/Homologando, até encerrar."""
        if occ.assumed_at is None:
            return []
        hist = list((await db.execute(
            select(ProjectTaskStatusHistory.moved_at, ProjectTaskStatusHistory.to_status_id)
            .where(ProjectTaskStatusHistory.task_id == task.id)
            .order_by(ProjectTaskStatusHistory.moved_at.asc())
        )).all())
        status_ids = {sid for _t, sid in hist if sid} | {task.status_id}
        keys = {
            s.id: s.assisted_stage_key for s in (await db.execute(
                select(ProjectStatusConfig).where(ProjectStatusConfig.id.in_(status_ids))
            )).scalars().all()
        }
        events = [(t, keys.get(sid)) for t, sid in hist if t is not None]
        if not events:
            events = [(occ.created_at, keys.get(task.status_id))]
        now = datetime.utcnow()
        out: list[tuple[datetime, datetime]] = []
        for i, (start, key) in enumerate(events):
            if key in _CLOSED_KEYS:
                break
            end = events[i + 1][0] if i + 1 < len(events) else now
            start = max(start, occ.assumed_at)
            if key in _PAUSED_KEYS or end <= start:
                continue
            out.append((start, end))
        return out

    @staticmethod
    async def compute_worked_hours(db: AsyncSession, task: ProjectTask, occ: ProjectOccurrence) -> Optional[float]:
        """Horas úteis desde o 1º "Assumir", pausando com o cliente e parando ao encerrar."""
        if occ.assumed_at is None:
            return None
        intervals = await AssistedOpsService._active_intervals(db, task, occ)
        cal, tz = await AssistedOpsService._calendar(db)
        total = sum(cal.working_hours_between(_to_local(a, tz), _to_local(b, tz)) for a, b in intervals)
        return round(total, 2)

    @staticmethod
    async def worked_by_day(
        db: AsyncSession,
        person_ids: Optional[set[uuid.UUID]],
        date_from,
        date_to,
    ) -> dict[tuple[uuid.UUID, Any], list[tuple[ProjectTask, ProjectOccurrence, float]]]:
        """Horas úteis de ocorrência por (pessoa, dia local) — alimenta a fatia Operação
        Assistida da Capacidade. Atribui ao responsável atual da ocorrência."""
        from datetime import date as _date, time as _time, timedelta as _td

        if (await db.execute(text("SELECT to_regclass('project_occurrences')"))).scalar() is None:
            return {}
        q = (
            select(ProjectOccurrence, ProjectTask)
            .join(ProjectTask, ProjectTask.id == ProjectOccurrence.task_id)
            .where(ProjectOccurrence.assumed_at.isnot(None), ProjectTask.assigned_to.isnot(None))
        )
        if person_ids is not None:
            if not person_ids:
                return {}
            q = q.where(ProjectTask.assigned_to.in_(person_ids))
        pairs = (await db.execute(q)).all()
        if not pairs:
            return {}
        cal, tz = await AssistedOpsService._calendar(db)
        out: dict[tuple[uuid.UUID, _date], list] = {}
        for occ, task in pairs:
            for a, b in await AssistedOpsService._active_intervals(db, task, occ):
                la, lb = _to_local(a, tz), _to_local(b, tz)
                d = max(la.date(), date_from)
                while d <= min(lb.date(), date_to):
                    day_a = max(la, datetime.combine(d, _time.min))
                    day_b = min(lb, datetime.combine(d + _td(days=1), _time.min))
                    h = cal.working_hours_between(day_a, day_b) if day_b > day_a else 0.0
                    if h > 0:
                        out.setdefault((task.assigned_to, d), []).append((task, occ, round(h, 2)))
                    d += _td(days=1)
        return out

    # ── Movimento interno (cliente, assumir, homologar, melhoria) ────────────
    @staticmethod
    async def _move(
        db: AsyncSession,
        task: ProjectTask,
        target: ProjectStatusConfig,
        actor_user_id: Optional[uuid.UUID],
        source: str,
        notify: bool = True,
    ) -> None:
        from app.modules.projetos.service import ProjectTaskService

        current = await db.get(ProjectStatusConfig, task.status_id)
        if current is not None and current.id == target.id:
            return
        await ProjectTaskService._record_status_move(
            db, task, from_status=current, to_status=target, moved_by=actor_user_id, source=source,
        )
        task.status_id = target.id
        task.status_entered_at = datetime.utcnow()
        task.completed_at = datetime.utcnow() if target.is_final else None
        task.updated_at = datetime.utcnow()
        await db.flush()
        if target.is_final:
            await AssistedOpsService._freeze_hours(db, task)
        if notify:
            await AssistedOpsService.after_occurrence_move(db, task, current, target, actor_user_id)

    @staticmethod
    async def _freeze_hours(db: AsyncSession, task: ProjectTask) -> None:
        occ = await AssistedOpsService.get_occurrence(db, task.id)
        if occ is None:
            return
        hours = await AssistedOpsService.compute_worked_hours(db, task, occ)
        if hours is not None:
            occ.worked_hours = Decimal(str(hours))
            task.actual_hours = Decimal(str(hours))

    # ── Serialização ─────────────────────────────────────────────────────────
    @staticmethod
    async def _summaries(
        db: AsyncSession,
        pairs: list[tuple[ProjectOccurrence, ProjectTask]],
        viewer_client: Optional[ProjectClient] = None,
    ) -> list[OccurrenceSummary]:
        from app.modules.teamops.models import Person

        status_ids = {t.status_id for _o, t in pairs}
        statuses = {
            s.id: s for s in (await db.execute(
                select(ProjectStatusConfig).where(ProjectStatusConfig.id.in_(status_ids))
            )).scalars().all()
        } if status_ids else {}
        root_ids = {o.project_task_id for o, _t in pairs}
        roots = {
            r[0]: r[1] for r in (await db.execute(
                select(ProjectTask.id, ProjectTask.title).where(ProjectTask.id.in_(root_ids))
            )).all()
        } if root_ids else {}
        client_ids = {o.opened_by_client_id for o, _t in pairs if o.opened_by_client_id}
        clients = {
            c.id: c.full_name for c in (await db.execute(
                select(ProjectClient).where(ProjectClient.id.in_(client_ids))
            )).scalars().all()
        } if client_ids else {}
        person_ids = {t.assigned_to for _o, t in pairs if t.assigned_to}
        persons = {
            r[0]: r[1] for r in (await db.execute(
                select(Person.id, Person.full_name).where(Person.id.in_(person_ids))
            )).all()
        } if person_ids else {}

        out: list[OccurrenceSummary] = []
        for o, t in pairs:
            st = statuses.get(t.status_id)
            mine = bool(viewer_client and o.opened_by_client_id == viewer_client.id)
            closed = bool(st and st.is_final)
            out.append(OccurrenceSummary(
                task_id=t.id,
                project_id=t.project_id,
                code=o.code,
                code_label=code_label(o.code),
                title=t.title,
                tipo=o.tipo,
                prioridade=o.prioridade,
                impacto=o.impacto,
                abrangencia=o.abrangencia,
                stage_key=st.assisted_stage_key if st else None,
                stage_name=st.name if st else None,
                is_closed=closed,
                project_task_id=o.project_task_id,
                project_title=roots.get(o.project_task_id),
                opened_by_name=clients.get(o.opened_by_client_id) if o.opened_by_client_id else None,
                opened_by_me=mine,
                can_interact=mine and not closed,
                assignee_name=persons.get(t.assigned_to) if t.assigned_to else None,
                assumed_at=o.assumed_at,
                worked_hours=float(o.worked_hours) if o.worked_hours is not None else None,
                nps_score=o.nps_score,
                created_at=o.created_at,
                updated_at=t.updated_at,
            ))
        return out

    @staticmethod
    async def _detail(
        db: AsyncSession,
        occ: ProjectOccurrence,
        task: ProjectTask,
        viewer_client: Optional[ProjectClient],
        viewer_user: Optional[User] = None,
    ) -> OccurrenceDetail:
        summary = (await AssistedOpsService._summaries(db, [(occ, task)], viewer_client))[0]
        for_client = viewer_client is not None
        if occ.worked_hours is None:
            summary.worked_hours = await AssistedOpsService.compute_worked_hours(db, task, occ)
        can_assume = False
        if not for_client and viewer_user is not None and not summary.is_closed:
            pid = await AssistedOpsService._person_id_for_user(db, viewer_user.id)
            if pid is not None and pid != task.assigned_to:
                can_assume = (
                    pid in await AssistedOpsService._dev_person_ids(db, occ.project_task_id)
                    or await AssistedOpsService._is_project_po(db, viewer_user, occ.project_task_id)
                    or _is_admin(viewer_user)
                )
        release_titles = {}
        rel_ids = [i for i in (occ.release_project_task_id, occ.release_item_task_id) if i]
        if rel_ids:
            release_titles = {
                r[0]: r[1] for r in (await db.execute(
                    select(ProjectTask.id, ProjectTask.title).where(ProjectTask.id.in_(rel_ids))
                )).all()
            }

        q = select(ProjectTaskComment).where(ProjectTaskComment.task_id == task.id)
        if for_client:
            q = q.where(ProjectTaskComment.visibility == "public")
        comments = list((await db.execute(q.order_by(ProjectTaskComment.created_at.asc()))).scalars().all())
        author_ids = {c.author_id for c in comments if c.author_id}
        authors = {
            u.id: u.full_name for u in (await db.execute(
                select(User).where(User.id.in_(author_ids))
            )).scalars().all()
        } if author_ids else {}
        client_user_ids = set((await db.execute(
            select(ProjectClient.user_id).where(ProjectClient.user_id.in_(author_ids))
        )).scalars().all()) if author_ids else set()

        hist = list((await db.execute(
            select(ProjectTaskStatusHistory)
            .where(ProjectTaskStatusHistory.task_id == task.id)
            .order_by(ProjectTaskStatusHistory.moved_at.asc())
        )).scalars().all())

        return OccurrenceDetail(
            **summary.model_dump(),
            description=task.description,
            passos=occ.passos,
            esperado=occ.esperado,
            funcionalidade=occ.funcionalidade,
            anexos=task.anexos,
            solucao=occ.solucao,
            classificacao=None if for_client else occ.classificacao,
            causa_raiz=None if for_client else occ.causa_raiz,
            homologated_at=occ.homologated_at,
            nps_comment=occ.nps_comment,
            rejection_count=occ.rejection_count or 0,
            finalized_by_team=bool(occ.finalized_by_team),
            release_project_title=release_titles.get(occ.release_project_task_id),
            release_item_title=None if for_client else release_titles.get(occ.release_item_task_id),
            can_assume=can_assume,
            comments=[
                OccurrenceComment(
                    id=c.id,
                    author_name=authors.get(c.author_id) if c.author_id else "Sistema",
                    from_client=bool(c.author_id and c.author_id in client_user_ids),
                    content=c.content,
                    anexos=c.anexos,
                    created_at=c.created_at,
                )
                for c in comments
                if not (for_client and c.author_id is None)
            ],
            history=[
                {"stage_name": h.to_status_name, "moved_at": h.moved_at.isoformat() if h.moved_at else None}
                for h in hist
            ],
        )

    # ── Portal do Cliente ────────────────────────────────────────────────────
    @staticmethod
    async def portal_projects(db: AsyncSession, user_id: uuid.UUID) -> list[PortalProject]:
        from app.modules.projetos.clients import ProjectClientService

        client = await AssistedOpsService._client_for_user(db, user_id)
        refs = await ProjectClientService.portal_projects(db, user_id)
        task_ids = [r.task_id for r in refs]
        in_oa: set[uuid.UUID] = set()
        open_counts: dict[uuid.UUID, int] = {}
        if task_ids:
            roots = list((await db.execute(select(ProjectTask).where(ProjectTask.id.in_(task_ids)))).scalars().all())
            for root in roots:
                if await AssistedOpsService._project_in_assisted_operation(db, root):
                    in_oa.add(root.id)
            rows = await db.execute(
                select(ProjectOccurrence.project_task_id, func.count())
                .join(ProjectTask, ProjectTask.id == ProjectOccurrence.task_id)
                .join(ProjectStatusConfig, ProjectStatusConfig.id == ProjectTask.status_id)
                .where(ProjectOccurrence.project_task_id.in_(task_ids), ProjectStatusConfig.is_final == False)  # noqa: E712
                .group_by(ProjectOccurrence.project_task_id)
            )
            open_counts = {r[0]: r[1] for r in rows.all()}
        _ = client
        return [
            PortalProject(
                **r.model_dump(),
                accepts_occurrences=r.task_id in in_oa,
                open_occurrences=open_counts.get(r.task_id, 0),
            )
            for r in refs
        ]

    @staticmethod
    async def portal_list(
        db: AsyncSession,
        user_id: uuid.UUID,
        project_task_id: Optional[uuid.UUID] = None,
        mine: bool = False,
    ) -> list[OccurrenceSummary]:
        client = await AssistedOpsService._client_for_user(db, user_id)
        allowed = {a.task_id for a in client.access}
        if project_task_id is not None:
            if project_task_id not in allowed:
                raise HTTPException(status_code=404, detail="Projeto não encontrado.")
            allowed = {project_task_id}
        if not allowed:
            return []
        q = (
            select(ProjectOccurrence, ProjectTask)
            .join(ProjectTask, ProjectTask.id == ProjectOccurrence.task_id)
            .where(ProjectOccurrence.project_task_id.in_(allowed))
        )
        if mine:
            q = q.where(ProjectOccurrence.opened_by_client_id == client.id)
        pairs = [(o, t) for o, t in (await db.execute(q.order_by(ProjectOccurrence.code.desc()))).all()]
        return await AssistedOpsService._summaries(db, pairs, client)

    @staticmethod
    async def _portal_get(
        db: AsyncSession, client: ProjectClient, task_id: uuid.UUID
    ) -> tuple[ProjectOccurrence, ProjectTask]:
        occ = await AssistedOpsService.get_occurrence(db, task_id)
        if occ is None or occ.project_task_id not in {a.task_id for a in client.access}:
            raise HTTPException(status_code=404, detail="Ocorrência não encontrada.")
        task = await db.get(ProjectTask, task_id)
        return occ, task

    @staticmethod
    async def portal_detail(db: AsyncSession, user_id: uuid.UUID, task_id: uuid.UUID) -> OccurrenceDetail:
        client = await AssistedOpsService._client_for_user(db, user_id)
        occ, task = await AssistedOpsService._portal_get(db, client, task_id)
        return await AssistedOpsService._detail(db, occ, task, client)

    @staticmethod
    async def portal_open(db: AsyncSession, user: User, data: OccurrenceCreate) -> OccurrenceDetail:
        client = await AssistedOpsService._client_for_user(db, user.id)
        if data.project_task_id not in {a.task_id for a in client.access}:
            raise HTTPException(status_code=404, detail="Projeto não encontrado.")
        root = await db.get(ProjectTask, data.project_task_id)
        if root is None:
            raise HTTPException(status_code=404, detail="Projeto não encontrado.")
        if not await AssistedOpsService._project_in_assisted_operation(db, root):
            raise HTTPException(
                status_code=400,
                detail="Este projeto não está em Operação Assistida — não é possível abrir ocorrências.",
            )
        flow = await AssistedOpsService.ensure(db, root.project_id)
        backlog = flow["stages"]["backlog"]
        code = int((await db.execute(text("SELECT nextval('project_occurrence_code_seq')"))).scalar())

        task = ProjectTask(
            project_id=root.project_id,
            status_id=backlog.id,
            demand_type_id=flow["demand_type"].id,
            origin_task_id=root.id,
            title=f"{code_label(code)} · {data.title.strip()}"[:200],
            description=data.description.strip(),
            anexos=data.anexos or None,
            created_by=user.id,
            status_entered_at=datetime.utcnow(),
        )
        db.add(task)
        await db.flush()
        occ = ProjectOccurrence(
            task_id=task.id,
            project_task_id=root.id,
            code=code,
            opened_by_client_id=client.id,
            opened_by_user_id=user.id,
            tipo=data.tipo,
            passos=(data.passos or "").strip() or None,
            esperado=(data.esperado or "").strip() or None,
            funcionalidade=(data.funcionalidade or "").strip() or None,
            impacto=data.impacto,
            abrangencia=data.abrangencia,
            prioridade=suggested_priority(data.impacto, data.abrangencia),
        )
        db.add(occ)
        db.add(ProjectTaskStatusHistory(
            task_id=task.id, to_status_id=backlog.id, to_status_name=backlog.name,
            to_funnel_name=flow["funnel"].name, moved_by=user.id, moved_at=datetime.utcnow(),
            source="client",
        ))
        await notify_persons(
            db, [root.assigned_to, *await AssistedOpsService._dev_person_ids(db, root.id)],
            f"Nova ocorrência {code_label(code)} ({occ.prioridade})",
            f"{client.full_name} abriu “{data.title.strip()}” no projeto {root.title}.",
            "project_task", task.id, exclude_user_id=user.id,
        )
        await db.commit()
        return await AssistedOpsService._detail(db, occ, task, client)

    @staticmethod
    async def portal_comment(
        db: AsyncSession, user: User, task_id: uuid.UUID, data: OccurrenceCommentCreate
    ) -> OccurrenceDetail:
        client = await AssistedOpsService._client_for_user(db, user.id)
        occ, task = await AssistedOpsService._portal_get(db, client, task_id)
        if occ.opened_by_client_id != client.id:
            raise HTTPException(status_code=403, detail="Só quem abriu a ocorrência pode interagir nela.")
        status = await db.get(ProjectStatusConfig, task.status_id)
        if status is not None and status.is_final:
            raise HTTPException(status_code=400, detail="Ocorrência encerrada — não aceita novas mensagens.")

        db.add(ProjectTaskComment(
            task_id=task.id, author_id=user.id, content=_plain_to_html(data.content),
            visibility="public", anexos=data.anexos or None,
        ))
        # Cliente respondeu a dúvida: volta para o time.
        if status is not None and status.assisted_stage_key == "aguardando_cliente":
            flow = await AssistedOpsService.ensure(db, task.project_id)
            await AssistedOpsService._move(db, task, flow["stages"]["ajustando"], user.id, "client", notify=False)
        task.updated_at = datetime.utcnow()
        await notify_persons(
            db, await AssistedOpsService._team_person_ids(db, task, occ),
            f"{code_label(occ.code)}: resposta do cliente",
            f"{client.full_name} respondeu na ocorrência “{task.title}”.",
            "project_task", task.id, exclude_user_id=user.id,
        )
        await db.commit()
        await db.refresh(task)
        return await AssistedOpsService._detail(db, occ, task, client)

    @staticmethod
    async def portal_can_read_object(db: AsyncSession, user_id: uuid.UUID, object_name: str) -> bool:
        """Anexo visível ao cliente: da própria ocorrência ou de comentário público nela."""
        client = await AssistedOpsService._client_for_user(db, user_id)
        allowed = {a.task_id for a in client.access}
        if not allowed:
            return False
        pattern = f'%"{object_name}"%'
        hit = (await db.execute(text("""
            SELECT 1 FROM project_occurrences o
              JOIN project_tasks t ON t.id = o.task_id
             WHERE o.project_task_id = ANY(CAST(:roots AS uuid[]))
               AND (CAST(t.anexos AS text) LIKE :pat
                    OR EXISTS (SELECT 1 FROM project_task_comments c
                                WHERE c.task_id = t.id AND c.visibility = 'public'
                                  AND CAST(c.anexos AS text) LIKE :pat))
             LIMIT 1
        """), {"roots": [str(r) for r in allowed], "pat": pattern})).scalar()
        return bool(hit)

    # ── Time (drawer do card) ────────────────────────────────────────────────
    @staticmethod
    async def team_detail(db: AsyncSession, task_id: uuid.UUID, user: Optional[User] = None) -> OccurrenceDetail:
        occ = await AssistedOpsService.get_occurrence(db, task_id)
        if occ is None:
            raise HTTPException(status_code=404, detail="Ocorrência não encontrada.")
        task = await db.get(ProjectTask, task_id)
        return await AssistedOpsService._detail(db, occ, task, None, user)

    @staticmethod
    async def team_update(
        db: AsyncSession, task_id: uuid.UUID, data: OccurrenceTeamUpdate, user: Optional[User] = None
    ) -> OccurrenceDetail:
        occ = await AssistedOpsService.get_occurrence(db, task_id)
        if occ is None:
            raise HTTPException(status_code=404, detail="Ocorrência não encontrada.")
        before = occ.classificacao
        for key, value in data.model_dump(exclude_unset=True).items():
            if isinstance(value, str):
                value = value.strip() or None
            if key == "prioridade" and value is None:
                continue
            setattr(occ, key, value)
        occ.updated_at = datetime.utcnow()
        # Dev classificou como melhoria: cai para o PO analisar.
        if occ.classificacao == "melhoria" and before != "melhoria":
            task = await db.get(ProjectTask, task_id)
            status = await db.get(ProjectStatusConfig, task.status_id)
            if status is not None and not status.is_final and status.assisted_stage_key != "melhoria_analise":
                flow = await AssistedOpsService.ensure(db, task.project_id)
                await AssistedOpsService._move(
                    db, task, flow["stages"]["melhoria_analise"], user.id if user else None, "user",
                )
        await db.commit()
        return await AssistedOpsService.team_detail(db, task_id, user)

    # ── Ganchos chamados por ProjectTaskService / ProjectTaskCommentService ──
    @staticmethod
    async def on_project_enters_assisted_operation(db: AsyncSession, root: ProjectTask) -> None:
        await AssistedOpsService.ensure(db, root.project_id)
        await notify_users(
            db, await AssistedOpsService._client_user_ids_for_project(db, root.id),
            "Projeto em Operação Assistida",
            f"O projeto {root.title} entrou em Operação Assistida. Você já pode abrir ocorrências no Portal do Cliente.",
            "occurrence_project", root.id,
        )

    @staticmethod
    async def assert_project_can_conclude(db: AsyncSession, root: ProjectTask) -> None:
        open_count = (await db.execute(
            select(func.count())
            .select_from(ProjectOccurrence)
            .join(ProjectTask, ProjectTask.id == ProjectOccurrence.task_id)
            .join(ProjectStatusConfig, ProjectStatusConfig.id == ProjectTask.status_id)
            .where(ProjectOccurrence.project_task_id == root.id, ProjectStatusConfig.is_final == False)  # noqa: E712
        )).scalar() or 0
        if open_count:
            raise HTTPException(
                status_code=400,
                detail=f"O projeto tem {open_count} ocorrência(s) aberta(s) na Operação Assistida. "
                       "Finalize-as antes de concluir.",
            )

    @staticmethod
    async def before_occurrence_move(
        db: AsyncSession, task: ProjectTask, source_status, target_status, current_user: Optional[User] = None
    ) -> None:
        """Movimento do time (kanban/drawer). Cliente move por `_move` (resposta, homologação).

        - encerrada não reabre; só se move dentro do kanban de Ocorrências;
        - Finalizado é a homologação do cliente — o time só finaliza sendo PO do projeto
          ou admin (ex.: cliente não respondeu), e fica registrado;
        - Encaminhada p/ Release só pela ação "Encaminhar para Release" (cria a Feature/US).
        """
        occ = await AssistedOpsService.get_occurrence(db, task.id)
        if occ is None:
            return
        if source_status is not None and source_status.is_final:
            raise HTTPException(status_code=400, detail="Ocorrência encerrada não pode ser reaberta.")
        key = getattr(target_status, "assisted_stage_key", None)
        if not key:
            raise HTTPException(status_code=400, detail="Ocorrência só se move dentro do kanban de Ocorrências.")
        if key == "encaminhada_release":
            raise HTTPException(
                status_code=400,
                detail="Use “Encaminhar para Release” no card: o PO escolhe o projeto e a Feature/US é criada.",
            )
        if key == "finalizado":
            if not (_is_admin(current_user) or await AssistedOpsService._is_project_po(db, current_user, occ.project_task_id)):
                raise HTTPException(
                    status_code=403,
                    detail="Quem finaliza é o cliente, ao homologar no Portal. Mova para Homologando.",
                )
            occ.finalized_by_team = True
            db.add(ProjectTaskComment(
                task_id=task.id, author_id=current_user.id if current_user else None, visibility="public",
                content="<p>Ocorrência finalizada pelo PO do projeto sem homologação do cliente.</p>",
            ))

    @staticmethod
    async def after_occurrence_move(
        db: AsyncSession, task: ProjectTask, source_status, target_status, actor_user_id: Optional[uuid.UUID]
    ) -> None:
        occ = await AssistedOpsService.get_occurrence(db, task.id)
        if occ is None:
            return
        if target_status is not None and target_status.is_final and occ.worked_hours is None:
            await AssistedOpsService._freeze_hours(db, task)
        label = code_label(occ.code)
        key = getattr(target_status, "assisted_stage_key", None)
        if key == "aguardando_cliente":
            client_title = f"{label}: o time precisa da sua resposta"
            client_body = f"A ocorrência “{task.title}” está aguardando você. Responda no Portal do Cliente."
        elif key == "homologando":
            client_title = f"{label}: pronta para homologar"
            client_body = f"A ocorrência “{task.title}” foi ajustada. Teste e homologue no Portal do Cliente."
        elif key == "encaminhada_release":
            client_title = f"{label}: encaminhada como melhoria"
            client_body = (
                f"A ocorrência “{task.title}” foi classificada como melhoria e não será atendida na "
                "Operação Assistida. Ela seguirá para um projeto de Release."
            )
        else:
            client_title = f"{label}: {target_status.name}"
            client_body = f"A ocorrência “{task.title}” passou para {target_status.name}."
        opener = await AssistedOpsService._opener_user_id(db, occ)
        await notify_users(db, [opener], client_title, client_body, "occurrence", task.id, exclude_user_id=actor_user_id)
        await notify_persons(
            db, await AssistedOpsService._team_person_ids(db, task, occ),
            f"{label}: {target_status.name}", f"A ocorrência “{task.title}” passou para {target_status.name}.",
            "project_task", task.id, exclude_user_id=actor_user_id,
        )

    @staticmethod
    async def after_team_comment(
        db: AsyncSession, task_id: uuid.UUID, visibility: str, actor_user_id: Optional[uuid.UUID]
    ) -> None:
        occ = await AssistedOpsService.get_occurrence(db, task_id)
        if occ is None:
            return
        task = await db.get(ProjectTask, task_id)
        label = code_label(occ.code)
        if visibility == "public":
            await notify_users(
                db, [await AssistedOpsService._opener_user_id(db, occ)],
                f"{label}: nova mensagem do time", f"Há uma nova mensagem na ocorrência “{task.title}”.",
                "occurrence", task.id, exclude_user_id=actor_user_id,
            )
        await notify_persons(
            db, await AssistedOpsService._team_person_ids(db, task, occ),
            f"{label}: novo comentário", f"Novo comentário na ocorrência “{task.title}”.",
            "project_task", task.id, exclude_user_id=actor_user_id,
        )

    # ── Atendimento: assumir ─────────────────────────────────────────────────
    @staticmethod
    async def assume(db: AsyncSession, task_id: uuid.UUID, user: User) -> OccurrenceDetail:
        """Dev fixo (ou PO do projeto/admin) assume. Pode tomar uma já assumida por outro.
        O 1º assumir inicia a contagem de horas úteis; no Backlog, já vai para Ajustando."""
        from app.modules.teamops.models import Person

        occ = await AssistedOpsService.get_occurrence(db, task_id)
        if occ is None:
            raise HTTPException(status_code=404, detail="Ocorrência não encontrada.")
        task = await db.get(ProjectTask, task_id)
        status = await db.get(ProjectStatusConfig, task.status_id)
        if status is not None and status.is_final:
            raise HTTPException(status_code=400, detail="Ocorrência encerrada.")
        pid = await AssistedOpsService._person_id_for_user(db, user.id)
        if pid is None:
            raise HTTPException(status_code=400, detail="Seu login não está vinculado a uma Pessoa (TeamOps).")
        allowed = (
            pid in await AssistedOpsService._dev_person_ids(db, occ.project_task_id)
            or await AssistedOpsService._is_project_po(db, user, occ.project_task_id)
            or _is_admin(user)
        )
        if not allowed:
            raise HTTPException(status_code=403, detail="Só os desenvolvedores de atendimento do projeto assumem ocorrências.")
        if task.assigned_to == pid:
            return await AssistedOpsService.team_detail(db, task_id, user)

        previous = task.assigned_to
        me = await db.get(Person, pid)
        task.assigned_to = pid
        if occ.assumed_at is None:
            occ.assumed_at = datetime.utcnow()
        prev_name = (await db.get(Person, previous)).full_name if previous else None
        db.add(ProjectTaskComment(
            task_id=task.id, author_id=user.id, visibility="internal",
            content=f"<p>{html.escape(me.full_name)} assumiu a ocorrência"
                    + (f" (antes com {html.escape(prev_name)})" if prev_name else "") + ".</p>",
        ))
        label = code_label(occ.code)
        if previous:
            await notify_persons(
                db, [previous], f"{label}: assumida por {me.full_name}",
                f"A ocorrência “{task.title}” passou para {me.full_name}.", "project_task", task.id,
                exclude_user_id=user.id,
            )
        await notify_users(
            db, [await AssistedOpsService._opener_user_id(db, occ)],
            f"{label}: em atendimento", f"{me.full_name} está cuidando da sua ocorrência “{task.title}”.",
            "occurrence", task.id, exclude_user_id=user.id,
        )
        if status is not None and status.assisted_stage_key == "backlog":
            flow = await AssistedOpsService.ensure(db, task.project_id)
            await AssistedOpsService._move(db, task, flow["stages"]["ajustando"], user.id, "user", notify=False)
        task.updated_at = datetime.utcnow()
        await db.commit()
        return await AssistedOpsService.team_detail(db, task_id, user)

    # ── Homologação pelo cliente ─────────────────────────────────────────────
    @staticmethod
    async def portal_homologate(
        db: AsyncSession, user: User, task_id: uuid.UUID, data: OccurrenceHomologation
    ) -> OccurrenceDetail:
        client = await AssistedOpsService._client_for_user(db, user.id)
        occ, task = await AssistedOpsService._portal_get(db, client, task_id)
        if occ.opened_by_client_id != client.id:
            raise HTTPException(status_code=403, detail="Só quem abriu a ocorrência pode homologá-la.")
        status = await db.get(ProjectStatusConfig, task.status_id)
        if status is None or status.assisted_stage_key != "homologando":
            raise HTTPException(status_code=400, detail="A ocorrência não está em homologação.")
        flow = await AssistedOpsService.ensure(db, task.project_id)
        comment = (data.comment or "").strip()
        label = code_label(occ.code)
        if data.approve:
            if data.nps_score is None:
                raise HTTPException(status_code=400, detail="Dê uma nota de 0 a 10 para o atendimento.")
            occ.nps_score = data.nps_score
            occ.nps_comment = comment or None
            occ.homologated_at = datetime.utcnow()
            text_html = f"<p><strong>Homologação aprovada</strong> — nota {data.nps_score}/10.</p>"
            if comment:
                text_html += _plain_to_html(comment)
            db.add(ProjectTaskComment(task_id=task.id, author_id=user.id, content=text_html, visibility="public"))
            await AssistedOpsService._move(db, task, flow["stages"]["finalizado"], user.id, "client", notify=False)
            title, body = f"{label}: homologada (NPS {data.nps_score})", f"{client.full_name} aprovou “{task.title}”."
        else:
            if len(comment) < 5:
                raise HTTPException(status_code=400, detail="Conte o que ainda não está certo (mín. 5 caracteres).")
            occ.rejection_count = (occ.rejection_count or 0) + 1
            db.add(ProjectTaskComment(
                task_id=task.id, author_id=user.id, visibility="public",
                content="<p><strong>Homologação reprovada.</strong></p>" + _plain_to_html(comment),
            ))
            await AssistedOpsService._move(db, task, flow["stages"]["ajustando"], user.id, "client", notify=False)
            title, body = f"{label}: reprovada na homologação", f"{client.full_name} reprovou “{task.title}”: {comment[:200]}"
        await notify_persons(
            db, await AssistedOpsService._team_person_ids(db, task, occ), title, body,
            "project_task", task.id, exclude_user_id=user.id,
        )
        await db.commit()
        await db.refresh(task)
        return await AssistedOpsService._detail(db, occ, task, client)

    # ── Melhoria → projeto de Release ────────────────────────────────────────
    @staticmethod
    async def forward_to_release(
        db: AsyncSession, task_id: uuid.UUID, data: OccurrenceForwardRelease, user: User
    ) -> OccurrenceDetail:
        from app.modules.projetos.schemas import ProjectTaskCreate
        from app.modules.projetos.service import ProjectTaskService

        occ = await AssistedOpsService.get_occurrence(db, task_id)
        if occ is None:
            raise HTTPException(status_code=404, detail="Ocorrência não encontrada.")
        task = await db.get(ProjectTask, task_id)
        status = await db.get(ProjectStatusConfig, task.status_id)
        if status is None or status.assisted_stage_key != "melhoria_analise":
            raise HTTPException(status_code=400, detail="Só ocorrências em “Melhoria – Análise PO” vão para Release.")
        if not (_is_admin(user) or await AssistedOpsService._is_project_po(db, user, occ.project_task_id)):
            raise HTTPException(status_code=403, detail="Só o PO do projeto encaminha melhorias para Release.")
        origin_root = await db.get(ProjectTask, occ.project_task_id)

        async def _type(slug: str) -> ProjectDemandType:
            dt = (await db.execute(select(ProjectDemandType).where(ProjectDemandType.slug == slug).limit(1))).scalar_one_or_none()
            if dt is None or dt.funnel_id is None:
                raise HTTPException(status_code=400, detail=f"Tipo de demanda '{slug}' não configurado.")
            return dt

        async def _initial_status(funnel_id: uuid.UUID) -> ProjectStatusConfig:
            st = (await db.execute(
                select(ProjectStatusConfig)
                .where(ProjectStatusConfig.funnel_id == funnel_id, ProjectStatusConfig.is_active == True)  # noqa: E712
                .order_by(ProjectStatusConfig.is_initial.desc(), ProjectStatusConfig.order.asc())
                .limit(1)
            )).scalar_one_or_none()
            if st is None:
                raise HTTPException(status_code=400, detail="Kanban sem etapas.")
            return st

        # 1) projeto de Release: existente (card-raiz de Projetos e Programas) ou novo.
        if data.release_task_id:
            release = await db.get(ProjectTask, data.release_task_id)
            funnel = None
            if release is not None:
                rst = await db.get(ProjectStatusConfig, release.status_id)
                funnel = await db.get(ProjectFunnel, rst.funnel_id) if rst else None
            if release is None or release.parent_task_id is not None or not (
                funnel and ProjectTaskService._is_planning_funnel_name(funnel.name)
            ):
                raise HTTPException(status_code=400, detail="Escolha um projeto do kanban Projetos e Programas.")
        elif data.new_release_title:
            planning_type = await _type("item_planejamento")
            release = await ProjectTaskService.create(
                db, task.project_id,
                ProjectTaskCreate(
                    status_id=(await _initial_status(planning_type.funnel_id)).id,
                    demand_type_id=planning_type.id,
                    title=data.new_release_title.strip(),
                    description=f"Projeto de Release para melhorias da Operação Assistida de {origin_root.title}.",
                    assigned_to=origin_root.assigned_to,
                ),
                current_user_id=user.id, current_user=user, enforce_funnel_access=False,
            )
            release.planning_kind = "projeto"
        else:
            raise HTTPException(status_code=400, detail="Escolha o projeto de Release ou informe o nome de um novo.")

        # 2) Feature (filha do Release) ou US (filha de uma Feature do Release).
        if data.item_kind == "user_story":
            parent = await db.get(ProjectTask, data.parent_feature_id) if data.parent_feature_id else None
            if parent is None or parent.parent_task_id != release.id:
                raise HTTPException(status_code=400, detail="Para User Story, escolha a Feature do projeto de Release.")
            item_type = await _type("user_story")
        else:
            parent = release
            item_type = await _type("feature")
        clean_title = task.title.split(" · ", 1)[-1]
        item = await ProjectTaskService.create(
            db, task.project_id,
            ProjectTaskCreate(
                status_id=(await _initial_status(item_type.funnel_id)).id,
                demand_type_id=item_type.id,
                parent_task_id=parent.id,
                title=clean_title[:200],
                description=(
                    f"Melhoria vinda da ocorrência {code_label(occ.code)} ({origin_root.title}).\n\n"
                    f"{task.description or ''}"
                ).strip(),
            ),
            current_user_id=user.id, current_user=user, enforce_funnel_access=False,
        )
        occ.release_project_task_id = release.id
        occ.release_item_task_id = item.id
        db.add(ProjectTaskComment(
            task_id=task.id, author_id=user.id, visibility="public",
            content=f"<p>Melhoria encaminhada para o projeto <strong>{html.escape(release.title)}</strong>. "
                    "Ela não será atendida na Operação Assistida.</p>",
        ))
        flow = await AssistedOpsService.ensure(db, task.project_id)
        await AssistedOpsService._move(db, task, flow["stages"]["encaminhada_release"], user.id, "user")
        await db.commit()
        return await AssistedOpsService.team_detail(db, task_id, user)

    # ── SLA: 1h útil sem ninguém assumir → avisa o PO ────────────────────────
    @staticmethod
    async def scan_unassigned(db: AsyncSession) -> int:
        rows = list((await db.execute(
            select(ProjectOccurrence, ProjectTask)
            .join(ProjectTask, ProjectTask.id == ProjectOccurrence.task_id)
            .join(ProjectStatusConfig, ProjectStatusConfig.id == ProjectTask.status_id)
            .where(
                ProjectOccurrence.assumed_at.is_(None),
                ProjectOccurrence.unassigned_alert_at.is_(None),
                ProjectStatusConfig.is_final == False,  # noqa: E712
            )
        )).all())
        if not rows:
            return 0
        cal, tz = await AssistedOpsService._calendar(db)
        now = datetime.utcnow()
        alerted = 0
        for occ, task in rows:
            if cal.working_hours_between(_to_local(occ.created_at, tz), _to_local(now, tz)) < 1.0:
                continue
            root = await db.get(ProjectTask, occ.project_task_id)
            await notify_persons(
                db, [root.assigned_to if root else None, *await AssistedOpsService._dev_person_ids(db, occ.project_task_id)],
                f"{code_label(occ.code)} sem responsável há 1h útil ({occ.prioridade})",
                f"Ninguém assumiu a ocorrência “{task.title}” do projeto {root.title if root else ''}.",
                "project_task", task.id,
            )
            occ.unassigned_alert_at = now
            alerted += 1
        await db.commit()
        return alerted

    @staticmethod
    async def release_candidates(db: AsyncSession, scope: Optional[set[uuid.UUID]] = None) -> list[dict]:
        """Projetos (cards-raiz de Projetos e Programas, não encerrados) e suas Features —
        destino de melhoria encaminhada."""
        from app.modules.projetos.service import ProjectTaskService

        rows = (await db.execute(
            select(ProjectTask.id, ProjectTask.title, ProjectStatusConfig.name, ProjectFunnel.name)
            .join(ProjectStatusConfig, ProjectStatusConfig.id == ProjectTask.status_id)
            .join(ProjectFunnel, ProjectFunnel.id == ProjectStatusConfig.funnel_id)
            .where(ProjectTask.parent_task_id.is_(None), ProjectStatusConfig.is_final == False)  # noqa: E712
            .order_by(ProjectTask.title)
        )).all()
        roots = [
            r for r in rows
            if ProjectTaskService._is_planning_funnel_name(r[3]) and (scope is None or r[0] in scope)
        ]
        feature_type = (await db.execute(
            select(ProjectDemandType.id).where(ProjectDemandType.slug == "feature").limit(1)
        )).scalar_one_or_none()
        features: dict[uuid.UUID, list[dict]] = {}
        if roots and feature_type:
            for fid, ftitle, parent in (await db.execute(
                select(ProjectTask.id, ProjectTask.title, ProjectTask.parent_task_id)
                .where(ProjectTask.parent_task_id.in_([r[0] for r in roots]), ProjectTask.demand_type_id == feature_type)
                .order_by(ProjectTask.title)
            )).all():
                features.setdefault(parent, []).append({"task_id": str(fid), "title": ftitle})
        return [
            {"task_id": str(r[0]), "title": r[1], "status_name": r[2], "features": features.get(r[0], [])}
            for r in roots
        ]

