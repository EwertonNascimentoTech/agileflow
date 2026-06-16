import { useEffect, useState } from "react"
import { Link } from "react-router-dom"
import { ChevronRight, ChevronDown } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  teamopsApi, EMPLOYMENT_TYPE_DOT, EMPLOYMENT_TYPE_LABELS,
  type OrgAreaNode, type OrgTree,
} from "@/api/teamops"
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
          Hierarquia de áreas e pessoas alocadas.
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
          ) : !tree || tree.roots.length === 0 ? (
            <Card><CardContent className="p-8 text-center text-sm text-muted-foreground">
              Nenhuma área cadastrada. Crie áreas e aloque pessoas para montar o organograma.
            </CardContent></Card>
          ) : (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Hierarquia</CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="space-y-2">
                  {tree.roots.map((node) => (
                    <AreaNodeView key={node.area_id} node={node} depth={0} />
                  ))}
                </ul>
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>
    </div>
  )
}

function AreaNodeView({ node, depth }: { node: OrgAreaNode; depth: number }) {
  const [open, setOpen] = useState(depth < 2)
  const hasChildren = node.children.length > 0

  return (
    <li>
      <div
        className="rounded-md border bg-background px-3 py-2"
        style={{ marginLeft: depth * 16 }}
      >
        <div className="flex items-center gap-2 text-sm">
          {hasChildren ? (
            <button onClick={() => setOpen(!open)} className="text-muted-foreground">
              {open ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
            </button>
          ) : (
            <span className="inline-block w-4" />
          )}
          <span className="font-semibold">{node.area_name}</span>
          <Badge variant="secondary" className="text-xs">{node.person_count}</Badge>
        </div>

        {node.members.length > 0 && (
          <ul className="mt-2 space-y-1 pl-6">
            {node.members.map((member) => (
              <li key={member.person_id} className="flex items-center gap-2 text-sm">
                <span
                  className={`inline-block h-2 w-2 shrink-0 rounded-full ${EMPLOYMENT_TYPE_DOT[member.employment_type]}`}
                  title={EMPLOYMENT_TYPE_LABELS[member.employment_type]}
                />
                <Link
                  to={`/app/modules/teamops/people/${member.person_id}`}
                  className="font-medium hover:underline"
                >
                  {member.name}
                </Link>
                <Badge variant="outline" className="text-xs">{member.position || "—"}</Badge>
              </li>
            ))}
          </ul>
        )}
      </div>

      {hasChildren && open && (
        <ul className="mt-1 space-y-1">
          {node.children.map((child) => (
            <AreaNodeView key={child.area_id} node={child} depth={depth + 1} />
          ))}
        </ul>
      )}
    </li>
  )
}
