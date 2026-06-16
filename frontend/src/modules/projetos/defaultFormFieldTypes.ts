import type { DefaultFormFieldKey } from "@/api/projetos"

export interface DefaultFieldTypeOption {
  value: string
  label: string
  description: string
}

export const DEFAULT_FIELD_TYPE_CATALOG: DefaultFieldTypeOption[] = [
  { value: "text", label: "Texto curto", description: "Uma linha de texto." },
  { value: "text_long", label: "Texto longo", description: "Várias linhas (área de texto)." },
  { value: "number", label: "Número", description: "Valor numérico." },
  { value: "date", label: "Data", description: "Somente dia/mês/ano." },
  { value: "datetime", label: "Data e hora", description: "Data com horário." },
  { value: "user", label: "Usuário", description: "Seleção de pessoa do time." },
  { value: "select", label: "Seleção única", description: "Lista de opções cadastradas." },
  { value: "url", label: "URL", description: "Link (https://…)." },
  { value: "file", label: "Anexo", description: "Upload de um ou mais arquivos." },
]

/** Tipos permitidos por campo (respeitam o que o card persiste no banco). */
export const ALLOWED_TYPES_BY_KEY: Record<DefaultFormFieldKey, string[]> = {
  title: ["text", "text_long"],
  description: ["text", "text_long", "url"],
  anexos: ["file"],
  assigned_to: ["user"],
  diretoria: ["select"],
  area: ["select"],
  start_date: ["date", "datetime"],
  due_date: ["date", "datetime"],
}

export const DEFAULT_TYPE_BY_KEY: Record<DefaultFormFieldKey, string> = {
  title: "text",
  description: "text_long",
  anexos: "file",
  assigned_to: "user",
  diretoria: "select",
  area: "select",
  start_date: "date",
  due_date: "date",
}

export function allowedTypesForKey(key: DefaultFormFieldKey): DefaultFieldTypeOption[] {
  const allowed = new Set(ALLOWED_TYPES_BY_KEY[key])
  return DEFAULT_FIELD_TYPE_CATALOG.filter((t) => allowed.has(t.value))
}

export function normalizeDefaultFieldType(fieldKey: DefaultFormFieldKey, fieldType: string | undefined): string {
  const normalized = fieldType?.trim() || DEFAULT_TYPE_BY_KEY[fieldKey]
  const allowed = ALLOWED_TYPES_BY_KEY[fieldKey]
  return allowed.includes(normalized) ? normalized : DEFAULT_TYPE_BY_KEY[fieldKey]
}

export function typeLabel(fieldType: string): string {
  return DEFAULT_FIELD_TYPE_CATALOG.find((t) => t.value === fieldType)?.label ?? fieldType
}

/** Converte valor do formulário para ISO ao salvar a demanda. */
export function defaultDateToIso(fieldType: string, raw: string): string | null {
  if (!raw.trim()) return null
  if (fieldType === "datetime") {
    return new Date(raw).toISOString()
  }
  return new Date(`${raw}T00:00:00`).toISOString()
}

/** Valor inicial para input date/datetime a partir do ISO da API. */
export function isoToDefaultDateInput(fieldType: string, iso: string | null | undefined): string {
  if (!iso) return ""
  if (fieldType === "datetime") return iso.slice(0, 16)
  return iso.slice(0, 10)
}
