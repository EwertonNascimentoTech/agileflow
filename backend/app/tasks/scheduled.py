"""
Celery beat tasks agendadas.
"""
import asyncio
import logging

from app.core.celery_app import celery_app

logger = logging.getLogger(__name__)


def _run(coro):
    """Roda a corrotina num loop próprio e, ao final, fecha as conexões abertas NELE.

    A engine async (e o cliente Redis) são globais do processo: sem descartar o pool, a
    próxima tarefa do mesmo worker pega conexões presas ao loop já fechado e falha com
    "attached to a different loop" / "Event loop is closed" (SLA, commits e ocorrências
    falhavam de forma intermitente)."""
    loop = asyncio.new_event_loop()
    try:
        return loop.run_until_complete(coro)
    finally:
        try:
            from app.core.database import engine

            loop.run_until_complete(engine.dispose())
        except Exception:  # noqa: BLE001
            logger.exception("[celery] falha ao descartar o pool do banco")
        try:
            import app.core.cache as _cache

            if _cache._redis is not None:
                loop.run_until_complete(_cache._redis.aclose())
                _cache._redis = None
        except Exception:  # noqa: BLE001
            pass
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
    # Operação Assistida: ocorrência sem responsável há 1h útil → avisa o PO.
    "check-unassigned-occurrences": {
        "task": "scheduled.check_unassigned_occurrences",
        "schedule": 300.0,
    },
}


@celery_app.task(name="scheduled.check_unassigned_occurrences")
def check_unassigned_occurrences_task():
    _run(_check_unassigned_occurrences())


async def _check_unassigned_occurrences() -> None:
    from sqlalchemy import select, text
    from app.core.database import AsyncSessionLocal
    from app.modules.super_admin.models import Tenant
    from app.modules.projetos.assisted_ops import AssistedOpsService

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
                if (await db.execute(text("SELECT to_regclass('project_occurrences')"))).scalar() is None:
                    continue
                alerted = await AssistedOpsService.scan_unassigned(db)
                # POP.COR.GTD.003: prazo de resolução da correção e fim previsto da OA.
                alerted += await AssistedOpsService.scan_sla_breaches(db)
                alerted += await AssistedOpsService.scan_assisted_op_due(db)
                alerted += await AssistedOpsService.scan_n1_overdue(db)
                if alerted:
                    logger.info("[check_unassigned_occurrences] %s: %s alerta(s)", schema, alerted)
        except Exception as e:  # noqa: BLE001
            logger.error("[check_unassigned_occurrences] %s: %s", schema, e)


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


@celery_app.task(name="agents.run_stage_agent")
def run_stage_agent_task(schema: str, project_id: str, task_id: str, status_id: str):
    _run(_run_stage_agent(schema, project_id, task_id, status_id))


async def _run_stage_agent(schema: str, project_id: str, task_id: str, status_id: str) -> None:
    """Executa o agente de IA da etapa fora da requisição (disparado por
    ProjectAgentRunner.dispatch_on_enter). Se o card já saiu da etapa, não faz nada."""
    import re
    import uuid

    from sqlalchemy import event, text

    from app.core.database import AsyncSessionLocal
    from app.modules.projetos.models import ProjectStatusConfig, ProjectTask
    from app.modules.projetos.service import ProjectAgentRunner

    if not re.fullmatch(r"tenant_[a-z0-9_]+", schema or ""):
        logger.error("[agents] schema inválido: %r", schema)
        return
    search_path = f"{schema}, public"
    async with AsyncSessionLocal() as db:
        # O agente faz vários commits; com asyncpg o SET se perde entre transações — reaplica
        # a cada BEGIN (mesmo gancho do require_module).
        def _reapply(session, transaction, connection):
            connection.exec_driver_sql(f"SET search_path TO {search_path}")

        event.listen(db.sync_session, "after_begin", _reapply)
        try:
            await db.execute(text(f"SET search_path TO {search_path}"))
            task = await db.get(ProjectTask, uuid.UUID(task_id))
            if task is None or str(task.status_id) != status_id:
                logger.info("[agents] card %s saiu da etapa antes do agente — ignorado", task_id)
                return
            status = await db.get(ProjectStatusConfig, uuid.UUID(status_id))
            await ProjectAgentRunner.run_on_enter(db, uuid.UUID(project_id), task, status)
        except Exception as e:  # noqa: BLE001
            logger.error("[agents] %s/%s: %s", schema, task_id, e)
        finally:
            try:
                event.remove(db.sync_session, "after_begin", _reapply)
            except Exception:  # noqa: BLE001
                pass


@celery_app.task(name="payroll.sync_user", bind=True, max_retries=6)
def sync_payroll_user_task(self, user_id: str):
    """Dados da folha (Genus) do 1º login pelo IDigital (disparado por SsoService.exchange).
    Genus fora do ar ou bloqueado: tenta de novo em 1 min, 5 min, 25 min, ~2 h, 6 h e 6 h."""
    from app.modules.super_admin.payroll import PayrollUnavailable

    try:
        result = _run(_sync_payroll_user(user_id))
        logger.info("[payroll] %s: %s", user_id, result)
    except PayrollUnavailable as exc:
        countdown = min(60 * 5 ** self.request.retries, 6 * 3600)
        logger.warning("[payroll] %s: %s; nova tentativa em %ss", user_id, exc, countdown)
        raise self.retry(exc=exc, countdown=countdown)


async def _sync_payroll_user(user_id: str) -> str:
    import uuid

    from app.core.database import AsyncSessionLocal
    from app.modules.super_admin.payroll import PayrollService

    async with AsyncSessionLocal() as db:
        return await PayrollService.sync_user(db, uuid.UUID(user_id))
