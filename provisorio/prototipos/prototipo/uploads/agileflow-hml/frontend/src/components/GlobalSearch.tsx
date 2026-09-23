import { useEffect, useRef, useState } from "react"
import { useNavigate } from "react-router-dom"
import { Search, FileText, Users, Building2, KanbanSquare, X } from "lucide-react"
import { clientsApi, companiesApi, attendancesApi } from "@/api/crm"
import { proposalsApi } from "@/api/crm"
import { cn } from "@/lib/utils"

interface SearchResult {
  id: string
  label: string
  sublabel?: string
  type: "client" | "company" | "attendance" | "proposal"
  path: string
}

const TYPE_ICONS = {
  client: Users,
  company: Building2,
  attendance: KanbanSquare,
  proposal: FileText,
}

const TYPE_LABELS = {
  client: "Contato",
  company: "Empresa",
  attendance: "Atendimento",
  proposal: "Proposta",
}

export function GlobalSearch({ onClose }: { onClose: () => void }) {
  const navigate = useNavigate()
  const inputRef = useRef<HTMLInputElement>(null)
  const [query, setQuery] = useState("")
  const [results, setResults] = useState<SearchResult[]>([])
  const [loading, setLoading] = useState(false)
  const [selected, setSelected] = useState(0)

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  useEffect(() => {
    if (query.length < 2) { setResults([]); return }
    const timer = setTimeout(() => search(query), 250)
    return () => clearTimeout(timer)
  }, [query])

  async function search(q: string) {
    setLoading(true)
    try {
      const [clients, companies, attendances, proposals] = await Promise.allSettled([
        clientsApi.list({ search: q, limit: 5 }),
        companiesApi.list({ search: q, limit: 5 }),
        attendancesApi.list({ limit: 20 }),
        proposalsApi.list({ limit: 5 }),
      ])

      const out: SearchResult[] = []

      if (clients.status === "fulfilled") {
        clients.value.forEach(c => out.push({
          id: String(c.id), label: c.name, sublabel: c.email ?? c.phone ?? undefined,
          type: "client", path: `/app/modules/atendimento/clients/${c.id}`,
        }))
      }
      if (companies.status === "fulfilled") {
        companies.value.forEach(c => out.push({
          id: String(c.id), label: c.name, sublabel: c.document ?? undefined,
          type: "company", path: `/app/modules/atendimento/companies/${c.id}`,
        }))
      }
      if (attendances.status === "fulfilled") {
        attendances.value
          .filter(a => a.protocol.toLowerCase().includes(q.toLowerCase()) || (a.subject ?? "").toLowerCase().includes(q.toLowerCase()))
          .slice(0, 5)
          .forEach(a => out.push({
            id: String(a.id), label: a.subject ?? a.protocol, sublabel: a.protocol,
            type: "attendance", path: `/app/modules/atendimento/attendances/${a.id}`,
          }))
      }
      if (proposals.status === "fulfilled") {
        proposals.value
          .filter(p => p.title.toLowerCase().includes(q.toLowerCase()) || p.number.toLowerCase().includes(q.toLowerCase()))
          .slice(0, 5)
          .forEach(p => out.push({
            id: String(p.id), label: p.title, sublabel: p.number,
            type: "proposal", path: `/app/modules/propostas_contratos/proposals/${p.id}`,
          }))
      }

      setResults(out)
      setSelected(0)
    } finally {
      setLoading(false)
    }
  }

  function go(result: SearchResult) {
    navigate(result.path)
    onClose()
  }

  function onKey(e: React.KeyboardEvent) {
    if (e.key === "ArrowDown") setSelected(s => Math.min(s + 1, results.length - 1))
    else if (e.key === "ArrowUp") setSelected(s => Math.max(s - 1, 0))
    else if (e.key === "Enter" && results[selected]) go(results[selected])
    else if (e.key === "Escape") onClose()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-[15vh] bg-black/40 backdrop-blur-sm" onClick={onClose}>
      <div
        className="w-full max-w-lg mx-4 bg-background rounded-xl shadow-2xl border overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center gap-3 px-4 py-3 border-b">
          <Search size={16} className="text-muted-foreground shrink-0" />
          <input
            ref={inputRef}
            value={query}
            onChange={e => setQuery(e.target.value)}
            onKeyDown={onKey}
            placeholder="Buscar contatos, empresas, atendimentos, propostas…"
            className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
          />
          {loading && <div className="h-4 w-4 border-2 border-primary border-t-transparent rounded-full animate-spin shrink-0" />}
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
            <X size={14} />
          </button>
        </div>

        {results.length > 0 && (
          <div className="max-h-80 overflow-y-auto py-1">
            {results.map((r, i) => {
              const Icon = TYPE_ICONS[r.type]
              return (
                <div
                  key={r.id + r.type}
                  className={cn(
                    "flex items-center gap-3 px-4 py-2.5 cursor-pointer",
                    i === selected ? "bg-accent" : "hover:bg-muted/50"
                  )}
                  onClick={() => go(r)}
                  onMouseEnter={() => setSelected(i)}
                >
                  <div className="h-7 w-7 rounded-md bg-muted flex items-center justify-center shrink-0">
                    <Icon size={14} className="text-muted-foreground" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{r.label}</p>
                    {r.sublabel && <p className="text-xs text-muted-foreground truncate">{r.sublabel}</p>}
                  </div>
                  <span className="text-[10px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
                    {TYPE_LABELS[r.type]}
                  </span>
                </div>
              )
            })}
          </div>
        )}

        {query.length >= 2 && !loading && results.length === 0 && (
          <div className="py-8 text-center text-sm text-muted-foreground">
            Nenhum resultado para "{query}"
          </div>
        )}

        {query.length < 2 && (
          <div className="px-4 py-3 text-xs text-muted-foreground flex items-center justify-between">
            <span>Digite para buscar</span>
            <span className="flex gap-1.5">
              <kbd className="px-1.5 py-0.5 rounded border text-[10px]">↑↓</kbd> navegar
              <kbd className="px-1.5 py-0.5 rounded border text-[10px]">↵</kbd> abrir
              <kbd className="px-1.5 py-0.5 rounded border text-[10px]">Esc</kbd> fechar
            </span>
          </div>
        )}
      </div>
    </div>
  )
}
