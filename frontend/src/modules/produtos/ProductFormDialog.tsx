import { useEffect, useState } from "react"
import { Loader2, Plus, Trash2 } from "lucide-react"

import {
  produtosApi, type PersonMini, type Product, type ProductCategoria,
  type ProductCriticidade, type ProductLifecycle, type ProductModeloContratacao, type ProductOrigem,
  type ProductStatus, type StackMini,
} from "@/api/produtos"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { toast } from "@/lib/toast"
import {
  CATEGORIA_LABEL, CATEGORIA_OPTS, LIFECYCLE_LABEL, LIFECYCLE_OPTS,
} from "@/modules/produtos/constants"

const NONE = "__none__"
const EMPTY_EXTRA = {
  sigla: "", link_descricao: "", publico_alvo: "", url_acesso: "", observacoes: "",
  desenvolvido_por: "", fornecedor_cnpj: "", ambiente_tecnologico: "", tecnologias: "",
  link_repositorio: "", link_dev: "", link_hml: "", link_prd: "",
}
type ExtraKey = keyof typeof EMPTY_EXTRA
export function ProductFormDialog({ open, onOpenChange, product, onSaved }: {
  open: boolean; onOpenChange: (v: boolean) => void; product?: Product | null; onSaved: (p: Product) => void
}) {
  const editing = !!product
  const [pos, setPos] = useState<PersonMini[]>([])
  const [techRefs, setTechRefs] = useState<PersonMini[]>([])
  const [stackCatalog, setStackCatalog] = useState<StackMini[]>([])
  const [stackIds, setStackIds] = useState<string[]>([])
  const [stackPick, setStackPick] = useState(NONE)
  const [name, setName] = useState("")
  const [description, setDescription] = useState("")
  const [dominio, setDominio] = useState("")
  const [origem, setOrigem] = useState<ProductOrigem>("interno")
  const [lifecycle, setLifecycle] = useState<ProductLifecycle>("desenvolvimento")
  const [criticidade, setCriticidade] = useState<ProductCriticidade>("media")
  const [dataProd, setDataProd] = useState("")
  const [responsavelId, setResponsavelId] = useState(NONE)
  const [responsavelTecnicoId, setResponsavelTecnicoId] = useState(NONE)
  const [fornecedorId, setFornecedorId] = useState(NONE)
  // campos novos
  const [categoria, setCategoria] = useState(NONE)
  const [status, setStatus] = useState(NONE)
  const [modeloContrat, setModeloContrat] = useState(NONE)
  const [loginIdigital, setLoginIdigital] = useState(false)
  const [corporativo, setCorporativo] = useState(false)
  const [extra, setExtra] = useState({ ...EMPTY_EXTRA })
  const [saving, setSaving] = useState(false)
  const upd = (k: ExtraKey) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setExtra((s) => ({ ...s, [k]: e.target.value }))

  useEffect(() => {
    if (!open) return
    Promise.all([
      produtosApi.listPos().catch(() => []),
      produtosApi.listTechReferences().catch(() => []),
      produtosApi.listStacks().catch(() => []),
    ]).then(([po, tr, st]) => { setPos(po); setTechRefs(tr); setStackCatalog(st) })
    setName(product?.name ?? "")
    setDescription(product?.description ?? "")
    setDominio(product?.dominio_funcional ?? "")
    setOrigem(product?.origem ?? "interno")
    setLifecycle(product?.lifecycle ?? "desenvolvimento")
    setCriticidade(product?.criticidade ?? "media")
    setDataProd(product?.data_entrada_producao ?? "")
    setResponsavelId(product?.responsavel?.id ?? NONE)
    setResponsavelTecnicoId(product?.responsavel_tecnico?.id ?? NONE)
    setStackIds((product?.stacks ?? []).map((s) => s.id))
    setFornecedorId(product?.fornecedor?.id ?? NONE)
    setCategoria(product?.categoria ?? NONE)
    setStatus(product?.status_produto ?? NONE)
    setModeloContrat(product?.modelo_contratacao ?? NONE)
    setLoginIdigital(product?.login_idigital ?? false)
    setCorporativo(product?.corporativo ?? false)
    setExtra({
      sigla: product?.sigla ?? "", link_descricao: product?.link_descricao ?? "", publico_alvo: product?.publico_alvo ?? "",
      url_acesso: product?.url_acesso ?? "", observacoes: product?.observacoes ?? "", desenvolvido_por: product?.desenvolvido_por ?? "",
      fornecedor_cnpj: product?.fornecedor_cnpj ?? "", ambiente_tecnologico: product?.ambiente_tecnologico ?? "",
      tecnologias: product?.tecnologias ?? "", link_repositorio: product?.link_repositorio ?? "", link_dev: product?.link_dev ?? "",
      link_hml: product?.link_hml ?? "", link_prd: product?.link_prd ?? "",
    })
  }, [open, product])

  async function save() {
    if (!name.trim()) return
    setSaving(true)
    const t = (s: string) => s.trim() || undefined
    const sel = (v: string) => (v === NONE ? undefined : v)
    const digital = {
      sigla: t(extra.sigla), link_descricao: t(extra.link_descricao), publico_alvo: t(extra.publico_alvo),
      url_acesso: t(extra.url_acesso), observacoes: t(extra.observacoes), desenvolvido_por: t(extra.desenvolvido_por),
      fornecedor_cnpj: t(extra.fornecedor_cnpj), ambiente_tecnologico: t(extra.ambiente_tecnologico),
      tecnologias: t(extra.tecnologias), link_repositorio: t(extra.link_repositorio), link_dev: t(extra.link_dev),
      link_hml: t(extra.link_hml), link_prd: t(extra.link_prd),
      categoria: sel(categoria) as ProductCategoria | undefined,
      status_produto: sel(status) as ProductStatus | undefined,
      modelo_contratacao: sel(modeloContrat) as ProductModeloContratacao | undefined,
      login_idigital: loginIdigital,
      corporativo,
    }
    // Produto corporativo: o PO é definido por serviço, não no produto.
    const responsavelSel = corporativo ? NONE : responsavelId
    const payload = {
      name: name.trim(), description: description.trim() || undefined,
      dominio_funcional: dominio.trim() || undefined, origem, lifecycle, criticidade,
      data_entrada_producao: dataProd || undefined,
      responsavel_person_id: responsavelSel === NONE ? undefined : responsavelSel,
      responsavel_tecnico_person_id: responsavelTecnicoId === NONE ? undefined : responsavelTecnicoId,
      stack_ids: stackIds,
      fornecedor_id: fornecedorId === NONE ? undefined : fornecedorId,
      ...digital,
    }
    try {
      const p = editing
        ? await produtosApi.updateProduct(product!.id, {
            ...payload, responsavel_person_id: responsavelSel === NONE ? null : responsavelSel,
            responsavel_tecnico_person_id: responsavelTecnicoId === NONE ? null : responsavelTecnicoId,
            fornecedor_id: fornecedorId === NONE ? null : fornecedorId,
          })
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
          <div className="space-y-1.5"><Label>Nome</Label><Input value={name} onChange={(e) => setName(e.target.value)} autoFocus /></div>
          <div className="space-y-1.5"><Label>Descrição</Label><Textarea rows={2} value={description} onChange={(e) => setDescription(e.target.value)} /></div>
          <div className="grid gap-3 sm:grid-cols-3">
            <OptSelect label="Categoria" value={categoria} onChange={setCategoria} options={CATEGORIA_OPTS.map((o) => [o, CATEGORIA_LABEL[o]])} />
            <div className="space-y-1.5">
              <Label>Ciclo de vida</Label>
              <Select value={lifecycle} onValueChange={(v) => setLifecycle(v as ProductLifecycle)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{LIFECYCLE_OPTS.map((o) => <SelectItem key={o} value={o}>{LIFECYCLE_LABEL[o]}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          </div>
          <div className="rounded-md border border-dashed p-3">
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={corporativo} onChange={(e) => setCorporativo(e.target.checked)}
                className="h-4 w-4 rounded border-input accent-primary" />
              <span>Produto <strong>corporativo</strong></span>
            </label>
            <p className="mt-1 text-[11px] text-muted-foreground">
              Em produtos corporativos o Responsável (PO) não é do produto — é definido por serviço (na aba Serviços).
            </p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            {!corporativo && (
              <div className="space-y-1.5">
                <Label>Responsável (PO)</Label>
                <Select value={responsavelId} onValueChange={setResponsavelId}>
                  <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NONE}>—</SelectItem>
                    {pos.map((p) => <SelectItem key={p.id} value={p.id}>{p.full_name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            )}
            <div className="space-y-1.5">
              <Label>Responsável técnico</Label>
              <Select value={responsavelTecnicoId} onValueChange={setResponsavelTecnicoId}>
                <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>—</SelectItem>
                  {techRefs.map((p) => <SelectItem key={p.id} value={p.id}>{p.full_name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Stacks</Label>
            <div className="flex items-end gap-2">
              <div className="flex-1">
                <Select value={stackPick} onValueChange={setStackPick}>
                  <SelectTrigger><SelectValue placeholder="Selecione uma stack..." /></SelectTrigger>
                  <SelectContent>
                    {stackCatalog.filter((s) => !stackIds.includes(s.id)).length === 0 ? (
                      <div className="px-2 py-1.5 text-xs text-muted-foreground">Nenhuma stack disponível</div>
                    ) : (
                      stackCatalog.filter((s) => !stackIds.includes(s.id)).map((s) => (
                        <SelectItem key={s.id} value={s.id}>{s.category ? `${s.category} › ` : ""}{s.name}</SelectItem>
                      ))
                    )}
                  </SelectContent>
                </Select>
              </div>
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  if (stackPick === NONE) return
                  setStackIds((prev) => prev.includes(stackPick) ? prev : [...prev, stackPick])
                  setStackPick(NONE)
                }}
                disabled={stackPick === NONE}
              >
                <Plus size={15} className="mr-1" /> Adicionar
              </Button>
            </div>
            {stackIds.length > 0 && (
              <div className="overflow-hidden rounded-md border">
                <table className="w-full text-sm">
                  <thead className="bg-muted/50 text-left text-[11px] uppercase tracking-wide text-muted-foreground">
                    <tr>
                      <th className="px-3 py-1.5 font-semibold">Stack</th>
                      <th className="px-3 py-1.5 font-semibold">Categoria</th>
                      <th className="w-10 px-3 py-1.5"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {stackIds.map((id) => {
                      const s = stackCatalog.find((x) => x.id === id)
                      return (
                        <tr key={id} className="border-t">
                          <td className="px-3 py-1.5 font-medium">{s?.name ?? "—"}</td>
                          <td className="px-3 py-1.5 text-muted-foreground">{s?.category ?? "—"}</td>
                          <td className="px-3 py-1.5 text-right">
                            <button
                              type="button"
                              onClick={() => setStackIds((prev) => prev.filter((x) => x !== id))}
                              className="text-muted-foreground transition hover:text-destructive"
                              aria-label="Remover stack"
                            >
                              <Trash2 size={14} />
                            </button>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* ── Acesso ── */}
          <div className="border-t pt-3">
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={loginIdigital} onChange={(e) => setLoginIdigital(e.target.checked)}
                className="h-4 w-4 rounded border-input accent-primary" />
              <span>Login com <strong>Idigital</strong></span>
            </label>
            <p className="mt-1 text-[11px] text-muted-foreground">Marque se o acesso ao produto é autenticado pelo provedor de identidade Idigital.</p>
          </div>

          {/* ── Repositório e ambientes ── */}
          <div className="border-t pt-3">
            <p className="mb-2 text-[11px] font-bold uppercase tracking-wide text-muted-foreground">Repositório e ambientes</p>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5"><Label>Link do repositório</Label><Input value={extra.link_repositorio} onChange={upd("link_repositorio")} placeholder="https://" /></div>
              <div className="space-y-1.5"><Label>Ambiente DEV</Label><Input value={extra.link_dev} onChange={upd("link_dev")} placeholder="https://" /></div>
              <div className="space-y-1.5"><Label>Ambiente HML</Label><Input value={extra.link_hml} onChange={upd("link_hml")} placeholder="https://" /></div>
              <div className="space-y-1.5"><Label>Ambiente PRD</Label><Input value={extra.link_prd} onChange={upd("link_prd")} placeholder="https://" /></div>
            </div>
          </div>
        </div>
        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={() => void save()} disabled={saving || !name.trim()}>{saving && <Loader2 size={14} className="mr-1.5 animate-spin" />}{editing ? "Salvar" : "Criar"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function OptSelect({ label, value, onChange, options }: { label: string; value: string; onChange: (v: string) => void; options: [string, string][] }) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
        <SelectContent>
          <SelectItem value={NONE}>—</SelectItem>
          {options.map(([v, l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}
        </SelectContent>
      </Select>
    </div>
  )
}
