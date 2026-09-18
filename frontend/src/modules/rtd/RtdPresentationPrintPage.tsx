import { useEffect, useState } from "react"
import { useNavigate, useParams } from "react-router-dom"
import { ArrowLeft, Printer } from "lucide-react"

import { rtdApi, type PersonMini, type ReuniaoReport } from "@/api/rtd"
import RtdPresentationDocument from "@/modules/rtd/RtdPresentationDocument"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { toast } from "@/lib/toast"

/**
 * Visualiza??o imprim?vel da apresenta??o RTD (capa + indicadores + planos).
 * Use "Imprimir / PDF" do navegador para gerar o arquivo.
 */
export default function RtdPresentationPrintPage() {
  const { id = "" } = useParams()
  const navigate = useNavigate()
  const [report, setReport] = useState<ReuniaoReport | null>(null)
  const [persons, setPersons] = useState<PersonMini[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!id) return
    let active = true
    setLoading(true)
    Promise.all([rtdApi.getReport(id), rtdApi.listPersons().catch(() => [] as PersonMini[])])
      .then(([rep, people]) => {
        if (!active) return
        setReport(rep)
        setPersons(people)
      })
      .catch(() => {
        if (active) toast.error("Falha ao carregar a apresenta??o da reuni?o")
      })
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => { active = false }
  }, [id])

  return (
    <div className="mx-auto max-w-[1320px] p-4 md:p-6">
      <div className="no-print mb-4 flex flex-wrap items-center gap-3">
        <Button
          variant="ghost"
          size="sm"
          className="gap-1.5"
          onClick={() => navigate(`/app/modules/rtd/reunioes/${id}`)}
        >
          <ArrowLeft className="h-4 w-4" /> Voltar ? reuni?o
        </Button>
        <Button className="ml-auto gap-1.5" onClick={() => window.print()} disabled={!report}>
          <Printer className="h-4 w-4" /> Imprimir / PDF
        </Button>
      </div>

      {loading || !report ? (
        <div className="space-y-3">
          <Skeleton className="h-48 w-full" />
          <Skeleton className="h-64 w-full" />
        </div>
      ) : (
        <RtdPresentationDocument reuniaoId={id} report={report} persons={persons} />
      )}
    </div>
  )
}
