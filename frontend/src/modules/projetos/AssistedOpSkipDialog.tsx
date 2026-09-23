import { useEffect, useState } from "react"
import { Loader2 } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"

/** O backend responde 428 quando o projeto vai a Concluído sem passar pela Operação
 * Assistida — a tela pede a justificativa e reenvia o movimento com ela. */
export function isAssistedOpSkipRequired(err: unknown): boolean {
  return (err as { response?: { status?: number } })?.response?.status === 428
}

const MIN_CHARS = 10

export function AssistedOpSkipDialog({
  open,
  projectTitle,
  onCancel,
  onConfirm,
}: {
  open: boolean
  projectTitle?: string
  onCancel: () => void
  onConfirm: (reason: string) => Promise<void>
}) {
  const [reason, setReason] = useState("")
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (open) setReason("")
  }, [open])

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
    <Dialog open={open} onOpenChange={(o) => { if (!o && !saving) onCancel() }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Concluir sem Operação Assistida</DialogTitle>
          <DialogDescription>
            {projectTitle ? <>O projeto <strong>{projectTitle}</strong> não passou</> : "Este projeto não passou"} pela
            Operação Assistida. Informe o motivo para concluí-lo direto — a justificativa fica registrada no card.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-1.5">
          <Label htmlFor="oa-skip-reason">Justificativa</Label>
          <Textarea
            id="oa-skip-reason"
            rows={4}
            autoFocus
            maxLength={2000}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          />
          {!valid && reason.length > 0 && (
            <p className="text-xs text-muted-foreground">Mínimo de {MIN_CHARS} caracteres.</p>
          )}
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onCancel} disabled={saving}>Cancelar</Button>
          <Button onClick={() => void confirm()} disabled={!valid || saving}>
            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Concluir projeto
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
