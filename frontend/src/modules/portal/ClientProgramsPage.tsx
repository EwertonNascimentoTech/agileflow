import { useEffect, useMemo, useState } from "react"
import { Link } from "react-router-dom"
import { Flag, Layers, Star } from "lucide-react"

import type { PortalPortfolio } from "@/api/portalPortfolio"
import { Skeleton } from "@/components/ui/skeleton"
import { EmptyState } from "@/components/EmptyState"
import { apiErrorDetail, plural } from "@/modules/portal/occurrenceUi"
import { Card, DeltaLabel, HealthBadge, IconTile, ProgressBar, QuadrantBadge } from "@/modules/portal/portfolioUi"
import { colorFor, fmtDate, loadPortfolio, quadrantOf, readFavorites, usePortalBase } from "@/modules/portal/portfolioMeta"

/** Programas que o cliente acompanha (favoritos primeiro). */
export default function ClientProgramsPage() {
  const base = usePortalBase()
  const [data, setData] = useState<PortalPortfolio | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const favorites = useMemo(() => new Set(readFavorites()), [])

  useEffect(() => {
    loadPortfolio()
      .then(setData)
      .catch((err) => setError(apiErrorDetail(err, "Não foi possível carregar os programas.")))
      .finally(() => setLoading(false))
  }, [])

  const programs = useMemo(
    () => [...(data?.programs ?? [])].sort((a, b) => Number(favorites.has(b.id)) - Number(favorites.has(a.id)) || a.name.localeCompare(b.name, "pt-BR")),
    [data, favorites],
  )

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Programas</h1>
        <p className="text-sm text-muted-foreground">Os programas dos projetos que você acompanha.</p>
      </div>
      {loading ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 3 }, (_, i) => <Skeleton key={i} className="h-56 rounded-2xl" />)}
        </div>
      ) : programs.length === 0 ? (
        <Card>
          <EmptyState icon={Layers} title="Nenhum programa" description={error ?? "Seus projetos ainda não fazem parte de um programa."} />
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {programs.map((g) => (
            <Link key={g.id} to={`${base}/programas/${g.id}`} className="group">
              <Card className="flex h-full flex-col gap-4 p-5 transition-colors group-hover:border-primary/40">
                <div className="flex items-start gap-3">
                  <IconTile icon={g.icon} color={colorFor(g.color, g.id)} size={44} />
                  <div className="min-w-0 flex-1">
                    <p className="flex items-center gap-1.5 font-semibold leading-snug">
                      {g.name}
                      {favorites.has(g.id) && <Star size={14} className="fill-amber-400 text-amber-500" aria-label="Favorito" />}
                    </p>
                    {g.description && <p className="line-clamp-2 text-sm text-muted-foreground">{g.description}</p>}
                  </div>
                  <HealthBadge value={g.health} />
                </div>
                <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                  <QuadrantBadge quadrant={quadrantOf(data?.quadrants ?? [], g.quadrant_code)} />
                  <span>{plural(g.project_count, "projeto", "projetos")}</span>
                  {g.pillar_count > 0 && <span>· {plural(g.pillar_count, "pilar", "pilares")}</span>}
                  {g.access === "projetos" && <span>· você acompanha alguns projetos</span>}
                </div>
                <div>
                  <div className="mb-1 flex items-baseline justify-between text-xs text-muted-foreground">
                    <span>Evolução média</span>
                    <DeltaLabel delta={g.exec_delta} days={data?.delta_days} />
                  </div>
                  <ProgressBar value={g.exec_avg} />
                </div>
                <div className="mt-auto flex items-start gap-2 border-t pt-3 text-sm">
                  <Flag size={15} className="mt-0.5 shrink-0 text-muted-foreground" />
                  {g.next_milestone ? (
                    <span className="min-w-0">
                      <span className="line-clamp-1">{g.next_milestone.title}</span>
                      <span className="text-xs text-muted-foreground">{fmtDate(g.next_milestone.date)}</span>
                    </span>
                  ) : (
                    <span className="text-muted-foreground">Sem marco previsto</span>
                  )}
                </div>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
