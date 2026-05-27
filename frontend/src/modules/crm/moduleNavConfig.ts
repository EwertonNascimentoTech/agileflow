/**
 * Configuração dos itens de menu lateral por módulo.
 * Quando o usuário entra num módulo, o sidebar do AppLayout mostra esses itens
 * em vez do menu padrão (Dashboard, Configurações).
 */
import {
  KanbanSquare, Users, Building2, Settings2, BarChart3,
  FileText, FileSignature,
  Package, Boxes, ArrowLeftRight, Layers, BadgeCheck,
  ShoppingCart, Wallet, ReceiptText,
  FolderKanban, List, CalendarRange,
  Network, Code2, CalendarOff,
} from "lucide-react"
import type { ElementType } from "react"

export type ModuleNavItem = {
  to: string
  icon: ElementType
  label: string
}

export const moduleNavConfig: Record<string, ModuleNavItem[]> = {
  crm: [
    { to: "/app/modules/crm/dashboard",    icon: BarChart3,      label: "Dashboard" },
    { to: "/app/modules/crm/kanban",       icon: KanbanSquare,   label: "Kanban" },
    { to: "/app/modules/crm/clients",      icon: Users,          label: "Contatos" },
    { to: "/app/modules/crm/companies",    icon: Building2,      label: "Empresas" },
    { to: "/app/modules/crm/proposals",    icon: FileText,       label: "Propostas" },
    { to: "/app/modules/crm/contracts",    icon: FileSignature,  label: "Contratos" },
    { to: "/app/modules/crm/config",       icon: Settings2,      label: "Configurações" },
  ],
  estoque: [
    { to: "/app/modules/estoque/dashboard", icon: BarChart3,      label: "Dashboard" },
    { to: "/app/modules/estoque/products",  icon: Package,        label: "Produtos" },
    { to: "/app/modules/estoque/stock",     icon: Boxes,          label: "Saldo" },
    { to: "/app/modules/estoque/movements", icon: ArrowLeftRight, label: "Movimentações" },
    { to: "/app/modules/estoque/batches",   icon: Layers,         label: "Lotes" },
    { to: "/app/modules/estoque/serials",   icon: BadgeCheck,     label: "Nº de série" },
    { to: "/app/modules/estoque/config",    icon: Settings2,      label: "Configurações" },
  ],
  pdv: [
    { to: "/app/modules/pdv/pos",       icon: ShoppingCart, label: "Venda" },
    { to: "/app/modules/pdv/cash",      icon: Wallet,       label: "Caixa" },
    { to: "/app/modules/pdv/sales",     icon: ReceiptText,  label: "Vendas" },
    { to: "/app/modules/pdv/dashboard", icon: BarChart3,    label: "Dashboard" },
    { to: "/app/modules/pdv/config",    icon: Settings2,    label: "Configurações" },
  ],
  projetos: [
    { to: "/app/modules/projetos", icon: BarChart3, label: "Visão geral" },
    { to: "/app/modules/projetos/board", icon: FolderKanban, label: "Quadro" },
    { to: "/app/modules/projetos/lista", icon: List, label: "Lista" },
    { to: "/app/modules/projetos/gantt", icon: BarChart3, label: "Gantt" },
    { to: "/app/modules/projetos/calendario", icon: CalendarRange, label: "Calendário" },
    { to: "/app/modules/projetos/relatorios", icon: BarChart3, label: "Relatórios" },
    { to: "/app/modules/projetos/config", icon: Settings2, label: "Configurações" },
  ],
  teamops: [
    { to: "/app/modules/teamops",          icon: BarChart3,   label: "Dashboard" },
    { to: "/app/modules/teamops/org",      icon: Network,     label: "Organograma" },
    { to: "/app/modules/teamops/people",   icon: Users,       label: "Pessoas" },
    { to: "/app/modules/teamops/stacks",   icon: Code2,       label: "Stacks" },
    { to: "/app/modules/teamops/absences", icon: CalendarOff, label: "Ausências" },
    { to: "/app/modules/teamops/config",   icon: Settings2,   label: "Configurações" },
  ],
}

/**
 * Dado o pathname atual, retorna o slug do módulo ativo (ex: "crm")
 * ou null se não estiver dentro de um módulo.
 */
export function getActiveModuleSlug(pathname: string): string | null {
  const match = pathname.match(/^\/app\/modules\/([^/]+)/)
  return match ? match[1] : null
}

/**
 * Rota padrão ao clicar num módulo no rail: 1º item do menu do módulo,
 * com fallback para a raiz do módulo se ele não tiver config.
 */
export function defaultModuleRoute(slug: string): string {
  const items = moduleNavConfig[slug]
  return items?.[0]?.to ?? `/app/modules/${slug}`
}
