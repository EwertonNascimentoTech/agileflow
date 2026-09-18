from app.modules.projetos.ociosidade import classify_idle


def test_classify_sem_demanda():
    idle, reason = classify_idle("ativo", True, 8.0, 0.0)
    assert idle is True
    assert reason == "sem_demanda"


def test_classify_abaixo_da_capacidade():
    idle, reason = classify_idle("ativo", True, 4.8, 3.0)
    assert idle is True
    assert reason == "abaixo_da_capacidade"


def test_classify_folga_residual():
    idle, reason = classify_idle("ativo", True, 5.6, 5.33)
    assert idle is False
    assert reason == "folga_residual"


def test_classify_ocupado():
    idle, reason = classify_idle("ativo", True, 8.0, 8.0)
    assert idle is False
    assert reason == "ocupado"


def test_classify_ferias():
    idle, reason = classify_idle("ferias", True, 0.0, 0.0)
    assert idle is False
    assert reason == "status_ferias"


def test_classify_sem_capacidade():
    idle, reason = classify_idle("ativo", True, 0.0, 0.0)
    assert idle is False
    assert reason == "sem_capacidade_hoje"
