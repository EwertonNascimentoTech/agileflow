import { useEffect, useState } from "react"
import { Building2, Loader2, Pencil, Plus, Trash2 } from "lucide-react"

import { produtosApi, type Fornecedor } from "@/api/produtos"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Skeleton } from "@/components/ui/skeleton"
import { EmptyState } from "@/components/EmptyState"
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { toast } from "@/lib/toast"
import { optStrForSave } from "@/lib/utils"

export default function FornecedoresPage() {
  const [items, setItems] = useState<Fornecedor[]>([])
  const [loading, setLoading] = useState(true)
  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState<Fornecedor | null>(null)

  async function reload() { setItems(await produtosApi.listFornecedores().catch(() => [])) }
  useEffect(() => { produtosApi.listFornecedores().catch(() => []).then(setItems).finally(() => setLoading(false)) }, [])

  function openNew() { setEditing(null); setOpen(true) }
  function openEdit(f: Fornecedor) { setEditing(f); setOpen(true) }

  async function del(f: Fornecedor) {
    if (!confirm(`Inativar "${f.nome}"?`)) return
    await produtosApi.deleteFornecedor(f.id)
    toast.info("Fornecedor inativado.")
    void reload()
  }

  if (loading) return <Skeleton className="h-64 w-full" />
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div><h2 className="text-lg font-bold">Fornecedores</h2><p className="text-sm text-muted-foreground">Fornecedores de software para vincular a produtos e contratos.</p></div>
        <Button className="gap-1.5" onClick={openNew}><Plus size={15} /> Novo fornecedor</Button>
      </div>
      {items.length === 0 ? (
        <EmptyState icon={Building2} title="Nenhum fornecedor" description="Cadastre fornecedores para usar em contratos." action={{ label: "Novo fornecedor", onClick: openNew }} />
      ) : (
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((f) => (
            <Card key={f.id}>
              <CardContent className="flex items-start justify-between gap-2 p-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold">{f.nome}</p>
                  <p className="text-[11px] text-muted-foreground">
                    {f.cnpj || "—"}
                    {f.email ? ` · ${f.email}` : ""}
                    {f.telefone ? ` · ${f.telefone}` : ""}
                  </p>
                  {f.contato && <p className="text-[11px] text-muted-foreground">Contato: {f.contato}</p>}
                </div>
                <div className="flex shrink-0 items-center gap-0.5">
                  <Button variant="ghost" size="icon" title="Editar fornecedor" onClick={() => openEdit(f)}>
                    <Pencil size={14} />
                  </Button>
                  <Button variant="ghost" size="icon" className="text-muted-foreground hover:text-destructive" title="Inativar fornecedor" onClick={() => void del(f)}>
                    <Trash2 size={14} />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
      <FornecedorDialog
        open={open}
        onOpenChange={(v) => { setOpen(v); if (!v) setEditing(null) }}
        fornecedor={editing}
        onSaved={() => { setOpen(false); setEditing(null); void reload() }}
      />
    </div>
  )
}

function FornecedorDialog({
  open,
  onOpenChange,
  fornecedor,
  onSaved,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
  fornecedor?: Fornecedor | null
  onSaved: () => void
}) {
  const editing = !!fornecedor
  const [nome, setNome] = useState("")
  const [cnpj, setCnpj] = useState("")
  const [email, setEmail] = useState("")
  const [contato, setContato] = useState("")
  const [telefone, setTelefone] = useState("")
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!open) return
    setNome(fornecedor?.nome ?? "")
    setCnpj(fornecedor?.cnpj ?? "")
    setEmail(fornecedor?.email ?? "")
    setContato(fornecedor?.contato ?? "")
    setTelefone(fornecedor?.telefone ?? "")
  }, [open, fornecedor])

  async function save() {
    if (!nome.trim()) return
    setSaving(true)
    const payload = {
      nome: nome.trim(),
      cnpj: optStrForSave(cnpj, editing),
      email: optStrForSave(email, editing),
      contato: optStrForSave(contato, editing),
      telefone: optStrForSave(telefone, editing),
    }
    try {
      if (editing && fornecedor) {
        await produtosApi.updateFornecedor(fornecedor.id, payload)
        toast.success("Fornecedor atualizado.")
      } else {
        await produtosApi.createFornecedor(payload)
        toast.success("Fornecedor criado.")
      }
      onSaved()
    } catch {
      toast.error("Falha ao salvar.")
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader><DialogTitle>{editing ? "Editar fornecedor" : "Novo fornecedor"}</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5"><Label>Nome</Label><Input value={nome} onChange={(e) => setNome(e.target.value)} autoFocus /></div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5"><Label>CNPJ</Label><Input value={cnpj} onChange={(e) => setCnpj(e.target.value)} /></div>
            <div className="space-y-1.5"><Label>Telefone</Label><Input value={telefone} onChange={(e) => setTelefone(e.target.value)} /></div>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5"><Label>Contato</Label><Input value={contato} onChange={(e) => setContato(e.target.value)} /></div>
            <div className="space-y-1.5"><Label>E-mail</Label><Input value={email} onChange={(e) => setEmail(e.target.value)} /></div>
          </div>
        </div>
        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={() => void save()} disabled={saving || !nome.trim()}>
            {saving && <Loader2 size={14} className="mr-1.5 animate-spin" />}
            {editing ? "Salvar" : "Criar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
