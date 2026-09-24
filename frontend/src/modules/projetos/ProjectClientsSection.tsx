import { useEffect, useRef, useState } from "react"
import { Loader2, Plus, Search, Trash2, Users, X } from "lucide-react"

import {
  PROJECT_CLIENT_ROLE_LABEL,
  projectClientsApi,
  type ProjectClientCandidate,
  type ProjectClientCandidates,
  type ProjectClientMember,
  type ProjectClientRole,
} from "@/api/clientes"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { toast } from "@/lib/toast"

function apiError(err: unknown, fallback: string): string {
  const d = (err as { response?: { data?: { detail?: unknown } } })?.response?.data?.detail
  if (typeof d === "string") return d
  if (Array.isArray(d)) return d.map((x) => String(x?.msg ?? "").replace(/^Value error, /, "")).join(" ")
  return fallback
}

const ROLES = Object.keys(PROJECT_CLIENT_ROLE_LABEL) as ProjectClientRole[]

const SOURCE_LABEL: Record<ProjectClientCandidate["source"], string> = {
  client: "Cliente",
  person: "Pessoas",
  user: "Usuário",
  genus: "Folha",
}

const GENUS_HINT: Partial<Record<ProjectClientCandidates["genus"], string>> = {
  unavailable: "Folha (Genus) indisponível agora — preencha departamento e cargo à mão.",
  not_found: "E-mail não encontrado na folha (Genus).",
}

type Draft = {
  client_id: string | null
  email: string
  full_name: string
  department: string
  job_title: string
  organization: string
}

const emptyDraft: Draft = { client_id: null, email: "", full_name: "", department: "", job_title: "", organization: "" }

/** Clientes do projeto (card-raiz do kanban Projetos e Programas): quem acompanha o andamento
 *  no Portal do Cliente, com a função de cada um. O PO do projeto e a coordenação adicionam e
 *  retiram a qualquer momento; os demais só veem — e, sem clientes, o bloco nem aparece. */
export function ProjectClientsSection({ projectTaskId }: { projectTaskId: string }) {
  const [members, setMembers] = useState<ProjectClientMember[]>([])
  const [canManage, setCanManage] = useState(false)
  const [loaded, setLoaded] = useState(false)
  const [adding, setAdding] = useState(false)
  const [busyId, setBusyId] = useState<string | null>(null)

  // Formulário de inclusão
  const [query, setQuery] = useState("")
  const [results, setResults] = useState<ProjectClientCandidates | null>(null)
  const [searching, setSearching] = useState(false)
  const [draft, setDraft] = useState<Draft | null>(null)
  const [manual, setManual] = useState(false)
  const [role, setRole] = useState<ProjectClientRole>("solicitante")
  const [roleOther, setRoleOther] = useState("")
  const [saving, setSaving] = useState(false)
  const searchSeq = useRef(0)

  useEffect(() => {
    setLoaded(false)
    projectClientsApi
      .list(projectTaskId)
      .then((r) => { setMembers(r.members); setCanManage(r.can_manage) })
      .catch(() => { setMembers([]); setCanManage(false) })
      .finally(() => setLoaded(true))
  }, [projectTaskId])

  useEffect(() => {
    if (!adding || draft || manual) return
    const q = query.trim()
    if (q.length < 2) { setResults(null); return }
    const seq = ++searchSeq.current
    const t = setTimeout(() => {
      setSearching(true)
      projectClientsApi
        .candidates(projectTaskId, q)
        .then((r) => { if (seq === searchSeq.current) setResults(r) })
        .catch(() => { if (seq === searchSeq.current) setResults({ items: [], genus: "skipped" }) })
        .finally(() => { if (seq === searchSeq.current) setSearching(false) })
    }, 300)
    return () => clearTimeout(t)
  }, [query, adding, draft, manual, projectTaskId])

  function resetForm() {
    setQuery("")
    setResults(null)
    setDraft(null)
    setManual(false)
    setRole("solicitante")
    setRoleOther("")
  }

  function pick(c: ProjectClientCandidate) {
    setDraft({
      client_id: c.client_id,
      email: c.email,
      full_name: c.full_name ?? "",
      department: c.department ?? "",
      job_title: c.job_title ?? "",
      organization: c.organization ?? "",
    })
    // Veio só da folha (sem nome): completa à mão.
    setManual(!c.full_name)
  }

  function startManual() {
    const q = query.trim()
    setDraft({ ...emptyDraft, email: q.includes("@") ? q.toLowerCase() : "", full_name: q.includes("@") ? "" : q })
    setManual(true)
  }

  async function save() {
    if (!draft) return
    if (role === "outro" && !roleOther.trim()) {
      toast.error("Descreva a função.")
      return
    }
    setSaving(true)
    try {
      const r = await projectClientsApi.add(projectTaskId, {
        client_id: draft.client_id,
        email: draft.client_id ? null : draft.email.trim() || null,
        full_name: draft.full_name.trim() || null,
        department: draft.department.trim() || null,
        job_title: draft.job_title.trim() || null,
        organization: draft.organization.trim() || null,
        project_role: role,
        project_role_other: role === "outro" ? roleOther.trim() : null,
      })
      setMembers(r.members)
      toast.success(`${draft.full_name || draft.email} agora é cliente do projeto.`)
      resetForm()
      setAdding(false)
    } catch (err) {
      toast.error(apiError(err, "Não foi possível adicionar o cliente."))
    } finally {
      setSaving(false)
    }
  }

  async function changeRole(m: ProjectClientMember, next: ProjectClientRole) {
    let other: string | null = null
    if (next === "outro") {
      other = window.prompt(`Função de ${m.full_name} no projeto:`, m.project_role_other ?? "")?.trim() ?? ""
      if (!other) return
    }
    setBusyId(m.client_id)
    try {
      const r = await projectClientsApi.update(projectTaskId, m.client_id, { project_role: next, project_role_other: other })
      setMembers(r.members)
    } catch (err) {
      toast.error(apiError(err, "Não foi possível alterar a função."))
    } finally {
      setBusyId(null)
    }
  }

  async function remove(m: ProjectClientMember) {
    if (!window.confirm(`Retirar ${m.full_name} dos clientes deste projeto? Ele deixa de ver o projeto no Portal.`)) return
    setBusyId(m.client_id)
    try {
      const r = await projectClientsApi.remove(projectTaskId, m.client_id)
      setMembers(r.members)
      toast.success(`${m.full_name} saiu dos clientes do projeto.`)
    } catch (err) {
      toast.error(apiError(err, "Não foi possível retirar o cliente."))
    } finally {
      setBusyId(null)
    }
  }

  if (!loaded || (!canManage && members.length === 0)) return null

  const genusHint = results ? GENUS_HINT[results.genus] : undefined

  return (
    <div className="space-y-2 rounded-md border border-sky-500/30 bg-sky-50/40 p-3 dark:bg-sky-950/20">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Users size={14} className="text-sky-600" />
          <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-sky-700 dark:text-sky-400">
            Clientes do projeto
          </p>
          {members.length > 0 && <span className="text-[11px] text-muted-foreground">({members.length})</span>}
        </div>
        {canManage && !adding && (
          <Button variant="ghost" size="sm" className="h-7 gap-1 text-xs" onClick={() => { resetForm(); setAdding(true) }}>
            <Plus size={12} /> Adicionar
          </Button>
        )}
      </div>
      <p className="text-xs text-muted-foreground">Acompanham o andamento deste projeto no Portal do Cliente.</p>

      {members.length > 0 && (
        <div className="space-y-1.5">
          {members.map((m) => (
            <div key={m.client_id} className="flex flex-wrap items-center gap-2 rounded-md bg-background px-2 py-1.5 text-xs shadow-sm">
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium">{m.full_name}</p>
                <p className="truncate text-[11px] text-muted-foreground">
                  {[m.email, m.department, m.job_title].filter(Boolean).join(" · ")}
                  {!m.has_login && " · entra pelo IDigital"}
                  {!m.is_active && " · cadastro inativo"}
                </p>
              </div>
              {canManage ? (
                <>
                  <Select
                    value={m.project_role ?? undefined}
                    onValueChange={(v) => void changeRole(m, v as ProjectClientRole)}
                    disabled={busyId === m.client_id}
                  >
                    <SelectTrigger className="h-7 w-40 text-xs">
                      <SelectValue placeholder="Função">{m.project_role_label || "Função"}</SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      {ROLES.map((r) => (
                        <SelectItem key={r} value={r}>{PROJECT_CLIENT_ROLE_LABEL[r]}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button
                    variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-destructive"
                    title="Retirar do projeto" disabled={busyId === m.client_id}
                    onClick={() => void remove(m)}
                  >
                    {busyId === m.client_id ? <Loader2 size={13} className="animate-spin" /> : <Trash2 size={13} />}
                  </Button>
                </>
              ) : (
                m.project_role_label && (
                  <span className="rounded bg-sky-100 px-1.5 py-0.5 text-[11px] font-medium text-sky-800 dark:bg-sky-900 dark:text-sky-200">
                    {m.project_role_label}
                  </span>
                )
              )}
            </div>
          ))}
        </div>
      )}

      {canManage && adding && (
        <div className="space-y-2 rounded-md border bg-background p-2">
          {!draft ? (
            <>
              <div className="relative">
                <Search size={14} className="absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <Input
                  autoFocus className="h-8 pl-7" placeholder="Nome ou e-mail da pessoa"
                  value={query} onChange={(e) => setQuery(e.target.value)}
                />
                {searching && <Loader2 size={13} className="absolute right-2 top-1/2 -translate-y-1/2 animate-spin text-muted-foreground" />}
              </div>
              {results && (
                <div className="max-h-52 overflow-y-auto rounded-md border">
                  {results.items.length === 0 ? (
                    <p className="px-2 py-2 text-xs text-muted-foreground">Ninguém encontrado com “{query.trim()}”.</p>
                  ) : (
                    results.items.map((c) => (
                      <button
                        key={c.email} type="button" disabled={c.already_linked}
                        onClick={() => pick(c)}
                        className="flex w-full items-center gap-2 border-b px-2 py-1.5 text-left text-xs last:border-b-0 hover:bg-muted/50 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        <span className="min-w-0 flex-1">
                          <span className="block truncate font-medium">{c.full_name || c.email}</span>
                          <span className="block truncate text-[11px] text-muted-foreground">
                            {[c.full_name ? c.email : null, c.department, c.job_title].filter(Boolean).join(" · ")}
                          </span>
                        </span>
                        <span className="shrink-0 rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
                          {c.already_linked ? "já é cliente" : SOURCE_LABEL[c.source]}
                        </span>
                      </button>
                    ))
                  )}
                </div>
              )}
              {genusHint && <p className="text-[11px] text-amber-700 dark:text-amber-400">{genusHint}</p>}
              <div className="flex items-center justify-between gap-2">
                <Button variant="link" size="sm" className="h-auto px-0 text-xs" onClick={startManual}>
                  Não achou? Cadastrar pelo e-mail
                </Button>
                <Button variant="ghost" size="sm" onClick={() => { resetForm(); setAdding(false) }}>Cancelar</Button>
              </div>
            </>
          ) : (
            <>
              <div className="flex items-start justify-between gap-2">
                <p className="text-xs font-semibold">{draft.client_id || !manual ? "Adicionar ao projeto" : "Cadastrar cliente"}</p>
                <Button variant="ghost" size="icon" className="h-6 w-6" title="Trocar pessoa" onClick={() => { setDraft(null); setManual(false) }}>
                  <X size={13} />
                </Button>
              </div>
              {manual && !draft.client_id ? (
                <div className="grid gap-2 sm:grid-cols-2">
                  <Input className="h-8" placeholder="Nome *" value={draft.full_name}
                    onChange={(e) => setDraft({ ...draft, full_name: e.target.value })} />
                  <Input className="h-8" placeholder="E-mail *" type="email" value={draft.email}
                    onChange={(e) => setDraft({ ...draft, email: e.target.value })} />
                  <Input className="h-8" placeholder="Departamento" value={draft.department}
                    onChange={(e) => setDraft({ ...draft, department: e.target.value })} />
                  <Input className="h-8" placeholder="Cargo" value={draft.job_title}
                    onChange={(e) => setDraft({ ...draft, job_title: e.target.value })} />
                </div>
              ) : (
                <div className="rounded-md bg-muted/40 px-2 py-1.5 text-xs">
                  <p className="font-medium">{draft.full_name}</p>
                  <p className="text-[11px] text-muted-foreground">
                    {[draft.email, draft.department, draft.job_title].filter(Boolean).join(" · ")}
                  </p>
                </div>
              )}
              <div className="grid gap-2 sm:grid-cols-2">
                <Select value={role} onValueChange={(v) => setRole(v as ProjectClientRole)}>
                  <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {ROLES.map((r) => (
                      <SelectItem key={r} value={r}>{PROJECT_CLIENT_ROLE_LABEL[r]}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {role === "outro" && (
                  <Input className="h-8" placeholder="Função no projeto *" value={roleOther}
                    onChange={(e) => setRoleOther(e.target.value)} />
                )}
              </div>
              <div className="flex justify-end gap-2">
                <Button variant="ghost" size="sm" onClick={() => { resetForm(); setAdding(false) }} disabled={saving}>
                  Cancelar
                </Button>
                <Button
                  size="sm" onClick={() => void save()}
                  disabled={saving || (!draft.client_id && (!draft.email.trim() || draft.full_name.trim().length < 2))}
                >
                  {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Adicionar
                </Button>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  )
}
