import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react"
import NewAttendanceDialog from "./NewAttendanceDialog"

type NewAttendanceModalContextValue = {
  openNew: (prefillClientId?: string) => void
}

const NewAttendanceModalContext = createContext<NewAttendanceModalContextValue | null>(null)

export function useNewAttendanceModal(): NewAttendanceModalContextValue {
  const ctx = useContext(NewAttendanceModalContext)
  if (!ctx) throw new Error("useNewAttendanceModal must be used within NewAttendanceModalProvider")
  return ctx
}

export function NewAttendanceModalProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false)
  const [prefillClientId, setPrefillClientId] = useState<string | undefined>(undefined)

  const openNew = useCallback((clientId?: string) => {
    setPrefillClientId(clientId)
    setOpen(true)
  }, [])

  const handleOpenChange = useCallback((v: boolean) => {
    setOpen(v)
    if (!v) setPrefillClientId(undefined)
  }, [])

  const value = useMemo(() => ({ openNew }), [openNew])

  return (
    <NewAttendanceModalContext.Provider value={value}>
      {children}
      <NewAttendanceDialog open={open} onOpenChange={handleOpenChange} initialClientId={prefillClientId} />
    </NewAttendanceModalContext.Provider>
  )
}
