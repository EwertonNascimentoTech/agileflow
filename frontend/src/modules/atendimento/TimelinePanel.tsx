import { useEffect, useState } from "react"
import { Bot, ArrowRightCircle, MessageSquare, StickyNote, Activity, UserCheck, Loader2, Send } from "lucide-react"
import { timelineApi } from "@/api/atendimento"
import type { LeadEvent, LeadEventType } from "@/api/atendimento"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { cn } from "@/lib/utils"

const ICONS: Record<LeadEventType, typeof Activity> = {
  system:           Activity,
  note:             StickyNote,
  automation:       Bot,
  status_changed:   ArrowRightCircle,
  assigned:         UserCheck,
  message_sent:     MessageSquare,
  message_received: MessageSquare,
}

const COLORS: Record<LeadEventType, string> = {
  system:           "text-muted-foreground bg-muted",
  note:             "text-amber-700 bg-amber-50",
  automation:       "text-violet-700 bg-violet-50",
  status_changed:   "text-blue-700 bg-blue-50",
  assigned:         "text-emerald-700 bg-emerald-50",
  message_sent:     "text-slate-700 bg-slate-100",
  message_received: "text-sky-700 bg-sky-50",
}

const LABELS: Record<LeadEventType, string> = {
  system:           "Sistema",
  note:             "Nota",
  automation:       "Automação",
  status_changed:   "Etapa",
  assigned:         "Atribuição",
  message_sent:     "Mensagem enviada",
  message_received: "Mensagem recebida",
}

function timeAgo(dt: string): string {
  const ms = Date.now() - new Date(dt).getTime()
  const min = Math.floor(ms / 60000)
  if (min < 1) return "agora"
  if (min < 60) return `há ${min}min`
  const h = Math.floor(min / 60)
  if (h < 24) return `há ${h}h`
  const d = Math.floor(h / 24)
  if (d < 7) return `há ${d}d`
  return new Date(dt).toLocaleDateString("pt-BR")
}

export default function TimelinePanel({ attendanceId }: { attendanceId: string }) {
  const [events, setEvents] = useState<LeadEvent[]>([])
  const [loading, setLoading] = useState(true)
  const [note, setNote] = useState("")
  const [sending, setSending] = useState(false)
  const [showInput, setShowInput] = useState(false)

  useEffect(() => {
    timelineApi.list(attendanceId, { limit: 100 })
      .then(setEvents)
      .finally(() => setLoading(false))
  }, [attendanceId])

  async function handleAddNote() {
    if (!note.trim()) return
    setSending(true)
    try {
      const created = await timelineApi.addNote(attendanceId, { content: note.trim(), type: "note" })
      setEvents(prev => [created, ...prev])
      setNote("")
      setShowInput(false)
    } finally {
      setSending(false)
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
          Timeline {events.length > 0 && <span className="text-foreground/60">({events.length})</span>}
        </p>
        <Button
          size="sm" variant="ghost" className="h-6 text-xs px-2"
          onClick={() => setShowInput(v => !v)}
        >
          + Nota
        </Button>
      </div>

      {showInput && (
        <div className="space-y-2 border rounded-md p-2 bg-muted/30">
          <Textarea
            rows={2}
            placeholder="Adicionar uma nota…"
            value={note}
            onChange={e => setNote(e.target.value)}
            className="text-xs resize-none"
          />
          <div className="flex justify-end gap-1">
            <Button size="sm" variant="outline" className="h-7 text-xs px-2"
              onClick={() => { setShowInput(false); setNote("") }}>
              Cancelar
            </Button>
            <Button size="sm" className="h-7 text-xs px-2 gap-1"
              onClick={handleAddNote} disabled={!note.trim() || sending}>
              {sending ? <Loader2 size={11} className="animate-spin" /> : <Send size={11} />}
              Adicionar
            </Button>
          </div>
        </div>
      )}

      {loading ? (
        <p className="text-xs text-muted-foreground">Carregando…</p>
      ) : events.length === 0 ? (
        <p className="text-xs text-muted-foreground text-center py-2">Sem eventos ainda.</p>
      ) : (
        <div className="space-y-2.5">
          {events.map(ev => {
            const Icon = ICONS[ev.type]
            return (
              <div key={ev.id} className="flex gap-2">
                <div className={cn("h-6 w-6 rounded-full flex items-center justify-center shrink-0 mt-0.5", COLORS[ev.type])}>
                  <Icon size={12} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs leading-snug">{ev.content}</p>
                  <p className="text-[10px] text-muted-foreground mt-0.5">
                    <span className="font-medium">{ev.author_name ?? "—"}</span>
                    <span> · </span>
                    <span>{LABELS[ev.type]}</span>
                    <span> · </span>
                    <span title={new Date(ev.created_at).toLocaleString("pt-BR")}>{timeAgo(ev.created_at)}</span>
                  </p>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
