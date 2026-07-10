import { useEffect, useState } from "react"
import { Plus, Trash2, AlertTriangle, ShieldCheck } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Skeleton } from "@/components/ui/skeleton"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog"
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select"
import {
  teamopsApi,
  STACK_LEVEL_LABELS,
  type CompetencyMap,
  type Stack,
  type StackCategory,
} from "@/api/teamops"
import { nullableStr } from "@/lib/utils"

export default function StacksPage() {
  return (
    <div className="space-y-4 p-6">
      <header>
        <h1 className="text-2xl font-bold tracking-tight">Stacks e competências</h1>
        <p className="text-sm text-muted-foreground">
          Catálogo de tecnologias + mapa de competências do time.
        </p>
      </header>

      <Tabs defaultValue="map">
        <TabsList>
          <TabsTrigger value="map">Mapa de competências</TabsTrigger>
          <TabsTrigger value="catalog">Catálogo</TabsTrigger>
        </TabsList>

        <TabsContent value="map" className="mt-4">
          <CompetencyMapView />
        </TabsContent>

        <TabsContent value="catalog" className="mt-4">
          <CatalogView />
        </TabsContent>
      </Tabs>
    </div>
  )
}

function CompetencyMapView() {
  const [map, setMap] = useState<CompetencyMap | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    teamopsApi.getCompetencyMap().then(setMap).finally(() => setLoading(false))
  }, [])

  if (loading) return <Skeleton className="h-96" />
  if (!map || map.entries.length === 0) {
    return <Card><CardContent className="p-8 text-center text-sm text-muted-foreground">
      Cadastre stacks e vincule-as a pessoas para ver o mapa.
    </CardContent></Card>
  }

  return (
    <div className="grid gap-3">
      {map.entries.map((entry) => (
        <Card key={entry.stack.id}>
          <CardHeader className="flex flex-row items-center justify-between gap-2 pb-2">
            <div>
              <CardTitle className="text-base flex items-center gap-2">
                {entry.stack.name}
                {entry.stack.is_critical && <Badge variant="warning">Crítica</Badge>}
                <Badge variant="outline">{entry.category_name}</Badge>
              </CardTitle>
              <CardDescription>
                {entry.person_count} pessoa{entry.person_count === 1 ? "" : "s"} habilitada{entry.person_count === 1 ? "" : "s"}
                {entry.has_reference ? " · 1 referência interna" : ""}
              </CardDescription>
            </div>
            <Badge
              variant={
                entry.risk_level === "high"
                  ? "destructive"
                  : entry.risk_level === "medium"
                    ? "warning"
                    : "success"
              }
            >
              {entry.risk_level === "high" ? <AlertTriangle className="mr-1 h-3 w-3" /> : <ShieldCheck className="mr-1 h-3 w-3" />}
              Risco {entry.risk_level === "high" ? "alto" : entry.risk_level === "medium" ? "médio" : "baixo"}
            </Badge>
          </CardHeader>
          <CardContent>
            {entry.persons.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nenhuma pessoa nessa stack.</p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {entry.persons.map((p) => (
                  <Badge
                    key={p.person.id}
                    variant={p.is_reference ? "default" : "secondary"}
                    className="font-normal"
                  >
                    {p.person.full_name} · {STACK_LEVEL_LABELS[p.level]}
                    {p.is_reference && " ⭐"}
                  </Badge>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      ))}
    </div>
  )
}

const NONE = "__none__"

function CatalogView() {
  const [stacks, setStacks] = useState<Stack[]>([])
  const [categories, setCategories] = useState<StackCategory[]>([])
  const [loading, setLoading] = useState(true)
  const [showStackDlg, setShowStackDlg] = useState(false)
  const [showCatDlg, setShowCatDlg] = useState(false)
  const [editing, setEditing] = useState<Stack | null>(null)

  async function refresh() {
    setLoading(true)
    const [s, c] = await Promise.all([teamopsApi.listStacks(), teamopsApi.listStackCategories()])
    setStacks(s)
    setCategories(c)
    setLoading(false)
  }

  useEffect(() => { refresh() }, [])

  if (loading) return <Skeleton className="h-96" />

  const byCategory = categories.map((c) => ({
    category: c,
    items: stacks.filter((s) => s.category_id === c.id),
  }))
  const uncategorized = stacks.filter((s) => !categories.find((c) => c.id === s.category_id))

  return (
    <div className="space-y-4">
      <div className="flex justify-end gap-2">
        <Button variant="outline" size="sm" onClick={() => setShowCatDlg(true)}>
          <Plus className="mr-2 h-4 w-4" /> Nova categoria
        </Button>
        <Button size="sm" onClick={() => setShowStackDlg(true)}>
          <Plus className="mr-2 h-4 w-4" /> Nova stack
        </Button>
      </div>

      {byCategory.map(({ category, items }) => (
        <Card key={category.id}>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">{category.name}</CardTitle>
          </CardHeader>
          <CardContent>
            {items.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nenhuma stack nessa categoria.</p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {items.map((s) => (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => setEditing(s)}
                    className="inline-flex items-center gap-2 rounded-full border px-3 py-1 text-sm hover:bg-muted/40"
                  >
                    {s.name}
                    {s.is_critical && <Badge variant="warning" className="text-[10px]">Crítica</Badge>}
                    {!s.is_active && <Badge variant="secondary" className="text-[10px]">Inativa</Badge>}
                  </button>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      ))}

      {uncategorized.length > 0 && (
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-base">Sem categoria</CardTitle></CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              {uncategorized.map((s) => (
                <Badge key={s.id} variant="secondary">{s.name}</Badge>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {showStackDlg && (
        <StackDialog
          categories={categories}
          stack={null}
          onClose={() => setShowStackDlg(false)}
          onSaved={() => { setShowStackDlg(false); refresh() }}
        />
      )}
      {editing && (
        <StackDialog
          categories={categories}
          stack={editing}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); refresh() }}
        />
      )}
      {showCatDlg && (
        <CategoryDialog
          onClose={() => setShowCatDlg(false)}
          onSaved={() => { setShowCatDlg(false); refresh() }}
        />
      )}
    </div>
  )
}

function StackDialog({
  categories, stack, onClose, onSaved,
}: {
  categories: StackCategory[]
  stack: Stack | null
  onClose: () => void
  onSaved: () => void
}) {
  const isEdit = !!stack
  const [name, setName] = useState(stack?.name ?? "")
  const [slug, setSlug] = useState(stack?.slug ?? "")
  const [categoryId, setCategoryId] = useState(stack?.category_id ?? (categories[0]?.id ?? NONE))
  const [critical, setCritical] = useState(stack?.is_critical ?? false)
  const [active, setActive] = useState(stack?.is_active ?? true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (categoryId === NONE) {
      setError("Selecione uma categoria.")
      return
    }
    setSaving(true)
    setError(null)
    try {
      if (isEdit) {
        await teamopsApi.updateStack(stack!.id, {
          category_id: categoryId,
          name,
          slug: nullableStr(slug),
          is_critical: critical,
          is_active: active,
        })
      } else {
        await teamopsApi.createStack({
          category_id: categoryId,
          name,
          slug: slug || undefined,
          is_critical: critical,
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
        <DialogHeader><DialogTitle>{isEdit ? "Editar stack" : "Nova stack"}</DialogTitle></DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <Label>Nome *</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} required />
          </div>
          <div>
            <Label>Slug (opcional)</Label>
            <Input value={slug} onChange={(e) => setSlug(e.target.value.toLowerCase())} placeholder="(gerado a partir do nome)" />
          </div>
          <div>
            <Label>Categoria *</Label>
            <Select value={categoryId} onValueChange={setCategoryId}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {categories.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={critical} onChange={(e) => setCritical(e.target.checked)} />
            Stack crítica (gera alerta se sem backup)
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} />
            Ativa
          </label>
          {error && <p className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">{error}</p>}
          <DialogFooter className="flex justify-between sm:justify-between">
            {isEdit && (
              <Button
                type="button" variant="ghost"
                onClick={async () => {
                  if (!confirm("Remover esta stack?")) return
                  await teamopsApi.deleteStack(stack!.id)
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

function CategoryDialog({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const [name, setName] = useState("")
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setError(null)
    try {
      await teamopsApi.createStackCategory({ name })
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
        <DialogHeader><DialogTitle>Nova categoria</DialogTitle></DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <Label>Nome *</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} required minLength={2} />
          </div>
          {error && <p className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">{error}</p>}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>Cancelar</Button>
            <Button type="submit" disabled={saving}>{saving ? "Salvando…" : "Salvar"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
