import { useEffect, useState } from "react"
import { useNavigate } from "react-router-dom"
import * as Icons from "lucide-react"
import { Package, Settings2, Loader2 } from "lucide-react"
import { companyApi, type ActiveModule } from "@/api/company"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { EmptyState } from "@/components/EmptyState"

function resolveIcon(name: string | null | undefined): React.ElementType {
  if (!name) return Package
  const Comp = (Icons as unknown as Record<string, React.ElementType>)[name]
  return Comp ?? Package
}

export default function ModulesPage() {
  const navigate = useNavigate()
  const [active, setActive] = useState<ActiveModule[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    companyApi.getMyTenant()
      .then(t => setActive(t?.active_modules ?? []))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Módulos</h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          Módulos ativos na sua empresa.
        </p>
      </div>

      {loading ? (
        <div className="flex items-center gap-2 text-muted-foreground text-sm">
          <Loader2 size={14} className="animate-spin" /> Carregando…
        </div>
      ) : active.length === 0 ? (
        <EmptyState
          icon={Package}
          title="Nenhum módulo ativo"
          description="Contate o administrador da plataforma para ativar módulos para a sua empresa."
        />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {active.map((m) => {
            const Icon = resolveIcon(m.icon)
            return (
              <Card key={m.slug} className="overflow-hidden">
                <div className="h-1" style={{ backgroundColor: m.color }} />
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between mb-1">
                    <div
                      className="h-9 w-9 rounded-lg flex items-center justify-center"
                      style={{ backgroundColor: `${m.color}1a`, color: m.color }}
                    >
                      <Icon size={18} />
                    </div>
                    <Badge variant="success">Ativo</Badge>
                  </div>
                  <CardTitle className="text-sm">{m.name}</CardTitle>
                </CardHeader>
                <CardContent className="pt-0 space-y-3">
                  {m.description && (
                    <CardDescription className="text-xs">{m.description}</CardDescription>
                  )}
                  <Button
                    variant="outline"
                    size="sm"
                    className="w-full gap-1.5"
                    style={{ color: m.color, borderColor: `${m.color}66` }}
                    onClick={() => navigate(`/app/modules/${m.slug}`)}
                  >
                    <Settings2 size={13} /> Acessar
                  </Button>
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}
    </div>
  )
}
