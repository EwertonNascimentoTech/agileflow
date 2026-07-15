import { useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from "react"
import { AlertTriangle, Loader2, Users } from "lucide-react"

import { projetosApi, type WorkloadCell } from "@/api/projetos"
import type { User } from "@/types"
import { EmptyState } from "@/components/EmptyState"

function initials(name: string | undefined): string {
  if (!name) return "?"
  const p = name.trim().split(/\s+/).filter(Boolean)
  if (p.length === 0) return "?"
  if (p.length === 1) return p[0].slice(0, 2).toUpperCase()
  return (p[0][0] + p[p.length - 1][0]).toUpperCase()
}

const MON = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"]

// Cor da célula por proporção carga/capacidade (paleta inspirada no MS Planner).
function cellStyle(allocated: number, capacity: number): CSSProperties {
  if (capacity <= 0) {
    return allocated > 0 ? { background: "#fecaca", color: "#7f1d1d" } : {}
  }
  const ratio = allocated / capacity
  if (ratio > 1.0001) return { background: "#ef4444", color: "#fff" }
  if (ratio > 0.8) return { background: "#fde68a", color: "#78350f" }
  if (ratio > 0) return { background: "#bbf7d0", color: "#14532d" }
  return {}
}

/**
 * Heatmap carga×capacidade por pessoa×dia. Dois modos:
 *  - Não-controlado: recebe `projectId` (+ `users`) e busca o workload do projeto (usado no Gantt).
 *  - Controlado: recebe `cells` já calculadas (+ `nameForUser`) — usado pelo Cockpit de capacidade cross-project.
 */
export function WorkloadView({
  projectId,
  users,
  cells: cellsProp,
  nameForUser,
  loading: loadingProp,
}: {
  projectId?: string
  users?: User[]
  cells?: WorkloadCell[]
  nameForUser?: (id: string) => string
  loading?: boolean
}) {
  const controlled = cellsProp !== undefined
  const [fetched, setFetched] = useState<WorkloadCell[]>([])
  const [fetching, setFetching] = useState(!controlled)

  useEffect(() => {
    if (controlled || !projectId) return
    setFetching(true)
    projetosApi.getWorkload(projectId, { unit: "day" })
      .then((r) => setFetched(r.cells))
      .catch(() => setFetched([]))
      .finally(() => setFetching(false))
  }, [controlled, projectId])

  const cells = controlled ? cellsProp! : fetched
  const loading = controlled ? Boolean(loadingProp) : fetching

  // Tooltip customizado (position: fixed → não é cortado pelo overflow da tabela).
  const [hover, setHover] = useState<{ c: WorkloadCell; name: string; date: string; x: number; y: number } | null>(null)
  const tipRef = useRef<HTMLDivElement>(null)
  const [tipPos, setTipPos] = useState<{ left: number; top: number; ready: boolean }>({ left: 0, top: 0, ready: false })

  // Reposiciona o tooltip para caber na viewport (vira para cima perto da borda inferior).
  useLayoutEffect(() => {
    if (!hover) {
      setTipPos({ left: 0, top: 0, ready: false })
      return
    }
    const el = tipRef.current
    const pad = 8
    const gap = 14
    const vw = window.innerWidth
    const vh = window.innerHeight
    const tw = el?.offsetWidth ?? 256
    const th = el?.offsetHeight ?? 120

    let left = hover.x + gap
    if (left + tw > vw - pad) left = hover.x - tw - gap
    if (left < pad) left = pad

    let top = hover.y + gap
    if (top + th > vh - pad) top = hover.y - th - gap
    if (top < pad) top = pad

    setTipPos({ left, top, ready: true })
  }, [hover])

  const { dates, byUser, userIds, overCount } = useMemo(() => {
    const dateSet = new Set<string>()
    const map = new Map<string, Map<string, WorkloadCell>>()
    let over = 0
    for (const c of cells) {
      dateSet.add(c.date)
      if (c.overallocated) over++
      let row = map.get(c.user_id)
      if (!row) { row = new Map(); map.set(c.user_id, row) }
      row.set(c.date, c)
    }
    const ds = [...dateSet].sort()
    const uids = [...map.keys()]
    return { dates: ds, byUser: map, userIds: uids, overCount: over }
  }, [cells])

  const userName = (id: string) =>
    nameForUser?.(id) ?? users?.find((u) => u.id === id)?.full_name ?? "Usuário"

  if (loading) {
    return <div className="flex items-center gap-2 p-6 text-sm text-muted-foreground"><Loader2 size={16} className="animate-spin" /> Calculando carga…</div>
  }
  if (userIds.length === 0) {
    return (
      <EmptyState
        icon={Users}
        title="Sem dados de carga"
        description="Atribua responsáveis e horas estimadas às User Stories com início e prazo para ver a distribuição de carga e identificar superlotação."
      />
    )
  }

  return (
    <div className="afx w-full">
      <div className="flex items-center gap-2 px-1 py-2 text-sm text-muted-foreground">
        <AlertTriangle size={14} className="text-destructive" />
        {overCount > 0
          ? <span><strong className="text-destructive">{overCount}</strong> dia(s)/pessoa em superlotação (carga acima da capacidade da jornada).</span>
          : <span>Nenhuma superlotação — capacidade pela jornada de cada pessoa, descontando ausências e feriados.</span>}
      </div>
      <div className="overflow-x-auto rounded-md border bg-card">
        <table className="border-collapse text-[11px]">
          <thead>
            <tr className="border-b bg-muted/40">
              <th className="sticky left-0 z-10 bg-muted/40 px-3 py-2 text-left font-medium text-muted-foreground" style={{ minWidth: 180 }}>Responsável</th>
              {dates.map((d) => {
                const dt = new Date(d + "T00:00:00")
                return (
                  <th key={d} className="border-l px-1 py-2 text-center font-medium text-muted-foreground" style={{ minWidth: 38 }}>
                    <div>{dt.getDate()}</div>
                    <div className="text-[9px] opacity-70">{MON[dt.getMonth()]}</div>
                  </th>
                )
              })}
            </tr>
          </thead>
          <tbody>
            {userIds.map((uid) => {
              const row = byUser.get(uid)!
              return (
                <tr key={uid} className="border-b last:border-b-0">
                  <td className="sticky left-0 z-10 bg-card px-3 py-1.5">
                    <div className="flex items-center gap-2">
                      <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[#6366f1] text-[9px] font-semibold text-white">
                        {initials(userName(uid))}
                      </span>
                      <span className="truncate" style={{ maxWidth: 140 }}>{userName(uid)}</span>
                    </div>
                  </td>
                  {dates.map((d) => {
                    const c = row.get(d)
                    const allocated = c?.allocated_hours ?? 0
                    const capacity = c?.capacity_hours ?? 8
                    return (
                      <td
                        key={d}
                        className="border-l px-1 py-1.5 text-center"
                        style={cellStyle(allocated, capacity)}
                        onMouseEnter={c ? (e) => setHover({ c, name: userName(uid), date: d, x: e.clientX, y: e.clientY }) : undefined}
                        onMouseMove={c ? (e) => setHover((h) => (h ? { ...h, x: e.clientX, y: e.clientY } : h)) : undefined}
                        onMouseLeave={() => setHover(null)}
                      >
                        {allocated > 0 ? allocated.toFixed(allocated % 1 === 0 ? 0 : 1) : ""}
                      </td>
                    )
                  })}
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {hover && (
        <div
          ref={tipRef}
          className="pointer-events-none fixed z-50 w-64 max-h-[min(320px,calc(100vh-16px))] overflow-y-auto rounded-md border bg-popover px-3 py-2 text-[11px] text-popover-foreground shadow-lg"
          style={{
            left: tipPos.left,
            top: tipPos.top,
            visibility: tipPos.ready ? "visible" : "hidden",
          }}
        >
          <div className="font-semibold">{hover.name} · {hover.date}</div>
          <div className="mb-1.5 text-muted-foreground">
            {hover.c.allocated_hours.toFixed(1)}h / {hover.c.capacity_hours}h
            {hover.c.overallocated ? <span className="text-destructive"> — superlotado</span> : null}
          </div>
          {hover.c.items && hover.c.items.length > 0 ? (
            <ul className="space-y-1 border-t pt-1.5">
              {hover.c.items.map((it, i) => (
                <li key={i} className="flex items-start justify-between gap-2">
                  <span className="min-w-0">
                    <span className="text-muted-foreground">{it.project_name}</span>
                    <span className="mx-1">·</span>
                    <span>{it.task_title}</span>
                  </span>
                  <span className="shrink-0 tabular-nums font-medium">{it.hours}h</span>
                </li>
              ))}
            </ul>
          ) : (
            <div className="border-t pt-1.5 text-muted-foreground">Sem detalhamento de demandas.</div>
          )}
        </div>
      )}
    </div>
  )
}
