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
    ProjectAssistedOpMeeting,
    ProjectAssistedOpsDev,
    ProjectClient,
    ProjectClientAccess,
    ProjectDemandType,
    ProjectFunnel,
    ProjectOccurrence,
    ProjectProgramClientAccess,
    ProjectStatusConfig,
    ProjectTask,
    ProjectTaskComment,
    ProjectTaskStatusHistory,
)
from app.modules.projetos.schemas import (
    AssistedOpsDevResponse,
    AssistedOpsEntrySet,
    AssistedOpsEntryState,
    AssistedOpsExtend,
    AssistedOpsPhaseSet,
    AssistedOpsPrereqItem,
    AssistedOpMeetingIn,
    AssistedOpMeetingOut,
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
    # POP 8.2.1: escalonamento para o fornecedor (N3) e para a Instância Executiva. Entrar
    # exige motivo (428 stage_reason_required). Em funil que já existe, nascem depois de `after`.
    {"key": "n3_fornecedor", "name": "N3 – Fornecedor", "color": "#EA580C", "order": 3,
     "after": "ajustando", "reason": True},
    {"key": "escalonada_ie", "name": "Escalonada à Instância Executiva", "color": "#DC2626", "order": 4,
     "after": "n3_fornecedor", "reason": True},
    {"key": "homologando", "name": "Homologando", "color": "#8B5CF6", "order": 5},
    {"key": "finalizado", "name": "Finalizado", "color": "#16A34A", "order": 6, "is_final": True},
    {"key": "melhoria_analise", "name": "Melhoria – Análise PO", "color": "#0D9488", "order": 7},
    {"key": "encaminhada_release", "name": "Encaminhada p/ Release", "color": "#475569", "order": 8, "is_final": True},
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
# Escalonada (fornecedor ou Instância Executiva): o prazo de resolução segue contando, mas não
# são horas do dev de atendimento.
_ESCALATED_KEYS = frozenset({"n3_fornecedor", "escalonada_ie"})

# POP.COR.GTD.003 (8.2.3): só correção tem criticidade e prazo-alvo de resolução. Os prazos
# são valores de referência em horas úteis, "a calibrar" pelo SLA institucional.
CRITICIDADE = {"P1": "Crítica", "P2": "Alta", "P3": "Média", "P4": "Baixa"}
SLA_RESOLUCAO_HORAS = {"P1": 4.0, "P2": 8.0, "P3": 24.0, "P4": 40.0}
_SLA_RISCO = 0.8
_MELHORIA_KEYS = frozenset({"melhoria_analise", "encaminhada_release"})
# POP 8.1.2: Operação Assistida de até 15 dias (prorrogável conforme a criticidade do projeto).
OA_MAX_DIAS = 15
# POP 5: pré-requisitos para iniciar (chave, rótulo, aceita "não se aplica").
OA_PREREQS: list[tuple[str, str, bool]] = [
    ("papeis", "Papéis e responsáveis nomeados", False),
    ("dados", "Dados migrados e validados", True),
    ("integracoes", "Integrações com legados testadas e ativas", True),
    ("homologacao", "Solução homologada", False),
    ("treinamento", "Treinamento dos usuários-chave concluído", False),
    ("canais", "Canais de suporte e ferramenta de chamados configurados", False),
    ("golive", "Go-live realizado e solução disponível em produção", False),
]


# POP 4: papéis que precisam estar nos clientes do projeto (ou do programa) para confirmar
# "Papéis e responsáveis nomeados".
OA_REQUIRED_ROLES: list[tuple[str, str]] = [
    ("dono_processo", "Dono do Processo"),
    ("sponsor", "Sponsor (Instância Executiva)"),
]

# POP 8.3.1 e 8.3.5: fases e ritos.
OA_PHASES = {1: "Estabilização intensiva", 2: "Acompanhamento assistido", 3: "Preparação para encerramento"}
MEETING_KINDS = {"diaria": "Diária", "semanal": "Semanal", "comite": "Comitê"}


def is_correction(occ) -> bool:
    """Correção = a solução não faz o que foi acordado (POP 7). Classificação do time manda;
    sem ela, vale o tipo informado na abertura."""
    if occ.classificacao:
        return occ.classificacao == "erro_confirmado"
    return occ.tipo == "erro"


def prereqs_missing(checklist: Optional[dict]) -> list[str]:
    done = checklist or {}
    return [
        label for key, label, allow_na in OA_PREREQS
        if not (done.get(key) == "sim" or (allow_na and done.get(key) == "na"))
    ]


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
        in_funnel = list(existing)
        for spec in STAGES:
            st = by_key.get(spec["key"]) or by_name.get(spec["name"].lower())
            if st is None:
                order = spec["order"]
                after = stages.get(spec.get("after") or "")
                if existing and after is not None:
                    # Funil antigo: abre espaço logo depois da etapa de referência.
                    order = (after.order or 0) + 1
                    for other in in_funnel:
                        if (other.order or 0) >= order:
                            other.order = (other.order or 0) + 1
                st = ProjectStatusConfig(
                    project_id=project_id,
                    funnel_id=funnel.id,
                    name=spec["name"],
                    color=spec["color"],
                    order=order,
                    is_initial=bool(spec.get("is_initial")),
                    is_final=bool(spec.get("is_final")),
                    is_active=True,
                    assisted_stage_key=spec["key"],
                    entry_reason_required=bool(spec.get("reason")),
                )
                db.add(st)
                in_funnel.append(st)
            else:
                # A chave e o papel da etapa são do sistema; nome/cor/ordem ficam com a config.
                st.assisted_stage_key = spec["key"]
                st.is_initial = bool(spec.get("is_initial"))
                st.is_final = bool(spec.get("is_final"))
                st.is_active = True
                if spec.get("reason"):
                    st.entry_reason_required = True
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
    async def _team_sees_all(db: AsyncSession, user_id: uuid.UUID) -> bool:
        """Equipe no "Modo Cliente" com visão de tudo (coordenação/gestão, inclui Administrativo):
        lê as ocorrências como o cliente vê, sem interagir."""
        from app.modules.projetos.program_portal import PortalPortfolioService

        scope = await PortalPortfolioService._team_scope(db, await db.get(User, user_id))
        return bool(scope and scope.get("all"))

    @staticmethod
    async def _portal_viewer(db: AsyncSession, user_id: uuid.UUID) -> tuple[Optional[ProjectClient], bool]:
        """(cadastro de cliente, equipe vê tudo). Nenhum dos dois → 403."""
        from app.modules.projetos.clients import ProjectClientService

        client = await ProjectClientService.get_by_user(db, user_id)
        team_all = await AssistedOpsService._team_sees_all(db, user_id)
        if client is None and not team_all:
            raise HTTPException(status_code=403, detail="Usuário sem acesso ao Portal do Cliente.")
        return client, team_all

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

    # ── Visibilidade das ocorrências no time ─────────────────────────────────
    @staticmethod
    async def hidden_occurrence_task_ids(db: AsyncSession, user: Optional[User]) -> set[uuid.UUID]:
        """Ocorrências que o usuário NÃO vê no kanban/card. Veem cada ocorrência: o PO do projeto,
        os devs de atendimento do projeto (definidos ao mover para a Operação Assistida) e a
        coordenação/admin (todas). Conjunto vazio = vê todas. Sem Pessoa vinculada = não vê nenhuma."""
        from app.modules.projetos.service import ProjectTaskService
        if user is None or _is_admin(user) or await ProjectTaskService._is_coordination(db, user):
            return set()
        pid = await AssistedOpsService._person_id_for_user(db, user.id)
        if pid is None:
            return set((await db.execute(select(ProjectOccurrence.task_id))).scalars().all())
        rows = await db.execute(text("""
            SELECT o.task_id FROM project_occurrences o
              JOIN project_tasks r ON r.id = o.project_task_id
             WHERE r.assigned_to IS DISTINCT FROM CAST(:pid AS uuid)
               AND NOT EXISTS (SELECT 1 FROM project_assisted_ops_devs d
                                WHERE d.project_task_id = r.id AND d.person_id = CAST(:pid AS uuid))
        """), {"pid": str(pid)})
        return {r[0] for r in rows.all()}

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
        # PO do projeto ou coordenação (Coordenador/Administrativo/Gerente — `_is_coordination`):
        # quem move o projeto para a Operação Assistida define o atendimento no próprio modal.
        from app.modules.projetos.service import ProjectTaskService
        if not (
            _is_admin(user)
            or await AssistedOpsService._is_project_po(db, user, root_id)
            or await ProjectTaskService._is_coordination(db, user)
        ):
            raise HTTPException(
                status_code=403,
                detail="Só o PO do projeto ou a coordenação definem os desenvolvedores de atendimento.",
            )
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
        fora de Aguardando Cliente/Homologando e das raias de escalonamento (N3/IE), até encerrar."""
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
            if key in _PAUSED_KEYS or key in _ESCALATED_KEYS or end <= start:
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
        cal_tz = await AssistedOpsService._calendar(db) if any(is_correction(o) for o, _t in pairs) else None
        for o, t in pairs:
            st = statuses.get(t.status_id)
            mine = bool(viewer_client and o.opened_by_client_id == viewer_client.id)
            closed = bool(st and st.is_final)
            # Em análise/encaminhada como melhoria já não é correção (vai para o backlog de evolução).
            corr = is_correction(o) and (st.assisted_stage_key if st else None) not in _MELHORIA_KEYS
            sla_target, sla_elapsed, sla_state = (
                await AssistedOpsService._sla(db, t, o, *cal_tz) if corr and cal_tz else (None, None, None)
            )
            if closed and sla_state == "risco":
                sla_state = "ok"  # encerrada: vale o resultado final (no prazo ou estourado)
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
                is_correction=corr,
                criticidade=CRITICIDADE.get(o.prioridade) if corr else None,
                sla_target_hours=sla_target,
                sla_elapsed_hours=sla_elapsed,
                sla_state=sla_state,
                created_at=o.created_at,
                updated_at=t.updated_at,
            ))
        return out

    @staticmethod
    async def _sla(db: AsyncSession, task: ProjectTask, occ: ProjectOccurrence, cal, tz) -> tuple[Optional[float], Optional[float], Optional[str]]:
        """Prazo de resolução da correção: horas úteis da abertura até encerrar, pausando com o
        cliente (Aguardando Cliente/Homologando). Estado: risco a partir de 80% do prazo-alvo."""
        target = SLA_RESOLUCAO_HORAS.get(occ.prioridade)
        if target is None:
            return None, None, None
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
        events = [(t, keys.get(sid)) for t, sid in hist if t is not None] or [(occ.created_at, keys.get(task.status_id))]
        now = datetime.utcnow()
        elapsed = 0.0
        for i, (start, key) in enumerate(events):
            if key in _CLOSED_KEYS:
                break
            end = events[i + 1][0] if i + 1 < len(events) else now
            start = max(start, occ.created_at)
            if key in _PAUSED_KEYS or end <= start:
                continue
            elapsed += cal.working_hours_between(_to_local(start, tz), _to_local(end, tz))
        elapsed = round(elapsed, 2)
        state = "estourado" if elapsed > target else ("risco" if elapsed >= _SLA_RISCO * target else "ok")
        return target, elapsed, state

    @staticmethod
    async def _detail(
        db: AsyncSession,
        occ: ProjectOccurrence,
        task: ProjectTask,
        viewer_client: Optional[ProjectClient],
        viewer_user: Optional[User] = None,
        as_client: Optional[bool] = None,
    ) -> OccurrenceDetail:
        summary = (await AssistedOpsService._summaries(db, [(occ, task)], viewer_client))[0]
        # Equipe no Modo Cliente vê como o cliente (as_client), mesmo sem cadastro de cliente.
        for_client = viewer_client is not None if as_client is None else as_client
        if occ.worked_hours is None:
            summary.worked_hours = await AssistedOpsService.compute_worked_hours(db, task, occ)
        can_assume = False
        if not for_client and viewer_user is not None and not summary.is_closed:
            pid = await AssistedOpsService._person_id_for_user(db, viewer_user.id)
            if pid is not None and pid != task.assigned_to:
                from app.modules.projetos.service import ProjectTaskService
                can_assume = (
                    pid in await AssistedOpsService._dev_person_ids(db, occ.project_task_id)
                    or await AssistedOpsService._is_project_po(db, viewer_user, occ.project_task_id)
                    or _is_admin(viewer_user)
                    or await ProjectTaskService._is_coordination(db, viewer_user)
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
        mover_ids = {h.moved_by for h in hist if h.moved_by} - set(authors)
        if mover_ids:
            authors.update({
                u.id: u.full_name for u in (await db.execute(
                    select(User).where(User.id.in_(mover_ids))
                )).scalars().all()
            })

        # Card da ocorrência (time): do projeto, só o PO responsável e o produto vinculado.
        po_name = product_name = None
        dev_names: list[str] = []
        if not for_client:
            from app.modules.teamops.models import Person
            dev_ids = await AssistedOpsService._dev_person_ids(db, occ.project_task_id)
            if dev_ids:
                dev_names = sorted((await db.execute(
                    select(Person.full_name).where(Person.id.in_(dev_ids))
                )).scalars().all())
            root = await db.get(ProjectTask, occ.project_task_id)
            if root is not None and root.assigned_to:
                po_name = (await db.execute(
                    select(Person.full_name).where(Person.id == root.assigned_to)
                )).scalar_one_or_none()
            if root is not None and root.linked_product_id:
                try:
                    from app.modules.produtos.models import Product
                    async with db.begin_nested():  # savepoint: falha aqui não derruba a transação
                        product_name = (await db.execute(
                            select(Product.name).where(Product.id == root.linked_product_id)
                        )).scalar_one_or_none()
                except Exception:  # noqa: BLE001 — módulo Produtos ausente no tenant
                    product_name = None

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
            project_po_name=po_name,
            product_name=product_name,
            assisted_ops_dev_names=dev_names,
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
            # Timeline de raias (mesmo formato do drawer do card): de → para, quem moveu, quando e origem.
            history=[
                {
                    "stage_name": h.to_status_name,
                    "from_stage_name": h.from_status_name,
                    "moved_at": h.moved_at.isoformat() if h.moved_at else None,
                    "moved_by_name": authors.get(h.moved_by) if h.moved_by else None,
                    "source": h.source,
                }
                for h in hist
            ],
        )

    # ── Portal do Cliente ────────────────────────────────────────────────────
    @staticmethod
    async def portal_projects(db: AsyncSession, user_id: uuid.UUID) -> list[PortalProject]:
        from app.modules.projetos.clients import ProjectClientService

        client, _team_all = await AssistedOpsService._portal_viewer(db, user_id)
        if client is None:
            return []  # equipe no Modo Cliente: não abre ocorrência (só lê)
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
        from app.modules.projetos.clients import project_role_label

        roles = {a.task_id: project_role_label(a.project_role, a.project_role_other) for a in client.access}
        return [
            PortalProject(
                **r.model_dump(),
                accepts_occurrences=r.task_id in in_oa,
                open_occurrences=open_counts.get(r.task_id, 0),
                project_role_label=roles.get(r.task_id) or None,
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
        client, team_all = await AssistedOpsService._portal_viewer(db, user_id)
        q = (
            select(ProjectOccurrence, ProjectTask)
            .join(ProjectTask, ProjectTask.id == ProjectOccurrence.task_id)
        )
        if team_all:
            # Equipe com visão de tudo: todas as ocorrências (filtro de projeto opcional).
            if project_task_id is not None:
                q = q.where(ProjectOccurrence.project_task_id == project_task_id)
        else:
            allowed = {a.task_id for a in client.access}
            if project_task_id is not None:
                if project_task_id not in allowed:
                    raise HTTPException(status_code=404, detail="Projeto não encontrado.")
                allowed = {project_task_id}
            if not allowed:
                return []
            q = q.where(ProjectOccurrence.project_task_id.in_(allowed))
        if mine:
            if client is None:
                return []
            q = q.where(ProjectOccurrence.opened_by_client_id == client.id)
        pairs = [(o, t) for o, t in (await db.execute(q.order_by(ProjectOccurrence.code.desc()))).all()]
        return await AssistedOpsService._summaries(db, pairs, client)

    @staticmethod
    async def _portal_get(
        db: AsyncSession, client: Optional[ProjectClient], task_id: uuid.UUID, team_all: bool = False,
    ) -> tuple[ProjectOccurrence, ProjectTask]:
        occ = await AssistedOpsService.get_occurrence(db, task_id)
        allowed = team_all or (client is not None and occ is not None and occ.project_task_id in {a.task_id for a in client.access})
        if occ is None or not allowed:
            raise HTTPException(status_code=404, detail="Ocorrência não encontrada.")
        task = await db.get(ProjectTask, task_id)
        return occ, task

    @staticmethod
    async def portal_detail(db: AsyncSession, user_id: uuid.UUID, task_id: uuid.UUID) -> OccurrenceDetail:
        client, team_all = await AssistedOpsService._portal_viewer(db, user_id)
        occ, task = await AssistedOpsService._portal_get(db, client, task_id, team_all)
        return await AssistedOpsService._detail(db, occ, task, client, as_client=True)

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
        client, team_all = await AssistedOpsService._portal_viewer(db, user_id)
        allowed = {a.task_id for a in client.access} if client is not None else set()
        if not allowed and not team_all:
            return False
        pattern = f'%"{object_name}"%'
        hit = (await db.execute(text("""
            SELECT 1 FROM project_occurrences o
              JOIN project_tasks t ON t.id = o.task_id
             WHERE (:all_roots OR o.project_task_id = ANY(CAST(:roots AS uuid[])))
               AND (CAST(t.anexos AS text) LIKE :pat
                    OR EXISTS (SELECT 1 FROM project_task_comments c
                                WHERE c.task_id = t.id AND c.visibility = 'public'
                                  AND CAST(c.anexos AS text) LIKE :pat))
             LIMIT 1
        """), {"roots": [str(r) for r in allowed], "pat": pattern, "all_roots": team_all})).scalar()
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

    # ── Entrada na Operação Assistida (POP 5 e 8.1.2) ───────────────────────
    @staticmethod
    async def _can_manage_oa(db: AsyncSession, user: Optional[User], root_id: uuid.UUID) -> bool:
        from app.modules.projetos.service import ProjectTaskService

        return bool(
            _is_admin(user)
            or await AssistedOpsService._is_project_po(db, user, root_id)
            or await ProjectTaskService._is_coordination(db, user)
        )

    @staticmethod
    async def _root(db: AsyncSession, root_id: uuid.UUID) -> ProjectTask:
        root = await db.get(ProjectTask, root_id)
        if root is None or root.parent_task_id is not None:
            raise HTTPException(status_code=404, detail="Projeto não encontrado.")
        return root

    @staticmethod
    async def roles_missing(db: AsyncSession, root: ProjectTask) -> list[str]:
        """Papéis do POP que ainda não estão nos clientes do projeto (nem do programa dele)."""
        roles = set((await db.execute(
            select(ProjectClientAccess.project_role).where(ProjectClientAccess.task_id == root.id)
        )).scalars().all())
        if root.linked_program_id:
            roles |= set((await db.execute(
                select(ProjectProgramClientAccess.project_role)
                .where(ProjectProgramClientAccess.program_id == root.linked_program_id)
            )).scalars().all())
        return [label for key, label in OA_REQUIRED_ROLES if key not in roles]

    @staticmethod
    async def _can_record(db: AsyncSession, user: Optional[User], root_id: uuid.UUID) -> bool:
        """Registra atas: PO do projeto, coordenação/admin e devs de atendimento."""
        if await AssistedOpsService._can_manage_oa(db, user, root_id):
            return True
        pid = await AssistedOpsService._person_id_for_user(db, user.id) if user else None
        return bool(pid and pid in await AssistedOpsService._dev_person_ids(db, root_id))

    @staticmethod
    async def entry_state(db: AsyncSession, root_id: uuid.UUID, user: Optional[User]) -> AssistedOpsEntryState:
        root = await AssistedOpsService._root(db, root_id)
        done = root.assisted_op_checklist or {}
        missing_roles = await AssistedOpsService.roles_missing(db, root)
        hint = (
            f"Falta nos Clientes do projeto: {', '.join(missing_roles)}." if missing_roles else None
        )
        return AssistedOpsEntryState(
            items=[
                AssistedOpsPrereqItem(
                    key=k, label=label, allow_na=na, value=done.get(k), hint=hint if k == "papeis" else None,
                )
                for k, label, na in OA_PREREQS
            ],
            complete=not prereqs_missing(done) and not missing_roles,
            missing_roles=missing_roles,
            phase=root.assisted_op_phase,
            phase_label=OA_PHASES.get(root.assisted_op_phase or 0),
            can_record=await AssistedOpsService._can_record(db, user, root_id),
            due_date=root.assisted_op_due_date,
            max_days=OA_MAX_DIAS,
            entered_at=root.assisted_op_entered_at,
            extensions=list(root.assisted_op_extensions or []),
            overdue=bool(
                root.assisted_op_due_date and root.assisted_op_entered_at
                and root.assisted_op_due_date < datetime.utcnow().date()
            ),
            can_manage=await AssistedOpsService._can_manage_oa(db, user, root_id),
        )

    @staticmethod
    async def set_entry(db: AsyncSession, root_id: uuid.UUID, data: AssistedOpsEntrySet, user: User) -> AssistedOpsEntryState:
        """Checklist de pré-requisitos e fim previsto (até 15 dias). Depois de entrar na raia,
        mudar o fim previsto é prorrogação (com justificativa)."""
        from datetime import timedelta

        root = await AssistedOpsService._root(db, root_id)
        if not await AssistedOpsService._can_manage_oa(db, user, root_id):
            raise HTTPException(status_code=403, detail="Só o PO do projeto ou a coordenação preparam a Operação Assistida.")
        valid = {k: na for k, _l, na in OA_PREREQS}
        checklist = {}
        for key, value in (data.checklist or {}).items():
            if key not in valid:
                continue
            if value == "na" and not valid[key]:
                raise HTTPException(status_code=400, detail="Este pré-requisito não aceita “não se aplica”.")
            checklist[key] = value
        if checklist.get("papeis") == "sim":
            faltam = await AssistedOpsService.roles_missing(db, root)
            if faltam:
                raise HTTPException(
                    status_code=400,
                    detail=f"Para confirmar os papéis, cadastre nos Clientes do projeto: {', '.join(faltam)}.",
                )
        root.assisted_op_checklist = checklist
        if data.due_date is not None and data.due_date != root.assisted_op_due_date:
            if root.assisted_op_entered_at is not None and root.assisted_op_due_date is not None:
                raise HTTPException(status_code=400, detail="Já em Operação Assistida: use Prorrogar, com justificativa.")
            today = datetime.utcnow().date()
            if not (today <= data.due_date <= today + timedelta(days=OA_MAX_DIAS)):
                raise HTTPException(
                    status_code=400,
                    detail=f"O fim previsto deve ficar entre hoje e {OA_MAX_DIAS} dias (POP); além disso, é prorrogação.",
                )
            root.assisted_op_due_date = data.due_date
        root.updated_at = datetime.utcnow()
        await db.commit()
        return await AssistedOpsService.entry_state(db, root_id, user)

    @staticmethod
    async def extend(db: AsyncSession, root_id: uuid.UUID, data: AssistedOpsExtend, user: User) -> AssistedOpsEntryState:
        """Prorrogação (POP 8.1.2): nova data com justificativa, registrada no card."""
        root = await AssistedOpsService._root(db, root_id)
        if not await AssistedOpsService._can_manage_oa(db, user, root_id):
            raise HTTPException(status_code=403, detail="Só o PO do projeto ou a coordenação prorrogam a Operação Assistida.")
        current = root.assisted_op_due_date
        if current is not None and data.new_due_date <= current:
            raise HTTPException(status_code=400, detail="A nova data precisa ser depois do fim previsto atual.")
        reason = data.reason.strip()
        root.assisted_op_extensions = [*(root.assisted_op_extensions or []), {
            "from": current.isoformat() if current else None,
            "to": data.new_due_date.isoformat(),
            "reason": reason,
            "by": user.full_name,
            "at": datetime.utcnow().isoformat(),
        }]
        root.assisted_op_due_date = data.new_due_date
        root.assisted_op_due_alert_at = None
        root.updated_at = datetime.utcnow()
        de = f"de {current:%d/%m/%Y} " if current else ""
        db.add(ProjectTaskComment(
            task_id=root.id, author_id=user.id, visibility="internal",
            content=f"<p><strong>Operação Assistida prorrogada</strong> {de}para {data.new_due_date:%d/%m/%Y}.</p>"
                    + _plain_to_html(reason),
        ))
        await db.commit()
        return await AssistedOpsService.entry_state(db, root_id, user)

    # ── Fases e ritos (POP 8.3.1, 8.3.2 e 8.3.5) ────────────────────────────
    @staticmethod
    async def set_phase(db: AsyncSession, root_id: uuid.UUID, data: AssistedOpsPhaseSet, user: User) -> AssistedOpsEntryState:
        root = await AssistedOpsService._root(db, root_id)
        if not await AssistedOpsService._can_manage_oa(db, user, root_id):
            raise HTTPException(status_code=403, detail="Só o PO do projeto ou a coordenação mudam a fase.")
        if root.assisted_op_entered_at is None:
            raise HTTPException(status_code=400, detail="O projeto ainda não entrou em Operação Assistida.")
        if data.phase != root.assisted_op_phase:
            root.assisted_op_phase = data.phase
            root.updated_at = datetime.utcnow()
            db.add(ProjectTaskComment(
                task_id=root.id, author_id=user.id, visibility="internal",
                content=f"<p><strong>Operação Assistida: Fase {data.phase}</strong> — "
                        f"{html.escape(OA_PHASES[data.phase])}.</p>",
            ))
            await db.commit()
        return await AssistedOpsService.entry_state(db, root_id, user)

    @staticmethod
    async def _meeting_out(db: AsyncSession, m: ProjectAssistedOpMeeting, user: Optional[User], can_manage: bool) -> AssistedOpMeetingOut:
        author = await db.get(User, m.created_by) if m.created_by else None
        return AssistedOpMeetingOut(
            id=m.id, kind=m.kind, kind_label=MEETING_KINDS.get(m.kind, m.kind), held_on=m.held_on, phase=m.phase,
            participants=m.participants, summary=m.summary, decisions=m.decisions,
            created_by_name=author.full_name if author else None, created_at=m.created_at,
            can_edit=bool(can_manage or (user and m.created_by == user.id)),
        )

    @staticmethod
    async def list_meetings(db: AsyncSession, root_id: uuid.UUID, user: Optional[User]) -> list[AssistedOpMeetingOut]:
        await AssistedOpsService._root(db, root_id)
        can_manage = await AssistedOpsService._can_manage_oa(db, user, root_id)
        rows = (await db.execute(
            select(ProjectAssistedOpMeeting)
            .where(ProjectAssistedOpMeeting.task_id == root_id)
            .order_by(ProjectAssistedOpMeeting.held_on.desc(), ProjectAssistedOpMeeting.created_at.desc())
        )).scalars().all()
        return [await AssistedOpsService._meeting_out(db, m, user, can_manage) for m in rows]

    @staticmethod
    async def create_meeting(db: AsyncSession, root_id: uuid.UUID, data: AssistedOpMeetingIn, user: User) -> AssistedOpMeetingOut:
        root = await AssistedOpsService._root(db, root_id)
        if not await AssistedOpsService._can_record(db, user, root_id):
            raise HTTPException(status_code=403, detail="Só o PO, a coordenação e os devs de atendimento registram atas.")
        if root.assisted_op_entered_at is None:
            raise HTTPException(status_code=400, detail="O projeto ainda não entrou em Operação Assistida.")
        if data.held_on > datetime.utcnow().date():
            raise HTTPException(status_code=400, detail="A data do rito não pode ser futura.")
        m = ProjectAssistedOpMeeting(
            task_id=root.id, kind=data.kind, held_on=data.held_on, phase=root.assisted_op_phase,
            participants=(data.participants or "").strip() or None, summary=data.summary.strip(),
            decisions=(data.decisions or "").strip() or None, created_by=user.id,
        )
        db.add(m)
        await db.commit()
        await db.refresh(m)
        return await AssistedOpsService._meeting_out(
            db, m, user, await AssistedOpsService._can_manage_oa(db, user, root_id),
        )

    @staticmethod
    async def _meeting(db: AsyncSession, root_id: uuid.UUID, meeting_id: uuid.UUID, user: User) -> tuple[ProjectAssistedOpMeeting, bool]:
        m = await db.get(ProjectAssistedOpMeeting, meeting_id)
        if m is None or m.task_id != root_id:
            raise HTTPException(status_code=404, detail="Ata não encontrada.")
        can_manage = await AssistedOpsService._can_manage_oa(db, user, root_id)
        if not (can_manage or m.created_by == user.id):
            raise HTTPException(status_code=403, detail="Só quem registrou, o PO ou a coordenação alteram a ata.")
        return m, can_manage

    @staticmethod
    async def update_meeting(
        db: AsyncSession, root_id: uuid.UUID, meeting_id: uuid.UUID, data: AssistedOpMeetingIn, user: User,
    ) -> AssistedOpMeetingOut:
        m, can_manage = await AssistedOpsService._meeting(db, root_id, meeting_id, user)
        if data.held_on > datetime.utcnow().date():
            raise HTTPException(status_code=400, detail="A data do rito não pode ser futura.")
        m.kind = data.kind
        m.held_on = data.held_on
        m.participants = (data.participants or "").strip() or None
        m.summary = data.summary.strip()
        m.decisions = (data.decisions or "").strip() or None
        m.updated_at = datetime.utcnow()
        await db.commit()
        return await AssistedOpsService._meeting_out(db, m, user, can_manage)

    @staticmethod
    async def delete_meeting(db: AsyncSession, root_id: uuid.UUID, meeting_id: uuid.UUID, user: User) -> None:
        m, _can = await AssistedOpsService._meeting(db, root_id, meeting_id, user)
        await db.delete(m)
        await db.commit()

    # ── Alertas do POP (rodam junto com o de "sem responsável") ──────────────
    @staticmethod
    async def scan_sla_breaches(db: AsyncSession) -> int:
        """Correção que estourou o prazo de resolução: avisa PO, devs e responsável (uma vez)."""
        rows = list((await db.execute(
            select(ProjectOccurrence, ProjectTask)
            .join(ProjectTask, ProjectTask.id == ProjectOccurrence.task_id)
            .join(ProjectStatusConfig, ProjectStatusConfig.id == ProjectTask.status_id)
            .where(ProjectOccurrence.sla_breach_alert_at.is_(None), ProjectStatusConfig.is_final == False)  # noqa: E712
        )).all())
        stage_keys = {
            st.id: st.assisted_stage_key for st in (await db.execute(
                select(ProjectStatusConfig).where(ProjectStatusConfig.id.in_({t.status_id for _o, t in rows}))
            )).scalars().all()
        } if rows else {}
        rows = [(o, t) for o, t in rows if is_correction(o) and stage_keys.get(t.status_id) not in _MELHORIA_KEYS]
        if not rows:
            return 0
        cal, tz = await AssistedOpsService._calendar(db)
        alerted = 0
        for occ, task in rows:
            target, elapsed, state = await AssistedOpsService._sla(db, task, occ, cal, tz)
            if state != "estourado":
                continue
            root = await db.get(ProjectTask, occ.project_task_id)
            await notify_persons(
                db, [task.assigned_to, root.assigned_to if root else None, *await AssistedOpsService._dev_person_ids(db, occ.project_task_id)],
                f"{code_label(occ.code)}: prazo de resolução estourado ({CRITICIDADE.get(occ.prioridade)})",
                f"“{task.title}” passou de {target:g}h úteis ({elapsed:g}h).",
                "project_task", task.id,
            )
            occ.sla_breach_alert_at = datetime.utcnow()
            alerted += 1
        await db.commit()
        return alerted

    @staticmethod
    async def scan_assisted_op_due(db: AsyncSession) -> int:
        """Operação Assistida passou do fim previsto: avisa o PO e a coordenação (1x por dia)."""
        from datetime import timedelta

        from app.modules.projetos.ai_solutions import _COORD_SLUGS, AiSolutionsService

        today = datetime.utcnow().date()
        roots = list((await db.execute(
            select(ProjectTask)
            .join(ProjectStatusConfig, ProjectStatusConfig.id == ProjectTask.status_id)
            .where(
                ProjectStatusConfig.is_assisted_operation == True,  # noqa: E712
                ProjectTask.parent_task_id.is_(None),
                ProjectTask.assisted_op_due_date.isnot(None),
                ProjectTask.assisted_op_due_date < today,
            )
        )).scalars().all())
        now = datetime.utcnow()
        coord = None
        alerted = 0
        for root in roots:
            if root.assisted_op_due_alert_at and now - root.assisted_op_due_alert_at < timedelta(days=1):
                continue
            if coord is None:
                coord = await AiSolutionsService._person_ids_by_cargo(db, slugs=_COORD_SLUGS)
            await notify_persons(
                db, [root.assigned_to, *coord],
                "Operação Assistida passou do prazo",
                f"{root.title}: fim previsto era {root.assisted_op_due_date:%d/%m/%Y}. Encerre ou prorrogue com justificativa.",
                "project_task", root.id,
            )
            root.assisted_op_due_alert_at = now
            alerted += 1
        await db.commit()
        return alerted

    # ── Ganchos chamados por ProjectTaskService / ProjectTaskCommentService ──
    @staticmethod
    async def on_project_enters_assisted_operation(db: AsyncSession, root: ProjectTask) -> None:
        await AssistedOpsService.ensure(db, root.project_id)
        if root.assisted_op_phase is None:
            root.assisted_op_phase = 1
        if root.assisted_op_due_date is None:
            from datetime import timedelta
            root.assisted_op_due_date = datetime.utcnow().date() + timedelta(days=OA_MAX_DIAS)
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
        # POP 8.3.3: correção só vai para o aceite com solução e causa-raiz registradas.
        if key in ("homologando", "finalizado") and is_correction(occ):
            faltam = [n for n, v in (("a solução", occ.solucao), ("a causa-raiz", occ.causa_raiz)) if not (v or "").strip()]
            if faltam:
                raise HTTPException(
                    status_code=400,
                    detail=f"Registre {' e '.join(faltam)} no card antes de enviar a correção para o aceite.",
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
        elif key == "n3_fornecedor":
            client_title = f"{label}: encaminhada ao fornecedor"
            client_body = (
                f"A causa da ocorrência “{task.title}” está numa ferramenta ou sistema de terceiro. "
                "O time acompanha o fornecedor e avisa quando houver retorno."
            )
        elif key == "escalonada_ie":
            client_title = f"{label}: levada à Instância Executiva"
            client_body = f"A ocorrência “{task.title}” foi escalonada para decisão da Instância Executiva do projeto."
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
        if key == "escalonada_ie":
            await AssistedOpsService._notify_executive(db, task, occ, actor_user_id)

    @staticmethod
    async def _notify_executive(
        db: AsyncSession, task: ProjectTask, occ: ProjectOccurrence, actor_user_id: Optional[uuid.UUID],
    ) -> None:
        """POP 8.2.1/8.4.1: a Instância Executiva (Sponsor do projeto ou do programa) e a
        coordenação decidem o escalonamento."""
        from app.modules.projetos.ai_solutions import _COORD_SLUGS, AiSolutionsService

        root = await db.get(ProjectTask, occ.project_task_id)
        q = (
            select(ProjectClient.user_id)
            .join(ProjectClientAccess, ProjectClientAccess.client_id == ProjectClient.id)
            .where(ProjectClientAccess.task_id == occ.project_task_id, ProjectClientAccess.project_role == "sponsor",
                   ProjectClient.is_active == True, ProjectClient.user_id.isnot(None))  # noqa: E712
        )
        sponsors = set((await db.execute(q)).scalars().all())
        if root is not None and root.linked_program_id:
            sponsors |= set((await db.execute(
                select(ProjectClient.user_id)
                .join(ProjectProgramClientAccess, ProjectProgramClientAccess.client_id == ProjectClient.id)
                .where(ProjectProgramClientAccess.program_id == root.linked_program_id,
                       ProjectProgramClientAccess.project_role == "sponsor",
                       ProjectClient.is_active == True, ProjectClient.user_id.isnot(None))  # noqa: E712
            )).scalars().all())
        label = code_label(occ.code)
        title = f"{label}: decisão da Instância Executiva"
        body = f"A ocorrência “{task.title}” ({root.title if root else 'projeto'}) foi escalonada e aguarda decisão."
        await notify_users(db, list(sponsors), title, body, "occurrence", task.id, exclude_user_id=actor_user_id)
        await notify_persons(
            db, await AiSolutionsService._person_ids_by_cargo(db, slugs=_COORD_SLUGS), title, body,
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
        """Dev fixo, PO do projeto, coordenação ou admin assume. Pode tomar uma já assumida por outro.
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
        from app.modules.projetos.service import ProjectTaskService
        allowed = (
            pid in await AssistedOpsService._dev_person_ids(db, occ.project_task_id)
            or await AssistedOpsService._is_project_po(db, user, occ.project_task_id)
            or _is_admin(user)
            or await ProjectTaskService._is_coordination(db, user)
        )
        if not allowed:
            raise HTTPException(
                status_code=403,
                detail="Só os desenvolvedores de atendimento do projeto, o PO ou a coordenação assumem ocorrências.",
            )
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
                raise HTTPException(status_code=400, detail="Dê uma nota de 1 a 5 para o atendimento.")
            occ.nps_score = data.nps_score
            occ.nps_comment = comment or None
            occ.homologated_at = datetime.utcnow()
            text_html = f"<p><strong>Homologação aprovada</strong> — satisfação {data.nps_score}/5.</p>"
            if comment:
                text_html += _plain_to_html(comment)
            db.add(ProjectTaskComment(task_id=task.id, author_id=user.id, content=text_html, visibility="public"))
            await AssistedOpsService._move(db, task, flow["stages"]["finalizado"], user.id, "client", notify=False)
            title, body = f"{label}: homologada (satisfação {data.nps_score}/5)", f"{client.full_name} aprovou “{task.title}”."
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

