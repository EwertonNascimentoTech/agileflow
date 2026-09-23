export function getRowBreak(validation: Record<string, unknown> | null | undefined): boolean {
  const v = (validation as { row_break?: unknown } | null | undefined)?.row_break
  if (v === false) return false
  return true
}

export interface FieldRow<T> {
  items: T[]
}

export function groupIntoRows<T>(items: T[], getRb: (item: T) => boolean): FieldRow<T>[] {
  const rows: FieldRow<T>[] = []
  for (const item of items) {
    if (rows.length === 0 || getRb(item)) {
      rows.push({ items: [item] })
    } else {
      rows[rows.length - 1].items.push(item)
    }
  }
  return rows
}
