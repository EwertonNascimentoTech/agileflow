import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import type { DefaultFormFieldKey, ProjectDefaultFormField } from "@/api/projetos"
import type { User } from "@/types"
import { normalizeFieldType } from "@/modules/projetos/FormFieldRenderer"
import { parseDefaultFieldOptions } from "@/modules/projetos/defaultFormOptions"
import { normalizeDefaultFieldType } from "@/modules/projetos/defaultFormFieldTypes"

const NO_ASSIGNEE = "__none__"
const NO_SELECT = "__none__"

export function DefaultFormFieldControl({
  field,
  value,
  onChange,
  users = [],
  disabled = false,
  titleClassName,
  error,
  required,
}: {
  field: ProjectDefaultFormField
  value: string | null
  onChange: (value: string | null) => void
  users?: User[]
  disabled?: boolean
  titleClassName?: string
  error?: string
  required?: boolean
}) {
  const isRequired = required ?? field.is_required
  const type = normalizeFieldType(normalizeDefaultFieldType(field.field_key, field.field_type))
  const key = field.field_key as DefaultFormFieldKey

  let control: React.ReactNode

  if (type === "text_long") {
    control = (
      <Textarea
        rows={key === "description" ? 5 : 3}
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Digite aqui…"
        disabled={disabled}
        className={titleClassName}
      />
    )
  } else if (type === "number") {
    control = (
      <Input
        type="number"
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value === "" ? null : e.target.value)}
        disabled={disabled}
        className={titleClassName}
      />
    )
  } else if (type === "date") {
    control = (
      <Input
        type="date"
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value || null)}
        disabled={disabled}
      />
    )
  } else if (type === "datetime") {
    control = (
      <Input
        type="datetime-local"
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value || null)}
        disabled={disabled}
      />
    )
  } else if (type === "url") {
    control = (
      <Input
        type="url"
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value)}
        placeholder="https://…"
        disabled={disabled}
        className={titleClassName}
      />
    )
  } else if (type === "user" || key === "assigned_to") {
    control = (
      <Select
        value={value && value !== "" ? value : NO_ASSIGNEE}
        onValueChange={(v) => onChange(v === NO_ASSIGNEE ? null : v)}
        disabled={disabled}
      >
        <SelectTrigger><SelectValue placeholder="Selecionar…" /></SelectTrigger>
        <SelectContent>
          <SelectItem value={NO_ASSIGNEE}>Sem responsável</SelectItem>
          {users.map((u) => (
            <SelectItem key={u.id} value={u.id}>{u.full_name}</SelectItem>
          ))}
        </SelectContent>
      </Select>
    )
  } else if (type === "select") {
    const options = parseDefaultFieldOptions(field)
    if (options.length === 0) {
      control = (
        <p className="text-xs text-muted-foreground rounded-md border border-dashed p-2">
          Nenhuma opção cadastrada. Configure em Configurações → Formulário padrão.
        </p>
      )
    } else {
      control = (
        <Select
          value={value && value !== "" ? value : NO_SELECT}
          onValueChange={(v) => onChange(v === NO_SELECT ? null : v)}
          disabled={disabled}
        >
          <SelectTrigger><SelectValue placeholder="Selecionar…" /></SelectTrigger>
          <SelectContent>
            <SelectItem value={NO_SELECT}>— Não informado —</SelectItem>
            {options.map((opt) => (
              <SelectItem key={opt.value} value={opt.value}>
                <span className="inline-flex items-center gap-2">
                  {opt.color && <span className="h-2 w-2 rounded-full" style={{ backgroundColor: opt.color }} />}
                  {opt.label}
                </span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )
    }
  } else {
    control = (
      <Input
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value)}
        placeholder={key === "title" ? "Ex: Ajustar fluxo de aprovação" : "Digite aqui…"}
        disabled={disabled}
        className={titleClassName}
      />
    )
  }

  return (
    <div className="space-y-1.5">
      <Label>
        {field.label}
        {isRequired && <span className="text-destructive ml-0.5">*</span>}
      </Label>
      {control}
      {error && <p className="text-[11px] text-destructive">{error}</p>}
    </div>
  )
}
