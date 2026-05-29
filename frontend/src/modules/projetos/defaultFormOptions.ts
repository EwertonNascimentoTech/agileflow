import type { ProjectDefaultFormField } from "@/api/projetos"

export interface DefaultSelectOption {
  value: string
  label: string
  color?: string
}

export function parseDefaultFieldOptions(field: ProjectDefaultFormField): DefaultSelectOption[] {
  const items = field.options?.items
  if (!Array.isArray(items)) return []
  return items
    .map((item): DefaultSelectOption | null => {
      if (typeof item === "string") return { value: item, label: item }
      if (item && typeof item === "object") {
        const obj = item as Record<string, unknown>
        const value = String(obj.value ?? "").trim()
        if (!value) return null
        const label = String(obj.label ?? value).trim()
        const color = typeof obj.color === "string" ? obj.color : undefined
        return { value, label, color }
      }
      return null
    })
    .filter((x): x is DefaultSelectOption => x !== null)
}

export function slugifyOptionLabel(label: string): string {
  return label
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 80) || "opcao"
}

export function normalizeOptionsPayload(items: DefaultSelectOption[]): { items: DefaultSelectOption[] } {
  const seen = new Set<string>()
  const out: DefaultSelectOption[] = []
  items.forEach((item) => {
    const label = item.label.trim()
    if (!label) return
    let value = item.value.trim() || slugifyOptionLabel(label)
    const base = value
    let n = 2
    while (seen.has(value)) {
      value = `${base}_${n}`
      n += 1
    }
    seen.add(value)
    out.push({ value, label, ...(item.color ? { color: item.color } : {}) })
  })
  return { items: out }
}

export function optionLabelByValue(field: ProjectDefaultFormField, value: string | null | undefined): string | null {
  if (!value) return null
  return parseDefaultFieldOptions(field).find((o) => o.value === value)?.label ?? value
}
