import { useEffect, useState } from "react"
import { Loader2 } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"

export interface StageReasonPrompt {
  stageName: string
  message: string
}

/** 428 `stage_reason_required`: entrar na etapa (ex.: Não Aprovado, Cancelado) ou voltar etapa
 *  no kanban Soluções com IA exige motivo — a tela pede e reenvia o movimento com ele. */
export function stageReasonRequired(err: unknown): StageReasonPrompt | null {
  const r = (err as { response?: { status?: number; data?: { detail?: unknown } } })?.response
  const d = r?.data?.detail as { code?: string; stage_name?: string; message?: string } | undefined
  if (r?.status !== 428 || typeof d !== "object" || d?.code !== "stage_reason_required") return null
  return { stageName: d.stage_name ?? "", message: d.message ?? "Informe o motivo." }
}

const MIN_CHARS = 10

export function StageReasonDialog({
  prompt,
  onCancel,
  onConfirm,
}: {
  prompt: StageReasonPrompt | null
  onCancel: () => void
  onConfirm: (reason: string) => Promise<void>
}) {
  const [reason, setReason] = useState("")
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (prompt) setReason("")
  }, [prompt])

  const valid = reason.trim().length >= MIN_CHARS

  async function confirm() {
    if (!valid) return
    setSaving(true)
    try {
      await onConfirm(reason.trim())
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={!!prompt} onOpenChange={(o) => { if (!o && !saving) onCancel() }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Motivo — {prompt?.stageName}</DialogTitle>
          <DialogDescription>{prompt?.message} O motivo fica registrado no card.</DialogDescription>
        </DialogHeader>
        <div className="space-y-1.5">
          <Label htmlFor="stage-reason">Motivo</Label>
          <Textarea
            id="stage-reason" rows={4} autoFocus value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Explique o motivo (mín. 10 caracteres)."
          />
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onCancel} disabled={saving}>Cancelar</Button>
          <Button onClick={() => void confirm()} disabled={!valid || saving}>
            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Mover
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
