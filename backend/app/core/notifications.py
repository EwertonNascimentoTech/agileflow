"""
notifications.py — Notificações in-app (sino) do tenant.

Ponto único de gravação na tabela `notifications` (schema do tenant, sem ORM). A sessão
recebida já precisa estar com o `search_path` do tenant (ModuleContext.db).

Destinatário é sempre `public.users.id`. Quem tem só a Pessoa (TeamOps) — ex.:
`ProjectTask.assigned_to` — resolve antes com `user_ids_for_persons`.
"""
import uuid
from typing import Iterable, Optional

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession


async def user_ids_for_persons(
    db: AsyncSession, person_ids: Iterable[Optional[uuid.UUID]]
) -> list[uuid.UUID]:
    """Logins vinculados às Pessoas informadas (Pessoa sem login é ignorada)."""
    ids = [str(p) for p in {p for p in person_ids if p}]
    if not ids:
        return []
    rows = await db.execute(
        text("SELECT user_id FROM team_persons WHERE id = ANY(CAST(:ids AS uuid[])) AND user_id IS NOT NULL"),
        {"ids": ids},
    )
    return [r[0] for r in rows.all()]


async def notify_users(
    db: AsyncSession,
    user_ids: Iterable[Optional[uuid.UUID]],
    title: str,
    body: Optional[str] = None,
    entity_type: Optional[str] = None,
    entity_id: Optional[uuid.UUID] = None,
    exclude_user_id: Optional[uuid.UUID] = None,
) -> int:
    """Grava uma notificação por destinatário (sem duplicar). Não faz commit.

    `exclude_user_id` = autor da ação — ninguém é notificado do que ele mesmo fez.
    """
    targets = {u for u in user_ids if u and u != exclude_user_id}
    for uid in targets:
        await db.execute(
            text(
                "INSERT INTO notifications (id, user_id, title, body, entity_type, entity_id, is_read, created_at) "
                "VALUES (gen_random_uuid(), :uid, :title, :body, :etype, :eid, FALSE, now())"
            ),
            {
                "uid": str(uid),
                "title": title[:300],
                "body": body,
                "etype": entity_type,
                "eid": str(entity_id) if entity_id else None,
            },
        )
    return len(targets)


async def notify_persons(
    db: AsyncSession,
    person_ids: Iterable[Optional[uuid.UUID]],
    title: str,
    body: Optional[str] = None,
    entity_type: Optional[str] = None,
    entity_id: Optional[uuid.UUID] = None,
    exclude_user_id: Optional[uuid.UUID] = None,
) -> int:
    """Atalho de `notify_users` para destinatários identificados por Pessoa (TeamOps)."""
    user_ids = await user_ids_for_persons(db, person_ids)
    return await notify_users(db, user_ids, title, body, entity_type, entity_id, exclude_user_id)
