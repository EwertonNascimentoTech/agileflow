"""Folha de pagamento FIEA (Genus): dados funcionais do colaborador, buscados pelo e-mail.

Roda no 1º login pelo IDigital, numa tarefa Celery (fora do caminho do login). Guarda matrícula,
organização, departamento, cargo funcional e função de confiança em `public.user_payroll_profiles`;
no cliente do Portal, o departamento também preenche `project_clients.department` se estiver vazio.
O CPF (`document`) que a API devolve é descartado aqui, antes de qualquer gravação ou log.
"""
import logging
import uuid
from datetime import datetime
from typing import Optional

import httpx
from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.modules.super_admin.models import Tenant, User, UserPayrollProfile
from app.modules.super_admin.service import AuditService

logger = logging.getLogger(__name__)

# Campo da API → (coluna, tamanho). `document` (CPF) fica de fora de propósito.
_FIELDS: dict[str, tuple[str, int]] = {
    "employeeNumber": ("employee_number", 30),
    "organization": ("organization", 50),
    "department": ("department", 200),
    "role": ("job_title", 200),
    "trustRole": ("trust_role", 200),
    "updatedAt": ("source_updated_at", 40),
}


class PayrollUnavailable(Exception):
    """Genus fora do ar, bloqueado (Cloudflare) ou fora do contrato: vale tentar de novo."""


class PayrollService:

    @staticmethod
    def configured() -> bool:
        return bool(settings.GENUS_API_TOKEN and settings.GENUS_API_URL)

    @staticmethod
    def pick(payload: dict, email: str) -> Optional[dict]:
        """Registro da folha com exatamente este e-mail, só com os campos que guardamos."""
        for item in payload.get("items") or []:
            if str(item.get("email") or "").strip().lower() != email:
                continue
            out: dict[str, Optional[str]] = {}
            for key, (column, size) in _FIELDS.items():
                value = item.get(key)
                cleaned = str(value).strip()[:size] if value is not None else ""
                out[column] = cleaned or None
            return out
        return None

    @staticmethod
    async def fetch_by_email(email: str) -> Optional[dict]:
        url = settings.GENUS_API_URL.rstrip("/") + "/api/payroll/users"
        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                resp = await client.get(
                    url,
                    params={"email": email},
                    headers={"Authorization": f"Bearer {settings.GENUS_API_TOKEN}", "Accept": "application/json"},
                )
        except httpx.HTTPError as exc:
            raise PayrollUnavailable(f"Genus inacessível ({exc.__class__.__name__})") from exc
        if resp.status_code == 404:
            return None
        if resp.status_code != 200:
            via = " pelo Cloudflare" if "cloudflare" in resp.headers.get("server", "").lower() else ""
            raise PayrollUnavailable(f"Genus recusou{via} (HTTP {resp.status_code})")
        try:
            payload = resp.json()
        except ValueError as exc:
            raise PayrollUnavailable("Genus respondeu sem JSON") from exc
        return PayrollService.pick(payload, email)

    @staticmethod
    async def sync_user(db: AsyncSession, user_id: uuid.UUID) -> str:
        """Busca e grava os dados da folha do usuário: 'found', 'not_found' ou 'skipped'.
        Levanta PayrollUnavailable quando vale tentar de novo."""
        await db.execute(text("SET search_path TO public"))
        user = await db.get(User, user_id)
        if user is None or not PayrollService.configured():
            return "skipped"
        data = await PayrollService.fetch_by_email(user.email.strip().lower())
        if data is None:
            await AuditService.log(
                db, "payroll_lookup", "user", user_id=user.id, tenant_id=user.tenant_id, entity_id=user.id,
                details={"source": "genus", "found": False},
            )
            return "not_found"

        profile = (await db.execute(
            select(UserPayrollProfile).where(UserPayrollProfile.user_id == user.id)
        )).scalar_one_or_none()
        if profile is None:
            profile = UserPayrollProfile(user_id=user.id, source="genus")
            db.add(profile)
        for column, value in data.items():
            setattr(profile, column, value)
        profile.fetched_at = datetime.utcnow()
        await db.flush()

        client_filled = await PayrollService._fill_client_department(db, user, data.get("department"))
        await db.commit()
        # Auditoria sem valores: só quais campos vieram.
        await AuditService.log(
            db, "payroll_lookup", "user", user_id=user.id, tenant_id=user.tenant_id, entity_id=user.id,
            details={
                "source": "genus",
                "found": True,
                "fields": sorted(column for column, value in data.items() if value),
                "client_department": client_filled,
            },
        )
        return "found"

    @staticmethod
    async def _fill_client_department(db: AsyncSession, user: User, department: Optional[str]) -> bool:
        """Cliente do Portal: o departamento da folha preenche o cadastro quando está vazio."""
        if not department or not user.tenant_id:
            return False
        schema = (await db.execute(
            select(Tenant.schema_name).where(Tenant.id == user.tenant_id)
        )).scalar_one_or_none()
        if not schema:
            return False
        has_clients = (await db.execute(
            text("SELECT to_regclass(:t)"), {"t": f'"{schema}".project_clients'}
        )).scalar_one_or_none()
        if has_clients is None:
            return False

        from app.modules.projetos.models import ProjectClient

        await db.execute(text(f'SET search_path TO "{schema}", public'))
        try:
            client = (await db.execute(
                select(ProjectClient).where(ProjectClient.user_id == user.id)
            )).scalar_one_or_none()
            if client is None or (client.department or "").strip():
                return False
            client.department = department
            client.updated_at = datetime.utcnow()
            await db.flush()  # grava no schema do tenant antes de voltar ao public
            return True
        finally:
            await db.execute(text("SET search_path TO public"))
