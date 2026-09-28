import { useEffect, useState } from "react"
import { Link } from "react-router-dom"
import { ChevronRight, ChevronDown, List, Network } from "lucide-react"
import { Skeleton } from "@/components/ui/skeleton"
import { EmptyState } from "@/components/EmptyState"
import { Card, DetailTabs, PageHeader, Pill, SectionCard, type TabDef } from "@/components/ds"
import {
  teamopsApi, EMPLOYMENT_TYPE_DOT, EMPLOYMENT_TYPE_LABELS,
  type OrgAreaNode, type OrgTree,
} from "@/api/teamops"
import { PersonOrgChart } from "./components/PersonOrgChart"

type OrgView = "diagram" | "list"

const TABS: TabDef<OrgView>[] = [
  { value: "diagram", label: "Diagrama", icon: Network },
  { value: "list", label: "Lista", icon: List },
]

export default function OrgPage() {
  const [tree, setTree] = useState<OrgTree | null>(null)
  const [loading, setLoading] = useState(true)
  const [view, setView] = useState<OrgView>("diagram")

  useEffect(() => {
    teamopsApi.getOrgTree().then(setTree).finally(() => setLoading(false))
  }, [])

  return (
    <div className="space-y-5 p-4">
      <PageHeader
        icon={Network}
        color="#0891B2"
        title="Organograma"
        description="Hierarquia de áreas e pessoas alocadas."
      />

      <DetailTabs tabs={TABS} value={view} onChange={setView} />

      {view === "diagram" && (
        loading || !tree ? <Skeleton className="h-96 rounded-2xl" /> : <PersonOrgChart tree={tree} />
      )}

      {view === "list" && (
        loading ? (
          <Skeleton className="h-96 rounded-2xl" />
        ) : !tree || tree.roots.length === 0 ? (
          <Card>
            <EmptyState
              icon={Network}
              title="Nenhuma área cadastrada."
              description="Crie áreas e aloque pessoas para montar o organograma."
              compact
            />
          </Card>
        ) : (
          <SectionCard title="Hierarquia" icon={List}>
            <ul className="space-y-2">
              {tree.roots.map((node) => (
                <AreaNodeView key={node.area_id} node={node} depth={0} />
              ))}
            </ul>
          </SectionCard>
        )
      )}
    </div>
  )
}

function AreaNodeView({ node, depth }: { node: OrgAreaNode; depth: number }) {
  const [open, setOpen] = useState(depth < 2)
  const hasChildren = node.children.length > 0

  return (
    <li>
      <div
        className="rounded-xl border bg-background px-3 py-2.5"
        style={{ marginLeft: depth * 16 }}
      >
        <div className="flex items-center gap-2 text-sm">
          {hasChildren ? (
            <button
              type="button"
              onClick={() => setOpen(!open)}
              className="rounded text-muted-foreground hover:text-foreground"
              aria-label={open ? `Recolher ${node.area_name}` : `Expandir ${node.area_name}`}
              aria-expanded={open}
            >
              {open ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
            </button>
          ) : (
            <span className="inline-block w-4" />
          )}
          <span className="font-semibold">{node.area_name}</span>
          <Pill tone="slate" className="tabular-nums">{node.person_count}</Pill>
        </div>

        {node.members.length > 0 && (
          <ul className="mt-2 space-y-1.5 pl-6">
            {node.members.map((member) => (
              <li key={member.person_id} className="flex flex-wrap items-center gap-2 text-sm">
                <span
                  className={`inline-block h-2 w-2 shrink-0 rounded-full ${EMPLOYMENT_TYPE_DOT[member.employment_type]}`}
                  title={EMPLOYMENT_TYPE_LABELS[member.employment_type]}
                />
                <Link
                  to={`/app/modules/teamops/people/${member.person_id}`}
                  className="font-medium hover:text-primary hover:underline"
                >
                  {member.name}
                </Link>
                <span className="text-xs text-muted-foreground">{member.position || "—"}</span>
              </li>
            ))}
          </ul>
        )}
      </div>

      {hasChildren && open && (
        <ul className="mt-2 space-y-2">
          {node.children.map((child) => (
            <AreaNodeView key={child.area_id} node={child} depth={depth + 1} />
          ))}
        </ul>
      )}
    </li>
  )
}
