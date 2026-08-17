"""Service Hook do Azure DevOps (evento `git.push`).

Fica fora de `require_module("produtos")` porque o Azure não manda JWT — a autenticação é
Basic, configurada na própria subscription do hook.

Este endpoint apenas ANTECIPA: o payload do push é truncado em pushes grandes e não traz
`changeCounts`. O job `scheduled.sync_repo_commits` continua sendo a fonte de verdade e
completa as linhas que chegaram por aqui.
"""

from __future__ import annotations

import hmac
import logging
import uuid
from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Header, HTTPException, Request
from sqlalchemy import select, text
from sqlalchemy.dialects.postgresql import insert as pg_insert

from app.core.config import settings
from app.core.database import AsyncSessionLocal
from app.modules.produtos.azure_devops_client import is_bot_email, is_merge_comment
from app.modules.produtos.models import CodeRepository, RepoCommit
from app.modules.super_admin.models import Tenant

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/webhooks/azure-devops", tags=["Webhooks"])


def _check_basic(authorization: Optional[str]) -> None:
    """Basic auth do service hook, com comparação em tempo constante."""
    import base64

    if not (settings.AZURE_DEVOPS_WEBHOOK_USER and settings.AZURE_DEVOPS_WEBHOOK_SECRET):
        raise HTTPException(503, "Webhook do Azure DevOps não configurado.")
    if not authorization or not authorization.lower().startswith("basic "):
        raise HTTPException(401, "Credenciais ausentes.")
    try:
        raw = base64.b64decode(authorization.split(" ", 1)[1]).decode()
        user, _, secret = raw.partition(":")
    except Exception:  # noqa: BLE001
        raise HTTPException(401, "Credenciais inválidas.")
    ok_user = hmac.compare_digest(user, settings.AZURE_DEVOPS_WEBHOOK_USER)
    ok_secret = hmac.compare_digest(secret, settings.AZURE_DEVOPS_WEBHOOK_SECRET)
    if not (ok_user and ok_secret):
        raise HTTPException(401, "Credenciais inválidas.")


def _parse_dt(value) -> Optional[datetime]:
    if not value:
        return None
    try:
        return datetime.fromisoformat(str(value).replace("Z", "+00:00")).replace(tzinfo=None)
    except ValueError:
        return None


@router.post("/{tenant_slug}/push", status_code=204)
async def azure_push(
    tenant_slug: str,
    request: Request,
    authorization: Optional[str] = Header(None),
):
    """Recebe `git.push`. Sempre 204 para payload que não reconhecemos — o Azure desabilita
    a subscription depois de erros repetidos, e um push estranho não pode custar isso."""
    _check_basic(authorization)

    try:
        payload = await request.json()
    except Exception:  # noqa: BLE001
        return

    if (payload.get("eventType") or "") != "git.push":
        return

    resource = payload.get("resource") or {}
    repo_info = resource.get("repository") or {}
    remote_id = repo_info.get("id")
    commits = resource.get("commits") or []
    if not remote_id or not commits:
        return

    # O schema vem SEMPRE de public.tenants — nunca de nada que o payload diga.
    async with AsyncSessionLocal() as db:
        await db.execute(text("SET search_path TO public"))
        schema = (await db.execute(
            select(Tenant.schema_name).where(
                Tenant.slug == tenant_slug, Tenant.is_active == True,  # noqa: E712
            )
        )).scalar_one_or_none()
    if not schema:
        logger.warning("[webhook azure] tenant desconhecido: %s", tenant_slug)
        return

    async with AsyncSessionLocal() as db:
        await db.execute(text(f"SET search_path TO {schema}, public"))
        repo = (await db.execute(
            select(CodeRepository).where(CodeRepository.remote_repo_id == str(remote_id))
        )).scalar_one_or_none()
        if not repo:
            # Não cadastrar repositório a partir de webhook: quem tivesse a URL inseriria linhas.
            logger.info("[webhook azure] repositório não cadastrado: %s", remote_id)
            return

        # Só o branch padrão — o job lê o mesmo, senão o painel diverge da coleta.
        if repo.default_branch:
            refs = [(r.get("name") or "") for r in (resource.get("refUpdates") or [])]
            alvo = f"refs/heads/{repo.default_branch}"
            if refs and alvo not in refs:
                return

        rows = []
        for c in commits:
            author = c.get("author") or {}
            author_date = _parse_dt(author.get("date"))
            if not (c.get("commitId") and author_date):
                continue
            rows.append({
                "id": uuid.uuid4(),
                "repository_id": repo.id,
                "commit_id": c["commitId"],
                "author_name": (author.get("name") or "")[:200] or None,
                "author_email": (author.get("email") or "").strip().lower()[:255] or None,
                "author_date": author_date,
                "comment": c.get("comment"),
                # changeCounts não vem no payload de push — o job preenche depois.
                "add_count": 0, "edit_count": 0, "delete_count": 0,
                "is_merge": is_merge_comment(c.get("comment")),
                "is_bot": is_bot_email(author.get("email")),
                "remote_url": c.get("url"),
                "synced_at": datetime.utcnow(),
            })
        if not rows:
            return

        stmt = pg_insert(RepoCommit).values(rows).on_conflict_do_nothing(
            index_elements=["repository_id", "commit_id"]
        )
        await db.execute(stmt)

        mais_novo = max(r["author_date"] for r in rows)
        repo.last_commit_at = max(repo.last_commit_at or mais_novo, mais_novo)
        # Vai primeiro na fila do próximo tick, para completar changeCounts e o que foi truncado.
        repo.last_sync_at = None
        await db.commit()

        from app.modules.produtos.repos_service import CommitAuthorService
        await CommitAuthorService.refresh_authors(db)
        await db.commit()
