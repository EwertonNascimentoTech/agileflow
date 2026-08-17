import type { ProjectDemandFormField, ProjectDefaultFormField } from "@/api/projetos"
import { defaultSelectLabel } from "@/modules/projetos/defaultFormUtils"
import { normalizeFieldType, parseFieldOptions } from "@/modules/projetos/FormFieldRenderer"

export function isEmptyCardValue(value: unknown): boolean {
  if (value === null || value === undefined) return true
  if (typeof value === "string") return value.trim() === ""
  if (Array.isArray(value)) return value.length === 0
  return false
}

export function formatCardCustomFieldValue(
  field: ProjectDemandFormField | undefined,
  value: unknown,
  resolveUserName: (id: string | null | undefined) => string | null,
): string | null {
  if (isEmptyCardValue(value)) return null
  const type = normalizeFieldType(field?.field_type ?? "text")

  if (type === "checkbox") {
    return value === true || value === "true" ? "Sim" : "Não"
  }
  if (type === "date") {
    const raw = typeof value === "string" ? value : null
    if (!raw) return String(value)
    const d = new Date(raw)
    return Number.isNaN(d.getTime()) ? raw : d.toLocaleDateString("pt-BR")
  }
  if (type === "user" || type === "current_user") {
    const id = typeof value === "string" ? value.trim() : null
    if (!id) return null
    // current_user grava o nome; user pode gravar UUID. Só resolve quando parece id.
    const looksLikeId = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)
    if (!looksLikeId) return id
    return resolveUserName(id) ?? id
  }
  if (type === "select") {
    if (field) {
      const opt = parseFieldOptions(field).find((o) => o.value === value)
      if (opt) return opt.label
    }
    return String(value)
  }
  if (type === "multi_select") {
    const arr = Array.isArray(value) ? value.filter((x): x is string => typeof x === "string") : []
    if (arr.length === 0) return null
    if (field) {
      const opts = parseFieldOptions(field)
      return arr.map((v) => opts.find((o) => o.value === v)?.label ?? v).join(", ")
    }
    return arr.join(", ")
  }
  if (type === "file") {
    const files = Array.isArray(value) ? value : []
    const names = files
      .map((f) => {
        if (f && typeof f === "object" && "filename" in f) return String((f as { filename: string }).filename)
        return null
      })
      .filter((x): x is string => !!x)
    return names.length ? names.join(", ") : null
  }
  if (type === "number") return String(value)
  if (type === "text_long") {
    const text = String(value).trim()
    return text.length > 120 ? `${text.slice(0, 117)}…` : text
  }
  return String(value).trim() || null
}

export function formatDiretoriaAreaLabel(
  fields: ProjectDefaultFormField[],
  key: "diretoria" | "area",
  value: string | null | undefined,
): string | null {
  if (!value) return null
  return defaultSelectLabel(fields, key, value) ?? value
}

/** Agrupa valores de filtro que exibem o mesmo rótulo (ex.: person_id e user_id do mesmo usuário). */
export function groupFilterValuesByLabel(
  values: string[],
  labelOf: (value: string) => string,
): Array<{ label: string; values: string[] }> {
  const groups = new Map<string, string[]>()
  for (const value of values) {
    const label = labelOf(value)
    const bucket = groups.get(label) ?? []
    if (!bucket.includes(value)) bucket.push(value)
    groups.set(label, bucket)
  }
  return [...groups.entries()]
    .map(([label, vals]) => ({ label, values: vals }))
    .sort((a, b) => a.label.localeCompare(b.label, "pt-BR"))
}

export function toggleGroupedFilterSelection(
  current: string[],
  groupValues: string[],
): string[] {
  const allSelected = groupValues.every((v) => current.includes(v))
  if (allSelected) return current.filter((v) => !groupValues.includes(v))
  return [...new Set([...current, ...groupValues])]
}

export function groupedFilterChecked(current: string[], groupValues: string[]): boolean {
  return groupValues.some((v) => current.includes(v))
}

/** Compara requisitantes pelo rótulo exibido (evita duplicata person_id vs user_id). */
export function requesterValuesMatchFilter(
  taskValues: string[],
  selectedValues: string[],
  labelOf: (value: string) => string,
): boolean {
  const selectedLabels = new Set(selectedValues.map(labelOf))
  return taskValues.some((v) => selectedLabels.has(labelOf(v)))
}
