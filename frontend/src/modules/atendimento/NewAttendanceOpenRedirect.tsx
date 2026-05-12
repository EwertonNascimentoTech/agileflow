import { useLayoutEffect, useRef } from "react"
import { useNavigate, useSearchParams } from "react-router-dom"
import { useNewAttendanceModal } from "./newAttendanceModal"

/** Mantém links antigos `/attendances/new` — abre o modal e vai para o Kanban. */
export default function NewAttendanceOpenRedirect() {
  const { openNew } = useNewAttendanceModal()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const ran = useRef(false)

  useLayoutEffect(() => {
    if (ran.current) return
    ran.current = true
    const clientId = searchParams.get("client_id") ?? undefined
    openNew(clientId)
    navigate("/app/modules/atendimento/kanban", { replace: true })
  }, [openNew, navigate, searchParams])

  return null
}
