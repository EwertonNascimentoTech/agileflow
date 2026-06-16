import { useEffect, useMemo, useState } from "react"
import { Loader2 } from "lucide-react"

import { produtosApi, type AreaRefMini, type Fornecedor, type PersonMini, type Product, type ProductCriticidade, type ProductLifecycle, type ProductOrigem } from "@/api/produtos"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { toast } from "@/lib/toast"
import { CRITICIDADE_LABEL, CRITICIDADE_OPTS, LIFECYCLE_LABEL, LIFECYCLE_OPTS, ORIGEM_LABEL, ORIGEM_OPTS } from "@/modules/produtos/constants"

const NONE = "__none__"

export function ProductFormDialog({ open, onOpenChange, product, onSaved }: {
  open: boolean; onOpenChange: (v: boolean) => void; product?: Product | null; onSaved: (p: Product) => void
}) {
  const editing = !!product
  const [areas, setAreas] = useState<AreaRefMini[]>([])
  const [persons, setPersons] = useState<PersonMini[]>([])
  const [fornecedores, setFornecedores] = useState<Fornecedor[]>([])
  const [name, setName] = useState("")
  const [simbolo, setSimbolo] = useState("")
  const [description, setDescription] = useState("")
  const [dominio, setDominio] = useState("")
  const [origem, setOrigem] = useState<ProductOrigem>("interno")
  const [lifecycle, setLifecycle] = useState<ProductLifecycle>("desenvolvimento")
  const [criticidade, setCriticidade] = useState<ProductCriticidade>("media")
  const [dataProd, setDataProd] = useState("")
  const [areaId, setAreaId] = useState(NONE)
  const [responsavelId, setResponsavelId] = useState(NONE)
  const [fornecedorId, setFornecedorId] = useState(NONE)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!open) return
    Promise.all([produtosApi.listAreas().catch(() => []), produtosApi.listPersons().catch(() => []), produtosApi.listFornecedores().catch(() => [])])
      .then(([a, p, f]) => { setAreas(a); setPersons(p); setFornecedores(f) })
    setName(product?.name ?? "")
    setSimbolo(product?.simbolo ?? "")
    setDescription(product?.description ?? "")
    setDominio(product?.dominio_funcional ?? "")
    setOrigem(product?.origem ?? "interno")
    setLifecycle(product?.lifecycle ?? "desenvolvimento")
    setCriticidade(product?.criticidade ?? "media")
    setDataProd(product?.data_entrada_producao ?? "")
    setAreaId(product?.area?.id ?? NONE)
    setResponsavelId(product?.responsavel?.id ?? NONE)
    setFornecedorId(product?.fornecedor?.id ?? NONE)
  }, [open, product])

  const setorName = useMemo(() => areas.find((a) => a.id === areaId)?.setor_name ?? null, [areas, areaId])

  async function save() {
    if (!name.trim()) return
    setSaving(true)
    const payload = {
      name: name.trim(), simbolo: simbolo.trim() || undefined, description: description.trim() || undefined,
      dominio_funcional: dominio.trim() || undefined, origem, lifecycle, criticidade,
      data_entrada_producao: dataProd || undefined,
      area_id: areaId === NONE ? undefined : areaId,
      responsavel_person_id: responsavelId === NONE ? undefined : responsavelId,
      fornecedor_id: fornecedorId === NONE ? undefined : fornecedorId,
    }
    try {
      const p = editing
        ? await produtosApi.updateProduct(product!.id, { ...payload, area_id: areaId === NONE ? null : areaId, responsavel_person_id: responsavelId === NONE ? null : responsavelId, fornecedor_id: fornecedorId === NONE ? null : fornecedorId })
        : await produtosApi.createProduct(payload)
      toast.success(editing ? "Produto atualizado." : "Produto criado.")
      onSaved(p)
    } catch { toast.error("Não foi possível salvar.") } finally { setSaving(false) }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle>{editing ? "Editar produto" : "Novo produto"}</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-[80px_1fr]">
            <div className="space-y-1.5"><Label>Símbolo</Label><Input value={simbolo} onChange={(e) => setSimbolo(e.target.value)} placeholder="🔧" /></div>
            <div className="space-y-1.5"><Label>Nome</Label><Input value={name} onChange={(e) => setName(e.target.value)} autoFocus /></div>
          </div>
          <div className="space-y-1.5"><Label>Descrição</Label><Textarea rows={2} value={description} onChange={(e) => setDescription(e.target.value)} /></div>
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="space-y-1.5"><Label>Domínio funcional</Label><Input value={dominio} onChange={(e) => setDominio(e.target.value)} /></div>
            <div className="space-y-1.5">
              <Label>Origem</Label>
              <Select value={origem} onValueChange={(v) => setOrigem(v as ProductOrigem)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{ORIGEM_OPTS.map((o) => <SelectItem key={o} value={o}>{ORIGEM_LABEL[o]}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Ciclo de vida</Label>
              <Select value={lifecycle} onValueChange={(v) => setLifecycle(v as ProductLifecycle)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{LIFECYCLE_OPTS.map((o) => <SelectItem key={o} value={o}>{LIFECYCLE_LABEL[o]}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="space-y-1.5">
              <Label>Criticidade</Label>
              <Select value={criticidade} onValueChange={(v) => setCriticidade(v as ProductCriticidade)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{CRITICIDADE_OPTS.map((o) => <SelectItem key={o} value={o}>{CRITICIDADE_LABEL[o]}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5"><Label>Entrada em produção</Label><Input type="date" value={dataProd} onChange={(e) => setDataProd(e.target.value)} /></div>
            <div className="space-y-1.5">
              <Label>Responsável</Label>
              <Select value={responsavelId} onValueChange={setResponsavelId}>
                <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>—</SelectItem>
                  {persons.map((p) => <SelectItem key={p.id} value={p.id}>{p.full_name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Área {setorName && <span className="text-[11px] text-muted-foreground">· Setor: {setorName}</span>}</Label>
              <Select value={areaId} onValueChange={setAreaId}>
                <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>—</SelectItem>
                  {areas.map((a) => <SelectItem key={a.id} value={a.id}>{a.setor_name ? `${a.setor_name} › ` : ""}{a.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Fornecedor</Label>
              <Select value={fornecedorId} onValueChange={setFornecedorId}>
                <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>—</SelectItem>
                  {fornecedores.map((f) => <SelectItem key={f.id} value={f.id}>{f.nome}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          {(origem !== "interno" || fornecedorId !== NONE) && (
            <p className="text-[11px] text-amber-600">Produto de fornecedor: exige ao menos um contrato ativo (cadastre na aba Contratos do produto).</p>
          )}
        </div>
        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={() => void save()} disabled={saving || !name.trim()}>{saving && <Loader2 size={14} className="mr-1.5 animate-spin" />}{editing ? "Salvar" : "Criar"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
