import { useState } from "react"
import { Loader2 } from "lucide-react"
import { attendancesApi } from "@/api/atendimento"
import type { Attendance } from "@/api/atendimento"
import { toast } from "@/lib/toast"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"

interface Props {
  attendanceId: string
  open: boolean
  onOpenChange: (v: boolean) => void
  onClosed: (updated: Attendance) => void
}

export default function CloseAttendanceModal({ attendanceId, open, onOpenChange, onClosed }: Props) {
  const [outcome, setOutcome] = useState<"won" | "lost" | "">("")
  const [closeReason, setCloseReason] = useState("")
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState("")

  function handleOpenChange(v: boolean) {
    if (!v) {
      setOutcome("")
      setCloseReason("")
      setError("")
    }
    onOpenChange(v)
  }

  async function handleConfirm() {
    if (!outcome) {
      setError("Selecione o resultado (ganho ou perdido).")
      return
    }
    if (outcome === "lost" && !closeReason.trim()) {
      setError("Motivo é obrigatório ao marcar como perdido.")
      return
    }
    setSaving(true)
    setError("")
    try {
      const updated = await attendancesApi.close(attendanceId, {
        outcome,
        close_reason: closeReason.trim() || undefined,
      })
      toast.success(outcome === "won" ? "Negócio marcado como ganho! 🏆" : "Negócio marcado como perdido.")
      onClosed(updated)
      handleOpenChange(false)
    } catch (err: unknown) {
      const e = err as { response?: { data?: { detail?: string } } }
      setError(e?.response?.data?.detail ?? "Erro ao fechar atendimento.")
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Fechar negócio</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label>Resultado</Label>
            <Select value={outcome} onValueChange={(v) => setOutcome(v as "won" | "lost")}>
              <SelectTrigger>
                <SelectValue placeholder="Selecione..." />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="won">
                  <span className="flex items-center gap-2">🏆 Ganho</span>
                </SelectItem>
                <SelectItem value="lost">
                  <span className="flex items-center gap-2">✗ Perdido</span>
                </SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label>
              Motivo{outcome === "lost" && <span className="text-destructive ml-0.5">*</span>}
            </Label>
            <Textarea
              placeholder={outcome === "lost" ? "Explique o motivo da perda..." : "Observações (opcional)"}
              value={closeReason}
              onChange={(e) => setCloseReason(e.target.value)}
              rows={3}
              maxLength={500}
            />
            {outcome === "lost" && (
              <p className="text-xs text-muted-foreground">Obrigatório ao marcar como perdido.</p>
            )}
          </div>

          {error && (
            <p className="text-sm text-destructive">{error}</p>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => handleOpenChange(false)} disabled={saving}>
            Cancelar
          </Button>
          <Button
            onClick={handleConfirm}
            disabled={saving || !outcome}
            variant={outcome === "lost" ? "destructive" : "default"}
          >
            {saving && <Loader2 size={13} className="animate-spin mr-1.5" />}
            Confirmar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
