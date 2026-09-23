import { useEffect, useState } from "react"
import { Link } from "react-router-dom"
import { FolderKanban, Plus } from "lucide-react"

import { portalOccurrencesApi, type PortalProject } from "@/api/clientes"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { EmptyState } from "@/components/EmptyState"

/** Início do Portal: projetos a que o cliente tem acesso, etapa atual e ocorrências abertas. */
export default function ClientPortalHomePage() {
  const [projects, setProjects] = useState<PortalProject[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    portalOccurrencesApi
      .projects()
      .then(setProjects)
      .catch(() => setProjects([]))
      .finally(() => setLoading(false))
  }, [])

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-bold">Meus projetos</h1>
        <p className="text-sm text-muted-foreground">
          Projetos que você acompanha. Você pode abrir Ocorrências enquanto o projeto está em Operação Assistida.
        </p>
      </div>

      {loading ? (
        <Skeleton className="h-40 rounded-lg" />
      ) : projects.length === 0 ? (
        <EmptyState
          icon={FolderKanban}
          title="Nenhum projeto vinculado"
          description="Peça ao Product Owner do seu projeto para vincular o seu cadastro."
        />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {projects.map((p) => (
            <div key={p.task_id} className="flex flex-col gap-3 rounded-lg border p-4">
              <div>
                <div className="font-medium">{p.title}</div>
                <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                  {p.planning_kind && <span className="capitalize">{p.planning_kind}</span>}
                  {p.status_name && <span className="rounded bg-muted px-1.5 py-0.5">{p.status_name}</span>}
                  {p.open_occurrences > 0 && <span>{p.open_occurrences} ocorrência(s) aberta(s)</span>}
                </div>
              </div>
              <div className="mt-auto flex flex-wrap gap-2">
                {p.accepts_occurrences && (
                  <Button asChild size="sm" className="gap-1.5">
                    <Link to={`/portal/ocorrencias/nova?projeto=${p.task_id}`}>
                      <Plus size={14} /> Abrir ocorrência
                    </Link>
                  </Button>
                )}
                <Button asChild size="sm" variant="outline">
                  <Link to={`/portal/ocorrencias?projeto=${p.task_id}`}>Ver ocorrências</Link>
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
