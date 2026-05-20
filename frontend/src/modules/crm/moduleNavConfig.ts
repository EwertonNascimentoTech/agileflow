/**
 * Configuração dos itens de menu lateral por módulo.
 * Quando o usuário entra num módulo, o sidebar do AppLayout mostra esses itens
 * em vez do menu padrão (Dashboard, Configurações).
 */
import {
  KanbanSquare, Users, Building2, Settings2, BarChart3, TrendingUp,
  GitBranch, ClipboardList, DollarSign, FileText, FileSignature,
  Package, Boxes, ArrowLeftRight, Layers, BadgeCheck,
  ShoppingCart, Wallet, ReceiptText,
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
    { to: "/app/modules/crm/forecast",     icon: TrendingUp,     label: "Forecast" },
    { to: "/app/modules/crm/conversion",   icon: GitBranch,      label: "Conversão" },
    { to: "/app/modules/crm/productivity", icon: ClipboardList,  label: "Produtividade" },
    { to: "/app/modules/crm/revenue",      icon: DollarSign,     label: "Receita" },
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
}

/**
 * Dado o pathname atual, retorna o slug do módulo ativo (ex: "crm")
 * ou null se não estiver dentro de um módulo.
 */
export function getActiveModuleSlug(pathname: string): string | null {
  const match = pathname.match(/^\/app\/modules\/([^/]+)/)
  return match ? match[1] : null
}
