import { useEffect, useState } from "react"
import { Loader2 } from "lucide-react"

import {
  indicadoresApi, type Acompanhamento, type FonteDados, type Indicador,
} from "@/api/indicadores"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { toast } from "@/lib/toast"
import { FONTE_LABEL, FONTE_OPTS } from "@/modules/indicadores/constants"

const num = (s: string): number | null => (s.trim() === "" ? null : Number(s))

export function AcompanhamentoEditDialog({
  indicador,
  acomp,
  onClose,
  onSaved,
}: {
  indicador: Indicador
  acomp: Acompanhamento
  onClose: () => void
  onSaved: () => void
}) {
  const unit = indicador.unidade_medida?.trim() || "%"
  const [fonte, setFonte] = useState<FonteDados>(acomp.fonte)
  const [meta, setMeta] = useState(acomp.meta != null ? String(acomp.meta) : "")
  const [realizado, setRealizado] = useState(acomp.realizado != null ? String(acomp.realizado) : "")
  const [observacao, setObservacao] = useState(acomp.observacao ?? "")
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    setFonte(acomp.fonte)
    setMeta(acomp.meta != null ? String(acomp.meta) : "")
    setRealizado(acomp.realizado != null ? String(acomp.realizado) : "")
    setObservacao(acomp.observacao ?? "")
  }, [acomp.id, acomp.fonte, acomp.meta, acomp.realizado, acomp.observacao])

  async function save() {
    setSaving(true)
    try {
      await indicadoresApi.updateAcompanhamento(acomp.id, {
        fonte,
        meta: num(meta),
        limpar_meta: meta.trim() === "",
        ...(fonte === "manual"
          ? { realizado: num(realizado), limpar_realizado: realizado.trim() === "" }
          : {}),
        observacao: observacao.trim() || null,
      })
      toast.success("Acompanhamento atualizado.")
      onSaved()
    } catch (err) {
      const detail = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail
      toast.error(typeof detail === "string" ? detail : "Não foi possível salvar.")
    } finally {
      setSaving(false)
    }
  }

  const isPortfolio = fonte === "portfolio"

  return (
    <Dialog open onOpenChange={(v) => { if (!v) onClose() }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Editar — {acomp.competencia}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label>Origem dos dados</Label>
            <Select value={fonte} onValueChange={(v) => setFonte(v as FonteDados)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {FONTE_OPTS.map((f) => (
                  <SelectItem key={f} value={f}>{FONTE_LABEL[f]}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-[11px] text-muted-foreground">
              Alterne entre manual e portfólio para este período. Meta continua manual; realizado do portfólio é calculado.
            </p>
          </div>

          <div className="space-y-1.5">
            <Label>Meta ({unit})</Label>
            <Input type="number" value={meta} onChange={(e) => setMeta(e.target.value)} placeholder="—" />
          </div>

          <div className="space-y-1.5">
            <Label>Realizado ({unit})</Label>
            {isPortfolio ? (
              <Input
                type="number"
                value={acomp.realizado != null ? String(acomp.realizado) : ""}
                readOnly
                disabled
                className="bg-muted"
              />
            ) : (
              <Input type="number" value={realizado} onChange={(e) => setRealizado(e.target.value)} placeholder="—" />
            )}
            {isPortfolio && (
              <p className="text-[11px] text-muted-foreground">
                Calculado automaticamente do portfólio. Use o botão ↻ na tabela para atualizar.
              </p>
            )}
          </div>

          <div className="space-y-1.5">
            <Label>Observação</Label>
            <Textarea rows={3} value={observacao} onChange={(e) => setObservacao(e.target.value)} />
          </div>
        </div>
        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button onClick={() => void save()} disabled={saving}>
            {saving && <Loader2 size={14} className="mr-1.5 animate-spin" />}
            Salvar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
