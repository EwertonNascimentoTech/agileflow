import { useEffect, useState } from "react"
import { CalendarClock, CalendarOff, CalendarPlus, Clock, Info, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { KpiCount, KpiRow, Notice, Pill, SectionCard, TABLE, type Tone } from "@/components/ds"
import { ABSENCE_STATUS_LABELS, teamopsApi, type Absence, type AbsenceStatus } from "@/api/teamops"
import { AbsenceFormDialog } from "@/modules/teamops/AbsenceFormDialog"
import { toast } from "@/lib/toast"
import { errMsg, fmtData, isoLocal } from "@/modules/profile/utils"

const STATUS_TONE: Record<AbsenceStatus, Tone> = { pendente: "amber", aprovada: "emerald", recusada: "red", cancelada: "slate" }

/** Ausências da pessoa logada: pedir, acompanhar a aprovação e cancelar pedido pendente. */
export default function MinhasAusencias({ personId }: { personId: string }) {
  const [items, setItems] = useState<Absence[] | null>(null)
  const [pedindo, setPedindo] = useState(false)
  const [tick, setTick] = useState(0)

  useEffect(() => {
    let vivo = true
    teamopsApi.listAbsences({ person_id: personId })
      .then((r) => { if (vivo) setItems(r) })
      .catch((err) => { if (vivo) { setItems([]); toast.error(errMsg(err, "Não foi possível carregar suas ausências.")) } })
    return () => { vivo = false }
  }, [personId, tick])

  if (!items) return <Skeleton className="h-72 rounded-2xl" />

  const hoje = isoLocal(new Date())
  const ordenadas = [...items].sort((a, b) => b.start_date.localeCompare(a.start_date))
  const pendentes = items.filter((a) => a.status === "pendente").length
  const proximas = items.filter((a) => a.status === "aprovada" && a.end_date >= hoje).length
  const emCurso = items.find((a) => a.status === "aprovada" && a.start_date <= hoje && a.end_date >= hoje)

  async function cancelar(a: Absence) {
    if (!confirm(`Cancelar o pedido de ${a.absence_type?.name ?? "ausência"} de ${fmtData(a.start_date)} a ${fmtData(a.end_date)}?`)) return
    try {
      await teamopsApi.deleteAbsence(a.id)
      toast.success("Pedido cancelado.")
      setTick((t) => t + 1)
    } catch (err) {
      toast.error(errMsg(err, "Não foi possível cancelar o pedido."))
    }
  }

  return (
    <div className="space-y-4">
      <KpiRow className="sm:grid-cols-3">
        <KpiCount icon={Clock} value={pendentes} label="Aguardando aprovação" tone={pendentes ? "amber" : "slate"} />
        <KpiCount icon={CalendarClock} value={proximas} label="Aprovadas, em curso ou futuras" tone="emerald" />
        <KpiCount icon={CalendarOff} value={items.length} label="Pedidos no histórico" tone="slate" />
      </KpiRow>

      {emCurso && (
        <Notice tone="blue" icon={Info}>
          <span>Você está de {emCurso.absence_type?.name?.toLowerCase() ?? "ausência"} até {fmtData(emCurso.end_date)}.</span>
        </Notice>
      )}

      <SectionCard
        title="Minhas ausências"
        icon={CalendarOff}
        subtitle="Férias, folgas e afastamentos aprovados reduzem sua capacidade nos projetos."
        right={
          <Button className="h-9 gap-1.5" onClick={() => setPedindo(true)}>
            <CalendarPlus size={14} /> Solicitar ausência
          </Button>
        }
        flush
      >
        {ordenadas.length === 0 ? (
          <p className="px-5 py-5 text-sm text-muted-foreground">Você ainda não tem ausências registradas.</p>
        ) : (
          <div className={TABLE.wrap}>
            <table className={TABLE.table}>
              <thead className={TABLE.thead}>
                <tr>
                  <th className={TABLE.thFirst}>Tipo</th>
                  <th className={TABLE.th}>Período</th>
                  <th className={TABLE.th}>Situação</th>
                  <th className={TABLE.th}>Decisão</th>
                  <th className={`${TABLE.th} text-right`}><span className="sr-only">Ações</span></th>
                </tr>
              </thead>
              <tbody>
                {ordenadas.map((a) => (
                  <tr key={a.id} className={`${TABLE.tr} align-top`}>
                    <td className={TABLE.tdFirst}>
                      <span className="inline-flex items-center gap-2 font-medium">
                        <span className="h-2.5 w-2.5 rounded-full" style={{ background: a.absence_type?.color ?? "#6B7280" }} aria-hidden />
                        {a.absence_type?.name ?? "Ausência"}
                      </span>
                      {a.notes && <p className="mt-0.5 text-xs text-muted-foreground">{a.notes}</p>}
                    </td>
                    <td className={`${TABLE.td} whitespace-nowrap`}>
                      {a.start_date === a.end_date ? fmtData(a.start_date) : `${fmtData(a.start_date)} a ${fmtData(a.end_date)}`}
                      {a.partial_hours ? <span className="block text-xs text-muted-foreground">{a.partial_hours}h no dia</span> : null}
                    </td>
                    <td className={TABLE.td}><Pill tone={STATUS_TONE[a.status]} dot>{ABSENCE_STATUS_LABELS[a.status]}</Pill></td>
                    <td className={`${TABLE.td} max-w-[18rem] text-xs`}>
                      {a.approver_person?.full_name ?? (a.status === "pendente" ? <span className="text-muted-foreground">Aguardando</span> : "—")}
                      {a.approved_at && <span className="text-muted-foreground"> · {fmtData(a.approved_at)}</span>}
                      {a.decision_notes && <p className="mt-0.5 text-muted-foreground">{a.decision_notes}</p>}
                    </td>
                    <td className={`${TABLE.td} text-right`}>
                      {a.status === "pendente" && (
                        <Button variant="ghost" size="sm" className="h-8 gap-1 text-muted-foreground hover:text-destructive" onClick={() => void cancelar(a)}>
                          <X size={13} /> Cancelar
                        </Button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </SectionCard>

      {pedindo && (
        <AbsenceFormDialog
          personId={personId}
          onClose={() => setPedindo(false)}
          onSaved={() => { setPedindo(false); setTick((t) => t + 1) }}
        />
      )}
    </div>
  )
}
