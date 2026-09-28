import { createElement, type ElementType } from "react"
import { useNavigate } from "react-router-dom"
import { ArrowRight, Bot, BrainCircuit, CalendarRange, ClipboardList, FileText, GitBranch, Grid2x2, KanbanSquare, LayoutGrid, ListChecks, ScrollText, Settings2 } from "lucide-react"

import { PageHeader } from "@/components/ds"

/** Cor do módulo Processos (cabeçalho e quadrados dos ícones). */
const MODULE_COLOR = "#2563EB"

const sections = [
  {
    to: "/app/modules/projetos/config/processos",
    icon: Settings2,
    title: "Processos",
    description: "Cadastre, edite e exclua processos (CRUD).",
  },
  {
    to: "/app/modules/projetos/config/demandas",
    icon: ListChecks,
    title: "Demandas / Cards",
    description: "Liste todas as demandas criadas nos quadros para editar e excluir.",
  },
  {
    to: "/app/modules/projetos/config/funnels",
    icon: GitBranch,
    title: "Funis",
    description: "Crie e gerencie funis do módulo de processos.",
  },
  {
    to: "/app/modules/projetos/config/statuses",
    icon: KanbanSquare,
    title: "Etapas Kanban",
    description: "Configure as colunas (etapas) de cada funil.",
  },
  {
    to: "/app/modules/projetos/config/demand-types",
    icon: FileText,
    title: "Tipos de Demanda",
    description: "Crie tipos de demanda e seus formulários por sessões.",
  },
  {
    to: "/app/modules/projetos/config/default-form",
    icon: ClipboardList,
    title: "Formulário Padrão",
    description: "Configure rótulos, tipos, visibilidade e ordem dos campos padrão (título, descrição, responsável, datas).",
  },
  {
    to: "/app/modules/projetos/config/cronograma",
    icon: CalendarRange,
    title: "Cronograma",
    description: "Escolha em quais fluxos e etapas o cronograma deve ser preenchido (e quando exigir início/prazo).",
  },
  {
    to: "/app/modules/projetos/config/agentes",
    icon: Bot,
    title: "Agentes",
    description: "Vincule agentes do Azure AI Foundry a etapas do kanban para executar tarefas quando o card entrar na raia.",
  },
  {
    to: "/app/modules/projetos/config/agentes/logs",
    icon: ScrollText,
    title: "Logs de agentes",
    description: "Histórico de execuções, erros e respostas dos agentes por card e etapa.",
  },
  {
    to: "/app/modules/projetos/config/assistente-ia",
    icon: BrainCircuit,
    title: "Assistente IA do Portal",
    description: "Base de busca por significado (pgvector) do chat do Portal: situação, sincronização, ajustes, teste de busca e logs.",
  },
  {
    to: "/app/modules/projetos/config/priorizacao",
    icon: Grid2x2,
    title: "Priorização (Impacto × Esforço)",
    description: "Critérios, pesos, rubrica, pilares estratégicos, confiança e quadrantes da matriz.",
  },
  {
    to: "/app/modules/projetos/config/layout-card",
    icon: LayoutGrid,
    title: "Layout do card",
    description: "Escolha o que aparece nos cards do quadro (tipo, prioridade, SLA, responsável, …), ordem e rótulos.",
  },
]

/** Quadrado do ícone no padrão do IconTile do Portal, com o componente lucide direto.
 *  O cartão é o próprio botão (mesmas classes do Card do ds: rounded-2xl, borda, bg-card). */
function SectionTile({ icon }: { icon: ElementType }) {
  return (
    <span
      className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl"
      style={{ backgroundColor: `${MODULE_COLOR}1f`, color: MODULE_COLOR }}
      aria-hidden
    >
      {createElement(icon, { size: 20 })}
    </span>
  )
}

export default function ProjectConfigHomePage() {
  const navigate = useNavigate()

  return (
    <div className="w-full space-y-5">
      <PageHeader
        icon={Settings2}
        color={MODULE_COLOR}
        title="Configurações"
        description="Personalize o módulo de Processos."
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {sections.map(({ to, icon, title, description }) => (
          <button
            key={to}
            type="button"
            onClick={() => navigate(to)}
            className="group flex h-full flex-col gap-3 rounded-2xl border bg-card p-5 text-left shadow-sm transition-all hover:border-primary/40 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <span className="flex w-full items-start justify-between gap-3">
              <SectionTile icon={icon} />
              <ArrowRight size={16} className="text-muted-foreground transition-colors group-hover:text-primary" />
            </span>
            <span className="block min-w-0">
              <span className="block font-semibold">{title}</span>
              <span className="mt-1 block text-sm text-muted-foreground">{description}</span>
            </span>
          </button>
        ))}
      </div>
    </div>
  )
}
