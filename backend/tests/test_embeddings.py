import pytest

from app.core.embeddings import _schema, _vector_literal, chunk_text


def test_chunk_texto_curto_vira_um_pedaco():
    assert chunk_text("  Pedido   de melhoria no portal.  ") == ["Pedido de melhoria no portal."]
    assert chunk_text("") == []
    assert chunk_text(None) == []


def test_chunk_texto_longo_corta_em_frase_com_sobreposicao():
    frase = "O cliente pediu ajuste no relatório mensal de indicadores. "
    chunks = chunk_text(frase * 100, size=500, overlap=50)
    assert len(chunks) > 1
    assert all(len(c) <= 500 for c in chunks)
    # corta no fim de uma frase, não no meio de uma palavra
    assert all(c.endswith(".") for c in chunks[:-1])
    # a sobreposição repete o fim do pedaço anterior no começo do seguinte
    assert chunks[1][:20] in chunks[0]


def test_vector_literal_formato_pgvector():
    assert _vector_literal([0.5, -0.25, 1e-9]) == "[0.5,-0.25,1e-09]"


def test_schema_so_de_tenant():
    assert _schema("tenant_ss") == "tenant_ss"
    with pytest.raises(ValueError):
        _schema("public; drop table users")
