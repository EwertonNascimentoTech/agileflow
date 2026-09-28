import { useEffect, useRef, useState, type ReactNode } from "react"
import { useNavigate, useParams, useSearchParams } from "react-router-dom"
import {
  Activity, AlertTriangle, BookOpen, CheckCircle2, ClipboardList, Download, ExternalLink, FileSignature, FileText, GitBranch,
  FileX, LayoutGrid, LifeBuoy, Link2, Loader2, MinusCircle, Paperclip, Pencil, Plus, Rocket, Server, ShieldAlert, Trash2,
  Users, Workflow, Wrench, XCircle,
} from "lucide-react"

import {
  produtosApi, reposApi, type AnexoItem, type Contrato, type ContratoCreate, type ContratoUpdate,
  type Documento, type Documentation, type Product, type ProductCriticidade, type ProductHealth,
  type ProductStatus, type Release, type ReleaseCreate, type ReleaseStatus, type Repositorio, type SaudeClasse, type Servico,
  type ServicoStatus, type Support, type SupportCreate, type SupportNivel, type SupportPerson, type SupportProblem,
  type SupportProblemInput, type SupportSolution,
} from "@/api/produtos"
import {
  Card, DetailHeader, DetailTabs, Field, KpiCount, KpiPerson, KpiRow, KpiText, Notice, Pill, SectionCard, TABLE,
  type KpiTone, type MenuAction, type TabDef, type Tone,
} from "@/components/ds"
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
  CATEGORIA_LABEL, CONTRATO_STATUS_LABEL, CONTRATO_STATUS_OPTS, CONTRATO_TIPOVALOR_LABEL, CONTRATO_TIPOVALOR_OPTS,
  CONTRATO_TONE, CRITICIDADE_LABEL, DOC_FORMATO_LABEL, DOC_TONE, DOCNT_STATUS_LABEL, DOCNT_STATUS_OPTS,
  DOCNT_TIPO_LABEL, DOCNT_TIPO_OPTS, LIFECYCLE_LABEL, NIVEL_LGPD_LABEL, NIVEL_LGPD_OPTS, RELEASE_AMBIENTE_LABEL,
  RELEASE_AMBIENTE_OPTS, RELEASE_IMPACTO_LABEL, RELEASE_IMPACTO_OPTS, RELEASE_STATUS_LABEL, RELEASE_STATUS_OPTS,
  RELEASE_TIPO_LABEL, RELEASE_TIPO_OPTS, SAUDE_LABEL, SAUDE_TONE, SERVICO_STATUS_LABEL,
  SERVICO_STATUS_OPTS, STATUS_LABEL, TIPODEV_LABEL, UNIDADE_LABEL,
} from "@/modules/produtos/constants"

const NONE = "__none__"
function fmtDate(iso: string | null) { return iso ? new Date(iso).toLocaleDateString("pt-BR") : "—" }

// Tons dos selos (Pill do design system do Portal) para os status do produto e dos itens;
// saúde, contrato e documentação vêm de constants.ts (os mesmos da lista).
const STATUS_TONE: Record<ProductStatus, Tone> = {
  ideia: "slate", discovery: "violet", desenvolvimento: "blue", homologacao: "amber", producao: "emerald",
  sustentacao: "teal", evolucao: "violet", suspenso: "amber", descontinuado: "red",
}
const CRITICIDADE_TONE: Record<ProductCriticidade, Tone> = { baixa: "emerald", media: "amber", alta: "red", critica: "red" }
const SAUDE_KPI: Record<SaudeClasse, KpiTone> = { saudavel: "emerald", atencao: "amber", critico: "red" }
const SAUDE_TEXT: Record<SaudeClasse, string> = {
  saudavel: "text-emerald-600 dark:text-emerald-400",
  atencao: "text-amber-600 dark:text-amber-400",
  critico: "text-red-600 dark:text-red-400",
}
const SERVICO_TONE: Record<ServicoStatus, Tone> = { ativo: "emerald", em_implantacao: "blue", suspenso: "amber", descontinuado: "slate" }
const RELEASE_TONE: Record<ReleaseStatus, Tone> = {
  planejada: "slate", em_desenvolvimento: "blue", em_homologacao: "amber", publicada: "emerald", cancelada: "red", revertida: "amber",
}

type ProductTab = "geral" | "servicos" | "documentos" | "contratos" | "releases" | "documentacao" | "sustentacao"

/** Link externo curto ("Abrir") das fichas; sem URL, traço. */
function ExtLink({ url, children = "Abrir" }: { url: string | null; children?: ReactNode }) {
  if (!url) return <>—</>
  return (
    <a href={url} target="_blank" rel="noreferrer" className="inline-flex max-w-full items-center gap-1 text-primary hover:underline">
      <span className="truncate">{children}</span> <ExternalLink size={12} className="shrink-0" />
    </a>
  )
}

/** Ações de linha (editar/excluir) das listas das abas. */
function RowActions({ onEdit, onDelete, editTitle = "Editar", deleteTitle = "Inativar" }: {
  onEdit?: () => void; onDelete: () => void; editTitle?: string; deleteTitle?: string
}) {
  return (
    <div className="flex shrink-0 items-center justify-end gap-0.5">
      {onEdit && (
        <Button variant="ghost" size="icon" className="h-9 w-9" title={editTitle} aria-label={editTitle} onClick={onEdit}><Pencil size={14} /></Button>
      )}
      <Button variant="ghost" size="icon" className="h-9 w-9 text-muted-foreground hover:text-destructive" title={deleteTitle} aria-label={deleteTitle} onClick={onDelete}>
        <Trash2 size={14} />
      </Button>
    </div>
  )
}

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
  // Aba ativa: começa pela da URL (?tab=) e volta a ela quando a URL muda (antes: key={initialTab}).
  const [tabState, setTabState] = useState<{ init: string; value: ProductTab }>({ init: initialTab, value: initialTab })
  const tab: ProductTab = tabState.init === initialTab ? tabState.value : initialTab
  const setTab = (value: ProductTab) => setTabState({ init: initialTab, value })

  async function reload() { if (id) setProduct(await produtosApi.getProduct(id).catch(() => null)) }
  useEffect(() => { if (id) produtosApi.getProduct(id).catch(() => null).then(setProduct).finally(() => setLoading(false)) }, [id])

  if (loading) {
    return (
      <div className="space-y-5">
        <Skeleton className="h-20 w-2/3 rounded-xl" />
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-6">
          {Array.from({ length: 6 }, (_, i) => <Skeleton key={i} className="h-[74px] rounded-xl" />)}
        </div>
        <Skeleton className="h-96 rounded-2xl" />
      </div>
    )
  }
  if (!product) {
    return (
      <Card>
        <EmptyState icon={FileText} title="Produto não encontrado" description="Volte para a lista." />
      </Card>
    )
  }
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
    // SLA mora nos problemas do catálogo da Sustentação (cada um com o seu) ou no contrato.
    const hasSla = p.supports.some((s) => s.problemas.length > 0) || p.contratos.some((c) => c.sla_contratual)
    if (!hasSla) criticalGaps.push("SLA definido")
  }
  const semContratoAtivo = p.requires_contract && !p.has_active_contract

  const actions: MenuAction[] = [
    ...(p.url_acesso ? [{ label: "Acessar o sistema", icon: ExternalLink, onClick: () => window.open(p.url_acesso!, "_blank", "noopener") }] : []),
    { label: "Editar produto", icon: Pencil, onClick: () => setEditing(true) },
    { label: "Inativar produto", icon: Trash2, onClick: () => void remove() },
  ]
  const tabs: TabDef<ProductTab>[] = [
    { value: "geral", label: "Geral", icon: LayoutGrid },
    { value: "servicos", label: `Serviços (${p.servicos.length})`, icon: Wrench },
    { value: "documentos", label: `Documentos Natos Digitais (${p.documentos.length})`, icon: FileText },
    { value: "contratos", label: `Contratos (${p.contratos.length})`, icon: FileSignature },
    { value: "releases", label: `Releases (${p.releases.length})`, icon: Rocket },
    { value: "documentacao", label: `Documentação (${p.documentations.length})`, icon: BookOpen },
    { value: "sustentacao", label: "Sustentação", icon: LifeBuoy },
  ]

  return (
    <div className="space-y-5">
      <DetailHeader
        crumbs={[{ label: "Produtos", to: "/app/modules/produtos/produtos" }, { label: p.name }]}
        icon={p.categoria === "sistema_interno_ia" || p.categoria === "sistema_externo_ia" ? "Sparkles" : "Package"}
        color="#7C3AED"
        title={`${p.simbolo ? `${p.simbolo} ` : ""}${p.name}`}
        badge={
          <div className="flex flex-wrap items-center gap-1.5">
            {p.status_produto && <Pill tone={STATUS_TONE[p.status_produto]} dot>{STATUS_LABEL[p.status_produto]}</Pill>}
            <Pill tone={CRITICIDADE_TONE[p.criticidade]} dot>Criticidade {CRITICIDADE_LABEL[p.criticidade].toLowerCase()}</Pill>
            {p.categoria && <Pill>{CATEGORIA_LABEL[p.categoria]}</Pill>}
            {p.tipo_desenvolvimento && <Pill>Desenvolvimento {TIPODEV_LABEL[p.tipo_desenvolvimento].toLowerCase()}</Pill>}
            {p.unidade && <Pill>{UNIDADE_LABEL[p.unidade]}</Pill>}
            {p.corporativo && <Pill tone="violet">Produto corporativo</Pill>}
            {trataDados && (
              <Pill tone={trataSensiveis ? "red" : "amber"}><ShieldAlert size={12} /> {trataSensiveis ? "Dados sensíveis" : "Dados pessoais"}</Pill>
            )}
          </div>
        }
        description={p.description ? <span className="line-clamp-2">{p.description}</span> : undefined}
        meta={
          <>
            {p.sigla && <>Sigla: <span className="text-foreground">{p.sigla}</span> · </>}
            Ciclo de vida: <span className="text-foreground">{LIFECYCLE_LABEL[p.lifecycle]}</span>
            {p.fornecedor && <> · Fornecedor: <span className="text-foreground">{p.fornecedor.nome}</span></>}
            {" "}· Cadastrado em {fmtDate(p.created_at)}
          </>
        }
        updatedAt={p.updated_at ?? null}
        actions={actions}
      />

      <KpiRow className="sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-6">
        {p.health ? (
          <KpiText
            icon={Activity}
            tone={SAUDE_KPI[p.health.classe]}
            label={`Saúde do produto (${p.health.passed_weight}/${p.health.applicable_weight} pts)`}
            value={<span className={SAUDE_TEXT[p.health.classe]}>{p.health.score} · {SAUDE_LABEL[p.health.classe]}</span>}
          />
        ) : (
          <KpiText icon={Activity} tone="slate" label="Saúde do produto" value="Sem cálculo" />
        )}
        <KpiCount icon={Wrench} value={p.servicos.length} label="Serviços digitais" onClick={() => setTab("servicos")} />
        <KpiCount
          icon={p.sem_documentos_natos ? FileX : FileText} value={p.documentos.length}
          label={p.sem_documentos_natos ? "Documentos Natos Digitais · não gera (justificado)" : "Documentos Natos Digitais"}
          tone={p.sem_documentos_natos ? "slate" : "primary"} onClick={() => setTab("documentos")}
        />
        <KpiCount
          icon={FileSignature} value={p.contratos.length} label={semContratoAtivo ? "Contratos (nenhum ativo)" : "Contratos"}
          tone={semContratoAtivo ? "amber" : "primary"} highlight={semContratoAtivo} onClick={() => setTab("contratos")}
        />
        <KpiCount icon={Rocket} value={p.releases.length} label="Releases" onClick={() => setTab("releases")} />
        {p.corporativo
          ? <KpiPerson name={p.responsavel_tecnico?.full_name} role="Responsável técnico" />
          : <KpiPerson name={p.responsavel?.full_name} role="Responsável (PO)" />}
      </KpiRow>

      {semContratoAtivo && (
        <Notice tone="amber" icon={AlertTriangle}>
          <span className="flex-1">Produto de fornecedor sem contrato ativo — cadastre um contrato na aba Contratos.</span>
          {tab !== "contratos" && (
            <Button size="sm" variant="outline" className="h-8 bg-background" onClick={() => setTab("contratos")}>Ver contratos</Button>
          )}
        </Notice>
      )}
      {criticalGaps.length > 0 && (
        <Notice tone="red" icon={ShieldAlert}>Produto crítico sem: {criticalGaps.join(", ")}.</Notice>
      )}

      <DetailTabs tabs={tabs} value={tab} onChange={setTab} />

      {tab === "geral" && <GeralTab p={p} onChange={reload} onEdit={() => setEditing(true)} onGoDocumentos={() => setTab("documentos")} />}
      {tab === "servicos" && <ServicosTab p={p} onChange={reload} />}
      {tab === "documentos" && <DocumentosTab p={p} onChange={reload} />}
      {tab === "contratos" && <ContratosTab p={p} onChange={reload} />}
      {tab === "releases" && <ReleasesTab p={p} onChange={reload} />}
      {tab === "documentacao" && <DocumentacaoTab p={p} onChange={reload} />}
      {tab === "sustentacao" && <SustentacaoTab p={p} onChange={reload} />}

      <ProductFormDialog open={editing} onOpenChange={setEditing} product={p} onSaved={() => { setEditing(false); void reload() }} />
    </div>
  )
}

/** Menor pontuação (em pts) que leva a nota ao limiar, com o mesmo arredondamento do backend. */
function ptsParaLimiar(passed: number, applicable: number, limiar: number): number {
  if (applicable <= 0) return 0
  for (let pts = passed; pts <= applicable; pts++) {
    if (Math.round((pts / applicable) * 100) >= limiar) return pts - passed
  }
  return applicable - passed
}

/** Régua da saúde: faixas Crítico / Atenção / Saudável do tenant e onde a nota está. */
function HealthRuler({ score, atencao, saudavel }: { score: number; atencao: number; saudavel: number }) {
  const pos = Math.max(0, Math.min(100, score))
  return (
    <div className="space-y-1">
      <div className="relative">
        <div className="flex h-2 overflow-hidden rounded-full">
          <div className="bg-red-200 dark:bg-red-900/60" style={{ width: `${atencao}%` }} />
          <div className="bg-amber-200 dark:bg-amber-900/60" style={{ width: `${saudavel - atencao}%` }} />
          <div className="bg-emerald-200 dark:bg-emerald-900/60" style={{ width: `${100 - saudavel}%` }} />
        </div>
        <span
          className="absolute top-1/2 h-4 w-1 -translate-x-1/2 -translate-y-1/2 rounded-full bg-foreground ring-2 ring-background"
          style={{ left: `${pos}%` }}
          aria-hidden
        />
      </div>
      <div className="flex justify-between text-[11px] text-muted-foreground">
        <span>Crítico &lt; {atencao}</span>
        <span>Atenção {atencao}–{saudavel - 1}</span>
        <span>Saudável ≥ {saudavel}</span>
      </div>
    </div>
  )
}

function HealthChecklist({ health, className = "", onDocumentosDispensa }: {
  health: ProductHealth
  className?: string
  /** Produto sem documento: atalho para declarar que não gera documentos natos digitais. */
  onDocumentosDispensa?: () => void
}) {
  // Ordena: o que falta (fail) primeiro, depois o que passou, por último os não aplicáveis.
  const rank = { fail: 0, pass: 1, na: 2 } as const
  const checks = [...health.checks].sort((a, b) => (rank[a.status] - rank[b.status]) || (b.weight - a.weight))
  const fails = health.checks.filter((c) => c.status === "fail").length
  const naCount = health.checks.filter((c) => c.status === "na").length
  const saudavel = health.limiar_saudavel ?? 75
  const atencao = health.limiar_atencao ?? 40
  const faltaSaudavel = ptsParaLimiar(health.passed_weight, health.applicable_weight, saudavel)
  const faltaAtencao = ptsParaLimiar(health.passed_weight, health.applicable_weight, atencao)
  return (
    <SectionCard
      className={className}
      title="Saúde do produto"
      icon={Activity}
      subtitle="Critérios do índice de portfólio; o que falta aparece primeiro."
      right={<Pill tone={SAUDE_TONE[health.classe]} dot>Saúde: {SAUDE_LABEL[health.classe]}</Pill>}
    >
      <div className="flex items-center gap-4">
        <p className={`text-4xl font-bold leading-none tabular-nums ${SAUDE_TEXT[health.classe]}`}>{health.score}</p>
        <div className="min-w-0 flex-1 space-y-1.5">
          <HealthRuler score={health.score} atencao={atencao} saudavel={saudavel} />
          <p className="text-xs text-muted-foreground">
            Nota = {health.passed_weight} de {health.applicable_weight} pts dos critérios que se aplicam a este produto.
          </p>
        </div>
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        {health.classe === "saudavel"
          ? <Pill tone="emerald" dot>Saudável (nota ≥ {saudavel})</Pill>
          : health.classe === "atencao"
            ? <Pill tone="amber" dot>Faltam {faltaSaudavel} pts para ficar Saudável</Pill>
            : <Pill tone="red" dot>Faltam {faltaAtencao} pts para Atenção e {faltaSaudavel} pts para Saudável</Pill>}
        {fails > 0
          ? <Pill tone="slate">{fails} critério(s) pendente(s)</Pill>
          : <Pill tone="emerald">Nada pendente</Pill>}
      </div>
      {naCount > 0 && (
        <p className="mt-2 text-xs text-muted-foreground">
          Os {naCount} critério(s) "não se aplica" ficam fora da conta: não somam nem tiram pontos.
        </p>
      )}
      <ul className="mt-3 divide-y">
        {checks.map((c) => {
          const Icon = c.status === "pass" ? CheckCircle2 : c.status === "fail" ? XCircle : MinusCircle
          const cls = c.status === "pass"
            ? "text-emerald-600 dark:text-emerald-400"
            : c.status === "fail" ? "text-red-600 dark:text-red-400" : "text-muted-foreground/60"
          return (
            <li key={c.code} className="flex items-center gap-2 py-2 text-sm">
              <Icon size={16} className={`shrink-0 ${cls}`} />
              <span className="min-w-0">
                <span className={c.status === "na" ? "text-muted-foreground" : c.status === "fail" ? "font-medium" : ""}>{c.label}</span>
                {c.note && <span className="block text-xs text-muted-foreground">{c.note}</span>}
                {c.code === "documentos_cadastrados" && c.status === "fail" && onDocumentosDispensa && (
                  <button type="button" onClick={onDocumentosDispensa} className="block text-xs font-medium text-primary hover:underline">
                    Não gera documentos natos digitais? Declarar
                  </button>
                )}
              </span>
              <span className="ml-auto shrink-0 text-xs tabular-nums text-muted-foreground">{c.status === "na" ? "não se aplica" : `${c.weight} pts`}</span>
            </li>
          )
        })}
      </ul>
    </SectionCard>
  )
}

/** Repositórios vinculados ao produto. O campo "Repositório" acima é texto livre e continua
 *  existindo; a verdade da sincronização é esta lista. Some para quem não tem permissão. */
function RepositoriosDoProduto({ productId }: { productId: string }) {
  const [repos, setRepos] = useState<Repositorio[] | null>(null)

  useEffect(() => {
    reposApi
      .list()
      .then((all) => setRepos(all.filter((r) => r.produtos.some((prod) => prod.id === productId))))
      .catch(() => setRepos(null))
  }, [productId])

  if (!repos || repos.length === 0) return null
  return (
    <div className="mt-5 border-t pt-4">
      <p className="text-xs text-muted-foreground">Repositórios sincronizados</p>
      <ul className="mt-2 space-y-2">
        {repos.map((r) => (
          <li key={r.id} className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
            <GitBranch size={15} className="shrink-0 text-muted-foreground" />
            {r.web_url ? (
              <a href={r.web_url} target="_blank" rel="noreferrer" className="font-medium text-primary hover:underline">
                {r.project}/{r.repository}
              </a>
            ) : (
              <span className="font-medium">{r.project}/{r.repository}</span>
            )}
            <span className="text-xs text-muted-foreground">
              {r.commits_count > 0
                ? `${r.commits_count} commits · último em ${new Date(r.last_commit_at ?? "").toLocaleDateString("pt-BR")}`
                : "sem commits importados"}
            </span>
            {r.last_sync_status === "erro" || r.last_sync_status === "not_found" ? (
              <span title={r.last_sync_error ?? ""}><Pill tone="amber" dot>Falha no sync</Pill></span>
            ) : null}
          </li>
        ))}
      </ul>
    </div>
  )
}

const DL = "grid gap-x-6 gap-y-4 sm:grid-cols-2 lg:grid-cols-3"

function GeralTab({ p, onChange, onEdit, onGoDocumentos }: { p: Product; onChange: () => void; onEdit: () => void; onGoDocumentos?: () => void }) {
  const [fornecedorOpen, setFornecedorOpen] = useState(false)
  return (
    <div className={`grid items-start gap-4 ${p.health ? "xl:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]" : ""}`}>
      {/* Saúde vem primeiro no celular; na tela larga fica na coluna da direita. */}
      {p.health && (
        <HealthChecklist
          health={p.health}
          className="xl:order-last"
          onDocumentosDispensa={p.documentos.length === 0 && !p.sem_documentos_natos ? onGoDocumentos : undefined}
        />
      )}
      <div className="min-w-0 space-y-4">
        <SectionCard
          title="Cadastro"
          icon={ClipboardList}
          right={<Button variant="outline" className="h-9 gap-1.5" onClick={onEdit}><Pencil size={14} /> Editar</Button>}
        >
          <dl className={DL}>
            <Field label="Categoria">{p.categoria ? CATEGORIA_LABEL[p.categoria] : "—"}</Field>
            <Field label="Ciclo de vida">{LIFECYCLE_LABEL[p.lifecycle]}</Field>
            <Field label="Produto corporativo">{p.corporativo ? "Sim" : "Não"}</Field>
            <Field label="Login Idigital">{p.login_idigital ? "Sim" : "Não"}</Field>
            <Field label="Stacks" className="sm:col-span-2 lg:col-span-3">
              {p.stacks.length ? (
                <span className="flex flex-wrap gap-1.5">{p.stacks.map((s) => <Pill key={s.id}>{s.name}</Pill>)}</span>
              ) : "—"}
            </Field>
            <Field label="Descrição" className="sm:col-span-2 lg:col-span-3">
              <span className="whitespace-pre-wrap font-normal leading-relaxed">{p.description || "—"}</span>
            </Field>
          </dl>
        </SectionCard>

        <SectionCard
          title="Responsáveis"
          icon={Users}
          subtitle={p.corporativo ? "Produto corporativo: o Responsável (PO) é definido em cada serviço." : undefined}
          right={
            <Button variant="outline" className="h-9 gap-1.5" onClick={() => setFornecedorOpen(true)}>
              <Pencil size={14} /> {p.fornecedor ? "Alterar fornecedor" : "Definir fornecedor"}
            </Button>
          }
        >
          <dl className={DL}>
            {!p.corporativo && <Field label="Responsável (PO)">{p.responsavel?.full_name || "—"}</Field>}
            <Field label="Responsável técnico">{p.responsavel_tecnico?.full_name || "—"}</Field>
            <Field label="Fornecedor">{p.fornecedor?.nome ?? "—"}</Field>
          </dl>
        </SectionCard>

        <SectionCard title="Ambientes e repositório" icon={Server}>
          <dl className={DL}>
            <Field label="Acesso ao sistema"><ExtLink url={p.url_acesso}>Acessar</ExtLink></Field>
            <Field label="Repositório"><ExtLink url={p.link_repositorio} /></Field>
            <Field label="Ambiente HML"><ExtLink url={p.link_hml} /></Field>
            <Field label="Ambiente PRD"><ExtLink url={p.link_prd} /></Field>
          </dl>
          <RepositoriosDoProduto productId={p.id} />
        </SectionCard>
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
    <div className="space-y-4">
      <SectionCard title="Novo serviço" icon={Plus} subtitle="Serviço digital entregue pelo produto.">
        <div className="space-y-3">
          <div className="space-y-1.5"><Label className="text-xs">Nome do serviço</Label><Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex.: Emissão de certidão" /></div>
          <div className="space-y-1.5"><Label className="text-xs">Descrição</Label><Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} placeholder="Descreva o serviço digital" /></div>
          <div className="flex flex-wrap items-end gap-3">
            <div className="space-y-1.5"><Label className="text-xs">Data da publicação</Label><Input type="date" className="h-9" value={dataPublicacao} onChange={(e) => setDataPublicacao(e.target.value)} /></div>
            <div className="space-y-1.5"><Label className="text-xs">Status</Label>
              <Select value={statusSvc} onValueChange={(v) => setStatusSvc(v as ServicoStatus)}><SelectTrigger className="h-9 w-44"><SelectValue /></SelectTrigger>
                <SelectContent>{SERVICO_STATUS_OPTS.map((o) => <SelectItem key={o} value={o}>{SERVICO_STATUS_LABEL[o]}</SelectItem>)}</SelectContent></Select>
            </div>
            {p.corporativo && (
              <div className="min-w-[200px] flex-1 space-y-1.5">
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
            <Button className="ml-auto h-9 gap-1.5" onClick={() => void add()} disabled={adding || !canAdd}><Plus size={14} /> Adicionar</Button>
          </div>
        </div>
      </SectionCard>

      <SectionCard title={`Serviços (${p.servicos.length})`} icon={Wrench} subtitle="Cada serviço com os sub-processos do portfólio que ele atende." flush>
        {p.servicos.length === 0 ? (
          <EmptyState icon={Wrench} title="Nenhum serviço" description="Cadastre acima o primeiro serviço digital do produto." compact />
        ) : (
          <ul className="divide-y">{p.servicos.map((s) => (
            <li key={s.id} className="px-5 py-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <p className="font-medium">{s.name}</p>
                  {s.description && <p className="mt-0.5 line-clamp-2 text-sm text-muted-foreground">{s.description}</p>}
                  <p className="mt-1 text-xs text-muted-foreground">
                    Publicado em {fmtDate(s.data_publicacao ?? `${s.ano_referencia}-01-01`)}
                    {p.corporativo && s.responsavel?.full_name && <> · PO: <span className="text-foreground">{s.responsavel.full_name}</span></>}
                  </p>
                </div>
                <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
                  {s.status_servico && <Pill tone={SERVICO_TONE[s.status_servico]} dot>{SERVICO_STATUS_LABEL[s.status_servico]}</Pill>}
                  {s.sem_subprocesso_disponivel && (s.process_links?.length ?? 0) === 0 && (
                    <Pill tone="amber">Sem sub-processo</Pill>
                  )}
                  <RowActions onEdit={() => setEditSvc(s)} editTitle="Editar serviço" onDelete={() => void del(s)} deleteTitle="Inativar serviço" />
                </div>
              </div>
              <div className="mt-3 rounded-xl border bg-muted/30 px-4 py-3">
                <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                  <p className="text-sm font-medium">
                    Sub-processos vinculados <span className="text-muted-foreground">({s.process_links?.length ?? 0})</span>
                  </p>
                  <Button variant="outline" className="h-9 gap-1.5 bg-background" onClick={() => setLinkSvc(s)}>
                    <Link2 size={14} /> Vincular
                  </Button>
                </div>
                {(s.process_links?.length ?? 0) === 0 ? (
                  <p className="text-xs text-muted-foreground">
                    {s.sem_subprocesso_disponivel
                      ? "Sem vínculo — declarado indisponível no portfólio."
                      : "Nenhum sub-processo vinculado."}
                  </p>
                ) : (
                  <ul className="space-y-1.5">
                    {(s.process_links ?? []).map((lk) => {
                      const label = lk.codigo ? `${lk.codigo} · ${lk.name ?? "Sub-processo"}` : (lk.name ?? "Sub-processo")
                      return (
                        <li key={lk.item_lineage_id} className="flex items-start gap-2 text-sm text-foreground">
                          <Workflow size={14} className="mt-0.5 shrink-0 text-muted-foreground" />
                          <span className="leading-snug">{label}</span>
                        </li>
                      )
                    })}
                  </ul>
                )}
              </div>
            </li>
          ))}</ul>
        )}
      </SectionCard>
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

  // Declaração "não gera documentos natos digitais": tira o critério da saúde (não se aplica).
  const [dispensaOpen, setDispensaOpen] = useState(false)
  const [justificativa, setJustificativa] = useState("")
  const [savingDispensa, setSavingDispensa] = useState(false)
  async function saveDispensa(sem: boolean) {
    if (sem && justificativa.trim().length < 10) {
      toast.error("Explique por que o produto não gera documentos natos digitais (mínimo de 10 caracteres).")
      return
    }
    if (!sem && !confirm("Desfazer a declaração? O critério \"Documentos cadastrados\" volta a contar na saúde do produto.")) return
    setSavingDispensa(true)
    try {
      await produtosApi.setDocumentosDispensa(p.id, sem ? { sem_documentos_natos: true, justificativa: justificativa.trim() } : { sem_documentos_natos: false })
      toast.success(sem ? "Declaração registrada: o critério deixa de contar na saúde." : "Declaração desfeita.")
      setDispensaOpen(false)
      setJustificativa("")
      onChange()
    } catch (err: unknown) {
      const e = err as { response?: { data?: { detail?: unknown } } }
      toast.error(typeof e?.response?.data?.detail === "string" ? e.response.data.detail : "Não foi possível salvar a declaração.")
    } finally {
      setSavingDispensa(false)
    }
  }

  return (
    <div className="space-y-4">
      {p.sem_documentos_natos && (
        <Notice tone="slate" icon={FileX}>
          <span className="min-w-0 flex-1">
            <strong className="text-foreground">Este produto não gera documentos natos digitais.</strong>{" "}
            O critério "Documentos cadastrados" não conta na saúde.
            {p.justificativa_sem_documentos_natos && (
              <span className="mt-1 block whitespace-pre-wrap text-foreground">Justificativa: {p.justificativa_sem_documentos_natos}</span>
            )}
            <span className="mt-1 block text-xs">
              Declarado{p.sem_documentos_natos_by_name ? ` por ${p.sem_documentos_natos_by_name}` : ""}
              {p.sem_documentos_natos_at ? ` em ${fmtDate(p.sem_documentos_natos_at)}` : ""}. Cadastrar um documento desfaz a declaração.
            </span>
          </span>
          <Button type="button" variant="outline" size="sm" className="bg-background" disabled={savingDispensa} onClick={() => void saveDispensa(false)}>
            Desfazer declaração
          </Button>
        </Notice>
      )}
      {!p.sem_documentos_natos && p.documentos.length === 0 && (
        <Notice tone="blue" icon={FileX}>
          <span className="min-w-0 flex-1">
            <strong>Nenhum documento nato digital cadastrado.</strong>{" "}
            Se o produto não gera documentos natos digitais, declare com uma justificativa: o critério
            "Documentos cadastrados" deixa de contar na saúde.
          </span>
          <Button type="button" size="sm" className="gap-1.5" onClick={() => setDispensaOpen(true)}>
            <FileX size={14} /> O produto não gera documentos natos digitais
          </Button>
        </Notice>
      )}
      <SectionCard title="Novo documento nato digital" icon={Plus} subtitle="Documento nato digital gerado pelo produto: anexe o arquivo ou informe o link.">
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
                <Pill className="shrink-0">
                  {DOC_FORMATO_LABEL[formatoDetectado as keyof typeof DOC_FORMATO_LABEL] ?? formatoDetectado.toUpperCase()}
                </Pill>
              )}
              {upload && (
                <Button type="button" variant="ghost" size="icon" className="h-9 w-9 shrink-0 text-muted-foreground" onClick={() => { setUpload(null); setFormatoDetectado(null) }}>
                  <Trash2 size={14} />
                </Button>
              )}
            </div>
          </div>
        </div>

        <div className="mt-4 flex justify-end">
          <Button className="h-9 gap-1.5" onClick={() => void add()} disabled={adding || !canAdd}>
            {adding ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
            Adicionar documento
          </Button>
        </div>
      </SectionCard>

      <SectionCard title={`Documentos Natos Digitais (${p.documentos.length})`} icon={FileText} subtitle="Clique no nome para abrir o arquivo ou o link." flush>
        {p.documentos.length === 0 ? (
          p.sem_documentos_natos ? (
            <EmptyState icon={FileX} title="Nenhum documento nato digital" description="Declarado que o produto não gera documentos natos digitais." compact />
          ) : (
            <EmptyState icon={FileText} title="Nenhum documento nato digital" description="Cadastre acima o primeiro documento nato digital do produto." compact />
          )
        ) : (
          <div className={TABLE.wrap}>
            <table className={TABLE.table}>
              <thead className={TABLE.thead}>
                <tr>
                  <th className={TABLE.thFirst}>Documento</th>
                  <th className={TABLE.th}>Formato</th>
                  <th className={TABLE.th}>Dados pessoais (LGPD)</th>
                  <th className={TABLE.th}>Data</th>
                  <th className={`${TABLE.th} text-right`}><span className="sr-only">Ações</span></th>
                </tr>
              </thead>
              <tbody>
                {p.documentos.map((d) => (
                  <tr key={d.id} className={TABLE.tr}>
                    <td className={`${TABLE.tdFirst} min-w-[16rem]`}>
                      <button type="button" className="flex min-w-0 max-w-full flex-col gap-0.5 text-left" onClick={() => void open(d)}>
                        <span className="flex min-w-0 items-center gap-2">
                          {d.object_name ? <FileText size={15} className="shrink-0 text-muted-foreground" /> : <Link2 size={15} className="shrink-0 text-muted-foreground" />}
                          <span className="truncate font-medium text-primary hover:underline">{d.name}</span>
                        </span>
                        {d.observacoes && (
                          <span className="line-clamp-2 pl-[23px] text-xs text-muted-foreground">{d.observacoes}</span>
                        )}
                      </button>
                    </td>
                    <td className={TABLE.td}>
                      {d.formato ? <Pill>{DOC_FORMATO_LABEL[d.formato as keyof typeof DOC_FORMATO_LABEL] ?? d.formato.toUpperCase()}</Pill> : <span className="text-muted-foreground">—</span>}
                    </td>
                    <td className={TABLE.td}>
                      {(d.nivel_dados_pessoais !== "sem_dados_pessoais" || d.dados_pessoais || d.dados_sensiveis) ? (
                        <Pill tone="amber"><ShieldAlert size={12} /> {docNivelLgpd(d)}</Pill>
                      ) : <span className="text-muted-foreground">{docNivelLgpd(d)}</span>}
                    </td>
                    <td className={`${TABLE.td} whitespace-nowrap tabular-nums`}>{fmtDate(d.data_documento ?? `${d.ano_referencia}-01-01`)}</td>
                    <td className={`${TABLE.td} text-right`}>
                      <div className="flex items-center justify-end gap-0.5">
                        <Button variant="ghost" size="icon" className="h-9 w-9" title="Abrir / baixar" aria-label="Abrir / baixar" onClick={() => void open(d)}><Download size={14} /></Button>
                        <RowActions onDelete={() => void del(d)} deleteTitle="Inativar documento" />
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </SectionCard>
      <Dialog open={dispensaOpen} onOpenChange={(o) => { if (!savingDispensa) setDispensaOpen(o) }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>O produto não gera documentos natos digitais</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Com a declaração, o critério "Documentos cadastrados" deixa de contar na saúde do produto (fica como
            "não se aplica"). Se um documento for cadastrado depois, a declaração é desfeita automaticamente.
          </p>
          <div className="space-y-1.5">
            <Label htmlFor="justificativa-sem-docs">Justificativa</Label>
            <Textarea
              id="justificativa-sem-docs"
              rows={4}
              maxLength={2000}
              value={justificativa}
              onChange={(e) => setJustificativa(e.target.value)}
              placeholder="Ex.: sistema só de consulta; não emite certidões, relatórios ou outros documentos."
            />
            <p className="text-xs text-muted-foreground">Mínimo de 10 caracteres ({justificativa.trim().length}/10).</p>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" disabled={savingDispensa} onClick={() => setDispensaOpen(false)}>Cancelar</Button>
            <Button type="button" disabled={savingDispensa || justificativa.trim().length < 10} onClick={() => void saveDispensa(true)}>
              {savingDispensa && <Loader2 size={14} className="mr-1.5 animate-spin" />}
              Declarar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
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
    <div className="space-y-4">
      <SectionCard
        title={`Contratos (${p.contratos.length})`}
        icon={FileSignature}
        subtitle="Contratos com fornecedores, vigência e anexos."
        right={<Button className="h-9 gap-1.5" onClick={openNew}><Plus size={14} /> Novo contrato</Button>}
        flush
      >
        {p.contratos.length === 0 ? (
          <EmptyState icon={FileSignature} title="Nenhum contrato" description='Clique em "Novo contrato" para cadastrar.' compact />
        ) : (
          <div className={TABLE.wrap}>
            <table className={TABLE.table}>
              <thead className={TABLE.thead}>
                <tr>
                  <th className={TABLE.thFirst}>Contrato</th>
                  <th className={TABLE.th}>Vigência</th>
                  <th className={TABLE.th}>Valor</th>
                  <th className={TABLE.th}>Gestor</th>
                  <th className={TABLE.th}>Situação</th>
                  <th className={TABLE.th}>Anexo</th>
                  <th className={`${TABLE.th} text-right`}><span className="sr-only">Ações</span></th>
                </tr>
              </thead>
              <tbody>
                {p.contratos.map((c) => (
                  <tr key={c.id} className={TABLE.tr}>
                    <td className={`${TABLE.tdFirst} min-w-[12rem]`}>
                      <p className="font-medium">{c.fornecedor_nome ?? "Fornecedor"} {c.identificador && <span className="font-normal text-muted-foreground">· {c.identificador}</span>}</p>
                      {c.numero && <p className="text-xs text-muted-foreground">Nº {c.numero}</p>}
                    </td>
                    <td className={`${TABLE.td} whitespace-nowrap`}>
                      <span className="tabular-nums">{fmtDate(c.vigencia_inicio)} → {fmtDate(c.vigencia_fim)}</span>
                      {c.renovacao_automatica && <p className="text-xs text-muted-foreground">Renovação automática</p>}
                    </td>
                    <td className={`${TABLE.td} whitespace-nowrap`}>
                      {c.valor != null ? (
                        <>
                          <span className="tabular-nums">R$ {c.valor.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</span>
                          {c.tipo_valor && <p className="text-xs text-muted-foreground">{CONTRATO_TIPOVALOR_LABEL[c.tipo_valor]}</p>}
                        </>
                      ) : <span className="text-muted-foreground">—</span>}
                    </td>
                    <td className={TABLE.td}>{c.gestor_nome ?? <span className="text-muted-foreground">—</span>}</td>
                    <td className={TABLE.td}>
                      <div className="flex flex-wrap items-center gap-1.5">
                        {c.status_contrato && <Pill tone={CONTRATO_TONE[c.status_contrato]} dot>{CONTRATO_STATUS_LABEL[c.status_contrato]}</Pill>}
                        {c.dias_para_vencer != null && c.dias_para_vencer <= 90 && (
                          <Pill tone={c.dias_para_vencer <= 30 ? "red" : "amber"}>vence em {c.dias_para_vencer}d</Pill>
                        )}
                        {!c.status_contrato && !(c.dias_para_vencer != null && c.dias_para_vencer <= 90) && <span className="text-muted-foreground">—</span>}
                      </div>
                    </td>
                    <td className={TABLE.td}>
                      {c.object_name ? (
                        <button
                          type="button"
                          className="inline-flex max-w-[14rem] items-center gap-1.5 text-left text-primary hover:underline"
                          onClick={async () => { const u = await produtosApi.getUploadUrl(c.object_name!); if (u) window.open(u, "_blank", "noopener") }}
                        >
                          <Paperclip size={14} className="shrink-0" /> <span className="truncate">{c.filename ? c.filename : "Anexo"}</span>
                        </button>
                      ) : c.external_link ? (
                        <a href={c.external_link} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 text-primary hover:underline">
                          <Link2 size={14} className="shrink-0" /> Anexo
                        </a>
                      ) : <span className="text-muted-foreground">—</span>}
                    </td>
                    <td className={`${TABLE.td} text-right`}>
                      <RowActions onEdit={() => openEdit(c)} editTitle="Editar contrato" onDelete={() => void del(c)} deleteTitle="Inativar contrato" />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </SectionCard>
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
    <div className="space-y-4">
      <SectionCard
        title={`Releases (${p.releases.length})`}
        icon={Rocket}
        subtitle="Versões publicadas e planejadas do produto."
        right={<Button className="h-9 gap-1.5" onClick={() => setAdding(true)}><Plus size={14} /> Nova release</Button>}
        flush
      >
        {p.releases.length === 0 ? (
          <EmptyState icon={Rocket} title="Nenhuma release registrada" description='Clique em "Nova release" para registrar a primeira versão.' compact />
        ) : (
          <div className={TABLE.wrap}>
            <table className={TABLE.table}>
              <thead className={TABLE.thead}>
                <tr>
                  <th className={TABLE.thFirst}>Versão</th>
                  <th className={TABLE.th}>Status</th>
                  <th className={TABLE.th}>Ambiente</th>
                  <th className={TABLE.th}>Tipo</th>
                  <th className={TABLE.th}>Data</th>
                  <th className={TABLE.th}>Impacto</th>
                  <th className={TABLE.th}>Rollback</th>
                  <th className={`${TABLE.th} text-right`}><span className="sr-only">Ações</span></th>
                </tr>
              </thead>
              <tbody>
                {p.releases.map((r) => (
                  <tr key={r.id} className={TABLE.tr}>
                    <td className={`${TABLE.tdFirst} min-w-[16rem]`}>
                      <p className="font-medium">v{r.versao}{r.nome && <span className="font-normal text-muted-foreground"> · {r.nome}</span>}</p>
                      {r.descricao_mudanca && <p className="mt-0.5 text-xs text-muted-foreground">{r.descricao_mudanca}</p>}
                    </td>
                    <td className={TABLE.td}><Pill tone={RELEASE_TONE[r.status]} dot>{RELEASE_STATUS_LABEL[r.status]}</Pill></td>
                    <td className={TABLE.td}>{r.ambiente ? <Pill>{RELEASE_AMBIENTE_LABEL[r.ambiente]}</Pill> : <span className="text-muted-foreground">—</span>}</td>
                    <td className={TABLE.td}>{r.tipo ? RELEASE_TIPO_LABEL[r.tipo] : <span className="text-muted-foreground">—</span>}</td>
                    <td className={`${TABLE.td} whitespace-nowrap tabular-nums`}>{r.data_release ? fmtDate(r.data_release) : <span className="text-muted-foreground">—</span>}</td>
                    <td className={TABLE.td}>{r.impacto ? RELEASE_IMPACTO_LABEL[r.impacto] : <span className="text-muted-foreground">—</span>}</td>
                    <td className={TABLE.td}>{r.tem_rollback ? "Com plano" : <span className="text-muted-foreground">—</span>}</td>
                    <td className={`${TABLE.td} text-right`}>
                      <RowActions onEdit={() => setEdit(r)} editTitle="Editar release" onDelete={() => void del(r)} deleteTitle="Remover release" />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </SectionCard>
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
    <div className="space-y-4">
      <SectionCard
        title={`Documentação (${p.documentations.length})`}
        icon={BookOpen}
        subtitle="Manuais e documentos técnicos do produto. Clique no título para ler."
        right={<Button className="h-9 gap-1.5" onClick={() => setAdding(true)}><Plus size={14} /> Nova documentação</Button>}
        flush
      >
        {p.documentations.length === 0 ? (
          <EmptyState icon={BookOpen} title="Nenhuma documentação" description='Clique em "Nova documentação" para escrever, anexar ou apontar um link.' compact />
        ) : (
          <div className={TABLE.wrap}>
            <table className={TABLE.table}>
              <thead className={TABLE.thead}>
                <tr>
                  <th className={TABLE.thFirst}>Título</th>
                  <th className={TABLE.th}>Tipo</th>
                  <th className={TABLE.th}>Status</th>
                  <th className={TABLE.th}>Versão</th>
                  <th className={TABLE.th}>Autor</th>
                  <th className={TABLE.th}>Atualizado em</th>
                  <th className={`${TABLE.th} text-right`}><span className="sr-only">Ações</span></th>
                </tr>
              </thead>
              <tbody>
                {p.documentations.map((d) => (
                  <tr key={d.id} className={TABLE.tr}>
                    <td className={`${TABLE.tdFirst} min-w-[14rem]`}>
                      <button type="button" className="flex min-w-0 max-w-full items-center gap-2 text-left" onClick={() => setView(d)}>
                        <span className="font-medium text-primary hover:underline">{d.titulo}</span>
                        {(d.anexos?.length ?? 0) > 0 && (
                          <span className="inline-flex shrink-0 items-center gap-0.5 text-xs text-muted-foreground" title="Anexos"><Paperclip size={12} /> {d.anexos!.length}</span>
                        )}
                        {d.link_interno && <Link2 size={13} className="shrink-0 text-muted-foreground" aria-label="Tem link" />}
                      </button>
                    </td>
                    <td className={TABLE.td}><Pill>{DOCNT_TIPO_LABEL[d.tipo]}</Pill></td>
                    <td className={TABLE.td}><Pill tone={DOC_TONE[d.status]} dot>{DOCNT_STATUS_LABEL[d.status]}</Pill></td>
                    <td className={TABLE.td}>{d.versao_relacionada ? `v${d.versao_relacionada}` : <span className="text-muted-foreground">—</span>}</td>
                    <td className={TABLE.td}>{d.autor_nome ?? <span className="text-muted-foreground">—</span>}</td>
                    <td className={`${TABLE.td} whitespace-nowrap tabular-nums`}>{fmtDate(d.updated_at)}</td>
                    <td className={`${TABLE.td} text-right`}>
                      <RowActions onEdit={() => setEdit(d)} editTitle="Editar documentação" onDelete={() => void del(d)} deleteTitle="Remover documentação" />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </SectionCard>
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

// ── Sustentação: níveis e catálogo de problemas ─────────────────────────
const NIVEL_LABEL: Record<SupportNivel, string> = { n1: "Nível 1", n2: "Nível 2", n3: "Nível 3" }
const NIVEL_OPTS: SupportNivel[] = ["n1", "n2", "n3"]

function supportResponsaveisLabel(s: Support): string {
  const nomes = [
    ...s.responsaveis.map((r) => r.full_name),
    ...(s.clientes ?? []).map((c) => `${c.full_name} (cliente)`),
    ...s.nomes_externos.map((n) => `${n} (sem cadastro)`),
  ]
  return nomes.length > 0 ? nomes.join(", ") : "—"
}

function SustentacaoTab({ p, onChange }: { p: Product; onChange: () => void | Promise<void> }) {
  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState<Support | null>(null)
  // Problema em edição: nível dono + problema (null = novo).
  const [problemCtx, setProblemCtx] = useState<{ support: Support; problem: SupportProblem | null } | null>(null)
  const usedNiveis = new Set(p.supports.map((s) => s.nivel))
  const canAdd = NIVEL_OPTS.some((n) => !usedNiveis.has(n))

  function openNew() { setEditing(null); setOpen(true) }
  function openEdit(s: Support) { setEditing(s); setOpen(true) }
  async function del(s: Support) {
    const n = s.problemas.length
    const aviso = n > 0 ? `\n\nO catálogo deste nível (${n} problema${n > 1 ? "s" : ""}) sai junto.` : ""
    if (!confirm(`Excluir sustentação ${NIVEL_LABEL[s.nivel]}?${aviso}`)) return
    try {
      await produtosApi.deleteSupport(p.id, s.id)
      toast.success("Sustentação excluída.")
      await onChange()
    } catch (e) { toast.error(detail(e)) }
  }
  async function delProblem(s: Support, pr: SupportProblem) {
    if (!confirm(`Excluir o problema "${pr.name}" do ${NIVEL_LABEL[s.nivel]}?`)) return
    try {
      await produtosApi.deleteSupportProblem(p.id, s.id, pr.id)
      toast.success("Problema excluído.")
      await onChange()
    } catch (e) { toast.error(detail(e)) }
  }

  return (
    <div className="space-y-4">
      <SectionCard
        title="Sustentação"
        icon={LifeBuoy}
        subtitle={canAdd
          ? "Um cadastro por nível de atendimento, com canal, responsáveis e os problemas que o nível atende."
          : "Os três níveis de atendimento já estão cadastrados."}
        right={
          <Button className="h-9 gap-1.5" onClick={openNew} disabled={!canAdd}>
            <Plus size={14} /> Nova sustentação
          </Button>
        }
      >
        {p.supports.length === 0 ? (
          <EmptyState icon={LifeBuoy} title="Nenhuma sustentação cadastrada" description='Clique em "Nova sustentação" para adicionar.' compact />
        ) : (
          <Notice tone="blue" icon={ClipboardList}>
            <span className="min-w-0 flex-1">
              Cada problema tem SLA próprio, em horas úteis, e as soluções possíveis. É a base do Service Desk: o cliente
              escolhe o sistema e o problema, e o chamado cai no nível que atende aquele problema, com o SLA dele.
            </span>
          </Notice>
        )}
      </SectionCard>
      {p.supports.map((s) => (
        <SupportLevelCard
          key={s.id}
          support={s}
          onEdit={() => openEdit(s)}
          onDelete={() => void del(s)}
          onAddProblem={() => setProblemCtx({ support: s, problem: null })}
          onEditProblem={(pr) => setProblemCtx({ support: s, problem: pr })}
          onDeleteProblem={(pr) => void delProblem(s, pr)}
        />
      ))}
      <SupportDialog
        open={open}
        onOpenChange={(v) => { setOpen(v); if (!v) setEditing(null) }}
        productId={p.id}
        support={editing}
        usedNiveis={new Set(p.supports.filter((x) => x.id !== editing?.id).map((x) => x.nivel))}
        onSaved={async () => { setOpen(false); setEditing(null); await onChange() }}
      />
      {problemCtx && (
        <ProblemDialog
          productId={p.id}
          support={problemCtx.support}
          problem={problemCtx.problem}
          onClose={() => setProblemCtx(null)}
          onSaved={async () => { setProblemCtx(null); await onChange() }}
        />
      )}
    </div>
  )
}

/** Um nível de atendimento: dados do nível e o catálogo de problemas que ele atende. */
function SupportLevelCard({ support: s, onEdit, onDelete, onAddProblem, onEditProblem, onDeleteProblem }: {
  support: Support
  onEdit: () => void
  onDelete: () => void
  onAddProblem: () => void
  onEditProblem: (pr: SupportProblem) => void
  onDeleteProblem: (pr: SupportProblem) => void
}) {
  const n = s.problemas.length
  return (
    <SectionCard
      title={<>{NIVEL_LABEL[s.nivel]} <Pill tone={s.interno ? "blue" : "violet"}>{s.interno ? "Interno" : "Externo"}</Pill></>}
      icon={LifeBuoy}
      subtitle={n > 0 ? `${n} problema${n > 1 ? "s" : ""} no catálogo` : "Nenhum problema no catálogo ainda"}
      right={
        <div className="flex items-center gap-1">
          <Button variant="outline" className="h-9 gap-1.5" onClick={onAddProblem}>
            <Plus size={14} /> Adicionar problema
          </Button>
          <RowActions onEdit={onEdit} editTitle="Editar nível" onDelete={onDelete} deleteTitle="Excluir nível" />
        </div>
      }
      flush
    >
      <dl className="grid gap-4 border-b px-5 py-4 sm:grid-cols-3">
        <Field label="Canal">{s.canal_atendimento?.trim() || "—"}</Field>
        <Field label="Responsáveis" className="sm:col-span-2">{supportResponsaveisLabel(s)}</Field>
        {s.observacoes?.trim() && <Field label="Observações" className="sm:col-span-3">{s.observacoes}</Field>}
      </dl>
      {n === 0 ? (
        <p className="px-5 py-5 text-sm text-muted-foreground">
          Cadastre os problemas que este nível resolve, com o SLA de cada um e as soluções possíveis.
        </p>
      ) : (
        <div className={TABLE.wrap}>
          <table className={TABLE.table}>
            <thead className={TABLE.thead}>
              <tr>
                <th className={TABLE.thFirst}>Problema</th>
                <th className={TABLE.th}>SLA</th>
                <th className={TABLE.th}>Soluções possíveis</th>
                <th className={`${TABLE.th} text-right`}><span className="sr-only">Ações</span></th>
              </tr>
            </thead>
            <tbody>
              {s.problemas.map((pr) => (
                <tr key={pr.id} className={`${TABLE.tr} align-top`}>
                  <td className={`${TABLE.tdFirst} min-w-[14rem]`}>
                    <p className="font-medium">{pr.name}</p>
                    {pr.description && <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">{pr.description}</p>}
                  </td>
                  <td className={`${TABLE.td} whitespace-nowrap tabular-nums`}>{pr.sla_horas}h úteis</td>
                  <td className={`${TABLE.td} min-w-[14rem]`}>
                    {pr.solutions.length === 0 ? (
                      <span className="text-muted-foreground">Nenhuma ainda</span>
                    ) : (
                      <ul className="space-y-0.5">
                        {pr.solutions.slice(0, 3).map((sol) => (
                          <li key={sol.id} className="flex gap-1.5">
                            <CheckCircle2 size={13} className="mt-0.5 shrink-0 text-emerald-600 dark:text-emerald-400" />
                            <span>{sol.title}</span>
                          </li>
                        ))}
                        {pr.solutions.length > 3 && (
                          <li className="pl-5 text-xs text-muted-foreground">+{pr.solutions.length - 3} outra{pr.solutions.length - 3 > 1 ? "s" : ""}</li>
                        )}
                      </ul>
                    )}
                  </td>
                  <td className={`${TABLE.td} text-right`}>
                    <RowActions onEdit={() => onEditProblem(pr)} editTitle="Editar problema" onDelete={() => onDeleteProblem(pr)} deleteTitle="Excluir problema" />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </SectionCard>
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
  // Responsáveis cadastrados: Pessoas (Times) e Clientes (Portal) — no N1, fazem a triagem das ocorrências.
  const [people, setPeople] = useState<SupportPerson[]>([])
  const [canal, setCanal] = useState("")
  const [nivel, setNivel] = useState<SupportNivel>("n1")
  const [interno, setInterno] = useState(true)
  const [personIds, setPersonIds] = useState<string[]>([])
  const [clientIds, setClientIds] = useState<string[]>([])
  const [nomesExt, setNomesExt] = useState<string[]>([])
  const [busca, setBusca] = useState("")
  const [nomeExt, setNomeExt] = useState("")
  const [obs, setObs] = useState("")
  const [saving, setSaving] = useState(false)

  const niveisDisponiveis = NIVEL_OPTS.filter((n) => n === support?.nivel || !usedNiveis.has(n))

  useEffect(() => {
    if (!open) return
    produtosApi.listSupportPeople().then(setPeople).catch(() => setPeople([]))
    if (support) {
      setCanal(support.canal_atendimento ?? "")
      setNivel(support.nivel)
      setInterno(support.interno)
      setPersonIds([...support.person_ids])
      setClientIds([...(support.client_ids ?? [])])
      setNomesExt([...support.nomes_externos])
      setObs(support.observacoes ?? "")
    } else {
      setCanal("")
      setNivel(niveisDisponiveis[0] ?? "n1")
      setInterno(true)
      setPersonIds([])
      setClientIds([])
      setNomesExt([])
      setObs("")
    }
    setBusca("")
    setNomeExt("")
  }, [open, support])

  const selected = (p: SupportPerson) => (p.kind === "person" ? personIds : clientIds).includes(p.id)
  const q = busca.trim().toLowerCase()
  const sugestoes = q
    ? people.filter((p) => !selected(p) && `${p.full_name} ${p.email ?? ""}`.toLowerCase().includes(q)).slice(0, 8)
    : []
  const nameOf = (kind: SupportPerson["kind"], id: string) =>
    people.find((p) => p.kind === kind && p.id === id)?.full_name
    ?? (kind === "person" ? support?.responsaveis : support?.clientes)?.find((x) => x.id === id)?.full_name
    ?? id

  function addPerson(p: SupportPerson) {
    if (p.kind === "person") setPersonIds((ids) => [...ids, p.id])
    else setClientIds((ids) => [...ids, p.id])
    setBusca("")
  }
  function addNome() {
    const t = nomeExt.trim()
    if (!t || nomesExt.includes(t)) return
    setNomesExt((n) => [...n, t])
    setNomeExt("")
  }

  async function save() {
    if (!canal.trim()) { toast.error("Informe o canal de atendimento."); return }
    const cadastrados = personIds.length + clientIds.length
    if (cadastrados === 0 && (interno || nomesExt.length === 0)) { toast.error("Adicione ao menos um responsável."); return }
    setSaving(true)
    try {
      const payload: SupportCreate = {
        canal_atendimento: canal.trim(),
        nivel,
        interno,
        person_ids: personIds,
        client_ids: clientIds,
        nomes_externos: interno ? [] : nomesExt,
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

  const chips: Array<{ kind: SupportPerson["kind"]; id: string }> = [
    ...personIds.map((id) => ({ kind: "person" as const, id })),
    ...clientIds.map((id) => ({ kind: "client" as const, id })),
  ]

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
            <Switch checked={interno} onCheckedChange={setInterno} />
            Atendimento interno (TI)
          </label>
          <div className="space-y-2">
            <Label className="text-xs">Responsáveis pelo atendimento</Label>
            <div className="relative">
              <Input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar pessoa de Times ou cliente pelo nome ou e-mail" />
              {sugestoes.length > 0 && (
                <div className="absolute z-10 mt-1 max-h-56 w-full overflow-y-auto rounded-md border bg-popover shadow-md">
                  {sugestoes.map((p) => (
                    <button
                      key={`${p.kind}-${p.id}`}
                      type="button"
                      onClick={() => addPerson(p)}
                      className="flex w-full items-center justify-between gap-2 px-3 py-1.5 text-left text-sm hover:bg-muted"
                    >
                      <span className="min-w-0">
                        <span className="block truncate">{p.full_name}</span>
                        {(p.detail || p.email) && <span className="block truncate text-[11px] text-muted-foreground">{p.detail || p.email}</span>}
                      </span>
                      <Badge variant={p.kind === "person" ? "secondary" : "outline"} className="shrink-0 text-[10px]">
                        {p.kind === "person" ? "Times" : "Cliente"}
                      </Badge>
                    </button>
                  ))}
                </div>
              )}
            </div>
            <div className="flex flex-wrap gap-1.5">
              {chips.map(({ kind, id }) => (
                <Badge key={`${kind}-${id}`} variant="secondary" className="gap-1 text-xs">
                  {nameOf(kind, id)}
                  <span className="text-[10px] text-muted-foreground">· {kind === "person" ? "Times" : "Cliente"}</span>
                  <button
                    type="button"
                    onClick={() => (kind === "person" ? setPersonIds : setClientIds)((ids) => ids.filter((x) => x !== id))}
                  >
                    <XCircle size={12} />
                  </button>
                </Badge>
              ))}
            </div>
            {nivel === "n1" && (
              <p className="text-[11px] text-muted-foreground">
                No Nível 1, estas pessoas fazem a triagem das ocorrências da Operação Assistida no Portal (junto com o Dono e o
                Especialista do Processo do projeto).
              </p>
            )}
          </div>
          {!interno && (
            <div className="space-y-2">
              <Label className="text-xs">Sem cadastro (só nome)</Label>
              <div className="flex flex-wrap gap-2">
                <Input className="flex-1" value={nomeExt} onChange={(e) => setNomeExt(e.target.value)} placeholder="Ex.: fornecedor"
                  onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addNome() } }} />
                <Button type="button" variant="outline" size="sm" onClick={addNome}>Adicionar</Button>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {nomesExt.map((nome) => (
                  <Badge key={nome} variant="outline" className="gap-1 text-xs">
                    {nome}
                    <button type="button" onClick={() => setNomesExt((n) => n.filter((x) => x !== nome))}><XCircle size={12} /></button>
                  </Badge>
                ))}
              </div>
              {nomesExt.length > 0 && (
                <p className="text-[11px] text-amber-700 dark:text-amber-300">
                  Nome sem cadastro não recebe ocorrências nem acessa o sistema. Troque pela pessoa cadastrada quando houver.
                </p>
              )}
            </div>
          )}
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

type SolucaoDraft = { key: string; id?: string; title: string; description: string; origem?: SupportSolution["origem"] }

/** Problema do catálogo de um nível: descrição, SLA (horas úteis) e soluções possíveis.
 *  Monta só quando abre, então o estado nasce das props (sem efeito de sincronização). */
function ProblemDialog({ productId, support, problem, onClose, onSaved }: {
  productId: string
  support: Support
  problem: SupportProblem | null
  onClose: () => void
  onSaved: () => void | Promise<void>
}) {
  const [name, setName] = useState(problem?.name ?? "")
  const [desc, setDesc] = useState(problem?.description ?? "")
  const [sla, setSla] = useState(problem ? String(problem.sla_horas) : "")
  const [sols, setSols] = useState<SolucaoDraft[]>(() => (problem?.solutions ?? []).map((x) => ({
    key: x.id, id: x.id, title: x.title, description: x.description ?? "", origem: x.origem,
  })))
  const [saving, setSaving] = useState(false)
  const seq = useRef(0)

  function addSol() {
    seq.current += 1
    setSols((l) => [...l, { key: `nova-${seq.current}`, title: "", description: "" }])
  }
  const patchSol = (key: string, patch: Partial<SolucaoDraft>) =>
    setSols((l) => l.map((x) => (x.key === key ? { ...x, ...patch } : x)))

  async function save() {
    if (name.trim().length < 2) { toast.error("Informe o problema."); return }
    const horas = Number(sla)
    if (!Number.isInteger(horas) || horas < 1 || horas > 2000) { toast.error("Informe o SLA em horas úteis (número inteiro de 1 a 2000)."); return }
    const preenchidas = sols.filter((x) => x.title.trim() || x.description.trim())
    if (preenchidas.some((x) => x.title.trim().length < 2)) { toast.error("Dê um título a cada solução."); return }
    const payload: SupportProblemInput = {
      name: name.trim(),
      description: desc.trim(),  // vazio limpa a descrição na edição
      sla_horas: horas,
      solutions: preenchidas.map((x) => ({ id: x.id, title: x.title.trim(), description: x.description.trim() || null })),
    }
    setSaving(true)
    try {
      if (problem) {
        await produtosApi.updateSupportProblem(productId, support.id, problem.id, payload)
        toast.success("Problema atualizado.")
      } else {
        await produtosApi.createSupportProblem(productId, support.id, payload)
        toast.success("Problema cadastrado.")
      }
      await onSaved()
    } catch (e) { toast.error(detail(e)) } finally { setSaving(false) }
  }

  return (
    <Dialog open onOpenChange={(v) => { if (!v) onClose() }}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {problem ? "Editar problema" : "Novo problema"} · {NIVEL_LABEL[support.nivel]}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label className="text-xs">Problema</Label>
            <Input value={name} maxLength={200} onChange={(e) => setName(e.target.value)} placeholder="Ex.: Não consigo acessar o sistema" />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Descrição</Label>
            <Textarea rows={3} value={desc} onChange={(e) => setDesc(e.target.value)}
              placeholder="Como o problema aparece para o cliente e o que ele deve informar ao abrir o chamado." />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">SLA de resolução (horas úteis)</Label>
            <Input type="number" min={1} max={2000} step={1} className="max-w-[140px]" value={sla} onChange={(e) => setSla(e.target.value)} placeholder="Ex.: 8" />
            <p className="text-[11px] text-muted-foreground">Prazo do chamado aberto com este problema, contado em horas úteis.</p>
          </div>
          <div className="space-y-2">
            <Label className="text-xs">Soluções possíveis</Label>
            {sols.length === 0 && (
              <p className="text-xs text-muted-foreground">
                Nenhuma solução cadastrada. Quem resolver o chamado vai escolher uma destas ou registrar a que aplicou.
              </p>
            )}
            {sols.map((x, i) => (
              <div key={x.key} className="space-y-2 rounded-xl border p-3">
                <div className="flex items-start gap-2">
                  <Input className="flex-1" value={x.title} maxLength={200} onChange={(e) => patchSol(x.key, { title: e.target.value })}
                    placeholder={`Solução ${i + 1}. Ex.: Redefinir a senha pelo portal`} />
                  <Button type="button" variant="ghost" size="icon" className="h-9 w-9 shrink-0 text-muted-foreground hover:text-destructive"
                    title="Remover solução" aria-label="Remover solução" onClick={() => setSols((l) => l.filter((y) => y.key !== x.key))}>
                    <Trash2 size={14} />
                  </Button>
                </div>
                <Textarea rows={2} value={x.description} onChange={(e) => patchSol(x.key, { description: e.target.value })}
                  placeholder="Passo a passo (opcional)" />
                {x.origem === "atendimento" && <Pill tone="teal">Registrada em atendimento</Pill>}
              </div>
            ))}
            <Button type="button" variant="outline" size="sm" className="gap-1.5" onClick={addSol}>
              <Plus size={13} /> Adicionar solução
            </Button>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button onClick={() => void save()} disabled={saving}>
            {saving && <Loader2 size={14} className="mr-1.5 animate-spin" />}
            {problem ? "Salvar alterações" : "Cadastrar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
