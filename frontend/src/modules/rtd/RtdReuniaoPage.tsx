import { useEffect, useState } from "react"
import { useNavigate, useParams } from "react-router-dom"
import { ArrowLeft, ChevronLeft, ChevronRight, Gavel } from "lucide-react"

import { rtdApi, type PersonMini, type ReuniaoReport } from "@/api/rtd"
import { RtdIndicadoresSection } from "@/modules/rtd/RtdIndicadoresSection"
import { RtdPlanosEpaSection } from "@/modules/rtd/RtdPlanosEpaSection"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { toast } from "@/lib/toast"


function fmt(iso: string | null | undefined): string {
  if (!iso) return "—"
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "2-digit" })
}


// Slides da apresentação (navegação por steps; ← → no teclado).
const SLIDES = [
  "Capa",
  "1. Indicadores Estratégicos",
  "2. Planos Estratégicos",
  "3. Indicadores Táticos",
  "4. Planos Táticos",
]

/** Capa no padrão visual FIEA: formas azuis em diagonal + título em destaque. */
function CapaSlide({ titulo, competencia, data }: { titulo: string; competencia: string; data: string | null }) {
  const dataLabel = data
    ? new Date(`${data}T12:00:00`).toLocaleDateString("pt-BR", { day: "numeric", month: "long", year: "numeric" })
    : competencia
  return (
    <div className="relative min-h-[70vh] overflow-hidden rounded-xl border bg-gradient-to-br from-slate-100 via-white to-slate-50">
      {/* Formas diagonais azuis (padrão da capa institucional) */}
      <div className="pointer-events-none absolute inset-y-0 right-0 w-3/5">
        <div className="absolute -right-20 top-[-15%] h-[140%] w-64 -skew-x-12 bg-gradient-to-b from-sky-300 via-sky-500 to-blue-800 opacity-90" />
        <div className="absolute right-32 top-[-25%] h-[75%] w-36 -skew-x-12 bg-gradient-to-b from-blue-400 to-blue-800 opacity-70" />
        <div className="absolute bottom-[-15%] right-48 h-[65%] w-52 -skew-x-12 bg-gradient-to-t from-sky-500 to-sky-200 opacity-60" />
        <div className="absolute -right-2 bottom-[-10%] h-[45%] w-24 -skew-x-12 bg-gradient-to-t from-blue-900 to-blue-500 opacity-80" />
      </div>

      <div className="relative z-10 flex min-h-[70vh] flex-col justify-between p-8 md:p-12">
        <div>
          <p className="text-sm font-black italic leading-none text-blue-800">Sistema FIEA</p>
          <p className="text-[10px] font-semibold tracking-widest text-blue-700">SESI · SENAI · IEL</p>
        </div>
        <div>
          <h1 className="font-black italic leading-[0.95]">
            <span className="block text-5xl text-sky-500 md:text-7xl">REUNIÃO</span>
            <span className="block text-4xl text-blue-900 md:text-6xl">TOMADA DE</span>
            <span className="block text-4xl text-blue-900 md:text-6xl">DECISÃO</span>
          </h1>
          <p className="mt-4 text-sm font-semibold uppercase tracking-[0.35em] text-sky-600">
            {titulo || "Tecnologias Digitais"}
          </p>
        </div>
        <div className="flex flex-wrap items-end gap-x-10 gap-y-2">
          <div>
            <p className="text-xs font-bold uppercase tracking-wide text-blue-900">Diretoria de Gestão Estratégica</p>
          </div>
          <div>
            <p className="text-[11px] text-muted-foreground">Data</p>
            <p className="text-sm font-bold text-blue-900">{dataLabel}</p>
          </div>
          <div>
            <p className="text-[11px] text-muted-foreground">Competência</p>
            <p className="text-sm font-bold text-blue-900">{competencia}</p>
          </div>
        </div>
      </div>
    </div>
  )
}

function Section({ n, title, children }: { n: string; title: string; children: React.ReactNode }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">
          <span className="mr-2 text-muted-foreground">{n}</span>{title}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">{children}</CardContent>
    </Card>
  )
}

export default function RtdReuniaoPage() {
  const { id = "" } = useParams()
  const navigate = useNavigate()
  const [rep, setRep] = useState<ReuniaoReport | null>(null)
  const [loading, setLoading] = useState(true)
  const [persons, setPersons] = useState<PersonMini[]>([])
  const [closing, setClosing] = useState(false)
  const [slide, setSlide] = useState(0)


  async function load() {
    setLoading(true)
    try {
      setRep(await rtdApi.getReport(id))
    } catch {
      toast.error("Falha ao carregar o relatório da reunião")
    } finally {
      setLoading(false)
    }
  }
  useEffect(() => { if (id) load() }, [id])
  useEffect(() => { rtdApi.listPersons().then(setPersons).catch(() => setPersons([])) }, [])

  // Navegação por teclado (← →), exceto quando digitando em campos.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const tag = (e.target as HTMLElement | null)?.tagName
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return
      if (e.key === "ArrowRight") setSlide((s) => Math.min(s + 1, SLIDES.length - 1))
      if (e.key === "ArrowLeft") setSlide((s) => Math.max(s - 1, 0))
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [])

  async function alterarStatus(fechar: boolean) {
    const msg = fechar
      ? "Fechar a reunião congela a foto dos indicadores e bloqueia edições. Continuar?"
      : "Reabrir a reunião volta a calcular os indicadores ao vivo e libera edições. Continuar?"
    if (!confirm(msg)) return
    setClosing(true)
    try {
      await rtdApi.updateReuniao(id, { status: fechar ? "fechada" : "realizada" })
      toast.success(fechar ? "Reunião fechada — foto congelada." : "Reunião reaberta.")
      await load()
    } catch {
      toast.error("Falha ao alterar o status da reunião")
    } finally {
      setClosing(false)
    }
  }

  if (loading) {
    return <div className="mx-auto max-w-6xl space-y-4 p-4 md:p-6">
      <Skeleton className="h-16 w-full" /><Skeleton className="h-48 w-full" /><Skeleton className="h-48 w-full" />
    </div>
  }
  if (!rep) return null

  const { meta, panorama } = rep

  return (
    <div className="mx-auto max-w-6xl space-y-5 p-4 md:p-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div>
          <button onClick={() => navigate("/app/modules/rtd/reunioes")}
            className="mb-1 inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
            <ArrowLeft className="h-3.5 w-3.5" /> Reuniões
          </button>
          <h1 className="flex items-center gap-2 text-xl font-semibold">
            <Gavel className="h-5 w-5" /> {String(meta.titulo)}
          </h1>
          <p className="text-sm text-muted-foreground">
            Competência <b>{String(meta.competencia)}</b> · período {fmt(panorama.periodo.inicio)}–{fmt(panorama.periodo.fim)}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant={meta.status === "fechada" ? "success" : "secondary"}>{String(meta.status)}</Badge>
          {meta.status === "fechada" ? (
            <Button variant="outline" size="sm" onClick={() => alterarStatus(false)} disabled={closing}>
              {closing ? "…" : "Reabrir reunião"}
            </Button>
          ) : (
            <Button variant="outline" size="sm" onClick={() => alterarStatus(true)} disabled={closing}>
              {closing ? "…" : "Fechar reunião"}
            </Button>
          )}
        </div>
      </div>

      {/* Stepper da apresentação */}
      <div className="flex flex-wrap items-center gap-1.5">
        {SLIDES.map((label, i) => (
          <button
            key={label}
            type="button"
            onClick={() => setSlide(i)}
            className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors ${
              slide === i
                ? "border-blue-800 bg-blue-800 text-white"
                : "bg-background text-muted-foreground hover:bg-muted"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Slide 0 — Capa */}
      <div className={slide === 0 ? "" : "hidden"}>
        <CapaSlide
          titulo={String(meta.titulo)}
          competencia={String(meta.competencia)}
          data={(meta.data_realizacao as string | null) ?? null}
        />
      </div>

      {/* Slide 2 — §2 Planos Estratégicos (EPA) */}
      <div className={slide === 2 ? "" : "hidden"}>
      <Section n="2." title="Plano(s) Estratégico(s)">
        <RtdPlanosEpaSection
          reuniaoId={id}
          codigosIniciais={(meta.epa_planos as number[] | null) ?? []}
          readOnly={meta.status === "fechada"}
        />
      </Section>
      </div>

      {/* Slide 1 — §1 Indicadores Estratégicos */}
      <div className={slide === 1 ? "" : "hidden"}>
      <Section n="1." title="Acompanhamento dos Indicadores Estratégicos">
        <RtdIndicadoresSection
          detalhes={rep.indicadores_detalhe}
          reuniaoId={id}
          readOnly={meta.status === "fechada"}
          snapshotAt={(meta.snapshot_at as string | null) ?? null}
          persons={persons}
          onSaved={load}
          categoria="estrategico"
        />
      </Section>
      </div>

      {/* Slide 3 — §3 Indicadores Táticos */}
      <div className={slide === 3 ? "" : "hidden"}>
      <Section n="3." title="Acompanhamento dos Indicadores Táticos">
        <RtdIndicadoresSection
          detalhes={rep.indicadores_detalhe}
          reuniaoId={id}
          readOnly={meta.status === "fechada"}
          snapshotAt={(meta.snapshot_at as string | null) ?? null}
          persons={persons}
          onSaved={load}
          categoria="tatico"
        />
      </Section>
      </div>

      {/* Slide 4 — §4 Planos Táticos (EPA) */}
      <div className={slide === 4 ? "" : "hidden"}>
      <Section n="4." title="Plano(s) Tático(s)">
        <RtdPlanosEpaSection
          reuniaoId={id}
          codigosIniciais={(meta.epa_planos_taticos as number[] | null) ?? []}
          readOnly={meta.status === "fechada"}
          categoria="tatico"
        />
      </Section>
      </div>

      {/* Navegação da apresentação */}
      <div className="flex items-center justify-between border-t pt-3">
        <Button variant="outline" size="sm" disabled={slide === 0} onClick={() => setSlide((s) => s - 1)}>
          <ChevronLeft className="mr-1 h-4 w-4" /> Anterior
        </Button>
        <span className="text-xs text-muted-foreground">
          {slide + 1} / {SLIDES.length} · use ← → para navegar
        </span>
        <Button size="sm" disabled={slide === SLIDES.length - 1}
          className="bg-blue-800 hover:bg-blue-900"
          onClick={() => setSlide((s) => s + 1)}>
          Próximo <ChevronRight className="ml-1 h-4 w-4" />
        </Button>
      </div>

    </div>
  )
}
