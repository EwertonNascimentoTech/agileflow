"""
Programas no Portal do Cliente — gestão do programa (pilares, clientes do programa) e as
telas do cliente (Visão geral, Programa, Projetos, Entregas e Marcos).

Regras (ver `.claude/invariantes.md`, "Portal do Cliente — Programas"):
- Programa = cadastro de Programas; os projetos dele = cards-raiz com `linked_program_id`
  (tanto `projeto` quanto `programa`). Card cancelado fica fora do portfólio.
- Cliente vinculado ao programa (`project_program_client_access`) vê todos os projetos do
  programa; cliente só no projeto vê só o projeto. Tudo é leitura: ocorrência continua
  exigindo o vínculo com o projeto na raia Operação Assistida.
- Mesmos números da gestão: fase e execução do PO Sync (planejamento conta 0%), quadrante da
  priorização, saúde pela régua do Status Report (com a execução por etapa no lugar do % por
  horas, que neste tenant fica ~0).
"""
from __future__ import annotations

import hashlib
import json
import re
import uuid
from datetime import date, datetime, timedelta
from typing import Iterable, Optional

from fastapi import HTTPException
from sqlalchemy import func, select, text as sa_text, update as sa_update
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.modules.projetos.clients import ProjectClientService, project_role_label
from app.modules.projetos.models import (
    ProjectClient,
    ProjectClientAccess,
    ProjectFunnel,
    ProjectPriorityCriterion,
    ProjectPriorityQuadrant,
    ProjectPriorityScore,
    ProjectPrioritySettings,
    ProjectProgram,
    ProjectProgramClientAccess,
    ProjectProgramPillar,
    ProjectStatusConfig,
    ProjectTask,
    ProjectTaskDependency,
    ProjectTaskStatusHistory,
)
from app.modules.projetos.schemas import (
    ProgramAdminDetail,
    ProgramPillarIn,
    ProgramPillarResponse,
    ProgramPillarSuggestResult,
    ProgramProjectRow,
    ProjectClientMember,
    ProjectClientMemberAdd,
    ProjectClientMembers,
    ProjectClientMemberUpdate,
)
from app.modules.projetos.service import (
    CapacityService,
    PoPortfolioService,
    PoSyncService,
    ProjectProgramService,
    ProjectTaskService,
    StatusReportService,
    _light_task_options,
)
from app.modules.super_admin.models import Role, TenantModule, User
from app.core.dependencies import CLIENT_ROLE_NAME

# ─────────────────────────────────────────────────────────────────────────────
# Regras puras (testadas em tests/test_program_portal.py)
# ─────────────────────────────────────────────────────────────────────────────

# Fases do roadmap: as do PO Sync com Operação Assistida à parte (o PO Sync a conta como
# concluído) e cancelado para tirar do portfólio.
ROADMAP_PHASES = ("planejamento", "desenvolvimento", "homologacao", "producao",
                  "operacao_assistida", "concluido", "impedimento", "cancelado")
_CANCEL_PAT = PoSyncService._NAO_REALIZADO_PAT
_CODE_PAT = re.compile(r"^\s*((?:US|FEAT)-\d+)\s*[-–—:|.]?\s*(.*)$", re.IGNORECASE)
PROGRESS_LAG_TOLERANCE = StatusReportService.PROGRESS_LAG_TOLERANCE


def quadrant_for(impact: float, effort: float, impact_cut: float, effort_cut: float) -> str:
    """Mesma régua da priorização (ProjectPriorityService): corte de impacto e de esforço."""
    if impact >= impact_cut:
        return "quick_win" if effort < effort_cut else "big_bet"
    return "fill_in" if effort < effort_cut else "money_pit"


def health_of(*, delivered: bool, overdue: bool, lagging: bool, blocked: bool) -> str:
    """Régua do Status Report: crítico = atraso/SLA/execução atrás do esperado; atenção =
    bloqueio (dependência, impedimento, pausa); entregue = concluído."""
    if delivered:
        return "concluido"
    if overdue or lagging:
        return "critico"
    if blocked:
        return "atencao"
    return "no_prazo"


def aggregate_health(values: Iterable[str]) -> str:
    """Saúde do programa/pilar: crítico se metade ou mais dos projetos ativos está crítica;
    em atenção se algum não está no prazo; todos entregues = concluído."""
    values = list(values)
    active = [v for v in values if v != "concluido"]
    if not active:
        return "concluido" if values else "no_prazo"
    critical = sum(1 for v in active if v == "critico")
    if critical * 2 >= len(active):
        return "critico"
    if any(v != "no_prazo" for v in active):
        return "atencao"
    return "no_prazo"


def status_of(phase: str, paused: bool) -> str:
    """Status do projeto na Visão geral (a partir da fase do PO Sync)."""
    if paused:
        return "pausado"
    if phase == "planejamento":
        return "planejamento"
    if phase == "concluido":
        return "concluido"
    if phase == "impedimento":
        return "impedimento"
    return "execucao"


def aggregate_status(values: Iterable[str]) -> str:
    values = list(values)
    if not values:
        return "planejamento"
    if all(v == "concluido" for v in values):
        return "concluido"
    if any(v in ("execucao", "impedimento") for v in values):
        return "execucao"
    if all(v in ("planejamento", "pausado") for v in values):
        return "planejamento"
    return "execucao"


def roadmap_phase(name: Optional[str], *, is_final: bool = False, is_oa: bool = False) -> str:
    """Fase do roadmap pelo nome da etapa do card-raiz (mesmos padrões do PO Sync)."""
    n = name or ""
    norm = ProjectTaskService._norm_col(n)
    if is_oa or "operacao assistida" in norm:
        return "operacao_assistida"
    if _CANCEL_PAT.search(n):
        return "cancelado"
    if PoSyncService._IMPEDIMENTO_PAT.search(n):
        return "impedimento"
    if "conclu" in norm or (is_final and not _CANCEL_PAT.search(n)):
        return "concluido"
    if PoSyncService._PROD_PAT.search(n):
        return "producao"
    if PoSyncService._HOMOLOG_PAT.search(n):
        return "homologacao"
    if PoSyncService._DESENV_PAT.search(n) and not re.search(r"pronto", n, re.IGNORECASE):
        return "desenvolvimento"
    return "planejamento"


def item_status(*, final: bool, impediment: bool, overdue: bool, not_started: bool, has_due: bool) -> str:
    """Status do item (projeto, Feature ou US) na visão por projetos."""
    if final:
        return "concluida"
    if impediment:
        return "impedimento"
    if overdue:
        return "atrasado"
    if not_started:
        return "nao_iniciada"
    return "no_prazo" if has_due else "andamento"


def split_code(title: str) -> tuple[Optional[str], str]:
    """'US-12 - Login' → ('US-12', 'Login'). Sem código, devolve (None, título)."""
    m = _CODE_PAT.match(title or "")
    if not m:
        return None, (title or "").strip()
    rest = m.group(2).strip()
    return m.group(1).upper(), rest or (title or "").strip()


def _d(value) -> Optional[date]:
    """Datas do cronograma são timestamps (meia-noite local gravada em UTC)."""
    if value is None:
        return None
    return value.date() if isinstance(value, datetime) else value


def _iso(value) -> Optional[str]:
    return value.isoformat() if value is not None else None


_FORECAST_NEXT = {
    "planejamento": ["desenvolvimento", "homologacao", "operacao_assistida"],
    "desenvolvimento": ["homologacao", "operacao_assistida"],
    "homologacao": ["operacao_assistida"],
    "producao": ["operacao_assistida"],
    "operacao_assistida": [],
}


def build_roadmap(
    *,
    today: date,
    origin: date,
    current: str,
    points: list[tuple[date, str]],
    us_start_min: Optional[date],
    us_due_max: Optional[date],
    due: Optional[date],
    oa_days: int,
    oa_entered: Optional[date],
    delivered_on: Optional[date],
) -> dict:
    """Barras de fase do projeto no roadmap do programa.

    - Realizado: pelo histórico de etapas do card-raiz (`points` = [(data, fase para onde
      foi)], em ordem). Antes do 1º registro, a fase de origem vale desde `origin` (início
      do card ou criação, o que vier antes).
    - Atual: da última mudança até hoje, esticada até o fim previsto da fase.
    - Previsto (tom claro): Desenvolvimento até o maior prazo das US, Homologação até o prazo
      do projeto, Operação Assistida por `oa_days` depois. Sem prazo, não há previsão.
    Projeto concluído vira uma barra só "Concluído" do início até a entrega.
    """
    segments: list[dict] = []
    milestones: list[dict] = []

    def seg(phase: str, start: date, end: date, kind: str) -> None:
        if end < start:
            end = start
        if segments and segments[-1]["phase"] == phase and segments[-1]["kind"] == kind \
                and segments[-1]["end"] >= start:
            segments[-1]["end"] = max(segments[-1]["end"], end)
            return
        segments.append({"phase": phase, "start": start, "end": end, "kind": kind})

    if current == "concluido":
        end = delivered_on or today
        seg("concluido", min(origin, end), end, "realizado")
        return _roadmap_out(segments, milestones)

    # Realizado: a fase de cada ponto vale até o ponto seguinte; a última é a atual (o
    # histórico pode não ter a mudança mais recente).
    timeline = [(max(when, origin), phase) for when, phase in points] or [(origin, current)]
    if timeline[0][0] > origin:
        timeline.insert(0, (origin, timeline[0][1]))
    # Várias mudanças no mesmo dia: vale a última; fases iguais em sequência viram uma.
    same_day: list[tuple[date, str]] = []
    for when, phase in timeline:
        if same_day and same_day[-1][0] == when:
            same_day[-1] = (when, phase)
        else:
            same_day.append((when, phase))
    timeline = []
    for when, phase in same_day:
        if not timeline or timeline[-1][1] != phase:
            timeline.append((when, phase))
    if timeline[-1][1] != current:
        timeline.append((min(max(timeline[-1][0], origin), today), current))
    for i in range(len(timeline) - 1):
        when, phase = timeline[i]
        nxt = timeline[i + 1][0]
        if nxt > when:
            seg(phase, when, nxt, "realizado")
    cur_start = min(timeline[-1][0], today)

    # Fase de referência da previsão (impedimento/pausa retoma a fase anterior).
    base = current
    if current == "impedimento":
        base = next(
            (p for _, p in reversed(timeline[:-1]) if p in _FORECAST_NEXT),
            "planejamento",
        )

    dev_end = us_due_max or due
    homolog_end = due or dev_end
    if current == "planejamento":
        dev_start = us_start_min if us_start_min and us_start_min > today else today
    else:
        dev_start = today
    if dev_end is not None:
        dev_end = max(dev_end, dev_start)
    if homolog_end is not None and dev_end is not None:
        homolog_end = max(homolog_end, dev_end)

    has_forecast = dev_end is not None or homolog_end is not None or current == "operacao_assistida"

    # Fim previsto da fase atual.
    if current == "planejamento":
        cur_end = dev_start if has_forecast else today
    elif current == "desenvolvimento":
        cur_end = max(today, dev_end) if dev_end else today
    elif current in ("homologacao", "producao"):
        cur_end = max(today, homolog_end) if homolog_end else today
    elif current == "operacao_assistida":
        start_oa = oa_entered or cur_start
        cur_end = max(today, start_oa + timedelta(days=oa_days))
    else:  # impedimento: parado até hoje
        cur_end = today
    if segments and segments[-1]["phase"] == current and segments[-1]["end"] >= cur_start:
        cur_start = segments.pop()["start"]  # continuação da mesma fase
    seg(current, cur_start, cur_end, "atual")
    if current == "desenvolvimento" and dev_end and dev_end >= today:
        milestones.append({"date": dev_end, "label": "Fim previsto do desenvolvimento"})
    if current in ("homologacao", "producao") and homolog_end and homolog_end >= today:
        milestones.append({"date": homolog_end, "label": "Entrega prevista"})

    if not has_forecast:
        return _roadmap_out(segments, milestones)

    cursor = cur_end
    chain = list(_FORECAST_NEXT.get(base, []))
    if current == "impedimento" and base in _FORECAST_NEXT:
        chain = [base] + chain  # retoma a fase que parou
    for phase in chain:
        if phase == "desenvolvimento":
            end = dev_end
        elif phase in ("homologacao", "producao"):
            end = homolog_end
        elif phase == "planejamento":
            end = dev_start if dev_start > cursor else None
        else:  # operacao_assistida
            end = cursor + timedelta(days=oa_days) if oa_days > 0 else None
        if end is None or end <= cursor:
            continue
        seg(phase, cursor, end, "previsto")
        if phase == "desenvolvimento":
            milestones.append({"date": end, "label": "Fim previsto do desenvolvimento"})
        elif phase in ("homologacao", "producao"):
            milestones.append({"date": end, "label": "Entrega prevista"})
        cursor = end
    return _roadmap_out(segments, milestones)


def _roadmap_out(segments: list[dict], milestones: list[dict]) -> dict:
    start = min((x["start"] for x in segments), default=None)
    end = max((x["end"] for x in segments), default=None)
    return {
        "segments": [{**x, "start": x["start"].isoformat(), "end": x["end"].isoformat()} for x in segments],
        "milestones": [{**m, "date": m["date"].isoformat()} for m in milestones],
        "start": start.isoformat() if start else None,
        "end": end.isoformat() if end else None,
    }


def status_at(
    task_created: Optional[datetime],
    current_status_id: Optional[uuid.UUID],
    history: list,
    when: datetime,
) -> tuple[bool, Optional[uuid.UUID], Optional[str]]:
    """Etapa do card numa data passada pelo histórico de movimentos.
    Devolve (existia, status_id, nome da etapa no histórico)."""
    if task_created is not None and task_created > when:
        return False, None, None
    before = [h for h in history if h.moved_at <= when]
    if before:
        return True, before[-1].to_status_id, before[-1].to_status_name
    if history:
        h = history[0]
        if h.from_status_id is not None or h.from_status_name:
            return True, h.from_status_id, h.from_status_name
        return True, h.to_status_id, h.to_status_name
    return True, current_status_id, None


# ─────────────────────────────────────────────────────────────────────────────
# Base do portfólio (todos os projetos do tenant) — cache chaveado pela versão dos dados
# ─────────────────────────────────────────────────────────────────────────────

_VERSION_SQL = """
    SELECT concat_ws('|',
      (SELECT max(updated_at)::text || '#' || count(*) FROM project_tasks),
      (SELECT max(updated_at)::text || '#' || count(*) FROM project_status_configs),
      (SELECT max(updated_at)::text || '#' || count(*) FROM project_funnels),
      (SELECT max(updated_at)::text || '#' || count(*) FROM project_demand_types),
      (SELECT max(updated_at)::text || '#' || count(*) FROM project_default_form_fields),
      (SELECT max(updated_at)::text || '#' || count(*) FROM team_persons),
      (SELECT max(updated_at)::text || '#' || count(*) FROM team_positions),
      (SELECT max(updated_at)::text || '#' || count(*) FROM project_programs),
      (SELECT max(updated_at)::text || '#' || count(*) FROM project_program_pillars),
      (SELECT max(updated_at)::text || '#' || count(*) FROM project_priority_scores),
      (SELECT max(updated_at)::text || '#' || count(*) FROM project_priority_settings),
      (SELECT max(updated_at)::text || '#' || count(*) FROM project_priority_quadrants),
      (SELECT max(updated_at)::text || '#' || count(*) FROM project_priority_criteria),
      (SELECT max(moved_at)::text || '#' || count(*) FROM project_task_status_history),
      (SELECT max(created_at)::text || '#' || count(*) FROM project_task_dependencies),
      (SELECT max(updated_at)::text || '#' || count(*) FROM products))
"""
_CACHE_TTL = 60
# Janela do "+X p.p. desde o último mês".
_DELTA_DAYS = 30


class PortalPortfolioService:
    """Telas do cliente. `_base` calcula todos os projetos uma vez (cache); cada requisição
    só recorta o que o cliente pode ver e agrega programas/pilares sobre esse recorte."""

    # ── visibilidade ─────────────────────────────────────────────────────────
    @staticmethod
    async def _team_scope(db: AsyncSession, user: Optional[User]) -> Optional[dict]:
        """Pessoa ativa em Times vendo o Portal em "modo cliente": coordenação vê todos os
        projetos; PO, os projetos em que é responsável (e os programas de que é responsável);
        desenvolvedor, os projetos em que tem Feature/US ou é dev de atendimento da OA."""
        from app.modules.projetos.models import ProjectAssistedOpsDev
        from app.modules.teamops.models import Person, PersonStatus

        if user is None:
            return None
        # Módulo "Modo Cliente" desligado no tenant: a equipe não vê o Portal.
        module_on = (await db.execute(
            select(TenantModule.id).where(
                TenantModule.tenant_id == user.tenant_id,
                TenantModule.module_slug == "portal_cliente",
                TenantModule.is_active == True,  # noqa: E712
            ).limit(1)
        )).scalar_one_or_none()
        if module_on is None:
            return None
        person_id = (await db.execute(
            select(Person.id).where(Person.user_id == user.id, Person.status != PersonStatus.DESLIGADO)
        )).scalar_one_or_none()
        if person_id is None:
            return None
        if await ProjectTaskService._is_coordination(db, user):
            return {"all": True, "direct": {}, "programs": {}}
        # Sobe de cada item atribuído à pessoa até o card-raiz (Projeto/Programa).
        rows = (await db.execute(sa_text("""
            WITH RECURSIVE up AS (
                SELECT id, parent_task_id, planning_kind, assigned_to FROM project_tasks WHERE assigned_to = :pid
                UNION
                SELECT t.id, t.parent_task_id, t.planning_kind, t.assigned_to
                  FROM project_tasks t JOIN up ON up.parent_task_id = t.id
            )
            SELECT id, assigned_to = :pid FROM up WHERE planning_kind IN ('projeto', 'programa')
        """), {"pid": person_id})).all()
        direct: dict = {}
        for tid, is_po in rows:
            if is_po:
                direct[tid] = "PO do projeto"
            else:
                direct.setdefault(tid, "Desenvolvedor no projeto")
        for tid in (await db.execute(
            select(ProjectAssistedOpsDev.project_task_id).where(ProjectAssistedOpsDev.person_id == person_id)
        )).scalars().all():
            direct.setdefault(tid, "Atendimento da Operação Assistida")
        programs = {
            pid: "Responsável pelo programa" for pid in (await db.execute(
                select(ProjectProgram.id).where(ProjectProgram.responsavel_person_id == person_id)
            )).scalars().all()
        }
        return {"all": False, "direct": direct, "programs": programs}

    @classmethod
    async def _scope(cls, db: AsyncSession, user_id: uuid.UUID) -> dict:
        """O que o usuário vê no Portal: vínculos de cliente (projeto/programa) somados ao papel
        em Times ("modo cliente" da equipe). Sem nenhum dos dois, 403."""
        client = await ProjectClientService.get_by_user(db, user_id)
        team = await cls._team_scope(db, await db.get(User, user_id))
        if client is None and team is None:
            raise HTTPException(status_code=403, detail="Usuário sem acesso ao Portal do Cliente.")
        direct: dict = {}
        programs: dict = {}
        client_tasks: set = set()
        if client is not None:
            client_tasks = {a.task_id for a in client.access}
            direct = {a.task_id: project_role_label(a.project_role, a.project_role_other) for a in client.access}
            rows = (await db.execute(
                select(ProjectProgramClientAccess).where(ProjectProgramClientAccess.client_id == client.id)
            )).scalars().all()
            for r in rows:
                role = project_role_label(r.project_role, r.project_role_other)
                programs[r.program_id] = f"{role} do programa" if role else ""
        if team is not None:
            for k, v in team["direct"].items():
                direct.setdefault(k, v)
            for k, v in team["programs"].items():
                programs.setdefault(k, v)
        return {
            "client": client,
            "client_tasks": client_tasks,
            "direct": direct,
            "programs": programs,
            "all": bool(team and team["all"]),
            "team": team is not None,
        }

    @classmethod
    def _visible(cls, base: dict, scope: dict, *, include_cancelled: bool = False) -> list[dict]:
        out = []
        for p in base["projects"]:
            if p.get("cancelled") and not include_cancelled:
                continue
            tid = uuid.UUID(p["task_id"])
            pid = uuid.UUID(p["program_id"]) if p["program_id"] else None
            if tid in scope["direct"]:
                out.append({**p, "access": "projeto", "role_label": scope["direct"][tid] or None})
            elif pid is not None and pid in scope["programs"]:
                out.append({**p, "access": "programa", "role_label": scope["programs"][pid] or None})
            elif scope.get("all"):
                out.append({**p, "access": "todos", "role_label": None})
        return out

    @staticmethod
    def _viewer(scope: dict) -> dict:
        """Quem está vendo: cliente ou equipe em "modo cliente" (coordenação vê todos)."""
        return {"team": scope["team"], "all": scope["all"], "client": scope["client"] is not None}

    # ── base ─────────────────────────────────────────────────────────────────
    @classmethod
    async def _base(cls, db: AsyncSession) -> dict:
        from app.core.cache import cache_get, cache_set

        schema = (await db.execute(sa_text("SELECT current_schema()"))).scalar()
        version = (await db.execute(sa_text(_VERSION_SQL))).scalar() or ""
        raw = json.dumps([schema, date.today().isoformat(), version])
        key = "portal-portfolio:" + hashlib.sha1(raw.encode()).hexdigest()
        cached = await cache_get(key)
        if cached is not None:
            return cached
        result = await cls._build_base(db)
        await cache_set(key, result, _CACHE_TTL)
        return result

    @classmethod
    async def _build_base(cls, db: AsyncSession) -> dict:
        from app.modules.produtos.models import Product
        from app.modules.teamops.models import Person, Position

        now = datetime.utcnow()
        today = now.date()
        then = now - timedelta(days=_DELTA_DAYS)

        roots = list((await db.execute(
            select(ProjectTask)
            .options(selectinload(ProjectTask.status), *_light_task_options())
            .where(ProjectTask.planning_kind.in_(["projeto", "programa"]))
        )).scalars().all())
        container_ids = {r.project_id for r in roots}
        all_tasks = list((await db.execute(
            select(ProjectTask)
            .where(ProjectTask.project_id.in_(container_ids))
            .options(selectinload(ProjectTask.status), *_light_task_options())
        )).scalars().all()) if container_ids else []
        by_id = {t.id: t for t in all_tasks}
        children: dict = {}
        for t in all_tasks:
            if t.parent_task_id:
                children.setdefault(t.parent_task_id, []).append(t.id)
        us_ids = {t.id for t in await CapacityService._keep_us_tasks_only(db, all_tasks)}

        status_configs = list((await db.execute(
            select(ProjectStatusConfig).where(ProjectStatusConfig.project_id.in_(container_ids))
        )).scalars().all()) if container_ids else []
        status_by_id = {s.id: s for s in status_configs}
        stage_bucket = PoSyncService._classify_stages(status_configs)
        stage_weight = PoSyncService._stage_weights(status_configs)
        funnel_name = {
            f.id: f.name for f in (await db.execute(select(ProjectFunnel))).scalars().all()
        }

        def funnel_of(t) -> Optional[str]:
            return funnel_name.get(t.status.funnel_id) if t.status is not None else None

        def is_final(t) -> bool:
            return PoPortfolioService._is_final_stage(t)

        def bucket(t) -> str:
            if t.completed_at is not None or (t.status is not None and bool(t.status.is_final)):
                return "encerramento"
            return stage_bucket.get(t.status_id, "planejamento")

        def impeded(t) -> bool:
            return bool(t.status is not None and PoSyncService._IMPEDIMENTO_PAT.search(t.status.name or ""))

        # Priorização.
        settings = (await db.execute(select(ProjectPrioritySettings).limit(1))).scalar_one_or_none()
        impact_cut = float(settings.impact_cut) if settings else 3.0
        effort_cut = float(settings.effort_cut) if settings else 3.0
        root_ids = [r.id for r in roots]
        scores = {
            s.task_id: s for s in (await db.execute(
                select(ProjectPriorityScore).where(ProjectPriorityScore.task_id.in_(root_ids))
            )).scalars().all()
        } if root_ids else {}
        quadrants = [
            {"code": q.code, "label": q.label, "color": q.color, "action_hint": q.action_hint}
            for q in (await db.execute(
                select(ProjectPriorityQuadrant).order_by(ProjectPriorityQuadrant.order)
            )).scalars().all()
        ]
        criteria: dict = {"impact": [], "effort": []}
        for c in (await db.execute(
            select(ProjectPriorityCriterion)
            .where(ProjectPriorityCriterion.is_active == True)  # noqa: E712
            .order_by(ProjectPriorityCriterion.axis, ProjectPriorityCriterion.order)
        )).scalars().all():
            criteria.setdefault(c.axis, []).append({
                "label": c.label, "weight": float(c.weight or 0), "scale": c.scale or [],
            })

        # Programas e pilares.
        programs = {
            p.id: p for p in (await db.execute(
                select(ProjectProgram).where(ProjectProgram.is_active == True)  # noqa: E712
            )).scalars().all()
        }
        pillars = list((await db.execute(
            select(ProjectProgramPillar).order_by(ProjectProgramPillar.order, ProjectProgramPillar.name)
        )).scalars().all())
        pillar_program = {p.id: p.program_id for p in pillars}

        # Nomes e cargos (responsáveis de projeto/Feature/US e dos programas).
        person_ids = {t.assigned_to for t in all_tasks if t.assigned_to}
        person_ids |= {p.responsavel_person_id for p in programs.values() if p.responsavel_person_id}
        people: dict = {}
        if person_ids:
            for pid, name, pos in (await db.execute(
                select(Person.id, Person.full_name, Position.name)
                .outerjoin(Position, Position.id == Person.position_id)
                .where(Person.id.in_(person_ids))
            )).all():
                people[pid] = {"name": name, "position": pos}

        product_ids = {r.linked_product_id for r in roots if r.linked_product_id}
        products = {
            pid: name for pid, name in (await db.execute(
                select(Product.id, Product.name).where(Product.id.in_(product_ids))
            )).all()
        } if product_ids else {}
        labels = await StatusReportService._label_maps(db)
        area_labels = labels.get("area", {})

        # Bloqueio por dependência (mesma regra do Status Report).
        preds_of: dict = {}
        if container_ids:
            for p, s in (await db.execute(
                select(ProjectTaskDependency.predecessor_id, ProjectTaskDependency.successor_id)
                .where(ProjectTaskDependency.project_id.in_(container_ids))
            )).all():
                preds_of.setdefault(s, []).append(p)

        def dep_blocked(t) -> bool:
            if is_final(t):
                return False
            return any(by_id.get(p) is not None and not is_final(by_id[p]) for p in preds_of.get(t.id, []))

        # Histórico: raiz (roadmap) e US (evolução no mês).
        history: dict = {}
        hist_ids = set(root_ids) | us_ids
        first_history: Optional[datetime] = None
        if hist_ids:
            first_history = (await db.execute(select(func.min(ProjectTaskStatusHistory.moved_at)))).scalar()
            for h in (await db.execute(
                select(ProjectTaskStatusHistory)
                .where(ProjectTaskStatusHistory.task_id.in_(hist_ids))
                .order_by(ProjectTaskStatusHistory.moved_at)
            )).scalars().all():
                history.setdefault(h.task_id, []).append(h)
        delta_ok = first_history is not None and first_history <= then

        def status_name_flags(sid, name_hint):
            st = status_by_id.get(sid) if sid else None
            if st is not None:
                return st.name, bool(st.is_final), ProjectTaskService._is_assisted_operation_status(st)
            return name_hint, False, False

        def exec_then(root, sub) -> float:
            existed, sid, sname = status_at(root.created_at, root.status_id, history.get(root.id, []), then)
            if not existed:
                return 0.0
            name, fin, oa = status_name_flags(sid, sname)
            if roadmap_phase(name, is_final=fin, is_oa=oa) == "planejamento":
                return 0.0
            tot = 0.0
            n = 0
            for t in sub:
                if t.id not in us_ids:
                    continue
                existed, sid, sname = status_at(t.created_at, t.status_id, history.get(t.id, []), then)
                if not existed:
                    continue
                if sid is not None and stage_bucket.get(sid) == "nao_realizado":
                    continue
                st = status_by_id.get(sid) if sid else None
                done = (t.completed_at is not None and t.completed_at <= then) or bool(st and st.is_final)
                tot += 100.0 if done else stage_weight.get(sid, 0.0)
                n += 1
            return round(tot / n) if n else 0.0

        def person(pid) -> Optional[dict]:
            return people.get(pid) if pid else None

        def item_node(t, *, feature: bool) -> dict:
            code, title = split_code(t.title)
            fin = is_final(t)
            not_started = bool(t.status is not None and t.status.is_initial) and not fin
            imp = impeded(t) or (feature and bool(t.us_impediment_active))
            return {
                "id": str(t.id),
                "code": code,
                "title": title,
                "start_date": _iso(_d(t.start_date)),
                "due_date": _iso(_d(t.due_date)),
                "completed_at": _iso(_d(t.completed_at)),
                "stage_name": t.status.name if t.status else None,
                "status": item_status(
                    final=fin, impediment=imp,
                    overdue=(not fin and t.due_date is not None and _d(t.due_date) < today),
                    not_started=not_started, has_due=t.due_date is not None,
                ),
                "responsavel": (person(t.assigned_to) or {}).get("name"),
            }

        def feature_phase(t) -> str:
            if is_final(t):
                return "concluido"
            name = (t.status.name if t.status else "") or ""
            if t.status is not None and t.status.is_initial:
                return "planejamento"
            if PoSyncService._HOMOLOG_PAT.search(name):
                return "homologacao"
            return "desenvolvimento"

        projects: list[dict] = []
        for root in roots:
            rp = roadmap_phase(
                root.status.name if root.status else None,
                is_final=bool(root.status and root.status.is_final),
                is_oa=ProjectTaskService._is_assisted_operation_status(root.status),
            )
            cancelled = rp == "cancelado"
            sub_ids = PoPortfolioService._subtree(root.id, children)
            sub = [by_id[i] for i in sub_ids if i in by_id]
            excl = {t.id for t in sub if bucket(t) == "nao_realizado"}
            eff = [t for t in sub if t.id not in excl]
            fase = PoSyncService._project_phase(root)
            stage = root.status.name if root.status else None
            paused = "paus" in (stage or "").lower()
            delivered = ProjectTaskService._is_delivered_planning_status(root.status)
            exec_pct = 0 if fase == "planejamento" else PoSyncService._exec_progress(sub, excl, us_ids, stage_weight)
            if rp == "concluido":
                exec_pct = 100

            overdue = any(
                not is_final(t) and (t.sla_state == "breached" or (t.due_date is not None and _d(t.due_date) < today))
                for t in eff
            )
            expected = None
            if root.start_date and root.due_date and root.due_date > root.start_date:
                span = (root.due_date - root.start_date).total_seconds()
                expected = max(0, min(100, round(100 * (now - root.start_date).total_seconds() / span)))
            lagging = fase != "planejamento" and expected is not None and exec_pct < expected - PROGRESS_LAG_TOLERANCE
            us_impeded = any(t.id in us_ids and not is_final(t) and impeded(t) for t in eff)
            blocked = fase == "impedimento" or paused or us_impeded or any(dep_blocked(t) for t in eff)
            health = health_of(delivered=delivered, overdue=overdue, lagging=lagging, blocked=blocked)

            # Features e US da árvore.
            feats = [t for t in eff if t.id != root.id and ProjectTaskService._is_feature_funnel_name(funnel_of(t))]
            feat_ids = {t.id for t in feats}
            stories = [t for t in eff if t.id != root.id and t.id in us_ids]
            us_by_feature: dict = {}
            orphans = []
            for t in stories:
                if t.parent_task_id in feat_ids:
                    us_by_feature.setdefault(t.parent_task_id, []).append(t)
                else:
                    orphans.append(t)

            def sort_key(t):
                d = t.start_date or t.due_date
                return (d is None, d or datetime.max, t.order or 0, t.title or "")

            features_out = []
            for f in sorted(feats, key=sort_key):
                us = sorted(us_by_feature.get(f.id, []), key=sort_key)
                if us:
                    f_exec = round(sum(100.0 if is_final(u) else stage_weight.get(u.status_id, 0.0) for u in us) / len(us))
                else:
                    f_exec = 100 if is_final(f) else round(stage_weight.get(f.status_id, 0.0))
                node = item_node(f, feature=True)
                node.update({
                    "phase": feature_phase(f),
                    "exec_pct": f_exec,
                    "stories": [
                        {**item_node(u, feature=False),
                         "exec_pct": 100 if is_final(u) else round(stage_weight.get(u.status_id, 0.0))}
                        for u in us
                    ],
                })
                features_out.append(node)
            orphans_out = [
                {**item_node(u, feature=False),
                 "exec_pct": 100 if is_final(u) else round(stage_weight.get(u.status_id, 0.0))}
                for u in sorted(orphans, key=sort_key)
            ]

            upcoming = sorted(
                (f for f in feats if not is_final(f) and f.due_date is not None and _d(f.due_date) >= today),
                key=lambda f: f.due_date,
            )
            next_ms = None
            if upcoming:
                next_ms = {"title": split_code(upcoming[0].title)[1], "date": _iso(_d(upcoming[0].due_date))}

            hours = sum(float(t.estimated_hours or 0) for t in stories)
            if hours <= 0:
                hours = sum(float(t.estimated_hours or 0) for t in feats)
            if hours <= 0:
                hours = float(root.estimated_hours or 0)

            score = scores.get(root.id)
            program = programs.get(root.linked_program_id) if root.linked_program_id else None
            pillar_id = root.program_pillar_id if (
                program is not None and root.program_pillar_id
                and pillar_program.get(root.program_pillar_id) == program.id
            ) else None

            # Roadmap: pontos de mudança de fase do card-raiz (a origem entra com a fase "de"
            # do 1º movimento registrado).
            origin = _d(root.created_at) or today
            if root.start_date is not None:
                origin = min(origin, _d(root.start_date))
            points: list[tuple[date, str]] = []
            hist = history.get(root.id, [])
            if hist and (hist[0].from_status_id or hist[0].from_status_name):
                fname, ffin, foa = status_name_flags(hist[0].from_status_id, hist[0].from_status_name)
                points.append((origin, roadmap_phase(fname, is_final=ffin, is_oa=foa)))
            for h in hist:
                name, fin, oa = status_name_flags(h.to_status_id, h.to_status_name)
                ph = roadmap_phase(name, is_final=fin, is_oa=oa)
                if not points or points[-1][1] != ph:
                    points.append((h.moved_at.date(), ph))
            us_starts = [_d(t.start_date) for t in stories if t.start_date and not is_final(t)]
            us_dues = [_d(t.due_date) for t in stories if t.due_date]
            roadmap = build_roadmap(
                today=today, origin=origin, current=rp, points=points,
                us_start_min=min(us_starts) if us_starts else None,
                us_due_max=max(us_dues) if us_dues else None,
                due=_d(root.due_date),
                oa_days=program.oa_days if (program is not None and program.oa_days is not None) else 30,
                oa_entered=_d(root.assisted_op_entered_at),
                delivered_on=_d(root.completed_at or root.assisted_op_entered_at or root.status_entered_at),
            )

            project_status = item_status(
                final=delivered, impediment=fase == "impedimento",
                overdue=(not delivered and root.due_date is not None and _d(root.due_date) < today),
                not_started=fase == "planejamento", has_due=root.due_date is not None,
            )
            updated = max((t.updated_at for t in sub if t.updated_at), default=root.updated_at)
            projects.append({
                "task_id": str(root.id),
                "title": root.title,
                "subtitle": products.get(root.linked_product_id),
                "planning_kind": root.planning_kind,
                "program_id": str(program.id) if program is not None else None,
                "program_name": program.name if program is not None else None,
                "pillar_id": str(pillar_id) if pillar_id else None,
                "area": root.area,
                "area_label": area_labels.get(root.area, root.area) if root.area else None,
                "quadrant_code": score.quadrant_code if score else None,
                "impact": float(score.impacto_efetivo) if score else None,
                "effort": float(score.esforco) if score else None,
                "hours": round(hours, 1),
                "phase": fase,
                "roadmap_phase": rp,
                "stage_name": stage,
                "status": "cancelado" if cancelled else status_of(fase, paused),
                "cancelled": cancelled,
                "item_status": project_status,
                "health": health,
                "exec_pct": int(exec_pct),
                "exec_then": exec_then(root, eff) if delta_ok else None,
                "next_milestone": next_ms,
                "start_date": _iso(_d(root.start_date)),
                "due_date": _iso(_d(root.due_date)),
                "delivered_at": _iso(_d(ProjectTaskService._delivered_at(root))) if delivered else None,
                "in_assisted_operation": rp == "operacao_assistida",
                "po_name": (person(root.assigned_to) or {}).get("name"),
                "po": person(root.assigned_to),
                "feature_count": len(feats),
                "feature_done": sum(1 for f in feats if is_final(f)),
                "story_count": len(stories),
                "story_done": sum(1 for t in stories if is_final(t)),
                "updated_at": _iso(updated),
                "features": features_out,
                "orphan_stories": orphans_out,
                "roadmap": roadmap,
            })

        programs_out = {}
        for p in programs.values():
            owner = person(p.responsavel_person_id)
            programs_out[str(p.id)] = {
                "id": str(p.id), "name": p.name, "description": p.description,
                "icon": p.icon, "color": p.color, "oa_days": p.oa_days if p.oa_days is not None else 30,
                "owner": owner, "updated_at": _iso(p.updated_at),
            }
        pillars_out = [
            {"id": str(p.id), "program_id": str(p.program_id), "name": p.name, "description": p.description,
             "icon": p.icon, "color": p.color, "order": p.order}
            for p in pillars if str(p.program_id) in programs_out
        ]
        return {
            "generated_at": _iso(now),
            "delta_days": _DELTA_DAYS if delta_ok else None,
            "cuts": {"impact": impact_cut, "effort": effort_cut},
            "quadrants": quadrants,
            "criteria": criteria,
            "programs": programs_out,
            "pillars": pillars_out,
            "projects": projects,
        }

    # ── agregação ─────────────────────────────────────────────────────────────
    @staticmethod
    def _summary(p: dict) -> dict:
        """Projeto sem a árvore (Features/US) e sem o roadmap."""
        return {k: v for k, v in p.items() if k not in ("features", "orphan_stories", "roadmap", "exec_then", "po")}

    @staticmethod
    def _mean(values: list) -> Optional[int]:
        values = [v for v in values if v is not None]
        return round(sum(values) / len(values)) if values else None

    @classmethod
    def _aggregate(cls, projects: list[dict], cuts: dict) -> dict:
        exec_avg = cls._mean([p["exec_pct"] for p in projects])
        thens = [p.get("exec_then") for p in projects]
        delta = None
        if projects and all(t is not None for t in thens):
            delta = round(sum(p["exec_pct"] for p in projects) / len(projects) - sum(thens) / len(thens))
        scored = [p for p in projects if p["impact"] is not None and p["effort"] is not None]
        impact = sum(p["impact"] for p in scored) / len(scored) if scored else None
        effort = sum(p["effort"] for p in scored) / len(scored) if scored else None
        quadrant = quadrant_for(impact, effort, cuts["impact"], cuts["effort"]) if scored else None
        milestones = [
            {**p["next_milestone"], "project_title": p["title"], "task_id": p["task_id"]}
            for p in projects if p.get("next_milestone")
        ]
        next_ms = min(milestones, key=lambda m: m["date"]) if milestones else None
        fases: dict = {}
        for p in projects:
            fases[p["phase"]] = fases.get(p["phase"], 0) + 1
        return {
            "project_count": len(projects),
            "exec_avg": exec_avg,
            "exec_delta": delta,
            "health": aggregate_health(p["health"] for p in projects),
            "status": aggregate_status(p["status"] for p in projects),
            "quadrant_code": quadrant,
            "impact": round(impact, 2) if impact is not None else None,
            "effort": round(effort, 2) if effort is not None else None,
            "hours": round(sum(p["hours"] or 0 for p in projects), 1),
            "next_milestone": next_ms,
            "phase_counts": fases,
            "updated_at": max((p["updated_at"] for p in projects if p.get("updated_at")), default=None),
        }

    @classmethod
    def _program_card(cls, base: dict, program_id: str, projects: list[dict], scope: dict) -> dict:
        prog = base["programs"][program_id]
        pid = uuid.UUID(program_id)
        full = scope.get("all") or pid in scope["programs"]
        role = scope["programs"].get(pid) or None
        pillar_ids = {p["pillar_id"] for p in projects if p["pillar_id"]}
        return {
            **{k: prog[k] for k in ("id", "name", "description", "icon", "color", "owner")},
            **cls._aggregate(projects, base["cuts"]),
            "pillar_count": len(pillar_ids),
            "access": "programa" if full else "projetos",
            "role_label": role or None,
        }

    # ── endpoints ─────────────────────────────────────────────────────────────
    @classmethod
    async def portfolio(cls, db: AsyncSession, user_id: uuid.UUID) -> dict:
        scope = await cls._scope(db, user_id)
        base = await cls._base(db)
        visible = cls._visible(base, scope)
        by_program: dict = {}
        for p in visible:
            if p["program_id"] and p["program_id"] in base["programs"]:
                by_program.setdefault(p["program_id"], []).append(p)
        programs = [cls._program_card(base, pid, ps, scope) for pid, ps in by_program.items()]
        programs.sort(key=lambda x: x["name"].lower())
        areas = sorted(
            {(p["area"], p["area_label"]) for p in visible if p["area"]}, key=lambda a: (a[1] or "").lower(),
        )
        return {
            "generated_at": base["generated_at"],
            "updated_at": max((p["updated_at"] for p in visible if p.get("updated_at")), default=None),
            "delta_days": base["delta_days"],
            "cuts": base["cuts"],
            "quadrants": base["quadrants"],
            "criteria": base["criteria"],
            "areas": [{"value": v, "label": lbl} for v, lbl in areas],
            "programs": programs,
            "projects": sorted((cls._summary(p) for p in visible), key=lambda p: p["title"].lower()),
            "summary": cls._aggregate(visible, base["cuts"]) if visible else None,
            "viewer": cls._viewer(scope),
        }

    @classmethod
    async def program(cls, db: AsyncSession, user_id: uuid.UUID, program_id: uuid.UUID) -> dict:
        scope = await cls._scope(db, user_id)
        base = await cls._base(db)
        key = str(program_id)
        if key not in base["programs"]:
            raise HTTPException(status_code=404, detail="Programa não encontrado.")
        projects = [p for p in cls._visible(base, scope) if p["program_id"] == key]
        if not projects and program_id not in scope["programs"] and not scope["all"]:
            raise HTTPException(status_code=404, detail="Programa não encontrado.")
        card = cls._program_card(base, key, projects, scope)

        sponsors = await cls._sponsors(db, program_id=program_id)

        pillars = []
        by_pillar: dict = {}
        for p in projects:
            by_pillar.setdefault(p["pillar_id"], []).append(p)
        for pl in base["pillars"]:
            if pl["program_id"] != key or pl["id"] not in by_pillar:
                continue
            pillars.append({**pl, **cls._aggregate(by_pillar[pl["id"]], base["cuts"])})
        if None in by_pillar:
            pillars.append({
                "id": None, "program_id": key, "name": "Sem pilar", "description": None,
                "icon": None, "color": None, "order": 10_000,
                **cls._aggregate(by_pillar[None], base["cuts"]),
            })
        return {
            "generated_at": base["generated_at"],
            "delta_days": base["delta_days"],
            "quadrants": base["quadrants"],
            "viewer": cls._viewer(scope),
            "program": {
                **card,
                "oa_days": base["programs"][key]["oa_days"],
                "sponsors": sponsors,
                "partial": not scope["all"] and program_id not in scope["programs"],
            },
            "pillars": pillars,
            "projects": sorted(
                ({k: v for k, v in p.items() if k != "exec_then"} for p in projects),
                key=lambda p: p["title"].lower(),
            ),
        }

    @staticmethod
    async def _sponsors(db: AsyncSession, *, task_id: Optional[uuid.UUID] = None,
                        program_id: Optional[uuid.UUID] = None) -> list[dict]:
        """Clientes com função Sponsor no projeto ou no programa (cargo da folha/cadastro)."""
        if task_id is not None:
            q = (select(ProjectClient.full_name, ProjectClient.job_title, ProjectClient.department)
                 .join(ProjectClientAccess, ProjectClientAccess.client_id == ProjectClient.id)
                 .where(ProjectClientAccess.task_id == task_id, ProjectClientAccess.project_role == "sponsor"))
        else:
            q = (select(ProjectClient.full_name, ProjectClient.job_title, ProjectClient.department)
                 .join(ProjectProgramClientAccess, ProjectProgramClientAccess.client_id == ProjectClient.id)
                 .where(ProjectProgramClientAccess.program_id == program_id,
                        ProjectProgramClientAccess.project_role == "sponsor"))
        rows = (await db.execute(
            q.where(ProjectClient.is_active == True).order_by(ProjectClient.full_name)  # noqa: E712
        )).all()
        return [{"name": n, "job_title": j or d} for n, j, d in rows]

    @classmethod
    async def project(cls, db: AsyncSession, user_id: uuid.UUID, task_id: uuid.UUID) -> dict:
        """Projeto no Portal: a mesma visão do programa (indicadores, árvore Feature → US e
        roadmap) para um projeto só. Cancelado abre pelo link, mas não entra nas listas."""
        scope = await cls._scope(db, user_id)
        base = await cls._base(db)
        key = str(task_id)
        item = next((p for p in cls._visible(base, scope, include_cancelled=True) if p["task_id"] == key), None)
        if item is None:
            raise HTTPException(status_code=404, detail="Projeto não encontrado.")
        program = base["programs"].get(item["program_id"]) if item["program_id"] else None
        pillar = next((pl for pl in base["pillars"] if pl["id"] == item["pillar_id"]), None) if item["pillar_id"] else None
        sponsors = await cls._sponsors(db, task_id=task_id)
        if not sponsors and program is not None:
            sponsors = await cls._sponsors(db, program_id=uuid.UUID(program["id"]))
        then = item.get("exec_then")
        return {
            "generated_at": base["generated_at"],
            "delta_days": base["delta_days"],
            "quadrants": base["quadrants"],
            "viewer": cls._viewer(scope),
            "project": {
                **{k: v for k, v in item.items() if k != "exec_then"},
                "exec_delta": round(item["exec_pct"] - then) if then is not None else None,
                "program": {k: program[k] for k in ("id", "name", "icon", "color")} if program else None,
                "pillar": pillar,
                "sponsors": sponsors,
                # Ocorrência é do cliente: só com vínculo de cliente no projeto e o projeto na raia
                # Operação Assistida (a equipe em "modo cliente" não abre ocorrência).
                "accepts_occurrences": task_id in scope["client_tasks"] and item["in_assisted_operation"],
                "occurrences_link": task_id in scope["client_tasks"],
            },
        }

    @classmethod
    async def deliveries(cls, db: AsyncSession, user_id: uuid.UUID) -> dict:
        """Entregas e Marcos: Features concluídas nos últimos 120 dias e as previstas, mais a
        entrega de cada projeto (prevista ou feita)."""
        scope = await cls._scope(db, user_id)
        base = await cls._base(db)
        today = date.today()
        since = today - timedelta(days=120)
        items = []
        for p in cls._visible(base, scope):
            ref = {"task_id": p["task_id"], "project_title": p["title"], "program_name": p["program_name"]}
            for f in p["features"]:
                done = f["status"] == "concluida"
                when = f["completed_at"] if done else f["due_date"]
                if when is None or (done and when < since.isoformat()):
                    continue
                items.append({**ref, "kind": "feature", "id": f["id"], "title": f["title"], "code": f["code"],
                              "date": when, "done": done, "status": f["status"], "phase": f["phase"]})
            if p["delivered_at"]:
                if p["delivered_at"] >= since.isoformat():
                    items.append({**ref, "kind": "projeto", "id": p["task_id"], "title": "Entrega do projeto",
                                  "code": None, "date": p["delivered_at"], "done": True,
                                  "status": "concluida", "phase": p["roadmap_phase"]})
            elif p["due_date"]:
                items.append({**ref, "kind": "projeto", "id": p["task_id"], "title": "Entrega do projeto",
                              "code": None, "date": p["due_date"], "done": False,
                              "status": p["item_status"], "phase": p["roadmap_phase"]})
        items.sort(key=lambda i: (i["date"], i["project_title"].lower()))
        return {"generated_at": base["generated_at"], "items": items}


# ─────────────────────────────────────────────────────────────────────────────
# Gestão do programa (cadastro de Programas): pilares, projetos, clientes
# ─────────────────────────────────────────────────────────────────────────────

class ProgramAdminService:
    """Tela de gestão do programa (`projetos.program.manage`)."""

    @staticmethod
    async def _program(db: AsyncSession, program_id: uuid.UUID) -> ProjectProgram:
        item = await db.get(ProjectProgram, program_id)
        if item is None:
            raise HTTPException(status_code=404, detail="Programa não encontrado.")
        return item

    @classmethod
    async def detail(cls, db: AsyncSession, program_id: uuid.UUID) -> ProgramAdminDetail:
        from app.modules.teamops.models import Person

        program = await cls._program(db, program_id)
        names = await ProjectProgramService._person_names(db, {program.responsavel_person_id})
        pillars = list((await db.execute(
            select(ProjectProgramPillar)
            .where(ProjectProgramPillar.program_id == program_id)
            .order_by(ProjectProgramPillar.order, ProjectProgramPillar.name)
        )).scalars().all())
        pillar_ids = {p.id for p in pillars}
        tasks = list((await db.execute(
            select(ProjectTask)
            .options(selectinload(ProjectTask.status), *_light_task_options())
            .where(
                ProjectTask.linked_program_id == program_id,
                ProjectTask.planning_kind.in_(["projeto", "programa"]),
            )
            .order_by(ProjectTask.title)
        )).scalars().all())
        labels = (await StatusReportService._label_maps(db)).get("area", {})
        po_ids = {t.assigned_to for t in tasks if t.assigned_to}
        po_names = {
            pid: name for pid, name in (await db.execute(
                select(Person.id, Person.full_name).where(Person.id.in_(po_ids))
            )).all()
        } if po_ids else {}
        counts: dict = {}
        rows = []
        for t in tasks:
            pid = t.program_pillar_id if t.program_pillar_id in pillar_ids else None
            if pid:
                counts[pid] = counts.get(pid, 0) + 1
            rows.append(ProgramProjectRow(
                task_id=t.id, title=t.title, planning_kind=t.planning_kind,
                stage_name=t.status.name if t.status else None,
                area=t.area, area_label=labels.get(t.area, t.area) if t.area else None,
                po_name=po_names.get(t.assigned_to), pillar_id=pid,
            ))
        return ProgramAdminDetail(
            program=ProjectProgramService._to_response(program, names),
            pillars=[
                ProgramPillarResponse(
                    id=p.id, program_id=p.program_id, name=p.name, description=p.description,
                    icon=p.icon, color=p.color, order=p.order, project_count=counts.get(p.id, 0),
                ) for p in pillars
            ],
            projects=rows,
        )

    @staticmethod
    async def _pillar(db: AsyncSession, program_id: uuid.UUID, pillar_id: uuid.UUID) -> ProjectProgramPillar:
        item = await db.get(ProjectProgramPillar, pillar_id)
        if item is None or item.program_id != program_id:
            raise HTTPException(status_code=404, detail="Pilar não encontrado.")
        return item

    @staticmethod
    async def _assert_unique_name(db, program_id, name: str, exclude: Optional[uuid.UUID] = None) -> None:
        q = select(ProjectProgramPillar.id).where(
            ProjectProgramPillar.program_id == program_id,
            func.lower(ProjectProgramPillar.name) == name.strip().lower(),
        )
        if exclude is not None:
            q = q.where(ProjectProgramPillar.id != exclude)
        if (await db.execute(q)).first() is not None:
            raise HTTPException(status_code=409, detail="Já existe um pilar com esse nome neste programa.")

    @classmethod
    async def create_pillar(cls, db: AsyncSession, program_id: uuid.UUID, data: ProgramPillarIn) -> ProgramAdminDetail:
        await cls._program(db, program_id)
        await cls._assert_unique_name(db, program_id, data.name)
        order = data.order
        if order is None:
            order = ((await db.execute(
                select(func.max(ProjectProgramPillar.order)).where(ProjectProgramPillar.program_id == program_id)
            )).scalar() or 0) + 1
        db.add(ProjectProgramPillar(
            program_id=program_id, name=data.name.strip(), description=(data.description or None),
            icon=(data.icon or None), color=(data.color or None), order=order,
        ))
        await db.commit()
        return await cls.detail(db, program_id)

    @classmethod
    async def update_pillar(
        cls, db: AsyncSession, program_id: uuid.UUID, pillar_id: uuid.UUID, data: ProgramPillarIn,
    ) -> ProgramAdminDetail:
        item = await cls._pillar(db, program_id, pillar_id)
        await cls._assert_unique_name(db, program_id, data.name, exclude=pillar_id)
        item.name = data.name.strip()
        item.description = data.description or None
        item.icon = data.icon or None
        item.color = data.color or None
        if data.order is not None:
            item.order = data.order
        item.updated_at = datetime.utcnow()
        await db.commit()
        return await cls.detail(db, program_id)

    @classmethod
    async def delete_pillar(cls, db: AsyncSession, program_id: uuid.UUID, pillar_id: uuid.UUID) -> ProgramAdminDetail:
        item = await cls._pillar(db, program_id, pillar_id)
        await db.execute(
            sa_update(ProjectTask).where(ProjectTask.program_pillar_id == pillar_id).values(program_pillar_id=None)
        )
        await db.delete(item)
        await db.commit()
        return await cls.detail(db, program_id)

    @classmethod
    async def set_project_pillar(
        cls, db: AsyncSession, program_id: uuid.UUID, task_id: uuid.UUID, pillar_id: Optional[uuid.UUID],
    ) -> ProgramAdminDetail:
        task = await db.get(ProjectTask, task_id)
        if task is None or task.linked_program_id != program_id:
            raise HTTPException(status_code=404, detail="Projeto não pertence a este programa.")
        if pillar_id is not None:
            await cls._pillar(db, program_id, pillar_id)
        task.program_pillar_id = pillar_id
        task.updated_at = datetime.utcnow()
        await db.commit()
        return await cls.detail(db, program_id)

    @classmethod
    async def suggest_from_area(cls, db: AsyncSession, program_id: uuid.UUID) -> ProgramPillarSuggestResult:
        """Projetos sem pilar ganham o pilar com o nome da Área do card (criado se faltar).
        Só um ponto de partida: o PO renomeia, junta e reatribui depois."""
        await cls._program(db, program_id)
        labels = (await StatusReportService._label_maps(db)).get("area", {})
        pillars = list((await db.execute(
            select(ProjectProgramPillar).where(ProjectProgramPillar.program_id == program_id)
        )).scalars().all())
        by_name = {p.name.strip().lower(): p for p in pillars}
        valid = {p.id for p in pillars}
        next_order = max((p.order for p in pillars), default=0) + 1
        tasks = list((await db.execute(
            select(ProjectTask).options(*_light_task_options()).where(
                ProjectTask.linked_program_id == program_id,
                ProjectTask.planning_kind.in_(["projeto", "programa"]),
            )
        )).scalars().all())
        created = assigned = 0
        for t in tasks:
            if t.program_pillar_id in valid or not t.area:
                continue
            name = (labels.get(t.area) or t.area).strip()[:120]
            pillar = by_name.get(name.lower())
            if pillar is None:
                pillar = ProjectProgramPillar(program_id=program_id, name=name, order=next_order)
                next_order += 1
                db.add(pillar)
                await db.flush()
                by_name[name.lower()] = pillar
                valid.add(pillar.id)
                created += 1
            t.program_pillar_id = pillar.id
            t.updated_at = datetime.utcnow()
            assigned += 1
        await db.commit()
        return ProgramPillarSuggestResult(created=created, assigned=assigned, detail=await cls.detail(db, program_id))

    # ── clientes do programa ────────────────────────────────────────────────
    @classmethod
    async def list_clients(cls, db: AsyncSession, program_id: uuid.UUID) -> ProjectClientMembers:
        await cls._program(db, program_id)
        rows = (await db.execute(
            select(ProjectProgramClientAccess, ProjectClient)
            .join(ProjectClient, ProjectClient.id == ProjectProgramClientAccess.client_id)
            .where(ProjectProgramClientAccess.program_id == program_id)
            .order_by(ProjectClient.full_name)
        )).all()
        user_ids = [c.user_id for _, c in rows if c.user_id]
        users: dict = {}
        if user_ids:
            users = {u.id: u for u in (await db.execute(select(User).where(User.id.in_(user_ids)))).scalars()}
        client_role_ids = set((await db.execute(select(Role.id).where(Role.name == CLIENT_ROLE_NAME))).scalars().all())
        members = []
        for access, c in rows:
            u = users.get(c.user_id) if c.user_id else None
            members.append(ProjectClientMember(
                client_id=c.id, full_name=c.full_name, email=c.email, department=c.department,
                organization=c.organization, job_title=c.job_title,
                project_role=access.project_role, project_role_other=access.project_role_other,
                project_role_label=project_role_label(access.project_role, access.project_role_other),
                has_login=u is not None, is_internal_user=bool(u and u.role_id not in client_role_ids),
                is_active=c.is_active, added_at=access.created_at,
            ))
        return ProjectClientMembers(can_manage=True, members=members)

    @staticmethod
    async def _linked_ids(db: AsyncSession, program_id: uuid.UUID) -> set[uuid.UUID]:
        return set((await db.execute(
            select(ProjectProgramClientAccess.client_id).where(ProjectProgramClientAccess.program_id == program_id)
        )).scalars().all())

    @classmethod
    async def search_candidates(cls, db: AsyncSession, program_id: uuid.UUID, q: str, tenant_id: uuid.UUID):
        await cls._program(db, program_id)
        return await ProjectClientService.search_candidates(
            db, None, q, tenant_id, linked_client_ids=await cls._linked_ids(db, program_id),
        )

    @classmethod
    async def add_client(
        cls, db: AsyncSession, program_id: uuid.UUID, data: ProjectClientMemberAdd,
        tenant_id: uuid.UUID, created_by: uuid.UUID,
    ) -> ProjectClientMembers:
        from app.core.cache import invalidate_user

        await cls._program(db, program_id)
        client = await ProjectClientService.client_for_link(
            db, data, tenant_id, created_by, note="Cadastrado como cliente do programa",
        )
        if client.id in await cls._linked_ids(db, program_id):
            raise HTTPException(status_code=409, detail=f"{client.full_name} já é cliente deste programa.")
        reactivated = await ProjectClientService.reactivate_for_link(db, client, tenant_id)
        db.add(ProjectProgramClientAccess(
            client_id=client.id, program_id=program_id,
            project_role=data.project_role, project_role_other=data.project_role_other,
            created_by=created_by,
        ))
        client.updated_at = datetime.utcnow()
        await db.commit()
        if reactivated:
            await invalidate_user(reactivated)
        return await cls.list_clients(db, program_id)

    @staticmethod
    async def _access(db: AsyncSession, program_id: uuid.UUID, client_id: uuid.UUID) -> ProjectProgramClientAccess:
        row = (await db.execute(
            select(ProjectProgramClientAccess).where(
                ProjectProgramClientAccess.program_id == program_id,
                ProjectProgramClientAccess.client_id == client_id,
            )
        )).scalar_one_or_none()
        if row is None:
            raise HTTPException(status_code=404, detail="Esta pessoa não é cliente do programa.")
        return row

    @classmethod
    async def update_client(
        cls, db: AsyncSession, program_id: uuid.UUID, client_id: uuid.UUID, data: ProjectClientMemberUpdate,
    ) -> ProjectClientMembers:
        row = await cls._access(db, program_id, client_id)
        row.project_role = data.project_role
        row.project_role_other = data.project_role_other
        await db.commit()
        return await cls.list_clients(db, program_id)

    @classmethod
    async def remove_client(cls, db: AsyncSession, program_id: uuid.UUID, client_id: uuid.UUID) -> ProjectClientMembers:
        """Tira só o vínculo com o programa; o cadastro e os projetos do cliente ficam."""
        row = await cls._access(db, program_id, client_id)
        await db.delete(row)
        await db.commit()
        return await cls.list_clients(db, program_id)
