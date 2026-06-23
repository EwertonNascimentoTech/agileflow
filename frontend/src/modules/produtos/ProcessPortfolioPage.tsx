import { useCallback, useEffect, useMemo, useState } from "react"
import {
  ArrowDown,
  ArrowUp,
  ChevronDown,
  ChevronRight,
  ChevronsDownUp,
  ChevronsUpDown,
  GitCompare,
  Loader2,
  Lock,
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
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Skeleton } from "@/components/ui/skeleton"
import { EmptyState } from "@/components/EmptyState"
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { toast } from "@/lib/toast"
import { defaultSelectLabel } from "@/modules/projetos/defaultFormUtils"
import { useDefaultFormConfig } from "@/modules/projetos/useDefaultFormConfig"
import ProcessPortfolioItemDialog, { type ItemDialogSpec } from "./ProcessPortfolioItemDialog"
import ProcessPortfolioVersionDiffDialog from "./ProcessPortfolioVersionDiffDialog"
import { documentationStats, formatVigenciaRange } from "./processPortfolioDocUtils"

const NIVEL_LABEL: Record<ProcessNivel, string> = {
  diretoria: "Diretoria", macroprocesso: "Macro Processo", processo: "Processo", subprocesso: "Sub Processo",
}
const DOT: Record<ProcessNivel, string> = {
  diretoria: "#7C3AED", macroprocesso: "#2563EB", processo: "#059669", subprocesso: "#D97706",
}
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

  if (loading) return <Skeleton className="h-64 w-full" />

  if (portfolios.length === 0) {
    return (
      <>
        <EmptyState icon={Workflow} title="Nenhum portfólio de processos"
          description="Crie um portfólio para mapear a cascata Diretoria → Macro Processo → Processo → Sub Processo."
          action={{ label: "Criar portfólio", onClick: () => setNewPortfolio(true) }} />
        {newPortfolio && <PortfolioDialog onClose={() => setNewPortfolio(false)} onSaved={async (id) => { setNewPortfolio(false); await loadPortfolios(); setSelectedId(id) }} />}
      </>
    )
  }

  const editable = tree?.editable ?? false

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold">Portfólio de Processos</h2>
          <p className="text-sm text-muted-foreground">Cascata versionada: Diretoria → Macro Processo → Processo → Sub Processo.</p>
        </div>
        <Button variant="outline" className="gap-1.5" onClick={() => setNewPortfolio(true)}><Plus size={15} /> Novo portfólio</Button>
      </div>

      {/* Barra de controle: portfólio + versão + ações */}
      <div className="flex flex-wrap items-end gap-3 rounded-md border p-3">
        <div className="space-y-1.5">
          <Label className="text-xs">Portfólio</Label>
          <div className="flex items-center gap-1">
            <Select value={selectedId} onValueChange={setSelectedId}>
              <SelectTrigger className="w-56"><SelectValue /></SelectTrigger>
              <SelectContent>{portfolios.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}</SelectContent>
            </Select>
            {selected && (
              <>
                <Button variant="ghost" size="icon" className="h-9 w-9" title="Editar portfólio" onClick={() => setEditPortfolio(selected)}><Pencil size={14} /></Button>
                <Button variant="ghost" size="icon" className="h-9 w-9 text-muted-foreground hover:text-destructive" title="Excluir portfólio" onClick={() => void delPortfolio(selected)}><Trash2 size={14} /></Button>
              </>
            )}
          </div>
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">Versão</Label>
          <Select value={tree?.id ?? ""} onValueChange={(v) => void loadVersionsAndTree(selectedId, v)}>
            <SelectTrigger className="w-44"><SelectValue placeholder="—" /></SelectTrigger>
            <SelectContent>
              {versions.map((v) => (
                <SelectItem key={v.id} value={v.id}>
                  v{v.version} · {STATUS_LABEL[v.status] ?? v.status}{selected?.current_version_id === v.id ? " (vigente)" : ""}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex flex-1 flex-wrap items-center justify-end gap-2">
          {versions.length > 1 && (
            <Button variant="outline" size="sm" className="gap-1.5" onClick={() => setShowDiff(true)}><GitCompare size={14} /> Comparar versões</Button>
          )}
          {editable ? (
            <Button size="sm" className="gap-1.5" onClick={() => void consolidate()}><Lock size={14} /> Consolidar v{tree?.version}</Button>
          ) : (
            <Button size="sm" className="gap-1.5" onClick={() => setNewVersion(true)}><Plus size={14} /> Nova versão</Button>
          )}
        </div>
      </div>

      {tree && !editable && (
        <div className="flex items-center gap-2 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-800">
          <Lock size={14} /> Versão consolidada (somente leitura). Crie uma nova versão para editar.
        </div>
      )}
      {tree?.justification && (
        <p className="text-xs text-muted-foreground"><span className="font-medium">Justificativa da versão:</span> {tree.justification}</p>
      )}

      {loadingTree ? (
        <Skeleton className="h-48 w-full" />
      ) : tree ? (
        <div className="space-y-2">
          {editable && (
            <Button variant="outline" size="sm" className="gap-1.5"
              onClick={() => setItemDialog({ versionId: tree.id, nivel: ROOT_NIVEL, parentId: null })}>
              <Plus size={14} /> Macro Processo
            </Button>
          )}
          {tree.items.length === 0 ? (
            <EmptyState icon={Workflow} title="Versão vazia" description={editable ? "Adicione o primeiro macro processo." : "Esta versão não possui itens."} />
          ) : (
            <div className="space-y-2">
              <div className="flex flex-wrap items-center gap-2 rounded-md border bg-muted/30 px-3 py-2">
                <span className="text-xs font-medium text-muted-foreground">Níveis:</span>
                <Button variant="outline" size="sm" className="h-7 gap-1 text-xs" onClick={expandAllNodes}>
                  <ChevronsUpDown size={13} /> Expandir tudo
                </Button>
                <Button variant="outline" size="sm" className="h-7 gap-1 text-xs" onClick={collapseAllNodes}>
                  <ChevronsDownUp size={13} /> Recolher tudo
                </Button>
                <span className="hidden h-4 w-px bg-border sm:inline" />
                <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => collapseToDepth(0)}>
                  Somente macro
                </Button>
                <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => collapseToDepth(1)}>
                  Até processo
                </Button>
                <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={expandAllNodes}>
                  Todos os níveis
                </Button>
              </div>
              <div className="space-y-1">
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
            </div>
          )}
        </div>
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
  return (
    <div>
      <div className="flex items-center gap-2 rounded-md border p-2" style={{ marginLeft: depth * 20 }}>
        {hasChildren ? (
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6 shrink-0"
            title={expanded ? "Recolher" : "Expandir"}
            onClick={() => onToggleExpand(node.id)}
          >
            {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
          </Button>
        ) : (
          <span className="h-6 w-6 shrink-0" aria-hidden />
        )}
        <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: DOT[node.nivel] }} />
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 items-center gap-2">
            <p className="truncate text-sm font-medium">{node.name}</p>
            {node.nivel !== "subprocesso" && <DocumentationProgressBar node={node} />}
          </div>
          <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-muted-foreground">
            {node.diretoria && <span>Diretoria: {formatDiretoria(node.diretoria)}</span>}
            {formatArea(node) && <span>· Área: {formatArea(node)}</span>}
            {node.dono_nome && <span>· Dono: {node.dono_nome}</span>}
            {node.analista_nome && <span>· Analista: {node.analista_nome}</span>}
            {vigenciaLabel && <span>· Vigência: {vigenciaLabel}</span>}
          </div>
        </div>
        {node.nivel === "subprocesso" ? (
          <Badge variant={node.documentado ? "default" : "outline"} className="shrink-0 text-[9px]">
            {node.documentado ? "Documentado" : "Não doc."}
          </Badge>
        ) : null}
        <Badge variant="outline" className="shrink-0 text-[9px] uppercase">{NIVEL_LABEL[node.nivel]}</Badge>
        {editable && (
          <>
            <Button variant="ghost" size="icon" className="h-7 w-7" title="Mover para cima" disabled={index === 0} onClick={() => onMove(siblings, index, index - 1)}><ArrowUp size={13} /></Button>
            <Button variant="ghost" size="icon" className="h-7 w-7" title="Mover para baixo" disabled={index === siblings.length - 1} onClick={() => onMove(siblings, index, index + 1)}><ArrowDown size={13} /></Button>
          </>
        )}
        {editable && childNivel && (
          <Button variant="ghost" size="icon" className="h-7 w-7" title={`Novo ${NIVEL_LABEL[childNivel]}`} onClick={() => onAdd(childNivel, node.id)}><Plus size={13} /></Button>
        )}
        {editable && (
          <>
            <Button variant="ghost" size="icon" className="h-7 w-7" title="Editar" onClick={() => onEdit(node)}><Pencil size={13} /></Button>
            <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-destructive" title="Remover" onClick={() => onDelete(node)}><Trash2 size={13} /></Button>
          </>
        )}
        {!editable && (
          <Button variant="ghost" size="icon" className="h-7 w-7" title="Ver detalhes" onClick={() => onEdit(node)}><Pencil size={13} /></Button>
        )}
      </div>
      {hasChildren && expanded && (
        <div className="mt-1 space-y-1">
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
    <div
      className="flex shrink-0 items-center gap-1.5"
      title={`${documented} de ${total} sub processos documentados`}
    >
      <div className="h-1.5 w-16 overflow-hidden rounded-full bg-muted">
        <div
          className={`h-full rounded-full transition-all ${pct === 100 ? "bg-emerald-500" : "bg-primary"}`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="text-[10px] tabular-nums text-muted-foreground">{pct}%</span>
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
