import { NavLink, Outlet, useLocation } from "react-router-dom"
import { ShoppingCart, Wallet, ReceiptText, BarChart3, Settings2 } from "lucide-react"
import { cn } from "@/lib/utils"

const tabs = [
  { to: "/app/modules/pdv/pos",       icon: ShoppingCart, label: "Venda" },
  { to: "/app/modules/pdv/cash",      icon: Wallet,       label: "Caixa" },
  { to: "/app/modules/pdv/sales",     icon: ReceiptText,  label: "Vendas" },
  { to: "/app/modules/pdv/dashboard", icon: BarChart3,    label: "Dashboard" },
  { to: "/app/modules/pdv/config",    icon: Settings2,    label: "Config" },
]

export default function PdvLayout() {
  const { pathname } = useLocation()
  const inSales = pathname.startsWith("/app/modules/pdv/sales")

  return (
    <div className="flex min-h-0 flex-col h-full gap-4">
      <div className="relative">
        <div className="flex overflow-x-auto scrollbar-none border-b -mx-4 px-4 md:-mx-6 md:px-6 gap-0">
          {tabs.map(({ to, icon: Icon, label }) => {
            const isSalesTab = to === "/app/modules/pdv/sales"
            return (
              <NavLink
                key={to}
                to={to}
                end={!isSalesTab}
                className={({ isActive }) => {
                  const active = isActive || (isSalesTab && inSales)
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
