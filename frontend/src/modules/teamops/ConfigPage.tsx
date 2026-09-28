import { useEffect, useState } from "react"
import {
  Briefcase, Building2, CalendarClock, CalendarDays, CalendarOff, Clock, KeyRound, Layers, Loader2, Pencil, Plus,
  Settings2, Trash2,
} from "lucide-react"
import { PositionAccessDialog } from "@/modules/teamops/PositionAccessDialog"
import { toast } from "@/lib/toast"
import { nullableStr } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { EmptyState } from "@/components/EmptyState"
import { DetailTabs, PageHeader, Pill, SectionCard, TABLE, type TabDef, type Tone } from "@/components/ds"
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select"
import {
  teamopsApi,
  AREA_TYPE_LABELS,
  AREA_STATUS_LABELS,
  type AbsenceType,
  type Area,
  type AreaStatus,
  type AreaType,
  type Holiday,
  type Position,
  type StackCategory,
  type WorkCalendar,
} from "@/api/teamops"

const NONE = "__none__"

type ConfigTab = "areas" | "positions" | "categories" | "absence-types" | "calendar"

const TABS: TabDef<ConfigTab>[] = [
  { value: "areas", label: "Áreas", icon: Building2 },
  { value: "positions", label: "Cargos", icon: Briefcase },
  { value: "categories", label: "Categorias de stack", icon: Layers },
  { value: "absence-types", label: "Tipos de ausência", icon: CalendarOff },
  { value: "calendar", label: "Calendário de trabalho", icon: CalendarClock },
]

// Selos (Pill do design system do Portal) — mesmas cores dos antigos Badges.
const AREA_STATUS_TONE: Record<AreaStatus, Tone> = { ativa: "emerald", inativa: "red", reestruturacao: "amber" }

/** Botão de "novo" no cabeçalho dos cartões de catálogo. */
function NewButton({ onClick, children }: { onClick: () => void; children: string }) {
  return (
    <Button className="h-9 gap-1.5" onClick={onClick}>
      <Plus size={15} /> {children}
    </Button>
  )
}

export default function ConfigPage() {
  const [tab, setTab] = useState<ConfigTab>("areas")
  return (
    <div className="space-y-5 p-4">
      <PageHeader
        icon={Settings2}
        color="#0891B2"
        title="Configurações"
        description="Catálogos do módulo: áreas, cargos, categorias de stack, tipos de ausência e o calendário de trabalho usado pelo cronograma."
      />

      <DetailTabs tabs={TABS} value={tab} onChange={setTab} />

      {tab === "areas" && <AreasTab />}
      {tab === "positions" && <PositionsTab />}
      {tab === "categories" && <CategoriesTab />}
      {tab === "absence-types" && <AbsenceTypesTab />}
      {tab === "calendar" && <WorkCalendarTab />}
    </div>
  )
}

// ─────────────────────────────────────────────
// ÁREAS
// ─────────────────────────────────────────────

function buildAreaTree(areas: Area[]): Array<{ area: Area; depth: number }> {
  const byParent = new Map<string | null, Area[]>()
  for (const a of areas) {
    const key = a.parent_area_id ?? null
    const list = byParent.get(key) ?? []
    list.push(a)
    byParent.set(key, list)
  }
  // ordena cada nível por nome
  for (const list of byParent.values()) list.sort((a, b) => a.name.localeCompare(b.name))
  const out: Array<{ area: Area; depth: number }> = []
  const visit = (parent: string | null, depth: number) => {
    for (const a of byParent.get(parent) ?? []) {
      out.push({ area: a, depth })
      visit(a.id, depth + 1)
    }
  }
  visit(null, 0)
  // Áreas órfãs (parent_area_id aponta para uma área inexistente) — adiciona ao fim
  const seen = new Set(out.map((x) => x.area.id))
  for (const a of areas) {
    if (!seen.has(a.id)) out.push({ area: a, depth: 0 })
  }
  return out
}

function AreasTab() {
  const [areas, setAreas] = useState<Area[]>([])
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState<Area | null>(null)
  const [creating, setCreating] = useState(false)

  async function refresh() {
    setLoading(true)
    setAreas(await teamopsApi.listAreas())
    setLoading(false)
  }
  useEffect(() => { refresh() }, [])

  if (loading) return <Skeleton className="h-64 rounded-2xl" />

  const tree = buildAreaTree(areas)

  return (
    <div className="space-y-3">
      <SectionCard
        title="Áreas"
        icon={Building2}
        subtitle="Áreas e sub-áreas que montam o organograma."
        right={<NewButton onClick={() => setCreating(true)}>Nova área</NewButton>}
        flush
      >
        {areas.length === 0 ? (
          <EmptyState icon={Building2} title="Nenhuma área cadastrada." compact />
        ) : (
          <div className={TABLE.wrap}>
            <table className={`${TABLE.table} min-w-[720px]`}>
              <thead className={TABLE.thead}>
                <tr>
                  <th className={TABLE.thFirst}>Área</th>
                  <th className={TABLE.th}>Tipo</th>
                  <th className={`${TABLE.th} text-center`}>Sub-áreas</th>
                  <th className={`${TABLE.th} text-center`}>Pessoas</th>
                  <th className={TABLE.th}>Status</th>
                  <th className={TABLE.th}><span className="sr-only">Ações</span></th>
                </tr>
              </thead>
              <tbody>
                {tree.map(({ area: a, depth }) => (
                  <tr key={a.id} className={TABLE.tr}>
                    <td className={`${TABLE.tdFirst} font-medium`}>
                      <span style={{ paddingLeft: depth * 18 }} className="inline-flex items-center gap-1">
                        {depth > 0 && <span className="text-muted-foreground">↳</span>}
                        {a.name}
                      </span>
                    </td>
                    <td className={`${TABLE.td} text-muted-foreground`}>{AREA_TYPE_LABELS[a.area_type]}</td>
                    <td className={`${TABLE.td} text-center tabular-nums`}>
                      {a.subarea_count > 0 ? a.subarea_count : <span className="text-muted-foreground">—</span>}
                    </td>
                    <td className={`${TABLE.td} text-center tabular-nums`}>{a.person_count}</td>
                    <td className={TABLE.td}>
                      <Pill tone={AREA_STATUS_TONE[a.status]} dot>{AREA_STATUS_LABELS[a.status]}</Pill>
                    </td>
                    <td className={`${TABLE.td} text-right`}>
                      <Button variant="ghost" size="sm" onClick={() => setEditing(a)} title="Editar área" aria-label={`Editar ${a.name}`}>
                        <Pencil className="h-4 w-4" />
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </SectionCard>

      {(creating || editing) && (
        <AreaDialog
          area={editing}
          allAreas={areas}
          onClose={() => { setCreating(false); setEditing(null) }}
          onSaved={() => { setCreating(false); setEditing(null); refresh() }}
        />
      )}
    </div>
  )
}

function descendantIds(areas: Area[], rootId: string): Set<string> {
  const childrenByParent = new Map<string, Area[]>()
  for (const a of areas) {
    if (!a.parent_area_id) continue
    const list = childrenByParent.get(a.parent_area_id) ?? []
    list.push(a)
    childrenByParent.set(a.parent_area_id, list)
  }
  const result = new Set<string>()
  const queue = [rootId]
  while (queue.length) {
    const id = queue.shift()!
    for (const c of childrenByParent.get(id) ?? []) {
      if (!result.has(c.id)) {
        result.add(c.id)
        queue.push(c.id)
      }
    }
  }
  return result
}

function AreaDialog({
  area, allAreas, onClose, onSaved,
}: {
  area: Area | null
  allAreas: Area[]
  onClose: () => void
  onSaved: () => void
}) {
  const isEdit = !!area
  const [name, setName] = useState(area?.name ?? "")
  const [description, setDescription] = useState(area?.description ?? "")
  const [parentId, setParentId] = useState<string>(area?.parent_area_id ?? NONE)
  const [areaType, setAreaType] = useState<AreaType>(area?.area_type ?? "negocio")
  const [status, setStatus] = useState<AreaStatus>(area?.status ?? "ativa")
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Áreas inválidas como pai: a própria e seus descendentes (evita ciclo no UI antes do backend validar).
  const blockedIds = isEdit ? descendantIds(allAreas, area!.id).add(area!.id) : new Set<string>()
  const parentOptions = allAreas.filter((a) => !blockedIds.has(a.id))

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setError(null)
    try {
      const payload: any = {
        name,
        description: description || null,
        parent_area_id: parentId === NONE ? null : parentId,
        area_type: areaType,
        status,
      }
      if (isEdit) await teamopsApi.updateArea(area!.id, payload)
      else await teamopsApi.createArea(payload)
      onSaved()
    } catch (err: any) {
      setError(err?.response?.data?.detail ?? "Erro ao salvar.")
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-2xl">
        <DialogHeader><DialogTitle>{isEdit ? "Editar área" : "Nova área"}</DialogTitle></DialogHeader>
        <form onSubmit={handleSubmit} className="grid gap-4 md:grid-cols-2">
          <div className="md:col-span-2">
            <Label>Nome *</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} required minLength={2} />
          </div>
          <div className="md:col-span-2">
            <Label>Descrição</Label>
            <Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} />
          </div>
          <div className="md:col-span-2">
            <Label>Área pai</Label>
            <Select value={parentId} onValueChange={setParentId}>
              <SelectTrigger><SelectValue placeholder="(opcional — área raiz)" /></SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE}>Sem área pai (raiz)</SelectItem>
                {parentOptions.map((a) => (
                  <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="mt-1 text-xs text-muted-foreground">
              Defina uma área pai para criar sub-áreas (ex: Educação → Educação Básica).
            </p>
          </div>
          <div>
            <Label>Tipo</Label>
            <Select value={areaType} onValueChange={(v) => setAreaType(v as AreaType)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {Object.entries(AREA_TYPE_LABELS).map(([v, l]) => (
                  <SelectItem key={v} value={v}>{l}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Status</Label>
            <Select value={status} onValueChange={(v) => setStatus(v as AreaStatus)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {Object.entries(AREA_STATUS_LABELS).map(([v, l]) => (
                  <SelectItem key={v} value={v}>{l}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {error && (
            <p className="md:col-span-2 rounded-md bg-destructive/10 p-3 text-sm text-destructive">
              {error}
            </p>
          )}
          <DialogFooter className="md:col-span-2 justify-between sm:justify-between">
            {isEdit && (
              <Button
                type="button" variant="ghost"
                onClick={async () => {
                  if (!confirm("Remover esta área?")) return
                  await teamopsApi.deleteArea(area!.id)
                  onSaved()
                }}
              >
                <Trash2 className="mr-2 h-4 w-4" /> Excluir
              </Button>
            )}
            <div className="flex gap-2">
              <Button type="button" variant="outline" onClick={onClose}>Cancelar</Button>
              <Button type="submit" disabled={saving}>{saving ? "Salvando…" : "Salvar"}</Button>
            </div>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

// ─────────────────────────────────────────────
// POSITIONS (cargos)
// ─────────────────────────────────────────────

function PositionsTab() {
  const [items, setItems] = useState<Position[]>([])
  const [loading, setLoading] = useState(true)
  const [creating, setCreating] = useState(false)
  const [editing, setEditing] = useState<Position | null>(null)
  const [accessPos, setAccessPos] = useState<Position | null>(null)
  const [confirmDelete, setConfirmDelete] = useState<Position | null>(null)
  const [deleting, setDeleting] = useState(false)

  async function refresh() {
    setLoading(true)
    setItems(await teamopsApi.listPositions())
    setLoading(false)
  }
  useEffect(() => { refresh() }, [])

  async function performDelete() {
    if (!confirmDelete) return
    setDeleting(true)
    try {
      await teamopsApi.deletePosition(confirmDelete.id)
      toast.success(`Cargo "${confirmDelete.name}" excluído.`)
      setConfirmDelete(null)
      await refresh()
    } catch (err: any) {
      toast.error(err?.response?.data?.detail ?? "Erro ao excluir o cargo.")
    } finally {
      setDeleting(false)
    }
  }

  if (loading) return <Skeleton className="h-64 rounded-2xl" />

  return (
    <div className="space-y-3">
      <SectionCard
        title="Cargos"
        icon={Briefcase}
        subtitle="Quem tem o cargo (com acesso ao sistema) herda as permissões definidas em Acesso."
        right={<NewButton onClick={() => setCreating(true)}>Novo cargo</NewButton>}
        flush
      >
        {items.length === 0 ? (
          <EmptyState icon={Briefcase} title="Nenhum cargo cadastrado." compact />
        ) : (
          <div className={TABLE.wrap}>
            <table className={`${TABLE.table} min-w-[760px]`}>
              <thead className={TABLE.thead}>
                <tr>
                  <th className={TABLE.thFirst}>Nome</th>
                  <th className={TABLE.th}>Slug</th>
                  <th className={TABLE.th}>Origem</th>
                  <th className={`${TABLE.th} text-center`}>Pessoas</th>
                  <th className={TABLE.th}>Status</th>
                  <th className={TABLE.th}><span className="sr-only">Ações</span></th>
                </tr>
              </thead>
              <tbody>
                {items.map((p) => (
                  <tr key={p.id} className={TABLE.tr}>
                    <td className={`${TABLE.tdFirst} font-medium`}>{p.name}</td>
                    <td className={`${TABLE.td} text-muted-foreground`}>{p.slug}</td>
                    <td className={TABLE.td}>
                      {p.is_system
                        ? <Pill tone="blue">Sistema</Pill>
                        : <Pill tone="slate">Custom</Pill>}
                    </td>
                    <td className={`${TABLE.td} text-center tabular-nums`}>{p.person_count}</td>
                    <td className={TABLE.td}>
                      {p.is_active ? <Pill tone="emerald" dot>Ativo</Pill> : <Pill tone="slate" dot>Inativo</Pill>}
                    </td>
                    <td className={`${TABLE.td} whitespace-nowrap text-right`}>
                      <Button variant="ghost" size="sm" className="gap-1.5" onClick={() => setAccessPos(p)} title="Acesso do cargo">
                        <KeyRound className="h-4 w-4" /> Acesso
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => setEditing(p)} title="Editar cargo">
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                        disabled={p.person_count > 0}
                        title={
                          p.person_count > 0
                            ? "Cargo vinculado a pessoas. Mova-as para outro cargo antes de excluir."
                            : "Excluir cargo"
                        }
                        onClick={() => setConfirmDelete(p)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </SectionCard>

      {(creating || editing) && (
        <PositionDialog
          item={editing}
          onClose={() => { setCreating(false); setEditing(null) }}
          onSaved={() => { setCreating(false); setEditing(null); refresh() }}
        />
      )}
      {accessPos && (
        <PositionAccessDialog
          position={accessPos}
          onClose={() => setAccessPos(null)}
          onSaved={() => { setAccessPos(null); refresh() }}
        />
      )}
      {confirmDelete && (
        <Dialog open onOpenChange={(o) => { if (!o && !deleting) setConfirmDelete(null) }}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Excluir cargo</DialogTitle>
            </DialogHeader>
            <p className="text-sm text-muted-foreground">
              Tem certeza que deseja excluir o cargo{" "}
              <strong className="text-foreground">{confirmDelete.name}</strong>? Esta ação não pode ser desfeita.
            </p>
            <DialogFooter className="gap-2">
              <Button variant="outline" onClick={() => setConfirmDelete(null)} disabled={deleting}>
                Cancelar
              </Button>
              <Button variant="destructive" onClick={() => void performDelete()} disabled={deleting}>
                {deleting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Excluir
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </div>
  )
}

function PositionDialog({
  item, onClose, onSaved,
}: { item: Position | null; onClose: () => void; onSaved: () => void }) {
  const isEdit = !!item
  const [name, setName] = useState(item?.name ?? "")
  const [slug, setSlug] = useState(item?.slug ?? "")
  const [description, setDescription] = useState(item?.description ?? "")
  const [sortOrder, setSortOrder] = useState<string>(String(item?.sort_order ?? 200))
  const [active, setActive] = useState(item?.is_active ?? true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setError(null)
    try {
      if (isEdit) {
        await teamopsApi.updatePosition(item!.id, {
          name,
          description: description || null,
          sort_order: Number(sortOrder),
          is_active: active,
        } as any)
      } else {
        await teamopsApi.createPosition({
          name,
          slug: slug || undefined,
          description: description || null,
          sort_order: Number(sortOrder),
          is_active: active,
        })
      }
      onSaved()
    } catch (err: any) {
      setError(err?.response?.data?.detail ?? "Erro ao salvar.")
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent>
        <DialogHeader><DialogTitle>{isEdit ? "Editar cargo" : "Novo cargo"}</DialogTitle></DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <Label>Nome *</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} required minLength={2} />
          </div>
          {!isEdit && (
            <div>
              <Label>Slug</Label>
              <Input
                value={slug}
                onChange={(e) => setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, "_"))}
                placeholder="(gerado a partir do nome)"
              />
              <p className="mt-1 text-xs text-muted-foreground">
                Identificador estável usado por regras internas. Não pode ser alterado depois.
              </p>
            </div>
          )}
          {isEdit && (
            <div>
              <Label>Slug</Label>
              <Input value={item!.slug} disabled />
              {item!.is_system && (
                <p className="mt-1 text-xs text-muted-foreground">
                  Este é um cargo de sistema — você pode renomear ou desativar, mas não excluir.
                </p>
              )}
            </div>
          )}
          <div>
            <Label>Descrição</Label>
            <Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} />
          </div>
          <div>
            <Label>Ordem</Label>
            <Input type="number" min={0} value={sortOrder} onChange={(e) => setSortOrder(e.target.value)} />
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} />
            Ativo
          </label>
          {error && <p className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">{error}</p>}
          <DialogFooter className="justify-between sm:justify-between">
            {isEdit && (
              <Button
                type="button" variant="ghost"
                className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                onClick={async () => {
                  if (!confirm(`Excluir o cargo "${item!.name}"?`)) return
                  try {
                    await teamopsApi.deletePosition(item!.id)
                    onSaved()
                  } catch (err: any) {
                    setError(err?.response?.data?.detail ?? "Erro ao excluir.")
                  }
                }}
              >
                <Trash2 className="mr-2 h-4 w-4" /> Excluir
              </Button>
            )}
            <div className="flex gap-2 ml-auto">
              <Button type="button" variant="outline" onClick={onClose}>Cancelar</Button>
              <Button type="submit" disabled={saving}>{saving ? "Salvando…" : "Salvar"}</Button>
            </div>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

// ─────────────────────────────────────────────
// CATEGORIES
// ─────────────────────────────────────────────

function CategoriesTab() {
  const [items, setItems] = useState<StackCategory[]>([])
  const [loading, setLoading] = useState(true)
  const [creating, setCreating] = useState(false)
  const [editing, setEditing] = useState<StackCategory | null>(null)

  async function refresh() {
    setLoading(true)
    setItems(await teamopsApi.listStackCategories())
    setLoading(false)
  }
  useEffect(() => { refresh() }, [])

  return (
    <div className="space-y-3">
      <SectionCard
        title="Categorias de stack"
        icon={Layers}
        subtitle="Agrupam as stacks do catálogo e do mapa de competências."
        right={<NewButton onClick={() => setCreating(true)}>Nova categoria</NewButton>}
        flush
      >
        {loading ? <div className="p-5"><Skeleton className="h-48 rounded-xl" /></div> : items.length === 0 ? (
          <EmptyState icon={Layers} title="Nenhuma categoria." compact />
        ) : (
          <ul className="divide-y">
            {items.map((c) => (
              <li key={c.id} className="flex items-center justify-between gap-3 px-5 py-3 transition-colors hover:bg-muted/40">
                <div className="min-w-0">
                  <p className="font-medium">{c.name}</p>
                  <p className="text-xs text-muted-foreground">Ordem: {c.order}</p>
                </div>
                <div className="flex items-center gap-2">
                  {c.is_active ? <Pill tone="emerald" dot>Ativa</Pill> : <Pill tone="slate" dot>Inativa</Pill>}
                  <Button variant="ghost" size="sm" onClick={() => setEditing(c)} title="Editar categoria" aria-label={`Editar ${c.name}`}>
                    <Pencil className="h-4 w-4" />
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </SectionCard>
      {(creating || editing) && (
        <SimpleDialog
          title={editing ? "Editar categoria" : "Nova categoria"}
          initialName={editing?.name ?? ""}
          initialActive={editing?.is_active ?? true}
          showOrder
          initialOrder={editing?.order ?? 0}
          onClose={() => { setCreating(false); setEditing(null) }}
          onSave={async (vals) => {
            const payload = { name: vals.name, order: vals.order, is_active: vals.is_active }
            if (editing) await teamopsApi.updateStackCategory(editing.id, payload as any)
            else await teamopsApi.createStackCategory(payload as any)
            setCreating(false); setEditing(null); refresh()
          }}
          onDelete={editing ? async () => {
            if (!confirm("Remover esta categoria? Todas as stacks dela serão removidas.")) return
            await teamopsApi.deleteStackCategory(editing.id)
            setEditing(null); refresh()
          } : undefined}
        />
      )}
    </div>
  )
}

// ─────────────────────────────────────────────
// ABSENCE TYPES
// ─────────────────────────────────────────────

function AbsenceTypesTab() {
  const [items, setItems] = useState<AbsenceType[]>([])
  const [loading, setLoading] = useState(true)
  const [creating, setCreating] = useState(false)
  const [editing, setEditing] = useState<AbsenceType | null>(null)

  async function refresh() {
    setLoading(true)
    setItems(await teamopsApi.listAbsenceTypes())
    setLoading(false)
  }
  useEffect(() => { refresh() }, [])

  return (
    <div className="space-y-3">
      <SectionCard
        title="Tipos de ausência"
        icon={CalendarOff}
        subtitle="Se o tipo pede aprovação e se reduz a capacidade do time."
        right={<NewButton onClick={() => setCreating(true)}>Novo tipo</NewButton>}
        flush
      >
        {loading ? <div className="p-5"><Skeleton className="h-48 rounded-xl" /></div> : items.length === 0 ? (
          <EmptyState icon={CalendarOff} title="Nenhum tipo cadastrado." compact />
        ) : (
          <div className={TABLE.wrap}>
            <table className={`${TABLE.table} min-w-[680px]`}>
              <thead className={TABLE.thead}>
                <tr>
                  <th className={TABLE.thFirst}>Nome</th>
                  <th className={TABLE.th}>Slug</th>
                  <th className={TABLE.th}>Aprovação</th>
                  <th className={TABLE.th}>Reduz capacidade</th>
                  <th className={TABLE.th}>Cor</th>
                  <th className={TABLE.th}><span className="sr-only">Ações</span></th>
                </tr>
              </thead>
              <tbody>
                {items.map((t) => (
                  <tr key={t.id} className={TABLE.tr}>
                    <td className={`${TABLE.tdFirst} font-medium`}>{t.name}</td>
                    <td className={`${TABLE.td} text-muted-foreground`}>{t.slug}</td>
                    <td className={TABLE.td}>{t.requires_approval ? "Sim" : "Não"}</td>
                    <td className={TABLE.td}>{t.affects_capacity ? "Sim" : "Não"}</td>
                    <td className={TABLE.td}>
                      <span className="inline-block h-4 w-4 rounded-full border align-middle" style={{ background: t.color }} />
                      <span className="ml-2 text-xs tabular-nums text-muted-foreground">{t.color}</span>
                    </td>
                    <td className={`${TABLE.td} text-right`}>
                      <Button variant="ghost" size="sm" onClick={() => setEditing(t)} title="Editar tipo" aria-label={`Editar ${t.name}`}>
                        <Pencil className="h-4 w-4" />
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </SectionCard>
      {(creating || editing) && (
        <AbsenceTypeDialog
          item={editing}
          onClose={() => { setCreating(false); setEditing(null) }}
          onSaved={() => { setCreating(false); setEditing(null); refresh() }}
        />
      )}
    </div>
  )
}

function AbsenceTypeDialog({
  item, onClose, onSaved,
}: { item: AbsenceType | null; onClose: () => void; onSaved: () => void }) {
  const isEdit = !!item
  const [name, setName] = useState(item?.name ?? "")
  const [slug, setSlug] = useState(item?.slug ?? "")
  const [requiresApproval, setRequiresApproval] = useState(item?.requires_approval ?? true)
  const [affectsCapacity, setAffectsCapacity] = useState(item?.affects_capacity ?? true)
  const [color, setColor] = useState(item?.color ?? "#8B5CF6")
  const [active, setActive] = useState(item?.is_active ?? true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setError(null)
    try {
      const payload: any = isEdit
        ? {
            name,
            slug: nullableStr(slug),
            requires_approval: requiresApproval,
            affects_capacity: affectsCapacity,
            color,
            is_active: active,
          }
        : {
            name,
            slug: slug || undefined,
            requires_approval: requiresApproval,
            affects_capacity: affectsCapacity,
            color,
            is_active: active,
          }
      if (isEdit) await teamopsApi.updateAbsenceType(item!.id, payload)
      else await teamopsApi.createAbsenceType(payload)
      onSaved()
    } catch (err: any) {
      setError(err?.response?.data?.detail ?? "Erro ao salvar.")
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent>
        <DialogHeader><DialogTitle>{isEdit ? "Editar tipo de ausência" : "Novo tipo de ausência"}</DialogTitle></DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <Label>Nome *</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} required minLength={2} />
          </div>
          <div>
            <Label>Slug</Label>
            <Input value={slug} onChange={(e) => setSlug(e.target.value.toLowerCase())} placeholder="(gerado a partir do nome)" />
          </div>
          <div>
            <Label>Cor</Label>
            <Input type="color" value={color} onChange={(e) => setColor(e.target.value)} className="h-10 w-20 p-1" />
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={requiresApproval} onChange={(e) => setRequiresApproval(e.target.checked)} />
            Requer aprovação
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={affectsCapacity} onChange={(e) => setAffectsCapacity(e.target.checked)} />
            Reduz capacidade do time
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} />
            Ativo
          </label>
          {error && <p className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">{error}</p>}
          <DialogFooter className="justify-between sm:justify-between">
            {isEdit && (
              <Button
                type="button" variant="ghost"
                onClick={async () => {
                  if (!confirm("Remover este tipo?")) return
                  await teamopsApi.deleteAbsenceType(item!.id)
                  onSaved()
                }}
              >
                <Trash2 className="mr-2 h-4 w-4" /> Excluir
              </Button>
            )}
            <div className="flex gap-2">
              <Button type="button" variant="outline" onClick={onClose}>Cancelar</Button>
              <Button type="submit" disabled={saving}>{saving ? "Salvando…" : "Salvar"}</Button>
            </div>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

// ─────────────────────────────────────────────
// Helper reutilizável
// ─────────────────────────────────────────────

function SimpleDialog({
  title, initialName, initialDescription = "", initialActive, initialOrder = 0, showOrder = false,
  onClose, onSave, onDelete,
}: {
  title: string
  initialName: string
  initialDescription?: string
  initialActive: boolean
  initialOrder?: number
  showOrder?: boolean
  onClose: () => void
  onSave: (vals: { name: string; description?: string | null; order?: number; is_active: boolean }) => Promise<void>
  onDelete?: () => Promise<void>
}) {
  const [name, setName] = useState(initialName)
  const [description, setDescription] = useState(initialDescription ?? "")
  const [order, setOrder] = useState<string>(String(initialOrder))
  const [active, setActive] = useState(initialActive)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setError(null)
    try {
      await onSave({
        name,
        description: description || null,
        order: showOrder ? Number(order) : undefined,
        is_active: active,
      })
    } catch (err: any) {
      setError(err?.response?.data?.detail ?? "Erro ao salvar.")
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent>
        <DialogHeader><DialogTitle>{title}</DialogTitle></DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <Label>Nome *</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} required minLength={2} />
          </div>
          {!showOrder && (
            <div>
              <Label>Descrição</Label>
              <Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} />
            </div>
          )}
          {showOrder && (
            <div>
              <Label>Ordem</Label>
              <Input type="number" min={0} value={order} onChange={(e) => setOrder(e.target.value)} />
            </div>
          )}
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} />
            Ativo
          </label>
          {error && <p className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">{error}</p>}
          <DialogFooter className="justify-between sm:justify-between">
            {onDelete && (
              <Button type="button" variant="ghost" onClick={onDelete}>
                <Trash2 className="mr-2 h-4 w-4" /> Excluir
              </Button>
            )}
            <div className="flex gap-2">
              <Button type="button" variant="outline" onClick={onClose}>Cancelar</Button>
              <Button type="submit" disabled={saving}>{saving ? "Salvando…" : "Salvar"}</Button>
            </div>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

// ─────────────────────────────────────────────
// CALENDÁRIO DE TRABALHO + FERIADOS
// ─────────────────────────────────────────────

const WEEKDAYS = [
  { v: 0, label: "Seg" }, { v: 1, label: "Ter" }, { v: 2, label: "Qua" },
  { v: 3, label: "Qui" }, { v: 4, label: "Sex" }, { v: 5, label: "Sáb" }, { v: 6, label: "Dom" },
]
const hhmm = (t: string | null) => (t ? t.slice(0, 5) : "")

function WorkCalendarTab() {
  const [cal, setCal] = useState<WorkCalendar | null>(null)
  const [holidays, setHolidays] = useState<Holiday[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [dayStart, setDayStart] = useState("08:00")
  const [dayEnd, setDayEnd] = useState("17:00")
  const [hasLunch, setHasLunch] = useState(true)
  const [lunchStart, setLunchStart] = useState("12:00")
  const [lunchEnd, setLunchEnd] = useState("13:00")
  const [workDays, setWorkDays] = useState<number[]>([0, 1, 2, 3, 4])
  const [holDay, setHolDay] = useState("")
  const [holName, setHolName] = useState("")
  const [holRecurring, setHolRecurring] = useState(false)

  async function load() {
    setLoading(true)
    try {
      const [c, hs] = await Promise.all([teamopsApi.getWorkCalendar(), teamopsApi.listHolidays()])
      setCal(c)
      setDayStart(hhmm(c.day_start)); setDayEnd(hhmm(c.day_end))
      setHasLunch(!!(c.lunch_start && c.lunch_end))
      setLunchStart(hhmm(c.lunch_start) || "12:00"); setLunchEnd(hhmm(c.lunch_end) || "13:00")
      setWorkDays(c.work_days)
      setHolidays(hs)
    } finally {
      setLoading(false)
    }
  }
  useEffect(() => { void load() }, [])

  function toggleDay(v: number) {
    setWorkDays((d) => (d.includes(v) ? d.filter((x) => x !== v) : [...d, v].sort((a, b) => a - b)))
  }

  async function saveCalendar() {
    setSaving(true)
    try {
      const updated = await teamopsApi.updateWorkCalendar({
        day_start: dayStart, day_end: dayEnd,
        lunch_start: hasLunch ? lunchStart : null,
        lunch_end: hasLunch ? lunchEnd : null,
        work_days: workDays,
        timezone: cal?.timezone ?? "America/Maceio",
      })
      setCal(updated)
      toast.success("Calendário salvo.")
    } catch (e) {
      const err = e as { response?: { data?: { detail?: unknown } } }
      toast.error(typeof err.response?.data?.detail === "string" ? err.response.data.detail : "Não foi possível salvar.")
    } finally {
      setSaving(false)
    }
  }

  async function addHoliday() {
    if (!holDay || !holName.trim()) return
    try {
      await teamopsApi.createHoliday({ day: holDay, name: holName.trim(), is_recurring: holRecurring })
      setHolDay(""); setHolName(""); setHolRecurring(false)
      setHolidays(await teamopsApi.listHolidays())
    } catch (e) {
      const err = e as { response?: { data?: { detail?: unknown } } }
      toast.error(typeof err.response?.data?.detail === "string" ? err.response.data.detail : "Não foi possível adicionar.")
    }
  }

  async function removeHoliday(id: string) {
    await teamopsApi.deleteHoliday(id)
    setHolidays((hs) => hs.filter((h) => h.id !== id))
  }

  if (loading) return <Skeleton className="h-72 rounded-2xl" />

  return (
    <div className="grid items-start gap-4 md:grid-cols-2">
      <SectionCard title="Expediente" icon={Clock} subtitle="Horário e dias úteis usados pelo cronograma.">
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div><Label>Início</Label><Input type="time" value={dayStart} onChange={(e) => setDayStart(e.target.value)} /></div>
            <div><Label>Fim</Label><Input type="time" value={dayEnd} onChange={(e) => setDayEnd(e.target.value)} /></div>
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={hasLunch} onChange={(e) => setHasLunch(e.target.checked)} /> Tem horário de almoço
          </label>
          {hasLunch && (
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Almoço início</Label><Input type="time" value={lunchStart} onChange={(e) => setLunchStart(e.target.value)} /></div>
              <div><Label>Almoço fim</Label><Input type="time" value={lunchEnd} onChange={(e) => setLunchEnd(e.target.value)} /></div>
            </div>
          )}
          <div>
            <Label>Dias úteis</Label>
            <div className="mt-1 flex flex-wrap gap-1.5">
              {WEEKDAYS.map((d) => (
                <Button key={d.v} type="button" size="sm"
                  variant={workDays.includes(d.v) ? "default" : "outline"}
                  onClick={() => toggleDay(d.v)}>{d.label}</Button>
              ))}
            </div>
          </div>
          <p className="text-sm text-muted-foreground">
            {cal ? <><strong className="font-semibold tabular-nums text-foreground">{cal.hours_per_day} h</strong> úteis por dia</> : ""}
          </p>
          <Button className="h-10 gap-1.5" onClick={() => void saveCalendar()} disabled={saving}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null} Salvar calendário
          </Button>
        </div>
      </SectionCard>

      <SectionCard title="Feriados" icon={CalendarDays} subtitle="Dias sem expediente; os marcados como Anual repetem todo ano.">
        <div className="space-y-4">
          <div className="flex flex-wrap items-end gap-2">
            <div><Label>Data</Label><Input type="date" value={holDay} onChange={(e) => setHolDay(e.target.value)} /></div>
            <div className="flex-1"><Label>Nome</Label><Input value={holName} onChange={(e) => setHolName(e.target.value)} placeholder="ex.: Independência" /></div>
            <label className="flex items-center gap-1.5 pb-2 text-xs">
              <input type="checkbox" checked={holRecurring} onChange={(e) => setHolRecurring(e.target.checked)} /> Anual
            </label>
            <Button type="button" size="icon" onClick={() => void addHoliday()} title="Adicionar feriado" aria-label="Adicionar feriado"><Plus className="h-4 w-4" /></Button>
          </div>
          <ul className="divide-y rounded-xl border">
            {holidays.length === 0 && <li className="p-3 text-sm text-muted-foreground">Nenhum feriado cadastrado.</li>}
            {holidays.map((h) => (
              <li key={h.id} className="flex items-center gap-2 px-3 py-2 text-sm transition-colors hover:bg-muted/40">
                <span className="font-medium tabular-nums">{h.day.split("-").reverse().join("/")}</span>
                <span className="flex-1 truncate">{h.name}</span>
                {h.is_recurring && <Pill tone="slate">Anual</Pill>}
                <Button type="button" size="icon" variant="ghost" onClick={() => void removeHoliday(h.id)} title="Remover feriado" aria-label={`Remover ${h.name}`}>
                  <Trash2 className="h-4 w-4 text-destructive" />
                </Button>
              </li>
            ))}
          </ul>
        </div>
      </SectionCard>
    </div>
  )
}
