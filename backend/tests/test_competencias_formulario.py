"""Formulário "Minhas competências": escala de 4 níveis e quem conta como habilitado (backup)
no mapa de competências e nos alertas de stack crítica."""
import uuid
from types import SimpleNamespace

import pytest

from app.modules.teamops.models import STACK_LEVELS_HABILITADOS, StackLevel
from app.modules.teamops.schemas import CompetenciasIn, PersonStackCreate
from app.modules.teamops.service import _habilitado


def test_escala_de_quatro_niveis():
    assert [lv.value for lv in StackLevel] == ["conhece", "com_apoio", "autonomo", "referencia"]
    assert set(STACK_LEVELS_HABILITADOS) == {StackLevel.AUTONOMO, StackLevel.REFERENCIA}


def test_habilitado_so_quem_faz_sozinho_ou_domina():
    link = lambda lv, ref=False: SimpleNamespace(level=lv, is_reference=ref)  # noqa: E731
    assert not _habilitado(link(StackLevel.CONHECE))
    assert not _habilitado(link(StackLevel.COM_APOIO))
    assert _habilitado(link(StackLevel.AUTONOMO))
    assert _habilitado(link(StackLevel.REFERENCIA))
    # Referência marcada pelo gestor conta mesmo com nível baixo na autoavaliação.
    assert _habilitado(link(StackLevel.COM_APOIO, ref=True))


def test_formulario_recusa_nivel_da_escala_antiga():
    with pytest.raises(ValueError):
        CompetenciasIn(itens=[{"stack_id": str(uuid.uuid4()), "level": "pleno"}])
    ok = CompetenciasIn(itens=[{"stack_id": str(uuid.uuid4()), "level": "com_apoio"}], outras="Java: conheço")
    assert ok.itens[0].level == StackLevel.COM_APOIO


def test_vinculo_manual_nasce_com_faco_sozinho():
    assert PersonStackCreate(stack_id=uuid.uuid4()).level == StackLevel.AUTONOMO
