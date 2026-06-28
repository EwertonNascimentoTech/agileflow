#!/usr/bin/env python3
"""Lê stacks da planilha de cadastro de produtos, cria no TeamOps e vincula aos produtos.

Uso (dentro do container api):
  python scripts/import_product_stacks_from_xlsx.py /tmp/cadastro.xlsx --schema tenant_ss
"""

from __future__ import annotations

import argparse
import asyncio
import re
import sys
import unicodedata
import uuid
from collections import defaultdict
from pathlib import Path

import openpyxl
from sqlalchemy import select, text

# app no PYTHONPATH (/app no container)
from app.core.database import AsyncSessionLocal
from app.modules.produtos.models import Product
from app.modules.teamops.models import Stack, StackCategory
from app.modules.teamops.service import StackService, _slugify
from app.modules.teamops.schemas import StackCreate

def _default_xlsx() -> Path:
    here = Path(__file__).resolve()
    for base in (here.parents[2], here.parents[1], Path("/tmp")):
        candidate = base / "docs" / "cadastro produtos_Geral.xlsx"
        if candidate.is_file():
            return candidate
        candidate = base / "cadastro.xlsx"
        if candidate.is_file():
            return candidate
    return Path("/tmp/cadastro.xlsx")

# Nome canônico no catálogo TeamOps
ALIASES: dict[str, str] = {
    "javascript": "JavaScript",
    "js": "JavaScript",
    "mysql": "MySQL",
    "miniio": "MinIO",
    "minio": "MinIO",
    "nest": "NestJS",
    "node": "Node.js",
    "nodejs": "Node.js",
    "vue": "Vue.js",
    "vue.js": "Vue.js",
    "php (laravel)": "PHP (Laravel)",
    "php(laravel)": "PHP (Laravel)",
    "laravel": "PHP (Laravel)",
    "sql server": "SQL Server",
    "postgresql": "PostgreSQL",
    "postgres": "PostgreSQL",
    "python": "Python",
    "php": "PHP",
    "react": "React",
    "xml": "XML",
    "fastapi": "FastAPI",
    "agno": "Agno",
    "typescript": "TypeScript",
    "sqlite": "SQLite",
}

CATEGORY_BY_STACK: dict[str, str] = {
    "Python": "Desenvolvimento",
    "JavaScript": "Desenvolvimento",
    "React": "Desenvolvimento",
    "Vue.js": "Desenvolvimento",
    "PHP": "Desenvolvimento",
    "PHP (Laravel)": "Desenvolvimento",
    "TypeScript": "Desenvolvimento",
    "NestJS": "Desenvolvimento",
    "FastAPI": "Desenvolvimento",
    "Agno": "Desenvolvimento",
    "Node.js": "Desenvolvimento",
    "XML": "Desenvolvimento",
    "PostgreSQL": "Dados",
    "SQLite": "Dados",
    "MySQL": "Dados",
    "SQL Server": "Dados",
    "MinIO": "Infra/DevOps",
}


def _norm_key(s: str) -> str:
    s = unicodedata.normalize("NFD", s)
    s = "".join(c for c in s if unicodedata.category(c) != "Mn")
    return re.sub(r"\s+", " ", s.strip().lower())


def expand_stack_tokens(raw: str) -> list[str]:
    """Converte célula da planilha em nomes canônicos de stack."""
    if not raw:
        return []
    text_val = str(raw).replace("\n", ";").replace(",", ";")
    out: list[str] = []
    for part in text_val.split(";"):
        token = part.strip()
        if not token:
            continue
        low = _norm_key(token)
        if "fastapi" in low or "agno" in low:
            out.extend(["Python", "FastAPI", "Agno"])
            continue
        if "react" in low and "typescript" in low:
            out.extend(["React", "TypeScript"])
            continue
        if low.startswith("banco de dados:") or low == "sqlite":
            out.append("SQLite")
            continue
        if low in ALIASES:
            out.append(ALIASES[low])
            continue
        # tenta alias por substring para tokens simples
        matched = False
        for alias_key, canonical in ALIASES.items():
            if low == alias_key:
                out.append(canonical)
                matched = True
                break
        if not matched:
            out.append(token.strip())
    # dedupe preservando ordem
    seen: set[str] = set()
    unique: list[str] = []
    for name in out:
        key = _norm_key(name)
        if key not in seen:
            seen.add(key)
            unique.append(name if name in ALIASES.values() else _canonicalize(name))
    return unique


def _canonicalize(name: str) -> str:
    key = _norm_key(name)
    return ALIASES.get(key, name.strip())


def parse_workbook(path: Path) -> list[tuple[str, list[str]]]:
    wb = openpyxl.load_workbook(path, read_only=True, data_only=True)
    ws = wb["Cadastro"]
    rows: list[tuple[str, list[str]]] = []
    for r in ws.iter_rows(min_row=5, values_only=True):
        name = (str(r[0]).strip() if r[0] else "")
        if not name:
            continue
        stacks = expand_stack_tokens(r[7] if len(r) > 7 else None)
        if stacks:
            rows.append((name, stacks))
    wb.close()
    return rows


async def run(xlsx: Path, schema: str, dry_run: bool) -> None:
    product_rows = parse_workbook(xlsx)
    all_stack_names: set[str] = set()
    for _, stacks in product_rows:
        all_stack_names.update(stacks)

    print(f"Planilha: {xlsx}")
    print(f"Tenant schema: {schema}")
    print(f"Produtos com stacks: {len(product_rows)}")
    print(f"Stacks únicas (canônicas): {len(all_stack_names)}")
    for s in sorted(all_stack_names, key=lambda x: x.lower()):
        print(f"  · {s}")

    async with AsyncSessionLocal() as db:
        await db.execute(text(f"SET search_path TO {schema}, public"))

        cats = (await db.execute(select(StackCategory))).scalars().all()
        cat_by_name = {c.name: c for c in cats}

        existing = (await db.execute(select(Stack))).scalars().all()
        stack_by_key: dict[str, Stack] = {}
        for st in existing:
            stack_by_key[_norm_key(st.name)] = st
            stack_by_key[st.slug] = st

        created: list[str] = []
        for name in sorted(all_stack_names, key=lambda x: x.lower()):
            key = _norm_key(name)
            if key in stack_by_key:
                continue
            cat_name = CATEGORY_BY_STACK.get(name, "Desenvolvimento")
            cat = cat_by_name.get(cat_name)
            if not cat:
                raise SystemExit(f"Categoria não encontrada: {cat_name}")
            slug = _slugify(name)
            if slug in stack_by_key:
                stack_by_key[key] = stack_by_key[slug]
                continue
            print(f"+ Criar stack: {name} ({cat_name})")
            if not dry_run:
                st = await StackService.create(
                    db,
                    StackCreate(category_id=cat.id, name=name, slug=slug),
                )
                stack_by_key[key] = st
                stack_by_key[slug] = st
            created.append(name)

        if not dry_run:
            existing = (await db.execute(select(Stack))).scalars().all()
            stack_by_key = {}
            for st in existing:
                stack_by_key[_norm_key(st.name)] = st
                stack_by_key[st.slug] = st

        products = (await db.execute(select(Product).where(Product.is_active.is_(True)))).scalars().all()
        prod_by_key = {_norm_key(p.name): p for p in products}

        linked = 0
        missing_products: list[str] = []
        missing_stacks: dict[str, list[str]] = defaultdict(list)

        for excel_name, stack_names in product_rows:
            p = prod_by_key.get(_norm_key(excel_name))
            if not p:
                missing_products.append(excel_name)
                continue
            ids: list[str] = []
            for sn in stack_names:
                st = stack_by_key.get(_norm_key(sn))
                if not st:
                    missing_stacks[excel_name].append(sn)
                    continue
                ids.append(str(st.id))
            # dedupe ids preserving order
            seen_ids: set[str] = set()
            unique_ids = []
            for i in ids:
                if i not in seen_ids:
                    seen_ids.add(i)
                    unique_ids.append(i)
            if not unique_ids:
                continue
            print(f"→ {p.name}: {[stack_by_key[_norm_key(sn)].name for sn in stack_names if stack_by_key.get(_norm_key(sn))]}")
            if not dry_run:
                p.stacks = unique_ids
                linked += 1

        if not dry_run:
            await db.commit()

        print()
        print(f"Stacks criadas: {len(created)}")
        print(f"Produtos vinculados: {linked}")
        if missing_products:
            print(f"Produtos não encontrados no banco ({len(missing_products)}):")
            for n in missing_products:
                print(f"  ! {n}")
        if missing_stacks:
            print("Stacks sem match:")
            for prod, stacks in missing_stacks.items():
                print(f"  ! {prod}: {stacks}")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("xlsx", nargs="?", default=None)
    parser.add_argument("--schema", default="tenant_ss")
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()
    path = Path(args.xlsx) if args.xlsx else _default_xlsx()
    if not path.is_file():
        sys.exit(f"Arquivo não encontrado: {path}")
    asyncio.run(run(path, args.schema, args.dry_run))


if __name__ == "__main__":
    main()
