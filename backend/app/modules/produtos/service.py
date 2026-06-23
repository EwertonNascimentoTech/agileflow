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
    AutenticacaoTipo,
    ClassificacaoInformacao,
    Contrato,
    ContratoStatus,
    ContratoTipoValor,
    DocumentacaoStatus,
    DocumentacaoTipo,
    DocumentoTipo,
    Fornecedor,
    IntegracaoTipo,
    RiscoIndisponibilidade,
    SuporteTipo,
    Processo,
    ProcessoNivel,
    ProcessItemNivel,
    ProcessPortfolio,
    ProcessPortfolioItem,
    ProcessPortfolioVersion,
    ProcessPortfolioVersionStatus,
    ProcessServiceLink,
    Product,
    ProductCategoria,
    ProductCriticidade,
    ProductDocumentation,
    ProductDocumento,
    ProductLifecycle,
    ProductModeloContratacao,
    ProductOrigem,
    ProductRelease,
    ProductSecurityIntegration,
    ProductServico,
    ProductStatus,
    ProductSupport,
    ProductTipoDesenvolvimento,
    ProductUnidade,
    ProdutoProcesso,
    ReleaseAmbiente,
    ReleaseImpacto,
    ReleaseStatus,
    ReleaseTipo,
    ServicoStatus,
    ServicoTipoSuporte,
    SustentacaoModelo,
)

_NIVEL_PARENT = {ProcessoNivel.PROCESSO: ProcessoNivel.MACROPROCESSO, ProcessoNivel.SUBPROCESSO: ProcessoNivel.PROCESSO}
_REQUIRES_CONTRACT_ORIGEM = {ProductOrigem.COTS, ProductOrigem.SAAS, ProductOrigem.CUSTOMIZACAO}


def _now() -> datetime:
    return datetime.utcnow()


def _ev(x):
    return x.value if hasattr(x, "value") else x


def _contrato_effective_status(c, today: date) -> Optional[str]:
    """Status efetivo do contrato: usa o manual se setado; senão deriva da vigência
    (regra spec: 'a_vencer' quando faltam ≤90 dias)."""
    if c.status_contrato is not None:
        return _ev(c.status_contrato)
    if not c.is_active:
        return "encerrado"
    dias = (c.vigencia_fim - today).days
    if dias < 0:
        return "vencido"
    if dias <= 90:
        return "a_vencer"
    return "vigente"


def _anexos_out(raw) -> Optional[list[schemas.AnexoItem]]:
    if not raw:
        return None
    return [schemas.AnexoItem(**a) if isinstance(a, dict) else a for a in raw]


def _anexos_in(items) -> Optional[list]:
    if items is None:
        return None
    return [a.model_dump() if hasattr(a, "model_dump") else a for a in items]


def _release_to_resp(r) -> schemas.ReleaseResponse:
    return schemas.ReleaseResponse(
        id=r.id, versao=r.versao, nome=r.nome, data_release=r.data_release,
        ambiente=_ev(r.ambiente) if r.ambiente else None, tipo=_ev(r.tipo) if r.tipo else None,
        descricao_mudanca=r.descricao_mudanca, impacto=_ev(r.impacto) if r.impacto else None,
        responsavel_person_id=r.responsavel_person_id,
        responsavel_nome=r.responsavel.full_name if r.responsavel else None,
        evidencia_link=r.evidencia_link, evidencia_anexos=_anexos_out(r.evidencia_anexos),
        changelog=r.changelog, tem_rollback=r.tem_rollback, descricao_rollback=r.descricao_rollback,
        doc_atualizada=r.doc_atualizada, status=_ev(r.status), created_at=r.created_at,
    )


def _doc_to_resp(d) -> schemas.DocumentationResponse:
    return schemas.DocumentationResponse(
        id=d.id, tipo=_ev(d.tipo), titulo=d.titulo, conteudo_md=d.conteudo_md,
        versao_relacionada=d.versao_relacionada, autor_person_id=d.autor_person_id,
        autor_nome=d.autor.full_name if d.autor else None, status=_ev(d.status),
        link_interno=d.link_interno, anexos=_anexos_out(d.anexos),
        created_at=d.created_at, updated_at=d.updated_at,
    )


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
        support = next((s for s in p.supports if s.is_active), None)
        security = next((s for s in p.security if s.is_active), None)
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
            # campos novos "Produtos Digitais"
            sigla=p.sigla, link_descricao=p.link_descricao, categoria=_ev(p.categoria) if p.categoria else None,
            unidade=_ev(p.unidade) if p.unidade else None,
            dono_negocio=schemas.PersonMini(id=p.dono_negocio.id, full_name=p.dono_negocio.full_name) if p.dono_negocio else None,
            publico_alvo=p.publico_alvo, url_acesso=p.url_acesso, observacoes=p.observacoes,
            status_produto=_ev(p.status_produto) if p.status_produto else None,
            tipo_desenvolvimento=_ev(p.tipo_desenvolvimento) if p.tipo_desenvolvimento else None,
            desenvolvido_por=p.desenvolvido_por, fornecedor_cnpj=p.fornecedor_cnpj,
            modelo_contratacao=_ev(p.modelo_contratacao) if p.modelo_contratacao else None,
            ambiente_tecnologico=p.ambiente_tecnologico, tecnologias=p.tecnologias,
            link_repositorio=p.link_repositorio, link_dev=p.link_dev, link_hml=p.link_hml, link_prd=p.link_prd,
            servicos=[schemas.ServicoResponse.model_validate(s) for s in sorted(p.servicos, key=lambda x: x.order) if s.is_active],
            documentos=[schemas.DocumentoResponse.model_validate(d) for d in sorted(p.documentos, key=lambda x: x.order) if d.is_active],
            processos=[cls._link_response(l, pidx) for l in active_proc],
            contratos=[cls._contrato_response(c, pidx_persons=None) for c in p.contratos if c.is_active],
            releases=[_release_to_resp(r) for r in sorted(p.releases, key=lambda x: (x.data_release or date.min, x.created_at), reverse=True) if r.is_active],
            documentations=[_doc_to_resp(d) for d in sorted(p.documentations, key=lambda x: x.created_at) if d.is_active],
            support=schemas.SupportResponse.model_validate(support) if support else None,
            security=schemas.SecurityResponse.model_validate(security) if security else None,
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
            numero=c.numero, objeto_contratual=c.objeto_contratual,
            status_contrato=_contrato_effective_status(c, today),
            valor=float(c.valor) if c.valor is not None else None,
            tipo_valor=_ev(c.tipo_valor) if c.tipo_valor else None, centro_custo=c.centro_custo,
            fiscal_person_id=c.fiscal_person_id, fiscal_nome=c.fiscal.full_name if c.fiscal else None,
            sla_contratual=c.sla_contratual, aditivos=_anexos_out(c.aditivos), observacoes=c.observacoes,
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
            # contrato vigente (maior vigencia_fim entre os ativos)
            contratos_ativos = [c for c in p.contratos if c.is_active]
            cur_contrato = max(contratos_ativos, key=lambda c: c.vigencia_fim, default=None)
            contrato_status = _contrato_effective_status(cur_contrato, today) if cur_contrato else None
            a_vencer = bool(cur_contrato and 0 <= (cur_contrato.vigencia_fim - today).days <= 90)
            # última release publicada/ativa
            releases_ativas = [r for r in p.releases if r.is_active]
            ult_rel = max(releases_ativas, key=lambda r: (r.data_release or date.min, r.created_at), default=None)
            # documentação mais recente
            docs_ativas = [d for d in p.documentations if d.is_active]
            ult_doc = max(docs_ativas, key=lambda d: d.created_at, default=None)
            tem_dp = any(d.dados_pessoais for d in p.documentos if d.is_active) or any(s.dados_pessoais for s in p.security if s.is_active)
            out.append(schemas.ProductListItem(
                id=p.id, name=p.name, simbolo=p.simbolo, origem=_ev(p.origem), lifecycle=_ev(p.lifecycle),
                criticidade=_ev(p.criticidade), area_name=area_name, setor_name=setor,
                responsavel_nome=p.responsavel.full_name if p.responsavel else None,
                requires_contract=cls._requires_contract(p), has_active_contract=cls._has_active_contract(p, today),
                is_active=p.is_active, created_at=p.created_at,
                sigla=p.sigla, categoria=_ev(p.categoria) if p.categoria else None,
                unidade=_ev(p.unidade) if p.unidade else None,
                status_produto=_ev(p.status_produto) if p.status_produto else None,
                tipo_desenvolvimento=_ev(p.tipo_desenvolvimento) if p.tipo_desenvolvimento else None,
                fornecedor_nome=p.fornecedor.nome if p.fornecedor else None,
                contrato_status=contrato_status,
                contrato_vigencia_fim=cur_contrato.vigencia_fim if cur_contrato else None,
                contrato_a_vencer=a_vencer,
                ultima_release=ult_rel.versao if ult_rel else None,
                doc_status=_ev(ult_doc.status) if ult_doc else None,
                has_documentation=len(docs_ativas) > 0,
                tem_dados_pessoais=tem_dp,
                is_critico=p.criticidade == ProductCriticidade.CRITICA,
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
            # campos novos "Produtos Digitais"
            sigla=data.sigla, link_descricao=data.link_descricao,
            categoria=ProductCategoria(data.categoria) if data.categoria else None,
            unidade=ProductUnidade(data.unidade) if data.unidade else None,
            dono_negocio_person_id=data.dono_negocio_person_id, publico_alvo=data.publico_alvo,
            url_acesso=data.url_acesso, observacoes=data.observacoes,
            status_produto=ProductStatus(data.status_produto) if data.status_produto else None,
            tipo_desenvolvimento=ProductTipoDesenvolvimento(data.tipo_desenvolvimento) if data.tipo_desenvolvimento else None,
            desenvolvido_por=data.desenvolvido_por, fornecedor_cnpj=data.fornecedor_cnpj,
            modelo_contratacao=ProductModeloContratacao(data.modelo_contratacao) if data.modelo_contratacao else None,
            ambiente_tecnologico=data.ambiente_tecnologico, tecnologias=data.tecnologias,
            link_repositorio=data.link_repositorio, link_dev=data.link_dev, link_hml=data.link_hml, link_prd=data.link_prd,
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
                      "area_id", "responsavel_person_id", "fornecedor_id", "is_active",
                      "sigla", "link_descricao", "dono_negocio_person_id", "publico_alvo", "url_acesso",
                      "observacoes", "desenvolvido_por", "fornecedor_cnpj", "ambiente_tecnologico",
                      "tecnologias", "link_repositorio", "link_dev", "link_hml", "link_prd"):
            if field in payload:
                val = payload[field]
                setattr(p, field, val.strip() if isinstance(val, str) and field == "name" else val)
        if "origem" in payload and payload["origem"]:
            p.origem = ProductOrigem(payload["origem"])
        if "lifecycle" in payload and payload["lifecycle"]:
            p.lifecycle = ProductLifecycle(payload["lifecycle"])
        if "criticidade" in payload and payload["criticidade"]:
            p.criticidade = ProductCriticidade(payload["criticidade"])
        # enums opcionais novos (None limpa o campo)
        if "categoria" in payload:
            p.categoria = ProductCategoria(payload["categoria"]) if payload["categoria"] else None
        if "unidade" in payload:
            p.unidade = ProductUnidade(payload["unidade"]) if payload["unidade"] else None
        if "status_produto" in payload:
            p.status_produto = ProductStatus(payload["status_produto"]) if payload["status_produto"] else None
        if "tipo_desenvolvimento" in payload:
            p.tipo_desenvolvimento = ProductTipoDesenvolvimento(payload["tipo_desenvolvimento"]) if payload["tipo_desenvolvimento"] else None
        if "modelo_contratacao" in payload:
            p.modelo_contratacao = ProductModeloContratacao(payload["modelo_contratacao"]) if payload["modelo_contratacao"] else None
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
                              ano_referencia=data.ano_referencia or date.today().year, order=order, created_by=user_id,
                              area_usuaria=data.area_usuaria, processo_relacionado=data.processo_relacionado,
                              disponibilidade=data.disponibilidade, sla_atendimento=data.sla_atendimento,
                              tipo_suporte=ServicoTipoSuporte(data.tipo_suporte) if data.tipo_suporte else None,
                              status_servico=ServicoStatus(data.status_servico) if data.status_servico else None)
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
                             ano_referencia=data.ano_referencia or old.ano_referencia, order=old.order, created_by=user_id,
                             area_usuaria=data.area_usuaria, processo_relacionado=data.processo_relacionado,
                             disponibilidade=data.disponibilidade, sla_atendimento=data.sla_atendimento,
                             tipo_suporte=ServicoTipoSuporte(data.tipo_suporte) if data.tipo_suporte else None,
                             status_servico=ServicoStatus(data.status_servico) if data.status_servico else None)
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
                                category=data.category, external_link=data.external_link, uploaded_by=user_id, created_by=user_id, order=order,
                                tipo_documento=DocumentoTipo(data.tipo_documento) if data.tipo_documento else None,
                                is_nato_digital=data.is_nato_digital if data.is_nato_digital is not None else True,
                                assinatura_digital=bool(data.assinatura_digital), trilha_auditoria=bool(data.trilha_auditoria),
                                local_armazenamento=data.local_armazenamento, prazo_retencao=data.prazo_retencao,
                                classificacao=ClassificacaoInformacao(data.classificacao) if data.classificacao else None,
                                dados_pessoais=bool(data.dados_pessoais), dados_sensiveis=bool(data.dados_sensiveis),
                                observacoes=data.observacoes)
        db.add(item)
        await db.commit()
        await db.refresh(item)
        return schemas.DocumentoResponse.model_validate(item)

    @classmethod
    async def update_documento(cls, db, product_id, doc_id, data: schemas.DocumentoUpdate, user_id) -> schemas.DocumentoResponse:
        res = await db.execute(select(ProductDocumento).where(ProductDocumento.id == doc_id, ProductDocumento.product_id == product_id, ProductDocumento.is_active.is_(True)))
        item = res.scalar_one_or_none()
        if not item:
            raise HTTPException(status_code=404, detail="Documento não encontrado.")
        payload = data.model_dump(exclude_unset=True)
        for f in ("name", "ano_referencia", "category", "external_link", "is_nato_digital", "assinatura_digital",
                  "trilha_auditoria", "local_armazenamento", "prazo_retencao", "dados_pessoais", "dados_sensiveis", "observacoes"):
            if f in payload:
                setattr(item, f, payload[f].strip() if isinstance(payload[f], str) and f == "name" else payload[f])
        if "tipo_documento" in payload:
            item.tipo_documento = DocumentoTipo(payload["tipo_documento"]) if payload["tipo_documento"] else None
        if "classificacao" in payload:
            item.classificacao = ClassificacaoInformacao(payload["classificacao"]) if payload["classificacao"] else None
        item.updated_by = user_id
        item.updated_at = _now()
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
            numero=data.numero, objeto_contratual=data.objeto_contratual,
            status_contrato=ContratoStatus(data.status_contrato) if data.status_contrato else None,
            valor=data.valor, tipo_valor=ContratoTipoValor(data.tipo_valor) if data.tipo_valor else None,
            centro_custo=data.centro_custo, fiscal_person_id=data.fiscal_person_id, sla_contratual=data.sla_contratual,
            aditivos=_anexos_in(data.aditivos), observacoes=data.observacoes,
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
        for f in ("identificador", "vigencia_inicio", "vigencia_fim", "renovacao_automatica", "modelo_licenciamento",
                  "gestor_person_id", "alerta_dias", "object_name", "filename", "content_type", "size", "external_link",
                  "numero", "objeto_contratual", "valor", "centro_custo", "fiscal_person_id", "sla_contratual", "observacoes"):
            if f in payload:
                setattr(c, f, payload[f])
        for f in ("sustentacao_n1", "sustentacao_n2", "sustentacao_n3"):
            if f in payload and payload[f]:
                setattr(c, f, SustentacaoModelo(payload[f]))
        if "status_contrato" in payload:
            c.status_contrato = ContratoStatus(payload["status_contrato"]) if payload["status_contrato"] else None
        if "tipo_valor" in payload:
            c.tipo_valor = ContratoTipoValor(payload["tipo_valor"]) if payload["tipo_valor"] else None
        if "aditivos" in payload:
            c.aditivos = _anexos_in(data.aditivos)
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
        by_status: dict = {}
        internos = externos = sem_contrato = a_vencer = sem_doc = criticos = com_dp = com_contingencia = 0
        for p in products:
            by_life[_ev(p.lifecycle)] = by_life.get(_ev(p.lifecycle), 0) + 1
            by_crit[_ev(p.criticidade)] = by_crit.get(_ev(p.criticidade), 0) + 1
            if p.status_produto is not None:
                by_status[_ev(p.status_produto)] = by_status.get(_ev(p.status_produto), 0) + 1
            if p.tipo_desenvolvimento == ProductTipoDesenvolvimento.INTERNO:
                internos += 1
            elif p.tipo_desenvolvimento in (ProductTipoDesenvolvimento.EXTERNO, ProductTipoDesenvolvimento.HIBRIDO):
                externos += 1
            contratos_ativos = [c for c in p.contratos if c.is_active]
            if not contratos_ativos:
                sem_contrato += 1
            elif any(0 <= (c.vigencia_fim - today).days <= 90 for c in contratos_ativos):
                a_vencer += 1
            if not any(d.is_active for d in p.documentations):
                sem_doc += 1
            if p.criticidade == ProductCriticidade.CRITICA:
                criticos += 1
            if any(d.dados_pessoais for d in p.documentos if d.is_active) or any(s.dados_pessoais for s in p.security if s.is_active):
                com_dp += 1
            if any(s.is_active and s.plano_contingencia for s in p.security):
                com_contingencia += 1
        total_serv = (await db.execute(select(func.count(ProductServico.id)).where(ProductServico.is_active.is_(True)))).scalar_one()
        total_doc = (await db.execute(select(func.count(ProductDocumento.id)).where(ProductDocumento.is_active.is_(True)))).scalar_one()
        total_auto = (await db.execute(select(func.count(ProdutoProcesso.id)).where(ProdutoProcesso.is_active.is_(True), ProdutoProcesso.automatizado.is_(True)))).scalar_one()
        venc = (await db.execute(select(func.count(Contrato.id)).where(Contrato.is_active.is_(True), Contrato.vigencia_fim >= today, Contrato.vigencia_fim <= date.fromordinal(today.toordinal() + 90)))).scalar_one()
        mes_ini = today.replace(day=1)
        rel_mes = (await db.execute(select(func.count(ProductRelease.id)).where(
            ProductRelease.is_active.is_(True), ProductRelease.status == ReleaseStatus.PUBLICADA,
            ProductRelease.data_release >= mes_ini, ProductRelease.data_release <= today,
        ))).scalar_one()
        return schemas.DashboardKpis(
            total_products=len(products), active_products=len(products), by_lifecycle=by_life, by_criticidade=by_crit,
            total_servicos=int(total_serv), total_documentos=int(total_doc), total_processos_automatizados=int(total_auto),
            contratos_vencendo=int(venc),
            by_status=by_status,
            em_desenvolvimento=by_status.get("desenvolvimento", 0),
            em_producao=by_status.get("producao", 0),
            em_sustentacao=by_status.get("sustentacao", 0),
            descontinuados=by_status.get("descontinuado", 0),
            internos=internos, externos=externos, sem_contrato=sem_contrato, contratos_a_vencer_90d=a_vencer,
            sem_documentacao=sem_doc, criticos=criticos, com_dados_pessoais=com_dp,
            com_plano_contingencia=com_contingencia, releases_publicadas_mes=int(rel_mes),
        )


MARKDOWN_TEMPLATE = """# Nome do Produto

## 1. Visão Geral
Descreva a finalidade do produto.

## 2. Público-alvo
Informe quem utiliza o produto.

## 3. Principais Funcionalidades
- Funcionalidade 1
- Funcionalidade 2

## 4. Fluxo de Uso
Descreva o passo a passo de utilização.

## 5. Perfis de Acesso
Descreva os perfis e permissões.

## 6. Integrações
Informe sistemas, APIs e bases envolvidas.

## 7. Regras de Negócio
Liste as principais regras aplicadas.

## 8. Suporte
Informe como solicitar atendimento.

## 9. Histórico de Versões
Registre as alterações relevantes.
"""


class ReleaseService:
    """Versões/Releases de um produto."""

    @staticmethod
    async def _get_product(db, product_id) -> Product:
        p = (await db.execute(select(Product).where(Product.id == product_id))).scalar_one_or_none()
        if not p:
            raise HTTPException(status_code=404, detail="Produto não encontrado.")
        return p

    @classmethod
    async def list(cls, db, product_id) -> list[schemas.ReleaseResponse]:
        rows = (await db.execute(select(ProductRelease).where(
            ProductRelease.product_id == product_id, ProductRelease.is_active.is_(True),
        ).order_by(ProductRelease.data_release.desc().nullslast(), ProductRelease.created_at.desc()))).scalars().all()
        return [_release_to_resp(r) for r in rows]

    @classmethod
    async def create(cls, db, product_id, data: schemas.ReleaseCreate, user_id) -> schemas.ReleaseResponse:
        await cls._get_product(db, product_id)
        r = ProductRelease(
            product_id=product_id, versao=data.versao.strip(), nome=data.nome, data_release=data.data_release,
            ambiente=ReleaseAmbiente(data.ambiente) if data.ambiente else None,
            tipo=ReleaseTipo(data.tipo) if data.tipo else None, descricao_mudanca=data.descricao_mudanca,
            impacto=ReleaseImpacto(data.impacto) if data.impacto else None,
            responsavel_person_id=data.responsavel_person_id, evidencia_link=data.evidencia_link,
            evidencia_anexos=_anexos_in(data.evidencia_anexos), changelog=data.changelog,
            tem_rollback=bool(data.tem_rollback), descricao_rollback=data.descricao_rollback,
            doc_atualizada=bool(data.doc_atualizada),
            status=ReleaseStatus(data.status) if data.status else ReleaseStatus.PLANEJADA,
            created_by=user_id,
        )
        db.add(r)
        await db.commit()
        await db.refresh(r)
        return _release_to_resp(r)

    @classmethod
    async def update(cls, db, product_id, release_id, data: schemas.ReleaseUpdate, user_id) -> schemas.ReleaseResponse:
        r = (await db.execute(select(ProductRelease).where(
            ProductRelease.id == release_id, ProductRelease.product_id == product_id, ProductRelease.is_active.is_(True),
        ))).scalar_one_or_none()
        if not r:
            raise HTTPException(status_code=404, detail="Release não encontrada.")
        payload = data.model_dump(exclude_unset=True)
        for f in ("versao", "nome", "data_release", "descricao_mudanca", "responsavel_person_id",
                  "evidencia_link", "changelog", "tem_rollback", "descricao_rollback", "doc_atualizada"):
            if f in payload:
                setattr(r, f, payload[f].strip() if isinstance(payload[f], str) and f == "versao" else payload[f])
        if "ambiente" in payload:
            r.ambiente = ReleaseAmbiente(payload["ambiente"]) if payload["ambiente"] else None
        if "tipo" in payload:
            r.tipo = ReleaseTipo(payload["tipo"]) if payload["tipo"] else None
        if "impacto" in payload:
            r.impacto = ReleaseImpacto(payload["impacto"]) if payload["impacto"] else None
        if "status" in payload and payload["status"]:
            r.status = ReleaseStatus(payload["status"])
        if "evidencia_anexos" in payload:
            r.evidencia_anexos = _anexos_in(data.evidencia_anexos)
        # valida regra de publicação
        if r.status == ReleaseStatus.PUBLICADA and not all([r.data_release, r.ambiente, r.tipo, r.descricao_mudanca]):
            raise HTTPException(status_code=400, detail="Release publicada exige data, ambiente, tipo e descrição da mudança.")
        r.updated_by = user_id
        r.updated_at = _now()
        await db.commit()
        await db.refresh(r)
        return _release_to_resp(r)

    @classmethod
    async def delete(cls, db, product_id, release_id, user_id) -> None:
        r = (await db.execute(select(ProductRelease).where(
            ProductRelease.id == release_id, ProductRelease.product_id == product_id,
        ))).scalar_one_or_none()
        if not r:
            raise HTTPException(status_code=404, detail="Release não encontrada.")
        r.is_active = False
        r.updated_by = user_id
        r.updated_at = _now()
        await db.commit()


class DocumentationService:
    """Documentação técnica/usuário em Markdown."""

    @staticmethod
    def template() -> str:
        return MARKDOWN_TEMPLATE

    @classmethod
    async def list(cls, db, product_id) -> list[schemas.DocumentationResponse]:
        rows = (await db.execute(select(ProductDocumentation).where(
            ProductDocumentation.product_id == product_id, ProductDocumentation.is_active.is_(True),
        ).order_by(ProductDocumentation.created_at))).scalars().all()
        return [_doc_to_resp(d) for d in rows]

    @classmethod
    async def create(cls, db, product_id, data: schemas.DocumentationCreate, user_id) -> schemas.DocumentationResponse:
        if not (await db.execute(select(Product.id).where(Product.id == product_id))).scalar_one_or_none():
            raise HTTPException(status_code=404, detail="Produto não encontrado.")
        d = ProductDocumentation(
            product_id=product_id, titulo=data.titulo.strip(),
            tipo=DocumentacaoTipo(data.tipo) if data.tipo else DocumentacaoTipo.USUARIO,
            conteudo_md=data.conteudo_md, versao_relacionada=data.versao_relacionada,
            autor_person_id=data.autor_person_id,
            status=DocumentacaoStatus(data.status) if data.status else DocumentacaoStatus.NAO_INICIADA,
            link_interno=data.link_interno, anexos=_anexos_in(data.anexos), created_by=user_id,
        )
        db.add(d)
        await db.commit()
        await db.refresh(d)
        return _doc_to_resp(d)

    @classmethod
    async def update(cls, db, product_id, doc_id, data: schemas.DocumentationUpdate, user_id) -> schemas.DocumentationResponse:
        d = (await db.execute(select(ProductDocumentation).where(
            ProductDocumentation.id == doc_id, ProductDocumentation.product_id == product_id, ProductDocumentation.is_active.is_(True),
        ))).scalar_one_or_none()
        if not d:
            raise HTTPException(status_code=404, detail="Documentação não encontrada.")
        payload = data.model_dump(exclude_unset=True)
        for f in ("titulo", "conteudo_md", "versao_relacionada", "autor_person_id", "link_interno"):
            if f in payload:
                setattr(d, f, payload[f].strip() if isinstance(payload[f], str) and f == "titulo" else payload[f])
        if "tipo" in payload and payload["tipo"]:
            d.tipo = DocumentacaoTipo(payload["tipo"])
        if "status" in payload and payload["status"]:
            d.status = DocumentacaoStatus(payload["status"])
        if "anexos" in payload:
            d.anexos = _anexos_in(data.anexos)
        if d.status == DocumentacaoStatus.PUBLICADA and not (d.conteudo_md and d.conteudo_md.strip()):
            raise HTTPException(status_code=400, detail="Documentação publicada exige conteúdo Markdown preenchido.")
        d.updated_by = user_id
        d.updated_at = _now()
        await db.commit()
        await db.refresh(d)
        return _doc_to_resp(d)

    @classmethod
    async def delete(cls, db, product_id, doc_id, user_id) -> None:
        d = (await db.execute(select(ProductDocumentation).where(
            ProductDocumentation.id == doc_id, ProductDocumentation.product_id == product_id,
        ))).scalar_one_or_none()
        if not d:
            raise HTTPException(status_code=404, detail="Documentação não encontrada.")
        d.is_active = False
        d.updated_by = user_id
        d.updated_at = _now()
        await db.commit()


class SupportService:
    """Sustentação/SLA — 1 registro ativo por produto (upsert)."""

    @classmethod
    async def get(cls, db, product_id) -> Optional[schemas.SupportResponse]:
        s = (await db.execute(select(ProductSupport).where(
            ProductSupport.product_id == product_id, ProductSupport.is_active.is_(True),
        ))).scalars().first()
        return schemas.SupportResponse.model_validate(s) if s else None

    @classmethod
    async def upsert(cls, db, product_id, data: schemas.SupportUpsert, user_id) -> schemas.SupportResponse:
        if not (await db.execute(select(Product.id).where(Product.id == product_id))).scalar_one_or_none():
            raise HTTPException(status_code=404, detail="Produto não encontrado.")
        s = (await db.execute(select(ProductSupport).where(
            ProductSupport.product_id == product_id, ProductSupport.is_active.is_(True),
        ))).scalars().first()
        payload = data.model_dump(exclude_unset=True)
        if s is None:
            s = ProductSupport(product_id=product_id, created_by=user_id)
            db.add(s)
        if "tipo" in payload:
            s.tipo = SuporteTipo(payload.pop("tipo")) if payload.get("tipo") else None
        for f, v in payload.items():
            if f != "tipo":
                setattr(s, f, v)
        s.updated_by = user_id
        s.updated_at = _now()
        await db.commit()
        await db.refresh(s)
        return schemas.SupportResponse.model_validate(s)


class SecurityIntegrationService:
    """Integrações, dados e segurança — 1 registro ativo por produto (upsert)."""

    @classmethod
    async def get(cls, db, product_id) -> Optional[schemas.SecurityResponse]:
        s = (await db.execute(select(ProductSecurityIntegration).where(
            ProductSecurityIntegration.product_id == product_id, ProductSecurityIntegration.is_active.is_(True),
        ))).scalars().first()
        return schemas.SecurityResponse.model_validate(s) if s else None

    @classmethod
    async def upsert(cls, db, product_id, data: schemas.SecurityUpsert, user_id) -> schemas.SecurityResponse:
        if not (await db.execute(select(Product.id).where(Product.id == product_id))).scalar_one_or_none():
            raise HTTPException(status_code=404, detail="Produto não encontrado.")
        s = (await db.execute(select(ProductSecurityIntegration).where(
            ProductSecurityIntegration.product_id == product_id, ProductSecurityIntegration.is_active.is_(True),
        ))).scalars().first()
        payload = data.model_dump(exclude_unset=True)
        if s is None:
            s = ProductSecurityIntegration(product_id=product_id, created_by=user_id)
            db.add(s)
        enum_map = {
            "tipo_integracao": IntegracaoTipo, "classificacao": ClassificacaoInformacao,
            "tipo_autenticacao": AutenticacaoTipo, "risco_indisponibilidade": RiscoIndisponibilidade,
        }
        for f, v in payload.items():
            if f in enum_map:
                setattr(s, f, enum_map[f](v) if v else None)
            else:
                setattr(s, f, v)
        s.updated_by = user_id
        s.updated_at = _now()
        await db.commit()
        await db.refresh(s)
        return schemas.SecurityResponse.model_validate(s)


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


# ─────────────────────────────────────────────
# Portfólio de Processos (versionado)
# ─────────────────────────────────────────────

# Campos de conteúdo copiados de uma versão para a seguinte (deep-copy) e usados no update.
_PP_ITEM_FIELDS = [
    "nivel", "codigo", "name", "description", "diretoria", "area", "analista", "dono", "order",
    "analista_person_id", "dono_person_id", "area_id",
    "vigencia_inicio", "vigencia_fim", "documentado", "data_documentacao",
    "doc_previsao_inicio", "doc_previsao_fim", "anexos",
    "status_item", "criticidade", "objetivo", "nivel_maturidade",
    "tipo_documento", "versao_documento", "proxima_revisao",
    "link_externo", "frequencia", "entradas", "saidas",
]


_PP_DOC_FIELDS = (
    "documentado", "data_documentacao", "doc_previsao_inicio", "doc_previsao_fim",
    "anexos", "tipo_documento", "versao_documento", "proxima_revisao",
)


_PP_VIGENCIA_FIELDS = ("vigencia_inicio", "vigencia_fim")


class ProcessPortfolioService:
    """Portfólio de processos versionado (Diretoria→Macro→Processo→Sub)."""

    # ── helpers ───────────────────────────────
    @staticmethod
    async def _get_portfolio(db, portfolio_id) -> ProcessPortfolio:
        p = (await db.execute(select(ProcessPortfolio).where(ProcessPortfolio.id == portfolio_id))).scalar_one_or_none()
        if not p:
            raise HTTPException(status_code=404, detail="Portfólio não encontrado.")
        return p

    @staticmethod
    async def _get_version(db, version_id) -> ProcessPortfolioVersion:
        v = (await db.execute(select(ProcessPortfolioVersion).where(ProcessPortfolioVersion.id == version_id))).scalar_one_or_none()
        if not v:
            raise HTTPException(status_code=404, detail="Versão não encontrada.")
        return v

    @staticmethod
    async def _items_of(db, version_id) -> list[ProcessPortfolioItem]:
        return list((await db.execute(
            select(ProcessPortfolioItem)
            .where(ProcessPortfolioItem.version_id == version_id)
            .order_by(ProcessPortfolioItem.order)
        )).scalars().all())

    @classmethod
    async def _clear_item_codigos(cls, db, version_id) -> None:
        """Itens do portfólio não usam código — limpa valores legados."""
        items = await cls._items_of(db, version_id)
        for it in items:
            it.codigo = None

    @staticmethod
    def _strip_doc_fields(payload: dict, nivel: ProcessItemNivel) -> None:
        if _ev(nivel) == "subprocesso":
            return
        payload["documentado"] = False
        for field in _PP_DOC_FIELDS:
            if field == "documentado":
                continue
            payload[field] = None

    @staticmethod
    def _strip_vigencia_fields(payload: dict, nivel: ProcessItemNivel) -> None:
        if _ev(nivel) == "subprocesso":
            return
        payload["vigencia_inicio"] = None
        payload["vigencia_fim"] = None

    @staticmethod
    def _children_map(items: list[ProcessPortfolioItem]) -> dict:
        by_parent: dict = {}
        for it in items:
            by_parent.setdefault(it.parent_id, []).append(it)
        return by_parent

    @staticmethod
    def _collect_subprocesso_items(
        root_id,
        children_by_parent: dict,
    ) -> list[ProcessPortfolioItem]:
        out: list[ProcessPortfolioItem] = []

        def walk(parent_id) -> None:
            for child in children_by_parent.get(parent_id, []):
                if _ev(child.nivel) == "subprocesso":
                    out.append(child)
                else:
                    walk(child.id)

        walk(root_id)
        return out

    @staticmethod
    def _aggregate_vigencia(subprocessos: list[ProcessPortfolioItem]) -> tuple[Optional[date], Optional[date]]:
        starts = [s.vigencia_inicio for s in subprocessos if s.vigencia_inicio]
        ends = [s.vigencia_fim for s in subprocessos if s.vigencia_fim]
        return (min(starts) if starts else None, max(ends) if ends else None)

    @classmethod
    def _apply_vigencia_to_ancestor(
        cls,
        ancestor: ProcessPortfolioItem,
        children_by_parent: dict,
    ) -> None:
        if _ev(ancestor.nivel) == "subprocesso":
            return
        subs = cls._collect_subprocesso_items(ancestor.id, children_by_parent)
        inicio, fim = cls._aggregate_vigencia(subs)
        ancestor.vigencia_inicio = inicio
        ancestor.vigencia_fim = fim

    @classmethod
    async def _recalculate_vigencia_for_ancestors(
        cls,
        db,
        version_id,
        *,
        item_id=None,
        parent_id=None,
    ) -> None:
        items = await cls._items_of(db, version_id)
        if not items:
            return
        items_by_id = {it.id: it for it in items}
        children_by_parent = cls._children_map(items)
        start = parent_id
        if item_id and item_id in items_by_id:
            start = items_by_id[item_id].parent_id
        while start and start in items_by_id:
            ancestor = items_by_id[start]
            if _ev(ancestor.nivel) in ("processo", "macroprocesso"):
                cls._apply_vigencia_to_ancestor(ancestor, children_by_parent)
            start = ancestor.parent_id

    @classmethod
    async def _recalculate_vigencia_all_parents(cls, db, version_id) -> None:
        items = await cls._items_of(db, version_id)
        if not items:
            return
        children_by_parent = cls._children_map(items)
        for it in items:
            if _ev(it.nivel) in ("processo", "macroprocesso"):
                cls._apply_vigencia_to_ancestor(it, children_by_parent)

    @staticmethod
    def _item_to_response(item: ProcessPortfolioItem) -> schemas.ProcessItemResponse:
        return schemas.ProcessItemResponse(
            id=item.id, lineage_id=item.lineage_id, parent_id=item.parent_id,
            nivel=_ev(item.nivel), codigo=item.codigo, name=item.name, description=item.description,
            diretoria=item.diretoria, area=item.area, analista=item.analista, dono=item.dono, order=item.order,
            analista_person_id=item.analista_person_id,
            analista_nome=item.analista or (item.analista_person.full_name if item.analista_person else None),
            dono_person_id=item.dono_person_id,
            dono_nome=item.dono or (item.dono_person.full_name if item.dono_person else None),
            area_id=item.area_id,
            area_nome=item.team_area.name if item.team_area else None,
            vigencia_inicio=item.vigencia_inicio, vigencia_fim=item.vigencia_fim,
            documentado=item.documentado, data_documentacao=item.data_documentacao,
            doc_previsao_inicio=item.doc_previsao_inicio, doc_previsao_fim=item.doc_previsao_fim,
            anexos=item.anexos, status_item=_ev(item.status_item), criticidade=_ev(item.criticidade) if item.criticidade else None,
            objetivo=item.objetivo, nivel_maturidade=_ev(item.nivel_maturidade) if item.nivel_maturidade else None,
            tipo_documento=item.tipo_documento, versao_documento=item.versao_documento,
            proxima_revisao=item.proxima_revisao, link_externo=item.link_externo, frequencia=item.frequencia,
            entradas=item.entradas, saidas=item.saidas, children=[],
        )

    @classmethod
    def _tree(cls, items: list[ProcessPortfolioItem]) -> list[schemas.ProcessItemResponse]:
        by_id = {it.id: cls._item_to_response(it) for it in items}
        roots = []
        for it in items:
            node = by_id[it.id]
            if it.parent_id and it.parent_id in by_id:
                by_id[it.parent_id].children.append(node)
            else:
                roots.append(node)
        return roots

    # ── portfolios ────────────────────────────
    @classmethod
    async def list_portfolios(cls, db) -> list[schemas.ProcessPortfolioResponse]:
        rows = (await db.execute(select(ProcessPortfolio).order_by(ProcessPortfolio.created_at))).scalars().all()
        counts = dict((await db.execute(
            select(ProcessPortfolioVersion.portfolio_id, func.count())
            .group_by(ProcessPortfolioVersion.portfolio_id)
        )).all())
        cur_versions = {}
        cur_ids = [p.current_version_id for p in rows if p.current_version_id]
        if cur_ids:
            for v in (await db.execute(select(ProcessPortfolioVersion).where(ProcessPortfolioVersion.id.in_(cur_ids)))).scalars().all():
                cur_versions[v.id] = v.version
        out = []
        for p in rows:
            out.append(schemas.ProcessPortfolioResponse(
                id=p.id, name=p.name, description=p.description, is_active=p.is_active,
                current_version_id=p.current_version_id,
                current_version=cur_versions.get(p.current_version_id),
                versions_count=counts.get(p.id, 0), created_at=p.created_at,
            ))
        return out

    @classmethod
    async def create_portfolio(cls, db, data: schemas.ProcessPortfolioCreate, user_id) -> schemas.ProcessPortfolioResponse:
        p = ProcessPortfolio(name=data.name.strip(), description=data.description, created_by=user_id)
        db.add(p)
        await db.flush()
        # cria versão 1 (rascunho) vazia
        v = ProcessPortfolioVersion(portfolio_id=p.id, version=1,
                                    status=ProcessPortfolioVersionStatus.RASCUNHO, created_by=user_id)
        db.add(v)
        await db.commit()
        await db.refresh(p)
        return schemas.ProcessPortfolioResponse(
            id=p.id, name=p.name, description=p.description, is_active=p.is_active,
            current_version_id=p.current_version_id, current_version=None, versions_count=1, created_at=p.created_at,
        )

    @classmethod
    async def update_portfolio(cls, db, portfolio_id, data: schemas.ProcessPortfolioUpdate, user_id) -> schemas.ProcessPortfolioResponse:
        p = await cls._get_portfolio(db, portfolio_id)
        updates = data.model_dump(exclude_unset=True)
        if "name" in updates and updates["name"]:
            p.name = updates["name"].strip()
        if "description" in updates:
            p.description = updates["description"]
        if "is_active" in updates and updates["is_active"] is not None:
            p.is_active = updates["is_active"]
            if not updates["is_active"]:
                p.inactivated_by = user_id
                p.inactivated_at = _now()
            else:
                p.inactivated_by = None
                p.inactivated_at = None
        p.updated_by = user_id
        p.updated_at = _now()
        await db.commit()
        count = (await db.execute(
            select(func.count()).where(ProcessPortfolioVersion.portfolio_id == p.id)
        )).scalar_one()
        cur_v = None
        if p.current_version_id:
            cur = (await db.execute(select(ProcessPortfolioVersion).where(
                ProcessPortfolioVersion.id == p.current_version_id))).scalar_one_or_none()
            cur_v = cur.version if cur else None
        return schemas.ProcessPortfolioResponse(
            id=p.id, name=p.name, description=p.description, is_active=p.is_active,
            current_version_id=p.current_version_id, current_version=cur_v,
            versions_count=count, created_at=p.created_at,
        )

    @classmethod
    async def delete_portfolio(cls, db, portfolio_id, user_id) -> None:
        p = await cls._get_portfolio(db, portfolio_id)
        # zera o ponteiro p/ versão vigente antes do cascade (FK use_alter no current_version_id)
        p.current_version_id = None
        await db.flush()
        await db.delete(p)  # cascade remove versões, itens e vínculos
        await db.commit()

    # ── versions ──────────────────────────────
    @classmethod
    async def list_versions(cls, db, portfolio_id) -> list[schemas.ProcessVersionSummary]:
        await cls._get_portfolio(db, portfolio_id)
        rows = (await db.execute(
            select(ProcessPortfolioVersion)
            .where(ProcessPortfolioVersion.portfolio_id == portfolio_id)
            .order_by(ProcessPortfolioVersion.version.desc())
        )).scalars().all()
        return [schemas.ProcessVersionSummary.model_validate(v) for v in rows]

    @classmethod
    async def get_version_tree(cls, db, version_id) -> schemas.ProcessVersionTree:
        v = await cls._get_version(db, version_id)
        items = await cls._items_of(db, version_id)
        for it in items:
            it.codigo = None
        return schemas.ProcessVersionTree(
            id=v.id, portfolio_id=v.portfolio_id, version=v.version, status=_ev(v.status),
            justification=v.justification, consolidated_at=v.consolidated_at, created_at=v.created_at,
            editable=v.status == ProcessPortfolioVersionStatus.RASCUNHO, items=cls._tree(items),
        )

    @classmethod
    async def get_current_tree(cls, db, portfolio_id) -> schemas.ProcessVersionTree:
        p = await cls._get_portfolio(db, portfolio_id)
        target_id = p.current_version_id
        if not target_id:
            # sem consolidada: mostra a última versão (rascunho inicial)
            last = (await db.execute(
                select(ProcessPortfolioVersion)
                .where(ProcessPortfolioVersion.portfolio_id == portfolio_id)
                .order_by(ProcessPortfolioVersion.version.desc())
            )).scalars().first()
            if not last:
                raise HTTPException(status_code=404, detail="Portfólio sem versões.")
            target_id = last.id
        return await cls.get_version_tree(db, target_id)

    @classmethod
    async def create_version(cls, db, portfolio_id, data: schemas.CreateVersionRequest, user_id) -> schemas.ProcessVersionTree:
        """Cria nova versão rascunho a partir da versão consolidada (deep-copy preservando lineage_id)."""
        p = await cls._get_portfolio(db, portfolio_id)
        # impede 2 rascunhos abertos ao mesmo tempo
        open_draft = (await db.execute(
            select(ProcessPortfolioVersion).where(
                ProcessPortfolioVersion.portfolio_id == portfolio_id,
                ProcessPortfolioVersion.status == ProcessPortfolioVersionStatus.RASCUNHO,
            )
        )).scalars().first()
        if open_draft:
            raise HTTPException(status_code=409, detail="Já existe uma versão em rascunho. Consolide-a antes de criar outra.")
        max_v = (await db.execute(
            select(func.coalesce(func.max(ProcessPortfolioVersion.version), 0))
            .where(ProcessPortfolioVersion.portfolio_id == portfolio_id)
        )).scalar_one()
        new_v = ProcessPortfolioVersion(
            portfolio_id=portfolio_id, version=max_v + 1, status=ProcessPortfolioVersionStatus.RASCUNHO,
            justification=data.justification.strip(), created_by=user_id,
        )
        db.add(new_v)
        await db.flush()
        # deep-copy itens da versão consolidada (se houver)
        if p.current_version_id:
            src_items = await cls._items_of(db, p.current_version_id)
            id_map: dict = {}
            new_items: list[ProcessPortfolioItem] = []
            for it in src_items:
                clone = ProcessPortfolioItem(
                    version_id=new_v.id, lineage_id=it.lineage_id, created_by=user_id,
                    **{f: getattr(it, f) for f in _PP_ITEM_FIELDS},
                )
                db.add(clone)
                await db.flush()
                id_map[it.id] = clone
                new_items.append((it, clone))
            for old, clone in new_items:
                if old.parent_id and old.parent_id in id_map:
                    clone.parent_id = id_map[old.parent_id].id
            await cls._clear_item_codigos(db, new_v.id)
            await cls._recalculate_vigencia_all_parents(db, new_v.id)
        await db.commit()
        return await cls.get_version_tree(db, new_v.id)

    @classmethod
    async def consolidate_version(cls, db, version_id, user_id) -> schemas.ProcessVersionTree:
        v = await cls._get_version(db, version_id)
        if v.status != ProcessPortfolioVersionStatus.RASCUNHO:
            raise HTTPException(status_code=400, detail="Apenas versões em rascunho podem ser consolidadas.")
        p = await cls._get_portfolio(db, v.portfolio_id)
        # arquiva a consolidada anterior
        if p.current_version_id and p.current_version_id != v.id:
            prev = await cls._get_version(db, p.current_version_id)
            prev.status = ProcessPortfolioVersionStatus.ARQUIVADA
        v.status = ProcessPortfolioVersionStatus.CONSOLIDADA
        v.consolidated_by = user_id
        v.consolidated_at = _now()
        p.current_version_id = v.id
        p.updated_by = user_id
        p.updated_at = _now()
        await cls._clear_item_codigos(db, version_id)
        await db.commit()
        return await cls.get_version_tree(db, v.id)

    # ── items (somente em versão rascunho) ────
    @classmethod
    async def _assert_editable(cls, db, version_id) -> ProcessPortfolioVersion:
        v = await cls._get_version(db, version_id)
        if v.status != ProcessPortfolioVersionStatus.RASCUNHO:
            raise HTTPException(status_code=400, detail="Esta versão está consolidada e não pode ser editada. Crie uma nova versão.")
        return v

    @classmethod
    async def create_item(cls, db, version_id, data: schemas.ProcessItemCreate, user_id) -> schemas.ProcessItemResponse:
        await cls._assert_editable(db, version_id)
        if data.parent_id is not None:
            parent = (await db.execute(select(ProcessPortfolioItem).where(
                ProcessPortfolioItem.id == data.parent_id, ProcessPortfolioItem.version_id == version_id,
            ))).scalar_one_or_none()
            if not parent:
                raise HTTPException(status_code=400, detail="Pai inválido.")
        order = data.order
        if order is None:
            order = (await db.execute(
                select(func.coalesce(func.max(ProcessPortfolioItem.order), -1))
                .where(ProcessPortfolioItem.version_id == version_id, ProcessPortfolioItem.parent_id == data.parent_id)
            )).scalar_one() + 1
        payload = data.model_dump(exclude_unset=True)
        payload.pop("codigo", None)
        if payload.get("area") is not None:
            payload["area_id"] = None
        if payload.get("analista") is not None:
            payload["analista_person_id"] = None
        if payload.get("dono") is not None:
            payload["dono_person_id"] = None
        if payload.get("anexos") is not None:
            payload["anexos"] = [a.model_dump() if hasattr(a, "model_dump") else a for a in (data.anexos or [])]
        payload["order"] = order
        payload["nivel"] = ProcessItemNivel(data.nivel)
        cls._strip_doc_fields(payload, payload["nivel"])
        cls._strip_vigencia_fields(payload, payload["nivel"])
        item = ProcessPortfolioItem(version_id=version_id, created_by=user_id, **payload)
        db.add(item)
        await db.flush()
        await cls._clear_item_codigos(db, version_id)
        if _ev(item.nivel) == "subprocesso":
            await cls._recalculate_vigencia_for_ancestors(db, version_id, item_id=item.id)
        await db.commit()
        await db.refresh(item)
        return cls._item_to_response(item)

    @classmethod
    async def update_item(cls, db, version_id, item_id, data: schemas.ProcessItemUpdate, user_id) -> schemas.ProcessItemResponse:
        await cls._assert_editable(db, version_id)
        item = (await db.execute(select(ProcessPortfolioItem).where(
            ProcessPortfolioItem.id == item_id, ProcessPortfolioItem.version_id == version_id,
        ))).scalar_one_or_none()
        if not item:
            raise HTTPException(status_code=404, detail="Item não encontrado.")
        updates = data.model_dump(exclude_unset=True)
        updates.pop("codigo", None)
        if "area" in updates:
            updates["area_id"] = None
        if "analista" in updates:
            updates["analista_person_id"] = None
        if "dono" in updates:
            updates["dono_person_id"] = None
        if "anexos" in updates and data.anexos is not None:
            updates["anexos"] = [a.model_dump() if hasattr(a, "model_dump") else a for a in data.anexos]
        doc_patch = {k: updates[k] for k in _PP_DOC_FIELDS if k in updates}
        if doc_patch and _ev(item.nivel) != "subprocesso":
            raise HTTPException(
                status_code=400,
                detail="Documentação só pode ser gerenciada em sub processos.",
            )
        vig_patch = {k: updates[k] for k in _PP_VIGENCIA_FIELDS if k in updates}
        if vig_patch and _ev(item.nivel) != "subprocesso":
            raise HTTPException(
                status_code=400,
                detail="Vigência só pode ser gerenciada em sub processos.",
            )
        for k, v in updates.items():
            setattr(item, k, v.strip() if isinstance(v, str) and k == "name" else v)
        item.updated_by = user_id
        item.updated_at = _now()
        if _ev(item.nivel) == "subprocesso":
            await cls._recalculate_vigencia_for_ancestors(db, version_id, item_id=item.id)
        await db.commit()
        await db.refresh(item)
        return cls._item_to_response(item)

    @classmethod
    async def delete_item(cls, db, version_id, item_id, user_id) -> None:
        await cls._assert_editable(db, version_id)
        item = (await db.execute(select(ProcessPortfolioItem).where(
            ProcessPortfolioItem.id == item_id, ProcessPortfolioItem.version_id == version_id,
        ))).scalar_one_or_none()
        if not item:
            raise HTTPException(status_code=404, detail="Item não encontrado.")
        parent_id = item.parent_id
        await db.delete(item)  # cascade remove descendentes
        await db.flush()
        await cls._clear_item_codigos(db, version_id)
        await cls._recalculate_vigencia_for_ancestors(db, version_id, parent_id=parent_id)
        await db.commit()

    @classmethod
    async def reorder_items(cls, db, version_id, data: schemas.ProcessItemReorderRequest, user_id) -> schemas.ProcessVersionTree:
        """Reordena itens de uma versão rascunho (somente o campo `order`). Tipicamente recebe
        os irmãos de um mesmo pai com novos índices, mas aceita qualquer subconjunto da versão."""
        await cls._assert_editable(db, version_id)
        if data.items:
            ids = [e.id for e in data.items]
            current = {x.id: x for x in (await db.execute(select(ProcessPortfolioItem).where(
                ProcessPortfolioItem.id.in_(ids), ProcessPortfolioItem.version_id == version_id,
            ))).scalars().all()}
            for e in data.items:
                it = current.get(e.id)
                if it is not None:
                    it.order = e.order
                    it.updated_by = user_id
                    it.updated_at = _now()
            await cls._clear_item_codigos(db, version_id)
            await db.commit()
        return await cls.get_version_tree(db, version_id)

    # ── vínculo serviço ↔ sub-processo ────────
    @classmethod
    async def list_service_links(cls, db, servico_id) -> list[schemas.ServiceLinkItem]:
        links = (await db.execute(select(ProcessServiceLink).where(
            ProcessServiceLink.servico_id == servico_id, ProcessServiceLink.is_active.is_(True),
        ))).scalars().all()
        if not links:
            return []
        lineage_ids = [lk.item_lineage_id for lk in links]
        # resolve nome via item da versão consolidada de cada portfólio
        portfolios = {p.id: p for p in (await db.execute(
            select(ProcessPortfolio).where(ProcessPortfolio.id.in_([lk.portfolio_id for lk in links]))
        )).scalars().all()}
        cur_ids = [p.current_version_id for p in portfolios.values() if p.current_version_id]
        items_by_lineage: dict = {}
        if cur_ids:
            for it in (await db.execute(select(ProcessPortfolioItem).where(
                ProcessPortfolioItem.version_id.in_(cur_ids), ProcessPortfolioItem.lineage_id.in_(lineage_ids),
            ))).scalars().all():
                items_by_lineage[it.lineage_id] = it
        out = []
        for lk in links:
            it = items_by_lineage.get(lk.item_lineage_id)
            out.append(schemas.ServiceLinkItem(
                item_lineage_id=lk.item_lineage_id, portfolio_id=lk.portfolio_id,
                name=it.name if it else None, codigo=it.codigo if it else None,
            ))
        return out

    @classmethod
    async def set_service_links(cls, db, servico_id, data: schemas.ServiceLinkSetRequest, user_id) -> list[schemas.ServiceLinkItem]:
        # garante que o serviço existe
        svc = (await db.execute(select(ProductServico).where(ProductServico.id == servico_id))).scalar_one_or_none()
        if not svc:
            raise HTTPException(status_code=404, detail="Serviço não encontrado.")
        await cls._get_portfolio(db, data.portfolio_id)
        # remove vínculos atuais deste portfólio para o serviço e recria
        existing = (await db.execute(select(ProcessServiceLink).where(
            ProcessServiceLink.servico_id == servico_id, ProcessServiceLink.portfolio_id == data.portfolio_id,
        ))).scalars().all()
        for lk in existing:
            await db.delete(lk)
        await db.flush()
        for lineage_id in set(data.item_lineage_ids):
            db.add(ProcessServiceLink(
                servico_id=servico_id, portfolio_id=data.portfolio_id,
                item_lineage_id=lineage_id, created_by=user_id,
            ))
        await db.commit()
        return await cls.list_service_links(db, servico_id)
