import type { DefaultFormFieldKey, ProjectDefaultFormField, ProjectStatusDefaultFormLink } from "@/api/projetos"
import { normalizeDefaultFieldType } from "@/modules/projetos/defaultFormFieldTypes"
import { sortDefaultFormFields } from "@/modules/projetos/defaultFormUtils"
import { isDefaultFieldShown } from "@/modules/projetos/defaultFormVisibility"

/** Campos fixos no cabeçalho do drawer (não entram na coluna Planejamento). */
export const DRAWER_HEADER_FIELD_KEYS = new Set<DefaultFormFieldKey>(["title", "assigned_to"])

/** Agrupa campos visíveis em linhas, mantendo a ordem configurada.
 *  Pares consecutivos de select ou de date ficam lado a lado. */
export function groupDefaultFormFieldsIntoRows(
  fields: ProjectDefaultFormField[],
  defaultFormLinks: ProjectStatusDefaultFormLink[] = [],
): ProjectDefaultFormField[][] {
  const visible = sortDefaultFormFields(fields).filter((f) => isDefaultFieldShown(f, defaultFormLinks))
  const rows: ProjectDefaultFormField[][] = []
  let i = 0
  while (i < visible.length) {
    const current = visible[i]
    const type = normalizeDefaultFieldType(current.field_key, current.field_type)
    const next = visible[i + 1]
    if (next) {
      const nextType = normalizeDefaultFieldType(next.field_key, next.field_type)
      if (type === "select" && nextType === "select") {
        rows.push([current, next])
        i += 2
        continue
      }
      if (type === "date" && nextType === "date") {
        rows.push([current, next])
        i += 2
        continue
      }
    }
    rows.push([current])
    i += 1
  }
  return rows
}

/** Campos da seção Planejamento no drawer (ordem da configuração; descrição fica abaixo). */
export function defaultFormPlanningFields(
  fields: ProjectDefaultFormField[],
  defaultFormLinks: ProjectStatusDefaultFormLink[] = [],
): ProjectDefaultFormField[] {
  return sortDefaultFormFields(fields)
    .filter((f) => isDefaultFieldShown(f, defaultFormLinks))
    .filter((f) => !DRAWER_HEADER_FIELD_KEYS.has(f.field_key))
    .filter((f) => f.field_key !== "description")
}

export function moveDefaultFormFieldOrder<T extends { field_key: DefaultFormFieldKey; order: number }>(
  items: T[],
  fromIndex: number,
  toIndex: number,
): T[] {
  const next = [...items]
  const [removed] = next.splice(fromIndex, 1)
  next.splice(toIndex, 0, removed)
  return next.map((item, index) => ({ ...item, order: index }))
}
