import { useEffect, useMemo, useState } from "react"
import { Headset, Loader2, Pencil } from "lucide-react"

import { teamOccurrencesApi, type AssistedOpsDev } from "@/api/clientes"
import { teamopsApi, type Person } from "@/api/teamops"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { toast } from "@/lib/toast"
import { AllocationSplitBar, allocationSplit } from "@/modules/teamops/AllocationSplit"

function apiError(err: unknown, fallback: string): string {
  const d = (err as { response?: { data?: { detail?: unknown } } })?.response?.data?.detail
  return typeof d === "string" ? d : fallback
}

/** Desenvolvedores fixos que atendem as Ocorrências da Operação Assistida do projeto.
 * Todos são avisados de ocorrência nova; quem assumir primeiro fica responsável. */
export function AssistedOpsDevsSection({ projectTaskId, readOnly }: { projectTaskId: string; readOnly: boolean }) {
  const [devs, setDevs] = useState<AssistedOpsDev[]>([])
  const [editing, setEditing] = useState(false)
  const [persons, setPersons] = useState<Person[]>([])
  const [selected, setSelected] = useState<string[]>([])
  const [filter, setFilter] = useState("")
  const [saving, setSaving] = useState(false)
  // Divisão da jornada editável na mesma tela (grava em Pessoas): person_id → [projetos, OA]
  const [alloc, setAlloc] = useState<Record<string, { p: string; oa: string }>>({})

  useEffect(() => {
    teamOccurrencesApi.listDevs(projectTaskId).then(setDevs).catch(() => setDevs([]))
  }, [projectTaskId])

  function startEdit() {
    setSelected(devs.map((d) => d.person_id))
    setFilter("")
    setEditing(true)
    setAlloc(
      Object.fromEntries(
        devs.map((d) => [d.person_id, { p: String(d.project_allocation_pct ?? 100), oa: String(d.assisted_ops_allocation_pct ?? 0) }]),
      ),
    )
    if (persons.length === 0) {
      teamopsApi
        .listPersons()
        .then((ps) => setPersons(ps.filter((p) => p.status === "ativo")))
        .catch(() => setPersons([]))
    }
  }

  function allocOf(personId: string) {
    const existing = alloc[personId]
    if (existing) return existing
    const p = persons.find((x) => x.id === personId)
    return { p: String(p?.project_allocation_pct ?? 100), oa: String(p?.assisted_ops_allocation_pct ?? 0) }
  }

  const visible = useMemo(() => {
    const q = filter.trim().toLowerCase()
    return q ? persons.filter((p) => p.full_name.toLowerCase().includes(q)) : persons
  }, [persons, filter])

  async function save() {
    setSaving(true)
    try {
      const allocations = selected.map((id) => {
        const a = allocOf(id)
        return { person_id: id, project_allocation_pct: Number(a.p) || 0, assisted_ops_allocation_pct: Number(a.oa) || 0 }
      })
      if (allocations.some((a) => a.project_allocation_pct + a.assisted_ops_allocation_pct > 100)) {
        toast.error("Projetos + Operação Assistida não pode passar de 100%.")
        return
      }
      setDevs(await teamOccurrencesApi.setDevs(projectTaskId, selected, allocations))
      setEditing(false)
      toast.success("Desenvolvedores de atendimento atualizados.")
    } catch (err) {
      toast.error(apiError(err, "Não foi possível salvar."))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-2 rounded-md border border-teal-500/30 bg-teal-50/40 p-3 dark:bg-teal-950/20">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Headset size={14} className="text-teal-600" />
          <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-teal-700 dark:text-teal-400">
            Operação Assistida · atendimento
          </p>
        </div>
        {!readOnly && !editing && (
          <Button variant="ghost" size="sm" className="h-7 gap-1 text-xs" onClick={startEdit}>
            <Pencil size={12} /> Definir
          </Button>
        )}
      </div>

      {!editing ? (
        devs.length === 0 ? (
          <p className="text-xs text-muted-foreground">
            Nenhum desenvolvedor definido. Quem estiver aqui recebe as ocorrências dos clientes deste projeto.
          </p>
        ) : (
          <div className="space-y-1.5">
            {devs.map((d) => (
              <div key={d.person_id} className="flex flex-wrap items-center justify-between gap-2 rounded-md bg-background px-2 py-1 text-xs shadow-sm">
                <span className="font-medium" title={d.position_name ?? undefined}>{d.full_name}</span>
                <AllocationSplitBar
                  compact
                  split={allocationSplit(d.daily_hours, d.project_allocation_pct, d.assisted_ops_allocation_pct)}
                />
              </div>
            ))}
          </div>
        )
      ) : (
        <div className="space-y-2">
          <Input className="h-8" placeholder="Buscar pessoa" value={filter} onChange={(e) => setFilter(e.target.value)} />
          <div className="max-h-48 overflow-y-auto rounded-md border bg-background">
            {visible.map((p) => (
              <label key={p.id} className="flex cursor-pointer items-center gap-2 border-b px-2 py-1 text-sm last:border-b-0 hover:bg-muted/50">
                <input
                  type="checkbox"
                  className="h-4 w-4 rounded border-input accent-primary"
                  checked={selected.includes(p.id)}
                  onChange={() =>
                    setSelected((cur) => (cur.includes(p.id) ? cur.filter((x) => x !== p.id) : [...cur, p.id]))
                  }
                />
                <span className="flex-1 truncate">{p.full_name}</span>
              </label>
            ))}
          </div>
          {selected.length > 0 && (
            <div className="space-y-1.5 rounded-md border bg-background p-2">
              <p className="text-[11px] font-semibold text-muted-foreground">
                Divisão da jornada (cadastro em Pessoas) — Chamados é o que sobra
              </p>
              {selected.map((id) => {
                const a = allocOf(id)
                const person = persons.find((x) => x.id === id)
                const name = person?.full_name ?? devs.find((d) => d.person_id === id)?.full_name ?? "—"
                const split = allocationSplit(person?.daily_hours ?? devs.find((d) => d.person_id === id)?.daily_hours, Number(a.p), Number(a.oa))
                return (
                  <div key={id} className="grid grid-cols-[1fr_4.5rem_4.5rem_3.5rem] items-center gap-1.5 text-xs">
                    <span className="truncate">{name}</span>
                    <Input
                      className="h-7 px-1.5 text-xs"
                      type="number" min={0} max={100} title="Projetos (%)"
                      value={a.p}
                      onChange={(e) => setAlloc((cur) => ({ ...cur, [id]: { ...allocOf(id), p: e.target.value } }))}
                    />
                    <Input
                      className="h-7 px-1.5 text-xs"
                      type="number" min={0} max={100} title="Operação Assistida (%)"
                      value={a.oa}
                      onChange={(e) => setAlloc((cur) => ({ ...cur, [id]: { ...allocOf(id), oa: e.target.value } }))}
                    />
                    <span className="tabular-nums text-muted-foreground" title="Chamados (%)">{split.ticketsPct}%</span>
                  </div>
                )
              })}
              <p className="text-[10px] text-muted-foreground">Colunas: Projetos % · Operação Assistida % · Chamados %</p>
            </div>
          )}
          <div className="flex justify-end gap-2">
            <Button variant="ghost" size="sm" onClick={() => setEditing(false)} disabled={saving}>
              Cancelar
            </Button>
            <Button size="sm" onClick={() => void save()} disabled={saving}>
              {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Salvar
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
