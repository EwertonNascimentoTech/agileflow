import { useCallback, useEffect, useMemo, useState, type ElementType, type ReactNode } from "react"
import {
  ArrowDown,
  ArrowUp,
  Building2,
  ChevronDown,
  ChevronRight,
  ChevronsDownUp,
  ChevronsUpDown,
  GitCompare,
  Layers,
  ListTree,
  Loader2,
  Lock,
  Network,
  Pencil,
  Plus,
  Trash2,
  Workflow,
} from "lucide-react"

import {
  produtosApi,
  type ProcessItem,
  type ProcessNivel,
  type ProcessPortfolio,
  type ProcessVersionSummary,
  type ProcessVersionTree,
} from "@/api/produtos"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Skeleton } from "@/components/ui/skeleton"
import { EmptyState } from "@/components/EmptyState"
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Card, FilterSelect, Notice, PageHeader, Pill, ProgressBar, Segmented, type Tone } from "@/components/ds"
import { toast } from "@/lib/toast"
import { defaultSelectLabel } from "@/modules/projetos/defaultFormUtils"
import { useDefaultFormConfig } from "@/modules/projetos/useDefaultFormConfig"
import ProcessPortfolioItemDialog, { type ItemDialogSpec } from "./ProcessPortfolioItemDialog"
import ProcessPortfolioVersionDiffDialog from "./ProcessPortfolioVersionDiffDialog"
import { documentationStats, effectiveStatusItem, formatVigenciaRange } from "./processPortfolioDocUtils"
import { PROCESS_ITEM_STATUS_LABEL } from "@/modules/produtos/constants"

const NIVEL_LABEL: Record<ProcessNivel, string> = {
  diretoria: "Diretoria", macroprocesso: "Macro Processo", processo: "Processo", subprocesso: "Sub Processo",
}
const DOT: Record<ProcessNivel, string> = {
  diretoria: "#7C3AED", macroprocesso: "#2563EB", processo: "#059669", subprocesso: "#D97706",
}
/** Ícone do nível na árvore (quadrado na cor do nível, como Feature/US na árvore do Portal). */
const NIVEL_ICON: Record<ProcessNivel, ElementType> = {
  diretoria: Building2, macroprocesso: Layers, processo: Workflow, subprocesso: ListTree,
}
/** Status do item (planejado/em andamento/concluído) no selo do Portal. */
const STATUS_TONE: Record<string, Tone> = {
  planejado: "slate", em_andamento: "blue", concluido: "emerald",
}
// Atalhos de nível: o selecionado é deduzido do que está recolhido (sem estado próprio).
type LevelMode = "macro" | "processo" | "todos" | "custom"
const LEVEL_OPTS: { value: LevelMode; label: string }[] = [
  { value: "macro", label: "Somente macro" },
  { value: "processo", label: "Até processo" },
  { value: "todos", label: "Todos os níveis" },
]
// Cascata vigente: Macro Processo → Processo → Sub Processo. (Diretoria é atributo do macro, não nível.)
const CHILD: Record<ProcessNivel, ProcessNivel | null> = {
  diretoria: "macroprocesso", macroprocesso: "processo", processo: "subprocesso", subprocesso: null,
}
const ROOT_NIVEL: ProcessNivel = "macroprocesso"
const STATUS_LABEL: Record<string, string> = {
  rascunho: "Rascunho", consolidada: "Consolidada", arquivada: "Arquivada",
}

function detail(e: unknown): string {
  return (e as { response?: { data?: { detail?: string } } })?.response?.data?.detail || "Falha na operação."
}

function collectParentIds(items: ProcessItem[], out = new Set<string>()): Set<string> {
  for (const item of items) {
    if (item.children.length > 0) {
      out.add(item.id)
      collectParentIds(item.children, out)
    }
  }
  return out
}

function collectCollapsedForDepth(items: ProcessItem[], depth: number, maxDepth: number, out = new Set<string>()): Set<string> {
  for (const item of items) {
    if (item.children.length > 0 && depth >= maxDepth) out.add(item.id)
    collectCollapsedForDepth(item.children, depth + 1, maxDepth, out)
  }
  return out
}

export default function ProcessPortfolioPage() {
  const { fields: defaultFormFields } = useDefaultFormConfig()
  const formatDiretoria = (value: string) =>
    defaultSelectLabel(defaultFormFields, "diretoria", value) ?? value
  const formatArea = (node: ProcessItem) => {
    if (node.area) return defaultSelectLabel(defaultFormFields, "area", node.area) ?? node.area
    return node.area_nome
  }
  const [portfolios, setPortfolios] = useState<ProcessPortfolio[]>([])
  const [selectedId, setSelectedId] = useState<string>("")
  const [versions, setVersions] = useState<ProcessVersionSummary[]>([])
  const [tree, setTree] = useState<ProcessVersionTree | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadingTree, setLoadingTree] = useState(false)

  const [itemDialog, setItemDialog] = useState<ItemDialogSpec | null>(null)
  const [newPortfolio, setNewPortfolio] = useState(false)
  const [editPortfolio, setEditPortfolio] = useState<ProcessPortfolio | null>(null)
  const [newVersion, setNewVersion] = useState(false)
  const [showDiff, setShowDiff] = useState(false)
  const [collapsedIds, setCollapsedIds] = useState<Set<string>>(() => new Set())

  const selected = portfolios.find((p) => p.id === selectedId) ?? null
  const parentIds = useMemo(() => (tree ? collectParentIds(tree.items) : new Set<string>()), [tree])
  const levelMode = useMemo<LevelMode>(() => {
    if (!tree) return "custom"
    const same = (s: Set<string>) => s.size === collapsedIds.size && [...s].every((id) => collapsedIds.has(id))
    if (collapsedIds.size === 0) return "todos"
    if (same(collectCollapsedForDepth(tree.items, 0, 0))) return "macro"
    if (same(collectCollapsedForDepth(tree.items, 0, 1))) return "processo"
    return "custom"
  }, [tree, collapsedIds])

  useEffect(() => {
    setCollapsedIds(tree?.items ? collectParentIds(tree.items) : new Set())
  }, [tree?.id])

  const loadPortfolios = useCallback(async () => {
    const list = await produtosApi.listProcessPortfolios().catch(() => [])
    setPortfolios(list)
    setSelectedId((cur) => cur || list[0]?.id || "")
    return list
  }, [])

  useEffect(() => { loadPortfolios().finally(() => setLoading(false)) }, [loadPortfolios])

  const loadVersionsAndTree = useCallback(async (portfolioId: string, versionId?: string) => {
    if (!portfolioId) { setTree(null); setVersions([]); return }
    setLoadingTree(true)
    try {
      const vs = await produtosApi.listPortfolioVersions(portfolioId)
      setVersions(vs)
      const t = versionId
        ? await produtosApi.getVersionTree(versionId)
        : await produtosApi.getCurrentPortfolioTree(portfolioId)
      setTree(t)
    } catch (e) {
      toast.error(detail(e))
    } finally {
      setLoadingTree(false)
    }
  }, [])

  useEffect(() => { if (selectedId) void loadVersionsAndTree(selectedId) }, [selectedId, loadVersionsAndTree])

  async function reloadTree() {
    if (selectedId && tree) await loadVersionsAndTree(selectedId, tree.id)
  }

  async function consolidate() {
    if (!tree) return
    if (!confirm(`Consolidar a versão v${tree.version}? Ela ficará imutável.`)) return
    try {
      await produtosApi.consolidateVersion(tree.id)
      toast.success("Versão consolidada.")
      await loadPortfolios()
      await loadVersionsAndTree(selectedId, tree.id)
    } catch (e) { toast.error(detail(e)) }
  }

  async function delItem(item: ProcessItem) {
    if (!tree) return
    if (!confirm(`Remover "${item.name}" e seus filhos?`)) return
    try { await produtosApi.deletePortfolioItem(tree.id, item.id); await reloadTree() }
    catch (e) { toast.error(detail(e)) }
  }

  async function moveItem(siblings: ProcessItem[], from: number, to: number) {
    if (!tree || to < 0 || to >= siblings.length) return
    const arr = [...siblings]
    const [m] = arr.splice(from, 1)
    arr.splice(to, 0, m)
    try {
      const t = await produtosApi.reorderPortfolioItems(tree.id, arr.map((it, idx) => ({ id: it.id, order: idx })))
      setTree(t)
    } catch (e) { toast.error(detail(e)) }
  }

  function toggleNodeExpand(id: string) {
    setCollapsedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function expandAllNodes() {
    setCollapsedIds(new Set())
  }

  function collapseAllNodes() {
    setCollapsedIds(new Set(parentIds))
  }

  function collapseToDepth(maxDepth: number) {
    if (!tree) return
    setCollapsedIds(collectCollapsedForDepth(tree.items, 0, maxDepth))
  }

  async function delPortfolio(p: ProcessPortfolio) {
    if (!confirm(`Excluir o portfólio "${p.name}" e TODAS as suas versões? Esta ação é irreversível.`)) return
    try {
      await produtosApi.deleteProcessPortfolio(p.id)
      toast.success("Portfólio excluído.")
      setSelectedId("")
      const list = await loadPortfolios()
      setSelectedId(list[0]?.id ?? "")
    } catch (e) { toast.error(detail(e)) }
  }

  const header = (actions?: ReactNode) => (
    <PageHeader
      icon={Network}
      color="#7C3AED"
      title="Portfólio de Processos"
      description="Cascata versionada: Diretoria → Macro Processo → Processo → Sub Processo."
      actions={actions}
    />
  )

  if (loading) {
    return (
      <div className="space-y-5">
        <Skeleton className="h-16 w-2/3 rounded-xl" />
        <Skeleton className="h-64 w-full rounded-2xl" />
      </div>
    )
  }

  if (portfolios.length === 0) {
    return (
      <div className="space-y-5">
        {header()}
        <Card>
          <EmptyState icon={Workflow} title="Nenhum portfólio de processos"
            description="Crie um portfólio para mapear a cascata Diretoria → Macro Processo → Processo → Sub Processo."
            action={{ label: "Criar portfólio", onClick: () => setNewPortfolio(true) }} />
        </Card>
        {newPortfolio && <PortfolioDialog onClose={() => setNewPortfolio(false)} onSaved={async (id) => { setNewPortfolio(false); await loadPortfolios(); setSelectedId(id) }} />}
      </div>
    )
  }

  const editable = tree?.editable ?? false

  return (
    <div className="space-y-5">
      {header(
        <Button variant="outline" className="h-10 gap-1.5" onClick={() => setNewPortfolio(true)}><Plus size={16} /> Novo portfólio</Button>,
      )}

      {/* Barra de controle: portfólio + versão + ações */}
      <Card className="flex flex-wrap items-end gap-3 p-4">
        <div className="flex items-end gap-1">
          <div className="w-64 max-w-full">
            <FilterSelect
              label="Portfólio"
              value={selectedId}
              onChange={setSelectedId}
              options={portfolios.map((p) => ({ value: p.id, label: p.name }))}
            />
          </div>
          {selected && (
            <>
              <Button variant="ghost" size="icon" className="h-10 w-10" title="Editar portfólio" aria-label="Editar portfólio" onClick={() => setEditPortfolio(selected)}><Pencil size={15} /></Button>
              <Button variant="ghost" size="icon" className="h-10 w-10 text-muted-foreground hover:text-destructive" title="Excluir portfólio" aria-label="Excluir portfólio" onClick={() => void delPortfolio(selected)}><Trash2 size={15} /></Button>
            </>
          )}
        </div>
        {/* Mesmo visual do FilterSelect, mantendo o "—" quando ainda não há versão carregada. */}
        <label className="block w-56 max-w-full space-y-1">
          <span className="text-xs text-muted-foreground">Versão</span>
          <Select value={tree?.id ?? ""} onValueChange={(v) => void loadVersionsAndTree(selectedId, v)}>
            <SelectTrigger className="h-10 bg-background"><SelectValue placeholder="—" /></SelectTrigger>
            <SelectContent>
              {versions.map((v) => (
                <SelectItem key={v.id} value={v.id}>
                  v{v.version} · {STATUS_LABEL[v.status] ?? v.status}{selected?.current_version_id === v.id ? " (vigente)" : ""}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </label>
        <div className="flex flex-1 flex-wrap items-center justify-end gap-2">
          {versions.length > 1 && (
            <Button variant="outline" className="h-10 gap-1.5" onClick={() => setShowDiff(true)}><GitCompare size={16} /> Comparar versões</Button>
          )}
          {editable ? (
            <Button className="h-10 gap-1.5" onClick={() => void consolidate()}><Lock size={16} /> Consolidar v{tree?.version}</Button>
          ) : (
            <Button className="h-10 gap-1.5" onClick={() => setNewVersion(true)}><Plus size={16} /> Nova versão</Button>
          )}
        </div>
      </Card>

      {tree && !editable && (
        <Notice tone="amber" icon={Lock}>
          Versão consolidada (somente leitura). Crie uma nova versão para editar.
        </Notice>
      )}
      {tree?.justification && (
        <p className="text-sm text-muted-foreground"><span className="font-medium text-foreground">Justificativa da versão:</span> {tree.justification}</p>
      )}

      {loadingTree ? (
        <Skeleton className="h-48 w-full rounded-2xl" />
      ) : tree ? (
        <Card>
          {(editable || tree.items.length > 0) && (
            <div className="flex flex-wrap items-end justify-between gap-3 p-4">
              {tree.items.length > 0 ? (
                <div className="flex flex-wrap items-end gap-2">
                  <div className="space-y-1">
                    <span className="block text-xs text-muted-foreground">Níveis</span>
                    <Segmented
                      value={levelMode}
                      onChange={(v) => (v === "macro" ? collapseToDepth(0) : v === "processo" ? collapseToDepth(1) : expandAllNodes())}
                      options={LEVEL_OPTS}
                    />
                  </div>
                  <Button variant="outline" className="h-10 gap-1.5" onClick={expandAllNodes}>
                    <ChevronsUpDown size={15} /> Expandir tudo
                  </Button>
                  <Button variant="outline" className="h-10 gap-1.5" onClick={collapseAllNodes}>
                    <ChevronsDownUp size={15} /> Recolher tudo
                  </Button>
                </div>
              ) : <span />}
              {editable && (
                <Button variant="outline" className="h-10 gap-1.5"
                  onClick={() => setItemDialog({ versionId: tree.id, nivel: ROOT_NIVEL, parentId: null })}>
                  <Plus size={16} /> Macro Processo
                </Button>
              )}
            </div>
          )}
          {tree.items.length === 0 ? (
            <div className={editable ? "border-t" : ""}>
              <EmptyState icon={Workflow} title="Versão vazia" description={editable ? "Adicione o primeiro macro processo." : "Esta versão não possui itens."} compact />
            </div>
          ) : (
            <div className="pb-1">
              {tree.items.map((node, idx) => (
                <Node key={node.id} node={node} editable={editable} siblings={tree.items} index={idx}
                  collapsedIds={collapsedIds}
                  onToggleExpand={toggleNodeExpand}
                  formatDiretoria={formatDiretoria}
                  formatArea={formatArea}
                  onAdd={(nivel, parentId) => setItemDialog({ versionId: tree.id, nivel, parentId })}
                  onEdit={(item) => setItemDialog({ versionId: tree.id, nivel: item.nivel, parentId: item.parent_id, item })}
                  onDelete={delItem} onMove={moveItem} />
              ))}
            </div>
          )}
        </Card>
      ) : null}

      {itemDialog && (
        <ProcessPortfolioItemDialog spec={itemDialog} onClose={() => setItemDialog(null)}
          onSaved={() => { setItemDialog(null); void reloadTree() }} />
      )}
      {newPortfolio && (
        <PortfolioDialog onClose={() => setNewPortfolio(false)}
          onSaved={async (id) => { setNewPortfolio(false); await loadPortfolios(); setSelectedId(id) }} />
      )}
      {editPortfolio && (
        <PortfolioDialog portfolio={editPortfolio} onClose={() => setEditPortfolio(null)}
          onSaved={async (id) => { setEditPortfolio(null); await loadPortfolios(); setSelectedId(id) }} />
      )}
      {newVersion && selected && (
        <NewVersionDialog onClose={() => setNewVersion(false)}
          onConfirm={async (justification) => {
            try {
              const t = await produtosApi.createPortfolioVersion(selected.id, justification)
              toast.success(`Versão v${t.version} criada (rascunho).`)
              setNewVersion(false)
              await loadVersionsAndTree(selected.id, t.id)
            } catch (e) { toast.error(detail(e)) }
          }} />
      )}
      {showDiff && selected && (
        <ProcessPortfolioVersionDiffDialog versions={versions} onClose={() => setShowDiff(false)} />
      )}
    </div>
  )
}

function Node({ node, depth = 0, editable, siblings, index, collapsedIds, onToggleExpand, formatDiretoria, formatArea, onAdd, onEdit, onDelete, onMove }: {
  node: ProcessItem
  depth?: number
  editable: boolean
  siblings: ProcessItem[]
  index: number
  collapsedIds: Set<string>
  onToggleExpand: (id: string) => void
  formatDiretoria: (value: string) => string
  formatArea: (node: ProcessItem) => string | null | undefined
  onAdd: (nivel: ProcessNivel, parentId: string) => void
  onEdit: (item: ProcessItem) => void
  onDelete: (item: ProcessItem) => void
  onMove: (siblings: ProcessItem[], from: number, to: number) => void
}) {
  const childNivel = CHILD[node.nivel]
  const hasChildren = node.children.length > 0
  const expanded = hasChildren && !collapsedIds.has(node.id)
  const vigenciaLabel = formatVigenciaRange(node.vigencia_inicio, node.vigencia_fim)
  const statusItem = effectiveStatusItem(node)
  const LevelIcon = NIVEL_ICON[node.nivel]
  const levelColor = DOT[node.nivel]
  const area = formatArea(node)
  const meta = [
    node.diretoria ? `Diretoria: ${formatDiretoria(node.diretoria)}` : null,
    area ? `Área: ${area}` : null,
    node.dono_nome ? `Dono: ${node.dono_nome}` : null,
    node.analista_nome ? `Analista: ${node.analista_nome}` : null,
    vigenciaLabel ? `Vigência: ${vigenciaLabel}` : null,
  ].filter((m): m is string => !!m)
  return (
    <div>
      {/* Linha da árvore no padrão do Portal (WorkTree): recuo por nível, ícone do nível, progresso e selos. */}
      <div
        className="relative z-0 flex flex-wrap items-center gap-x-3 gap-y-2 border-t py-2.5 pr-3 hover:z-20"
        style={{ paddingLeft: 8 + depth * 28 }}
      >
        <div className="flex min-w-[14rem] flex-1 items-center gap-2">
          {hasChildren ? (
            <button
              type="button"
              className="shrink-0 rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
              title={expanded ? "Recolher" : "Expandir"}
              aria-label={expanded ? "Recolher" : "Expandir"}
              aria-expanded={expanded}
              onClick={() => onToggleExpand(node.id)}
            >
              {expanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
            </button>
          ) : (
            <span className="w-6 shrink-0" aria-hidden />
          )}
          <span
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg"
            style={{ backgroundColor: `${levelColor}1f`, color: levelColor }}
            aria-hidden
          >
            <LevelIcon size={16} />
          </span>
          <div className="min-w-0">
            <p className={`truncate text-sm ${depth === 0 ? "font-semibold" : "font-medium"}`} title={node.name}>{node.name}</p>
            {meta.length > 0 && (
              <div className="flex flex-wrap gap-x-1.5 text-xs text-muted-foreground">
                {meta.map((m, i) => <span key={m}>{i > 0 && "· "}{m}</span>)}
              </div>
            )}
          </div>
        </div>
        <div className="ml-auto flex shrink-0 flex-wrap items-center justify-end gap-x-3 gap-y-2">
          {node.nivel === "subprocesso" ? (
            <div className="flex items-center gap-2">
              <div className="group/sv relative shrink-0">
                <Pill tone={(node.servicos_count ?? 0) > 0 ? "emerald" : "slate"} className="cursor-default">
                  Serviços {node.servicos_count ?? 0}
                </Pill>
                {(node.servicos?.length ?? 0) > 0 && (
                  <div className="pointer-events-none absolute right-0 top-full z-50 mt-1 hidden w-80 rounded-lg border bg-popover p-3 text-left text-xs leading-snug text-popover-foreground shadow-lg group-hover/sv:block">
                    <p className="mb-1.5 font-semibold text-foreground">
                      {node.servicos!.length} serviço(s)
                    </p>
                    <ul className="space-y-1.5">
                      {node.servicos!.map((s, i) => (
                        <li key={`${s.name}-${i}`}>
                          <span className="block font-medium text-foreground">{s.name}</span>
                          {s.product_name && (
                            <span className="block text-muted-foreground">{s.product_name}</span>
                          )}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
              <Pill tone={node.passagem_para_ti ? "violet" : "slate"}>
                {node.passagem_para_ti ? "Passagem TI" : "Sem passagem TI"}
              </Pill>
            </div>
          ) : (
            <div className="w-36">
              <DocumentationProgressBar node={node} />
            </div>
          )}
          <div className="w-32">
            <Pill tone={STATUS_TONE[statusItem] ?? "slate"} dot>
              {PROCESS_ITEM_STATUS_LABEL[statusItem] ?? statusItem}
            </Pill>
          </div>
          <div className="w-[7.5rem]">
            <span className="inline-flex whitespace-nowrap rounded-md px-2 py-0.5 text-xs font-medium text-muted-foreground ring-1 ring-inset ring-border">
              {NIVEL_LABEL[node.nivel]}
            </span>
          </div>
          <div className="flex shrink-0 items-center gap-0.5">
            {editable && (
              <>
                <Button variant="ghost" size="icon" className="h-8 w-8" title="Mover para cima" aria-label="Mover para cima" disabled={index === 0} onClick={() => onMove(siblings, index, index - 1)}><ArrowUp size={15} /></Button>
                <Button variant="ghost" size="icon" className="h-8 w-8" title="Mover para baixo" aria-label="Mover para baixo" disabled={index === siblings.length - 1} onClick={() => onMove(siblings, index, index + 1)}><ArrowDown size={15} /></Button>
              </>
            )}
            {editable && (childNivel ? (
              <Button variant="ghost" size="icon" className="h-8 w-8" title={`Novo ${NIVEL_LABEL[childNivel]}`} aria-label={`Novo ${NIVEL_LABEL[childNivel]}`} onClick={() => onAdd(childNivel, node.id)}><Plus size={15} /></Button>
            ) : (
              <span className="h-8 w-8" aria-hidden />
            ))}
            {editable && (
              <>
                <Button variant="ghost" size="icon" className="h-8 w-8" title="Editar" aria-label="Editar" onClick={() => onEdit(node)}><Pencil size={15} /></Button>
                <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-destructive" title="Remover" aria-label="Remover" onClick={() => onDelete(node)}><Trash2 size={15} /></Button>
              </>
            )}
            {!editable && (
              <Button variant="ghost" size="icon" className="h-8 w-8" title="Ver detalhes" aria-label="Ver detalhes" onClick={() => onEdit(node)}><Pencil size={15} /></Button>
            )}
          </div>
        </div>
      </div>
      {hasChildren && expanded && (
        <div>
          {node.children.map((c, idx) => (
            <Node
              key={c.id}
              node={c}
              depth={depth + 1}
              editable={editable}
              siblings={node.children}
              index={idx}
              collapsedIds={collapsedIds}
              onToggleExpand={onToggleExpand}
              formatDiretoria={formatDiretoria}
              formatArea={formatArea}
              onAdd={onAdd}
              onEdit={onEdit}
              onDelete={onDelete}
              onMove={onMove}
            />
          ))}
        </div>
      )}
    </div>
  )
}

function DocumentationProgressBar({ node }: { node: ProcessItem }) {
  const { pct, total, documented } = documentationStats(node)
  if (total === 0) return null
  return (
    <div title={`${documented} de ${total} sub processos documentados`}>
      <ProgressBar value={pct} />
    </div>
  )
}

function PortfolioDialog({ portfolio, onClose, onSaved }: { portfolio?: ProcessPortfolio; onClose: () => void; onSaved: (id: string) => void }) {
  const editing = !!portfolio
  const [name, setName] = useState(portfolio?.name ?? "")
  const [desc, setDesc] = useState(portfolio?.description ?? "")
  const [saving, setSaving] = useState(false)
  async function save() {
    if (!name.trim()) return
    setSaving(true)
    try {
      if (editing && portfolio) {
        const p = await produtosApi.updateProcessPortfolio(portfolio.id, { name: name.trim(), description: desc.trim() || null })
        onSaved(p.id)
      } else {
        const p = await produtosApi.createProcessPortfolio({ name: name.trim(), description: desc.trim() || undefined })
        onSaved(p.id)
      }
    } catch (e) { toast.error(detail(e)) } finally { setSaving(false) }
  }
  return (
    <Dialog open onOpenChange={(v) => { if (!v) onClose() }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader><DialogTitle>{editing ? "Editar portfólio" : "Novo portfólio de processos"}</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5"><Label>Nome</Label><Input value={name} onChange={(e) => setName(e.target.value)} autoFocus /></div>
          <div className="space-y-1.5"><Label>Descrição</Label><Textarea rows={2} value={desc} onChange={(e) => setDesc(e.target.value)} /></div>
        </div>
        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button onClick={() => void save()} disabled={saving || !name.trim()}>{saving && <Loader2 size={14} className="mr-1.5 animate-spin" />}{editing ? "Salvar" : "Criar"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function NewVersionDialog({ onClose, onConfirm }: { onClose: () => void; onConfirm: (justification: string) => void }) {
  const [justification, setJustification] = useState("")
  const [saving, setSaving] = useState(false)
  async function confirm() {
    if (justification.trim().length < 3) return
    setSaving(true)
    try { await onConfirm(justification.trim()) } finally { setSaving(false) }
  }
  return (
    <Dialog open onOpenChange={(v) => { if (!v) onClose() }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader><DialogTitle>Nova versão do portfólio</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">A versão consolidada vigente será copiada para um novo rascunho editável. Descreva o motivo da alteração.</p>
          <div className="space-y-1.5"><Label>Justificativa *</Label><Textarea rows={3} value={justification} onChange={(e) => setJustification(e.target.value)} autoFocus /></div>
        </div>
        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button onClick={() => void confirm()} disabled={saving || justification.trim().length < 3}>{saving && <Loader2 size={14} className="mr-1.5 animate-spin" />}Criar versão</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
