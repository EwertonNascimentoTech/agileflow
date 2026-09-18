import { useEffect, useState } from "react"

const STEPS = [
  "Localizando a reunião...",
  "Carregando indicadores...",
  "Consultando planos no EPA...",
  "Montando a apresentação...",
]

/** Tela cheia da RTD publica com barra de progresso enquanto a API carrega. */
export default function RtdLoadingScreen() {
  const [pct, setPct] = useState(8)
  const [step, setStep] = useState(0)

  useEffect(() => {
    document.getElementById("rtd-boot")?.remove()
    document.documentElement.style.background = ""
    const started = Date.now()
    const id = window.setInterval(() => {
      const elapsed = Date.now() - started
      setStep(elapsed < 2_500 ? 0 : elapsed < 8_000 ? 1 : elapsed < 20_000 ? 2 : 3)
      setPct((prev) => {
        const cap = 92
        if (prev >= cap) return cap
        return Math.min(cap, prev + Math.max(0.35, (cap - prev) * 0.05))
      })
    }, 180)
    return () => window.clearInterval(id)
  }, [])

  const shown = Math.round(pct)

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-gradient-to-br from-blue-950 via-blue-900 to-sky-700 px-6 text-white">
      <div className="w-full max-w-md">
        <p className="text-sm font-black italic leading-none">Sistema FIEA</p>
        <p className="mt-1 text-[10px] font-semibold tracking-widest text-sky-200">SESI · SENAI · IEL</p>
        <h1 className="mt-8 font-black italic leading-[0.95]">
          <span className="block text-3xl text-sky-300 sm:text-4xl">REUNIÃO</span>
          <span className="block text-2xl sm:text-3xl">TOMADA DE DECISÃO</span>
        </h1>
        <p className="mt-3 text-sm text-sky-100/80">Preparando a apresentação pública...</p>

        <div className="mt-8 h-2.5 overflow-hidden rounded-full bg-white/20">
          <div
            className="h-full rounded-full bg-gradient-to-r from-sky-300 to-white transition-[width] duration-200 ease-out"
            style={{ width: `${shown}%` }}
          />
        </div>
        <div className="mt-2 flex items-center justify-between text-xs text-sky-100/90">
          <span>{STEPS[step]}</span>
          <span className="tabular-nums font-semibold">{shown}%</span>
        </div>
      </div>
    </div>
  )
}
