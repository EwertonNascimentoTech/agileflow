import { lazy, Suspense, useCallback, useEffect, useRef, useState } from "react"
import { Compass } from "lucide-react"

import { portalOccurrencesApi } from "@/api/clientes"
import { portalTourApi, type PortalTourStatus } from "@/api/portalPortfolio"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { useAuth } from "@/contexts/AuthContext"
import { loadPortfolio, usePortalBase } from "@/modules/portal/portfolioMeta"
import { TOUR_EVENT, pickProject, type TourCtx } from "@/modules/portal/tour/tourSteps"

const TourRunner = lazy(() => import("@/modules/portal/tour/TourRunner"))

/** Tour guiado do Portal: convite no 1º acesso de quem é cliente (uma vez por pessoa, gravado no
 *  servidor) e início a qualquer momento pelo botão "?" (`startPortalTour`). */
export function PortalTour({ standalone }: { standalone: boolean }) {
  const { user } = useAuth()
  const base = usePortalBase()
  const isClient = !!(user?.is_client || user?.has_client_portal)
  const [invite, setInvite] = useState(false)
  const [ctx, setCtx] = useState<TourCtx | null>(null)
  const starting = useRef(false)
  // Tour já aberto pelo botão: a resposta atrasada do convite não pode abrir o diálogo por cima.
  const started = useRef(false)

  useEffect(() => {
    if (!isClient) return
    let alive = true
    // Um instante depois da tela, para o convite não disputar com o carregamento.
    const t = window.setTimeout(() => {
      portalTourApi.get().then((s) => { if (alive && s.offer && !started.current) setInvite(true) }).catch(() => undefined)
    }, 900)
    return () => {
      alive = false
      window.clearTimeout(t)
    }
  }, [isClient])

  const save = (status: PortalTourStatus, step?: number) => {
    void portalTourApi.set(status, step).catch(() => undefined)
  }

  const start = useCallback(async () => {
    if (starting.current) return
    starting.current = true
    started.current = true
    setInvite(false)
    const wide = window.matchMedia("(min-width: 1024px)").matches
    let c: TourCtx = { isClient, standalone, wide, programId: null, projectId: null, occurrenceId: null }
    // Exemplos para as telas de detalhe; sem eles, o tour pula esses passos.
    const [portfolio, occurrences] = await Promise.allSettled([
      loadPortfolio(),
      isClient ? portalOccurrencesApi.list() : Promise.resolve([]),
    ])
    if (portfolio.status === "fulfilled") {
      c = { ...c, programId: portfolio.value.programs[0]?.id ?? null, projectId: pickProject(portfolio.value.projects) }
    }
    if (occurrences.status === "fulfilled") {
      const list = occurrences.value
      c = { ...c, occurrenceId: (list.find((o) => o.opened_by_me) ?? list[0])?.task_id ?? null }
    }
    setCtx(c)
    starting.current = false
    save("iniciado", 0)
  }, [isClient, standalone])

  useEffect(() => {
    const onStart = () => void start()
    window.addEventListener(TOUR_EVENT, onStart)
    return () => window.removeEventListener(TOUR_EVENT, onStart)
  }, [start])

  const close = useCallback((status: "concluido" | "interrompido", step: number) => {
    setCtx(null)
    save(status, step)
  }, [])

  function decline() {
    setInvite(false)
    started.current = true
    save("recusado")
  }

  return (
    <>
      <Dialog open={invite} onOpenChange={(open) => { if (!open) decline() }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <span className="mb-1 flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <Compass size={22} />
            </span>
            <DialogTitle>Boas-vindas ao Portal do Cliente!</DialogTitle>
            <DialogDescription className="text-sm leading-relaxed">
              Aqui você acompanha os seus projetos: em que fase cada um está, o que já foi entregue e o que vem pela frente.
            </DialogDescription>
          </DialogHeader>
          <p className="text-sm leading-relaxed">
            Quer um tour rápido? Em poucos minutos mostramos cada tela, o que significam os gráficos e indicadores e como abrir e acompanhar ocorrências e pedidos.
          </p>
          <p className="text-xs text-muted-foreground">
            Se preferir depois, é só clicar em {standalone ? "\"?\" no topo da tela" : "\"Tour do Portal\""} quando quiser.
          </p>
          <div className="flex flex-col-reverse gap-2 pt-1 sm:flex-row sm:justify-end">
            <Button type="button" variant="outline" onClick={decline}>Agora não</Button>
            <Button type="button" onClick={() => void start()}>
              <Compass size={15} className="mr-1.5" /> Fazer o tour
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {ctx && (
        <Suspense fallback={null}>
          <TourRunner ctx={ctx} base={base} onClose={close} />
        </Suspense>
      )}
    </>
  )
}
