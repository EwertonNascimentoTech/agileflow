import { CalendarRange, KanbanSquare, List as ListIcon } from "lucide-react"

export type BoardView = "board" | "list" | "cal"

export function resolveViewFromPath(pathname: string): BoardView {
  if (pathname.endsWith("/lista")) return "list"
  if (pathname.endsWith("/calendario")) return "cal"
  return "board"
}

export function ProjectViewTabs({
  active,
  onChange,
  onCronograma,
  count,
  cronogramaActive = false,
}: {
  active: BoardView
  onChange: (v: BoardView) => void
  onCronograma: () => void
  count: number
  cronogramaActive?: boolean
}) {
  return (
    <div className="view-tabs">
      <button className={`view-tab ${active === "board" ? "active" : ""}`} onClick={() => onChange("board")}>
        <KanbanSquare size={14} /> Quadro <span className="pill">{count}</span>
      </button>
      <button className={`view-tab ${active === "list" ? "active" : ""}`} onClick={() => onChange("list")}>
        <ListIcon size={14} /> Lista
      </button>
      <button className={`view-tab ${cronogramaActive ? "active" : ""}`} onClick={onCronograma}>
        <CalendarRange size={14} /> Cronograma
      </button>
      <button className={`view-tab ${active === "cal" ? "active" : ""}`} onClick={() => onChange("cal")}>
        <CalendarRange size={14} /> Calendário
      </button>
    </div>
  )
}
