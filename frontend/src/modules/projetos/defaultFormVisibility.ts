import type { DefaultFormFieldKey, ProjectDefaultFormField, ProjectStatusDefaultFormLink } from "@/api/projetos"
import type { FieldVisibilityMode } from "@/modules/projetos/FormFieldRenderer"

export function resolveDefaultFieldMode(
  field: ProjectDefaultFormField,
  links: ProjectStatusDefaultFormLink[],
): FieldVisibilityMode {
  const link = links.find((l) => l.field_key === field.field_key)
  if (link) return link.mode as FieldVisibilityMode
  if (!field.is_visible) return "hidden"
  if (field.is_required) return "required"
  return "editable"
}

export function isDefaultFieldShown(
  field: ProjectDefaultFormField,
  links: ProjectStatusDefaultFormLink[],
): boolean {
  return resolveDefaultFieldMode(field, links) !== "hidden"
}

export function isDefaultFieldReadOnly(
  field: ProjectDefaultFormField,
  links: ProjectStatusDefaultFormLink[],
): boolean {
  return resolveDefaultFieldMode(field, links) === "visible"
}

export function isDefaultFieldRequired(
  field: ProjectDefaultFormField,
  links: ProjectStatusDefaultFormLink[],
): boolean {
  const mode = resolveDefaultFieldMode(field, links)
  return mode === "required" || (mode === "editable" && field.is_required)
}

export function filterDefaultFormFieldsForStatus(
  fields: ProjectDefaultFormField[],
  links: ProjectStatusDefaultFormLink[],
): ProjectDefaultFormField[] {
  return fields.filter((f) => isDefaultFieldShown(f, links))
}

export function defaultFieldModeForStatus(
  fieldKey: DefaultFormFieldKey,
  links: ProjectStatusDefaultFormLink[],
  fields: ProjectDefaultFormField[],
): FieldVisibilityMode {
  const field = fields.find((f) => f.field_key === fieldKey)
  if (!field) return "hidden"
  return resolveDefaultFieldMode(field, links)
}
