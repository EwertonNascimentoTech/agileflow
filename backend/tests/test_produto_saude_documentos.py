"""Saúde do produto: declaração "não gera documentos natos digitais" tira o critério
"Documentos cadastrados" da conta (não se aplica), só com justificativa e sem documento ativo."""
import uuid
from datetime import date
from types import SimpleNamespace

import pytest

from app.modules.produtos.schemas import ProductDocumentosDispensa
from app.modules.produtos.service import ProductService


def _produto(**kw):
    base = dict(
        id=uuid.uuid4(), lifecycle="producao", categoria="sistema_interno_desenvolvimento", tipo_desenvolvimento=None,
        description="Sistema", link_repositorio="https://repo", link_prd="https://prd", responsavel_tecnico_person_id=None,
        stacks=[], corporativo=True, responsavel_person_id=None,
        servicos=[], documentos=[], documentations=[], supports=[], contratos=[],
        sem_documentos_natos=False, justificativa_sem_documentos_natos=None,
    )
    base.update(kw)
    return SimpleNamespace(**base)


def _check(p, code="documentos_cadastrados"):
    h = ProductService._health(p, today=date(2026, 9, 27), has_active_contract=False, tech_ref_ids=set())
    return h, next(c for c in h.checks if c.code == code)


def test_sem_declaracao_documentos_contam_como_falha():
    h, c = _check(_produto())
    assert c.status == "fail" and c.note is None


def test_declarado_com_justificativa_nao_se_aplica_e_sai_do_peso():
    antes, _ = _check(_produto())
    depois, c = _check(_produto(sem_documentos_natos=True,
                                justificativa_sem_documentos_natos="Produto só de consulta; não emite documentos."))
    assert c.status == "na" and "não gera documentos natos digitais" in (c.note or "")
    assert depois.applicable_weight == antes.applicable_weight - c.weight
    assert depois.score >= antes.score


def test_declaracao_sem_justificativa_ou_com_documento_ativo_nao_vale():
    _, c = _check(_produto(sem_documentos_natos=True, justificativa_sem_documentos_natos="  "))
    assert c.status == "fail"
    doc = SimpleNamespace(is_active=True)
    _, c = _check(_produto(sem_documentos_natos=True, justificativa_sem_documentos_natos="Não emite documentos.",
                           documentos=[doc]))
    assert c.status == "pass" and c.note is None


def test_fora_de_producao_continua_nao_se_aplicando_sem_nota():
    _, c = _check(_produto(lifecycle="desenvolvimento", sem_documentos_natos=True,
                           justificativa_sem_documentos_natos="Não emite documentos."))
    assert c.status == "na" and c.note is None


def test_schema_exige_justificativa_de_10_caracteres():
    with pytest.raises(ValueError):
        ProductDocumentosDispensa(sem_documentos_natos=True, justificativa="curta")
    assert ProductDocumentosDispensa(sem_documentos_natos=True, justificativa="Só consulta, sem emissão.").justificativa
    assert ProductDocumentosDispensa(sem_documentos_natos=False).sem_documentos_natos is False


# ── Sustentação: SLA saiu do nível (vai para os problemas do catálogo) ──

def test_nivel_sem_sla_conta_como_cadastrado_com_responsaveis():
    assert ProductService._nivel_config_ok({"person_ids": [str(uuid.uuid4())]}) is True
    assert ProductService._nivel_config_ok({"client_ids": [str(uuid.uuid4())], "sla_horas": None}) is True
    assert ProductService._nivel_config_ok({"sla_horas": 8}) is False  # sem responsáveis não conta
    assert ProductService._nivel_config_ok(None) is False


def test_sustentacao_na_saude_so_canal_e_responsaveis():
    n1 = SimpleNamespace(is_active=True, nivel="n1", canal_atendimento="Portal", niveis_atendimento={"person_ids": ["x"]})
    _, c = _check(_produto(supports=[n1]), code="sustentacao_sla")
    assert c.status == "pass"
    sem_canal = SimpleNamespace(is_active=True, nivel="n1", canal_atendimento=" ", niveis_atendimento={"person_ids": ["x"]})
    _, c = _check(_produto(supports=[sem_canal]), code="sustentacao_sla")
    assert c.status == "fail"
