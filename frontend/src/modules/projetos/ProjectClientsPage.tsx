import { useEffect, useMemo, useState } from "react"
import { BriefcaseBusiness, Contact, Headset, KeyRound, Loader2, Pencil, Plus, Search } from "lucide-react"

import {
  clientesApi,
  type ClientLookup,
  type ClientProjectRef,
  type ProjectClient,
} from "@/api/clientes"
import { Card, KpiCount, KpiRow, PageHeader, Pill, TABLE } from "@/components/ds"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Skeleton } from "@/components/ui/skeleton"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { EmptyState } from "@/components/EmptyState"
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { toast } from "@/lib/toast"
import { FirstAccessLinkButton } from "@/components/FirstAccessLinkButton"

type Form = {
  email: string
  fullName: string
  phone: string
  organization: string
  department: string
  notes: string
  isActive: boolean
  projectIds: string[]
}

const emptyForm = (): Form => ({
  email: "",
  fullName: "",
  phone: "",
  organization: "",
  department: "",
  notes: "",
  isActive: true,
  projectIds: [],
})

function errorDetail(err: unknown, fallback: string): string {
  const detail = (err as { response?: { data?: { detail?: unknown } } })?.response?.data?.detail
  if (typeof detail === "string") return detail
  if (Array.isArray(detail)) return detail.map((d) => d.msg).join(", ")
  return fallback
}

function formFromClient(c: ProjectClient): Form {
  return {
    email: c.email,
    fullName: c.full_name,
    phone: c.phone ?? "",
    organization: c.organization ?? "",
    department: c.department ?? "",
    notes: c.notes ?? "",
    isActive: c.is_active,
    projectIds: c.projects.map((p) => p.task_id),
  }
}

/** Cadastro de clientes da Operação Assistida (feito pelo PO). E-mail é único: o
 * cadastro começa verificando o e-mail e reaproveita o cliente se ele já existir. */
export default function ProjectClientsPage() {
  const [clients, setClients] = useState<ProjectClient[]>([])
  const [projects, setProjects] = useState<ClientProjectRef[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState("")
  const [showInactive, setShowInactive] = useState(false)

  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState<ProjectClient | null>(null)
  // Cadastro novo: primeiro verifica o e-mail; o formulário só abre depois.
  const [lookup, setLookup] = useState<ClientLookup | null>(null)
  const [checking, setChecking] = useState(false)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState<Form>(emptyForm())
  const [projectFilter, setProjectFilter] = useState("")

  async function reload() {
    setClients(await clientesApi.list({ include_inactive: showInactive }).catch(() => []))
  }

  useEffect(() => {
    setLoading(true)
    Promise.all([
      clientesApi.list({ include_inactive: showInactive }).catch(() => []),
      clientesApi.linkableProjects().catch(() => []),
    ])
      .then(([cs, ps]) => {
        setClients(cs)
        setProjects(ps)
      })
      .finally(() => setLoading(false))
  }, [showInactive])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return clients
    return clients.filter((c) =>
      [c.full_name, c.email, c.organization ?? "", c.department ?? ""].some((v) => v.toLowerCase().includes(q)),
    )
  }, [clients, search])

  // Só projetos em Operação Assistida (o backend já filtra). Vínculos que o cliente já tem
  // com projetos fora da raia continuam listados (marcados) para o PO poder ver e desfazer —
  // senão sumiriam da tela, embora continuassem gravados.
  const visibleProjects = useMemo(() => {
    const oaIds = new Set(projects.map((p) => p.task_id))
    const linkedOutside = (editing?.projects ?? []).filter((p) => !oaIds.has(p.task_id))
    const all = [...projects, ...linkedOutside]
    const q = projectFilter.trim().toLowerCase()
    return q ? all.filter((p) => p.title.toLowerCase().includes(q)) : all
  }, [projects, projectFilter, editing])

  function openCreate() {
    setEditing(null)
    setLookup(null)
    setForm(emptyForm())
    setProjectFilter("")
    setOpen(true)
  }

  function openEdit(c: ProjectClient) {
    setEditing(c)
    setLookup(null)
    setForm(formFromClient(c))
    setProjectFilter("")
    setOpen(true)
  }

  async function checkEmail() {
    const email = form.email.trim().toLowerCase()
    if (!email.includes("@")) {
      toast.error("Informe um e-mail válido.")
      return
    }
    setChecking(true)
    try {
      const res = await clientesApi.lookup(email)
      setLookup(res)
      if (res.status === "client" && res.client) {
        // Já cadastrado: vira edição do cadastro existente (só vincular projetos).
        setEditing(res.client)
        setForm(formFromClient(res.client))
      } else if (res.status === "internal_user") {
        setForm((f) => ({ ...f, email, fullName: res.user_full_name ?? f.fullName }))
      } else {
        setForm((f) => ({ ...f, email }))
      }
    } catch (err) {
      toast.error(errorDetail(err, "Não foi possível verificar o e-mail."))
    } finally {
      setChecking(false)
    }
  }

  function toggleProject(id: string) {
    setForm((f) => ({
      ...f,
      projectIds: f.projectIds.includes(id) ? f.projectIds.filter((p) => p !== id) : [...f.projectIds, id],
    }))
  }

  async function save() {
    if (form.fullName.trim().length < 2) {
      toast.error("Informe o nome do cliente.")
      return
    }
    setSaving(true)
    const fields = {
      full_name: form.fullName.trim(),
      phone: form.phone.trim() || null,
      organization: form.organization.trim() || null,
      department: form.department.trim() || null,
      notes: form.notes.trim() || null,
    }
    try {
      if (editing) {
        await clientesApi.update(editing.id, { ...fields, is_active: form.isActive })
        await clientesApi.setProjects(editing.id, form.projectIds)
        toast.success("Cliente atualizado.")
      } else {
        await clientesApi.create({ ...fields, email: form.email.trim().toLowerCase(), project_task_ids: form.projectIds })
        toast.success("Cliente cadastrado. Gere o link de primeiro acesso (ícone de chave) e envie a ele.")
      }
      setOpen(false)
      await reload()
    } catch (err) {
      toast.error(errorDetail(err, "Não foi possível salvar o cliente."))
    } finally {
      setSaving(false)
    }
  }

  const showForm = !!editing || (lookup !== null && (lookup.status === "new" || lookup.status === "internal_user"))

  // Indicadores do topo (só leitura), sobre a lista carregada (com ou sem inativos).
  const counts = {
    pendentes: clients.filter((c) => c.first_access_pending && c.is_active).length,
    colaboradores: clients.filter((c) => c.is_internal_user).length,
  }

  return (
    <div className="w-full space-y-5 p-1">
      <PageHeader
        icon={Contact}
        color="#2563EB"
        title="Clientes"
        description="Clientes da Operação Assistida. Eles abrem e acompanham Ocorrências dos projetos vinculados."
        actions={
          <Button className="h-10 gap-1.5" onClick={openCreate}>
            <Plus size={16} /> Novo cliente
          </Button>
        }
      />

      {loading ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }, (_, i) => <Skeleton key={i} className="h-[74px] rounded-xl" />)}
        </div>
      ) : (
        <KpiRow className="sm:grid-cols-2 lg:grid-cols-4">
          <KpiCount icon={Contact} value={clients.length} label={showInactive ? "Clientes (com inativos)" : "Clientes ativos"} />
          <KpiCount
            icon={KeyRound} value={counts.pendentes} label="Primeiro acesso pendente"
            tone={counts.pendentes > 0 ? "amber" : "slate"} highlight={counts.pendentes > 0}
          />
          <KpiCount icon={BriefcaseBusiness} value={counts.colaboradores} label="Colaboradores (login no AgileFlow)" tone="violet" />
          <KpiCount icon={Headset} value={projects.length} label="Projetos em Operação Assistida" tone="slate" />
        </KpiRow>
      )}

      <Card className="p-4">
        <div className="flex flex-wrap items-end gap-3">
          <label className="block w-full max-w-sm space-y-1">
            <span className="text-xs text-muted-foreground">Buscar</span>
            <span className="relative block">
              <Search size={15} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input
                className="h-10 bg-background pl-8"
                placeholder="Buscar por nome, e-mail ou organização"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </span>
          </label>
          <label className="flex h-10 items-center gap-2 text-sm text-muted-foreground">
            <input
              type="checkbox"
              checked={showInactive}
              onChange={(e) => setShowInactive(e.target.checked)}
              className="h-4 w-4 rounded border-input accent-primary"
            />
            Mostrar inativos
          </label>
          {!loading && (
            <span className="ml-auto pb-2 text-sm text-muted-foreground">
              <strong className="font-semibold text-foreground">{filtered.length}</strong> de {clients.length} clientes
            </span>
          )}
        </div>
      </Card>

      {loading ? (
        <Skeleton className="h-64 rounded-2xl" />
      ) : filtered.length === 0 ? (
        <Card>
          <EmptyState
            icon={Contact}
            title={clients.length === 0 ? "Nenhum cliente cadastrado" : "Nenhum cliente encontrado"}
            description="Cadastre o cliente e vincule aos projetos que ele poderá acompanhar."
            action={{ label: "Novo cliente", onClick: openCreate }}
          />
        </Card>
      ) : (
        <Card className="overflow-hidden">
          <div className={TABLE.wrap}>
            <table className={`${TABLE.table} min-w-[860px]`}>
              <thead className={TABLE.thead}>
                <tr>
                  <th className={TABLE.thFirst}>Cliente</th>
                  <th className={TABLE.th}>Organização</th>
                  <th className={TABLE.th}>Projetos</th>
                  <th className={TABLE.th}>Acesso</th>
                  <th className={`${TABLE.th} w-24`}><span className="sr-only">Ações</span></th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((c) => (
                  <tr key={c.id} className={`${TABLE.tr} align-top`}>
                    <td className={TABLE.tdFirst}>
                      <div className="font-semibold">{c.full_name}</div>
                      <div className="text-xs text-muted-foreground">{c.email}</div>
                    </td>
                    <td className={`${TABLE.td} text-muted-foreground`}>
                      {[c.organization, c.department].filter(Boolean).join(" · ") || "—"}
                    </td>
                    <td className={`${TABLE.td} max-w-[28rem]`}>
                      {c.projects.length === 0 ? (
                        <span className="text-muted-foreground">—</span>
                      ) : (
                        <div className="flex flex-wrap gap-1">
                          {c.projects.map((p) => (
                            <span key={p.task_id} title={p.status_name ?? undefined}>
                              <Pill className="!whitespace-normal">{p.title}</Pill>
                            </span>
                          ))}
                        </div>
                      )}
                    </td>
                    <td className={TABLE.td}>
                      <div className="flex flex-wrap gap-1">
                        <Pill tone={c.is_active ? "emerald" : "slate"} dot>{c.is_active ? "Ativo" : "Inativo"}</Pill>
                        {c.is_internal_user && <Pill tone="violet">Colaborador</Pill>}
                        {c.first_access_pending && <Pill tone="amber">Primeiro acesso pendente</Pill>}
                      </div>
                    </td>
                    <td className={`${TABLE.td} text-right`}>
                      <div className="flex items-center justify-end gap-1">
                        {c.first_access_pending && c.is_active && (
                          <FirstAccessLinkButton
                            size="icon"
                            variant="ghost"
                            personName={c.full_name}
                            generate={() => clientesApi.firstAccessLink(c.id)}
                          />
                        )}
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-muted-foreground hover:text-primary"
                          onClick={() => openEdit(c)}
                          aria-label="Editar cliente"
                          title="Editar cliente"
                        >
                          <Pencil size={14} />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{editing ? "Editar cliente" : "Novo cliente"}</DialogTitle>
          </DialogHeader>

          <div className="max-h-[70vh] space-y-3 overflow-y-auto pr-1">
            <div className="space-y-1.5">
              <Label htmlFor="cl-email">E-mail</Label>
              <div className="flex gap-2">
                <Input
                  id="cl-email"
                  type="email"
                  value={form.email}
                  autoFocus={!editing}
                  disabled={!!editing || (lookup !== null && lookup.status !== "other_tenant")}
                  onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !editing && !lookup) void checkEmail()
                  }}
                />
                {!editing && (lookup === null || lookup.status === "other_tenant") && (
                  <Button variant="outline" onClick={() => void checkEmail()} disabled={checking}>
                    {checking && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    Verificar
                  </Button>
                )}
              </div>
            </div>

            {lookup?.status === "client" && (
              <Alert>
                <AlertDescription>
                  Este e-mail já é de um cliente cadastrado. Ajuste os projetos vinculados abaixo, sem criar outro cadastro.
                </AlertDescription>
              </Alert>
            )}
            {lookup?.status === "internal_user" && (
              <Alert>
                <AlertDescription>
                  E-mail de um colaborador com login no AgileFlow. Ele continua com o acesso atual e passa a ver também o
                  Portal do Cliente.
                </AlertDescription>
              </Alert>
            )}
            {lookup?.status === "other_tenant" && (
              <Alert variant="destructive">
                <AlertDescription>Este e-mail pertence a um usuário de outra empresa e não pode ser usado.</AlertDescription>
              </Alert>
            )}
            {lookup?.status === "new" && (
              <Alert>
                <AlertDescription>
                  E-mail livre. Depois do cadastro, gere o link de primeiro acesso (ícone de chave na lista) e envie ao
                  cliente — é com ele que o cliente cria a senha.
                </AlertDescription>
              </Alert>
            )}

            {showForm && (
              <>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-1.5 sm:col-span-2">
                    <Label htmlFor="cl-name">Nome</Label>
                    <Input
                      id="cl-name"
                      value={form.fullName}
                      maxLength={200}
                      onChange={(e) => setForm((f) => ({ ...f, fullName: e.target.value }))}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="cl-phone">Telefone</Label>
                    <Input
                      id="cl-phone"
                      value={form.phone}
                      maxLength={30}
                      onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="cl-org">Organização / Empresa</Label>
                    <Input
                      id="cl-org"
                      value={form.organization}
                      maxLength={200}
                      onChange={(e) => setForm((f) => ({ ...f, organization: e.target.value }))}
                    />
                  </div>
                  <div className="space-y-1.5 sm:col-span-2">
                    <Label htmlFor="cl-dept">Diretoria / Setor</Label>
                    <Input
                      id="cl-dept"
                      value={form.department}
                      maxLength={200}
                      onChange={(e) => setForm((f) => ({ ...f, department: e.target.value }))}
                    />
                  </div>
                  <div className="space-y-1.5 sm:col-span-2">
                    <Label htmlFor="cl-notes">Observações</Label>
                    <Textarea
                      id="cl-notes"
                      rows={2}
                      value={form.notes}
                      onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
                    />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <Label>Projetos vinculados ({form.projectIds.length})</Label>
                  <p className="text-xs text-muted-foreground">Só aparecem os projetos em Operação Assistida.</p>
                  <Input
                    placeholder="Filtrar projetos"
                    value={projectFilter}
                    onChange={(e) => setProjectFilter(e.target.value)}
                  />
                  <div className="max-h-56 overflow-y-auto rounded-lg border">
                    {visibleProjects.length === 0 ? (
                      <p className="p-3 text-sm text-muted-foreground">
                        {projectFilter.trim() ? "Nenhum projeto encontrado." : "Nenhum projeto em Operação Assistida no momento."}
                      </p>
                    ) : (
                      visibleProjects.map((p) => (
                        <label
                          key={p.task_id}
                          className="flex cursor-pointer items-center gap-2 border-b px-3 py-1.5 text-sm last:border-b-0 hover:bg-muted/50"
                        >
                          <input
                            type="checkbox"
                            checked={form.projectIds.includes(p.task_id)}
                            onChange={() => toggleProject(p.task_id)}
                            className="h-4 w-4 rounded border-input accent-primary"
                          />
                          <span className="flex-1 truncate">{p.title}</span>
                          {p.status_name && <span className="shrink-0 text-xs text-muted-foreground">{p.status_name}</span>}
                        </label>
                      ))
                    )}
                  </div>
                </div>

                {editing && (
                  <label className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={form.isActive}
                      onChange={(e) => setForm((f) => ({ ...f, isActive: e.target.checked }))}
                      className="h-4 w-4 rounded border-input accent-primary"
                    />
                    <span>Ativo</span>
                    {!editing.is_internal_user && (
                      <span className="text-xs text-muted-foreground">(inativar bloqueia o login do cliente)</span>
                    )}
                  </label>
                )}
              </>
            )}
          </div>

          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(false)} disabled={saving}>
              Cancelar
            </Button>
            {showForm && (
              <Button onClick={() => void save()} disabled={saving}>
                {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {editing ? "Salvar" : "Cadastrar"}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
