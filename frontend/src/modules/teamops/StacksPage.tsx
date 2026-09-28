import { useEffect, useState } from "react"
import {
  Plus, Pencil, Trash2, AlertTriangle, Bell, BookOpen, CheckCircle2, ClipboardCheck, Clock, Code2, Layers, Loader2,
  ShieldAlert, ShieldCheck, Star, UserX, Users,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Skeleton } from "@/components/ui/skeleton"
import { EmptyState } from "@/components/EmptyState"
import { Card, DetailTabs, KpiCount, KpiRow, PageHeader, Pill, SectionCard, TABLE, type TabDef } from "@/components/ds"
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog"
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select"
import {
  teamopsApi,
  STACK_LEVEL_LABELS,
  STACK_LEVEL_SHORT,
  type CompetenciasRespostas,
  type CompetenciaRespostaRow,
  type CompetencyMap,
  type Stack,
  type StackCategory,
  type StackUsage,
} from "@/api/teamops"
import { useAuth } from "@/contexts/AuthContext"
import { toast } from "@/lib/toast"
import { hasAnyPermission } from "@/lib/permissions"
import { nullableStr } from "@/lib/utils"
import CompetenciasForm from "@/modules/teamops/CompetenciasForm"

type StacksView = "map" | "catalog" | "respostas"

const TABS: TabDef<StacksView>[] = [
  { value: "map", label: "Mapa de competências", icon: Layers },
  { value: "catalog", label: "Catálogo", icon: BookOpen },
]
// Acompanhar o formulário e preencher por quem não tem login (mesmas permissões da API).
const PERM_RESPOSTAS = ["teamops.person_stack.manage", "teamops.stack.manage", "teamops.person.manage"] as const

export default function StacksPage() {
  const { user } = useAuth()
  const isAdmin = user?.role === "company_admin" || user?.role === "super_admin"
  const canRespostas = isAdmin || hasAnyPermission(user?.permissions, PERM_RESPOSTAS)
  const tabs: TabDef<StacksView>[] = canRespostas
    ? [...TABS, { value: "respostas", label: "Respostas do formulário", icon: ClipboardCheck }]
    : TABS
  const [view, setView] = useState<StacksView>("map")
  return (
    <div className="space-y-5 p-4">
      <PageHeader
        icon={Code2}
        color="#0891B2"
        title="Stacks e competências"
        description="Catálogo de tecnologias + mapa de competências do time."
      />

      <DetailTabs tabs={tabs} value={view} onChange={setView} />

      {view === "map" && <CompetencyMapView />}
      {view === "catalog" && <CatalogView />}
      {view === "respostas" && canRespostas && <RespostasView />}
    </div>
  )
}

function CompetencyMapView() {
  const [map, setMap] = useState<CompetencyMap | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    teamopsApi.getCompetencyMap().then(setMap).finally(() => setLoading(false))
  }, [])

  if (loading) return <Skeleton className="h-96 rounded-2xl" />
  if (!map || map.entries.length === 0) {
    return (
      <Card>
        <EmptyState icon={Layers} title="Mapa vazio" description='O mapa aparece conforme o time responde o formulário "Minhas competências".' compact />
      </Card>
    )
  }

  // Resumo do mapa (só contagem do que já veio na resposta).
  const criticas = map.entries.filter((e) => e.stack.is_critical).length
  const riscoAlto = map.entries.filter((e) => e.risk_level === "high").length
  const semReferencia = map.entries.filter((e) => !e.has_reference).length

  return (
    <div className="space-y-4">
      <KpiRow className="sm:grid-cols-2 xl:grid-cols-4">
        <KpiCount icon={Layers} value={map.entries.length} label="Stacks no mapa" />
        <KpiCount icon={ShieldAlert} value={criticas} label="Stacks críticas" tone={criticas > 0 ? "amber" : "slate"} />
        <KpiCount
          icon={AlertTriangle} value={riscoAlto} label="Com risco alto" tone={riscoAlto > 0 ? "red" : "emerald"} highlight={riscoAlto > 0}
        />
        <KpiCount icon={UserX} value={semReferencia} label="Sem referência interna" tone={semReferencia > 0 ? "amber" : "emerald"} />
      </KpiRow>

      <div className="grid items-start gap-4 xl:grid-cols-2">
        {map.entries.map((entry) => (
          <SectionCard
            key={entry.stack.id}
            title={
              <span className="flex flex-wrap items-center gap-2">
                {entry.stack.name}
                {entry.stack.is_critical && <Pill tone="amber">Crítica</Pill>}
                <Pill tone="slate">{entry.category_name}</Pill>
              </span>
            }
            subtitle={
              <>
                {entry.person_count} faz{entry.person_count === 1 ? "" : "em"} sozinho ou domina{entry.person_count === 1 ? "" : "m"}
                {entry.learning_count > 0 ? ` · ${entry.learning_count} aprendendo` : ""}
                {entry.has_reference ? " · com referência interna" : ""}
              </>
            }
            right={
              <Pill
                tone={entry.risk_level === "high" ? "red" : entry.risk_level === "medium" ? "amber" : "emerald"}
                className="shrink-0"
              >
                {entry.risk_level === "high" ? <AlertTriangle size={12} /> : <ShieldCheck size={12} />}
                Risco {entry.risk_level === "high" ? "alto" : entry.risk_level === "medium" ? "médio" : "baixo"}
              </Pill>
            }
          >
            {entry.persons.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nenhuma pessoa nessa stack.</p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {entry.persons.map((p) => {
                  const ref = p.is_reference || p.level === "referencia"
                  const aprendendo = p.level === "conhece" || p.level === "com_apoio"
                  return (
                    <span
                      key={p.person.id}
                      className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-sm ${
                        ref
                          ? "border-primary/40 bg-primary/10 font-medium text-primary"
                          : aprendendo ? "border-dashed bg-background text-muted-foreground" : "bg-background text-foreground"
                      }`}
                      title={STACK_LEVEL_LABELS[p.level]}
                    >
                      {ref && <Star size={13} className="fill-current" aria-hidden />}
                      {p.person.full_name}
                      <span className={ref ? "text-primary/80" : "text-muted-foreground"}>· {STACK_LEVEL_SHORT[p.level]}</span>
                    </span>
                  )
                })}
              </div>
            )}
          </SectionCard>
        ))}
      </div>
    </div>
  )
}

const NONE = "__none__"
const SEM_USO: StackUsage = { stack_id: "", person_count: 0, product_count: 0 }

function errMsg(err: unknown, fallback = "Erro ao salvar."): string {
  const d = (err as { response?: { data?: { detail?: unknown } } })?.response?.data?.detail
  return typeof d === "string" ? d : fallback
}

const plural = (n: number, um: string, varios: string) => `${n} ${n === 1 ? um : varios}`

/** Botão de ícone das linhas e cartões (editar/excluir). */
function IconButton({ title, onClick, danger = false, children }: {
  title: string; onClick: () => void; danger?: boolean; children: React.ReactNode
}) {
  return (
    <Button
      type="button" variant="ghost" size="icon" title={title} aria-label={title} onClick={onClick}
      className={`h-9 w-9 ${danger ? "text-muted-foreground hover:text-destructive" : ""}`}
    >
      {children}
    </Button>
  )
}

function CatalogView() {
  const [stacks, setStacks] = useState<Stack[]>([])
  const [categories, setCategories] = useState<StackCategory[]>([])
  const [usage, setUsage] = useState<Record<string, StackUsage>>({})
  const [loading, setLoading] = useState(true)
  const [showStackDlg, setShowStackDlg] = useState(false)
  const [editing, setEditing] = useState<Stack | null>(null)
  const [deleting, setDeleting] = useState<Stack | null>(null)
  // Categoria: undefined = fechado, null = nova, objeto = edição.
  const [categoryDlg, setCategoryDlg] = useState<StackCategory | null | undefined>(undefined)

  async function refresh() {
    const [s, c, u] = await Promise.all([
      teamopsApi.listStacks(),
      teamopsApi.listStackCategories(),
      teamopsApi.getStackUsage().catch(() => [] as StackUsage[]),
    ])
    setStacks(s)
    setCategories(c)
    setUsage(Object.fromEntries(u.map((x) => [x.stack_id, x])))
    setLoading(false)
  }

  useEffect(() => { refresh() }, [])

  if (loading) return <Skeleton className="h-96 rounded-2xl" />

  const byCategory = categories.map((c) => ({
    category: c,
    items: stacks.filter((s) => s.category_id === c.id),
  }))
  const uncategorized = stacks.filter((s) => !categories.find((c) => c.id === s.category_id))

  async function deleteCategory(c: StackCategory, n: number) {
    if (n > 0) {
      toast.error(`A categoria "${c.name}" tem ${plural(n, "stack", "stacks")}. Mova para outra categoria ou exclua antes.`)
      return
    }
    if (!confirm(`Excluir a categoria "${c.name}"?`)) return
    try {
      await teamopsApi.deleteStackCategory(c.id)
      toast.success("Categoria excluída.")
      await refresh()
    } catch (err) { toast.error(errMsg(err, "Erro ao excluir.")) }
  }

  const table = (items: Stack[]) => (
    <div className={TABLE.wrap}>
      <table className={TABLE.table}>
        <thead className={TABLE.thead}>
          <tr>
            <th className={TABLE.thFirst}>Stack</th>
            <th className={`${TABLE.th} text-right`}>Pessoas</th>
            <th className={`${TABLE.th} text-right`}>Produtos</th>
            <th className={`${TABLE.th} text-right`}><span className="sr-only">Ações</span></th>
          </tr>
        </thead>
        <tbody>
          {items.map((s) => {
            const u = usage[s.id] ?? SEM_USO
            return (
              <tr key={s.id} className={TABLE.tr}>
                <td className={TABLE.tdFirst}>
                  <span className="flex flex-wrap items-center gap-2">
                    <span className={`font-medium ${s.is_active ? "" : "text-muted-foreground"}`}>{s.name}</span>
                    {s.is_critical && <Pill tone="amber">Crítica</Pill>}
                    {!s.is_active && <Pill tone="slate">Inativa</Pill>}
                  </span>
                </td>
                <td className={`${TABLE.td} text-right tabular-nums`}>{u.person_count}</td>
                <td className={`${TABLE.td} text-right tabular-nums`}>{u.product_count}</td>
                <td className={`${TABLE.td} w-px whitespace-nowrap text-right`}>
                  <IconButton title="Editar stack" onClick={() => setEditing(s)}><Pencil size={14} /></IconButton>
                  <IconButton title="Excluir stack" danger onClick={() => setDeleting(s)}><Trash2 size={14} /></IconButton>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">
          <strong className="font-semibold text-foreground">{stacks.length}</strong> stack{stacks.length === 1 ? "" : "s"} em{" "}
          <strong className="font-semibold text-foreground">{categories.length}</strong> categoria{categories.length === 1 ? "" : "s"}.
        </p>
        <div className="flex gap-2">
          <Button variant="outline" className="h-10 gap-1.5" onClick={() => setCategoryDlg(null)}>
            <Plus size={16} /> Nova categoria
          </Button>
          <Button className="h-10 gap-1.5" onClick={() => setShowStackDlg(true)}>
            <Plus size={16} /> Nova stack
          </Button>
        </div>
      </div>

      <div className="grid items-start gap-4 xl:grid-cols-2">
        {byCategory.map(({ category, items }) => (
          <SectionCard
            key={category.id}
            title={
              <span className="flex flex-wrap items-center gap-2">
                {category.name}
                {!category.is_active && <Pill tone="slate">Inativa</Pill>}
              </span>
            }
            subtitle={plural(items.length, "stack", "stacks")}
            right={
              <div className="flex shrink-0 items-center">
                <IconButton title="Editar categoria" onClick={() => setCategoryDlg(category)}><Pencil size={14} /></IconButton>
                <IconButton title="Excluir categoria" danger onClick={() => void deleteCategory(category, items.length)}>
                  <Trash2 size={14} />
                </IconButton>
              </div>
            }
            flush
          >
            {items.length === 0
              ? <p className="px-5 py-4 text-sm text-muted-foreground">Nenhuma stack nessa categoria.</p>
              : table(items)}
          </SectionCard>
        ))}

        {uncategorized.length > 0 && (
          <SectionCard title="Sem categoria" subtitle={plural(uncategorized.length, "stack", "stacks")} flush>
            {table(uncategorized)}
          </SectionCard>
        )}
      </div>

      {showStackDlg && (
        <StackDialog
          categories={categories}
          stack={null}
          onClose={() => setShowStackDlg(false)}
          onSaved={() => { setShowStackDlg(false); refresh() }}
        />
      )}
      {editing && (
        <StackDialog
          categories={categories}
          stack={editing}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); refresh() }}
        />
      )}
      {deleting && (
        <DeleteStackDialog
          stack={deleting}
          usage={usage[deleting.id] ?? SEM_USO}
          stacks={stacks}
          onClose={() => setDeleting(null)}
          onDeleted={() => { setDeleting(null); refresh() }}
        />
      )}
      {categoryDlg !== undefined && (
        <CategoryDialog
          category={categoryDlg}
          onClose={() => setCategoryDlg(undefined)}
          onSaved={() => { setCategoryDlg(undefined); refresh() }}
        />
      )}
    </div>
  )
}

function StackDialog({
  categories, stack, onClose, onSaved,
}: {
  categories: StackCategory[]
  stack: Stack | null
  onClose: () => void
  onSaved: () => void
}) {
  const isEdit = !!stack
  const [name, setName] = useState(stack?.name ?? "")
  const [slug, setSlug] = useState(stack?.slug ?? "")
  const [categoryId, setCategoryId] = useState(stack?.category_id ?? (categories[0]?.id ?? NONE))
  const [critical, setCritical] = useState(stack?.is_critical ?? false)
  const [active, setActive] = useState(stack?.is_active ?? true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (categoryId === NONE) {
      setError("Selecione uma categoria.")
      return
    }
    setSaving(true)
    setError(null)
    try {
      if (isEdit) {
        await teamopsApi.updateStack(stack!.id, {
          category_id: categoryId,
          name,
          slug: nullableStr(slug),
          is_critical: critical,
          is_active: active,
        })
      } else {
        await teamopsApi.createStack({
          category_id: categoryId,
          name,
          slug: slug || undefined,
          is_critical: critical,
          is_active: active,
        })
      }
      toast.success(isEdit ? "Stack atualizada." : "Stack cadastrada.")
      onSaved()
    } catch (err) {
      setError(errMsg(err))
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent>
        <DialogHeader><DialogTitle>{isEdit ? "Editar stack" : "Nova stack"}</DialogTitle></DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <Label>Nome *</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} required />
          </div>
          <div>
            <Label>Slug (opcional)</Label>
            <Input value={slug} onChange={(e) => setSlug(e.target.value.toLowerCase())} placeholder="(gerado a partir do nome)" />
          </div>
          <div>
            <Label>Categoria *</Label>
            <Select value={categoryId} onValueChange={setCategoryId}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {categories.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={critical} onChange={(e) => setCritical(e.target.checked)} />
            Stack crítica (gera alerta se sem backup)
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} />
            Ativa (inativa sai das listas de seleção, sem apagar)
          </label>
          {error && <p className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">{error}</p>}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>Cancelar</Button>
            <Button type="submit" disabled={saving}>{saving ? "Salvando…" : "Salvar"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

/** Exclusão da stack: mostra o uso e deixa escolher quem assume produtos e competências. */
function DeleteStackDialog({ stack, usage, stacks, onClose, onDeleted }: {
  stack: Stack
  usage: StackUsage
  stacks: Stack[]
  onClose: () => void
  onDeleted: () => void
}) {
  const [replaceWith, setReplaceWith] = useState(NONE)
  const [saving, setSaving] = useState(false)
  const emUso = usage.person_count + usage.product_count > 0
  const outras = stacks
    .filter((s) => s.id !== stack.id)
    .sort((a, b) => Number(b.is_active) - Number(a.is_active) || a.name.localeCompare(b.name, "pt-BR"))
  const usoTexto = [
    usage.product_count > 0 ? plural(usage.product_count, "produto", "produtos") : "",
    usage.person_count > 0 ? plural(usage.person_count, "pessoa", "pessoas") : "",
  ].filter(Boolean).join(" e ")

  async function excluir() {
    setSaving(true)
    try {
      await teamopsApi.deleteStack(stack.id, replaceWith === NONE ? undefined : replaceWith)
      const alvo = outras.find((s) => s.id === replaceWith)
      toast.success(alvo ? `Stack excluída. Os cadastros passaram para "${alvo.name}".` : "Stack excluída.")
      onDeleted()
    } catch (err) {
      toast.error(errMsg(err, "Erro ao excluir."))
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open onOpenChange={(v) => { if (!v) onClose() }}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>Excluir a stack “{stack.name}”?</DialogTitle></DialogHeader>
        {emUso ? (
          <div className="space-y-3 text-sm">
            <p>Está em uso em <strong className="font-semibold">{usoTexto}</strong>.</p>
            <div className="space-y-1.5">
              <Label>Substituir por</Label>
              <Select value={replaceWith} onValueChange={setReplaceWith}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>Nenhuma: só remover dos cadastros</SelectItem>
                  {outras.map((s) => (
                    <SelectItem key={s.id} value={s.id}>{s.name}{s.is_active ? "" : " (inativa)"}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                {replaceWith === NONE
                  ? "A stack sai dos produtos e das competências das pessoas."
                  : "Produtos e pessoas passam para a stack escolhida. Quem já tem essa stack mantém o nível que tinha."}
              </p>
            </div>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">Nenhum produto ou pessoa usa esta stack.</p>
        )}
        <p className="text-xs text-muted-foreground">
          Para só tirar a stack das listas sem apagar, edite e desmarque “Ativa”.
        </p>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose}>Cancelar</Button>
          <Button type="button" variant="destructive" disabled={saving} onClick={() => void excluir()}>
            {saving && <Loader2 size={14} className="mr-1.5 animate-spin" />}
            Excluir
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function CategoryDialog({ category, onClose, onSaved }: {
  category: StackCategory | null
  onClose: () => void
  onSaved: () => void
}) {
  const [name, setName] = useState(category?.name ?? "")
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setError(null)
    try {
      if (category) await teamopsApi.updateStackCategory(category.id, { name: name.trim() })
      else await teamopsApi.createStackCategory({ name: name.trim() })
      toast.success(category ? "Categoria atualizada." : "Categoria cadastrada.")
      onSaved()
    } catch (err) {
      setError(errMsg(err))
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent>
        <DialogHeader><DialogTitle>{category ? "Editar categoria" : "Nova categoria"}</DialogTitle></DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <Label>Nome *</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} required minLength={2} />
          </div>
          {error && <p className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">{error}</p>}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>Cancelar</Button>
            <Button type="submit" disabled={saving}>{saving ? "Salvando…" : "Salvar"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

type FiltroRespostas = "todos" | "pendentes" | "responderam"

/** Acompanhamento do formulário "Minhas competências": quem respondeu, lembrete e preenchimento
 *  por quem não tem login. */
function RespostasView() {
  const [data, setData] = useState<CompetenciasRespostas | null>(null)
  const [filtro, setFiltro] = useState<FiltroRespostas>("todos")
  const [preenchendo, setPreenchendo] = useState<CompetenciaRespostaRow | null>(null)
  const [lembrando, setLembrando] = useState(false)

  const carregar = () => teamopsApi.getCompetenciasRespostas()
    .then(setData)
    .catch((err) => toast.error(errMsg(err, "Erro ao carregar as respostas.")))
  useEffect(() => {
    let vivo = true
    teamopsApi.getCompetenciasRespostas()
      .then((r) => { if (vivo) setData(r) })
      .catch((err) => toast.error(errMsg(err, "Erro ao carregar as respostas.")))
    return () => { vivo = false }
  }, [])

  if (!data) return <Skeleton className="h-96 rounded-2xl" />

  const pendentes = data.rows.filter((r) => !r.respondido_em)
  const semLogin = pendentes.filter((r) => !r.has_login).length
  const pct = data.participantes ? Math.round((data.respondidas / data.participantes) * 100) : 0
  const rows = data.rows.filter((r) =>
    filtro === "todos" ? true : filtro === "pendentes" ? !r.respondido_em : !!r.respondido_em)

  async function lembrar() {
    if (!confirm(`Enviar notificação para ${pendentes.length - semLogin} pessoa(s) que ainda não responderam?`)) return
    setLembrando(true)
    try {
      const r = await teamopsApi.lembrarCompetencias()
      toast.success(
        `${plural(r.notificados, "pessoa notificada", "pessoas notificadas")}.`
        + (r.sem_login ? ` ${plural(r.sem_login, "pessoa", "pessoas")} sem login: preencha por elas.` : ""),
      )
    } catch (err) {
      toast.error(errMsg(err, "Erro ao enviar o lembrete."))
    } finally {
      setLembrando(false)
    }
  }

  const FILTROS: [FiltroRespostas, string][] = [
    ["todos", `Todos (${data.participantes})`],
    ["pendentes", `Pendentes (${pendentes.length})`],
    ["responderam", `Responderam (${data.respondidas})`],
  ]

  return (
    <div className="space-y-4">
      <KpiRow className="sm:grid-cols-2 xl:grid-cols-4">
        <KpiCount icon={Users} value={data.participantes} label="Pessoas do time" />
        <KpiCount icon={CheckCircle2} value={data.respondidas} label={`Responderam (${pct}%)`} tone="emerald" />
        <KpiCount icon={Clock} value={pendentes.length} label="Pendentes" tone={pendentes.length ? "amber" : "emerald"} />
        <KpiCount icon={UserX} value={semLogin} label="Pendentes sem login" tone={semLogin ? "amber" : "slate"} />
      </KpiRow>

      <SectionCard
        title="Respostas do formulário"
        icon={ClipboardCheck}
        subtitle='Cada pessoa responde em TeamOps > "Minhas competências". Quem não tem login você preenche por aqui.'
        right={
          <Button variant="outline" className="h-9 gap-1.5" onClick={() => void lembrar()} disabled={lembrando || pendentes.length === semLogin}>
            {lembrando ? <Loader2 size={14} className="animate-spin" /> : <Bell size={14} />} Lembrar pendentes
          </Button>
        }
        flush
      >
        <div className="flex flex-wrap gap-1.5 border-b px-5 py-3">
          {FILTROS.map(([v, l]) => (
            <Button key={v} size="sm" variant={filtro === v ? "default" : "outline"} className="h-8" onClick={() => setFiltro(v)}>{l}</Button>
          ))}
        </div>
        {rows.length === 0 ? (
          <p className="px-5 py-5 text-sm text-muted-foreground">Ninguém nesta lista.</p>
        ) : (
          <div className={TABLE.wrap}>
            <table className={TABLE.table}>
              <thead className={TABLE.thead}>
                <tr>
                  <th className={TABLE.thFirst}>Pessoa</th>
                  <th className={TABLE.th}>Situação</th>
                  <th className={`${TABLE.th} text-right`}>Stacks</th>
                  <th className={TABLE.th}>Outras tecnologias</th>
                  <th className={`${TABLE.th} text-right`}><span className="sr-only">Ações</span></th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.person_id} className={`${TABLE.tr} align-top`}>
                    <td className={TABLE.tdFirst}>
                      <p className="font-medium">{r.full_name}</p>
                      <p className="text-xs text-muted-foreground">{r.position_name ?? "Sem cargo"}</p>
                    </td>
                    <td className={TABLE.td}>
                      <span className="flex flex-wrap gap-1.5">
                        {r.respondido_em
                          ? <Pill tone="emerald" dot>Respondeu em {new Date(r.respondido_em).toLocaleDateString("pt-BR")}</Pill>
                          : <Pill tone="amber" dot>Pendente</Pill>}
                        {!r.has_login && <Pill tone="slate">Sem login</Pill>}
                      </span>
                    </td>
                    <td className={`${TABLE.td} whitespace-nowrap text-right tabular-nums`}>
                      {r.total}
                      {r.total > 0 && <span className="block text-xs text-muted-foreground">{r.autonomas} com autonomia</span>}
                    </td>
                    <td className={`${TABLE.td} max-w-[18rem]`}>
                      {r.outras ? <p className="line-clamp-2 text-xs" title={r.outras}>{r.outras}</p> : <span className="text-muted-foreground">—</span>}
                    </td>
                    <td className={`${TABLE.td} text-right`}>
                      <Button variant="ghost" size="sm" className="h-8 gap-1.5" onClick={() => setPreenchendo(r)}>
                        <Pencil size={13} /> {r.respondido_em ? "Ver respostas" : "Preencher"}
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </SectionCard>

      {preenchendo && (
        <Dialog open onOpenChange={(v) => { if (!v) setPreenchendo(null) }}>
          <DialogContent className="max-w-5xl">
            <DialogHeader><DialogTitle>Competências de {preenchendo.full_name}</DialogTitle></DialogHeader>
            <CompetenciasForm
              personId={preenchendo.person_id}
              onSaved={() => { setPreenchendo(null); void carregar() }}
            />
          </DialogContent>
        </Dialog>
      )}
    </div>
  )
}
