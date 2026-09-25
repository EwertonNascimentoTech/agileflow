import asyncio
from types import SimpleNamespace

import pytest
from fastapi import HTTPException

from app.modules.projetos.ai_solutions import AiSolutionsService, _section_mode


def test_modo_das_secoes_por_etapa():
    assert _section_mode("solicitacao", "solicitacao") == "editable"
    assert _section_mode("solicitacao", "necessita_ajustes") == "editable"
    assert _section_mode("solicitacao", "producao") == "visible"
    assert _section_mode("adequacao", "adequacao") == "editable"
    assert _section_mode("adequacao", "homologacao") == "visible"
    assert _section_mode("adequacao", "analise") is None
    assert _section_mode("analise", "nao_aprovado") == "visible"
    assert _section_mode("liberacao", "cancelado") is None


class _Db:
    def __init__(self):
        self.added = []

    def add(self, obj):
        self.added.append(obj)


def _st(key, name, reason=False):
    return SimpleNamespace(id=key, ai_stage_key=key, name=name, entry_reason_required=reason)


def _move(src, dst, reason=None):
    db = _Db()
    asyncio.run(AiSolutionsService.before_move(db, SimpleNamespace(id="t"), src, dst, reason, None))
    return db.added


def test_motivo_obrigatorio_ao_entrar_e_ao_voltar():
    analise, homolog, adequ = _st("analise", "Análise"), _st("homologacao", "Homologação"), _st("adequacao", "Adequação")
    nao = _st("nao_aprovado", "Não Aprovado", reason=True)
    with pytest.raises(HTTPException) as e:
        _move(analise, nao)
    assert e.value.status_code == 428 and e.value.detail["code"] == "stage_reason_required"
    assert _move(analise, adequ) == []  # avançar não pede motivo
    with pytest.raises(HTTPException):
        _move(homolog, adequ)  # voltar pede
    [c] = _move(analise, nao, "Solução já existe no portfólio.")
    assert c.visibility == "public"
    [c] = _move(_st("seguranca", "Segurança"), adequ, "Achados de vulnerabilidade a corrigir.")
    assert c.visibility == "internal"
