import { useRef, useState } from "react"
import { Camera, Loader2, Trash2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { UserAvatar } from "@/components/UserAvatar"
import { authApi } from "@/api/auth"
import { toast } from "@/lib/toast"
import { errMsg } from "@/modules/profile/utils"

const LADO = 320

/** Recorta o centro da imagem em quadrado de 320 px e exporta JPEG. Passar pelo canvas também
 *  descarta os metadados (EXIF: localização, aparelho) antes do envio. */
async function recortarQuadrado(file: File): Promise<Blob> {
  const bmp = await createImageBitmap(file)
  const s = Math.min(bmp.width, bmp.height)
  const canvas = document.createElement("canvas")
  canvas.width = LADO
  canvas.height = LADO
  const ctx = canvas.getContext("2d")
  if (!ctx) throw new Error("Seu navegador não conseguiu processar a imagem.")
  ctx.fillStyle = "#ffffff" // PNG transparente não vira fundo preto no JPEG
  ctx.fillRect(0, 0, LADO, LADO)
  ctx.imageSmoothingQuality = "high"
  ctx.drawImage(bmp, (bmp.width - s) / 2, (bmp.height - s) / 2, s, s, 0, 0, LADO, LADO)
  bmp.close()
  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("Falha ao preparar a imagem."))), "image/jpeg", 0.88))
}

export default function AvatarEditor({ name, url, onChanged }: {
  name: string
  url: string | null | undefined
  onChanged: () => Promise<void>
}) {
  const input = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)

  async function escolher(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ""
    if (!file) return
    if (!/^image\/(jpeg|png|webp)$/.test(file.type)) { toast.error("Use uma imagem JPG, PNG ou WebP."); return }
    if (file.size > 15 * 1024 * 1024) { toast.error("Imagem muito grande (máximo 15 MB)."); return }
    setBusy(true)
    try {
      await authApi.uploadAvatar(await recortarQuadrado(file))
      await onChanged()
      toast.success("Foto atualizada.")
    } catch (err) {
      toast.error(errMsg(err, "Não foi possível enviar a foto."))
    } finally {
      setBusy(false)
    }
  }

  async function remover() {
    if (!confirm("Remover sua foto do perfil?")) return
    setBusy(true)
    try {
      await authApi.deleteAvatar()
      await onChanged()
      toast.success("Foto removida.")
    } catch (err) {
      toast.error(errMsg(err, "Não foi possível remover a foto."))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex shrink-0 flex-col items-center gap-2">
      <button
        type="button"
        onClick={() => input.current?.click()}
        disabled={busy}
        title="Trocar foto"
        aria-label="Trocar foto do perfil"
        className="group relative rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <UserAvatar name={name} url={url} size={96} className="text-2xl ring-4 ring-background" />
        <span className="absolute inset-0 flex items-center justify-center rounded-full bg-black/45 text-white opacity-0 transition group-hover:opacity-100 group-focus-visible:opacity-100">
          {busy ? <Loader2 size={22} className="animate-spin" /> : <Camera size={22} />}
        </span>
      </button>
      <input ref={input} type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={(e) => void escolher(e)} />
      <div className="flex items-center gap-1">
        <Button type="button" variant="ghost" size="sm" className="h-8 gap-1.5 text-xs" disabled={busy} onClick={() => input.current?.click()}>
          <Camera size={13} /> {url ? "Trocar foto" : "Adicionar foto"}
        </Button>
        {url && (
          <Button type="button" variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-destructive"
            disabled={busy} onClick={() => void remover()} title="Remover foto" aria-label="Remover foto">
            <Trash2 size={13} />
          </Button>
        )}
      </div>
    </div>
  )
}
