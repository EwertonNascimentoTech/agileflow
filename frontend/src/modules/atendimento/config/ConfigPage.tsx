import { useNavigate } from "react-router-dom"
import { KanbanSquare, Plug, SlidersHorizontal, Users2, ArrowRight, GitBranch, Zap, Send, RefreshCw } from "lucide-react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"

const sections = [
  {
    to: "/app/modules/atendimento/config/funnels",
    icon: GitBranch,
    title: "Funis",
    description: "Crie e gerencie funis de vendas/atendimento.",
  },
  {
    to: "/app/modules/atendimento/config/statuses",
    icon: KanbanSquare,
    title: "Etapas do Kanban",
    description: "Configure as colunas (etapas) de cada funil, com cores e tipo de resultado.",
  },
  {
    to: "/app/modules/atendimento/config/channels",
    icon: Plug,
    title: "Canais",
    description: "Integre WhatsApp, Instagram, site e outros canais.",
  },
  {
    to: "/app/modules/atendimento/config/fields",
    icon: SlidersHorizontal,
    title: "Campos Personalizados",
    description: "Adicione campos extras para clientes e atendimentos.",
  },
  {
    to: "/app/modules/atendimento/config/rules",
    icon: Users2,
    title: "Regras de Atribuição",
    description: "Defina como os atendimentos são distribuídos aos agentes.",
  },
  {
    to: "/app/modules/atendimento/config/automations",
    icon: Zap,
    title: "Automações",
    description: "Crie regras automáticas que disparam ao mudar de etapa, ganhar ou perder.",
  },
  {
    to: "/app/modules/atendimento/config/follow-ups",
    icon: Send,
    title: "Follow-ups Automáticos",
    description: "Templates de mensagem enviados quando o atendimento entra em uma etapa.",
  },
  {
    to: "/app/modules/atendimento/config/reactivation",
    icon: RefreshCw,
    title: "Reativação Automática",
    description: "Regras para reativar negócios perdidos após X dias automaticamente.",
  },
]

export default function ConfigPage() {
  const navigate = useNavigate()
  return (
    <div className="w-full space-y-4">
      <div>
        <h2 className="text-lg font-bold">Configurações</h2>
        <p className="text-sm text-muted-foreground">Personalize o módulo de Atendimento.</p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {sections.map(({ to, icon: Icon, title, description }) => (
          <Card
            key={to}
            className="cursor-pointer hover:shadow-md transition-shadow group"
            onClick={() => navigate(to)}
          >
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <div className="h-9 w-9 rounded-lg bg-primary/10 text-primary flex items-center justify-center">
                  <Icon size={17} />
                </div>
                <ArrowRight size={15} className="text-muted-foreground group-hover:text-primary transition-colors" />
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
