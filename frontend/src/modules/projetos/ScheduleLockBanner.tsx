import { useState } from "react"
import { useNavigate } from "react-router-dom"
import { GitCompare, History, Loader2, Lock, Unlock } from "lucide-react"

import { projetosApi, type ScheduleBaseline, type ScheduleLockState } from "@/api/projetos"
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { Badge } from "@/components/ui/badge"
import { toast } from "@/lib/toast"

function errDetail(err: unknown, fallback: string): string {
  const e = err as { response?: { data?: { detail?: unknown } } }
  return typeof e.response?.data?.detail === "string" ? e.response.data.detail : fallback
}

/**
 * Faixa de estado do controle de baseline do cronograma (travado / em revisão) com as ações
 * "Liberar alteração" (salva baseline + justificativa), "Concluir revisão" (re-trava) e
 * "Histórico". Reutilizável: cronograma do projeto, cronograma completo e card de tarefa.
 * Não renderiza nada quando o estado é "open" (sem trava).
 */
export function ScheduleLockBanner({
  projectId,
  lock,
  onChanged,
  showTitle = false,
  compact = false,
  onCompareBaseline,
}: {
  projectId: string
  lock: ScheduleLockState
  onChanged: () => void
  showTitle?: boolean
  compact?: boolean
  /** Quando definido (cronograma escopado), compara no próprio Gantt. Senão, navega até ele. */
  onCompareBaseline?: (b: ScheduleBaseline) => void
}) {
  const navigate = useNavigate()
  const [dialogOpen, setDialogOpen] = useState(false)
  const [justification, setJustification] = useState("")
  const [saving, setSaving] = useState(false)
  const [historyOpen, setHistoryOpen] = useState(false)
  const [baselines, setBaselines] = useState<ScheduleBaseline[]>([])

  if (lock.state === "open") return null
  const locked = lock.state === "locked"
  const root = lock.root_task_id

  async function doSave() {
    if (justification.trim().length < 3) return
    setSaving(true)
    try {
      await projetosApi.saveBaseline(projectId, { root_task_id: root, justification: justification.trim() })
      setDialogOpen(false)
      setJustification("")
      toast.success("Baseline salvo. Revisão aberta — edições liberadas.")
      onChanged()
    } catch (err) {
      toast.error(errDetail(err, "Não foi possível salvar o baseline."))
    } finally {
      setSaving(false)
    }
  }

  async function doClose() {
    try {
      await projetosApi.closeScheduleRevision(projectId, root)
      toast.success("Revisão concluída. Cronograma re-travado.")
      onChanged()
    } catch (err) {
      toast.error(errDetail(err, "Não foi possível concluir a revisão."))
    }
  }

  async function openHistory() {
    try {
      setBaselines(await projetosApi.listBaselines(projectId, root))
      setHistoryOpen(true)
    } catch (err) {
      toast.error(errDetail(err, "Não foi possível carregar o histórico de baselines."))
    }
  }

  return (
    <div
      style={{
        display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap",
        padding: compact ? "8px 10px" : "10px 14px", margin: "8px 0",
        borderRadius: 8, border: "1px solid",
        borderColor: locked ? "var(--af-destructive)" : "var(--af-warning)",
        background: locked ? "#fdecec" : "#fff7e6",
      }}
    >
      {locked
        ? <Lock size={16} style={{ color: "var(--af-destructive)", flexShrink: 0 }} />
        : <Unlock size={16} style={{ color: "var(--af-warning)", flexShrink: 0 }} />}
      <div style={{ flex: 1, minWidth: 180, fontSize: 13, lineHeight: 1.4 }}>
        {showTitle && lock.root_title && <b>{lock.root_title}: </b>}
        {locked ? (
          <><b>Cronograma travado</b>{compact ? "" : " — o projeto entrou em desenvolvimento."} Salve um baseline com a justificativa para liberar a edição.</>
        ) : (
          <><b>Revisão aberta</b> — edições liberadas. Conclua a revisão para re-travar e registrar o compromisso.</>
        )}
        {lock.baseline_count > 0 && (
          <span style={{ color: "var(--af-muted-fg)" }}>
            {" · "}{lock.baseline_count} baseline(s){lock.latest_version ? `, atual v${lock.latest_version}` : ""}
          </span>
        )}
      </div>
      {locked ? (
        <Button size="sm" variant="destructive" onClick={() => { setJustification(""); setDialogOpen(true) }}>
          <Unlock size={14} /> Liberar alteração
        </Button>
      ) : (
        <Button size="sm" onClick={() => void doClose()}>
          <Lock size={14} /> Concluir revisão
        </Button>
      )}
      <Button size="sm" variant="ghost" onClick={() => void openHistory()}>
        <History size={14} /> Histórico
      </Button>

      {/* Diálogo: salvar baseline + justificativa (abre a janela de revisão). */}
      <Dialog open={dialogOpen} onOpenChange={(o) => { if (!saving) setDialogOpen(o) }}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Liberar alteração do cronograma</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Será salvo um <b>baseline</b> com o cronograma atual (histórico imutável) e a janela de
              revisão será aberta, liberando a edição. Ao concluir a revisão, o cronograma re-trava.
            </p>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Justificativa</label>
              <Textarea
                rows={4}
                value={justification}
                onChange={(e) => setJustification(e.target.value)}
                placeholder="Ex.: Replanejamento por atraso de fornecedor / mudança de escopo aprovada…"
              />
              <p className="text-xs text-muted-foreground">Mínimo de 3 caracteres.</p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setDialogOpen(false)} disabled={saving}>Cancelar</Button>
            <Button onClick={() => void doSave()} disabled={saving || justification.trim().length < 3}>
              {saving ? <Loader2 size={14} className="animate-spin" /> : <Unlock size={14} />} Salvar baseline e liberar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Diálogo: histórico de baselines. */}
      <Dialog open={historyOpen} onOpenChange={setHistoryOpen}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Histórico de baselines do cronograma</DialogTitle>
          </DialogHeader>
          {baselines.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhum baseline salvo ainda.</p>
          ) : (
            <div className="max-h-[60vh] space-y-3 overflow-y-auto">
              {baselines.map((b) => (
                <div key={b.id} className="rounded-lg border p-3">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <Badge variant="secondary">v{b.version}</Badge>
                      <span className="text-xs text-muted-foreground">
                        {new Date(b.created_at).toLocaleString("pt-BR")} · {b.snapshot?.tasks?.length ?? 0} itens
                      </span>
                    </div>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => {
                        setHistoryOpen(false)
                        if (onCompareBaseline) onCompareBaseline(b)
                        else navigate(`/app/modules/projetos/cronograma?root=${root}&baseline=${b.id}`)
                      }}
                    >
                      <GitCompare size={14} /> Comparar no cronograma
                    </Button>
                  </div>
                  <p className="mt-2 text-sm">{b.justification}</p>
                </div>
              ))}
            </div>
          )}
          <DialogFooter>
            <Button variant="ghost" onClick={() => setHistoryOpen(false)}>Fechar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
