import { useEffect, useState, type ReactNode } from "react"
import { ArrowRight, Loader2, ListPlus, ListX, Pencil } from "lucide-react"

import { produtosApi, type ProcessItem, type ProcessItemStatus, type ProcessVersionSummary } from "@/api/produtos"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { PROCESS_ITEM_STATUS_LABEL } from "@/modules/produtos/constants"

// Campos comparados na detecção de "modificado".
const COMPARED: { key: keyof ProcessItem; label: string }[] = [
  { key: "name", label: "Nome" },
  { key: "description", label: "Descrição" },
  { key: "diretoria", label: "Diretoria" },
  { key: "nivel", label: "Nível" },
  { key: "analista_nome", label: "Analista" },
  { key: "dono_nome", label: "Dono" },
  { key: "area", label: "Área" },
  { key: "status_item", label: "Status" },
  { key: "criticidade", label: "Criticidade" },
  { key: "passagem_para_ti", label: "Passagem para TI" },
  { key: "vigencia_inicio", label: "Vigência início" },
  { key: "vigencia_fim", label: "Vigência fim" },
  { key: "nivel_maturidade", label: "Maturidade" },
]

interface FieldChange { label: string; from: string; to: string }
interface ModifiedItem { name: string; changes: FieldChange[] }

function flatten(items: ProcessItem[]): Map<string, ProcessItem> {
  const map = new Map<string, ProcessItem>()
  const walk = (list: ProcessItem[]) => {
    for (const it of list) { map.set(it.lineage_id, it); if (it.children?.length) walk(it.children) }
  }
  walk(items)
  return map
}

function fmt(v: unknown, key?: keyof ProcessItem): string {
  if (v === null || v === undefined || v === "") return "—"
  if (typeof v === "boolean") return v ? "Sim" : "Não"
  if (key === "status_item" && typeof v === "string") {
    return PROCESS_ITEM_STATUS_LABEL[v as ProcessItemStatus] ?? v
  }
  return String(v)
}

export default function ProcessPortfolioVersionDiffDialog({
  versions,
  onClose,
}: {
  versions: ProcessVersionSummary[]
  onClose: () => void
}) {
  const sorted = [...versions].sort((a, b) => b.version - a.version)
  const [fromId, setFromId] = useState(sorted[1]?.id ?? sorted[0]?.id ?? "")
  const [toId, setToId] = useState(sorted[0]?.id ?? "")
  const [loading, setLoading] = useState(false)
  const [added, setAdded] = useState<ProcessItem[]>([])
  const [removed, setRemoved] = useState<ProcessItem[]>([])
  const [modified, setModified] = useState<ModifiedItem[]>([])

  useEffect(() => {
    if (!fromId || !toId || fromId === toId) { setAdded([]); setRemoved([]); setModified([]); return }
    let active = true
    setLoading(true)
    Promise.all([produtosApi.getVersionTree(fromId), produtosApi.getVersionTree(toId)])
      .then(([from, to]) => {
        if (!active) return
        const fromMap = flatten(from.items)
        const toMap = flatten(to.items)
        const add: ProcessItem[] = []
        const mod: ModifiedItem[] = []
        for (const [lineage, item] of toMap) {
          const prev = fromMap.get(lineage)
          if (!prev) { add.push(item); continue }
          const changes: FieldChange[] = []
          for (const c of COMPARED) {
            if (fmt(prev[c.key], c.key) !== fmt(item[c.key], c.key)) {
              changes.push({ label: c.label, from: fmt(prev[c.key], c.key), to: fmt(item[c.key], c.key) })
            }
          }
          if (changes.length) mod.push({ name: item.name, changes })
        }
        const rem: ProcessItem[] = []
        for (const [lineage, item] of fromMap) if (!toMap.has(lineage)) rem.push(item)
        setAdded(add); setModified(mod); setRemoved(rem)
      })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [fromId, toId])

  const total = added.length + removed.length + modified.length

  return (
    <Dialog open onOpenChange={(v) => { if (!v) onClose() }}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader><DialogTitle>Comparar versões</DialogTitle></DialogHeader>

        <div className="flex items-center gap-2">
          <VersionSelect value={fromId} onChange={setFromId} versions={sorted} />
          <ArrowRight size={16} className="shrink-0 text-muted-foreground" />
          <VersionSelect value={toId} onChange={setToId} versions={sorted} />
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-10"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
        ) : fromId === toId ? (
          <p className="py-8 text-center text-sm text-muted-foreground">Selecione duas versões diferentes.</p>
        ) : total === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">Nenhuma diferença entre as versões.</p>
        ) : (
          <div className="space-y-4">
            {added.length > 0 && (
              <Section icon={<ListPlus size={15} className="text-emerald-600" />} title="Adicionados" count={added.length}>
                {added.map((i) => <li key={i.lineage_id} className="text-sm">{i.name}</li>)}
              </Section>
            )}
            {removed.length > 0 && (
              <Section icon={<ListX size={15} className="text-destructive" />} title="Removidos" count={removed.length}>
                {removed.map((i) => <li key={i.lineage_id} className="text-sm line-through text-muted-foreground">{i.name}</li>)}
              </Section>
            )}
            {modified.length > 0 && (
              <Section icon={<Pencil size={15} className="text-amber-600" />} title="Modificados" count={modified.length}>
                {modified.map((m, idx) => (
                  <li key={idx} className="space-y-1 rounded-md border p-2">
                    <p className="text-sm font-medium">{m.name}</p>
                    <ul className="space-y-0.5">
                      {m.changes.map((c, ci) => (
                        <li key={ci} className="text-[12px] text-muted-foreground">
                          <span className="font-medium text-foreground">{c.label}:</span> {c.from} <ArrowRight size={10} className="inline" /> {c.to}
                        </li>
                      ))}
                    </ul>
                  </li>
                ))}
              </Section>
            )}
          </div>
        )}

        <div className="flex justify-end pt-2"><Button variant="outline" onClick={onClose}>Fechar</Button></div>
      </DialogContent>
    </Dialog>
  )
}

function VersionSelect({ value, onChange, versions }: { value: string; onChange: (v: string) => void; versions: ProcessVersionSummary[] }) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger className="flex-1"><SelectValue /></SelectTrigger>
      <SelectContent>
        {versions.map((v) => (
          <SelectItem key={v.id} value={v.id}>v{v.version} · {v.status}</SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}

function Section({ icon, title, count, children }: { icon: ReactNode; title: string; count: number; children: ReactNode }) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-1.5">{icon}<span className="text-sm font-semibold">{title}</span><Badge variant="outline" className="text-[10px]">{count}</Badge></div>
      <ul className="space-y-1 pl-1">{children}</ul>
    </div>
  )
}
