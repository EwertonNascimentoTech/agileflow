import { useEffect, useState } from "react"
import { useNavigate, useParams } from "react-router-dom"
import { ArrowLeft, ChevronLeft, ChevronRight, ExternalLink, Gavel, Link2, Link2Off, Printer } from "lucide-react"

import { rtdApi, type PersonMini, type ReuniaoReport } from "@/api/rtd"
import { RtdIndicadoresSection } from "@/modules/rtd/RtdIndicadoresSection"
import { RtdPlanosEpaSection } from "@/modules/rtd/RtdPlanosEpaSection"
import { RtdCapaSlide } from "@/modules/rtd/RtdPresentationDocument"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { toast } from "@/lib/toast"


function fmt(iso: string | null | undefined): string {
  if (!iso) return "—"
  // Data pura (YYYY-MM-DD) vira meia-noite UTC no `new Date` — no fuso de Brasília cai no dia
  // anterior (Agosto aparecia 31/07–30/08). Meio-dia local não troca de dia.
  const d = new Date(/^\d{4}-\d{2}-\d{2}$/.test(iso) ? `${iso}T12:00:00` : iso)
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "2-digit" })
}

function erroDaApi(err: unknown): string {
  const e = err as { response?: { data?: { detail?: unknown } } }
  const d = e.response?.data?.detail
  return typeof d === "string" && d.trim() ? d : ""
}

async function copiarTexto(texto: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(texto)
    return true
  } catch {
    try {
      const el = document.createElement("textarea")
      el.value = texto
      el.setAttribute("readonly", "")
      el.style.position = "fixed"
      el.style.left = "-9999px"
      document.body.appendChild(el)
      el.select()
      const ok = document.execCommand("copy")
      document.body.removeChild(el)
      return ok
    } catch {
      return false
    }
  }
}


// Slides da apresentação (navegação por steps; ← → no teclado).
const SLIDES = [
  "Capa",
  "1. Indicadores Estratégicos",
  "2. Planos Estratégicos",
  "3. Indicadores Táticos",
  "4. Planos Táticos",
]

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
  const [publicToken, setPublicToken] = useState<string | null>(null)
  const [sharing, setSharing] = useState(false)


  async function load() {
    setLoading(true)
    try {
      const [report, reuniao] = await Promise.all([
        rtdApi.getReport(id),
        rtdApi.getReuniao(id),
      ])
      setRep(report)
      setPublicToken(reuniao.public_token)
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

  async function copiarLinkPublico() {
    setSharing(true)
    try {
      const out = await rtdApi.generatePublicToken(id)
      setPublicToken(out.public_token)
      const url = `${window.location.origin}${out.path}`
      const copiou = await copiarTexto(url)
      if (copiou) {
        toast.success("Link público copiado — qualquer pessoa com o link pode ver (sem login).")
      } else {
        toast.info(`Link gerado: ${url}`)
      }
    } catch (err) {
      toast.error(erroDaApi(err) || "Falha ao gerar o link público")
    } finally {
      setSharing(false)
    }
  }

  async function revogarLinkPublico() {
    if (!confirm("Revogar o link público? Quem já tiver o endereço não conseguirá mais abrir.")) return
    setSharing(true)
    try {
      await rtdApi.revokePublicToken(id)
      setPublicToken(null)
      toast.success("Link público revogado.")
    } catch (err) {
      toast.error(erroDaApi(err) || "Falha ao revogar o link")
    } finally {
      setSharing(false)
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
        <div className="flex flex-wrap items-center justify-end gap-2">
          <Badge variant={meta.status === "fechada" ? "success" : "secondary"}>{String(meta.status)}</Badge>
          <Button
            variant="outline"
            size="sm"
            onClick={() => navigate(`/app/modules/rtd/reunioes/${id}/pdf`)}
            title="Abrir versão imprimível da apresentação"
          >
            <Printer className="mr-1.5 h-3.5 w-3.5" />
            Gerar PDF
          </Button>
          <Button variant="outline" size="sm" onClick={() => void copiarLinkPublico()} disabled={sharing}
            title="Copiar link para compartilhar sem login">
            <Link2 className="mr-1.5 h-3.5 w-3.5" />
            {sharing ? "…" : publicToken ? "Copiar link" : "Compartilhar"}
          </Button>
          {publicToken && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => window.open(`/p/rtd/${publicToken}`, "_blank")}
              title="Abrir a apresentação pública"
            >
              <ExternalLink className="mr-1.5 h-3.5 w-3.5" />
              Abrir
            </Button>
          )}
          {publicToken && (
            <Button variant="ghost" size="sm" onClick={() => void revogarLinkPublico()} disabled={sharing}
              title="Revogar link público">
              <Link2Off className="h-3.5 w-3.5 text-muted-foreground" />
            </Button>
          )}
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
      {publicToken && (
        <p className="break-all rounded-md border bg-muted/40 px-3 py-2 font-mono text-xs text-muted-foreground">
          {`${typeof window !== "undefined" ? window.location.origin : ""}/p/rtd/${publicToken}`}
        </p>
      )}

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
        <RtdCapaSlide
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
