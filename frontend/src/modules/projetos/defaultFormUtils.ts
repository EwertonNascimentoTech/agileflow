import type { DefaultFormFieldKey, ProjectDefaultFormField, ProjectStatusDefaultFormLink, ProjectUpload } from "@/api/projetos"
import { isDefaultFieldRequired, isDefaultFieldShown } from "@/modules/projetos/defaultFormVisibility"
import { optionLabelByValue, parseDefaultFieldOptions } from "@/modules/projetos/defaultFormOptions"

export const FALLBACK_DEFAULT_FORM_FIELDS: ProjectDefaultFormField[] = [
  { id: "title", field_key: "title", label: "Título", field_type: "text", options: null, is_visible: true, is_required: true, order: 0, is_system: true, created_at: "", updated_at: "" },
  { id: "description", field_key: "description", label: "Descrição", field_type: "text_long", options: null, is_visible: true, is_required: false, order: 1, is_system: true, created_at: "", updated_at: "" },
  { id: "assigned_to", field_key: "assigned_to", label: "Responsável", field_type: "user", options: null, is_visible: true, is_required: false, order: 2, is_system: true, created_at: "", updated_at: "" },
  { id: "diretoria", field_key: "diretoria", label: "Diretoria", field_type: "select", options: { items: [] }, is_visible: true, is_required: false, order: 3, is_system: true, created_at: "", updated_at: "" },
  { id: "area", field_key: "area", label: "Área", field_type: "select", options: { items: [] }, is_visible: true, is_required: false, order: 4, is_system: true, created_at: "", updated_at: "" },
  { id: "start_date", field_key: "start_date", label: "Data de início", field_type: "date", options: null, is_visible: true, is_required: false, order: 5, is_system: true, created_at: "", updated_at: "" },
  { id: "due_date", field_key: "due_date", label: "Prazo", field_type: "date", options: null, is_visible: true, is_required: false, order: 6, is_system: true, created_at: "", updated_at: "" },
  { id: "anexos", field_key: "anexos", label: "Anexos", field_type: "file", options: null, is_visible: true, is_required: false, order: 7, is_system: true, created_at: "", updated_at: "" },
]

export function sortDefaultFormFields(fields: ProjectDefaultFormField[]): ProjectDefaultFormField[] {
  return [...fields].sort((a, b) => a.order - b.order || a.field_key.localeCompare(b.field_key))
}

export function defaultFieldMap(fields: ProjectDefaultFormField[]): Map<DefaultFormFieldKey, ProjectDefaultFormField> {
  return new Map(fields.map((f) => [f.field_key, f]))
}

export function defaultSelectOptions(
  fields: ProjectDefaultFormField[],
  key: "diretoria" | "area",
) {
  const field = defaultFieldMap(fields).get(key)
  return field ? parseDefaultFieldOptions(field) : []
}

export function defaultSelectLabel(
  fields: ProjectDefaultFormField[],
  key: "diretoria" | "area",
  value: string | null | undefined,
): string | null {
  const field = defaultFieldMap(fields).get(key)
  return field ? optionLabelByValue(field, value) : (value ?? null)
}

export function isDefaultFieldEmpty(key: DefaultFormFieldKey, value: unknown): boolean {
  if (key === "title" || key === "description") {
    return value === null || value === undefined || String(value).trim() === ""
  }
  if (key === "assigned_to") return value === null || value === undefined || value === ""
  if (key === "start_date" || key === "due_date") return value === null || value === undefined || value === ""
  if (key === "diretoria" || key === "area") return value === null || value === undefined || value === ""
  if (key === "anexos") return !Array.isArray(value) || value.length === 0
  return value === null || value === undefined
}

export interface DefaultFormValues {
  title: string
  description: string
  assigned_to: string | null
  diretoria: string | null
  area: string | null
  start_date: string
  due_date: string
  anexos?: ProjectUpload[] | null
}

export function validateDefaultFormValues(
  fields: ProjectDefaultFormField[],
  values: DefaultFormValues,
  defaultFormLinks: ProjectStatusDefaultFormLink[] = [],
): { errors: Partial<Record<DefaultFormFieldKey, string>>; missingLabels: string[] } {
  const errors: Partial<Record<DefaultFormFieldKey, string>> = {}
  const missingLabels: string[] = []
  for (const field of sortDefaultFormFields(fields)) {
    if (!isDefaultFieldShown(field, defaultFormLinks)) continue
    if (!isDefaultFieldRequired(field, defaultFormLinks)) continue
    const val = values[field.field_key]
    if (isDefaultFieldEmpty(field.field_key, val)) {
      errors[field.field_key] = "Campo obrigatório"
      missingLabels.push(field.label)
    }
  }
  return { errors, missingLabels }
}
