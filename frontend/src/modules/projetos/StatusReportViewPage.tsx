import { useEffect, useState } from "react"
import { useNavigate, useParams } from "react-router-dom"
import { ArrowLeft, Printer } from "lucide-react"

import { projetosApi, type StatusReportResponse } from "@/api/projetos"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
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
      <div className="no-print mb-4 flex flex-wrap items-center gap-3">
        <Button variant="ghost" size="sm" className="gap-1.5" onClick={() => navigate("/app/modules/projetos/painel-po")}>
          <ArrowLeft className="h-4 w-4" /> Voltar
        </Button>
        <Button className="ml-auto gap-1.5" onClick={() => window.print()} disabled={!report}>
          <Printer className="h-4 w-4" /> Imprimir / PDF
        </Button>
      </div>

      {error && <p className="mb-3 text-sm text-destructive">{error}</p>}

      {loading || !report ? (
        <div className="space-y-3">
          <Skeleton className="h-48 w-full" />
          <Skeleton className="h-32 w-full" />
        </div>
      ) : (
        <StatusReportDocument snapshot={report.snapshot} />
      )}
    </div>
  )
}
