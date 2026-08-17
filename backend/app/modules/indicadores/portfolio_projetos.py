"""Métricas de portfólio calculadas do módulo PROJETOS (indicadores táticos de TI).

Complementa a fonte `portfolio` original (Produtos) com métricas derivadas de
`ProjectTask`: cumprimento de cronograma, desvio de trabalho vs baseline, taxa de
implantação, tempo de análise da oportunidade (Demanda → Projeto), lead time de US,
SLA estourado, impedimento e adoção de IA.

Desenho:
  - `load_dataset(db)` carrega TUDO uma vez (mesmo padrão do preload de Produtos) e
    resolve etapa/US/cancelamento em memória — sem lazy-load async nem N+1.
  - `calc(metrica, ds, inicio, fim, today)` é puro/síncrono e devolve
    `(num, den, valor)` para o período do acompanhamento, ou **None = "não
    computável"** (sentinela: o chamador preserva o valor gravado — usado pelas
    métricas de ESTADO CORRENTE fora do período que contém hoje).
"""

from __future__ import annotations

import uuid
from dataclasses import dataclass, field
from datetime import date, datetime
from typing import Optional

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.indicadores.models import FontePortfolioMetrica as M

# Métricas calculadas deste módulo (as demais são do dataset de Produtos).
PROJETOS_METRICAS = frozenset({
    M.CRONOGRAMA_DESENVOLVIMENTO, M.CRONOGRAMA_IMPLANTACAO,
    M.DESVIO_TRABALHO_DESENVOLVIMENTO, M.DESVIO_TRABALHO_IMPLANTACAO,
    M.PCT_DESENVOLVIMENTO, M.TEMPO_ANALISE_OPORTUNIDADE, M.LEAD_TIME_US,
    M.PCT_SLA_ESTOURADO, M.TAXA_IMPEDIMENTO, M.PCT_PROJETOS_IA,
})

# Sem histórico de transições de etapa: sla_state e etapa atual são estado CORRENTE.
# Estas métricas só computam no período que contém hoje; meses passados são preenchidos
# ao vivo mês a mês e congelados no fechamento (fluxo `bloqueado` existente).
METRICAS_ESTADO_CORRENTE = frozenset({M.PCT_SLA_ESTOURADO, M.TAXA_IMPEDIMENTO})

_CRONOGRAMA_CLS = {
    M.CRONOGRAMA_DESENVOLVIMENTO: "desenvolvimento",
    M.CRONOGRAMA_IMPLANTACAO: "implantacao",
}
_DESVIO_CLS = {
    M.DESVIO_TRABALHO_DESENVOLVIMENTO: "desenvolvimento",
    M.DESVIO_TRABALHO_IMPLANTACAO: "implantacao",
}


def dataset_key(metrica: Optional[M]) -> str:
    """Chave de cache por DATASET (métricas que compartilham o mesmo preload)."""
    m = metrica or M.SERVICOS_PUBLICADOS
    if m in PROJETOS_METRICAS:
        return "projetos"
    if m == M.DOCUMENTOS_NATOS_DIGITAIS:
        return "produtos_documentos"
    return "produtos_servicos"


@dataclass
class ProjetosDataset:
    """Snapshot em memória do board de projetos para os calculadores puros."""
    tasks: list = field(default_factory=list)
    by_id: dict = field(default_factory=dict)
    us_ids: set = field(default_factory=set)
    cancelled_ids: set = field(default_factory=set)      # em etapa "Não realizado"
    impedimento_ids: set = field(default_factory=set)    # em etapa de impedimento (agora)
    final_status_ids: set = field(default_factory=set)   # etapas is_final
    roots: list = field(default_factory=list)            # planning_kind ∈ {projeto, programa}
    subtree_by_root: dict = field(default_factory=dict)  # root_id → [ids] (inclui a raiz)
    baseline_v1_ids: dict = field(default_factory=dict)  # root_id → {task_id} do plano v1


async def load_dataset(db: AsyncSession) -> ProjetosDataset:
    # Imports locais (padrão do módulo RTD): evita ciclo e custo de import na subida.
    from app.modules.projetos.models import (
        ProjectScheduleBaseline, ProjectStatusConfig, ProjectTask,
    )
    from app.modules.projetos.service import (
        CapacityService, PoPortfolioService, PoSyncService,
    )

    tasks = list((await db.execute(select(ProjectTask))).scalars().all())
    status_rows = (await db.execute(
        select(ProjectStatusConfig.id, ProjectStatusConfig.name, ProjectStatusConfig.is_final)
    )).all()

    ds = ProjetosDataset(tasks=tasks, by_id={t.id: t for t in tasks})
    for sid, name, is_final in status_rows:
        if is_final:
            ds.final_status_ids.add(sid)
    cancelled_status = {
        sid for sid, name, _f in status_rows
        if PoSyncService._NAO_REALIZADO_PAT.search(name or "")
    }
    impedimento_status = {
        sid for sid, name, _f in status_rows
        if PoSyncService._IMPEDIMENTO_PAT.search(name or "")
    }
    children: dict = {}
    for t in tasks:
        if t.status_id in cancelled_status:
            ds.cancelled_ids.add(t.id)
        if t.status_id in impedimento_status:
            ds.impedimento_ids.add(t.id)
        if t.parent_task_id:
            children.setdefault(t.parent_task_id, []).append(t.id)

    ds.roots = [t for t in tasks if (t.planning_kind or "") in ("projeto", "programa")]
    for root in ds.roots:
        ds.subtree_by_root[root.id] = PoPortfolioService._subtree(root.id, children)

    ds.us_ids = {t.id for t in await CapacityService._keep_us_tasks_only(db, tasks)}

    # Plano comprometido autoritativo = snapshot da baseline v1 (quando existe).
    b_rows = (await db.execute(
        select(ProjectScheduleBaseline.root_task_id, ProjectScheduleBaseline.snapshot)
        .where(ProjectScheduleBaseline.version == 1)
    )).all()
    for root_id, snapshot in b_rows:
        ids: set = set()
        for raw in (snapshot or {}).get("tasks", []):
            tid = raw.get("task_id")
            try:
                ids.add(uuid.UUID(str(tid)))
            except (ValueError, TypeError, AttributeError):
                continue
        if ids:
            ds.baseline_v1_ids[root_id] = ids
    return ds


def _d(val) -> Optional[date]:
    if isinstance(val, datetime):
        return val.date()
    return val


def _pct(num: int, den: int) -> Optional[float]:
    return round(num / den * 100, 2) if den else None


def _media_dias(vals: list[float]) -> Optional[float]:
    return round(sum(vals) / len(vals), 1) if vals else None


def calc(
    metrica: M,
    ds: ProjetosDataset,
    periodo_inicio: date,
    periodo_fim: date,
    today: date,
) -> Optional[tuple[float, float, Optional[float]]]:
    """Realizado do período. `None` = não computável (preservar valor gravado);
    `(num, den, None)` = computável porém sem população (den=0)."""

    def _no_periodo(d: Optional[date]) -> bool:
        return d is not None and periodo_inicio <= d <= periodo_fim

    # ▲ % de entregas (itens da subárvore) com prazo no período concluídas dentro do prazo.
    if metrica in _CRONOGRAMA_CLS:
        alvo = _CRONOGRAMA_CLS[metrica]
        num = den = 0
        for root in ds.roots:
            if root.planning_kind != "projeto" or root.card_classification != alvo:
                continue
            if root.id in ds.cancelled_ids:
                continue
            for tid in ds.subtree_by_root.get(root.id, []):
                if tid == root.id or tid in ds.cancelled_ids:
                    continue
                t = ds.by_id[tid]
                due = _d(t.due_date)
                if not _no_periodo(due):
                    continue
                den += 1
                if t.completed_at is not None and _d(t.completed_at) <= due:
                    num += 1
        return (num, den, _pct(num, den))

    # ▼ % do plano comprometido que entrou de trabalho NOVO neste período.
    # Denominador FIXO = tarefas planejadas (baseline v1; fallback: criadas até o commit).
    if metrica in _DESVIO_CLS:
        alvo = _DESVIO_CLS[metrica]
        num = den = 0
        for root in ds.roots:
            if root.planning_kind != "projeto" or root.card_classification != alvo:
                continue
            if root.id in ds.cancelled_ids:
                continue
            sc = root.schedule_committed_at
            if sc is None or _d(sc) > periodo_fim:
                continue
            sub = [
                ds.by_id[tid]
                for tid in ds.subtree_by_root.get(root.id, [])
                if tid != root.id and tid not in ds.cancelled_ids
            ]
            plan_ids = ds.baseline_v1_ids.get(root.id)
            if plan_ids is None:
                plan_ids = {t.id for t in sub if t.created_at is not None and t.created_at <= sc}
            plan_ids = plan_ids - {root.id}
            den += len(plan_ids)
            num += sum(
                1 for t in sub
                if t.id not in plan_ids
                and t.created_at is not None and t.created_at > sc
                and _no_periodo(_d(t.created_at))
            )
        return (num, den, _pct(num, den))

    # ▲ mix da CARTEIRA classificada até o fim do período (acumulado):
    # desenvolvimentos ÷ (desenvolvimentos + implantações). Quanto mais a TI
    # desenvolve (vs implantar solução de mercado), melhor.
    if metrica == M.PCT_DESENVOLVIMENTO:
        num = den = 0
        for t in ds.tasks:
            if t.planning_kind != "projeto" or t.id in ds.cancelled_ids:
                continue
            criado = _d(t.created_at)
            if criado is None or criado > periodo_fim:
                continue
            if t.card_classification == "desenvolvimento":
                num += 1
                den += 1
            elif t.card_classification == "implantacao":
                den += 1
        return (num, den, _pct(num, den))

    # ▼ dias médios entre a demanda de origem e o projeto nascer (proxy do tempo de análise).
    if metrica == M.TEMPO_ANALISE_OPORTUNIDADE:
        vals: list[float] = []
        for t in ds.tasks:
            if (t.planning_kind or "") not in ("projeto", "programa") or not t.origin_task_id:
                continue
            if not _no_periodo(_d(t.created_at)):
                continue
            origem = ds.by_id.get(t.origin_task_id)
            if origem is None or origem.created_at is None:
                continue
            dias = (t.created_at - origem.created_at).total_seconds() / 86400
            if dias >= 0:
                vals.append(dias)
        n = len(vals)
        return (n, n, _media_dias(vals))

    # ▼ dias médios do backlog à entrega das US concluídas no período.
    if metrica == M.LEAD_TIME_US:
        vals = []
        for t in ds.tasks:
            if t.id not in ds.us_ids or t.id in ds.cancelled_ids:
                continue
            if not _no_periodo(_d(t.completed_at)) or t.left_backlog_at is None:
                continue
            dias = (t.completed_at - t.left_backlog_at).total_seconds() / 86400
            if dias >= 0:
                vals.append(dias)
        n = len(vals)
        return (n, n, _media_dias(vals))

    # ▼ estado corrente: só o período que contém hoje é computável.
    if metrica in METRICAS_ESTADO_CORRENTE:
        if not (periodo_inicio <= today <= periodo_fim):
            return None
        ativas = [
            t for t in ds.tasks
            if t.id in ds.us_ids
            and t.completed_at is None
            and t.id not in ds.cancelled_ids
            and t.status_id not in ds.final_status_ids
        ]
        if metrica == M.PCT_SLA_ESTOURADO:
            com_sla = [t for t in ativas if (t.sla_state or "none") != "none"]
            num = sum(1 for t in com_sla if t.sla_state == "breached")
            return (num, len(com_sla), _pct(num, len(com_sla)))
        num = sum(1 for t in ativas if t.id in ds.impedimento_ids)
        return (num, len(ativas), _pct(num, len(ativas)))

    # ▲ adoção de IA nos projetos criados até o fim do período (acumulada, recomputável).
    if metrica == M.PCT_PROJETOS_IA:
        num = den = 0
        for t in ds.tasks:
            if t.planning_kind != "projeto" or t.id in ds.cancelled_ids:
                continue
            criado = _d(t.created_at)
            if criado is None or criado > periodo_fim:
                continue
            if t.ia_assisted is None:
                continue
            den += 1
            if t.ia_assisted is True:
                num += 1
        return (num, den, _pct(num, den))

    raise ValueError(f"Métrica de projetos desconhecida: {metrica}")
