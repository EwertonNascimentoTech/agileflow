"""Motor de cronograma (estilo MS Project) — puro e testável.

Planeja em HORAS úteis sobre um `WorkingCalendar` (expediente/almoço/dias úteis/feriados),
combinando:
- cadeia implícita por ORDEM entre irmãos (FS sequencial);
- dependências explícitas FS / SS / FF / SF com lag/lead em horas;
- rollup de pais (start=min filhos, finish=max filhos);
- marcos (duração 0);
- raiz ancorada na data-base do projeto.

Sem I/O: o service monta os nós/arestas (a partir do banco) e chama `schedule_tree`.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from typing import Hashable, Optional

from app.modules.teamops.calendar import WorkingCalendar

DEP_TYPES = ("FS", "SS", "FF", "SF")


@dataclass
class EngineNode:
    id: Hashable
    parent_id: Optional[Hashable]
    order: int
    # Duração planejada em horas úteis. None = não agendável (sem horas e sem datas).
    duration_hours: Optional[float]
    # Critério de desempate estável entre irmãos de mesma ordem.
    tiebreak: str = ""


@dataclass
class EngineEdge:
    predecessor: Hashable
    successor: Hashable
    dep_type: str = "FS"
    lag_hours: float = 0.0


class ScheduleCycleError(ValueError):
    """Levantada quando as dependências explícitas formam um ciclo."""


def detect_cycle(node_ids: list[Hashable], edges: list[EngineEdge]) -> bool:
    """Kahn sobre as arestas explícitas. True se houver ciclo."""
    indeg: dict[Hashable, int] = {n: 0 for n in node_ids}
    adj: dict[Hashable, list[Hashable]] = {n: [] for n in node_ids}
    for e in edges:
        if e.predecessor in indeg and e.successor in indeg:
            adj[e.predecessor].append(e.successor)
            indeg[e.successor] += 1
    queue = [n for n, d in indeg.items() if d == 0]
    seen = 0
    while queue:
        n = queue.pop()
        seen += 1
        for m in adj[n]:
            indeg[m] -= 1
            if indeg[m] == 0:
                queue.append(m)
    return seen != len(node_ids)


def schedule_tree(
    nodes: list[EngineNode],
    edges: list[EngineEdge],
    root_id: Hashable,
    anchor: datetime,
    calendar: WorkingCalendar,
    *,
    max_passes: int = 50,
) -> dict[Hashable, tuple[datetime, datetime]]:
    """Agenda a subárvore de `root_id` e devolve `{id: (start, finish)}`.

    Só são agendados nós da subárvore que sejam agendáveis (têm `duration_hours` ou são marco)
    e pais com ao menos um filho agendado. O início da raiz é fixado na âncora (data-base).
    """
    cal = calendar
    by_id: dict[Hashable, EngineNode] = {n.id: n for n in nodes}
    if root_id not in by_id:
        return {}

    # Filhos por pai, ordenados por (order, tiebreak).
    children: dict[Hashable, list[EngineNode]] = {}
    for n in nodes:
        if n.parent_id is not None:
            children.setdefault(n.parent_id, []).append(n)
    for lst in children.values():
        lst.sort(key=lambda x: (x.order, x.tiebreak))

    # Subárvore (root + descendentes).
    subtree: set[Hashable] = set()
    stack = [root_id]
    while stack:
        cur = stack.pop()
        if cur in subtree:
            continue
        subtree.add(cur)
        for c in children.get(cur, []):
            stack.append(c.id)

    # Arestas explícitas internas à subárvore.
    sub_edges = [e for e in edges if e.predecessor in subtree and e.successor in subtree]
    preds: dict[Hashable, list[EngineEdge]] = {}
    for e in sub_edges:
        preds.setdefault(e.successor, []).append(e)

    if detect_cycle(list(subtree), sub_edges):
        raise ScheduleCycleError("Dependências formam um ciclo; cronograma não pôde ser calculado.")

    def duration_of(n: EngineNode) -> float:
        return float(n.duration_hours or 0.0)

    def schedulable(n: EngineNode) -> bool:
        return n.duration_hours is not None

    anchor = cal.next_start(anchor)
    # Quem tem predecessora explícita não entra na cadeia implícita por ordem (segue a dependência).
    has_pred: set[Hashable] = set(preds.keys())
    sched: dict[Hashable, tuple[datetime, datetime]] = {}
    extra_start: dict[Hashable, datetime] = {}

    def schedule_node(tid: Hashable, lower: datetime):
        node = by_id[tid]
        eb = lower
        el = extra_start.get(tid)
        if el is not None and el > eb:
            eb = el
        eb = cal.next_start(eb)
        kids = children.get(tid, [])
        if kids:
            cursor = eb
            starts: list[datetime] = []
            ends: list[datetime] = []
            for c in kids:
                # Irmão sem predecessora explícita cascateia pela ordem (começa após o anterior);
                # com predecessora, parte do início do pai e a dependência (extra_start) o posiciona.
                base = eb if c.id in has_pred else cursor
                r = schedule_node(c.id, base)
                if r is None:
                    continue
                cs, ce = r
                starts.append(cs)
                ends.append(ce)
                cursor = cal.next_start(ce)
            if not starts:
                return None
            s, e = min(starts), max(ends)
        else:
            if not schedulable(node):
                return None
            s = eb
            e = cal.add_working_hours(s, duration_of(node))
        sched[tid] = (s, e)
        return s, e

    def lower_bound_from(edge: EngineEdge) -> Optional[datetime]:
        pe = sched.get(edge.predecessor)
        if pe is None:
            return None
        p_start, p_finish = pe
        succ = by_id[edge.successor]
        dur = duration_of(succ)
        lag = edge.lag_hours or 0.0
        t = edge.dep_type if edge.dep_type in DEP_TYPES else "FS"
        if t == "FS":
            return cal.add_working_hours(p_finish, lag)
        if t == "SS":
            return cal.add_working_hours(p_start, lag)
        if t == "FF":
            lb_finish = cal.add_working_hours(p_finish, lag)
            return cal.add_working_hours(lb_finish, -dur)
        # SF
        lb_finish = cal.add_working_hours(p_start, lag)
        return cal.add_working_hours(lb_finish, -dur)

    # Ponto fixo: restrições só empurram para frente; converge em poucas passadas.
    for _ in range(max_passes):
        sched = {}
        schedule_node(root_id, anchor)
        new_extra: dict[Hashable, datetime] = {}
        for succ_id, elist in preds.items():
            best: Optional[datetime] = None
            for e in elist:
                lb = lower_bound_from(e)
                if lb is None:
                    continue
                if best is None or lb > best:
                    best = lb
            if best is not None:
                new_extra[succ_id] = best
        if new_extra == extra_start:
            break
        extra_start = new_extra

    # Raiz: início fixo na data-base (não é empurrado); término segue o rollup.
    if root_id in sched:
        sched[root_id] = (anchor, sched[root_id][1])

    return sched


# ── CPM (Critical Path Method) ───────────────────────────────────────────────


@dataclass
class CpmResult:
    early_start: datetime
    early_finish: datetime
    late_start: datetime
    late_finish: datetime
    total_float_hours: float
    free_float_hours: float
    is_critical: bool


def _topo_order(node_ids: list[Hashable], adj: dict[Hashable, list[Hashable]]) -> list[Hashable]:
    """Ordem topológica (Kahn). Em caso de ciclo, devolve os nós restantes em ordem arbitrária
    (não deveria ocorrer — schedule_tree já valida)."""
    indeg: dict[Hashable, int] = {n: 0 for n in node_ids}
    for u in node_ids:
        for v in adj.get(u, []):
            if v in indeg:
                indeg[v] += 1
    queue = [n for n in node_ids if indeg[n] == 0]
    out: list[Hashable] = []
    while queue:
        n = queue.pop()
        out.append(n)
        for v in adj.get(n, []):
            if v in indeg:
                indeg[v] -= 1
                if indeg[v] == 0:
                    queue.append(v)
    if len(out) < len(node_ids):
        out += [n for n in node_ids if n not in set(out)]
    return out


def compute_cpm(
    nodes: list[EngineNode],
    edges: list[EngineEdge],
    root_id: Hashable,
    sched: dict[Hashable, tuple[datetime, datetime]],
    calendar: WorkingCalendar,
) -> dict[Hashable, CpmResult]:
    """Backward pass + folgas sobre o cronograma já calculado (`sched` = ES/EF de cada nó,
    normalmente as datas persistidas). Considera dependências FS/SS/FF/SF, a cadeia implícita
    por ordem entre irmãos e a contenção pai→filho. `total_float == 0` ⇒ tarefa crítica.

    Retorna apenas os nós presentes em `sched` (agendados).
    """
    cal = calendar
    by_id: dict[Hashable, EngineNode] = {n.id: n for n in nodes}
    scheduled = set(sched.keys())
    if not scheduled or root_id not in sched:
        return {}

    # Filhos por pai (apenas agendados), ordenados.
    children: dict[Hashable, list[EngineNode]] = {}
    for n in nodes:
        if n.parent_id is not None and n.id in scheduled and n.parent_id in scheduled:
            children.setdefault(n.parent_id, []).append(n)
    for lst in children.values():
        lst.sort(key=lambda x: (x.order, x.tiebreak))
    parent_of: dict[Hashable, Hashable] = {}
    for p, kids in children.items():
        for c in kids:
            parent_of[c.id] = p

    # Arestas explícitas entre nós agendados.
    explicit = [e for e in edges if e.predecessor in scheduled and e.successor in scheduled]
    has_pred = {e.successor for e in explicit}

    # Arestas implícitas por ordem: filho sem predecessora explícita segue o irmão anterior (FS).
    implicit: list[EngineEdge] = []
    for kids in children.values():
        prev: Optional[Hashable] = None
        for c in kids:
            if prev is not None and c.id not in has_pred:
                implicit.append(EngineEdge(predecessor=prev, successor=c.id, dep_type="FS", lag_hours=0.0))
            prev = c.id

    successors: dict[Hashable, list[EngineEdge]] = {}
    for e in explicit + implicit:
        successors.setdefault(e.predecessor, []).append(e)

    # Grafo de ordenação: pred→succ (explícito+implícito) e filho→pai (pai depende dos filhos).
    adj: dict[Hashable, list[Hashable]] = {n: [] for n in scheduled}
    for e in explicit + implicit:
        adj[e.predecessor].append(e.successor)
    for cid, pid in parent_of.items():
        adj[cid].append(pid)
    order = _topo_order(list(scheduled), adj)

    def dur(nid: Hashable) -> float:
        es, ef = sched[nid]
        return cal.working_hours_between(es, ef)

    project_end = sched[root_id][1]

    late: dict[Hashable, tuple[datetime, datetime]] = {}
    # Backward: do mais tardio para o mais cedo (reverso da ordem topológica).
    for nid in reversed(order):
        es, ef = sched[nid]
        d = dur(nid)
        lf = project_end
        for e in successors.get(nid, []):
            bs, bf = sched[e.successor]
            bls, blf = late.get(e.successor, (bs, bf))
            lag = e.lag_hours or 0.0
            t = e.dep_type if e.dep_type in DEP_TYPES else "FS"
            if t == "FS":
                cand = cal.add_working_hours(bls, -lag)
            elif t == "SS":
                cand = cal.add_working_hours(cal.add_working_hours(bls, -lag), d)
            elif t == "FF":
                cand = cal.add_working_hours(blf, -lag)
            else:  # SF
                cand = cal.add_working_hours(cal.add_working_hours(blf, -lag), d)
            if cand < lf:
                lf = cand
        # Contenção: o filho não pode terminar depois do término tardio do pai.
        pid = parent_of.get(nid)
        if pid is not None and pid in late:
            if late[pid][1] < lf:
                lf = late[pid][1]
        if lf < ef:
            lf = ef  # nunca antes do término cedo
        ls = cal.add_working_hours(lf, -d)
        late[nid] = (ls, lf)

    out: dict[Hashable, CpmResult] = {}
    for nid in scheduled:
        es, ef = sched[nid]
        ls, lf = late[nid]
        total = cal.working_hours_between(ef, lf) if lf > ef else 0.0
        # Folga livre: menor folga até as sucessoras (best-effort por tipo).
        succs = successors.get(nid, [])
        free = total
        if succs:
            slacks = []
            for e in succs:
                bs, bf = sched[e.successor]
                lag = e.lag_hours or 0.0
                t = e.dep_type if e.dep_type in DEP_TYPES else "FS"
                if t == "FS":
                    base, target = cal.add_working_hours(ef, lag), bs
                elif t == "SS":
                    base, target = cal.add_working_hours(es, lag), bs
                elif t == "FF":
                    base, target = cal.add_working_hours(ef, lag), bf
                else:  # SF
                    base, target = cal.add_working_hours(es, lag), bf
                slacks.append(cal.working_hours_between(base, target) if target > base else 0.0)
            free = min(total, min(slacks)) if slacks else total
        out[nid] = CpmResult(
            early_start=es, early_finish=ef, late_start=ls, late_finish=lf,
            total_float_hours=round(total, 2), free_float_hours=round(free, 2),
            is_critical=total <= 1e-6,
        )
    return out
