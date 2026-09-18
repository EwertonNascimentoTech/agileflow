import { useEffect, useState } from "react"
import { useParams } from "react-router-dom"
import { ChevronLeft, ChevronRight, Link2Off } from "lucide-react"

import { publicRtdApi, type PublicRtdView } from "@/api/publicRtd"
import { RtdIndicadoresSection } from "@/modules/rtd/RtdIndicadoresSection"
import RtdLoadingScreen from "@/modules/rtd/RtdLoadingScreen"
import { RtdPlanosEpaSection } from "@/modules/rtd/RtdPlanosEpaSection"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"

const SLIDES = [
  "Capa",
  "1. Indicadores Estratégicos",
  "2. Planos Estratégicos",
  "3. Indicadores Táticos",
  "4. Planos Táticos",
]

function CapaSlide({ titulo, competencia, data }: { titulo: string; competencia: string; data: string | null }) {
  const dataLabel = data
    ? new Date(`${data}T12:00:00`).toLocaleDateString("pt-BR", { day: "numeric", month: "long", year: "numeric" })
    : competencia
  return (
    <div className="relative min-h-[70vh] overflow-hidden rounded-xl border bg-gradient-to-br from-slate-100 via-white to-slate-50">
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

export default function PublicRtdPage() {
  const { token = "" } = useParams()
  const [data, setData] = useState<PublicRtdView | null>(null)
  const [error, setError] = useState(false)
  const [loading, setLoading] = useState(true)
  const [slide, setSlide] = useState(0)

  useEffect(() => {
    if (!token) return
    setLoading(true)
    publicRtdApi.view(token)
      .then(setData)
      .catch(() => setError(true))
      .finally(() => setLoading(false))
  }, [token])

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "ArrowRight") setSlide((s) => Math.min(s + 1, SLIDES.length - 1))
      if (e.key === "ArrowLeft") setSlide((s) => Math.max(s - 1, 0))
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [])

  if (loading) {
    return <RtdLoadingScreen />
  }

  if (error || !data) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-3 p-6 text-center">
        <Link2Off className="h-10 w-10 text-muted-foreground" />
        <h1 className="text-lg font-semibold">Link inválido ou expirado</h1>
        <p className="max-w-md text-sm text-muted-foreground">
          Esta RTD não está disponível para visualização pública. Peça um novo link a quem compartilhou.
        </p>
      </div>
    )
  }

  const { meta } = data

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="mx-auto max-w-6xl space-y-5 p-4 md:p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Visualização pública · {data.tenant_name}
            </p>
            <h1 className="text-xl font-semibold text-blue-950">{meta.titulo}</h1>
            <p className="text-sm text-muted-foreground">
              Competência <b>{meta.competencia}</b>
              {meta.snapshot_at ? " · foto congelada" : " · dados ao vivo"}
            </p>
          </div>
          <Badge variant="secondary">Somente leitura</Badge>
        </div>

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

        <div className={slide === 0 ? "" : "hidden"}>
          <CapaSlide
            titulo={meta.titulo}
            competencia={meta.competencia}
            data={meta.data_realizacao}
          />
        </div>

        <div className={slide === 1 ? "" : "hidden"}>
          <Section n="1." title="Acompanhamento dos Indicadores Estratégicos">
            <RtdIndicadoresSection
              detalhes={data.indicadores_detalhe}
              reuniaoId="public"
              readOnly
              snapshotAt={meta.snapshot_at}
              persons={[]}
              onSaved={() => {}}
              categoria="estrategico"
            />
          </Section>
        </div>

        <div className={slide === 2 ? "" : "hidden"}>
          <Section n="2." title="Plano(s) Estratégico(s)">
            <RtdPlanosEpaSection
              reuniaoId="public"
              codigosIniciais={data.planos_estrategicos.codigos ?? []}
              readOnly
              initialData={data.planos_estrategicos}
            />
          </Section>
        </div>

        <div className={slide === 3 ? "" : "hidden"}>
          <Section n="3." title="Acompanhamento dos Indicadores Táticos">
            <RtdIndicadoresSection
              detalhes={data.indicadores_detalhe}
              reuniaoId="public"
              readOnly
              snapshotAt={meta.snapshot_at}
              persons={[]}
              onSaved={() => {}}
              categoria="tatico"
            />
          </Section>
        </div>

        <div className={slide === 4 ? "" : "hidden"}>
          <Section n="4." title="Plano(s) Tático(s)">
            <RtdPlanosEpaSection
              reuniaoId="public"
              codigosIniciais={data.planos_taticos.codigos ?? []}
              readOnly
              categoria="tatico"
              initialData={data.planos_taticos}
            />
          </Section>
        </div>

        <div className="flex items-center justify-between border-t pt-3">
          <Button variant="outline" size="sm" disabled={slide === 0} onClick={() => setSlide((s) => s - 1)}>
            <ChevronLeft className="mr-1 h-4 w-4" /> Anterior
          </Button>
          <span className="text-xs text-muted-foreground">
            {slide + 1} / {SLIDES.length} · use ← → para navegar
          </span>
          <Button
            size="sm"
            disabled={slide === SLIDES.length - 1}
            className="bg-blue-800 hover:bg-blue-900"
            onClick={() => setSlide((s) => s + 1)}
          >
            Próximo <ChevronRight className="ml-1 h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  )
}
