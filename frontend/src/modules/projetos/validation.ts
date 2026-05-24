import type { ProjectDemandFormField, ProjectDemandFormSection, ProjectStatusSectionLink } from "@/api/projetos"
import { getFieldVisibility, normalizeFieldType, type FieldVisibilityMode } from "@/modules/projetos/FormFieldRenderer"

export function isValueEmpty(value: unknown, fieldType: string): boolean {
  const t = normalizeFieldType(fieldType)
  if (value === undefined || value === null) return true
  if (t === "checkbox") return value !== true
  if (Array.isArray(value)) return value.length === 0
  if (typeof value === "string") return value.trim() === ""
  return false
}

export function resolveSectionMode(
  sectionId: string,
  sectionLinks: ProjectStatusSectionLink[],
): FieldVisibilityMode {
  const link = sectionLinks.find((l) => l.section_id === sectionId)
  return (link?.mode as FieldVisibilityMode | undefined) ?? "hidden"
}

export function resolveFieldMode(
  field: ProjectDemandFormField,
  statusId: string,
  parentMode: FieldVisibilityMode,
): FieldVisibilityMode {
  const entry = getFieldVisibility(field).find((v) => v.status_id === statusId)
  return entry?.mode ?? parentMode
}

export interface ValidationResult {
  errors: Record<string, string>
  missingLabels: string[]
}

export function validateRequiredFields(args: {
  statusId: string
  formSections: ProjectDemandFormSection[]
  fieldsBySection: Record<string, ProjectDemandFormField[]>
  sectionLinks: ProjectStatusSectionLink[]
  formValues: Record<string, unknown>
}): ValidationResult {
  const errors: Record<string, string> = {}
  const missingLabels: string[] = []
  for (const section of args.formSections) {
    const secMode = resolveSectionMode(section.id, args.sectionLinks)
    const fields = args.fieldsBySection[section.id] ?? []
    for (const field of fields) {
      if (!field.is_active) continue
      const mode = resolveFieldMode(field, args.statusId, secMode)
      if (mode === "hidden" || mode === "visible") continue
      const isRequired = mode === "required" || (mode === "editable" && field.is_required)
      if (!isRequired) continue
      if (isValueEmpty(args.formValues[field.field_key], field.field_type)) {
        errors[field.id] = "Campo obrigatório"
        missingLabels.push(field.label)
      }
    }
  }
  return { errors, missingLabels }
}

export function formatMissingFieldsMessage(missingLabels: string[]): string {
  const list = missingLabels.length <= 3
    ? missingLabels.join(", ")
    : `${missingLabels.slice(0, 3).join(", ")} e mais ${missingLabels.length - 3}`
  const plural = missingLabels.length > 1
  return `Preencha o${plural ? "s" : ""} campo${plural ? "s" : ""} obrigatório${plural ? "s" : ""}: ${list}`
}
