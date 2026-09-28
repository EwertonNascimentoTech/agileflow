import { useState } from "react"
import { cn } from "@/lib/utils"

function initialsOf(name?: string | null): string {
  const parts = (name ?? "").trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return "?"
  return parts.slice(0, 2).map((p) => p[0]).join("").toUpperCase()
}

function AvatarInner({ name, url, size, className }: { name?: string | null; url?: string | null; size: number; className?: string }) {
  const [quebrada, setQuebrada] = useState(false)
  const style = { width: size, height: size }
  if (url && !quebrada) {
    return (
      <img
        src={url}
        alt=""
        style={style}
        onError={() => setQuebrada(true)}
        className={cn("shrink-0 rounded-full bg-muted object-cover", className)}
      />
    )
  }
  return (
    <span
      style={{ ...style, fontSize: Math.max(10, Math.round(size * 0.36)) }}
      className={cn("flex shrink-0 items-center justify-center rounded-full bg-primary/10 font-bold text-primary", className)}
      aria-hidden
    >
      {initialsOf(name)}
    </span>
  )
}

/** Foto do usuário (URL assinada do perfil) ou, sem foto/erro ao carregar, as iniciais. */
export function UserAvatar({ name, url, size = 32, className }: {
  name?: string | null
  url?: string | null
  size?: number
  className?: string
}) {
  // key: URL nova (troca de foto ou renovação da assinatura) reinicia o estado de erro.
  return <AvatarInner key={url ?? "sem-foto"} name={name} url={url} size={size} className={className} />
}
