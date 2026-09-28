import { useEffect, useState } from "react"
import { useSearchParams } from "react-router-dom"
import { BarChart3, CalendarOff, ClipboardCheck, Info, Mail, UserRound } from "lucide-react"
import { Skeleton } from "@/components/ui/skeleton"
import { Card, DetailTabs, Notice, Pill, type TabDef } from "@/components/ds"
import { useAuth } from "@/contexts/AuthContext"
import { PERSON_STATUS_LABELS, teamopsApi, type Person } from "@/api/teamops"
import AvatarEditor from "@/modules/profile/AvatarEditor"
import MeuDesempenho from "@/modules/profile/MeuDesempenho"
import MinhasAusencias from "@/modules/profile/MinhasAusencias"
import MeusDados from "@/modules/profile/MeusDados"
import CompetenciasForm from "@/modules/teamops/CompetenciasForm"
import { httpStatus } from "@/modules/profile/utils"

type Aba = "desempenho" | "competencias" | "ausencias" | "dados"
const ABAS: TabDef<Aba>[] = [
  { value: "desempenho", label: "Desempenho", icon: BarChart3 },
  { value: "competencias", label: "Competências", icon: ClipboardCheck },
  { value: "ausencias", label: "Ausências", icon: CalendarOff },
  { value: "dados", label: "Meus dados", icon: UserRound },
]
const ABAS_SEM_PESSOA: TabDef<Aba>[] = [{ value: "dados", label: "Meus dados", icon: UserRound }]

/**
 * Meu perfil: foto, desempenho (métricas do painel do time só da pessoa), formulário de
 * competências, ausências e dados. Desempenho, competências e ausências dependem da Pessoa de
 * Times vinculada ao login.
 */
export default function ProfilePage() {
  const { user, refreshUser } = useAuth()
  const [params, setParams] = useSearchParams()
  const [person, setPerson] = useState<Person | null>(null)
  const [semPessoa, setSemPessoa] = useState(false)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let vivo = true
    teamopsApi.getMyPerson()
      .then((p) => { if (vivo) setPerson(p) })
      .catch((err) => { if (vivo && [403, 404].includes(httpStatus(err) ?? 0)) setSemPessoa(true) })
      .finally(() => { if (vivo) setLoading(false) })
    return () => { vivo = false }
  }, [])

  if (!user) return null

  const tabs = semPessoa ? ABAS_SEM_PESSOA : ABAS
  const pedida = params.get("aba") as Aba | null
  const aba: Aba = pedida && tabs.some((t) => t.value === pedida) ? pedida : tabs[0].value
  const trocarAba = (v: Aba) => setParams(v === "desempenho" ? {} : { aba: v }, { replace: true })

  const areas = person?.areas?.map((a) => a.name).join(", ")

  return (
    <div className="space-y-5 p-4">
      <Card className="p-5">
        <div className="flex flex-col items-center gap-5 text-center sm:flex-row sm:items-center sm:text-left">
          <AvatarEditor name={user.full_name} url={user.avatar_url} onChanged={refreshUser} />
          <div className="min-w-0 flex-1">
            <h1 className="text-2xl font-semibold tracking-tight">{user.full_name}</h1>
            {loading ? (
              <Skeleton className="mx-auto mt-2 h-4 w-60 sm:mx-0" />
            ) : person ? (
              <p className="mt-0.5 text-sm text-muted-foreground">
                {person.position?.name ?? "Sem cargo"}{areas ? ` · ${areas}` : ""}
              </p>
            ) : null}
            <p className="mt-1 inline-flex items-center gap-1.5 text-sm text-muted-foreground">
              <Mail size={14} /> {user.email}
            </p>
            {person && (
              <div className="mt-2 flex flex-wrap justify-center gap-1.5 sm:justify-start">
                <Pill tone={person.status === "ativo" ? "emerald" : "amber"} dot>{PERSON_STATUS_LABELS[person.status]}</Pill>
                {person.pos?.length ? <Pill tone="slate">PO: {person.pos.map((p) => p.full_name.split(" ")[0]).join(", ")}</Pill> : null}
              </div>
            )}
          </div>
        </div>
      </Card>

      {semPessoa && (
        <Notice tone="blue" icon={Info}>
          <span className="min-w-0 flex-1">
            Seu login ainda não está vinculado a uma pessoa em Gestão de Times. Desempenho, competências e ausências aparecem
            aqui quando a coordenação fizer o vínculo.
          </span>
        </Notice>
      )}

      {!loading && (
        <>
          <DetailTabs tabs={tabs} value={aba} onChange={trocarAba} />
          {aba === "desempenho" && person && <MeuDesempenho />}
          {aba === "competencias" && person && <CompetenciasForm />}
          {aba === "ausencias" && person && <MinhasAusencias personId={person.id} />}
          {aba === "dados" && <MeusDados user={user} person={person} onPersonChange={setPerson} />}
        </>
      )}
    </div>
  )
}
