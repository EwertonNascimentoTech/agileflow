import { useState } from "react"
import { Check, Copy, KeyRound, Loader2 } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { toast } from "@/lib/toast"

export interface FirstAccessLink {
  path: string
  expires_hours: number
}

/** Gera o link de primeiro acesso (quem cadastra envia à pessoa). O token nunca sai numa
 * consulta por e-mail — só por aqui, para quem tem permissão de gerir o cadastro. */
export function FirstAccessLinkButton({
  generate,
  personName,
  size = "sm",
  variant = "outline",
  label = "Link de primeiro acesso",
}: {
  generate: () => Promise<FirstAccessLink>
  personName?: string
  size?: "sm" | "default" | "icon"
  variant?: "outline" | "ghost" | "default"
  label?: string
}) {
  const [loading, setLoading] = useState(false)
  const [link, setLink] = useState<{ url: string; hours: number } | null>(null)
  const [copied, setCopied] = useState(false)

  async function open() {
    setLoading(true)
    try {
      const res = await generate()
      setLink({ url: `${window.location.origin}${res.path}`, hours: res.expires_hours })
      setCopied(false)
    } catch (err) {
      const d = (err as { response?: { data?: { detail?: unknown } } })?.response?.data?.detail
      toast.error(typeof d === "string" ? d : "Não foi possível gerar o link.")
    } finally {
      setLoading(false)
    }
  }

  async function copy() {
    if (!link) return
    try {
      await navigator.clipboard.writeText(link.url)
      setCopied(true)
    } catch {
      toast.error("Copie o link manualmente.")
    }
  }

  return (
    <>
      <Button type="button" size={size} variant={variant} className="gap-1.5" onClick={() => void open()} disabled={loading}>
        {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <KeyRound size={14} />}
        {size !== "icon" && label}
      </Button>
      <Dialog open={!!link} onOpenChange={(o) => { if (!o) setLink(null) }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Link de primeiro acesso</DialogTitle>
            <DialogDescription>
              Envie este link {personName ? <>para <strong>{personName}</strong> </> : null}por um canal confiável
              (e-mail corporativo ou Teams). Com ele a pessoa cria a própria senha. Vale por {link?.hours} horas e
              só pode ser usado uma vez.
            </DialogDescription>
          </DialogHeader>
          <div className="flex gap-2">
            <Input readOnly value={link?.url ?? ""} onFocus={(e) => e.currentTarget.select()} />
            <Button type="button" variant="outline" className="gap-1.5" onClick={() => void copy()}>
              {copied ? <Check size={14} /> : <Copy size={14} />}
              {copied ? "Copiado" : "Copiar"}
            </Button>
          </div>
          <DialogFooter>
            <Button type="button" onClick={() => setLink(null)}>Fechar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
