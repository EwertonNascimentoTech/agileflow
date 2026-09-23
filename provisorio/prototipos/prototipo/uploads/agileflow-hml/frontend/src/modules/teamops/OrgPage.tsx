import { useEffect, useState } from "react"
import { Link } from "react-router-dom"
import { ChevronRight, ChevronDown, Users } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { teamopsApi, type OrgNode, type OrgTree } from "@/api/teamops"
import { PersonOrgChart } from "./components/PersonOrgChart"

export default function OrgPage() {
  const [tree, setTree] = useState<OrgTree | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    teamopsApi.getOrgTree().then(setTree).finally(() => setLoading(false))
  }, [])

  return (
    <div className="space-y-4 p-6">
      <header>
        <h1 className="text-2xl font-bold tracking-tight">Organograma</h1>
        <p className="text-sm text-muted-foreground">
          Hierarquia do time (gerente → coordenador → PO → pessoas).
        </p>
      </header>

      <Tabs defaultValue="diagram">
        <TabsList>
          <TabsTrigger value="diagram">Diagrama</TabsTrigger>
          <TabsTrigger value="list">Lista</TabsTrigger>
        </TabsList>

        <TabsContent value="diagram" className="mt-4">
          {loading || !tree ? <Skeleton className="h-96" /> : <PersonOrgChart tree={tree} />}
        </TabsContent>

        <TabsContent value="list" className="mt-4">
          {loading ? (
            <Skeleton className="h-96" />
          ) : !tree || (tree.roots.length === 0 && tree.orphans.length === 0) ? (
            <Card><CardContent className="p-8 text-center text-sm text-muted-foreground">
              Nenhuma pessoa cadastrada. Comece criando o gerente e os coordenadores.
            </CardContent></Card>
          ) : (
            <div className="grid gap-4 lg:grid-cols-2">
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Hierarquia</CardTitle>
                </CardHeader>
                <CardContent>
                  {tree.roots.length === 0 ? (
                    <p className="text-sm text-muted-foreground">
                      Nenhum gerente ou coordenador cadastrado. Cadastre alguém com cargo "Gerente"
                      ou "Coordenador" para iniciar a árvore.
                    </p>
                  ) : (
                    <ul className="space-y-2">
                      {tree.roots.map((node) => (
                        <OrgNodeView key={node.person.id} node={node} depth={0} />
                      ))}
                    </ul>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-base flex items-center gap-2">
                    <Users className="h-4 w-4" />
                    Sem vínculo hierárquico
                    <Badge variant="secondary">{tree.orphans.length}</Badge>
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {tree.orphans.length === 0 ? (
                    <p className="text-sm text-muted-foreground">Todos vinculados ao organograma. ✨</p>
                  ) : (
                    <ul className="space-y-2">
                      {tree.orphans.map((node) => (
                        <OrgNodeView key={node.person.id} node={node} depth={0} />
                      ))}
                    </ul>
                  )}
                </CardContent>
              </Card>
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  )
}

function OrgNodeView({ node, depth }: { node: OrgNode; depth: number }) {
  const [open, setOpen] = useState(depth < 2)
  const hasChildren = node.children.length > 0

  return (
    <li>
      <div
        className="flex items-center gap-2 rounded-md border bg-background px-3 py-2 text-sm hover:bg-muted/30"
        style={{ marginLeft: depth * 16 }}
      >
        {hasChildren ? (
          <button onClick={() => setOpen(!open)} className="text-muted-foreground">
            {open ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
          </button>
        ) : (
          <span className="inline-block w-4" />
        )}
        <Link
          to={`/app/modules/teamops/people/${node.person.id}`}
          className="font-medium hover:underline"
        >
          {node.person.full_name}
        </Link>
        <Badge variant="outline" className="ml-2 text-xs">
          {node.person.position?.name ?? "—"}
        </Badge>
        {node.area_name && (
          <Badge variant="secondary" className="text-xs">{node.area_name}</Badge>
        )}
      </div>
      {hasChildren && open && (
        <ul className="mt-1 space-y-1">
          {node.children.map((child) => (
            <OrgNodeView key={child.person.id} node={child} depth={depth + 1} />
          ))}
        </ul>
      )}
    </li>
  )
}
