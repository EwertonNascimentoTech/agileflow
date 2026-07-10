import { useEffect, useState } from "react"
import { useNavigate, useParams, useSearchParams } from "react-router-dom"
import { AlertTriangle, ArrowLeft, CheckCircle2, Download, ExternalLink, FileText, Link2, Loader2, MinusCircle, Paperclip, Pencil, Plus, ShieldAlert, Trash2, Workflow, XCircle } from "lucide-react"

import {
  produtosApi, type AnexoItem, type Contrato, type ContratoCreate, type ContratoUpdate, type Documento, type Documentation,
  type PersonMini, type Product, type ProductHealth, type Release, type ReleaseCreate, type Servico,
  type ServicoStatus, type Support, type SupportCreate, type SupportNivel,
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
import { nullableStr } from "@/lib/utils"
import { ProductFormDialog } from "@/modules/produtos/ProductFormDialog"
import { DefinirFornecedorDialog } from "@/modules/produtos/DefinirFornecedorDialog"
import ServiceProcessLinksDialog from "@/modules/produtos/ServiceProcessLinksDialog"
import MarkdownEditor, { MarkdownPreview } from "@/modules/produtos/components/MarkdownEditor"
import {
  CATEGORIA_LABEL, CONTRATO_STATUS_COLOR, CONTRATO_STATUS_LABEL, CONTRATO_STATUS_OPTS,
  CONTRATO_TIPOVALOR_LABEL, CONTRATO_TIPOVALOR_OPTS, CRITICIDADE_COLOR, CRITICIDADE_LABEL, DOC_FORMATO_LABEL,
  DOCNT_STATUS_COLOR, DOCNT_STATUS_LABEL, DOCNT_STATUS_OPTS, DOCNT_TIPO_LABEL, DOCNT_TIPO_OPTS, LIFECYCLE_LABEL,
  NIVEL_LGPD_LABEL, NIVEL_LGPD_OPTS,
  RELEASE_AMBIENTE_LABEL, RELEASE_AMBIENTE_OPTS, RELEASE_IMPACTO_LABEL, RELEASE_IMPACTO_OPTS,
  RELEASE_STATUS_COLOR, RELEASE_STATUS_LABEL, RELEASE_STATUS_OPTS, RELEASE_TIPO_LABEL, RELEASE_TIPO_OPTS,
  SERVICO_STATUS_LABEL, SERVICO_STATUS_OPTS,
  STATUS_COLOR, STATUS_LABEL, SAUDE_COLOR, SAUDE_LABEL, TIPODEV_LABEL,
  UNIDADE_LABEL,
} from "@/modules/produtos/constants"

const NONE = "__none__"
function fmtDate(iso: string | null) { return iso ? new Date(iso).toLocaleDateString("pt-BR") : "—" }

export default function ProductDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const initialTab = (() => {
    const tab = searchParams.get("tab")
    if (tab === "releases" || tab === "geral" || tab === "servicos" || tab === "documentos"
      || tab === "contratos" || tab === "documentacao" || tab === "sustentacao") {
      return tab
    }
    return "geral"
  })()
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

  const trataDados = p.documentos.some((d) => d.dados_pessoais || d.dados_sensiveis)
  const trataSensiveis = p.documentos.some((d) => d.dados_sensiveis)
  // sinais de produto crítico (spec §11.5)
  const criticalGaps: string[] = []
  if (p.criticidade === "critica") {
    if (!p.documentations.some((d) => d.status === "publicada")) criticalGaps.push("documentação publicada")
    if (!p.supports.some((s) => (s.canal_atendimento ?? "").trim())) criticalGaps.push("canal de suporte")
    const hasSla = p.supports.some((s) => s.sla_horas != null) || p.contratos.some((c) => c.sla_contratual)
    if (!hasSla) criticalGaps.push("SLA definido")
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

      <Tabs defaultValue={initialTab} key={initialTab}>
        <TabsList className="flex-wrap">
          <TabsTrigger value="geral">Geral</TabsTrigger>
          <TabsTrigger value="servicos">Serviços ({p.servicos.length})</TabsTrigger>
          <TabsTrigger value="documentos">Documentos ({p.documentos.length})</TabsTrigger>
          <TabsTrigger value="contratos">Contratos ({p.contratos.length})</TabsTrigger>
          <TabsTrigger value="releases">Releases ({p.releases.length})</TabsTrigger>
          <TabsTrigger value="documentacao">Documentação ({p.documentations.length})</TabsTrigger>
          <TabsTrigger value="sustentacao">Sustentação</TabsTrigger>
        </TabsList>

        <TabsContent value="geral"><GeralTab p={p} onChange={reload} /></TabsContent>
        <TabsContent value="servicos"><ServicosTab p={p} onChange={reload} /></TabsContent>
        <TabsContent value="documentos"><DocumentosTab p={p} onChange={reload} /></TabsContent>
        <TabsContent value="contratos"><ContratosTab p={p} onChange={reload} /></TabsContent>
        <TabsContent value="releases"><ReleasesTab p={p} onChange={reload} /></TabsContent>
        <TabsContent value="documentacao"><DocumentacaoTab p={p} onChange={reload} /></TabsContent>
        <TabsContent value="sustentacao"><SustentacaoTab p={p} onChange={reload} /></TabsContent>
      </Tabs>

      <ProductFormDialog open={editing} onOpenChange={setEditing} product={p} onSaved={() => { setEditing(false); void reload() }} />
    </div>
  )
}

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return <div><p className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">{label}</p><p className="text-sm">{value || "—"}</p></div>
}

function HealthChecklist({ health }: { health: ProductHealth }) {
  // Ordena: o que falta (fail) primeiro, depois o que passou, por último os não aplicáveis.
  const rank = { fail: 0, pass: 1, na: 2 } as const
  const checks = [...health.checks].sort((a, b) => (rank[a.status] - rank[b.status]) || (b.weight - a.weight))
  const fails = health.checks.filter((c) => c.status === "fail").length
  const color = SAUDE_COLOR[health.classe]
  return (
    <div className="rounded-lg border p-3">
      <div className="mb-2 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="inline-flex min-w-[2.5rem] items-center justify-center rounded-full border px-2 py-0.5 text-sm font-bold tabular-nums"
            style={{ backgroundColor: `${color}1a`, color, borderColor: `${color}55` }}>{health.score}</span>
          <div>
            <p className="text-sm font-semibold">Saúde: {SAUDE_LABEL[health.classe]}</p>
            <p className="text-[11px] text-muted-foreground">{health.passed_weight}/{health.applicable_weight} pts dos critérios aplicáveis</p>
          </div>
        </div>
        {fails > 0
          ? <Badge variant="secondary" className="bg-amber-100 text-[10px] text-amber-800">{fails} critério(s) p/ chegar a 100</Badge>
          : <Badge variant="secondary" className="bg-emerald-100 text-[10px] text-emerald-800">Nada pendente</Badge>}
      </div>
      <ul className="space-y-1">
        {checks.map((c) => {
          const Icon = c.status === "pass" ? CheckCircle2 : c.status === "fail" ? XCircle : MinusCircle
          const cls = c.status === "pass" ? "text-emerald-600" : c.status === "fail" ? "text-red-600" : "text-muted-foreground/60"
          return (
            <li key={c.code} className="flex items-center gap-2 text-sm">
              <Icon size={15} className={`shrink-0 ${cls}`} />
              <span className={c.status === "na" ? "text-muted-foreground" : c.status === "fail" ? "font-medium" : ""}>{c.label}</span>
              <span className="ml-auto text-[10px] text-muted-foreground">{c.status === "na" ? "não se aplica" : `${c.weight} pts`}</span>
            </li>
          )
        })}
      </ul>
    </div>
  )
}

function GeralTab({ p, onChange }: { p: Product; onChange: () => void }) {
  const [fornecedorOpen, setFornecedorOpen] = useState(false)
  const link = (url: string | null) => url ? <a href={url} target="_blank" rel="noreferrer" className="text-primary underline">abrir</a> : null
  return (
    <div className="space-y-4 pt-3">
      {p.health && <HealthChecklist health={p.health} />}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      <Field label="Categoria" value={p.categoria ? CATEGORIA_LABEL[p.categoria] : null} />
      <Field label="Ciclo de vida" value={LIFECYCLE_LABEL[p.lifecycle]} />
      <Field label="Produto corporativo" value={p.corporativo ? "Sim" : "Não"} />
      {!p.corporativo && <Field label="Responsável (PO)" value={p.responsavel?.full_name} />}
      <Field label="Responsável técnico" value={p.responsavel_tecnico?.full_name} />
      <div>
        <p className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">Fornecedor</p>
        <div className="mt-0.5 flex flex-wrap items-center gap-2">
          <p className="text-sm">{p.fornecedor?.nome ?? "—"}</p>
          <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => setFornecedorOpen(true)}>
            {p.fornecedor ? "Alterar" : "Definir"}
          </Button>
        </div>
      </div>
      <Field label="Login Idigital" value={p.login_idigital ? "Sim" : "Não"} />
      <Field label="Repositório" value={link(p.link_repositorio)} />
      <Field label="Ambiente DEV" value={link(p.link_dev)} />
      <Field label="Ambiente HML" value={link(p.link_hml)} />
      <Field label="Ambiente PRD" value={link(p.link_prd)} />
      <div className="sm:col-span-2 lg:col-span-3"><Field label="Stacks" value={p.stacks.length ? p.stacks.map((s) => s.name).join(", ") : null} /></div>
      <div className="sm:col-span-2 lg:col-span-3"><Field label="Descrição" value={p.description} /></div>
      </div>
      <DefinirFornecedorDialog
        open={fornecedorOpen}
        onOpenChange={setFornecedorOpen}
        productId={p.id}
        productName={p.name}
        fornecedorAtualId={p.fornecedor?.id}
        onSaved={onChange}
      />
    </div>
  )
}


function ServicosTab({ p, onChange }: { p: Product; onChange: () => void }) {
  const today = new Date().toISOString().slice(0, 10)
  const [name, setName] = useState("")
  const [description, setDescription] = useState("")
  const [dataPublicacao, setDataPublicacao] = useState(today)
  const [statusSvc, setStatusSvc] = useState<ServicoStatus>("ativo")
  const [responsavelId, setResponsavelId] = useState(NONE)
  const [pos, setPos] = useState<{ id: string; full_name: string }[]>([])
  const [adding, setAdding] = useState(false)
  const [linkSvc, setLinkSvc] = useState<Servico | null>(null)
  const [editSvc, setEditSvc] = useState<Servico | null>(null)

  useEffect(() => {
    if (!p.corporativo) return
    produtosApi.listPos().then(setPos).catch(() => setPos([]))
  }, [p.corporativo])

  async function add() {
    if (!name.trim()) return
    if (p.corporativo && responsavelId === NONE) {
      toast.error("Informe o Responsável (PO) do serviço.")
      return
    }
    setAdding(true)
    try {
      await produtosApi.addServico(p.id, {
        name: name.trim(),
        description: description.trim() || null,
        data_publicacao: dataPublicacao || today,
        status_servico: statusSvc,
        responsavel_person_id: p.corporativo ? responsavelId : undefined,
      })
      setName("")
      setDescription("")
      setDataPublicacao(today)
      setStatusSvc("ativo")
      setResponsavelId(NONE)
      onChange()
    } finally { setAdding(false) }
  }
  async function del(s: Servico) { if (confirm(`Inativar o serviço "${s.name}"?`)) { await produtosApi.deleteServico(p.id, s.id); onChange() } }
  const canAdd = name.trim() && (!p.corporativo || responsavelId !== NONE)
  return (
    <div className="space-y-3 pt-3">
      <div className="space-y-3 rounded-md border p-3">
        <div className="space-y-1"><Label className="text-xs">Nome do serviço</Label><Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex.: Emissão de certidão" /></div>
        <div className="space-y-1"><Label className="text-xs">Descrição</Label><Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} placeholder="Descreva o serviço digital" /></div>
        <div className="flex flex-wrap items-end gap-2">
          <div className="space-y-1"><Label className="text-xs">Data da publicação</Label><Input type="date" value={dataPublicacao} onChange={(e) => setDataPublicacao(e.target.value)} /></div>
          <div className="space-y-1"><Label className="text-xs">Status</Label>
            <Select value={statusSvc} onValueChange={(v) => setStatusSvc(v as ServicoStatus)}><SelectTrigger className="h-9 w-44"><SelectValue /></SelectTrigger>
              <SelectContent>{SERVICO_STATUS_OPTS.map((o) => <SelectItem key={o} value={o}>{SERVICO_STATUS_LABEL[o]}</SelectItem>)}</SelectContent></Select>
          </div>
          {p.corporativo && (
            <div className="min-w-[200px] flex-1 space-y-1">
              <Label className="text-xs">Responsável (PO) *</Label>
              <Select value={responsavelId} onValueChange={setResponsavelId}>
                <SelectTrigger className="h-9"><SelectValue placeholder="Selecione o PO" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>—</SelectItem>
                  {pos.map((po) => <SelectItem key={po.id} value={po.id}>{po.full_name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          )}
          <Button className="gap-1.5" onClick={() => void add()} disabled={adding || !canAdd}><Plus size={14} /> Adicionar</Button>
        </div>
      </div>
      {p.servicos.length === 0 ? <p className="text-sm text-muted-foreground">Nenhum serviço.</p> : (
        <div className="space-y-2">{p.servicos.map((s) => (
          <div key={s.id} className="rounded-md border p-2.5">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="text-sm font-medium">{s.name}</p>
                {s.description && <p className="text-xs text-muted-foreground line-clamp-2">{s.description}</p>}
                <p className="text-[11px] text-muted-foreground">
                  Publicado em {fmtDate(s.data_publicacao ?? `${s.ano_referencia}-01-01`)}
                  {p.corporativo && s.responsavel?.full_name && <> · PO: {s.responsavel.full_name}</>}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                {s.status_servico && <Badge variant="outline" className="text-[10px]">{SERVICO_STATUS_LABEL[s.status_servico]}</Badge>}
                {s.sem_subprocesso_disponivel && (s.process_links?.length ?? 0) === 0 && (
                  <Badge variant="secondary" className="bg-amber-100 text-[10px] text-amber-800">Sem sub-processo</Badge>
                )}
                <Button variant="ghost" size="icon" title="Editar serviço" onClick={() => setEditSvc(s)}><Pencil size={14} /></Button>
                <Button variant="ghost" size="icon" className="text-muted-foreground hover:text-destructive" onClick={() => void del(s)}><Trash2 size={14} /></Button>
              </div>
            </div>
            <div className="mt-2.5 border-t pt-2.5">
              <div className="mb-1.5 flex items-center justify-between gap-2">
                <p className="text-[11px] font-medium text-muted-foreground">
                  Sub-processos vinculados ({s.process_links?.length ?? 0})
                </p>
                <Button variant="outline" size="sm" className="h-7 gap-1 text-xs" onClick={() => setLinkSvc(s)}>
                  <Link2 size={12} /> Vincular
                </Button>
              </div>
              {(s.process_links?.length ?? 0) === 0 ? (
                <p className="text-[11px] text-muted-foreground">
                  {s.sem_subprocesso_disponivel
                    ? "Sem vínculo — declarado indisponível no portfólio."
                    : "Nenhum sub-processo vinculado."}
                </p>
              ) : (
                <ul className="space-y-1">
                  {(s.process_links ?? []).map((lk) => {
                    const label = lk.codigo ? `${lk.codigo} · ${lk.name ?? "Sub-processo"}` : (lk.name ?? "Sub-processo")
                    return (
                      <li key={lk.item_lineage_id} className="flex items-start gap-1.5 text-xs text-foreground">
                        <Workflow size={12} className="mt-0.5 shrink-0 text-muted-foreground" />
                        <span className="leading-snug">{label}</span>
                      </li>
                    )
                  })}
                </ul>
              )}
            </div>
          </div>
        ))}</div>
      )}
      {linkSvc && (
        <ServiceProcessLinksDialog
          productId={p.id}
          servicoId={linkSvc.id}
          servicoName={linkSvc.name}
          semSubprocessoInicial={linkSvc.sem_subprocesso_disponivel}
          justificativaInicial={linkSvc.justificativa_sem_subprocesso ?? ""}
          onClose={() => setLinkSvc(null)}
          onSaved={onChange}
        />
      )}
      {editSvc && (
        <ServicoDialog
          productId={p.id}
          corporativo={p.corporativo}
          servico={editSvc}
          onClose={() => setEditSvc(null)}
          onSaved={() => { setEditSvc(null); onChange() }}
        />
      )}
    </div>
  )
}

function detectDocumentoFormato(filename: string, contentType?: string): string | undefined {
  const extMap: Record<string, string> = {
    ".pdf": "pdf", ".xlsx": "xlsx", ".xls": "xls", ".docx": "docx", ".doc": "doc",
    ".xml": "xml", ".csv": "csv", ".txt": "txt",
    ".png": "imagem", ".jpg": "imagem", ".jpeg": "imagem", ".gif": "imagem",
    ".webp": "imagem", ".svg": "imagem", ".bmp": "imagem",
  }
  const dot = filename.lastIndexOf(".")
  if (dot >= 0) {
    const ext = filename.slice(dot).toLowerCase()
    if (extMap[ext]) return extMap[ext]
  }
  if (contentType) {
    const ct = contentType.split(";")[0].trim().toLowerCase()
    const mimeMap: Record<string, string> = {
      "application/pdf": "pdf",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "xlsx",
      "application/vnd.ms-excel": "xls",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
      "application/msword": "doc",
      "application/xml": "xml", "text/xml": "xml",
      "text/csv": "csv", "text/plain": "txt",
      "image/png": "imagem", "image/jpeg": "imagem", "image/gif": "imagem",
      "image/webp": "imagem", "image/svg+xml": "imagem", "image/bmp": "imagem",
    }
    return mimeMap[ct]
  }
  return undefined
}

function docNivelLgpd(d: Documento): string {
  if (d.nivel_dados_pessoais) return NIVEL_LGPD_LABEL[d.nivel_dados_pessoais]
  if (d.dados_sensiveis) return NIVEL_LGPD_LABEL.dados_pessoais_sensiveis
  if (d.dados_pessoais) return NIVEL_LGPD_LABEL.dados_pessoais
  return NIVEL_LGPD_LABEL.sem_dados_pessoais
}

function DocumentosTab({ p, onChange }: { p: Product; onChange: () => void }) {
  const today = new Date().toISOString().slice(0, 10)
  const [name, setName] = useState("")
  const [dataDocumento, setDataDocumento] = useState(today)
  const [link, setLink] = useState("")
  const [nivelLgpd, setNivelLgpd] = useState("sem_dados_pessoais")
  const [observacoes, setObservacoes] = useState("")
  const [formatoDetectado, setFormatoDetectado] = useState<string | null>(null)
  const [upload, setUpload] = useState<{ object_name: string; filename: string; content_type: string; size: number } | null>(null)
  const [uploading, setUploading] = useState(false)
  const [adding, setAdding] = useState(false)
  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]; e.target.value = ""; if (!f) return
    setUploading(true)
    try {
      const m = await produtosApi.uploadFile(f)
      setUpload(m)
      setFormatoDetectado(detectDocumentoFormato(f.name, f.type) ?? null)
      if (!name.trim()) setName(f.name)
    } catch { toast.error("Falha no upload.") } finally { setUploading(false) }
  }
  function resetForm() {
    setName(""); setDataDocumento(today); setLink(""); setUpload(null); setFormatoDetectado(null)
    setNivelLgpd("sem_dados_pessoais"); setObservacoes("")
  }
  async function add() {
    if (!name.trim() || (!upload && !link.trim())) { toast.error("Informe nome e arquivo ou link."); return }
    setAdding(true)
    try {
      await produtosApi.addDocumento(p.id, {
        name: name.trim(),
        data_documento: dataDocumento || today,
        object_name: upload?.object_name,
        filename: upload?.filename,
        content_type: upload?.content_type,
        size: upload?.size,
        external_link: link.trim() || undefined,
        formato: formatoDetectado ?? undefined,
        nivel_dados_pessoais: nivelLgpd as Documento["nivel_dados_pessoais"],
        observacoes: observacoes.trim() || undefined,
      })
      resetForm(); onChange()
    } catch { toast.error("Falha ao adicionar.") } finally { setAdding(false) }
  }
  async function open(d: Documento) {
    if (d.object_name) { const u = await produtosApi.getUploadUrl(d.object_name); if (u) window.open(u, "_blank", "noopener") }
    else if (d.external_link) window.open(d.external_link, "_blank", "noopener")
  }
  async function del(d: Documento) { if (confirm(`Inativar "${d.name}"?`)) { await produtosApi.deleteDocumento(p.id, d.id); onChange() } }
  const canAdd = name.trim() && (upload || link.trim())
  return (
    <div className="space-y-3 pt-3">
      <div className="rounded-lg border bg-muted/20 p-4">
        <p className="mb-3 text-sm font-medium">Novo documento</p>
        <div className="space-y-3">
          <div className="grid gap-3 lg:grid-cols-2">
            <div className="space-y-1.5">
              <Label className="text-xs">Nome / Título do documento</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex.: Relatório anual de indicadores" />
            </div>
            <div className="grid gap-3 sm:grid-cols-2 content-start">
              <div className="space-y-1.5">
                <Label className="text-xs">Data do documento</Label>
                <Input type="date" value={dataDocumento} onChange={(e) => setDataDocumento(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Nível de dados pessoais (LGPD)</Label>
                <Select value={nivelLgpd} onValueChange={setNivelLgpd}>
                  <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {NIVEL_LGPD_OPTS.map((o) => <SelectItem key={o} value={o}>{NIVEL_LGPD_LABEL[o]}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Descrição / Observação <span className="font-normal text-muted-foreground">(opcional)</span></Label>
            <Textarea rows={3} className="w-full" value={observacoes} onChange={(e) => setObservacoes(e.target.value)} placeholder="Texto curto para facilitar buscas futuras" />
          </div>
        </div>

        <div className="mt-3 space-y-1.5">
          <Label className="text-xs">Arquivo ou link externo</Label>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-stretch">
            <label
              className={`flex min-h-9 flex-1 cursor-pointer items-center gap-2 rounded-md border border-dashed bg-background px-3 py-2 text-sm text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground ${uploading ? "pointer-events-none opacity-60" : ""}`}
            >
              {uploading ? <Loader2 size={14} className="shrink-0 animate-spin" /> : <Paperclip size={14} className="shrink-0" />}
              <span className="truncate">{upload ? upload.filename : uploading ? "Enviando…" : "Clique para anexar arquivo"}</span>
              <input type="file" className="hidden" onChange={onFile} disabled={uploading} />
            </label>
            <div className="flex min-h-9 flex-[1.2] items-center gap-2">
              <span className="hidden shrink-0 text-xs text-muted-foreground sm:inline">ou</span>
              <Input
                className="h-9 flex-1"
                value={link}
                onChange={(e) => setLink(e.target.value)}
                placeholder="https://…"
              />
              {formatoDetectado && (
                <Badge variant="secondary" className="h-9 shrink-0 px-2.5 text-xs font-normal">
                  {DOC_FORMATO_LABEL[formatoDetectado as keyof typeof DOC_FORMATO_LABEL] ?? formatoDetectado.toUpperCase()}
                </Badge>
              )}
              {upload && (
                <Button type="button" variant="ghost" size="icon" className="h-9 w-9 shrink-0 text-muted-foreground" onClick={() => { setUpload(null); setFormatoDetectado(null) }}>
                  <Trash2 size={14} />
                </Button>
              )}
            </div>
          </div>
        </div>

        <div className="mt-3 flex justify-end">
          <Button className="gap-1.5" onClick={() => void add()} disabled={adding || !canAdd}>
            {adding ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
            Adicionar documento
          </Button>
        </div>
      </div>
      {p.documentos.length === 0 ? <p className="text-sm text-muted-foreground">Nenhum documento.</p> : (
        <div className="space-y-2">{p.documentos.map((d) => (
          <div key={d.id} className="flex items-center justify-between gap-2 rounded-md border p-2.5">
            <button type="button" className="flex min-w-0 flex-col gap-0.5 text-left" onClick={() => void open(d)}>
              <span className="flex min-w-0 items-center gap-2">
                {d.object_name ? <FileText size={15} className="shrink-0 text-muted-foreground" /> : <Link2 size={15} className="shrink-0 text-muted-foreground" />}
                <span className="truncate text-sm font-medium text-primary hover:underline">{d.name}</span>
              </span>
              {d.observacoes && (
                <span className="truncate pl-[23px] text-[11px] text-muted-foreground">{d.observacoes}</span>
              )}
            </button>
            <div className="flex flex-wrap items-center justify-end gap-1">
              {d.formato && <Badge variant="outline" className="text-[10px]">{DOC_FORMATO_LABEL[d.formato as keyof typeof DOC_FORMATO_LABEL] ?? d.formato.toUpperCase()}</Badge>}
              {(d.nivel_dados_pessoais !== "sem_dados_pessoais" || d.dados_pessoais || d.dados_sensiveis) && (
                <Badge variant="secondary" className="gap-0.5 bg-amber-100 text-[10px] text-amber-800">
                  <ShieldAlert size={10} />{docNivelLgpd(d)}
                </Badge>
              )}
              <Badge variant="outline" className="text-[10px]">{fmtDate(d.data_documento ?? `${d.ano_referencia}-01-01`)}</Badge>
              <Button variant="ghost" size="icon" onClick={() => void open(d)}><Download size={14} /></Button>
              <Button variant="ghost" size="icon" className="text-muted-foreground hover:text-destructive" onClick={() => void del(d)}><Trash2 size={14} /></Button>
            </div>
          </div>
        ))}</div>
      )}
    </div>
  )
}

function ContratosTab({ p, onChange }: { p: Product; onChange: () => void }) {
  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState<Contrato | null>(null)

  function openNew() { setEditing(null); setOpen(true) }
  function openEdit(c: Contrato) { setEditing(c); setOpen(true) }

  async function del(c: Contrato) { if (confirm("Inativar este contrato?")) { await produtosApi.deleteContrato(p.id, c.id); onChange() } }
  return (
    <div className="space-y-3 pt-3">
      <div className="flex justify-end"><Button size="sm" className="gap-1.5" onClick={openNew}><Plus size={14} /> Novo contrato</Button></div>
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
                <Button variant="ghost" size="icon" title="Editar contrato" onClick={() => openEdit(c)}><Pencil size={14} /></Button>
                <Button variant="ghost" size="icon" className="text-muted-foreground hover:text-destructive" title="Inativar contrato" onClick={() => void del(c)}><Trash2 size={14} /></Button>
              </div>
            </div>
            <div className="mt-1 flex flex-wrap gap-2 text-[11px] text-muted-foreground">
              {c.numero && <span>Nº {c.numero}</span>}
              {c.valor != null && <span>· R$ {c.valor.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}{c.tipo_valor ? ` (${CONTRATO_TIPOVALOR_LABEL[c.tipo_valor]})` : ""}</span>}
              {c.gestor_nome && <span>· gestor: {c.gestor_nome}</span>}
              {c.object_name ? (
                <button type="button" className="text-primary underline" onClick={async () => { const u = await produtosApi.getUploadUrl(c.object_name!); if (u) window.open(u, "_blank", "noopener") }}>· anexo{c.filename ? ` (${c.filename})` : ""}</button>
              ) : c.external_link ? (
                <a href={c.external_link} target="_blank" rel="noreferrer" className="text-primary underline">· anexo</a>
              ) : null}
            </div>
          </div>
        ))}</div>
      )}
      <ContratoDialog
        open={open}
        onOpenChange={(v) => { setOpen(v); if (!v) setEditing(null) }}
        productId={p.id}
        fornecedorIdDefault={p.fornecedor?.id ?? ""}
        contrato={editing}
        onSaved={() => { setOpen(false); setEditing(null); onChange() }}
      />
    </div>
  )
}

function ContratoDialog({ open, onOpenChange, productId, fornecedorIdDefault, contrato, onSaved }: {
  open: boolean; onOpenChange: (v: boolean) => void; productId: string; fornecedorIdDefault: string
  contrato?: Contrato | null; onSaved: () => void
}) {
  const editing = !!contrato
  const [fornecedores, setFornecedores] = useState<{ id: string; nome: string }[]>([])
  const [persons, setPersons] = useState<{ id: string; full_name: string }[]>([])
  const [fornecedorId, setFornecedorId] = useState(fornecedorIdDefault)
  const [identificador, setIdent] = useState("")
  const [ini, setIni] = useState("")
  const [fim, setFim] = useState("")
  const [licenc, setLicenc] = useState("")
  const [gestor, setGestor] = useState("__none__")
  // campos novos
  const [numero, setNumero] = useState("")
  const [objeto, setObjeto] = useState("")
  const [statusC, setStatusC] = useState("__none__")
  const [valor, setValor] = useState("")
  const [tipoValor, setTipoValor] = useState("__none__")
  const [centroCusto, setCentroCusto] = useState("")
  const [sla, setSla] = useState("")
  const [obs, setObs] = useState("")
  const [anexo, setAnexo] = useState<AnexoItem | null>(null)
  const [anexoRemovido, setAnexoRemovido] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!open) return
    Promise.all([produtosApi.listFornecedores().catch(() => []), produtosApi.listPersons().catch(() => [])]).then(([f, p]) => { setFornecedores(f); setPersons(p) })
    if (contrato) {
      setFornecedorId(contrato.fornecedor_id)
      setIdent(contrato.identificador ?? "")
      setIni(contrato.vigencia_inicio)
      setFim(contrato.vigencia_fim)
      setLicenc(contrato.modelo_licenciamento ?? "")
      setGestor(contrato.gestor_person_id ?? "__none__")
      setNumero(contrato.numero ?? "")
      setObjeto(contrato.objeto_contratual ?? "")
      setStatusC(contrato.status_contrato ?? "__none__")
      setValor(contrato.valor != null ? String(contrato.valor) : "")
      setTipoValor(contrato.tipo_valor ?? "__none__")
      setCentroCusto(contrato.centro_custo ?? "")
      setSla(contrato.sla_contratual ?? "")
      setObs(contrato.observacoes ?? "")
      setAnexo(contrato.object_name && contrato.filename
        ? { object_name: contrato.object_name, filename: contrato.filename, content_type: null, size: null }
        : null)
      setAnexoRemovido(false)
    } else {
      setFornecedorId(fornecedorIdDefault); setIdent(""); setIni(""); setFim(""); setLicenc(""); setGestor("__none__")
      setNumero(""); setObjeto(""); setStatusC("__none__"); setValor(""); setTipoValor("__none__"); setCentroCusto(""); setSla(""); setObs(""); setAnexo(null)
      setAnexoRemovido(false)
    }
  }, [open, fornecedorIdDefault, contrato])

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]; e.target.value = ""; if (!f) return
    setUploading(true)
    try { setAnexo(await produtosApi.uploadFile(f)); setAnexoRemovido(false) }
    catch { toast.error("Falha no upload.") } finally { setUploading(false) }
  }

  async function save() {
    if (!editing && !fornecedorId) { toast.error("Fornecedor é obrigatório."); return }
    if (!ini || !fim) { toast.error("Vigências são obrigatórias."); return }
    if (fim <= ini) { toast.error("A vigência final deve ser posterior à inicial."); return }
    setSaving(true)
    try {
      if (editing && contrato) {
        const payload: ContratoUpdate = {
          identificador: nullableStr(identificador),
          vigencia_inicio: ini,
          vigencia_fim: fim,
          modelo_licenciamento: nullableStr(licenc),
          gestor_person_id: gestor === "__none__" ? null : gestor,
          numero: nullableStr(numero),
          objeto_contratual: nullableStr(objeto),
          status_contrato: statusC === "__none__" ? null : (statusC as ContratoCreate["status_contrato"]),
          valor: valor ? Number(valor) : null,
          tipo_valor: tipoValor === "__none__" ? null : (tipoValor as ContratoCreate["tipo_valor"]),
          centro_custo: nullableStr(centroCusto),
          sla_contratual: nullableStr(sla),
          observacoes: nullableStr(obs),
        }
        if (anexo) {
          payload.object_name = anexo.object_name
          payload.filename = anexo.filename
          payload.content_type = anexo.content_type ?? undefined
          payload.size = anexo.size ?? undefined
        } else if (anexoRemovido) {
          payload.object_name = null
          payload.filename = null
          payload.content_type = null
          payload.size = null
        }
        await produtosApi.updateContrato(productId, contrato.id, payload)
        toast.success("Contrato atualizado.")
      } else {
        const payload: ContratoCreate = {
          fornecedor_id: fornecedorId, identificador: identificador.trim() || undefined, vigencia_inicio: ini, vigencia_fim: fim,
          modelo_licenciamento: licenc.trim() || undefined,
          gestor_person_id: gestor === "__none__" ? undefined : gestor,
          numero: numero.trim() || undefined, objeto_contratual: objeto.trim() || undefined,
          status_contrato: statusC === "__none__" ? undefined : (statusC as ContratoCreate["status_contrato"]),
          valor: valor ? Number(valor) : undefined,
          tipo_valor: tipoValor === "__none__" ? undefined : (tipoValor as ContratoCreate["tipo_valor"]),
          centro_custo: centroCusto.trim() || undefined,
          sla_contratual: sla.trim() || undefined, observacoes: obs.trim() || undefined,
          object_name: anexo?.object_name, filename: anexo?.filename,
          content_type: anexo?.content_type ?? undefined, size: anexo?.size ?? undefined,
        }
        await produtosApi.addContrato(productId, payload)
        toast.success("Contrato criado.")
      }
      onSaved()
    } catch (e) { toast.error(detail(e)) } finally { setSaving(false) }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle>{editing ? "Editar contrato" : "Novo contrato"}</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5"><Label>Fornecedor</Label>
            {editing ? (
              <p className="rounded-md border bg-muted/30 px-3 py-2 text-sm">
                {fornecedores.find((f) => f.id === fornecedorId)?.nome ?? contrato?.fornecedor_nome ?? "—"}
              </p>
            ) : (
              <Select value={fornecedorId} onValueChange={setFornecedorId}>
                <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                <SelectContent>{fornecedores.map((f) => <SelectItem key={f.id} value={f.id}>{f.nome}</SelectItem>)}</SelectContent>
              </Select>
            )}
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5"><Label>Início</Label><Input type="date" value={ini} onChange={(e) => setIni(e.target.value)} /></div>
            <div className="space-y-1.5"><Label>Fim</Label><Input type="date" value={fim} onChange={(e) => setFim(e.target.value)} /></div>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5"><Label>Identificador</Label><Input value={identificador} onChange={(e) => setIdent(e.target.value)} /></div>
            <div className="space-y-1.5"><Label>Modelo de licenciamento</Label><Input value={licenc} onChange={(e) => setLicenc(e.target.value)} /></div>
          </div>
          <div className="space-y-1.5"><Label>Gestor do contrato</Label>
            <Select value={gestor} onValueChange={setGestor}>
              <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
              <SelectContent><SelectItem value="__none__">—</SelectItem>{persons.map((p) => <SelectItem key={p.id} value={p.id}>{p.full_name}</SelectItem>)}</SelectContent>
            </Select>
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
          </div>
          <div className="space-y-1.5"><Label>Objeto contratual</Label><Textarea rows={2} value={objeto} onChange={(e) => setObjeto(e.target.value)} /></div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5"><Label>SLA contratual</Label><Input value={sla} onChange={(e) => setSla(e.target.value)} /></div>
            <div className="space-y-1.5">
              <Label>Anexo do contrato</Label>
              <label className={`flex min-h-9 cursor-pointer items-center gap-2 rounded-md border border-dashed bg-background px-3 py-2 text-sm text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground ${uploading ? "pointer-events-none opacity-60" : ""}`}>
                {uploading ? <Loader2 size={14} className="shrink-0 animate-spin" /> : <Paperclip size={14} className="shrink-0" />}
                <span className="truncate">{anexo ? anexo.filename : uploading ? "Enviando…" : "Anexar arquivo"}</span>
                <input type="file" className="hidden" onChange={onFile} disabled={uploading} />
              </label>
              {anexo && <button type="button" className="text-[11px] text-muted-foreground hover:text-destructive" onClick={() => { setAnexo(null); setAnexoRemovido(true) }}>Remover anexo</button>}
            </div>
          </div>
          <div className="space-y-1.5"><Label>Observações</Label><Textarea rows={2} value={obs} onChange={(e) => setObs(e.target.value)} /></div>
        </div>
        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={() => void save()} disabled={saving}>{saving && <Loader2 size={14} className="mr-1.5 animate-spin" />}{editing ? "Salvar" : "Criar"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function detail(e: unknown): string {
  return (e as { response?: { data?: { detail?: string } } })?.response?.data?.detail || "Falha na operação."
}

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

function ServicoDialog({
  productId,
  corporativo,
  servico,
  onClose,
  onSaved,
}: {
  productId: string
  corporativo: boolean
  servico: Servico
  onClose: () => void
  onSaved: () => void
}) {
  const [pos, setPos] = useState<{ id: string; full_name: string }[]>([])
  const [f, setF] = useState({
    name: servico.name,
    description: servico.description ?? "",
    data_publicacao: servico.data_publicacao ?? new Date().toISOString().slice(0, 10),
    status_servico: servico.status_servico ?? "ativo" as ServicoStatus,
    responsavel_person_id: servico.responsavel_person_id ?? NONE,
  })
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (corporativo) produtosApi.listPos().then(setPos).catch(() => setPos([]))
  }, [corporativo])

  useEffect(() => {
    setF({
      name: servico.name,
      description: servico.description ?? "",
      data_publicacao: servico.data_publicacao ?? new Date().toISOString().slice(0, 10),
      status_servico: servico.status_servico ?? "ativo",
      responsavel_person_id: servico.responsavel_person_id ?? NONE,
    })
  }, [servico.id, servico])

  async function save() {
    if (!f.name.trim()) { toast.error("Informe o nome do serviço."); return }
    if (corporativo && f.responsavel_person_id === NONE) {
      toast.error("Informe o Responsável (PO) do serviço.")
      return
    }
    setSaving(true)
    try {
      await produtosApi.updateServico(productId, servico.id, {
        name: f.name.trim(),
        description: f.description.trim() || null,
        data_publicacao: f.data_publicacao || null,
        status_servico: f.status_servico,
        responsavel_person_id: corporativo ? f.responsavel_person_id : undefined,
      })
      toast.success("Serviço atualizado.")
      onSaved()
    } catch (e) {
      toast.error(detail(e))
    } finally {
      setSaving(false)
    }
  }

  const canSave = f.name.trim() && (!corporativo || f.responsavel_person_id !== NONE)

  return (
    <Dialog open onOpenChange={(v) => { if (!v) onClose() }}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader><DialogTitle>Editar serviço</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label className="text-xs">Nome do serviço *</Label>
            <Input value={f.name} onChange={(e) => setF((s) => ({ ...s, name: e.target.value }))} />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Descrição</Label>
            <Textarea rows={3} value={f.description} onChange={(e) => setF((s) => ({ ...s, description: e.target.value }))} placeholder="Descreva o serviço digital" />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label className="text-xs">Data da publicação</Label>
              <Input type="date" value={f.data_publicacao} onChange={(e) => setF((s) => ({ ...s, data_publicacao: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Status *</Label>
              <Select value={f.status_servico} onValueChange={(v) => setF((s) => ({ ...s, status_servico: v as ServicoStatus }))}>
                <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                <SelectContent>{SERVICO_STATUS_OPTS.map((o) => <SelectItem key={o} value={o}>{SERVICO_STATUS_LABEL[o]}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          </div>
          {corporativo && (
            <div className="space-y-1.5">
              <Label className="text-xs">Responsável (PO) *</Label>
              <Select value={f.responsavel_person_id} onValueChange={(v) => setF((s) => ({ ...s, responsavel_person_id: v }))}>
                <SelectTrigger className="h-9"><SelectValue placeholder="Selecione o PO" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>—</SelectItem>
                  {pos.map((po) => <SelectItem key={po.id} value={po.id}>{po.full_name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          )}
        </div>
        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button onClick={() => void save()} disabled={saving || !canSave}>
            {saving && <Loader2 size={14} className="mr-1.5 animate-spin" />}
            Salvar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
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
      const payload = release
        ? {
            versao: f.versao.trim(),
            nome: nullableStr(f.nome ?? ""),
            data_release: f.data_release?.trim() || null,
            ambiente: f.ambiente,
            tipo: f.tipo,
            impacto: f.impacto,
            descricao_mudanca: nullableStr(f.descricao_mudanca ?? ""),
            status: f.status,
            responsavel_person_id: f.responsavel_person_id,
            evidencia_link: nullableStr(f.evidencia_link ?? ""),
            changelog: nullableStr(f.changelog ?? ""),
            tem_rollback: f.tem_rollback,
            descricao_rollback: nullableStr(f.descricao_rollback ?? ""),
            doc_atualizada: f.doc_atualizada,
          }
        : { ...f, versao: f.versao.trim() }
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
                  {(d.anexos?.length ?? 0) > 0 && <span className="inline-flex items-center gap-0.5"><Paperclip size={10} /> {d.anexos!.length}</span>}
                  {d.link_interno && <Link2 size={11} />}
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
            {(view.link_interno || (view.anexos?.length ?? 0) > 0) && (
              <div className="space-y-1.5 rounded-md border bg-muted/20 p-3">
                {view.link_interno && (
                  <a href={view.link_interno} target="_blank" rel="noreferrer" className="flex items-center gap-2 text-sm text-primary hover:underline">
                    <Link2 size={14} className="shrink-0" /> <span className="truncate">{view.link_interno}</span> <ExternalLink size={12} className="shrink-0" />
                  </a>
                )}
                {(view.anexos ?? []).map((a) => (
                  <button key={a.object_name} type="button" className="flex w-full min-w-0 items-center gap-2 text-left text-sm text-primary hover:underline"
                    onClick={async () => { const u = await produtosApi.getUploadUrl(a.object_name); if (u) window.open(u, "_blank", "noopener") }}>
                    <FileText size={14} className="shrink-0 text-muted-foreground" /> <span className="truncate">{a.filename}</span> <Download size={12} className="shrink-0" />
                  </button>
                ))}
              </div>
            )}
            {view.conteudo_md?.trim() && <div className="rounded-md border p-4"><MarkdownPreview content={view.conteudo_md} /></div>}
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
  const [anexos, setAnexos] = useState<AnexoItem[]>(doc?.anexos ?? [])
  const [uploading, setUploading] = useState(false)
  const [saving, setSaving] = useState(false)
  useEffect(() => {
    produtosApi.listPersons().then(setPersons).catch(() => setPersons([]))
    if (doc) setMd(doc.conteudo_md ?? "")
    else produtosApi.getDocTemplate().then(setMd).catch(() => setMd(""))
  }, [doc])
  async function onFiles(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []); e.target.value = ""; if (!files.length) return
    setUploading(true)
    try {
      const ups = await Promise.all(files.map((f) => produtosApi.uploadFile(f)))
      setAnexos((prev) => [...prev, ...ups])
    } catch { toast.error("Falha no upload.") } finally { setUploading(false) }
  }
  async function openAnexo(a: AnexoItem) {
    const u = await produtosApi.getUploadUrl(a.object_name); if (u) window.open(u, "_blank", "noopener")
  }
  async function save() {
    if (!titulo.trim()) { toast.error("Informe o título."); return }
    if (!md.trim() && !link.trim() && anexos.length === 0) {
      toast.error("Informe o conteúdo Markdown, um link ou anexe um arquivo."); return
    }
    setSaving(true)
    try {
      const payload = { titulo: titulo.trim(), tipo, status, versao_relacionada: versao.trim() || null, autor_person_id: autor === NONE ? null : autor, link_interno: link.trim() || null, conteudo_md: md, anexos }
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
          </div>

          <Tabs defaultValue={doc?.anexos?.length ? "anexo" : doc?.link_interno ? "link" : "markdown"}>
            <TabsList>
              <TabsTrigger value="markdown">Escrever (Markdown)</TabsTrigger>
              <TabsTrigger value="anexo">Anexar arquivo{anexos.length > 0 ? ` (${anexos.length})` : ""}</TabsTrigger>
              <TabsTrigger value="link">Link existente</TabsTrigger>
            </TabsList>

            <TabsContent value="markdown" className="pt-2">
              <p className="mb-1.5 text-[11px] text-muted-foreground">Escreva a documentação diretamente aqui.</p>
              <MarkdownEditor value={md} onChange={setMd} />
            </TabsContent>

            <TabsContent value="anexo" className="space-y-1.5 pt-2">
              <p className="text-[11px] text-muted-foreground">Anexe uma documentação existente — PDF, DOCX, etc.</p>
              <label className={`flex min-h-9 cursor-pointer items-center gap-2 rounded-md border border-dashed bg-background px-3 py-2 text-sm text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground ${uploading ? "pointer-events-none opacity-60" : ""}`}>
                {uploading ? <Loader2 size={14} className="shrink-0 animate-spin" /> : <Paperclip size={14} className="shrink-0" />}
                <span className="truncate">{uploading ? "Enviando…" : "Clique para anexar arquivo(s)"}</span>
                <input type="file" multiple className="hidden" onChange={onFiles} disabled={uploading} />
              </label>
              {anexos.length > 0 && (
                <div className="space-y-1">
                  {anexos.map((a, i) => (
                    <div key={a.object_name} className="flex items-center justify-between gap-2 rounded-md border px-2.5 py-1.5">
                      <button type="button" className="flex min-w-0 items-center gap-2 text-left" onClick={() => void openAnexo(a)}>
                        <FileText size={14} className="shrink-0 text-muted-foreground" />
                        <span className="truncate text-sm text-primary hover:underline">{a.filename}</span>
                      </button>
                      <Button type="button" variant="ghost" size="icon" className="h-8 w-8 shrink-0 text-muted-foreground hover:text-destructive" onClick={() => setAnexos((prev) => prev.filter((_, j) => j !== i))}><Trash2 size={14} /></Button>
                    </div>
                  ))}
                </div>
              )}
            </TabsContent>

            <TabsContent value="link" className="space-y-1.5 pt-2">
              <p className="text-[11px] text-muted-foreground">Aponte para uma documentação já hospedada em outro lugar.</p>
              <Input value={link} onChange={(e) => setLink(e.target.value)} placeholder="https://" />
            </TabsContent>
          </Tabs>
          {status === "publicada" && !md.trim() && !link.trim() && anexos.length === 0 && <p className="text-[11px] text-amber-600">Documentação publicada exige conteúdo Markdown, link ou anexo.</p>}
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
const NIVEL_LABEL: Record<SupportNivel, string> = { n1: "Nível 1", n2: "Nível 2", n3: "Nível 3" }
const NIVEL_OPTS: SupportNivel[] = ["n1", "n2", "n3"]

function supportResponsaveisLabel(s: Support): string {
  if (s.interno) {
    const nomes = s.responsaveis.map((r) => r.full_name)
    return nomes.length > 0 ? nomes.join(", ") : "—"
  }
  return s.nomes_externos.length > 0 ? s.nomes_externos.join(", ") : "—"
}

function SustentacaoTab({ p, onChange }: { p: Product; onChange: () => void | Promise<void> }) {
  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState<Support | null>(null)
  const usedNiveis = new Set(p.supports.map((s) => s.nivel))
  const canAdd = NIVEL_OPTS.some((n) => !usedNiveis.has(n))

  function openNew() { setEditing(null); setOpen(true) }
  function openEdit(s: Support) { setEditing(s); setOpen(true) }
  async function del(s: Support) {
    if (!confirm(`Excluir sustentação ${NIVEL_LABEL[s.nivel]}?`)) return
    try {
      await produtosApi.deleteSupport(p.id, s.id)
      toast.success("Sustentação excluída.")
      await onChange()
    } catch (e) { toast.error(detail(e)) }
  }

  return (
    <div className="space-y-3 pt-3">
      <div className="flex justify-end">
        <Button size="sm" className="gap-1.5" onClick={openNew} disabled={!canAdd}>
          <Plus size={14} /> Nova sustentação
        </Button>
      </div>
      {p.supports.length === 0 ? (
        <p className="text-sm text-muted-foreground">Nenhuma sustentação cadastrada. Clique em &quot;Nova sustentação&quot; para adicionar.</p>
      ) : (
        <div className="space-y-2">
          {p.supports.map((s) => (
            <SupportListItem key={s.id} support={s} productId={p.id} onEdit={() => openEdit(s)} onDelete={() => void del(s)} />
          ))}
        </div>
      )}
      <SupportDialog
        open={open}
        onOpenChange={(v) => { setOpen(v); if (!v) setEditing(null) }}
        productId={p.id}
        support={editing}
        usedNiveis={new Set(p.supports.filter((x) => x.id !== editing?.id).map((x) => x.nivel))}
        onSaved={async () => { setOpen(false); setEditing(null); await onChange() }}
      />
    </div>
  )
}

function SupportListItem({ support: s, onEdit, onDelete }: { support: Support; productId: string; onEdit: () => void; onDelete: () => void }) {
  const responsaveis = supportResponsaveisLabel(s)

  return (
    <div className="rounded-md border p-3">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 space-y-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <Badge variant="outline">{NIVEL_LABEL[s.nivel]}</Badge>
            <Badge variant="secondary" className="text-[10px]">{s.interno ? "Interno" : "Externo"}</Badge>
            {s.sla_horas != null && <Badge className="text-[10px]">SLA {s.sla_horas}h</Badge>}
          </div>
          <p className="text-sm"><span className="text-muted-foreground">Canal:</span> {s.canal_atendimento?.trim() || "—"}</p>
          <p className="text-sm"><span className="text-muted-foreground">Responsáveis:</span> {responsaveis}</p>
          {s.observacoes?.trim() && <p className="text-sm text-muted-foreground">{s.observacoes}</p>}
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <Button variant="ghost" size="icon" title="Editar" onClick={onEdit}><Pencil size={14} /></Button>
          <Button variant="ghost" size="icon" className="text-muted-foreground hover:text-destructive" title="Excluir" onClick={onDelete}><Trash2 size={14} /></Button>
        </div>
      </div>
    </div>
  )
}

function SupportDialog({ open, onOpenChange, productId, support, usedNiveis, onSaved }: {
  open: boolean
  onOpenChange: (v: boolean) => void
  productId: string
  support: Support | null
  usedNiveis: Set<SupportNivel>
  onSaved: () => void | Promise<void>
}) {
  const editing = !!support
  const [persons, setPersons] = useState<PersonMini[]>([])
  const [canal, setCanal] = useState("")
  const [nivel, setNivel] = useState<SupportNivel>("n1")
  const [interno, setInterno] = useState(true)
  const [personIds, setPersonIds] = useState<string[]>([])
  const [nomesExt, setNomesExt] = useState<string[]>([])
  const [personSel, setPersonSel] = useState<string | undefined>(undefined)
  const [nomeExt, setNomeExt] = useState("")
  const [slaHoras, setSlaHoras] = useState<string>("")
  const [obs, setObs] = useState("")
  const [saving, setSaving] = useState(false)

  const niveisDisponiveis = NIVEL_OPTS.filter((n) => n === support?.nivel || !usedNiveis.has(n))

  useEffect(() => {
    if (!open) return
    produtosApi.listPersons().then(setPersons).catch(() => setPersons([]))
    if (support) {
      setCanal(support.canal_atendimento ?? "")
      setNivel(support.nivel)
      setInterno(support.interno)
      setPersonIds([...support.person_ids])
      setNomesExt([...support.nomes_externos])
      setSlaHoras(support.sla_horas != null ? String(support.sla_horas) : "")
      setObs(support.observacoes ?? "")
    } else {
      setCanal("")
      setNivel(niveisDisponiveis[0] ?? "n1")
      setInterno(true)
      setPersonIds([])
      setNomesExt([])
      setSlaHoras("")
      setObs("")
    }
    setPersonSel(undefined)
    setNomeExt("")
  }, [open, support])

  const disponiveis = persons.filter((p) => !personIds.includes(p.id))

  function addPerson() {
    if (!personSel || personIds.includes(personSel)) return
    setPersonIds((ids) => [...ids, personSel])
    setPersonSel(undefined)
  }
  function addNome() {
    const t = nomeExt.trim()
    if (!t || nomesExt.includes(t)) return
    setNomesExt((n) => [...n, t])
    setNomeExt("")
  }

  async function save() {
    if (!canal.trim()) { toast.error("Informe o canal de atendimento."); return }
    if (!slaHoras || Number(slaHoras) < 1) { toast.error("Informe o SLA em horas."); return }
    if (interno && personIds.length === 0) { toast.error("Adicione ao menos um responsável interno."); return }
    if (!interno && nomesExt.length === 0) { toast.error("Adicione ao menos um responsável externo."); return }
    setSaving(true)
    try {
      const payload: SupportCreate = {
        canal_atendimento: canal.trim(),
        nivel,
        interno,
        person_ids: interno ? personIds : [],
        nomes_externos: interno ? [] : nomesExt,
        sla_horas: Number(slaHoras),
        observacoes: obs.trim() || null,
      }
      if (editing && support) {
        await produtosApi.updateSupport(productId, support.id, payload)
        toast.success("Sustentação atualizada.")
      } else {
        await produtosApi.createSupport(productId, payload)
        toast.success("Sustentação cadastrada.")
      }
      await onSaved()
    } catch (e) { toast.error(detail(e)) } finally { setSaving(false) }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{editing ? "Editar sustentação" : "Nova sustentação"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label className="text-xs">Canal de atendimento</Label>
            <Input value={canal} onChange={(e) => setCanal(e.target.value)} placeholder="Ex.: Service Desk, e-mail, portal..." />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Nível</Label>
            <Select value={nivel} onValueChange={(v) => setNivel(v as SupportNivel)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {niveisDisponiveis.map((n) => <SelectItem key={n} value={n}>{NIVEL_LABEL[n]}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <label className="flex items-center gap-2 text-sm">
            <Switch checked={interno} onCheckedChange={(v) => { setInterno(v); setPersonIds([]); setNomesExt([]) }} />
            Atendimento interno
          </label>
          {interno ? (
            <div className="space-y-2">
              <Label className="text-xs">Responsáveis pelo atendimento</Label>
              <div className="flex flex-wrap gap-2">
                <Select value={personSel} onValueChange={setPersonSel}>
                  <SelectTrigger className="min-w-[200px] flex-1"><SelectValue placeholder="Selecionar usuário..." /></SelectTrigger>
                  <SelectContent>
                    {disponiveis.map((p) => <SelectItem key={p.id} value={p.id}>{p.full_name}</SelectItem>)}
                  </SelectContent>
                </Select>
                <Button type="button" variant="outline" size="sm" onClick={addPerson} disabled={!personSel}>Adicionar</Button>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {personIds.map((id) => {
                  const person = persons.find((p) => p.id === id)
                  return (
                    <Badge key={id} variant="secondary" className="gap-1 text-xs">
                      {person?.full_name ?? id}
                      <button type="button" onClick={() => setPersonIds((ids) => ids.filter((x) => x !== id))}><XCircle size={12} /></button>
                    </Badge>
                  )
                })}
              </div>
            </div>
          ) : (
            <div className="space-y-2">
              <Label className="text-xs">Responsáveis (nomes)</Label>
              <div className="flex flex-wrap gap-2">
                <Input className="flex-1" value={nomeExt} onChange={(e) => setNomeExt(e.target.value)} placeholder="Nome da pessoa"
                  onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addNome() } }} />
                <Button type="button" variant="outline" size="sm" onClick={addNome}>Adicionar</Button>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {nomesExt.map((nome) => (
                  <Badge key={nome} variant="secondary" className="gap-1 text-xs">
                    {nome}
                    <button type="button" onClick={() => setNomesExt((n) => n.filter((x) => x !== nome))}><XCircle size={12} /></button>
                  </Badge>
                ))}
              </div>
            </div>
          )}
          <div className="space-y-1.5">
            <Label className="text-xs">SLA em horas</Label>
            <Input type="number" min={1} className="max-w-[140px]" value={slaHoras} onChange={(e) => setSlaHoras(e.target.value)} placeholder="Ex.: 4" />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Observações</Label>
            <Textarea rows={2} value={obs} onChange={(e) => setObs(e.target.value)} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={() => void save()} disabled={saving}>
            {saving && <Loader2 size={14} className="mr-1.5 animate-spin" />}
            {editing ? "Salvar alterações" : "Cadastrar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
