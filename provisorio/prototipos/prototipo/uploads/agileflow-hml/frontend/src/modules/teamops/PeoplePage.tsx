import { useEffect, useMemo, useState } from "react"
import { Link } from "react-router-dom"
import { Search, Trash2, UserPlus } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  teamopsApi,
  PERSON_STATUS_LABELS,
  type Area,
  type Person,
  type Position,
} from "@/api/teamops"
import { PersonFormDialog } from "./PersonFormDialog"

const NONE = "__none__"

export default function PeoplePage() {
  const [people, setPeople] = useState<Person[]>([])
  const [areas, setAreas] = useState<Area[]>([])
  const [positions, setPositions] = useState<Position[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState("")
  const [areaFilter, setAreaFilter] = useState<string>(NONE)
  const [positionFilter, setPositionFilter] = useState<string>(NONE)
  const [statusFilter, setStatusFilter] = useState<string>(NONE)
  const [editing, setEditing] = useState<Person | null>(null)
  const [creating, setCreating] = useState(false)

  async function refresh() {
    setLoading(true)
    try {
      const params: Record<string, string> = {}
      if (search) params.search = search
      if (areaFilter !== NONE) params.area_id = areaFilter
      if (positionFilter !== NONE) params.position_id = positionFilter
      if (statusFilter !== NONE) params.status = statusFilter
      const [ps, as, pos] = await Promise.all([
        teamopsApi.listPersons(params as any),
        teamopsApi.listAreas(),
        teamopsApi.listPositions(true),
      ])
      setPeople(ps)
      setAreas(as)
      setPositions(pos)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    refresh()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, areaFilter, positionFilter, statusFilter])

  const total = useMemo(() => people.length, [people])

  return (
    <div className="space-y-4 p-6">
      <header className="flex flex-col items-start justify-between gap-3 md:flex-row md:items-center">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Pessoas</h1>
          <p className="text-sm text-muted-foreground">
            {total} pessoa{total === 1 ? "" : "s"} cadastrada{total === 1 ? "" : "s"}.
          </p>
        </div>
        <Button onClick={() => setCreating(true)}>
          <UserPlus className="mr-2 h-4 w-4" />
          Nova pessoa
        </Button>
      </header>

      <Card>
        <CardContent className="flex flex-col gap-3 p-4 md:flex-row md:items-center">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar por nome ou e-mail…"
              className="pl-9"
            />
          </div>
          <Select value={areaFilter} onValueChange={setAreaFilter}>
            <SelectTrigger className="w-[180px]"><SelectValue placeholder="Área" /></SelectTrigger>
            <SelectContent>
              <SelectItem value={NONE}>Todas as áreas</SelectItem>
              {areas.map((a) => (
                <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={positionFilter} onValueChange={setPositionFilter}>
            <SelectTrigger className="w-[180px]"><SelectValue placeholder="Cargo" /></SelectTrigger>
            <SelectContent>
              <SelectItem value={NONE}>Todos os cargos</SelectItem>
              {positions.map((p) => (
                <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-[140px]"><SelectValue placeholder="Status" /></SelectTrigger>
            <SelectContent>
              <SelectItem value={NONE}>Todos status</SelectItem>
              {Object.entries(PERSON_STATUS_LABELS).map(([v, l]) => (
                <SelectItem key={v} value={v}>{l}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="border-b py-3">
          <CardTitle className="text-base">Lista do time</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {loading ? (
            <div className="space-y-2 p-4">
              {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-12" />)}
            </div>
          ) : people.length === 0 ? (
            <div className="p-8 text-center text-sm text-muted-foreground">
              Nenhuma pessoa encontrada.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/50 text-xs uppercase text-muted-foreground">
                  <tr>
                    <th className="px-4 py-2 text-left">Nome</th>
                    <th className="px-4 py-2 text-left">Cargo</th>
                    <th className="px-4 py-2 text-left">Área</th>
                    <th className="px-4 py-2 text-left">PO</th>
                    <th className="px-4 py-2 text-left">Acesso</th>
                    <th className="px-4 py-2 text-left">Status</th>
                    <th className="px-4 py-2"></th>
                  </tr>
                </thead>
                <tbody>
                  {people.map((p) => (
                    <tr key={p.id} className="border-t hover:bg-muted/30">
                      <td className="px-4 py-2">
                        <Link to={`/app/modules/teamops/people/${p.id}`} className="font-medium hover:underline">
                          {p.full_name}
                        </Link>
                        <div className="text-xs text-muted-foreground">{p.email}</div>
                      </td>
                      <td className="px-4 py-2">{p.position?.name ?? "—"}</td>
                      <td className="px-4 py-2">{p.area?.name ?? "—"}</td>
                      <td className="px-4 py-2">{p.po_person?.full_name ?? "—"}</td>
                      <td className="px-4 py-2">
                        {p.access_level === "none" ? (
                          <span className="text-xs text-muted-foreground">Sem acesso</span>
                        ) : (
                          <Badge variant="secondary">
                            Com acesso{p.user_active === false ? " (inativo)" : ""}
                          </Badge>
                        )}
                      </td>
                      <td className="px-4 py-2">
                        <Badge variant={p.status === "ativo" ? "success" : p.status === "desligado" ? "destructive" : "warning"}>
                          {PERSON_STATUS_LABELS[p.status]}
                        </Badge>
                      </td>
                      <td className="px-4 py-2 text-right">
                        <div className="flex justify-end gap-1">
                          <Button variant="ghost" size="sm" onClick={() => setEditing(p)}>Editar</Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                            onClick={async () => {
                              if (!confirm(`Excluir permanentemente "${p.full_name}"?\n\nAusências e stacks vinculadas também serão removidas; vínculos no organograma viram nulos.`)) return
                              try {
                                await teamopsApi.deletePerson(p.id)
                                refresh()
                              } catch (err: any) {
                                alert(err?.response?.data?.detail ?? "Erro ao excluir.")
                              }
                            }}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {(creating || editing) && (
        <PersonFormDialog
          person={editing}
          areas={areas}
          onClose={() => {
            setCreating(false)
            setEditing(null)
          }}
          onSaved={() => {
            setCreating(false)
            setEditing(null)
            refresh()
          }}
        />
      )}
    </div>
  )
}
