import { useNavigate } from "react-router-dom"
import { ArrowRight, CalendarRange, ClipboardList, FileText, GitBranch, Grid2x2, KanbanSquare, LayoutGrid, ListChecks, Settings2 } from "lucide-react"

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"

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

export default function ProjectConfigHomePage() {
  const navigate = useNavigate()

  return (
    <div className="w-full space-y-4">
      <div>
        <h2 className="text-lg font-bold">Configurações</h2>
        <p className="text-sm text-muted-foreground">Personalize o módulo de Processos.</p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {sections.map(({ to, icon: Icon, title, description }) => (
          <Card
            key={to}
            className="cursor-pointer transition-shadow hover:shadow-md group"
            onClick={() => navigate(to)}
          >
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <div className="h-9 w-9 rounded-lg bg-primary/10 text-primary flex items-center justify-center">
                  <Icon size={17} />
                </div>
                <ArrowRight size={15} className="text-muted-foreground transition-colors group-hover:text-primary" />
              </div>
              <CardTitle className="text-sm mt-2">{title}</CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
              <CardDescription className="text-xs">{description}</CardDescription>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  )
}
