"""Lógica de negócio do módulo Produtos (Portfólio)."""

import uuid
from datetime import date, datetime
from typing import Optional

from fastapi import HTTPException
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core import storage
from app.modules.teamops.models import Area, Person
from app.modules.produtos import schemas
from app.modules.produtos.models import (
    Contrato,
    Fornecedor,
    Processo,
    ProcessoNivel,
    Product,
    ProductCriticidade,
    ProductDocumento,
    ProductLifecycle,
    ProductOrigem,
    ProductServico,
    ProdutoProcesso,
    SustentacaoModelo,
)

_NIVEL_PARENT = {ProcessoNivel.PROCESSO: ProcessoNivel.MACROPROCESSO, ProcessoNivel.SUBPROCESSO: ProcessoNivel.PROCESSO}
_REQUIRES_CONTRACT_ORIGEM = {ProductOrigem.COTS, ProductOrigem.SAAS, ProductOrigem.CUSTOMIZACAO}


def _now() -> datetime:
    return datetime.utcnow()


def _ev(x):
    return x.value if hasattr(x, "value") else x


# ─────────────────────────────────────────────
# Org (reusa teamops): índice de áreas + setor derivado
# ─────────────────────────────────────────────

async def _areas_index(db: AsyncSession) -> dict:
    rows = await db.execute(select(Area))
    return {a.id: a for a in rows.scalars().all()}


def _setor_name(area: Area, index: dict) -> str:
    cur = area
    seen: set = set()
    while cur.parent_area_id and cur.parent_area_id in index and cur.id not in seen:
        seen.add(cur.id)
        cur = index[cur.parent_area_id]
    return cur.name


class ProductService:
    # ── helpers ───────────────────────────────
    @staticmethod
    async def _get(db: AsyncSession, product_id: uuid.UUID) -> Product:
        res = await db.execute(select(Product).where(Product.id == product_id))
        p = res.scalar_one_or_none()
        if not p:
            raise HTTPException(status_code=404, detail="Produto não encontrado.")
        return p

    @staticmethod
    def _requires_contract(p: Product) -> bool:
        return p.origem in _REQUIRES_CONTRACT_ORIGEM or p.fornecedor_id is not None

    @staticmethod
    def _has_active_contract(p: Product, today: date) -> bool:
        return any(c.is_active and c.vigencia_fim >= today for c in p.contratos)

    @staticmethod
    async def _processos_index(db: AsyncSession) -> dict:
        rows = await db.execute(select(Processo))
        return {pr.id: pr for pr in rows.scalars().all()}

    @classmethod
    def _link_response(cls, link: ProdutoProcesso, pidx: dict) -> schemas.ProdutoProcessoResponse:
        sub = pidx.get(link.processo_id)
        pai = pidx.get(sub.parent_id) if sub and sub.parent_id else None
        macro = pidx.get(pai.parent_id) if pai and pai.parent_id else None
        return schemas.ProdutoProcessoResponse(
            id=link.id, processo_id=link.processo_id,
            processo_nome=sub.name if sub else None,
            processo_pai_nome=pai.name if pai else None,
            macroprocesso_nome=macro.name if macro else None,
            ano_referencia=link.ano_referencia, automatizado=link.automatizado, is_active=link.is_active,
        )

    @classmethod
    async def _to_response(cls, db: AsyncSession, p: Product) -> schemas.ProductResponse:
        today = date.today()
        index = await _areas_index(db)
        pidx = await cls._processos_index(db)
        area_ref = None
        setor = None
        if p.area is not None:
            setor = _setor_name(p.area, index)
            area_ref = schemas.AreaRefMini(id=p.area.id, name=p.area.name, setor_name=setor)
        active_proc = [l for l in p.processos if l.is_active]
        return schemas.ProductResponse(
            id=p.id, name=p.name, simbolo=p.simbolo, description=p.description, dominio_funcional=p.dominio_funcional,
            origem=_ev(p.origem), lifecycle=_ev(p.lifecycle), criticidade=_ev(p.criticidade),
            data_entrada_producao=p.data_entrada_producao,
            area=area_ref, setor_name=setor,
            responsavel=schemas.PersonMini(id=p.responsavel.id, full_name=p.responsavel.full_name) if p.responsavel else None,
            fornecedor=schemas.FornecedorResponse.model_validate(p.fornecedor) if p.fornecedor else None,
            origin_task_id=p.origin_task_id, is_active=p.is_active,
            requires_contract=cls._requires_contract(p), has_active_contract=cls._has_active_contract(p, today),
            created_at=p.created_at, updated_at=p.updated_at,
            servicos=[schemas.ServicoResponse.model_validate(s) for s in sorted(p.servicos, key=lambda x: x.order) if s.is_active],
            documentos=[schemas.DocumentoResponse.model_validate(d) for d in sorted(p.documentos, key=lambda x: x.order) if d.is_active],
            processos=[cls._link_response(l, pidx) for l in active_proc],
            contratos=[cls._contrato_response(c, pidx_persons=None) for c in p.contratos if c.is_active],
        )

    @staticmethod
    def _contrato_response(c: Contrato, pidx_persons=None) -> schemas.ContratoResponse:
        today = date.today()
        return schemas.ContratoResponse(
            id=c.id, fornecedor_id=c.fornecedor_id, fornecedor_nome=c.fornecedor.nome if c.fornecedor else None,
            identificador=c.identificador, vigencia_inicio=c.vigencia_inicio, vigencia_fim=c.vigencia_fim,
            renovacao_automatica=c.renovacao_automatica, modelo_licenciamento=c.modelo_licenciamento,
            gestor_person_id=c.gestor_person_id, gestor_nome=c.gestor.full_name if c.gestor else None,
            sustentacao_n1=_ev(c.sustentacao_n1), sustentacao_n2=_ev(c.sustentacao_n2), sustentacao_n3=_ev(c.sustentacao_n3),
            alerta_dias=list(c.alerta_dias or []), object_name=c.object_name, filename=c.filename, external_link=c.external_link,
            is_active=c.is_active, dias_para_vencer=(c.vigencia_fim - today).days,
        )

    # ── áreas / setores / pessoas (lookups) ───
    @classmethod
    async def list_areas(cls, db: AsyncSession) -> list[schemas.AreaRefMini]:
        index = await _areas_index(db)
        return [schemas.AreaRefMini(id=a.id, name=a.name, setor_name=_setor_name(a, index))
                for a in sorted(index.values(), key=lambda x: x.name.lower())]

    @classmethod
    async def list_setores(cls, db: AsyncSession) -> list[schemas.AreaRefMini]:
        index = await _areas_index(db)
        return [schemas.AreaRefMini(id=a.id, name=a.name, setor_name=None)
                for a in sorted(index.values(), key=lambda x: x.name.lower()) if a.parent_area_id is None]

    @staticmethod
    async def list_persons(db: AsyncSession) -> list[schemas.PersonMini]:
        rows = await db.execute(select(Person).order_by(Person.full_name.asc()))
        return [schemas.PersonMini(id=p.id, full_name=p.full_name) for p in rows.scalars().all()]

    # ── CRUD produto ──────────────────────────
    @classmethod
    async def list_products(cls, db: AsyncSession) -> list[schemas.ProductListItem]:
        today = date.today()
        index = await _areas_index(db)
        res = await db.execute(select(Product).where(Product.is_active.is_(True)).order_by(Product.created_at.desc()))
        out = []
        for p in res.scalars().all():
            area_name = p.area.name if p.area else None
            setor = _setor_name(p.area, index) if p.area else None
            out.append(schemas.ProductListItem(
                id=p.id, name=p.name, simbolo=p.simbolo, origem=_ev(p.origem), lifecycle=_ev(p.lifecycle),
                criticidade=_ev(p.criticidade), area_name=area_name, setor_name=setor,
                responsavel_nome=p.responsavel.full_name if p.responsavel else None,
                requires_contract=cls._requires_contract(p), has_active_contract=cls._has_active_contract(p, today),
                is_active=p.is_active, created_at=p.created_at,
            ))
        return out

    @classmethod
    async def get(cls, db: AsyncSession, product_id: uuid.UUID) -> schemas.ProductResponse:
        return await cls._to_response(db, await cls._get(db, product_id))

    @classmethod
    async def create(cls, db: AsyncSession, data: schemas.ProductCreate, user_id: Optional[uuid.UUID]) -> schemas.ProductResponse:
        p = Product(
            name=data.name.strip(), simbolo=data.simbolo, description=data.description, dominio_funcional=data.dominio_funcional,
            origem=ProductOrigem(data.origem), lifecycle=ProductLifecycle(data.lifecycle), criticidade=ProductCriticidade(data.criticidade),
            data_entrada_producao=data.data_entrada_producao, area_id=data.area_id, responsavel_person_id=data.responsavel_person_id,
            fornecedor_id=data.fornecedor_id, origin_task_id=data.origin_task_id, created_by=user_id,
        )
        db.add(p)
        await db.commit()
        await db.refresh(p)
        return await cls._to_response(db, p)

    @classmethod
    async def update(cls, db: AsyncSession, product_id: uuid.UUID, data: schemas.ProductUpdate, user_id: Optional[uuid.UUID]) -> schemas.ProductResponse:
        p = await cls._get(db, product_id)
        payload = data.model_dump(exclude_unset=True)
        for field in ("name", "simbolo", "description", "dominio_funcional", "data_entrada_producao",
                      "area_id", "responsavel_person_id", "fornecedor_id", "is_active"):
            if field in payload:
                val = payload[field]
                setattr(p, field, val.strip() if isinstance(val, str) and field == "name" else val)
        if "origem" in payload and payload["origem"]:
            p.origem = ProductOrigem(payload["origem"])
        if "lifecycle" in payload and payload["lifecycle"]:
            p.lifecycle = ProductLifecycle(payload["lifecycle"])
        if "criticidade" in payload and payload["criticidade"]:
            p.criticidade = ProductCriticidade(payload["criticidade"])
        p.updated_by = user_id
        p.updated_at = _now()
        await db.commit()
        await db.refresh(p)
        return await cls._to_response(db, p)

    @classmethod
    async def delete(cls, db: AsyncSession, product_id: uuid.UUID, user_id: Optional[uuid.UUID]) -> None:
        """Exclusão LÓGICA (inativação) — preserva histórico."""
        p = await cls._get(db, product_id)
        p.is_active = False
        p.inactivated_by = user_id
        p.inactivated_at = _now()
        await db.commit()

    # ── Serviços (append-only history) ────────
    @classmethod
    async def add_servico(cls, db, product_id, data: schemas.ServicoCreate, user_id) -> schemas.ServicoResponse:
        await cls._get(db, product_id)
        order = (await db.execute(select(func.coalesce(func.max(ProductServico.order), -1)).where(ProductServico.product_id == product_id))).scalar_one() + 1
        item = ProductServico(product_id=product_id, name=data.name.strip(), description=data.description,
                              ano_referencia=data.ano_referencia or date.today().year, order=order, created_by=user_id)
        db.add(item)
        await db.commit()
        await db.refresh(item)
        return schemas.ServicoResponse.model_validate(item)

    @classmethod
    async def update_servico(cls, db, product_id, servico_id, data: schemas.ServicoCreate, user_id) -> schemas.ServicoResponse:
        res = await db.execute(select(ProductServico).where(ProductServico.id == servico_id, ProductServico.product_id == product_id, ProductServico.is_active.is_(True)))
        old = res.scalar_one_or_none()
        if not old:
            raise HTTPException(status_code=404, detail="Serviço não encontrado.")
        # Append-only: inativa o antigo e cria novo registro datado.
        old.is_active = False
        old.inactivated_by = user_id
        old.inactivated_at = _now()
        new = ProductServico(product_id=product_id, name=data.name.strip(), description=data.description,
                             ano_referencia=data.ano_referencia or old.ano_referencia, order=old.order, created_by=user_id)
        db.add(new)
        await db.commit()
        await db.refresh(new)
        return schemas.ServicoResponse.model_validate(new)

    @classmethod
    async def delete_servico(cls, db, product_id, servico_id, user_id) -> None:
        res = await db.execute(select(ProductServico).where(ProductServico.id == servico_id, ProductServico.product_id == product_id))
        item = res.scalar_one_or_none()
        if not item:
            raise HTTPException(status_code=404, detail="Serviço não encontrado.")
        item.is_active = False
        item.inactivated_by = user_id
        item.inactivated_at = _now()
        await db.commit()

    # ── Documentos (append-only history) ──────
    @classmethod
    async def add_documento(cls, db, product_id, data: schemas.DocumentoCreate, user_id) -> schemas.DocumentoResponse:
        await cls._get(db, product_id)
        if not data.object_name and not data.external_link:
            raise HTTPException(status_code=400, detail="Envie um arquivo ou informe um link externo.")
        order = (await db.execute(select(func.coalesce(func.max(ProductDocumento.order), -1)).where(ProductDocumento.product_id == product_id))).scalar_one() + 1
        item = ProductDocumento(product_id=product_id, name=data.name.strip(), ano_referencia=data.ano_referencia or date.today().year,
                                object_name=data.object_name, filename=data.filename, content_type=data.content_type, size=data.size,
                                category=data.category, external_link=data.external_link, uploaded_by=user_id, created_by=user_id, order=order)
        db.add(item)
        await db.commit()
        await db.refresh(item)
        return schemas.DocumentoResponse.model_validate(item)

    @classmethod
    async def delete_documento(cls, db, product_id, doc_id, user_id) -> None:
        res = await db.execute(select(ProductDocumento).where(ProductDocumento.id == doc_id, ProductDocumento.product_id == product_id))
        item = res.scalar_one_or_none()
        if not item:
            raise HTTPException(status_code=404, detail="Documento não encontrado.")
        item.is_active = False
        item.inactivated_by = user_id
        item.inactivated_at = _now()
        await db.commit()

    # ── Vínculo Produto–Processo (append-only) ─
    @classmethod
    async def link_processo(cls, db, product_id, data: schemas.ProdutoProcessoCreate, user_id) -> schemas.ProdutoProcessoResponse:
        await cls._get(db, product_id)
        proc = (await db.execute(select(Processo).where(Processo.id == data.processo_id))).scalar_one_or_none()
        if not proc:
            raise HTTPException(status_code=404, detail="Processo não encontrado.")
        if proc.nivel != ProcessoNivel.SUBPROCESSO:
            raise HTTPException(status_code=400, detail="Só é possível vincular o produto a um SUBPROCESSO (folha).")
        ano = data.ano_referencia or date.today().year
        # unicidade do vínculo ativo por (produto, processo, ano)
        dup = (await db.execute(select(ProdutoProcesso).where(
            ProdutoProcesso.product_id == product_id, ProdutoProcesso.processo_id == data.processo_id,
            ProdutoProcesso.ano_referencia == ano, ProdutoProcesso.is_active.is_(True)))).scalar_one_or_none()
        if dup:
            raise HTTPException(status_code=409, detail="Este subprocesso já está vinculado a este produto neste ano.")
        link = ProdutoProcesso(product_id=product_id, processo_id=data.processo_id, ano_referencia=ano,
                               automatizado=data.automatizado, created_by=user_id)
        db.add(link)
        await db.commit()
        await db.refresh(link)
        pidx = await cls._processos_index(db)
        return cls._link_response(link, pidx)

    @classmethod
    async def update_link(cls, db, product_id, link_id, data: schemas.ProdutoProcessoUpdate, user_id) -> schemas.ProdutoProcessoResponse:
        res = await db.execute(select(ProdutoProcesso).where(ProdutoProcesso.id == link_id, ProdutoProcesso.product_id == product_id, ProdutoProcesso.is_active.is_(True)))
        old = res.scalar_one_or_none()
        if not old:
            raise HTTPException(status_code=404, detail="Vínculo não encontrado.")
        # Append-only: inativa e cria novo registro datado (preserva histórico do indicador).
        old.is_active = False
        old.inactivated_by = user_id
        old.inactivated_at = _now()
        new = ProdutoProcesso(
            product_id=product_id, processo_id=old.processo_id,
            ano_referencia=data.ano_referencia if data.ano_referencia is not None else old.ano_referencia,
            automatizado=data.automatizado if data.automatizado is not None else old.automatizado, created_by=user_id,
        )
        db.add(new)
        await db.commit()
        await db.refresh(new)
        pidx = await cls._processos_index(db)
        return cls._link_response(new, pidx)

    @classmethod
    async def unlink_processo(cls, db, product_id, link_id, user_id) -> None:
        res = await db.execute(select(ProdutoProcesso).where(ProdutoProcesso.id == link_id, ProdutoProcesso.product_id == product_id))
        link = res.scalar_one_or_none()
        if not link:
            raise HTTPException(status_code=404, detail="Vínculo não encontrado.")
        link.is_active = False
        link.inactivated_by = user_id
        link.inactivated_at = _now()
        await db.commit()

    # ── Contratos ─────────────────────────────
    @classmethod
    async def add_contrato(cls, db, product_id, data: schemas.ContratoCreate, user_id) -> schemas.ContratoResponse:
        await cls._get(db, product_id)
        c = Contrato(
            product_id=product_id, fornecedor_id=data.fornecedor_id, identificador=data.identificador,
            vigencia_inicio=data.vigencia_inicio, vigencia_fim=data.vigencia_fim, renovacao_automatica=data.renovacao_automatica,
            modelo_licenciamento=data.modelo_licenciamento, gestor_person_id=data.gestor_person_id,
            sustentacao_n1=SustentacaoModelo(data.sustentacao_n1), sustentacao_n2=SustentacaoModelo(data.sustentacao_n2),
            sustentacao_n3=SustentacaoModelo(data.sustentacao_n3), alerta_dias=data.alerta_dias or [90, 60, 30],
            object_name=data.object_name, filename=data.filename, content_type=data.content_type, size=data.size,
            external_link=data.external_link, created_by=user_id,
        )
        db.add(c)
        await db.commit()
        await db.refresh(c)
        return cls._contrato_response(c)

    @classmethod
    async def update_contrato(cls, db, product_id, contrato_id, data: schemas.ContratoUpdate, user_id) -> schemas.ContratoResponse:
        res = await db.execute(select(Contrato).where(Contrato.id == contrato_id, Contrato.product_id == product_id))
        c = res.scalar_one_or_none()
        if not c:
            raise HTTPException(status_code=404, detail="Contrato não encontrado.")
        payload = data.model_dump(exclude_unset=True)
        for f in ("identificador", "vigencia_inicio", "vigencia_fim", "renovacao_automatica", "modelo_licenciamento", "gestor_person_id", "alerta_dias"):
            if f in payload:
                setattr(c, f, payload[f])
        for f in ("sustentacao_n1", "sustentacao_n2", "sustentacao_n3"):
            if f in payload and payload[f]:
                setattr(c, f, SustentacaoModelo(payload[f]))
        if c.vigencia_fim <= c.vigencia_inicio:
            raise HTTPException(status_code=400, detail="A vigência final deve ser posterior à inicial.")
        c.updated_by = user_id
        c.updated_at = _now()
        await db.commit()
        await db.refresh(c)
        return cls._contrato_response(c)

    @classmethod
    async def delete_contrato(cls, db, product_id, contrato_id, user_id) -> None:
        res = await db.execute(select(Contrato).where(Contrato.id == contrato_id, Contrato.product_id == product_id))
        c = res.scalar_one_or_none()
        if not c:
            raise HTTPException(status_code=404, detail="Contrato não encontrado.")
        c.is_active = False
        c.inactivated_by = user_id
        c.inactivated_at = _now()
        await db.commit()

    # ── Projetos finalizados → produto ────────
    @classmethod
    async def list_finalized_projects(cls, db: AsyncSession) -> list[schemas.FinalizedProjectItem]:
        try:
            from app.modules.projetos.models import ProjectStatusConfig, ProjectTask
        except Exception:
            return []
        rows = await db.execute(
            select(ProjectTask, ProjectStatusConfig.is_final)
            .outerjoin(ProjectStatusConfig, ProjectStatusConfig.id == ProjectTask.status_id)
            .where(ProjectTask.planning_kind == "projeto")
        )
        promoted = {r[0]: r[1] for r in (await db.execute(select(Product.origin_task_id, Product.id).where(Product.origin_task_id.isnot(None)))).all()}
        out = []
        for task, is_final in rows.all():
            if task.completed_at is None and not bool(is_final):
                continue
            out.append(schemas.FinalizedProjectItem(
                task_id=task.id, title=task.title, description=task.description, completed_at=task.completed_at,
                already_promoted=task.id in promoted, product_id=promoted.get(task.id)))
        out.sort(key=lambda x: (x.completed_at is None, x.completed_at or datetime.min), reverse=True)
        return out

    @classmethod
    async def create_from_project(cls, db, data: schemas.CreateFromProjectRequest, user_id) -> schemas.ProductResponse:
        try:
            from app.modules.projetos.models import ProjectTask
        except Exception:
            raise HTTPException(status_code=400, detail="Módulo de processos não está disponível.")
        if (await db.execute(select(Product.id).where(Product.origin_task_id == data.task_id))).scalar_one_or_none():
            raise HTTPException(status_code=409, detail="Este projeto já foi transformado em produto.")
        task = (await db.execute(select(ProjectTask).where(ProjectTask.id == data.task_id))).scalar_one_or_none()
        if not task:
            raise HTTPException(status_code=404, detail="Projeto não encontrado.")
        p = Product(name=(data.name or task.title).strip(), description=data.description if data.description is not None else task.description,
                    area_id=data.area_id, responsavel_person_id=data.responsavel_person_id, origin_task_id=task.id, created_by=user_id)
        db.add(p)
        await db.commit()
        await db.refresh(p)
        return await cls._to_response(db, p)

    # ── Dashboard ─────────────────────────────
    @classmethod
    async def dashboard(cls, db: AsyncSession) -> schemas.DashboardKpis:
        today = date.today()
        products = list((await db.execute(select(Product).where(Product.is_active.is_(True)))).scalars().all())
        by_life: dict = {}
        by_crit: dict = {}
        for p in products:
            by_life[_ev(p.lifecycle)] = by_life.get(_ev(p.lifecycle), 0) + 1
            by_crit[_ev(p.criticidade)] = by_crit.get(_ev(p.criticidade), 0) + 1
        total_serv = (await db.execute(select(func.count(ProductServico.id)).where(ProductServico.is_active.is_(True)))).scalar_one()
        total_doc = (await db.execute(select(func.count(ProductDocumento.id)).where(ProductDocumento.is_active.is_(True)))).scalar_one()
        total_auto = (await db.execute(select(func.count(ProdutoProcesso.id)).where(ProdutoProcesso.is_active.is_(True), ProdutoProcesso.automatizado.is_(True)))).scalar_one()
        venc = (await db.execute(select(func.count(Contrato.id)).where(Contrato.is_active.is_(True), Contrato.vigencia_fim >= today, Contrato.vigencia_fim <= date.fromordinal(today.toordinal() + 90)))).scalar_one()
        return schemas.DashboardKpis(
            total_products=len(products), active_products=len(products), by_lifecycle=by_life, by_criticidade=by_crit,
            total_servicos=int(total_serv), total_documentos=int(total_doc), total_processos_automatizados=int(total_auto),
            contratos_vencendo=int(venc),
        )


class ProcessoService:
    """Catálogo global de processos (Macro→Processo→Sub)."""

    @staticmethod
    async def _get(db, processo_id) -> Processo:
        p = (await db.execute(select(Processo).where(Processo.id == processo_id))).scalar_one_or_none()
        if not p:
            raise HTTPException(status_code=404, detail="Processo não encontrado.")
        return p

    @staticmethod
    def _tree(processos: list) -> list:
        by_id = {p.id: schemas.ProcessoResponse(id=p.id, name=p.name, description=p.description, nivel=_ev(p.nivel),
                                                 parent_id=p.parent_id, is_active=p.is_active, order=p.order, children=[]) for p in processos}
        roots = []
        for p in processos:
            node = by_id[p.id]
            if p.parent_id and p.parent_id in by_id:
                by_id[p.parent_id].children.append(node)
            else:
                roots.append(node)
        return roots

    @classmethod
    async def list_tree(cls, db) -> list:
        rows = (await db.execute(select(Processo).where(Processo.is_active.is_(True)).order_by(Processo.order))).scalars().all()
        return cls._tree(list(rows))

    @classmethod
    async def create(cls, db, data: schemas.ProcessoCreate, user_id) -> schemas.ProcessoResponse:
        nivel = ProcessoNivel(data.nivel)
        if nivel == ProcessoNivel.MACROPROCESSO:
            if data.parent_id is not None:
                raise HTTPException(status_code=400, detail="Macroprocesso não tem pai.")
        else:
            if data.parent_id is None:
                raise HTTPException(status_code=400, detail=f"{nivel.value} precisa de um pai.")
            parent = await cls._get(db, data.parent_id)
            if parent.nivel != _NIVEL_PARENT[nivel]:
                raise HTTPException(status_code=400, detail=f"O pai de um {nivel.value} deve ser um {_NIVEL_PARENT[nivel].value}.")
        order = (await db.execute(select(func.coalesce(func.max(Processo.order), -1)).where(Processo.parent_id == data.parent_id))).scalar_one() + 1
        item = Processo(parent_id=data.parent_id, nivel=nivel, name=data.name.strip(), description=data.description, order=order, created_by=user_id)
        db.add(item)
        await db.commit()
        await db.refresh(item)
        return schemas.ProcessoResponse(id=item.id, name=item.name, description=item.description, nivel=_ev(item.nivel),
                                        parent_id=item.parent_id, is_active=item.is_active, order=item.order, children=[])

    @classmethod
    async def update(cls, db, processo_id, data: schemas.ProcessoUpdate, user_id) -> schemas.ProcessoResponse:
        item = await cls._get(db, processo_id)
        for k, v in data.model_dump(exclude_unset=True).items():
            setattr(item, k, v.strip() if isinstance(v, str) and k == "name" else v)
        item.updated_by = user_id
        item.updated_at = _now()
        await db.commit()
        await db.refresh(item)
        return schemas.ProcessoResponse(id=item.id, name=item.name, description=item.description, nivel=_ev(item.nivel),
                                        parent_id=item.parent_id, is_active=item.is_active, order=item.order, children=[])

    @classmethod
    async def delete(cls, db, processo_id, user_id) -> None:
        """Inativação lógica + inativa descendentes."""
        item = await cls._get(db, processo_id)
        all_proc = {p.id: p for p in (await db.execute(select(Processo))).scalars().all()}
        children: dict = {}
        for p in all_proc.values():
            if p.parent_id:
                children.setdefault(p.parent_id, []).append(p.id)
        stack = [processo_id]
        now = _now()
        while stack:
            cur = stack.pop()
            p = all_proc.get(cur)
            if p and p.is_active:
                p.is_active = False
                p.inactivated_by = user_id
                p.inactivated_at = now
            stack.extend(children.get(cur, []))
        await db.commit()


class FornecedorService:
    @staticmethod
    async def list(db) -> list[schemas.FornecedorResponse]:
        rows = (await db.execute(select(Fornecedor).where(Fornecedor.is_active.is_(True)).order_by(Fornecedor.nome))).scalars().all()
        return [schemas.FornecedorResponse.model_validate(f) for f in rows]

    @staticmethod
    async def create(db, data: schemas.FornecedorCreate, user_id) -> schemas.FornecedorResponse:
        f = Fornecedor(**data.model_dump(), created_by=user_id)
        db.add(f)
        await db.commit()
        await db.refresh(f)
        return schemas.FornecedorResponse.model_validate(f)

    @staticmethod
    async def update(db, fornecedor_id, data: schemas.FornecedorUpdate, user_id) -> schemas.FornecedorResponse:
        f = (await db.execute(select(Fornecedor).where(Fornecedor.id == fornecedor_id))).scalar_one_or_none()
        if not f:
            raise HTTPException(status_code=404, detail="Fornecedor não encontrado.")
        for k, v in data.model_dump(exclude_unset=True).items():
            setattr(f, k, v)
        f.updated_by = user_id
        f.updated_at = _now()
        await db.commit()
        await db.refresh(f)
        return schemas.FornecedorResponse.model_validate(f)

    @staticmethod
    async def delete(db, fornecedor_id, user_id) -> None:
        f = (await db.execute(select(Fornecedor).where(Fornecedor.id == fornecedor_id))).scalar_one_or_none()
        if not f:
            raise HTTPException(status_code=404, detail="Fornecedor não encontrado.")
        f.is_active = False
        f.inactivated_by = user_id
        f.inactivated_at = _now()
        await db.commit()


class IndicadorService:
    """Indicadores estratégicos por ano: serviços, documentos, processos automatizados."""

    @staticmethod
    async def _counts_by_product(db, ano: int) -> dict:
        """{product_id: {servicos, documentos, processos_automatizados}}"""
        out: dict = {}

        def bump(pid, key):
            out.setdefault(pid, {"servicos": 0, "documentos": 0, "processos_automatizados": 0})[key] += 1

        for (pid,) in (await db.execute(select(ProductServico.product_id).where(ProductServico.is_active.is_(True), ProductServico.ano_referencia == ano))).all():
            bump(pid, "servicos")
        for (pid,) in (await db.execute(select(ProductDocumento.product_id).where(ProductDocumento.is_active.is_(True), ProductDocumento.ano_referencia == ano))).all():
            bump(pid, "documentos")
        for (pid,) in (await db.execute(select(ProdutoProcesso.product_id).where(ProdutoProcesso.is_active.is_(True), ProdutoProcesso.automatizado.is_(True), ProdutoProcesso.ano_referencia == ano))).all():
            bump(pid, "processos_automatizados")
        return out

    @classmethod
    async def indicadores(cls, db, ano: int, group_by: str) -> schemas.IndicadorResponse:
        per_prod = await cls._counts_by_product(db, ano)
        products = {p.id: p for p in (await db.execute(select(Product))).scalars().all()}
        index = await _areas_index(db)
        grupos: dict = {}  # key -> {label, counts}

        def add(key, label, c):
            g = grupos.setdefault(key, {"label": label, "servicos": 0, "documentos": 0, "processos_automatizados": 0})
            g["servicos"] += c["servicos"]; g["documentos"] += c["documentos"]; g["processos_automatizados"] += c["processos_automatizados"]

        for pid, c in per_prod.items():
            p = products.get(pid)
            if not p:
                continue
            if group_by == "produto":
                add(str(pid), p.name, c)
            elif group_by == "area":
                a = index.get(p.area_id) if p.area_id else None
                add(str(p.area_id) if a else "sem_area", a.name if a else "Sem área", c)
            elif group_by == "setor":
                a = index.get(p.area_id) if p.area_id else None
                setor = _setor_name(a, index) if a else "Sem setor"
                add(setor, setor, c)
            else:  # portfolio
                add("portfolio", "Portfólio", c)

        total = {"servicos": 0, "documentos": 0, "processos_automatizados": 0}
        out_grupos = []
        for key, g in grupos.items():
            counts = schemas.IndicadorCounts(servicos=g["servicos"], documentos=g["documentos"], processos_automatizados=g["processos_automatizados"])
            out_grupos.append(schemas.IndicadorGroupItem(key=key, label=g["label"], counts=counts))
            total["servicos"] += g["servicos"]; total["documentos"] += g["documentos"]; total["processos_automatizados"] += g["processos_automatizados"]
        out_grupos.sort(key=lambda x: x.label.lower())
        return schemas.IndicadorResponse(ano=ano, group_by=group_by, grupos=out_grupos, total=schemas.IndicadorCounts(**total))

    @classmethod
    async def series(cls, db, anos: list[int]) -> list[schemas.IndicadorSeriesPoint]:
        pts = []
        for ano in sorted(set(anos)):
            r = await cls.indicadores(db, ano, "portfolio")
            pts.append(schemas.IndicadorSeriesPoint(ano=ano, counts=r.total))
        return pts

    @classmethod
    async def consolidacao(cls, db, ano: int, product_id: Optional[uuid.UUID] = None) -> list[schemas.ProcessoConsolidacaoNode]:
        """Automatizados consolidados subindo a árvore (sub→processo→macro)."""
        procs = {p.id: p for p in (await db.execute(select(Processo).where(Processo.is_active.is_(True)))).scalars().all()}
        # contagem de automatizados por subprocesso no ano
        q = select(ProdutoProcesso.processo_id, func.count(ProdutoProcesso.id)).where(
            ProdutoProcesso.is_active.is_(True), ProdutoProcesso.automatizado.is_(True), ProdutoProcesso.ano_referencia == ano)
        if product_id:
            q = q.where(ProdutoProcesso.product_id == product_id)
        q = q.group_by(ProdutoProcesso.processo_id)
        auto_by_sub = {pid: int(n) for pid, n in (await db.execute(q)).all()}
        children: dict = {}
        for p in procs.values():
            if p.parent_id:
                children.setdefault(p.parent_id, []).append(p.id)

        def build(pid) -> schemas.ProcessoConsolidacaoNode:
            p = procs[pid]
            kids = [build(c) for c in sorted(children.get(pid, []), key=lambda x: procs[x].order)]
            own = auto_by_sub.get(pid, 0) if p.nivel == ProcessoNivel.SUBPROCESSO else 0
            total = own + sum(k.automatizados for k in kids)
            return schemas.ProcessoConsolidacaoNode(id=pid, name=p.name, nivel=_ev(p.nivel), automatizados=total, children=kids)

        roots = [build(pid) for pid in procs if procs[pid].parent_id is None]
        roots.sort(key=lambda n: n.name.lower())
        return roots


class AlertaService:
    @staticmethod
    async def contratos(db) -> list[schemas.AlertaContrato]:
        today = date.today()
        out = []
        # contratos vencendo dentro das janelas configuradas
        contratos = (await db.execute(select(Contrato).where(Contrato.is_active.is_(True)))).scalars().all()
        prod_names = {p.id: p.name for p in (await db.execute(select(Product))).scalars().all()}
        for c in contratos:
            dias = (c.vigencia_fim - today).days
            janelas = sorted(c.alerta_dias or [90, 60, 30])
            if 0 <= dias <= (max(janelas) if janelas else 90):
                out.append(schemas.AlertaContrato(
                    tipo="vencimento", product_id=c.product_id, product_name=prod_names.get(c.product_id, "—"),
                    contrato_id=c.id, vigencia_fim=c.vigencia_fim, dias_para_vencer=dias,
                    mensagem=f"Contrato vence em {dias} dia(s) ({c.vigencia_fim:%d/%m/%Y}).",
                ))
        # produtos de fornecedor sem contrato ativo
        products = (await db.execute(select(Product).where(Product.is_active.is_(True)))).scalars().all()
        for p in products:
            if ProductService._requires_contract(p) and not ProductService._has_active_contract(p, today):
                out.append(schemas.AlertaContrato(
                    tipo="sem_contrato", product_id=p.id, product_name=p.name,
                    mensagem="Produto de fornecedor sem contrato ativo.",
                ))
        out.sort(key=lambda a: (a.tipo != "vencimento", a.dias_para_vencer if a.dias_para_vencer is not None else 9999))
        return out
