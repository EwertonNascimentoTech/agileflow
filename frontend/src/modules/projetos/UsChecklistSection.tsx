import { useEffect, useState } from "react"
import { Loader2, Plus, Trash2 } from "lucide-react"

import type { UsChecklistItem } from "@/api/projetos"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { percentFromUsChecklist } from "@/modules/projetos/kanbanDisplay"

const EMPTY_CHECKLIST: UsChecklistItem[] = []

function checklistSignature(items: UsChecklistItem[]): string {
  return JSON.stringify(items.map((it) => [it.id, it.label, it.done, it.order]))
}

function newItem(label: string, order: number): UsChecklistItem {
  return { id: crypto.randomUUID(), label: label.trim(), done: false, order }
}

export function UsChecklistSection({
  items,
  percentComplete,
  readOnly,
  saving,
  onSave,
}: {
  items: UsChecklistItem[]
  percentComplete: number
  readOnly: boolean
  saving: boolean
  onSave: (next: UsChecklistItem[]) => Promise<void>
}) {
  const [local, setLocal] = useState<UsChecklistItem[]>(items)
  const [draft, setDraft] = useState("")

  useEffect(() => {
    setLocal((prev) => {
      const prevSig = checklistSignature(prev)
      const nextSig = checklistSignature(items)
      return prevSig === nextSig ? prev : items
    })
  }, [items])

  const pct = local.length > 0 ? percentFromUsChecklist(local) : percentComplete

  async function persist(next: UsChecklistItem[]) {
    const ordered = next.map((it, i) => ({ ...it, order: i }))
    setLocal(ordered)
    try {
      await onSave(ordered)
    } catch {
      setLocal(items.length > 0 ? items : EMPTY_CHECKLIST)
    }
  }

  async function toggle(id: string) {
    if (readOnly || saving) return
    const next = local.map((it) => (it.id === id ? { ...it, done: !it.done } : it))
    await persist(next)
  }

  async function remove(id: string) {
    if (readOnly || saving) return
    await persist(local.filter((it) => it.id !== id))
  }

  async function addItem() {
    const label = draft.trim()
    if (!label || readOnly || saving) return
    setDraft("")
    await persist([...local, newItem(label, local.length)])
  }

  return (
    <div className="space-y-3 border-t border-border pt-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className="h-4 w-1 rounded-full bg-primary" />
        <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-primary">
          Checklist de execução
        </p>
        <span className="ml-auto text-xs font-semibold tabular-nums text-primary">{pct}%</span>
      </div>

      <div className="h-1.5 overflow-hidden rounded-full bg-muted">
        <div
          className="h-full rounded-full bg-primary transition-all duration-300"
          style={{ width: `${Math.max(0, Math.min(100, pct))}%` }}
        />
      </div>

      {local.length === 0 ? (
        <p className="text-xs italic text-muted-foreground">
          Adicione itens para acompanhar o progresso desta User Story.
        </p>
      ) : (
        <ul className="space-y-1.5">
          {local.map((item) => (
            <li
              key={item.id}
              className="flex items-start gap-2 rounded-md border border-border/70 bg-muted/20 px-2 py-1.5"
            >
              <input
                type="checkbox"
                checked={item.done}
                disabled={readOnly || saving}
                onChange={() => void toggle(item.id)}
                className="mt-0.5 h-4 w-4 shrink-0 cursor-pointer rounded border-border accent-primary disabled:cursor-not-allowed"
              />
              <span
                className={`min-w-0 flex-1 text-sm leading-snug ${
                  item.done ? "text-muted-foreground line-through" : "text-foreground"
                }`}
              >
                {item.label}
              </span>
              {!readOnly && (
                <button
                  type="button"
                  disabled={saving}
                  onClick={() => void remove(item.id)}
                  className="shrink-0 rounded p-1 text-muted-foreground hover:bg-muted hover:text-destructive disabled:opacity-50"
                  title="Remover item"
                >
                  <Trash2 size={14} />
                </button>
              )}
            </li>
          ))}
        </ul>
      )}

      {!readOnly && (
        <div className="flex gap-2">
          <Input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="Novo item do checklist…"
            disabled={saving}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault()
                void addItem()
              }
            }}
            className="h-9 text-sm"
          />
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="h-9 shrink-0 gap-1"
            disabled={saving || !draft.trim()}
            onClick={() => void addItem()}
          >
            {saving ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
            Adicionar
          </Button>
        </div>
      )}
    </div>
  )
}

/** Barra compacta de progresso (kanban / lista). */
export function UsCardProgressBar({
  percent,
  label = "Execução",
}: {
  percent: number
  label?: string
}) {
  const pct = Math.max(0, Math.min(100, percent))
  return (
    <div className="w-full" style={{ marginTop: 6 }}>
      <div
        className="flex justify-between tabular-nums"
        style={{ fontSize: 10, color: "var(--af-muted-fg, #6b7280)", marginBottom: 2 }}
      >
        <span>{label}</span>
        <span>{pct}%</span>
      </div>
      <div style={{ height: 4, borderRadius: 2, background: "#e5e7eb", overflow: "hidden" }}>
        <div
          style={{
            width: `${pct}%`,
            height: "100%",
            background: "var(--af-primary, #2563eb)",
            transition: "width 0.2s ease",
          }}
        />
      </div>
    </div>
  )
}
