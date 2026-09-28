import { useEffect, useMemo, useState } from "react"
import { AlertTriangle, ArrowRight, ChevronDown, ChevronRight, Clock, DollarSign, FlaskConical, Loader2, Plus, Sparkles, Trash2, Users, Wand2, X } from "lucide-react"

import {
  projetosApi,
  type ScenarioMutation,
  type ScenarioResult,
  type ScenarioSuggestionsResponse,
  type SuggestedScenario,
  type SimTaskMeta,
} from "@/api/projetos"
import { teamopsApi, type Person } from "@/api/teamops"
import { EmptyState } from "@/components/EmptyState"
import { Button } from "@/components/ui/button"
import { KpiCount, KpiRow, Pill, SectionCard } from "@/components/ds"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { WorkloadView } from "@/modules/projetos/WorkloadView"

type Op = ScenarioMutation["op"]

const OP_LABEL: Record<Op, string> = {
  move_task: "Mover tarefa",
  reassign: "Trocar responsável",
  scale_hours: "Ajustar esforço",
  remove_person: "Remover pessoa (férias/saída)",
  add_freelancer: "Adicionar freelancer",
}

function taskLabel(t: SimTaskMeta): string {
  return `${t.project_name} · ${t.title} — ${t.assignee_name ?? "sem resp."} (${Math.round(t.estimated_hours)}h)`
}

const KIND_LABEL: Record<SuggestedScenario["kind"], string> = {
  reassign: "Realocar", freelancer: "Freelancer", defer: "Adiar prazo", combo: "Plano completo",
}
const COST_LABEL: Record<SuggestedScenario["cost_tag"], string> = {
  gratis: "grátis", custo: "custo", prazo: "muda prazo",
}
function CostTag({ tag }: { tag: SuggestedScenario["cost_tag"] }) {
  const Icon = tag === "custo" ? DollarSign : tag === "prazo" ? Clock : Sparkles
  const cls = tag === "custo"
    ? "text-amber-600 dark:text-amber-400"
    : tag === "prazo" ? "text-blue-600 dark:text-blue-400" : "text-emerald-600 dark:text-emerald-400"
  return <span className={`inline-flex items-center gap-1 text-xs ${cls}`}><Icon size={12} />{COST_LABEL[tag]}</span>
}

function describe(m: ScenarioMutation, tasks: SimTaskMeta[], persons: Person[]): string {
  const tt = (id?: string) => tasks.find((t) => t.task_id === id)?.title ?? "tarefa"
  const pp = (id?: string) => persons.find((p) => p.id === id)?.full_name ?? "pessoa"
  switch (m.op) {
    case "move_task":
      return `Mover "${tt(m.task_id)}" → ${m.new_start ?? "?"} a ${m.new_due ?? "?"}`
    case "reassign":
      return `"${tt(m.task_id)}" → ${pp(m.new_person_id)}`
    case "scale_hours":
      return `Esforço de "${tt(m.task_id)}" ×${m.factor}`
    case "remove_person":
      return `Remover ${pp(m.person_id)} (capacidade → 0)`
    case "add_freelancer":
      return `+ ${m.freelancer_name || "Freelancer"} (${m.daily_hours}h/dia, ${m.assign_task_ids?.length ?? 0} tarefa(s))`
  }
}

export function CapacitySimulator({ from, to }: { from: string; to: string }) {
  const [tasks, setTasks] = useState<SimTaskMeta[]>([])
  const [persons, setPersons] = useState<Person[]>([])
  const [mutations, setMutations] = useState<ScenarioMutation[]>([])
  const [result, setResult] = useState<ScenarioResult | null>(null)
  const [simulating, setSimulating] = useState(false)
  const [suggestions, setSuggestions] = useState<ScenarioSuggestionsResponse | null>(null)
  const [loadingSug, setLoadingSug] = useState(true)
  const [showBuilder, setShowBuilder] = useState(false)

  // Rascunho da mutação sendo montada
  const [op, setOp] = useState<Op>("reassign")
  const [taskId, setTaskId] = useState<string>("")
  const [personId, setPersonId] = useState<string>("")
  const [newStart, setNewStart] = useState<string>("")
  const [newDue, setNewDue] = useState<string>("")
  const [factor, setFactor] = useState<string>("1.5")
  const [flName, setFlName] = useState<string>("Freelancer 1")
  const [flHours, setFlHours] = useState<string>("6")
  const [flTasks, setFlTasks] = useState<string[]>([])

  useEffect(() => {
    projetosApi.getSimulatableTasks({ from, to }).then((r) => setTasks(r.tasks)).catch(() => setTasks([]))
    teamopsApi.listPersons().then(setPersons).catch(() => setPersons([]))
    setResult(null)
    setLoadingSug(true)
    projetosApi.getScenarioSuggestions({ from, to })
      .then(setSuggestions).catch(() => setSuggestions(null))
      .finally(() => setLoadingSug(false))
  }, [from, to])

  const canAdd = useMemo(() => {
    if (op === "move_task") return Boolean(taskId && (newStart || newDue))
    if (op === "reassign") return Boolean(taskId && personId)
    if (op === "scale_hours") return Boolean(taskId && Number(factor) > 0)
    if (op === "remove_person") return Boolean(personId)
    if (op === "add_freelancer") return Boolean(flName && Number(flHours) > 0)
    return false
  }, [op, taskId, personId, newStart, newDue, factor, flName, flHours])

  const addMutation = () => {
    let m: ScenarioMutation
    if (op === "move_task") m = { op, task_id: taskId, new_start: newStart || undefined, new_due: newDue || undefined }
    else if (op === "reassign") m = { op, task_id: taskId, new_person_id: personId }
    else if (op === "scale_hours") m = { op, task_id: taskId, factor: Number(factor) }
    else if (op === "remove_person") m = { op, person_id: personId }
    else m = { op, freelancer_name: flName, daily_hours: Number(flHours), assign_task_ids: flTasks }
    setMutations((prev) => [...prev, m])
    setFlTasks([])
  }

  const runSim = (muts: ScenarioMutation[] = mutations) => {
    setSimulating(true)
    projetosApi
      .simulateScenario({ date_from: from, date_to: to, mutations: muts })
      .then(setResult)
      .catch(() => setResult(null))
      .finally(() => setSimulating(false))
  }

  // Ver antes/depois de um cenário sugerido (carrega as mutações e simula).
  const applySuggestion = (s: SuggestedScenario) => {
    setMutations(s.mutations)
    runSim(s.mutations)
  }
  // Levar a sugestão para o construtor manual (para ajustar).
  const editSuggestion = (s: SuggestedScenario) => {
    setMutations(s.mutations)
    setShowBuilder(true)
  }

  const nameFor = useMemo(() => {
    const map = new Map<string, string>()
    for (const p of result?.after.persons ?? []) map.set(p.id, p.full_name)
    return (id: string) => map.get(id) ?? `Sem pessoa (${id.slice(0, 8)})`
  }, [result])

  const diff = result?.diff

  return (
    <div className="space-y-5">
      {/* Cenários sugeridos (auto-gerados) */}
      <SectionCard title="Cenários sugeridos" icon={Wand2}>
        {loadingSug ? (
          <div className="flex items-center gap-2 p-4 text-sm text-muted-foreground"><Loader2 size={15} className="animate-spin" /> Gerando cenários…</div>
        ) : !suggestions?.has_overload ? (
          <EmptyState icon={Sparkles} title="Sem sobrecarga no período"
            description="Ninguém está sobrecarregado no intervalo — nenhum cenário necessário. Ajuste o período se esperava ver dados." />
        ) : suggestions.rows.length === 0 ? (
          <EmptyState icon={FlaskConical} title="Sem solução automática simples"
            description="Há sobrecarga, mas nenhuma realocação/freela/adiamento único resolve. Monte um cenário manualmente abaixo." />
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {suggestions.rows.map((s) => (
              <div key={s.id} className="flex flex-col gap-2 rounded-xl border bg-card p-4 shadow-sm">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <Pill tone={s.kind === "combo" ? "blue" : "slate"}>{KIND_LABEL[s.kind]}</Pill>
                    <CostTag tag={s.cost_tag} />
                  </div>
                  <span className="text-xs tabular-nums text-muted-foreground">
                    {s.before_over_cells}<ArrowRight size={11} className="mx-0.5 inline" />{s.after_over_cells}
                  </span>
                </div>
                <p className="text-sm leading-snug">{s.description}</p>
                <div className="flex items-center gap-3 text-xs">
                  <span className="font-medium text-emerald-600 dark:text-emerald-400">−{s.resolved_cells} dias de sobrecarga</span>
                  {s.new_cells > 0 && <span className="text-amber-600 dark:text-amber-400">+{s.new_cells} novos</span>}
                </div>
                <div className="mt-1 flex gap-2">
                  <Button size="sm" className="gap-1.5" onClick={() => applySuggestion(s)} disabled={simulating}>
                    <Sparkles size={14} /> Ver antes/depois
                  </Button>
                  <Button size="sm" variant="outline" className="gap-1.5" onClick={() => editSuggestion(s)}>
                    <Plus size={14} /> Editar
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </SectionCard>

      {/* Construtor manual — secundário/colapsável */}
      <button
        className="flex items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-foreground"
        onClick={() => setShowBuilder((v) => !v)}
      >
        {showBuilder ? <ChevronDown size={16} /> : <ChevronRight size={16} />} Montar cenário manualmente
      </button>

      {showBuilder && (
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
        {/* Construtor de mutações */}
        <SectionCard title="Montar cenário">
          <div className="space-y-3">
            <Select value={op} onValueChange={(v) => setOp(v as Op)}>
              <SelectTrigger className="h-10 bg-background"><SelectValue /></SelectTrigger>
              <SelectContent>
                {(Object.keys(OP_LABEL) as Op[]).map((k) => (
                  <SelectItem key={k} value={k}>{OP_LABEL[k]}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            {(op === "move_task" || op === "reassign" || op === "scale_hours") && (
              <Select value={taskId} onValueChange={setTaskId}>
                <SelectTrigger className="h-10 bg-background"><SelectValue placeholder="Escolha a tarefa" /></SelectTrigger>
                <SelectContent>
                  {tasks.map((t) => <SelectItem key={t.task_id} value={t.task_id}>{taskLabel(t)}</SelectItem>)}
                </SelectContent>
              </Select>
            )}

            {op === "move_task" && (
              <div className="flex gap-2">
                <label className="flex-1 space-y-1 text-xs text-muted-foreground">
                  <span>Novo início</span>
                  <input type="date" value={newStart} onChange={(e) => setNewStart(e.target.value)}
                    className="block h-10 w-full rounded-md border bg-background px-2 text-sm" />
                </label>
                <label className="flex-1 space-y-1 text-xs text-muted-foreground">
                  <span>Novo prazo</span>
                  <input type="date" value={newDue} onChange={(e) => setNewDue(e.target.value)}
                    className="block h-10 w-full rounded-md border bg-background px-2 text-sm" />
                </label>
              </div>
            )}

            {(op === "reassign" || op === "remove_person") && (
              <Select value={personId} onValueChange={setPersonId}>
                <SelectTrigger className="h-10 bg-background"><SelectValue placeholder="Escolha a pessoa" /></SelectTrigger>
                <SelectContent>
                  {persons.map((p) => <SelectItem key={p.id} value={p.id}>{p.full_name}</SelectItem>)}
                </SelectContent>
              </Select>
            )}

            {op === "scale_hours" && (
              <label className="space-y-1 text-xs text-muted-foreground">
                <span>Fator (ex.: 1.5 = +50%, 0.5 = metade)</span>
                <input type="number" step="0.1" min={0} value={factor} onChange={(e) => setFactor(e.target.value)}
                  className="block h-10 w-40 rounded-md border bg-background px-2 text-sm" />
              </label>
            )}

            {op === "add_freelancer" && (
              <div className="space-y-2">
                <div className="flex gap-2">
                  <label className="flex-1 space-y-1 text-xs text-muted-foreground">
                    <span>Nome</span>
                    <input value={flName} onChange={(e) => setFlName(e.target.value)}
                      className="block h-10 w-full rounded-md border bg-background px-2 text-sm" />
                  </label>
                  <label className="w-28 space-y-1 text-xs text-muted-foreground">
                    <span>h/dia</span>
                    <input type="number" min={1} value={flHours} onChange={(e) => setFlHours(e.target.value)}
                      className="block h-10 w-full rounded-md border bg-background px-2 text-sm" />
                  </label>
                </div>
                <div className="space-y-1 text-xs text-muted-foreground">
                  <span>Passar tarefas ao freelancer</span>
                  <div className="max-h-40 space-y-1 overflow-y-auto rounded-md border p-2">
                    {tasks.length === 0 && <p className="text-muted-foreground">Sem tarefas na janela.</p>}
                    {tasks.map((t) => (
                      <label key={t.task_id} className="flex items-center gap-2 text-xs">
                        <input
                          type="checkbox"
                          checked={flTasks.includes(t.task_id)}
                          onChange={(e) =>
                            setFlTasks((prev) => e.target.checked ? [...prev, t.task_id] : prev.filter((x) => x !== t.task_id))
                          }
                        />
                        <span className="truncate">{taskLabel(t)}</span>
                      </label>
                    ))}
                  </div>
                </div>
              </div>
            )}

            <Button size="sm" className="gap-1.5" disabled={!canAdd} onClick={addMutation}>
              <Plus size={15} /> Adicionar ao cenário
            </Button>
          </div>
        </SectionCard>

        {/* Cenário montado */}
        <SectionCard
          title="Cenário"
          icon={FlaskConical}
          right={
            mutations.length > 0 ? (
              <Button variant="ghost" size="sm" className="gap-1 text-muted-foreground" onClick={() => { setMutations([]); setResult(null) }}>
                <Trash2 size={14} /> Limpar
              </Button>
            ) : undefined
          }
        >
          {mutations.length === 0 ? (
            <EmptyState icon={FlaskConical} title="Cenário vazio"
              description="Adicione mutações (mover, trocar responsável, freelancer…) e simule o impacto na capacidade. Nada é salvo." />
          ) : (
            <div className="space-y-2">
              {mutations.map((m, i) => (
                <div key={i} className="flex items-center justify-between gap-2 rounded-xl border bg-muted/30 px-3 py-2 text-sm">
                  <div className="flex items-center gap-2">
                    <Pill tone="slate">{OP_LABEL[m.op]}</Pill>
                    <span className="text-muted-foreground">{describe(m, tasks, persons)}</span>
                  </div>
                  <button className="text-muted-foreground hover:text-destructive" onClick={() => setMutations((prev) => prev.filter((_, x) => x !== i))}>
                    <X size={15} />
                  </button>
                </div>
              ))}
              <Button className="mt-2 w-full gap-1.5" disabled={simulating} onClick={() => runSim()}>
                {simulating ? <Loader2 size={15} className="animate-spin" /> : <Sparkles size={15} />}
                Simular cenário
              </Button>
            </div>
          )}
        </SectionCard>
      </div>
      )}

      {/* Resultado */}
      {result && diff && (
        <>
          <KpiRow className="sm:grid-cols-2 xl:grid-cols-4">
            <KpiCount icon={Sparkles} value={diff.resolved_cells}
              label="Sobrecarga resolvida · dias/pessoa que saíram do vermelho" tone="emerald" />
            <KpiCount icon={FlaskConical} value={diff.new_cells}
              label="Nova sobrecarga · dias/pessoa que ficaram no vermelho"
              tone={diff.new_cells > 0 ? "red" : "slate"} highlight={diff.new_cells > 0} />
            <KpiCount icon={AlertTriangle} value={`${diff.before_over_cells} → ${diff.after_over_cells}`}
              label="Dias em sobrecarga (antes → depois)"
              tone={diff.after_over_cells <= diff.before_over_cells ? "emerald" : "red"} />
            <KpiCount icon={Users} value={`${diff.before_persons_over} → ${diff.after_persons_over}`}
              label="Pessoas em risco (antes → depois)"
              tone={diff.after_persons_over <= diff.before_persons_over ? "emerald" : "red"} />
          </KpiRow>

          <SectionCard title="Carga por pessoa — DEPOIS do cenário">
            {result.after.cells.length > 0 ? (
              <WorkloadView cells={result.after.cells} nameForUser={nameFor} />
            ) : (
              <EmptyState icon={FlaskConical} title="Sem carga" description="O cenário resultou em nenhuma alocação na janela." />
            )}
          </SectionCard>
        </>
      )}
    </div>
  )
}

export default CapacitySimulator
