import { useEffect, useMemo, useState } from "react"
import { useNavigate, useParams } from "react-router-dom"
import { AlertTriangle, ArrowLeft, Download, ExternalLink, FileText, Link2, Loader2, Paperclip, Pencil, Plus, ShieldAlert, Trash2 } from "lucide-react"

import {
  produtosApi, type Contrato, type ContratoCreate, type Documento, type Documentation, type ProcessoCatalog,
  type Product, type ProdutoProcessoLink, type Release, type ReleaseCreate, type SecurityUpsert, type Servico,
  type SupportUpsert, type Sustentacao,
} from "@/api/produtos"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Skeleton } from "@/components/ui/skeleton"
import { Switch } from "@/components/ui/switch"
import { EmptyState } from "@/components/EmptyState"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { toast } from "@/lib/toast"
import { ProductFormDialog } from "@/modules/produtos/ProductFormDialog"
import ServiceProcessLinksDialog from "@/modules/produtos/ServiceProcessLinksDialog"
import MarkdownEditor, { MarkdownPreview } from "@/modules/produtos/components/MarkdownEditor"
import {
  CATEGORIA_LABEL, CLASSIFICACAO_LABEL, CONTRATO_STATUS_COLOR, CONTRATO_STATUS_LABEL, CONTRATO_STATUS_OPTS,
  CONTRATO_TIPOVALOR_LABEL, CONTRATO_TIPOVALOR_OPTS, CRITICIDADE_COLOR, CRITICIDADE_LABEL, DOC_TIPO_LABEL, DOC_TIPO_OPTS,
  DOCNT_STATUS_COLOR, DOCNT_STATUS_LABEL, DOCNT_STATUS_OPTS, DOCNT_TIPO_LABEL, DOCNT_TIPO_OPTS, LIFECYCLE_LABEL, MODELO_CONTRAT_LABEL,
  ORIGEM_LABEL, RELEASE_AMBIENTE_LABEL, RELEASE_AMBIENTE_OPTS, RELEASE_IMPACTO_LABEL, RELEASE_IMPACTO_OPTS,
  RELEASE_STATUS_COLOR, RELEASE_STATUS_LABEL, RELEASE_STATUS_OPTS, RELEASE_TIPO_LABEL, RELEASE_TIPO_OPTS,
  RISCO_LABEL, RISCO_OPTS, SERVICO_STATUS_LABEL, SERVICO_STATUS_OPTS, SERVICO_SUPORTE_LABEL, SERVICO_SUPORTE_OPTS,
  STATUS_COLOR, STATUS_LABEL, SUSTENTACAO_LABEL, SUSTENTACAO_OPTS, TIPODEV_LABEL,
  UNIDADE_LABEL, AUTENTICACAO_TIPO_LABEL, AUTENTICACAO_TIPO_OPTS, INTEGRACAO_TIPO_LABEL, INTEGRACAO_TIPO_OPTS,
  SUPORTE_TIPO_LABEL, SUPORTE_TIPO_OPTS,
} from "@/modules/produtos/constants"

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

  const trataDados = p.documentos.some((d) => d.dados_pessoais || d.dados_sensiveis) || !!(p.security && (p.security.dados_pessoais || p.security.dados_sensiveis))
  const trataSensiveis = p.documentos.some((d) => d.dados_sensiveis) || !!p.security?.dados_sensiveis
  // sinais de produto crítico (spec §11.5)
  const criticalGaps: string[] = []
  if (p.criticidade === "critica") {
    if (!p.security?.plano_contingencia) criticalGaps.push("plano de contingência")
    if (!p.documentations.some((d) => d.status === "publicada")) criticalGaps.push("documentação publicada")
    if (!p.support?.canal_atendimento) criticalGaps.push("canal de suporte")
    if (!(p.support?.sla_critico || p.contratos.some((c) => c.sla_contratual))) criticalGaps.push("SLA definido")
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="icon" onClick={() => navigate("/app/modules/produtos/produtos")}><ArrowLeft size={16} /></Button>
        <div className="flex-1">
          <h2 className="text-lg font-bold">{p.simbolo ? `${p.simbolo} ` : ""}{p.name}{p.sigla && <span className="ml-1 text-sm font-normal text-muted-foreground">({p.sigla})</span>}</h2>
          <div className="flex flex-wrap items-center gap-1.5">
            {p.status_produto && <Badge variant="secondary" className="text-[10px]" style={{ backgroundColor: `${STATUS_COLOR[p.status_produto]}22`, color: STATUS_COLOR[p.status_produto] }}>{STATUS_LABEL[p.status_produto]}</Badge>}
            <Badge variant="secondary" className="text-[10px]" style={{ backgroundColor: `${CRITICIDADE_COLOR[p.criticidade]}22`, color: CRITICIDADE_COLOR[p.criticidade] }}>{CRITICIDADE_LABEL[p.criticidade]}</Badge>
            {p.categoria && <Badge variant="outline" className="text-[10px]">{CATEGORIA_LABEL[p.categoria]}</Badge>}
            {p.tipo_desenvolvimento && <Badge variant="outline" className="text-[10px]">{TIPODEV_LABEL[p.tipo_desenvolvimento]}</Badge>}
            {p.unidade && <Badge variant="outline" className="text-[10px]">{UNIDADE_LABEL[p.unidade]}</Badge>}
            {trataDados && <Badge variant="secondary" className="gap-0.5 bg-amber-100 text-[10px] text-amber-800"><ShieldAlert size={10} /> {trataSensiveis ? "Dados sensíveis" : "Dados pessoais"}</Badge>}
          </div>
        </div>
        {p.url_acesso && <Button variant="outline" size="sm" className="gap-1.5" onClick={() => window.open(p.url_acesso!, "_blank", "noopener")}><ExternalLink size={13} /> Acessar</Button>}
        <Button variant="outline" size="sm" className="gap-1.5" onClick={() => setEditing(true)}><Pencil size={13} /> Editar</Button>
        <Button variant="ghost" size="sm" className="gap-1.5 text-destructive" onClick={() => void remove()}><Trash2 size={13} /> Inativar</Button>
      </div>

      {p.requires_contract && !p.has_active_contract && (
        <div className="flex items-center gap-2 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-800">
          <AlertTriangle size={15} /> Produto de fornecedor sem contrato ativo — cadastre um contrato na aba Contratos.
        </div>
      )}
      {criticalGaps.length > 0 && (
        <div className="flex items-center gap-2 rounded-md border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-800">
          <ShieldAlert size={15} /> Produto crítico sem: {criticalGaps.join(", ")}.
        </div>
      )}

      <Tabs defaultValue="geral">
        <TabsList className="flex-wrap">
          <TabsTrigger value="geral">Geral</TabsTrigger>
          <TabsTrigger value="desenvolvimento">Desenvolvimento</TabsTrigger>
          <TabsTrigger value="servicos">Serviços ({p.servicos.length})</TabsTrigger>
          <TabsTrigger value="documentos">Documentos ({p.documentos.length})</TabsTrigger>
          <TabsTrigger value="contratos">Contratos ({p.contratos.length})</TabsTrigger>
          <TabsTrigger value="releases">Releases ({p.releases.length})</TabsTrigger>
          <TabsTrigger value="documentacao">Documentação ({p.documentations.length})</TabsTrigger>
          <TabsTrigger value="sustentacao">Sustentação</TabsTrigger>
          <TabsTrigger value="seguranca">Integrações e segurança</TabsTrigger>
          <TabsTrigger value="processos">Processos ({p.processos.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="geral"><GeralTab p={p} /></TabsContent>
        <TabsContent value="desenvolvimento"><DesenvolvimentoTab p={p} /></TabsContent>
        <TabsContent value="servicos"><ServicosTab p={p} onChange={reload} /></TabsContent>
        <TabsContent value="documentos"><DocumentosTab p={p} onChange={reload} /></TabsContent>
        <TabsContent value="contratos"><ContratosTab p={p} onChange={reload} /></TabsContent>
        <TabsContent value="releases"><ReleasesTab p={p} onChange={reload} /></TabsContent>
        <TabsContent value="documentacao"><DocumentacaoTab p={p} onChange={reload} /></TabsContent>
        <TabsContent value="sustentacao"><SustentacaoTab p={p} onChange={reload} /></TabsContent>
        <TabsContent value="seguranca"><SegurancaTab p={p} onChange={reload} /></TabsContent>
        <TabsContent value="processos"><ProcessosTab p={p} onChange={reload} /></TabsContent>
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
      <Field label="Sigla" value={p.sigla} />
      <Field label="Categoria" value={p.categoria ? CATEGORIA_LABEL[p.categoria] : null} />
      <Field label="Unidade/Entidade" value={p.unidade ? UNIDADE_LABEL[p.unidade] : null} />
      <Field label="Status" value={p.status_produto ? STATUS_LABEL[p.status_produto] : null} />
      <Field label="Domínio funcional" value={p.dominio_funcional} />
      <Field label="Setor" value={p.setor_name} />
      <Field label="Área demandante" value={p.area?.name} />
      <Field label="Responsável de TI" value={p.responsavel?.full_name} />
      <Field label="Dono do negócio" value={p.dono_negocio?.full_name} />
      <Field label="Fornecedor" value={p.fornecedor?.nome} />
      <Field label="Público-alvo" value={p.publico_alvo} />
      <Field label="Entrada em produção" value={fmtDate(p.data_entrada_producao)} />
      <Field label="URL de acesso" value={p.url_acesso ? <a href={p.url_acesso} target="_blank" rel="noreferrer" className="text-primary underline">{p.url_acesso}</a> : null} />
      <Field label="Link da descrição" value={p.link_descricao ? <a href={p.link_descricao} target="_blank" rel="noreferrer" className="text-primary underline">abrir</a> : null} />
      <div className="sm:col-span-2 lg:col-span-3"><Field label="Descrição" value={p.description} /></div>
      <div className="sm:col-span-2 lg:col-span-3"><Field label="Observações gerais" value={p.observacoes} /></div>
    </div>
  )
}

function DesenvolvimentoTab({ p }: { p: Product }) {
  const link = (url: string | null) => url ? <a href={url} target="_blank" rel="noreferrer" className="text-primary underline">abrir</a> : null
  return (
    <div className="grid gap-4 pt-3 sm:grid-cols-2 lg:grid-cols-3">
      <Field label="Tipo de desenvolvimento" value={p.tipo_desenvolvimento ? TIPODEV_LABEL[p.tipo_desenvolvimento] : null} />
      <Field label="Desenvolvido por" value={p.desenvolvido_por} />
      <Field label="Origem" value={ORIGEM_LABEL[p.origem]} />
      <Field label="Fornecedor" value={p.fornecedor?.nome} />
      <Field label="CNPJ do fornecedor" value={p.fornecedor_cnpj} />
      <Field label="Modelo de contratação" value={p.modelo_contratacao ? MODELO_CONTRAT_LABEL[p.modelo_contratacao] : null} />
      <Field label="Ciclo de vida" value={LIFECYCLE_LABEL[p.lifecycle]} />
      <Field label="Ambiente tecnológico" value={p.ambiente_tecnologico} />
      <Field label="Tecnologias principais" value={p.tecnologias} />
      <Field label="Repositório" value={link(p.link_repositorio)} />
      <Field label="Ambiente DEV" value={link(p.link_dev)} />
      <Field label="Ambiente HML" value={link(p.link_hml)} />
      <Field label="Ambiente PRD" value={link(p.link_prd)} />
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
  const [areaUsuaria, setAreaUsuaria] = useState("")
  const [sla, setSla] = useState("")
  const [tipoSuporte, setTipoSuporte] = useState("__none__")
  const [statusSvc, setStatusSvc] = useState("__none__")
  const [adding, setAdding] = useState(false)
  const [linkSvc, setLinkSvc] = useState<Servico | null>(null)
  async function add() {
    if (!name.trim()) return
    setAdding(true)
    try {
      await produtosApi.addServico(p.id, {
        name: name.trim(), ano_referencia: ano, area_usuaria: areaUsuaria.trim() || null, sla_atendimento: sla.trim() || null,
        tipo_suporte: tipoSuporte === "__none__" ? null : (tipoSuporte as Servico["tipo_suporte"]),
        status_servico: statusSvc === "__none__" ? null : (statusSvc as Servico["status_servico"]),
      })
      setName(""); setAreaUsuaria(""); setSla(""); setTipoSuporte("__none__"); setStatusSvc("__none__"); onChange()
    } finally { setAdding(false) }
  }
  async function del(s: Servico) { if (confirm(`Inativar o serviço "${s.name}"?`)) { await produtosApi.deleteServico(p.id, s.id); onChange() } }
  return (
    <div className="space-y-3 pt-3">
      <div className="space-y-2 rounded-md border p-3">
        <div className="flex flex-wrap items-end gap-2">
          <div className="flex-1 space-y-1"><Label className="text-xs">Novo serviço digital</Label><Input value={name} onChange={(e) => setName(e.target.value)} /></div>
          <div className="space-y-1"><Label className="text-xs">Ano</Label><YearSelect value={ano} onChange={setAno} /></div>
        </div>
        <div className="flex flex-wrap items-end gap-2">
          <div className="flex-1 space-y-1"><Label className="text-xs">Área usuária</Label><Input value={areaUsuaria} onChange={(e) => setAreaUsuaria(e.target.value)} /></div>
          <div className="flex-1 space-y-1"><Label className="text-xs">SLA de atendimento</Label><Input value={sla} onChange={(e) => setSla(e.target.value)} /></div>
          <div className="space-y-1"><Label className="text-xs">Tipo de suporte</Label>
            <Select value={tipoSuporte} onValueChange={setTipoSuporte}><SelectTrigger className="h-9 w-40"><SelectValue placeholder="—" /></SelectTrigger>
              <SelectContent><SelectItem value="__none__">—</SelectItem>{SERVICO_SUPORTE_OPTS.map((o) => <SelectItem key={o} value={o}>{SERVICO_SUPORTE_LABEL[o]}</SelectItem>)}</SelectContent></Select>
          </div>
          <div className="space-y-1"><Label className="text-xs">Status</Label>
            <Select value={statusSvc} onValueChange={setStatusSvc}><SelectTrigger className="h-9 w-36"><SelectValue placeholder="—" /></SelectTrigger>
              <SelectContent><SelectItem value="__none__">—</SelectItem>{SERVICO_STATUS_OPTS.map((o) => <SelectItem key={o} value={o}>{SERVICO_STATUS_LABEL[o]}</SelectItem>)}</SelectContent></Select>
          </div>
          <Button className="gap-1.5" onClick={() => void add()} disabled={adding || !name.trim()}><Plus size={14} /> Adicionar</Button>
        </div>
      </div>
      {p.servicos.length === 0 ? <p className="text-sm text-muted-foreground">Nenhum serviço.</p> : (
        <div className="space-y-2">{p.servicos.map((s) => (
          <div key={s.id} className="flex items-center justify-between gap-2 rounded-md border p-2.5">
            <div className="min-w-0">
              <p className="text-sm font-medium">{s.name}</p>
              <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-muted-foreground">
                {s.area_usuaria && <span>{s.area_usuaria}</span>}
                {s.tipo_suporte && <span>· {SERVICO_SUPORTE_LABEL[s.tipo_suporte]}</span>}
                {s.sla_atendimento && <span>· SLA {s.sla_atendimento}</span>}
              </div>
            </div>
            <div className="flex items-center gap-2">
              {s.status_servico && <Badge variant="outline" className="text-[10px]">{SERVICO_STATUS_LABEL[s.status_servico]}</Badge>}
              <Badge variant="outline" className="text-[10px]">{s.ano_referencia}</Badge>
              <Button variant="ghost" size="icon" title="Vincular sub-processos" onClick={() => setLinkSvc(s)}><Link2 size={14} /></Button>
              <Button variant="ghost" size="icon" className="text-muted-foreground hover:text-destructive" onClick={() => void del(s)}><Trash2 size={14} /></Button>
            </div>
          </div>
        ))}</div>
      )}
      {linkSvc && <ServiceProcessLinksDialog servicoId={linkSvc.id} servicoName={linkSvc.name} onClose={() => setLinkSvc(null)} />}
    </div>
  )
}

function DocumentosTab({ p, onChange }: { p: Product; onChange: () => void }) {
  const [name, setName] = useState("")
  const [ano, setAno] = useState(YEAR)
  const [link, setLink] = useState("")
  const [tipo, setTipo] = useState("__none__")
  const [classif, setClassif] = useState("__none__")
  const [dadosPessoais, setDadosPessoais] = useState(false)
  const [dadosSensiveis, setDadosSensiveis] = useState(false)
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
      await produtosApi.addDocumento(p.id, {
        name: name.trim(), ano_referencia: ano, object_name: upload?.object_name, filename: upload?.filename,
        content_type: upload?.content_type, size: upload?.size, external_link: link.trim() || undefined,
        tipo_documento: tipo === "__none__" ? undefined : (tipo as Documento["tipo_documento"]),
        classificacao: classif === "__none__" ? undefined : (classif as Documento["classificacao"]),
        dados_pessoais: dadosPessoais, dados_sensiveis: dadosSensiveis,
      })
      setName(""); setLink(""); setUpload(null); setTipo("__none__"); setClassif("__none__"); setDadosPessoais(false); setDadosSensiveis(false); onChange()
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
        <div className="flex flex-wrap items-end gap-2">
          <div className="space-y-1"><Label className="text-xs">Tipo</Label>
            <Select value={tipo} onValueChange={setTipo}><SelectTrigger className="h-9 w-40"><SelectValue placeholder="—" /></SelectTrigger>
              <SelectContent><SelectItem value="__none__">—</SelectItem>{DOC_TIPO_OPTS.map((o) => <SelectItem key={o} value={o}>{DOC_TIPO_LABEL[o]}</SelectItem>)}</SelectContent></Select>
          </div>
          <div className="space-y-1"><Label className="text-xs">Classificação</Label>
            <Select value={classif} onValueChange={setClassif}><SelectTrigger className="h-9 w-40"><SelectValue placeholder="—" /></SelectTrigger>
              <SelectContent><SelectItem value="__none__">—</SelectItem>{(["publica", "interna", "confidencial", "restrita"] as const).map((o) => <SelectItem key={o} value={o}>{CLASSIFICACAO_LABEL[o]}</SelectItem>)}</SelectContent></Select>
          </div>
          <label className="flex items-center gap-1.5 pb-2 text-sm"><Switch checked={dadosPessoais} onCheckedChange={setDadosPessoais} /> Dados pessoais</label>
          <label className="flex items-center gap-1.5 pb-2 text-sm"><Switch checked={dadosSensiveis} onCheckedChange={setDadosSensiveis} /> Dados sensíveis</label>
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
            <div className="flex flex-wrap items-center justify-end gap-1">
              {d.tipo_documento && <Badge variant="outline" className="text-[10px]">{DOC_TIPO_LABEL[d.tipo_documento]}</Badge>}
              {d.classificacao && <Badge variant="outline" className="text-[10px]">{CLASSIFICACAO_LABEL[d.classificacao]}</Badge>}
              {(d.dados_pessoais || d.dados_sensiveis) && <Badge variant="secondary" className="gap-0.5 bg-amber-100 text-[10px] text-amber-800"><ShieldAlert size={10} />{d.dados_sensiveis ? "sensíveis" : "pessoais"}</Badge>}
              <Badge variant="outline" className="text-[10px]">{d.ano_referencia}</Badge>
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
                {c.status_contrato && <Badge variant="secondary" className="text-[10px]" style={{ backgroundColor: `${CONTRATO_STATUS_COLOR[c.status_contrato]}22`, color: CONTRATO_STATUS_COLOR[c.status_contrato] }}>{CONTRATO_STATUS_LABEL[c.status_contrato]}</Badge>}
                {c.dias_para_vencer != null && c.dias_para_vencer <= 90 && <Badge variant={c.dias_para_vencer <= 30 ? "destructive" : "secondary"} className="text-[10px]">vence em {c.dias_para_vencer}d</Badge>}
                <Button variant="ghost" size="icon" className="text-muted-foreground hover:text-destructive" onClick={() => void del(c)}><Trash2 size={14} /></Button>
              </div>
            </div>
            <div className="mt-1 flex flex-wrap gap-2 text-[11px] text-muted-foreground">
              {c.numero && <span>Nº {c.numero}</span>}
              {c.valor != null && <span>· R$ {c.valor.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}{c.tipo_valor ? ` (${CONTRATO_TIPOVALOR_LABEL[c.tipo_valor]})` : ""}</span>}
              <span>· Sustentação: N1 {SUSTENTACAO_LABEL[c.sustentacao_n1]} · N2 {SUSTENTACAO_LABEL[c.sustentacao_n2]} · N3 {SUSTENTACAO_LABEL[c.sustentacao_n3]}</span>
              {c.gestor_nome && <span>· gestor: {c.gestor_nome}</span>}
              {c.fiscal_nome && <span>· fiscal: {c.fiscal_nome}</span>}
              {c.external_link && <a href={c.external_link} target="_blank" rel="noreferrer" className="text-primary underline">· anexo</a>}
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
  // campos novos
  const [numero, setNumero] = useState("")
  const [objeto, setObjeto] = useState("")
  const [statusC, setStatusC] = useState("__none__")
  const [valor, setValor] = useState("")
  const [tipoValor, setTipoValor] = useState("__none__")
  const [centroCusto, setCentroCusto] = useState("")
  const [fiscal, setFiscal] = useState("__none__")
  const [sla, setSla] = useState("")
  const [obs, setObs] = useState("")
  const [linkContrato, setLinkContrato] = useState("")
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!open) return
    Promise.all([produtosApi.listFornecedores().catch(() => []), produtosApi.listPersons().catch(() => [])]).then(([f, p]) => { setFornecedores(f); setPersons(p) })
    setFornecedorId(fornecedorIdDefault); setIdent(""); setIni(""); setFim(""); setRenov(false); setLicenc(""); setGestor("__none__"); setN1("interna"); setN2("interna"); setN3("interna")
    setNumero(""); setObjeto(""); setStatusC("__none__"); setValor(""); setTipoValor("__none__"); setCentroCusto(""); setFiscal("__none__"); setSla(""); setObs(""); setLinkContrato("")
  }, [open, fornecedorIdDefault])

  async function save() {
    if (!fornecedorId || !ini || !fim) { toast.error("Fornecedor e vigências são obrigatórios."); return }
    if (fim <= ini) { toast.error("A vigência final deve ser posterior à inicial."); return }
    setSaving(true)
    try {
      const payload: ContratoCreate = {
        fornecedor_id: fornecedorId, identificador: identificador.trim() || undefined, vigencia_inicio: ini, vigencia_fim: fim,
        renovacao_automatica: renov, modelo_licenciamento: licenc.trim() || undefined,
        gestor_person_id: gestor === "__none__" ? undefined : gestor, sustentacao_n1: n1, sustentacao_n2: n2, sustentacao_n3: n3,
        numero: numero.trim() || undefined, objeto_contratual: objeto.trim() || undefined,
        status_contrato: statusC === "__none__" ? undefined : (statusC as ContratoCreate["status_contrato"]),
        valor: valor ? Number(valor) : undefined,
        tipo_valor: tipoValor === "__none__" ? undefined : (tipoValor as ContratoCreate["tipo_valor"]),
        centro_custo: centroCusto.trim() || undefined, fiscal_person_id: fiscal === "__none__" ? undefined : fiscal,
        sla_contratual: sla.trim() || undefined, observacoes: obs.trim() || undefined, external_link: linkContrato.trim() || undefined,
      }
      await produtosApi.addContrato(productId, payload)
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

          {/* ── Campos contratuais (spec §5) ── */}
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5"><Label>Número do contrato</Label><Input value={numero} onChange={(e) => setNumero(e.target.value)} /></div>
            <div className="space-y-1.5"><Label>Status do contrato</Label>
              <Select value={statusC} onValueChange={setStatusC}>
                <SelectTrigger><SelectValue placeholder="Automático (pela vigência)" /></SelectTrigger>
                <SelectContent><SelectItem value="__none__">Automático (pela vigência)</SelectItem>{CONTRATO_STATUS_OPTS.map((o) => <SelectItem key={o} value={o}>{CONTRATO_STATUS_LABEL[o]}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5"><Label>Valor (R$)</Label><Input type="number" step="0.01" value={valor} onChange={(e) => setValor(e.target.value)} /></div>
            <div className="space-y-1.5"><Label>Tipo de valor</Label>
              <Select value={tipoValor} onValueChange={setTipoValor}>
                <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
                <SelectContent><SelectItem value="__none__">—</SelectItem>{CONTRATO_TIPOVALOR_OPTS.map((o) => <SelectItem key={o} value={o}>{CONTRATO_TIPOVALOR_LABEL[o]}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5"><Label>Centro de custo</Label><Input value={centroCusto} onChange={(e) => setCentroCusto(e.target.value)} /></div>
            <div className="space-y-1.5"><Label>Fiscal técnico</Label>
              <Select value={fiscal} onValueChange={setFiscal}>
                <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
                <SelectContent><SelectItem value="__none__">—</SelectItem>{persons.map((pp) => <SelectItem key={pp.id} value={pp.id}>{pp.full_name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-1.5"><Label>Objeto contratual</Label><Textarea rows={2} value={objeto} onChange={(e) => setObjeto(e.target.value)} /></div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5"><Label>SLA contratual</Label><Input value={sla} onChange={(e) => setSla(e.target.value)} /></div>
            <div className="space-y-1.5"><Label>Link do contrato/anexo</Label><Input value={linkContrato} onChange={(e) => setLinkContrato(e.target.value)} placeholder="https://" /></div>
          </div>
          <div className="space-y-1.5"><Label>Observações</Label><Textarea rows={2} value={obs} onChange={(e) => setObs(e.target.value)} /></div>
        </div>
        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={() => void save()} disabled={saving}>{saving && <Loader2 size={14} className="mr-1.5 animate-spin" />}Criar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function detail(e: unknown): string {
  return (e as { response?: { data?: { detail?: string } } })?.response?.data?.detail || "Falha na operação."
}

const NONE = "__none__"

function Opt({ label, value, onChange, options, placeholder }: { label: string; value: string; onChange: (v: string) => void; options: [string, string][]; placeholder?: string }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs">{label}</Label>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger className="h-9"><SelectValue placeholder={placeholder ?? "—"} /></SelectTrigger>
        <SelectContent><SelectItem value={NONE}>—</SelectItem>{options.map(([v, l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}</SelectContent>
      </Select>
    </div>
  )
}

// ── Releases ──────────────────────────────────
function ReleasesTab({ p, onChange }: { p: Product; onChange: () => void }) {
  const [edit, setEdit] = useState<Release | null>(null)
  const [adding, setAdding] = useState(false)
  async function del(r: Release) { if (confirm(`Remover a release ${r.versao}?`)) { await produtosApi.deleteRelease(p.id, r.id); onChange() } }
  return (
    <div className="space-y-3 pt-3">
      <div className="flex justify-end"><Button size="sm" className="gap-1.5" onClick={() => setAdding(true)}><Plus size={14} /> Nova release</Button></div>
      {p.releases.length === 0 ? <p className="text-sm text-muted-foreground">Nenhuma release registrada.</p> : (
        <div className="space-y-2">{p.releases.map((r) => (
          <div key={r.id} className="rounded-md border p-3">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="text-sm font-medium">v{r.versao}{r.nome && <span className="text-muted-foreground"> · {r.nome}</span>}</p>
                <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[11px] text-muted-foreground">
                  <Badge variant="secondary" className="text-[10px]" style={{ backgroundColor: `${RELEASE_STATUS_COLOR[r.status]}22`, color: RELEASE_STATUS_COLOR[r.status] }}>{RELEASE_STATUS_LABEL[r.status]}</Badge>
                  {r.ambiente && <Badge variant="outline" className="text-[10px]">{RELEASE_AMBIENTE_LABEL[r.ambiente]}</Badge>}
                  {r.tipo && <span>{RELEASE_TIPO_LABEL[r.tipo]}</span>}
                  {r.data_release && <span>· {fmtDate(r.data_release)}</span>}
                  {r.impacto && <span>· impacto {RELEASE_IMPACTO_LABEL[r.impacto]}</span>}
                  {r.tem_rollback && <span>· rollback</span>}
                </div>
                {r.descricao_mudanca && <p className="mt-1 text-xs text-muted-foreground">{r.descricao_mudanca}</p>}
              </div>
              <div className="flex shrink-0 items-center gap-1">
                <Button variant="ghost" size="icon" onClick={() => setEdit(r)}><Pencil size={13} /></Button>
                <Button variant="ghost" size="icon" className="text-muted-foreground hover:text-destructive" onClick={() => void del(r)}><Trash2 size={13} /></Button>
              </div>
            </div>
          </div>
        ))}</div>
      )}
      {(adding || edit) && (
        <ReleaseDialog productId={p.id} release={edit} onClose={() => { setAdding(false); setEdit(null) }} onSaved={() => { setAdding(false); setEdit(null); onChange() }} />
      )}
    </div>
  )
}

function ReleaseDialog({ productId, release, onClose, onSaved }: { productId: string; release: Release | null; onClose: () => void; onSaved: () => void }) {
  const [persons, setPersons] = useState<{ id: string; full_name: string }[]>([])
  const [f, setF] = useState<ReleaseCreate>({
    versao: release?.versao ?? "", nome: release?.nome ?? "", data_release: release?.data_release ?? "",
    ambiente: release?.ambiente ?? null, tipo: release?.tipo ?? null, impacto: release?.impacto ?? null,
    descricao_mudanca: release?.descricao_mudanca ?? "", status: release?.status ?? "planejada",
    responsavel_person_id: release?.responsavel_person_id ?? null, evidencia_link: release?.evidencia_link ?? "",
    changelog: release?.changelog ?? "", tem_rollback: release?.tem_rollback ?? false,
    descricao_rollback: release?.descricao_rollback ?? "", doc_atualizada: release?.doc_atualizada ?? false,
  })
  const [saving, setSaving] = useState(false)
  useEffect(() => { produtosApi.listPersons().then(setPersons).catch(() => setPersons([])) }, [])
  const set = (patch: Partial<ReleaseCreate>) => setF((s) => ({ ...s, ...patch }))
  async function save() {
    if (!f.versao?.trim()) { toast.error("Informe a versão."); return }
    setSaving(true)
    try {
      const payload = { ...f, versao: f.versao.trim() }
      if (release) await produtosApi.updateRelease(productId, release.id, payload)
      else await produtosApi.addRelease(productId, payload)
      toast.success("Release salva."); onSaved()
    } catch (e) { toast.error(detail(e)) } finally { setSaving(false) }
  }
  return (
    <Dialog open onOpenChange={(v) => { if (!v) onClose() }}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader><DialogTitle>{release ? "Editar release" : "Nova release"}</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="space-y-1.5"><Label className="text-xs">Versão *</Label><Input value={f.versao} onChange={(e) => set({ versao: e.target.value })} placeholder="1.0.0" /></div>
            <div className="space-y-1.5 sm:col-span-2"><Label className="text-xs">Nome da release</Label><Input value={f.nome ?? ""} onChange={(e) => set({ nome: e.target.value })} /></div>
            <div className="space-y-1.5"><Label className="text-xs">Data</Label><Input type="date" value={f.data_release ?? ""} onChange={(e) => set({ data_release: e.target.value })} /></div>
            <Opt label="Ambiente" value={f.ambiente ?? NONE} onChange={(v) => set({ ambiente: v === NONE ? null : (v as ReleaseCreate["ambiente"]) })} options={RELEASE_AMBIENTE_OPTS.map((o) => [o, RELEASE_AMBIENTE_LABEL[o]])} />
            <Opt label="Tipo" value={f.tipo ?? NONE} onChange={(v) => set({ tipo: v === NONE ? null : (v as ReleaseCreate["tipo"]) })} options={RELEASE_TIPO_OPTS.map((o) => [o, RELEASE_TIPO_LABEL[o]])} />
            <Opt label="Impacto" value={f.impacto ?? NONE} onChange={(v) => set({ impacto: v === NONE ? null : (v as ReleaseCreate["impacto"]) })} options={RELEASE_IMPACTO_OPTS.map((o) => [o, RELEASE_IMPACTO_LABEL[o]])} />
            <Opt label="Status" value={f.status ?? "planejada"} onChange={(v) => set({ status: v === NONE ? undefined : (v as ReleaseCreate["status"]) })} options={RELEASE_STATUS_OPTS.map((o) => [o, RELEASE_STATUS_LABEL[o]])} />
            <Opt label="Responsável publicação" value={f.responsavel_person_id ?? NONE} onChange={(v) => set({ responsavel_person_id: v === NONE ? null : v })} options={persons.map((x) => [x.id, x.full_name])} />
          </div>
          <div className="space-y-1.5"><Label className="text-xs">Descrição da mudança</Label><Textarea rows={2} value={f.descricao_mudanca ?? ""} onChange={(e) => set({ descricao_mudanca: e.target.value })} /></div>
          <div className="space-y-1.5"><Label className="text-xs">Changelog</Label><Textarea rows={2} value={f.changelog ?? ""} onChange={(e) => set({ changelog: e.target.value })} /></div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5"><Label className="text-xs">Evidência de homologação (link)</Label><Input value={f.evidencia_link ?? ""} onChange={(e) => set({ evidencia_link: e.target.value })} placeholder="https://" /></div>
            <div className="flex items-center gap-4 pt-6">
              <label className="flex items-center gap-1.5 text-sm"><Switch checked={!!f.tem_rollback} onCheckedChange={(v) => set({ tem_rollback: v })} /> Plano de rollback</label>
              <label className="flex items-center gap-1.5 text-sm"><Switch checked={!!f.doc_atualizada} onCheckedChange={(v) => set({ doc_atualizada: v })} /> Doc. atualizada</label>
            </div>
          </div>
          {f.tem_rollback && <div className="space-y-1.5"><Label className="text-xs">Descrição do rollback</Label><Textarea rows={2} value={f.descricao_rollback ?? ""} onChange={(e) => set({ descricao_rollback: e.target.value })} /></div>}
          {f.status === "publicada" && <p className="text-[11px] text-amber-600">Release publicada exige data, ambiente, tipo e descrição da mudança.</p>}
        </div>
        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button onClick={() => void save()} disabled={saving || !f.versao?.trim()}>{saving && <Loader2 size={14} className="mr-1.5 animate-spin" />}Salvar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ── Documentação (Markdown) ───────────────────
function DocumentacaoTab({ p, onChange }: { p: Product; onChange: () => void }) {
  const [edit, setEdit] = useState<Documentation | null>(null)
  const [adding, setAdding] = useState(false)
  const [view, setView] = useState<Documentation | null>(null)
  async function del(d: Documentation) { if (confirm(`Remover a documentação "${d.titulo}"?`)) { await produtosApi.deleteDocumentation(p.id, d.id); onChange() } }
  return (
    <div className="space-y-3 pt-3">
      <div className="flex justify-end"><Button size="sm" className="gap-1.5" onClick={() => setAdding(true)}><Plus size={14} /> Nova documentação</Button></div>
      {p.documentations.length === 0 ? <p className="text-sm text-muted-foreground">Nenhuma documentação.</p> : (
        <div className="space-y-2">{p.documentations.map((d) => (
          <div key={d.id} className="rounded-md border p-3">
            <div className="flex items-start justify-between gap-2">
              <button type="button" className="min-w-0 text-left" onClick={() => setView(d)}>
                <p className="text-sm font-medium text-primary hover:underline">{d.titulo}</p>
                <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[11px] text-muted-foreground">
                  <Badge variant="outline" className="text-[10px]">{DOCNT_TIPO_LABEL[d.tipo]}</Badge>
                  <Badge variant="secondary" className="text-[10px]" style={{ backgroundColor: `${DOCNT_STATUS_COLOR[d.status]}22`, color: DOCNT_STATUS_COLOR[d.status] }}>{DOCNT_STATUS_LABEL[d.status]}</Badge>
                  {d.versao_relacionada && <span>· v{d.versao_relacionada}</span>}
                  {d.autor_nome && <span>· {d.autor_nome}</span>}
                  <span>· atualizado {fmtDate(d.updated_at)}</span>
                </div>
              </button>
              <div className="flex shrink-0 items-center gap-1">
                <Button variant="ghost" size="icon" onClick={() => setEdit(d)}><Pencil size={13} /></Button>
                <Button variant="ghost" size="icon" className="text-muted-foreground hover:text-destructive" onClick={() => void del(d)}><Trash2 size={13} /></Button>
              </div>
            </div>
          </div>
        ))}</div>
      )}
      {(adding || edit) && <DocumentacaoDialog productId={p.id} doc={edit} onClose={() => { setAdding(false); setEdit(null) }} onSaved={() => { setAdding(false); setEdit(null); onChange() }} />}
      {view && (
        <Dialog open onOpenChange={(v) => { if (!v) setView(null) }}>
          <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl">
            <DialogHeader><DialogTitle>{view.titulo}</DialogTitle></DialogHeader>
            <div className="rounded-md border p-4"><MarkdownPreview content={view.conteudo_md ?? ""} /></div>
          </DialogContent>
        </Dialog>
      )}
    </div>
  )
}

function DocumentacaoDialog({ productId, doc, onClose, onSaved }: { productId: string; doc: Documentation | null; onClose: () => void; onSaved: () => void }) {
  const [persons, setPersons] = useState<{ id: string; full_name: string }[]>([])
  const [titulo, setTitulo] = useState(doc?.titulo ?? "")
  const [tipo, setTipo] = useState(doc?.tipo ?? "usuario")
  const [status, setStatus] = useState(doc?.status ?? "em_elaboracao")
  const [versao, setVersao] = useState(doc?.versao_relacionada ?? "")
  const [autor, setAutor] = useState(doc?.autor_person_id ?? NONE)
  const [link, setLink] = useState(doc?.link_interno ?? "")
  const [md, setMd] = useState("")
  const [saving, setSaving] = useState(false)
  useEffect(() => {
    produtosApi.listPersons().then(setPersons).catch(() => setPersons([]))
    if (doc) setMd(doc.conteudo_md ?? "")
    else produtosApi.getDocTemplate().then(setMd).catch(() => setMd(""))
  }, [doc])
  async function save() {
    if (!titulo.trim()) { toast.error("Informe o título."); return }
    setSaving(true)
    try {
      const payload = { titulo: titulo.trim(), tipo, status, versao_relacionada: versao.trim() || null, autor_person_id: autor === NONE ? null : autor, link_interno: link.trim() || null, conteudo_md: md }
      if (doc) await produtosApi.updateDocumentation(productId, doc.id, payload)
      else await produtosApi.addDocumentation(productId, payload)
      toast.success("Documentação salva."); onSaved()
    } catch (e) { toast.error(detail(e)) } finally { setSaving(false) }
  }
  return (
    <Dialog open onOpenChange={(v) => { if (!v) onClose() }}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-4xl">
        <DialogHeader><DialogTitle>{doc ? "Editar documentação" : "Nova documentação"}</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-4">
            <div className="space-y-1.5 sm:col-span-2"><Label className="text-xs">Título *</Label><Input value={titulo} onChange={(e) => setTitulo(e.target.value)} /></div>
            <div className="space-y-1.5"><Label className="text-xs">Tipo</Label>
              <Select value={tipo} onValueChange={(v) => setTipo(v as typeof tipo)}><SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                <SelectContent>{DOCNT_TIPO_OPTS.map((o) => <SelectItem key={o} value={o}>{DOCNT_TIPO_LABEL[o]}</SelectItem>)}</SelectContent></Select>
            </div>
            <div className="space-y-1.5"><Label className="text-xs">Status</Label>
              <Select value={status} onValueChange={(v) => setStatus(v as typeof status)}><SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                <SelectContent>{DOCNT_STATUS_OPTS.map((o) => <SelectItem key={o} value={o}>{DOCNT_STATUS_LABEL[o]}</SelectItem>)}</SelectContent></Select>
            </div>
            <div className="space-y-1.5"><Label className="text-xs">Versão relacionada</Label><Input value={versao} onChange={(e) => setVersao(e.target.value)} /></div>
            <div className="space-y-1.5 sm:col-span-2"><Label className="text-xs">Autor</Label>
              <Select value={autor} onValueChange={setAutor}><SelectTrigger className="h-9"><SelectValue placeholder="—" /></SelectTrigger>
                <SelectContent><SelectItem value={NONE}>—</SelectItem>{persons.map((x) => <SelectItem key={x.id} value={x.id}>{x.full_name}</SelectItem>)}</SelectContent></Select>
            </div>
            <div className="space-y-1.5"><Label className="text-xs">Link público interno</Label><Input value={link} onChange={(e) => setLink(e.target.value)} placeholder="https://" /></div>
          </div>
          <MarkdownEditor value={md} onChange={setMd} />
          {status === "publicada" && !md.trim() && <p className="text-[11px] text-amber-600">Documentação publicada exige conteúdo Markdown preenchido.</p>}
        </div>
        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button onClick={() => void save()} disabled={saving || !titulo.trim()}>{saving && <Loader2 size={14} className="mr-1.5 animate-spin" />}Salvar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ── Sustentação / SLA ─────────────────────────
function SustentacaoTab({ p, onChange }: { p: Product; onChange: () => void }) {
  const s = p.support
  const [f, setF] = useState<SupportUpsert>({
    tipo: s?.tipo ?? null, canal_atendimento: s?.canal_atendimento ?? "", sla_critico: s?.sla_critico ?? "",
    sla_medio: s?.sla_medio ?? "", sla_solicitacao: s?.sla_solicitacao ?? "", equipe_responsavel: s?.equipe_responsavel ?? "",
    horario_suporte: s?.horario_suporte ?? "", escalonamento: s?.escalonamento ?? "", link_base_conhecimento: s?.link_base_conhecimento ?? "",
    observacoes: s?.observacoes ?? "",
  })
  const [saving, setSaving] = useState(false)
  const set = (patch: SupportUpsert) => setF((c) => ({ ...c, ...patch }))
  async function save() {
    setSaving(true)
    try { await produtosApi.upsertSupport(p.id, f); toast.success("Sustentação salva."); onChange() }
    catch (e) { toast.error(detail(e)) } finally { setSaving(false) }
  }
  return (
    <div className="space-y-3 pt-3">
      <div className="grid gap-3 sm:grid-cols-3">
        <Opt label="Tipo de sustentação" value={f.tipo ?? NONE} onChange={(v) => set({ tipo: v === NONE ? null : (v as SupportUpsert["tipo"]) })} options={SUPORTE_TIPO_OPTS.map((o) => [o, SUPORTE_TIPO_LABEL[o]])} />
        <div className="space-y-1.5"><Label className="text-xs">Canal de atendimento</Label><Input value={f.canal_atendimento ?? ""} onChange={(e) => set({ canal_atendimento: e.target.value })} /></div>
        <div className="space-y-1.5"><Label className="text-xs">Equipe responsável</Label><Input value={f.equipe_responsavel ?? ""} onChange={(e) => set({ equipe_responsavel: e.target.value })} /></div>
        <div className="space-y-1.5"><Label className="text-xs">SLA incidente crítico</Label><Input value={f.sla_critico ?? ""} onChange={(e) => set({ sla_critico: e.target.value })} placeholder="Ex.: 2h" /></div>
        <div className="space-y-1.5"><Label className="text-xs">SLA incidente médio</Label><Input value={f.sla_medio ?? ""} onChange={(e) => set({ sla_medio: e.target.value })} /></div>
        <div className="space-y-1.5"><Label className="text-xs">SLA dúvida/solicitação</Label><Input value={f.sla_solicitacao ?? ""} onChange={(e) => set({ sla_solicitacao: e.target.value })} /></div>
        <div className="space-y-1.5"><Label className="text-xs">Horário de suporte</Label><Input value={f.horario_suporte ?? ""} onChange={(e) => set({ horario_suporte: e.target.value })} placeholder="Ex.: 8h-18h" /></div>
        <div className="space-y-1.5 sm:col-span-2"><Label className="text-xs">Link base de conhecimento</Label><Input value={f.link_base_conhecimento ?? ""} onChange={(e) => set({ link_base_conhecimento: e.target.value })} placeholder="https://" /></div>
      </div>
      <div className="space-y-1.5"><Label className="text-xs">Procedimento de escalonamento</Label><Textarea rows={2} value={f.escalonamento ?? ""} onChange={(e) => set({ escalonamento: e.target.value })} /></div>
      <div className="space-y-1.5"><Label className="text-xs">Observações</Label><Textarea rows={2} value={f.observacoes ?? ""} onChange={(e) => set({ observacoes: e.target.value })} /></div>
      <div className="flex justify-end"><Button onClick={() => void save()} disabled={saving}>{saving && <Loader2 size={14} className="mr-1.5 animate-spin" />}Salvar sustentação</Button></div>
    </div>
  )
}

// ── Integrações, dados e segurança ────────────
function SegurancaTab({ p, onChange }: { p: Product; onChange: () => void }) {
  const s = p.security
  const [f, setF] = useState<SecurityUpsert>({
    possui_integracao: s?.possui_integracao ?? false, sistemas_integrados: s?.sistemas_integrados ?? "",
    tipo_integracao: s?.tipo_integracao ?? null, dados_tratados: s?.dados_tratados ?? "",
    dados_pessoais: s?.dados_pessoais ?? false, dados_sensiveis: s?.dados_sensiveis ?? false,
    classificacao: s?.classificacao ?? null, tipo_autenticacao: s?.tipo_autenticacao ?? null,
    perfis_acesso: s?.perfis_acesso ?? "", logs_auditoria: s?.logs_auditoria ?? false, backup: s?.backup ?? false,
    plano_contingencia: s?.plano_contingencia ?? false, risco_indisponibilidade: s?.risco_indisponibilidade ?? null,
    observacoes: s?.observacoes ?? "",
  })
  const [saving, setSaving] = useState(false)
  const set = (patch: SecurityUpsert) => setF((c) => ({ ...c, ...patch }))
  async function save() {
    setSaving(true)
    try { await produtosApi.upsertSecurity(p.id, f); toast.success("Integrações e segurança salvas."); onChange() }
    catch (e) { toast.error(detail(e)) } finally { setSaving(false) }
  }
  const toggle = (label: string, key: keyof SecurityUpsert) => (
    <label className="flex items-center gap-1.5 text-sm"><Switch checked={!!f[key]} onCheckedChange={(v) => set({ [key]: v } as SecurityUpsert)} /> {label}</label>
  )
  return (
    <div className="space-y-3 pt-3">
      <div className="flex flex-wrap gap-4 rounded-md border p-3">
        {toggle("Possui integração", "possui_integracao")}
        {toggle("Dados pessoais", "dados_pessoais")}
        {toggle("Dados sensíveis", "dados_sensiveis")}
        {toggle("Logs de auditoria", "logs_auditoria")}
        {toggle("Backup", "backup")}
        {toggle("Plano de contingência", "plano_contingencia")}
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        <Opt label="Tipo de integração" value={f.tipo_integracao ?? NONE} onChange={(v) => set({ tipo_integracao: v === NONE ? null : (v as SecurityUpsert["tipo_integracao"]) })} options={INTEGRACAO_TIPO_OPTS.map((o) => [o, INTEGRACAO_TIPO_LABEL[o]])} />
        <Opt label="Classificação da informação" value={f.classificacao ?? NONE} onChange={(v) => set({ classificacao: v === NONE ? null : (v as SecurityUpsert["classificacao"]) })} options={(["publica", "interna", "confidencial", "restrita"] as const).map((o) => [o, CLASSIFICACAO_LABEL[o]])} />
        <Opt label="Tipo de autenticação" value={f.tipo_autenticacao ?? NONE} onChange={(v) => set({ tipo_autenticacao: v === NONE ? null : (v as SecurityUpsert["tipo_autenticacao"]) })} options={AUTENTICACAO_TIPO_OPTS.map((o) => [o, AUTENTICACAO_TIPO_LABEL[o]])} />
        <Opt label="Risco de indisponibilidade" value={f.risco_indisponibilidade ?? NONE} onChange={(v) => set({ risco_indisponibilidade: v === NONE ? null : (v as SecurityUpsert["risco_indisponibilidade"]) })} options={RISCO_OPTS.map((o) => [o, RISCO_LABEL[o]])} />
        <div className="space-y-1.5 sm:col-span-2"><Label className="text-xs">Perfis de acesso</Label><Input value={f.perfis_acesso ?? ""} onChange={(e) => set({ perfis_acesso: e.target.value })} /></div>
      </div>
      <div className="space-y-1.5"><Label className="text-xs">Sistemas integrados</Label><Textarea rows={2} value={f.sistemas_integrados ?? ""} onChange={(e) => set({ sistemas_integrados: e.target.value })} /></div>
      <div className="space-y-1.5"><Label className="text-xs">Dados tratados</Label><Textarea rows={2} value={f.dados_tratados ?? ""} onChange={(e) => set({ dados_tratados: e.target.value })} /></div>
      <div className="space-y-1.5"><Label className="text-xs">Observações</Label><Textarea rows={2} value={f.observacoes ?? ""} onChange={(e) => set({ observacoes: e.target.value })} /></div>
      <div className="flex justify-end"><Button onClick={() => void save()} disabled={saving}>{saving && <Loader2 size={14} className="mr-1.5 animate-spin" />}Salvar segurança</Button></div>
    </div>
  )
}
