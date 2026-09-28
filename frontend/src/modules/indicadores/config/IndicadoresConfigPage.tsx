import { Gauge, Info, Settings2 } from "lucide-react"

import { Notice, PageHeader, Pill, SectionCard, TABLE } from "@/components/ds"

// Regras de status do padrão institucional (espelham service.calc_status no backend).
const REGRAS: { polaridade: string; atingido: string; atencao: string; naoAtingido: string }[] = [
  { polaridade: "Quanto maior melhor", atingido: "≥ meta", atencao: "80%–99,99%", naoAtingido: "< 80%" },
  { polaridade: "Quanto menor melhor", atingido: "≤ meta", atencao: "até 20% acima", naoAtingido: "mais de 20% acima" },
  { polaridade: "Faixa ideal", atingido: "dentro de [mín, máx]", atencao: "até a tolerância % fora", naoAtingido: "além disso" },
]

export default function IndicadoresConfigPage() {
  return (
    <div className="space-y-5">
      <PageHeader
        icon={Settings2}
        color="#16A34A"
        title="Configurações — Indicadores"
        description="Parâmetros do módulo de indicadores."
      />

      <SectionCard
        title="Regras de status"
        subtitle="As regras de status seguem o padrão institucional."
        icon={Gauge}
        flush
      >
        <div className={TABLE.wrap}>
          <table className={TABLE.table}>
            <thead className={TABLE.thead}>
              <tr>
                <th className={TABLE.thFirst}>Polaridade</th>
                <th className={TABLE.th}><Pill tone="emerald" dot>Atingido</Pill></th>
                <th className={TABLE.th}><Pill tone="amber" dot>Em atenção</Pill></th>
                <th className={TABLE.th}><Pill tone="red" dot>Não atingido</Pill></th>
              </tr>
            </thead>
            <tbody>
              {REGRAS.map((r) => (
                <tr key={r.polaridade} className={TABLE.tr}>
                  <td className={`${TABLE.tdFirst} font-semibold`}>{r.polaridade}</td>
                  <td className={TABLE.td}>{r.atingido}</td>
                  <td className={TABLE.td}>{r.atencao}</td>
                  <td className={TABLE.td}>{r.naoAtingido}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="border-t p-4">
          <Notice tone="slate" icon={Info}>A tolerância da faixa ideal é configurada por indicador no cadastro.</Notice>
        </div>
      </SectionCard>
    </div>
  )
}
