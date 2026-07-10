"""Lógica de negócio do módulo Indicadores.

Inclui: CRUD de indicadores, geração idempotente dos acompanhamentos por período
(conforme granularidade), cálculo de percentual de atingimento + status, dashboard
e integração com o portfólio de Produtos.
"""

from __future__ import annotations

import calendar
import uuid
from datetime import date, datetime
from typing import Optional

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.indicadores import schemas
from app.modules.indicadores.models import (
    AcompanhamentoStatus,
    FonteDados,
    FontePortfolioMetrica,
    Indicador,
    IndicadorAcompanhamento,
    IndicadorCategoria,
    IndicadorGranularidade,
    IndicadorSentido,
    IndicadorStatus,
)
from app.modules.teamops.models import Area, Person

_PERIODS = {
    IndicadorGranularidade.MENSAL: 12,
    IndicadorGranularidade.BIMESTRAL: 6,
    IndicadorGranularidade.TRIMESTRAL: 4,
    IndicadorGranularidade.SEMESTRAL: 2,
    IndicadorGranularidade.ANUAL: 1,
}
_ORDINAL = ("", "1º", "2º", "3º", "4º", "5º", "6º")


def _ev(val) -> str:
    return val.value if hasattr(val, "value") else str(val)


def _now() -> datetime:
    return datetime.utcnow()


def _f(val) -> Optional[float]:
    if val is None:
        return None
    return float(val)


def _as_date(val) -> Optional[date]:
    """Normaliza datetime/date para comparação de período (documentos usam created_at)."""
    if val is None:
        return None
    if isinstance(val, datetime):
        return val.date()
    if isinstance(val, date):
        return val
    return None


async def _areas_index(db: AsyncSession) -> dict[uuid.UUID, Area]:
    rows = (await db.execute(select(Area))).scalars().all()
    return {a.id: a for a in rows}


def _setor_name(area: Area, index: dict[uuid.UUID, Area]) -> Optional[str]:
    if area.parent_area_id and area.parent_area_id in index:
        return index[area.parent_area_id].name
    return None


async def _portfolio_servicos_rows(
    db: AsyncSession, metrica: Optional[FontePortfolioMetrica] = None,
) -> list[tuple]:
    """Carrega (data_publicacao, lifecycle) dos serviços ATIVOS de produtos em produção/desenvolvimento."""
    from app.modules.produtos.models import Product, ProductLifecycle, ProductServico

    rows = (await db.execute(
        select(ProductServico.data_publicacao, Product.lifecycle)
        .join(Product, Product.id == ProductServico.product_id)
        .where(
            ProductServico.is_active.is_(True),
            Product.is_active.is_(True),
            Product.lifecycle.in_([ProductLifecycle.PRODUCAO, ProductLifecycle.DESENVOLVIMENTO]),
        )
    )).all()
    return [(dp, lc) for dp, lc in rows]


async def _portfolio_documentos_rows(
    db: AsyncSession, metrica: Optional[FontePortfolioMetrica] = None,
) -> list[tuple]:
    """Carrega (data_documento, lifecycle) dos documentos nato-digital ATIVOS de produtos em produção/desenvolvimento."""
    from app.modules.produtos.models import Product, ProductDocumento, ProductLifecycle

    rows = (await db.execute(
        select(ProductDocumento.data_documento, Product.lifecycle)
        .join(Product, Product.id == ProductDocumento.product_id)
        .where(
            ProductDocumento.is_active.is_(True),
            ProductDocumento.is_nato_digital.is_(True),
            Product.is_active.is_(True),
            Product.lifecycle.in_([ProductLifecycle.PRODUCAO, ProductLifecycle.DESENVOLVIMENTO]),
        )
    )).all()
    return [(dd, lc) for dd, lc in rows]


async def _portfolio_rows(
    db: AsyncSession, metrica: Optional[FontePortfolioMetrica] = None,
) -> list[tuple]:
    """Dataset base para cálculo de % conforme a métrica do indicador."""
    m = metrica or FontePortfolioMetrica.SERVICOS_PUBLICADOS
    if m == FontePortfolioMetrica.DOCUMENTOS_NATOS_DIGITAIS:
        return await _portfolio_documentos_rows(db, metrica)
    return await _portfolio_servicos_rows(db, metrica)


def _pct_ate(rows: list[tuple], ate: date) -> tuple[int, int, Optional[float]]:
    """% em produção cadastrados/publicados até `ate` sobre o total cadastrado/publicado (prod. + desenv.).

    Numerador: acumula por data (itens em produção até `ate`).
    Denominador: total com data preenchida, FIXO — não filtra por data.
    """
    com_data = [(d, lc) for d, lc in rows if d is not None]
    den = len(com_data)
    num = sum(1 for d, lc in com_data if d <= ate and _ev(lc) == "producao")
    pct = round(num / den * 100, 2) if den else None
    return num, den, pct


def _competencia_label(gran: IndicadorGranularidade, ordem: int, ano: int) -> str:
    if gran == IndicadorGranularidade.MENSAL:
        return f"{ordem:02d}/{ano}"
    if gran == IndicadorGranularidade.BIMESTRAL:
        return f"{_ORDINAL[ordem]} Bim/{ano}"
    if gran == IndicadorGranularidade.TRIMESTRAL:
        return f"{_ORDINAL[ordem]} Tri/{ano}"
    if gran == IndicadorGranularidade.SEMESTRAL:
        return f"{_ORDINAL[ordem]} Sem/{ano}"
    return str(ano)


def generate_periods(ano: int, gran: IndicadorGranularidade) -> list[tuple[int, str, date, date]]:
    """Retorna [(ordem, competencia, periodo_inicio, periodo_fim), ...] para o ano."""
    n = _PERIODS[gran]
    months_per = 12 // n
    out: list[tuple[int, str, date, date]] = []
    for i in range(n):
        ordem = i + 1
        start_month = i * months_per + 1
        end_month = start_month + months_per - 1
        inicio = date(ano, start_month, 1)
        last_day = calendar.monthrange(ano, end_month)[1]
        fim = date(ano, end_month, last_day)
        out.append((ordem, _competencia_label(gran, ordem, ano), inicio, fim))
    return out


def calc_status(
    sentido: IndicadorSentido,
    realizado: Optional[float],
    meta: Optional[float],
    meta_min: Optional[float],
    meta_max: Optional[float],
    tolerancia_pct: Optional[float],
) -> tuple[Optional[float], AcompanhamentoStatus]:
    """Calcula (percentual_atingimento, status) conforme o sentido do indicador."""
    if realizado is None:
        return None, AcompanhamentoStatus.PENDENTE

    if sentido == IndicadorSentido.FAIXA_IDEAL:
        if meta_min is None or meta_max is None:
            return None, AcompanhamentoStatus.PENDENTE
        if meta_min <= realizado <= meta_max:
            return 100.0, AcompanhamentoStatus.ATINGIDO
        below = realizado < meta_min
        base = meta_min if below else meta_max
        desvio = (meta_min - realizado) if below else (realizado - meta_max)
        pct = round((1 - desvio / base) * 100, 2) if base else None
        tol = float(tolerancia_pct) if tolerancia_pct is not None else 20.0
        limite = base * (tol / 100)
        if desvio <= limite:
            return pct, AcompanhamentoStatus.EM_ATENCAO
        return pct, AcompanhamentoStatus.NAO_ATINGIDO

    if meta is None or meta == 0:
        return None, AcompanhamentoStatus.PENDENTE

    if sentido == IndicadorSentido.MAIOR_MELHOR:
        pct = round(realizado / meta * 100, 2)
        if realizado >= meta:
            return pct, AcompanhamentoStatus.ATINGIDO
        if pct >= 80:
            return pct, AcompanhamentoStatus.EM_ATENCAO
        return pct, AcompanhamentoStatus.NAO_ATINGIDO

    pct = round(meta / realizado * 100, 2) if realizado else None
    if realizado <= meta:
        return pct, AcompanhamentoStatus.ATINGIDO
    if realizado <= meta * 1.2:
        return pct, AcompanhamentoStatus.EM_ATENCAO
    return pct, AcompanhamentoStatus.NAO_ATINGIDO


def _anexo_from_raw(raw) -> Optional[schemas.AnexoItem]:
    if not raw or not isinstance(raw, dict):
        return None
    on, fn = raw.get("object_name"), raw.get("filename")
    if not on or not fn:
        return None
    return schemas.AnexoItem(
        object_name=on, filename=fn,
        content_type=raw.get("content_type"), size=raw.get("size"),
    )


async def _portfolio_servicos_detalhe(
    db: AsyncSession,
    metrica: Optional[FontePortfolioMetrica],
    ate: date,
    *,
    de: Optional[date] = None,
    numerador_only: bool = False,
) -> list[tuple]:
    """Serviços publicados no intervalo [de, ate]. Numerador: só prod. produção."""
    from app.modules.produtos.models import Product, ProductLifecycle, ProductServico

    lifecycles = [ProductLifecycle.PRODUCAO] if numerador_only else [
        ProductLifecycle.PRODUCAO, ProductLifecycle.DESENVOLVIMENTO,
    ]
    q = (
        select(
            Product.id, Product.name, Product.lifecycle,
            ProductServico.id, ProductServico.name, ProductServico.data_publicacao,
        )
        .join(Product, Product.id == ProductServico.product_id)
        .where(
            ProductServico.is_active.is_(True),
            Product.is_active.is_(True),
            Product.lifecycle.in_(lifecycles),
            ProductServico.data_publicacao.isnot(None),
            ProductServico.data_publicacao <= ate,
        )
    )
    if de is not None:
        q = q.where(ProductServico.data_publicacao >= de)
    q = q.order_by(Product.name.asc(), ProductServico.name.asc())
    return (await db.execute(q)).all()


async def _portfolio_documentos_detalhe(
    db: AsyncSession,
    metrica: Optional[FontePortfolioMetrica],
    ate: date,
    *,
    de: Optional[date] = None,
    numerador_only: bool = False,
) -> list[tuple]:
    """Documentos nato-digital cadastrados no intervalo [de, ate]. Numerador: só prod. produção."""
    from app.modules.produtos.models import Product, ProductDocumento, ProductLifecycle

    lifecycles = [ProductLifecycle.PRODUCAO] if numerador_only else [
        ProductLifecycle.PRODUCAO, ProductLifecycle.DESENVOLVIMENTO,
    ]
    q = (
        select(
            Product.id, Product.name, Product.lifecycle,
            ProductDocumento.id, ProductDocumento.name, ProductDocumento.data_documento,
            ProductDocumento.object_name, ProductDocumento.filename,
            ProductDocumento.content_type, ProductDocumento.size,
        )
        .join(Product, Product.id == ProductDocumento.product_id)
        .where(
            ProductDocumento.is_active.is_(True),
            ProductDocumento.is_nato_digital.is_(True),
            Product.is_active.is_(True),
            Product.lifecycle.in_(lifecycles),
            ProductDocumento.data_documento.isnot(None),
            ProductDocumento.data_documento <= ate,
        )
    )
    if de is not None:
        q = q.where(ProductDocumento.data_documento >= de)
    q = q.order_by(Product.name.asc(), ProductDocumento.name.asc())
    return (await db.execute(q)).all()


async def _portfolio_anexos_e_links(
    db: AsyncSession,
    product_ids: list[uuid.UUID],
    ate: date,
    *,
    de: Optional[date] = None,
) -> tuple[list[schemas.AnexoItem], list[schemas.PortfolioLinkRef]]:
    """Anexos e links dos produtos; com `de`, só documentos/releases no intervalo [de, ate]."""
    if not product_ids:
        return [], []
    from app.modules.produtos.models import ProductDocumento, ProductRelease

    def _in_periodo(d: Optional[date]) -> bool:
        if d is None:
            return de is None
        if d > ate:
            return False
        if de is not None and d < de:
            return False
        return True

    anexos: list[schemas.AnexoItem] = []
    links: list[schemas.PortfolioLinkRef] = []
    seen_on: set[str] = set()
    seen_urls: set[str] = set()

    docs = (await db.execute(
        select(ProductDocumento).where(
            ProductDocumento.product_id.in_(product_ids),
            ProductDocumento.is_active.is_(True),
        )
    )).scalars().all()
    for d in docs:
        if not _in_periodo(d.data_documento):
            continue
        if d.object_name and d.filename and d.object_name not in seen_on:
            seen_on.add(d.object_name)
            anexos.append(schemas.AnexoItem(
                object_name=d.object_name, filename=d.filename,
                content_type=d.content_type, size=d.size,
            ))
        elif d.external_link and d.external_link not in seen_urls:
            seen_urls.add(d.external_link)
            links.append(schemas.PortfolioLinkRef(label=d.name, url=d.external_link))

    releases = (await db.execute(
        select(ProductRelease).where(
            ProductRelease.product_id.in_(product_ids),
            ProductRelease.is_active.is_(True),
        )
    )).scalars().all()
    for r in releases:
        if not _in_periodo(r.data_release):
            continue
        for raw in (r.evidencia_anexos or []):
            item = _anexo_from_raw(raw)
            if item and item.object_name not in seen_on:
                seen_on.add(item.object_name)
                anexos.append(item)
        if r.evidencia_link and r.evidencia_link not in seen_urls:
            seen_urls.add(r.evidencia_link)
            label = f"Homologação {r.versao}" + (f" — {r.nome}" if r.nome else "")
            links.append(schemas.PortfolioLinkRef(label=label.strip(), url=r.evidencia_link))

    return anexos, links


def _servico_ref(row: tuple, *, novo_no_mes: bool = False) -> schemas.PortfolioServicoRef:
    pid, pname, plc, sid, sname, dp = row[:6]
    return schemas.PortfolioServicoRef(
        product_id=pid, product_name=pname, servico_id=sid, servico_name=sname,
        lifecycle=_ev(plc), data_publicacao=dp, em_producao=_ev(plc) == "producao",
        novo_no_mes=novo_no_mes,
    )


def _documento_ref(row: tuple, *, novo_no_mes: bool = False) -> schemas.PortfolioDocumentoRef:
    pid, pname, plc, did, dname, dd = row[:6]
    return schemas.PortfolioDocumentoRef(
        product_id=pid, product_name=pname, documento_id=did, documento_name=dname,
        lifecycle=_ev(plc), data_documento=dd, em_producao=_ev(plc) == "producao",
        novo_no_mes=novo_no_mes,
    )


def _dedupe_servicos(items: list[schemas.PortfolioServicoRef]) -> list[schemas.PortfolioServicoRef]:
    seen: set[uuid.UUID] = set()
    out: list[schemas.PortfolioServicoRef] = []
    for s in items:
        if s.servico_id in seen:
            continue
        seen.add(s.servico_id)
        out.append(s)
    return out


def _dedupe_documentos(items: list[schemas.PortfolioDocumentoRef]) -> list[schemas.PortfolioDocumentoRef]:
    seen: set[uuid.UUID] = set()
    out: list[schemas.PortfolioDocumentoRef] = []
    for d in items:
        if d.documento_id in seen:
            continue
        seen.add(d.documento_id)
        out.append(d)
    return out


def _anexos_from_documento_rows(rows: list[tuple]) -> list[schemas.AnexoItem]:
    """Extrai anexos dos documentos nato-digital (object_name/filename)."""
    anexos: list[schemas.AnexoItem] = []
    seen: set[str] = set()
    for row in rows:
        if len(row) < 8:
            continue
        on, fn = row[6], row[7]
        if not on or not fn or on in seen:
            continue
        seen.add(on)
        anexos.append(schemas.AnexoItem(
            object_name=on, filename=fn,
            content_type=row[8] if len(row) > 8 else None,
            size=row[9] if len(row) > 9 else None,
        ))
    return anexos


async def _portfolio_evidencias_servicos(
    db: AsyncSession,
    periodo_inicio: date,
    periodo_fim: date,
    metrica: Optional[FontePortfolioMetrica],
) -> tuple[
    list[schemas.PortfolioServicoRef],
    list[schemas.PortfolioServicoRef],
    list[schemas.AnexoItem],
    list[schemas.AnexoItem],
    list[schemas.PortfolioLinkRef],
    list[schemas.PortfolioLinkRef],
]:
    """Evidências do numerador: novos no mês + acumulado até periodo_fim."""
    novos_rows = await _portfolio_servicos_detalhe(
        db, metrica, periodo_fim, de=periodo_inicio, numerador_only=True,
    )
    acum_rows = await _portfolio_servicos_detalhe(db, metrica, periodo_fim, numerador_only=True)
    novos_ids = {r[3] for r in novos_rows}

    servicos_novos = _dedupe_servicos([_servico_ref(r, novo_no_mes=True) for r in novos_rows])
    servicos_acum = _dedupe_servicos([_servico_ref(r, novo_no_mes=r[3] in novos_ids) for r in acum_rows])

    pids_novos = list({r[0] for r in novos_rows})
    pids_acum = list({r[0] for r in acum_rows})
    anexos_novos, links_novos = await _portfolio_anexos_e_links(
        db, pids_novos, periodo_fim, de=periodo_inicio,
    )
    anexos_acum, links_acum = await _portfolio_anexos_e_links(db, pids_acum, periodo_fim)
    return servicos_novos, servicos_acum, anexos_novos, anexos_acum, links_novos, links_acum


async def _portfolio_evidencias_documentos(
    db: AsyncSession,
    periodo_inicio: date,
    periodo_fim: date,
    metrica: Optional[FontePortfolioMetrica],
) -> tuple[
    list[schemas.PortfolioDocumentoRef],
    list[schemas.PortfolioDocumentoRef],
    list[schemas.AnexoItem],
    list[schemas.AnexoItem],
    list[schemas.PortfolioLinkRef],
    list[schemas.PortfolioLinkRef],
]:
    """Evidências do numerador: documentos nato-digital novos no mês + acumulado."""
    novos_rows = await _portfolio_documentos_detalhe(
        db, metrica, periodo_fim, de=periodo_inicio, numerador_only=True,
    )
    acum_rows = await _portfolio_documentos_detalhe(db, metrica, periodo_fim, numerador_only=True)
    novos_ids = {r[3] for r in novos_rows}

    documentos_novos = _dedupe_documentos([_documento_ref(r, novo_no_mes=True) for r in novos_rows])
    documentos_acum = _dedupe_documentos([
        _documento_ref(r, novo_no_mes=r[3] in novos_ids) for r in acum_rows
    ])

    anexos_novos = _anexos_from_documento_rows(novos_rows)
    anexos_acum = _anexos_from_documento_rows(acum_rows)
    return documentos_novos, documentos_acum, anexos_novos, anexos_acum, [], []


async def _portfolio_evidencias(
    db: AsyncSession,
    periodo_inicio: date,
    periodo_fim: date,
    metrica: Optional[FontePortfolioMetrica],
) -> tuple[
    list[schemas.PortfolioServicoRef],
    list[schemas.PortfolioServicoRef],
    list[schemas.PortfolioDocumentoRef],
    list[schemas.PortfolioDocumentoRef],
    list[schemas.AnexoItem],
    list[schemas.AnexoItem],
    list[schemas.PortfolioLinkRef],
    list[schemas.PortfolioLinkRef],
]:
    m = metrica or FontePortfolioMetrica.SERVICOS_PUBLICADOS
    if m == FontePortfolioMetrica.DOCUMENTOS_NATOS_DIGITAIS:
        doc_novos, doc_acum, anexos_novos, anexos_acum, links_novos, links_acum = (
            await _portfolio_evidencias_documentos(db, periodo_inicio, periodo_fim, metrica)
        )
        return [], [], doc_novos, doc_acum, anexos_novos, anexos_acum, links_novos, links_acum
    serv_novos, serv_acum, anexos_novos, anexos_acum, links_novos, links_acum = (
        await _portfolio_evidencias_servicos(db, periodo_inicio, periodo_fim, metrica)
    )
    return serv_novos, serv_acum, [], [], anexos_novos, anexos_acum, links_novos, links_acum


# ── Preload de portfólio (evita N+1 em to_response) ──────────────────────
# _portfolio_evidencias faz ~6 queries por acompanhamento sobre o MESMO dataset
# base (serviços/docs/releases de produtos em produção), variando só o corte de
# datas. Em to_response, que itera todos os acompanhamentos, isso vira 6×N queries.
# Aqui o dataset é carregado UMA vez e cada período é calculado em memória.

async def _portfolio_preload(
    db: AsyncSession, metrica: Optional[FontePortfolioMetrica] = None,
) -> tuple:
    from app.modules.produtos.models import (
        Product, ProductDocumento, ProductLifecycle, ProductRelease, ProductServico,
    )
    m = metrica or FontePortfolioMetrica.SERVICOS_PUBLICADOS
    if m == FontePortfolioMetrica.DOCUMENTOS_NATOS_DIGITAIS:
        drows = (await db.execute(
            select(
                Product.id, Product.name, Product.lifecycle,
                ProductDocumento.id, ProductDocumento.name, ProductDocumento.data_documento,
                ProductDocumento.object_name, ProductDocumento.filename,
                ProductDocumento.content_type, ProductDocumento.size,
            )
            .join(Product, Product.id == ProductDocumento.product_id)
            .where(
                ProductDocumento.is_active.is_(True),
                ProductDocumento.is_nato_digital.is_(True),
                Product.is_active.is_(True),
                Product.lifecycle == ProductLifecycle.PRODUCAO,
                ProductDocumento.data_documento.isnot(None),
            )
            .order_by(Product.name.asc(), ProductDocumento.name.asc())
        )).all()
        return ("documentos", drows)

    srows = (await db.execute(
        select(
            Product.id, Product.name, Product.lifecycle,
            ProductServico.id, ProductServico.name, ProductServico.data_publicacao,
        )
        .join(Product, Product.id == ProductServico.product_id)
        .where(
            ProductServico.is_active.is_(True),
            Product.is_active.is_(True),
            Product.lifecycle == ProductLifecycle.PRODUCAO,
            ProductServico.data_publicacao.isnot(None),
        )
        .order_by(Product.name.asc(), ProductServico.name.asc())
    )).all()
    pids = list({r[0] for r in srows})
    docs_by_pid: dict = {}
    releases_by_pid: dict = {}
    if pids:
        docs = (await db.execute(select(ProductDocumento).where(
            ProductDocumento.product_id.in_(pids), ProductDocumento.is_active.is_(True),
        ))).scalars().all()
        for d in docs:
            docs_by_pid.setdefault(d.product_id, []).append(d)
        rels = (await db.execute(select(ProductRelease).where(
            ProductRelease.product_id.in_(pids), ProductRelease.is_active.is_(True),
        ))).scalars().all()
        for r in rels:
            releases_by_pid.setdefault(r.product_id, []).append(r)
    return ("servicos", srows, docs_by_pid, releases_by_pid)


def _portfolio_anexos_e_links_mem(
    docs_by_pid: dict, releases_by_pid: dict, product_ids: list, ate: date, *, de: Optional[date] = None,
) -> tuple[list[schemas.AnexoItem], list[schemas.PortfolioLinkRef]]:
    """Versão em memória de _portfolio_anexos_e_links (mesmas regras de período/dedup)."""
    if not product_ids:
        return [], []

    def _in_periodo(d: Optional[date]) -> bool:
        if d is None:
            return de is None
        if d > ate:
            return False
        if de is not None and d < de:
            return False
        return True

    anexos: list[schemas.AnexoItem] = []
    links: list[schemas.PortfolioLinkRef] = []
    seen_on: set[str] = set()
    seen_urls: set[str] = set()

    for pid in product_ids:
        for d in docs_by_pid.get(pid, []):
            if not _in_periodo(d.data_documento):
                continue
            if d.object_name and d.filename and d.object_name not in seen_on:
                seen_on.add(d.object_name)
                anexos.append(schemas.AnexoItem(
                    object_name=d.object_name, filename=d.filename,
                    content_type=d.content_type, size=d.size,
                ))
            elif d.external_link and d.external_link not in seen_urls:
                seen_urls.add(d.external_link)
                links.append(schemas.PortfolioLinkRef(label=d.name, url=d.external_link))

    for pid in product_ids:
        for r in releases_by_pid.get(pid, []):
            if not _in_periodo(r.data_release):
                continue
            for raw in (r.evidencia_anexos or []):
                item = _anexo_from_raw(raw)
                if item and item.object_name not in seen_on:
                    seen_on.add(item.object_name)
                    anexos.append(item)
            if r.evidencia_link and r.evidencia_link not in seen_urls:
                seen_urls.add(r.evidencia_link)
                label = f"Homologação {r.versao}" + (f" — {r.nome}" if r.nome else "")
                links.append(schemas.PortfolioLinkRef(label=label.strip(), url=r.evidencia_link))

    return anexos, links


def _portfolio_evidencias_mem(cache: tuple, periodo_inicio: date, periodo_fim: date):
    """Versão em memória de _portfolio_evidencias a partir do dataset pré-carregado."""
    kind = cache[0]
    if kind == "documentos":
        doc_rows = cache[1]
        novos_rows = [r for r in doc_rows if r[5] is not None and periodo_inicio <= r[5] <= periodo_fim]
        acum_rows = [r for r in doc_rows if r[5] is not None and r[5] <= periodo_fim]
        novos_ids = {r[3] for r in novos_rows}
        documentos_novos = _dedupe_documentos([_documento_ref(r, novo_no_mes=True) for r in novos_rows])
        documentos_acum = _dedupe_documentos([
            _documento_ref(r, novo_no_mes=r[3] in novos_ids) for r in acum_rows
        ])
        anexos_novos = _anexos_from_documento_rows(novos_rows)
        anexos_acum = _anexos_from_documento_rows(acum_rows)
        return [], [], documentos_novos, documentos_acum, anexos_novos, anexos_acum, [], []

    _, servico_rows, docs_by_pid, releases_by_pid = cache
    novos_rows = [r for r in servico_rows if r[5] is not None and periodo_inicio <= r[5] <= periodo_fim]
    acum_rows = [r for r in servico_rows if r[5] is not None and r[5] <= periodo_fim]
    novos_ids = {r[3] for r in novos_rows}

    servicos_novos = _dedupe_servicos([_servico_ref(r, novo_no_mes=True) for r in novos_rows])
    servicos_acum = _dedupe_servicos([_servico_ref(r, novo_no_mes=r[3] in novos_ids) for r in acum_rows])

    pids_novos = list({r[0] for r in novos_rows})
    pids_acum = list({r[0] for r in acum_rows})
    anexos_novos, links_novos = _portfolio_anexos_e_links_mem(
        docs_by_pid, releases_by_pid, pids_novos, periodo_fim, de=periodo_inicio,
    )
    anexos_acum, links_acum = _portfolio_anexos_e_links_mem(
        docs_by_pid, releases_by_pid, pids_acum, periodo_fim,
    )
    return servicos_novos, servicos_acum, [], [], anexos_novos, anexos_acum, links_novos, links_acum


async def _get(db: AsyncSession, indicador_id: uuid.UUID) -> Indicador:
    obj = (await db.execute(select(Indicador).where(Indicador.id == indicador_id))).scalar_one_or_none()
    if not obj or not obj.is_active:
        raise HTTPException(status_code=404, detail="Indicador não encontrado.")
    return obj


class IndicadorService:
    @staticmethod
    def _anexos_in(items) -> Optional[list]:
        if items is None:
            return None
        return [a.model_dump() if hasattr(a, "model_dump") else a for a in items]

    @staticmethod
    def _anexos_out(raw) -> Optional[list[schemas.AnexoItem]]:
        if not raw:
            return None
        out = [_anexo_from_raw(x) for x in raw]
        return [a for a in out if a is not None] or None

    @classmethod
    async def _acompanhamento_out(
        cls, db: AsyncSession, ac: IndicadorAcompanhamento, ind: Indicador,
        portfolio_cache: Optional[tuple] = None,
    ) -> schemas.AcompanhamentoResponse:
        base = schemas.AcompanhamentoResponse.model_validate(ac)
        if ac.fonte != FonteDados.PORTFOLIO:
            return base.model_copy(update={"evidencias": cls._anexos_out(ac.evidencias)})
        if portfolio_cache is not None:
            # Caminho sem N+1: dataset pré-carregado, cálculo em memória por período.
            (
                servicos_novos, servicos_acum,
                documentos_novos, documentos_acum,
                anexos_novos, anexos_acum,
                links_novos, links_acum,
            ) = _portfolio_evidencias_mem(portfolio_cache, ac.periodo_inicio, ac.periodo_fim)
        else:
            (
                servicos_novos, servicos_acum,
                documentos_novos, documentos_acum,
                anexos_novos, anexos_acum,
                links_novos, links_acum,
            ) = await _portfolio_evidencias(db, ac.periodo_inicio, ac.periodo_fim, ind.fonte_metrica)
        return base.model_copy(update={
            "evidencias": anexos_acum or None,
            "portfolio_servicos": servicos_acum or None,
            "portfolio_servicos_novos": servicos_novos or None,
            "portfolio_documentos": documentos_acum or None,
            "portfolio_documentos_novos": documentos_novos or None,
            "portfolio_links": links_acum or None,
            "portfolio_links_novos": links_novos or None,
        })

    @classmethod
    async def get_evidencias(cls, db, acomp_id: uuid.UUID) -> schemas.AcompanhamentoEvidenciasResponse:
        ac = (await db.execute(
            select(IndicadorAcompanhamento).where(IndicadorAcompanhamento.id == acomp_id)
        )).scalar_one_or_none()
        if not ac:
            raise HTTPException(status_code=404, detail="Registro de acompanhamento não encontrado.")
        ind = await _get(db, ac.indicador_id)
        if ac.fonte == FonteDados.PORTFOLIO:
            (
                servicos_novos, servicos_acum,
                documentos_novos, documentos_acum,
                anexos_novos, anexos_acum,
                links_novos, links_acum,
            ) = await _portfolio_evidencias(db, ac.periodo_inicio, ac.periodo_fim, ind.fonte_metrica)
            return schemas.AcompanhamentoEvidenciasResponse(
                fonte=_ev(ac.fonte),
                evidencias=anexos_acum,
                evidencias_novos=anexos_novos,
                portfolio_servicos=servicos_acum,
                portfolio_servicos_novos=servicos_novos,
                portfolio_documentos=documentos_acum,
                portfolio_documentos_novos=documentos_novos,
                portfolio_links=links_acum,
                portfolio_links_novos=links_novos,
            )
        return schemas.AcompanhamentoEvidenciasResponse(
            fonte=_ev(ac.fonte),
            evidencias=cls._anexos_out(ac.evidencias) or [],
        )

    @staticmethod
    async def list_areas(db: AsyncSession) -> list[schemas.AreaRefMini]:
        index = await _areas_index(db)
        return [
            schemas.AreaRefMini(id=a.id, name=a.name, setor_name=_setor_name(a, index))
            for a in sorted(index.values(), key=lambda x: x.name.lower())
        ]

    @staticmethod
    async def list_persons(db: AsyncSession) -> list[schemas.PersonMini]:
        rows = await db.execute(select(Person).order_by(Person.full_name.asc()))
        return [schemas.PersonMini(id=p.id, full_name=p.full_name) for p in rows.scalars().all()]

    @staticmethod
    def _period_fonte(ind: Indicador, periodo_inicio: date) -> FonteDados:
        """Origem padrão de um período conforme a config do indicador e a competência de corte."""
        if ind.fonte != FonteDados.PORTFOLIO:
            return FonteDados.MANUAL
        if ind.fonte_corte and periodo_inicio < ind.fonte_corte:
            return FonteDados.MANUAL
        return FonteDados.PORTFOLIO

    @classmethod
    async def recompute_portfolio(
        cls,
        db: AsyncSession,
        ind: Indicador,
        user_id: Optional[uuid.UUID] = None,
        acomps: Optional[list[IndicadorAcompanhamento]] = None,
    ) -> int:
        """Recalcula o `realizado` (e status) dos acompanhamentos com fonte=portfolio."""
        if acomps is None:
            acomps = (await db.execute(
                select(IndicadorAcompanhamento).where(
                    IndicadorAcompanhamento.indicador_id == ind.id,
                    IndicadorAcompanhamento.fonte == FonteDados.PORTFOLIO,
                )
            )).scalars().all()
        alvo = [a for a in acomps if a.fonte == FonteDados.PORTFOLIO]
        if not alvo:
            return 0
        rows = await _portfolio_rows(db, ind.fonte_metrica)
        mudou = 0
        for ac in alvo:
            if ac.bloqueado:
                continue
            _num, _den, pct = _pct_ate(rows, ac.periodo_fim)
            novo = float(pct) if pct is not None else None
            atual = _f(ac.realizado)
            p, st = calc_status(
                ind.sentido, novo, _f(ac.meta),
                _f(ind.meta_min), _f(ind.meta_max), _f(ind.tolerancia_pct),
            )
            if atual != novo or _f(ac.percentual_atingimento) != p or ac.status != st:
                ac.realizado = novo
                ac.percentual_atingimento = p
                ac.status = st
                if user_id:
                    ac.updated_by = user_id
                ac.updated_at = _now()
                mudou += 1
        return mudou

    @staticmethod
    def _effective(
        ac: IndicadorAcompanhamento,
        ind: Indicador,
        portfolio_rows: Optional[list[tuple]] = None,
    ) -> tuple[Optional[float], Optional[float], AcompanhamentoStatus]:
        """Valor efetivo de um acompanhamento (sobrepõe portfólio em memória)."""
        realizado = _f(ac.realizado)
        if ac.fonte == FonteDados.PORTFOLIO and portfolio_rows is not None:
            _n, _d, pct_mes = _pct_ate(portfolio_rows, ac.periodo_fim)
            realizado = float(pct_mes) if pct_mes is not None else None
        pct, st = calc_status(
            ind.sentido, realizado, _f(ac.meta),
            _f(ind.meta_min), _f(ind.meta_max), _f(ind.tolerancia_pct),
        )
        return realizado, pct, st

    @classmethod
    async def gerar_acompanhamentos(
        cls, db: AsyncSession, ind: Indicador, ano: int, user_id: uuid.UUID,
    ) -> int:
        """Cria (idempotente) os períodos do ano. Retorna quantos foram criados."""
        existentes = (await db.execute(
            select(IndicadorAcompanhamento.ordem).where(
                IndicadorAcompanhamento.indicador_id == ind.id,
                IndicadorAcompanhamento.ano_referencia == ano,
            )
        )).scalars().all()
        existentes_set = set(existentes)
        criados = 0
        for ordem, competencia, inicio, fim in generate_periods(ano, ind.granularidade):
            if ordem in existentes_set:
                continue
            db.add(IndicadorAcompanhamento(
                indicador_id=ind.id,
                ano_referencia=ano,
                ordem=ordem,
                competencia=competencia,
                periodo_inicio=inicio,
                periodo_fim=fim,
                status=AcompanhamentoStatus.PENDENTE,
                fonte=cls._period_fonte(ind, inicio),
                created_by=user_id,
                updated_by=user_id,
            ))
            criados += 1
        return criados

    @classmethod
    async def create(cls, db: AsyncSession, data: schemas.IndicadorCreate, user_id: uuid.UUID) -> schemas.IndicadorResponse:
        dup = (await db.execute(
            select(Indicador).where(
                Indicador.codigo == data.codigo,
                Indicador.is_active.is_(True),
            )
        )).scalar_one_or_none()
        if dup:
            raise HTTPException(status_code=409, detail=f"Já existe um indicador com o código '{data.codigo}'.")

        ind = Indicador(
            codigo=data.codigo.strip(),
            nome=data.nome.strip(),
            categoria=IndicadorCategoria(data.categoria),
            descricao=data.descricao,
            objetivo_estrategico=data.objetivo_estrategico,
            area_id=data.area_id,
            responsavel_person_id=data.responsavel_person_id,
            unidade_medida=data.unidade_medida,
            formula_calculo=data.formula_calculo,
            fonte_dados=data.fonte_dados,
            granularidade=IndicadorGranularidade(data.granularidade),
            periodicidade_atualizacao=data.periodicidade_atualizacao,
            sentido=IndicadorSentido(data.sentido),
            meta_min=data.meta_min,
            meta_max=data.meta_max,
            tolerancia_pct=data.tolerancia_pct if data.tolerancia_pct is not None else 20,
            fonte=FonteDados(data.fonte) if data.fonte else FonteDados.MANUAL,
            fonte_metrica=FontePortfolioMetrica(data.fonte_metrica) if data.fonte_metrica else None,
            fonte_corte=data.fonte_corte,
            status=IndicadorStatus(data.status) if data.status else IndicadorStatus.ATIVO,
            created_by=user_id,
            updated_by=user_id,
        )
        db.add(ind)
        await db.flush()

        anos = data.anos_referencia or [date.today().year]
        anos = sorted({a for a in anos if 2000 <= a <= 2100})
        for ano in anos:
            await cls.gerar_acompanhamentos(db, ind, ano, user_id)
        if ind.fonte == FonteDados.PORTFOLIO:
            await cls.recompute_portfolio(db, ind, user_id)
        await db.commit()
        await db.refresh(ind)
        return await cls.to_response(db, ind)

    @classmethod
    async def update(
        cls, db: AsyncSession, indicador_id: uuid.UUID, data: schemas.IndicadorUpdate, user_id: uuid.UUID,
    ) -> schemas.IndicadorResponse:
        ind = await _get(db, indicador_id)
        payload = data.model_dump(exclude_unset=True)

        if "codigo" in payload and payload["codigo"]:
            dup = (await db.execute(
                select(Indicador).where(
                    Indicador.codigo == payload["codigo"],
                    Indicador.is_active.is_(True),
                    Indicador.id != ind.id,
                )
            )).scalar_one_or_none()
            if dup:
                raise HTTPException(status_code=409, detail=f"Já existe um indicador com o código '{payload['codigo']}'.")

        enum_map = {
            "categoria": IndicadorCategoria,
            "granularidade": IndicadorGranularidade,
            "sentido": IndicadorSentido,
            "status": IndicadorStatus,
            "fonte": FonteDados,
            "fonte_metrica": FontePortfolioMetrica,
        }
        for key, val in payload.items():
            if key in enum_map and val is not None:
                setattr(ind, key, enum_map[key](val))
            elif key == "codigo" and val:
                ind.codigo = val.strip()
            elif key == "nome" and val:
                ind.nome = val.strip()
            elif hasattr(ind, key):
                setattr(ind, key, val)

        ind.updated_by = user_id
        ind.updated_at = _now()
        if ind.fonte == FonteDados.PORTFOLIO:
            await cls.recompute_portfolio(db, ind, user_id)
        await db.commit()
        await db.refresh(ind)
        return await cls.to_response(db, ind)

    @classmethod
    async def delete(cls, db: AsyncSession, indicador_id: uuid.UUID, user_id: uuid.UUID) -> None:
        ind = await _get(db, indicador_id)
        ind.is_active = False
        ind.inactivated_by = user_id
        ind.inactivated_at = _now()
        ind.updated_by = user_id
        ind.updated_at = _now()
        await db.commit()

    @classmethod
    async def gerar_ano(
        cls, db: AsyncSession, indicador_id: uuid.UUID, ano: int, user_id: uuid.UUID,
    ) -> list[schemas.AcompanhamentoResponse]:
        ind = await _get(db, indicador_id)
        await cls.gerar_acompanhamentos(db, ind, ano, user_id)
        await db.flush()
        await cls.recompute_portfolio(db, ind, user_id)
        await db.commit()
        return await cls.list_acompanhamentos(db, indicador_id, ano)

    @classmethod
    async def list_acompanhamentos(
        cls, db: AsyncSession, indicador_id: uuid.UUID, ano: Optional[int] = None,
    ) -> list[schemas.AcompanhamentoResponse]:
        q = select(IndicadorAcompanhamento).where(IndicadorAcompanhamento.indicador_id == indicador_id)
        if ano is not None:
            q = q.where(IndicadorAcompanhamento.ano_referencia == ano)
        q = q.order_by(IndicadorAcompanhamento.ano_referencia, IndicadorAcompanhamento.ordem)
        rows = (await db.execute(q)).scalars().all()
        return [schemas.AcompanhamentoResponse.model_validate(a) for a in rows]

    @classmethod
    async def update_acompanhamento(
        cls, db: AsyncSession, acomp_id: uuid.UUID, data: schemas.AcompanhamentoUpdate, user_id: uuid.UUID,
    ) -> schemas.AcompanhamentoResponse:
        ac = (await db.execute(
            select(IndicadorAcompanhamento).where(IndicadorAcompanhamento.id == acomp_id)
        )).scalar_one_or_none()
        if not ac:
            raise HTTPException(status_code=404, detail="Registro de acompanhamento não encontrado.")
        ind = await _get(db, ac.indicador_id)
        payload = data.model_dump(exclude_unset=True)

        # Mês fechado (bloqueado): congelado contra edição. A única operação permitida é
        # desbloquear (bloqueado=False), sem nenhuma outra alteração no mesmo request.
        if ac.bloqueado:
            outros = {k for k in payload if k != "bloqueado"}
            desbloqueando = payload.get("bloqueado") is False
            if outros or not desbloqueando:
                raise HTTPException(
                    status_code=423,
                    detail="Este mês está bloqueado. Desbloqueie antes de editar.",
                )
            ac.bloqueado = False
            ac.updated_by = user_id
            ac.updated_at = _now()
            await db.commit()
            await db.refresh(ac)
            return schemas.AcompanhamentoResponse.model_validate(ac)

        if data.fonte is not None:
            ac.fonte = FonteDados(data.fonte)

        if data.limpar_meta:
            ac.meta = None
        elif "meta" in payload:
            ac.meta = data.meta

        if ac.fonte == FonteDados.PORTFOLIO:
            rows = await _portfolio_rows(db, ind.fonte_metrica)
            _num, _den, pct = _pct_ate(rows, ac.periodo_fim)
            ac.realizado = float(pct) if pct is not None else None
        elif data.limpar_realizado:
            ac.realizado = None
        elif "realizado" in payload:
            ac.realizado = data.realizado

        if "observacao" in payload:
            ac.observacao = data.observacao
        if "evidencias" in payload:
            ac.evidencias = cls._anexos_in(data.evidencias)

        pct, st = calc_status(
            ind.sentido, _f(ac.realizado), _f(ac.meta),
            _f(ind.meta_min), _f(ind.meta_max), _f(ind.tolerancia_pct),
        )
        ac.percentual_atingimento = pct
        ac.status = st
        # Fechamento da competência: aplica a trava por último (permite editar e bloquear
        # no mesmo save). Já o desbloqueio de um mês fechado é tratado no topo.
        if "bloqueado" in payload:
            ac.bloqueado = bool(data.bloqueado)
        ac.updated_by = user_id
        ac.updated_at = _now()
        await db.commit()
        await db.refresh(ac)
        return schemas.AcompanhamentoResponse.model_validate(ac)

    @classmethod
    async def to_response(cls, db: AsyncSession, ind: Indicador) -> schemas.IndicadorResponse:
        index = await _areas_index(db)
        area_ref = None
        if ind.area:
            area_ref = schemas.AreaRefMini(
                id=ind.area.id, name=ind.area.name,
                setor_name=_setor_name(ind.area, index),
            )
        anos = sorted({a.ano_referencia for a in ind.acompanhamentos})
        p_num = p_den = p_pct = None
        if ind.fonte == FonteDados.PORTFOLIO:
            rows = await _portfolio_rows(db, ind.fonte_metrica)
            p_num, p_den, p_pct = _pct_ate(rows, date.today())

        # Pré-carrega o dataset de portfólio uma vez SE algum acompanhamento for
        # PORTFOLIO. ac.fonte é por-acompanhamento e independe de ind.fonte — um
        # indicador MANUAL pode ter acompanhamentos PORTFOLIO, que sem isto cairiam
        # no caminho DB (6 queries cada = N+1).
        portfolio_cache = None
        if any(a.fonte == FonteDados.PORTFOLIO for a in ind.acompanhamentos):
            portfolio_cache = await _portfolio_preload(db, ind.fonte_metrica)

        acomps_out = []
        for a in ind.acompanhamentos:
            acomps_out.append(await cls._acompanhamento_out(db, a, ind, portfolio_cache))

        return schemas.IndicadorResponse(
            id=ind.id,
            codigo=ind.codigo,
            nome=ind.nome,
            categoria=_ev(ind.categoria),
            descricao=ind.descricao,
            objetivo_estrategico=ind.objetivo_estrategico,
            area=area_ref,
            responsavel=schemas.PersonMini.model_validate(ind.responsavel) if ind.responsavel else None,
            unidade_medida=ind.unidade_medida,
            formula_calculo=ind.formula_calculo,
            fonte_dados=ind.fonte_dados,
            granularidade=_ev(ind.granularidade),
            periodicidade_atualizacao=ind.periodicidade_atualizacao,
            sentido=_ev(ind.sentido),
            meta_min=_f(ind.meta_min),
            meta_max=_f(ind.meta_max),
            tolerancia_pct=float(ind.tolerancia_pct),
            fonte=_ev(ind.fonte),
            fonte_metrica=_ev(ind.fonte_metrica) if ind.fonte_metrica else None,
            fonte_corte=ind.fonte_corte,
            fonte_portfolio_num=p_num,
            fonte_portfolio_den=p_den,
            fonte_portfolio_pct=p_pct,
            status=_ev(ind.status),
            is_active=ind.is_active,
            created_at=ind.created_at,
            updated_at=ind.updated_at,
            anos=anos,
            acompanhamentos=acomps_out,
        )

    @classmethod
    async def get(cls, db: AsyncSession, indicador_id: uuid.UUID) -> schemas.IndicadorResponse:
        ind = await _get(db, indicador_id)
        if ind.fonte == FonteDados.PORTFOLIO:
            mudou = await cls.recompute_portfolio(db, ind)
            if mudou:
                await db.commit()
                await db.refresh(ind)
        return await cls.to_response(db, ind)

    @classmethod
    async def atualizar_portfolio(
        cls, db: AsyncSession, indicador_id: uuid.UUID, user_id: uuid.UUID,
    ) -> schemas.IndicadorResponse:
        """Botão 'Atualizar do portfólio' — recalcula meses portfólio não bloqueados."""
        ind = await _get(db, indicador_id)
        await cls.recompute_portfolio(db, ind, user_id)
        await db.commit()
        await db.refresh(ind)
        return await cls.to_response(db, ind)

    @classmethod
    async def atualizar_acompanhamento_portfolio(
        cls, db: AsyncSession, acomp_id: uuid.UUID, user_id: uuid.UUID,
    ) -> schemas.AcompanhamentoResponse:
        """Recalcula o realizado de um único mês (fonte=portfolio). Respeita bloqueio."""
        ac = (await db.execute(
            select(IndicadorAcompanhamento).where(IndicadorAcompanhamento.id == acomp_id)
        )).scalar_one_or_none()
        if not ac:
            raise HTTPException(status_code=404, detail="Registro de acompanhamento não encontrado.")
        if ac.bloqueado:
            raise HTTPException(
                status_code=423,
                detail="Este mês está bloqueado. Desbloqueie antes de atualizar do portfólio.",
            )
        if ac.fonte != FonteDados.PORTFOLIO:
            raise HTTPException(
                status_code=400,
                detail="Somente acompanhamentos com origem Portfólio podem ser atualizados automaticamente.",
            )
        ind = await _get(db, ac.indicador_id)
        await cls.recompute_portfolio(db, ind, user_id, acomps=[ac])
        await db.commit()
        await db.refresh(ac)
        return schemas.AcompanhamentoResponse.model_validate(ac)

    @classmethod
    async def list_indicadores(
        cls,
        db: AsyncSession,
        *,
        categoria: Optional[str] = None,
        area_id: Optional[uuid.UUID] = None,
        responsavel_id: Optional[uuid.UUID] = None,
        granularidade: Optional[str] = None,
        status: Optional[str] = None,
        ano: Optional[int] = None,
    ) -> list[schemas.IndicadorListItem]:
        q = select(Indicador).where(Indicador.is_active.is_(True))
        if categoria:
            q = q.where(Indicador.categoria == IndicadorCategoria(categoria))
        if area_id:
            q = q.where(Indicador.area_id == area_id)
        if responsavel_id:
            q = q.where(Indicador.responsavel_person_id == responsavel_id)
        if granularidade:
            q = q.where(Indicador.granularidade == IndicadorGranularidade(granularidade))
        if status:
            q = q.where(Indicador.status == IndicadorStatus(status))
        q = q.order_by(Indicador.codigo.asc())
        rows = (await db.execute(q)).scalars().all()
        index = await _areas_index(db)

        portfolio_cache: dict[Optional[FontePortfolioMetrica], list[tuple]] = {}

        out: list[schemas.IndicadorListItem] = []
        for ind in rows:
            acs = ind.acompanhamentos
            if ano is not None:
                acs = [a for a in acs if a.ano_referencia == ano]

            portfolio_rows = None
            if ind.fonte == FonteDados.PORTFOLIO or any(a.fonte == FonteDados.PORTFOLIO for a in acs):
                m = ind.fonte_metrica or FontePortfolioMetrica.SERVICOS_PUBLICADOS
                if m not in portfolio_cache:
                    portfolio_cache[m] = await _portfolio_rows(db, m)
                portfolio_rows = portfolio_cache[m]

            eff = [cls._effective(a, ind, portfolio_rows) for a in acs]
            preenchidos = [(a, r, p, s) for a, (r, p, s) in zip(acs, eff) if r is not None]
            ultimo = max(preenchidos, key=lambda t: (t[0].ano_referencia, t[0].ordem)) if preenchidos else None
            pcts = [p for *_, p, _ in preenchidos if p is not None]
            media = round(sum(pcts) / len(pcts), 2) if pcts else None

            out.append(schemas.IndicadorListItem(
                id=ind.id,
                codigo=ind.codigo,
                nome=ind.nome,
                categoria=_ev(ind.categoria),
                area_id=ind.area_id,
                area_name=index[ind.area_id].name if ind.area_id and ind.area_id in index else None,
                responsavel_person_id=ind.responsavel_person_id,
                responsavel_nome=ind.responsavel.full_name if ind.responsavel else None,
                unidade_medida=ind.unidade_medida,
                granularidade=_ev(ind.granularidade),
                sentido=_ev(ind.sentido),
                status=_ev(ind.status),
                is_active=ind.is_active,
                ano_referencia=ano,
                percentual_atingimento=media,
                status_atual=_ev(ultimo[3]) if ultimo else None,
                created_at=ind.created_at,
            ))
        return out

    @classmethod
    async def dashboard(
        cls,
        db: AsyncSession,
        *,
        categoria: Optional[str] = None,
        area_id: Optional[uuid.UUID] = None,
        responsavel_id: Optional[uuid.UUID] = None,
        granularidade: Optional[str] = None,
        status: Optional[str] = None,
        ano: Optional[int] = None,
    ) -> schemas.DashboardKpis:
        items = await cls.list_indicadores(
            db,
            categoria=categoria,
            area_id=area_id,
            responsavel_id=responsavel_id,
            granularidade=granularidade,
            status=status,
            ano=ano,
        )
        por_categoria: dict[str, int] = {}
        por_area: dict[str, int] = {}
        total_estrategicos = total_taticos = 0
        for i in items:
            por_categoria[i.categoria] = por_categoria.get(i.categoria, 0) + 1
            if i.categoria == "estrategico":
                total_estrategicos += 1
            else:
                total_taticos += 1
            an = i.area_name or "Sem área"
            por_area[an] = por_area.get(an, 0) + 1

        atingidos = sum(1 for i in items if i.status_atual == "atingido")
        em_atencao = sum(1 for i in items if i.status_atual == "em_atencao")
        nao_atingidos = sum(1 for i in items if i.status_atual == "nao_atingido")
        pendentes = sum(1 for i in items if i.status_atual == "pendente")
        pcts = [i.percentual_atingimento for i in items if i.percentual_atingimento is not None]
        media_geral = round(sum(pcts) / len(pcts), 2) if pcts else 0.0

        return schemas.DashboardKpis(
            total=len(items),
            total_estrategicos=total_estrategicos,
            total_taticos=total_taticos,
            atingidos=atingidos,
            em_atencao=em_atencao,
            nao_atingidos=nao_atingidos,
            pendentes_atualizacao=pendentes,
            percentual_geral_atingimento=media_geral,
            por_categoria=por_categoria,
            por_area=por_area,
        )

    @classmethod
    async def dashboard_graficos(
        cls,
        db: AsyncSession,
        *,
        categoria: Optional[str] = None,
        area_id: Optional[uuid.UUID] = None,
        responsavel_id: Optional[uuid.UUID] = None,
        granularidade: Optional[str] = None,
        status: Optional[str] = None,
        ano: Optional[int] = None,
    ) -> schemas.DashboardCharts:
        q = select(Indicador).where(Indicador.is_active.is_(True))
        if categoria:
            q = q.where(Indicador.categoria == IndicadorCategoria(categoria))
        if area_id:
            q = q.where(Indicador.area_id == area_id)
        if responsavel_id:
            q = q.where(Indicador.responsavel_person_id == responsavel_id)
        if granularidade:
            q = q.where(Indicador.granularidade == IndicadorGranularidade(granularidade))
        if status:
            q = q.where(Indicador.status == IndicadorStatus(status))
        q = q.order_by(Indicador.codigo.asc())
        rows = (await db.execute(q)).scalars().all()
        index = await _areas_index(db)

        portfolio_cache: dict[Optional[FontePortfolioMetrica], list[tuple]] = {}
        indicadores: list[schemas.DashboardChartIndicador] = []

        for ind in rows:
            acs = ind.acompanhamentos
            if ano is not None:
                acs = [a for a in acs if a.ano_referencia == ano]
            acs = sorted(acs, key=lambda a: a.ordem)

            portfolio_rows = None
            if ind.fonte == FonteDados.PORTFOLIO or any(a.fonte == FonteDados.PORTFOLIO for a in acs):
                m = ind.fonte_metrica or FontePortfolioMetrica.SERVICOS_PUBLICADOS
                if m not in portfolio_cache:
                    portfolio_cache[m] = await _portfolio_rows(db, m)
                portfolio_rows = portfolio_cache[m]

            periodos = []
            for ac in acs:
                realizado, pct, st = cls._effective(ac, ind, portfolio_rows)
                periodos.append(schemas.DashboardChartPeriodo(
                    competencia=ac.competencia,
                    ordem=ac.ordem,
                    meta=_f(ac.meta),
                    realizado=realizado,
                    percentual_atingimento=pct,
                    status=_ev(st),
                ))

            indicadores.append(schemas.DashboardChartIndicador(
                id=ind.id,
                codigo=ind.codigo,
                nome=ind.nome,
                categoria=_ev(ind.categoria),
                unidade_medida=ind.unidade_medida,
                area_name=index[ind.area_id].name if ind.area_id and ind.area_id in index else None,
                periodos=periodos,
            ))

        return schemas.DashboardCharts(indicadores=indicadores)
