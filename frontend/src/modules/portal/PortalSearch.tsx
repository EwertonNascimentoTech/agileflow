import { useEffect, useMemo, useRef, useState } from "react"
import { useNavigate } from "react-router-dom"
import { FolderKanban, Layers, Search } from "lucide-react"

import type { PortalPortfolio } from "@/api/portalPortfolio"
import { loadPortfolio, usePortalBase } from "@/modules/portal/portfolioMeta"

function norm(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase()
}

type Hit = { kind: "programa" | "projeto"; id: string; title: string; hint: string | null; href: string }

/** Busca de programas e projetos que o cliente acompanha. */
export function PortalSearch() {
  const base = usePortalBase()
  const navigate = useNavigate()
  const [q, setQ] = useState("")
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(0)
  const [data, setData] = useState<PortalPortfolio | null>(null)
  const boxRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open || data) return
    loadPortfolio().then(setData).catch(() => setData(null))
  }, [open, data])

  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener("mousedown", onDoc)
    return () => document.removeEventListener("mousedown", onDoc)
  }, [])

  const hits = useMemo<Hit[]>(() => {
    const term = norm(q.trim())
    if (!data || term.length < 2) return []
    const programs: Hit[] = data.programs
      .filter((p) => norm(`${p.name} ${p.description ?? ""}`).includes(term))
      .map((p) => ({ kind: "programa", id: p.id, title: p.name, hint: `${p.project_count} projeto(s)`, href: `${base}/programas/${p.id}` }))
    const projects: Hit[] = data.projects
      .filter((p) => norm(`${p.title} ${p.subtitle ?? ""} ${p.program_name ?? ""}`).includes(term))
      .map((p) => ({ kind: "projeto", id: p.task_id, title: p.title, hint: p.program_name ?? p.subtitle, href: `${base}/projetos/${p.task_id}` }))
    return [...programs, ...projects].slice(0, 10)
  }, [data, q, base])

  function go(hit: Hit | undefined) {
    if (!hit) return
    setOpen(false)
    setQ("")
    navigate(hit.href)
  }

  return (
    <div ref={boxRef} className="relative w-full max-w-md">
      <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
      <input
        type="search"
        value={q}
        onChange={(e) => { setQ(e.target.value); setOpen(true); setActive(0) }}
        onFocus={() => setOpen(true)}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown") { e.preventDefault(); setActive((a) => Math.min(a + 1, hits.length - 1)) }
          else if (e.key === "ArrowUp") { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)) }
          else if (e.key === "Enter") { e.preventDefault(); go(hits[active]) }
          else if (e.key === "Escape") setOpen(false)
        }}
        placeholder="Buscar projeto ou programa…"
        aria-label="Buscar projeto ou programa"
        className="h-10 w-full rounded-lg border bg-background pl-9 pr-3 text-sm outline-none ring-offset-background placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring"
      />
      {open && q.trim().length >= 2 && (
        <div className="absolute left-0 right-0 top-full z-50 mt-1 overflow-hidden rounded-lg border bg-popover text-popover-foreground shadow-lg">
          {!data ? (
            <p className="px-3 py-2.5 text-sm text-muted-foreground">Carregando…</p>
          ) : hits.length === 0 ? (
            <p className="px-3 py-2.5 text-sm text-muted-foreground">Nada encontrado.</p>
          ) : (
            <ul role="listbox">
              {hits.map((h, i) => {
                const Icon = h.kind === "programa" ? Layers : FolderKanban
                return (
                  <li key={`${h.kind}-${h.id}`} role="option" aria-selected={i === active}>
                    <button
                      type="button"
                      onMouseEnter={() => setActive(i)}
                      onClick={() => go(h)}
                      className={`flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm ${i === active ? "bg-muted" : ""}`}
                    >
                      <Icon size={15} className="shrink-0 text-muted-foreground" />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-medium">{h.title}</span>
                        {h.hint && <span className="block truncate text-xs text-muted-foreground">{h.hint}</span>}
                      </span>
                      <span className="shrink-0 text-[11px] uppercase tracking-wide text-muted-foreground">{h.kind}</span>
                    </button>
                  </li>
                )
              })}
            </ul>
          )}
        </div>
      )}
    </div>
  )
}
