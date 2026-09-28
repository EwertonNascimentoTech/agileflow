import { useEffect, useMemo, useState } from "react"
import { AlertTriangle, Gauge, Loader2, RotateCcw, Save, Settings2, SlidersHorizontal } from "lucide-react"

import { produtosApi, type HealthConfigResponse } from "@/api/produtos"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Skeleton } from "@/components/ui/skeleton"
import { Notice, PageHeader, Pill, SectionCard } from "@/components/ds"
import { toast } from "@/lib/toast"

export default function ProdutosConfigPage() {
  const [cfg, setCfg] = useState<HealthConfigResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [weights, setWeights] = useState<Record<string, number>>({})
  const [limSaud, setLimSaud] = useState(75)
  const [limAten, setLimAten] = useState(40)

  function hydrate(c: HealthConfigResponse) {
    setCfg(c)
    setWeights(Object.fromEntries(c.checks.map((k) => [k.code, k.weight])))
    setLimSaud(c.limiar_saudavel)
    setLimAten(c.limiar_atencao)
  }

  useEffect(() => {
    produtosApi.getHealthConfig().then(hydrate).catch(() => toast.error("Falha ao carregar configuração."))
      .finally(() => setLoading(false))
  }, [])

  const totalPeso = useMemo(() => Object.values(weights).reduce((a, b) => a + (Number(b) || 0), 0), [weights])
  const limiarInvalido = limAten >= limSaud

  async function save() {
    if (limiarInvalido) { toast.error("O limiar de 'Atenção' deve ser menor que o de 'Saudável'."); return }
    setSaving(true)
    try {
      const updated = await produtosApi.updateHealthConfig({ weights, limiar_saudavel: limSaud, limiar_atencao: limAten })
      hydrate(updated)
      toast.success("Configuração salva. Os scores serão recalculados automaticamente.")
    } catch (e) {
      toast.error((e as { response?: { data?: { detail?: string } } })?.response?.data?.detail || "Falha ao salvar.")
    } finally { setSaving(false) }
  }

  function restaurarPadrao() {
    if (!cfg) return
    setWeights(Object.fromEntries(cfg.checks.map((k) => [k.code, k.default_weight])))
    setLimSaud(75); setLimAten(40)
    toast.info("Padrões restaurados — clique em Salvar para aplicar.")
  }

  const header = (
    <PageHeader
      icon={Settings2}
      color="#7C3AED"
      title="Configurações"
      description="Parâmetros do módulo de Produtos."
    />
  )

  if (loading) {
    return (
      <div className="space-y-5">
        {header}
        <Skeleton className="h-80 rounded-2xl" />
      </div>
    )
  }

  // Faixas da régua de classificação (só para visualizar os limiares; 0–100).
  const clamp = (v: number) => Math.max(0, Math.min(100, v))
  const aten = clamp(limAten)
  const saud = clamp(limSaud)

  return (
    <div className="space-y-5">
      {header}

      <div className="grid items-start gap-4 xl:grid-cols-[1.5fr_1fr]">
        <SectionCard
          title="Índice de Saúde — pesos"
          subtitle="Peso de cada critério na nota do produto."
          icon={Gauge}
          right={cfg && !cfg.is_customizado ? <Pill tone="slate">usando valores padrão</Pill> : undefined}
          flush
        >
          <p className="px-5 py-4 text-sm text-muted-foreground">
            Cada critério tem um peso. A nota de um produto é a soma dos pesos que ele atende ÷ soma dos pesos
            que se aplicam a ele × 100. Critérios que não se aplicam não entram na conta.
          </p>
          <ul className="divide-y border-t">
            {cfg?.checks.map((k) => (
              <li key={k.code} className="flex items-center gap-3 px-5 py-3 transition-colors hover:bg-muted/40">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium">{k.label}</p>
                  <p className="text-xs text-muted-foreground">{k.aplicabilidade} · padrão {k.default_weight}</p>
                </div>
                <Input type="number" min={0} max={100} className="h-10 w-24 text-right tabular-nums"
                  aria-label={`Peso de ${k.label}`}
                  value={weights[k.code] ?? 0}
                  onChange={(e) => setWeights((w) => ({ ...w, [k.code]: Math.max(0, Number(e.target.value) || 0) }))} />
              </li>
            ))}
          </ul>
          <div className="flex items-center justify-between gap-3 border-t bg-muted/40 px-5 py-3 text-sm">
            <span className="font-medium text-muted-foreground">Soma dos pesos (todos os critérios)</span>
            <span className="text-base font-semibold tabular-nums">{totalPeso}</span>
          </div>
        </SectionCard>

        <SectionCard
          title="Limiares de classificação"
          subtitle="Faixas de score para Saudável, Atenção e Crítico."
          icon={SlidersHorizontal}
        >
          <div className="space-y-5">
            <div className="space-y-1.5">
              <Label htmlFor="lim-saudavel" className="text-sm">Limiar "Saudável" (≥)</Label>
              <Input id="lim-saudavel" type="number" min={1} max={100} className="h-10"
                value={limSaud} onChange={(e) => setLimSaud(Number(e.target.value) || 0)} />
              <p className="text-xs text-muted-foreground">
                Score ≥ este valor → <span className="font-medium text-emerald-600 dark:text-emerald-400">Saudável</span>.
              </p>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="lim-atencao" className="text-sm">Limiar "Atenção" (≥)</Label>
              <Input id="lim-atencao" type="number" min={0} max={99} className="h-10"
                value={limAten} onChange={(e) => setLimAten(Number(e.target.value) || 0)} />
              <p className="text-xs text-muted-foreground">
                Entre os dois → <span className="font-medium text-amber-600 dark:text-amber-400">Atenção</span>; abaixo →{" "}
                <span className="font-medium text-red-600 dark:text-red-400">Crítico</span>.
              </p>
            </div>

            {limiarInvalido ? (
              <Notice tone="red" icon={AlertTriangle}>O limiar de "Atenção" deve ser menor que o de "Saudável".</Notice>
            ) : (
              <div className="space-y-1.5" aria-hidden>
                <div className="flex h-2.5 overflow-hidden rounded-full">
                  <div className="bg-red-500" style={{ width: `${aten}%` }} />
                  <div className="bg-amber-500" style={{ width: `${saud - aten}%` }} />
                  <div className="bg-emerald-500" style={{ width: `${100 - saud}%` }} />
                </div>
                <div className="flex justify-between text-xs tabular-nums text-muted-foreground">
                  <span>0</span>
                  <span>Crítico &lt; {limAten} ≤ Atenção &lt; {limSaud} ≤ Saudável</span>
                  <span>100</span>
                </div>
              </div>
            )}
          </div>
        </SectionCard>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Button onClick={() => void save()} disabled={saving || limiarInvalido} className="h-10 gap-1.5">
          {saving ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} />} Salvar
        </Button>
        <Button variant="outline" onClick={restaurarPadrao} className="h-10 gap-1.5"><RotateCcw size={15} /> Restaurar padrão</Button>
      </div>
    </div>
  )
}
