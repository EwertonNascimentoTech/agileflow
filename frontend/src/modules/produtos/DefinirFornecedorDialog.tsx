import { useEffect, useState } from "react"
import { Building2, Loader2, Plus } from "lucide-react"

import { produtosApi, type Fornecedor } from "@/api/produtos"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { toast } from "@/lib/toast"

const NONE = "__none__"

export function DefinirFornecedorDialog({
  open,
  onOpenChange,
  productId,
  productName,
  fornecedorAtualId,
  onSaved,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
  productId: string
  productName: string
  fornecedorAtualId?: string | null
  onSaved: () => void
}) {
  const [fornecedores, setFornecedores] = useState<Fornecedor[]>([])
  const [fornecedorId, setFornecedorId] = useState(NONE)
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [criando, setCriando] = useState(false)
  const [novoNome, setNovoNome] = useState("")
  const [novoCnpj, setNovoCnpj] = useState("")

  useEffect(() => {
    if (!open) return
    setFornecedorId(fornecedorAtualId ?? NONE)
    setCriando(false)
    setNovoNome("")
    setNovoCnpj("")
    setLoading(true)
    produtosApi.listFornecedores()
      .then(setFornecedores)
      .catch(() => setFornecedores([]))
      .finally(() => setLoading(false))
  }, [open, fornecedorAtualId])

  async function criarEUsar() {
    if (!novoNome.trim()) return
    setSaving(true)
    try {
      const f = await produtosApi.createFornecedor({
        nome: novoNome.trim(),
        cnpj: novoCnpj.trim() || undefined,
      })
      setFornecedores((prev) => [...prev, f].sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR")))
      setFornecedorId(f.id)
      setCriando(false)
      setNovoNome("")
      setNovoCnpj("")
      toast.success("Fornecedor criado.")
    } catch {
      toast.error("Falha ao criar fornecedor.")
    } finally {
      setSaving(false)
    }
  }

  async function salvar() {
    setSaving(true)
    try {
      await produtosApi.definirFornecedor(productId, fornecedorId === NONE ? null : fornecedorId)
      toast.success(fornecedorId === NONE ? "Fornecedor removido do produto." : "Fornecedor definido.")
      onSaved()
      onOpenChange(false)
    } catch {
      toast.error("Não foi possível salvar.")
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Building2 size={18} /> Definir fornecedor
          </DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">
          Produto: <strong>{productName}</strong>
        </p>
        {loading ? (
          <div className="flex justify-center py-6"><Loader2 size={20} className="animate-spin text-muted-foreground" /></div>
        ) : criando ? (
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>Nome do fornecedor *</Label>
              <Input value={novoNome} onChange={(e) => setNovoNome(e.target.value)} autoFocus />
            </div>
            <div className="space-y-1.5">
              <Label>CNPJ</Label>
              <Input value={novoCnpj} onChange={(e) => setNovoCnpj(e.target.value)} />
            </div>
            <Button type="button" variant="ghost" size="sm" className="px-0" onClick={() => setCriando(false)}>
              ← Voltar à lista
            </Button>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>Fornecedor</Label>
              <Select value={fornecedorId} onValueChange={setFornecedorId}>
                <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>— Nenhum —</SelectItem>
                  {fornecedores.map((f) => (
                    <SelectItem key={f.id} value={f.id}>{f.nome}{f.cnpj ? ` · ${f.cnpj}` : ""}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button type="button" variant="outline" size="sm" className="gap-1.5" onClick={() => setCriando(true)}>
              <Plus size={14} /> Cadastrar novo fornecedor
            </Button>
          </div>
        )}
        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          {criando ? (
            <Button onClick={() => void criarEUsar()} disabled={saving || !novoNome.trim()}>
              {saving && <Loader2 size={14} className="mr-1.5 animate-spin" />}Criar e selecionar
            </Button>
          ) : (
            <Button onClick={() => void salvar()} disabled={saving || loading}>
              {saving && <Loader2 size={14} className="mr-1.5 animate-spin" />}Salvar
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
