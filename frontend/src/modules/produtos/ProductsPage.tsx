import { useEffect, useMemo, useState } from "react"
import { useNavigate } from "react-router-dom"
import { AlertTriangle, Boxes, Loader2, Plus, ShieldAlert, Sparkles } from "lucide-react"

import { produtosApi, type FinalizedProject, type ProductListItem } from "@/api/produtos"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Skeleton } from "@/components/ui/skeleton"
import { EmptyState } from "@/components/EmptyState"
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { toast } from "@/lib/toast"
import { ProductFormDialog } from "@/modules/produtos/ProductFormDialog"
import {
  CATEGORIA_LABEL, CONTRATO_STATUS_COLOR, CONTRATO_STATUS_LABEL, CRITICIDADE_COLOR, CRITICIDADE_LABEL,
  DOCNT_STATUS_COLOR, DOCNT_STATUS_LABEL, STATUS_COLOR, STATUS_LABEL, TIPODEV_LABEL,
} from "@/modules/produtos/constants"

function fmtDate(iso: string | null) { return iso ? new Date(iso).toLocaleDateString("pt-BR") : "—" }
const ALL = "__all__"

type Toggle = "sem_contrato" | "a_vencer" | "sem_doc" | "dados_pessoais" | "criticos"
const TOGGLES: { key: Toggle; label: string }[] = [
  { key: "sem_contrato", label: "Sem contrato" },
  { key: "a_vencer", label: "Contrato a vencer" },
  { key: "sem_doc", label: "Sem documentação" },
  { key: "dados_pessoais", label: "Com dados pessoais" },
  { key: "criticos", label: "Críticos" },
]

export default function ProductsPage() {
  const navigate = useNavigate()
  const [products, setProducts] = useState<ProductListItem[]>([])
  const [loading, setLoading] = useState(true)
  const [openNew, setOpenNew] = useState(false)
  const [openFromProject, setOpenFromProject] = useState(false)

  // filtros
  const [q, setQ] = useState("")
  const [fStatus, setFStatus] = useState(ALL)
  const [fCategoria, setFCategoria] = useState(ALL)
  const [fCriticidade, setFCriticidade] = useState(ALL)
  const [fTipoDev, setFTipoDev] = useState(ALL)
  const [fArea, setFArea] = useState(ALL)
  const [fForn, setFForn] = useState(ALL)
  const [toggles, setToggles] = useState<Set<Toggle>>(new Set())

  async function reload() { setProducts(await produtosApi.listProducts().catch(() => [])) }
  useEffect(() => { produtosApi.listProducts().catch(() => []).then(setProducts).finally(() => setLoading(false)) }, [])

  const areas = useMemo(() => Array.from(new Set(products.map((p) => p.area_name).filter(Boolean))) as string[], [products])
  const forns = useMemo(() => Array.from(new Set(products.map((p) => p.fornecedor_nome).filter(Boolean))) as string[], [products])

  const filtered = useMemo(() => products.filter((p) => {
    if (q && !`${p.name} ${p.sigla ?? ""}`.toLowerCase().includes(q.toLowerCase())) return false
    if (fStatus !== ALL && p.status_produto !== fStatus) return false
    if (fCategoria !== ALL && p.categoria !== fCategoria) return false
    if (fCriticidade !== ALL && p.criticidade !== fCriticidade) return false
    if (fTipoDev !== ALL && p.tipo_desenvolvimento !== fTipoDev) return false
    if (fArea !== ALL && p.area_name !== fArea) return false
    if (fForn !== ALL && p.fornecedor_nome !== fForn) return false
    if (toggles.has("sem_contrato") && p.has_active_contract) return false
    if (toggles.has("a_vencer") && !p.contrato_a_vencer) return false
    if (toggles.has("sem_doc") && p.has_documentation) return false
    if (toggles.has("dados_pessoais") && !p.tem_dados_pessoais) return false
    if (toggles.has("criticos") && !p.is_critico) return false
    return true
  }), [products, q, fStatus, fCategoria, fCriticidade, fTipoDev, fArea, fForn, toggles])

  function toggle(t: Toggle) {
    setToggles((cur) => { const n = new Set(cur); n.has(t) ? n.delete(t) : n.add(t); return n })
  }

  if (loading) return <Skeleton className="h-64 w-full" />

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-lg font-bold">Produtos Digitais</h2>
          <p className="text-sm text-muted-foreground">Portfólio de produtos, sistemas, integrações e soluções da TI corporativa.</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" className="gap-1.5" onClick={() => setOpenFromProject(true)}><Sparkles size={15} /> A partir de projeto</Button>
          <Button className="gap-1.5" onClick={() => setOpenNew(true)}><Plus size={15} /> Novo produto</Button>
        </div>
      </div>

      {products.length === 0 ? (
        <EmptyState icon={Boxes} title="Nenhum produto" description="Crie um produto ou gere a partir de um projeto finalizado."
          action={{ label: "Novo produto", onClick: () => setOpenNew(true) }} />
      ) : (
        <>
          {/* Filtros */}
          <div className="space-y-2 rounded-md border p-3">
            <div className="flex flex-wrap items-end gap-2">
              <div className="space-y-1"><Label className="text-[11px]">Buscar</Label><Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Nome ou sigla" className="h-9 w-48" /></div>
              <FilterSelect label="Status" value={fStatus} onChange={setFStatus} options={Object.entries(STATUS_LABEL)} />
              <FilterSelect label="Categoria" value={fCategoria} onChange={setFCategoria} options={Object.entries(CATEGORIA_LABEL)} />
              <FilterSelect label="Criticidade" value={fCriticidade} onChange={setFCriticidade} options={Object.entries(CRITICIDADE_LABEL)} />
              <FilterSelect label="Tipo dev." value={fTipoDev} onChange={setFTipoDev} options={Object.entries(TIPODEV_LABEL)} />
              <FilterSelect label="Área" value={fArea} onChange={setFArea} options={areas.map((a) => [a, a])} />
              <FilterSelect label="Fornecedor" value={fForn} onChange={setFForn} options={forns.map((a) => [a, a])} />
            </div>
            <div className="flex flex-wrap gap-1.5">
              {TOGGLES.map((t) => (
                <button key={t.key} type="button" onClick={() => toggle(t.key)}
                  className={`rounded-full border px-2.5 py-1 text-[11px] transition ${toggles.has(t.key) ? "border-primary bg-primary/10 text-primary" : "text-muted-foreground hover:bg-muted/50"}`}>
                  {t.label}
                </button>
              ))}
              <span className="ml-auto self-center text-[11px] text-muted-foreground">{filtered.length} de {products.length}</span>
            </div>
          </div>

          {/* Tabela */}
          <div className="overflow-x-auto rounded-md border">
            <table className="w-full min-w-[1100px] text-sm">
              <thead className="border-b bg-muted/40 text-left text-[11px] uppercase text-muted-foreground">
                <tr>
                  {["Produto", "Categoria", "Status", "Criticidade", "Área", "Resp. TI", "Tipo dev.", "Fornecedor", "Contrato", "Fim contrato", "Últ. release", "Documentação"].map((h) => (
                    <th key={h} className="whitespace-nowrap px-3 py-2 font-semibold">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map((p) => (
                  <tr key={p.id} className="cursor-pointer border-b transition last:border-0 hover:bg-muted/40"
                    onClick={() => navigate(`/app/modules/produtos/produtos/${p.id}`)}>
                    <td className="px-3 py-2">
                      <div className="flex items-center gap-1.5 font-medium">
                        {p.simbolo ? <span>{p.simbolo}</span> : null}
                        <span>{p.name}</span>
                        {p.sigla && <span className="text-[11px] text-muted-foreground">({p.sigla})</span>}
                        {p.tem_dados_pessoais && <ShieldAlert size={12} className="text-amber-600" aria-label="Trata dados pessoais" />}
                      </div>
                    </td>
                    <td className="whitespace-nowrap px-3 py-2 text-muted-foreground">{p.categoria ? CATEGORIA_LABEL[p.categoria] : "—"}</td>
                    <td className="whitespace-nowrap px-3 py-2">
                      {p.status_produto
                        ? <Badge variant="secondary" className="text-[10px]" style={{ backgroundColor: `${STATUS_COLOR[p.status_produto]}22`, color: STATUS_COLOR[p.status_produto] }}>{STATUS_LABEL[p.status_produto]}</Badge>
                        : <span className="text-muted-foreground">—</span>}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2">
                      <Badge variant="secondary" className="text-[10px]" style={{ backgroundColor: `${CRITICIDADE_COLOR[p.criticidade]}22`, color: CRITICIDADE_COLOR[p.criticidade] }}>{CRITICIDADE_LABEL[p.criticidade]}</Badge>
                    </td>
                    <td className="whitespace-nowrap px-3 py-2 text-muted-foreground">{p.area_name ?? "—"}</td>
                    <td className="whitespace-nowrap px-3 py-2 text-muted-foreground">{p.responsavel_nome ?? "—"}</td>
                    <td className="whitespace-nowrap px-3 py-2 text-muted-foreground">{p.tipo_desenvolvimento ? TIPODEV_LABEL[p.tipo_desenvolvimento] : "—"}</td>
                    <td className="whitespace-nowrap px-3 py-2 text-muted-foreground">{p.fornecedor_nome ?? "—"}</td>
                    <td className="whitespace-nowrap px-3 py-2">
                      {p.contrato_status
                        ? <Badge variant="secondary" className="text-[10px]" style={{ backgroundColor: `${CONTRATO_STATUS_COLOR[p.contrato_status]}22`, color: CONTRATO_STATUS_COLOR[p.contrato_status] }}>{CONTRATO_STATUS_LABEL[p.contrato_status]}</Badge>
                        : p.requires_contract ? <Badge variant="destructive" className="text-[10px]"><AlertTriangle size={10} className="mr-0.5" /> sem contrato</Badge> : <span className="text-muted-foreground">—</span>}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2 text-muted-foreground">{fmtDate(p.contrato_vigencia_fim)}</td>
                    <td className="whitespace-nowrap px-3 py-2 text-muted-foreground">{p.ultima_release ?? "—"}</td>
                    <td className="whitespace-nowrap px-3 py-2">
                      {p.doc_status
                        ? <Badge variant="secondary" className="text-[10px]" style={{ backgroundColor: `${DOCNT_STATUS_COLOR[p.doc_status]}22`, color: DOCNT_STATUS_COLOR[p.doc_status] }}>{DOCNT_STATUS_LABEL[p.doc_status]}</Badge>
                        : <span className="text-muted-foreground">—</span>}
                    </td>
                  </tr>
                ))}
                {filtered.length === 0 && (
                  <tr><td colSpan={12} className="px-3 py-8 text-center text-sm text-muted-foreground">Nenhum produto corresponde aos filtros.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </>
      )}

      <ProductFormDialog open={openNew} onOpenChange={setOpenNew} onSaved={(p) => { setOpenNew(false); navigate(`/app/modules/produtos/produtos/${p.id}`) }} />
      <FromProjectDialog open={openFromProject} onOpenChange={setOpenFromProject} onCreated={(id) => { setOpenFromProject(false); void reload(); navigate(`/app/modules/produtos/produtos/${id}`) }} />
    </div>
  )
}

function FilterSelect({ label, value, onChange, options }: { label: string; value: string; onChange: (v: string) => void; options: [string, string][] }) {
  return (
    <div className="space-y-1">
      <Label className="text-[11px]">{label}</Label>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger className="h-9 w-40"><SelectValue /></SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL}>Todos</SelectItem>
          {options.map(([v, l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}
        </SelectContent>
      </Select>
    </div>
  )
}

function FromProjectDialog({ open, onOpenChange, onCreated }: { open: boolean; onOpenChange: (v: boolean) => void; onCreated: (id: string) => void }) {
  const [projects, setProjects] = useState<FinalizedProject[]>([])
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState<FinalizedProject | null>(null)
  const [name, setName] = useState("")
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!open) return
    setSelected(null); setName(""); setLoading(true)
    produtosApi.listFinalizedProjects().then(setProjects).catch(() => setProjects([])).finally(() => setLoading(false))
  }, [open])

  async function save() {
    if (!selected) return
    setSaving(true)
    try {
      const prod = await produtosApi.createFromProject({ task_id: selected.task_id, name: name.trim() || undefined })
      toast.success("Produto criado a partir do projeto.")
      onCreated(prod.id)
    } catch (e) {
      toast.error((e as { response?: { data?: { detail?: string } } })?.response?.data?.detail || "Falha ao criar.")
    } finally { setSaving(false) }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle>Criar produto a partir de projeto finalizado</DialogTitle></DialogHeader>
        {loading ? <Skeleton className="h-40 w-full" />
          : projects.length === 0 ? <EmptyState icon={Sparkles} title="Nenhum projeto finalizado" description="Finalize um projeto no módulo de Processos." />
          : !selected ? (
            <div className="space-y-2">
              {projects.map((p) => (
                <button key={p.task_id} type="button" disabled={p.already_promoted} onClick={() => { setSelected(p); setName(p.title) }}
                  className="flex w-full items-center justify-between gap-2 rounded-md border p-2.5 text-left transition enabled:hover:bg-muted/50 disabled:opacity-60">
                  <div className="min-w-0"><p className="truncate text-sm font-medium">{p.title}</p><p className="text-[11px] text-muted-foreground">Finalizado {fmtDate(p.completed_at)}</p></div>
                  {p.already_promoted && <Badge variant="secondary" className="shrink-0 text-[10px]">Já é produto</Badge>}
                </button>
              ))}
            </div>
          ) : (
            <div className="space-y-3">
              <button type="button" className="text-[11px] text-primary hover:underline" onClick={() => setSelected(null)}>← outro projeto</button>
              <div className="space-y-1.5"><Label>Nome do produto</Label><Input value={name} onChange={(e) => setName(e.target.value)} autoFocus /></div>
              <p className="text-[11px] text-muted-foreground">Você poderá definir área, responsável e fornecedor depois, no produto.</p>
            </div>
          )}
        {selected && (
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
            <Button onClick={() => void save()} disabled={saving || !name.trim()}>{saving && <Loader2 size={14} className="mr-1.5 animate-spin" />}Criar produto</Button>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  )
}
