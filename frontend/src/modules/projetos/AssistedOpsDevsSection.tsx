import { useEffect, useMemo, useState } from "react"
import { Headset, Loader2, Pencil } from "lucide-react"

import { teamOccurrencesApi, type AssistedOpsDev } from "@/api/clientes"
import { teamopsApi, type Person } from "@/api/teamops"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { toast } from "@/lib/toast"
import { DrawerSection } from "@/modules/projetos/CollapsibleFormSection"
import { AllocationSplitBar, allocationSplit } from "@/modules/teamops/AllocationSplit"

function apiError(err: unknown, fallback: string): string {
  const d = (err as { response?: { data?: { detail?: unknown } } })?.response?.data?.detail
  return typeof d === "string" ? d : fallback
}

/** Desenvolvedores fixos que atendem as Ocorrências da Operação Assistida do projeto.
 * Todos são avisados de ocorrência nova; quem assumir primeiro fica responsável.
 * Modo modal (`autoEdit`): abre já editando, exige ao menos um dev (`requireOne`) e avisa
 * quem chamou ao salvar/cancelar — usado ao mover o projeto para a Operação Assistida.
 * `hideWhenEmpty` (drawer): sem devs definidos o bloco não aparece — a definição acontece no
 * modal ao mover o projeto para a raia Operação Assistida. */
export function AssistedOpsDevsSection({
  projectTaskId, readOnly, autoEdit = false, requireOne = false, bare = false, hideWhenEmpty = false,
  refreshKey = 0, onSaved, onCancel,
}: {
  projectTaskId: string
  readOnly: boolean
  autoEdit?: boolean
  requireOne?: boolean
  /** Sem a moldura/título (o modal já tem). */
  bare?: boolean
  /** Não mostra nada enquanto não houver desenvolvedor definido. */
  hideWhenEmpty?: boolean
  /** Muda quando os devs foram salvos em outro lugar (ex.: no modal) — recarrega. */
  refreshKey?: number
  onSaved?: (devs: AssistedOpsDev[]) => void
  onCancel?: () => void
}) {
  const [devs, setDevs] = useState<AssistedOpsDev[]>([])
  const [editing, setEditing] = useState(false)
  const [persons, setPersons] = useState<Person[]>([])
  const [selected, setSelected] = useState<string[]>([])
  const [filter, setFilter] = useState("")
  const [saving, setSaving] = useState(false)
  // Divisão da jornada editável na mesma tela (grava em Pessoas): person_id → [projetos, OA]
  const [alloc, setAlloc] = useState<Record<string, { p: string; oa: string }>>({})

  useEffect(() => {
    teamOccurrencesApi.listDevs(projectTaskId)
      .then((d) => { setDevs(d); if (autoEdit) startEdit(d) })
      .catch(() => { setDevs([]); if (autoEdit) startEdit([]) })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectTaskId, refreshKey])

  function startEdit(current: AssistedOpsDev[] = devs) {
    setSelected(current.map((d) => d.person_id))
    setFilter("")
    setEditing(true)
    setAlloc(
      Object.fromEntries(
        current.map((d) => [d.person_id, { p: String(d.project_allocation_pct ?? 100), oa: String(d.assisted_ops_allocation_pct ?? 0) }]),
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
      const saved = await teamOccurrencesApi.setDevs(projectTaskId, selected, allocations)
      setDevs(saved)
      setEditing(false)
      toast.success("Desenvolvedores de atendimento atualizados.")
      onSaved?.(saved)
    } catch (err) {
      toast.error(apiError(err, "Não foi possível salvar."))
    } finally {
      setSaving(false)
    }
  }

  if (hideWhenEmpty && !editing && devs.length === 0) return null

  const body = (
    <>
      {!editing ? (
        devs.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Nenhum desenvolvedor definido. Quem estiver aqui recebe as ocorrências dos clientes deste projeto.
          </p>
        ) : (
          <div className="space-y-1.5">
            {devs.map((d) => (
              <div key={d.person_id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border bg-muted/30 px-3 py-2 text-sm">
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
          <div className="max-h-48 overflow-y-auto rounded-lg border bg-background">
            {visible.map((p) => (
              <label key={p.id} className="flex cursor-pointer items-center gap-2 border-b px-3 py-1.5 text-sm last:border-b-0 hover:bg-muted/50">
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
            <div className="space-y-1.5 rounded-lg border bg-background p-3">
              <p className="text-xs font-medium text-muted-foreground">
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
              <p className="text-xs text-muted-foreground">Colunas: Projetos % · Operação Assistida % · Chamados %</p>
            </div>
          )}
          <div className="flex justify-end gap-2">
            <Button variant="ghost" size="sm" onClick={() => { setEditing(false); onCancel?.() }} disabled={saving}>
              Cancelar
            </Button>
            <Button
              size="sm"
              onClick={() => void save()}
              disabled={saving || (requireOne && selected.length === 0)}
              title={requireOne && selected.length === 0 ? "Escolha ao menos um desenvolvedor" : undefined}
            >
              {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Salvar
            </Button>
          </div>
        </div>
      )}
    </>
  )

  if (bare) return <div className="space-y-2">{body}</div>

  return (
    <DrawerSection
      title="Operação Assistida · atendimento"
      icon={Headset}
      iconClassName="text-teal-600 dark:text-teal-400"
      right={
        !readOnly && !editing && (
          <Button variant="outline" size="sm" className="h-8 gap-1" onClick={() => startEdit()}>
            <Pencil size={13} /> Definir
          </Button>
        )
      }
    >
      {body}
    </DrawerSection>
  )
}
