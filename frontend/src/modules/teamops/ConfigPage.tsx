import { useEffect, useState } from "react"
import { Plus, Trash2, Pencil, KeyRound } from "lucide-react"
import { PositionAccessDialog } from "@/modules/teamops/PositionAccessDialog"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
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
  type Position,
  type StackCategory,
} from "@/api/teamops"

const NONE = "__none__"

export default function ConfigPage() {
  return (
    <div className="space-y-4 p-6">
      <header>
        <h1 className="text-2xl font-bold tracking-tight">Configurações</h1>
        <p className="text-sm text-muted-foreground">
          Catálogos do módulo: áreas, cargos, categorias de stack e tipos de ausência.
        </p>
      </header>

      <Tabs defaultValue="areas">
        <TabsList>
          <TabsTrigger value="areas">Áreas</TabsTrigger>
          <TabsTrigger value="positions">Cargos</TabsTrigger>
          <TabsTrigger value="categories">Categorias de stack</TabsTrigger>
          <TabsTrigger value="absence-types">Tipos de ausência</TabsTrigger>
        </TabsList>

        <TabsContent value="areas" className="mt-4"><AreasTab /></TabsContent>
        <TabsContent value="positions" className="mt-4"><PositionsTab /></TabsContent>
        <TabsContent value="categories" className="mt-4"><CategoriesTab /></TabsContent>
        <TabsContent value="absence-types" className="mt-4"><AbsenceTypesTab /></TabsContent>
      </Tabs>
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

  if (loading) return <Skeleton className="h-64" />

  const tree = buildAreaTree(areas)

  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <Button size="sm" onClick={() => setCreating(true)}>
          <Plus className="mr-2 h-4 w-4" /> Nova área
        </Button>
      </div>
      {areas.length === 0 ? (
        <Card><CardContent className="p-8 text-center text-sm text-muted-foreground">
          Nenhuma área cadastrada.
        </CardContent></Card>
      ) : (
        <Card><CardContent className="p-0">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-xs uppercase text-muted-foreground">
              <tr>
                <th className="px-4 py-2 text-left">Área</th>
                <th className="px-4 py-2 text-left">Tipo</th>
                <th className="px-4 py-2 text-left">Sub-áreas</th>
                <th className="px-4 py-2 text-left">Pessoas</th>
                <th className="px-4 py-2 text-left">Status</th>
                <th className="px-4 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {tree.map(({ area: a, depth }) => (
                <tr key={a.id} className="border-t">
                  <td className="px-4 py-2 font-medium">
                    <span style={{ paddingLeft: depth * 18 }} className="inline-flex items-center gap-1">
                      {depth > 0 && <span className="text-muted-foreground">↳</span>}
                      {a.name}
                    </span>
                  </td>
                  <td className="px-4 py-2">{AREA_TYPE_LABELS[a.area_type]}</td>
                  <td className="px-4 py-2">
                    {a.subarea_count > 0 ? <Badge variant="secondary">{a.subarea_count}</Badge> : "—"}
                  </td>
                  <td className="px-4 py-2"><Badge variant="secondary">{a.person_count}</Badge></td>
                  <td className="px-4 py-2">
                    <Badge variant={a.status === "ativa" ? "success" : a.status === "inativa" ? "destructive" : "warning"}>
                      {AREA_STATUS_LABELS[a.status]}
                    </Badge>
                  </td>
                  <td className="px-4 py-2 text-right">
                    <Button variant="ghost" size="sm" onClick={() => setEditing(a)}>
                      <Pencil className="h-4 w-4" />
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent></Card>
      )}

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

  async function refresh() {
    setLoading(true)
    setItems(await teamopsApi.listPositions())
    setLoading(false)
  }
  useEffect(() => { refresh() }, [])

  if (loading) return <Skeleton className="h-64" />

  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <Button size="sm" onClick={() => setCreating(true)}>
          <Plus className="mr-2 h-4 w-4" /> Novo cargo
        </Button>
      </div>
      {items.length === 0 ? (
        <Card><CardContent className="p-8 text-center text-sm text-muted-foreground">
          Nenhum cargo cadastrado.
        </CardContent></Card>
      ) : (
        <Card><CardContent className="p-0">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-xs uppercase text-muted-foreground">
              <tr>
                <th className="px-4 py-2 text-left">Nome</th>
                <th className="px-4 py-2 text-left">Slug</th>
                <th className="px-4 py-2 text-left">Origem</th>
                <th className="px-4 py-2 text-left">Pessoas</th>
                <th className="px-4 py-2 text-left">Status</th>
                <th className="px-4 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {items.map((p) => (
                <tr key={p.id} className="border-t">
                  <td className="px-4 py-2 font-medium">{p.name}</td>
                  <td className="px-4 py-2 text-muted-foreground">{p.slug}</td>
                  <td className="px-4 py-2">
                    {p.is_system
                      ? <Badge variant="info">Sistema</Badge>
                      : <Badge variant="secondary">Custom</Badge>}
                  </td>
                  <td className="px-4 py-2"><Badge variant="secondary">{p.person_count}</Badge></td>
                  <td className="px-4 py-2">
                    {p.is_active ? <Badge variant="success">Ativo</Badge> : <Badge variant="secondary">Inativo</Badge>}
                  </td>
                  <td className="px-4 py-2 text-right">
                    <Button variant="ghost" size="sm" className="gap-1.5" onClick={() => setAccessPos(p)} title="Acesso do cargo">
                      <KeyRound className="h-4 w-4" /> Acesso
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => setEditing(p)}>
                      <Pencil className="h-4 w-4" />
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent></Card>
      )}

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
            {isEdit && !item!.is_system && (
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
      <div className="flex justify-end">
        <Button size="sm" onClick={() => setCreating(true)}>
          <Plus className="mr-2 h-4 w-4" /> Nova categoria
        </Button>
      </div>
      {loading ? <Skeleton className="h-48" /> : items.length === 0 ? (
        <Card><CardContent className="p-8 text-center text-sm text-muted-foreground">
          Nenhuma categoria.
        </CardContent></Card>
      ) : (
        <div className="space-y-2">
          {items.map((c) => (
            <Card key={c.id}>
              <CardContent className="flex items-center justify-between p-3">
                <div>
                  <p className="font-medium">{c.name}</p>
                  <p className="text-xs text-muted-foreground">Ordem: {c.order}</p>
                </div>
                <div className="flex items-center gap-2">
                  {c.is_active ? <Badge variant="success">Ativa</Badge> : <Badge variant="secondary">Inativa</Badge>}
                  <Button variant="ghost" size="sm" onClick={() => setEditing(c)}>
                    <Pencil className="h-4 w-4" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
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
      <div className="flex justify-end">
        <Button size="sm" onClick={() => setCreating(true)}>
          <Plus className="mr-2 h-4 w-4" /> Novo tipo
        </Button>
      </div>
      {loading ? <Skeleton className="h-48" /> : items.length === 0 ? (
        <Card><CardContent className="p-8 text-center text-sm text-muted-foreground">
          Nenhum tipo cadastrado.
        </CardContent></Card>
      ) : (
        <Card><CardContent className="p-0">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-xs uppercase text-muted-foreground">
              <tr>
                <th className="px-4 py-2 text-left">Nome</th>
                <th className="px-4 py-2 text-left">Slug</th>
                <th className="px-4 py-2 text-left">Aprovação</th>
                <th className="px-4 py-2 text-left">Reduz capacidade</th>
                <th className="px-4 py-2 text-left">Cor</th>
                <th className="px-4 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {items.map((t) => (
                <tr key={t.id} className="border-t">
                  <td className="px-4 py-2 font-medium">{t.name}</td>
                  <td className="px-4 py-2 text-muted-foreground">{t.slug}</td>
                  <td className="px-4 py-2">{t.requires_approval ? "Sim" : "Não"}</td>
                  <td className="px-4 py-2">{t.affects_capacity ? "Sim" : "Não"}</td>
                  <td className="px-4 py-2">
                    <span className="inline-block h-4 w-4 rounded-full align-middle" style={{ background: t.color }} />
                    <span className="ml-2 text-xs text-muted-foreground">{t.color}</span>
                  </td>
                  <td className="px-4 py-2 text-right">
                    <Button variant="ghost" size="sm" onClick={() => setEditing(t)}>
                      <Pencil className="h-4 w-4" />
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent></Card>
      )}
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
      const payload: any = {
        name, slug: slug || undefined, requires_approval: requiresApproval,
        affects_capacity: affectsCapacity, color, is_active: active,
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
