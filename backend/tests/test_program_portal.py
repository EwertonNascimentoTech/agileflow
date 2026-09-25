from datetime import date, datetime
from types import SimpleNamespace

from app.modules.projetos.program_portal import (
    aggregate_health,
    aggregate_status,
    build_roadmap,
    health_of,
    item_status,
    quadrant_for,
    roadmap_phase,
    split_code,
    status_at,
    status_of,
)


def test_quadrante_segue_os_cortes_da_priorizacao():
    assert quadrant_for(4, 2, 3, 3) == "quick_win"
    assert quadrant_for(4, 4, 3, 3) == "big_bet"
    assert quadrant_for(3, 3, 3, 3) == "big_bet"
    assert quadrant_for(2, 2, 3, 3) == "fill_in"
    assert quadrant_for(2, 4, 3, 3) == "money_pit"


def test_saude_do_projeto():
    assert health_of(delivered=True, overdue=True, lagging=True, blocked=True) == "concluido"
    assert health_of(delivered=False, overdue=True, lagging=False, blocked=False) == "critico"
    assert health_of(delivered=False, overdue=False, lagging=True, blocked=True) == "critico"
    assert health_of(delivered=False, overdue=False, lagging=False, blocked=True) == "atencao"
    assert health_of(delivered=False, overdue=False, lagging=False, blocked=False) == "no_prazo"


def test_saude_do_programa_e_do_pilar():
    assert aggregate_health([]) == "no_prazo"
    assert aggregate_health(["concluido", "concluido"]) == "concluido"
    assert aggregate_health(["critico", "no_prazo"]) == "critico"
    assert aggregate_health(["critico", "no_prazo", "no_prazo"]) == "atencao"
    assert aggregate_health(["atencao", "concluido"]) == "atencao"
    assert aggregate_health(["no_prazo", "concluido"]) == "no_prazo"


def test_status_do_projeto_e_do_programa():
    assert status_of("planejamento", False) == "planejamento"
    assert status_of("homologacao", False) == "execucao"
    assert status_of("impedimento", True) == "pausado"
    assert status_of("concluido", False) == "concluido"
    assert aggregate_status(["concluido", "concluido"]) == "concluido"
    assert aggregate_status(["planejamento", "execucao"]) == "execucao"
    assert aggregate_status(["planejamento", "pausado"]) == "planejamento"


def test_fase_do_roadmap_pelo_nome_da_etapa():
    assert roadmap_phase("Backlog") == "planejamento"
    assert roadmap_phase("Contratação") == "planejamento"
    assert roadmap_phase("Pronto para Desenvolvimento") == "planejamento"
    assert roadmap_phase("Em Desenvolvimento") == "desenvolvimento"
    assert roadmap_phase("DevOps (HML)") == "homologacao"
    assert roadmap_phase("Homologando (Cliente)") == "homologacao"
    assert roadmap_phase("DEVSECOPS (PROD)") == "producao"
    assert roadmap_phase("Operação Assistida") == "operacao_assistida"
    assert roadmap_phase("Concluído", is_final=True) == "concluido"
    assert roadmap_phase("Cancelado", is_final=True) == "cancelado"
    assert roadmap_phase("Impedimento") == "impedimento"
    assert roadmap_phase("Pausado") == "impedimento"


def test_codigo_da_us_e_da_feature():
    assert split_code("US-12 - Login via IDigital") == ("US-12", "Login via IDigital")
    assert split_code("feat-3: Autenticação") == ("FEAT-3", "Autenticação")
    assert split_code("Conferência em lote") == (None, "Conferência em lote")


def test_status_do_item():
    base = dict(final=False, impediment=False, overdue=False, not_started=False, has_due=True)
    assert item_status(**{**base, "final": True, "overdue": True}) == "concluida"
    assert item_status(**{**base, "impediment": True, "overdue": True}) == "impedimento"
    assert item_status(**{**base, "overdue": True}) == "atrasado"
    assert item_status(**{**base, "not_started": True}) == "nao_iniciada"
    assert item_status(**base) == "no_prazo"
    assert item_status(**{**base, "has_due": False}) == "andamento"


def _phases(rm):
    return [(s["phase"], s["kind"], s["start"], s["end"]) for s in rm["segments"]]


def test_roadmap_em_planejamento_preve_as_fases_pelo_cronograma():
    rm = build_roadmap(
        today=date(2026, 9, 25), origin=date(2026, 8, 1), current="planejamento", points=[],
        us_start_min=date(2026, 10, 1), us_due_max=date(2026, 11, 15), due=date(2026, 11, 30),
        oa_days=30, oa_entered=None, delivered_on=None,
    )
    assert _phases(rm) == [
        ("planejamento", "atual", "2026-08-01", "2026-10-01"),
        ("desenvolvimento", "previsto", "2026-10-01", "2026-11-15"),
        ("homologacao", "previsto", "2026-11-15", "2026-11-30"),
        ("operacao_assistida", "previsto", "2026-11-30", "2026-12-30"),
    ]
    assert [m["date"] for m in rm["milestones"]] == ["2026-11-15", "2026-11-30"]


def test_roadmap_usa_o_historico_e_estica_o_desenvolvimento_atrasado_ate_hoje():
    rm = build_roadmap(
        today=date(2026, 9, 25), origin=date(2026, 6, 1), current="desenvolvimento",
        points=[(date(2026, 6, 1), "planejamento"), (date(2026, 8, 10), "desenvolvimento")],
        us_start_min=None, us_due_max=date(2026, 9, 10), due=date(2026, 10, 20),
        oa_days=30, oa_entered=None, delivered_on=None,
    )
    assert _phases(rm) == [
        ("planejamento", "realizado", "2026-06-01", "2026-08-10"),
        ("desenvolvimento", "atual", "2026-08-10", "2026-09-25"),
        ("homologacao", "previsto", "2026-09-25", "2026-10-20"),
        ("operacao_assistida", "previsto", "2026-10-20", "2026-11-19"),
    ]


def test_roadmap_impedimento_retoma_a_fase_que_parou():
    rm = build_roadmap(
        today=date(2026, 9, 25), origin=date(2026, 5, 1), current="impedimento",
        points=[(date(2026, 5, 1), "planejamento"), (date(2026, 7, 1), "desenvolvimento"),
                (date(2026, 9, 1), "impedimento")],
        us_start_min=None, us_due_max=date(2026, 10, 15), due=date(2026, 10, 31),
        oa_days=0, oa_entered=None, delivered_on=None,
    )
    assert _phases(rm) == [
        ("planejamento", "realizado", "2026-05-01", "2026-07-01"),
        ("desenvolvimento", "realizado", "2026-07-01", "2026-09-01"),
        ("impedimento", "atual", "2026-09-01", "2026-09-25"),
        ("desenvolvimento", "previsto", "2026-09-25", "2026-10-15"),
        ("homologacao", "previsto", "2026-10-15", "2026-10-31"),
    ]


def test_roadmap_sem_prazo_nao_preve_e_concluido_vira_uma_barra():
    rm = build_roadmap(
        today=date(2026, 9, 25), origin=date(2026, 9, 1), current="desenvolvimento", points=[],
        us_start_min=None, us_due_max=None, due=None, oa_days=30, oa_entered=None, delivered_on=None,
    )
    assert _phases(rm) == [("desenvolvimento", "atual", "2026-09-01", "2026-09-25")]
    assert rm["milestones"] == []

    rm = build_roadmap(
        today=date(2026, 9, 25), origin=date(2026, 3, 1), current="concluido",
        points=[(date(2026, 3, 1), "planejamento")], us_start_min=None, us_due_max=None,
        due=date(2026, 8, 1), oa_days=30, oa_entered=None, delivered_on=date(2026, 8, 20),
    )
    assert _phases(rm) == [("concluido", "realizado", "2026-03-01", "2026-08-20")]


def test_etapa_numa_data_passada_pelo_historico():
    h = [
        SimpleNamespace(moved_at=datetime(2026, 8, 10), from_status_id="a", from_status_name="Backlog",
                        to_status_id="b", to_status_name="Em Desenvolvimento"),
        SimpleNamespace(moved_at=datetime(2026, 9, 10), from_status_id="b", from_status_name="Em Desenvolvimento",
                        to_status_id="c", to_status_name="Concluído"),
    ]
    created = datetime(2026, 8, 1)
    assert status_at(created, "c", h, datetime(2026, 8, 5)) == (True, "a", "Backlog")
    assert status_at(created, "c", h, datetime(2026, 8, 26)) == (True, "b", "Em Desenvolvimento")
    assert status_at(created, "c", h, datetime(2026, 9, 20)) == (True, "c", "Concluído")
    assert status_at(created, "c", [], datetime(2026, 8, 26)) == (True, "c", None)
    assert status_at(datetime(2026, 9, 1), "c", [], datetime(2026, 8, 26)) == (False, None, None)


def test_roadmap_junta_idas_e_voltas_no_mesmo_dia():
    rm = build_roadmap(
        today=date(2026, 9, 25), origin=date(2026, 7, 21), current="desenvolvimento",
        points=[(date(2026, 7, 21), "impedimento"), (date(2026, 8, 21), "desenvolvimento"),
                (date(2026, 9, 18), "homologacao"), (date(2026, 9, 18), "desenvolvimento")],
        us_start_min=None, us_due_max=date(2026, 9, 28), due=None,
        oa_days=0, oa_entered=None, delivered_on=None,
    )
    assert _phases(rm) == [
        ("impedimento", "realizado", "2026-07-21", "2026-08-21"),
        ("desenvolvimento", "atual", "2026-08-21", "2026-09-28"),
    ]
