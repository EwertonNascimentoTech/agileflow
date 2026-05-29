import type { DefaultFormFieldKey, ProjectDefaultFormField, ProjectStatusDefaultFormLink } from "@/api/projetos"
import type { User } from "@/types"
import { DefaultFormFieldControl } from "@/modules/projetos/DefaultFormFieldControl"
import { groupDefaultFormFieldsIntoRows } from "@/modules/projetos/defaultFormLayout"
import type { DefaultFormValues } from "@/modules/projetos/defaultFormUtils"
import { isDefaultFieldReadOnly } from "@/modules/projetos/defaultFormVisibility"

export function DefaultFormOrderedFields({
  fields,
  values,
  onChange,
  users = [],
  errors = {},
  titleClassName,
  disableAssignee = false,
  defaultFormLinks = [],
}: {
  fields: ProjectDefaultFormField[]
  values: DefaultFormValues
  onChange: (patch: Partial<DefaultFormValues>) => void
  users?: User[]
  errors?: Partial<Record<DefaultFormFieldKey, string>>
  titleClassName?: string
  disableAssignee?: boolean
  defaultFormLinks?: ProjectStatusDefaultFormLink[]
}) {
  const rows = groupDefaultFormFieldsIntoRows(fields, defaultFormLinks)

  function valueFor(key: DefaultFormFieldKey): string | null {
    const v = values[key]
    return v === null || v === undefined ? null : String(v)
  }

  function setValue(key: DefaultFormFieldKey, v: string | null) {
    if (key === "assigned_to") onChange({ assigned_to: v })
    else if (key === "title") onChange({ title: v ?? "" })
    else if (key === "description") onChange({ description: v ?? "" })
    else if (key === "diretoria") onChange({ diretoria: v })
    else if (key === "area") onChange({ area: v })
    else if (key === "start_date") onChange({ start_date: v ?? "" })
    else if (key === "due_date") onChange({ due_date: v ?? "" })
  }

  function renderField(cfg: ProjectDefaultFormField) {
    return (
      <DefaultFormFieldControl
        key={cfg.field_key}
        field={cfg}
        value={valueFor(cfg.field_key)}
        onChange={(v) => setValue(cfg.field_key, v)}
        users={users}
        disabled={(cfg.field_key === "assigned_to" && disableAssignee) || isDefaultFieldReadOnly(cfg, defaultFormLinks)}
        titleClassName={cfg.field_key === "title" ? titleClassName : undefined}
        error={errors[cfg.field_key]}
      />
    )
  }

  return (
    <div className="space-y-4">
      {rows.map((row, rowIdx) => (
        row.length === 1 ? (
          <div key={row[0].field_key}>{renderField(row[0])}</div>
        ) : (
          <div key={`row-${rowIdx}`} className="grid gap-3 sm:grid-cols-2">
            {row.map((cfg) => renderField(cfg))}
          </div>
        )
      ))}
    </div>
  )
}
