"""Base de busca do Assistente do Portal: plano de sincronização, textos (só o que o Portal
mostra), trechos no contexto e peso na escolha dos projetos detalhados."""
import uuid
from datetime import date
from types import SimpleNamespace

from app.core.embeddings import Doc, _hash, chunk_text, plan_sync
from app.modules.projetos.assistant_knowledge import (
    closure_text,
    dedupe_hits,
    docs_from_base,
    meeting_text,
    occurrence_text,
    plain,
    search_query,
)
from app.modules.projetos.portal_assistant import Codes, build_context, semantic_boost, semantic_lines

M = "BAAI/bge-m3"
R1, R2 = uuid.uuid4(), uuid.uuid4()


def _row(doc: Doc, i: int = 0, scope=None, model: str = M, chunk: str | None = None):
    text = chunk if chunk is not None else chunk_text(doc.content)[i]
    return SimpleNamespace(source_type=doc.source_type, source_id=doc.source_id, chunk_index=i,
                           content_hash=_hash(text), model=model, scope_id=scope if scope is not None else doc.scope_id)


# ── plan_sync ─────────────────────────────────────────────────────────────────

def test_plan_novo_igual_e_mudado():
    a = Doc("portal_feature", uuid.uuid4(), R1, "Feature: Emissão de boleto")
    b = Doc("portal_feature", uuid.uuid4(), R1, "Feature: Relatório mensal")
    c = Doc("portal_historia", uuid.uuid4(), R1, "História: Tela de login")
    existing = [_row(a), _row(b, chunk="Feature: Relatório antigo")]
    plan = plan_sync(existing, [a, b, c], M)
    assert {d.source_id for d, *_ in plan.upserts} == {b.source_id, c.source_id}  # a não muda
    assert plan.changed == {"portal_feature": 1, "portal_historia": 1}
    assert not plan.removals and plan.docs_total == 3


def test_plan_remove_origem_que_saiu_e_doc_vazio():
    a = Doc("portal_feature", uuid.uuid4(), R1, "Feature A")
    gone = Doc("portal_feature", uuid.uuid4(), R1, "Feature cancelada")
    empty = Doc("portal_encerramento", uuid.uuid4(), R1, "Encerramento antigo")
    existing = [_row(a), _row(gone), _row(empty)]
    plan = plan_sync(existing, [a, Doc(empty.source_type, empty.source_id, R1, "   ")], M)
    assert set(plan.removals) == {(gone.source_type, gone.source_id), (empty.source_type, empty.source_id)}
    assert plan.removed == {"portal_feature": 1, "portal_encerramento": 1}
    assert not plan.upserts


def test_plan_escopo_mudou_sem_recalcular_vetor():
    a = Doc("portal_historia", uuid.uuid4(), R2, "História movida de projeto")
    plan = plan_sync([_row(a, scope=R1)], [a], M)
    assert not plan.upserts and [d.source_id for d in plan.rescope] == [a.source_id]


def test_plan_texto_encolheu_apaga_pedacos_do_fim():
    a = Doc("portal_ocorrencia", uuid.uuid4(), R1, "Ocorrência curta agora")
    existing = [_row(a), SimpleNamespace(source_type=a.source_type, source_id=a.source_id, chunk_index=1,
                                         content_hash="x", model=M, scope_id=R1)]
    plan = plan_sync(existing, [a], M)
    assert plan.trims == [(a.source_type, a.source_id, 1)] and not plan.upserts


def test_plan_modelo_novo_ou_force_recalcula_tudo():
    a = Doc("portal_feature", uuid.uuid4(), R1, "Feature A")
    assert len(plan_sync([_row(a, model="outro")], [a], M).upserts) == 1
    assert len(plan_sync([_row(a)], [a], M, force=True).upserts) == 1
    assert plan_sync([_row(a)], [a], M).empty


# ── textos: só o que o Portal mostra ──────────────────────────────────────────

def _base():
    g, pl = str(uuid.uuid4()), str(uuid.uuid4())
    f, s, orphan = str(uuid.uuid4()), str(uuid.uuid4()), str(uuid.uuid4())
    return {
        "programs": {g: {"id": g, "name": "Fintech", "description": "<p>Pagamentos &amp; cobrança</p>"}},
        "pillars": [{"id": pl, "program_id": g, "name": "Receita", "description": "Aumentar receita"}],
        "projects": [
            {"task_id": str(R1), "title": "Portal Financeiro", "subtitle": "SGF", "program_name": "Fintech",
             "pillar_id": pl, "area_label": "TI", "cancelled": False,
             "features": [{"id": f, "code": "FEAT-12", "title": "Emissão de 2ª via",
                           "stories": [{"id": s, "code": "US-3", "title": "Tela do boleto"}]}],
             "orphan_stories": [{"id": orphan, "code": None, "title": "Ajuste de layout"}]},
            {"task_id": str(R2), "title": "Projeto cancelado", "cancelled": True,
             "features": [{"id": str(uuid.uuid4()), "title": "Não deve entrar", "stories": []}]},
        ],
    }, g, pl, f, s, orphan


def test_docs_from_base_escopo_e_cancelado():
    base, g, pl, f, s, orphan = _base()
    docs = docs_from_base(base, {"portal_projeto", "portal_feature", "portal_historia", "portal_programa"})
    by_id = {str(d.source_id): d for d in docs}
    assert str(R2) not in by_id and not any("Não deve entrar" in d.content for d in docs)
    assert by_id[str(R1)].content.startswith("Projeto: Portal Financeiro")
    assert "Pilar: Receita" in by_id[str(R1)].content
    assert by_id[f].scope_id == R1 and "Feature: FEAT-12 Emissão de 2ª via" in by_id[f].content
    assert by_id[s].scope_id == R1 and "Feature: Emissão de 2ª via" in by_id[s].content
    assert by_id[orphan].source_type == "portal_historia"
    # programa e pilar: escopo = programa; HTML vira texto
    assert by_id[g].scope_id == uuid.UUID(g) and "Pagamentos & cobrança" in by_id[g].content
    assert by_id[pl].scope_id == uuid.UUID(g)


def test_docs_from_base_respeita_origens_ligadas():
    base, *_ = _base()
    docs = docs_from_base(base, {"portal_feature"})
    assert {d.source_type for d in docs} == {"portal_feature"}


def test_ocorrencia_so_campos_visiveis_e_html_limpo():
    body = occurrence_text(
        "OC-0003 · Boleto não gera", "erro", "Financeiro", "<p>Ao clicar, <b>trava</b></p>", "1. Abrir",
        None, "Corrigido no release 2.1", None, ["<p>Obrigado!</p>", "  "],
    )
    assert "Tipo: Erro" in body and "O que aconteceu: Ao clicar, trava" in body
    assert "Solução: Corrigido" in body and "- Obrigado!" in body
    assert "<" not in body


def test_ata_sem_participantes_e_encerramento():
    ata = meeting_text("semanal", "10/09/2026", 2, "Estabilizou", "Manter rito")
    assert ata.startswith("Ata de reunião semanal da Operação Assistida de 10/09/2026 (fase 2)")
    assert closure_text({}) == ""
    enc = closure_text({"analise": {"riscos": "Integração X instável"}, "decisao_estrategica": False})
    assert "Riscos remanescentes: Integração X instável" in enc


def test_plain_e_dedupe_e_pergunta_de_continuacao():
    assert plain("<p>a</p><p>b&nbsp;c</p>") == "a\nb c"
    sid = uuid.uuid4()
    hits = [{"source_type": "t", "source_id": sid, "score": 0.5}, {"source_type": "t", "source_id": sid, "score": 0.7},
            {"source_type": "t", "source_id": uuid.uuid4(), "score": 0.6}]
    out = dedupe_hits(hits, 5)
    assert [h["score"] for h in out] == [0.7, 0.6]
    hist = [SimpleNamespace(role="user", content="Como está o Portal Financeiro?"),
            SimpleNamespace(role="assistant", content="Em dia.")]
    assert search_query("e o prazo?", hist) == "Como está o Portal Financeiro?\ne o prazo?"
    longa = "Quais Features do projeto de cobrança estão atrasadas e o que falta para concluir?"
    assert search_query(longa, hist) == longa


# ── trechos no contexto do assistente ─────────────────────────────────────────

def _project(tid: str, title: str, **kw) -> dict:
    base = {
        "task_id": tid, "title": title, "subtitle": None, "program_id": None, "program_name": None,
        "pillar_id": None, "quadrant_code": None, "roadmap_phase": "desenvolvimento", "status": "execucao",
        "health": "no_prazo", "exec_pct": 40, "exec_then": 30.0, "start_date": "2026-08-01",
        "due_date": "2026-11-30", "delivered_at": None, "next_milestone": None, "po_name": None,
        "feature_count": 0, "feature_done": 0, "story_count": 0, "story_done": 0,
        "features": [], "orphan_stories": [],
    }
    base.update(kw)
    return base


def _visible():
    fid, sid = str(uuid.uuid4()), str(uuid.uuid4())
    feats = [{
        "id": fid, "code": "FEAT-12", "title": "Emissão de 2ª via", "phase": "desenvolvimento", "status": "atrasado",
        "start_date": "2026-09-01", "due_date": "2026-09-20", "completed_at": None, "exec_pct": 60,
        "responsavel": None,
        "stories": [{"id": sid, "code": "US-3", "title": "Tela do boleto", "status": "concluida",
                     "due_date": "2026-09-10", "completed_at": "2026-09-09"}],
    }]
    visible = [_project(str(R1), "Portal Financeiro", features=feats), _project(str(R2), "Intranet")]
    return visible, fid, sid


def test_semantic_lines_dado_atual_e_recorte():
    visible, fid, sid = _visible()
    c = Codes()
    for p in visible:
        c.item("projeto", p["task_id"], p["title"])
    hits = [
        {"source_type": "portal_feature", "source_id": uuid.UUID(fid), "scope_id": R1, "score": 0.8, "content": "x"},
        {"source_type": "portal_historia", "source_id": uuid.UUID(sid), "scope_id": R1, "score": 0.7, "content": "x"},
        {"source_type": "portal_ocorrencia", "source_id": uuid.uuid4(), "scope_id": R1, "score": 0.6,
         "content": "Ocorrência: boleto\nO que aconteceu: no Portal Financeiro a página trava",
         "live": {"code": "OC-0003", "stage": "Em atendimento", "opened": "2026-09-15"}},
        # fora do recorte: não vira linha
        {"source_type": "portal_feature", "source_id": uuid.uuid4(), "scope_id": uuid.uuid4(), "score": 0.9, "content": "x"},
    ]
    lines = semantic_lines(hits, visible, {"pillars": []}, c)
    text = "\n".join(lines)
    assert lines[0].startswith("TRECHOS ACHADOS PELA BUSCA")
    assert "- Feature Emissão de 2ª via de [P1] | Desenvolvimento | Atrasado | 01/09/2026 a 20/09/2026 | 60% | US 1/1" in text
    assert "- História Tela do boleto (Feature Emissão de 2ª via) de [P1] | Concluída" in text
    assert "concluída em 09/09/2026" in text
    # texto da ocorrência: nome do projeto vira código; raia atual
    assert "Ocorrência OC-0003 de [P1] | raia Em atendimento | aberta em 15/09/2026" in text
    assert "no [P1] a página trava" in text
    assert len(lines) == 4


def test_build_context_trechos_puxam_projeto_para_o_detalhe():
    visible, fid, _sid = _visible()
    hits = [{"source_type": "portal_feature", "source_id": uuid.UUID(fid), "scope_id": R1, "score": 0.75, "content": "x"}]
    assert semantic_boost(hits) == {str(R1): 5}
    ctx = build_context({"pillars": [], "quadrants": [], "programs": {}}, visible, [], Codes(),
                        "cobrança do cliente", today=date(2026, 9, 25), hits=hits)
    assert "TRECHOS ACHADOS PELA BUSCA" in ctx
    assert "FEATURES DOS PROJETOS LIGADOS À PERGUNTA" in ctx
    detail = ctx[ctx.index("FEATURES DOS PROJETOS LIGADOS"):]
    assert "[P1] Portal Financeiro" in detail and "Intranet" not in detail
    # sem trechos, a pergunta (sem palavra do título) não detalha nada
    ctx0 = build_context({"pillars": [], "quadrants": [], "programs": {}}, visible, [], Codes(),
                         "cobrança do cliente", today=date(2026, 9, 25))
    assert "TRECHOS ACHADOS" not in ctx0 and "FEATURES DOS PROJETOS LIGADOS" not in ctx0
