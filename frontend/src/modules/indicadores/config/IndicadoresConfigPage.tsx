import { Card } from "@/components/ui/card"

export default function IndicadoresConfigPage() {
  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-bold">Configurações — Indicadores</h2>
        <p className="text-sm text-muted-foreground">Parâmetros do módulo de indicadores.</p>
      </div>
      <Card className="p-6 text-sm text-muted-foreground">
        As regras de status seguem o padrão institucional:
        <ul className="mt-2 list-disc space-y-1 pl-5">
          <li><strong>Quanto maior melhor</strong>: ≥ meta = Atingido; 80%–99,99% = Em atenção; &lt; 80% = Não atingido.</li>
          <li><strong>Quanto menor melhor</strong>: ≤ meta = Atingido; até 20% acima = Em atenção; mais de 20% acima = Não atingido.</li>
          <li><strong>Faixa ideal</strong>: dentro de [mín, máx] = Atingido; até a tolerância % fora = Em atenção; além disso = Não atingido.</li>
        </ul>
        <p className="mt-3">A tolerância da faixa ideal é configurada por indicador no cadastro.</p>
      </Card>
    </div>
  )
}
