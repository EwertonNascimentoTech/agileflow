from types import SimpleNamespace

from app.modules.projetos.clients import ProjectClientService, project_role_label


def test_rotulo_da_funcao():
    assert project_role_label("sponsor", None) == "Sponsor"
    assert project_role_label("usuario_chave", "ignorado") == "Usuário-chave"
    assert project_role_label("outro", "  Gestor do contrato ") == "Gestor do contrato"
    assert project_role_label("outro", "") == "Outro"
    assert project_role_label(None, None) == ""


def _st(name, is_final=False, is_initial=False):
    return SimpleNamespace(name=name, is_final=is_final, is_initial=is_initial)


def test_situacao_da_feature_para_o_cliente():
    f = ProjectClientService._feature_state
    assert f(_st("Backlog", is_initial=True)) == "a_iniciar"
    assert f(_st("Em Desenvolvimento")) == "andamento"
    assert f(_st("Homologação (PO)")) == "validacao"
    assert f(_st("Ajustar")) == "ajuste"
    assert f(_st("Concluído", is_final=True)) == "concluida"
    assert f(None) == "andamento"
