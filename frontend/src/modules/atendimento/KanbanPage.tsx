import { useCallback, useEffect, useMemo, useState } from "react"
import { useNavigate } from "react-router-dom"
import {
  DndContext, DragOverlay, PointerSensor,
  useSensor, useSensors, type DragEndEvent, type DragStartEvent,
  useDroppable, useDraggable,
} from "@dnd-kit/core"
import { CSS } from "@dnd-kit/utilities"
import { Plus, MessageSquare, Phone, Globe, AtSign, Search, SlidersHorizontal, X, Loader2 } from "lucide-react"
import { statusConfigApi, attendancesApi, clientsApi, funnelsApi } from "@/api/atendimento"
import type { StatusConfig, AttendanceSummary, ClientSummary, Priority, ChannelType, Funnel } from "@/api/atendimento"
import { companyApi } from "@/api/company"
import type { User } from "@/types"
import { useNewAttendanceModal } from "@/modules/atendimento/newAttendanceModal"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"

const PRIORITY_COLORS: Record<Priority, string> = {
  low:    "bg-slate-100 text-slate-600",
  medium: "bg-blue-100 text-blue-600",
  high:   "bg-orange-100 text-orange-700",
  urgent: "bg-red-100 text-red-700",
}
const PRIORITY_LABELS: Record<Priority, string> = {
  low: "Baixa", medium: "Normal", high: "Alta", urgent: "Urgente",
}

function ChannelIcon({ channel }: { channel: ChannelType }) {
  const props = { size: 12, className: "shrink-0" }
  if (channel === "whatsapp")  return <MessageSquare {...props} className="text-green-600 shrink-0" />
  if (channel === "instagram") return <AtSign {...props} className="text-pink-600 shrink-0" />
  if (channel === "phone")     return <Phone {...props} className="text-blue-600 shrink-0" />
  return <Globe {...props} className="text-muted-foreground shrink-0" />
}

// ── Card ─────────────────────────────────────

function AttendanceCard({
  attendance, client, isDragging = false,
}: {
  attendance: AttendanceSummary
  client?: ClientSummary
  isDragging?: boolean
}) {
  const navigate = useNavigate()
  const { attributes, listeners, setNodeRef, transform } = useDraggable({ id: attendance.id })
  const style = transform ? { transform: CSS.Translate.toString(transform) } : undefined

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...listeners}
      {...attributes}
      onClick={() => navigate(`/app/modules/atendimento/attendances/${attendance.id}`)}
      className={cn(
        "bg-background rounded-lg border p-3 space-y-2 cursor-grab active:cursor-grabbing select-none",
        "hover:shadow-md transition-shadow",
        isDragging && "opacity-50 rotate-1"
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <p className="text-xs font-medium text-muted-foreground">{attendance.protocol}</p>
        <div className={cn("text-[10px] px-1.5 py-0.5 rounded-full font-medium", PRIORITY_COLORS[attendance.priority])}>
          {PRIORITY_LABELS[attendance.priority]}
        </div>
      </div>

      <p className="text-sm font-medium leading-snug line-clamp-2">{attendance.subject}</p>

      {attendance.value !== null && attendance.value !== undefined && (
        <p className="text-sm font-semibold text-emerald-600">
          {new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(Number(attendance.value))}
        </p>
      )}

      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <ChannelIcon channel={attendance.channel} />
          <span className="truncate max-w-[100px]">{client?.name ?? "—"}</span>
        </div>
        <span className="text-[10px] text-muted-foreground">
          {new Date(attendance.opened_at).toLocaleDateString("pt-BR")}
        </span>
      </div>
    </div>
  )
}

// ── Column ────────────────────────────────────

function KanbanColumn({
  status, attendances, clients, isOver,
}: {
  status: StatusConfig
  attendances: AttendanceSummary[]
  clients: Map<string, ClientSummary>
  isOver: boolean
}) {
  const { setNodeRef } = useDroppable({ id: status.id })

  const total = attendances.reduce((sum, a) => sum + Number(a.value ?? 0), 0)
  const hasValues = attendances.some(a => a.value !== null && a.value !== undefined)

  return (
    <div className="flex flex-col w-72 shrink-0">
      {/* Header */}
      <div className="mb-3 px-1">
        <div className="flex items-center gap-2">
          <div className="h-3 w-3 rounded-full shrink-0" style={{ backgroundColor: status.color }} />
          <span className="text-sm font-semibold truncate flex-1">{status.name}</span>
          <span className="text-xs text-muted-foreground bg-muted px-1.5 py-0.5 rounded-full">
            {attendances.length}
          </span>
        </div>
        {hasValues && (
          <p className="text-[11px] text-emerald-600 font-medium mt-0.5 ml-5">
            {new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(total)}
          </p>
        )}
      </div>

      {/* Drop zone */}
      <div
        ref={setNodeRef}
        className={cn(
          "flex-1 min-h-[120px] rounded-xl p-2 space-y-2 transition-colors",
          isOver ? "bg-primary/5 ring-2 ring-primary/20" : "bg-muted/50"
        )}
      >
        {attendances.map(a => (
          <AttendanceCard
            key={a.id}
            attendance={a}
            client={clients.get(a.client_id)}
          />
        ))}

        {attendances.length === 0 && (
          <div className="flex items-center justify-center h-20 text-xs text-muted-foreground">
            Nenhum atendimento
          </div>
        )}
      </div>
    </div>
  )
}

// ── Page ─────────────────────────────────────

interface KanbanFilters {
  search: string
  priority: Priority | ""
  channel: ChannelType | ""
  assignedTo: string
}

export default function KanbanPage() {
  const navigate = useNavigate()
  const { openNew } = useNewAttendanceModal()
  const [funnels, setFunnels] = useState<Funnel[]>([])
  const [selectedFunnelId, setSelectedFunnelId] = useState<string>("")
  const [statuses, setStatuses] = useState<StatusConfig[]>([])
  const [attendances, setAttendances] = useState<AttendanceSummary[]>([])
  const [clients, setClients] = useState<Map<string, ClientSummary>>(new Map())
  const [users, setUsers] = useState<User[]>([])
  const [loading, setLoading] = useState(true)
  const [loadingStages, setLoadingStages] = useState(false)
  const [activeId, setActiveId] = useState<string | null>(null)
  const [overId, setOverId] = useState<string | null>(null)
  const [movingId, setMovingId] = useState<string | null>(null)
  const [showFilters, setShowFilters] = useState(false)
  const [filters, setFilters] = useState<KanbanFilters>({ search: "", priority: "", channel: "", assignedTo: "" })

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } })
  )

  useEffect(() => {
    Promise.all([
      funnelsApi.list(true),
      attendancesApi.list({ limit: 200 }),
      clientsApi.list({ limit: 200, active_only: false }),
      companyApi.listUsers({ active_only: true }).catch(() => [] as User[]),
    ]).then(([fs, a, c, u]) => {
      setFunnels(fs)
      const def = fs.find(f => f.is_default) ?? fs[0]
      if (def) setSelectedFunnelId(def.id)
      setAttendances(a)
      setClients(new Map(c.map(cl => [cl.id, cl])))
      setUsers(u)
    }).catch(() => {}).finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    if (!selectedFunnelId) return
    setLoadingStages(true)
    statusConfigApi.list(selectedFunnelId)
      .then(s => setStatuses(s.sort((x, y) => x.order - y.order)))
      .finally(() => setLoadingStages(false))
  }, [selectedFunnelId])

  const activeFilterCount = [filters.priority, filters.channel, filters.assignedTo].filter(Boolean).length

  const filteredAttendances = useMemo(() => {
    return attendances.filter(a => {
      if (filters.priority && a.priority !== filters.priority) return false
      if (filters.channel && a.channel !== filters.channel) return false
      if (filters.assignedTo && a.assigned_to !== filters.assignedTo) return false
      if (filters.search) {
        const q = filters.search.toLowerCase()
        const client = clients.get(a.client_id)
        const matches =
          a.subject.toLowerCase().includes(q) ||
          a.protocol?.toLowerCase().includes(q) ||
          client?.name?.toLowerCase().includes(q)
        if (!matches) return false
      }
      return true
    })
  }, [attendances, filters, clients])

  const byStatus = useCallback(
    (statusId: string) => filteredAttendances.filter(a => a.status_id === statusId),
    [filteredAttendances]
  )

  const activeAttendance = attendances.find(a => a.id === activeId)

  function onDragStart({ active }: DragStartEvent) {
    setActiveId(active.id as string)
  }

  function onDragOver({ over }: { over: { id: string } | null }) {
    setOverId(over?.id ?? null)
  }

  async function onDragEnd({ active, over }: DragEndEvent) {
    setActiveId(null)
    setOverId(null)
    if (!over || active.id === over.id) return

    const attendanceId = active.id as string
    const newStatusId = over.id as string
    const isStatus = statuses.some(s => s.id === newStatusId)
    if (!isStatus) return

    const attendance = attendances.find(a => a.id === attendanceId)
    if (!attendance || attendance.status_id === newStatusId) return

    // Optimistic update
    setAttendances(prev =>
      prev.map(a => a.id === attendanceId ? { ...a, status_id: newStatusId } : a)
    )
    setMovingId(attendanceId)

    try {
      await attendancesApi.changeStatus(attendanceId, newStatusId)
    } catch {
      // Rollback
      setAttendances(prev =>
        prev.map(a => a.id === attendanceId ? { ...a, status_id: attendance.status_id } : a)
      )
    } finally {
      setMovingId(null)
    }
  }

  if (loading) {
    return (
      <div className="flex gap-4 overflow-x-auto pb-2">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="w-72 shrink-0 space-y-2">
            <Skeleton className="h-6 w-32" />
            <Skeleton className="h-[120px] w-full rounded-xl" />
          </div>
        ))}
      </div>
    )
  }

  if (funnels.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center text-muted-foreground space-y-3">
        <p className="font-medium">Nenhum funil cadastrado</p>
        <p className="text-sm">Crie um funil antes de usar o Kanban.</p>
        <Button size="sm" onClick={() => navigate("/app/modules/atendimento/config/funnels")}>
          Configurar Funis
        </Button>
      </div>
    )
  }

  // Atendimentos do funil selecionado (apenas os que têm status pertencente a esse funil)
  const stageIds = new Set(statuses.map(s => s.id))
  const funnelAttendances = filteredAttendances.filter(a => stageIds.has(a.status_id))

  function clearFilters() {
    setFilters({ search: "", priority: "", channel: "", assignedTo: "" })
  }

  return (
    <div className="h-full flex flex-col">
      <div className="flex flex-col gap-3 mb-4">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-2 min-w-0">
            <Select value={selectedFunnelId} onValueChange={setSelectedFunnelId}>
              <SelectTrigger className="w-auto min-w-[180px] h-9">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {funnels.map(f => (
                  <SelectItem key={f.id} value={f.id}>
                    <span className="flex items-center gap-2">
                      <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: f.color }} />
                      {f.name}
                      {f.is_default && <Badge variant="outline" className="text-[10px] h-4 px-1">padrão</Badge>}
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-sm text-muted-foreground whitespace-nowrap">
              {funnelAttendances.length} atendimento{funnelAttendances.length !== 1 ? "s" : ""}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              className={cn("gap-1.5", showFilters && "bg-muted")}
              onClick={() => setShowFilters(v => !v)}
            >
              <SlidersHorizontal size={14} />
              Filtros
              {activeFilterCount > 0 && (
                <Badge className="h-4 min-w-4 px-1 text-[10px]">{activeFilterCount}</Badge>
              )}
            </Button>
            <Button
              size="sm"
              className="gap-1.5"
              onClick={() => openNew()}
            >
              <Plus size={14} /> Novo Atendimento
            </Button>
          </div>
        </div>

        {/* Filter bar */}
        {showFilters && (
          <div className="flex flex-wrap items-center gap-2 p-3 bg-muted/50 rounded-lg border">
            <div className="relative flex-1 min-w-[180px] max-w-xs">
              <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input
                className="pl-8 h-8 text-sm"
                placeholder="Buscar por assunto ou contato..."
                value={filters.search}
                onChange={e => setFilters(f => ({ ...f, search: e.target.value }))}
              />
            </div>

            <Select
              value={filters.priority || "__all__"}
              onValueChange={v => setFilters(f => ({ ...f, priority: v === "__all__" ? "" : v as Priority }))}
            >
              <SelectTrigger className="h-8 w-[130px] text-sm">
                <SelectValue placeholder="Prioridade" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">Todas prioridades</SelectItem>
                <SelectItem value="low">Baixa</SelectItem>
                <SelectItem value="medium">Normal</SelectItem>
                <SelectItem value="high">Alta</SelectItem>
                <SelectItem value="urgent">Urgente</SelectItem>
              </SelectContent>
            </Select>

            <Select
              value={filters.channel || "__all__"}
              onValueChange={v => setFilters(f => ({ ...f, channel: v === "__all__" ? "" : v as ChannelType }))}
            >
              <SelectTrigger className="h-8 w-[130px] text-sm">
                <SelectValue placeholder="Canal" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">Todos os canais</SelectItem>
                <SelectItem value="whatsapp">WhatsApp</SelectItem>
                <SelectItem value="instagram">Instagram</SelectItem>
                <SelectItem value="phone">Telefone</SelectItem>
                <SelectItem value="email">E-mail</SelectItem>
                <SelectItem value="chat">Chat</SelectItem>
                <SelectItem value="other">Outro</SelectItem>
              </SelectContent>
            </Select>

            {users.length > 0 && (
              <Select
                value={filters.assignedTo || "__all__"}
                onValueChange={v => setFilters(f => ({ ...f, assignedTo: v === "__all__" ? "" : v }))}
              >
                <SelectTrigger className="h-8 w-[150px] text-sm">
                  <SelectValue placeholder="Responsável" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all__">Todos responsáveis</SelectItem>
                  {users.map(u => (
                    <SelectItem key={u.id} value={u.id}>{u.full_name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}

            {(activeFilterCount > 0 || filters.search) && (
              <Button variant="ghost" size="sm" className="h-8 gap-1 text-muted-foreground" onClick={clearFilters}>
                <X size={12} /> Limpar
              </Button>
            )}
          </div>
        )}
      </div>

      {loadingStages ? (
        <div className="flex gap-4 overflow-x-auto pb-2">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="w-72 shrink-0 space-y-2">
              <Skeleton className="h-6 w-32" />
              <Skeleton className="h-[120px] w-full rounded-xl" />
            </div>
          ))}
        </div>
      ) : statuses.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center text-muted-foreground space-y-3">
          <p className="font-medium">Funil sem etapas</p>
          <p className="text-sm">Configure as etapas deste funil para começar.</p>
          <Button size="sm" onClick={() => navigate("/app/modules/atendimento/config/statuses")}>
            Configurar Etapas
          </Button>
        </div>
      ) : (
      <DndContext
        sensors={sensors}
        onDragStart={onDragStart}
        onDragOver={onDragOver as never}
        onDragEnd={onDragEnd}
      >
        <div className="flex gap-4 overflow-x-auto pb-4 h-full items-start">
          {statuses.map(status => (
            <KanbanColumn
              key={status.id}
              status={status}
              attendances={byStatus(status.id)}
              clients={clients}
              isOver={overId === status.id}
            />
          ))}
        </div>

        <DragOverlay>
          {activeAttendance && (
            <div className="w-72 rotate-2 shadow-xl">
              <AttendanceCard
                attendance={activeAttendance}
                client={clients.get(activeAttendance.client_id)}
                isDragging
              />
            </div>
          )}
        </DragOverlay>
      </DndContext>
      )}

      {movingId && (
        <div className="fixed bottom-4 right-4 flex items-center gap-2 bg-background border rounded-full px-3 py-1.5 text-sm shadow">
          <Loader2 size={13} className="animate-spin text-primary" />
          Movendo…
        </div>
      )}
    </div>
  )
}
