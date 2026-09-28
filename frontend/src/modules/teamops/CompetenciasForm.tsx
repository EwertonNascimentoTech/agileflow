import { useEffect, useMemo, useState } from "react"
import { Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Skeleton } from "@/components/ui/skeleton"
import { Textarea } from "@/components/ui/textarea"
import { Card, SectionCard, TABLE } from "@/components/ds"
import {
  teamopsApi,
  STACK_LEVEL_HINTS,
  STACK_LEVEL_LABELS,
  STACK_LEVEL_ORDER,
  STACK_LEVEL_SHORT,
  type Competencias,
  type Stack,
  type StackCategory,
  type StackLevel,
} from "@/api/teamops"
import { toast } from "@/lib/toast"

type Respostas = Record<string, StackLevel | null>

function errMsg(err: unknown, fallback: string): string {
  const d = (err as { response?: { data?: { detail?: unknown } } })?.response?.data?.detail
  return typeof d === "string" ? d : fallback
}

/** Legenda da escala: a mesma régua para todo mundo, para as respostas serem comparáveis. */
export function EscalaDominio() {
  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      {STACK_LEVEL_ORDER.map((lv, i) => (
        <div key={lv} className="flex gap-3 rounded-xl border bg-card px-4 py-3">
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-sm font-semibold text-primary">
            {i + 1}
          </span>
          <div className="min-w-0">
            <p className="text-sm font-semibold">{STACK_LEVEL_LABELS[lv]}</p>
            <p className="text-xs text-muted-foreground">{STACK_LEVEL_HINTS[lv]}</p>
          </div>
        </div>
      ))}
    </div>
  )
}

/** Seletor de nível de uma stack: "Não conheço" + os 4 níveis. */
function NivelPicker({ stackName, value, onChange }: {
  stackName: string; value: StackLevel | null; onChange: (v: StackLevel | null) => void
}) {
  const opcoes: Array<{ v: StackLevel | null; n: string; label: string; title: string }> = [
    { v: null, n: "", label: "Não conheço", title: "Não conheço" },
    ...STACK_LEVEL_ORDER.map((lv, i) => ({
      v: lv, n: String(i + 1), label: STACK_LEVEL_SHORT[lv], title: `${STACK_LEVEL_LABELS[lv]}: ${STACK_LEVEL_HINTS[lv]}`,
    })),
  ]
  return (
    <div role="radiogroup" aria-label={`Nível em ${stackName}`} className="grid grid-cols-5 gap-1 rounded-lg bg-muted/60 p-1">
      {opcoes.map((o) => {
        const ativo = value === o.v
        return (
          <button
            key={o.v ?? "nenhum"}
            type="button"
            role="radio"
            aria-checked={ativo}
            title={o.title}
            onClick={() => onChange(o.v)}
            className={`flex min-h-9 items-center justify-center gap-1 rounded-md px-1.5 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
              ativo
                ? o.v ? "bg-primary text-primary-foreground shadow-sm" : "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:bg-background/70 hover:text-foreground"
            }`}
          >
            {o.n && <span className="tabular-nums">{o.n}</span>}
            <span className={o.n ? "hidden sm:inline" : ""}>{o.label}</span>
          </button>
        )
      })}
    </div>
  )
}

/**
 * Formulário de competências: a pessoa marca, por stack ativa do catálogo, se conhece e em que
 * nível. Sem `personId` responde a pessoa logada; com `personId` o gestor preenche por alguém.
 */
export default function CompetenciasForm({ personId, onSaved }: {
  personId?: string
  onSaved?: (c: Competencias) => void
}) {
  const [stacks, setStacks] = useState<Stack[]>([])
  const [categories, setCategories] = useState<StackCategory[]>([])
  const [atual, setAtual] = useState<Competencias | null>(null)
  const [respostas, setRespostas] = useState<Respostas>({})
  const [outras, setOutras] = useState("")
  const [loading, setLoading] = useState(true)
  const [erro, setErro] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [dirty, setDirty] = useState(false)

  useEffect(() => {
    let vivo = true
    Promise.all([
      teamopsApi.listStacks({ active_only: true }),
      teamopsApi.listStackCategories(),
      teamopsApi.getCompetencias(personId),
    ]).then(([s, c, comp]) => {
      if (!vivo) return
      setStacks(s)
      setCategories(c)
      setAtual(comp)
      setRespostas(Object.fromEntries(comp.itens.map((i) => [i.stack_id, i.level])))
      setOutras(comp.outras ?? "")
    }).catch((err) => {
      if (vivo) setErro(errMsg(err, "Não foi possível carregar o formulário."))
    }).finally(() => { if (vivo) setLoading(false) })
    return () => { vivo = false }
  }, [personId])

  const grupos = useMemo(() => {
    const ordem = [...categories].sort((a, b) => a.order - b.order || a.name.localeCompare(b.name, "pt-BR"))
    const out = ordem
      .map((c) => ({ id: c.id, name: c.name, items: stacks.filter((s) => s.category_id === c.id) }))
      .filter((g) => g.items.length > 0)
    const soltas = stacks.filter((s) => !categories.some((c) => c.id === s.category_id))
    if (soltas.length) out.push({ id: "sem", name: "Outras", items: soltas })
    return out
  }, [stacks, categories])

  if (loading) return <Skeleton className="h-96 rounded-2xl" />
  if (erro) return <Card className="p-6 text-sm text-muted-foreground">{erro}</Card>

  const marcadas = Object.values(respostas).filter(Boolean).length

  function marcar(stackId: string, v: StackLevel | null) {
    setRespostas((r) => ({ ...r, [stackId]: v }))
    setDirty(true)
  }

  async function salvar() {
    setSaving(true)
    try {
      const itens = Object.entries(respostas)
        .filter(([sid, lv]) => lv && stacks.some((s) => s.id === sid))
        .map(([stack_id, level]) => ({ stack_id, level: level as StackLevel }))
      const res = await teamopsApi.saveCompetencias({ itens, outras: outras.trim() || null }, personId)
      setAtual(res)
      setDirty(false)
      toast.success(personId ? `Respostas de ${res.full_name} salvas.` : "Respostas salvas. Obrigado!")
      onSaved?.(res)
    } catch (err) {
      toast.error(errMsg(err, "Erro ao salvar as respostas."))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-4">
      <EscalaDominio />

      {grupos.map((g) => (
        <SectionCard key={g.id} title={g.name} subtitle={`${g.items.length} stack${g.items.length === 1 ? "" : "s"}`} flush>
          <ul>
            {g.items.map((s) => (
              <li key={s.id} className={`${TABLE.tr} flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:justify-between`}>
                <span className="text-sm font-medium">{s.name}</span>
                <div className="w-full sm:w-[27rem] sm:shrink-0">
                  <NivelPicker stackName={s.name} value={respostas[s.id] ?? null} onChange={(v) => marcar(s.id, v)} />
                </div>
              </li>
            ))}
          </ul>
        </SectionCard>
      ))}

      <Card className="space-y-2 p-5">
        <Label htmlFor="competencias-outras">Outras tecnologias</Label>
        <p className="text-xs text-muted-foreground">
          Domina alguma tecnologia que não está na lista? Escreva aqui com o nível (ex.: Java: faço sozinho; Flutter: conheço).
        </p>
        <Textarea
          id="competencias-outras" rows={3} maxLength={2000} value={outras}
          onChange={(e) => { setOutras(e.target.value); setDirty(true) }}
        />
      </Card>

      <div className="sticky bottom-0 z-10 flex flex-wrap items-center justify-between gap-3 rounded-2xl border bg-background/95 px-4 py-3 shadow-sm backdrop-blur">
        <p className="text-sm text-muted-foreground">
          <strong className="font-semibold text-foreground">{marcadas}</strong> stack{marcadas === 1 ? "" : "s"} marcada{marcadas === 1 ? "" : "s"}
          {atual?.respondido_em && !dirty && <> · respondido em {new Date(atual.respondido_em).toLocaleDateString("pt-BR")}</>}
          {dirty && <> · alterações não salvas</>}
        </p>
        <Button onClick={() => void salvar()} disabled={saving}>
          {saving && <Loader2 size={14} className="mr-1.5 animate-spin" />}
          Salvar respostas
        </Button>
      </div>
    </div>
  )
}
