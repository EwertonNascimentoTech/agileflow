"""Cliente da integração com o Azure DevOps (REST API), usado para importar commits dos
repositórios vinculados aos produtos.

Credencial única da instituição no .env (AZURE_DEVOPS_PAT), autenticada por Basic com
usuário vazio — o padrão do Azure DevOps para PAT: `Authorization: Basic base64(":" + PAT)`.
Não usa o service principal do Azure AI Foundry: aqui é PAT, escopo Code (Read).

Endpoints mapeados (api-version 7.1, verificado em ago/2026):
  GET /{org}/_apis/projects
      → {"count": N, "value": [{"id", "name", ...}]}
  GET /{org}/{project}/_apis/git/repositories
      → {"value": [{"id", "name", "project": {"name"}, "defaultBranch": "refs/heads/main",
                    "webUrl", "isDisabled"}]}
  GET /{org}/{project}/_apis/git/repositories/{repoId}/commits
      ?searchCriteria.fromDate=&searchCriteria.$top=&searchCriteria.$skip=
      → {"count": N, "value": [{"commitId", "author": {"name","email","date"},
                                "committer": {...}, "comment", "commentTruncated",
                                "changeCounts": {"Add","Edit","Delete"}, "remoteUrl"}]}

A listagem de commits NÃO devolve `parents`, por isso merge é detectado por heurística de
mensagem em `is_merge_comment()` — buscar commit a commit sairia caro demais.
"""

from __future__ import annotations

import asyncio
import base64
from datetime import datetime
from typing import Any, Optional
from urllib.parse import quote

import httpx

from app.core.config import settings


class AzureDevOpsError(Exception):
    """Erro amigável da integração Azure DevOps (exibido na UI)."""


_TIMEOUT = 60.0
_PAGE_SIZE = 200
_MAX_RETRIES = 3

_MERGE_PREFIXES = ("merged pr ", "merge branch", "merge pull request", "merge remote-tracking")


def azure_devops_configured() -> bool:
    return bool(settings.AZURE_DEVOPS_ORG_URL and settings.AZURE_DEVOPS_PAT)


def default_organization() -> str:
    """Nome da organização extraído de AZURE_DEVOPS_ORG_URL (último segmento)."""
    base = (settings.AZURE_DEVOPS_ORG_URL or "").strip().rstrip("/")
    return base.rsplit("/", 1)[-1] if base else ""


def _base() -> str:
    return (settings.AZURE_DEVOPS_ORG_URL or "").strip().rstrip("/")


def _headers() -> dict:
    token = base64.b64encode(f":{settings.AZURE_DEVOPS_PAT}".encode()).decode()
    return {"Authorization": f"Basic {token}", "Accept": "application/json"}


def is_merge_comment(comment: Optional[str]) -> bool:
    c = (comment or "").strip().lower()
    return any(c.startswith(p) for p in _MERGE_PREFIXES)


def is_bot_email(email: Optional[str]) -> bool:
    e = (email or "").strip().lower()
    if not e:
        return False
    patterns = [p.strip().lower() for p in (settings.AZURE_DEVOPS_BOT_EMAIL_PATTERNS or "").split(",")]
    return any(p and p in e for p in patterns)


def _raise_for(resp: httpx.Response, contexto: str) -> None:
    # Pegadinha do Azure DevOps: PAT inválido/expirado não devolve 401 — devolve 203 com a
    # página de login em HTML. Sem esse teste a integração "funciona" retornando lixo.
    if resp.status_code == 203 or "text/html" in (resp.headers.get("content-type") or ""):
        raise AzureDevOpsError(
            f"PAT do Azure DevOps inválido ou expirado (HTTP {resp.status_code}) ao {contexto}. "
            "Verifique AZURE_DEVOPS_PAT no .env."
        )
    if resp.status_code in (401, 403):
        raise AzureDevOpsError(
            f"Acesso negado pelo Azure DevOps ao {contexto}. "
            "Verifique AZURE_DEVOPS_PAT no .env (escopo Code → Read) e se ele não expirou."
        )
    if resp.status_code == 404:
        raise AzureDevOpsError(f"Não encontrado no Azure DevOps: {contexto}.")
    if resp.status_code >= 400:
        raise AzureDevOpsError(
            f"Azure DevOps devolveu HTTP {resp.status_code} ao {contexto}: {resp.text[:300]}"
        )


async def _get(client: httpx.AsyncClient, url: str, params: dict, contexto: str) -> dict:
    """GET com retry em 429/5xx respeitando Retry-After."""
    for attempt in range(_MAX_RETRIES):
        resp = await client.get(url, params=params, headers=_headers())
        if resp.status_code == 429 or resp.status_code >= 500:
            if attempt == _MAX_RETRIES - 1:
                _raise_for(resp, contexto)
            await asyncio.sleep(float(resp.headers.get("Retry-After") or (2 ** attempt)))
            continue
        _raise_for(resp, contexto)
        try:
            return resp.json()
        except ValueError:
            # PAT inválido faz o Azure devolver a página de login em HTML, com HTTP 200.
            raise AzureDevOpsError(
                f"Resposta inesperada do Azure DevOps ao {contexto}. "
                "Normalmente é PAT inválido ou expirado — confira AZURE_DEVOPS_PAT no .env."
            )
    raise AzureDevOpsError(f"Falha ao {contexto} no Azure DevOps após {_MAX_RETRIES} tentativas.")


def _guard() -> None:
    if not azure_devops_configured():
        raise AzureDevOpsError(
            "Integração com o Azure DevOps não configurada. "
            "Defina AZURE_DEVOPS_ORG_URL e AZURE_DEVOPS_PAT no .env."
        )


async def list_projects() -> list[dict]:
    """Projetos da organização — alimenta o seletor da tela de configuração."""
    _guard()
    async with httpx.AsyncClient(timeout=_TIMEOUT) as client:
        data = await _get(
            client, f"{_base()}/_apis/projects",
            {"api-version": settings.AZURE_DEVOPS_API_VERSION, "$top": 500},
            "listar os projetos",
        )
    return [{"id": p.get("id"), "name": p.get("name")} for p in data.get("value", [])]


async def list_repositories(project: str) -> list[dict]:
    """Repositórios de um projeto (resolve nome → id/defaultBranch/webUrl)."""
    _guard()
    url = f"{_base()}/{quote(project)}/_apis/git/repositories"
    async with httpx.AsyncClient(timeout=_TIMEOUT) as client:
        data = await _get(
            client, url, {"api-version": settings.AZURE_DEVOPS_API_VERSION},
            f"listar os repositórios do projeto {project}",
        )
    out = []
    for r in data.get("value", []):
        if r.get("isDisabled"):
            continue
        out.append({
            "id": r.get("id"),
            "name": r.get("name"),
            "project": (r.get("project") or {}).get("name") or project,
            "web_url": r.get("webUrl") or r.get("remoteUrl"),
            "default_branch": (r.get("defaultBranch") or "").replace("refs/heads/", "") or None,
        })
    return out


async def find_repository(project: str, repository: str) -> Optional[dict]:
    """Acha um repositório pelo nome (case-insensitive) dentro do projeto."""
    alvo = (repository or "").strip().lower()
    for r in await list_repositories(project):
        if (r["name"] or "").strip().lower() == alvo:
            return r
    return None


def _parse_dt(value: Any) -> Optional[datetime]:
    if not value:
        return None
    try:
        # Azure devolve ISO-8601 com Z; guardamos naive UTC, como o resto do projeto.
        return datetime.fromisoformat(str(value).replace("Z", "+00:00")).replace(tzinfo=None)
    except ValueError:
        return None


async def list_branches(project: str, repo_id: str) -> list[str]:
    """Nomes das branches do repositório (sem o prefixo refs/heads/)."""
    _guard()
    url = f"{_base()}/{quote(project)}/_apis/git/repositories/{repo_id}/refs"
    async with httpx.AsyncClient(timeout=_TIMEOUT) as client:
        data = await _get(
            client, url,
            {"api-version": settings.AZURE_DEVOPS_API_VERSION, "filter": "heads/"},
            f"listar branches de {project}/{repo_id}",
        )
    return [
        (r.get("name") or "").replace("refs/heads/", "")
        for r in (data.get("value") or []) if r.get("name")
    ]


async def fetch_commits(
    project: str,
    repo_id: str,
    from_date: Optional[datetime] = None,
    max_pages: int = 100,
    branch: Optional[str] = None,
) -> list[dict]:
    """Commits de uma branch (ou da padrão, se `branch` for None), mais recentes primeiro.

    `from_date` filtra por data do AUTOR (não do push) — daí a janela de sobreposição
    aplicada por quem chama no sync incremental.
    """
    _guard()
    url = f"{_base()}/{quote(project)}/_apis/git/repositories/{repo_id}/commits"
    out: list[dict] = []

    async with httpx.AsyncClient(timeout=_TIMEOUT) as client:
        for page in range(max_pages):
            params = {
                "api-version": settings.AZURE_DEVOPS_API_VERSION,
                "searchCriteria.$top": _PAGE_SIZE,
                "searchCriteria.$skip": page * _PAGE_SIZE,
            }
            if from_date:
                params["searchCriteria.fromDate"] = from_date.strftime("%Y-%m-%dT%H:%M:%SZ")
            if branch:
                # itemVersion define a branch percorrida; sem isso o Azure usa a padrão.
                params["searchCriteria.itemVersion.version"] = branch
                params["searchCriteria.itemVersion.versionType"] = "branch"

            data = await _get(client, url, params, f"buscar commits de {project}/{repo_id}")
            batch = data.get("value") or []
            for c in batch:
                author = c.get("author") or {}
                committer = c.get("committer") or {}
                counts = c.get("changeCounts") or {}
                comment = c.get("comment")
                author_date = _parse_dt(author.get("date")) or _parse_dt(committer.get("date"))
                if not author_date:
                    continue
                out.append({
                    "commit_id": c.get("commitId"),
                    "author_name": (author.get("name") or "")[:200] or None,
                    "author_email": (author.get("email") or "").strip().lower()[:255] or None,
                    "author_date": author_date,
                    "committer_date": _parse_dt(committer.get("date")),
                    "comment": comment,
                    "comment_truncated": bool(c.get("commentTruncated")),
                    "add_count": int(counts.get("Add") or 0),
                    "edit_count": int(counts.get("Edit") or 0),
                    "delete_count": int(counts.get("Delete") or 0),
                    "is_merge": is_merge_comment(comment),
                    "is_bot": is_bot_email(author.get("email")),
                    "branch": branch,
                    "remote_url": c.get("remoteUrl") or c.get("url"),
                })
            if len(batch) < _PAGE_SIZE:
                break
    return out
