import { useEffect, useRef, useState } from "react"
import { Loader2, Search, X } from "lucide-react"

import {
  PROJECT_CLIENT_ROLE_LABEL,
  type ProjectClientCandidate,
  type ProjectClientCandidates,
  type ProjectClientRole,
} from "@/api/clientes"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { toast } from "@/lib/toast"

export const PROJECT_CLIENT_ROLES = Object.keys(PROJECT_CLIENT_ROLE_LABEL) as ProjectClientRole[]

/** Pessoa escolhida + função — o mesmo formato do valor do campo Clientes da solicitação. */
export interface PickedClient {
  client_id: string | null
  email: string
  full_name: string
  department: string | null
  organization: string | null
  job_title: string | null
  project_role: ProjectClientRole
  project_role_other: string | null
}

export function clientRoleLabel(role: ProjectClientRole | null | undefined, other?: string | null): string {
  if (!role) return ""
  if (role === "outro") return other?.trim() || "Outro"
  return PROJECT_CLIENT_ROLE_LABEL[role] ?? ""
}

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

type Draft = Omit<PickedClient, "project_role" | "project_role_other">

/** Busca por nome/e-mail (clientes, Pessoas, usuários; folha pelo e-mail), cadastro manual
 *  quando não acha, e a função da pessoa no projeto. `onPick` devolve true quando aceitou. */
export function ClientPicker({
  search,
  onPick,
  onCancel,
  excludeEmails = [],
  initialRole = "solicitante",
}: {
  search: (q: string) => Promise<ProjectClientCandidates>
  onPick: (client: PickedClient) => Promise<boolean> | boolean
  onCancel: () => void
  excludeEmails?: string[]
  initialRole?: ProjectClientRole
}) {
  const [query, setQuery] = useState("")
  const [results, setResults] = useState<ProjectClientCandidates | null>(null)
  const [searching, setSearching] = useState(false)
  const [draft, setDraft] = useState<Draft | null>(null)
  const [manual, setManual] = useState(false)
  const [role, setRole] = useState<ProjectClientRole>(initialRole)
  const [roleOther, setRoleOther] = useState("")
  const [saving, setSaving] = useState(false)
  const searchSeq = useRef(0)
  const excluded = new Set(excludeEmails.map((e) => e.toLowerCase()))

  useEffect(() => {
    if (draft || manual) return
    const q = query.trim()
    if (q.length < 2) { setResults(null); return }
    const seq = ++searchSeq.current
    const t = setTimeout(() => {
      setSearching(true)
      search(q)
        .then((r) => { if (seq === searchSeq.current) setResults(r) })
        .catch(() => { if (seq === searchSeq.current) setResults({ items: [], genus: "skipped" }) })
        .finally(() => { if (seq === searchSeq.current) setSearching(false) })
    }, 300)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, draft, manual])

  function pick(c: ProjectClientCandidate) {
    setDraft({
      client_id: c.client_id,
      email: c.email,
      full_name: c.full_name ?? "",
      department: c.department,
      organization: c.organization,
      job_title: c.job_title,
    })
    // Veio só da folha (sem nome): completa à mão.
    setManual(!c.full_name)
  }

  function startManual() {
    const q = query.trim()
    setDraft({
      client_id: null,
      email: q.includes("@") ? q.toLowerCase() : "",
      full_name: q.includes("@") ? "" : q,
      department: null,
      organization: null,
      job_title: null,
    })
    setManual(true)
  }

  async function submit() {
    if (!draft) return
    const email = draft.email.trim().toLowerCase()
    if (!draft.client_id && (!email.includes("@") || draft.full_name.trim().length < 2)) {
      toast.error("Informe nome e e-mail.")
      return
    }
    if (excluded.has(email)) {
      toast.error("Esta pessoa já está na lista.")
      return
    }
    if (role === "outro" && !roleOther.trim()) {
      toast.error("Descreva a função.")
      return
    }
    setSaving(true)
    try {
      const ok = await onPick({
        ...draft,
        email,
        full_name: draft.full_name.trim(),
        department: draft.department?.trim() || null,
        organization: draft.organization?.trim() || null,
        job_title: draft.job_title?.trim() || null,
        project_role: role,
        project_role_other: role === "outro" ? roleOther.trim() : null,
      })
      if (ok) {
        setQuery("")
        setResults(null)
        setDraft(null)
        setManual(false)
        setRoleOther("")
      }
    } finally {
      setSaving(false)
    }
  }

  const genusHint = results ? GENUS_HINT[results.genus] : undefined

  return (
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
                results.items.map((c) => {
                  const taken = c.already_linked || excluded.has(c.email.toLowerCase())
                  return (
                    <button
                      key={c.email} type="button" disabled={taken}
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
                        {taken ? "já está na lista" : SOURCE_LABEL[c.source]}
                      </span>
                    </button>
                  )
                })
              )}
            </div>
          )}
          {genusHint && <p className="text-[11px] text-amber-700 dark:text-amber-400">{genusHint}</p>}
          <div className="flex items-center justify-between gap-2">
            <Button type="button" variant="link" size="sm" className="h-auto px-0 text-xs" onClick={startManual}>
              Não achou? Cadastrar pelo e-mail
            </Button>
            <Button type="button" variant="ghost" size="sm" onClick={onCancel}>Cancelar</Button>
          </div>
        </>
      ) : (
        <>
          <div className="flex items-start justify-between gap-2">
            <p className="text-xs font-semibold">{manual && !draft.client_id ? "Cadastrar cliente" : "Adicionar"}</p>
            <Button type="button" variant="ghost" size="icon" className="h-6 w-6" title="Trocar pessoa" onClick={() => { setDraft(null); setManual(false) }}>
              <X size={13} />
            </Button>
          </div>
          {manual && !draft.client_id ? (
            <div className="grid gap-2 sm:grid-cols-2">
              <Input className="h-8" placeholder="Nome *" value={draft.full_name}
                onChange={(e) => setDraft({ ...draft, full_name: e.target.value })} />
              <Input className="h-8" placeholder="E-mail *" type="email" value={draft.email}
                onChange={(e) => setDraft({ ...draft, email: e.target.value })} />
              <Input className="h-8" placeholder="Departamento" value={draft.department ?? ""}
                onChange={(e) => setDraft({ ...draft, department: e.target.value })} />
              <Input className="h-8" placeholder="Cargo" value={draft.job_title ?? ""}
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
                {PROJECT_CLIENT_ROLES.map((r) => (
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
            <Button type="button" variant="ghost" size="sm" onClick={onCancel} disabled={saving}>Cancelar</Button>
            <Button type="button" size="sm" onClick={() => void submit()} disabled={saving}>
              {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Adicionar
            </Button>
          </div>
        </>
      )}
    </div>
  )
}
