"""Operação Assistida — indicadores (POP.COR.GTD.003, 8.1.3) e encerramento formal (8.4 e 8.5).

Indicadores do projeto calculados das ocorrências: volume por período e criticidade, % no prazo
de resolução, reincidência (reprovação na homologação) e satisfação (1 a 5). Taxa de erros e
disponibilidade dependem de dado de fora: medições lançadas no card (volume de transações do
período e % de disponibilidade). Metas: as de referência do POP, calibráveis por projeto com
justificativa.

Encerramento: o projeto só sai da raia Operação Assistida para Concluído com os critérios de
saída confirmados (ou decisão estratégica), a análise crítica escrita e o aceite do Dono do
Processo (no Portal) — ou, sem Dono do Processo com acesso, aceite registrado pela coordenação.
"""
from __future__ import annotations

import html
import uuid
from datetime import date, datetime, timedelta
from decimal import Decimal
from typing import Optional

from fastapi import HTTPException
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.notifications import notify_persons, notify_users
from app.modules.projetos.assisted_ops import (
    CRITICIDADE,
    OA_PHASES,
    AssistedOpsService,
    _MELHORIA_KEYS,
    _is_admin,
    _plain_to_html,
)
from app.modules.projetos.models import (
    ProjectAssistedOpMeasure,
    ProjectClient,
    ProjectClientAccess,
    ProjectOccurrence,
    ProjectProgramClientAccess,
    ProjectStatusConfig,
    ProjectTask,
    ProjectTaskComment,
)
from app.modules.projetos.schemas import (
    AssistedOpsClosureAcceptance,
    AssistedOpsClosureAnswer,
    AssistedOpsClosureItem,
    AssistedOpsClosureOverride,
    AssistedOpsClosureSet,
    AssistedOpsClosureState,
    AssistedOpsIndicator,
    AssistedOpsIndicators,
    AssistedOpsMeasureIn,
    AssistedOpsMeasureOut,
    AssistedOpsTargets,
    PortalAssistedOps,
)
from app.modules.super_admin.models import User

# Metas de referência do POP (quadro 3), "a calibrar" por projeto.
TARGETS_POP = {"sla_pct": 90.0, "disponibilidade_pct": 99.0, "reincidencia_pct": 5.0, "satisfacao": 4.0}

# POP 8.4: critérios de saída (o 5º, aceite formal das áreas, é o aceite do Dono do Processo).
CRITERIOS: list[tuple[str, str]] = [
    ("estabilizacao", "Estabilização do processo crítico"),
    ("erros_alta", "Redução dos erros de alta criticidade"),
    ("integracoes", "Funcionamento adequado das integrações"),
    ("sem_suporte", "Operação executada sem suporte intensivo"),
]
# POP 8.5: documento de análise crítica e lições aprendidas.
ANALISE: list[tuple[str, str]] = [
    ("incidentes", "Principais incidentes ocorridos"),
    ("riscos", "Riscos remanescentes"),
    ("melhorias", "Melhorias a serem avaliadas"),
    ("licoes", "Lições aprendidas"),
    ("plano", "Plano de ações pós-estabilização (quando aplicável)"),
]
ANALISE_OBRIGATORIA = ("incidentes", "riscos", "melhorias", "licoes")
# Quem recebe o aviso de encerramento (POP 8.5: Dono do Processo, Escritório de Processos e partes).
_PARTES = ("dono_processo", "escritorio_processos", "sponsor", "especialista_processo")


def _pct(n: int, d: int) -> Optional[float]:
    return round(100.0 * n / d, 1) if d else None


def _num(v: float, casas: int = 1) -> str:
    return f"{v:.{casas}f}".replace(".", ",")


def _monday(d: date) -> date:
    return d - timedelta(days=d.weekday())


class AssistedOpsIndicatorsService:

    @staticmethod
    async def _pairs(db: AsyncSession, root_id: uuid.UUID) -> list[tuple[ProjectOccurrence, ProjectTask]]:
        return [(o, t) for o, t in (await db.execute(
            select(ProjectOccurrence, ProjectTask)
            .join(ProjectTask, ProjectTask.id == ProjectOccurrence.task_id)
            .where(ProjectOccurrence.project_task_id == root_id)
            .order_by(ProjectOccurrence.code)
        )).all()]

    @staticmethod
    def targets_of(root: ProjectTask) -> tuple[AssistedOpsTargets, bool]:
        saved = root.assisted_op_targets or {}
        merged = {**TARGETS_POP, **{k: v for k, v in saved.items() if k in TARGETS_POP and v is not None}}
        return AssistedOpsTargets(**merged, justificativa=saved.get("justificativa")), bool(saved)

    @staticmethod
    async def compute(db: AsyncSession, root_id: uuid.UUID, user: Optional[User]) -> AssistedOpsIndicators:
        root = await AssistedOpsService._root(db, root_id)
        pairs = await AssistedOpsIndicatorsService._pairs(db, root_id)
        summaries = await AssistedOpsService._summaries(db, pairs)
        occ_by_task = {t.id: o for o, t in pairs}
        targets, calibrated = AssistedOpsIndicatorsService.targets_of(root)

        by_tipo: dict[str, int] = {}
        corrections = []
        for s in summaries:
            o = occ_by_task[s.task_id]
            if s.stage_key in _MELHORIA_KEYS or o.classificacao == "melhoria" or (not o.classificacao and o.tipo == "melhoria"):
                tipo = "Melhoria"
            elif o.classificacao == "nao_procede":
                tipo = "Não procede"
            elif s.is_correction:
                tipo = "Correção"
                corrections.append(s)
            else:
                tipo = "Dúvida"
            by_tipo[tipo] = by_tipo.get(tipo, 0) + 1
        by_crit: dict[str, int] = {}
        for s in corrections:
            label = s.criticidade or CRITICIDADE.get(s.prioridade, s.prioridade)
            by_crit[label] = by_crit.get(label, 0) + 1

        # Volume por semana, da entrada na raia (ou 1ª ocorrência) até hoje.
        today = datetime.utcnow().date()
        firsts = [o.created_at.date() for o, _t in pairs]
        since_dt = root.assisted_op_entered_at or (min(o.created_at for o, _t in pairs) if pairs else None)
        start = _monday(min([since_dt.date()] + firsts) if since_dt else today)
        weekly = []
        week = start
        while week <= today:
            end = week + timedelta(days=7)
            weekly.append({
                "week_start": week.isoformat(),
                "total": sum(1 for o, _t in pairs if week <= o.created_at.date() < end),
                "correcoes": sum(1 for s in corrections if week <= s.created_at.date() < end),
            })
            week = end

        items: list[AssistedOpsIndicator] = []
        # 1) Volume de chamados (meta: redução sustentada) — compara as duas últimas semanas fechadas.
        closed_weeks = [w for w in weekly if date.fromisoformat(w["week_start"]) + timedelta(days=7) <= today]
        vol_status, vol_detail = "sem_dado", None
        if len(closed_weeks) >= 2:
            last, prev = closed_weeks[-1]["total"], closed_weeks[-2]["total"]
            vol_status = "ok" if last <= prev else "alerta"
            vol_detail = f"{last} na última semana, {prev} na anterior"
        elif pairs:
            vol_status, vol_detail = "ok", "Tendência aparece a partir da 2ª semana fechada"
        items.append(AssistedOpsIndicator(
            key="volume", label="Volume de chamados", value=float(len(pairs)), display=str(len(pairs)),
            meta="Redução sustentada", status=vol_status, detail=vol_detail,
        ))
        # 2) % de atendimento no SLA (correções encerradas no prazo-alvo da criticidade).
        closed_corr = [s for s in corrections if s.is_closed]
        sla_pct = _pct(sum(1 for s in closed_corr if s.sla_state == "ok"), len(closed_corr))
        open_late = sum(1 for s in corrections if not s.is_closed and s.sla_state == "estourado")
        items.append(AssistedOpsIndicator(
            key="sla", label="% de atendimento no prazo", value=sla_pct,
            display=f"{_num(sla_pct)}%" if sla_pct is not None else "—",
            meta=f"≥ {_num(targets.sla_pct, 0)}%",
            status="sem_dado" if sla_pct is None else ("ok" if sla_pct >= targets.sla_pct else "alerta"),
            detail=f"{len(closed_corr)} correção(ões) encerrada(s)" + (f"; {open_late} aberta(s) com prazo estourado" if open_late else ""),
        ))
        # 3) Reincidência: correções reprovadas na homologação (voltaram para ajuste).
        reinc = sum(1 for s in corrections if (occ_by_task[s.task_id].rejection_count or 0) > 0)
        reinc_pct = _pct(reinc, len(corrections))
        items.append(AssistedOpsIndicator(
            key="reincidencia", label="Reincidência de falhas", value=reinc_pct,
            display=f"{_num(reinc_pct)}%" if reinc_pct is not None else "—",
            meta=f"≤ {_num(targets.reincidencia_pct, 0)}%",
            status="sem_dado" if reinc_pct is None else ("ok" if reinc_pct <= targets.reincidencia_pct else "alerta"),
            detail=f"{reinc} de {len(corrections)} correção(ões) reprovada(s) na validação",
        ))
        # 4) Satisfação (1 a 5) na homologação.
        notas = [o.nps_score for o, _t in pairs if o.nps_score]
        sat = round(sum(notas) / len(notas), 2) if notas else None
        items.append(AssistedOpsIndicator(
            key="satisfacao", label="Satisfação dos usuários", value=sat,
            display=f"{_num(sat)} / 5" if sat is not None else "—",
            meta=f"≥ {_num(targets.satisfacao)} de 5",
            status="sem_dado" if sat is None else ("ok" if sat >= targets.satisfacao else "alerta"),
            detail=f"{len(notas)} avaliação(ões)" if notas else None,
        ))

        # Medições manuais: taxa de erros (incidentes do período / transações) e disponibilidade.
        rows = (await db.execute(
            select(ProjectAssistedOpMeasure).where(ProjectAssistedOpMeasure.task_id == root_id)
            .order_by(ProjectAssistedOpMeasure.period_start, ProjectAssistedOpMeasure.created_at)
        )).scalars().all()
        measures: list[AssistedOpsMeasureOut] = []
        for m in rows:
            incidents = rate = None
            if m.kind == "taxa_erros":
                incidents = sum(1 for s in corrections if m.period_start <= s.created_at.date() <= m.period_end)
                rate = round(1000.0 * incidents / m.transactions, 3) if m.transactions else None
            measures.append(AssistedOpsMeasureOut(
                id=m.id, kind=m.kind, period_start=m.period_start, period_end=m.period_end,
                value=float(m.value) if m.value is not None else None, transactions=m.transactions,
                incidents=incidents, rate=rate, note=m.note,
            ))
        taxas = [m for m in measures if m.kind == "taxa_erros" and m.rate is not None]
        taxa_status, taxa_detail = "sem_dado", "Lance o volume de transações do período"
        if taxas:
            taxa_status = "ok" if len(taxas) < 2 or taxas[-1].rate <= taxas[-2].rate else "alerta"
            taxa_detail = (
                f"{taxas[-1].incidents} incidente(s) em {taxas[-1].transactions} transações"
                + (f"; anterior {_num(taxas[-2].rate, 2)}‰" if len(taxas) >= 2 else "")
            )
        items.append(AssistedOpsIndicator(
            key="taxa_erros", label="Taxa de erros", value=taxas[-1].rate if taxas else None,
            display=f"{_num(taxas[-1].rate, 2)}‰" if taxas else "—", meta="Tendência de queda",
            status=taxa_status, detail=taxa_detail,
        ))
        disp = [m for m in measures if m.kind == "disponibilidade" and m.value is not None]
        items.append(AssistedOpsIndicator(
            key="disponibilidade", label="Disponibilidade do sistema", value=disp[-1].value if disp else None,
            display=f"{_num(disp[-1].value, 2)}%" if disp else "—",
            meta=f"≥ {_num(targets.disponibilidade_pct, 0)}%",
            status="sem_dado" if not disp else ("ok" if disp[-1].value >= targets.disponibilidade_pct else "alerta"),
            detail=(f"{disp[-1].period_start:%d/%m} a {disp[-1].period_end:%d/%m}" if disp else "Lance a disponibilidade do período"),
        ))

        n1: dict[str, int] = {}
        for o, _t in pairs:
            if o.n1_outcome:
                n1[o.n1_outcome] = n1.get(o.n1_outcome, 0) + 1
        return AssistedOpsIndicators(
            items=items, weekly=weekly, by_criticidade=by_crit, by_tipo=by_tipo, n1=n1,
            targets=targets, targets_calibrated=calibrated, measures=measures, since=since_dt,
            can_manage=await AssistedOpsService._can_manage_oa(db, user, root_id) if user else False,
        )

    @staticmethod
    async def set_targets(db: AsyncSession, root_id: uuid.UUID, data: AssistedOpsTargets, user: User) -> AssistedOpsIndicators:
        """Calibragem das metas (POP 8.1.3): com justificativa registrada."""
        root = await AssistedOpsService._root(db, root_id)
        if not await AssistedOpsService._can_manage_oa(db, user, root_id):
            raise HTTPException(status_code=403, detail="Só o PO do projeto ou a coordenação calibram as metas.")
        if len((data.justificativa or "").strip()) < 10:
            raise HTTPException(status_code=400, detail="Justifique a calibragem das metas (mín. 10 caracteres).")
        root.assisted_op_targets = {**data.model_dump(), "justificativa": data.justificativa.strip(),
                                    "by": user.full_name, "at": datetime.utcnow().isoformat()}
        root.updated_at = datetime.utcnow()
        await db.commit()
        return await AssistedOpsIndicatorsService.compute(db, root_id, user)

    @staticmethod
    async def add_measure(db: AsyncSession, root_id: uuid.UUID, data: AssistedOpsMeasureIn, user: User) -> AssistedOpsIndicators:
        await AssistedOpsService._root(db, root_id)
        if not await AssistedOpsService._can_record(db, user, root_id):
            raise HTTPException(status_code=403, detail="Só o PO, a coordenação e os devs de atendimento lançam medições.")
        if data.period_end < data.period_start:
            raise HTTPException(status_code=400, detail="O fim do período vem antes do início.")
        if data.kind == "taxa_erros" and not data.transactions:
            raise HTTPException(status_code=400, detail="Informe o volume de transações do período.")
        if data.kind == "disponibilidade" and data.value is None:
            raise HTTPException(status_code=400, detail="Informe a disponibilidade do período (%).")
        db.add(ProjectAssistedOpMeasure(
            task_id=root_id, kind=data.kind, period_start=data.period_start, period_end=data.period_end,
            value=Decimal(str(data.value)) if data.kind == "disponibilidade" else None,
            transactions=data.transactions if data.kind == "taxa_erros" else None,
            note=(data.note or "").strip() or None, created_by=user.id,
        ))
        await db.commit()
        return await AssistedOpsIndicatorsService.compute(db, root_id, user)

    @staticmethod
    async def delete_measure(db: AsyncSession, root_id: uuid.UUID, measure_id: uuid.UUID, user: User) -> AssistedOpsIndicators:
        m = await db.get(ProjectAssistedOpMeasure, measure_id)
        if m is None or m.task_id != root_id:
            raise HTTPException(status_code=404, detail="Medição não encontrada.")
        if not (m.created_by == user.id or await AssistedOpsService._can_manage_oa(db, user, root_id)):
            raise HTTPException(status_code=403, detail="Só quem lançou, o PO ou a coordenação excluem a medição.")
        await db.delete(m)
        await db.commit()
        return await AssistedOpsIndicatorsService.compute(db, root_id, user)


class AssistedOpsClosureService:

    @staticmethod
    async def _donos(db: AsyncSession, root: ProjectTask) -> list[ProjectClient]:
        """Donos do Processo do projeto (ou do programa dele)."""
        ids = set((await db.execute(
            select(ProjectClientAccess.client_id).where(
                ProjectClientAccess.task_id == root.id, ProjectClientAccess.project_role == "dono_processo",
            )
        )).scalars().all())
        if root.linked_program_id:
            ids |= set((await db.execute(
                select(ProjectProgramClientAccess.client_id).where(
                    ProjectProgramClientAccess.program_id == root.linked_program_id,
                    ProjectProgramClientAccess.project_role == "dono_processo",
                )
            )).scalars().all())
        if not ids:
            return []
        return list((await db.execute(
            select(ProjectClient).where(ProjectClient.id.in_(ids), ProjectClient.is_active == True)  # noqa: E712
            .order_by(ProjectClient.full_name)
        )).scalars().all())

    @staticmethod
    async def _open_occurrences(db: AsyncSession, root_id: uuid.UUID) -> int:
        return (await db.execute(
            select(func.count()).select_from(ProjectOccurrence)
            .join(ProjectTask, ProjectTask.id == ProjectOccurrence.task_id)
            .join(ProjectStatusConfig, ProjectStatusConfig.id == ProjectTask.status_id)
            .where(ProjectOccurrence.project_task_id == root_id, ProjectStatusConfig.is_final == False)  # noqa: E712
        )).scalar() or 0

    @staticmethod
    def _estrategica(data: dict) -> bool:
        return bool(data.get("decisao_estrategica")) and len((data.get("decisao_texto") or "").strip()) >= 10

    @staticmethod
    def _missing(data: dict, open_count: int, *, with_aceite: bool = True) -> list[str]:
        faltam: list[str] = []
        if open_count:
            faltam.append(f"finalizar {open_count} ocorrência(s) aberta(s)")
        crit = data.get("criterios") or {}
        estrategica = AssistedOpsClosureService._estrategica(data)
        if not estrategica and not all(crit.get(k) for k, _l in CRITERIOS):
            faltam.append("confirmar os critérios de saída (ou registrar a decisão estratégica)")
        analise = data.get("analise") or {}
        vazias = [label for k, label in ANALISE if k in ANALISE_OBRIGATORIA and len((analise.get(k) or "").strip()) < 3]
        if vazias:
            faltam.append("escrever a análise crítica (" + ", ".join(vazias) + ")")
        aceite = data.get("aceite") or {}
        if with_aceite and not estrategica and aceite.get("status") != "aceito" and not data.get("override"):
            faltam.append("aceite do Dono do Processo")
        return faltam

    @staticmethod
    def _status_from(respostas: dict, donos: list[ProjectClient]) -> str:
        if any(r.get("approved") is False for r in respostas.values()):
            return "recusado"
        com_login = [d for d in donos if d.user_id]
        if com_login and all((respostas.get(str(d.id)) or {}).get("approved") is True for d in com_login):
            return "aceito"
        return "pendente"

    @staticmethod
    async def state(
        db: AsyncSession, root_id: uuid.UUID, user: Optional[User], viewer_client: Optional[ProjectClient] = None,
    ) -> AssistedOpsClosureState:
        from app.modules.projetos.service import ProjectTaskService

        root = await AssistedOpsService._root(db, root_id)
        data = dict(root.assisted_op_closure or {})
        crit = data.get("criterios") or {}
        analise = data.get("analise") or {}
        aceite = data.get("aceite") or {}
        respostas = aceite.get("respostas") or {}
        donos = await AssistedOpsClosureService._donos(db, root)
        open_count = await AssistedOpsClosureService._open_occurrences(db, root_id)
        missing = AssistedOpsClosureService._missing(data, open_count)
        status = await db.get(ProjectStatusConfig, root.status_id)
        can_accept = bool(
            viewer_client is not None and aceite.get("status") == "pendente"
            and any(d.id == viewer_client.id for d in donos)
            and str(viewer_client.id) not in respostas
        )
        return AssistedOpsClosureState(
            criterios=[AssistedOpsClosureItem(key=k, label=label, done=bool(crit.get(k))) for k, label in CRITERIOS],
            decisao_estrategica=bool(data.get("decisao_estrategica")),
            decisao_texto=data.get("decisao_texto"),
            analise=[AssistedOpsClosureItem(key=k, label=label, text=analise.get(k)) for k, label in ANALISE],
            aceite_status=aceite.get("status"),
            aceite_requested_at=aceite.get("requested_at"),
            aceite_requested_by=aceite.get("requested_by"),
            donos=[
                AssistedOpsClosureAnswer(
                    name=d.full_name, has_login=bool(d.user_id), answered=str(d.id) in respostas,
                    approved=(respostas.get(str(d.id)) or {}).get("approved"),
                    comment=(respostas.get(str(d.id)) or {}).get("comment"),
                    at=(respostas.get(str(d.id)) or {}).get("at"),
                )
                for d in donos
            ],
            override=data.get("override"),
            open_occurrences=open_count,
            missing=missing,
            ready=not missing,
            concluded=bool(status and ProjectTaskService._is_concluded_planning_status(status)),
            can_manage=await AssistedOpsService._can_manage_oa(db, user, root_id) if user else False,
            can_override=bool(user and (_is_admin(user) or await ProjectTaskService._is_coordination(db, user))),
            can_accept=can_accept,
        )

    @staticmethod
    async def save(db: AsyncSession, root_id: uuid.UUID, data: AssistedOpsClosureSet, user: User) -> AssistedOpsClosureState:
        root = await AssistedOpsService._root(db, root_id)
        if not await AssistedOpsService._can_manage_oa(db, user, root_id):
            raise HTTPException(status_code=403, detail="Só o PO do projeto ou a coordenação preparam o encerramento.")
        if root.assisted_op_entered_at is None:
            raise HTTPException(status_code=400, detail="O projeto não passou pela Operação Assistida.")
        cur = dict(root.assisted_op_closure or {})
        novo = {
            "criterios": {k: bool(data.criterios.get(k)) for k, _l in CRITERIOS},
            "decisao_estrategica": bool(data.decisao_estrategica),
            "decisao_texto": (data.decisao_texto or "").strip() or None,
            "analise": {k: (data.analise.get(k) or "").strip() for k, _l in ANALISE},
        }
        mudou = any(cur.get(k) != v for k, v in novo.items())
        cur.update(novo)
        # O Dono do Processo aceitou (ou vai aceitar) um conteúdo: mudou, pede de novo.
        if mudou and ((cur.get("aceite") or {}).get("status") in ("pendente", "aceito") or cur.get("override")):
            cur["aceite"] = {}
            cur.pop("override", None)
        root.assisted_op_closure = cur
        root.updated_at = datetime.utcnow()
        await db.commit()
        return await AssistedOpsClosureService.state(db, root_id, user)

    @staticmethod
    async def draft(db: AsyncSession, root_id: uuid.UUID, user: User) -> dict[str, str]:
        """Rascunho da análise crítica a partir das ocorrências, escalonamentos e atas."""
        root = await AssistedOpsService._root(db, root_id)
        if not await AssistedOpsService._can_manage_oa(db, user, root_id):
            raise HTTPException(status_code=403, detail="Só o PO do projeto ou a coordenação preparam o encerramento.")
        pairs = await AssistedOpsIndicatorsService._pairs(db, root_id)
        summaries = {s.task_id: s for s in await AssistedOpsService._summaries(db, pairs)}
        ind = await AssistedOpsIndicatorsService.compute(db, root_id, user)
        corr = [s for s in summaries.values() if s.is_correction]
        order = {"P1": 0, "P2": 1, "P3": 2, "P4": 3}
        corr.sort(key=lambda s: (order.get(s.prioridade, 9), s.code))
        linhas = [
            f"- {s.code_label} {s.title.split(' · ', 1)[-1]} — {s.criticidade or '—'}, "
            f"{'encerrada' if s.is_closed else 'aberta'}"
            + (f", prazo {'no alvo' if s.sla_state == 'ok' else 'estourado'}" if s.sla_state else "")
            for s in corr[:15]
        ]
        resumo = "; ".join(f"{i.label}: {i.display}" for i in ind.items if i.value is not None)
        incidentes = (f"{len(pairs)} ocorrência(s), {len(corr)} correção(ões).\n" + "\n".join(linhas)).strip()
        if resumo:
            incidentes += f"\n\nIndicadores: {resumo}."
        escalonadas = [s for s in summaries.values() if s.stage_key in ("n3_fornecedor", "escalonada_ie")]
        reprovadas = [s for s in corr if (next(o for o, t in pairs if t.id == s.task_id).rejection_count or 0) > 0]
        riscos = []
        if escalonadas:
            riscos.append("Escalonadas ainda abertas: " + ", ".join(f"{s.code_label} ({s.stage_name})" for s in escalonadas) + ".")
        if reprovadas:
            riscos.append("Correções reprovadas na validação (reincidência): " + ", ".join(s.code_label for s in reprovadas) + ".")
        abertas = [s for s in summaries.values() if not s.is_closed and s.stage_key not in _MELHORIA_KEYS]
        if abertas:
            riscos.append(f"{len(abertas)} ocorrência(s) ainda aberta(s).")
        melhorias = [
            f"- {s.code_label} {s.title.split(' · ', 1)[-1]}"
            + (" (encaminhada para Release)" if s.stage_key == "encaminhada_release" else " (em análise do PO)")
            for s in summaries.values()
            if s.stage_key in _MELHORIA_KEYS
        ]
        from app.modules.projetos.models import ProjectAssistedOpMeeting

        decisoes = [
            f"- {m.held_on:%d/%m} ({m.kind}): {m.decisions}"
            for m in (await db.execute(
                select(ProjectAssistedOpMeeting).where(ProjectAssistedOpMeeting.task_id == root_id)
                .order_by(ProjectAssistedOpMeeting.held_on)
            )).scalars().all()
            if (m.decisions or "").strip()
        ]
        return {
            "incidentes": incidentes,
            "riscos": "\n".join(riscos) or "Sem riscos remanescentes identificados nas ocorrências.",
            "melhorias": "\n".join(melhorias) or "Nenhuma melhoria registrada na Operação Assistida.",
            "licoes": ("Decisões registradas nos ritos:\n" + "\n".join(decisoes)) if decisoes else "",
            "plano": "",
        }

    @staticmethod
    async def request_acceptance(db: AsyncSession, root_id: uuid.UUID, user: User) -> AssistedOpsClosureState:
        root = await AssistedOpsService._root(db, root_id)
        if not await AssistedOpsService._can_manage_oa(db, user, root_id):
            raise HTTPException(status_code=403, detail="Só o PO do projeto ou a coordenação pedem o aceite.")
        data = dict(root.assisted_op_closure or {})
        falta = AssistedOpsClosureService._missing(data, 0, with_aceite=False)
        if falta:
            raise HTTPException(status_code=400, detail="Antes de pedir o aceite: " + "; ".join(falta) + ".")
        donos = await AssistedOpsClosureService._donos(db, root)
        if not donos:
            raise HTTPException(status_code=400, detail="Cadastre o Dono do Processo nos Clientes do projeto.")
        com_login = [d.user_id for d in donos if d.user_id]
        if not com_login:
            raise HTTPException(
                status_code=400,
                detail="O Dono do Processo ainda não entrou no sistema. Peça que acesse pelo IDigital ou registre o aceite (coordenação).",
            )
        data["aceite"] = {
            "status": "pendente", "requested_at": datetime.utcnow().isoformat(),
            "requested_by": user.full_name, "respostas": {},
        }
        data.pop("override", None)
        root.assisted_op_closure = data
        root.updated_at = datetime.utcnow()
        await notify_users(
            db, com_login, "Encerramento da Operação Assistida: seu aceite",
            f"O projeto {root.title} está pronto para encerrar a Operação Assistida. Veja a análise crítica e dê o aceite no Portal.",
            "oa_closure", root.id, exclude_user_id=user.id,
        )
        await db.commit()
        return await AssistedOpsClosureService.state(db, root_id, user)

    @staticmethod
    async def override(db: AsyncSession, root_id: uuid.UUID, data: AssistedOpsClosureOverride, user: User) -> AssistedOpsClosureState:
        """Coordenação registra o aceite quando o Dono do Processo não tem como responder no sistema."""
        from app.modules.projetos.service import ProjectTaskService

        root = await AssistedOpsService._root(db, root_id)
        if not (_is_admin(user) or await ProjectTaskService._is_coordination(db, user)):
            raise HTTPException(status_code=403, detail="Só a coordenação registra o aceite no lugar do Dono do Processo.")
        cur = dict(root.assisted_op_closure or {})
        cur["override"] = {"by": user.full_name, "at": datetime.utcnow().isoformat(), "justificativa": data.justificativa.strip()}
        root.assisted_op_closure = cur
        root.updated_at = datetime.utcnow()
        db.add(ProjectTaskComment(
            task_id=root.id, author_id=user.id, visibility="internal",
            content="<p><strong>Aceite do encerramento registrado pela coordenação</strong></p>" + _plain_to_html(data.justificativa),
        ))
        await db.commit()
        return await AssistedOpsClosureService.state(db, root_id, user)

    # ── Portal ───────────────────────────────────────────────────────────────
    @staticmethod
    async def _portal_root(db: AsyncSession, user_id: uuid.UUID, root_id: uuid.UUID) -> tuple[ProjectTask, dict]:
        from app.modules.projetos.program_portal import PortalPortfolioService

        scope = await PortalPortfolioService._scope(db, user_id)
        root = await db.get(ProjectTask, root_id)
        if root is None or root.parent_task_id is not None:
            raise HTTPException(status_code=404, detail="Projeto não encontrado.")
        allowed = (
            root.id in scope["direct"] or scope["all"]
            or (root.linked_program_id is not None and root.linked_program_id in scope["programs"])
        )
        if not allowed:
            raise HTTPException(status_code=404, detail="Projeto não encontrado.")
        if root.assisted_op_entered_at is None:
            raise HTTPException(status_code=404, detail="O projeto não passou pela Operação Assistida.")
        return root, scope

    @staticmethod
    async def portal_view(db: AsyncSession, user_id: uuid.UUID, root_id: uuid.UUID) -> PortalAssistedOps:
        root, scope = await AssistedOpsClosureService._portal_root(db, user_id, root_id)
        indicators = await AssistedOpsIndicatorsService.compute(db, root.id, None)
        closure = await AssistedOpsClosureService.state(db, root.id, None, scope["client"])
        return PortalAssistedOps(
            indicators=indicators, closure=closure,
            meetings=await AssistedOpsService.list_meetings(db, root.id, None),
            phase=root.assisted_op_phase, phase_label=OA_PHASES.get(root.assisted_op_phase or 0),
            entered_at=root.assisted_op_entered_at, due_date=root.assisted_op_due_date,
        )

    @staticmethod
    async def portal_accept(
        db: AsyncSession, user: User, root_id: uuid.UUID, data: AssistedOpsClosureAcceptance,
    ) -> PortalAssistedOps:
        root, scope = await AssistedOpsClosureService._portal_root(db, user.id, root_id)
        client = scope["client"]
        donos = await AssistedOpsClosureService._donos(db, root)
        if client is None or not any(d.id == client.id for d in donos):
            raise HTTPException(status_code=403, detail="Só o Dono do Processo dá o aceite do encerramento.")
        cur = dict(root.assisted_op_closure or {})
        aceite = dict(cur.get("aceite") or {})
        if aceite.get("status") != "pendente":
            raise HTTPException(status_code=400, detail="Não há aceite pendente para este projeto.")
        comment = (data.comment or "").strip()
        if not data.approve and len(comment) < 10:
            raise HTTPException(status_code=400, detail="Conte o que falta para encerrar (mín. 10 caracteres).")
        respostas = dict(aceite.get("respostas") or {})
        respostas[str(client.id)] = {
            "name": client.full_name, "approved": bool(data.approve), "comment": comment or None,
            "at": datetime.utcnow().isoformat(),
        }
        aceite["respostas"] = respostas
        aceite["status"] = AssistedOpsClosureService._status_from(respostas, donos)
        cur["aceite"] = aceite
        root.assisted_op_closure = cur
        root.updated_at = datetime.utcnow()
        verbo = "aceitou" if data.approve else "não aceitou"
        db.add(ProjectTaskComment(
            task_id=root.id, author_id=user.id, visibility="internal",
            content=f"<p><strong>{html.escape(client.full_name)} {verbo} o encerramento da Operação Assistida.</strong></p>"
                    + (_plain_to_html(comment) if comment else ""),
        ))
        from app.modules.projetos.ai_solutions import _COORD_SLUGS, AiSolutionsService

        title = f"Encerramento da Operação Assistida: {client.full_name} {verbo}"
        body = f"{root.title}." + (f" “{comment}”" if comment else "")
        await notify_persons(
            db, [root.assigned_to, *await AiSolutionsService._person_ids_by_cargo(db, slugs=_COORD_SLUGS)],
            title, body[:500], "project_task", root.id, exclude_user_id=user.id,
        )
        await db.commit()
        return await AssistedOpsClosureService.portal_view(db, user.id, root.id)

    # ── Trava e aviso ao concluir ────────────────────────────────────────────
    @staticmethod
    async def assert_ready(db: AsyncSession, root: ProjectTask) -> None:
        """POP 8.4: sai da Operação Assistida para Concluído só com o encerramento formal."""
        if root.assisted_op_entered_at is None:
            return
        falta = AssistedOpsClosureService._missing(dict(root.assisted_op_closure or {}), 0)
        if falta:
            raise HTTPException(
                status_code=400,
                detail="Encerramento da Operação Assistida (POP) incompleto no card do projeto: falta "
                       + "; ".join(falta) + ".",
            )

    @staticmethod
    async def on_concluded(db: AsyncSession, root: ProjectTask, actor_user_id: Optional[uuid.UUID]) -> None:
        """POP 8.5: formaliza o encerramento às partes (aviso no sistema; e-mail depende do Outlook)."""
        from app.modules.projetos.ai_solutions import _COORD_SLUGS, AiSolutionsService

        if root.assisted_op_entered_at is None:
            return
        cur = dict(root.assisted_op_closure or {})
        if cur.get("concluded_at"):
            return
        cur["concluded_at"] = datetime.utcnow().isoformat()
        root.assisted_op_closure = cur
        users = set((await db.execute(
            select(ProjectClient.user_id)
            .join(ProjectClientAccess, ProjectClientAccess.client_id == ProjectClient.id)
            .where(ProjectClientAccess.task_id == root.id, ProjectClientAccess.project_role.in_(_PARTES),
                   ProjectClient.is_active == True, ProjectClient.user_id.isnot(None))  # noqa: E712
        )).scalars().all())
        if root.linked_program_id:
            users |= set((await db.execute(
                select(ProjectClient.user_id)
                .join(ProjectProgramClientAccess, ProjectProgramClientAccess.client_id == ProjectClient.id)
                .where(ProjectProgramClientAccess.program_id == root.linked_program_id,
                       ProjectProgramClientAccess.project_role.in_(_PARTES),
                       ProjectClient.is_active == True, ProjectClient.user_id.isnot(None))  # noqa: E712
            )).scalars().all())
        title = f"Operação Assistida encerrada: {root.title}"
        body = "A análise crítica e os indicadores estão no Portal, na aba Operação Assistida do projeto."
        await notify_users(db, list(users), title, body, "oa_closure", root.id, exclude_user_id=actor_user_id)
        await notify_persons(
            db, [root.assigned_to, *await AiSolutionsService._person_ids_by_cargo(db, slugs=_COORD_SLUGS)],
            title, body, "project_task", root.id, exclude_user_id=actor_user_id,
        )
