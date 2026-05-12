import { useEffect, useRef, useState } from "react"
import { useNavigate } from "react-router-dom"
import { Bell, CheckCheck, X } from "lucide-react"
import { notificationsApi, type Notification } from "@/api/company"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

const ENTITY_PATHS: Record<string, (id: string) => string> = {
  task: (_id) => `/app/modules/atendimento/kanban`,
  proposal: (id) => `/app/modules/propostas_contratos/proposals/${id}`,
  contract: (id) => `/app/modules/propostas_contratos/contracts/${id}`,
  attendance: (id) => `/app/modules/atendimento/attendances/${id}`,
}

function fmtTime(iso: string): string {
  const d = new Date(iso)
  const now = new Date()
  const diffMs = now.getTime() - d.getTime()
  const diffMin = Math.floor(diffMs / 60000)
  if (diffMin < 1) return "agora"
  if (diffMin < 60) return `${diffMin}m atrás`
  const diffH = Math.floor(diffMin / 60)
  if (diffH < 24) return `${diffH}h atrás`
  return d.toLocaleDateString("pt-BR")
}

export function NotificationBell() {
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)
  const [count, setCount] = useState(0)
  const [notifications, setNotifications] = useState<Notification[]>([])
  const [loading, setLoading] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  // Polling do unread count a cada 30s
  useEffect(() => {
    function pollCount() {
      notificationsApi.unreadCount().then(r => setCount(r.count)).catch(() => {})
    }
    pollCount()
    const timerId = setInterval(pollCount, 30000)
    return () => clearInterval(timerId)
  }, [])

  // Fecha ao clicar fora
  useEffect(() => {
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener("mousedown", handler)
    return () => document.removeEventListener("mousedown", handler)
  }, [])

  function toggleOpen() {
    if (!open) {
      setLoading(true)
      notificationsApi.list({ limit: 20 })
        .then(setNotifications)
        .finally(() => setLoading(false))
    }
    setOpen(v => !v)
  }

  async function markRead(n: Notification) {
    if (!n.is_read) {
      await notificationsApi.markRead(n.id)
      setNotifications(prev => prev.map(x => x.id === n.id ? { ...x, is_read: true } : x))
      setCount(c => Math.max(0, c - 1))
    }
    if (n.entity_type && n.entity_id) {
      const pathFn = ENTITY_PATHS[n.entity_type]
      if (pathFn) navigate(pathFn(n.entity_id))
    }
    setOpen(false)
  }

  async function markAllRead() {
    await notificationsApi.markAllRead()
    setNotifications(prev => prev.map(x => ({ ...x, is_read: true })))
    setCount(0)
  }

  return (
    <div ref={ref} className="relative">
      <Button
        variant="ghost"
        size="icon"
        className="relative h-9 w-9"
        onClick={toggleOpen}
        aria-label="Notificações"
      >
        <Bell size={18} />
        {count > 0 && (
          <span className="absolute -top-0.5 -right-0.5 h-4 w-4 rounded-full bg-red-500 text-[10px] font-bold text-white flex items-center justify-center">
            {count > 9 ? "9+" : count}
          </span>
        )}
      </Button>

      {open && (
        <div className="absolute right-0 top-full mt-2 w-80 rounded-lg border bg-background shadow-lg z-50">
          <div className="flex items-center justify-between px-3 py-2.5 border-b">
            <h3 className="text-sm font-semibold">Notificações</h3>
            <div className="flex items-center gap-1">
              {count > 0 && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7"
                  title="Marcar todas como lidas"
                  onClick={markAllRead}
                >
                  <CheckCheck size={14} />
                </Button>
              )}
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                onClick={() => setOpen(false)}
              >
                <X size={14} />
              </Button>
            </div>
          </div>

          <div className="max-h-96 overflow-y-auto divide-y">
            {loading ? (
              <div className="py-8 text-center text-sm text-muted-foreground">Carregando…</div>
            ) : notifications.length === 0 ? (
              <div className="py-8 text-center text-sm text-muted-foreground">Nenhuma notificação</div>
            ) : (
              notifications.map(n => (
                <div
                  key={n.id}
                  className={cn(
                    "px-3 py-2.5 cursor-pointer hover:bg-muted/50 transition-colors",
                    !n.is_read && "bg-blue-50/50"
                  )}
                  onClick={() => markRead(n)}
                >
                  <div className="flex items-start gap-2">
                    {!n.is_read && (
                      <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-blue-500" />
                    )}
                    <div className={cn("flex-1 min-w-0", n.is_read && "pl-4")}>
                      <p className="text-sm font-medium leading-snug">{n.title}</p>
                      {n.body && <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{n.body}</p>}
                      <p className="text-[10px] text-muted-foreground mt-1">{fmtTime(n.created_at)}</p>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  )
}
