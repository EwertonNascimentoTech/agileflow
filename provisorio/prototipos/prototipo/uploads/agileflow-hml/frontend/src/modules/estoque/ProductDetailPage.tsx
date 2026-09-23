import { useEffect, useState } from "react"
import { useParams, Link } from "react-router-dom"
import { ArrowLeft } from "lucide-react"
import {
  productsApi, productTypesApi, stockApi, warehousesApi,
  type Product, type ProductType, type StockLevel, type Warehouse,
} from "@/api/estoque"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"

export default function ProductDetailPage() {
  const { id } = useParams<{ id: string }>()
  const [product, setProduct] = useState<Product | null>(null)
  const [ptype, setPtype] = useState<ProductType | null>(null)
  const [levels, setLevels] = useState<StockLevel[]>([])
  const [warehouses, setWarehouses] = useState<Warehouse[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!id) return
    productsApi.get(id)
      .then(async (p) => {
        setProduct(p)
        const [type, lvls, whs] = await Promise.all([
          productTypesApi.get(p.type_id),
          stockApi.levels({ product_id: p.id }),
          warehousesApi.list(false),
        ])
        setPtype(type); setLevels(lvls); setWarehouses(whs)
      })
      .catch((e) => setError(e?.response?.data?.detail ?? "Erro ao carregar."))
      .finally(() => setLoading(false))
  }, [id])

  if (loading) return <div className="space-y-3">{[...Array(3)].map((_, i) => <Skeleton key={i} className="h-24" />)}</div>
  if (error || !product) return <div className="text-sm text-destructive">{error ?? "Produto não encontrado."}</div>

  return (
    <div className="space-y-4">
      <Link to="/app/modules/estoque/products" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft size={14} /> Voltar
      </Link>

      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-xl font-bold">{product.name}</h1>
          <p className="text-xs text-muted-foreground font-mono">
            SKU: {product.sku} {product.barcode ? ` · ${product.barcode}` : ""}
          </p>
          <div className="flex gap-2 mt-2 flex-wrap">
            {ptype && <Badge variant="outline">{ptype.name}</Badge>}
            {!product.is_active && <Badge variant="outline">inativo</Badge>}
          </div>
        </div>
      </div>

      <Card>
        <CardContent className="p-4 space-y-2">
          <p className="text-sm font-semibold">Dados</p>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
            <div><p className="text-[11px] text-muted-foreground">Unidade</p><p>{product.unit}</p></div>
            <div><p className="text-[11px] text-muted-foreground">Custo</p><p>{product.cost_price}</p></div>
            <div><p className="text-[11px] text-muted-foreground">Venda</p><p>{product.sale_price}</p></div>
            <div><p className="text-[11px] text-muted-foreground">Mín. estoque</p><p>{product.min_stock}</p></div>
          </div>
          {product.description && <p className="text-sm text-muted-foreground mt-2">{product.description}</p>}
        </CardContent>
      </Card>

      {ptype?.field_schema?.fields && product.custom_fields && Object.keys(product.custom_fields).length > 0 && (
        <Card>
          <CardContent className="p-4 space-y-2">
            <p className="text-sm font-semibold">Campos do tipo</p>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-sm">
              {ptype.field_schema.fields.map(f => (
                <div key={f.key}>
                  <p className="text-[11px] text-muted-foreground">{f.label}</p>
                  <p>{String((product.custom_fields as Record<string, unknown>)[f.key] ?? "—")}</p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardContent className="p-4 space-y-2">
          <p className="text-sm font-semibold">Saldo por depósito</p>
          {levels.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhum saldo registrado.</p>
          ) : (
            <div className="space-y-1.5">
              {levels.map(lvl => {
                const w = warehouses.find(x => x.id === lvl.warehouse_id)
                return (
                  <div key={lvl.id} className="flex items-center justify-between text-sm border rounded-md p-2">
                    <span>{w?.name ?? lvl.warehouse_id}</span>
                    <span className="font-semibold">{lvl.quantity} {product.unit}</span>
                  </div>
                )
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
