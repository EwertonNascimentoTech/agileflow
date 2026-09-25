"""
Soluções com IA — qualquer pessoa com acesso à plataforma (cliente pelo Portal; equipe pelo
Modo Cliente ou por Nova Solicitação) pede a análise
de uma solução que ele mesmo vai construir numa ferramenta de IA autorizada (ex.: Base44); a TI
analisa, adequa, publica e sustenta.

Fluxo (spec: `.claude/invariantes.md` → Soluções com IA):
- Kanban "Soluções com IA" no container do processo (`ensure`), raias com chave fixa
  (`ai_stage_key`) — as regras leem a chave, nunca o nome. Fluxo livre (sem transições travadas).
- O pedido nasce no Portal (IA-0001): card em Solicitação → Análise e Aprovação.
- Quem pediu age só pelo Portal/Modo Cliente (a coordenação lê todos): ajustar e reenviar (Necessita Ajustes), avisar que tem versão
  funcional (Aguardando Desenvolvimento → Apresentação), homologar (aprovar → Segurança;
  reprovar → Adequação) e cancelar.
- Motivo obrigatório (428 `stage_reason_required`) ao entrar em Necessita Ajustes, Não Aprovado
  e Cancelado, e ao voltar etapa no fluxo principal. Vira comentário: público quando o cliente
  precisa saber, interno entre etapas do time.
- Checklists e registros de cada etapa são seções do formulário do tipo, editáveis na etapa e
  visíveis depois (obrigatórios travam o avanço, como em qualquer kanban).
- Não entra em Capacidade nem nos relatórios de portfólio.
"""
from __future__ import annotations

import html
import uuid
from datetime import datetime
from typing import Any, Optional

from fastapi import HTTPException
from sqlalchemy import func, select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.notifications import notify_persons, notify_users
from app.modules.projetos.models import (
    Project,
    ProjectAiSolution,
    ProjectClient,
    ProjectDemandFormField,
    ProjectDemandFormSection,
    ProjectDemandFormSubmission,
    ProjectDemandType,
    ProjectFunnel,
    ProjectStatusConfig,
    ProjectStatusDefaultFormLink,
    ProjectStatusSectionLink,
    ProjectTask,
    ProjectTaskComment,
    ProjectTaskStatusHistory,
)
from app.modules.projetos.schemas import (
    AiSolutionCancel,
    AiSolutionCreate,
    AiSolutionDetail,
    AiSolutionField,
    AiSolutionForm,
    AiSolutionFormField,
    AiSolutionHomologation,
    AiSolutionReady,
    AiSolutionResubmit,
    AiSolutionSummary,
    OccurrenceComment,
    OccurrenceCommentCreate,
)
from app.modules.super_admin.models import User

FUNNEL_NAME = "Soluções com IA"
DEMAND_TYPE_SLUG = "solucao_ia"

STAGES: list[dict[str, Any]] = [
    {"key": "solicitacao", "name": "Solicitação", "color": "#64748B", "is_initial": True},
    {"key": "analise", "name": "Análise e Aprovação", "color": "#F59E0B"},
    {"key": "aguardando_cliente", "name": "Aguardando Desenvolvimento pelo Cliente", "color": "#0EA5E9"},
    {"key": "apresentacao", "name": "Apresentação da Solução", "color": "#8B5CF6"},
    {"key": "adequacao", "name": "Desenvolvimento / Adequação Técnica", "color": "#3B82F6"},
    {"key": "devops_hml", "name": "DevOps — Preparação e Homologação", "color": "#0D9488"},
    {"key": "homologacao", "name": "Homologação Funcional", "color": "#A855F7"},
    {"key": "seguranca", "name": "Segurança da Informação", "color": "#DC2626"},
    {"key": "liberacao", "name": "Liberação para Produção", "color": "#CA8A04"},
    {"key": "devops_prod", "name": "DevOps — Deploy em Produção", "color": "#0F766E"},
    {"key": "producao", "name": "Produção", "color": "#16A34A", "is_final": True},
    {"key": "necessita_ajustes", "name": "Necessita Ajustes", "color": "#F97316", "reason": True},
    {"key": "nao_aprovado", "name": "Não Aprovado", "color": "#6B7280", "is_final": True, "reason": True},
    {"key": "cancelado", "name": "Cancelado", "color": "#374151", "is_final": True, "reason": True},
]
MAIN_KEYS = [s["key"] for s in STAGES[:11]]
_ORDER = {s["key"]: i for i, s in enumerate(STAGES)}
# Motivo nesses destinos vai para o cliente (comentário público).
_CLIENT_FACING = frozenset({"necessita_ajustes", "nao_aprovado", "cancelado", "aguardando_cliente"})
CLIENT_ACTION = {"necessita_ajustes": "ajustar", "aguardando_cliente": "versao", "homologacao": "homologar"}

_YES_NO = {"items": [{"value": "Sim", "label": "Sim"}, {"value": "Não", "label": "Não"}]}
_TOOLS = {"items": [{"value": "Base44", "label": "Base44"}, {"value": "Outra", "label": "Outra (informe qual)"}]}


def _chk(key: str, label: str, required: bool = False) -> dict:
    return {"key": key, "label": label, "type": "checkbox", "required": required}


# Seções do formulário: `stage` = etapa em que se preenche (editável); nas etapas seguintes
# fica visível e, antes dela, oculta. `pedido` é preenchido pelo cliente no Portal.
SECTIONS: list[dict[str, Any]] = [
    {"key": "pedido", "title": "Pedido do cliente", "stage": "solicitacao", "fields": [
        {"key": "objetivo", "label": "Objetivo da solução", "type": "text_long", "required": True},
        {"key": "problema", "label": "Problema a ser resolvido", "type": "text_long", "required": True},
        {"key": "publico", "label": "Público / usuários", "type": "text_long", "required": True},
        {"key": "funcionalidades", "label": "Principais funcionalidades", "type": "text_long", "required": True},
        {"key": "integracoes", "label": "Integrações previstas", "type": "text_long", "required": True,
         "placeholder": "Sistemas com que a solução conversa. Se não houver, escreva “Nenhuma”."},
        {"key": "dados_envolvidos", "label": "Dados envolvidos", "type": "text_long", "required": True},
        {"key": "dados_pessoais", "label": "Envolve dados pessoais?", "type": "select", "required": True, "options": _YES_NO},
        {"key": "plataforma", "label": "Ferramenta de IA", "type": "select", "required": True, "options": _TOOLS},
        {"key": "plataforma_outra", "label": "Qual ferramenta?", "type": "text"},
        {"key": "custos", "label": "Custos previstos", "type": "text_long",
         "placeholder": "Licenças, planos pagos, APIs… (se houver)."},
    ]},
    {"key": "analise", "title": "Análise da coordenação", "stage": "analise", "fields": [
        _chk("chk_objetivo", "Objetivo da solução avaliado"),
        _chk("chk_semelhante", "Existência de solução semelhante verificada"),
        _chk("chk_andamento", "Projetos e demandas em andamento verificados"),
        _chk("chk_reaproveitamento", "Possibilidade de reaproveitamento avaliada"),
        _chk("chk_custos", "Custos avaliados"),
        _chk("chk_integracoes", "Integrações avaliadas"),
        _chk("chk_dados", "Dados utilizados avaliados"),
        _chk("chk_impacto", "Impacto tecnológico avaliado"),
        _chk("chk_sustentacao", "Sustentação pela TI viável"),
        {"key": "parecer_coordenacao", "label": "Parecer da coordenação", "type": "text_long"},
    ]},
    {"key": "versao", "title": "Versão do cliente", "stage": "aguardando_cliente", "fields": [
        {"key": "versao_url", "label": "Link da versão funcional", "type": "url"},
        {"key": "repositorio_url", "label": "Repositório Git do cliente", "type": "url"},
    ]},
    {"key": "apresentacao", "title": "Apresentação da solução", "stage": "apresentacao", "fields": [
        _chk("apr_funcionalidades", "Funcionalidades desenvolvidas"),
        _chk("apr_fluxos", "Fluxos da aplicação"),
        _chk("apr_usuarios", "Usuários e perfis"),
        _chk("apr_dados", "Dados utilizados"),
        _chk("apr_integracoes", "Integrações"),
        _chk("apr_banco", "Banco de dados"),
        _chk("apr_limitacoes", "Limitações conhecidas"),
        _chk("apr_repositorio", "Repositório Git com o código-fonte recebido"),
        {"key": "apr_observacoes", "label": "Observações da apresentação", "type": "text_long"},
    ]},
    {"key": "adequacao", "title": "Adequação técnica", "stage": "adequacao", "fields": [
        {"key": "repositorio_oficial", "label": "Repositório oficial da organização", "type": "url", "required": True},
        {"key": "adequacoes", "label": "Adequações realizadas", "type": "text_long"},
    ]},
    {"key": "devops_hml", "title": "DevOps — homologação", "stage": "devops_hml", "fields": [
        {"key": "url_homologacao", "label": "URL de homologação", "type": "url", "required": True},
        _chk("pipeline_validada", "Pipeline configurada, funcional e validada", required=True),
    ]},
    {"key": "seguranca", "title": "Segurança da Informação", "stage": "seguranca", "fields": [
        {"key": "parecer_seguranca", "label": "Parecer de segurança", "type": "text_long", "required": True},
    ]},
    {"key": "liberacao", "title": "Liberação para produção", "stage": "liberacao", "fields": [
        _chk("lib_homologacao", "Homologação funcional aprovada", required=True),
        _chk("lib_seguranca", "Segurança aprovada", required=True),
        _chk("lib_repositorio", "Repositório institucional atualizado", required=True),
        _chk("lib_pipeline", "Pipeline configurada, funcional e validada", required=True),
        _chk("lib_resp_funcional", "Responsável funcional definido", required=True),
        _chk("lib_po", "PO responsável definido", required=True),
        _chk("lib_infra", "Infraestrutura preparada", required=True),
    ]},
    {"key": "producao", "title": "Produção", "stage": "devops_prod", "fields": [
        {"key": "url_producao", "label": "URL da aplicação", "type": "url", "required": True},
        {"key": "data_implantacao", "label": "Data da implantação", "type": "date", "required": True},
        {"key": "repositorio_producao", "label": "Repositório oficial", "type": "url", "required": True},
        {"key": "pipeline_producao", "label": "Pipeline", "type": "text", "required": True},
        {"key": "ambiente", "label": "Ambiente", "type": "text", "required": True},
        {"key": "responsavel_funcional", "label": "Responsável funcional", "type": "text", "required": True},
        {"key": "responsavel_tecnico", "label": "Responsável técnico", "type": "text", "required": True},
        {"key": "banco_dados", "label": "Banco de dados", "type": "text", "required": True},
        {"key": "integracoes_producao", "label": "Integrações", "type": "text_long"},
        {"key": "sustentacao", "label": "Informações para sustentação", "type": "text_long", "required": True},
    ]},
]
_PEDIDO_KEYS = [f["key"] for f in SECTIONS[0]["fields"]]

# Cargos avisados em cada etapa (slug do Cargo no TeamOps).
_DEVOPS_SLUGS = ("devops",)
_SECURITY_SLUGS = ("seguranca_informacao",)
# Coordenação que analisa e libera (cargos exatos; Administrativo comum e Gerente ficam de fora).
_COORD_SLUGS = ("coordenador", "administrativo_coordenacao", "coord_de_arq_dev_e_sustenta_o")


def code_label(code: int) -> str:
    return f"IA-{code:04d}"


def _plain_to_html(value: str) -> str:
    parts = [html.escape(p).replace("\n", "<br>") for p in value.strip().split("\n\n")]
    return "".join(f"<p>{p}</p>" for p in parts if p)


def _section_mode(section_stage: str, status_key: str) -> Optional[str]:
    """Modo da seção na etapa: editável na sua etapa, visível depois, oculta antes. Pedido
    também é editável em Necessita Ajustes; nas raias auxiliares só aparecem pedido e análise."""
    if section_stage == "solicitacao" and status_key == "necessita_ajustes":
        return "editable"
    if status_key == section_stage:
        return "editable"
    if status_key not in MAIN_KEYS:
        return "visible" if section_stage in ("solicitacao", "analise") else None
    return "visible" if _ORDER[status_key] > _ORDER[section_stage] else None


class AiSolutionsService:

    # ── Bootstrap ────────────────────────────────────────────────────────────
    @staticmethod
    async def _container_project_id(db: AsyncSession) -> uuid.UUID:
        """Processo que hospeda o kanban: o que já o tem, senão o do Projetos e Programas."""
        pid = (await db.execute(
            select(ProjectFunnel.project_id).where(ProjectFunnel.is_ai_solutions == True).limit(1)  # noqa: E712
        )).scalar_one_or_none()
        if pid is None:
            pid = (await db.execute(
                select(ProjectFunnel.project_id).where(func.lower(ProjectFunnel.name).like("%projetos%")).limit(1)
            )).scalar_one_or_none()
        if pid is None:
            pid = (await db.execute(select(Project.id).order_by(Project.created_at).limit(1))).scalar_one_or_none()
        if pid is None:
            raise HTTPException(status_code=404, detail="Nenhum processo cadastrado para receber as solicitações.")
        return pid

    @staticmethod
    async def ensure(db: AsyncSession) -> dict[str, Any]:
        """Funil + etapas + tipo + formulário por etapa. Idempotente: só cria o que falta;
        nome/cor/ordem ficam com a configuração depois de criados."""
        project_id = await AiSolutionsService._container_project_id(db)
        funnel = (await db.execute(
            select(ProjectFunnel).where(
                ProjectFunnel.project_id == project_id, ProjectFunnel.is_ai_solutions == True,  # noqa: E712
            ).limit(1)
        )).scalar_one_or_none()
        if funnel is None:
            max_order = (await db.execute(
                select(func.max(ProjectFunnel.order)).where(ProjectFunnel.project_id == project_id)
            )).scalar()
            funnel = ProjectFunnel(
                project_id=project_id,
                name=FUNNEL_NAME,
                description="Soluções com IA construídas pelas áreas e adequadas, publicadas e sustentadas pela TI.",
                color="#7C3AED",
                order=(max_order or 0) + 1,
                is_default=False,
                is_active=True,
                is_ai_solutions=True,
            )
            db.add(funnel)
            await db.flush()

        existing = list((await db.execute(
            select(ProjectStatusConfig).where(ProjectStatusConfig.funnel_id == funnel.id)
        )).scalars().all())
        by_key = {s.ai_stage_key: s for s in existing if s.ai_stage_key}
        stages: dict[str, ProjectStatusConfig] = {}
        for i, spec in enumerate(STAGES):
            st = by_key.get(spec["key"])
            if st is None:
                st = ProjectStatusConfig(
                    project_id=project_id,
                    funnel_id=funnel.id,
                    name=spec["name"],
                    color=spec["color"],
                    order=i,
                    is_initial=bool(spec.get("is_initial")),
                    is_final=bool(spec.get("is_final")),
                    is_active=True,
                    ai_stage_key=spec["key"],
                    entry_reason_required=bool(spec.get("reason")),
                )
                db.add(st)
            stages[spec["key"]] = st
        await db.flush()

        dt = (await db.execute(
            select(ProjectDemandType).where(ProjectDemandType.slug == DEMAND_TYPE_SLUG)
        )).scalar_one_or_none()
        if dt is None:
            dt = ProjectDemandType(
                slug=DEMAND_TYPE_SLUG,
                name="Solicitar análise de solução com IA",
                description="Solução com IA construída pela área (ex.: Base44) e adequada, publicada e sustentada pela TI.",
                funnel_id=funnel.id,
                available_for_basic=True,  # aparece em Nova Solicitação, que leva ao pedido do Portal
                show_in_schedule=False,
                order=98,
                is_active=True,
            )
            db.add(dt)
            await db.flush()
            funnel.allowed_demand_type_ids = [str(dt.id)]

        sections = {
            s.key: s for s in (await db.execute(
                select(ProjectDemandFormSection).where(ProjectDemandFormSection.demand_type_id == dt.id)
            )).scalars().all()
        }
        for order, spec in enumerate(SECTIONS):
            sec = sections.get(spec["key"])
            if sec is not None:
                continue  # seção já existe: campos e modos ficam com a configuração
            sec = ProjectDemandFormSection(
                demand_type_id=dt.id, key=spec["key"], title=spec["title"], order=order, is_active=True,
            )
            db.add(sec)
            await db.flush()
            for forder, f in enumerate(spec["fields"]):
                db.add(ProjectDemandFormField(
                    section_id=sec.id,
                    field_key=f["key"],
                    label=f["label"],
                    field_type=f["type"],
                    placeholder=f.get("placeholder"),
                    options=f.get("options"),
                    is_required=bool(f.get("required")),
                    is_active=True,
                    order=forder,
                ))
            for key, st in stages.items():
                mode = _section_mode(spec["stage"], key)
                if mode:
                    db.add(ProjectStatusSectionLink(status_id=st.id, section_id=sec.id, mode=mode))
        # PO definido antes da apresentação: o responsável do card é o PO de acompanhamento.
        apr = stages["apresentacao"]
        has_link = (await db.execute(
            select(ProjectStatusDefaultFormLink.id).where(
                ProjectStatusDefaultFormLink.status_id == apr.id,
                ProjectStatusDefaultFormLink.field_key == "assigned_to",
            )
        )).scalar_one_or_none()
        if has_link is None:
            db.add(ProjectStatusDefaultFormLink(status_id=apr.id, field_key="assigned_to", mode="required"))
        await db.flush()
        return {"funnel": funnel, "stages": stages, "demand_type": dt}

    # ── Apoio ────────────────────────────────────────────────────────────────
    @staticmethod
    async def get_solution(db: AsyncSession, task_id: uuid.UUID) -> Optional[ProjectAiSolution]:
        return (await db.execute(
            select(ProjectAiSolution).where(ProjectAiSolution.task_id == task_id)
        )).scalar_one_or_none()

    @staticmethod
    async def _person_ids_by_cargo(db: AsyncSession, slugs: tuple[str, ...] = (), tokens: tuple[str, ...] = ()) -> list[uuid.UUID]:
        from app.modules.teamops.models import Person, PersonStatus, Position

        rows = (await db.execute(
            select(Person.id, Position.slug)
            .join(Position, Position.id == Person.position_id)
            .where(Person.status != PersonStatus.DESLIGADO)
        )).all()
        out = []
        for pid, slug in rows:
            s = (slug or "").lower()
            if s in slugs or any(t in s for t in tokens):
                out.append(pid)
        return out

    @staticmethod
    async def _values(db: AsyncSession, task_id: uuid.UUID) -> dict:
        sub = (await db.execute(
            select(ProjectDemandFormSubmission).where(ProjectDemandFormSubmission.task_id == task_id)
        )).scalar_one_or_none()
        return dict(sub.values or {}) if sub else {}

    @staticmethod
    async def _save_values(db: AsyncSession, task_id: uuid.UUID, values: dict, user_id: Optional[uuid.UUID]) -> None:
        sub = (await db.execute(
            select(ProjectDemandFormSubmission).where(ProjectDemandFormSubmission.task_id == task_id)
        )).scalar_one_or_none()
        if sub is None:
            db.add(ProjectDemandFormSubmission(task_id=task_id, values=values, updated_by=user_id))
        else:
            sub.values = {**(sub.values or {}), **values}
            sub.updated_by = user_id
            sub.updated_at = datetime.utcnow()

    @staticmethod
    async def _pedido_fields(db: AsyncSession, dt_id: uuid.UUID) -> list[ProjectDemandFormField]:
        return list((await db.execute(
            select(ProjectDemandFormField)
            .join(ProjectDemandFormSection, ProjectDemandFormSection.id == ProjectDemandFormField.section_id)
            .where(
                ProjectDemandFormSection.demand_type_id == dt_id,
                ProjectDemandFormSection.key == "pedido",
                ProjectDemandFormField.is_active == True,  # noqa: E712
            )
            .order_by(ProjectDemandFormField.order)
        )).scalars().all())

    @staticmethod
    def _clean_pedido(fields: list[ProjectDemandFormField], raw: dict) -> dict:
        """Só os campos do pedido; obrigatórios preenchidos; seleção dentro das opções."""
        out: dict = {}
        faltam: list[str] = []
        for f in fields:
            value = raw.get(f.field_key)
            value = value.strip() if isinstance(value, str) else value
            if f.field_type == "select" and value:
                allowed = {str(i.get("value")) for i in ((f.options or {}).get("items") or [])}
                if allowed and str(value) not in allowed:
                    raise HTTPException(status_code=400, detail=f"Valor inválido em “{f.label}”.")
            if f.is_required and not value:
                faltam.append(f.label)
            out[f.field_key] = value or None
        if out.get("plataforma") == "Outra" and not out.get("plataforma_outra"):
            faltam.append("Qual ferramenta?")
        if faltam:
            raise HTTPException(status_code=400, detail="Preencha: " + ", ".join(faltam) + ".")
        return out

    # ── Movimento ────────────────────────────────────────────────────────────
    @staticmethod
    async def before_move(
        db: AsyncSession,
        task: ProjectTask,
        source: Optional[ProjectStatusConfig],
        target: Optional[ProjectStatusConfig],
        reason: Optional[str],
        user: Optional[User],
    ) -> None:
        """Motivo obrigatório (428) ao entrar em etapa que o exige ou ao voltar no fluxo
        principal do kanban Soluções com IA; `entry_reason_required` vale para qualquer kanban."""
        if target is None or (source is not None and source.id == target.id):
            return
        tkey = getattr(target, "ai_stage_key", None)
        skey = getattr(source, "ai_stage_key", None) if source is not None else None
        backward = bool(
            tkey in MAIN_KEYS and skey in MAIN_KEYS and _ORDER[tkey] < _ORDER[skey]
        )
        if not (getattr(target, "entry_reason_required", False) or backward):
            return
        texto = (reason or "").strip()
        if len(texto) < 10:
            raise HTTPException(status_code=428, detail={
                "code": "stage_reason_required",
                "stage_name": target.name,
                "backward": backward,
                "message": (
                    f"Informe o motivo para voltar o card para “{target.name}” (mín. 10 caracteres)."
                    if backward else
                    f"Informe o motivo para mover o card para “{target.name}” (mín. 10 caracteres)."
                ),
            })
        public = bool(tkey and (tkey in _CLIENT_FACING or skey == "homologacao"))
        db.add(ProjectTaskComment(
            task_id=task.id,
            author_id=user.id if user else None,
            content=f"<p><strong>{html.escape(target.name)}</strong> — motivo:</p>" + _plain_to_html(texto),
            visibility="public" if public else "internal",
        ))

    @staticmethod
    async def after_move(
        db: AsyncSession,
        task: ProjectTask,
        source: Optional[ProjectStatusConfig],
        target: Optional[ProjectStatusConfig],
        actor_user_id: Optional[uuid.UUID],
    ) -> None:
        """Avisos da entrada na etapa (time por cargo/responsável; cliente no que é dele)."""
        key = getattr(target, "ai_stage_key", None)
        if not key:
            return
        sol = await AiSolutionsService.get_solution(db, task.id)
        label = code_label(sol.code) if sol else "Solução com IA"
        link = ("project_task", task.id)

        team: list[uuid.UUID] = []
        if key in ("analise", "apresentacao", "liberacao"):
            team += await AiSolutionsService._person_ids_by_cargo(db, slugs=_COORD_SLUGS)
        if key in ("apresentacao", "adequacao", "liberacao") and task.assigned_to:
            team.append(task.assigned_to)
        if key == "adequacao" and not task.assigned_to:
            team += await AiSolutionsService._person_ids_by_cargo(db, slugs=_COORD_SLUGS)
        if key in ("devops_hml", "devops_prod"):
            team += await AiSolutionsService._person_ids_by_cargo(db, slugs=_DEVOPS_SLUGS)
        if key == "seguranca":
            team += await AiSolutionsService._person_ids_by_cargo(db, slugs=_SECURITY_SLUGS)
        if team:
            await notify_persons(
                db, list(dict.fromkeys(team)), f"{label}: {target.name}",
                f"“{task.title}” chegou em {target.name}.", *link, exclude_user_id=actor_user_id,
            )

        client_msgs = {
            "aguardando_cliente": ("aprovada", "Pode construir a solução na ferramenta autorizada. Quando tiver uma versão funcional, avise pelo Portal."),
            "necessita_ajustes": ("precisa de ajustes", "Veja o motivo no Portal, ajuste o pedido e reenvie."),
            "nao_aprovado": ("não aprovada", "Veja a justificativa no Portal."),
            "homologacao": ("pronta para homologação", "Valide no ambiente de homologação e aprove ou reprove no Portal."),
            "producao": ("em produção", "A solução foi publicada no ambiente produtivo."),
            "cancelado": ("cancelada", "Veja o motivo no Portal."),
        }
        if sol and sol.opened_by_user_id and key in client_msgs:
            what, body = client_msgs[key]
            await notify_users(
                db, [sol.opened_by_user_id], f"{label} {what}", f"“{task.title}”: {body}",
                *link, exclude_user_id=actor_user_id,
            )

    @staticmethod
    async def _move(
        db: AsyncSession, task: ProjectTask, target: ProjectStatusConfig, actor_user_id: Optional[uuid.UUID],
    ) -> None:
        """Movimento feito pelo Portal (o motivo já vem na ação do cliente)."""
        from app.modules.projetos.service import ProjectTaskService

        current = await db.get(ProjectStatusConfig, task.status_id)
        if current is not None and current.id == target.id:
            return
        await ProjectTaskService._record_status_move(
            db, task, from_status=current, to_status=target, moved_by=actor_user_id, source="client",
        )
        task.status_id = target.id
        task.status_entered_at = datetime.utcnow()
        task.completed_at = datetime.utcnow() if target.is_final else None
        task.updated_at = datetime.utcnow()
        await db.flush()
        await AiSolutionsService.after_move(db, task, current, target, actor_user_id)

    # ── Portal do Cliente ────────────────────────────────────────────────────
    @staticmethod
    async def _client(db: AsyncSession, user: User) -> Optional[ProjectClient]:
        """Cadastro de cliente do usuário, se houver. Pedir não exige: qualquer pessoa com
        acesso à plataforma pede e acompanha os próprios pedidos (dono = opened_by_user_id)."""
        from app.modules.projetos.clients import ProjectClientService

        return await ProjectClientService.get_by_user(db, user.id)

    @staticmethod
    async def _mine(db: AsyncSession, user: User, task_id: uuid.UUID) -> tuple[ProjectAiSolution, ProjectTask, ProjectStatusConfig]:
        client = await AiSolutionsService._client(db, user)
        sol = await AiSolutionsService.get_solution(db, task_id)
        if sol is None or not AiSolutionsService._is_owner(sol, client, user):
            raise HTTPException(status_code=404, detail="Solicitação não encontrada.")
        task = await db.get(ProjectTask, task_id)
        status = await db.get(ProjectStatusConfig, task.status_id)
        return sol, task, status

    @staticmethod
    def _is_owner(sol: ProjectAiSolution, client: Optional[ProjectClient], user: User) -> bool:
        return sol.opened_by_user_id == user.id or bool(client and sol.opened_by_client_id == client.id)

    @staticmethod
    async def _viewer(db: AsyncSession, user: User) -> tuple[Optional[ProjectClient], bool]:
        """(cadastro de cliente, equipe vê tudo). Cada um vê e age nos próprios pedidos; a
        coordenação/gestão (inclui Administrativo) lê todos, sem agir nos dos outros."""
        from app.modules.projetos.clients import ProjectClientService
        from app.modules.projetos.program_portal import PortalPortfolioService

        client = await ProjectClientService.get_by_user(db, user.id)
        scope = await PortalPortfolioService._team_scope(db, user)
        return client, bool(scope and scope.get("all"))

    @staticmethod
    def _require_stage(status: ProjectStatusConfig, key: str, msg: str) -> None:
        if getattr(status, "ai_stage_key", None) != key:
            raise HTTPException(status_code=400, detail=msg)

    @staticmethod
    async def form(db: AsyncSession) -> AiSolutionForm:
        flow = await AiSolutionsService.ensure(db)
        await db.commit()
        fields = await AiSolutionsService._pedido_fields(db, flow["demand_type"].id)
        return AiSolutionForm(fields=[
            AiSolutionFormField(
                key=f.field_key, label=f.label, field_type=f.field_type, required=f.is_required,
                placeholder=f.placeholder, options=list((f.options or {}).get("items") or []),
            )
            for f in fields
        ])

    @staticmethod
    async def _summary(
        db: AsyncSession, sol: ProjectAiSolution, task: ProjectTask, status: Optional[ProjectStatusConfig],
        owner: bool = True,
    ) -> AiSolutionSummary:
        key = getattr(status, "ai_stage_key", None)
        return AiSolutionSummary(
            task_id=task.id,
            code_label=code_label(sol.code),
            title=task.title,
            stage_key=key,
            stage_name=status.name if status else None,
            is_closed=bool(status and status.is_final),
            client_action=CLIENT_ACTION.get(key or "") if owner else None,
            created_at=sol.created_at,
            updated_at=task.updated_at,
        )

    @staticmethod
    async def portal_list(db: AsyncSession, user: User) -> list[AiSolutionSummary]:
        client, team_all = await AiSolutionsService._viewer(db, user)
        q = (
            select(ProjectAiSolution, ProjectTask, ProjectStatusConfig)
            .join(ProjectTask, ProjectTask.id == ProjectAiSolution.task_id)
            .outerjoin(ProjectStatusConfig, ProjectStatusConfig.id == ProjectTask.status_id)
        )
        if not team_all:
            mine = ProjectAiSolution.opened_by_user_id == user.id
            if client is not None:
                mine = mine | (ProjectAiSolution.opened_by_client_id == client.id)
            q = q.where(mine)
        rows = (await db.execute(q.order_by(ProjectAiSolution.code.desc()))).all()
        return [
            await AiSolutionsService._summary(db, s, t, st, owner=AiSolutionsService._is_owner(s, client, user))
            for s, t, st in rows
        ]

    @staticmethod
    async def portal_detail(db: AsyncSession, user: User, task_id: uuid.UUID) -> AiSolutionDetail:
        client, team_all = await AiSolutionsService._viewer(db, user)
        sol = await AiSolutionsService.get_solution(db, task_id)
        owner = sol is not None and AiSolutionsService._is_owner(sol, client, user)
        if sol is None or not (owner or team_all):
            raise HTTPException(status_code=404, detail="Solicitação não encontrada.")
        task = await db.get(ProjectTask, task_id)
        status = await db.get(ProjectStatusConfig, task.status_id)
        return await AiSolutionsService._detail(db, sol, task, status, owner=owner)

    @staticmethod
    async def _detail(
        db: AsyncSession, sol: ProjectAiSolution, task: ProjectTask, status: Optional[ProjectStatusConfig],
        owner: bool = True,
    ) -> AiSolutionDetail:
        from app.modules.teamops.models import Person

        summary = await AiSolutionsService._summary(db, sol, task, status, owner=owner)
        values = await AiSolutionsService._values(db, task.id)
        fields = await AiSolutionsService._pedido_fields(db, task.demand_type_id) if task.demand_type_id else []
        shown = []
        for f in fields:
            v = values.get(f.field_key)
            if v not in (None, "", []):
                shown.append(AiSolutionField(label=f.label, value=str(v)))
        key = summary.stage_key or ""
        after = lambda k: key in MAIN_KEYS and _ORDER[key] >= _ORDER[k]  # noqa: E731

        comments = list((await db.execute(
            select(ProjectTaskComment)
            .where(ProjectTaskComment.task_id == task.id, ProjectTaskComment.visibility == "public")
            .order_by(ProjectTaskComment.created_at.asc())
        )).scalars().all())
        author_ids = {c.author_id for c in comments if c.author_id}
        authors = {
            u.id: u.full_name for u in (await db.execute(select(User).where(User.id.in_(author_ids)))).scalars()
        } if author_ids else {}
        client_users = set((await db.execute(
            select(ProjectClient.user_id).where(ProjectClient.user_id.in_(author_ids))
        )).scalars().all()) if author_ids else set()
        hist = list((await db.execute(
            select(ProjectTaskStatusHistory)
            .where(ProjectTaskStatusHistory.task_id == task.id)
            .order_by(ProjectTaskStatusHistory.moved_at.asc())
        )).scalars().all())
        po_name = None
        if task.assigned_to:
            po_name = (await db.execute(select(Person.full_name).where(Person.id == task.assigned_to))).scalar_one_or_none()

        return AiSolutionDetail(
            **summary.model_dump(),
            fields=shown,
            values={k: values.get(k) for k in _PEDIDO_KEYS},
            versao_url=values.get("versao_url"),
            repositorio_url=values.get("repositorio_url"),
            homolog_url=values.get("url_homologacao") if after("homologacao") else None,
            producao_url=values.get("url_producao") if key == "producao" else None,
            po_name=po_name,
            comments=[
                OccurrenceComment(
                    id=c.id,
                    author_name=authors.get(c.author_id) if c.author_id else "Equipe de TI",
                    from_client=bool(c.author_id and c.author_id in client_users),
                    content=c.content,
                    anexos=c.anexos,
                    created_at=c.created_at,
                )
                for c in comments
            ],
            history=[
                {"stage_name": h.to_status_name, "from_stage_name": h.from_status_name,
                 "moved_at": h.moved_at.isoformat() if h.moved_at else None}
                for h in hist
            ],
            # Só quem pediu age; a equipe no Modo Cliente só lê.
            can_cancel=owner and not summary.is_closed,
            can_interact=owner and not summary.is_closed,
        )

    @staticmethod
    async def portal_create(db: AsyncSession, user: User, data: AiSolutionCreate) -> AiSolutionDetail:
        client = await AiSolutionsService._client(db, user)
        flow = await AiSolutionsService.ensure(db)
        dt = flow["demand_type"]
        values = AiSolutionsService._clean_pedido(await AiSolutionsService._pedido_fields(db, dt.id), data.values or {})
        code = int((await db.execute(text("SELECT nextval('project_ai_solution_code_seq')"))).scalar())
        solicitacao, analise = flow["stages"]["solicitacao"], flow["stages"]["analise"]
        task = ProjectTask(
            project_id=flow["funnel"].project_id,
            status_id=solicitacao.id,
            demand_type_id=dt.id,
            title=f"{code_label(code)} · {data.title.strip()}"[:200],
            description=values.get("objetivo"),
            created_by=user.id,
            status_entered_at=datetime.utcnow(),
        )
        db.add(task)
        await db.flush()
        sol = ProjectAiSolution(
            task_id=task.id, code=code, opened_by_client_id=client.id if client else None, opened_by_user_id=user.id,
        )
        db.add(sol)
        db.add(ProjectTaskStatusHistory(
            task_id=task.id, to_status_id=solicitacao.id, to_status_name=solicitacao.name,
            to_funnel_name=flow["funnel"].name, moved_by=user.id, moved_at=datetime.utcnow(), source="client",
        ))
        await AiSolutionsService._save_values(db, task.id, values, user.id)
        await db.flush()
        await AiSolutionsService._move(db, task, analise, user.id)
        await db.commit()
        return await AiSolutionsService.portal_detail(db, user, task.id)

    @staticmethod
    async def portal_resubmit(db: AsyncSession, user: User, task_id: uuid.UUID, data: AiSolutionResubmit) -> AiSolutionDetail:
        sol, task, status = await AiSolutionsService._mine(db, user, task_id)
        AiSolutionsService._require_stage(status, "necessita_ajustes", "Só dá para reenviar quando a solicitação precisa de ajustes.")
        values = AiSolutionsService._clean_pedido(
            await AiSolutionsService._pedido_fields(db, task.demand_type_id),
            {**(await AiSolutionsService._values(db, task.id)), **(data.values or {})},
        )
        await AiSolutionsService._save_values(db, task.id, values, user.id)
        task.description = values.get("objetivo")
        if (data.note or "").strip():
            db.add(ProjectTaskComment(task_id=task.id, author_id=user.id, content=_plain_to_html(data.note), visibility="public"))
        flow = await AiSolutionsService.ensure(db)
        await AiSolutionsService._move(db, task, flow["stages"]["analise"], user.id)
        await db.commit()
        return await AiSolutionsService.portal_detail(db, user, task_id)

    @staticmethod
    async def portal_ready(db: AsyncSession, user: User, task_id: uuid.UUID, data: AiSolutionReady) -> AiSolutionDetail:
        sol, task, status = await AiSolutionsService._mine(db, user, task_id)
        AiSolutionsService._require_stage(status, "aguardando_cliente", "A solicitação não está aguardando o seu desenvolvimento.")
        await AiSolutionsService._save_values(db, task.id, {"versao_url": data.versao_url, "repositorio_url": data.repositorio_url}, user.id)
        body = f"Versão funcional pronta para apresentação.\n\nLink: {data.versao_url}\nRepositório: {data.repositorio_url}"
        if (data.note or "").strip():
            body += f"\n\n{data.note.strip()}"
        db.add(ProjectTaskComment(task_id=task.id, author_id=user.id, content=_plain_to_html(body), visibility="public"))
        flow = await AiSolutionsService.ensure(db)
        await AiSolutionsService._move(db, task, flow["stages"]["apresentacao"], user.id)
        await db.commit()
        return await AiSolutionsService.portal_detail(db, user, task_id)

    @staticmethod
    async def portal_homologate(db: AsyncSession, user: User, task_id: uuid.UUID, data: AiSolutionHomologation) -> AiSolutionDetail:
        sol, task, status = await AiSolutionsService._mine(db, user, task_id)
        AiSolutionsService._require_stage(status, "homologacao", "A solução não está em homologação.")
        flow = await AiSolutionsService.ensure(db)
        if data.approve:
            content = "<p><strong>Homologação aprovada pelo cliente.</strong></p>"
            if (data.comment or "").strip():
                content += _plain_to_html(data.comment)
            target = flow["stages"]["seguranca"]
        else:
            content = "<p><strong>Homologação reprovada pelo cliente.</strong></p>" + _plain_to_html(data.comment or "")
            sol.homologation_rejections = (sol.homologation_rejections or 0) + 1
            target = flow["stages"]["adequacao"]
        db.add(ProjectTaskComment(task_id=task.id, author_id=user.id, content=content, visibility="public"))
        await AiSolutionsService._move(db, task, target, user.id)
        await db.commit()
        return await AiSolutionsService.portal_detail(db, user, task_id)

    @staticmethod
    async def portal_cancel(db: AsyncSession, user: User, task_id: uuid.UUID, data: AiSolutionCancel) -> AiSolutionDetail:
        sol, task, status = await AiSolutionsService._mine(db, user, task_id)
        if status is not None and status.is_final:
            raise HTTPException(status_code=400, detail="A solicitação já está encerrada.")
        db.add(ProjectTaskComment(
            task_id=task.id, author_id=user.id, visibility="public",
            content="<p><strong>Cancelada pelo cliente</strong> — motivo:</p>" + _plain_to_html(data.reason),
        ))
        flow = await AiSolutionsService.ensure(db)
        await AiSolutionsService._move(db, task, flow["stages"]["cancelado"], user.id)
        team = await AiSolutionsService._person_ids_by_cargo(db, slugs=_COORD_SLUGS)
        if task.assigned_to:
            team.append(task.assigned_to)
        await notify_persons(
            db, list(dict.fromkeys(team)), f"{code_label(sol.code)} cancelada pelo cliente",
            f"“{task.title}” foi cancelada: {data.reason.strip()[:200]}", "project_task", task.id,
            exclude_user_id=user.id,
        )
        await db.commit()
        return await AiSolutionsService.portal_detail(db, user, task_id)

    @staticmethod
    async def portal_comment(db: AsyncSession, user: User, task_id: uuid.UUID, data: OccurrenceCommentCreate) -> AiSolutionDetail:
        sol, task, status = await AiSolutionsService._mine(db, user, task_id)
        if status is not None and status.is_final:
            raise HTTPException(status_code=400, detail="Solicitação encerrada — não aceita novas mensagens.")
        db.add(ProjectTaskComment(task_id=task.id, author_id=user.id, content=_plain_to_html(data.content), visibility="public"))
        task.updated_at = datetime.utcnow()
        team = [task.assigned_to] if task.assigned_to else await AiSolutionsService._person_ids_by_cargo(db, slugs=_COORD_SLUGS)
        await notify_persons(
            db, team, f"{code_label(sol.code)}: mensagem do cliente",
            f"Nova mensagem em “{task.title}”.", "project_task", task.id, exclude_user_id=user.id,
        )
        await db.commit()
        return await AiSolutionsService.portal_detail(db, user, task_id)

    @staticmethod
    async def after_team_comment(db: AsyncSession, task_id: uuid.UUID, visibility: str, author_id: Optional[uuid.UUID]) -> None:
        """Comentário público do time numa solução com IA avisa o cliente."""
        if visibility != "public":
            return
        sol = await AiSolutionsService.get_solution(db, task_id)
        if sol is None or not sol.opened_by_user_id:
            return
        task = await db.get(ProjectTask, task_id)
        await notify_users(
            db, [sol.opened_by_user_id], f"{code_label(sol.code)}: nova mensagem da TI",
            f"Há uma mensagem nova em “{task.title if task else ''}”.", "project_task", task_id,
            exclude_user_id=author_id,
        )
