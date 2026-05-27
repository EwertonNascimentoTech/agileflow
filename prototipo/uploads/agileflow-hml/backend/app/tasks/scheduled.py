"""
Celery beat tasks agendadas (Fase 8).
- Expirar propostas com valid_until < now
- Notificar tarefas vencendo hoje
"""
import asyncio
import logging
from datetime import datetime, timedelta

from app.core.celery_app import celery_app

logger = logging.getLogger(__name__)


def _run(coro):
    loop = asyncio.new_event_loop()
    try:
        return loop.run_until_complete(coro)
    finally:
        loop.close()


# ─────────────────────────────────────────────
# Beat schedule
# ─────────────────────────────────────────────

celery_app.conf.beat_schedule = {
    "expire-proposals-daily": {
        "task": "scheduled.expire_proposals",
        "schedule": 3600.0,  # a cada hora
    },
    "notify-due-tasks-daily": {
        "task": "scheduled.notify_due_tasks",
        "schedule": 3600.0,
    },
    "check-project-slas": {
        "task": "scheduled.check_project_slas",
        "schedule": 900.0,  # a cada 15 minutos
    },
}


# ─────────────────────────────────────────────
# Tasks
# ─────────────────────────────────────────────

@celery_app.task(name="scheduled.expire_proposals")
def expire_proposals_task():
    """Muda status das propostas para 'expired' quando valid_until < now."""
    _run(_expire_proposals())


@celery_app.task(name="scheduled.notify_due_tasks")
def notify_due_tasks_task():
    """Cria notificações para tarefas com due_date <= now ainda pendentes."""
    _run(_notify_due_tasks())


@celery_app.task(name="scheduled.check_project_slas")
def check_project_slas_task():
    """Recalcula o SLA dos cards de projetos em todos os tenants e dispara alertas."""
    _run(_check_project_slas())


async def _check_project_slas() -> None:
    from sqlalchemy import text, select
    from app.core.database import AsyncSessionLocal
    from app.modules.super_admin.models import Tenant
    from app.modules.projetos.service import ProjectSlaService

    async with AsyncSessionLocal() as db:
        await db.execute(text("SET search_path TO public"))
        tenants = list((await db.execute(
            select(Tenant.schema_name).where(Tenant.is_active == True)  # noqa: E712
        )).scalars())

    for schema in tenants:
        try:
            async with AsyncSessionLocal() as db:
                await db.execute(text(f"SET search_path TO {schema}, public"))
                await ProjectSlaService.scan_schema(db)
        except Exception as e:  # noqa: BLE001 — tenant sem módulo projetos / tabela ausente
            logger.error("[check_project_slas] %s: %s", schema, e)


async def _expire_proposals() -> None:
    from sqlalchemy import text, update, select
    from app.core.database import AsyncSessionLocal
    from app.modules.super_admin.models import Tenant

    async with AsyncSessionLocal() as db:
        await db.execute(text("SET search_path TO public"))
        tenants = list((await db.execute(
            select(Tenant.schema_name).where(Tenant.is_active == True)  # noqa: E712
        )).scalars())

    now = datetime.utcnow()

    for schema in tenants:
        try:
            async with AsyncSessionLocal() as db:
                await db.execute(text(f"SET search_path TO {schema}, public"))
                await db.execute(
                    text("""
                        UPDATE proposals
                        SET status = 'expired', updated_at = now()
                        WHERE status IN ('draft', 'sent')
                          AND valid_until IS NOT NULL
                          AND valid_until < :now
                    """),
                    {"now": now},
                )
                await db.commit()
        except Exception as e:  # noqa: BLE001
            logger.error("[expire_proposals] %s: %s", schema, e)


async def _notify_due_tasks() -> None:
    """Insere notificações para tarefas com due_date <= agora que ainda não foram notificadas."""
    from sqlalchemy import text, select
    from app.core.database import AsyncSessionLocal
    from app.modules.super_admin.models import Tenant

    async with AsyncSessionLocal() as db:
        await db.execute(text("SET search_path TO public"))
        tenants = list((await db.execute(
            select(Tenant.schema_name).where(Tenant.is_active == True)  # noqa: E712
        )).scalars())

    now = datetime.utcnow()
    window_start = now - timedelta(hours=1)  # evita duplicatas da hora anterior

    for schema in tenants:
        try:
            async with AsyncSessionLocal() as db:
                await db.execute(text(f"SET search_path TO {schema}, public"))
                # Tarefas vencidas que ainda não geraram notificação
                result = await db.execute(
                    text("""
                        SELECT t.id, t.title, t.assigned_to, t.due_date
                        FROM tasks t
                        WHERE t.status IN ('pending', 'in_progress')
                          AND t.due_date IS NOT NULL
                          AND t.due_date BETWEEN :start AND :now
                          AND NOT EXISTS (
                              SELECT 1 FROM notifications n
                              WHERE n.entity_type = 'task'
                                AND n.entity_id = t.id
                                AND n.created_at >= :start
                          )
                    """),
                    {"now": now, "start": window_start},
                )
                rows = result.fetchall()
                for row in rows:
                    task_id, title, assigned_to, due_date = row
                    if not assigned_to:
                        continue
                    await db.execute(
                        text("""
                            INSERT INTO notifications (id, user_id, title, body, entity_type, entity_id)
                            VALUES (gen_random_uuid(), :uid, :title, :body, 'task', :eid)
                        """),
                        {
                            "uid": assigned_to,
                            "title": f"Tarefa vencendo: {title}",
                            "body": f"Vencimento: {due_date.strftime('%d/%m/%Y %H:%M')}",
                            "eid": task_id,
                        },
                    )
                await db.commit()
        except Exception as e:  # noqa: BLE001
            logger.error("[notify_due_tasks] %s: %s", schema, e)
