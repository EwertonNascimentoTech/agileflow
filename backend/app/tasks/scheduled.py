"""
Celery beat tasks agendadas.
"""
import asyncio
import logging

from app.core.celery_app import celery_app

logger = logging.getLogger(__name__)


def _run(coro):
    loop = asyncio.new_event_loop()
    try:
        return loop.run_until_complete(coro)
    finally:
        loop.close()


celery_app.conf.beat_schedule = {
    "check-project-slas": {
        "task": "scheduled.check_project_slas",
        "schedule": 900.0,
    },
    "sync-repo-commits": {
        "task": "scheduled.sync_repo_commits",
        "schedule": 1800.0,
    },
}


@celery_app.task(name="scheduled.check_project_slas")
def check_project_slas_task():
    _run(_check_project_slas())


@celery_app.task(name="scheduled.sync_repo_commits")
def sync_repo_commits_task():
    _run(_sync_repo_commits())


async def _sync_repo_commits() -> None:
    """Importa os commits dos repositórios Azure DevOps vinculados aos produtos.

    Fonte de verdade da integração: o webhook antecipa, este job reconcilia (o payload do
    push é truncado e não traz changeCounts).
    """
    from sqlalchemy import text, select
    from app.core.database import AsyncSessionLocal
    from app.modules.super_admin.models import Tenant
    from app.modules.produtos.azure_devops_client import azure_devops_configured
    from app.modules.produtos.repos_service import RepoSyncService

    if not azure_devops_configured():
        return  # sem PAT a integração fica inerte, sem poluir log

    async with AsyncSessionLocal() as db:
        await db.execute(text("SET search_path TO public"))
        tenants = list(
            (
                await db.execute(
                    select(Tenant.schema_name).where(Tenant.is_active == True)  # noqa: E712
                )
            ).scalars()
        )

    for schema in tenants:
        try:
            async with AsyncSessionLocal() as db:
                await db.execute(text(f"SET search_path TO {schema}, public"))
                result = await RepoSyncService.sync_schema(db)
                if result.commits_novos:
                    logger.info(
                        "[sync_repo_commits] %s: %s repos, %s commits",
                        schema, result.repositorios, result.commits_novos,
                    )
        except Exception as e:  # noqa: BLE001
            logger.error("[sync_repo_commits] %s: %s", schema, e)


async def _check_project_slas() -> None:
    from sqlalchemy import text, select
    from app.core.database import AsyncSessionLocal
    from app.modules.super_admin.models import Tenant
    from app.modules.projetos.service import ProjectSlaService

    async with AsyncSessionLocal() as db:
        await db.execute(text("SET search_path TO public"))
        tenants = list(
            (
                await db.execute(
                    select(Tenant.schema_name).where(Tenant.is_active == True)  # noqa: E712
                )
            ).scalars()
        )

    for schema in tenants:
        try:
            async with AsyncSessionLocal() as db:
                await db.execute(text(f"SET search_path TO {schema}, public"))
                await ProjectSlaService.scan_schema(db)
        except Exception as e:  # noqa: BLE001
            logger.error("[check_project_slas] %s: %s", schema, e)
