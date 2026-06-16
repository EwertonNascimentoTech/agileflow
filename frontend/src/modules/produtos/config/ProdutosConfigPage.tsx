import { EmptyState } from "@/components/EmptyState"
import { Settings2 } from "lucide-react"

export default function ProdutosConfigPage() {
  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-bold">Configurações</h2>
        <p className="text-sm text-muted-foreground">Parâmetros do módulo de Produtos.</p>
      </div>
      <EmptyState
        icon={Settings2}
        title="Sem configurações por enquanto"
        description="As áreas vêm do módulo de Times (teamops). Categorias de documento e outros parâmetros entram aqui no futuro."
      />
    </div>
  )
}
