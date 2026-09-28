import logo from "@/assets/brand/agileflow-logo.png"
import logoLight from "@/assets/brand/agileflow-logo-light.png"
import mark from "@/assets/brand/agileflow-mark.png"
import { cn } from "@/lib/utils"

/**
 * Logo AgileFlow. `variant`:
 *  - "auto" (padrão): colorida no tema claro, versão clara no escuro;
 *  - "color": sempre colorida (fundo claro fixo);
 *  - "light": sempre a versão clara ("Agile" em branco), para fundo escuro fixo (menu, Portal).
 * A altura vem de `className` (ex.: "h-8"); a largura acompanha a proporção.
 */
export function BrandLogo({ variant = "auto", className = "h-8" }: {
  variant?: "auto" | "color" | "light"
  className?: string
}) {
  if (variant !== "auto") {
    return <img src={variant === "light" ? logoLight : logo} alt="AgileFlow" className={cn("w-auto select-none", className)} draggable={false} />
  }
  return (
    <>
      <img src={logo} alt="AgileFlow" className={cn("w-auto select-none dark:hidden", className)} draggable={false} />
      <img src={logoLight} alt="AgileFlow" className={cn("hidden w-auto select-none dark:block", className)} draggable={false} />
    </>
  )
}

/** Símbolo (∞) da marca — selo do menu lateral e espaços pequenos. */
export function BrandMark({ className = "w-8" }: { className?: string }) {
  return <img src={mark} alt="AgileFlow" className={cn("h-auto select-none", className)} draggable={false} />
}
