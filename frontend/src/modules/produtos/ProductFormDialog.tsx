import { useEffect, useMemo, useState } from "react"
import { Loader2 } from "lucide-react"

import {
  produtosApi, type AreaRefMini, type Fornecedor, type PersonMini, type Product, type ProductCategoria,
  type ProductCriticidade, type ProductLifecycle, type ProductModeloContratacao, type ProductOrigem,
  type ProductStatus, type ProductTipoDev, type ProductUnidade,
} from "@/api/produtos"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { toast } from "@/lib/toast"
import {
  CATEGORIA_LABEL, CATEGORIA_OPTS, CRITICIDADE_LABEL, CRITICIDADE_OPTS, LIFECYCLE_LABEL, LIFECYCLE_OPTS,
  MODELO_CONTRAT_LABEL, MODELO_CONTRAT_OPTS, ORIGEM_LABEL, ORIGEM_OPTS, STATUS_LABEL, STATUS_OPTS,
  TIPODEV_LABEL, TIPODEV_OPTS, UNIDADE_LABEL, UNIDADE_OPTS,
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
  // campos novos
  const [categoria, setCategoria] = useState(NONE)
  const [unidade, setUnidade] = useState(NONE)
  const [status, setStatus] = useState(NONE)
  const [tipoDev, setTipoDev] = useState(NONE)
  const [modeloContrat, setModeloContrat] = useState(NONE)
  const [donoNegocioId, setDonoNegocioId] = useState(NONE)
  const [extra, setExtra] = useState({ ...EMPTY_EXTRA })
  const [saving, setSaving] = useState(false)
  const upd = (k: ExtraKey) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setExtra((s) => ({ ...s, [k]: e.target.value }))

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
    setCategoria(product?.categoria ?? NONE)
    setUnidade(product?.unidade ?? NONE)
    setStatus(product?.status_produto ?? NONE)
    setTipoDev(product?.tipo_desenvolvimento ?? NONE)
    setModeloContrat(product?.modelo_contratacao ?? NONE)
    setDonoNegocioId(product?.dono_negocio?.id ?? NONE)
    setExtra({
      sigla: product?.sigla ?? "", link_descricao: product?.link_descricao ?? "", publico_alvo: product?.publico_alvo ?? "",
      url_acesso: product?.url_acesso ?? "", observacoes: product?.observacoes ?? "", desenvolvido_por: product?.desenvolvido_por ?? "",
      fornecedor_cnpj: product?.fornecedor_cnpj ?? "", ambiente_tecnologico: product?.ambiente_tecnologico ?? "",
      tecnologias: product?.tecnologias ?? "", link_repositorio: product?.link_repositorio ?? "", link_dev: product?.link_dev ?? "",
      link_hml: product?.link_hml ?? "", link_prd: product?.link_prd ?? "",
    })
  }, [open, product])

  const setorName = useMemo(() => areas.find((a) => a.id === areaId)?.setor_name ?? null, [areas, areaId])

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
      unidade: sel(unidade) as ProductUnidade | undefined,
      status_produto: sel(status) as ProductStatus | undefined,
      tipo_desenvolvimento: sel(tipoDev) as ProductTipoDev | undefined,
      modelo_contratacao: sel(modeloContrat) as ProductModeloContratacao | undefined,
      dono_negocio_person_id: sel(donoNegocioId),
    }
    const payload = {
      name: name.trim(), simbolo: simbolo.trim() || undefined, description: description.trim() || undefined,
      dominio_funcional: dominio.trim() || undefined, origem, lifecycle, criticidade,
      data_entrada_producao: dataProd || undefined,
      area_id: areaId === NONE ? undefined : areaId,
      responsavel_person_id: responsavelId === NONE ? undefined : responsavelId,
      fornecedor_id: fornecedorId === NONE ? undefined : fornecedorId,
      ...digital,
    }
    try {
      const p = editing
        ? await produtosApi.updateProduct(product!.id, {
            ...payload, area_id: areaId === NONE ? null : areaId, responsavel_person_id: responsavelId === NONE ? null : responsavelId,
            fornecedor_id: fornecedorId === NONE ? null : fornecedorId, dono_negocio_person_id: donoNegocioId === NONE ? null : donoNegocioId,
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
          {/* ── Classificação (Produtos Digitais) ── */}
          <div className="border-t pt-3">
            <p className="mb-2 text-[11px] font-bold uppercase tracking-wide text-muted-foreground">Classificação</p>
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="space-y-1.5"><Label>Sigla</Label><Input value={extra.sigla} onChange={upd("sigla")} placeholder="Ex.: PQD" /></div>
              <OptSelect label="Categoria" value={categoria} onChange={setCategoria} options={CATEGORIA_OPTS.map((o) => [o, CATEGORIA_LABEL[o]])} />
              <OptSelect label="Unidade/Entidade" value={unidade} onChange={setUnidade} options={UNIDADE_OPTS.map((o) => [o, UNIDADE_LABEL[o]])} />
              <OptSelect label="Status do produto" value={status} onChange={setStatus} options={STATUS_OPTS.map((o) => [o, STATUS_LABEL[o]])} />
              <div className="space-y-1.5">
                <Label>Dono do negócio</Label>
                <Select value={donoNegocioId} onValueChange={setDonoNegocioId}>
                  <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                  <SelectContent><SelectItem value={NONE}>—</SelectItem>{persons.map((p) => <SelectItem key={p.id} value={p.id}>{p.full_name}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5"><Label>URL de acesso</Label><Input value={extra.url_acesso} onChange={upd("url_acesso")} placeholder="https://" /></div>
            </div>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5"><Label>Público-alvo</Label><Input value={extra.publico_alvo} onChange={upd("publico_alvo")} /></div>
              <div className="space-y-1.5"><Label>Link da descrição</Label><Input value={extra.link_descricao} onChange={upd("link_descricao")} placeholder="https://" /></div>
            </div>
            <div className="mt-3 space-y-1.5"><Label>Observações gerais</Label><Textarea rows={2} value={extra.observacoes} onChange={upd("observacoes")} /></div>
          </div>

          {/* ── Desenvolvimento ── */}
          <div className="border-t pt-3">
            <p className="mb-2 text-[11px] font-bold uppercase tracking-wide text-muted-foreground">Desenvolvimento</p>
            <div className="grid gap-3 sm:grid-cols-3">
              <OptSelect label="Tipo de desenvolvimento" value={tipoDev} onChange={setTipoDev} options={TIPODEV_OPTS.map((o) => [o, TIPODEV_LABEL[o]])} />
              <div className="space-y-1.5"><Label>Desenvolvido por</Label><Input value={extra.desenvolvido_por} onChange={upd("desenvolvido_por")} /></div>
              <div className="space-y-1.5"><Label>CNPJ do fornecedor</Label><Input value={extra.fornecedor_cnpj} onChange={upd("fornecedor_cnpj")} /></div>
              <OptSelect label="Modelo de contratação" value={modeloContrat} onChange={setModeloContrat} options={MODELO_CONTRAT_OPTS.map((o) => [o, MODELO_CONTRAT_LABEL[o]])} />
              <div className="space-y-1.5"><Label>Ambiente tecnológico</Label><Input value={extra.ambiente_tecnologico} onChange={upd("ambiente_tecnologico")} /></div>
              <div className="space-y-1.5"><Label>Tecnologias principais</Label><Input value={extra.tecnologias} onChange={upd("tecnologias")} /></div>
            </div>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5"><Label>Link do repositório</Label><Input value={extra.link_repositorio} onChange={upd("link_repositorio")} placeholder="https://" /></div>
              <div className="space-y-1.5"><Label>Ambiente DEV</Label><Input value={extra.link_dev} onChange={upd("link_dev")} placeholder="https://" /></div>
              <div className="space-y-1.5"><Label>Ambiente HML</Label><Input value={extra.link_hml} onChange={upd("link_hml")} placeholder="https://" /></div>
              <div className="space-y-1.5"><Label>Ambiente PRD</Label><Input value={extra.link_prd} onChange={upd("link_prd")} placeholder="https://" /></div>
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
