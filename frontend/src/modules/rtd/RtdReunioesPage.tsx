import { useEffect, useMemo, useState } from "react"
import { useNavigate } from "react-router-dom"
import { CalendarClock, Gavel, Plus, Trash2 } from "lucide-react"

import { rtdApi, type Reuniao, type TipoCompetencia } from "@/api/rtd"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Skeleton } from "@/components/ui/skeleton"
import { toast } from "@/lib/toast"

const MESES = ["", "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"]
const ANOS = [2024, 2025, 2026, 2027, 2028]

const STATUS_VARIANT: Record<string, "warning" | "default" | "success"> = {
  rascunho: "warning", realizada: "default", fechada: "success",
}
const STATUS_LABEL: Record<string, string> = {
  rascunho: "Rascunho", realizada: "Realizada", fechada: "Fechada",
}

function fmt(iso: string): string {
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "2-digit" })
}

export default function RtdReunioesPage() {
  const navigate = useNavigate()
  const [items, setItems] = useState<Reuniao[]>([])
  const [loading, setLoading] = useState(true)
  const [open, setOpen] = useState(false)
  const [saving, setSaving] = useState(false)

  // form
  const [titulo, setTitulo] = useState("")
  const [tipo, setTipo] = useState<TipoCompetencia>("mensal")
  const [ano, setAno] = useState(2026)
  const [ordem, setOrdem] = useState(1)

  const ordemOpts = useMemo(() => {
    if (tipo === "mensal") return MESES.slice(1).map((m, i) => ({ value: i + 1, label: m }))
    return [1, 2, 3, 4].map((q) => ({ value: q, label: `${q}º trimestre` }))
  }, [tipo])

  async function load() {
    setLoading(true)
    try {
      setItems(await rtdApi.listReunioes())
    } catch {
      toast.error("Falha ao carregar as reuniões")
    } finally {
      setLoading(false)
    }
  }
  useEffect(() => { load() }, [])

  function openNew() {
    setTitulo(""); setTipo("mensal"); setAno(new Date().getFullYear())
    setOrdem(new Date().getMonth() + 1); setOpen(true)
  }

  async function save() {
    if (!titulo.trim()) { toast.error("Informe o título"); return }
    setSaving(true)
    try {
      const r = await rtdApi.createReuniao({
        titulo: titulo.trim(), tipo_competencia: tipo, ano_referencia: ano, ordem,
      })
      toast.success("Reunião criada")
      setOpen(false)
      navigate(`/app/modules/rtd/reunioes/${r.id}`)
    } catch {
      toast.error("Falha ao criar a reunião")
    } finally {
      setSaving(false)
    }
  }

  async function remove(e: React.MouseEvent, r: Reuniao) {
    e.stopPropagation()
    if (!confirm(`Excluir a reunião "${r.titulo}"? As deliberações também serão removidas.`)) return
    try {
      await rtdApi.deleteReuniao(r.id)
      toast.success("Reunião excluída")
      setItems((prev) => prev.filter((x) => x.id !== r.id))
    } catch {
      toast.error("Falha ao excluir")
    }
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-4 md:p-6">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-semibold">
            <Gavel className="h-5 w-5" /> Reuniões de Tomada de Decisão
          </h1>
          <p className="text-sm text-muted-foreground">
            Comitê de Portfólio e Desenvolvimento Digital (Parte 1) — por competência.
          </p>
        </div>
        <Button onClick={openNew}><Plus className="mr-1.5 h-4 w-4" /> Nova reunião</Button>
      </div>

      {loading ? (
        <div className="space-y-3">
          <Skeleton className="h-20 w-full" /><Skeleton className="h-20 w-full" />
        </div>
      ) : items.length === 0 ? (
        <Card><CardContent className="py-10 text-center text-sm text-muted-foreground">
          Nenhuma reunião ainda. Crie a primeira pela competência (mês ou trimestre).
        </CardContent></Card>
      ) : (
        <div className="space-y-3">
          {items.map((r) => (
            <Card
              key={r.id}
              className="cursor-pointer transition-colors hover:bg-muted/30"
              onClick={() => navigate(`/app/modules/rtd/reunioes/${r.id}`)}
            >
              <CardHeader className="flex-row items-center justify-between gap-3 space-y-0 py-4">
                <div className="min-w-0">
                  <CardTitle className="truncate text-base">{r.titulo}</CardTitle>
                  <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                    <span className="inline-flex items-center gap-1">
                      <CalendarClock className="h-3.5 w-3.5" /> {r.competencia}
                    </span>
                    <span>· {fmt(r.periodo_inicio)}–{fmt(r.periodo_fim)}</span>
                    <span>· {r.total_deliberacoes} deliberação(ões)</span>
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <Badge variant={STATUS_VARIANT[r.status]}>{STATUS_LABEL[r.status]}</Badge>
                  <Button variant="ghost" size="icon" onClick={(e) => remove(e, r)} title="Excluir">
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </div>
              </CardHeader>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Nova reunião</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Título</Label>
              <Input value={titulo} onChange={(e) => setTitulo(e.target.value)}
                placeholder="Comitê TD — 3º trim/2026" />
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <Label>Competência</Label>
                <Select value={tipo} onValueChange={(v) => { setTipo(v as TipoCompetencia); setOrdem(1) }}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="trimestral">Trimestral</SelectItem>
                    <SelectItem value="mensal">Mensal</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Ano</Label>
                <Select value={String(ano)} onValueChange={(v) => setAno(Number(v))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {ANOS.map((a) => <SelectItem key={a} value={String(a)}>{a}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>{tipo === "mensal" ? "Mês" : "Trimestre"}</Label>
                <Select value={String(ordem)} onValueChange={(v) => setOrdem(Number(v))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {ordemOpts.map((o) => <SelectItem key={o.value} value={String(o.value)}>{o.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
            <Button onClick={save} disabled={saving}>{saving ? "Criando…" : "Criar"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
