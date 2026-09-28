import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { createPortal } from "react-dom"
import { useLocation, useNavigate } from "react-router-dom"
import { Loader2 } from "lucide-react"

import { Button } from "@/components/ui/button"
import { TOUR_STEPS, resolve, type TourCtx } from "@/modules/portal/tour/tourSteps"

// Tour guiado do Portal: escurece a tela, destaca o alvo (data-tour) e mostra o balão ao lado.
// Carregado só quando o tour começa (lazy em PortalTour).

const PAD = 8          // folga do destaque em volta do alvo
const GAP = 14         // distância entre o destaque e o balão
const MARGIN = 12      // margem mínima até a borda da tela
const WAIT_MS = 8000   // espera máxima pela tela carregar o alvo

type Side = "top" | "bottom" | "left" | "right" | "center" | "float"
interface Placement { top: number; left: number; side: Side; arrow: number }
interface Spot { top: number; left: number; right: number; bottom: number }

/** Área destacada: o alvo com a folga, cortado na tela (alvo maior que a tela continua com o
 *  resto escurecido e com moldura visível). */
function spotOf(r: DOMRect, pad: number, vw: number, vh: number): Spot {
  return {
    top: Math.max(r.top - pad, 0),
    left: Math.max(r.left - pad, 0),
    right: Math.min(r.right + pad, vw),
    bottom: Math.min(r.bottom + pad, vh),
  }
}

/** Onde o balão cabe: abaixo, acima, à esquerda ou à direita do destaque; destaque que ocupa a
 *  tela, balão flutuando no rodapé. `arrow` = posição da ponta ao longo da borda do balão. */
function placeBalloon(s: Spot | null, bw: number, bh: number, vw: number, vh: number): Placement {
  if (!s) return { top: Math.max(MARGIN, (vh - bh) / 2), left: Math.max(MARGIN, (vw - bw) / 2), side: "center", arrow: 0 }
  const cx = (s.left + s.right) / 2
  const cy = (s.top + s.bottom) / 2
  const clampX = (x: number) => Math.min(Math.max(x, MARGIN), Math.max(MARGIN, vw - bw - MARGIN))
  const clampY = (y: number) => Math.min(Math.max(y, MARGIN), Math.max(MARGIN, vh - bh - MARGIN))
  const alongX = (left: number) => Math.min(Math.max(cx - left, 20), bw - 20)
  const alongY = (top: number) => Math.min(Math.max(cy - top, 20), bh - 20)
  const fitsBelow = vh - s.bottom >= bh + GAP + MARGIN
  const fitsAbove = s.top >= bh + GAP + MARGIN
  const fitsRight = vw - s.right >= bw + GAP + MARGIN
  const fitsLeft = s.left >= bw + GAP + MARGIN
  const right = (): Placement => { const top = clampY(cy - bh / 2); return { top, left: s.right + GAP, side: "right", arrow: alongY(top) } }
  // Alvo alto e estreito (menu lateral): ao lado.
  if (s.bottom - s.top > vh * 0.45 && fitsRight) return right()
  if (fitsBelow) { const left = clampX(cx - bw / 2); return { top: s.bottom + GAP, left, side: "bottom", arrow: alongX(left) } }
  if (fitsAbove) { const left = clampX(cx - bw / 2); return { top: s.top - GAP - bh, left, side: "top", arrow: alongX(left) } }
  if (fitsLeft) { const top = clampY(cy - bh / 2); return { top, left: s.left - GAP - bw, side: "left", arrow: alongY(top) } }
  if (fitsRight) return right()
  return { top: vh - bh - MARGIN, left: clampX(cx - bw / 2), side: "float", arrow: 0 }
}

/** Primeiro elemento visível com o data-tour (o menu lateral existe em dobro no celular). */
function findTarget(key: string): HTMLElement | null {
  for (const el of Array.from(document.querySelectorAll<HTMLElement>(`[data-tour="${key}"]`))) {
    const r = el.getBoundingClientRect()
    if (r.width > 0 && r.height > 0) return el
  }
  return null
}

/** Já está na tela do passo? Compara o caminho e só os parâmetros que o passo pede. */
function atPath(want: string, pathname: string, search: string): boolean {
  const [path, query] = want.split("?")
  const trim = (p: string) => p.replace(/\/+$/, "") || "/"
  if (trim(path) !== trim(pathname)) return false
  if (!query) return true
  const have = new URLSearchParams(search)
  for (const [k, v] of new URLSearchParams(query)) if (have.get(k) !== v) return false
  return true
}

function Arrow({ side, at }: { side: Side; at: number }) {
  const base = "absolute h-3 w-3 rotate-45 border bg-background"
  if (side === "bottom") return <span aria-hidden className={`${base} -top-[7px] border-b-0 border-r-0`} style={{ left: at - 6 }} />
  if (side === "top") return <span aria-hidden className={`${base} -bottom-[7px] border-l-0 border-t-0`} style={{ left: at - 6 }} />
  if (side === "right") return <span aria-hidden className={`${base} -left-[7px] border-r-0 border-t-0`} style={{ top: at - 6 }} />
  if (side === "left") return <span aria-hidden className={`${base} -right-[7px] border-b-0 border-l-0`} style={{ top: at - 6 }} />
  return null
}

export default function TourRunner({
  ctx,
  base,
  onClose,
}: {
  ctx: TourCtx
  base: string
  onClose: (status: "concluido" | "interrompido", step: number) => void
}) {
  const navigate = useNavigate()
  const location = useLocation()
  const steps = useMemo(() => TOUR_STEPS.filter((s) => !s.when || s.when(ctx)), [ctx])
  const [index, setIndex] = useState(0)
  const [target, setTarget] = useState<HTMLElement | null>(null)
  // Alvo não apareceu no 1º passo voltando: mostra o balão no centro.
  const [lost, setLost] = useState(false)
  const [rect, setRect] = useState<DOMRect | null>(null)
  const [vp, setVp] = useState({ w: window.innerWidth, h: window.innerHeight })
  const [size, setSize] = useState({ w: 360, h: 200 })
  const dir = useRef<1 | -1>(1)
  const hops = useRef(0)
  const balloonRef = useRef<HTMLDivElement>(null)
  const nextRef = useRef<HTMLButtonElement>(null)

  const step = steps[index]
  const path = step ? resolve(step.path, ctx) : undefined
  const last = index === steps.length - 1
  const searching = !!step?.target && !target && !lost

  const go = useCallback((d: 1 | -1) => {
    dir.current = d
    hops.current = 0
    const n = index + d
    if (n >= steps.length) {
      onClose("concluido", index)
      return
    }
    if (n < 0) return
    setTarget(null)
    setRect(null)
    setLost(false)
    setIndex(n)
  }, [index, steps.length, onClose])

  // Vai até a tela do passo e espera o alvo aparecer (a tela carrega os dados antes).
  useEffect(() => {
    if (!step) return
    if (path !== undefined) {
      const want = base + path
      if (!atPath(want, location.pathname, location.search)) {
        if (hops.current++ > 2) {
          // A tela não abriu (rota inválida): segue o tour.
          const t = window.setTimeout(() => go(dir.current), 0)
          return () => window.clearTimeout(t)
        }
        navigate(want)
        return
      }
    }
    if (!step.target) return
    const key = step.target
    const started = Date.now()
    const timer = window.setInterval(() => {
      const el = findTarget(key)
      if (el) {
        window.clearInterval(timer)
        // Alvo mais alto que a tela (tabela, roadmap): mostra o começo dele, abaixo do cabeçalho fixo.
        const tall = el.getBoundingClientRect().height > window.innerHeight * 0.6
        const prevMargin = el.style.scrollMarginTop
        el.style.scrollMarginTop = "96px"
        el.scrollIntoView({ block: tall ? "start" : "center", inline: "nearest", behavior: "smooth" })
        window.setTimeout(() => { el.style.scrollMarginTop = prevMargin }, 1500)
        setTarget(el)
      } else if (Date.now() - started > WAIT_MS) {
        window.clearInterval(timer)
        // A tela não tem esse item (sem dados, menu escondido no celular): pula o passo.
        if (dir.current === -1 && index === 0) setLost(true)
        else go(dir.current)
      }
    }, 120)
    return () => window.clearInterval(timer)
  }, [step, path, base, index, go, navigate, location.pathname, location.search])

  // Acompanha o alvo enquanto a página rola ou muda de tamanho (dados chegando, rolagem suave).
  useEffect(() => {
    if (!target) return
    let raf = 0
    let last = ""
    const tick = () => {
      let el = target
      if (!el.isConnected && step?.target) {
        const again = findTarget(step.target)
        if (again && again !== target) {
          setTarget(again)
          return
        }
        if (again) el = again
      }
      const r = el.getBoundingClientRect()
      const k = `${Math.round(r.top)}|${Math.round(r.left)}|${Math.round(r.width)}|${Math.round(r.height)}`
      if (k !== last) {
        last = k
        setRect(r)
      }
      raf = requestAnimationFrame(tick)
    }
    tick()
    return () => cancelAnimationFrame(raf)
  }, [target, step])

  useEffect(() => {
    const onResize = () => setVp({ w: window.innerWidth, h: window.innerHeight })
    window.addEventListener("resize", onResize)
    return () => window.removeEventListener("resize", onResize)
  }, [])

  // Tamanho real do balão (o texto muda de passo para passo).
  useEffect(() => {
    const el = balloonRef.current
    if (!el) return
    const ro = new ResizeObserver(() => setSize({ w: el.offsetWidth, h: el.offsetHeight }))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  useEffect(() => {
    if (!searching) nextRef.current?.focus({ preventScroll: true })
  }, [searching, index])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose("interrompido", index)
      else if (e.key === "ArrowRight" && !searching) go(1)
      else if (e.key === "ArrowLeft" && !searching && index > 0) go(-1)
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [go, index, onClose, searching])

  if (!step) return null
  const pad = step.pad ?? PAD
  const shown = !searching && target && rect ? spotOf(rect, pad, vp.w, vp.h) : null
  const place = placeBalloon(shown, size.w, size.h, vp.w, vp.h)
  const body = resolve(step.body, ctx)
  const bullets = resolve(step.bullets, ctx)

  return createPortal(
    <div className="print:hidden">
      {/* Bloqueia cliques na página durante o tour (a rolagem continua). */}
      <div className="fixed inset-0 z-[70]" aria-hidden />
      {shown ? (
        <div
          aria-hidden
          className="pointer-events-none fixed z-[71] rounded-xl ring-2 ring-primary/70 transition-all duration-300"
          style={{
            top: shown.top,
            left: shown.left,
            width: shown.right - shown.left,
            height: shown.bottom - shown.top,
            boxShadow: "0 0 0 9999px rgba(2, 6, 23, 0.55)",
          }}
        />
      ) : (
        <div aria-hidden className="pointer-events-none fixed inset-0 z-[71] bg-slate-950/55" />
      )}

      <div
        ref={balloonRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="portal-tour-title"
        className="fixed z-[72] w-[min(360px,calc(100vw-24px))] rounded-2xl border bg-background p-4 text-foreground shadow-2xl transition-[top,left] duration-300"
        style={{ top: place.top, left: place.left }}
      >
        {shown && <Arrow side={place.side} at={place.arrow} />}
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs font-medium text-primary">Passo {index + 1} de {steps.length}</span>
          <button
            type="button"
            onClick={() => onClose("interrompido", index)}
            className="text-xs text-muted-foreground hover:text-foreground hover:underline"
          >
            Pular tour
          </button>
        </div>
        {searching ? (
          <p className="mt-3 flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 size={16} className="animate-spin" /> Abrindo a próxima tela…
          </p>
        ) : (
          <>
            <h2 id="portal-tour-title" className="mt-1.5 text-base font-semibold leading-snug">{step.title}</h2>
            {body && <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{body}</p>}
            {bullets && bullets.length > 0 && (
              <ul className="mt-2 space-y-1.5 text-sm">
                {bullets.map((b) => (
                  <li key={b} className="flex gap-2">
                    <span className="mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full bg-primary" aria-hidden />
                    <span>{b}</span>
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
        <div className="mt-3 h-1 overflow-hidden rounded-full bg-muted" aria-hidden>
          <div className="h-full rounded-full bg-primary transition-all duration-300" style={{ width: `${((index + 1) / steps.length) * 100}%` }} />
        </div>
        <div className="mt-3 flex items-center justify-end gap-2">
          {index > 0 && (
            <Button type="button" variant="ghost" size="sm" disabled={searching} onClick={() => go(-1)}>
              Voltar
            </Button>
          )}
          <Button ref={nextRef} type="button" size="sm" disabled={searching} onClick={() => go(1)}>
            {last ? "Concluir" : "Próximo"}
          </Button>
        </div>
      </div>
    </div>,
    document.body,
  )
}
