"""Testes do reconcile Feature ← User Stories (regras puras, sem banco)."""
from types import SimpleNamespace

from app.modules.projetos.service import ProjectTaskService


def _col(name: str, *, is_initial: bool = False, is_final: bool = False, order: int = 0):
    return SimpleNamespace(name=name, is_initial=is_initial, is_final=is_final, order=order)


FEATURE_COLS = [
    _col("Backlog", is_initial=True, order=1),
    _col("Planejamento (Tech & PO)", order=2),
    _col("Em Desenvolvimento", is_final=True, order=3),
    _col("Homologar (PO)", order=4),
    _col("Ajustar (Dev)", order=5),
    _col("Concluído", is_final=True, order=6),
]


def test_all_us_concluded_moves_feature_to_concluido():
    us = [_col("Concluído", is_final=True), _col("Concluído", is_final=True)]
    target = ProjectTaskService._feature_target_status(FEATURE_COLS, us)
    assert target is not None
    assert target.name == "Concluído"


def test_any_us_in_ajustar_moves_feature_to_ajustar():
    us = [_col("Homologação (PO)"), _col("Ajustar (Dev)")]
    target = ProjectTaskService._feature_target_status(FEATURE_COLS, us)
    assert target is not None
    assert target.name == "Ajustar (Dev)"


def test_all_us_in_homolog_moves_feature_to_homologar():
    us = [_col("Homologação (PO)"), _col("Homologação (PO)")]
    target = ProjectTaskService._feature_target_status(FEATURE_COLS, us)
    assert target is not None
    assert target.name == "Homologar (PO)"


def test_us_outside_backlog_moves_feature_to_desenvolvimento():
    us = [_col("Backlog", is_initial=True), _col("Em Desenvolvimento")]
    target = ProjectTaskService._feature_target_status(FEATURE_COLS, us)
    assert target is not None
    assert target.name == "Em Desenvolvimento"


def test_all_us_in_backlog_keeps_feature_in_backlog():
    us = [_col("Backlog", is_initial=True), _col("Backlog", is_initial=True)]
    target = ProjectTaskService._feature_target_status(FEATURE_COLS, us)
    assert target is not None
    assert target.name == "Backlog"
