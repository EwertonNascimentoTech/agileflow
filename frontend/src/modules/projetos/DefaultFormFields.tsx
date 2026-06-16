import type { DefaultFormFieldKey, ProjectDefaultFormField, ProjectStatusDefaultFormLink } from "@/api/projetos"
import type { User } from "@/types"
import { DefaultFormFieldControl } from "@/modules/projetos/DefaultFormFieldControl"
import { DefaultFormAttachmentControl } from "@/modules/projetos/DefaultFormAttachmentControl"
import { DefaultFormOrderedFields } from "@/modules/projetos/DefaultFormOrderedFields"
import { defaultFieldMap, type DefaultFormValues } from "@/modules/projetos/defaultFormUtils"
import { isDefaultFieldReadOnly, isDefaultFieldShown } from "@/modules/projetos/defaultFormVisibility"

export function DefaultFormFields({
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
  return (
    <DefaultFormOrderedFields
      fields={fields}
      values={values}
      onChange={onChange}
      users={users}
      errors={errors}
      titleClassName={titleClassName}
      disableAssignee={disableAssignee}
      defaultFormLinks={defaultFormLinks}
    />
  )
}

/** Campo único (ex.: drawer) — retorna null se oculto. */
export function DefaultFormFieldSlot({
  fields,
  fieldKey,
  values,
  onChange,
  users,
  disabled,
  titleClassName,
  error,
  defaultFormLinks = [],
}: {
  fields: ProjectDefaultFormField[]
  fieldKey: DefaultFormFieldKey
  values: DefaultFormValues
  onChange: (patch: Partial<DefaultFormValues>) => void
  users?: User[]
  disabled?: boolean
  titleClassName?: string
  error?: string
  defaultFormLinks?: ProjectStatusDefaultFormLink[]
}) {
  const cfg = defaultFieldMap(fields).get(fieldKey)
  if (!cfg || !isDefaultFieldShown(cfg, defaultFormLinks)) return null

  const readOnly = isDefaultFieldReadOnly(cfg, defaultFormLinks)

  // Anexos: campo padrão multi-arquivo (não usa o controle string genérico).
  if (fieldKey === "anexos") {
    return (
      <DefaultFormAttachmentControl
        field={cfg}
        value={values.anexos}
        onChange={(files) => onChange({ anexos: files })}
        disabled={disabled || readOnly}
        error={error}
      />
    )
  }

  const v = values[fieldKey]
  const strVal = v === null || v === undefined ? null : String(v)

  return (
    <DefaultFormFieldControl
      field={cfg}
      value={strVal}
      onChange={(next) => {
        if (fieldKey === "assigned_to") onChange({ assigned_to: next })
        else if (fieldKey === "title") onChange({ title: next ?? "" })
        else if (fieldKey === "description") onChange({ description: next ?? "" })
        else if (fieldKey === "diretoria") onChange({ diretoria: next })
        else if (fieldKey === "area") onChange({ area: next })
        else if (fieldKey === "start_date") onChange({ start_date: next ?? "" })
        else if (fieldKey === "due_date") onChange({ due_date: next ?? "" })
      }}
      users={users}
      disabled={disabled || readOnly}
      titleClassName={titleClassName}
      error={error}
    />
  )
}
