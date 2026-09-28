import { useEffect, useState } from "react"
import { AlertTriangle, Camera, ChevronDown, ChevronRight, MessageSquareText, RefreshCw, Settings2 } from "lucide-react"

import { rtdApi, type PlanoEpa, type PlanoEpaAcao, type PlanoEpaAcomp, type PlanosEpaResponse } from "@/api/rtd"
import { Notice, Pill, TABLE, type Tone } from "@/components/ds"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Skeleton } from "@/components/ui/skeleton"
import { toast } from "@/lib/toast"

// Paleta EPA/FIEA (mesma dos gráficos de indicadores).
const NAVY = "#0d3c78"
const LIGHT = "#35b3e7"

const STATUS_LABEL: Record<PlanoEpaAcao["status"], { label: string; tone: Tone }> = {
  concluido: { label: "Concluído", tone: "emerald" },
  em_andamento: { label: "Em andamento", tone: "amber" },
  planejado: { label: "Planejado", tone: "blue" },
  atrasado: { label: "Atrasado", tone: "red" },
  suspenso: { label: "Suspenso", tone: "slate" },
  outro: { label: "—", tone: "slate" },
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
      <div className="relative h-9 flex-1 overflow-hidden rounded-md bg-muted dark:bg-white/10">
        <div
          className="flex h-full items-center justify-between rounded-md px-2 text-xs font-semibold text-white"
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

function PlanoCard({
  plano, defaultExpanded = false, hideEmpty = false,
}: {
  plano: PlanoEpa
  defaultExpanded?: boolean
  hideEmpty?: boolean
}) {
  // Minimizado por padrão: só identificação + barras; expandir mostra a tabela de ações.
  const [expandido, setExpandido] = useState(defaultExpanded)
  // Tooltip GRANDE e centralizado com os acompanhamentos da ação sob o mouse.
  const [acompAtivo, setAcompAtivo] = useState<{ titulo: string; itens: PlanoEpaAcomp[] } | null>(null)
  if (plano.erro) {
    if (hideEmpty) return null
    return (
      <Notice tone="amber" icon={AlertTriangle}>
        <span><b className="font-semibold">Plano {plano.codigo}:</b> {plano.erro}</span>
      </Notice>
    )
  }
  return (
    <div className="overflow-hidden rounded-2xl border bg-card shadow-sm">
      <button
        type="button"
        onClick={() => setExpandido((v) => !v)}
        className="grid w-full gap-4 p-4 text-left transition-colors hover:bg-muted/40 md:grid-cols-[240px_1fr]"
        title={expandido ? "Minimizar ações" : `Expandir ações (${plano.acoes.length})`}
        aria-expanded={expandido}
      >
        {/* Identificação do plano (coluna esquerda, padrão EPA) */}
        <div className="flex items-start gap-1.5">
          {expandido
            ? <ChevronDown className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
            : <ChevronRight className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />}
          <div>
            <p className="text-xs text-muted-foreground">
              Plano {plano.codigo}:
            </p>
            <p className="mt-0.5 font-semibold leading-snug">
              {plano.titulo}
            </p>
            {(!hideEmpty || plano.acoes.length > 0) && (
              <p className="mt-1 text-xs text-muted-foreground">{plano.acoes.length} ação(ões)</p>
            )}
          </div>
        </div>
        {/* Barras de execução */}
        <div className="space-y-2">
          <div className="flex flex-wrap gap-4 text-xs text-muted-foreground">
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
        <div className={`${TABLE.wrap} border-t`}>
          <table className={TABLE.table}>
            <thead className={TABLE.thead}>
              <tr>
                <th className={TABLE.thFirst}>{plano.codigo}: {plano.titulo}</th>
                <th className={`${TABLE.th} text-center`}>Status</th>
                <th className={`${TABLE.th} text-center`}>Responsável</th>
                <th className={`${TABLE.th} text-center`}>Prazo</th>
                <th className={`${TABLE.th} text-center`}>Acomp.</th>
              </tr>
            </thead>
            <tbody>
              {plano.acoes.map((a, i) => (
                <tr key={i}
                  className={`${TABLE.tr} ${a.status === "suspenso" ? "bg-muted/60 opacity-70" : ""}`}>
                  <td className={`${TABLE.tdFirst} font-medium`}>{a.titulo}</td>
                  <td className={`${TABLE.td} text-center`}
                    title={
                      a.status === "suspenso"
                        ? "Suspensa — fora do cálculo de execução"
                        : a.status === "atrasado" && a.status_raw
                          ? `${a.status_raw} no EPA — prazo anterior à data atual`
                          : a.status_raw ?? undefined
                    }>
                    <Pill tone={STATUS_LABEL[a.status].tone} dot>{STATUS_LABEL[a.status].label}</Pill>
                  </td>
                  <td className={`${TABLE.td} text-center`}>
                    {a.responsavel || (hideEmpty ? "" : "—")}
                  </td>
                  <td className={`${TABLE.td} whitespace-nowrap text-center tabular-nums`}>
                    {a.prazo ? fmtData(a.prazo) : (hideEmpty ? "" : "—")}
                  </td>
                  <td className={`${TABLE.td} text-center`}>
                    {(!hideEmpty || a.acompanhamentos.length > 0) && (
                    <span
                      className="inline-flex cursor-help items-center gap-1"
                      onMouseEnter={() => setAcompAtivo({ titulo: a.titulo, itens: a.acompanhamentos })}
                      onMouseLeave={() => setAcompAtivo(null)}
                    >
                      <MessageSquareText
                        className={`h-4 w-4 ${a.acompanhamentos.length ? "text-sky-600 dark:text-sky-400" : "text-muted-foreground/40"}`} />
                      {a.acompanhamentos.length > 0 && (
                        <span className="text-xs font-semibold text-sky-700 dark:text-sky-400">{a.acompanhamentos.length}</span>
                      )}
                    </span>
                    )}
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
          <div className="max-h-[70vh] w-[min(680px,92vw)] overflow-y-auto rounded-2xl border bg-background p-5 shadow-2xl">
            <p className="mb-3 border-b pb-2 text-sm font-semibold">
              Acompanhamentos — {acompAtivo.titulo}
            </p>
            {acompAtivo.itens.length === 0 ? (
              <p className="text-sm italic text-muted-foreground">Nenhum acompanhamento registrado no EPA.</p>
            ) : (
              <div className="space-y-3">
                {acompAtivo.itens.map((ac, i) => (
                  <div key={i} className="rounded-xl border bg-muted/40 p-3">
                    <p className="mb-1 flex flex-wrap items-center gap-x-2 text-xs font-semibold text-sky-800 dark:text-sky-300">
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
  reuniaoId, codigosIniciais, readOnly, categoria = "estrategico", initialData = null,
  defaultExpanded = false, hideEmpty = false,
}: {
  reuniaoId: string
  codigosIniciais: number[]
  readOnly: boolean
  /** Slide de Planos Estratégicos ou Planos Táticos (mesma mecânica, listas próprias). */
  categoria?: "estrategico" | "tatico"
  /** Quando informado (ex.: página pública), não chama a API autenticada. */
  initialData?: PlanosEpaResponse | null
  /** PDF / impressão: expande a tabela de ações de cada plano. */
  defaultExpanded?: boolean
  /** PDF: omite placeholders e mensagens de ausência. */
  hideEmpty?: boolean
}) {
  const [data, setData] = useState<PlanosEpaResponse | null>(initialData)
  const [loading, setLoading] = useState(!initialData)
  const [codigosInput, setCodigosInput] = useState(codigosIniciais.join(", "))
  const [salvando, setSalvando] = useState(false)
  // Configuração de códigos escondida por padrão (os planos vêm do .env).
  const [configAberta, setConfigAberta] = useState(false)

  async function carregar() {
    if (initialData) {
      setData(initialData)
      setLoading(false)
      return
    }
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
  useEffect(() => { carregar() }, [reuniaoId, categoria, initialData])

  /** Salva os códigos da reunião: lista = esses planos; [] = EPA desligado; null = padrão. */
  async function gravar(codigos: number[] | null, sucesso: string) {
    setSalvando(true)
    try {
      await rtdApi.updateReuniao(
        reuniaoId,
        categoria === "tatico" ? { epa_planos_taticos: codigos } : { epa_planos: codigos },
      )
      toast.success(sucesso)
      if (codigos === null) setCodigosInput("")  // recarga preenche com o padrão
      await carregar()
    } catch {
      toast.error("Falha ao salvar a configuração do EPA")
    } finally {
      setSalvando(false)
    }
  }

  async function salvarCodigos() {
    const codigos = codigosInput
      .split(/[,;\s]+/)
      .map((s) => parseInt(s, 10))
      .filter((n) => Number.isFinite(n) && n > 0)
    await gravar(codigos, codigos.length ? "Códigos salvos — consultando o EPA…" : "EPA desligado nesta reunião.")
  }

  return (
    <div className="space-y-4">
      {/* Toolbar discreta: configurar códigos (escondido) + atualizar + foto */}
      <div className="flex items-center justify-between gap-2">
        <div>
          {data?.snapshot_at && (
            <Pill tone="blue"><Camera size={12} /> Foto congelada em {new Date(data.snapshot_at).toLocaleString("pt-BR")}</Pill>
          )}
        </div>
        {!readOnly && (
          <div className="flex gap-1.5">
            <Button size="sm" variant="ghost" onClick={() => setConfigAberta((v) => !v)}
              title="Configurar códigos dos planos" aria-label="Configurar códigos dos planos" aria-expanded={configAberta}>
              <Settings2 className="h-4 w-4 text-muted-foreground" />
            </Button>
            <Button size="sm" variant="ghost" onClick={carregar} disabled={loading} title="Atualizar do EPA" aria-label="Atualizar do EPA">
              <RefreshCw className={`h-4 w-4 text-muted-foreground ${loading ? "animate-spin" : ""}`} />
            </Button>
          </div>
        )}
      </div>

      {/* Configuração dos códigos — escondida por padrão (planos padrão vêm do .env) */}
      {!readOnly && configAberta && (
        <div className="flex flex-wrap items-end gap-2 rounded-xl border border-dashed p-3">
          <div className="min-w-64 flex-1 space-y-1">
            <Label className="text-xs">Códigos dos planos no EPA (separados por vírgula)</Label>
            <Input value={codigosInput} onChange={(e) => setCodigosInput(e.target.value)}
              placeholder="Ex.: 26742, 26743" className="h-9" />
          </div>
          <Button size="sm" onClick={salvarCodigos} disabled={salvando || loading}>
            {salvando ? "Salvando…" : "Salvar e buscar"}
          </Button>
          {data?.origem !== "desligado" && (
            <Button size="sm" variant="outline" disabled={salvando || loading}
              onClick={() => { setCodigosInput(""); void gravar([], "EPA desligado nesta reunião.") }}
              title="Não consulta o EPA nesta reunião (slides, relatório e link público)">
              Desligar nesta reunião
            </Button>
          )}
          {data?.origem && data.origem !== "padrao" && (
            <Button size="sm" variant="ghost" disabled={salvando || loading}
              onClick={() => void gravar(null, "Planos padrão restaurados — consultando o EPA…")}>
              Usar os planos padrão
            </Button>
          )}
        </div>
      )}

      {loading ? (
        <div className="space-y-3"><Skeleton className="h-40 w-full rounded-2xl" /><Skeleton className="h-40 w-full rounded-2xl" /></div>
      ) : data?.erro ? (
        hideEmpty ? null : (
          <Notice tone="amber" icon={AlertTriangle}>{data.erro}</Notice>
        )
      ) : data?.origem === "desligado" ? (
        hideEmpty ? null : (
          <p className="text-sm text-muted-foreground">
            EPA desligado nesta reunião — os planos não são consultados.
          </p>
        )
      ) : !data?.codigos?.length ? (
        hideEmpty ? null : (
          <p className="text-sm text-muted-foreground">
            Nenhum plano configurado — informe os códigos dos Planos {categoria === "tatico" ? "Táticos" : "Estratégicos"} do EPA acima.
          </p>
        )
      ) : !data?.planos?.length ? (
        hideEmpty ? null : (
          <p className="text-sm text-muted-foreground">Sem dados retornados pelo EPA para os códigos informados.</p>
        )
      ) : (
        <div className="space-y-4">
          {data.planos.map((p) => (
            <PlanoCard key={p.codigo} plano={p} defaultExpanded={defaultExpanded} hideEmpty={hideEmpty} />
          ))}
        </div>
      )}
    </div>
  )
}
