import { useEffect, useState } from "react"
import { Boxes } from "lucide-react"
import {
  stockApi, productsApi, warehousesApi,
  type StockLevel, type Product, type Warehouse,
} from "@/api/estoque"
import { Card, CardContent } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { EmptyState } from "@/components/EmptyState"

const NONE = "__none__"

export default function StockPage() {
  const [levels, setLevels] = useState<StockLevel[]>([])
  const [products, setProducts] = useState<Product[]>([])
  const [warehouses, setWarehouses] = useState<Warehouse[]>([])
  const [loading, setLoading] = useState(true)
  const [filterWh, setFilterWh] = useState<string>(NONE)
  const [filterProd, setFilterProd] = useState<string>(NONE)

  useEffect(() => {
    Promise.all([
      stockApi.levels(),
      productsApi.list({ limit: 500 }),
      warehousesApi.list(false),
    ]).then(([l, p, w]) => {
      setLevels(l); setProducts(p); setWarehouses(w)
    }).finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    stockApi.levels({
      warehouse_id: filterWh !== NONE ? filterWh : undefined,
      product_id: filterProd !== NONE ? filterProd : undefined,
    }).then(setLevels)
  }, [filterWh, filterProd])

  function productOf(id: string) { return products.find(p => p.id === id) }
  function warehouseOf(id: string) { return warehouses.find(w => w.id === id) }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-bold">Saldo de estoque</h1>
        <p className="text-sm text-muted-foreground">Quantidade atual por produto e depósito.</p>
      </div>

      <div className="flex gap-2 flex-wrap">
        <Select value={filterWh} onValueChange={setFilterWh}>
          <SelectTrigger className="w-56 h-9"><SelectValue placeholder="Todos os depósitos" /></SelectTrigger>
          <SelectContent>
            <SelectItem value={NONE}>Todos os depósitos</SelectItem>
            {warehouses.map(w => <SelectItem key={w.id} value={w.id}>{w.name}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={filterProd} onValueChange={setFilterProd}>
          <SelectTrigger className="w-72 h-9"><SelectValue placeholder="Todos os produtos" /></SelectTrigger>
          <SelectContent>
            <SelectItem value={NONE}>Todos os produtos</SelectItem>
            {products.map(p => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      {loading ? (
        <div className="space-y-2">{[...Array(5)].map((_, i) => <Skeleton key={i} className="h-12 rounded-lg" />)}</div>
      ) : levels.length === 0 ? (
        <EmptyState icon={Boxes} title="Sem saldo registrado" description="Registre uma movimentação de entrada para criar saldo." />
      ) : (
        <div className="space-y-1.5">
          {levels.map(lvl => {
            const p = productOf(lvl.product_id)
            const w = warehouseOf(lvl.warehouse_id)
            const low = p && p.min_stock > 0 && lvl.quantity <= p.min_stock
            return (
              <Card key={lvl.id}>
                <CardContent className="p-3 flex items-center justify-between gap-3 text-sm">
                  <div className="min-w-0">
                    <p className="font-medium truncate">{p?.name ?? lvl.product_id}</p>
                    <p className="text-[11px] text-muted-foreground">
                      {w?.name ?? lvl.warehouse_id}
                      {p?.sku ? ` · SKU ${p.sku}` : ""}
                    </p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className={`font-semibold ${low ? "text-destructive" : ""}`}>
                      {lvl.quantity} {p?.unit ?? ""}
                    </p>
                    {p && p.min_stock > 0 && (
                      <p className="text-[11px] text-muted-foreground">mín. {p.min_stock}</p>
                    )}
                  </div>
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}
    </div>
  )
}
