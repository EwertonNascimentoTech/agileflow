import {
  BarChart3,
  FolderKanban,
  Layers,
  List,
  CalendarRange,
  Settings2,
  Network,
  Users,
  Code2,
  CalendarOff,
  Gauge,
} from "lucide-react"
import type { ElementType } from "react"

export type ModuleNavItem = {
  to: string
  icon: ElementType
  label: string
}

export const moduleNavConfig: Record<string, ModuleNavItem[]> = {
  projetos: [
    { to: "/app/modules/projetos", icon: BarChart3, label: "Visão geral" },
    { to: "/app/modules/projetos/board", icon: FolderKanban, label: "Quadro" },
    { to: "/app/modules/projetos/lista", icon: List, label: "Lista" },
    { to: "/app/modules/projetos/cronograma", icon: CalendarRange, label: "Cronograma" },
    { to: "/app/modules/projetos/capacidade", icon: Gauge, label: "Capacidade" },
    { to: "/app/modules/projetos/calendario", icon: CalendarRange, label: "Calendário" },
    { to: "/app/modules/projetos/programas", icon: Layers, label: "Programa" },
    { to: "/app/modules/projetos/relatorios", icon: BarChart3, label: "Relatórios" },
    { to: "/app/modules/projetos/config", icon: Settings2, label: "Configurações" },
  ],
  teamops: [
    { to: "/app/modules/teamops", icon: BarChart3, label: "Dashboard" },
    { to: "/app/modules/teamops/org", icon: Network, label: "Organograma" },
    { to: "/app/modules/teamops/people", icon: Users, label: "Pessoas" },
    { to: "/app/modules/teamops/stacks", icon: Code2, label: "Stacks" },
    { to: "/app/modules/teamops/absences", icon: CalendarOff, label: "Ausências" },
    { to: "/app/modules/teamops/config", icon: Settings2, label: "Configurações" },
  ],
}

export function getActiveModuleSlug(pathname: string): string | null {
  const match = pathname.match(/^\/app\/modules\/([^/]+)/)
  return match ? match[1] : null
}

export function defaultModuleRoute(slug: string): string {
  const items = moduleNavConfig[slug]
  return items?.[0]?.to ?? `/app/modules/${slug}`
}
