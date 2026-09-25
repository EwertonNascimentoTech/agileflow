import { createElement } from "react"

import { Label } from "@/components/ui/label"
import { IconTile } from "@/modules/portal/portfolioUi"
import { PORTAL_ICON_NAMES, PORTAL_PALETTE, resolvePortalIcon } from "@/modules/portal/portfolioMeta"

/** Ícone e cor de Programa/Pilar como aparecem no Portal do Cliente. */
export function ProgramAppearanceFields({
  icon,
  color,
  onIcon,
  onColor,
}: {
  icon: string | null
  color: string | null
  onIcon: (v: string | null) => void
  onColor: (v: string | null) => void
}) {
  const preview = color ?? PORTAL_PALETTE[0]
  return (
    <div className="space-y-3">
      <div className="space-y-1.5">
        <Label>Ícone no Portal</Label>
        <div className="flex max-h-32 flex-wrap gap-1 overflow-y-auto rounded-md border p-1.5">
          {PORTAL_ICON_NAMES.map((name) => {
            const on = icon === name
            return (
              <button
                key={name}
                type="button"
                title={name}
                aria-label={name}
                aria-pressed={on}
                onClick={() => onIcon(on ? null : name)}
                className={`flex h-8 w-8 items-center justify-center rounded-md transition-colors ${on ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted"}`}
              >
                {createElement(resolvePortalIcon(name), { size: 16 })}
              </button>
            )
          })}
        </div>
      </div>
      <div className="space-y-1.5">
        <Label>Cor</Label>
        <div className="flex flex-wrap items-center gap-2">
          {PORTAL_PALETTE.map((c) => (
            <button
              key={c}
              type="button"
              aria-label={`Cor ${c}`}
              aria-pressed={color === c}
              onClick={() => onColor(c)}
              className={`h-7 w-7 rounded-full ring-offset-2 ring-offset-background ${color === c ? "ring-2 ring-foreground" : ""}`}
              style={{ backgroundColor: c }}
            />
          ))}
          <input
            type="color"
            value={preview}
            onChange={(e) => onColor(e.target.value.toUpperCase())}
            className="h-7 w-10 cursor-pointer rounded border bg-transparent"
            aria-label="Outra cor"
          />
          {color && (
            <button type="button" className="text-xs text-muted-foreground hover:underline" onClick={() => onColor(null)}>
              usar padrão
            </button>
          )}
          <span className="ml-auto"><IconTile icon={icon} color={preview} size={36} /></span>
        </div>
      </div>
    </div>
  )
}
