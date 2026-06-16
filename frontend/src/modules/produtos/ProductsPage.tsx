import { useEffect, useState } from "react"
import { useNavigate } from "react-router-dom"
import { AlertTriangle, Boxes, Loader2, Plus, Sparkles } from "lucide-react"

import { produtosApi, type FinalizedProject, type ProductListItem } from "@/api/produtos"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Skeleton } from "@/components/ui/skeleton"
import { EmptyState } from "@/components/EmptyState"
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { toast } from "@/lib/toast"
import { ProductFormDialog } from "@/modules/produtos/ProductFormDialog"
import { CRITICIDADE_COLOR, CRITICIDADE_LABEL, LIFECYCLE_LABEL, ORIGEM_LABEL } from "@/modules/produtos/constants"

function fmtDate(iso: string | null) { return iso ? new Date(iso).toLocaleDateString("pt-BR") : "—" }

export default function ProductsPage() {
  const navigate = useNavigate()
  const [products, setProducts] = useState<ProductListItem[]>([])
  const [loading, setLoading] = useState(true)
  const [openNew, setOpenNew] = useState(false)
  const [openFromProject, setOpenFromProject] = useState(false)

  async function reload() { setProducts(await produtosApi.listProducts().catch(() => [])) }
  useEffect(() => { produtosApi.listProducts().catch(() => []).then(setProducts).finally(() => setLoading(false)) }, [])

  if (loading) return <Skeleton className="h-64 w-full" />

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-lg font-bold">Produtos</h2>
          <p className="text-sm text-muted-foreground">Catálogo de produtos do portfólio.</p>
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
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {products.map((p) => (
            <Card key={p.id} className="cursor-pointer transition hover:shadow-md" onClick={() => navigate(`/app/modules/produtos/produtos/${p.id}`)}>
              <CardContent className="space-y-2 p-4">
                <div className="flex items-start justify-between gap-2">
                  <p className="font-semibold leading-tight">{p.simbolo ? `${p.simbolo} ` : ""}{p.name}</p>
                  <Badge variant="secondary" className="shrink-0 text-[10px]" style={{ backgroundColor: `${CRITICIDADE_COLOR[p.criticidade]}22`, color: CRITICIDADE_COLOR[p.criticidade] }}>{CRITICIDADE_LABEL[p.criticidade]}</Badge>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  <Badge variant="outline" className="text-[10px]">{ORIGEM_LABEL[p.origem]}</Badge>
                  <Badge variant="outline" className="text-[10px]">{LIFECYCLE_LABEL[p.lifecycle]}</Badge>
                  {p.requires_contract && !p.has_active_contract && <Badge variant="destructive" className="text-[10px]"><AlertTriangle size={10} className="mr-0.5" /> sem contrato</Badge>}
                </div>
                <div className="text-[11px] text-muted-foreground">
                  {p.setor_name && <span>{p.setor_name} › </span>}{p.area_name ?? "Sem área"}
                  {p.responsavel_nome && <span> · {p.responsavel_nome}</span>}
                </div>
                <p className="text-[10px] text-muted-foreground">Criado em {fmtDate(p.created_at)}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <ProductFormDialog open={openNew} onOpenChange={setOpenNew} onSaved={(p) => { setOpenNew(false); navigate(`/app/modules/produtos/produtos/${p.id}`) }} />
      <FromProjectDialog open={openFromProject} onOpenChange={setOpenFromProject} onCreated={(id) => { setOpenFromProject(false); void reload(); navigate(`/app/modules/produtos/produtos/${id}`) }} />
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
