"""
Base de busca por significado do Assistente do Portal (pgvector + bge-m3).

O assistente continua montando o contexto com os dados estruturados do Portal
(`portal_assistant.build_context`). A busca acrescenta os trechos mais ligados à pergunta e
ajuda a escolher os projetos detalhados — em vez de só casar palavras.

Regras (decididas em 2026-09-27; ver .claude/invariantes.md):
- Só entra o que o Portal JÁ mostra ao cliente: nome do projeto/produto/programa/pilar/área,
  títulos de Features e histórias (montados de `PortalPortfolioService._base`, o mesmo das
  telas), descrição de programas e pilares, ocorrências (campos que o cliente vê + comentários
  públicos), atas e encerramento da Operação Assistida. Descrição de card de Projeto, Feature ou
  História e comentário interno NUNCA entram.
- Cada trecho guarda o `scope_id` (card-raiz ou programa). A busca filtra no SQL pelo recorte de
  quem pergunta; ocorrências usam o recorte próprio delas (cliente vinculado, N1, coordenação).
- Dado vivo (situação, datas, % de evolução) não vem do trecho: o trecho só acha o item; a
  linha que vai para a IA é montada na hora com os dados atuais.
- Log do assistente: só métricas, nunca a pergunta (a conversa não é gravada).
- Busca fora do ar não derruba o assistente: ele responde como antes, só com os dados.
"""
from __future__ import annotations

import html
import logging
import re
import time
import uuid
from contextlib import asynccontextmanager
from datetime import datetime, timedelta
from typing import Any, Optional

from fastapi import HTTPException
from sqlalchemy import delete, func, select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.embeddings import Doc, EmbeddingService, EmbeddingsUnavailable
from app.modules.projetos.models import (
    ProjectAiAssistantLog,
    ProjectAiAssistantSettings,
    ProjectAiSyncRun,
    ProjectAssistedOpMeeting,
    ProjectOccurrence,
    ProjectStatusConfig,
    ProjectTask,
    ProjectTaskComment,
)

logger = logging.getLogger(__name__)

# Origem → rótulo (tela de Configurações). A ordem é a da tela.
SOURCES: dict[str, str] = {
    "portal_projeto": "Projetos (nome, produto, programa, pilar e área)",
    "portal_feature": "Features",
    "portal_historia": "Histórias",
    "portal_programa": "Programas e pilares (descrição)",
    "portal_ocorrencia": "Ocorrências (texto visível ao cliente e comentários públicos)",
    "portal_ata": "Atas dos ritos da Operação Assistida",
    "portal_encerramento": "Encerramento da Operação Assistida (decisão e análise crítica)",
}
# scope_id = card-raiz do projeto (recorte do portfólio)
ROOT_TYPES = ("portal_projeto", "portal_feature", "portal_historia", "portal_ata", "portal_encerramento")
# scope_id = programa
PROGRAM_TYPES = ("portal_programa",)
# scope_id = card-raiz, mas com o recorte das ocorrências (mais estreito)
OCCURRENCE_TYPES = ("portal_ocorrencia",)

DEFAULTS = {"rag_enabled": True, "top_k": 8, "min_score": 0.45, "auto_sync": True}
RETENTION_DAYS = 90          # logs de perguntas e execuções
LOCK_TTL = 15 * 60           # trava por tenant; renovada a cada grupo gravado (pulso)
MAX_TEXT = 6000              # por registro (ocorrência com muitos comentários)

OCC_TIPO = {"erro": "Erro", "duvida": "Dúvida", "ajuste": "Ajuste", "melhoria": "Melhoria"}
MEETING_KINDS = {"diaria": "Diária", "semanal": "Semanal", "comite": "Comitê"}
# Mesmos rótulos de assisted_ops_closure.ANALISE (sem importar o módulo inteiro aqui).
CLOSURE_LABELS = [
    ("incidentes", "Principais incidentes ocorridos"),
    ("riscos", "Riscos remanescentes"),
    ("melhorias", "Melhorias a serem avaliadas"),
    ("licoes", "Lições aprendidas"),
    ("plano", "Plano de ações pós-estabilização"),
]


def plain(value: Optional[str]) -> str:
    """HTML do editor → texto (sem tags, entidades resolvidas, espaços normalizados)."""
    if not value:
        return ""
    t = re.sub(r"<\s*(br|/p|/li|/div|/h\d)\s*/?>", "\n", value, flags=re.IGNORECASE)
    t = re.sub(r"<[^>]+>", " ", t)
    t = html.unescape(t)
    t = re.sub(r"[ \t\xa0]+", " ", t)
    t = re.sub(r" *\n *", "\n", t)
    t = re.sub(r"\n{2,}", "\n", t)
    return t.strip()


def _lines(*pairs: tuple[str, Optional[str]]) -> str:
    return "\n".join(f"{label}: {value}" if label else value for label, value in pairs if value)


@asynccontextmanager
async def tenant_session(schema: str):
    """Sessão do Celery no schema do tenant, com o search_path reaplicado a cada transação
    (mesmo hook de `require_module`): asyncpg perde o SET entre um COMMIT e o próximo BEGIN, e a
    sincronização faz commit a cada grupo de trechos ("relation ... does not exist")."""
    from sqlalchemy import event

    from app.core.database import AsyncSessionLocal
    from app.core.embeddings import _schema

    path = f"{_schema(schema)}, public"
    async with AsyncSessionLocal() as db:
        await db.execute(text(f"SET search_path TO {path}"))

        def _reapply(_session, _transaction, connection):
            connection.exec_driver_sql(f"SET search_path TO {path}")

        event.listen(db.sync_session, "after_begin", _reapply)
        try:
            yield db
        finally:
            event.remove(db.sync_session, "after_begin", _reapply)
            try:
                await db.rollback()
                await db.execute(text("SET search_path TO public"))
                await db.commit()
            except Exception:  # noqa: BLE001
                pass


def _uuid(value: Any) -> Optional[uuid.UUID]:
    if not value:
        return None
    try:
        return value if isinstance(value, uuid.UUID) else uuid.UUID(str(value))
    except ValueError:
        return None


# ── textos (puros, testados) ──────────────────────────────────────────────────

def docs_from_base(base: dict, enabled: set[str]) -> list[Doc]:
    """Projetos, Features, histórias, programas e pilares — do mesmo `_base` das telas do Portal
    (itens "não realizados" já ficam de fora lá). Só títulos e nomes; descrição de card não."""
    docs: list[Doc] = []
    pillars = {p["id"]: p for p in base.get("pillars", [])}
    for p in base.get("projects", []):
        if p.get("cancelled"):
            continue
        root = _uuid(p["task_id"])
        if root is None:
            continue
        pillar = pillars.get(p.get("pillar_id")) or {}
        if "portal_projeto" in enabled:
            docs.append(Doc("portal_projeto", root, root, _lines(
                ("Projeto", p.get("title")),
                ("Produto", p.get("subtitle")),
                ("Programa", p.get("program_name")),
                ("Pilar", pillar.get("name")),
                ("Área", p.get("area_label")),
            )))
        for f in p.get("features") or []:
            fid = _uuid(f.get("id"))
            if fid and "portal_feature" in enabled:
                docs.append(Doc("portal_feature", fid, root, _lines(
                    ("Feature", " ".join(x for x in (f.get("code"), f.get("title")) if x)),
                    ("Projeto", p.get("title")),
                )))
            for s in f.get("stories") or []:
                sid = _uuid(s.get("id"))
                if sid and "portal_historia" in enabled:
                    docs.append(Doc("portal_historia", sid, root, _lines(
                        ("História", " ".join(x for x in (s.get("code"), s.get("title")) if x)),
                        ("Feature", f.get("title")),
                        ("Projeto", p.get("title")),
                    )))
        for s in p.get("orphan_stories") or []:
            sid = _uuid(s.get("id"))
            if sid and "portal_historia" in enabled:
                docs.append(Doc("portal_historia", sid, root, _lines(
                    ("História", " ".join(x for x in (s.get("code"), s.get("title")) if x)),
                    ("Projeto", p.get("title")),
                )))
    if "portal_programa" in enabled:
        for g in (base.get("programs") or {}).values():
            gid = _uuid(g.get("id"))
            if gid:
                docs.append(Doc("portal_programa", gid, gid, _lines(
                    ("Programa", g.get("name")), ("Descrição", plain(g.get("description"))),
                )))
        for pl in base.get("pillars", []):
            plid, gid = _uuid(pl.get("id")), _uuid(pl.get("program_id"))
            if plid and gid:
                docs.append(Doc("portal_programa", plid, gid, _lines(
                    ("Pilar", pl.get("name")), ("Descrição", plain(pl.get("description"))),
                )))
    return docs


def occurrence_text(
    title: str, tipo: Optional[str], funcionalidade: Optional[str], description: Optional[str],
    passos: Optional[str], esperado: Optional[str], solucao: Optional[str], nps_comment: Optional[str],
    public_comments: list[str],
) -> str:
    """Só os campos que o cliente vê no detalhe da ocorrência (sem causa raiz, classificação
    nem comentário interno)."""
    body = _lines(
        ("Ocorrência", title),
        ("Tipo", OCC_TIPO.get(tipo or "", tipo)),
        ("Funcionalidade", funcionalidade),
        ("O que aconteceu", plain(description)),
        ("Passos", plain(passos)),
        ("Esperado", plain(esperado)),
        ("Solução", plain(solucao)),
        ("Comentário na homologação", plain(nps_comment)),
    )
    comments = [c for c in (plain(x) for x in public_comments) if c]
    if comments:
        body += "\nComentários:\n" + "\n".join(f"- {c}" for c in comments)
    return body[:MAX_TEXT]


def meeting_text(kind: str, held_on: Optional[str], phase: Optional[int], summary: Optional[str],
                 decisions: Optional[str]) -> str:
    """Ata do rito (sem a lista de participantes: não ajuda a busca e é dado pessoal)."""
    head = f"Ata de reunião {MEETING_KINDS.get(kind, kind).lower()} da Operação Assistida"
    if held_on:
        head += f" de {held_on}"
    if phase:
        head += f" (fase {phase})"
    return _lines(("", head), ("Resumo", plain(summary)), ("Decisões", plain(decisions)))[:MAX_TEXT]


def closure_text(closure: Optional[dict]) -> str:
    data = closure or {}
    analise = data.get("analise") or {}
    parts: list[tuple[str, Optional[str]]] = [("", "Encerramento da Operação Assistida")]
    if data.get("decisao_estrategica") and data.get("decisao_texto"):
        parts.append(("Decisão estratégica", plain(data.get("decisao_texto"))))
    parts += [(label, plain(analise.get(key))) for key, label in CLOSURE_LABELS]
    if len([v for _l, v in parts if v]) <= 1:
        return ""
    return _lines(*parts)[:MAX_TEXT]


def dedupe_hits(hits: list[dict], top_k: int) -> list[dict]:
    """Um trecho por registro (o de maior nota), na ordem da nota."""
    best: dict[tuple, dict] = {}
    for h in hits:
        key = (h["source_type"], h["source_id"])
        if key not in best or h["score"] > best[key]["score"]:
            best[key] = h
    return sorted(best.values(), key=lambda h: -h["score"])[:top_k]


def search_query(question: str, history: list) -> str:
    """Pergunta curta de continuação ("e o prazo dele?") leva junto a pergunta anterior."""
    q = (question or "").strip()
    if len(q) < 80:
        prev = next((h.content for h in reversed(history or []) if getattr(h, "role", "") == "user"), "")
        if prev:
            q = f"{prev[:300]}\n{q}"
    return q


# ── serviço ───────────────────────────────────────────────────────────────────

class AssistantKnowledgeService:

    # ── ajustes ──
    @staticmethod
    async def get_settings(db: AsyncSession, create: bool = False) -> ProjectAiAssistantSettings:
        row = (await db.execute(select(ProjectAiAssistantSettings).limit(1))).scalar_one_or_none()
        if row is None:
            row = ProjectAiAssistantSettings(**DEFAULTS)
            if create:
                db.add(row)
                await db.commit()
                await db.refresh(row)
        return row

    @staticmethod
    def enabled_sources(row: ProjectAiAssistantSettings) -> list[str]:
        chosen = row.sources if row.sources is not None else list(SOURCES)
        return [k for k in SOURCES if k in chosen]

    @staticmethod
    async def update_settings(db: AsyncSession, data, user_id: uuid.UUID) -> ProjectAiAssistantSettings:
        row = await AssistantKnowledgeService.get_settings(db, create=True)
        for key in ("rag_enabled", "top_k", "min_score", "auto_sync"):
            value = getattr(data, key, None)
            if value is not None:
                setattr(row, key, value)
        if data.sources is not None:
            unknown = [s for s in data.sources if s not in SOURCES]
            if unknown:
                raise HTTPException(status_code=422, detail=f"Origem desconhecida: {', '.join(unknown)}")
            row.sources = [s for s in SOURCES if s in data.sources]
        row.updated_by = user_id
        row.updated_at = datetime.utcnow()
        await db.commit()
        await db.refresh(row)
        return row

    # ── montagem da base ──
    @staticmethod
    async def build_docs(db: AsyncSession, enabled: list[str]) -> list[Doc]:
        """Tudo o que deve estar no índice agora (o tenant já no search_path)."""
        from app.modules.projetos.program_portal import PortalPortfolioService

        on = set(enabled)
        base = await PortalPortfolioService._base(db)
        docs = docs_from_base(base, on)
        live_roots = {uuid.UUID(p["task_id"]) for p in base.get("projects", []) if not p.get("cancelled")}

        if "portal_ocorrencia" in on:
            rows = (await db.execute(
                select(ProjectOccurrence, ProjectTask.title, ProjectTask.description)
                .join(ProjectTask, ProjectTask.id == ProjectOccurrence.task_id)
            )).all()
            task_ids = [o.task_id for o, _t, _d in rows]
            comments: dict[uuid.UUID, list[str]] = {}
            if task_ids:
                for c in (await db.execute(
                    select(ProjectTaskComment.task_id, ProjectTaskComment.content)
                    .where(ProjectTaskComment.task_id.in_(task_ids),
                           ProjectTaskComment.visibility == "public",
                           ProjectTaskComment.author_id.isnot(None))
                    .order_by(ProjectTaskComment.created_at)
                )).all():
                    comments.setdefault(c.task_id, []).append(c.content)
            for o, title, description in rows:
                if o.project_task_id not in live_roots:
                    continue
                docs.append(Doc("portal_ocorrencia", o.task_id, o.project_task_id, occurrence_text(
                    title, o.tipo, o.funcionalidade, description, o.passos, o.esperado, o.solucao,
                    o.nps_comment, comments.get(o.task_id, []),
                )))

        if on & {"portal_ata", "portal_encerramento"}:
            roots = (await db.execute(
                select(ProjectTask.id, ProjectTask.assisted_op_closure)
                .where(ProjectTask.assisted_op_entered_at.isnot(None), ProjectTask.parent_task_id.is_(None))
            )).all()
            oa_roots = {r.id for r in roots if r.id in live_roots}
            if "portal_ata" in on and oa_roots:
                for m in (await db.execute(
                    select(ProjectAssistedOpMeeting).where(ProjectAssistedOpMeeting.task_id.in_(oa_roots))
                )).scalars().all():
                    docs.append(Doc("portal_ata", m.id, m.task_id, meeting_text(
                        m.kind, m.held_on.strftime("%d/%m/%Y") if m.held_on else None, m.phase, m.summary, m.decisions,
                    )))
            if "portal_encerramento" in on:
                for r in roots:
                    if r.id in oa_roots:
                        body = closure_text(r.assisted_op_closure)
                        if body:
                            docs.append(Doc("portal_encerramento", r.id, r.id, body))
        return docs

    # ── busca para quem pergunta (Assistente do Portal) ──
    @staticmethod
    async def _occurrence_roots(db: AsyncSession, user_id: uuid.UUID, visible_roots: set[uuid.UUID]) -> set[uuid.UUID]:
        """Projetos em que a pessoa vê ocorrências no Portal (mesmo recorte de `portal_list`)."""
        from app.modules.projetos.assisted_ops import AssistedOpsService

        try:
            client, team_all, n1_roots = await AssistedOpsService._portal_viewer(db, user_id)
        except HTTPException:
            return set()  # PO/dev no Modo Cliente não veem ocorrências
        if team_all:
            return set(visible_roots)
        allowed = ({a.task_id for a in client.access} if client is not None else set()) | set(n1_roots)
        return allowed & visible_roots

    @staticmethod
    async def viewer_hits(
        db: AsyncSession, schema: str, user_id: uuid.UUID, question: str, history: list,
        visible: list[dict], programs: list[dict],
    ) -> tuple[list[dict], dict]:
        """Trechos do recorte da pessoa ligados à pergunta + info para o log. Nunca levanta:
        sem busca, o assistente segue só com os dados estruturados."""
        info: dict = {"mode": "desligada", "hits": 0, "top_score": None, "types": None, "ms": None}
        if not EmbeddingService.enabled():
            return [], info
        try:
            if not await EmbeddingService.table_ready(db, schema):
                info["mode"] = "sem_indice"
                return [], info
            cfg = await AssistantKnowledgeService.get_settings(db)
            if not cfg.rag_enabled:
                return [], info
            enabled = set(AssistantKnowledgeService.enabled_sources(cfg))
            roots = {uuid.UUID(p["task_id"]) for p in visible}
            program_ids = {uuid.UUID(g["id"]) for g in programs}
            occ_roots = (
                await AssistantKnowledgeService._occurrence_roots(db, user_id, roots)
                if "portal_ocorrencia" in enabled else set()
            )
            scopes = [
                ([t for t in ROOT_TYPES if t in enabled], list(roots)),
                ([t for t in PROGRAM_TYPES if t in enabled], list(program_ids)),
                ([t for t in OCCURRENCE_TYPES if t in enabled], list(occ_roots)),
            ]
            started = time.monotonic()
            raw = await EmbeddingService.search(
                db, schema, search_query(question, history), limit=cfg.top_k * 3,
                scopes=scopes, min_score=cfg.min_score, raise_unavailable=False,
            )
            info["ms"] = round((time.monotonic() - started) * 1000)
        except EmbeddingsUnavailable as exc:
            logger.warning("assistente: busca indisponível (%s)", exc)
            info["mode"] = "indisponivel"
            return [], info
        except Exception:  # noqa: BLE001 — a busca nunca derruba o assistente
            logger.exception("assistente: falha na busca por significado")
            info["mode"] = "indisponivel"
            return [], info

        hits = dedupe_hits(raw, cfg.top_k)
        await AssistantKnowledgeService._enrich_occurrences(db, hits)
        info.update(
            mode="busca" if hits else "sem_trechos",
            hits=len(hits),
            top_score=round(hits[0]["score"], 4) if hits else None,
            types={t: sum(1 for h in hits if h["source_type"] == t) for t in {h["source_type"] for h in hits}} or None,
        )
        return hits, info

    @staticmethod
    async def _enrich_occurrences(db: AsyncSession, hits: list[dict]) -> None:
        """Ocorrência achada: código e raia ATUAIS (o trecho guarda só o texto)."""
        ids = [h["source_id"] for h in hits if h["source_type"] == "portal_ocorrencia"]
        if not ids:
            return
        rows = (await db.execute(
            select(ProjectOccurrence.task_id, ProjectOccurrence.code, ProjectOccurrence.created_at,
                   ProjectStatusConfig.name)
            .join(ProjectTask, ProjectTask.id == ProjectOccurrence.task_id)
            .outerjoin(ProjectStatusConfig, ProjectStatusConfig.id == ProjectTask.status_id)
            .where(ProjectOccurrence.task_id.in_(ids))
        )).all()
        live = {r[0]: {"code": f"OC-{r[1]:04d}", "opened": r[2].date().isoformat() if r[2] else None, "stage": r[3]}
                for r in rows}
        for h in hits:
            if h["source_type"] == "portal_ocorrencia":
                h["live"] = live.get(h["source_id"])

    # ── log (só métricas) ──
    @staticmethod
    async def log_question(db: AsyncSession, **fields) -> None:
        try:
            db.add(ProjectAiAssistantLog(**fields))
            await db.commit()
        except Exception:  # noqa: BLE001 — log nunca atrapalha a resposta
            await db.rollback()
            logger.exception("assistente: falha ao gravar o log")

    # ── sincronização ──
    @staticmethod
    async def request_sync(db: AsyncSession, schema: str, user_id: uuid.UUID, force: bool) -> ProjectAiSyncRun:
        if not EmbeddingService.enabled() or not await EmbeddingService.table_ready(db, schema):
            raise HTTPException(status_code=409, detail="A busca por significado está desligada neste ambiente (VECTOR_ENABLED).")
        running = (await db.execute(
            select(ProjectAiSyncRun).where(
                ProjectAiSyncRun.status.in_(("na_fila", "rodando")),
                func.coalesce(ProjectAiSyncRun.heartbeat_at, ProjectAiSyncRun.created_at)
                > datetime.utcnow() - timedelta(seconds=LOCK_TTL),
            ).limit(1)
        )).scalar_one_or_none()
        if running is not None:
            raise HTTPException(status_code=409, detail="Já existe uma sincronização em andamento.")
        run = ProjectAiSyncRun(trigger="reindexar" if force else "manual", status="na_fila", requested_by=user_id)
        db.add(run)
        await db.commit()
        await db.refresh(run)
        try:
            from app.core.celery_app import celery_app

            celery_app.send_task("embeddings.sync_portal_knowledge", args=[schema, str(run.id), force])
        except Exception as exc:  # noqa: BLE001
            run.status, run.error_message, run.finished_at = "erro", f"Fila indisponível: {exc}", datetime.utcnow()
            await db.commit()
            raise HTTPException(status_code=503, detail="A fila de tarefas está indisponível. Tente de novo em instantes.")
        return run

    @staticmethod
    async def run_sync(schema: str, trigger: str, run_id: Optional[str] = None, force: bool = False) -> Optional[dict]:
        """Roda no Celery: monta a base, compara com o índice e grava só o que mudou.
        Agendada sem mudança não vira execução no log (só atualiza a "última verificação")."""
        from app.core.cache import get_redis

        lock_key = f"ai-knowledge-sync:{schema}"
        redis = None
        try:
            redis = get_redis()
            if not await redis.set(lock_key, "1", nx=True, ex=LOCK_TTL):
                if run_id is None:
                    return None
                # Manual pedida enquanto a agendada roda: espera a vez na próxima.
                async with tenant_session(schema) as db:
                    run = await db.get(ProjectAiSyncRun, uuid.UUID(run_id))
                    if run is not None:
                        run.status, run.finished_at = "ignorada", datetime.utcnow()
                        run.error_message = "Outra sincronização estava em andamento; tente de novo em alguns minutos."
                        await db.commit()
                return None
        except Exception:  # noqa: BLE001 — sem Redis, segue sem trava
            redis = None

        try:
            async with tenant_session(schema) as db:
                if not await EmbeddingService.table_ready(db, schema):
                    return None
                cfg = await AssistantKnowledgeService.get_settings(db, create=True)
                if run_id is None and not cfg.auto_sync:
                    return None
                return await AssistantKnowledgeService._sync(db, schema, cfg, trigger, run_id, force,
                                                            lock=(redis, lock_key) if redis is not None else None)
        finally:
            if redis is not None:
                try:
                    await redis.delete(lock_key)
                except Exception:  # noqa: BLE001
                    pass

    @staticmethod
    async def _sync(db: AsyncSession, schema: str, cfg: ProjectAiAssistantSettings, trigger: str,
                    run_id: Optional[str], force: bool, lock: Optional[tuple] = None) -> dict:
        started = time.monotonic()
        run = await db.get(ProjectAiSyncRun, uuid.UUID(run_id)) if run_id else None
        # Resultado em variáveis locais: depois de um rollback os objetos ficam expirados e
        # ler atributo deles faria IO implícito (proibido na sessão async).
        result = {"status": "erro", "changed": 0}
        try:
            enabled = AssistantKnowledgeService.enabled_sources(cfg)
            docs = await AssistantKnowledgeService.build_docs(db, enabled)
            if run is None:
                preview = await EmbeddingService.sync(db, schema, docs, list(SOURCES), dry_run=True)
                if preview.empty:
                    cfg.last_check_at, cfg.last_check_status, cfg.last_check_error = datetime.utcnow(), "ok", None
                    await AssistantKnowledgeService._purge(db)
                    await db.commit()
                    return {"changed": 0}
                run = ProjectAiSyncRun(trigger=trigger, status="rodando")
                db.add(run)
            run.status, run.started_at = "rodando", datetime.utcnow()
            run.heartbeat_at = run.started_at
            await db.commit()

            async def progress(done: int, total: int) -> None:
                # Pulso: renova a trava e marca a execução como viva (carga grande passa do TTL).
                run.progress_done, run.progress_total = done, total
                run.heartbeat_at = datetime.utcnow()
                await db.commit()
                if lock is not None:
                    try:
                        await lock[0].expire(lock[1], LOCK_TTL)
                    except Exception:  # noqa: BLE001
                        pass

            plan = await EmbeddingService.sync(db, schema, docs, list(SOURCES), force=force, on_progress=progress)
            run.status = "ok"
            run.docs_total = plan.docs_total
            run.docs_changed = sum(plan.changed.values())
            run.docs_removed = sum(plan.removed.values())
            run.chunks_embedded = len(plan.upserts)
            run.progress_done = run.progress_total = len(plan.upserts)
            run.by_type = {"alterados": plan.changed, "removidos": plan.removed}
            cfg.last_check_status, cfg.last_check_error = "ok", None
            result = {"status": "ok", "changed": sum(plan.changed.values()) + sum(plan.removed.values())}
        except EmbeddingsUnavailable as exc:
            await db.rollback()
            if run is not None:
                run.status, run.error_message = "erro", f"Serviço de embeddings indisponível: {exc}"
            cfg.last_check_status, cfg.last_check_error = "erro", f"Serviço de embeddings indisponível: {exc}"
        except Exception as exc:  # noqa: BLE001
            await db.rollback()
            logger.exception("[assistente] sincronização %s falhou", schema)
            if run is not None:
                run.status, run.error_message = "erro", str(exc)[:2000]
            cfg.last_check_status, cfg.last_check_error = "erro", str(exc)[:2000]
        cfg.last_check_at = datetime.utcnow()
        if run is not None:
            run.finished_at = datetime.utcnow()
            run.duration_ms = round((time.monotonic() - started) * 1000)
            if run not in db:
                db.add(run)
        await AssistantKnowledgeService._purge(db)
        await db.commit()
        return result

    @staticmethod
    async def _purge(db: AsyncSession) -> None:
        limit = datetime.utcnow() - timedelta(days=RETENTION_DAYS)
        await db.execute(delete(ProjectAiAssistantLog).where(ProjectAiAssistantLog.created_at < limit))
        await db.execute(delete(ProjectAiSyncRun).where(ProjectAiSyncRun.created_at < limit))
        # Execução presa (worker reiniciado no meio, sem pulso): vira erro para liberar a tela.
        stuck = datetime.utcnow() - timedelta(seconds=LOCK_TTL)
        for run in (await db.execute(
            select(ProjectAiSyncRun).where(
                ProjectAiSyncRun.status.in_(("na_fila", "rodando")),
                func.coalesce(ProjectAiSyncRun.heartbeat_at, ProjectAiSyncRun.created_at) < stuck,
            )
        )).scalars().all():
            run.status, run.finished_at = "erro", datetime.utcnow()
            run.error_message = run.error_message or "Interrompida (o worker reiniciou ou a fila não a executou)."

    # ── tela de Configurações ──
    @staticmethod
    async def status(db: AsyncSession, schema: str) -> dict:
        from app.modules.projetos.portal_assistant import PortalAssistantService
        from app.modules.projetos.service import ProjectAgentRunner

        cfg = await AssistantKnowledgeService.get_settings(db)
        enabled = AssistantKnowledgeService.enabled_sources(cfg)
        ext = (await db.execute(text("SELECT extversion FROM pg_extension WHERE extname = 'vector'"))).scalar()
        ready = EmbeddingService.enabled() and await EmbeddingService.table_ready(db, schema)
        service = await EmbeddingService.health()

        stats = {s["source_type"]: s for s in await EmbeddingService.stats(db, schema)} if ready else {}
        pending: Optional[dict] = None
        pending_error: Optional[str] = None
        if ready:
            try:
                docs = await AssistantKnowledgeService.build_docs(db, enabled)
                plan = await EmbeddingService.sync(db, schema, docs, list(SOURCES), dry_run=True)
                pending = {"changed": plan.changed, "removed": plan.removed, "chunks": len(plan.upserts),
                           "docs_total": plan.docs_total}
            except Exception as exc:  # noqa: BLE001
                logger.exception("assistente: falha ao calcular pendências")
                pending_error = str(exc)[:500]

        sources = []
        for key, label in SOURCES.items():
            st = stats.get(key) or {}
            sources.append({
                "key": key, "label": label, "enabled": key in enabled,
                "docs": st.get("docs", 0), "chunks": st.get("chunks", 0), "last_at": st.get("last_at"),
                "pending": (pending or {}).get("changed", {}).get(key, 0) + (pending or {}).get("removed", {}).get(key, 0),
            })
        models = sorted({m for s in stats.values() for m in s.get("models", [])})

        runs = (await db.execute(
            select(ProjectAiSyncRun).order_by(ProjectAiSyncRun.created_at.desc()).limit(1)
        )).scalars().all()
        current = (await db.execute(
            select(ProjectAiSyncRun).where(ProjectAiSyncRun.status.in_(("na_fila", "rodando")))
            .order_by(ProjectAiSyncRun.created_at.desc()).limit(1)
        )).scalar_one_or_none()

        since = datetime.utcnow() - timedelta(days=7)
        usage = (await db.execute(
            select(
                func.count(),
                func.count().filter(ProjectAiAssistantLog.hits > 0),
                func.avg(ProjectAiAssistantLog.top_score),
                func.avg(ProjectAiAssistantLog.total_ms),
                func.count().filter(ProjectAiAssistantLog.status != "ok"),
                func.count().filter(ProjectAiAssistantLog.search_mode == "indisponivel"),
                func.count(func.distinct(ProjectAiAssistantLog.user_id)),
            ).where(ProjectAiAssistantLog.created_at >= since)
        )).one()

        agent_ok = bool(ProjectAgentRunner._azure_sp_configured() and await PortalAssistantService._agent_id(db))
        return {
            "vector_enabled": EmbeddingService.enabled(),
            "extension_version": ext,
            "index_ready": ready,
            "service": service,
            "expected_model": settings.EMBEDDINGS_MODEL,
            "index_models": models,
            "assistant_ready": agent_ok,
            "settings": cfg,
            "sources": sources,
            "totals": {
                "docs": sum(s["docs"] for s in sources), "chunks": sum(s["chunks"] for s in sources),
                "last_at": max((s["last_at"] for s in sources if s["last_at"]), default=None),
            },
            "pending": pending,
            "pending_error": pending_error,
            "last_run": runs[0] if runs else None,
            "current_run": current,
            "usage_7d": {
                "questions": usage[0] or 0, "with_hits": usage[1] or 0,
                "avg_top_score": round(float(usage[2]), 3) if usage[2] is not None else None,
                "avg_total_ms": round(float(usage[3])) if usage[3] is not None else None,
                "errors": usage[4] or 0, "search_unavailable": usage[5] or 0, "users": usage[6] or 0,
            },
        }

    @staticmethod
    async def search_test(db: AsyncSession, schema: str, query: str, limit: int) -> list[dict]:
        """Busca da tela de Configurações (coordenação): base inteira, sem recorte, com nota bruta."""
        from app.modules.projetos.program_portal import PortalPortfolioService

        if not EmbeddingService.enabled() or not await EmbeddingService.table_ready(db, schema):
            raise HTTPException(status_code=409, detail="A busca por significado está desligada neste ambiente (VECTOR_ENABLED).")
        cfg = await AssistantKnowledgeService.get_settings(db)
        hits = await EmbeddingService.search(
            db, schema, query, source_types=AssistantKnowledgeService.enabled_sources(cfg), limit=limit,
        )
        base = await PortalPortfolioService._base(db)
        roots = {p["task_id"]: p["title"] for p in base.get("projects", [])}
        programs = {gid: g.get("name") for gid, g in (base.get("programs") or {}).items()}
        return [
            {
                "source_type": h["source_type"], "source_label": SOURCES.get(h["source_type"], h["source_type"]),
                "source_id": h["source_id"], "scope_id": h["scope_id"],
                "scope_title": roots.get(str(h["scope_id"])) or programs.get(str(h["scope_id"])),
                "chunk_index": h["chunk_index"], "content": h["content"], "score": round(h["score"], 4),
                "above_min": h["score"] >= cfg.min_score,
            }
            for h in hits
        ]

    @staticmethod
    async def list_runs(db: AsyncSession, limit: int, offset: int) -> dict:
        total = (await db.execute(select(func.count()).select_from(ProjectAiSyncRun))).scalar() or 0
        items = (await db.execute(
            select(ProjectAiSyncRun).order_by(ProjectAiSyncRun.created_at.desc()).limit(limit).offset(offset)
        )).scalars().all()
        return {"items": items, "total": total, "limit": limit, "offset": offset}

    @staticmethod
    async def list_logs(db: AsyncSession, limit: int, offset: int, status: Optional[str]) -> dict:
        from app.modules.super_admin.models import User

        q = select(ProjectAiAssistantLog)
        count_q = select(func.count()).select_from(ProjectAiAssistantLog)
        if status:
            q = q.where(ProjectAiAssistantLog.status == status)
            count_q = count_q.where(ProjectAiAssistantLog.status == status)
        total = (await db.execute(count_q)).scalar() or 0
        rows = (await db.execute(
            q.order_by(ProjectAiAssistantLog.created_at.desc()).limit(limit).offset(offset)
        )).scalars().all()
        user_ids = {r.user_id for r in rows if r.user_id}
        names = {
            u.id: u.full_name for u in (await db.execute(select(User).where(User.id.in_(user_ids)))).scalars().all()
        } if user_ids else {}
        items = [
            {**{c: getattr(r, c) for c in (
                "id", "created_at", "user_id", "viewer", "status", "search_mode", "hits", "top_score", "hit_types",
                "projects_in_scope", "context_chars", "search_ms", "total_ms",
            )}, "user_name": names.get(r.user_id)}
            for r in rows
        ]
        return {"items": items, "total": total, "limit": limit, "offset": offset}
