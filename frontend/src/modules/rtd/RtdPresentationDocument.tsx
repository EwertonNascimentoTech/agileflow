import type { ReactNode } from "react"
import type { PersonMini, ReuniaoReport } from "@/api/rtd"
import { RtdIndicadoresSection } from "@/modules/rtd/RtdIndicadoresSection"
import { RtdPlanosEpaSection } from "@/modules/rtd/RtdPlanosEpaSection"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"

/** Capa no padrao visual FIEA: formas azuis em diagonal + titulo em destaque. */
export function RtdCapaSlide({
  titulo, competencia, data, print = false,
}: {
  titulo: string
  competencia: string
  data: string | null
  /** Altura fixa de pagina A4 landscape na impressao. */
  print?: boolean
}) {
  const dataLabel = data
    ? new Date(`${data}T12:00:00`).toLocaleDateString("pt-BR", {
        day: "numeric", month: "long", year: "numeric",
      })
    : competencia
  return (
    <div
      className={`relative overflow-hidden rounded-xl border bg-gradient-to-br from-slate-100 via-white to-slate-50 ${
        print ? "min-h-[180mm]" : "min-h-[70vh]"
      }`}
    >
      <div className="pointer-events-none absolute inset-y-0 right-0 w-3/5">
        <div className="absolute -right-20 top-[-15%] h-[140%] w-64 -skew-x-12 bg-gradient-to-b from-sky-300 via-sky-500 to-blue-800 opacity-90" />
        <div className="absolute right-32 top-[-25%] h-[75%] w-36 -skew-x-12 bg-gradient-to-b from-blue-400 to-blue-800 opacity-70" />
        <div className="absolute bottom-[-15%] right-48 h-[65%] w-52 -skew-x-12 bg-gradient-to-t from-sky-500 to-sky-200 opacity-60" />
        <div className="absolute -right-2 bottom-[-10%] h-[45%] w-24 -skew-x-12 bg-gradient-to-t from-blue-900 to-blue-500 opacity-80" />
      </div>

      <div
        className={`relative z-10 flex flex-col justify-between p-8 md:p-12 ${
          print ? "min-h-[180mm]" : "min-h-[70vh]"
        }`}
      >
        <div>
          <p className="text-sm font-black italic leading-none text-blue-800">Sistema FIEA</p>
          <p className="text-[10px] font-semibold tracking-widest text-blue-700">
            SESI {"\u00b7"} SENAI {"\u00b7"} IEL
          </p>
        </div>
        <div>
          <h1 className="font-black italic leading-[0.95]">
            <span className="block text-5xl text-sky-500 md:text-7xl">REUNI{"\u00c3"}O</span>
            <span className="block text-4xl text-blue-900 md:text-6xl">TOMADA DE</span>
            <span className="block text-4xl text-blue-900 md:text-6xl">DECIS{"\u00c3"}O</span>
          </h1>
          <p className="mt-4 text-sm font-semibold uppercase tracking-[0.35em] text-sky-600">
            {titulo || "Tecnologias Digitais"}
          </p>
        </div>
        <div className="flex flex-wrap items-end gap-x-10 gap-y-2">
          <div>
            <p className="text-xs font-bold uppercase tracking-wide text-blue-900">
              Diretoria de Gest{"\u00e3"}o Estrat{"\u00e9"}gica
            </p>
          </div>
          <div>
            <p className="text-[11px] text-muted-foreground">Data</p>
            <p className="text-sm font-bold text-blue-900">{dataLabel}</p>
          </div>
          <div>
            <p className="text-[11px] text-muted-foreground">Compet{"\u00ea"}ncia</p>
            <p className="text-sm font-bold text-blue-900">{competencia}</p>
          </div>
        </div>
      </div>
    </div>
  )
}

function Section({ n, title, children }: { n: string; title: string; children: ReactNode }) {
  return (
    <Card className="rtd-print-section">
      <CardHeader>
        <CardTitle className="text-base">
          <span className="mr-2 text-muted-foreground">{n}</span>{title}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">{children}</CardContent>
    </Card>
  )
}

/**
 * Documento completo da apresentacao RTD (capa + 4 secoes), pronto para
 * window.print() / Salvar como PDF. Cards e planos vem expandidos.
 */
export default function RtdPresentationDocument({
  reuniaoId,
  report,
  persons = [],
}: {
  reuniaoId: string
  report: ReuniaoReport
  persons?: PersonMini[]
}) {
  const { meta } = report

  return (
    <div className="rtd-doc space-y-8">
      <style>{PRINT_CSS}</style>

      <section className="rtd-print-page">
        <RtdCapaSlide
          print
          titulo={String(meta.titulo)}
          competencia={String(meta.competencia)}
          data={(meta.data_realizacao as string | null) ?? null}
        />
      </section>

      <section className="rtd-print-page">
        <Section n="1." title={"Acompanhamento dos Indicadores Estrat\u00e9gicos"}>
          <RtdIndicadoresSection
            detalhes={report.indicadores_detalhe}
            reuniaoId={reuniaoId}
            readOnly
            snapshotAt={(meta.snapshot_at as string | null) ?? null}
            persons={persons}
            onSaved={() => undefined}
            categoria="estrategico"
            defaultExpanded
            hideEmpty
          />
        </Section>
      </section>

      <section className="rtd-print-page">
        <Section n="2." title={"Plano(s) Estrat\u00e9gico(s)"}>
          <RtdPlanosEpaSection
            reuniaoId={reuniaoId}
            codigosIniciais={(meta.epa_planos as number[] | null) ?? []}
            readOnly
            defaultExpanded
            hideEmpty
          />
        </Section>
      </section>

      <section className="rtd-print-page">
        <Section n="3." title={"Acompanhamento dos Indicadores T\u00e1ticos"}>
          <RtdIndicadoresSection
            detalhes={report.indicadores_detalhe}
            reuniaoId={reuniaoId}
            readOnly
            snapshotAt={(meta.snapshot_at as string | null) ?? null}
            persons={persons}
            onSaved={() => undefined}
            categoria="tatico"
            defaultExpanded
            hideEmpty
          />
        </Section>
      </section>

      <section className="rtd-print-page">
        <Section n="4." title={"Plano(s) T\u00e1tico(s)"}>
          <RtdPlanosEpaSection
            reuniaoId={reuniaoId}
            codigosIniciais={(meta.epa_planos_taticos as number[] | null) ?? []}
            readOnly
            categoria="tatico"
            defaultExpanded
            hideEmpty
          />
        </Section>
      </section>
    </div>
  )
}

const PRINT_CSS = `
@media print {
  @page { size: A4 landscape; margin: 10mm; }
  html, body { background: white !important; height: auto !important; overflow: visible !important; }
  .no-print { display: none !important; }
  .fixed.inset-y-0,
  header.flex.h-14 {
    display: none !important;
  }
  .flex.h-screen {
    display: block !important;
    height: auto !important;
    overflow: visible !important;
  }
  .flex.min-h-0.min-w-0.flex-1.flex-col,
  .min-h-0.flex-1.overflow-y-auto {
    overflow: visible !important;
    height: auto !important;
  }
  .rtd-doc .rtd-print-page {
    break-after: page;
    page-break-after: always;
  }
  .rtd-doc .rtd-print-page:last-child {
    break-after: auto;
    page-break-after: auto;
  }
  .rtd-doc .rtd-print-section {
    box-shadow: none !important;
    border-color: #cbd5e1 !important;
  }
}
`
