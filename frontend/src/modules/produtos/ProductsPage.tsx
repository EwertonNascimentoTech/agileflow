import { useEffect, useMemo, useState } from "react"
import { useNavigate } from "react-router-dom"
import {
  AlertTriangle, Boxes, Building2, Clock, FileQuestion, FileWarning, FileX, GitBranch, Loader2, type LucideIcon,
  PackageX, Plus, ShieldAlert, Sparkles, Trash2, UserX,
} from "lucide-react"

import { produtosApi, type FinalizedProject, type ProductAlertaCode, type ProductListItem } from "@/api/produtos"
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
import { DefinirFornecedorDialog } from "@/modules/produtos/DefinirFornecedorDialog"
import {
  CATEGORIA_LABEL, CONTRATO_STATUS_COLOR, CONTRATO_STATUS_LABEL,
  DOCNT_STATUS_COLOR, DOCNT_STATUS_LABEL, LIFECYCLE_LABEL, LIFECYCLE_OPTS,
  SAUDE_COLOR, SAUDE_LABEL,
} from "@/modules/produtos/constants"

function fmtDate(iso: string | null) { return iso ? new Date(iso).toLocaleDateString("pt-BR") : "—" }
const ALL = "__all__"
const SERVICOS_ALL = "__all__"
const SERVICOS_COM = "com"
const SERVICOS_SEM = "sem"

type Toggle = "saude_critico" | "saude_atencao" | "com_alertas" | "sem_contrato" | "a_vencer" | "sem_doc" | "dados_pessoais"
const TOGGLES: { key: Toggle; label: string }[] = [
  { key: "saude_critico", label: "Saúde: Crítico" },
  { key: "saude_atencao", label: "Saúde: Atenção" },
  { key: "com_alertas", label: "Com alertas" },
  { key: "sem_contrato", label: "Sem contrato" },
  { key: "a_vencer", label: "Contrato a vencer" },
  { key: "sem_doc", label: "Sem documentação" },
  { key: "dados_pessoais", label: "Com dados pessoais" },
]

// Persistência dos filtros — sobrevive à navegação (entrar num produto e voltar).
// Só é "perdido" quando o usuário limpa/altera os filtros.
const FILTERS_KEY = "produtos.filtros.v1"
type StoredFilters = {
  q?: string; fCategoria?: string; fLifecycle?: string; fServicos?: string; fPO?: string; toggles?: Toggle[]
}
function loadFilters(): StoredFilters {
  try { return JSON.parse(localStorage.getItem(FILTERS_KEY) || "{}") as StoredFilters } catch { return {} }
}

const ALERTA_ICON: Record<ProductAlertaCode, LucideIcon> = {
  producao_sem_servico: PackageX,
  externo_sem_contrato: FileX,
  sem_documentacao: FileQuestion,
  tecnico_nao_referencia: UserX,
  produto_parado: Clock,
  doc_desatualizada: FileWarning,
  repositorio_sem_commits: GitBranch,
}

const ALERTA_LEGENDA: { code: ProductAlertaCode; label: string; nivel: "alto" | "medio" }[] = [
  { code: "producao_sem_servico", label: "Em produção sem serviço", nivel: "alto" },
  { code: "externo_sem_contrato", label: "Externo sem contrato", nivel: "alto" },
  { code: "produto_parado", label: "Parado (>12m sem release)", nivel: "alto" },
  { code: "sem_documentacao", label: "Sem documentação", nivel: "medio" },
  { code: "tecnico_nao_referencia", label: "Téc. não é Referência Técnica", nivel: "medio" },
  { code: "doc_desatualizada", label: "Documentação desatualizada", nivel: "medio" },
  { code: "repositorio_sem_commits", label: "Repositório sem commits (>6m)", nivel: "medio" },
]

export default function ProductsPage() {
  const navigate = useNavigate()
  const [products, setProducts] = useState<ProductListItem[]>([])
  const [loading, setLoading] = useState(true)
  const [openNew, setOpenNew] = useState(false)
  const [openFromProject, setOpenFromProject] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [fornecedorProd, setFornecedorProd] = useState<ProductListItem | null>(null)

  const [q, setQ] = useState(() => loadFilters().q ?? "")
  const [fCategoria, setFCategoria] = useState(() => loadFilters().fCategoria ?? ALL)
  const [fLifecycle, setFLifecycle] = useState(() => loadFilters().fLifecycle ?? ALL)
  const [fServicos, setFServicos] = useState(() => loadFilters().fServicos ?? SERVICOS_ALL)
  const [fPO, setFPO] = useState(() => loadFilters().fPO ?? ALL)
  const [toggles, setToggles] = useState<Set<Toggle>>(() => new Set(loadFilters().toggles ?? []))

  // Salva os filtros sempre que mudam (entrar num produto e voltar mantém o filtro).
  useEffect(() => {
    try {
      localStorage.setItem(FILTERS_KEY, JSON.stringify({
        q, fCategoria, fLifecycle, fServicos, fPO, toggles: Array.from(toggles),
      }))
    } catch { /* ignore */ }
  }, [q, fCategoria, fLifecycle, fServicos, fPO, toggles])

  async function reload() { setProducts(await produtosApi.listProducts().catch(() => [])) }
  useEffect(() => { produtosApi.listProducts().catch(() => []).then(setProducts).finally(() => setLoading(false)) }, [])

  const poOptions = useMemo<[string, string][]>(() =>
    Array.from(new Set(products.map((p) => p.responsavel_nome).filter((n): n is string => !!n)))
      .sort((a, b) => a.localeCompare(b, "pt-BR"))
      .map((n) => [n, n]),
  [products])

  const filtered = useMemo(() => products.filter((p) => {
    if (q && !p.name.toLowerCase().includes(q.toLowerCase())) return false
    if (fCategoria !== ALL && p.categoria !== fCategoria) return false
    if (fLifecycle !== ALL && p.lifecycle !== fLifecycle) return false
    if (fServicos === SERVICOS_COM && (p.servicos_count ?? 0) === 0) return false
    if (fServicos === SERVICOS_SEM && (p.servicos_count ?? 0) > 0) return false
    if (fPO !== ALL && p.responsavel_nome !== fPO) return false
    if (toggles.has("saude_critico") && p.classe !== "critico") return false
    if (toggles.has("saude_atencao") && p.classe !== "atencao") return false
    if (toggles.has("com_alertas") && p.alertas.length === 0) return false
    if (toggles.has("sem_contrato") && p.has_active_contract) return false
    if (toggles.has("a_vencer") && !p.contrato_a_vencer) return false
    if (toggles.has("sem_doc") && p.has_documentation) return false
    if (toggles.has("dados_pessoais") && !p.tem_dados_pessoais) return false
    return true
  }), [products, q, fCategoria, fLifecycle, fServicos, fPO, toggles])

  function toggle(t: Toggle) {
    setToggles((cur) => { const n = new Set(cur); n.has(t) ? n.delete(t) : n.add(t); return n })
  }

  async function handleDelete(p: ProductListItem) {
    if (!confirm(`Inativar "${p.name}"? (exclusão lógica, preserva histórico)`)) return
    setDeletingId(p.id)
    try {
      await produtosApi.deleteProduct(p.id)
      toast.info("Produto inativado.")
      await reload()
    } catch (e) {
      toast.error((e as { response?: { data?: { detail?: string } } })?.response?.data?.detail || "Falha ao inativar.")
    } finally {
      setDeletingId(null)
    }
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
          <div className="space-y-2 rounded-md border p-3">
            <div className="flex flex-wrap items-end gap-2">
              <div className="space-y-1"><Label className="text-[11px]">Buscar</Label><Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Nome" className="h-9 w-48" /></div>
              <FilterSelect label="Categoria" value={fCategoria} onChange={setFCategoria} options={Object.entries(CATEGORIA_LABEL)} />
              <FilterSelect label="Ciclo de vida" value={fLifecycle} onChange={setFLifecycle} options={LIFECYCLE_OPTS.map((v) => [v, LIFECYCLE_LABEL[v]])} allLabel="Todos" />
              <FilterSelect label="Serviços" value={fServicos} onChange={setFServicos} options={[[SERVICOS_COM, "Com serviços"], [SERVICOS_SEM, "Sem serviços"]]} allLabel="Todos" />
              <FilterSelect label="Product Owner" value={fPO} onChange={setFPO} options={poOptions} allLabel="Todos os POs" />
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

          <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 rounded-md border bg-muted/20 px-3 py-2 text-[11px] text-muted-foreground">
            <span className="font-semibold uppercase tracking-wide">Legenda de alertas</span>
            {ALERTA_LEGENDA.map(({ code, label, nivel }) => {
              const Icon = ALERTA_ICON[code]
              return (
                <span key={code} className="inline-flex items-center gap-1">
                  <Icon size={13} className={nivel === "alto" ? "text-red-600" : "text-amber-600"} /> {label}
                </span>
              )
            })}
            <span className="ml-auto inline-flex items-center gap-2">
              <span className="inline-flex items-center gap-1"><span className="inline-block h-2.5 w-2.5 rounded-full bg-red-600" /> alto</span>
              <span className="inline-flex items-center gap-1"><span className="inline-block h-2.5 w-2.5 rounded-full bg-amber-600" /> médio</span>
            </span>
          </div>

          <div className="overflow-x-auto rounded-md border">
            <table className="w-full min-w-[1050px] text-sm">
              <thead className="border-b bg-muted/40 text-left text-[11px] uppercase text-muted-foreground">
                <tr>
                  {["Produto", "Serviços", "Saúde", "Alertas", "Ciclo de vida", "Categoria", "Resp. (PO)", "Resp. técnico", "Contrato", "Fim contrato", "Últ. release", "Documentação"].map((h) => (
                    <th key={h} className="whitespace-nowrap px-3 py-2 font-semibold">{h}</th>
                  ))}
                  <th className="w-10 px-3 py-2" />
                </tr>
              </thead>
              <tbody>
                {filtered.map((p) => (
                  <tr key={p.id} className="group cursor-pointer border-b transition last:border-0 hover:bg-muted/40"
                    onClick={() => navigate(`/app/modules/produtos/produtos/${p.id}`)}>
                    <td className="px-3 py-2">
                      <div className="flex items-center gap-1.5 font-medium">
                        <span>{p.name}</span>
                        {p.tem_dados_pessoais && <ShieldAlert size={12} className="text-amber-600" aria-label="Trata dados pessoais" />}
                      </div>
                    </td>
                    <td className="px-3 py-2 text-center tabular-nums">{p.servicos_count ?? 0}</td>
                    <td className="px-3 py-2 align-top">
                      <div className="flex flex-col gap-1">
                        <span title={p.saude_gaps.length ? `Saúde: ${SAUDE_LABEL[p.classe]} (${p.score}/100)\nFalta para 100: ${p.saude_gaps.join(", ")}` : `Saúde: ${SAUDE_LABEL[p.classe]} (${p.score}/100)`}
                          className="inline-flex w-fit min-w-[2.25rem] items-center justify-center gap-1 rounded-full border px-1.5 py-0.5 text-[11px] font-semibold tabular-nums"
                          style={{ backgroundColor: `${SAUDE_COLOR[p.classe]}1a`, color: SAUDE_COLOR[p.classe], borderColor: `${SAUDE_COLOR[p.classe]}55` }}>
                          {p.score}
                        </span>
                        {p.saude_gaps.length > 0 && (
                          <span className="max-w-[160px] text-[10px] leading-tight text-muted-foreground" title={`Falta para 100: ${p.saude_gaps.join(", ")}`}>
                            falta: {p.saude_gaps.join(", ")}
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-3 py-2">
                      {p.alertas.length === 0
                        ? <span className="text-muted-foreground">—</span>
                        : <div className="flex items-center gap-1.5">
                            {p.alertas.map((a) => {
                              const Icon = ALERTA_ICON[a.code]
                              return (
                                <span key={a.code} title={a.message} aria-label={a.message}
                                  className={a.nivel === "alto" ? "text-red-600" : "text-amber-600"}>
                                  <Icon size={15} />
                                </span>
                              )
                            })}
                          </div>}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2 text-muted-foreground">{LIFECYCLE_LABEL[p.lifecycle]}</td>
                    <td className="whitespace-nowrap px-3 py-2 text-muted-foreground">{p.categoria ? CATEGORIA_LABEL[p.categoria] : "—"}</td>
                    <td className="whitespace-nowrap px-3 py-2 text-muted-foreground">{p.responsavel_nome ?? "—"}</td>
                    <td className="whitespace-nowrap px-3 py-2 text-muted-foreground">{p.responsavel_tecnico_nome ?? "—"}</td>
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
                    <td className="px-3 py-2">
                      <div className="flex items-center opacity-0 transition group-hover:opacity-100">
                        {p.requires_contract && !p.fornecedor_nome && (
                          <Button
                            size="icon" variant="ghost"
                            className="h-7 w-7"
                            title="Definir fornecedor"
                            onClick={(e) => { e.stopPropagation(); setFornecedorProd(p) }}
                          >
                            <Building2 size={13} />
                          </Button>
                        )}
                        <Button
                          size="icon" variant="ghost"
                          className="h-7 w-7 text-destructive hover:text-destructive"
                          title="Inativar produto"
                          onClick={(e) => { e.stopPropagation(); void handleDelete(p) }}
                          disabled={deletingId === p.id}
                        >
                          {deletingId === p.id ? <Loader2 size={13} className="animate-spin" /> : <Trash2 size={13} />}
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
                {filtered.length === 0 && (
                  <tr><td colSpan={13} className="px-3 py-8 text-center text-sm text-muted-foreground">Nenhum produto corresponde aos filtros.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </>
      )}

      <ProductFormDialog open={openNew} onOpenChange={setOpenNew} onSaved={(p) => { setOpenNew(false); navigate(`/app/modules/produtos/produtos/${p.id}`) }} />
      <FromProjectDialog open={openFromProject} onOpenChange={setOpenFromProject} onCreated={(id) => { setOpenFromProject(false); void reload(); navigate(`/app/modules/produtos/produtos/${id}`) }} />
      {fornecedorProd && (
        <DefinirFornecedorDialog
          open={!!fornecedorProd}
          onOpenChange={(v) => { if (!v) setFornecedorProd(null) }}
          productId={fornecedorProd.id}
          productName={fornecedorProd.name}
          onSaved={() => { setFornecedorProd(null); void reload() }}
        />
      )}
    </div>
  )
}

function FilterSelect({ label, value, onChange, options, allLabel = "Todos" }: { label: string; value: string; onChange: (v: string) => void; options: [string, string][]; allLabel?: string }) {
  return (
    <div className="space-y-1">
      <Label className="text-[11px]">{label}</Label>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger className="h-9 w-40"><SelectValue /></SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL}>{allLabel}</SelectItem>
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
