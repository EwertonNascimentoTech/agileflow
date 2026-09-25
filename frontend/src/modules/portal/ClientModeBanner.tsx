import { useEffect, useState } from "react"
import { Link } from "react-router-dom"
import { Eye } from "lucide-react"

import type { PortalViewer } from "@/api/portalPortfolio"
import { loadPortfolio } from "@/modules/portal/portfolioMeta"

/** Faixa do "Modo cliente" para a equipe: diz que é a visão do cliente e o que está sendo
 *  mostrado (coordenação vê todos os projetos; PO e dev, os projetos em que atuam). */
export function ClientModeBanner({ backLink = false }: { backLink?: boolean }) {
  const [viewer, setViewer] = useState<PortalViewer | null>(null)
  useEffect(() => {
    let alive = true
    loadPortfolio().then((d) => { if (alive) setViewer(d.viewer) }).catch(() => undefined)
    return () => { alive = false }
  }, [])
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
      <Eye size={16} className="shrink-0 text-primary" />
      <span className="font-medium text-primary">Modo cliente</span>
      <span className="min-w-0 flex-1 text-muted-foreground">
        {viewer?.all
          ? "Você vê o Portal como o cliente vê — como coordenação, com todos os projetos."
          : viewer?.team
            ? "Você vê o Portal como o cliente vê — com os projetos em que é PO ou desenvolvedor e os programas de que é responsável."
            : "Você vê o Portal como o cliente vê — com os projetos em que é cliente."}
      </span>
      {backLink && <Link to="/app/dashboard" className="shrink-0 font-medium text-primary hover:underline">Voltar ao AgileFlow</Link>}
    </div>
  )
}
