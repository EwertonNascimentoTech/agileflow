import { useEffect, useMemo, useRef, useState } from "react"
import { useSearchParams } from "react-router-dom"
import {
  BarChart3, Calendar, CalendarCheck, Check, ChevronDown, Clock, FlaskConical, Folder, GitBranch, Link2, Loader2, Maximize2, Plus, Users, Wand2, X, ZoomIn, ZoomOut,
} from "lucide-react"

const DEP_LABELS: Record<DependencyType, string> = {
  FS: "Fim → Início", SS: "Início → Início", FF: "Fim → Fim", SF: "Início → Fim",
}

import { teamopsApi, type Person, type WorkCalendar } from "@/api/teamops"
import {
  projetosApi,
  type AssigneeAbsenceItem, type CriticalPathItem, type DependencyType, type Project, type ProjectDemandType, type ProjectFunnel, type ProjectScheduleBinding,
  type ProjectStatus, type ProjectTask, type ProjectTaskDependency,
  type ScheduleBaseline, type ScheduleLockState, type ScheduleOverloadRow,
} from "@/api/projetos"
import type { User } from "@/types"
import { Skeleton } from "@/components/ui/skeleton"
import { EmptyState } from "@/components/EmptyState"
import { GanttChart, clampDayWidth, zoomLabel, DEFAULT_DAY_W, MIN_DAY_W, MAX_DAY_W, ZOOM_STEP } from "@/modules/projetos/GanttChart"
import { WorkloadView } from "@/modules/projetos/WorkloadView"
import { ScheduleScenarioPanel } from "@/modules/projetos/ScheduleScenarioPanel"
import { AssigneeCapacityPanel, type CapacitySummary } from "@/modules/projetos/AssigneeCapacityPanel"
import { ScheduleLockBanner } from "@/modules/projetos/ScheduleLockBanner"
import { BaselineAlertsDialog } from "@/modules/projetos/BaselineAlertsDialog"
import { computeBaselineDiff } from "@/modules/projetos/baselineDiff"
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

/** Horas diárias efetivas para projetos (daily_hours × alocação %). */
function projectHoursPerDay(person: Person | undefined, calendarHoursPerDay = 8): number {
  if (!person) return calendarHoursPerDay
  const base = person.daily_hours > 0 ? person.daily_hours : calendarHoursPerDay
  const pct = person.project_allocation_pct ?? 100
  return Math.max(0.01, base * pct / 100)
}

// Vencimento derivado de início + horas estimadas (ceil(horas/taxa) dias úteis, mín. 1). "" se faltar.
function deriveDue(startStr: string, hoursStr: string, hoursPerDay = 8): string {
  if (!startStr) return ""
  const h = parseFloat(hoursStr)
  if (isNaN(h) || h <= 0) return ""
  const duration = Math.max(1, Math.ceil(h / hoursPerDay))
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
  const [persons, setPersons] = useState<Person[]>([])
  const [loading, setLoading] = useState(true)
  // Zoom do cronograma: largura de um dia em px (o cabeçalho dia/semana/mês se adapta).
  const [dayWidth, setDayWidth] = useState(DEFAULT_DAY_W)
  const [fitSignal, setFitSignal] = useState(0)
  const [view, setView] = useState<"schedule" | "resources" | "scenario">("schedule")
  const [projOpen, setProjOpen] = useState(false)
  const [cardOpen, setCardOpen] = useState(false)
  const [editing, setEditing] = useState<ProjectTask | null>(null)
  const [criticalById, setCriticalById] = useState<Map<string, CriticalPathItem>>(new Map())
  const [calendar, setCalendar] = useState<WorkCalendar | null>(null)
  const [absencesByUser, setAbsencesByUser] = useState<Record<string, AssigneeAbsenceItem[]>>({})
  const [overloadByTask, setOverloadByTask] = useState<Map<string, ScheduleOverloadRow>>(new Map())
  // Controle de baseline / travamento do cronograma.
  const [lockState, setLockState] = useState<ScheduleLockState | null>(null)   // raiz selecionada (modo escopado)
  const [lockStates, setLockStates] = useState<ScheduleLockState[]>([])         // todas as raízes (cronograma completo)
  const [compareBaseline, setCompareBaseline] = useState<ScheduleBaseline | null>(null) // baseline em comparação
  const locked = lockState?.state === "locked"
  const [rescheduling, setRescheduling] = useState(false)  // recálculo automático sob demanda

  const [alertsOpen, setAlertsOpen] = useState(false)

  // task_id → datas do baseline selecionado (para as barras-fantasma do GanttChart).
  const baselineById = useMemo(() => {
    if (!compareBaseline) return undefined
    return new Map((compareBaseline.snapshot?.tasks ?? []).map((t) => [t.task_id, { start: t.start_date, due: t.due_date }]))
  }, [compareBaseline])

  // Diff inteligente (atual × baseline): alertas + destaque das barras.
  const nameById = useMemo(() => new Map(users.map((u) => [u.id, u.full_name])), [users])
  const statusNameById = useMemo(() => new Map(statuses.map((s) => [s.id, s.name])), [statuses])
  const baselineDiff = useMemo(() => {
    if (!compareBaseline) return null
    // `tasks` é o container inteiro (vários projetos-raiz). Restringe à subárvore do projeto-raiz
    // do baseline, senão tarefas de OUTROS projetos viram falsas "inseridas".
    const childrenMap = new Map<string, string[]>()
    for (const t of tasks) {
      if (!t.parent_task_id) continue
      const arr = childrenMap.get(t.parent_task_id) ?? []
      arr.push(t.id)
      childrenMap.set(t.parent_task_id, arr)
    }
    const sub = new Set<string>()
    const stack = [compareBaseline.root_task_id]
    while (stack.length) {
      const id = stack.pop()!
      if (sub.has(id)) continue
      sub.add(id)
      for (const c of childrenMap.get(id) ?? []) stack.push(c)
    }
    const subTasks = tasks.filter((t) => sub.has(t.id))
    const subDeps = dependencies.filter((d) => sub.has(d.predecessor_id) && sub.has(d.successor_id))
    return computeBaselineDiff(subTasks, subDeps, nameById, statusNameById, compareBaseline)
  }, [compareBaseline, tasks, dependencies, nameById, statusNameById])

  // Ao ativar uma comparação, abre o painel de alterações automaticamente (a análise fica
  // visível na hora, mesmo que o desvio nas barras seja sutil).
  useEffect(() => {
    if (compareBaseline) setAlertsOpen(true)
  }, [compareBaseline])

  useEffect(() => {
    async function load() {
      const [ps, dts, persons] = await Promise.all([
        projetosApi.listProjects(true),
        projetosApi.listDemandTypes(true).catch(() => [] as ProjectDemandType[]),
        teamopsApi.listPersons().catch(() => []),
      ])
      setProjects(ps)
      setDemandTypes(dts)
      setPersons(persons)
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
    // Cronograma manual: nenhuma edição desloca outras tarefas. O refetch serve só para
    // trazer o rollup do card-pai (span de datas, soma de horas, progresso).
    const scheduleFields =
      "start_date" in patch || "due_date" in patch || "estimated_hours" in patch || "assigned_to" in patch
    // Trava de cronograma: bloqueia datas, horas e responsável. Título e descrição seguem
    // editáveis mesmo travado.
    if (locked && scheduleFields) {
      toast.error("Cronograma travado. Salve um baseline com justificativa para liberar a edição.")
      return
    }
    setTasks((prev) => prev.map((t) => (t.id === id ? { ...t, ...patch } : t)))
    try {
      await projetosApi.updateTask(projectId, id, patch)
      if (scheduleFields) await refetchTasks()
    } catch (err) {
      const e = err as { response?: { data?: { detail?: unknown } } }
      toast.error(typeof e.response?.data?.detail === "string" ? e.response.data.detail : "Não foi possível salvar.")
      await refetchTasks()
    }
  }

  // Reordenação por arrasto no Gantt hierárquico (muda `order` entre irmãos do mesmo nível).
  async function handleReorder(items: Array<{ id: string; order: number }>) {
    if (!projectId || items.length === 0) return
    if (locked) { toast.error("Cronograma travado. Salve um baseline com justificativa para liberar a edição."); return }
    const orderById = new Map(items.map((i) => [i.id, i.order]))
    setTasks((prev) => prev.map((t) => (orderById.has(t.id) ? { ...t, order: orderById.get(t.id)! } : t)))
    try {
      await projetosApi.reorderTasks(projectId, items)
      // Ordem é só sequência na WBS — nenhuma data muda.
    } catch (err) {
      const e = err as { response?: { data?: { detail?: unknown } } }
      toast.error(typeof e.response?.data?.detail === "string" ? e.response.data.detail : "Não foi possível reordenar.")
      await refetchTasks()
    }
  }

  async function createDependency(predecessorId: string, successorId: string, depType: DependencyType = "FS", lagHours = 0) {
    if (!projectId) return
    if (locked) { toast.error("Cronograma travado. Salve um baseline com justificativa para liberar a edição."); return }
    try {
      await projetosApi.createDependency(projectId, {
        predecessor_id: predecessorId, successor_id: successorId, dep_type: depType, lag_hours: lagHours,
      })
      // A dependência é informativa (seta + caminho crítico): nenhuma data é deslocada.
      await refetchDependencies()
    } catch (err) {
      const e = err as { response?: { data?: { detail?: unknown } } }
      toast.error(typeof e.response?.data?.detail === "string" ? e.response.data.detail : "Não foi possível criar a dependência.")
    }
  }

  async function deleteDependency(depId: string) {
    if (!projectId) return
    if (locked) { toast.error("Cronograma travado. Salve um baseline com justificativa para liberar a edição."); return }
    try {
      await projetosApi.deleteDependency(projectId, depId)
      // Remover a dependência não move nenhuma data — só some a seta.
      await refetchDependencies()
    } catch (err) {
      const e = err as { response?: { data?: { detail?: unknown } } }
      toast.error(typeof e.response?.data?.detail === "string" ? e.response.data.detail : "Não foi possível remover a dependência.")
    }
  }

  // Recálculo automático SOB DEMANDA — a única porta que restou para o motor. Sobrescreve
  // as datas manuais da subárvore, por isso exige confirmação explícita.
  async function handleReschedule() {
    if (!projectId || !rootTask) return
    if (locked) { toast.error("Cronograma travado. Salve um baseline com justificativa para liberar a edição."); return }
    const ok = confirm(
      `Recalcular as datas de "${rootTask.title}" automaticamente?\n\n` +
      "As datas que você definiu manualmente nas etapas serão SUBSTITUÍDAS pelo cálculo " +
      "a partir das horas estimadas, do responsável de cada tarefa, das dependências e do " +
      "calendário corporativo. Tarefas concluídas não são alteradas.",
    )
    if (!ok) return
    setRescheduling(true)
    try {
      const next = await projetosApi.rescheduleTasks(projectId, rootTask.id)
      setTasks(next)
      toast.success("Datas recalculadas.")
    } catch (err) {
      const e = err as { response?: { data?: { detail?: unknown } } }
      toast.error(typeof e.response?.data?.detail === "string" ? e.response.data.detail : "Não foi possível recalcular as datas.")
      await refetchTasks()
    } finally {
      setRescheduling(false)
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
    if (locked) { toast.error("Cronograma travado. Salve um baseline com justificativa para liberar a edição."); return }
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

  // Estado do controle de baseline (open | locked | revision) do projeto-raiz selecionado.
  useEffect(() => {
    setCompareBaseline(null) // troca de projeto/raiz limpa a comparação
    if (!projectId || !rootTaskId) { setLockState(null); return }
    let cancelled = false
    projetosApi.getScheduleLock(projectId, rootTaskId)
      .then((s) => { if (!cancelled) setLockState(s) })
      .catch(() => { if (!cancelled) setLockState(null) })
    return () => { cancelled = true }
  }, [projectId, rootTaskId])

  // Comparação vinda de fora (card / cronograma completo) via ?baseline=<id>: carrega e ativa.
  useEffect(() => {
    const baselineId = searchParams.get("baseline")
    if (!projectId || !rootTaskId || !baselineId) return
    let cancelled = false
    projetosApi.listBaselines(projectId, rootTaskId)
      .then((list) => {
        const b = list.find((x) => x.id === baselineId)
        if (!cancelled && b) setCompareBaseline(b)
      })
      .catch(() => { /* ignora */ })
    return () => { cancelled = true }
  }, [projectId, rootTaskId, searchParams])

  async function reloadLock() {
    if (!projectId || !rootTaskId) return
    try { setLockState(await projetosApi.getScheduleLock(projectId, rootTaskId)) } catch { /* mantém estado atual */ }
  }

  // Travas de TODAS as raízes de planejamento (visão "cronograma completo", sem root selecionado).
  useEffect(() => {
    if (!projectId || rootParam) { setLockStates([]); return }
    let cancelled = false
    projetosApi.getScheduleLocks(projectId)
      .then((s) => { if (!cancelled) setLockStates(s) })
      .catch(() => { if (!cancelled) setLockStates([]) })
    return () => { cancelled = true }
  }, [projectId, rootParam, tasks])

  async function reloadFullLocks() {
    if (!projectId) return
    try { setLockStates(await projetosApi.getScheduleLocks(projectId)) } catch { /* mantém estado atual */ }
  }

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

  // Sobrecarga do responsável no período de cada etapa (cruza TODO o portfólio) — marca o
  // avatar no Gantt. Mesma cadência das ausências: refaz quando as tarefas mudam.
  useEffect(() => {
    // Escopado ao card-raiz em tela (o Gantt só renderiza com um): payload enxuto e
    // sem calcular sobrecarga de subárvores que ninguém está vendo.
    if (!projectId || !rootTaskId) { setOverloadByTask(new Map()); return }
    let cancelled = false
    projetosApi.getScheduleOverload(projectId, rootTaskId)
      .then((r) => { if (!cancelled) setOverloadByTask(new Map(r.rows.map((x) => [x.task_id, x]))) })
      .catch(() => { if (!cancelled) setOverloadByTask(new Map()) })
    return () => { cancelled = true }
  }, [projectId, rootTaskId, tasks])

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

  // Zoom: afastar/aproximar em passos e "ajustar" (todo o cronograma na tela).
  // Ctrl/⌘ + roda do mouse faz o mesmo direto no gráfico, ancorado no cursor.
  const zoomControl = (
    <div className="scale-toggle" style={{ marginLeft: 8, alignItems: "center" }}>
      <button
        onClick={() => setDayWidth((w) => clampDayWidth(w / ZOOM_STEP))}
        disabled={dayWidth <= MIN_DAY_W}
        title="Afastar (Ctrl + roda do mouse)"
      >
        <ZoomOut size={13} />
      </button>
      <span style={{ padding: "0 6px", fontSize: 12, fontWeight: 600, color: "var(--af-muted-fg)", minWidth: 62, textAlign: "center" }}>
        {zoomLabel(dayWidth)}
      </span>
      <button
        onClick={() => setDayWidth((w) => clampDayWidth(w * ZOOM_STEP))}
        disabled={dayWidth >= MAX_DAY_W}
        title="Aproximar (Ctrl + roda do mouse)"
      >
        <ZoomIn size={13} />
      </button>
      <button onClick={() => setFitSignal((n) => n + 1)} title="Ajustar todo o cronograma à tela">
        <Maximize2 size={13} />
      </button>
    </div>
  )

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
          {view === "schedule" && zoomControl}
          <div className="scale-toggle" style={{ marginLeft: 8 }}>
            <button className={view === "schedule" ? "on" : ""} onClick={() => setView("schedule")}><Calendar size={12} /> Cronograma</button>
            <button className={view === "resources" ? "on" : ""} onClick={() => setView("resources")}><Users size={12} /> Recursos</button>
            <button className={view === "scenario" ? "on" : ""} onClick={() => setView("scenario")}><FlaskConical size={12} /> Cenário</button>
          </div>
          <span className="spacer" />
          {view === "schedule" && (
            <button
              className="btn ghost"
              disabled={!rootTask || locked || rescheduling}
              title={
                locked
                  ? "Cronograma travado — libere a alteração para recalcular."
                  : "Recalcula as datas da subárvore pelo motor (horas + responsável + dependências + calendário), substituindo as datas manuais."
              }
              onClick={() => void handleReschedule()}
            >
              {rescheduling ? <Loader2 size={14} className="spin" /> : <Wand2 size={14} />} Recalcular datas
            </button>
          )}
          {view === "schedule" && (
            <button
              className="btn primary"
              style={{ marginLeft: 8 }}
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

        {view === "schedule" && lockState && (
          <ScheduleLockBanner
            projectId={projectId}
            lock={lockState}
            onChanged={() => void reloadLock()}
            onCompareBaseline={(b) => setCompareBaseline(b)}
          />
        )}

        {view === "schedule" && compareBaseline && (
          <div
            style={{
              display: "flex", alignItems: "center", gap: 10, padding: "8px 14px", margin: "8px 0",
              borderRadius: 8, border: "1px solid #b6bcc6", background: "#f3f5f8", fontSize: 13,
            }}
          >
            <span
              style={{ width: 22, height: 11, borderRadius: 3, flexShrink: 0, background: "repeating-linear-gradient(45deg,#b6bcc6,#b6bcc6 3px,#cdd2da 3px,#cdd2da 6px)" }}
            />
            <span style={{ flex: 1 }}>
              Comparando com <b>baseline v{compareBaseline.version}</b> (salvo em {new Date(compareBaseline.created_at).toLocaleString("pt-BR")}).
              As barras hachuradas são o cronograma planejado; passe o mouse para ver o desvio.
            </span>
            <button className="btn primary" onClick={() => setAlertsOpen(true)}>
              Ver alterações{baselineDiff ? ` (${baselineDiff.total})` : ""}
            </button>
            <button className="btn ghost" onClick={() => setCompareBaseline(null)}>Limpar comparação</button>
          </div>
        )}

        {compareBaseline && (
          <BaselineAlertsDialog
            open={alertsOpen}
            onOpenChange={setAlertsOpen}
            diff={baselineDiff}
            version={compareBaseline.version}
          />
        )}

        {view === "resources" ? (
          <WorkloadView projectId={projectId} rootTaskId={rootTaskId} users={users} />
        ) : view === "scenario" ? (
          rootTaskId ? (
            <ScheduleScenarioPanel
              projectId={projectId}
              rootTaskId={rootTaskId}
              rootTitle={rootTask?.title}
              defaultStart={rootTask?.start_date}
              persons={persons}
            />
          ) : (
            <EmptyState
              icon={FlaskConical}
              title="Selecione o projeto"
              description="Abra o cronograma de um projeto/programa para montar o cenário de fim."
            />
          )
        ) : rootTask ? (
          <>
            <GanttLegend />
            <GanttChart
              rootId={rootTask.id}
              tasks={tasks}
              users={users}
              dependencies={dependencies}
              dayWidth={dayWidth}
              onDayWidthChange={setDayWidth}
              fitSignal={fitSignal}
              progressById={progressById}
              criticalById={criticalById}
              calendar={calendar}
              absencesByUser={absencesByUser}
              overloadByTask={overloadByTask}
              onOpenTask={(t) => setEditing(t)}
              onAddChild={(t) => void addStage(t.id)}
              canAddChild={canAddChild}
              typeBadge={typeBadge}
              onDelete={(t) => void deleteStage(t)}
              onUpdateDates={(t, patch) => void handleUpdate(t.id, patch)}
              onReorder={(items) => void handleReorder(items)}
              baselineById={baselineById}
              markById={baselineDiff?.markById}
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
            persons={persons}
            calendar={calendar}
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

        {zoomControl}
      </div>

      {lockStates.filter((l) => l.state !== "open").map((l) => (
        <ScheduleLockBanner
          key={l.root_task_id}
          projectId={projectId}
          lock={l}
          showTitle
          onChanged={() => void reloadFullLocks()}
        />
      ))}

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
          persons={persons}
          calendar={calendar}
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
  persons,
  calendar,
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
  persons: Person[]
  calendar: WorkCalendar | null
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
  const [capacitySummary, setCapacitySummary] = useState<CapacitySummary | null>(null)
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
  const calHpd = calendar?.hours_per_day ?? 8
  const assigneePerson = persons.find((p) => p.id === assignee)
  const effectiveProjectHpd = projectHoursPerDay(assigneePerson, calHpd)
  const hoursNum = parseFloat(hours)
  const durationDays = !isNaN(hoursNum) && hoursNum > 0 ? Math.max(1, Math.ceil(hoursNum / effectiveProjectHpd)) : null
  const selUser = users.find((u) => u.id === assignee) ?? null
  // O card raiz (programa/projeto) é a data-base: seu término é calculado a partir das etapas.
  const isRoot = task.planning_kind === "programa" || task.planning_kind === "projeto"
  // Risco ao vivo: o responsável escolhido estará ausente (aprovada) no período [início, vencimento]?
  const liveAbsences = useMemo(
    () => overlappingAbsences(absencesByUser, assignee || null, isoFromInput(start), isoFromInput(due)),
    [absencesByUser, assignee, start, due],
  )
  // Cronograma: início, horas e responsável recalculam o vencimento. A duração usa
  // ceil(horas / taxa diária) e addBusinessDays pula sábado e domingo.
  function recalcDueFromStart(startVal: string, hoursVal: string, assigneeId: string) {
    const person = persons.find((p) => p.id === assigneeId)
    const hpd = projectHoursPerDay(person, calHpd)
    const nd = deriveDue(startVal, hoursVal, hpd)
    if (nd) setDue(nd)
  }
  function changeStart(v: string) { setStart(v); recalcDueFromStart(v, hours, assignee) }
  function changeHours(v: string) { setHours(v); recalcDueFromStart(start, v, assignee) }
  function changeAssignee(v: string) { setAssignee(v); recalcDueFromStart(start, hours, v) }
  // Progresso é derivado dos filhos (rollup de conclusão), não editável aqui.
  const hasChildren = allTasks.some((t) => t.parent_task_id === task.id)
  // Datas de um item COM FILHOS são o span dos filhos (rollup) — read-only. No card-raiz,
  // só o término é derivado: o início é a data-base do projeto, definida manualmente.
  const startDerived = hasChildren && !isRoot
  const dueDerived = hasChildren
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
            {/* Sobrecarga do responsável: sinal sempre visível, mesmo com o painel fora da viewport. */}
            {capacitySummary?.overloaded && (
              <span
                className="gx-badge"
                style={{ background: "#fdece4", color: "var(--af-destructive)" }}
                title="A alocação desta tarefa estoura a capacidade do responsável no período — veja o detalhe em Responsável."
              >
                ⚠ Sobrecarga{capacitySummary.utilizationPct != null ? ` ${Math.round(capacitySummary.utilizationPct)}%` : ""}
              </span>
            )}
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
              <div className="inp"><Calendar size={14} className="ic" /><input type="date" value={start} onChange={(e) => changeStart(e.target.value)} disabled={startDerived} /></div>
            </div>
            <div className="field">
              <label>Vencimento</label>
              <div className="inp"><CalendarCheck size={14} className="ic" /><input type="date" value={due} onChange={(e) => setDue(e.target.value)} disabled={dueDerived} /></div>
            </div>
          </div>
          {hasChildren ? (
            <div className="hint">
              <Check size={13} style={{ color: "var(--af-success)" }} />
              {isRoot
                ? " O início é a data-base do projeto. O término é o maior vencimento das etapas filhas."
                : " Datas derivadas das tarefas filhas (menor início, maior vencimento) — edite as datas em cada filha."}
            </div>
          ) : inverted ? (
            <div className="hint" style={{ color: "var(--af-destructive)" }}>⚠ Início é posterior ao vencimento.</div>
          ) : (
            <div className="hint">O vencimento é recalculado pelas horas estimadas e considera somente dias úteis (segunda a sexta).</div>
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
                <div className="hint">
                  <Check size={13} style={{ color: "var(--af-success)" }} />
                  {" "}Equivale a <b>{durationDays} dia{durationDays > 1 ? "s" : ""} úteis</b>
                  {" "}(1 dia ≈ {effectiveProjectHpd}h de projeto{assigneePerson ? ` · ${assigneePerson.full_name}` : ""})
                  {" "}· o excedente passa para o próximo dia útil
                </div>
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
                  <select value={assignee} onChange={(e) => changeAssignee(e.target.value)}>
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
                {/* Carga × capacidade do responsável escolhido no período da tarefa. Fora do
                    card-raiz e de pais agregados: lá as horas são rollup dos filhos e o motor
                    de capacidade os ignora — mostrar capacidade seria contagem dupla. */}
                {!isRoot && assignee && start && due && (
                  <AssigneeCapacityPanel
                    personId={assignee}
                    start={start}
                    due={due}
                    hours={hours}
                    excludeTaskId={task.id}
                    onSummary={setCapacitySummary}
                  />
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
