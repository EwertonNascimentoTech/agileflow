"""Cadastro do produto: nome do repositório no Azure DevOps (validação, disponibilidade e
permissão) antes de criar. O Azure é simulado — nada sai daqui."""
import asyncio

import pytest
from pydantic import ValidationError

from app.modules.produtos import repos_service
from app.modules.produtos.repos_service import RepositoryService
from app.modules.produtos.schemas import AzureRepoCreate


@pytest.mark.parametrize("nome, ok", [
    ("cadastro-aluno-senai", True), ("athena-api", True), ("sge_api", True), ("a", True),
    ("Cadastro", False), ("-inicio", False), ("fim-", False), ("com espaço", False),
    ("acentuação", False), ("x" * 65, False), ("", False),
])
def test_nome_do_repositorio(nome, ok):
    assert bool(RepositoryService._NOME_REPO.match(nome)) is ok
    if ok:
        AzureRepoCreate(project="SGE", name=nome)
    else:
        with pytest.raises(ValidationError):
            AzureRepoCreate(project="SGE", name=nome)


def test_checagem_nome_invalido_nem_consulta_o_azure(monkeypatch):
    async def explode(*_a, **_k):
        raise AssertionError("não deveria chamar o Azure")
    monkeypatch.setattr(repos_service.azure, "find_repository", explode)
    r = asyncio.run(RepositoryService.check_azure_name("SGE", "Nome Ruim"))
    assert r.valido is False and r.disponivel is False and "minúsculas" in r.motivo


def test_checagem_nome_existente_e_sem_permissao(monkeypatch):
    async def achou(project, name):
        return {"web_url": f"https://dev.azure.com/org/{project}/_git/{name}"} if name == "ja-existe" else None
    async def sem_permissao(project):
        return False
    monkeypatch.setattr(repos_service.azure, "find_repository", achou)
    monkeypatch.setattr(repos_service.azure, "can_create_repository", sem_permissao)
    monkeypatch.setattr(repos_service.azure, "_base", lambda: "https://dev.azure.com/org")

    r = asyncio.run(RepositoryService.check_azure_name("SGE", "ja-existe"))
    assert r.valido and not r.disponivel and r.web_url.endswith("/_git/ja-existe")

    r = asyncio.run(RepositoryService.check_azure_name("Projeto X", "novo-repo"))
    assert r.disponivel and r.pode_criar is False and "permissão" in r.motivo
    assert r.web_url == "https://dev.azure.com/org/Projeto%20X/_git/novo-repo"
