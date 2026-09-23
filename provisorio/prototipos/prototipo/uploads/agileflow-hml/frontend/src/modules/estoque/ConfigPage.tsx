import { Link } from "react-router-dom"
import {
  Settings2, Tags, Warehouse as WarehouseIcon, Truck,
  ChevronRight,
} from "lucide-react"
import { Card, CardContent } from "@/components/ui/card"

const items = [
  {
    to: "product-types",
    icon: Settings2,
    label: "Tipos de produto",
    description: "Define quais campos extras cada produto tem (lote, validade, serial, campos custom).",
  },
  {
    to: "categories",
    icon: Tags,
    label: "Categorias",
    description: "Agrupa produtos. Suporta hierarquia (pai/filho).",
  },
  {
    to: "warehouses",
    icon: WarehouseIcon,
    label: "Depósitos",
    description: "Locais físicos ou lógicos onde o estoque é mantido.",
  },
  {
    to: "suppliers",
    icon: Truck,
    label: "Fornecedores",
    description: "Cadastro de fornecedores para vincular a produtos e movimentações de entrada.",
  },
]

export default function ConfigPage() {
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-bold">Configurações do Estoque</h1>
        <p className="text-sm text-muted-foreground">
          Configure o catálogo, depósitos e fornecedores antes de começar a operar.
        </p>
      </div>

      <div className="grid gap-2 sm:grid-cols-2">
        {items.map(({ to, icon: Icon, label, description }) => (
          <Link key={to} to={to}>
            <Card className="cursor-pointer hover:shadow-sm transition-shadow h-full">
              <CardContent className="p-4 flex items-start gap-3">
                <div className="h-10 w-10 rounded-lg bg-primary/10 text-primary flex items-center justify-center shrink-0">
                  <Icon size={18} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-sm">{label}</p>
                  <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{description}</p>
                </div>
                <ChevronRight size={16} className="text-muted-foreground shrink-0 mt-1" />
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  )
}
