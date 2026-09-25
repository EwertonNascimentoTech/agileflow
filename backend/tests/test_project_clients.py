from app.modules.projetos.clients import project_role_label


def test_rotulo_da_funcao():
    assert project_role_label("sponsor", None) == "Sponsor"
    assert project_role_label("usuario_chave", "ignorado") == "Usuário-chave"
    assert project_role_label("outro", "  Gestor do contrato ") == "Gestor do contrato"
    assert project_role_label("outro", "") == "Outro"
    assert project_role_label(None, None) == ""
