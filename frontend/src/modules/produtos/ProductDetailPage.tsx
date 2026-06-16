import { useEffect, useMemo, useState } from "react"
import { useNavigate, useParams } from "react-router-dom"
import { AlertTriangle, ArrowLeft, Download, FileText, Link2, Loader2, Paperclip, Pencil, Plus, Trash2 } from "lucide-react"

import {
  produtosApi, type Contrato, type Documento, type ProcessoCatalog, type Product, type ProdutoProcessoLink, type Servico, type Sustentacao,
} from "@/api/produtos"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Skeleton } from "@/components/ui/skeleton"
import { Switch } from "@/components/ui/switch"
import { EmptyState } from "@/components/EmptyState"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { toast } from "@/lib/toast"
import { ProductFormDialog } from "@/modules/produtos/ProductFormDialog"
import { CRITICIDADE_COLOR, CRITICIDADE_LABEL, LIFECYCLE_LABEL, ORIGEM_LABEL, SUSTENTACAO_LABEL, SUSTENTACAO_OPTS } from "@/modules/produtos/constants"

const YEAR = new Date().getFullYear()
const YEARS = [YEAR + 1, YEAR, YEAR - 1, YEAR - 2, YEAR - 3]
function fmtDate(iso: string | null) { return iso ? new Date(iso).toLocaleDateString("pt-BR") : "—" }

export default function ProductDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const [product, setProduct] = useState<Product | null>(null)
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState(false)

  async function reload() { if (id) setProduct(await produtosApi.getProduct(id).catch(() => null)) }
  useEffect(() => { if (id) produtosApi.getProduct(id).catch(() => null).then(setProduct).finally(() => setLoading(false)) }, [id])

  if (loading) return <Skeleton className="h-96 w-full" />
  if (!product) return <EmptyState icon={FileText} title="Produto não encontrado" description="Volte para a lista." />
  const p = product

  async function remove() {
    if (!confirm("Inativar este produto? (exclusão lógica, preserva histórico)")) return
    await produtosApi.deleteProduct(p.id); toast.info("Produto inativado."); navigate("/app/modules/produtos/produtos")
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="icon" onClick={() => navigate("/app/modules/produtos/produtos")}><ArrowLeft size={16} /></Button>
        <div className="flex-1">
          <h2 className="text-lg font-bold">{p.simbolo ? `${p.simbolo} ` : ""}{p.name}</h2>
          <div className="flex flex-wrap items-center gap-1.5">
            <Badge variant="outline" className="text-[10px]">{ORIGEM_LABEL[p.origem]}</Badge>
            <Badge variant="outline" className="text-[10px]">{LIFECYCLE_LABEL[p.lifecycle]}</Badge>
            <Badge variant="secondary" className="text-[10px]" style={{ backgroundColor: `${CRITICIDADE_COLOR[p.criticidade]}22`, color: CRITICIDADE_COLOR[p.criticidade] }}>{CRITICIDADE_LABEL[p.criticidade]}</Badge>
          </div>
        </div>
        <Button variant="outline" size="sm" className="gap-1.5" onClick={() => setEditing(true)}><Pencil size={13} /> Editar</Button>
        <Button variant="ghost" size="sm" className="gap-1.5 text-destructive" onClick={() => void remove()}><Trash2 size={13} /> Inativar</Button>
      </div>

      {p.requires_contract && !p.has_active_contract && (
        <div className="flex items-center gap-2 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-800">
          <AlertTriangle size={15} /> Produto de fornecedor sem contrato ativo — cadastre um contrato na aba Contratos.
        </div>
      )}

      <Tabs defaultValue="geral">
        <TabsList>
          <TabsTrigger value="geral">Geral</TabsTrigger>
          <TabsTrigger value="servicos">Serviços ({p.servicos.length})</TabsTrigger>
          <TabsTrigger value="documentos">Documentos ({p.documentos.length})</TabsTrigger>
          <TabsTrigger value="processos">Processos ({p.processos.length})</TabsTrigger>
          <TabsTrigger value="contratos">Contratos ({p.contratos.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="geral"><GeralTab p={p} /></TabsContent>
        <TabsContent value="servicos"><ServicosTab p={p} onChange={reload} /></TabsContent>
        <TabsContent value="documentos"><DocumentosTab p={p} onChange={reload} /></TabsContent>
        <TabsContent value="processos"><ProcessosTab p={p} onChange={reload} /></TabsContent>
        <TabsContent value="contratos"><ContratosTab p={p} onChange={reload} /></TabsContent>
      </Tabs>

      <ProductFormDialog open={editing} onOpenChange={setEditing} product={p} onSaved={() => { setEditing(false); void reload() }} />
    </div>
  )
}

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return <div><p className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">{label}</p><p className="text-sm">{value || "—"}</p></div>
}

function GeralTab({ p }: { p: Product }) {
  return (
    <div className="grid gap-4 pt-3 sm:grid-cols-2 lg:grid-cols-3">
      <Field label="Domínio funcional" value={p.dominio_funcional} />
      <Field label="Setor" value={p.setor_name} />
      <Field label="Área" value={p.area?.name} />
      <Field label="Responsável" value={p.responsavel?.full_name} />
      <Field label="Fornecedor" value={p.fornecedor?.nome} />
      <Field label="Entrada em produção" value={fmtDate(p.data_entrada_producao)} />
      <div className="sm:col-span-2 lg:col-span-3"><Field label="Descrição" value={p.description} /></div>
    </div>
  )
}

function YearSelect({ value, onChange }: { value: number; onChange: (n: number) => void }) {
  return (
    <Select value={String(value)} onValueChange={(v) => onChange(Number(v))}>
      <SelectTrigger className="h-8 w-24"><SelectValue /></SelectTrigger>
      <SelectContent>{YEARS.map((y) => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}</SelectContent>
    </Select>
  )
}

function ServicosTab({ p, onChange }: { p: Product; onChange: () => void }) {
  const [name, setName] = useState("")
  const [ano, setAno] = useState(YEAR)
  const [adding, setAdding] = useState(false)
  async function add() {
    if (!name.trim()) return
    setAdding(true)
    try { await produtosApi.addServico(p.id, { name: name.trim(), ano_referencia: ano }); setName(""); onChange() } finally { setAdding(false) }
  }
  async function del(s: Servico) { if (confirm(`Inativar o serviço "${s.name}"?`)) { await produtosApi.deleteServico(p.id, s.id); onChange() } }
  return (
    <div className="space-y-3 pt-3">
      <div className="flex flex-wrap items-end gap-2 rounded-md border p-3">
        <div className="flex-1 space-y-1"><Label className="text-xs">Novo serviço digital</Label><Input value={name} onChange={(e) => setName(e.target.value)} /></div>
        <div className="space-y-1"><Label className="text-xs">Ano</Label><YearSelect value={ano} onChange={setAno} /></div>
        <Button className="gap-1.5" onClick={() => void add()} disabled={adding || !name.trim()}><Plus size={14} /> Adicionar</Button>
      </div>
      {p.servicos.length === 0 ? <p className="text-sm text-muted-foreground">Nenhum serviço.</p> : (
        <div className="space-y-2">{p.servicos.map((s) => (
          <div key={s.id} className="flex items-center justify-between gap-2 rounded-md border p-2.5">
            <div className="min-w-0"><p className="text-sm font-medium">{s.name}</p>{s.description && <p className="text-xs text-muted-foreground">{s.description}</p>}</div>
            <div className="flex items-center gap-2"><Badge variant="outline" className="text-[10px]">{s.ano_referencia}</Badge>
              <Button variant="ghost" size="icon" className="text-muted-foreground hover:text-destructive" onClick={() => void del(s)}><Trash2 size={14} /></Button></div>
          </div>
        ))}</div>
      )}
    </div>
  )
}

function DocumentosTab({ p, onChange }: { p: Product; onChange: () => void }) {
  const [name, setName] = useState("")
  const [ano, setAno] = useState(YEAR)
  const [link, setLink] = useState("")
  const [upload, setUpload] = useState<{ object_name: string; filename: string; content_type: string; size: number } | null>(null)
  const [uploading, setUploading] = useState(false)
  const [adding, setAdding] = useState(false)
  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]; e.target.value = ""; if (!f) return
    setUploading(true)
    try { const m = await produtosApi.uploadFile(f); setUpload(m); if (!name.trim()) setName(f.name) } catch { toast.error("Falha no upload.") } finally { setUploading(false) }
  }
  async function add() {
    if (!name.trim() || (!upload && !link.trim())) { toast.error("Informe nome e arquivo ou link."); return }
    setAdding(true)
    try {
      await produtosApi.addDocumento(p.id, { name: name.trim(), ano_referencia: ano, object_name: upload?.object_name, filename: upload?.filename, content_type: upload?.content_type, size: upload?.size, external_link: link.trim() || undefined })
      setName(""); setLink(""); setUpload(null); onChange()
    } catch { toast.error("Falha ao adicionar.") } finally { setAdding(false) }
  }
  async function open(d: Documento) {
    if (d.object_name) { const u = await produtosApi.getUploadUrl(d.object_name); if (u) window.open(u, "_blank", "noopener") }
    else if (d.external_link) window.open(d.external_link, "_blank", "noopener")
  }
  async function del(d: Documento) { if (confirm(`Inativar "${d.name}"?`)) { await produtosApi.deleteDocumento(p.id, d.id); onChange() } }
  return (
    <div className="space-y-3 pt-3">
      <div className="space-y-2 rounded-md border p-3">
        <div className="flex flex-wrap items-end gap-2">
          <div className="flex-1 space-y-1"><Label className="text-xs">Novo documento nato digital</Label><Input value={name} onChange={(e) => setName(e.target.value)} /></div>
          <div className="space-y-1"><Label className="text-xs">Ano</Label><YearSelect value={ano} onChange={setAno} /></div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <label className={`inline-flex cursor-pointer items-center gap-2 rounded-md border border-dashed px-3 py-2 text-sm text-muted-foreground hover:text-foreground ${uploading ? "pointer-events-none opacity-60" : ""}`}>
            {uploading ? <Loader2 size={14} className="animate-spin" /> : <Paperclip size={14} />}{upload ? upload.filename : uploading ? "Enviando…" : "Anexar arquivo"}
            <input type="file" className="hidden" onChange={onFile} disabled={uploading} />
          </label>
          <span className="text-xs text-muted-foreground">ou</span>
          <Input className="min-w-[160px] flex-1" value={link} onChange={(e) => setLink(e.target.value)} placeholder="Link externo" />
          <Button className="gap-1.5" onClick={() => void add()} disabled={adding || !name.trim()}><Plus size={14} /> Adicionar</Button>
        </div>
      </div>
      {p.documentos.length === 0 ? <p className="text-sm text-muted-foreground">Nenhum documento.</p> : (
        <div className="space-y-2">{p.documentos.map((d) => (
          <div key={d.id} className="flex items-center justify-between gap-2 rounded-md border p-2.5">
            <button type="button" className="flex min-w-0 items-center gap-2 text-left" onClick={() => void open(d)}>
              {d.object_name ? <FileText size={15} className="shrink-0 text-muted-foreground" /> : <Link2 size={15} className="shrink-0 text-muted-foreground" />}
              <span className="truncate text-sm font-medium text-primary hover:underline">{d.name}</span>
            </button>
            <div className="flex items-center gap-1"><Badge variant="outline" className="text-[10px]">{d.ano_referencia}</Badge>
              <Button variant="ghost" size="icon" onClick={() => void open(d)}><Download size={14} /></Button>
              <Button variant="ghost" size="icon" className="text-muted-foreground hover:text-destructive" onClick={() => void del(d)}><Trash2 size={14} /></Button></div>
          </div>
        ))}</div>
      )}
    </div>
  )
}

function flattenSubprocessos(tree: ProcessoCatalog[]): { id: string; label: string }[] {
  const out: { id: string; label: string }[] = []
  function walk(node: ProcessoCatalog, trail: string[]) {
    const path = [...trail, node.name]
    if (node.nivel === "subprocesso") out.push({ id: node.id, label: path.join(" › ") })
    node.children.forEach((c) => walk(c, path))
  }
  tree.forEach((n) => walk(n, []))
  return out
}

function ProcessosTab({ p, onChange }: { p: Product; onChange: () => void }) {
  const [catalog, setCatalog] = useState<ProcessoCatalog[]>([])
  const [subId, setSubId] = useState("")
  const [ano, setAno] = useState(YEAR)
  const [auto, setAuto] = useState(false)
  const [adding, setAdding] = useState(false)
  useEffect(() => { produtosApi.listProcessos().then(setCatalog).catch(() => setCatalog([])) }, [])
  const subs = useMemo(() => flattenSubprocessos(catalog), [catalog])
  async function add() {
    if (!subId) return
    setAdding(true)
    try { await produtosApi.linkProcesso(p.id, { processo_id: subId, ano_referencia: ano, automatizado: auto }); setSubId(""); setAuto(false); onChange() }
    catch (e) { toast.error((e as { response?: { data?: { detail?: string } } })?.response?.data?.detail || "Falha ao vincular.") } finally { setAdding(false) }
  }
  async function toggleAuto(l: ProdutoProcessoLink) { await produtosApi.updateLink(p.id, l.id, { automatizado: !l.automatizado }); onChange() }
  async function del(l: ProdutoProcessoLink) { if (confirm("Remover o vínculo?")) { await produtosApi.unlinkProcesso(p.id, l.id); onChange() } }
  return (
    <div className="space-y-3 pt-3">
      <div className="flex flex-wrap items-end gap-2 rounded-md border p-3">
        <div className="min-w-[220px] flex-1 space-y-1">
          <Label className="text-xs">Vincular subprocesso (catálogo)</Label>
          <Select value={subId} onValueChange={setSubId}>
            <SelectTrigger><SelectValue placeholder={subs.length ? "Selecione um subprocesso" : "Cadastre subprocessos no catálogo"} /></SelectTrigger>
            <SelectContent>{subs.map((s) => <SelectItem key={s.id} value={s.id}>{s.label}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div className="space-y-1"><Label className="text-xs">Ano</Label><YearSelect value={ano} onChange={setAno} /></div>
        <div className="flex items-center gap-2 pb-1.5"><Switch checked={auto} onCheckedChange={setAuto} /><Label className="text-xs">Automatizado</Label></div>
        <Button className="gap-1.5" onClick={() => void add()} disabled={adding || !subId}><Plus size={14} /> Vincular</Button>
      </div>
      {p.processos.length === 0 ? <p className="text-sm text-muted-foreground">Nenhum subprocesso vinculado.</p> : (
        <div className="space-y-2">{p.processos.map((l) => (
          <div key={l.id} className="flex items-center justify-between gap-2 rounded-md border p-2.5">
            <div className="min-w-0">
              <p className="text-sm font-medium">{l.processo_nome}</p>
              <p className="text-[11px] text-muted-foreground">{l.macroprocesso_nome} › {l.processo_pai_nome}</p>
            </div>
            <div className="flex items-center gap-2">
              <Badge variant="outline" className="text-[10px]">{l.ano_referencia}</Badge>
              <button type="button" className="flex items-center gap-1.5" onClick={() => void toggleAuto(l)}>
                <Switch checked={l.automatizado} /><span className="text-[11px]">Automatizado</span>
              </button>
              <Button variant="ghost" size="icon" className="text-muted-foreground hover:text-destructive" onClick={() => void del(l)}><Trash2 size={14} /></Button>
            </div>
          </div>
        ))}</div>
      )}
    </div>
  )
}

function ContratosTab({ p, onChange }: { p: Product; onChange: () => void }) {
  const [open, setOpen] = useState(false)
  async function del(c: Contrato) { if (confirm("Inativar este contrato?")) { await produtosApi.deleteContrato(p.id, c.id); onChange() } }
  return (
    <div className="space-y-3 pt-3">
      <div className="flex justify-end"><Button size="sm" className="gap-1.5" onClick={() => setOpen(true)}><Plus size={14} /> Novo contrato</Button></div>
      {p.contratos.length === 0 ? <p className="text-sm text-muted-foreground">Nenhum contrato.</p> : (
        <div className="space-y-2">{p.contratos.map((c) => (
          <div key={c.id} className="rounded-md border p-3">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="text-sm font-medium">{c.fornecedor_nome ?? "Fornecedor"} {c.identificador && <span className="text-muted-foreground">· {c.identificador}</span>}</p>
                <p className="text-[11px] text-muted-foreground">Vigência {fmtDate(c.vigencia_inicio)} → {fmtDate(c.vigencia_fim)} {c.renovacao_automatica && "· renovação automática"}</p>
              </div>
              <div className="flex items-center gap-1">
                {c.dias_para_vencer != null && c.dias_para_vencer <= 90 && <Badge variant={c.dias_para_vencer <= 30 ? "destructive" : "secondary"} className="text-[10px]">vence em {c.dias_para_vencer}d</Badge>}
                <Button variant="ghost" size="icon" className="text-muted-foreground hover:text-destructive" onClick={() => void del(c)}><Trash2 size={14} /></Button>
              </div>
            </div>
            <div className="mt-1 flex flex-wrap gap-2 text-[11px] text-muted-foreground">
              <span>Sustentação: N1 {SUSTENTACAO_LABEL[c.sustentacao_n1]} · N2 {SUSTENTACAO_LABEL[c.sustentacao_n2]} · N3 {SUSTENTACAO_LABEL[c.sustentacao_n3]}</span>
              {c.modelo_licenciamento && <span>· {c.modelo_licenciamento}</span>}
              {c.gestor_nome && <span>· gestor: {c.gestor_nome}</span>}
            </div>
          </div>
        ))}</div>
      )}
      <ContratoDialog open={open} onOpenChange={setOpen} productId={p.id} fornecedorIdDefault={p.fornecedor?.id ?? ""} onSaved={() => { setOpen(false); onChange() }} />
    </div>
  )
}

function ContratoDialog({ open, onOpenChange, productId, fornecedorIdDefault, onSaved }: {
  open: boolean; onOpenChange: (v: boolean) => void; productId: string; fornecedorIdDefault: string; onSaved: () => void
}) {
  const [fornecedores, setFornecedores] = useState<{ id: string; nome: string }[]>([])
  const [persons, setPersons] = useState<{ id: string; full_name: string }[]>([])
  const [fornecedorId, setFornecedorId] = useState(fornecedorIdDefault)
  const [identificador, setIdent] = useState("")
  const [ini, setIni] = useState("")
  const [fim, setFim] = useState("")
  const [renov, setRenov] = useState(false)
  const [licenc, setLicenc] = useState("")
  const [gestor, setGestor] = useState("__none__")
  const [n1, setN1] = useState<Sustentacao>("interna")
  const [n2, setN2] = useState<Sustentacao>("interna")
  const [n3, setN3] = useState<Sustentacao>("interna")
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!open) return
    Promise.all([produtosApi.listFornecedores().catch(() => []), produtosApi.listPersons().catch(() => [])]).then(([f, p]) => { setFornecedores(f); setPersons(p) })
    setFornecedorId(fornecedorIdDefault); setIdent(""); setIni(""); setFim(""); setRenov(false); setLicenc(""); setGestor("__none__"); setN1("interna"); setN2("interna"); setN3("interna")
  }, [open, fornecedorIdDefault])

  async function save() {
    if (!fornecedorId || !ini || !fim) { toast.error("Fornecedor e vigências são obrigatórios."); return }
    if (fim <= ini) { toast.error("A vigência final deve ser posterior à inicial."); return }
    setSaving(true)
    try {
      await produtosApi.addContrato(productId, {
        fornecedor_id: fornecedorId, identificador: identificador.trim() || undefined, vigencia_inicio: ini, vigencia_fim: fim,
        renovacao_automatica: renov, modelo_licenciamento: licenc.trim() || undefined,
        gestor_person_id: gestor === "__none__" ? undefined : gestor, sustentacao_n1: n1, sustentacao_n2: n2, sustentacao_n3: n3,
      })
      toast.success("Contrato criado."); onSaved()
    } catch (e) { toast.error((e as { response?: { data?: { detail?: string } } })?.response?.data?.detail || "Falha ao salvar.") } finally { setSaving(false) }
  }

  const sustSelect = (v: Sustentacao, set: (s: Sustentacao) => void) => (
    <Select value={v} onValueChange={(x) => set(x as Sustentacao)}>
      <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
      <SelectContent>{SUSTENTACAO_OPTS.map((o) => <SelectItem key={o} value={o}>{SUSTENTACAO_LABEL[o]}</SelectItem>)}</SelectContent>
    </Select>
  )

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle>Novo contrato</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5"><Label>Fornecedor</Label>
            <Select value={fornecedorId} onValueChange={setFornecedorId}>
              <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
              <SelectContent>{fornecedores.map((f) => <SelectItem key={f.id} value={f.id}>{f.nome}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5"><Label>Início</Label><Input type="date" value={ini} onChange={(e) => setIni(e.target.value)} /></div>
            <div className="space-y-1.5"><Label>Fim</Label><Input type="date" value={fim} onChange={(e) => setFim(e.target.value)} /></div>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5"><Label>Identificador</Label><Input value={identificador} onChange={(e) => setIdent(e.target.value)} /></div>
            <div className="space-y-1.5"><Label>Modelo de licenciamento</Label><Input value={licenc} onChange={(e) => setLicenc(e.target.value)} /></div>
          </div>
          <div className="flex items-center gap-2"><Switch checked={renov} onCheckedChange={setRenov} /><Label className="text-sm">Renovação automática</Label></div>
          <div className="space-y-1.5"><Label>Gestor do contrato</Label>
            <Select value={gestor} onValueChange={setGestor}>
              <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
              <SelectContent><SelectItem value="__none__">—</SelectItem>{persons.map((p) => <SelectItem key={p.id} value={p.id}>{p.full_name}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Modelo de sustentação (por camada)</Label>
            <div className="grid grid-cols-3 gap-2">
              <div><p className="mb-1 text-[10px] text-muted-foreground">N1</p>{sustSelect(n1, setN1)}</div>
              <div><p className="mb-1 text-[10px] text-muted-foreground">N2</p>{sustSelect(n2, setN2)}</div>
              <div><p className="mb-1 text-[10px] text-muted-foreground">N3</p>{sustSelect(n3, setN3)}</div>
            </div>
          </div>
        </div>
        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={() => void save()} disabled={saving}>{saving && <Loader2 size={14} className="mr-1.5 animate-spin" />}Criar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
