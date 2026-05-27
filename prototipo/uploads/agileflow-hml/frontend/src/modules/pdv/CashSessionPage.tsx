import { useEffect, useState, useCallback } from "react"
import { Wallet, Loader2, ArrowDownCircle, ArrowUpCircle } from "lucide-react"
import {
  cashApi,
  type CashSession, type CashSessionSummary, type CashMovementType,
} from "@/api/pdv"
import { warehousesApi, type Warehouse } from "@/api/estoque"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { Separator } from "@/components/ui/separator"
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { fmtMoney, fmtDateTime, getApiError } from "./pdvUtils"

// Categorias estruturadas de movimento (preparam o lançamento financeiro futuro).
const SUPRIMENTO_CATS = ["Fundo de troco", "Reforço de caixa", "Outro"]
const SANGRIA_CATS = ["Depósito bancário", "Pagamento de despesa", "Retirada", "Outro"]
const HIST_SIZE = 20

export default function CashSessionPage() {
  const [warehouses, setWarehouses] = useState<Warehouse[]>([])
  const [warehouseId, setWarehouseId] = useState<string>("")
  const [session, setSession] = useState<CashSession | null>(null)
  const [summary, setSummary] = useState<CashSessionSummary | null>(null)
  const [history, setHistory] = useState<CashSession[]>([])
  const [histPage, setHistPage] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")

  // formulários
  const [openingAmount, setOpeningAmount] = useState("0")
  const [openNotes, setOpenNotes] = useState("")
  const [busy, setBusy] = useState(false)

  const [movOpen, setMovOpen] = useState(false)
  const [movType, setMovType] = useState<CashMovementType>("suprimento")
  const [movAmount, setMovAmount] = useState("")
  const [movCategory, setMovCategory] = useState("")
  const [movDetail, setMovDetail] = useState("")
  const [movError, setMovError] = useState("")

  const [closeOpen, setCloseOpen] = useState(false)
  const [countedAmount, setCountedAmount] = useState("")
  const [closeNotes, setCloseNotes] = useState("")
  const [closeError, setCloseError] = useState("")

  useEffect(() => {
    warehousesApi.list(true)
      .then(ws => {
        setWarehouses(ws)
        const def = ws.find(w => w.is_default) ?? ws[0]
        if (def) setWarehouseId(def.id)
        else setLoading(false)
      })
      .catch(err => { setError(getApiError(err)); setLoading(false) })
  }, [])

  const loadSession = useCallback((wid: string) => {
    setLoading(true)
    setError("")
    setSummary(null)
    cashApi.getOpenSession(wid)
      .then(async (s) => {
        setSession(s)
        if (s) setSummary(await cashApi.sessionSummary(s.id))
      })
      .catch(err => setError(getApiError(err)))
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    if (warehouseId) loadSession(warehouseId)
  }, [warehouseId, loadSession])

  // Histórico paginado (lista não retorna total → prev/next por página cheia).
  useEffect(() => {
    cashApi.listSessions({ skip: histPage * HIST_SIZE, limit: HIST_SIZE }).then(setHistory).catch(() => {})
  }, [histPage])

  function refreshHistory() {
    setHistPage(0)
    cashApi.listSessions({ skip: 0, limit: HIST_SIZE }).then(setHistory).catch(() => {})
  }

  const histHasMore = history.length === HIST_SIZE

  async function handleOpen() {
    setError("")
    setBusy(true)
    try {
      await cashApi.openSession({
        warehouse_id: warehouseId,
        opening_amount: Number(openingAmount) || 0,
        notes: openNotes || undefined,
      })
      setOpeningAmount("0")
      setOpenNotes("")
      loadSession(warehouseId)
      refreshHistory()
    } catch (err) {
      setError(getApiError(err))
    } finally {
      setBusy(false)
    }
  }

  async function handleMovement() {
    if (!session) return
    setMovError("")
    setBusy(true)
    try {
      const created = await cashApi.addMovement(session.id, {
        type: movType,
        amount: Number(movAmount),
        reason: movCategory,
        notes: movDetail.trim() || undefined,
      })
      // Atualização local: anexa o movimento e ajusta o resumo (evita 2 refetches + flash).
      setSession(prev => prev ? { ...prev, movements: [...prev.movements, created] } : prev)
      setSummary(prev => {
        if (!prev) return prev
        const amt = Number(created.amount) || 0
        const isIn = created.type === "suprimento"
        return {
          ...prev,
          cash_in: isIn ? prev.cash_in + amt : prev.cash_in,
          cash_out: isIn ? prev.cash_out : prev.cash_out + amt,
          expected_amount: prev.expected_amount + (isIn ? amt : -amt),
        }
      })
      setMovOpen(false)
      setMovAmount("")
      setMovCategory("")
      setMovDetail("")
    } catch (err) {
      setMovError(getApiError(err))
    } finally {
      setBusy(false)
    }
  }

  async function handleClose() {
    if (!session) return
    setCloseError("")
    setBusy(true)
    try {
      await cashApi.closeSession(session.id, {
        counted_amount: Number(countedAmount),
        notes: closeNotes || undefined,
      })
      setCloseOpen(false)
      setCountedAmount("")
      setCloseNotes("")
      loadSession(warehouseId)
      refreshHistory()
    } catch (err) {
      setCloseError(getApiError(err))
    } finally {
      setBusy(false)
    }
  }

  const countedNum = Number(countedAmount) || 0
  const expectedNum = summary?.expected_amount ?? 0
  const diffPreview = countedNum - expectedNum
  // Divergência relevante (acima de meio centavo) exige justificativa.
  const hasDivergence = countedAmount !== "" && Math.abs(diffPreview) >= 0.005
  const closeBlocked = busy || countedAmount === "" || (hasDivergence && !closeNotes.trim())

  const movCats = movType === "sangria" ? SANGRIA_CATS : SUPRIMENTO_CATS
  const movNeedsDetail = movCategory === "Outro"
  const movBlocked = busy || !movAmount || !movCategory || (movNeedsDetail && !movDetail.trim())

  return (
    <div className="space-y-4">
      <div className="flex items-end justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-xl font-bold">Caixa</h1>
          <p className="text-sm text-muted-foreground">Abertura, sangria, suprimento e fechamento.</p>
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">Depósito</Label>
          <Select value={warehouseId} onValueChange={setWarehouseId}>
            <SelectTrigger className="w-56"><SelectValue placeholder="Selecione" /></SelectTrigger>
            <SelectContent>
              {warehouses.map(w => <SelectItem key={w.id} value={w.id}>{w.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </div>

      {error && <Alert variant="destructive"><AlertDescription className="text-xs">{error}</AlertDescription></Alert>}

      {loading ? (
        <Skeleton className="h-48 rounded-lg" />
      ) : warehouses.length === 0 ? (
        <Alert><AlertDescription className="text-xs">
          Nenhum depósito ativo. Cadastre um depósito no módulo Estoque.
        </AlertDescription></Alert>
      ) : !session ? (
        <Card>
          <CardContent className="p-4 space-y-3 max-w-md">
            <h2 className="text-sm font-semibold">Abrir caixa</h2>
            <div className="space-y-1.5">
              <Label>Valor de abertura (fundo de troco)</Label>
              <Input type="number" min={0} step="0.01" value={openingAmount}
                onChange={e => setOpeningAmount(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Observações</Label>
              <Textarea rows={2} value={openNotes} onChange={e => setOpenNotes(e.target.value)} />
            </div>
            <Button onClick={handleOpen} disabled={busy} className="gap-1.5">
              {busy && <Loader2 size={14} className="animate-spin" />}
              <Wallet size={15} /> Abrir caixa
            </Button>
          </CardContent>
        </Card>
      ) : (
        <>
          <Card>
            <CardContent className="p-4 space-y-3">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <div className="flex items-center gap-2">
                  <Badge variant="secondary">caixa aberto</Badge>
                  <span className="text-sm text-muted-foreground">
                    desde {fmtDateTime(session.opened_at)}
                  </span>
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" className="gap-1.5"
                    onClick={() => { setMovType("suprimento"); setMovAmount(""); setMovCategory(""); setMovDetail(""); setMovError(""); setMovOpen(true) }}>
                    <ArrowUpCircle size={14} /> Suprimento
                  </Button>
                  <Button variant="outline" size="sm" className="gap-1.5"
                    onClick={() => { setMovType("sangria"); setMovAmount(""); setMovCategory(""); setMovDetail(""); setMovError(""); setMovOpen(true) }}>
                    <ArrowDownCircle size={14} /> Sangria
                  </Button>
                </div>
              </div>

              {summary && (
                <div className="grid gap-2 sm:grid-cols-2 md:grid-cols-3 text-sm">
                  <Info label="Abertura" value={fmtMoney(summary.opening_amount)} />
                  <Info label="Vendas" value={`${summary.sales_count} · ${fmtMoney(summary.sales_total)}`} />
                  <Info label="Suprimentos" value={fmtMoney(summary.cash_in)} />
                  <Info label="Sangrias" value={fmtMoney(summary.cash_out)} />
                  <Info label="Dinheiro de vendas" value={fmtMoney(summary.cash_sales_net)} />
                  <Info label="Esperado em caixa" value={fmtMoney(summary.expected_amount)} strong />
                </div>
              )}

              {session.movements.length > 0 && (
                <div className="space-y-1">
                  <p className="text-xs font-medium text-muted-foreground">Movimentos</p>
                  {session.movements.map(m => (
                    <div key={m.id} className="flex justify-between text-sm border-b last:border-0 py-1">
                      <span>
                        {m.type === "sangria" ? "Sangria" : "Suprimento"} · {m.reason}
                        {m.notes && <span className="text-muted-foreground"> — {m.notes}</span>}
                      </span>
                      <span className={m.type === "sangria" ? "text-destructive" : ""}>
                        {m.type === "sangria" ? "-" : "+"}{fmtMoney(m.amount)}
                      </span>
                    </div>
                  ))}
                </div>
              )}

              <Separator />
              <Button onClick={() => { setCountedAmount(""); setCloseNotes(""); setCloseError(""); setCloseOpen(true) }}>
                Fechar caixa
              </Button>
            </CardContent>
          </Card>
        </>
      )}

      {(history.length > 0 || histPage > 0) && (
        <Card>
          <CardContent className="p-4 space-y-2">
            <h2 className="text-sm font-semibold">Sessões recentes</h2>
            {history.length === 0 ? (
              <p className="py-4 text-center text-sm text-muted-foreground">Nenhuma sessão nesta página.</p>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-xs text-muted-foreground text-left border-b">
                    <th className="py-1.5 font-medium">Aberto</th>
                    <th className="py-1.5 font-medium">Fechado</th>
                    <th className="py-1.5 font-medium">Status</th>
                    <th className="py-1.5 font-medium text-right">Diferença</th>
                  </tr>
                </thead>
                <tbody>
                  {history.map(s => (
                    <tr key={s.id} className="border-b last:border-0">
                      <td className="py-1.5">{fmtDateTime(s.opened_at)}</td>
                      <td className="py-1.5">{fmtDateTime(s.closed_at)}</td>
                      <td className="py-1.5">
                        {s.status === "open"
                          ? <Badge variant="secondary" className="text-[10px]">aberto</Badge>
                          : <Badge variant="outline" className="text-[10px]">fechado</Badge>}
                      </td>
                      <td className="py-1.5 text-right">
                        {s.difference == null ? "—" : fmtMoney(s.difference)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            <div className="flex items-center justify-between pt-1 text-sm">
              <span className="text-muted-foreground">Página {histPage + 1}</span>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" disabled={histPage === 0} onClick={() => setHistPage(p => p - 1)}>
                  Anterior
                </Button>
                <Button variant="outline" size="sm" disabled={!histHasMore} onClick={() => setHistPage(p => p + 1)}>
                  Próxima
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Dialog sangria/suprimento */}
      <Dialog open={movOpen} onOpenChange={setMovOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{movType === "sangria" ? "Sangria" : "Suprimento"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>Valor</Label>
              <Input type="number" min={0} step="0.01" value={movAmount}
                onChange={e => setMovAmount(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Categoria</Label>
              <Select value={movCategory} onValueChange={setMovCategory}>
                <SelectTrigger><SelectValue placeholder="Selecione a categoria" /></SelectTrigger>
                <SelectContent>
                  {movCats.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>
                Detalhe{movNeedsDetail ? <span className="text-destructive"> *</span> : <span className="text-muted-foreground"> (opcional)</span>}
              </Label>
              <Textarea
                rows={2}
                value={movDetail}
                onChange={e => setMovDetail(e.target.value)}
                placeholder={movNeedsDetail ? "Descreva o motivo…" : "Observação adicional"}
                aria-invalid={movNeedsDetail && !movDetail.trim()}
              />
            </div>
            {movError && <Alert variant="destructive"><AlertDescription className="text-xs">{movError}</AlertDescription></Alert>}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setMovOpen(false)}>Cancelar</Button>
            <Button onClick={handleMovement} disabled={movBlocked}>
              {busy && <Loader2 size={14} className="mr-1.5 animate-spin" />}
              Registrar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog fechamento */}
      <Dialog open={closeOpen} onOpenChange={setCloseOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Fechar caixa</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Esperado em caixa</span>
              <span className="font-medium">{fmtMoney(expectedNum)}</span>
            </div>
            <div className="space-y-1.5">
              <Label>Valor contado</Label>
              <Input type="number" min={0} step="0.01" value={countedAmount}
                onChange={e => setCountedAmount(e.target.value)} />
            </div>
            {countedAmount !== "" && (
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Diferença</span>
                <span className={hasDivergence ? (diffPreview < 0 ? "text-destructive font-medium" : "text-amber-600 font-medium") : "font-medium"}>
                  {diffPreview > 0 ? "+" : ""}{fmtMoney(diffPreview)}
                  <span className="ml-1 text-xs font-normal text-muted-foreground">
                    {hasDivergence ? (diffPreview < 0 ? "(falta)" : "(sobra)") : "(confere)"}
                  </span>
                </span>
              </div>
            )}
            <div className="space-y-1.5">
              <Label>
                {hasDivergence ? "Justificativa da diferença" : "Observações"}
                {hasDivergence && <span className="text-destructive"> *</span>}
              </Label>
              <Textarea
                rows={2}
                value={closeNotes}
                onChange={e => setCloseNotes(e.target.value)}
                placeholder={hasDivergence ? "Explique a sobra/falta no caixa…" : undefined}
                aria-invalid={hasDivergence && !closeNotes.trim()}
              />
              {hasDivergence && !closeNotes.trim() && (
                <p className="text-xs text-destructive">Informe o motivo da diferença para fechar.</p>
              )}
            </div>
            {closeError && <Alert variant="destructive"><AlertDescription className="text-xs">{closeError}</AlertDescription></Alert>}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCloseOpen(false)}>Cancelar</Button>
            <Button onClick={handleClose} disabled={closeBlocked}>
              {busy && <Loader2 size={14} className="mr-1.5 animate-spin" />}
              Confirmar fechamento
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

function Info({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="rounded-md border p-2.5">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={strong ? "font-bold" : "font-medium"}>{value}</p>
    </div>
  )
}
