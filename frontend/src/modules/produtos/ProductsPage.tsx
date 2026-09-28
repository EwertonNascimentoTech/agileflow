import { useEffect, useMemo, useState } from "react"
import { useNavigate } from "react-router-dom"
import {
  Activity, AlertTriangle, Boxes, Building2, CalendarClock, Clock, FileQuestion, FileWarning, FileX, GitBranch, HeartPulse,
  Loader2, type LucideIcon, PackageX, Plus, Search, ShieldAlert, Sparkles, Trash2, UserX,
} from "lucide-react"

import {
  produtosApi, type FinalizedProject, type ProductAlertaCode,
  type ProductListItem,
} from "@/api/produtos"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Skeleton } from "@/components/ui/skeleton"
import { EmptyState } from "@/components/EmptyState"
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Card, FilterSelect, KpiCount, KpiRow, PageHeader, Pill, TABLE } from "@/components/ds"
import { toast } from "@/lib/toast"
import { ProductFormDialog } from "@/modules/produtos/ProductFormDialog"
import { DefinirFornecedorDialog } from "@/modules/produtos/DefinirFornecedorDialog"
import {
  CATEGORIA_LABEL, CONTRATO_STATUS_LABEL, CONTRATO_TONE, DOC_TONE, DOCNT_STATUS_LABEL, LIFECYCLE_LABEL, LIFECYCLE_OPTS,
  LIFECYCLE_TONE, SAUDE_LABEL, SAUDE_TONE, isCategoriaExterna,
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

// Cor do ícone de alerta por nível (alto = vermelho, médio = âmbar), com variante escura.
const ALERTA_NIVEL_TEXT = { alto: "text-red-600 dark:text-red-400", medio: "text-amber-600 dark:text-amber-400" } as const

const TABLE_HEADERS = [
  "Produto", "Serviços", "Saúde", "Alertas", "Ciclo de vida", "Categoria", "Resp. (PO)", "Resp. técnico",
  "Contrato", "Fim contrato", "Últ. release", "Documentação",
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

  // Indicadores do topo: contam sobre todos os produtos, com os mesmos critérios dos filtros rápidos.
  const counts = useMemo(() => ({
    critico: products.filter((p) => p.classe === "critico").length,
    atencao: products.filter((p) => p.classe === "atencao").length,
    comAlertas: products.filter((p) => p.alertas.length > 0).length,
    aVencer: products.filter((p) => p.contrato_a_vencer).length,
    semDoc: products.filter((p) => !p.has_documentation).length,
  }), [products])

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

  if (loading) {
    return (
      <div className="space-y-5">
        <Skeleton className="h-16 w-2/3 rounded-xl" />
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-6">
          {Array.from({ length: 6 }, (_, i) => <Skeleton key={i} className="h-[74px] rounded-xl" />)}
        </div>
        <Skeleton className="h-32 rounded-2xl" />
        <Skeleton className="h-96 rounded-2xl" />
      </div>
    )
  }

  return (
    <div className="space-y-5">
      <PageHeader
        icon={Boxes}
        color="#7C3AED"
        title="Produtos Digitais"
        description="Portfólio de produtos, sistemas, integrações e soluções da TI corporativa. Acompanhe saúde, alertas, contratos e documentação, e clique num produto para abrir a ficha."
        actions={
          <>
            <Button variant="outline" className="h-10 gap-1.5" onClick={() => setOpenFromProject(true)}><Sparkles size={16} /> A partir de projeto</Button>
            <Button className="h-10 gap-1.5" onClick={() => setOpenNew(true)}><Plus size={16} /> Novo produto</Button>
          </>
        }
      />

      {products.length === 0 ? (
        <Card>
          <EmptyState icon={Boxes} title="Nenhum produto" description="Crie um produto ou gere a partir de um projeto finalizado."
            action={{ label: "Novo produto", onClick: () => setOpenNew(true) }} />
        </Card>
      ) : (
        <>
          {/* Indicadores clicáveis: ligam/desligam o mesmo filtro rápido da barra abaixo. */}
          <KpiRow className="sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-6">
            <KpiCount icon={Boxes} value={products.length} label="Produtos" />
            <KpiCount
              icon={HeartPulse} value={counts.critico} label="Saúde crítica" tone={counts.critico > 0 ? "red" : "slate"}
              highlight={counts.critico > 0} onClick={() => toggle("saude_critico")} active={toggles.has("saude_critico")}
            />
            <KpiCount
              icon={Activity} value={counts.atencao} label="Saúde em atenção" tone={counts.atencao > 0 ? "amber" : "slate"}
              onClick={() => toggle("saude_atencao")} active={toggles.has("saude_atencao")}
            />
            <KpiCount
              icon={AlertTriangle} value={counts.comAlertas} label="Com alertas" tone={counts.comAlertas > 0 ? "amber" : "slate"}
              onClick={() => toggle("com_alertas")} active={toggles.has("com_alertas")}
            />
            <KpiCount
              icon={CalendarClock} value={counts.aVencer} label="Contrato a vencer" tone={counts.aVencer > 0 ? "red" : "slate"}
              highlight={counts.aVencer > 0} onClick={() => toggle("a_vencer")} active={toggles.has("a_vencer")}
            />
            <KpiCount
              icon={FileQuestion} value={counts.semDoc} label="Sem documentação" tone={counts.semDoc > 0 ? "amber" : "slate"}
              onClick={() => toggle("sem_doc")} active={toggles.has("sem_doc")}
            />
          </KpiRow>

          <Card className="space-y-4 p-4">
            <div className="flex flex-wrap items-end gap-3">
              <label className="block space-y-1">
                <span className="text-xs text-muted-foreground">Buscar</span>
                <span className="relative block">
                  <Search size={15} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
                  <input
                    type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Nome do produto…"
                    className="h-10 w-60 rounded-md border bg-background pl-8 pr-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  />
                </span>
              </label>
              <FilterSelect
                label="Categoria" value={fCategoria} onChange={setFCategoria}
                options={[{ value: ALL, label: "Todas" }, ...Object.entries(CATEGORIA_LABEL).map(([v, l]) => ({ value: v, label: l }))]}
              />
              <FilterSelect
                label="Ciclo de vida" value={fLifecycle} onChange={setFLifecycle}
                options={[{ value: ALL, label: "Todos" }, ...LIFECYCLE_OPTS.map((v) => ({ value: v, label: LIFECYCLE_LABEL[v] }))]}
              />
              <FilterSelect
                label="Serviços" value={fServicos} onChange={setFServicos}
                options={[{ value: SERVICOS_ALL, label: "Todos" }, { value: SERVICOS_COM, label: "Com serviços" }, { value: SERVICOS_SEM, label: "Sem serviços" }]}
              />
              <FilterSelect
                label="Product Owner" value={fPO} onChange={setFPO}
                options={[{ value: ALL, label: "Todos os POs" }, ...poOptions.map(([v, l]) => ({ value: v, label: l }))]}
              />
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="mr-1 text-xs text-muted-foreground">Filtros rápidos</span>
              {TOGGLES.map((t) => {
                const on = toggles.has(t.key)
                return (
                  <button key={t.key} type="button" aria-pressed={on} onClick={() => toggle(t.key)}
                    className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                      on ? "border-primary bg-primary text-primary-foreground" : "bg-background text-muted-foreground hover:bg-muted hover:text-foreground"
                    }`}>
                    {t.label}
                  </button>
                )
              })}
              <span className="ml-auto text-sm text-muted-foreground">
                <strong className="font-semibold text-foreground">{filtered.length}</strong> de {products.length} produtos
              </span>
            </div>
          </Card>

          <Card className="overflow-hidden">
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 border-b px-4 py-3 text-xs text-muted-foreground">
              <span className="font-semibold text-foreground">Legenda de alertas</span>
              {ALERTA_LEGENDA.map(({ code, label, nivel }) => {
                const Icon = ALERTA_ICON[code]
                return (
                  <span key={code} className="inline-flex items-center gap-1">
                    <Icon size={14} className={ALERTA_NIVEL_TEXT[nivel]} /> {label}
                  </span>
                )
              })}
              <span className="ml-auto inline-flex items-center gap-3">
                <span className="inline-flex items-center gap-1"><span className="inline-block h-2.5 w-2.5 rounded-full bg-red-600" /> alto</span>
                <span className="inline-flex items-center gap-1"><span className="inline-block h-2.5 w-2.5 rounded-full bg-amber-600" /> médio</span>
              </span>
            </div>

            {filtered.length === 0 ? (
              <EmptyState icon={Boxes} title="Nenhum produto encontrado" description="Nenhum produto corresponde aos filtros." compact />
            ) : (
              <div className={TABLE.wrap}>
                <table className={`${TABLE.table} min-w-[1150px]`}>
                  <thead className={TABLE.thead}>
                    <tr>
                      {TABLE_HEADERS.map((h, i) => (
                        <th key={h} className={`whitespace-nowrap ${i === 0 ? TABLE.thFirst : TABLE.th} ${h === "Serviços" ? "text-center" : ""}`}>{h}</th>
                      ))}
                      <th className={`${TABLE.th} w-20`}><span className="sr-only">Ações</span></th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map((p) => (
                      <tr key={p.id} className={`${TABLE.tr} group cursor-pointer`}
                        onClick={() => navigate(`/app/modules/produtos/produtos/${p.id}`)}>
                        <td className={TABLE.tdFirst}>
                          <div className="flex items-center gap-1.5 font-semibold">
                            <span>{p.name}</span>
                            {p.tem_dados_pessoais && <ShieldAlert size={14} className="shrink-0 text-amber-600 dark:text-amber-400" aria-label="Trata dados pessoais" />}
                          </div>
                        </td>
                        <td className={`${TABLE.td} text-center tabular-nums`}>{p.servicos_count ?? 0}</td>
                        <td className={`${TABLE.td} align-top`}>
                          <div className="flex flex-col gap-1">
                            <span className="w-fit" title={p.saude_gaps.length ? `Saúde: ${SAUDE_LABEL[p.classe]} (${p.score}/100)\nFalta para 100: ${p.saude_gaps.join(", ")}` : `Saúde: ${SAUDE_LABEL[p.classe]} (${p.score}/100)`}>
                              <Pill tone={SAUDE_TONE[p.classe]} dot className="tabular-nums">{p.score}</Pill>
                            </span>
                            {p.saude_gaps.length > 0 && (
                              <span className="max-w-[180px] text-xs leading-snug text-muted-foreground" title={`Falta para 100: ${p.saude_gaps.join(", ")}`}>
                                falta: {p.saude_gaps.join(", ")}
                              </span>
                            )}
                          </div>
                        </td>
                        <td className={TABLE.td}>
                          {p.alertas.length === 0
                            ? <span className="text-muted-foreground">—</span>
                            : <div className="flex items-center gap-1.5">
                                {p.alertas.map((a) => {
                                  const Icon = ALERTA_ICON[a.code]
                                  return (
                                    <span key={a.code} title={a.message} aria-label={a.message} className={ALERTA_NIVEL_TEXT[a.nivel]}>
                                      <Icon size={16} />
                                    </span>
                                  )
                                })}
                              </div>}
                        </td>
                        <td className={TABLE.td}><Pill tone={LIFECYCLE_TONE[p.lifecycle]} dot>{LIFECYCLE_LABEL[p.lifecycle]}</Pill></td>
                        <td className={TABLE.td}>
                          {p.categoria
                            ? <Pill tone={isCategoriaExterna(p.categoria) ? "teal" : "blue"}>{CATEGORIA_LABEL[p.categoria]}</Pill>
                            : <span className="text-muted-foreground">—</span>}
                        </td>
                        <td className={`${TABLE.td} whitespace-nowrap text-muted-foreground`}>{p.responsavel_nome ?? "—"}</td>
                        <td className={`${TABLE.td} whitespace-nowrap text-muted-foreground`}>{p.responsavel_tecnico_nome ?? "—"}</td>
                        <td className={TABLE.td}>
                          {p.contrato_status
                            ? <Pill tone={CONTRATO_TONE[p.contrato_status]} dot>{CONTRATO_STATUS_LABEL[p.contrato_status]}</Pill>
                            : p.requires_contract ? <Pill tone="red"><AlertTriangle size={12} /> sem contrato</Pill> : <span className="text-muted-foreground">—</span>}
                        </td>
                        <td className={`${TABLE.td} whitespace-nowrap tabular-nums text-muted-foreground`}>{fmtDate(p.contrato_vigencia_fim)}</td>
                        <td className={`${TABLE.td} whitespace-nowrap text-muted-foreground`}>{p.ultima_release ?? "—"}</td>
                        <td className={TABLE.td}>
                          {p.doc_status
                            ? <Pill tone={DOC_TONE[p.doc_status]} dot>{DOCNT_STATUS_LABEL[p.doc_status]}</Pill>
                            : <span className="text-muted-foreground">—</span>}
                        </td>
                        <td className={TABLE.td}>
                          <div className="flex items-center justify-end gap-0.5 opacity-0 transition-opacity focus-within:opacity-100 group-hover:opacity-100">
                            {p.requires_contract && !p.fornecedor_nome && (
                              <Button
                                size="icon" variant="ghost"
                                className="h-8 w-8"
                                title="Definir fornecedor"
                                onClick={(e) => { e.stopPropagation(); setFornecedorProd(p) }}
                              >
                                <Building2 size={15} />
                              </Button>
                            )}
                            <Button
                              size="icon" variant="ghost"
                              className="h-8 w-8 text-muted-foreground hover:text-destructive"
                              title="Inativar produto"
                              onClick={(e) => { e.stopPropagation(); void handleDelete(p) }}
                              disabled={deletingId === p.id}
                            >
                              {deletingId === p.id ? <Loader2 size={15} className="animate-spin" /> : <Trash2 size={15} />}
                            </Button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
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
        {loading ? <Skeleton className="h-40 w-full rounded-xl" />
          : projects.length === 0 ? <EmptyState icon={Sparkles} title="Nenhum projeto finalizado" description="Finalize um projeto no módulo de Processos." />
          : !selected ? (
            <div className="space-y-2">
              {projects.map((p) => (
                <button key={p.task_id} type="button" disabled={p.already_promoted} onClick={() => { setSelected(p); setName(p.title) }}
                  className="flex w-full items-center justify-between gap-2 rounded-xl border p-3 text-left transition-colors enabled:hover:bg-muted/50 disabled:opacity-60">
                  <div className="min-w-0"><p className="truncate text-sm font-medium">{p.title}</p><p className="text-xs text-muted-foreground">Finalizado {fmtDate(p.completed_at)}</p></div>
                  {p.already_promoted && <Pill tone="slate" className="shrink-0">Já é produto</Pill>}
                </button>
              ))}
            </div>
          ) : (
            <div className="space-y-3">
              <button type="button" className="text-xs text-primary hover:underline" onClick={() => setSelected(null)}>← outro projeto</button>
              <div className="space-y-1.5"><Label>Nome do produto</Label><Input value={name} onChange={(e) => setName(e.target.value)} autoFocus /></div>
              <p className="text-xs text-muted-foreground">Você poderá definir área, responsável e fornecedor depois, no produto.</p>
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
