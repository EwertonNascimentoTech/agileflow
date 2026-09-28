import { useEffect, useState } from "react"
import { useNavigate, useParams } from "react-router-dom"
import { AlertTriangle, ArrowLeft, FileText, Printer } from "lucide-react"

import { projetosApi, type StatusReportResponse } from "@/api/projetos"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { Notice, PageHeader } from "@/components/ds"
import StatusReportDocument from "@/modules/projetos/StatusReportDocument"

/**
 * Visualização (somente leitura) de um Status Report salvo, no layout FIEA, com
 * impressão/PDF via `window.print()`.
 */
export default function StatusReportViewPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const [report, setReport] = useState<StatusReportResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!id) return
    let active = true
    setLoading(true)
    projetosApi
      .getStatusReport(id)
      .then((r) => { if (active) setReport(r) })
      .catch(() => { if (active) setError("Report não encontrado.") })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [id])

  return (
    <div className="mx-auto max-w-[1320px] p-4 md:p-6">
      {/* Cabeçalho da tela fica fora da impressão: o PDF é só o documento. */}
      <div className="no-print mb-5 print:hidden">
        <PageHeader
          icon={FileText}
          color="#2563EB"
          title={report?.title ?? "Status Report"}
          description={
            report
              ? `Somente leitura · gerado em ${new Date(report.generated_at).toLocaleString("pt-BR")}`
              : "Somente leitura."
          }
          actions={
            <>
              <Button variant="outline" className="h-10 gap-1.5" onClick={() => navigate("/app/modules/projetos/painel-po")}>
                <ArrowLeft size={16} /> Voltar
              </Button>
              <Button className="h-10 gap-1.5" onClick={() => window.print()} disabled={!report}>
                <Printer size={16} /> Imprimir / PDF
              </Button>
            </>
          }
        />
      </div>

      {error && <div className="mb-3 print:hidden"><Notice tone="red" icon={AlertTriangle}>{error}</Notice></div>}

      {loading || !report ? (
        <div className="space-y-3">
          <Skeleton className="h-48 w-full rounded-2xl" />
          <Skeleton className="h-32 w-full rounded-2xl" />
        </div>
      ) : (
        <StatusReportDocument snapshot={report.snapshot} />
      )}
    </div>
  )
}
