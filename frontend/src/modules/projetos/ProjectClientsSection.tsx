import { useEffect, useState } from "react"
import { Loader2, Plus, Trash2, Users } from "lucide-react"

import {
  PROJECT_CLIENT_ROLE_LABEL,
  projectClientsApi,
  type ProjectClientMember,
  type ProjectClientRole,
} from "@/api/clientes"
import { Button } from "@/components/ui/button"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { toast } from "@/lib/toast"
import { ClientPicker, PROJECT_CLIENT_ROLES, type PickedClient } from "@/modules/projetos/ClientPicker"

function apiError(err: unknown, fallback: string): string {
  const d = (err as { response?: { data?: { detail?: unknown } } })?.response?.data?.detail
  if (typeof d === "string") return d
  if (Array.isArray(d)) return d.map((x) => String(x?.msg ?? "").replace(/^Value error, /, "")).join(" ")
  return fallback
}

/** Clientes do projeto (card-raiz do kanban Projetos e Programas): quem acompanha o andamento
 *  no Portal do Cliente, com a função de cada um. O PO do projeto e a coordenação adicionam e
 *  retiram a qualquer momento; os demais só veem — e, sem clientes, o bloco nem aparece. */
export function ProjectClientsSection({ projectTaskId }: { projectTaskId: string }) {
  const [members, setMembers] = useState<ProjectClientMember[]>([])
  const [canManage, setCanManage] = useState(false)
  const [loaded, setLoaded] = useState(false)
  const [adding, setAdding] = useState(false)
  const [busyId, setBusyId] = useState<string | null>(null)

  useEffect(() => {
    setLoaded(false)
    projectClientsApi
      .list(projectTaskId)
      .then((r) => { setMembers(r.members); setCanManage(r.can_manage) })
      .catch(() => { setMembers([]); setCanManage(false) })
      .finally(() => setLoaded(true))
  }, [projectTaskId])

  async function add(c: PickedClient): Promise<boolean> {
    try {
      const r = await projectClientsApi.add(projectTaskId, {
        client_id: c.client_id,
        email: c.client_id ? null : c.email,
        full_name: c.full_name || null,
        department: c.department,
        job_title: c.job_title,
        organization: c.organization,
        project_role: c.project_role,
        project_role_other: c.project_role_other,
      })
      setMembers(r.members)
      toast.success(`${c.full_name || c.email} agora é cliente do projeto.`)
      setAdding(false)
      return true
    } catch (err) {
      toast.error(apiError(err, "Não foi possível adicionar o cliente."))
      return false
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
          <Button variant="ghost" size="sm" className="h-7 gap-1 text-xs" onClick={() => setAdding(true)}>
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
                      {PROJECT_CLIENT_ROLES.map((r) => (
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
        <ClientPicker
          search={(q) => projectClientsApi.candidates(projectTaskId, q)}
          onPick={add}
          onCancel={() => setAdding(false)}
          excludeEmails={members.map((m) => m.email)}
        />
      )}
    </div>
  )
}
