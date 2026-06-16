import { useEffect, useState } from "react"
import { useNavigate } from "react-router-dom"
import { AlertTriangle, Boxes, CheckCircle2, FileText, Workflow, Wrench } from "lucide-react"

import { produtosApi, type AlertaContrato, type DashboardKpis } from "@/api/produtos"
import { KpiCard } from "@/components/KpiCard"
import { Skeleton } from "@/components/ui/skeleton"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"

const LIFECYCLE_LABEL: Record<string, string> = {
  concepcao: "Concepção", desenvolvimento: "Desenvolvimento", producao: "Produção", descontinuado: "Descontinuado",
}

export default function ProdutosDashboardPage() {
  const navigate = useNavigate()
  const [data, setData] = useState<DashboardKpis | null>(null)
  const [alertas, setAlertas] = useState<AlertaContrato[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    Promise.all([produtosApi.getDashboard().catch(() => null), produtosApi.getAlertasContratos().catch(() => [])])
      .then(([d, a]) => { setData(d); setAlertas(a) })
      .finally(() => setLoading(false))
  }, [])

  if (loading) return <Skeleton className="h-40 w-full" />

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold">Portfólio de Produtos</h2>
          <p className="text-sm text-muted-foreground">Visão geral do portfólio.</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => navigate("/app/modules/produtos/indicadores")}>Indicadores</Button>
          <Button onClick={() => navigate("/app/modules/produtos/produtos")}>Ver produtos</Button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
        <KpiCard label="Produtos" value={data?.total_products ?? 0} icon={Boxes} />
        <KpiCard label="Em produção" value={data?.by_lifecycle?.producao ?? 0} icon={CheckCircle2} />
        <KpiCard label="Serviços digitais" value={data?.total_servicos ?? 0} icon={Wrench} />
        <KpiCard label="Documentos natos" value={data?.total_documentos ?? 0} icon={FileText} />
        <KpiCard label="Proc. automatizados" value={data?.total_processos_automatizados ?? 0} icon={Workflow} />
        <KpiCard label="Contratos vencendo" value={data?.contratos_vencendo ?? 0} icon={AlertTriangle} deltaTone={(data?.contratos_vencendo ?? 0) > 0 ? "down" : "up"} />
      </div>

      {data && Object.keys(data.by_lifecycle).length > 0 && (
        <div className="rounded-lg border p-4">
          <p className="mb-2 text-[11px] font-bold uppercase tracking-wide text-muted-foreground">Por ciclo de vida</p>
          <div className="flex flex-wrap gap-4 text-sm">
            {Object.entries(data.by_lifecycle).map(([k, v]) => <span key={k}>{LIFECYCLE_LABEL[k] ?? k}: <strong>{v}</strong></span>)}
          </div>
        </div>
      )}

      {alertas.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base"><AlertTriangle size={16} className="text-amber-600" /> Alertas de contrato ({alertas.length})</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1.5">
            {alertas.map((a, i) => (
              <button key={i} type="button" onClick={() => navigate(`/app/modules/produtos/produtos/${a.product_id}`)}
                className="flex w-full items-center justify-between gap-2 rounded-md border p-2 text-left text-sm transition hover:bg-muted/50">
                <span className="truncate"><strong>{a.product_name}</strong> — {a.mensagem}</span>
                {a.dias_para_vencer != null && <span className={`shrink-0 text-xs ${a.dias_para_vencer <= 30 ? "text-destructive" : "text-amber-600"}`}>{a.dias_para_vencer}d</span>}
              </button>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  )
}
