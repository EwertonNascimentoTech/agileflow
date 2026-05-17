import { NavLink, Outlet, useLocation } from "react-router-dom"
import {
  BarChart3, Package, Boxes,
  ArrowLeftRight, Layers, BadgeCheck, Settings2,
} from "lucide-react"
import { cn } from "@/lib/utils"

const tabs = [
  { to: "/app/modules/estoque/dashboard",   icon: BarChart3,      label: "Dashboard" },
  { to: "/app/modules/estoque/products",    icon: Package,        label: "Produtos" },
  { to: "/app/modules/estoque/stock",       icon: Boxes,          label: "Saldo" },
  { to: "/app/modules/estoque/movements",   icon: ArrowLeftRight, label: "Movimentações" },
  { to: "/app/modules/estoque/batches",     icon: Layers,         label: "Lotes" },
  { to: "/app/modules/estoque/serials",     icon: BadgeCheck,     label: "Números de série" },
  { to: "/app/modules/estoque/config",      icon: Settings2,      label: "Config" },
]

// Sub-rotas que ainda fazem parte de "Config" mas tem rota direta — destaca a aba Config quando ativas.
const CONFIG_PREFIXES = [
  "/app/modules/estoque/config",
  "/app/modules/estoque/product-types",
  "/app/modules/estoque/categories",
  "/app/modules/estoque/warehouses",
  "/app/modules/estoque/suppliers",
]

export default function EstoqueLayout() {
  const { pathname } = useLocation()
  const inConfig = CONFIG_PREFIXES.some(p => pathname.startsWith(p))

  return (
    <div className="flex min-h-0 flex-col h-full gap-4">
      <div className="relative">
        <div className="flex overflow-x-auto scrollbar-none border-b -mx-4 px-4 md:-mx-6 md:px-6 gap-0">
          {tabs.map(({ to, icon: Icon, label }) => {
            const isConfigTab = to === "/app/modules/estoque/config"
            return (
              <NavLink
                key={to}
                to={to}
                end={!isConfigTab}
                className={({ isActive }) => {
                  const active = isActive || (isConfigTab && inConfig)
                  return cn(
                    "flex items-center gap-1.5 px-3 py-2.5 text-sm font-medium border-b-2 -mb-px whitespace-nowrap shrink-0 transition-colors",
                    active
                      ? "border-primary text-primary"
                      : "border-transparent text-muted-foreground hover:text-foreground hover:border-muted-foreground/40"
                  )
                }}
              >
                <Icon size={14} />
                {label}
              </NavLink>
            )
          })}
        </div>
        <div className="absolute right-0 top-0 bottom-1 w-8 bg-gradient-to-l from-background to-transparent pointer-events-none md:hidden" />
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden">
        <Outlet />
      </div>
    </div>
  )
}
