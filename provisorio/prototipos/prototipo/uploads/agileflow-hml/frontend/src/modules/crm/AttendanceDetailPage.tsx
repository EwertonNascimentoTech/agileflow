import { useEffect, useRef, useState } from "react"
import { useNavigate, useParams } from "react-router-dom"
import {
  ArrowLeft, Send, Loader2, MessageSquare,
  Phone, Globe, AtSign, Clock, User2, DollarSign, CalendarClock, Pencil,
  Trophy, X as XIcon,
} from "lucide-react"
import { attendancesApi, statusConfigApi, clientsApi } from "@/api/crm"
import type { Attendance, Message, StatusConfig, Client, ChannelType, Priority } from "@/api/crm"
import { companyApi } from "@/api/crm"
import type { User } from "@/types"
import TasksPanel from "./TasksPanel"
import TimelinePanel from "./TimelinePanel"
import CloseAttendanceModal from "./CloseAttendanceModal"
import ProposalsListPanel from "@/modules/crm/proposals/ProposalsListPanel"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog"
import { cn } from "@/lib/utils"

const NO_USER = "__none__"
const fmtCurrency = (v: number | null | undefined) =>
  v === null || v === undefined
    ? "—"
    : new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(Number(v))

const PRIORITY_LABELS: Record<Priority, string> = {
  low: "Baixa", medium: "Normal", high: "Alta", urgent: "Urgente",
}

const CHANNEL_LABELS: Record<ChannelType, string> = {
  whatsapp: "WhatsApp", instagram: "Instagram",
  phone: "Telefone", site: "Site", other: "Outro",
}

function ChannelIcon({ channel, size = 14 }: { channel: ChannelType; size?: number }) {
  if (channel === "whatsapp")  return <MessageSquare size={size} className="text-green-600" />
  if (channel === "instagram") return <AtSign size={size} className="text-pink-600" />
  if (channel === "phone")     return <Phone size={size} className="text-blue-600" />
  return <Globe size={size} className="text-muted-foreground" />
}

export default function AttendanceDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const messagesEndRef = useRef<HTMLDivElement>(null)

  const [attendance, setAttendance] = useState<Attendance | null>(null)
  const [messages, setMessages] = useState<Message[]>([])
  const [statuses, setStatuses] = useState<StatusConfig[]>([])
  const [client, setClient] = useState<Client | null>(null)
  const [users, setUsers] = useState<User[]>([])
  const [loading, setLoading] = useState(true)
  const [sending, setSending] = useState(false)
  const [text, setText] = useState("")
  const [changingStatus, setChangingStatus] = useState(false)
  const [editOpen, setEditOpen] = useState(false)
  const [editForm, setEditForm] = useState<{ value: string; expected_close_date: string; assigned_to: string }>({
    value: "", expected_close_date: "", assigned_to: NO_USER,
  })
  const [savingEdit, setSavingEdit] = useState(false)
  const [showCloseModal, setShowCloseModal] = useState(false)

  useEffect(() => {
    if (!id) return
    Promise.all([
      attendancesApi.get(id),
      attendancesApi.getMessages(id),
      statusConfigApi.list(),
      companyApi.listUsers({ active_only: true }).catch(() => [] as User[]),
    ]).then(([a, m, s, u]) => {
      setAttendance(a)
      setMessages(m)
      setStatuses(s.sort((x, y) => x.order - y.order))
      setUsers(u)
      return clientsApi.get(a.client_id)
    }).then(setClient).catch(() => {}).finally(() => setLoading(false))
  }, [id])

  function openEdit() {
    if (!attendance) return
    setEditForm({
      value: attendance.value !== null && attendance.value !== undefined ? String(attendance.value) : "",
      expected_close_date: attendance.expected_close_date
        ? attendance.expected_close_date.slice(0, 10)
        : "",
      assigned_to: attendance.assigned_to ?? NO_USER,
    })
    setEditOpen(true)
  }

  async function saveEdit() {
    if (!id) return
    setSavingEdit(true)
    try {
      const payload: Record<string, unknown> = {
        value: editForm.value === "" ? null : Number(editForm.value),
        expected_close_date: editForm.expected_close_date
          ? new Date(editForm.expected_close_date).toISOString()
          : null,
        assigned_to: editForm.assigned_to === NO_USER ? null : editForm.assigned_to,
      }
      const updated = await attendancesApi.update(id, payload)
      setAttendance(updated)
      setEditOpen(false)
    } finally {
      setSavingEdit(false)
    }
  }

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [messages])

  async function handleSend() {
    if (!text.trim() || !id) return
    setSending(true)
    try {
      const msg = await attendancesApi.sendMessage(id, text.trim())
      setMessages(prev => [...prev, msg])
      setText("")
    } finally {
      setSending(false)
    }
  }

  async function handleStatusChange(newStatusId: string) {
    if (!id || !attendance) return
    setChangingStatus(true)
    try {
      const updated = await attendancesApi.changeStatus(id, newStatusId)
      setAttendance(updated)
    } finally {
      setChangingStatus(false)
    }
  }

  if (loading) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-[400px] w-full" />
      </div>
    )
  }

  if (!attendance) {
    return <div className="py-16 text-center text-muted-foreground">Atendimento não encontrado.</div>
  }

  const currentStatus = statuses.find(s => s.id === attendance.status_id)

  return (
    <div className="flex flex-col h-full max-h-[calc(100vh-160px)] min-h-0">
      {/* Cabeçalho */}
      <div className="flex items-center gap-3 mb-4 shrink-0">
        <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0" onClick={() => navigate(-1)}>
          <ArrowLeft size={15} />
        </Button>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs text-muted-foreground font-mono">{attendance.protocol}</span>
            <div className="flex items-center gap-1 text-xs text-muted-foreground">
              <ChannelIcon channel={attendance.channel} size={12} />
              {CHANNEL_LABELS[attendance.channel]}
            </div>
            <Badge variant="outline" className="text-xs">
              {PRIORITY_LABELS[attendance.priority]}
            </Badge>
          </div>
          <p className="font-semibold text-sm truncate mt-0.5">{attendance.subject}</p>
        </div>
        <div className="flex items-center gap-2 shrink-0 flex-wrap">
          {/* Outcome badge when closed */}
          {attendance.outcome === "won" && (
            <Badge className="gap-1 bg-emerald-100 text-emerald-700 border-emerald-200">
              <Trophy size={11} /> Ganho
            </Badge>
          )}
          {attendance.outcome === "lost" && (
            <Badge className="gap-1 bg-red-100 text-red-700 border-red-200">
              <XIcon size={11} /> Perdido
            </Badge>
          )}
          {/* Close buttons — only visible when outcome is open */}
          {(!attendance.outcome || attendance.outcome === "open") && (
            <Button
              size="sm"
              variant="outline"
              className="h-8 text-xs gap-1 text-emerald-600 hover:text-emerald-700 hover:border-emerald-300"
              onClick={() => setShowCloseModal(true)}
            >
              <Trophy size={12} /> Ganho
            </Button>
          )}
          {(!attendance.outcome || attendance.outcome === "open") && (
            <Button
              size="sm"
              variant="outline"
              className="h-8 text-xs gap-1 text-red-600 hover:text-red-700 hover:border-red-300"
              onClick={() => setShowCloseModal(true)}
            >
              <XIcon size={12} /> Perdido
            </Button>
          )}
          {changingStatus && <Loader2 size={13} className="animate-spin text-muted-foreground" />}
          <Select value={attendance.status_id} onValueChange={handleStatusChange} disabled={!!attendance.closed_at}>
            <SelectTrigger className="h-8 text-xs w-36">
              <div className="flex items-center gap-1.5 min-w-0">
                <div className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: currentStatus?.color }} />
                <SelectValue />
              </div>
            </SelectTrigger>
            <SelectContent>
              {statuses.map(s => (
                <SelectItem key={s.id} value={s.id}>
                  <div className="flex items-center gap-2">
                    <div className="h-2 w-2 rounded-full" style={{ backgroundColor: s.color }} />
                    {s.name}
                  </div>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="flex min-h-0 flex-1 gap-4 overflow-hidden">
        {/* Sidebar — detalhes, negociação, tarefas, timeline */}
        <div className="hidden w-80 shrink-0 space-y-4 overflow-y-auto lg:block xl:w-96">
          <div className="rounded-xl border bg-card p-3 space-y-2">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Contato</p>
            {client ? (
              <button
                type="button"
                className="flex w-full items-center gap-2 rounded-md text-left transition-colors hover:bg-muted/60 -m-1 p-1"
                onClick={() => navigate(`/app/modules/crm/clients/${client.id}`)}
              >
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-bold text-primary">
                  {client.name[0].toUpperCase()}
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-medium truncate">{client.name}</p>
                  <p className="text-xs text-muted-foreground truncate">{client.phone ?? client.email ?? "—"}</p>
                </div>
              </button>
            ) : (
              <div className="flex items-center gap-2 text-muted-foreground text-sm">
                <User2 size={14} /> —
              </div>
            )}
          </div>

          <div className="rounded-xl border bg-card p-3 space-y-3">
            <div className="flex items-center justify-between gap-2">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Negociação</p>
              <Button size="icon" variant="ghost" className="h-6 w-6 shrink-0" onClick={openEdit} title="Editar resumo">
                <Pencil size={11} />
              </Button>
            </div>
            <div className="space-y-1.5 text-xs">
              <div className="flex items-center gap-1.5">
                <DollarSign size={11} className="text-muted-foreground shrink-0" />
                <span className={attendance.value !== null && attendance.value !== undefined ? "font-semibold text-emerald-600" : "text-muted-foreground"}>
                  {fmtCurrency(attendance.value)}
                </span>
              </div>
              <div className="flex items-center gap-1.5 text-muted-foreground">
                <CalendarClock size={11} className="shrink-0" />
                <span>
                  {attendance.expected_close_date
                    ? `Previsão: ${new Date(attendance.expected_close_date).toLocaleDateString("pt-BR")}`
                    : "Sem previsão"}
                </span>
              </div>
              <div className="flex items-center gap-1.5 text-muted-foreground">
                <User2 size={11} className="shrink-0" />
                <span className="truncate">
                  {attendance.assigned_to
                    ? users.find(u => u.id === attendance.assigned_to)?.full_name ?? "Atribuído"
                    : "Sem responsável"}
                </span>
              </div>
            </div>
            <div className="border-t pt-3 space-y-2">
              <ProposalsListPanel
                embedded
                attendanceId={attendance.id}
                newProposalParams={{
                  attendance_id: attendance.id,
                  ...(client ? { client_id: client.id } : {}),
                }}
              />
            </div>
          </div>

          <div className="rounded-xl border bg-card p-3 space-y-2">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Detalhes</p>
            <div className="space-y-1.5 text-xs text-muted-foreground">
              <div className="flex items-center gap-1.5">
                <Clock size={11} />
                <span>Aberto {new Date(attendance.opened_at).toLocaleDateString("pt-BR")}</span>
              </div>
              {attendance.last_interaction && (
                <div className="flex items-center gap-1.5">
                  <Clock size={11} />
                  <span>Última interação {new Date(attendance.last_interaction).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}</span>
                </div>
              )}
              {attendance.closed_at && (
                <div className="flex items-center gap-1.5">
                  <Clock size={11} />
                  <span>Fechado {new Date(attendance.closed_at).toLocaleDateString("pt-BR")}</span>
                </div>
              )}
              <div className="flex items-center gap-1.5">
                <ChannelIcon channel={attendance.channel} size={11} />
                <span>{CHANNEL_LABELS[attendance.channel]}</span>
              </div>
            </div>
          </div>

          <div className="rounded-xl border bg-card p-3">
            <TasksPanel attendanceId={attendance.id} />
          </div>

          <div className="rounded-xl border bg-card p-3">
            <TimelinePanel attendanceId={attendance.id} />
          </div>

          {attendance.closed_at && (
            <div className="rounded-xl border border-muted bg-muted/50 p-3 text-center text-xs text-muted-foreground">
              Atendimento encerrado — o envio de mensagens está desativado.
            </div>
          )}
        </div>

        {/* Chat — coluna principal; em mobile a sidebar fica oculta */}
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border bg-muted/20">
          {attendance.closed_at && (
            <div className="shrink-0 border-b bg-muted/40 px-3 py-2 text-center text-xs text-muted-foreground lg:hidden">
              Atendimento encerrado — mensagens desativadas.
            </div>
          )}
          <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-4">
            {messages.length === 0 && (
              <div className="flex h-full min-h-[10rem] flex-col items-center justify-center text-sm text-muted-foreground">
                <MessageSquare size={32} className="mb-2 opacity-30" />
                <p>Nenhuma mensagem ainda.</p>
              </div>
            )}
            {messages.map(msg => {
              const isAgent = msg.sender_type === "agent"
              return (
                <div key={msg.id} className={cn("flex", isAgent ? "justify-end" : "justify-start")}>
                  <div
                    className={cn(
                      "max-w-[85%] rounded-2xl px-3 py-2 text-sm sm:max-w-[70%]",
                      isAgent
                        ? "rounded-br-sm bg-primary text-primary-foreground"
                        : "rounded-bl-sm border bg-background",
                    )}
                  >
                    <p className="leading-relaxed">{msg.content}</p>
                    <p className={cn("mt-1 text-[10px]", isAgent ? "text-right text-primary-foreground/70" : "text-muted-foreground")}>
                      {new Date(msg.sent_at).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
                    </p>
                  </div>
                </div>
              )
            })}
            <div ref={messagesEndRef} />
          </div>
          <div className="flex shrink-0 gap-2 border-t bg-background p-3">
            <Input
              placeholder="Escreva a mensagem…"
              value={text}
              onChange={e => setText(e.target.value)}
              onKeyDown={e => e.key === "Enter" && !e.shiftKey && handleSend()}
              className="h-9 flex-1"
              disabled={!!attendance.closed_at}
            />
            <Button
              size="sm"
              className="h-9 shrink-0 px-3"
              onClick={handleSend}
              disabled={!text.trim() || sending || !!attendance.closed_at}
            >
              {sending ? <Loader2 size={13} className="animate-spin" /> : <Send size={13} />}
            </Button>
          </div>
        </div>
      </div>

      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Editar negociação</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="value">Valor (R$)</Label>
              <Input
                id="value"
                type="number"
                step="0.01"
                min="0"
                placeholder="0,00"
                value={editForm.value}
                onChange={(e) => setEditForm({ ...editForm, value: e.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="close">Previsão de fechamento</Label>
              <Input
                id="close"
                type="date"
                value={editForm.expected_close_date}
                onChange={(e) => setEditForm({ ...editForm, expected_close_date: e.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Responsável</Label>
              <Select
                value={editForm.assigned_to}
                onValueChange={(v) => setEditForm({ ...editForm, assigned_to: v })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NO_USER}>Sem responsável</SelectItem>
                  {users.map(u => (
                    <SelectItem key={u.id} value={u.id}>{u.full_name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setEditOpen(false)}>Cancelar</Button>
            <Button onClick={saveEdit} disabled={savingEdit}>
              {savingEdit && <Loader2 size={13} className="animate-spin mr-1.5" />}
              Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {id && (
        <CloseAttendanceModal
          attendanceId={id}
          open={showCloseModal}
          onOpenChange={setShowCloseModal}
          onClosed={(updated) => setAttendance(updated)}
        />
      )}
    </div>
  )
}
