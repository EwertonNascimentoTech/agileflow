import { useEffect, useState } from "react"
import { ChevronDown, ChevronRight, MessageSquareText, RefreshCw, Settings2 } from "lucide-react"

import { rtdApi, type PlanoEpa, type PlanoEpaAcao, type PlanoEpaAcomp, type PlanosEpaResponse } from "@/api/rtd"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Skeleton } from "@/components/ui/skeleton"
import { toast } from "@/lib/toast"

// Paleta EPA/FIEA (mesma dos gráficos de indicadores).
const NAVY = "#0d3c78"
const LIGHT = "#35b3e7"

const STATUS_LABEL: Record<PlanoEpaAcao["status"], { label: string; cls: string }> = {
  concluido: { label: "Concluído", cls: "text-emerald-600" },
  em_andamento: { label: "Em andamento", cls: "text-amber-600" },
  planejado: { label: "Planejado", cls: "text-blue-900" },
  atrasado: { label: "Atrasado", cls: "text-destructive" },
  suspenso: { label: "Suspenso", cls: "text-muted-foreground" },
  outro: { label: "—", cls: "text-muted-foreground" },
}

function fmtData(iso: string | null): string {
  if (!iso) return "—"
  const d = new Date(`${iso}T12:00:00`)
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString("pt-BR")
}

function BarraExecucao({ label, cor, done, total, pct }: {
  label: string; cor: string; done: number; total: number; pct: number | null
}) {
  return (
    <div className="flex items-center gap-2">
      <div className="relative h-9 flex-1 overflow-hidden rounded bg-slate-100">
        <div
          className="flex h-full items-center justify-between rounded px-2 text-[11px] font-bold text-white"
          style={{ width: `${Math.max(pct ?? 0, 8)}%`, background: cor }}
          title={label}
        >
          <span>{done}/{total}</span>
          <span>{pct != null ? `${pct.toFixed(0)}%` : "—"}</span>
        </div>
      </div>
    </div>
  )
}

function PlanoCard({ plano }: { plano: PlanoEpa }) {
  // Minimizado por padrão: só identificação + barras; expandir mostra a tabela de ações.
  const [expandido, setExpandido] = useState(false)
  // Tooltip GRANDE e centralizado com os acompanhamentos da ação sob o mouse.
  const [acompAtivo, setAcompAtivo] = useState<{ titulo: string; itens: PlanoEpaAcomp[] } | null>(null)
  if (plano.erro) {
    return (
      <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
        <b>Plano {plano.codigo}:</b> {plano.erro}
      </div>
    )
  }
  return (
    <div className="overflow-hidden rounded-xl border bg-background shadow-sm">
      <button
        type="button"
        onClick={() => setExpandido((v) => !v)}
        className="grid w-full gap-4 p-4 text-left transition-colors hover:bg-slate-50 md:grid-cols-[240px_1fr]"
        title={expandido ? "Minimizar ações" : `Expandir ações (${plano.acoes.length})`}
      >
        {/* Identificação do plano (coluna esquerda, padrão EPA) */}
        <div className="flex items-start gap-1.5">
          {expandido
            ? <ChevronDown className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
            : <ChevronRight className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />}
          <div>
            <p className="text-[11px] font-black uppercase tracking-wide text-blue-900">
              Plano {plano.codigo}:
            </p>
            <p className="mt-0.5 text-xs font-semibold uppercase leading-snug text-sky-600">
              {plano.titulo}
            </p>
            <p className="mt-1 text-[10px] text-muted-foreground">{plano.acoes.length} ação(ões)</p>
          </div>
        </div>
        {/* Barras de execução */}
        <div className="space-y-2">
          <div className="flex flex-wrap gap-4 text-[11px] font-semibold text-muted-foreground">
            <span className="inline-flex items-center gap-1.5">
              <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: NAVY }} />
              Execução até o período
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: LIGHT }} />
              Execução total do plano
            </span>
          </div>
          {plano.execucao_periodo && (
            <BarraExecucao label="Execução até o período" cor={NAVY}
              done={plano.execucao_periodo.concluidas} total={plano.execucao_periodo.total}
              pct={plano.execucao_periodo.pct} />
          )}
          {plano.execucao_total && (
            <BarraExecucao label="Execução total do plano" cor={LIGHT}
              done={plano.execucao_total.concluidas} total={plano.execucao_total.total}
              pct={plano.execucao_total.pct} />
          )}
        </div>
      </button>

      {/* Tabela de ações (padrão do quadro EPA) — só quando expandido */}
      {expandido && plano.acoes.length > 0 && (
        <div className="overflow-x-auto border-t">
          <table className="w-full text-xs">
            <thead>
              <tr className="text-left uppercase tracking-wide text-white" style={{ background: LIGHT }}>
                <th className="px-3 py-2 font-bold">{plano.codigo}: {plano.titulo}</th>
                <th className="px-3 py-2 text-center font-bold">Status</th>
                <th className="px-3 py-2 text-center font-bold">Responsável</th>
                <th className="px-3 py-2 text-center font-bold">Prazo</th>
                <th className="px-3 py-2 text-center font-bold">Acomp.</th>
              </tr>
            </thead>
            <tbody>
              {plano.acoes.map((a, i) => (
                <tr key={i}
                  className={`border-t ${a.status === "suspenso" ? "bg-slate-100/70 opacity-70" : i % 2 === 0 ? "bg-sky-50/40" : "bg-background"}`}>
                  <td className="px-3 py-2 font-medium text-blue-950">{a.titulo}</td>
                  <td className={`px-3 py-2 text-center font-semibold ${STATUS_LABEL[a.status].cls}`}
                    title={
                      a.status === "suspenso"
                        ? "Suspensa — fora do cálculo de execução"
                        : a.status === "atrasado" && a.status_raw
                          ? `${a.status_raw} no EPA — prazo vencido dentro do período de referência`
                          : a.status_raw ?? undefined
                    }>
                    {STATUS_LABEL[a.status].label}
                  </td>
                  <td className="px-3 py-2 text-center">{a.responsavel ?? "—"}</td>
                  <td className="px-3 py-2 text-center tabular-nums">{fmtData(a.prazo)}</td>
                  <td className="px-3 py-2 text-center">
                    <span
                      className="inline-flex cursor-help items-center gap-1"
                      onMouseEnter={() => setAcompAtivo({ titulo: a.titulo, itens: a.acompanhamentos })}
                      onMouseLeave={() => setAcompAtivo(null)}
                    >
                      <MessageSquareText
                        className={`h-4 w-4 ${a.acompanhamentos.length ? "text-sky-600" : "text-slate-300"}`} />
                      {a.acompanhamentos.length > 0 && (
                        <span className="text-[10px] font-bold text-sky-700">{a.acompanhamentos.length}</span>
                      )}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Tooltip grande e centralizado com os acompanhamentos */}
      {acompAtivo && (
        <div className="pointer-events-none fixed inset-0 z-[120] flex items-center justify-center bg-black/20 p-4">
          <div className="max-h-[70vh] w-[min(680px,92vw)] overflow-y-auto rounded-xl border bg-background p-5 shadow-2xl">
            <p className="mb-3 border-b pb-2 text-sm font-bold text-blue-950">
              Acompanhamentos — {acompAtivo.titulo}
            </p>
            {acompAtivo.itens.length === 0 ? (
              <p className="text-sm italic text-muted-foreground">Nenhum acompanhamento registrado no EPA.</p>
            ) : (
              <div className="space-y-3">
                {acompAtivo.itens.map((ac, i) => (
                  <div key={i} className="rounded-lg border bg-sky-50/40 p-3">
                    <p className="mb-1 flex flex-wrap items-center gap-x-2 text-[11px] font-semibold text-sky-800">
                      <span>{ac.colaborador ?? "—"}</span>
                      <span className="text-muted-foreground">·</span>
                      <span className="tabular-nums text-muted-foreground">{ac.data ?? "—"}</span>
                      {ac.horas > 0 && <span className="text-muted-foreground">· {ac.horas}h</span>}
                    </p>
                    <p className="whitespace-pre-line text-xs leading-relaxed text-foreground">{ac.descricao}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

export function RtdPlanosEpaSection({
  reuniaoId, codigosIniciais, readOnly, categoria = "estrategico",
}: {
  reuniaoId: string
  codigosIniciais: number[]
  readOnly: boolean
  /** Slide de Planos Estratégicos ou Planos Táticos (mesma mecânica, listas próprias). */
  categoria?: "estrategico" | "tatico"
}) {
  const [data, setData] = useState<PlanosEpaResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [codigosInput, setCodigosInput] = useState(codigosIniciais.join(", "))
  const [salvando, setSalvando] = useState(false)
  // Configuração de códigos escondida por padrão (os planos vêm do .env).
  const [configAberta, setConfigAberta] = useState(false)

  async function carregar() {
    setLoading(true)
    try {
      const resp = await rtdApi.getPlanosEpa(reuniaoId, categoria)
      setData(resp)
      // Sem códigos salvos na reunião, o backend usa o padrão do .env — refletir no input.
      setCodigosInput((atual) => atual.trim() ? atual : resp.codigos.join(", "))
    } catch {
      toast.error("Falha ao consultar os planos do EPA")
    } finally {
      setLoading(false)
    }
  }
  useEffect(() => { carregar() }, [reuniaoId])

  async function salvarCodigos() {
    const codigos = codigosInput
      .split(/[,;\s]+/)
      .map((s) => parseInt(s, 10))
      .filter((n) => Number.isFinite(n) && n > 0)
    setSalvando(true)
    try {
      await rtdApi.updateReuniao(
        reuniaoId,
        categoria === "tatico" ? { epa_planos_taticos: codigos } : { epa_planos: codigos },
      )
      toast.success("Códigos salvos — consultando o EPA…")
      await carregar()
    } catch {
      toast.error("Falha ao salvar os códigos")
    } finally {
      setSalvando(false)
    }
  }

  return (
    <div className="space-y-4">
      {/* Toolbar discreta: configurar códigos (escondido) + atualizar + foto */}
      <div className="flex items-center justify-between gap-2">
        <div>
          {data?.snapshot_at && (
            <Badge variant="secondary">📸 Foto congelada em {new Date(data.snapshot_at).toLocaleString("pt-BR")}</Badge>
          )}
        </div>
        {!readOnly && (
          <div className="flex gap-1.5">
            <Button size="sm" variant="ghost" onClick={() => setConfigAberta((v) => !v)}
              title="Configurar códigos dos planos">
              <Settings2 className="h-4 w-4 text-muted-foreground" />
            </Button>
            <Button size="sm" variant="ghost" onClick={carregar} disabled={loading} title="Atualizar do EPA">
              <RefreshCw className={`h-4 w-4 text-muted-foreground ${loading ? "animate-spin" : ""}`} />
            </Button>
          </div>
        )}
      </div>

      {/* Configuração dos códigos — escondida por padrão (planos padrão vêm do .env) */}
      {!readOnly && configAberta && (
        <div className="flex flex-wrap items-end gap-2 rounded-lg border border-dashed p-3">
          <div className="min-w-64 flex-1 space-y-1">
            <Label className="text-xs">Códigos dos planos no EPA (separados por vírgula)</Label>
            <Input value={codigosInput} onChange={(e) => setCodigosInput(e.target.value)}
              placeholder="Ex.: 26742, 26743" className="h-9" />
          </div>
          <Button size="sm" onClick={salvarCodigos} disabled={salvando || loading}
            className="bg-blue-800 hover:bg-blue-900">
            {salvando ? "Salvando…" : "Salvar e buscar"}
          </Button>
        </div>
      )}

      {loading ? (
        <div className="space-y-3"><Skeleton className="h-40 w-full" /><Skeleton className="h-40 w-full" /></div>
      ) : data?.erro ? (
        <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">{data.erro}</div>
      ) : !data?.codigos?.length ? (
        <p className="text-sm text-muted-foreground">
          Nenhum plano configurado — informe os códigos dos Planos Estratégicos do EPA acima.
        </p>
      ) : !data?.planos?.length ? (
        <p className="text-sm text-muted-foreground">Sem dados retornados pelo EPA para os códigos informados.</p>
      ) : (
        <div className="space-y-4">
          {data.planos.map((p) => <PlanoCard key={p.codigo} plano={p} />)}
        </div>
      )}
    </div>
  )
}
