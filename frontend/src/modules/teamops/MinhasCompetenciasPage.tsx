import { useState } from "react"
import { CheckCircle2, ClipboardCheck, Info } from "lucide-react"
import { Notice, PageHeader } from "@/components/ds"
import CompetenciasForm from "@/modules/teamops/CompetenciasForm"

/** Autoavaliação de competências: cada pessoa do time marca as stacks que conhece e o nível. */
export default function MinhasCompetenciasPage() {
  const [respondidoEm, setRespondidoEm] = useState<string | null>(null)

  return (
    <div className="space-y-5 p-4">
      <PageHeader
        icon={ClipboardCheck}
        color="#0891B2"
        title="Minhas competências"
        description="Marque as tecnologias que você conhece e o seu nível em cada uma. Leva uns 5 minutos."
      />
      {respondidoEm ? (
        <Notice tone="emerald" icon={CheckCircle2}>
          <span>Respostas salvas em {new Date(respondidoEm).toLocaleDateString("pt-BR")}. Você pode atualizar quando quiser.</span>
        </Notice>
      ) : (
        <Notice tone="blue" icon={Info}>
          <span className="min-w-0 flex-1">
            As respostas montam o mapa de competências do time: ajudam a achar quem pode apoiar cada projeto e onde
            falta backup. Responda pelo que você faz hoje, não pelo cargo. Deixe "Não conheço" no que não usa.
          </span>
        </Notice>
      )}
      <CompetenciasForm onSaved={(c) => setRespondidoEm(c.respondido_em)} />
    </div>
  )
}
