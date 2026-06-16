import { useEffect, useState } from "react"
import { useNavigate, useSearchParams } from "react-router-dom"
import { ArrowLeft, Save } from "lucide-react"

import { projetosApi, type StatusReportSnapshot } from "@/api/projetos"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import StatusReportDocument from "@/modules/projetos/StatusReportDocument"

/**
 * Rascunho do Status Report: monta o estado atual do recorte (preview, não persistido),
 * deixa o gestor ajustar a narrativa e salva o snapshot imutável.
 */
export default function StatusReportEditorPage() {
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const diretoria = params.get("diretoria")
  const area = params.get("area")

  const [snapshot, setSnapshot] = useState<StatusReportSnapshot | null>(null)
  const [title, setTitle] = useState("Status Report")
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let active = true
    setLoading(true)
    projetosApi
      .previewStatusReport({ diretoria, area })
      .then((s) => {
        if (!active) return
        setSnapshot(s)
        const recorte = [s.meta.diretoria_label, s.meta.area_label].filter(Boolean).join(" · ")
        setTitle(recorte ? `Status Report — ${recorte}` : "Status Report")
      })
      .catch(() => { if (active) setError("Não foi possível montar o report.") })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [diretoria, area])

  async function save() {
    if (!snapshot) return
    setSaving(true)
    setError(null)
    try {
      const report = await projetosApi.createStatusReport({
        diretoria,
        area,
        diretoria_label: snapshot.meta.diretoria_label,
        area_label: snapshot.meta.area_label,
        title,
        snapshot,
        kpis: snapshot.kpis,
      })
      navigate(`/app/modules/projetos/status-reports/${report.id}`)
    } catch {
      setError("Falha ao salvar o report.")
      setSaving(false)
    }
  }

  return (
    <div className="mx-auto max-w-[1320px] p-4 md:p-6">
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <Button variant="ghost" size="sm" className="gap-1.5" onClick={() => navigate("/app/modules/projetos/painel-po")}>
          <ArrowLeft className="h-4 w-4" /> Voltar
        </Button>
        <Input
          className="h-9 max-w-md flex-1"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Título do report"
        />
        <Button className="ml-auto gap-1.5" onClick={save} disabled={saving || loading || !snapshot}>
          <Save className="h-4 w-4" /> {saving ? "Salvando…" : "Salvar report"}
        </Button>
      </div>

      {error && <p className="mb-3 text-sm text-destructive">{error}</p>}

      {loading || !snapshot ? (
        <div className="space-y-3">
          <Skeleton className="h-48 w-full" />
          <Skeleton className="h-32 w-full" />
        </div>
      ) : (
        <StatusReportDocument snapshot={snapshot} editable onChange={setSnapshot} />
      )}
    </div>
  )
}
