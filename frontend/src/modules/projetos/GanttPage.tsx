import { useEffect, useMemo, useRef, useState } from "react"
import { useSearchParams } from "react-router-dom"
import {
  BarChart3, Calendar, CalendarCheck, Check, ChevronDown, Clock, Folder, GitBranch, Link2, Loader2, Plus, Users, X,
} from "lucide-react"

const DEP_LABELS: Record<DependencyType, string> = {
  FS: "Fim → Início", SS: "Início → Início", FF: "Fim → Fim", SF: "Início → Fim",
}

import { teamopsApi, type WorkCalendar } from "@/api/teamops"
import {
  projetosApi,
  type AssigneeAbsenceItem, type CriticalPathItem, type DependencyType, type Project, type ProjectDemandType, type ProjectFunnel, type ProjectScheduleBinding,
  type ProjectStatus, type ProjectTask, type ProjectTaskDependency,
} from "@/api/projetos"
import type { User } from "@/types"
import { Skeleton } from "@/components/ui/skeleton"
import { EmptyState } from "@/components/EmptyState"
import { GanttChart } from "@/modules/projetos/GanttChart"
import { WorkloadView } from "@/modules/projetos/WorkloadView"
import { toast } from "@/lib/toast"

const DOW = ["DOM", "SEG", "TER", "QUA", "QUI", "SEX", "SÁB"]
const MON = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"]

function initials(name: string | undefined): string {
  if (!name) return "?"
  const p = name.trim().split(/\s+/).filter(Boolean)
  if (p.length === 0) return "?"
  if (p.length === 1) return p[0].slice(0, 2).toUpperCase()
  return (p[0][0] + p[p.length - 1][0]).toUpperCase()
}
function colorForUser(id: string | null | undefined): string {
  if (!id) return "#94a3b8"
  let hash = 0
  for (let i = 0; i < id.length; i++) hash = (hash * 31 + id.charCodeAt(i)) | 0
  const palette = ["#7C3AED", "#008BD2", "#6AB42F", "#E84E0F", "#014898", "#DB2777", "#0F766E", "#64748B"]
  return palette[Math.abs(hash) % palette.length]
}
function dayOnly(iso: string): Date { return new Date(iso.slice(0, 10) + "T00:00:00") }
function isoFromInput(v: string): string | null {
  if (!v) return null
  const d = new Date(v + "T00:00:00")
  return isNaN(d.getTime()) ? null : d.toISOString() // tolera datas corrompidas sem derrubar a tela
}

// Ausências (APROVADA) do responsável que sobrepõem o período [startIso, dueIso].
// Compara por string "YYYY-MM-DD" (timezone-safe). Vazio se faltar responsável/datas.
function overlappingAbsences(
  absencesByUser: Record<string, AssigneeAbsenceItem[]>,
  assignedTo: string | null | undefined,
  startIso: string | null | undefined,
  dueIso: string | null | undefined,
): AssigneeAbsenceItem[] {
  if (!assignedTo || !startIso || !dueIso) return []
  const a = startIso.slice(0, 10), b = dueIso.slice(0, 10)
  const lo = a <= b ? a : b, hi = a <= b ? b : a // tolera datas invertidas
  return (absencesByUser[assignedTo] ?? []).filter((x) => x.end_date >= lo && x.start_date <= hi)
}

// Soma `n` dias úteis (seg–sex) a uma data "YYYY-MM-DD", alinhando o início no próximo dia útil.
// Espelha _add_business_days do backend para o vencimento bater com o cálculo do servidor.
function addBusinessDays(dateStr: string, n: number): string {
  const [y, m, d] = dateStr.split("-").map(Number)
  const cur = new Date(Date.UTC(y, m - 1, d))
  if (isNaN(cur.getTime())) return "" // data inválida → não calcula vencimento
  const isBiz = (dt: Date) => { const w = dt.getUTCDay(); return w >= 1 && w <= 5 }
  while (!isBiz(cur)) cur.setUTCDate(cur.getUTCDate() + 1)
  let step = 0
  while (step < n) { cur.setUTCDate(cur.getUTCDate() + 1); if (isBiz(cur)) step++ }
  return cur.toISOString().slice(0, 10)
}
// Vencimento derivado de início + horas estimadas (ceil(horas/8) dias úteis, mín. 1). "" se faltar.
function deriveDue(startStr: string, hoursStr: string): string {
  if (!startStr) return ""
  const h = parseFloat(hoursStr)
  if (isNaN(h) || h <= 0) return ""
  const duration = Math.max(1, Math.ceil(h / 8))
  return addBusinessDays(startStr, duration - 1)
}

export default function GanttPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const rootParam = searchParams.get("root")

  const [projects, setProjects] = useState<Project[]>([])
  const [projectId, setProjectId] = useState("")
  const [funnels, setFunnels] = useState<ProjectFunnel[]>([])
  const [statuses, setStatuses] = useState<ProjectStatus[]>([])
  const [tasks, setTasks] = useState<ProjectTask[]>([])
  const [demandTypes, setDemandTypes] = useState<ProjectDemandType[]>([])
  const [bindings, setBindings] = useState<ProjectScheduleBinding[]>([])
  const [dependencies, setDependencies] = useState<ProjectTaskDependency[]>([])
  const [users, setUsers] = useState<User[]>([])
  const [loading, setLoading] = useState(true)
  const [scale, setScale] = useState<"day" | "week">("day")
  const [view, setView] = useState<"schedule" | "resources">("schedule")
  const [projOpen, setProjOpen] = useState(false)
  const [cardOpen, setCardOpen] = useState(false)
  const [editing, setEditing] = useState<ProjectTask | null>(null)
  const [criticalById, setCriticalById] = useState<Map<string, CriticalPathItem>>(new Map())
  const [calendar, setCalendar] = useState<WorkCalendar | null>(null)
  const [absencesByUser, setAbsencesByUser] = useState<Record<string, AssigneeAbsenceItem[]>>({})

  useEffect(() => {
    async function load() {
      const [ps, dts, persons] = await Promise.all([
        projetosApi.listProjects(true),
        projetosApi.listDemandTypes(true).catch(() => [] as ProjectDemandType[]),
        teamopsApi.listPersons().catch(() => []),
      ])
      setProjects(ps)
      setDemandTypes(dts)
      // Responsável = Pessoa do teamops (todas, inclusive sem login).
      setUsers(persons.map((p) => ({ id: p.id, full_name: p.full_name })) as unknown as User[])
      // Pré-seleciona o projeto da tarefa vinda do botão "Cronograma" (?root), senão o primeiro.
      let pid = ps[0]?.id ?? ""
      if (rootParam) {
        const allTasks = await Promise.all(ps.map((p) => projetosApi.listTasks(p.id).catch(() => [])))
        const idx = allTasks.findIndex((ts) => ts.some((t) => t.id === rootParam))
        if (idx >= 0) pid = ps[idx].id
      }
      setProjectId(pid)
    }
    load().finally(() => setLoading(false))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (!projectId) return
    Promise.all([
      projetosApi.listFunnels(projectId, true),
      projetosApi.listStatuses(projectId, undefined, true),
      projetosApi.listTasks(projectId),
      projetosApi.listScheduleBindings().catch(() => [] as ProjectScheduleBinding[]),
      projetosApi.listDependencies(projectId).catch(() => [] as ProjectTaskDependency[]),
    ]).then(([fs, sts, ts, bs, deps]) => {
      setFunnels([...fs].sort((a, b) => a.order - b.order))
      setStatuses(sts)
      setTasks(ts)
      setBindings(bs)
      setDependencies(deps)
    })
  }, [projectId])

  async function refetchTasks() {
    if (!projectId) return
    const next = await projetosApi.listTasks(projectId)
    setTasks(next)
  }
  async function refetchDependencies() {
    if (!projectId) return
    const deps = await projetosApi.listDependencies(projectId).catch(() => [] as ProjectTaskDependency[])
    setDependencies(deps)
  }

  async function handleUpdate(id: string, patch: Partial<Pick<ProjectTask, "title" | "description" | "start_date" | "due_date" | "assigned_to" | "estimated_hours" | "parent_task_id">>) {
    if (!projectId) return
    // Mudança de datas/horas pode empurrar sucessoras no servidor (auto-scheduling) —
    // nesse caso re-buscamos para refletir a cascata.
    const cascades = "start_date" in patch || "due_date" in patch || "estimated_hours" in patch
    setTasks((prev) => prev.map((t) => (t.id === id ? { ...t, ...patch } : t)))
    try {
      await projetosApi.updateTask(projectId, id, patch)
      if (cascades) await refetchTasks()
    } catch (err) {
      const e = err as { response?: { data?: { detail?: unknown } } }
      toast.error(typeof e.response?.data?.detail === "string" ? e.response.data.detail : "Não foi possível salvar.")
      await refetchTasks()
    }
  }

  // Reordenação por arrasto no Gantt hierárquico (muda `order` entre irmãos do mesmo nível).
  async function handleReorder(items: Array<{ id: string; order: number }>) {
    if (!projectId || items.length === 0) return
    const orderById = new Map(items.map((i) => [i.id, i.order]))
    setTasks((prev) => prev.map((t) => (orderById.has(t.id) ? { ...t, order: orderById.get(t.id)! } : t)))
    try {
      await projetosApi.reorderTasks(projectId, items)
      // Reordenar recalcula as datas no servidor — recarrega para refletir a cascata.
      await refetchTasks()
    } catch (err) {
      const e = err as { response?: { data?: { detail?: unknown } } }
      toast.error(typeof e.response?.data?.detail === "string" ? e.response.data.detail : "Não foi possível reordenar.")
      await refetchTasks()
    }
  }

  async function createDependency(predecessorId: string, successorId: string, depType: DependencyType = "FS", lagHours = 0) {
    if (!projectId) return
    try {
      await projetosApi.createDependency(projectId, {
        predecessor_id: predecessorId, successor_id: successorId, dep_type: depType, lag_hours: lagHours,
      })
      await Promise.all([refetchDependencies(), refetchTasks()])
    } catch (err) {
      const e = err as { response?: { data?: { detail?: unknown } } }
      toast.error(typeof e.response?.data?.detail === "string" ? e.response.data.detail : "Não foi possível criar a dependência.")
    }
  }

  async function deleteDependency(depId: string) {
    if (!projectId) return
    try {
      await projetosApi.deleteDependency(projectId, depId)
      // Remover dependência pode liberar a sucessora — recarrega datas e dependências.
      await Promise.all([refetchDependencies(), refetchTasks()])
    } catch (err) {
      const e = err as { response?: { data?: { detail?: unknown } } }
      toast.error(typeof e.response?.data?.detail === "string" ? e.response.data.detail : "Não foi possível remover a dependência.")
    }
  }

  async function deleteStage(task: ProjectTask) {
    if (!projectId) return
    if (!confirm(`Excluir "${task.title}"?`)) return
    try {
      await projetosApi.deleteTask(projectId, task.id)
      setTasks((prev) => prev.filter((t) => t.id !== task.id))
    } catch (err) {
      const e = err as { response?: { data?: { detail?: unknown } } }
      toast.error(typeof e.response?.data?.detail === "string" ? e.response.data.detail : "Não foi possível excluir o item.")
    }
  }

  async function addStage(parentId: string) {
    if (!projectId) return
    try {
      const stage = await projetosApi.createScheduleStage(projectId, parentId, { title: "Nova etapa" })
      setTasks((prev) => [...prev, stage])
      setEditing(stage) // abre o modal para nomear + definir datas
    } catch (err) {
      const e = err as { response?: { data?: { detail?: unknown } } }
      toast.error(typeof e.response?.data?.detail === "string" ? e.response.data.detail : "Não foi possível adicionar a etapa.")
    }
  }

  const project = projects.find((p) => p.id === projectId) ?? null
  const rootTask = rootParam ? tasks.find((t) => t.id === rootParam) ?? null : null
  const statusById = useMemo(() => new Map(statuses.map((s) => [s.id, s])), [statuses])

  // Calendário de trabalho (para posicionar barras com precisão de hora). Tolera teamops inativo.
  useEffect(() => {
    let cancelled = false
    teamopsApi.getWorkCalendar()
      .then((c) => { if (!cancelled) setCalendar(c) })
      .catch(() => { if (!cancelled) setCalendar(null) })
    return () => { cancelled = true }
  }, [])

  // Caminho crítico (CPM): recalculado no servidor a partir das datas já persistidas sempre que
  // tarefas/dependências mudam. Só no modo hierárquico (com um card raiz selecionado).
  const rootTaskId = rootTask?.id
  useEffect(() => {
    if (!projectId || !rootTaskId) { setCriticalById(new Map()); return }
    let cancelled = false
    projetosApi.getCriticalPath(projectId, rootTaskId)
      .then((items) => { if (!cancelled) setCriticalById(new Map(items.map((i) => [i.task_id, i]))) })
      .catch(() => { if (!cancelled) setCriticalById(new Map()) })
    return () => { cancelled = true }
  }, [projectId, rootTaskId, tasks, dependencies])

  // Ausências aprovadas dos responsáveis (risco "ausente no período"). Recarrega quando
  // as tarefas mudam, então cobre datas/responsável recém-setados e ausências cadastradas
  // depois (cenário B) em qualquer refetch/reload.
  useEffect(() => {
    if (!projectId) { setAbsencesByUser({}); return }
    let cancelled = false
    projetosApi.getAssigneeAbsences(projectId)
      .then((r) => { if (!cancelled) setAbsencesByUser(r.by_user) })
      .catch(() => { if (!cancelled) setAbsencesByUser({}) })
    return () => { cancelled = true }
  }, [projectId, tasks])

  // Amarração de tipos: tipo EFETIVO de um item no cronograma seguindo a corrente de
  // allowed_child_type_ids a partir do ancestral tipado mais próximo. Etapas (sem tipo)
  // avançam 1 passo por nível, exigindo exatamente 1 filho permitido por nível.
  const typeById = useMemo(() => new Map(demandTypes.map((d) => [d.id, d])), [demandTypes])
  const taskById = useMemo(() => new Map(tasks.map((t) => [t.id, t])), [tasks])
  function effectiveTypeId(task: ProjectTask): string | null {
    if (task.demand_type_id) return task.demand_type_id
    let steps = 0
    let cur: ProjectTask | undefined = task
    while (cur && !cur.demand_type_id) {
      if (!cur.parent_task_id) return null
      cur = taskById.get(cur.parent_task_id)
      steps++
    }
    if (!cur || !cur.demand_type_id) return null
    let typeId: string = cur.demand_type_id
    for (let i = 0; i < steps; i++) {
      const allowed = typeById.get(typeId)?.allowed_child_type_ids ?? []
      if (allowed.length !== 1) return null
      typeId = allowed[0]
    }
    return typeId
  }
  function canAddChild(task: ProjectTask): boolean {
    const eff = effectiveTypeId(task)
    if (!eff) return false
    const dt = typeById.get(eff)
    return !!(dt && dt.allowed_child_type_ids && dt.allowed_child_type_ids.length > 0)
  }
  function typeBadge(task: ProjectTask): string | null {
    const eff = effectiveTypeId(task)
    return eff ? typeById.get(eff)?.name ?? null : null
  }

  // Programas/Projetos (cards) deste projeto, para escopar o cronograma a um deles.
  // Tipos de demanda marcados como visíveis no cronograma (config).
  const showTypeIds = useMemo(() => new Set(demandTypes.filter((d) => d.show_in_schedule).map((d) => d.id)), [demandTypes])

  const planningCards = useMemo(() => {
    const parentIds = new Set(tasks.map((t) => t.parent_task_id).filter(Boolean) as string[])
    return tasks
      .filter((t) => t.planning_kind === "programa" || t.planning_kind === "projeto" || parentIds.has(t.id))
      // Só lista cards cujo tipo de demanda está configurado como visível no cronograma
      // (cards sem tipo continuam aparecendo, igual à visão por funil).
      .filter((t) => !t.demand_type_id || showTypeIds.has(t.demand_type_id))
      .sort((a, b) =>
        (a.planning_kind === "programa" ? 0 : 1) - (b.planning_kind === "programa" ? 0 : 1) ||
        a.title.localeCompare(b.title))
  }, [tasks, showTypeIds])

  function selectCard(id: string | null) {
    const p = new URLSearchParams(searchParams)
    if (id) p.set("root", id)
    else p.delete("root")
    setSearchParams(p, { replace: true })
    setCardOpen(false)
  }

  // Abre direto na visão hierárquica: na primeira carga, se não há root no URL e existem
  // programas/projetos, seleciona o primeiro. Só uma vez — não impede "Ver cronograma completo".
  const autoSelectedRef = useRef(false)
  useEffect(() => {
    if (autoSelectedRef.current) return
    if (rootParam) { autoSelectedRef.current = true; return }
    if (planningCards.length > 0) {
      autoSelectedRef.current = true
      selectCard(planningCards[0].id)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [planningCards, rootParam])

  // Progresso: folha usa percent_complete (ou 100 se concluída); pai é a média ponderada pelas
  // horas estimadas das folhas descendentes (peso 1 quando sem horas).
  const progressById = useMemo(() => {
    const kids = new Map<string, ProjectTask[]>()
    for (const t of tasks) {
      if (!t.parent_task_id) continue
      const l = kids.get(t.parent_task_id) ?? []
      l.push(t); kids.set(t.parent_task_id, l)
    }
    // Retorna [soma(percent*peso), soma(peso)] das folhas descendentes.
    const calc = (t: ProjectTask): [number, number] => {
      const ch = kids.get(t.id) ?? []
      if (ch.length === 0) {
        const pct = t.completed_at ? 100 : (t.percent_complete ?? 0)
        // estimated_hours chega como string (Decimal serializado pelo Pydantic); coagir para
        // número, senão `wsum += w` concatena strings e o peso quebra o rollup (vira 0%).
        const h = Number(t.estimated_hours)
        const w = h > 0 ? h : 1
        return [pct * w, w]
      }
      let acc = 0, wsum = 0
      for (const k of ch) { const [a, w] = calc(k); acc += a; wsum += w }
      return [acc, wsum]
    }
    const m = new Map<string, number>()
    for (const t of tasks) { const [a, w] = calc(t); m.set(t.id, w > 0 ? Math.round(a / w) : 0) }
    return m
  }, [tasks])

  // Candidatas a predecessora, escopadas ao item do cronograma selecionado e em ordem hierárquica.
  // - Projeto selecionado → só os itens daquele projeto (sua subárvore).
  // - Programa selecionado → todos os projetos/itens do programa (a subárvore inteira).
  // Sem root (visão por funil), cai para todas as tarefas do projeto em ordem simples.
  const candidateNodes = useMemo<Array<{ task: ProjectTask; level: number }>>(() => {
    const kids = new Map<string, ProjectTask[]>()
    for (const t of tasks) {
      if (!t.parent_task_id) continue
      const l = kids.get(t.parent_task_id) ?? []
      l.push(t); kids.set(t.parent_task_id, l)
    }
    const sortSib = (list: ProjectTask[]) =>
      list.slice().sort((a, b) =>
        a.order - b.order ||
        (a.start_date ?? a.due_date ?? "").localeCompare(b.start_date ?? b.due_date ?? "") ||
        a.created_at.localeCompare(b.created_at))
    if (rootTask) {
      const out: Array<{ task: ProjectTask; level: number }> = []
      const walk = (t: ProjectTask, level: number) => {
        out.push({ task: t, level })
        for (const c of sortSib(kids.get(t.id) ?? [])) walk(c, level + 1)
      }
      walk(rootTask, 0)
      return out
    }
    return sortSib(tasks).map((t) => ({ task: t, level: 0 }))
  }, [rootTask, tasks])

  const cardPicker = (
    <div className="relative" style={{ marginLeft: 8 }}>
      <button className="filter-btn" onClick={() => setCardOpen((o) => !o)}>
        <GitBranch size={13} /><span>{rootTask ? rootTask.title : "Programa / Projeto"}</span><ChevronDown size={12} />
      </button>
      {cardOpen && (
        <div className="dd-menu">
          <div className="dd-head">Cronograma de…</div>
          <div className="dd-item" onClick={() => selectCard(null)}>
            <span style={{ flex: 1 }}>Todos (por funil)</span>
            {!rootTask && <Check size={13} style={{ color: "var(--af-primary)" }} />}
          </div>
          {planningCards.map((c) => (
            <div key={c.id} className="dd-item" onClick={() => selectCard(c.id)}>
              <span className="chip muted" style={{ fontSize: 9 }}>{c.planning_kind === "programa" ? "Programa" : "Projeto"}</span>
              <span style={{ flex: 1 }}>{c.title}</span>
              {rootTask?.id === c.id && <Check size={13} style={{ color: "var(--af-primary)" }} />}
            </div>
          ))}
          {planningCards.length === 0 && (
            <div className="dd-item" style={{ opacity: 0.6, pointerEvents: "none" }}>Nenhum programa/projeto</div>
          )}
        </div>
      )}
    </div>
  )
  const boundStatusIds = useMemo(() => new Set(bindings.filter((b) => b.is_active).map((b) => b.status_id)), [bindings])

  // Tarefas visíveis: têm início+prazo, tipo aparece no cronograma e estão numa etapa vinculada.
  const visible = useMemo(
    () => tasks.filter((t) =>
      t.start_date && t.due_date &&
      (!t.demand_type_id || showTypeIds.has(t.demand_type_id)) &&
      (boundStatusIds.size === 0 || boundStatusIds.has(t.status_id))),
    [tasks, showTypeIds, boundStatusIds],
  )

  // Janela de dias a partir dos dados (com folga), ou hoje ±7 se vazio.
  const days = useMemo(() => {
    const today = new Date(new Date().toDateString())
    let start = new Date(today); start.setDate(start.getDate() - 7)
    let end = new Date(today); end.setDate(end.getDate() + 21)
    const starts = visible.map((t) => dayOnly(t.start_date!).getTime()).filter((n) => !isNaN(n))
    const ends = visible.map((t) => dayOnly(t.due_date!).getTime()).filter((n) => !isNaN(n))
    if (starts.length && ends.length) {
      start = new Date(Math.min(...starts)); start.setDate(start.getDate() - 2)
      end = new Date(Math.max(...ends)); end.setDate(end.getDate() + 2)
      const minToday = new Date(today); minToday.setDate(minToday.getDate() - 2)
      if (start > minToday) start = minToday
    }
    const out: Date[] = []
    for (const d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) out.push(new Date(d))
    return out
  }, [visible])

  const dayPct = 100 / days.length
  const today = new Date(new Date().toDateString())
  const todayIdx = days.findIndex((d) => d.toDateString() === today.toDateString())
  const todayLeft = todayIdx >= 0 ? (todayIdx + 0.5) * dayPct : -1

  const weeks = useMemo(() => {
    const out: { label: string; cols: number }[] = []
    let cur: { key: string; label: string; cols: number } | null = null
    days.forEach((d) => {
      const monday = new Date(d); monday.setDate(d.getDate() - ((d.getDay() + 6) % 7))
      const key = monday.toDateString()
      if (!cur || cur.key !== key) {
        const sun = new Date(monday); sun.setDate(monday.getDate() + 6)
        cur = { key, label: `${MON[monday.getMonth()]} ${monday.getDate()}–${sun.getDate()}`, cols: 0 }
        out.push(cur)
      }
      cur.cols += 1
    })
    return out
  }, [days])

  const swimlanes = useMemo(() => funnels.map((f) => {
    const statusIds = new Set(statuses.filter((s) => s.funnel_id === f.id).map((s) => s.id))
    const rows = visible
      .filter((t) => statusIds.has(t.status_id))
      .map((t) => {
        const s = dayOnly(t.start_date!); const e = dayOnly(t.due_date!)
        let sIdx = days.findIndex((d) => d.toDateString() === s.toDateString())
        let eIdx = days.findIndex((d) => d.toDateString() === e.toDateString())
        if (sIdx === -1) sIdx = s < days[0] ? 0 : days.length - 1
        if (eIdx === -1) eIdx = e > days[days.length - 1] ? days.length - 1 : 0
        return { task: t, sIdx, eIdx }
      })
    return { funnel: f, rows }
  }), [funnels, statuses, visible, days])

  function barColor(t: ProjectTask): string {
    if (t.completed_at) return "var(--af-success)"
    if (t.sla_state === "breached") return "var(--af-destructive)"
    if (t.sla_state === "warning") return "var(--af-warning)"
    return "var(--af-primary)"
  }

  if (loading) return <div className="p-1"><Skeleton className="h-96 rounded-lg" /></div>

  // Modo escopado: cronograma de UM projeto (root) — o PO escreve as etapas (atividades-filhas).
  if (rootParam) {
    return (
      <div className="afx w-full">
        {cardOpen && <div style={{ position: "fixed", inset: 0, zIndex: 20 }} onClick={() => setCardOpen(false)} />}
        <div className="gantt-toolbar" style={{ position: "relative", zIndex: 25 }}>
          <div className="title">
            <h1>Cronograma do projeto</h1>
            <span className="slash">/</span>
            <span className="project-name">{rootTask?.title ?? project?.name ?? ""}</span>
          </div>
          {cardPicker}
          {view === "schedule" && (
            <div className="scale-toggle" style={{ marginLeft: 8 }}>
              <button className={scale === "day" ? "on" : ""} onClick={() => setScale("day")}>Dia</button>
              <button className={scale === "week" ? "on" : ""} onClick={() => setScale("week")}>Semana</button>
            </div>
          )}
          <div className="scale-toggle" style={{ marginLeft: 8 }}>
            <button className={view === "schedule" ? "on" : ""} onClick={() => setView("schedule")}><Calendar size={12} /> Cronograma</button>
            <button className={view === "resources" ? "on" : ""} onClick={() => setView("resources")}><Users size={12} /> Recursos</button>
          </div>
          <span className="spacer" />
          {view === "schedule" && (
            <button
              className="btn primary"
              disabled={!rootTask || !canAddChild(rootTask)}
              title={rootTask && !canAddChild(rootTask) ? "Este item não tem um nível-filho definido na amarração de tipos." : undefined}
              onClick={() => rootTask && void addStage(rootTask.id)}
            >
              <Plus size={14} /> Adicionar etapa
            </button>
          )}
          <button
            className="btn ghost"
            style={{ marginLeft: 8 }}
            onClick={() => { const p = new URLSearchParams(searchParams); p.delete("root"); setSearchParams(p, { replace: true }) }}
          >
            Ver cronograma completo
          </button>
        </div>

        {view === "resources" ? (
          <WorkloadView projectId={projectId} users={users} />
        ) : rootTask ? (
          <>
            <GanttLegend />
            <GanttChart
              rootId={rootTask.id}
              tasks={tasks}
              users={users}
              dependencies={dependencies}
              scale={scale}
              progressById={progressById}
              criticalById={criticalById}
              calendar={calendar}
              absencesByUser={absencesByUser}
              onOpenTask={(t) => setEditing(t)}
              onAddChild={(t) => void addStage(t.id)}
              canAddChild={canAddChild}
              typeBadge={typeBadge}
              onDelete={(t) => void deleteStage(t)}
              onUpdateDates={(t, patch) => void handleUpdate(t.id, patch)}
              onReorder={(items) => void handleReorder(items)}
            />
          </>
        ) : (
          <EmptyState icon={BarChart3} title="Projeto não encontrado" description="O item do cronograma não foi localizado neste projeto." />
        )}

        {editing && (
          <GanttEditModal
            task={editing}
            statusName={statusById.get(editing.status_id)?.name ?? null}
            users={users}
            allTasks={tasks}
            progressById={progressById}
            absencesByUser={absencesByUser}
            candidateNodes={candidateNodes}
            dependencies={dependencies}
            critical={criticalById.get(editing.id) ?? null}
            onCreateDependency={createDependency}
            onDeleteDependency={deleteDependency}
            onClose={() => setEditing(null)}
            onSave={async (patch) => { await handleUpdate(editing.id, patch); setEditing(null) }}
          />
        )}
      </div>
    )
  }

  const isEmpty = swimlanes.every((s) => s.rows.length === 0)

  return (
    <div className="afx w-full">
      {(projOpen || cardOpen) && <div style={{ position: "fixed", inset: 0, zIndex: 20 }} onClick={() => { setProjOpen(false); setCardOpen(false) }} />}

      <div className="gantt-toolbar" style={{ position: "relative", zIndex: 25 }}>
        <div className="title">
          <h1>Gantt</h1>
          <span className="slash">/</span>
          <span className="project-name">{project?.name}</span>
          <span className="count-pill">{visible.length}</span>
        </div>

        <div className="relative" style={{ marginLeft: 8 }}>
          <button className="filter-btn" onClick={() => setProjOpen((o) => !o)}>
            <Folder size={13} /><span>{project?.name ?? "Selecionar projeto"}</span><ChevronDown size={12} />
          </button>
          {projOpen && (
            <div className="dd-menu">
              <div className="dd-head">Filtrar por projeto</div>
              {projects.map((p) => (
                <div key={p.id} className="dd-item" onClick={() => { setProjectId(p.id); setProjOpen(false) }}>
                  <Folder size={13} style={{ color: "var(--af-muted-fg)" }} />
                  <span style={{ flex: 1 }}>{p.name}</span>
                  {projectId === p.id && <Check size={13} style={{ color: "var(--af-primary)" }} />}
                </div>
              ))}
            </div>
          )}
        </div>

        {cardPicker}

        <span className="spacer" />

        <div className="scale-toggle">
          <button className={scale === "day" ? "on" : ""} onClick={() => setScale("day")}>Dia</button>
          <button className={scale === "week" ? "on" : ""} onClick={() => setScale("week")}>Semana</button>
        </div>
      </div>

      {isEmpty ? (
        <EmptyState
          icon={BarChart3}
          title="Selecione um Programa ou Projeto para montar o cronograma"
          description={
            planningCards.length
              ? "Use o seletor 'Programa / Projeto' acima para abrir o cronograma e escrever as etapas. Esta visão por funil mostra as demandas com início/prazo e vínculo de cronograma configurado."
              : "Crie um Programa/Projeto (na triagem) e escreva as etapas no cronograma. Esta visão por funil também mostra demandas com início/prazo e vínculo de cronograma configurado."
          }
          {...(planningCards.length
            ? { action: { label: "Selecionar Programa/Projeto", onClick: () => setCardOpen(true) } }
            : {})}
        />
      ) : (
        <div className="gantt">
          {/* Week strip */}
          <div className="gantt-row-grid">
            <div className="gantt-head-cell">Demanda</div>
            <div className="gantt-head-cell right">
              <div className="gantt-weeks">
                {weeks.map((w, i) => <div key={i} className="gantt-week" style={{ flex: w.cols }}>{w.label}</div>)}
              </div>
            </div>
          </div>
          {/* Day strip */}
          <div className="gantt-row-grid">
            <div className="gantt-head-cell" style={{ color: "var(--af-muted-fg)", fontWeight: 500 }}>
              {visible.length} demanda{visible.length !== 1 ? "s" : ""}
            </div>
            <div className="gantt-head-cell right">
              <div className="gantt-days">
                {days.map((d, i) => {
                  const weekend = d.getDay() === 0 || d.getDay() === 6
                  const isToday = d.toDateString() === today.toDateString()
                  return (
                    <div key={i} className={`gantt-day ${weekend ? "weekend" : ""} ${isToday ? "today" : ""}`}>
                      <div className="dow">{DOW[d.getDay()]}</div>
                      <div className="num">{d.getDate()}</div>
                    </div>
                  )
                })}
              </div>
            </div>
          </div>

          {swimlanes.map((sw) => (
            <div key={sw.funnel.id}>
              <div className="gantt-group-row">
                <div className="label">
                  <GitBranch size={13} style={{ color: "var(--af-muted-fg)" }} />
                  <span>{sw.funnel.name}</span>
                  <span className="count">{sw.rows.length}</span>
                </div>
                <div className="right" />
              </div>
              {sw.rows.map((bar) => {
                const left = bar.sIdx * dayPct
                const width = Math.max(dayPct * 0.9, (bar.eIdx - bar.sIdx + 1) * dayPct)
                const color = barColor(bar.task)
                const assignee = users.find((u) => u.id === bar.task.assigned_to) ?? null
                return (
                  <div key={bar.task.id} className="gantt-task-row">
                    <div className="label">
                      <span style={{ width: 6, height: 6, borderRadius: 3, background: color, flexShrink: 0 }} />
                      <span className="text" style={{ cursor: "pointer" }} title="Clique para editar" onClick={() => setEditing(bar.task)}>
                        {bar.task.title}
                      </span>
                      <span className="assignee-avatar" style={{ background: colorForUser(assignee?.id ?? null), width: 20, height: 20, fontSize: 9 }}>
                        {assignee ? initials(assignee.full_name) : "?"}
                      </span>
                    </div>
                    <div className="gantt-track" style={{ minHeight: 44 }}>
                      {days.map((d, i) => {
                        const weekend = d.getDay() === 0 || d.getDay() === 6
                        return <div key={i} className={`cell ${weekend ? "weekend" : ""}`} />
                      })}
                      {todayLeft >= 0 && <div className="gantt-today-line" style={{ left: todayLeft + "%" }} />}
                      <div className="gantt-bar" style={{ left: left + "%", width: width + "%", background: color }} onClick={() => setEditing(bar.task)}>
                        <span className="bar-title">{bar.task.title}</span>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          ))}
        </div>
      )}

      {editing && (
        <GanttEditModal
          task={editing}
          statusName={statusById.get(editing.status_id)?.name ?? null}
          users={users}
          allTasks={tasks}
          progressById={progressById}
          absencesByUser={absencesByUser}
          candidateNodes={candidateNodes}
          dependencies={dependencies}
          critical={criticalById.get(editing.id) ?? null}
          onCreateDependency={createDependency}
          onDeleteDependency={deleteDependency}
          onClose={() => setEditing(null)}
          onSave={async (patch) => { await handleUpdate(editing.id, patch); setEditing(null) }}
        />
      )}
    </div>
  )
}

function GanttLegend() {
  return (
    <div className="gx-legend">
      <span className="lg-title">SLA</span>
      <span className="lg"><span className="sw" style={{ background: "#014898" }} />No prazo</span>
      <span className="lg"><span className="sw" style={{ background: "#6AB42F" }} />Concluída</span>
      <span className="lg"><span className="sw" style={{ background: "#E84E0F" }} />Em risco / atrasada</span>
      <span className="lg"><span className="sw" style={{ background: "#E11D48" }} />⚡ Caminho crítico</span>
      <span className="lg"><span className="sw" style={{ background: "#E84E0F" }} />⚠ Ausência do responsável</span>
      <span className="lg"><span className="sw" style={{ background: "repeating-linear-gradient(45deg,#b6bcc6,#b6bcc6 3px,#cdd2da 3px,#cdd2da 6px)" }} />Linha de base</span>
      <span className="dep">
        <svg width="34" height="12">
          <path d="M2 6h22" stroke="#9aa3b0" strokeWidth="1.6" fill="none" />
          <path d="M24 2l5 4-5 4" stroke="#9aa3b0" strokeWidth="1.6" fill="none" strokeLinejoin="round" strokeLinecap="round" />
        </svg>
        Dependência (Fim → Início)
      </span>
    </div>
  )
}

function GanttEditModal({
  task,
  statusName,
  users,
  allTasks,
  progressById,
  absencesByUser,
  candidateNodes,
  dependencies,
  critical,
  onCreateDependency,
  onDeleteDependency,
  onClose,
  onSave,
}: {
  task: ProjectTask
  statusName: string | null
  users: User[]
  allTasks: ProjectTask[]
  progressById: Map<string, number>
  absencesByUser: Record<string, AssigneeAbsenceItem[]>
  critical: CriticalPathItem | null
  candidateNodes: Array<{ task: ProjectTask; level: number }>
  dependencies: ProjectTaskDependency[]
  onCreateDependency: (predecessorId: string, successorId: string, depType: DependencyType, lagHours: number) => Promise<void>
  onDeleteDependency: (depId: string) => Promise<void>
  onClose: () => void
  onSave: (patch: Partial<Pick<ProjectTask, "title" | "description" | "start_date" | "due_date" | "assigned_to" | "estimated_hours" | "actual_hours" | "percent_complete">>) => Promise<void>
}) {
  const [title, setTitle] = useState(task.title)
  const [description, setDescription] = useState(task.description ?? "")
  const [start, setStart] = useState(task.start_date ? task.start_date.slice(0, 10) : "")
  const [due, setDue] = useState(task.due_date ? task.due_date.slice(0, 10) : "")
  const [hours, setHours] = useState(task.estimated_hours != null ? String(task.estimated_hours) : "")
  const [assignee, setAssignee] = useState(task.assigned_to ?? "")
  const [saving, setSaving] = useState(false)
  const [addOpen, setAddOpen] = useState(false)
  const [newPred, setNewPred] = useState("")
  const [newDepType, setNewDepType] = useState<DependencyType>("FS")
  const [newLag, setNewLag] = useState("0")
  const fmtD = (iso?: string | null) => {
    if (!iso) return "—"
    const d = new Date(iso.slice(0, 10) + "T00:00:00")
    return `${String(d.getDate()).padStart(2, "0")} ${MON[d.getMonth()]}`
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose() }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [onClose])

  const inverted = !!(start && due && start > due)
  // Predecessoras desta tarefa (arestas onde ela é sucessora).
  const predDeps = dependencies.filter((d) => d.successor_id === task.id)
  const predIds = new Set(predDeps.map((d) => d.predecessor_id))
  // Candidatas: itens do escopo (subárvore do projeto/programa), em ordem hierárquica,
  // exceto a própria tarefa e as que já são predecessoras.
  const candidates = candidateNodes.filter((n) => n.task.id !== task.id && !predIds.has(n.task.id))
  const hoursNum = parseFloat(hours)
  const durationDays = !isNaN(hoursNum) && hoursNum > 0 ? Math.max(1, Math.ceil(hoursNum / 8)) : null
  const selUser = users.find((u) => u.id === assignee) ?? null
  // O card raiz (programa/projeto) é a data-base: seu término é calculado a partir das etapas.
  const isRoot = task.planning_kind === "programa" || task.planning_kind === "projeto"
  // Risco ao vivo: o responsável escolhido estará ausente (aprovada) no período [início, vencimento]?
  const liveAbsences = useMemo(
    () => overlappingAbsences(absencesByUser, assignee || null, isoFromInput(start), isoFromInput(due)),
    [absencesByUser, assignee, start, due],
  )
  // Ao mudar o início, recalcula o vencimento pelas horas (dias úteis) — espelha o servidor.
  function changeStart(v: string) { setStart(v); const nd = deriveDue(v, hours); if (nd) setDue(nd) }
  function changeHours(v: string) { setHours(v); const nd = deriveDue(start, v); if (nd) setDue(nd) }
  // Progresso é derivado dos filhos (rollup de conclusão), não editável aqui.
  const hasChildren = allTasks.some((t) => t.parent_task_id === task.id)
  const rolledProgress = progressById.get(task.id) ?? (task.completed_at ? 100 : (task.percent_complete ?? 0))
  // Feature/grupo (parent que não é projeto/programa): responsável é AGREGADO das US (read-only).
  const isAggregatedParent = hasChildren && !isRoot
  const aggregatedUsers = useMemo<User[]>(() => {
    if (!isAggregatedParent) return []
    const byId = new Map(users.map((u) => [u.id, u]))
    const collect = (id: string): string[] => {
      const out: string[] = []
      for (const k of allTasks.filter((t) => t.parent_task_id === id)) {
        if (k.assigned_to) out.push(k.assigned_to)
        out.push(...collect(k.id))
      }
      return out
    }
    return Array.from(new Set(collect(task.id))).map((id) => byId.get(id)).filter((u): u is User => !!u)
  }, [isAggregatedParent, allTasks, task.id, users])

  async function save() {
    setSaving(true)
    await onSave({
      title: title.trim() || task.title,
      description: description.trim() === "" ? null : description.trim(),
      start_date: isoFromInput(start),
      due_date: isoFromInput(due),
      estimated_hours: hours.trim() === "" ? null : Number(hours),
      assigned_to: assignee || null,
    })
    setSaving(false)
  }

  return (
    <div className="afx">
      <div className="gx-scrim" onClick={onClose} />
      <aside className="gx-panel" role="dialog" aria-label="Edição rápida">
        <div className="panel-head">
          <div className="row1">
            <span className="ttl-eyebrow">Edição rápida</span>
            <span style={{ flex: 1 }} />
            <button className="icon-btn" onClick={onClose}><X size={16} /></button>
          </div>
          <input className="gx-title" value={title} onChange={(e) => setTitle(e.target.value)} autoFocus />
          <div className="meta">
            <span className="gx-badge" style={{ background: "var(--af-muted-2)", color: "var(--af-muted-fg)" }}>{statusName ?? "—"}</span>
            {critical && (critical.is_critical ? (
              <span className="gx-badge" style={{ background: "#fdece4", color: "var(--af-warning)" }} title="Está no caminho crítico (folga zero)">⚡ Caminho crítico</span>
            ) : (
              <span className="gx-badge" style={{ background: "var(--af-muted-2)", color: "var(--af-muted-fg)" }} title="Folga total (pode atrasar sem impactar o término do projeto)">Folga {critical.total_float_hours}h</span>
            ))}
            {liveAbsences.length > 0 && (() => {
              const approved = liveAbsences.some((a) => a.status === "aprovada")
              return (
                <span
                  className="gx-badge"
                  style={{ background: "#fdece4", color: approved ? "var(--af-destructive)" : "var(--af-warning)" }}
                  title={liveAbsences.map((a) => `${a.type_name} (${a.status}): ${a.start_date} → ${a.end_date}${a.partial_hours != null ? " (parcial)" : ""}`).join("\n")}
                >
                  ⚠ {approved ? "Responsável ausente no período" : "Ausência pendente no período"}
                </span>
              )
            })()}
          </div>
        </div>

        <div className="panel-body">
          <div className="field">
            <label>Descrição</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Descreva o item do cronograma..."
              rows={3}
              style={{
                width: "100%",
                resize: "vertical",
                padding: "8px 10px",
                border: "1px solid var(--af-border)",
                borderRadius: 8,
                font: "inherit",
                fontSize: 13,
                color: "var(--af-fg)",
                background: "var(--af-bg, #fff)",
              }}
            />
          </div>
          <div className="grid2">
            <div className="field">
              <label>{isRoot ? "Início (data-base)" : "Início"}</label>
              <div className="inp"><Calendar size={14} className="ic" /><input type="date" value={start} onChange={(e) => changeStart(e.target.value)} /></div>
            </div>
            <div className="field">
              <label>Vencimento</label>
              <div className="inp"><CalendarCheck size={14} className="ic" /><input type="date" value={due} onChange={(e) => setDue(e.target.value)} disabled={isRoot} /></div>
            </div>
          </div>
          {isRoot ? (
            <div className="hint"><Check size={13} style={{ color: "var(--af-success)" }} /> Esta é a data-base do projeto. O término e as datas das etapas são recalculados automaticamente a partir das horas estimadas.</div>
          ) : inverted && (
            <div className="hint" style={{ color: "var(--af-destructive)" }}>⚠ Início é posterior ao vencimento.</div>
          )}

          {!isRoot && (
            <div className="field">
              <label>Horas estimadas</label>
              <div className="inp">
                <Clock size={14} className="ic" />
                <input type="number" min={0} step="0.5" value={hours} onChange={(e) => changeHours(e.target.value)} placeholder="ex.: 16" disabled={isAggregatedParent} />
                <span style={{ color: "var(--af-faint)", fontWeight: 700, fontSize: 13 }}>h</span>
              </div>
              {isAggregatedParent ? (
                <div className="hint"><Check size={13} style={{ color: "var(--af-success)" }} /> Soma das horas das US filhas — defina as horas em cada US.</div>
              ) : durationDays != null && (
                <div className="hint"><Check size={13} style={{ color: "var(--af-success)" }} /> Equivale a <b>{durationDays} dia{durationDays > 1 ? "s" : ""} úteis</b> · vencimento calculado a partir do início</div>
              )}
            </div>
          )}

          {/* Progresso: calculado automaticamente pela conclusão dos filhos (somente leitura). */}
          {!isRoot && (
            <div className="field">
              <label>Progresso</label>
              <div className="pbar" style={{ height: 8, borderRadius: 5, background: "var(--af-muted-2)", overflow: "hidden" }}>
                <i style={{ display: "block", height: "100%", width: `${Math.max(0, Math.min(100, rolledProgress))}%`, background: "var(--af-success)" }} />
              </div>
              <div className="hint">
                <Check size={13} style={{ color: "var(--af-success)" }} />
                <b>{rolledProgress}%</b> concluído{hasChildren
                  ? " · calculado pela conclusão das etapas filhas"
                  : " · definido pela conclusão deste card (etapa final)"}
              </div>
            </div>
          )}

          <div className="field">
            <label>{isAggregatedParent ? "Responsáveis (das US)" : "Responsável"}</label>
            {isAggregatedParent ? (
              <>
                <div className="owner-row" style={{ alignItems: "center" }}>
                  {aggregatedUsers.length === 0 ? (
                    <span className="hint">Nenhuma US com responsável ainda.</span>
                  ) : (
                    <span style={{ display: "inline-flex", alignItems: "center" }} title={aggregatedUsers.map((u) => u.full_name).join(", ")}>
                      {aggregatedUsers.slice(0, 4).map((u, i) => (
                        <span key={u.id} className="gx-avatar" style={{ width: 26, height: 26, fontSize: 10, marginLeft: i === 0 ? 0 : -9, background: colorForUser(u.id), boxShadow: "0 0 0 1.5px var(--af-bg, #fff)" }}>{initials(u.full_name)}</span>
                      ))}
                      {aggregatedUsers.length > 4 && (
                        <span className="gx-avatar" style={{ width: 26, height: 26, fontSize: 10, marginLeft: -9, background: "var(--af-muted-3)" }}>+{aggregatedUsers.length - 4}</span>
                      )}
                    </span>
                  )}
                </div>
                <div className="hint">Derivado das US — defina o responsável em cada US.</div>
              </>
            ) : (
              <>
                <div className="owner-row">
                  <span className="gx-avatar" style={{ width: 26, height: 26, fontSize: 10, background: colorForUser(selUser?.id ?? null) }}>{initials(selUser?.full_name)}</span>
                  <select value={assignee} onChange={(e) => setAssignee(e.target.value)}>
                    <option value="">Sem responsável</option>
                    {users.map((m) => <option key={m.id} value={m.id}>{m.full_name}</option>)}
                  </select>
                </div>
                {liveAbsences.length > 0 && (
                  <div className="hint" style={{ color: liveAbsences.some((a) => a.status === "aprovada") ? "var(--af-destructive)" : "var(--af-warning)" }}>
                    ⚠ {selUser?.full_name ?? "Responsável"} tem ausência no período:{" "}
                    {liveAbsences.map((a) => `${a.type_name} · ${a.status} (${a.start_date} → ${a.end_date})`).join("; ")}
                  </div>
                )}
              </>
            )}
          </div>

          <div className="field">
            <label>Predecessoras</label>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {predDeps.length === 0 && (
                <div className="hint" style={{ marginTop: 0 }}>Nenhuma dependência. Esta etapa pode iniciar livremente.</div>
              )}
              {predDeps.map((d) => {
                const p = allTasks.find((t) => t.id === d.predecessor_id) ?? null
                const lag = Number(d.lag_hours) || 0
                return (
                  <div className="dep" key={d.id}>
                    <span className="dep-ic"><Link2 size={13} /></span>
                    <div className="dep-info">
                      <div className="t">{p?.title ?? "(tarefa)"}</div>
                      <div className="s">{DEP_LABELS[d.dep_type] ?? d.dep_type}{lag !== 0 ? ` · ${lag > 0 ? "+" : ""}${lag}h` : ""} · {fmtD(p?.start_date)} → {fmtD(p?.due_date)}</div>
                    </div>
                    <button className="rm" title="Remover dependência" onClick={() => void onDeleteDependency(d.id)}><X size={14} /></button>
                  </div>
                )
              })}
              {addOpen ? (
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  <div className="owner-row">
                  <Link2 size={14} style={{ color: "var(--af-muted-fg)" }} />
                  <select value={newPred} onChange={(e) => setNewPred(e.target.value)}>
                    <option value="">Selecionar etapa…</option>
                    {candidates.map((c) => (
                      <option key={c.task.id} value={c.task.id} data-level={c.level}>
                        {`${"  ".repeat(c.level)}${c.level > 0 ? "↳ " : ""}${c.task.title}`}
                      </option>
                    ))}
                  </select>
                  </div>
                  <div className="grid2">
                    <div className="owner-row">
                      <select value={newDepType} onChange={(e) => setNewDepType(e.target.value as DependencyType)}>
                        {(["FS", "SS", "FF", "SF"] as DependencyType[]).map((t) => (
                          <option key={t} value={t}>{t} · {DEP_LABELS[t]}</option>
                        ))}
                      </select>
                    </div>
                    <div className="inp">
                      <Clock size={14} className="ic" />
                      <input type="number" step="0.5" value={newLag} onChange={(e) => setNewLag(e.target.value)} title="Lag/lead em horas (negativo = antecipação)" />
                      <span style={{ color: "var(--af-faint)", fontWeight: 700, fontSize: 13 }}>h</span>
                    </div>
                  </div>
                  <div style={{ display: "flex", gap: 8 }}>
                    <button className="btn ghost" onClick={() => { setAddOpen(false); setNewPred("") }}>Cancelar</button>
                    <span style={{ flex: 1 }} />
                    <button
                      className="btn primary"
                      disabled={!newPred}
                      onClick={async () => {
                        if (!newPred) return
                        await onCreateDependency(newPred, task.id, newDepType, Number(newLag) || 0)
                        setAddOpen(false); setNewPred(""); setNewDepType("FS"); setNewLag("0")
                      }}
                    >
                      <Plus size={14} /> Vincular
                    </button>
                  </div>
                </div>
              ) : (
                <button className="add-dep" onClick={() => setAddOpen(true)}><Plus size={14} /> Adicionar predecessora</button>
              )}
            </div>
          </div>
        </div>

        <div className="panel-foot">
          <button className="btn ghost" onClick={onClose}>Cancelar</button>
          <button className="btn primary" disabled={saving} onClick={() => void save()}>
            {saving ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />} Salvar alterações
          </button>
        </div>
      </aside>
    </div>
  )
}
