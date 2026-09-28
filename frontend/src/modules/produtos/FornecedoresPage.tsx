import { useEffect, useState } from "react"
import { Building2, Loader2, Mail, Pencil, Phone, Plus, Trash2, UserRound } from "lucide-react"

import { produtosApi, type Fornecedor } from "@/api/produtos"
import { Button } from "@/components/ui/button"
import { Card, IconTile, PageHeader } from "@/components/ds"
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

  if (loading) {
    return (
      <div className="space-y-5">
        <Skeleton className="h-16 w-2/3 rounded-xl" />
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }, (_, i) => <Skeleton key={i} className="h-36 rounded-2xl" />)}
        </div>
      </div>
    )
  }
  return (
    <div className="space-y-5">
      <PageHeader
        icon={Building2}
        color="#7C3AED"
        title="Fornecedores"
        description="Fornecedores de software para vincular a produtos e contratos."
        actions={<Button className="h-10 gap-1.5" onClick={openNew}><Plus size={16} /> Novo fornecedor</Button>}
      />
      {items.length === 0 ? (
        <Card>
          <EmptyState icon={Building2} title="Nenhum fornecedor" description="Cadastre fornecedores para usar em contratos." action={{ label: "Novo fornecedor", onClick: openNew }} />
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((f) => (
            <Card key={f.id} className="p-5">
              <div className="flex items-start gap-3">
                <IconTile icon="Building2" color="#7C3AED" size={40} />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold" title={f.nome}>{f.nome}</p>
                  <p className="text-sm text-muted-foreground">CNPJ <span className="tabular-nums">{f.cnpj || "—"}</span></p>
                </div>
                <div className="-mr-2 -mt-1 flex shrink-0 items-center gap-0.5">
                  <Button variant="ghost" size="icon" className="h-8 w-8" title="Editar fornecedor" onClick={() => openEdit(f)}>
                    <Pencil size={15} />
                  </Button>
                  <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-destructive" title="Inativar fornecedor" onClick={() => void del(f)}>
                    <Trash2 size={15} />
                  </Button>
                </div>
              </div>
              {(f.contato || f.email || f.telefone) && (
                <div className="mt-4 space-y-1.5 border-t pt-3 text-sm text-muted-foreground">
                  {f.contato && (
                    <p className="flex items-center gap-2" title="Contato">
                      <UserRound size={14} className="shrink-0" /> <span className="truncate">Contato: {f.contato}</span>
                    </p>
                  )}
                  {f.email && (
                    <p className="flex items-center gap-2" title="E-mail">
                      <Mail size={14} className="shrink-0" /> <span className="truncate">{f.email}</span>
                    </p>
                  )}
                  {f.telefone && (
                    <p className="flex items-center gap-2" title="Telefone">
                      <Phone size={14} className="shrink-0" /> <span className="truncate tabular-nums">{f.telefone}</span>
                    </p>
                  )}
                </div>
              )}
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
