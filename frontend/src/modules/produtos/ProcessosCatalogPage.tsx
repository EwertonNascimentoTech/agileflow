import { useEffect, useState } from "react"
import { Loader2, Plus, Trash2, Workflow } from "lucide-react"

import { produtosApi, type ProcessoCatalog, type ProcessoNivel } from "@/api/produtos"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Skeleton } from "@/components/ui/skeleton"
import { EmptyState } from "@/components/EmptyState"
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { toast } from "@/lib/toast"

const NIVEL_LABEL: Record<ProcessoNivel, string> = { macroprocesso: "Macroprocesso", processo: "Processo", subprocesso: "Subprocesso" }
const DOT: Record<ProcessoNivel, string> = { macroprocesso: "#7C3AED", processo: "#2563EB", subprocesso: "#059669" }

export default function ProcessosCatalogPage() {
  const [tree, setTree] = useState<ProcessoCatalog[]>([])
  const [loading, setLoading] = useState(true)
  const [dialog, setDialog] = useState<{ nivel: ProcessoNivel; parent: string | null } | null>(null)

  async function reload() { setTree(await produtosApi.listProcessos().catch(() => [])) }
  useEffect(() => { produtosApi.listProcessos().catch(() => []).then(setTree).finally(() => setLoading(false)) }, [])

  async function del(node: ProcessoCatalog) {
    if (!confirm(`Inativar "${node.name}" e seus filhos?`)) return
    await produtosApi.deleteProcesso(node.id); void reload()
  }

  if (loading) return <Skeleton className="h-64 w-full" />

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold">Catálogo de Processos</h2>
          <p className="text-sm text-muted-foreground">Hierarquia global: Macroprocesso → Processo → Subprocesso. Produtos vinculam-se a subprocessos.</p>
        </div>
        <Button className="gap-1.5" onClick={() => setDialog({ nivel: "macroprocesso", parent: null })}><Plus size={15} /> Macroprocesso</Button>
      </div>

      {tree.length === 0 ? (
        <EmptyState icon={Workflow} title="Catálogo vazio" description="Comece criando um macroprocesso." />
      ) : (
        <div className="space-y-1">{tree.map((m) => <Node key={m.id} node={m} onAdd={(n, p) => setDialog({ nivel: n, parent: p })} onDelete={del} />)}</div>
      )}

      {dialog && <ProcessoDialog spec={dialog} onClose={() => setDialog(null)} onSaved={() => { setDialog(null); void reload() }} />}
    </div>
  )
}

function Node({ node, depth = 0, onAdd, onDelete }: {
  node: ProcessoCatalog; depth?: number; onAdd: (nivel: ProcessoNivel, parent: string) => void; onDelete: (n: ProcessoCatalog) => void
}) {
  const childNivel: ProcessoNivel | null = node.nivel === "macroprocesso" ? "processo" : node.nivel === "processo" ? "subprocesso" : null
  return (
    <div>
      <div className="flex items-center gap-2 rounded-md border p-2" style={{ marginLeft: depth * 20 }}>
        <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: DOT[node.nivel] }} />
        <div className="min-w-0 flex-1"><p className="truncate text-sm font-medium">{node.name}</p>{node.description && <p className="truncate text-[11px] text-muted-foreground">{node.description}</p>}</div>
        <Badge variant="outline" className="shrink-0 text-[9px] uppercase">{NIVEL_LABEL[node.nivel]}</Badge>
        {childNivel && <Button variant="ghost" size="icon" className="h-7 w-7" title={`Novo ${childNivel}`} onClick={() => onAdd(childNivel, node.id)}><Plus size={13} /></Button>}
        <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-destructive" onClick={() => onDelete(node)}><Trash2 size={13} /></Button>
      </div>
      {node.children.length > 0 && <div className="mt-1 space-y-1">{node.children.map((c) => <Node key={c.id} node={c} depth={depth + 1} onAdd={onAdd} onDelete={onDelete} />)}</div>}
    </div>
  )
}

function ProcessoDialog({ spec, onClose, onSaved }: { spec: { nivel: ProcessoNivel; parent: string | null }; onClose: () => void; onSaved: () => void }) {
  const [name, setName] = useState("")
  const [desc, setDesc] = useState("")
  const [saving, setSaving] = useState(false)
  async function save() {
    if (!name.trim()) return
    setSaving(true)
    try { await produtosApi.createProcesso({ name: name.trim(), description: desc.trim() || undefined, nivel: spec.nivel, parent_id: spec.parent }); onSaved() }
    catch (e) { toast.error((e as { response?: { data?: { detail?: string } } })?.response?.data?.detail || "Falha ao criar.") } finally { setSaving(false) }
  }
  return (
    <Dialog open onOpenChange={(v) => { if (!v) onClose() }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader><DialogTitle>Novo {NIVEL_LABEL[spec.nivel].toLowerCase()}</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5"><Label>Nome</Label><Input value={name} onChange={(e) => setName(e.target.value)} autoFocus /></div>
          <div className="space-y-1.5"><Label>Descrição</Label><Textarea rows={2} value={desc} onChange={(e) => setDesc(e.target.value)} /></div>
        </div>
        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button onClick={() => void save()} disabled={saving || !name.trim()}>{saving && <Loader2 size={14} className="mr-1.5 animate-spin" />}Criar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
