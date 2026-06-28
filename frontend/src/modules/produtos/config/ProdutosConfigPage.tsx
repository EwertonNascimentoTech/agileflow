import { useEffect, useMemo, useState } from "react"
import { Gauge, Loader2, RotateCcw, Save } from "lucide-react"

import { produtosApi, type HealthConfigResponse } from "@/api/produtos"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Skeleton } from "@/components/ui/skeleton"
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

  if (loading) return <Skeleton className="h-64 w-full" />

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-bold">Configurações</h2>
        <p className="text-sm text-muted-foreground">Parâmetros do módulo de Produtos.</p>
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-base"><Gauge size={18} /> Índice de Saúde — pesos e limiares</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Cada critério tem um peso. A nota de um produto é a soma dos pesos que ele atende ÷ soma dos pesos
            que se aplicam a ele × 100. Critérios que não se aplicam não entram na conta.
          </p>

          {/* Pesos por critério */}
          <div className="divide-y rounded-md border">
            {cfg?.checks.map((k) => (
              <div key={k.code} className="flex items-center gap-3 p-3">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium">{k.label}</p>
                  <p className="text-[11px] text-muted-foreground">{k.aplicabilidade} · padrão {k.default_weight}</p>
                </div>
                <Input type="number" min={0} max={100} className="h-9 w-20 text-right"
                  value={weights[k.code] ?? 0}
                  onChange={(e) => setWeights((w) => ({ ...w, [k.code]: Math.max(0, Number(e.target.value) || 0) }))} />
              </div>
            ))}
            <div className="flex items-center justify-between bg-muted/40 px-3 py-2 text-sm">
              <span className="font-medium text-muted-foreground">Soma dos pesos (todos os critérios)</span>
              <span className="font-semibold tabular-nums">{totalPeso}</span>
            </div>
          </div>

          {/* Limiares de classificação */}
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1">
              <Label className="text-xs">Limiar "Saudável" (≥)</Label>
              <Input type="number" min={1} max={100} className="h-9"
                value={limSaud} onChange={(e) => setLimSaud(Number(e.target.value) || 0)} />
              <p className="text-[11px] text-muted-foreground">Score ≥ este valor → <span className="font-medium text-green-600">Saudável</span>.</p>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Limiar "Atenção" (≥)</Label>
              <Input type="number" min={0} max={99} className="h-9"
                value={limAten} onChange={(e) => setLimAten(Number(e.target.value) || 0)} />
              <p className="text-[11px] text-muted-foreground">Entre os dois → <span className="font-medium text-amber-600">Atenção</span>; abaixo → <span className="font-medium text-red-600">Crítico</span>.</p>
            </div>
          </div>
          {limiarInvalido && <p className="text-xs text-destructive">O limiar de "Atenção" deve ser menor que o de "Saudável".</p>}

          <div className="flex items-center gap-2 pt-1">
            <Button onClick={() => void save()} disabled={saving || limiarInvalido} className="gap-1.5">
              {saving ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} />} Salvar
            </Button>
            <Button variant="outline" onClick={restaurarPadrao} className="gap-1.5"><RotateCcw size={15} /> Restaurar padrão</Button>
            {cfg && !cfg.is_customizado && <span className="text-[11px] text-muted-foreground">usando valores padrão</span>}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
