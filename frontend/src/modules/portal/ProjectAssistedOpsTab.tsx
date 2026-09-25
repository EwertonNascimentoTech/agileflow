import { useState, type ReactNode } from "react"
import { CheckCircle2, CircleDashed, Loader2, ShieldCheck, XCircle } from "lucide-react"

import { portalAssistedOpsApi, type PortalAssistedOps } from "@/api/clientes"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { toast } from "@/lib/toast"
import { IndicatorBreakdown, IndicatorGrid } from "@/modules/portal/assistedOpsUi"
import { apiErrorDetail } from "@/modules/portal/occurrenceUi"
import { Card } from "@/modules/portal/portfolioUi"

function fmtDay(iso: string | null | undefined): string {
  if (!iso) return "—"
  const [y, m, d] = iso.slice(0, 10).split("-")
  return `${d}/${m}/${y}`
}

function Section({ title, subtitle, children }: { title: string; subtitle?: string; children: ReactNode }) {
  return (
    <Card>
      <div className="border-b px-5 py-4">
        <h2 className="text-lg font-semibold">{title}</h2>
        {subtitle && <p className="text-sm text-muted-foreground">{subtitle}</p>}
      </div>
      <div className="p-5">{children}</div>
    </Card>
  )
}

/** Aba "Operação Assistida" do projeto no Portal (POP.COR.GTD.003): fase, indicadores,
 *  encerramento formal (o Dono do Processo dá o aceite aqui) e atas dos ritos. */
export function ProjectAssistedOpsTab({
  projectTaskId, data, onChange,
}: {
  projectTaskId: string
  data: PortalAssistedOps
  onChange: (next: PortalAssistedOps) => void
}) {
  const [mode, setMode] = useState<"approve" | "reject" | null>(null)
  const [comment, setComment] = useState("")
  const [sending, setSending] = useState(false)
  const c = data.closure
  const docReady = c.concluded || c.aceite_status !== null || !!c.override

  async function answer() {
    if (!mode) return
    if (mode === "reject" && comment.trim().length < 10) return toast.error("Conte o que falta para encerrar (mín. 10 caracteres).")
    setSending(true)
    try {
      onChange(await portalAssistedOpsApi.accept(projectTaskId, { approve: mode === "approve", comment: comment.trim() || null }))
      setMode(null)
      setComment("")
      toast.success(mode === "approve" ? "Aceite registrado. Obrigado!" : "Resposta enviada ao time.")
    } catch (err) {
      toast.error(apiErrorDetail(err, "Não foi possível registrar a resposta."))
    } finally {
      setSending(false)
    }
  }

  return (
    <div className="space-y-5">
      <p className="text-sm text-muted-foreground">
        {data.phase_label ? <>Fase {data.phase} — <span className="font-medium text-foreground">{data.phase_label}</span> · </> : null}
        Em Operação Assistida desde {fmtDay(data.entered_at)} · fim previsto {fmtDay(data.due_date)}
        {c.concluded && <> · <span className="font-medium text-emerald-700 dark:text-emerald-400">encerrada</span></>}
      </p>

      {c.can_accept && (
        <section className="space-y-4 rounded-2xl border border-violet-300 bg-violet-50/60 p-5 shadow-sm dark:border-violet-800 dark:bg-violet-950/30">
          <div>
            <h2 className="text-lg font-semibold">Seu aceite do encerramento</h2>
            <p className="text-sm text-muted-foreground">
              Como Dono do Processo, confirme que a operação está estável para encerrar a Operação Assistida. Leia a análise
              crítica abaixo antes de responder.
            </p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            {(
              [
                { m: "approve", label: "Dou o aceite", desc: "A operação pode seguir sem suporte intensivo.", Icon: CheckCircle2, on: "border-emerald-500 bg-emerald-50 ring-1 ring-emerald-500 dark:bg-emerald-950/40" },
                { m: "reject", label: "Ainda não", desc: "Falta algo para encerrar.", Icon: XCircle, on: "border-red-400 bg-red-50 ring-1 ring-red-400 dark:bg-red-950/40" },
              ] as const
            ).map(({ m, label, desc, Icon, on }) => (
              <button
                key={m}
                type="button"
                onClick={() => setMode(m)}
                aria-pressed={mode === m}
                className={`flex items-start gap-3 rounded-xl border bg-background p-4 text-left transition-colors ${mode === m ? on : "hover:border-primary/40"}`}
              >
                <Icon size={20} className={m === "approve" ? "text-emerald-600" : "text-red-500"} />
                <span>
                  <span className="block font-medium">{label}</span>
                  <span className="block text-sm text-muted-foreground">{desc}</span>
                </span>
              </button>
            ))}
          </div>
          {mode && (
            <>
              <Textarea
                rows={2} value={comment} onChange={(e) => setComment(e.target.value)}
                placeholder={mode === "approve" ? "Comentário (opcional)" : "O que ainda falta para encerrar?"}
              />
              <div className="flex justify-end">
                <Button onClick={() => void answer()} disabled={sending} className="gap-1.5">
                  {sending && <Loader2 className="h-4 w-4 animate-spin" />}
                  Enviar resposta
                </Button>
              </div>
            </>
          )}
        </section>
      )}

      <Section title="Indicadores" subtitle="Metas de referência do POP.COR.GTD.003, calibradas pelo projeto quando indicado.">
        <div className="space-y-3">
          <IndicatorGrid items={data.indicators.items} />
          <IndicatorBreakdown data={data.indicators} />
          {data.indicators.targets_calibrated && (
            <p className="text-xs text-muted-foreground">Metas calibradas para o projeto: {data.indicators.targets.justificativa}</p>
          )}
        </div>
      </Section>

      <Section title="Encerramento" subtitle="Critérios de saída, análise crítica e aceite do Dono do Processo.">
        {!docReady ? (
          <p className="text-sm text-muted-foreground">O time ainda está preparando o encerramento da Operação Assistida.</p>
        ) : (
          <div className="space-y-4 text-sm">
            {c.decisao_estrategica ? (
              <p><span className="font-medium">Decisão estratégica da Instância Executiva:</span> {c.decisao_texto}</p>
            ) : (
              <ul className="space-y-1">
                {c.criterios.map((k) => (
                  <li key={k.key} className="flex items-center gap-2">
                    {k.done ? <CheckCircle2 size={15} className="text-emerald-600" /> : <CircleDashed size={15} className="text-muted-foreground" />}
                    {k.label}
                  </li>
                ))}
              </ul>
            )}
            <div className="space-y-3">
              {c.analise.filter((a) => (a.text ?? "").trim()).map((a) => (
                <div key={a.key}>
                  <p className="font-medium">{a.label}</p>
                  <p className="whitespace-pre-wrap text-muted-foreground">{a.text}</p>
                </div>
              ))}
            </div>
            {!c.decisao_estrategica && (
              <div className="rounded-lg bg-muted/50 px-3 py-2">
                <p className="flex items-center gap-1.5 font-medium">
                  <ShieldCheck size={15} /> Aceite do Dono do Processo:{" "}
                  {c.override ? "registrado pela coordenação" : c.aceite_status === "aceito" ? "aceito" : c.aceite_status === "recusado" ? "não aceito" : "aguardando"}
                </p>
                {c.donos.map((d) => (
                  <p key={d.name} className="text-xs text-muted-foreground">
                    {d.name}: {d.approved === true ? "aceitou" : d.approved === false ? "não aceitou" : "sem resposta"}
                    {d.at && ` em ${fmtDay(d.at)}`}{d.comment && ` — “${d.comment}”`}
                  </p>
                ))}
              </div>
            )}
          </div>
        )}
      </Section>

      <Section title="Atas dos ritos" subtitle="Reuniões diárias, semanais e de comitê da Operação Assistida.">
        {data.meetings.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nenhuma ata registrada.</p>
        ) : (
          <ul className="space-y-3">
            {data.meetings.map((m) => (
              <li key={m.id} className="space-y-1 border-b pb-3 text-sm last:border-b-0 last:pb-0">
                <p className="text-xs text-muted-foreground">
                  <span className="font-semibold text-foreground">{m.kind_label}</span> · {fmtDay(m.held_on)}
                  {m.phase && ` · Fase ${m.phase}`}{m.participants && ` · ${m.participants}`}
                </p>
                <p className="whitespace-pre-wrap">{m.summary}</p>
                {m.decisions && <p className="whitespace-pre-wrap text-muted-foreground"><span className="font-medium">Decisões:</span> {m.decisions}</p>}
              </li>
            ))}
          </ul>
        )}
      </Section>
    </div>
  )
}
