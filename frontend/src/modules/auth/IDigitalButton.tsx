import { useState } from "react"
import { Loader2 } from "lucide-react"

import logoWhite from "@/assets/idigital/idigital-white.svg"
import { ssoLogin } from "@/lib/sso"

/** "Entre com o [IDigital]" — mesma identidade do botão do SDK IDigital (azul #164194, logo oficial). */
export function IDigitalButton({ onError }: { onError?: (message: string) => void }) {
  const [busy, setBusy] = useState(false)

  async function start() {
    if (busy) return
    setBusy(true)
    try {
      await ssoLogin()
    } catch (err) {
      setBusy(false)
      onError?.(err instanceof Error ? err.message : "Não foi possível iniciar o login com o IDigital.")
    }
  }

  return (
    <button
      type="button"
      onClick={() => void start()}
      disabled={busy}
      aria-label="Entre com o IDigital"
      className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-[#164194] px-4 text-base font-medium text-white transition-colors hover:bg-[#12357a] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 active:scale-[0.99] disabled:cursor-wait disabled:opacity-75"
    >
      {busy ? (
        <>
          <Loader2 size={16} className="animate-spin" /> Redirecionando…
        </>
      ) : (
        <>
          <span>Entre com o</span>
          <img src={logoWhite} alt="IDigital" className="h-6 w-auto" />
        </>
      )}
    </button>
  )
}
