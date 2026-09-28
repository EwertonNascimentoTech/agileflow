import { useEffect, useMemo, useState } from "react"
import { Loader2, Plus, Trash2, Users } from "lucide-react"

import {
  PROJECT_CLIENT_ROLE_LABEL,
  programClientsApi,
  projectClientsApi,
  type ProjectClientMember,
  type ProjectClientRole,
} from "@/api/clientes"
import { Pill } from "@/components/ds"
import { Button } from "@/components/ui/button"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { toast } from "@/lib/toast"
import { ClientPicker, PROJECT_CLIENT_ROLES, type PickedClient } from "@/modules/projetos/ClientPicker"
import { DrawerSection } from "@/modules/projetos/CollapsibleFormSection"

function apiError(err: unknown, fallback: string): string {
  const d = (err as { response?: { data?: { detail?: unknown } } })?.response?.data?.detail
  if (typeof d === "string") return d
  if (Array.isArray(d)) return d.map((x) => String(x?.msg ?? "").replace(/^Value error, /, "")).join(" ")
  return fallback
}

/** Clientes do projeto (card-raiz do kanban Projetos e Programas): quem acompanha o andamento
 *  no Portal do Cliente, com a função de cada um. O PO do projeto e a coordenação adicionam e
 *  retiram a qualquer momento; os demais só veem — e, sem clientes, o bloco nem aparece.
 *  Com `programId`, são os clientes do Programa (veem todos os projetos dele no Portal).
 *  `bare`: sem o cartão próprio (a página já dá a moldura) — padrão na tela do Programa. */
export function ProjectClientsSection({
  projectTaskId,
  programId,
  bare = !!programId,
}: {
  projectTaskId?: string
  programId?: string
  bare?: boolean
}) {
  const targetId = programId ?? projectTaskId ?? ""
  const noun = programId ? "programa" : "projeto"
  const membersApi = useMemo(() => (programId ? programClientsApi : projectClientsApi), [programId])
  const [members, setMembers] = useState<ProjectClientMember[]>([])
  const [canManage, setCanManage] = useState(false)
  const [loaded, setLoaded] = useState(false)
  const [adding, setAdding] = useState(false)
  const [busyId, setBusyId] = useState<string | null>(null)

  useEffect(() => {
    setLoaded(false)
    membersApi
      .list(targetId)
      .then((r) => { setMembers(r.members); setCanManage(r.can_manage) })
      .catch(() => { setMembers([]); setCanManage(false) })
      .finally(() => setLoaded(true))
  }, [membersApi, targetId])

  async function add(c: PickedClient): Promise<boolean> {
    try {
      const r = await membersApi.add(targetId, {
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
      toast.success(`${c.full_name || c.email} agora é cliente do ${noun}.`)
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
      other = window.prompt(`Função de ${m.full_name} no ${noun}:`, m.project_role_other ?? "")?.trim() ?? ""
      if (!other) return
    }
    setBusyId(m.client_id)
    try {
      const r = await membersApi.update(targetId, m.client_id, { project_role: next, project_role_other: other })
      setMembers(r.members)
    } catch (err) {
      toast.error(apiError(err, "Não foi possível alterar a função."))
    } finally {
      setBusyId(null)
    }
  }

  async function remove(m: ProjectClientMember) {
    if (!window.confirm(`Retirar ${m.full_name} dos clientes deste ${noun}? Deixa de ver o ${noun} no Portal.`)) return
    setBusyId(m.client_id)
    try {
      const r = await membersApi.remove(targetId, m.client_id)
      setMembers(r.members)
      toast.success(`${m.full_name} saiu dos clientes do ${noun}.`)
    } catch (err) {
      toast.error(apiError(err, "Não foi possível retirar o cliente."))
    } finally {
      setBusyId(null)
    }
  }

  if (!loaded || (!canManage && members.length === 0)) return null

  const title = `Clientes do ${noun}`
  const badge = members.length > 0 && <Pill tone="blue">{members.length}</Pill>
  const subtitle = programId
    ? "Veem no Portal do Cliente todos os projetos deste programa. Quem tem a função Sponsor aparece como Patrocinador."
    : "Acompanham o andamento deste projeto no Portal do Cliente."
  const addButton = canManage && !adding && (
    <Button variant="outline" size="sm" className="h-8 gap-1" onClick={() => setAdding(true)}>
      <Plus size={14} /> Adicionar
    </Button>
  )

  const body = (
    <>
      {members.length === 0 && !adding && (
        <p className="text-sm text-muted-foreground">Nenhum cliente vinculado.</p>
      )}

      {members.length > 0 && (
        <div className="space-y-1.5">
          {members.map((m) => (
            <div key={m.client_id} className="flex flex-wrap items-center gap-2 rounded-lg border bg-muted/30 px-3 py-2 text-sm">
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium">{m.full_name}</p>
                <p className="truncate text-xs text-muted-foreground">
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
                    <SelectTrigger className="h-8 w-40 bg-background text-xs">
                      <SelectValue placeholder="Função">{m.project_role_label || "Função"}</SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      {PROJECT_CLIENT_ROLES.map((r) => (
                        <SelectItem key={r} value={r}>{PROJECT_CLIENT_ROLE_LABEL[r]}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button
                    variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-destructive"
                    title={`Retirar do ${noun}`} disabled={busyId === m.client_id}
                    onClick={() => void remove(m)}
                  >
                    {busyId === m.client_id ? <Loader2 size={13} className="animate-spin" /> : <Trash2 size={13} />}
                  </Button>
                </>
              ) : (
                m.project_role_label && <Pill tone="blue">{m.project_role_label}</Pill>
              )}
            </div>
          ))}
        </div>
      )}

      {canManage && adding && (
        <ClientPicker
          search={(q) => membersApi.candidates(targetId, q)}
          onPick={add}
          onCancel={() => setAdding(false)}
          excludeEmails={members.map((m) => m.email)}
        />
      )}
    </>
  )

  if (bare) {
    return (
      <div className="space-y-3">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <h3 className="flex flex-wrap items-center gap-2 text-base font-semibold">
              <Users size={16} className="shrink-0 text-sky-600 dark:text-sky-400" />
              {title}
              {badge}
            </h3>
            <p className="mt-0.5 text-sm text-muted-foreground">{subtitle}</p>
          </div>
          {addButton}
        </div>
        {body}
      </div>
    )
  }

  return (
    <DrawerSection
      title={title}
      icon={Users}
      iconClassName="text-sky-600 dark:text-sky-400"
      badges={badge}
      subtitle={subtitle}
      right={addButton}
    >
      {body}
    </DrawerSection>
  )
}
