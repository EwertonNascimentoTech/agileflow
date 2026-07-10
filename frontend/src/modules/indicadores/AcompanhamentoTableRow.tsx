import { useEffect, useState } from "react"
import { Loader2, Lock, LockOpen, Paperclip, Pencil, RefreshCw } from "lucide-react"

import { indicadoresApi, type Acompanhamento } from "@/api/indicadores"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { toast } from "@/lib/toast"
import { ACOMP_STATUS_COLOR, ACOMP_STATUS_LABEL, FONTE_LABEL } from "@/modules/indicadores/constants"

const fmt = (n: number | null | undefined) => (n == null ? "—" : Number(n).toLocaleString("pt-BR"))
const num = (s: string): number | null => (s.trim() === "" ? null : Number(s))

export function AcompanhamentoTableRow({
  acomp,
  onUpdated,
  onEditDetails,
  onEditEvidencias,
}: {
  acomp: Acompanhamento
  onUpdated: (updated: Acompanhamento) => void
  onEditDetails: () => void
  onEditEvidencias: () => void
}) {
  const isPortfolio = acomp.fonte === "portfolio"
  const [meta, setMeta] = useState(acomp.meta != null ? String(acomp.meta) : "")
  const [realizado, setRealizado] = useState(acomp.realizado != null ? String(acomp.realizado) : "")
  const [savingMeta, setSavingMeta] = useState(false)
  const [savingRealizado, setSavingRealizado] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const [togglingLock, setTogglingLock] = useState(false)
  const locked = acomp.bloqueado

  useEffect(() => {
    setMeta(acomp.meta != null ? String(acomp.meta) : "")
    setRealizado(acomp.realizado != null ? String(acomp.realizado) : "")
  }, [acomp.id, acomp.meta, acomp.realizado])

  async function commitMeta() {
    const value = num(meta)
    if (value === acomp.meta || (value == null && acomp.meta == null)) return
    setSavingMeta(true)
    try {
      const updated = await indicadoresApi.updateAcompanhamento(acomp.id, {
        meta: value,
        limpar_meta: meta.trim() === "",
      })
      onUpdated(updated)
    } catch {
      setMeta(acomp.meta != null ? String(acomp.meta) : "")
      toast.error("Não foi possível salvar a meta.")
    } finally {
      setSavingMeta(false)
    }
  }

  async function commitRealizado() {
    const value = num(realizado)
    if (value === acomp.realizado || (value == null && acomp.realizado == null)) return
    setSavingRealizado(true)
    try {
      const updated = await indicadoresApi.updateAcompanhamento(acomp.id, {
        realizado: value,
        limpar_realizado: realizado.trim() === "",
      })
      onUpdated(updated)
    } catch {
      setRealizado(acomp.realizado != null ? String(acomp.realizado) : "")
      toast.error("Não foi possível salvar o realizado.")
    } finally {
      setSavingRealizado(false)
    }
  }

  async function toggleLock() {
    setTogglingLock(true)
    try {
      const updated = await indicadoresApi.updateAcompanhamento(acomp.id, { bloqueado: !locked })
      onUpdated(updated)
      toast.success(locked ? `${acomp.competencia} desbloqueado.` : `${acomp.competencia} bloqueado.`)
    } catch {
      toast.error(locked ? "Não foi possível desbloquear o mês." : "Não foi possível bloquear o mês.")
    } finally {
      setTogglingLock(false)
    }
  }

  async function refreshPortfolio() {
    if (locked) {
      toast.error("Este mês está bloqueado. Desbloqueie antes de atualizar do portfólio.")
      return
    }
    setRefreshing(true)
    try {
      const updated = await indicadoresApi.atualizarAcompanhamentoPortfolio(acomp.id)
      onUpdated(updated)
      toast.success(`${acomp.competencia} atualizado do portfólio.`)
    } catch (e: unknown) {
      const msg = (e as { response?: { data?: { detail?: string } } })?.response?.data?.detail
      toast.error(typeof msg === "string" ? msg : "Não foi possível atualizar do portfólio.")
    } finally {
      setRefreshing(false)
    }
  }

  function onEnter(e: React.KeyboardEvent, commit: () => void) {
    if (e.key === "Enter") {
      e.preventDefault()
      ;(e.target as HTMLInputElement).blur()
      void commit()
    }
  }

  const inputCls = "h-8 w-full min-w-[5rem] text-right tabular-nums"

  return (
    <tr className={`border-t ${locked ? "bg-muted/40" : ""}`}>
      <td className="px-3 py-2 font-medium">
        <span className="inline-flex items-center gap-1.5">
          {locked && <Lock size={12} className="text-muted-foreground" />}
          {acomp.competencia}
        </span>
      </td>

      <td className="px-3 py-2">
        <div className="relative flex items-center justify-end gap-1">
          <Input
            type="number"
            className={inputCls}
            value={meta}
            onChange={(e) => setMeta(e.target.value)}
            onBlur={() => void commitMeta()}
            onKeyDown={(e) => onEnter(e, commitMeta)}
            disabled={savingMeta || locked}
            placeholder="—"
          />
          {savingMeta && <Loader2 size={12} className="absolute -right-4 animate-spin text-muted-foreground" />}
        </div>
      </td>

      <td className="px-3 py-2">
        {isPortfolio ? (
          <div className="text-right tabular-nums">{fmt(acomp.realizado)}</div>
        ) : (
          <div className="relative flex items-center justify-end gap-1">
            <Input
              type="number"
              className={inputCls}
              value={realizado}
              onChange={(e) => setRealizado(e.target.value)}
              onBlur={() => void commitRealizado()}
              onKeyDown={(e) => onEnter(e, commitRealizado)}
              disabled={savingRealizado || locked}
              placeholder="—"
            />
            {savingRealizado && <Loader2 size={12} className="absolute -right-4 animate-spin text-muted-foreground" />}
          </div>
        )}
      </td>

      <td className="px-3 py-2 text-right tabular-nums">
        {acomp.percentual_atingimento != null ? `${Number(acomp.percentual_atingimento).toFixed(1)}%` : "—"}
      </td>
      <td className="px-3 py-2">
        <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-medium ${ACOMP_STATUS_COLOR[acomp.status]}`}>
          {ACOMP_STATUS_LABEL[acomp.status]}
        </span>
      </td>
      <td className="px-3 py-2">
        <Badge variant={isPortfolio ? "secondary" : "outline"} className="text-[10px] font-normal">
          {FONTE_LABEL[acomp.fonte]}
        </Badge>
      </td>
      <td className="px-3 py-2 text-right">
        <div className="flex items-center justify-end gap-0.5">
          {isPortfolio && (
            <Button
              variant="ghost"
              size="icon"
              className="text-muted-foreground hover:text-primary"
              title="Atualizar do portfólio"
              onClick={() => void refreshPortfolio()}
              disabled={refreshing || locked}
            >
              <RefreshCw size={14} className={refreshing ? "animate-spin" : ""} />
            </Button>
          )}
          <Button
            variant="ghost"
            size="icon"
            className={locked ? "text-amber-600 hover:text-amber-700" : "text-muted-foreground hover:text-primary"}
            title={locked ? "Desbloquear mês" : "Bloquear mês (fechar competência)"}
            onClick={() => void toggleLock()}
            disabled={togglingLock}
          >
            {togglingLock ? <Loader2 size={14} className="animate-spin" /> : locked ? <LockOpen size={14} /> : <Lock size={14} />}
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="text-muted-foreground hover:text-primary"
            title="Observação e origem"
            onClick={onEditDetails}
          >
            <Pencil size={14} />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="text-muted-foreground hover:text-primary"
            title="Evidências"
            onClick={onEditEvidencias}
          >
            <Paperclip size={14} />
          </Button>
        </div>
      </td>
    </tr>
  )
}
