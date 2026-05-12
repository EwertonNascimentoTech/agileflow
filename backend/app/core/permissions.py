"""
Sync de permissions declaradas pelos módulos para a tabela `module_permissions`.

Cada módulo expõe `permissions.py` com:
    MODULE_SLUG = "<slug>"
    PERMISSIONS = [(code, name, description), ...]

No startup do app, este módulo varre `app.modules.*` e faz upsert.
Permissions removidas do código também são removidas do DB (assim a UI
sempre reflete o estado atual do código).
"""
import importlib
import pkgutil
from typing import Iterable

from sqlalchemy import select, delete
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import AsyncSessionLocal
from app.modules.super_admin.models import ModulePermission


def _discover_module_permissions() -> dict[str, list[tuple[str, str, str | None]]]:
    """Importa permissions.py de cada módulo em app.modules.*."""
    import app.modules as modules_pkg

    found: dict[str, list[tuple[str, str, str | None]]] = {}
    for info in pkgutil.iter_modules(modules_pkg.__path__):
        if info.ispkg:
            try:
                mod = importlib.import_module(f"app.modules.{info.name}.permissions")
            except ModuleNotFoundError:
                continue
            slug = getattr(mod, "MODULE_SLUG", None) or info.name
            perms = getattr(mod, "PERMISSIONS", [])
            if perms:
                found[slug] = list(perms)
    return found


async def sync_permissions() -> None:
    """Reconcilia o catálogo de permissions com o que cada módulo declara."""
    declared = _discover_module_permissions()

    async with AsyncSessionLocal() as db:
        result = await db.execute(select(ModulePermission))
        existing: list[ModulePermission] = list(result.scalars().all())
        existing_by_code = {p.code: p for p in existing}

        declared_codes: set[str] = set()
        for slug, perms in declared.items():
            for code, name, description in perms:
                declared_codes.add(code)
                p = existing_by_code.get(code)
                if p is None:
                    db.add(ModulePermission(
                        module_slug=slug,
                        code=code,
                        name=name,
                        description=description,
                    ))
                else:
                    if p.module_slug != slug or p.name != name or p.description != description:
                        p.module_slug = slug
                        p.name = name
                        p.description = description

        # Remove permissions que sumiram do código.
        stale = [code for code in existing_by_code if code not in declared_codes]
        if stale:
            await db.execute(
                delete(ModulePermission).where(ModulePermission.code.in_(stale))
            )

        await db.commit()


def collect_codes_for_module(slug: str) -> Iterable[str]:
    """Retorna os codes declarados pelo módulo sem ir ao DB. Útil pra testes."""
    declared = _discover_module_permissions()
    return [code for (code, _, _) in declared.get(slug, [])]
