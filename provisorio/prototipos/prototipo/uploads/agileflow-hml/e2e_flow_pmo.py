"""
Simulação do fluxo PMO -> Planejamento -> Desenvolvimento (sem DevOps), no schema tenant_ga.

Demonstra:
  - Demanda "Projeto: Portal do Cliente" aprovada no PMO -> CONVERSÃO cria o projeto
    "Portal do Cliente" no Planejamento (etapa Levantamento de Requisitos).
  - PO cria 6 Features vinculadas ao projeto (hierarquia Projeto -> Feature).
  - Sistema envia as Features para o Desenvolvimento (transição moves_to_funnel_id).
  - Cada Feature termina numa coluna/raia diferente do Desenvolvimento.
  - NADA entra no DevOps (o gate "Liberado para Deploy -> DevOps" existe, mas não é usado).

NÃO faz cleanup ao final. Limpa apenas execuções anteriores da simulação no início.
"""
import asyncio
import logging
import uuid
import warnings

warnings.filterwarnings("ignore")

from sqlalchemy import event, select, text
from app.core.database import AsyncSessionLocal, engine
engine.echo = False
logging.getLogger("sqlalchemy.engine").setLevel(logging.WARNING)

from app.modules.projetos.models import Project, ProjectTask
from app.modules.projetos.service import (
    ProjectFunnelService, ProjectStatusService, ProjectDemandTypeService,
    ProjectTaskService,
)
from app.modules.projetos.schemas import (
    ProjectFunnelCreate, ProjectFunnelUpdate, ProjectStatusCreate,
    ProjectDemandTypeCreate, ProjectDemandTypeUpdate, ProjectTaskCreate, ProjectTaskUpdate,
)

SCHEMA = "tenant_ga"
# Os 4 kanbans-base canônicos exibidos pela simulação.
DISPLAY_NAMES = ["Triagem PMO", "Planejamento PO", "Desenvolvimento", "DevOps"]
# Nomes a limpar antes de reconstruir: os canônicos + o "Planejamento" duplicado
# de execuções antigas + os nomes com prefixo "E2E ·".
CLEANUP_NAMES = DISPLAY_NAMES + [
    "Planejamento",
    "E2E · Triagem PMO", "E2E · Planejamento PO", "E2E · Desenvolvimento", "E2E · DevOps",
]

FEATURES = [
    ("F001 — Cadastro de Usuário", "Permitir cadastro e gestão de usuários do portal.", "Backlog"),
    ("F002 — Login e Autenticação", "Permitir acesso seguro ao portal.", "A Fazer"),
    ("F003 — Consulta de Serviços", "Permitir ao cliente visualizar serviços disponíveis.", "Em Desenvolvimento"),
    ("F004 — Abertura de Solicitações", "Permitir que o cliente abra novas solicitações.", "Em Revisão Técnica"),
    ("F005 — Acompanhamento de Demandas", "Permitir acompanhar o andamento das solicitações.", "Em Testes"),
    ("F006 — Painel Administrativo", "Permitir gestão interna das solicitações recebidas.", "Aguardando Homologação"),
]


async def main():
    async with AsyncSessionLocal() as db:
        @event.listens_for(db.sync_session, "after_begin")
        def _sp(sess, trans, conn):
            conn.exec_driver_sql(f"SET search_path TO {SCHEMA}, public")
        await db.execute(text(f"SET search_path TO {SCHEMA}, public"))

        proj = (await db.execute(select(Project).limit(1))).scalar_one()
        pid = proj.id

        tid = (await db.execute(text("SELECT id FROM tenants WHERE schema_name=:s"), {"s": SCHEMA})).scalar_one()
        urows = (await db.execute(text(
            "SELECT id, full_name FROM users WHERE tenant_id=:t AND is_active=true ORDER BY created_at LIMIT 2"
        ), {"t": str(tid)})).all()
        userA, nameA = urows[0]
        userB, nameB = (urows[1] if len(urows) > 1 else urows[0])
        people = [userA, userB]

        # ── PRÉ-LIMPEZA (remove qualquer execução anterior, escopo projeto) ──
        params = {"p": str(pid), "names": CLEANUP_NAMES}
        await db.execute(text(
            "DELETE FROM notifications WHERE entity_type='project_task' AND entity_id IN ("
            " SELECT id FROM project_tasks WHERE status_id IN ("
            "  SELECT id FROM project_status_configs WHERE funnel_id IN ("
            "   SELECT id FROM project_funnels WHERE project_id=:p AND name = ANY(:names))))"), params)
        await db.execute(text(
            "DELETE FROM project_tasks WHERE status_id IN ("
            " SELECT id FROM project_status_configs WHERE funnel_id IN ("
            "  SELECT id FROM project_funnels WHERE project_id=:p AND name = ANY(:names)))"), params)
        await db.execute(text(
            "DELETE FROM project_status_configs WHERE funnel_id IN ("
            " SELECT id FROM project_funnels WHERE project_id=:p AND name = ANY(:names))"), params)
        await db.execute(text("DELETE FROM project_funnels WHERE project_id=:p AND name = ANY(:names)"), params)
        await db.execute(text("DELETE FROM project_demand_types WHERE slug LIKE 'e2e_%' OR slug LIKE 'sim_%'"))
        await db.commit()

        print("=" * 72)
        print("SETUP — kanbans, tipos e etapas")
        print("=" * 72)
        print(f"Projeto base: {proj.name} ({pid}) | tenant: {SCHEMA}")
        print(f"Pessoas: A={nameA} ({str(userA)[:8]}) | B={nameB} ({str(userB)[:8]})")

        # ── kanbans ──
        f_triagem = await ProjectFunnelService.create(db, pid, ProjectFunnelCreate(name="Triagem PMO", color="#014898", order=20))
        f_plan = await ProjectFunnelService.create(db, pid, ProjectFunnelCreate(name="Planejamento PO", color="#164194", order=21))
        f_dev = await ProjectFunnelService.create(db, pid, ProjectFunnelCreate(name="Desenvolvimento", color="#008BD2", order=22))
        f_ops = await ProjectFunnelService.create(db, pid, ProjectFunnelCreate(name="DevOps", color="#6AB42F", order=23))

        # ── tipos de card ──
        t_demanda = await ProjectDemandTypeService.create(db, ProjectDemandTypeCreate(slug="sim_demanda", name="Demanda", funnel_id=f_triagem.id, order=20))
        t_projeto = await ProjectDemandTypeService.create(db, ProjectDemandTypeCreate(slug="sim_projeto", name="Projeto", funnel_id=f_plan.id, order=21))
        t_feature = await ProjectDemandTypeService.create(db, ProjectDemandTypeCreate(slug="sim_feature", name="Feature", funnel_id=f_plan.id, order=22))
        # Projeto aceita Feature como filho
        await ProjectDemandTypeService.update(db, t_projeto.id, ProjectDemandTypeUpdate(allowed_child_type_ids=[t_feature.id]))

        # ── etapas ──
        # Triagem PMO
        tg_receb = await ProjectStatusService.create(db, pid, ProjectStatusCreate(funnel_id=f_triagem.id, name="Recebida", order=0, is_initial=True, color="#6B7280"))
        tg_triag = await ProjectStatusService.create(db, pid, ProjectStatusCreate(funnel_id=f_triagem.id, name="Em Triagem", order=1, color="#008BD2"))
        tg_aprov = await ProjectStatusService.create(db, pid, ProjectStatusCreate(funnel_id=f_triagem.id, name="Aprovada", order=2, is_final=True, creates_demand_type_id=t_projeto.id, color="#6AB42F"))
        # Planejamento
        pl_lev = await ProjectStatusService.create(db, pid, ProjectStatusCreate(funnel_id=f_plan.id, name="Levantamento de Requisitos", order=0, is_initial=True, color="#6B7280"))
        pl_cron = await ProjectStatusService.create(db, pid, ProjectStatusCreate(funnel_id=f_plan.id, name="Cronograma", order=1, color="#014898"))
        pl_pronta = await ProjectStatusService.create(db, pid, ProjectStatusCreate(funnel_id=f_plan.id, name="Pronta para Desenvolvimento", order=2, moves_to_funnel_id=f_dev.id, color="#66C1BF"))
        # Desenvolvimento (6 colunas + gate de DevOps não usado)
        dv_back = await ProjectStatusService.create(db, pid, ProjectStatusCreate(funnel_id=f_dev.id, name="Backlog", order=0, is_initial=True, color="#6B7280"))
        dv_afazer = await ProjectStatusService.create(db, pid, ProjectStatusCreate(funnel_id=f_dev.id, name="A Fazer", order=1, color="#014898"))
        dv_dev = await ProjectStatusService.create(db, pid, ProjectStatusCreate(funnel_id=f_dev.id, name="Em Desenvolvimento", order=2, color="#008BD2"))
        dv_rev = await ProjectStatusService.create(db, pid, ProjectStatusCreate(funnel_id=f_dev.id, name="Em Revisão Técnica", order=3, color="#164194"))
        dv_test = await ProjectStatusService.create(db, pid, ProjectStatusCreate(funnel_id=f_dev.id, name="Em Testes", order=4, color="#66C1BF"))
        dv_homol = await ProjectStatusService.create(db, pid, ProjectStatusCreate(funnel_id=f_dev.id, name="Aguardando Homologação", order=5, color="#E84E0F"))
        dv_deploy = await ProjectStatusService.create(db, pid, ProjectStatusCreate(funnel_id=f_dev.id, name="Liberado para Deploy", order=6, is_final=True, moves_to_funnel_id=f_ops.id, color="#6AB42F"))
        # DevOps (fica vazio nesta simulação)
        op_fila = await ProjectStatusService.create(db, pid, ProjectStatusCreate(funnel_id=f_ops.id, name="Fila", order=0, is_initial=True, color="#6B7280"))
        await ProjectStatusService.create(db, pid, ProjectStatusCreate(funnel_id=f_ops.id, name="Validação de Ambiente", order=1, color="#014898"))
        await ProjectStatusService.create(db, pid, ProjectStatusCreate(funnel_id=f_ops.id, name="Deploy", order=2, color="#008BD2"))
        await ProjectStatusService.create(db, pid, ProjectStatusCreate(funnel_id=f_ops.id, name="Concluído", order=3, is_final=True, color="#6AB42F"))

        # ── tipos permitidos por kanban ──
        await ProjectFunnelService.update(db, pid, f_triagem.id, ProjectFunnelUpdate(allowed_demand_type_ids=[t_demanda.id]))
        await ProjectFunnelService.update(db, pid, f_plan.id, ProjectFunnelUpdate(allowed_demand_type_ids=[t_projeto.id, t_feature.id]))
        await ProjectFunnelService.update(db, pid, f_dev.id, ProjectFunnelUpdate(allowed_demand_type_ids=[t_feature.id]))

        dev_by_name = {s.name: s for s in [dv_back, dv_afazer, dv_dev, dv_rev, dv_test, dv_homol]}
        stage_info = {}
        for fn_name, sts in [
            ("Triagem PMO", [tg_receb, tg_triag, tg_aprov]),
            ("Planejamento PO", [pl_lev, pl_cron, pl_pronta]),
            ("Desenvolvimento", [dv_back, dv_afazer, dv_dev, dv_rev, dv_test, dv_homol, dv_deploy]),
            ("DevOps", [op_fila]),
        ]:
            for s in sts:
                stage_info[str(s.id)] = (fn_name, s.name)

        print("Kanbans: Triagem PMO | Planejamento PO | Desenvolvimento | DevOps")
        print("Tipos:   Demanda(->Triagem) | Projeto(->Planejamento) | Feature(filho de Projeto)")
        print("Regra:   conversão Aprovada->Projeto | transição 'Pronta para Desenvolvimento'->Desenvolvimento")
        print("DevOps:  gate 'Liberado para Deploy' existe mas NÃO é usado nesta simulação")

        async def move(task, status_id, note=""):
            t = await ProjectTaskService.update(db, pid, task.id, ProjectTaskUpdate(status_id=status_id))
            fn, sn = stage_info.get(str(t.status_id), ("?", "?"))
            extra = f" | {note}" if note else ""
            print(f"      -> [{fn}] {sn}{extra}")
            return t

        print()
        print("=" * 72)
        print("FLUXO")
        print("=" * 72)

        # [1] Demanda recebida no PMO
        demand = await ProjectTaskService.create(db, pid, ProjectTaskCreate(
            status_id=tg_receb.id, demand_type_id=t_demanda.id, assigned_to=userA,
            title="Projeto: Portal do Cliente",
            description="Solicitação de um portal de autoatendimento para clientes.", order=0))
        print(f"[1] PMO recebe a demanda: '{demand.title}' (resp {nameA})")

        # [2] Triagem
        print("[2] PMO realiza a triagem")
        demand = await move(demand, tg_triag.id)

        # [3] Aprovação -> conversão cria o Projeto no Planejamento
        print("[3] PMO aprova -> sistema CRIA o projeto no Planejamento")
        demand = await move(demand, tg_aprov.id)
        projeto = (await db.execute(select(ProjectTask).where(ProjectTask.origin_task_id == demand.id))).scalar_one()
        fn, sn = stage_info.get(str(projeto.status_id), ("?", "?"))
        print(f"      ++ Projeto criado: '{projeto.title}' em [{fn}] {sn} (origem: demanda do PMO)")
        # nome do projeto = "Portal do Cliente" (sem o prefixo 'Projeto:' da demanda)
        projeto = await ProjectTaskService.update(db, pid, projeto.id, ProjectTaskUpdate(title="Portal do Cliente"))
        print(f"      ++ Projeto renomeado para: '{projeto.title}'  (carrega o nome do projeto, não de uma atividade)")

        # [4] PO cria as 6 features vinculadas ao projeto (no Planejamento/Cronograma)
        print("[4] PO cria as Features vinculadas ao projeto (Planejamento -> Cronograma):")
        feats = []
        for i, (title, desc, target) in enumerate(FEATURES):
            f = await ProjectTaskService.create(db, pid, ProjectTaskCreate(
                status_id=pl_cron.id, demand_type_id=t_feature.id, parent_task_id=projeto.id,
                assigned_to=people[i % len(people)], title=title, description=desc, order=i))
            feats.append((f, target))
            print(f"      • {title}  (resp {str(f.assigned_to)[:8]})")

        # [5] Sistema envia as features para o Desenvolvimento (transição) ...
        # [6] ... e cada uma é posicionada numa coluna diferente
        print("[5/6] Sistema envia cada Feature para o Desenvolvimento e o time as distribui nas colunas:")
        for f, target in feats:
            f = await move(f, pl_pronta.id)  # transita: Planejamento -> Desenvolvimento/Backlog
            if target != "Backlog":
                f = await move(f, dev_by_name[target].id, note=f"posicionada em '{target}'")
            else:
                print(f"      -> permanece em [Desenvolvimento] Backlog")

        # ── SNAPSHOT do board ──
        print()
        print("=" * 72)
        print("SNAPSHOT DO BOARD (como ficou)")
        print("=" * 72)
        rows = (await db.execute(text(
            "SELECT f.name AS funil, f.\"order\" AS fo, s.name AS etapa, s.\"order\" AS so, t.title "
            "FROM project_status_configs s "
            "JOIN project_funnels f ON f.id = s.funnel_id "
            "LEFT JOIN project_tasks t ON t.status_id = s.id "
            "WHERE f.project_id=:p AND f.name = ANY(:names) "
            "ORDER BY f.\"order\", s.\"order\", t.\"order\"", ), {"p": str(pid), "names": DISPLAY_NAMES})).all()
        from collections import OrderedDict
        board = OrderedDict()
        for funil, fo, etapa, so, title in rows:
            board.setdefault(funil, OrderedDict())
            board[funil].setdefault(etapa, [])
            if title:
                board[funil][etapa].append(title)
        for funil, etapas in board.items():
            total = sum(len(v) for v in etapas.values())
            print(f"\n■ {funil}  ({total} card{'s' if total != 1 else ''})")
            for etapa, titles in etapas.items():
                if titles:
                    print(f"    {etapa}: " + " | ".join(titles))
                else:
                    print(f"    {etapa}: —")

        # ── hierarquia ──
        children = (await db.execute(text(
            "SELECT title FROM project_tasks WHERE parent_task_id=:p ORDER BY \"order\""
        ), {"p": str(projeto.id)})).all()
        print(f"\nHierarquia — '{projeto.title}' possui {len(children)} features vinculadas:")
        for (t,) in children:
            print(f"    └─ {t}")

        # ── checagem DevOps vazio ──
        ops_count = (await db.execute(text(
            "SELECT count(*) FROM project_tasks t JOIN project_status_configs s ON s.id=t.status_id "
            "WHERE s.funnel_id=:f"), {"f": str(f_ops.id)})).scalar_one()
        print(f"\nDevOps: {ops_count} cards  ->  {'OK, nada caiu no DevOps ✓' if ops_count == 0 else 'ATENÇÃO: deveria estar vazio!'}")

        print()
        print("=" * 72)
        print("COMO VER NA UI (tenant 'ga') e IDS")
        print("=" * 72)
        print("Projetos -> Kanban: alterne os funis 'Triagem PMO', 'Planejamento PO',")
        print("  'Desenvolvimento', 'DevOps' no seletor do topo.")
        print("  - Planejamento PO: projeto 'Portal do Cliente' em Levantamento de Requisitos.")
        print("  - Desenvolvimento: 6 features, uma em cada coluna (Backlog -> Aguardando Homologação).")
        print("  - DevOps: vazio.")
        print("Abra 'Portal do Cliente' para ver as 6 features vinculadas (hierarquia).")
        print(f"\nLimpeza posterior: funis {DISPLAY_NAMES} no projeto {pid}; tipos slug sim_*.")
        print(f"  demanda={demand.id}")
        print(f"  projeto={projeto.id}")


asyncio.run(main())
