"""Testes puros do calendário de horas úteis e do motor de cronograma (sem banco)."""
from datetime import date, datetime

import pytest

from app.modules.teamops.calendar import WorkingCalendar
from app.modules.projetos.schedule_engine import (
    EngineEdge,
    EngineNode,
    ScheduleCycleError,
    compute_cpm,
    detect_cycle,
    schedule_tree,
)

MON = datetime(2026, 7, 6, 8, 0)  # 2026-07-06 é uma segunda-feira


# ── Calendário ───────────────────────────────────────────────────────────────

def test_add_hours_spans_two_days():
    cal = WorkingCalendar()
    # 16h (2 dias úteis) a partir de seg 08:00 → ter 17:00
    assert cal.add_working_hours(MON, 16) == datetime(2026, 7, 7, 17, 0)


def test_add_hours_respects_lunch():
    cal = WorkingCalendar()
    # 5h a partir de seg 08:00 → 08-12 (4h) + 13-14 (1h) = seg 14:00
    assert cal.add_working_hours(MON, 5) == datetime(2026, 7, 6, 14, 0)


def test_next_start_after_day_end_rolls_to_next_day():
    cal = WorkingCalendar()
    assert cal.next_start(datetime(2026, 7, 7, 17, 0)) == datetime(2026, 7, 8, 8, 0)


def test_skips_weekend():
    cal = WorkingCalendar()
    # sex 15:00 + 4h → sex 15-17 (2h) + seg 08-10 (2h) = seg 10:00
    assert cal.add_working_hours(datetime(2026, 7, 10, 15, 0), 4) == datetime(2026, 7, 13, 10, 0)


def test_skips_holiday():
    cal = WorkingCalendar(holidays=frozenset({date(2026, 7, 7)}))  # terça é feriado
    # 16h a partir de seg 08:00, pulando ter → seg(8h)+qua(8h) = qua 17:00
    assert cal.add_working_hours(MON, 16) == datetime(2026, 7, 8, 17, 0)


def test_negative_lead():
    cal = WorkingCalendar()
    # -4h a partir de qua 08:00 → ter 13:00
    assert cal.add_working_hours(datetime(2026, 7, 8, 8, 0), -4) == datetime(2026, 7, 7, 13, 0)


def test_hours_per_day():
    assert WorkingCalendar().hours_per_day() == 8.0


# ── Motor ────────────────────────────────────────────────────────────────────

def _root_with(children):
    nodes = [EngineNode("R", None, 0, None)]
    nodes += [EngineNode(c[0], "R", i, c[1]) for i, c in enumerate(children)]
    return nodes


def test_siblings_cascade_by_order():
    cal = WorkingCalendar()
    nodes = _root_with([("A", 8.0, False), ("B", 8.0, False)])
    r = schedule_tree(nodes, [], "R", MON, cal)
    assert r["A"] == (datetime(2026, 7, 6, 8, 0), datetime(2026, 7, 6, 17, 0))
    assert r["B"] == (datetime(2026, 7, 7, 8, 0), datetime(2026, 7, 7, 17, 0))
    # rollup do pai
    assert r["R"] == (datetime(2026, 7, 6, 8, 0), datetime(2026, 7, 7, 17, 0))


def test_ss_makes_parallel():
    cal = WorkingCalendar()
    nodes = _root_with([("A", 8.0, False), ("B", 8.0, False)])
    r = schedule_tree(nodes, [EngineEdge("A", "B", "SS", 0)], "R", MON, cal)
    assert r["B"] == (datetime(2026, 7, 6, 8, 0), datetime(2026, 7, 6, 17, 0))


def test_ff_aligns_finish():
    cal = WorkingCalendar()
    nodes = _root_with([("A", 8.0, False), ("B", 8.0, False)])
    r = schedule_tree(nodes, [EngineEdge("A", "B", "FF", 0)], "R", MON, cal)
    assert r["B"][1] == r["A"][1]


def test_fs_with_lag_hours():
    cal = WorkingCalendar()
    nodes = _root_with([("A", 8.0, False), ("B", 8.0, False)])
    # A termina seg 17:00; +8h úteis = ter 17:00 → próximo início = qua 08:00
    r = schedule_tree(nodes, [EngineEdge("A", "B", "FS", 8)], "R", MON, cal)
    assert r["B"][0] == datetime(2026, 7, 8, 8, 0)


def test_multiple_predecessors_take_max():
    cal = WorkingCalendar()
    nodes = _root_with([("A", 8.0, False), ("B", 8.0, False), ("C", 8.0, False)])
    edges = [EngineEdge("A", "C", "FS", 0), EngineEdge("B", "C", "FS", 0)]
    r = schedule_tree(nodes, edges, "R", MON, cal)
    # A seg, B ter (cascata) → C depois do mais tarde (ter 17:00) = qua 08:00
    assert r["C"][0] == datetime(2026, 7, 8, 8, 0)


def test_root_start_pinned_to_anchor():
    cal = WorkingCalendar()
    # único filho com predecessora externa não muda — raiz fica na âncora
    nodes = _root_with([("A", 8.0, False)])
    r = schedule_tree(nodes, [], "R", MON, cal)
    assert r["R"][0] == cal.next_start(MON)


def test_cycle_detection():
    assert detect_cycle(["A", "B"], [EngineEdge("A", "B"), EngineEdge("B", "A")]) is True
    assert detect_cycle(["A", "B"], [EngineEdge("A", "B")]) is False


def test_schedule_tree_raises_on_cycle():
    cal = WorkingCalendar()
    nodes = [EngineNode("R", None, 0, None), EngineNode("A", "R", 0, 8.0), EngineNode("B", "R", 1, 8.0)]
    with pytest.raises(ScheduleCycleError):
        schedule_tree(nodes, [EngineEdge("A", "B"), EngineEdge("B", "A")], "R", MON, cal)


# ── CPM ──────────────────────────────────────────────────────────────────────

def test_cpm_critical_chain():
    cal = WorkingCalendar()
    # B(16h) e A(8h) começam juntos (SS); C depende de ambos (FS). Caminho crítico = B → C.
    nodes = [
        EngineNode("R", None, 0, None),
        EngineNode("B", "R", 0, 16.0),
        EngineNode("A", "R", 1, 8.0),
        EngineNode("C", "R", 2, 8.0),
    ]
    edges = [EngineEdge("B", "A", "SS", 0), EngineEdge("A", "C", "FS", 0), EngineEdge("B", "C", "FS", 0)]
    sched = schedule_tree(nodes, edges, "R", MON, cal)
    cpm = compute_cpm(nodes, edges, "R", sched, cal)
    assert cpm["B"].is_critical and cpm["C"].is_critical
    assert not cpm["A"].is_critical
    assert cpm["A"].total_float_hours == 8.0


def test_cpm_simple_fs_chain_all_critical():
    cal = WorkingCalendar()
    nodes = [
        EngineNode("R", None, 0, None),
        EngineNode("A", "R", 0, 8.0),
        EngineNode("B", "R", 1, 8.0),
    ]
    edges = [EngineEdge("A", "B", "FS", 0)]
    sched = schedule_tree(nodes, edges, "R", MON, cal)
    cpm = compute_cpm(nodes, edges, "R", sched, cal)
    assert cpm["A"].is_critical and cpm["B"].is_critical
    assert cpm["A"].total_float_hours == 0.0
