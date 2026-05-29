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
}


@celery_app.task(name="scheduled.check_project_slas")
def check_project_slas_task():
    _run(_check_project_slas())


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
