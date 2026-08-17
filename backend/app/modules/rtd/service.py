"""Serviço do módulo RTD (Reunião de Tomada de Decisão) — Parte 1.

Persiste a reunião (competência/período) e suas deliberações; monta o relatório da
cerimônia reaproveitando os agregados já existentes de Projetos, Indicadores e Produtos.
As seções sem dado no sistema (orçamento, ROI, chamados, satisfação, benefícios) voltam
sinalizadas como "em desenvolvimento" — ver ROADMAP.md.
"""

import calendar
import uuid
from datetime import date, datetime, time
from types import SimpleNamespace
from typing import Optional

from fastapi import HTTPException
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.modules.rtd import models, schemas

_MESES = ["", "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
          "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"]

# Granularidade do indicador → nº de períodos no ano (espelho do módulo Indicadores).
_GRAN_PERIODOS = {"mensal": 12, "bimestral": 6, "trimestral": 4, "semestral": 2, "anual": 1}
# Banda morta da tendência: |Δ atingimento| menor que isso conta como "estável".
_TENDENCIA_BANDA_PP = 2.0


class RtdService:
    # ── Competência → período ──
    @staticmethod
    def _mes_periodo(ano: int, mes: int) -> tuple[date, date]:
        last = calendar.monthrange(ano, mes)[1]
        return date(ano, mes, 1), date(ano, mes, last)

    @classmethod
    def _competencia_periodo(cls, tipo: str, ano: int, ordem: int) -> tuple[str, date, date]:
        """Retorna (rótulo, período_início, período_fim) a partir da competência."""
        if tipo == "mensal":
            inicio, fim = cls._mes_periodo(ano, ordem)
            return f"{_MESES[ordem]}/{ano}", inicio, fim
        # trimestral
        m0 = (ordem - 1) * 3 + 1
        inicio, _ = cls._mes_periodo(ano, m0)
        _, fim = cls._mes_periodo(ano, m0 + 2)
        return f"{ordem}º trimestre/{ano}", inicio, fim

    @classmethod
    def _proximo_periodo(cls, tipo: str, ano: int, ordem: int) -> tuple[date, date]:
        """Janela do PRÓXIMO ciclo (para 'entregas previstas')."""
        limite = 12 if tipo == "mensal" else 4
        if ordem < limite:
            n_ano, n_ordem = ano, ordem + 1
        else:
            n_ano, n_ordem = ano + 1, 1
        _, inicio, fim = cls._competencia_periodo(tipo, n_ano, n_ordem)
        return inicio, fim

    @staticmethod
    def _validate_ordem(tipo: str, ordem: int) -> None:
        limite = 12 if tipo == "mensal" else 4
        if not (1 <= ordem <= limite):
            raise ValueError(
                f"ordem inválida para competência {tipo}: deve ser 1..{limite}"
            )

    # ── Serialização ──
    @staticmethod
    def _reuniao_out(r: models.RtdReuniao, total_delib: int = 0) -> schemas.ReuniaoOut:
        return schemas.ReuniaoOut(
            id=r.id, titulo=r.titulo, tipo_competencia=r.tipo_competencia.value,
            ano_referencia=r.ano_referencia, ordem=r.ordem, competencia=r.competencia,
            periodo_inicio=r.periodo_inicio, periodo_fim=r.periodo_fim,
            status=r.status.value, data_realizacao=r.data_realizacao,
            observacoes=r.observacoes, epa_planos=r.epa_planos,
            epa_planos_taticos=r.epa_planos_taticos,
            total_deliberacoes=total_delib,
            created_at=r.created_at,
        )

    # ── CRUD Reunião ──
    @classmethod
    async def list_reunioes(cls, db: AsyncSession) -> list[schemas.ReuniaoOut]:
        res = await db.execute(select(models.RtdReuniao))
        reunioes = list(res.scalars().all())
        counts = dict(
            (rid, n) for rid, n in (
                await db.execute(
                    select(models.RtdDeliberacao.reuniao_id, func.count())
                    .group_by(models.RtdDeliberacao.reuniao_id)
                )
            ).all()
        )
        reunioes.sort(key=lambda r: (r.ano_referencia, r.ordem, r.created_at), reverse=True)
        return [cls._reuniao_out(r, counts.get(r.id, 0)) for r in reunioes]

    @classmethod
    async def get_reuniao(cls, db: AsyncSession, reuniao_id: uuid.UUID) -> Optional[models.RtdReuniao]:
        res = await db.execute(
            select(models.RtdReuniao).where(models.RtdReuniao.id == reuniao_id)
        )
        return res.scalar_one_or_none()

    @classmethod
    async def create_reuniao(
        cls, db: AsyncSession, data: schemas.ReuniaoCreate, user_id: uuid.UUID,
    ) -> schemas.ReuniaoOut:
        cls._validate_ordem(data.tipo_competencia, data.ordem)
        competencia, inicio, fim = cls._competencia_periodo(
            data.tipo_competencia, data.ano_referencia, data.ordem
        )
        r = models.RtdReuniao(
            titulo=data.titulo,
            tipo_competencia=models.TipoCompetencia(data.tipo_competencia),
            ano_referencia=data.ano_referencia, ordem=data.ordem,
            competencia=competencia, periodo_inicio=inicio, periodo_fim=fim,
            observacoes=data.observacoes, data_realizacao=data.data_realizacao,
            created_by=user_id,
        )
        db.add(r)
        await db.commit()
        await db.refresh(r)
        return cls._reuniao_out(r, 0)

    @classmethod
    async def update_reuniao(
        cls, db: AsyncSession, reuniao_id: uuid.UUID, data: schemas.ReuniaoUpdate, user_id: uuid.UUID,
    ) -> Optional[schemas.ReuniaoOut]:
        r = await cls.get_reuniao(db, reuniao_id)
        if r is None:
            return None
        # Transição para "fechada" congela a FOTO da Seção 1 (detectar ANTES de aplicar).
        fechando = (
            data.status == "fechada" and r.status != models.ReuniaoStatus.FECHADA
        )
        if data.titulo is not None:
            r.titulo = data.titulo
        if data.status is not None:
            r.status = models.ReuniaoStatus(data.status)
        if data.observacoes is not None:
            r.observacoes = data.observacoes
        if data.data_realizacao is not None:
            r.data_realizacao = data.data_realizacao
        if data.epa_planos is not None:
            r.epa_planos = data.epa_planos
        if data.epa_planos_taticos is not None:
            r.epa_planos_taticos = data.epa_planos_taticos
        if fechando:
            # _indicadores_detalhe é read-only e engole exceções (→ None): um problema
            # no módulo Indicadores nunca impede o fechamento da reunião.
            detalhe = await cls._indicadores_detalhe(db, r)
            # Congela também os Planos do EPA (erro externo não impede fechar).
            planos_epa = planos_epa_taticos = None
            try:
                planos_epa = await cls._planos_epa_live(r, "estrategico")
                planos_epa_taticos = await cls._planos_epa_live(r, "tatico")
            except Exception:  # noqa: BLE001
                pass
            r.snapshot_indicadores = {
                "generated_at": datetime.utcnow().isoformat(),
                "indicadores_detalhe": detalhe,
                "planos_epa": planos_epa,
                "planos_epa_taticos": planos_epa_taticos,
            }
        r.updated_by = user_id
        r.updated_at = datetime.utcnow()
        await db.commit()
        await db.refresh(r)
        n = await db.scalar(
            select(func.count()).select_from(models.RtdDeliberacao)
            .where(models.RtdDeliberacao.reuniao_id == r.id)
        )
        return cls._reuniao_out(r, n or 0)

    @classmethod
    async def delete_reuniao(cls, db: AsyncSession, reuniao_id: uuid.UUID) -> bool:
        r = await cls.get_reuniao(db, reuniao_id)
        if r is None:
            return False
        await db.delete(r)
        await db.commit()
        return True

    # ── CRUD Deliberação ──
    @classmethod
    async def _resolve_names(cls, db: AsyncSession, delibs: list[models.RtdDeliberacao]) -> tuple[dict, dict]:
        from app.modules.projetos.models import ProjectTask
        from app.modules.teamops.models import Person
        task_ids = {d.project_task_id for d in delibs if d.project_task_id}
        person_ids = {d.responsavel_person_id for d in delibs if d.responsavel_person_id}
        proj_map: dict = {}
        pers_map: dict = {}
        if task_ids:
            rows = await db.execute(
                select(ProjectTask.id, ProjectTask.title).where(ProjectTask.id.in_(task_ids))
            )
            proj_map = {tid: title for tid, title in rows.all()}
        if person_ids:
            rows = await db.execute(
                select(Person.id, Person.full_name).where(Person.id.in_(person_ids))
            )
            pers_map = {pid: name for pid, name in rows.all()}
        return proj_map, pers_map

    @classmethod
    def _delib_out(cls, d: models.RtdDeliberacao, proj_map: dict, pers_map: dict) -> schemas.DeliberacaoOut:
        return schemas.DeliberacaoOut(
            id=d.id, reuniao_id=d.reuniao_id, project_task_id=d.project_task_id,
            projeto_titulo=proj_map.get(d.project_task_id) if d.project_task_id else None,
            tipo=d.tipo.value, titulo=d.titulo, descricao=d.descricao,
            responsavel_person_id=d.responsavel_person_id,
            responsavel_nome=pers_map.get(d.responsavel_person_id) if d.responsavel_person_id else None,
            prazo=d.prazo, status=d.status.value, created_at=d.created_at,
        )

    @classmethod
    async def list_deliberacoes(cls, db: AsyncSession, reuniao_id: uuid.UUID) -> list[schemas.DeliberacaoOut]:
        res = await db.execute(
            select(models.RtdDeliberacao)
            .where(models.RtdDeliberacao.reuniao_id == reuniao_id)
            .order_by(models.RtdDeliberacao.created_at)
        )
        delibs = list(res.scalars().all())
        proj_map, pers_map = await cls._resolve_names(db, delibs)
        return [cls._delib_out(d, proj_map, pers_map) for d in delibs]

    @classmethod
    async def create_deliberacao(
        cls, db: AsyncSession, reuniao_id: uuid.UUID, data: schemas.DeliberacaoCreate, user_id: uuid.UUID,
    ) -> schemas.DeliberacaoOut:
        d = models.RtdDeliberacao(
            reuniao_id=reuniao_id,
            project_task_id=data.project_task_id,
            tipo=models.DeliberacaoTipo(data.tipo),
            titulo=data.titulo, descricao=data.descricao,
            responsavel_person_id=data.responsavel_person_id,
            prazo=data.prazo, status=models.DeliberacaoStatus(data.status),
            created_by=user_id,
        )
        db.add(d)
        await db.commit()
        await db.refresh(d)
        proj_map, pers_map = await cls._resolve_names(db, [d])
        return cls._delib_out(d, proj_map, pers_map)

    @classmethod
    async def update_deliberacao(
        cls, db: AsyncSession, delib_id: uuid.UUID, data: schemas.DeliberacaoUpdate, user_id: uuid.UUID,
    ) -> Optional[schemas.DeliberacaoOut]:
        res = await db.execute(
            select(models.RtdDeliberacao).where(models.RtdDeliberacao.id == delib_id)
        )
        d = res.scalar_one_or_none()
        if d is None:
            return None
        if data.tipo is not None:
            d.tipo = models.DeliberacaoTipo(data.tipo)
        if data.titulo is not None:
            d.titulo = data.titulo
        if data.descricao is not None:
            d.descricao = data.descricao
        if data.project_task_id is not None:
            d.project_task_id = data.project_task_id
        if data.responsavel_person_id is not None:
            d.responsavel_person_id = data.responsavel_person_id
        if data.prazo is not None:
            d.prazo = data.prazo
        if data.status is not None:
            d.status = models.DeliberacaoStatus(data.status)
        d.updated_by = user_id
        d.updated_at = datetime.utcnow()
        await db.commit()
        await db.refresh(d)
        proj_map, pers_map = await cls._resolve_names(db, [d])
        return cls._delib_out(d, proj_map, pers_map)

    @classmethod
    async def delete_deliberacao(cls, db: AsyncSession, delib_id: uuid.UUID) -> bool:
        res = await db.execute(
            select(models.RtdDeliberacao).where(models.RtdDeliberacao.id == delib_id)
        )
        d = res.scalar_one_or_none()
        if d is None:
            return False
        await db.delete(d)
        await db.commit()
        return True

    # ── Seção 1: Acompanhamento dos Indicadores ──
    @staticmethod
    def _ordem_alvo(n_periodos: int, mes: int) -> int:
        """Ordem do período do indicador que contém o mês (1..12)."""
        return (mes - 1) // (12 // n_periodos) + 1

    @staticmethod
    def _tendencia(sentido: Optional[str], serie: list[dict], idx_atual: int) -> dict:
        """Tendência do período vs o último anterior preenchido.

        Compara `percentual_atingimento` (já embute a polaridade via calc_status —
        subiu = melhorou nos três sentidos, mesmo com meta variável). Fallback: delta
        de `realizado` sinalizado pelo `sentido`; faixa_ideal sem pct → indefinida."""
        vazio = {"direcao": None, "variacao": None, "base": None}
        if idx_atual < 0 or idx_atual >= len(serie):
            return vazio
        atual = serie[idx_atual]
        if atual.get("realizado") is None:
            return vazio
        anterior = next(
            (p for p in reversed(serie[:idx_atual]) if p.get("realizado") is not None),
            None,
        )
        if anterior is None:
            return vazio

        pa, pb = atual.get("percentual_atingimento"), anterior.get("percentual_atingimento")
        if pa is not None and pb is not None:
            delta = round(pa - pb, 2)
            if abs(delta) < _TENDENCIA_BANDA_PP:
                return {"direcao": "estavel", "variacao": delta, "base": "percentual"}
            return {
                "direcao": "melhorando" if delta > 0 else "piorando",
                "variacao": delta, "base": "percentual",
            }

        if sentido == "faixa_ideal":
            return vazio
        delta = round(float(atual["realizado"]) - float(anterior["realizado"]), 2)
        melhor = delta > 0 if sentido == "maior_melhor" else delta < 0
        if delta == 0:
            direcao = "estavel"
        else:
            direcao = "melhorando" if melhor else "piorando"
        return {"direcao": direcao, "variacao": delta, "base": "realizado"}

    @staticmethod
    def _periodo_bounds(ano: int, n: int, ordem: int) -> tuple[date, date]:
        """(início, fim) do período `ordem` para um indicador com n períodos/ano."""
        mp = 12 // n
        m0 = (ordem - 1) * mp + 1
        m1 = m0 + mp - 1
        return date(ano, m0, 1), date(ano, m1, calendar.monthrange(ano, m1)[1])

    @staticmethod
    def _entregas_periodo(
        metrica_valor: Optional[str], ds, evid_serv, evid_doc,
        alvo_cls: Optional[str], inicio: date, fim: date, limite: int = 8,
    ) -> Optional[list[str]]:
        """Evidências do período para o tooltip do gráfico: o que foi ENTREGUE naquele
        mês (serviços publicados, documentos, entregas de projeto, US concluídas) —
        espelho das evidências do módulo de Indicadores. None quando a métrica não tem
        essa semântica. Lista limitada; excedente vira '… e mais N'."""
        from app.modules.indicadores.portfolio_projetos import _d

        def dentro(dt) -> bool:
            d = _d(dt)
            return d is not None and inicio <= d <= fim

        itens: list[str] = []
        if metrica_valor == "servicos_publicados" and evid_serv is not None:
            itens = [f"{s} — {p}" for s, d, p in evid_serv if dentro(d)]
        elif metrica_valor == "documentos_natos_digitais" and evid_doc is not None:
            itens = [f"{s} — {p}" for s, d, p in evid_doc if dentro(d)]
        elif metrica_valor and metrica_valor.startswith("cronograma_") and ds is not None:
            for root in ds.roots:
                if root.planning_kind != "projeto" or root.card_classification != alvo_cls \
                        or root.id in ds.cancelled_ids:
                    continue
                for tid in ds.subtree_by_root.get(root.id, []):
                    if tid == root.id or tid in ds.cancelled_ids:
                        continue
                    t = ds.by_id[tid]
                    if not dentro(t.completed_at):
                        continue
                    if t.due_date is not None:
                        atraso = (_d(t.completed_at) - _d(t.due_date)).days
                        marca = "no prazo" if atraso <= 0 else f"+{atraso}d"
                    else:
                        marca = "sem baseline"
                    itens.append(f"{t.title} ({marca})")
        elif metrica_valor == "lead_time_us" and ds is not None:
            for t in ds.tasks:
                if t.id in ds.us_ids and t.id not in ds.cancelled_ids and dentro(t.completed_at):
                    itens.append(t.title)
        else:
            return None

        if not itens:
            return []
        if len(itens) > limite:
            resto = len(itens) - limite
            return itens[:limite] + [f"… e mais {resto}"]
        return itens

    @staticmethod
    def _tendencia_futura(
        sentido: Optional[str], unidade: Optional[str], serie: list[dict], ordem_alvo: int, n: int,
    ) -> Optional[dict]:
        """Tendência para o PRÓXIMO período: extrapolação do ritmo recente (Δ médio dos
        últimos até 3 realizados). Cenário 'mantido o ritmo' — complementa a projeção de
        melhor cenário. None sem histórico suficiente ou no último período do ano."""
        if ordem_alvo >= n:
            return None
        vals = [p for p in serie if p["ordem"] <= ordem_alvo and p.get("realizado") is not None][-3:]
        if len(vals) < 2:
            return None
        deltas = [
            float(vals[i]["realizado"]) - float(vals[i - 1]["realizado"])
            for i in range(1, len(vals))
        ]
        slope = sum(deltas) / len(deltas)
        estimado = float(vals[-1]["realizado"]) + slope
        eh_pct = (unidade or "").strip() == "%"
        estimado = max(0.0, min(estimado, 100.0) if eh_pct else estimado)
        estimado = round(estimado, 2)
        slope = round(slope, 2)

        prox = next((p for p in serie if p["ordem"] == ordem_alvo + 1), None)
        comp = prox.get("competencia") if prox else "próximo período"
        meta_prox = prox.get("meta") if prox else None

        banda = 2.0 if eh_pct else 0.5
        if sentido == "faixa_ideal" or abs(slope) < banda:
            direcao = "estavel"
        else:
            melhor = slope > 0 if sentido == "maior_melhor" else slope < 0
            direcao = "melhorando" if melhor else "piorando"

        atinge_meta = None
        if isinstance(meta_prox, (int, float)) and sentido in ("maior_melhor", "menor_melhor"):
            atinge_meta = estimado >= meta_prox if sentido == "maior_melhor" else estimado <= meta_prox

        unid = "%" if eh_pct else (f" {unidade}" if unidade else "")
        texto = (
            f"Mantido o ritmo recente (Δ médio {slope:+g}{unid}/período), "
            f"{comp} tende a ~{estimado:g}{unid}"
        )
        if atinge_meta is not None:
            texto += f" — {'alcança' if atinge_meta else 'NÃO alcança'} a meta ({meta_prox:g}{unid})."
        else:
            texto += "."
        return {
            "competencia": comp, "estimado": estimado, "delta_medio": slope,
            "direcao": direcao, "atinge_meta": atinge_meta, "texto": texto,
        }

    @classmethod
    def _projecao(
        cls, ds, metrica_valor: Optional[str], ano: int, n: int, ordem_alvo: int, serie: list[dict],
    ) -> Optional[dict]:
        """Projeção do PRÓXIMO período no melhor cenário ("se entregarmos tudo que está
        planejado"). Calculável só para métricas automáticas de Projetos; None caso
        contrário (manual/estratégico/último período do ano)."""
        if not metrica_valor or ds is None or not n:
            return None
        prox_ordem = ordem_alvo + 1
        if prox_ordem > n:
            return None
        months_per = 12 // n
        m0 = (prox_ordem - 1) * months_per + 1
        m1 = m0 + months_per - 1
        inicio = date(ano, m0, 1)
        fim = date(ano, m1, calendar.monthrange(ano, m1)[1])
        prox = next((p for p in serie if p["ordem"] == prox_ordem), None)
        comp = prox.get("competencia") if prox else f"{m0:02d}/{ano}"
        meta_prox = prox.get("meta") if prox else None
        meta_txt = f" (meta {meta_prox:g})" if isinstance(meta_prox, (int, float)) else ""

        from app.modules.indicadores.portfolio_projetos import _d

        def no_prox(dt) -> bool:
            d = _d(dt)
            return d is not None and inicio <= d <= fim

        if metrica_valor.startswith("cronograma_"):
            alvo = "desenvolvimento" if metrica_valor.endswith("desenvolvimento") else "implantacao"
            nitens = 0
            for root in ds.roots:
                if root.planning_kind != "projeto" or root.card_classification != alvo \
                        or root.id in ds.cancelled_ids:
                    continue
                for tid in ds.subtree_by_root.get(root.id, []):
                    if tid == root.id or tid in ds.cancelled_ids:
                        continue
                    if no_prox(ds.by_id[tid].due_date):
                        nitens += 1
            if nitens == 0:
                return {"competencia": comp, "valor": None,
                        "texto": f"Sem entregas com prazo planejado para {comp} — registrar prazos para projetar."}
            return {"competencia": comp, "valor": 100.0,
                    "texto": f"Entregando no prazo as {nitens} entregas planejadas para {comp}, "
                             f"o indicador fecha em 100%{meta_txt}."}

        if metrica_valor.startswith("desvio_trabalho_"):
            return {"competencia": comp, "valor": 0.0,
                    "texto": f"Sem escopo novo após o comprometimento do cronograma em {comp}, "
                             f"o desvio fica em 0%{meta_txt}."}

        if metrica_valor == "pct_sla_estourado":
            ativas = [
                t for t in ds.tasks
                if t.id in ds.us_ids and t.completed_at is None
                and t.id not in ds.cancelled_ids and t.status_id not in ds.final_status_ids
            ]
            estouradas = sum(1 for t in ativas if t.sla_state == "breached")
            return {"competencia": comp, "valor": 0.0,
                    "texto": f"Tratando as {estouradas} US com SLA estourado (e sem estourar novas), "
                             f"o indicador vai a 0% em {comp}{meta_txt}."}

        if metrica_valor == "taxa_impedimento":
            impedidas = sum(
                1 for t in ds.tasks
                if t.id in ds.us_ids and t.completed_at is None and t.id in ds.impedimento_ids
            )
            return {"competencia": comp, "valor": 0.0,
                    "texto": f"Destravando as {impedidas} US em impedimento, o indicador vai a 0% "
                             f"em {comp}{meta_txt}."}

        if metrica_valor in ("pct_desenvolvimento", "pct_projetos_ia"):
            atual = next(
                (p.get("realizado") for p in reversed(serie)
                 if p["ordem"] <= ordem_alvo and p.get("realizado") is not None),
                None,
            )
            if atual is None:
                return None
            return {"competencia": comp, "valor": float(atual),
                    "texto": f"Mantida a carteira atual (sem novos projetos classificados), "
                             f"{comp} permanece em ~{atual:g}%{meta_txt}."}

        return None  # tempo_analise/lead_time dependem de demanda futura; manual/estratégico sem base

    @classmethod
    async def _indicadores_detalhe(
        cls, db: AsyncSession, reuniao: models.RtdReuniao,
    ) -> Optional[list[dict]]:
        """Seção 1 da pauta: para cada indicador (estratégico e tático), o resultado do
        período da reunião, comparativo com a meta, tendência, mini-série e a análise
        qualitativa persistida nesta reunião. None se o módulo Indicadores não responder.
        Retorno 100% JSON-serializável (é também o contrato do snapshot congelado).
        Análises de indicadores removidos/inativados ficam órfãs (não aparecem)."""
        try:
            from app.modules.indicadores.service import IndicadorService
            charts = await IndicadorService.dashboard_graficos(db, ano=reuniao.ano_referencia)
        except Exception:  # noqa: BLE001 — módulo indicadores pode não estar ativo
            return None

        # Análises da reunião + nomes de responsáveis (batch).
        res = await db.execute(
            select(models.RtdIndicadorAnalise)
            .where(models.RtdIndicadorAnalise.reuniao_id == reuniao.id)
        )
        analises = {a.indicador_id: a for a in res.scalars().all()}
        pers_map: dict = {}
        person_ids = {a.responsavel_person_id for a in analises.values() if a.responsavel_person_id}
        for a in analises.values():
            for item in (a.acoes or []):
                if item.get("responsavel_person_id"):
                    person_ids.add(uuid.UUID(item["responsavel_person_id"]))
        if person_ids:
            from app.modules.teamops.models import Person
            rows = await db.execute(
                select(Person.id, Person.full_name).where(Person.id.in_(person_ids))
            )
            pers_map = {pid: name for pid, name in rows.all()}

        # Mês de referência da reunião (trimestral usa o último mês do trimestre).
        mes_ref = reuniao.ordem if reuniao.tipo_competencia == models.TipoCompetencia.MENSAL \
            else reuniao.ordem * 3

        # fonte_metrica por indicador + dataset de projetos (para a projeção/melhor cenário).
        metrica_by_id: dict = {}
        ds = None
        try:
            from app.modules.indicadores import portfolio_projetos
            from app.modules.indicadores.models import (
                FonteDados as IndFonte,
                Indicador as IndicadorModel,
                IndicadorAcompanhamento as IndAcomp,
            )
            met_rows = await db.execute(
                select(IndicadorModel.id, IndicadorModel.fonte, IndicadorModel.fonte_metrica)
            )
            # Métrica EFETIVA: igual ao dashboard_graficos — indicador (ou acompanhamento)
            # com fonte portfolio e sem fonte_metrica usa o default do módulo
            # (servicos_publicados). Cobre o caso "indicador MANUAL com acomps PORTFOLIO".
            com_acomp_portfolio = set((await db.execute(
                select(IndAcomp.indicador_id)
                .where(IndAcomp.fonte == IndFonte.PORTFOLIO).distinct()
            )).scalars().all())
            for iid, fonte, m in met_rows.all():
                v = m.value if hasattr(m, "value") else m
                if not v and (fonte == IndFonte.PORTFOLIO or iid in com_acomp_portfolio):
                    v = "servicos_publicados"
                if v:
                    metrica_by_id[iid] = v
            projetos_vals = {m.value for m in portfolio_projetos.PROJETOS_METRICAS}
            if any(v in projetos_vals for v in metrica_by_id.values()):
                ds = await portfolio_projetos.load_dataset(db)
        except Exception:  # noqa: BLE001 — projeção é opcional
            ds = None

        # Evidências de Produtos (tooltip "entregas do período" nos gráficos).
        evid_serv = evid_doc = None
        try:
            from app.modules.produtos.models import Product, ProductDocumento, ProductLifecycle, ProductServico
            vals = set(metrica_by_id.values())
            if "servicos_publicados" in vals:
                evid_serv = (await db.execute(
                    select(ProductServico.name, ProductServico.data_publicacao, Product.name)
                    .join(Product, Product.id == ProductServico.product_id)
                    .where(
                        ProductServico.is_active.is_(True), Product.is_active.is_(True),
                        Product.lifecycle == ProductLifecycle.PRODUCAO,
                        ProductServico.data_publicacao.isnot(None),
                    )
                )).all()
            if "documentos_natos_digitais" in vals:
                evid_doc = (await db.execute(
                    select(ProductDocumento.name, ProductDocumento.data_documento, Product.name)
                    .join(Product, Product.id == ProductDocumento.product_id)
                    .where(
                        ProductDocumento.is_active.is_(True),
                        ProductDocumento.is_nato_digital.is_(True),
                        Product.is_active.is_(True),
                        Product.lifecycle == ProductLifecycle.PRODUCAO,
                        ProductDocumento.data_documento.isnot(None),
                    )
                )).all()
        except Exception:  # noqa: BLE001 — evidências são opcionais
            evid_serv = evid_doc = None

        def analise_out(a: Optional[models.RtdIndicadorAnalise]) -> Optional[dict]:
            if a is None:
                return None
            acoes = []
            for item in (a.acoes or []):
                rid = item.get("responsavel_person_id")
                acoes.append({
                    **item,
                    "responsavel_nome": pers_map.get(uuid.UUID(rid)) if rid else None,
                })
            return {
                "fatores_impacto": a.fatores_impacto,
                "riscos": a.riscos,
                "causa_analise": a.causa_analise,
                "plano_reversao": a.plano_reversao,
                "responsavel_person_id": str(a.responsavel_person_id) if a.responsavel_person_id else None,
                "responsavel_nome": pers_map.get(a.responsavel_person_id),
                "prazo": a.prazo.isoformat() if a.prazo else None,
                "resultado_esperado": a.resultado_esperado,
                "acoes": acoes or None,
                "updated_at": a.updated_at.isoformat() if a.updated_at else None,
            }

        out: list[dict] = []
        for ind in charts.indicadores:
            n = _GRAN_PERIODOS.get(ind.granularidade or "") or (len(ind.periodos) or None)
            periodo = None
            serie: list[dict] = []
            tendencia = {"direcao": None, "variacao": None, "base": None}
            projecao = None
            tendencia_futura = None
            if n and ind.periodos:
                ordem_alvo = cls._ordem_alvo(n, mes_ref)
                # Série do ANO INTEIRO — o front renderiza no formato do módulo de
                # Indicadores (barras meta × realizado), destacando o período da reunião.
                serie = [
                    {
                        "competencia": p.competencia, "ordem": p.ordem,
                        "meta": p.meta, "realizado": p.realizado,
                        "percentual_atingimento": p.percentual_atingimento,
                        "status": p.status,
                    }
                    for p in sorted(ind.periodos, key=lambda x: x.ordem)
                ]
                # Evidências por período (tooltip do gráfico): o que foi entregue no mês.
                mv = metrica_by_id.get(ind.id)
                alvo_cls = (
                    "desenvolvimento" if (mv or "").endswith("desenvolvimento")
                    else "implantacao" if (mv or "").endswith("implantacao") else None
                )
                for p_dict in serie:
                    b_ini, b_fim = cls._periodo_bounds(reuniao.ano_referencia, n, p_dict["ordem"])
                    p_dict["entregas"] = cls._entregas_periodo(
                        mv, ds, evid_serv, evid_doc, alvo_cls, b_ini, b_fim,
                    )

                alvo = next((p for p in serie if p["ordem"] == ordem_alvo), None)
                if alvo is not None:
                    periodo = alvo
                    ate_alvo = [p for p in serie if p["ordem"] <= ordem_alvo]
                    tendencia = cls._tendencia(ind.sentido, ate_alvo, len(ate_alvo) - 1)
                projecao = cls._projecao(
                    ds, metrica_by_id.get(ind.id), reuniao.ano_referencia, n, ordem_alvo, serie,
                )
                tendencia_futura = cls._tendencia_futura(
                    ind.sentido, ind.unidade_medida, serie, ordem_alvo, n,
                )

            out.append({
                "indicador_id": str(ind.id),
                "codigo": ind.codigo,
                "nome": ind.nome,
                "categoria": ind.categoria,
                "sub_processo": ind.sub_processo,
                "area_name": ind.area_name,
                "unidade_medida": ind.unidade_medida,
                "formula_calculo": ind.formula_calculo,
                "sentido": ind.sentido,
                "granularidade": ind.granularidade,
                "meta_min": ind.meta_min,
                "meta_max": ind.meta_max,
                "periodo": periodo,
                "tendencia": tendencia,
                "tendencia_futura": tendencia_futura,
                "projecao": projecao,
                "serie": serie,
                "analise": analise_out(analises.get(ind.id)),
            })

        # Estratégicos antes de táticos; dentro, por código (sort estável).
        out.sort(key=lambda d: (0 if d["categoria"] == "estrategico" else 1))
        return out

    @classmethod
    async def upsert_indicador_analise(
        cls,
        db: AsyncSession,
        reuniao: models.RtdReuniao,
        indicador_id: uuid.UUID,
        data: schemas.IndicadorAnaliseUpsert,
        user_id: uuid.UUID,
    ) -> schemas.IndicadorAnaliseOut:
        """Upsert com semântica PUT: o payload substitui TODOS os campos da análise."""
        res = await db.execute(
            select(models.RtdIndicadorAnalise).where(
                models.RtdIndicadorAnalise.reuniao_id == reuniao.id,
                models.RtdIndicadorAnalise.indicador_id == indicador_id,
            )
        )
        a = res.scalar_one_or_none()
        if a is None:
            a = models.RtdIndicadorAnalise(
                reuniao_id=reuniao.id, indicador_id=indicador_id, created_by=user_id,
            )
            db.add(a)
        a.fatores_impacto = data.fatores_impacto
        a.riscos = data.riscos
        a.causa_analise = data.causa_analise
        a.plano_reversao = data.plano_reversao
        a.responsavel_person_id = data.responsavel_person_id
        a.prazo = data.prazo
        a.resultado_esperado = data.resultado_esperado
        # Plano de ação em lista — persistido como JSON puro (UUID→str, date→iso).
        a.acoes = (
            [item.model_dump(mode="json") for item in data.acoes] if data.acoes else None
        )
        a.updated_by = user_id
        a.updated_at = datetime.utcnow()
        await db.commit()
        await db.refresh(a)

        from app.modules.teamops.models import Person
        pids = {a.responsavel_person_id} if a.responsavel_person_id else set()
        for item in (a.acoes or []):
            if item.get("responsavel_person_id"):
                pids.add(uuid.UUID(item["responsavel_person_id"]))
        nomes: dict = {}
        if pids:
            rows = await db.execute(select(Person.id, Person.full_name).where(Person.id.in_(pids)))
            nomes = {pid: nome for pid, nome in rows.all()}
        acoes_out = [
            schemas.AnaliseAcaoOut(
                **item,
                responsavel_nome=nomes.get(
                    uuid.UUID(item["responsavel_person_id"])
                ) if item.get("responsavel_person_id") else None,
            )
            for item in (a.acoes or [])
        ] or None
        return schemas.IndicadorAnaliseOut(
            id=a.id, reuniao_id=a.reuniao_id, indicador_id=a.indicador_id,
            fatores_impacto=a.fatores_impacto, riscos=a.riscos,
            causa_analise=a.causa_analise, plano_reversao=a.plano_reversao,
            responsavel_person_id=a.responsavel_person_id,
            responsavel_nome=nomes.get(a.responsavel_person_id),
            prazo=a.prazo, resultado_esperado=a.resultado_esperado,
            acoes=acoes_out, updated_at=a.updated_at,
        )

    @classmethod
    async def list_persons(cls, db: AsyncSession) -> list[schemas.PersonMiniOut]:
        """Persons do teamops para o select de responsável (espelho local — não depende
        do módulo Indicadores estar ativo no tenant)."""
        from app.modules.teamops.models import Person
        rows = await db.execute(select(Person.id, Person.full_name).order_by(Person.full_name))
        return [schemas.PersonMiniOut(id=pid, full_name=name) for pid, name in rows.all()]

    # ── Slides de Planos do EPA (Estratégicos e Táticos — mesmo conceito) ──
    @staticmethod
    def _codigos_epa(reuniao: models.RtdReuniao, categoria: str = "estrategico") -> list[int]:
        """Códigos da reunião; sem configuração na reunião, usa o padrão do .env
        (EPA_PLANOS_ESTRATEGICO / EPA_PLANOS_TATICOS)."""
        from app.core.config import settings
        salvos = reuniao.epa_planos_taticos if categoria == "tatico" else reuniao.epa_planos
        if salvos:
            return [int(c) for c in salvos]
        padrao = settings.EPA_PLANOS_TATICOS if categoria == "tatico" else settings.EPA_PLANOS_ESTRATEGICO
        out: list[int] = []
        for parte in (padrao or "").replace(";", ",").split(","):
            parte = parte.strip()
            if parte.isdigit():
                out.append(int(parte))
        return out

    @classmethod
    async def _planos_epa_live(
        cls, reuniao: models.RtdReuniao, categoria: str = "estrategico",
    ) -> Optional[list[dict]]:
        """Busca os planos configurados na reunião direto do EPA (ao vivo)."""
        from app.modules.rtd import epa_client
        codigos = cls._codigos_epa(reuniao, categoria)
        if not codigos or not epa_client.epa_configured():
            return None
        return await epa_client.buscar_planos(codigos, reuniao.periodo_fim)

    @classmethod
    async def planos_epa(cls, reuniao: models.RtdReuniao, categoria: str = "estrategico") -> dict:
        """Payload dos slides de Planos do EPA. Reunião fechada lê a foto congelada;
        aberta busca ao vivo. Erros da integração viram mensagem amigável."""
        from app.modules.rtd import epa_client

        snap_key = "planos_epa_taticos" if categoria == "tatico" else "planos_epa"
        base = {
            "configurado": epa_client.epa_configured(),
            "categoria": categoria,
            "codigos": cls._codigos_epa(reuniao, categoria),
            "snapshot_at": None,
            "planos": None,
            "erro": None,
        }
        if reuniao.status == models.ReuniaoStatus.FECHADA and reuniao.snapshot_indicadores \
                and reuniao.snapshot_indicadores.get(snap_key) is not None:
            base["planos"] = reuniao.snapshot_indicadores.get(snap_key)
            base["snapshot_at"] = reuniao.snapshot_indicadores.get("generated_at")
            return base
        if not base["configurado"]:
            base["erro"] = "Integração EPA não configurada — defina EPA_LOGIN/EPA_SENHA no .env."
            return base
        if not base["codigos"]:
            return base
        try:
            base["planos"] = await cls._planos_epa_live(reuniao, categoria)
        except epa_client.EpaError as e:
            base["erro"] = str(e)
        except Exception as e:  # noqa: BLE001 — rede/timeout
            base["erro"] = f"Falha ao consultar o EPA: {str(e)[:200]}"
        return base

    # ── Seção 1: sugestão de análise com IA (Azure AI Foundry) ──
    # A sugestão NÃO é persistida — preenche o formulário para revisão humana. O prompt
    # passa OBRIGATORIAMENTE por anonimização (core/anonymize.py) antes do envio externo.

    @staticmethod
    async def _resolve_agent_id(db: AsyncSession) -> Optional[str]:
        """Agente do Azure a usar: reusa o agent_id do primeiro binding de etapa ativo
        (decisão do produto — sem config extra por enquanto)."""
        from app.modules.projetos.models import ProjectStageAgentBinding
        return await db.scalar(
            select(ProjectStageAgentBinding.agent_id)
            .where(ProjectStageAgentBinding.is_active.is_(True))
            .order_by(ProjectStageAgentBinding.created_at)
            .limit(1)
        )

    @staticmethod
    def _recorte_metrica(ds, metrica_valor: str, inicio: date, fim: date) -> list[str]:
        """Linhas de contexto específicas da métrica tática (dataset de portfolio_projetos).
        SEMPRE agregado a NÍVEL DE PROJETO (a análise da RTD é gerencial — US/features
        individuais não devem aparecer). Listas limitadas a 10 projetos."""
        from app.modules.indicadores.portfolio_projetos import _d  # normaliza datetime→date

        LIM = 10
        out: list[str] = []

        def no_periodo(dt) -> bool:
            d = _d(dt)
            return d is not None and inicio <= d <= fim

        # task_id → card-raiz de PROJETO (programas primeiro; projeto sobrescreve).
        root_of: dict = {}
        for kind in ("programa", "projeto"):
            for root in ds.roots:
                if root.planning_kind != kind:
                    continue
                for tid in ds.subtree_by_root.get(root.id, []):
                    root_of[tid] = root

        if metrica_valor.startswith("cronograma_") or metrica_valor.startswith("desvio_trabalho_"):
            alvo = "desenvolvimento" if metrica_valor.endswith("desenvolvimento") else "implantacao"
            roots = [
                r for r in ds.roots
                if r.planning_kind == "projeto" and r.card_classification == alvo
                and r.id not in ds.cancelled_ids
            ]
            if metrica_valor.startswith("cronograma_"):
                # Agrega por PROJETO: nº de entregas atrasadas/pendentes e maior atraso.
                por_proj: dict = {}
                for root in roots:
                    resumo = {"atrasadas": 0, "max_atraso": 0, "pendentes": 0}
                    for tid in ds.subtree_by_root.get(root.id, []):
                        if tid == root.id or tid in ds.cancelled_ids:
                            continue
                        t = ds.by_id[tid]
                        if not no_periodo(t.due_date):
                            continue
                        if t.completed_at is not None and _d(t.completed_at) > _d(t.due_date):
                            resumo["atrasadas"] += 1
                            resumo["max_atraso"] = max(
                                resumo["max_atraso"], (_d(t.completed_at) - _d(t.due_date)).days
                            )
                        elif t.completed_at is None:
                            resumo["pendentes"] += 1
                    if resumo["atrasadas"] or resumo["pendentes"]:
                        por_proj[root.title] = resumo
                ordenado = sorted(
                    por_proj.items(),
                    key=lambda kv: (kv[1]["atrasadas"] + kv[1]["pendentes"]), reverse=True,
                )
                for nome, res in ordenado[:LIM]:
                    partes = []
                    if res["atrasadas"]:
                        partes.append(f"{res['atrasadas']} entrega(s) do período concluídas fora do prazo"
                                      f" (maior atraso +{res['max_atraso']}d)")
                    if res["pendentes"]:
                        partes.append(f"{res['pendentes']} entrega(s) com prazo no período ainda não concluídas")
                    out.append(f"Projeto {nome}: " + " e ".join(partes))
            else:  # desvio_trabalho_*
                for root in roots:
                    sc = root.schedule_committed_at
                    if sc is None:
                        continue
                    novas = sum(
                        1 for tid in ds.subtree_by_root.get(root.id, [])
                        if tid != root.id and tid not in ds.cancelled_ids
                        and ds.by_id[tid].created_at is not None
                        and ds.by_id[tid].created_at > sc
                        and no_periodo(ds.by_id[tid].created_at)
                    )
                    if novas:
                        out.append(f"Projeto {root.title}: {novas} tarefa(s) de escopo novo criadas "
                                   f"após o comprometimento do cronograma no período")
                sem_commit = [r.title for r in roots if r.schedule_committed_at is None]
                if sem_commit:
                    out.append(f"Projetos da classificação SEM cronograma comprometido (fora da medição): "
                               + "; ".join(sem_commit[:LIM]))

        elif metrica_valor == "pct_sla_estourado":
            ativas = [
                t for t in ds.tasks
                if t.id in ds.us_ids and t.completed_at is None
                and t.id not in ds.cancelled_ids and t.status_id not in ds.final_status_ids
            ]
            estouradas = [t for t in ativas if t.sla_state == "breached"]
            out.append(f"US ativas com SLA configurado: {sum(1 for t in ativas if (t.sla_state or 'none') != 'none')}; "
                       f"estouradas: {len(estouradas)}")
            por_proj: dict = {}
            for t in estouradas:
                root = root_of.get(t.id)
                nome = root.title if root is not None else "Sem projeto vinculado"
                por_proj[nome] = por_proj.get(nome, 0) + 1
            for nome, n_ in sorted(por_proj.items(), key=lambda kv: kv[1], reverse=True)[:LIM]:
                out.append(f"Projeto {nome}: {n_} US com SLA estourado")

        elif metrica_valor == "taxa_impedimento":
            por_proj = {}
            for t in ds.tasks:
                if t.id in ds.us_ids and t.completed_at is None and t.id in ds.impedimento_ids:
                    root = root_of.get(t.id)
                    nome = root.title if root is not None else "Sem projeto vinculado"
                    por_proj[nome] = por_proj.get(nome, 0) + 1
            for nome, n_ in sorted(por_proj.items(), key=lambda kv: kv[1], reverse=True)[:LIM]:
                out.append(f"Projeto {nome}: {n_} US em impedimento")

        elif metrica_valor == "tempo_analise_oportunidade":
            for t in ds.tasks:
                if (t.planning_kind or "") in ("projeto", "programa") and t.origin_task_id \
                        and no_periodo(t.created_at):
                    origem = ds.by_id.get(t.origin_task_id)
                    if origem is not None and origem.created_at is not None:
                        dias = (t.created_at - origem.created_at).total_seconds() / 86400
                        out.append(f"Demanda→Projeto: {t.title} ({dias:.1f} dias de análise)")
            out = out[:LIM]

        elif metrica_valor == "lead_time_us":
            por_proj = {}
            for t in ds.tasks:
                if t.id in ds.us_ids and t.id not in ds.cancelled_ids \
                        and no_periodo(t.completed_at) and t.left_backlog_at is not None:
                    dias = (t.completed_at - t.left_backlog_at).total_seconds() / 86400
                    root = root_of.get(t.id)
                    nome = root.title if root is not None else "Sem projeto vinculado"
                    por_proj.setdefault(nome, []).append(dias)
            ordenado = sorted(por_proj.items(), key=lambda kv: max(kv[1]), reverse=True)
            for nome, dias_list in ordenado[:LIM]:
                media = sum(dias_list) / len(dias_list)
                out.append(f"Projeto {nome}: {len(dias_list)} US concluídas no período "
                           f"(lead médio {media:.1f}d, maior {max(dias_list):.1f}d)")

        elif metrica_valor in ("pct_desenvolvimento", "pct_projetos_ia"):
            cont: dict[str, int] = {}
            com_ia = sem_ia = 0
            for t in ds.tasks:
                if t.planning_kind != "projeto" or t.id in ds.cancelled_ids:
                    continue
                if t.card_classification:
                    cont[t.card_classification] = cont.get(t.card_classification, 0) + 1
                if t.ia_assisted is True:
                    com_ia += 1
                elif t.ia_assisted is False:
                    sem_ia += 1
            out.append("Carteira classificada: " + ", ".join(f"{k}={v}" for k, v in sorted(cont.items())))
            out.append(f"Pergunta de IA respondida: {com_ia} com IA, {sem_ia} sem IA")

        return out

    @classmethod
    async def _contexto_ia(cls, db: AsyncSession, reuniao: models.RtdReuniao, det: dict) -> str:
        """Contexto rico para o prompt: indicador + portfólio (foto do mês) + recorte da métrica."""
        mes_ref = reuniao.ordem if reuniao.tipo_competencia == models.TipoCompetencia.MENSAL \
            else reuniao.ordem * 3

        SENTIDO_TXT = {
            "maior_melhor": "quanto MAIOR, melhor",
            "menor_melhor": "quanto MENOR, melhor",
            "faixa_ideal": "ideal dentro da faixa",
        }
        STATUS_TXT = {"atingido": "META ATINGIDA", "em_atencao": "EM ATENÇÃO",
                      "nao_atingido": "META NÃO ATINGIDA", "pendente": "sem apuração"}
        p = det.get("periodo") or {}
        linhas = [
            "## INDICADOR",
            f"- Nome: {det['nome']} (código {det['codigo']}, {det['categoria']})",
            f"- Sub-processo: {det.get('sub_processo') or '—'}",
            f"- Fórmula: {det.get('formula_calculo') or '—'}",
            f"- Polaridade: {SENTIDO_TXT.get(det.get('sentido') or '', '—')}",
            f"- Período de referência: {p.get('competencia', '—')} | Meta: {p.get('meta', '—')} | "
            f"Realizado: {p.get('realizado', '—')} {det.get('unidade_medida') or ''} | "
            f"Atingimento: {p.get('percentual_atingimento', '—')}% | "
            f"Situação: {STATUS_TXT.get(p.get('status', 'pendente'))}",
        ]
        t = det.get("tendencia") or {}
        if t.get("direcao"):
            suf = " p.p." if t.get("base") == "percentual" else ""
            linhas.append(f"- Tendência vs período anterior: {t['direcao']} ({t.get('variacao')}{suf})")
        tf = det.get("tendencia_futura") or {}
        if tf.get("texto"):
            linhas.append(f"- Tendência para o próximo período (mantido o ritmo): {tf['texto']}")
        proj = det.get("projecao") or {}
        if proj.get("texto"):
            linhas.append(f"- Projeção do próximo período (melhor cenário): {proj['texto']}")
        serie = det.get("serie") or []
        if serie:
            linhas.append("- Série do ano, APENAS para comparação entre meses (realizado/meta [situação]): " + "; ".join(
                f"{s['competencia']}: {s['realizado'] if s['realizado'] is not None else '—'}"
                f"/{s['meta'] if s['meta'] is not None else '—'} [{s['status']}]"
                for s in serie
            ))

        # Portfólio — foto do mês da reunião (PO Sync).
        try:
            from app.modules.projetos.service import PoSyncService
            posync = await PoSyncService.build(db, mes=mes_ref, ano=reuniao.ano_referencia)
            linhas.append("\n## CONTEXTO DO PORTFÓLIO DE PROJETOS (foto do mês)")
            prazo = posync.get("prazo", {})
            for chave, rotulo in (("projetos", "Projetos"), ("itens", "Entregas (itens)")):
                b = prazo.get(chave)
                if b:
                    linhas.append(
                        f"- {rotulo}: {b.get('no_prazo', 0)} no prazo, {b.get('atrasados', 0)} entregues com atraso "
                        f"(médio {b.get('atraso_medio') or 0}d), {b.get('em_atraso_corrente', 0)} em atraso corrente, "
                        f"{b.get('em_andamento_no_prazo', 0)} em andamento no prazo "
                        f"({b.get('pct_atrasados_combinado') if b.get('pct_atrasados_combinado') is not None else '—'}% atrasados)"
                    )
            fases = posync.get("panorama", {}).get("fases", {})
            if fases:
                linhas.append("- Fases do portfólio: " + ", ".join(f"{k}={v}" for k, v in fases.items() if v))
            # Maiores atrasos AGREGADOS por projeto (a análise da RTD é gerencial).
            atrasos_proj: dict = {}
            for a in posync.get("maiores_atrasos", []):
                nome = (a.get("projeto") if a.get("nivel") == "item" else a.get("title")) or a.get("title")
                e = atrasos_proj.setdefault(nome, {"max": 0, "itens": 0})
                e["max"] = max(e["max"], a.get("atraso_dias") or 0)
                e["itens"] += 1
            top_atrasos = sorted(atrasos_proj.items(), key=lambda kv: kv[1]["max"], reverse=True)[:5]
            if top_atrasos:
                linhas.append("- Projetos com maiores atrasos: " + "; ".join(
                    f"{nome} (maior atraso +{e['max']}d, {e['itens']} item(ns) atrasados)"
                    for nome, e in top_atrasos
                ))
            riscos_po = [
                f"{r.get('full_name')}: {r.get('em_risco')}" for r in posync.get("ranking_pos", [])
                if r.get("em_risco", 0) > 0
            ]
            if riscos_po:
                linhas.append("- Projetos em risco por PO: " + "; ".join(riscos_po[:8]))
        except Exception:  # noqa: BLE001 — contexto de portfólio é opcional
            pass

        # Capacidade do time na janela do PRÓXIMO período — base para o plano de ação
        # (realocação entre times, ausências, gargalos). Agregado por CARGO/time, sem
        # nomes de pessoas (seriam anonimizados no envio de qualquer forma).
        try:
            from app.modules.projetos.service import CapacityService
            prox_ini, prox_fim = cls._proximo_periodo(
                reuniao.tipo_competencia.value, reuniao.ano_referencia, reuniao.ordem,
            )
            livres = await CapacityService.find_available_people(db, prox_ini, prox_fim)
            rows = livres.rows
            com_folga = [r for r in rows if r.free_hours_total > 8]
            sobre = [r for r in rows if r.utilization_pct > 100]
            ausentes = [r for r in rows if r.next_absence]
            linhas.append(
                f"\n## CAPACIDADE DO TIME (janela do próximo período, "
                f"{prox_ini.isoformat()} a {prox_fim.isoformat()})"
            )
            linhas.append(
                f"- Pessoas com folga de capacidade (>8h livres): {len(com_folga)} "
                f"(total {sum(r.free_hours_total for r in com_folga):.0f}h livres); "
                f"em sobrecarga (>100% utilização): {len(sobre)}; "
                f"com ausência prevista afetando capacidade: {len(ausentes)}"
            )
            por_cargo: dict = {}
            for r in com_folga:
                cargo = r.position_label or r.position_slug or "Sem cargo"
                e = por_cargo.setdefault(cargo, {"n": 0, "h": 0.0})
                e["n"] += 1
                e["h"] += r.free_hours_total
            for cargo, e in sorted(por_cargo.items(), key=lambda kv: kv[1]["h"], reverse=True)[:6]:
                linhas.append(f"- Folga disponível — {cargo}: {e['n']} pessoa(s), {e['h']:.0f}h livres "
                              f"(candidatas a realocação entre times/projetos)")
            gaps = await CapacityService.detect_bottlenecks(db, prox_ini, prox_fim, "position")
            for g in [g for g in gaps.rows if g.deficit_hours > 0][:5]:
                linhas.append(
                    f"- Gargalo — {g.group_label}: déficit de {g.deficit_hours:.0f}h no período "
                    f"(pico semanal {g.peak_deficit_hours:.0f}h); reforço sugerido: "
                    f"{g.suggested_headcount} pessoa(s)"
                )
        except Exception:  # noqa: BLE001 — capacidade é contexto opcional
            pass

        # Recorte específico da métrica (indicadores táticos automáticos).
        try:
            from app.modules.indicadores import portfolio_projetos
            from app.modules.indicadores.models import Indicador
            metrica = await db.scalar(
                select(Indicador.fonte_metrica).where(Indicador.id == uuid.UUID(det["indicador_id"]))
            )
            metrica_valor = metrica.value if hasattr(metrica, "value") else metrica
            if metrica_valor and metrica_valor in {m.value for m in portfolio_projetos.PROJETOS_METRICAS}:
                ds = await portfolio_projetos.load_dataset(db)
                recorte = cls._recorte_metrica(ds, metrica_valor, reuniao.periodo_inicio, reuniao.periodo_fim)
                if recorte:
                    linhas.append("\n## RECORTE ESPECÍFICO DA MÉTRICA")
                    linhas.extend(f"- {l}" for l in recorte)
        except Exception:  # noqa: BLE001
            pass

        return "\n".join(linhas)

    @classmethod
    async def sugerir_analise(
        cls, db: AsyncSession, reuniao: models.RtdReuniao, indicador_id: uuid.UUID,
    ) -> schemas.IndicadorAnaliseSugestao:
        """Gera a sugestão de análise via agente do Azure AI Foundry. READ-ONLY: nada é
        persistido — o resultado preenche o formulário e passa por revisão humana."""
        from app.modules.projetos.service import ProjectAgentRunner

        agent_id = await cls._resolve_agent_id(db)
        if not agent_id or not ProjectAgentRunner._azure_sp_configured():
            raise HTTPException(
                status_code=503,
                detail="Nenhum agente de IA disponível — configure um agente de etapa ativo "
                       "no módulo Projetos e as credenciais AZURE_AI_* no ambiente.",
            )

        detalhes = await cls._indicadores_detalhe(db, reuniao) or []
        det = next((d for d in detalhes if d["indicador_id"] == str(indicador_id)), None)
        if det is None:
            raise HTTPException(status_code=404, detail="Indicador não encontrado no report da reunião.")

        contexto = await cls._contexto_ia(db, reuniao, det)
        abaixo = (det.get("periodo") or {}).get("status") in ("nao_atingido", "em_atencao")
        prompt = (
            f"Você é um analista de gestão de TI preparando a Reunião de Tomada de Decisão (RTD) "
            f"da competência {reuniao.competencia}. Analise o indicador abaixo com o contexto "
            f"fornecido e proponha a análise qualitativa para a ata.\n\n"
            f"{contexto}\n\n"
            "## TAREFA\n"
            "Responda APENAS com JSON válido, sem nenhum texto fora do JSON, no formato:\n"
            '{"fatores_impacto": "...", "riscos": "...", "causa_analise": "...", '
            '"plano_reversao": "...", "resultado_esperado": "...", '
            '"plano_acao": [{"causa": "...", "acao": "...", "resultado_esperado": "..."}]}\n'
            "Regras:\n"
            f"- A análise deve avaliar ESPECIFICAMENTE o resultado do período de referência "
            f"({reuniao.competencia}) — NÃO faça uma avaliação geral do ano ou do indicador como um "
            f"todo. Os demais meses da série servem APENAS para comparação (evolução: melhor/pior que "
            f"os meses anteriores, e por quanto).\n"
            "- Português, tom executivo e objetivo, 2 a 4 frases por campo.\n"
            "- Baseie-se SOMENTE nos dados fornecidos; NÃO invente números ou fatos.\n"
            "- A análise deve ser no NÍVEL DE PROJETO: cite NOMINALMENTE os PROJETOS do "
            "contexto que sustentam cada afirmação, com os números agregados (ex.: "
            "\"Projeto Fintech - SI-Aprove com 8 entregas pendentes\", \"Projeto X com maior "
            "atraso de +235d\"). NÃO cite histórias de usuário (US), features ou tarefas "
            "individuais — use exatamente os nomes de projeto fornecidos no contexto.\n"
            "- No plano_reversao, quando fizer sentido, direcione as ações aos projetos "
            "citados (os mais atrasados/críticos primeiro).\n"
            + ("- A meta NÃO foi plenamente atingida: preencha causa_analise, plano_reversao, "
               "resultado_esperado (mensurável, com horizonte de tempo) e monte plano_acao com "
               "2 a 5 AÇÕES CONCRETAS — cada uma com SUA causa, a ação e o resultado esperado. "
               "Use o bloco de CAPACIDADE DO TIME: quando houver folga em um cargo/time e "
               "gargalo/sobrecarga em outro, proponha explicitamente a realocação (ex.: "
               "\"realocar 1 dev com folga para o projeto X\"); considere as ausências previstas "
               "nos riscos e nos prazos das ações.\n" if abaixo else
               "- A meta foi atingida (ou sem apuração): causa_analise, plano_reversao, "
               "resultado_esperado devem ser null e plano_acao deve ser [].\n")
            + "- fatores_impacto: o que explica o resultado do período. riscos: riscos para os "
              "próximos períodos — considere também ausências e sobrecarga do bloco de capacidade.\n"
        )

        # Anonimização OBRIGATÓRIA antes do envio externo (LGPD/DLP).
        prompt_anon, relatorio = await ProjectAgentRunner._anonymize_prompt(db, prompt)
        binding = SimpleNamespace(agent_id=agent_id, gateway_url=None,
                                  gateway_client_id=None, gateway_client_secret=None)
        try:
            status_code, _body, answer = await ProjectAgentRunner._call_azure_agent(
                binding, prompt_anon, None,
            )
        except ValueError as e:
            raise HTTPException(status_code=503, detail=str(e))
        except Exception as e:  # noqa: BLE001 — rede/DNS
            raise HTTPException(status_code=502, detail=ProjectAgentRunner._format_gateway_error(e))
        if answer is None:
            raise HTTPException(
                status_code=502, detail=ProjectAgentRunner._gateway_http_message(status_code),
            )

        parsed = ProjectAgentRunner._extract_json_from_text(answer) or {}
        if not parsed:
            # Agente respondeu fora do formato JSON — erro claro em vez de campos vazios.
            raise HTTPException(
                status_code=502,
                detail="A IA respondeu em um formato inesperado — tente gerar novamente.",
            )

        def campo(nome: str) -> Optional[str]:
            v = parsed.get(nome)
            return v.strip() if isinstance(v, str) and v.strip() else None

        acoes: list[schemas.AcaoSugerida] = []
        for raw in (parsed.get("plano_acao") or [])[:6]:
            if not isinstance(raw, dict):
                continue
            item = schemas.AcaoSugerida(
                causa=(raw.get("causa") or "").strip() or None,
                acao=(raw.get("acao") or "").strip() or None,
                resultado_esperado=(raw.get("resultado_esperado") or "").strip() or None,
            )
            if item.causa or item.acao:
                acoes.append(item)

        return schemas.IndicadorAnaliseSugestao(
            fatores_impacto=campo("fatores_impacto"),
            riscos=campo("riscos"),
            causa_analise=campo("causa_analise"),
            plano_reversao=campo("plano_reversao"),
            resultado_esperado=campo("resultado_esperado"),
            acoes=acoes,
            anonimizacao=relatorio or {},
        )

    # ── Relatório da cerimônia ──
    @staticmethod
    async def _entregas(
        db: AsyncSession, *, concluidas: bool, inicio: date, fim: date, limit: int = 100,
    ) -> list[dict]:
        """Entregas do período. concluidas=True → completed_at no intervalo;
        concluidas=False → em aberto com due_date no intervalo (próximo ciclo)."""
        from app.modules.projetos.models import ProjectTask
        from app.modules.teamops.models import Person

        di = datetime.combine(inicio, time.min)
        df = datetime.combine(fim, time.max)
        base = select(ProjectTask).where(
            ProjectTask.planning_kind.is_(None)  # exclui cards-raiz (projeto/programa)
        )
        if concluidas:
            base = base.where(
                ProjectTask.completed_at.isnot(None),
                ProjectTask.completed_at >= di, ProjectTask.completed_at <= df,
            ).order_by(ProjectTask.completed_at.desc())
        else:
            base = base.where(
                ProjectTask.completed_at.is_(None), ProjectTask.due_date.isnot(None),
                ProjectTask.due_date >= di, ProjectTask.due_date <= df,
            ).order_by(ProjectTask.due_date.asc())
        base = base.limit(limit)
        tasks = list((await db.execute(base)).scalars().all())

        person_ids = {t.assigned_to for t in tasks if t.assigned_to}
        pers_map: dict = {}
        if person_ids:
            rows = await db.execute(
                select(Person.id, Person.full_name).where(Person.id.in_(person_ids))
            )
            pers_map = {pid: name for pid, name in rows.all()}

        out = []
        for t in tasks:
            item = {
                "task_id": str(t.id), "title": t.title,
                "responsavel": pers_map.get(t.assigned_to),
                "due_date": t.due_date.isoformat() if t.due_date else None,
            }
            if concluidas:
                item["completed_at"] = t.completed_at.isoformat() if t.completed_at else None
                # No prazo? (quando há baseline)
                if t.due_date and t.completed_at:
                    item["no_prazo"] = t.completed_at <= t.due_date
            out.append(item)
        return out

    @classmethod
    async def build_report(cls, db: AsyncSession, reuniao: models.RtdReuniao) -> dict:
        from app.modules.projetos.service import PoSyncService

        inicio, fim = reuniao.periodo_inicio, reuniao.periodo_fim
        prox_inicio, prox_fim = cls._proximo_periodo(
            reuniao.tipo_competencia.value, reuniao.ano_referencia, reuniao.ordem
        )

        # §2 por PO + riscos: reusa o PO Sync (execução stage-weighted, prazo, fase, saúde).
        posync = await PoSyncService.build(db)

        entregas_concluidas = await cls._entregas(db, concluidas=True, inicio=inicio, fim=fim)
        entregas_previstas = await cls._entregas(db, concluidas=False, inicio=prox_inicio, fim=prox_fim)

        # §1 Riscos/impedimentos — derivados do PO Sync.
        panorama_fases = posync.get("panorama", {}).get("fases", {})
        em_risco_por_po = [
            {"full_name": p.get("full_name"), "em_risco": p.get("em_risco", 0)}
            for p in posync.get("ranking_pos", []) if p.get("em_risco", 0) > 0
        ]
        riscos = {
            "impedimentos": panorama_fases.get("impedimento", 0),
            "maiores_atrasos": posync.get("maiores_atrasos", [])[:10],
            "em_risco_por_po": em_risco_por_po,
        }

        panorama = {
            "periodo": {"inicio": inicio.isoformat(), "fim": fim.isoformat()},
            "proximo_ciclo": {"inicio": prox_inicio.isoformat(), "fim": prox_fim.isoformat()},
            "entregas_concluidas": entregas_concluidas,
            "entregas_previstas": entregas_previstas,
            "riscos": riscos,
            "fases": panorama_fases,
        }

        # §2.3 Indicadores estratégicos/táticos (reusa módulo Indicadores).
        indicadores = None
        try:
            from app.modules.indicadores.service import IndicadorService
            dash = await IndicadorService.dashboard(db, ano=reuniao.ano_referencia)
            indicadores = dash.model_dump(mode="json")
        except Exception:  # noqa: BLE001 — módulo indicadores pode não estar ativo
            indicadores = None

        # §1 Acompanhamento dos Indicadores: fechada → FOTO congelada; senão, ao vivo.
        snapshot_at = None
        if reuniao.status == models.ReuniaoStatus.FECHADA and reuniao.snapshot_indicadores:
            indicadores_detalhe = reuniao.snapshot_indicadores.get("indicadores_detalhe")
            snapshot_at = reuniao.snapshot_indicadores.get("generated_at")
        else:
            indicadores_detalhe = await cls._indicadores_detalhe(db, reuniao)

        # §2.3 Contagens digitais (reusa Produtos).
        produtos_digitais = None
        try:
            from app.modules.produtos.service import ProductService
            pd = (await ProductService.dashboard(db)).model_dump(mode="json")
            produtos_digitais = {
                "total_servicos": pd.get("total_servicos"),
                "total_documentos": pd.get("total_documentos"),
                "total_processos_automatizados": pd.get("total_processos_automatizados"),
            }
        except Exception:  # noqa: BLE001
            produtos_digitais = None

        # Seções sem dado no sistema — sinalizadas como "em desenvolvimento" (ver ROADMAP.md).
        em_desenvolvimento = {
            "orcamento": True, "roi": True, "chamados_pos_implantacao": True,
            "satisfacao": True, "beneficios": True,
        }

        deliberacoes = await cls.list_deliberacoes(db, reuniao.id)

        return {
            "meta": {
                "reuniao_id": str(reuniao.id), "titulo": reuniao.titulo,
                "competencia": reuniao.competencia, "status": reuniao.status.value,
                "tipo_competencia": reuniao.tipo_competencia.value,
                "ano_referencia": reuniao.ano_referencia, "ordem": reuniao.ordem,
                "data_realizacao": reuniao.data_realizacao.isoformat() if reuniao.data_realizacao else None,
                "epa_planos": reuniao.epa_planos,
                "epa_planos_taticos": reuniao.epa_planos_taticos,
                "generated_at": datetime.utcnow().isoformat(),
                "snapshot_at": snapshot_at,
            },
            "panorama": panorama,
            "por_po": posync.get("por_po", []),
            "indicadores": indicadores,
            "indicadores_detalhe": indicadores_detalhe,
            "produtos_digitais": produtos_digitais,
            "em_desenvolvimento": em_desenvolvimento,
            "deliberacoes": [d.model_dump(mode="json") for d in deliberacoes],
        }
