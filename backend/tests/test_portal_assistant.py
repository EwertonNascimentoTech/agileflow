"""Assistente do Portal: códigos de pessoas/itens (ida e volta), relevância e contexto."""
from datetime import date

from app.core.anonymize import anonymize_text
from app.modules.projetos.portal_assistant import Codes, build_context, relevance, words_of


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


def test_codes_roundtrip():
    c = Codes()
    p = c.item("projeto", "11111111-1111-1111-1111-111111111111", "Portal do Aluno")
    g = c.item("programa", "22222222-2222-2222-2222-222222222222", "Fintech")
    assert (p, g) == ("[P1]", "[G1]")
    assert c.item("projeto", "11111111-1111-1111-1111-111111111111", "Portal do Aluno") == "[P1]"
    assert c.person("Maria Souza") == "PESSOA_1"
    assert c.person("Maria Souza") == "PESSOA_1"
    assert c.person("") is None

    text, sources = c.decode("O [P1] do [g1] está com PESSOA_1. [P9] não existe; PESSOA_7 também não.")
    assert "**Portal do Aluno**" in text and "**Fintech**" in text
    assert "Maria Souza" in text and "uma pessoa do time" in text
    assert "[P9]" not in text
    assert [s["kind"] for s in sources] == ["projeto", "programa"]


def test_decode_drops_title_repeated_after_code():
    c = Codes()
    c.item("projeto", "1", "SGE - Portal do Aluno")
    c.item("projeto", "2", "Integração")
    answers = [
        "1. **[P1] SGE - Portal do Aluno**\n   Próxima entrega: 30/09/2026",
        "1. **[P1]** SGE - Portal do Aluno",
        "1. [P1] — **Sistema Acadêmico/Gestão - Portal do Aluno**",
        "1. [P1]: SGE - Portal do Aluno",
    ]
    alias = lambda t: t.replace("SGE", "Sistema Acadêmico/Gestão")  # noqa: E731
    for a in answers:
        text, sources = c.decode(a, alias=alias)
        first = text.split("\n")[0]
        assert first == "1. **SGE - Portal do Aluno**", (a, text)
        assert len(sources) == 1
    text, _ = c.decode("**[P2] está atrasado** e [P1] segue.")
    assert text.count("**") % 2 == 0 and "**Integração**" in text


def test_encode_question_and_history():
    c = Codes()
    c.item("projeto", "1", "Portal do Aluno")
    c.person("Maria Souza")
    out = c.encode("Quando o portal do aluno termina? Falei com maria souza.")
    assert "[P1]" in out and "PESSOA_1" in out
    assert "aluno" not in out.lower() and "maria" not in out.lower()


def test_relevance_uses_title_program_and_features():
    words = words_of("Quando entrega o módulo de matrícula do programa Fintech?")
    assert "matricula" in words and "fintech" in words and "programa" not in words
    p = _project("1", "Portal", program_name="Fintech", features=[{"title": "Matrícula online"}])
    q = _project("2", "Outro")
    assert relevance(p, words, None) == 2
    # Palavra no título pesa mais que no programa.
    assert relevance(_project("3", "Matrícula"), words, None) == 3
    assert relevance(q, words, None) == 0


def test_context_has_codes_not_people_and_survives_anonymizer():
    feats = [{
        "id": "f1", "code": "FEAT-1", "title": "Matrícula online", "phase": "desenvolvimento", "status": "no_prazo",
        "start_date": "2026-09-01", "due_date": "2026-10-10", "completed_at": None, "exec_pct": 50,
        "responsavel": "João Lima", "stories": [{"code": "US-1", "title": "Tela", "status": "concluida", "due_date": None}],
    }]
    visible = [
        _project("1", "Portal do Aluno", po_name="Maria Souza", features=feats, feature_count=1),
        _project("2", "Integração Contábil"),
    ]
    base = {"pillars": [], "quadrants": [], "programs": {}}
    c = Codes()
    ctx = build_context(base, visible, [], c, "E a matrícula?", focus_project="1", today=date(2026, 9, 25))
    assert "HOJE: 25/09/2026" in ctx
    assert "Maria Souza" not in ctx and "João Lima" not in ctx
    assert "PO PESSOA_1" in ctx and "resp PESSOA_2" in ctx
    assert "EM TELA" in ctx
    assert "[P1] Portal do Aluno" in ctx and "Matrícula online" in ctx
    assert "10/10/2026" in ctx  # entrega próxima
    anon, _ = anonymize_text(ctx, {"Maria Souza", "João Lima"})
    # O anonimizador não pode apagar os códigos que a resposta usa.
    assert "[P1]" in anon and "PESSOA_1" in anon and "PESSOA_2" in anon


def test_budget_drops_finished_projects_first():
    visible = [_project(str(i), f"Projeto {i:03d} com nome comprido para ocupar espaço") for i in range(40)]
    visible += [_project(f"c{i}", f"Concluído {i:03d}", status="concluido", roadmap_phase="concluido",
                         health="concluido", delivered_at="2026-05-01") for i in range(40)]
    base = {"pillars": [], "quadrants": [], "programs": {}}
    full = build_context(base, visible, [], Codes(), "?", today=date(2026, 9, 25), budget=10**6)
    assert "Concluído 000" in full
    short = build_context(base, visible, [], Codes(), "?", today=date(2026, 9, 25), budget=len(full) - 1)
    assert "Concluído 000" not in short and "mais 40 concluídos deste grupo não listados" in short
    assert "Projeto 039" in short
    # Concluído citado pelo nome na pergunta continua na lista.
    asked = build_context(base, visible, [], Codes(), "Quando terminou o Concluído 007?", today=date(2026, 9, 25),
                          budget=len(full) - 1)
    assert "Concluído 007 | Concluído em 01/05/2026" in asked and "Concluído 008" not in asked


def test_projects_grouped_by_program_with_health_lists():
    visible = [
        _project("1", "Alfa", program_id="g", program_name="Fintech", health="critico"),
        _project("2", "Beta", program_id="g", program_name="Fintech", health="atencao"),
        _project("3", "Gama", health="critico"),
    ]
    c = Codes()
    programs = [{"id": "g", "name": "Fintech", "project_count": 2, "exec_avg": 40, "exec_delta": 5,
                 "health": "critico", "status": "execucao", "next_milestone": None, "owner": None}]
    ctx = build_context({"pillars": [], "quadrants": [], "programs": {}}, visible, programs, c, "?", today=date(2026, 9, 25))
    fin = ctx.index("== PROGRAMA [G1] Fintech (2 projetos)")
    sem = ctx.index("== SEM PROGRAMA (1 projetos)")
    assert fin < ctx.index("[P1] Alfa") < sem < ctx.index("[P3] Gama")
    assert "Críticos (1): [P1] | Em atenção (1): [P2]" in ctx[fin:sem]
    assert "Críticos (1): [P3]" in ctx[sem:]
