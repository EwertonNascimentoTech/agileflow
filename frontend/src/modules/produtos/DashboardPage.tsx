import { useEffect, useState } from "react"
import { useNavigate } from "react-router-dom"
import {
  AlertTriangle, BarChart3, Boxes, CheckCircle2, FileBox, FileText, Hammer, LifeBuoy, Rocket, ShieldAlert, Workflow, Wrench,
} from "lucide-react"

import { produtosApi, type AlertaContrato, type DashboardKpis } from "@/api/produtos"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { EmptyState } from "@/components/EmptyState"
import { KpiCount, KpiRow, PageHeader, Pill, ProgressBar, SectionCard, TABLE } from "@/components/ds"

const LIFECYCLE_LABEL: Record<string, string> = {
  concepcao: "Concepção", desenvolvimento: "Desenvolvimento", producao: "Produção", descontinuado: "Descontinuado",
}
const LIFECYCLE_ORDER = ["concepcao", "desenvolvimento", "producao", "descontinuado"]
const LIFECYCLE_COLOR: Record<string, string> = {
  concepcao: "#94A3B8", desenvolvimento: "#7C3AED", producao: "#10B981", descontinuado: "#64748B",
}

/** Título de cada faixa de indicadores. */
function RowTitle({ children }: { children: string }) {
  return <h2 className="text-sm font-semibold text-muted-foreground">{children}</h2>
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

  if (loading) {
    return (
      <div className="space-y-5">
        <Skeleton className="h-16 w-2/3 rounded-xl" />
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-6">
          {Array.from({ length: 6 }, (_, i) => <Skeleton key={i} className="h-[74px] rounded-xl" />)}
        </div>
        <Skeleton className="h-72 rounded-2xl" />
      </div>
    )
  }

  const total = data?.total_products ?? 0
  const lifecycle = data
    ? [...LIFECYCLE_ORDER, ...Object.keys(data.by_lifecycle).filter((k) => !LIFECYCLE_ORDER.includes(k))]
        .filter((k) => data.by_lifecycle[k] != null)
        .map((k) => ({ key: k, label: LIFECYCLE_LABEL[k] ?? k, value: data.by_lifecycle[k] }))
    : []
  const aVencer = data?.contratos_a_vencer_90d ?? 0
  const semContrato = data?.sem_contrato ?? 0
  const semDoc = data?.sem_documentacao ?? 0

  return (
    <div className="space-y-5">
      <PageHeader
        icon="Package"
        color="#7C3AED"
        title="Portfólio de Produtos"
        description="Visão geral dos produtos digitais: ciclo de vida, contratos, documentação e o que cada produto entrega em serviços e documentos."
        actions={
          <>
            <Button variant="outline" className="h-10 gap-1.5" onClick={() => navigate("/app/modules/produtos/indicadores")}>
              <BarChart3 size={16} /> Indicadores
            </Button>
            <Button className="h-10 gap-1.5" onClick={() => navigate("/app/modules/produtos/produtos")}>
              <Boxes size={16} /> Ver produtos
            </Button>
          </>
        }
      />

      <section className="space-y-2">
        <RowTitle>Ciclo de vida</RowTitle>
        <KpiRow className="sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-6">
          <KpiCount icon={Boxes} value={total} label="Produtos" onClick={() => navigate("/app/modules/produtos/produtos")} />
          <KpiCount icon={Hammer} value={data?.em_desenvolvimento ?? 0} label="Em desenvolvimento" tone="violet" />
          <KpiCount icon={CheckCircle2} value={data?.em_producao ?? 0} label="Em produção" tone="emerald" />
          <KpiCount icon={LifeBuoy} value={data?.em_sustentacao ?? 0} label="Em sustentação" tone="primary" />
          <KpiCount icon={FileBox} value={data?.descontinuados ?? 0} label="Descontinuados" tone="slate" />
          <KpiCount icon={Rocket} value={data?.releases_publicadas_mes ?? 0} label="Releases no mês" tone="primary" />
        </KpiRow>
      </section>

      <section className="space-y-2">
        <RowTitle>Riscos e pendências</RowTitle>
        <KpiRow className="sm:grid-cols-2 xl:grid-cols-4">
          <KpiCount icon={FileText} value={semContrato} label="Sem contrato" tone={semContrato > 0 ? "amber" : "slate"} highlight={semContrato > 0} />
          <KpiCount icon={AlertTriangle} value={aVencer} label="Contratos a vencer (90 dias)" tone={aVencer > 0 ? "red" : "slate"} highlight={aVencer > 0} />
          <KpiCount icon={FileText} value={semDoc} label="Sem documentação" tone={semDoc > 0 ? "amber" : "slate"} highlight={semDoc > 0} />
          <KpiCount icon={ShieldAlert} value={data?.com_dados_pessoais ?? 0} label="Com dados pessoais" tone="violet" />
        </KpiRow>
      </section>

      <section className="space-y-2">
        <RowTitle>Serviços e documentos</RowTitle>
        <KpiRow className="sm:grid-cols-3">
          <KpiCount icon={Wrench} value={data?.total_servicos ?? 0} label="Serviços digitais" />
          <KpiCount icon={FileText} value={data?.total_documentos ?? 0} label="Documentos natos digitais" />
          <KpiCount icon={Workflow} value={data?.total_processos_automatizados ?? 0} label="Processos automatizados" />
        </KpiRow>
      </section>

      <div className="grid gap-4 xl:grid-cols-[1fr_1.6fr]">
        <SectionCard title="Por ciclo de vida" subtitle="Quantos produtos estão em cada fase.">
          {lifecycle.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">Sem produtos cadastrados.</p>
          ) : (
            <ul className="space-y-4">
              {lifecycle.map((l) => (
                <li key={l.key}>
                  <div className="mb-1 flex items-baseline justify-between text-sm">
                    <span className="font-medium">{l.label}</span>
                    <span className="tabular-nums text-muted-foreground">
                      <strong className="text-foreground">{l.value}</strong> · {total ? Math.round((100 * l.value) / total) : 0}%
                    </span>
                  </div>
                  <ProgressBar value={total ? (100 * l.value) / total : 0} color={LIFECYCLE_COLOR[l.key]} showLabel={false} />
                </li>
              ))}
            </ul>
          )}
        </SectionCard>

        <SectionCard
          title={`Alertas de contrato${alertas.length ? ` (${alertas.length})` : ""}`}
          subtitle="Contratos vencidos ou perto de vencer. Clique para abrir o produto."
          icon={AlertTriangle}
          flush
        >
          {alertas.length === 0 ? (
            <EmptyState icon={CheckCircle2} title="Nenhum alerta" description="Nenhum contrato vencido ou a vencer." />
          ) : (
            <div className={`${TABLE.wrap} max-h-[420px] overflow-y-auto`}>
              <table className={TABLE.table}>
                <thead className={`${TABLE.thead} sticky top-0`}>
                  <tr>
                    <th className={TABLE.thFirst}>Produto</th>
                    <th className={TABLE.th}>Alerta</th>
                    <th className={`${TABLE.th} text-right`}>Prazo</th>
                  </tr>
                </thead>
                <tbody>
                  {alertas.map((a, i) => (
                    <tr
                      key={`${a.product_id}-${i}`}
                      className={`${TABLE.tr} cursor-pointer`}
                      onClick={() => navigate(`/app/modules/produtos/produtos/${a.product_id}`)}
                    >
                      <td className={`${TABLE.tdFirst} font-medium`}>{a.product_name}</td>
                      <td className={`${TABLE.td} text-muted-foreground`}>{a.mensagem}</td>
                      <td className={`${TABLE.td} text-right`}>
                        {a.dias_para_vencer != null ? (
                          <Pill tone={a.dias_para_vencer <= 30 ? "red" : "amber"} dot>
                            {a.dias_para_vencer} {a.dias_para_vencer === 1 ? "dia" : "dias"}
                          </Pill>
                        ) : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </SectionCard>
      </div>
    </div>
  )
}
