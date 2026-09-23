import { useEffect, useState } from "react"
import { Package, Warehouse as WarehouseIcon, DollarSign, AlertTriangle } from "lucide-react"
import { stockApi, type EstoqueOverview } from "@/api/estoque"
import { Card, CardContent } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { PageHeader } from "@/components/PageHeader"
import { KpiCard } from "@/components/KpiCard"

function fmtMoney(v: number) {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })
}

export default function DashboardPage() {
  const [data, setData] = useState<EstoqueOverview | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    stockApi.overview()
      .then(setData)
      .catch((e) => setError(e?.response?.data?.detail ?? "Erro ao carregar dashboard."))
      .finally(() => setLoading(false))
  }, [])

  if (loading) {
    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-24 rounded-lg" />)}
      </div>
    )
  }

  if (error || !data) {
    return <div className="text-sm text-destructive">{error ?? "Sem dados."}</div>
  }

  const cards = [
    { icon: Package,       label: "Produtos ativos",  value: data.total_products.toString() },
    { icon: WarehouseIcon, label: "Depósitos ativos", value: data.total_warehouses.toString() },
    { icon: DollarSign,    label: "Valor em estoque", value: fmtMoney(data.total_stock_value) },
    { icon: AlertTriangle, label: "Itens abaixo do mín.", value: data.low_stock.length.toString() },
  ]

  return (
    <div className="space-y-6">
      <PageHeader
        title="Estoque"
        subtitle="Visão geral do catálogo, depósitos e níveis de estoque."
      />

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        {cards.map(({ icon: Icon, label, value }) => (
          <KpiCard key={label} icon={Icon} label={label} value={value} />
        ))}
      </div>

      <div>
        <h2 className="text-base font-semibold mb-2">Itens abaixo do mínimo</h2>
        {data.low_stock.length === 0 ? (
          <Card><CardContent className="p-6 text-sm text-muted-foreground">Tudo em ordem — nenhum produto abaixo do mínimo.</CardContent></Card>
        ) : (
          <div className="space-y-1.5">
            {data.low_stock.map((item) => (
              <Card key={`${item.product_id}-${item.warehouse_id}`}>
                <CardContent className="p-3 flex items-center justify-between gap-3 text-sm">
                  <div className="min-w-0">
                    <p className="font-medium truncate">{item.name}</p>
                    <p className="text-xs text-muted-foreground font-mono">{item.sku}</p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-destructive font-semibold">{item.quantity}</p>
                    <p className="text-[11px] text-muted-foreground">mín. {item.min_stock}</p>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
