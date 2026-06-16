import { useEffect, useState } from "react"
import { Building2, Loader2, Plus, Trash2 } from "lucide-react"

import { produtosApi, type Fornecedor } from "@/api/produtos"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Skeleton } from "@/components/ui/skeleton"
import { EmptyState } from "@/components/EmptyState"
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { toast } from "@/lib/toast"

export default function FornecedoresPage() {
  const [items, setItems] = useState<Fornecedor[]>([])
  const [loading, setLoading] = useState(true)
  const [open, setOpen] = useState(false)

  async function reload() { setItems(await produtosApi.listFornecedores().catch(() => [])) }
  useEffect(() => { produtosApi.listFornecedores().catch(() => []).then(setItems).finally(() => setLoading(false)) }, [])
  async function del(f: Fornecedor) { if (confirm(`Inativar "${f.nome}"?`)) { await produtosApi.deleteFornecedor(f.id); void reload() } }

  if (loading) return <Skeleton className="h-64 w-full" />
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div><h2 className="text-lg font-bold">Fornecedores</h2><p className="text-sm text-muted-foreground">Fornecedores de software para vincular a produtos e contratos.</p></div>
        <Button className="gap-1.5" onClick={() => setOpen(true)}><Plus size={15} /> Novo fornecedor</Button>
      </div>
      {items.length === 0 ? <EmptyState icon={Building2} title="Nenhum fornecedor" description="Cadastre fornecedores para usar em contratos." action={{ label: "Novo fornecedor", onClick: () => setOpen(true) }} /> : (
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((f) => (
            <Card key={f.id}><CardContent className="flex items-start justify-between gap-2 p-3">
              <div className="min-w-0"><p className="truncate text-sm font-semibold">{f.nome}</p>
                <p className="text-[11px] text-muted-foreground">{f.cnpj || "—"}{f.email ? ` · ${f.email}` : ""}</p></div>
              <Button variant="ghost" size="icon" className="text-muted-foreground hover:text-destructive" onClick={() => void del(f)}><Trash2 size={14} /></Button>
            </CardContent></Card>
          ))}
        </div>
      )}
      <FornecedorDialog open={open} onOpenChange={setOpen} onSaved={() => { setOpen(false); void reload() }} />
    </div>
  )
}

function FornecedorDialog({ open, onOpenChange, onSaved }: { open: boolean; onOpenChange: (v: boolean) => void; onSaved: () => void }) {
  const [nome, setNome] = useState("")
  const [cnpj, setCnpj] = useState("")
  const [email, setEmail] = useState("")
  const [contato, setContato] = useState("")
  const [telefone, setTelefone] = useState("")
  const [saving, setSaving] = useState(false)
  useEffect(() => { if (open) { setNome(""); setCnpj(""); setEmail(""); setContato(""); setTelefone("") } }, [open])
  async function save() {
    if (!nome.trim()) return
    setSaving(true)
    try { await produtosApi.createFornecedor({ nome: nome.trim(), cnpj: cnpj.trim() || undefined, email: email.trim() || undefined, contato: contato.trim() || undefined, telefone: telefone.trim() || undefined }); toast.success("Fornecedor criado."); onSaved() }
    catch { toast.error("Falha ao salvar.") } finally { setSaving(false) }
  }
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader><DialogTitle>Novo fornecedor</DialogTitle></DialogHeader>
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
          <Button onClick={() => void save()} disabled={saving || !nome.trim()}>{saving && <Loader2 size={14} className="mr-1.5 animate-spin" />}Criar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
