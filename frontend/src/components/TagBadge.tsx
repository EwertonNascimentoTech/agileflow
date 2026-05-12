import { X } from "lucide-react"
import type { Tag } from "@/api/atendimento"
import { cn } from "@/lib/utils"

interface Props {
  tag: Tag
  onRemove?: () => void
  className?: string
}

function hexToRgb(hex: string) {
  const r = parseInt(hex.slice(1, 3), 16)
  const g = parseInt(hex.slice(3, 5), 16)
  const b = parseInt(hex.slice(5, 7), 16)
  // Luminance — decide se texto é branco ou preto
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255
  return { r, g, b, luminance }
}

export function TagBadge({ tag, onRemove, className }: Props) {
  const { r, g, b, luminance } = hexToRgb(tag.color)
  const textColor = luminance > 0.5 ? "rgba(0,0,0,0.75)" : "#fff"
  const bg = `rgba(${r},${g},${b},0.18)`

  return (
    <span
      className={cn("inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium", className)}
      style={{ backgroundColor: bg, color: textColor, border: `1px solid rgba(${r},${g},${b},0.4)` }}
    >
      <span
        className="h-1.5 w-1.5 rounded-full shrink-0"
        style={{ backgroundColor: tag.color }}
      />
      {tag.name}
      {onRemove && (
        <button onClick={onRemove} className="ml-0.5 hover:opacity-70">
          <X size={10} />
        </button>
      )}
    </span>
  )
}

export function TagList({ tags, onRemove }: { tags: Tag[]; onRemove?: (id: string) => void }) {
  if (!tags.length) return null
  return (
    <div className="flex flex-wrap gap-1.5">
      {tags.map(t => (
        <TagBadge key={String(t.id)} tag={t} onRemove={onRemove ? () => onRemove(String(t.id)) : undefined} />
      ))}
    </div>
  )
}
