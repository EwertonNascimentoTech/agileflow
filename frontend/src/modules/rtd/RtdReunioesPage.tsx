import { useEffect, useMemo, useState } from "react"
import { useNavigate } from "react-router-dom"
import { CalendarClock, CheckCircle2, FilePen, Gavel, Lock, Plus, Scale, Trash2 } from "lucide-react"

import { rtdApi, type Reuniao, type ReuniaoStatus, type TipoCompetencia } from "@/api/rtd"
import { EmptyState } from "@/components/EmptyState"
import { Card, KpiCount, KpiRow, PageHeader, Pill, TABLE, type Tone } from "@/components/ds"
import { Button } from "@/components/ui/button"
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

const STATUS_TONE: Record<ReuniaoStatus, Tone> = {
  rascunho: "amber", realizada: "blue", fechada: "emerald",
}
const STATUS_LABEL: Record<string, string> = {
  rascunho: "Rascunho", realizada: "Realizada", fechada: "Fechada",
}

function fmt(iso: string): string {
  // Data pura (YYYY-MM-DD) vira meia-noite UTC no `new Date` — no fuso de Brasília cai no dia
  // anterior (Agosto aparecia 31/07–30/08). Meio-dia local não troca de dia.
  const d = new Date(/^\d{4}-\d{2}-\d{2}$/.test(iso) ? `${iso}T12:00:00` : iso)
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

  const counts = {
    rascunho: items.filter((r) => r.status === "rascunho").length,
    realizada: items.filter((r) => r.status === "realizada").length,
    fechada: items.filter((r) => r.status === "fechada").length,
    deliberacoes: items.reduce((acc, r) => acc + (r.total_deliberacoes ?? 0), 0),
  }

  return (
    <div className="space-y-5 p-4">
      <PageHeader
        icon={Gavel}
        color="#D97706"
        title="Reuniões de Tomada de Decisão"
        description="Comitê de Portfólio e Desenvolvimento Digital (Parte 1) — por competência."
        actions={<Button className="h-10 gap-1.5" onClick={openNew}><Plus size={16} /> Nova reunião</Button>}
      />

      {loading ? (
        <>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            {Array.from({ length: 5 }, (_, i) => <Skeleton key={i} className="h-[74px] rounded-xl" />)}
          </div>
          <Skeleton className="h-64 w-full rounded-2xl" />
        </>
      ) : items.length === 0 ? (
        <Card>
          <EmptyState
            icon={Gavel}
            title="Nenhuma reunião ainda"
            description="Crie a primeira pela competência (mês ou trimestre)."
            action={{ label: "Nova reunião", onClick: openNew }}
          />
        </Card>
      ) : (
        <>
          <KpiRow className="sm:grid-cols-2 lg:grid-cols-5">
            <KpiCount icon={Gavel} value={items.length} label="Reuniões" />
            <KpiCount icon={FilePen} value={counts.rascunho} label="Em rascunho" tone={counts.rascunho > 0 ? "amber" : "slate"} />
            <KpiCount icon={CheckCircle2} value={counts.realizada} label="Realizadas" tone="primary" />
            <KpiCount icon={Lock} value={counts.fechada} label="Fechadas" tone="emerald" />
            <KpiCount icon={Scale} value={counts.deliberacoes} label="Deliberações" tone="violet" />
          </KpiRow>

          <Card className="overflow-hidden">
            <div className={TABLE.wrap}>
              <table className={TABLE.table}>
                <thead className={TABLE.thead}>
                  <tr>
                    <th className={TABLE.thFirst}>Reunião</th>
                    <th className={TABLE.th}>Competência</th>
                    <th className={TABLE.th}>Período</th>
                    <th className={`${TABLE.th} text-center`}>Deliberações</th>
                    <th className={TABLE.th}>Status</th>
                    <th className={`${TABLE.th} w-16`}><span className="sr-only">Ações</span></th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((r) => (
                    <tr
                      key={r.id}
                      className={`${TABLE.tr} cursor-pointer`}
                      onClick={() => navigate(`/app/modules/rtd/reunioes/${r.id}`)}
                    >
                      <td className={`${TABLE.tdFirst} font-semibold`}>{r.titulo}</td>
                      <td className={`${TABLE.td} whitespace-nowrap`}>
                        <span className="inline-flex items-center gap-1.5">
                          <CalendarClock size={15} className="text-muted-foreground" /> {r.competencia}
                        </span>
                      </td>
                      <td className={`${TABLE.td} whitespace-nowrap tabular-nums text-muted-foreground`}>
                        {fmt(r.periodo_inicio)}–{fmt(r.periodo_fim)}
                      </td>
                      <td className={`${TABLE.td} text-center tabular-nums`}>{r.total_deliberacoes}</td>
                      <td className={TABLE.td}>
                        <Pill tone={STATUS_TONE[r.status] ?? "slate"} dot>{STATUS_LABEL[r.status] ?? r.status}</Pill>
                      </td>
                      <td className={`${TABLE.td} text-right`}>
                        <Button
                          variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-destructive"
                          onClick={(e) => remove(e, r)} title="Excluir" aria-label="Excluir reunião"
                        >
                          <Trash2 size={15} />
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </>
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
