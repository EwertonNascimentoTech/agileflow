import { type ProjectDemandFormField } from "@/api/projetos"
import type { User } from "@/types"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Switch } from "@/components/ui/switch"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Label } from "@/components/ui/label"
import { AttachmentField } from "@/components/AttachmentField"

const LEGACY_TYPE_MAP: Record<string, string> = {
  textarea: "text_long",
  boolean: "checkbox",
}

export function normalizeFieldType(t: string): string {
  return LEGACY_TYPE_MAP[t] ?? t
}

export interface RichOption {
  value: string
  label: string
  color?: string
}

export function parseFieldOptions(field: ProjectDemandFormField): RichOption[] {
  const items = field.options?.items
  if (!Array.isArray(items)) return []
  return items
    .map((item): RichOption | null => {
      if (typeof item === "string") return { value: item, label: item }
      if (item && typeof item === "object") {
        const obj = item as Record<string, unknown>
        const value = String(obj.value ?? "")
        if (!value) return null
        const label = String(obj.label ?? value)
        const color = typeof obj.color === "string" ? obj.color : undefined
        return { value, label, color }
      }
      return null
    })
    .filter((x): x is RichOption => x !== null)
}

export type FieldVisibilityMode = "visible" | "editable" | "required" | "hidden"

export interface FieldVisibilityEntry {
  status_id: string
  mode: FieldVisibilityMode
}

function pad2(n: number): string {
  return n < 10 ? `0${n}` : String(n)
}

/**
 * Retorna o valor inicial automático para campos `current_date`, `current_datetime`
 * e `current_user`. Retorna null para outros tipos (não auto-preencher).
 * `currentUserName` é o nome do usuário logado, usado pelo tipo `current_user`.
 */
export function autoInitialValueFor(
  field: ProjectDemandFormField,
  currentUserName?: string,
): string | null {
  const type = normalizeFieldType(field.field_type)
  if (type === "current_user") return currentUserName?.trim() || null
  const now = new Date()
  const y = now.getFullYear()
  const m = pad2(now.getMonth() + 1)
  const d = pad2(now.getDate())
  if (type === "current_date") return `${y}-${m}-${d}`
  if (type === "current_datetime") {
    const hh = pad2(now.getHours())
    const mm = pad2(now.getMinutes())
    return `${y}-${m}-${d}T${hh}:${mm}`
  }
  return null
}

/**
 * Dada a lista de campos e os valores atuais, preenche os campos `current_*`
 * que estão vazios com a data/hora corrente (ou nome do usuário logado).
 * Não sobrescreve valores existentes.
 */
export function applyAutoFillCurrentFields(
  fields: ProjectDemandFormField[],
  values: Record<string, unknown>,
  currentUserName?: string,
): Record<string, unknown> {
  let next = values
  let changed = false
  for (const field of fields) {
    const auto = autoInitialValueFor(field, currentUserName)
    if (auto === null) continue
    const v = values[field.field_key]
    if (v === undefined || v === null || v === "") {
      if (!changed) { next = { ...values }; changed = true }
      next[field.field_key] = auto
    }
  }
  return next
}

export function getFieldVisibility(field: ProjectDemandFormField): FieldVisibilityEntry[] {
  const v = (field.validation as { visibility?: unknown } | null | undefined)?.visibility
  if (!Array.isArray(v)) return []
  return v
    .map((item): FieldVisibilityEntry | null => {
      if (!item || typeof item !== "object") return null
      const obj = item as Record<string, unknown>
      const status_id = String(obj.status_id ?? "")
      const modeRaw = String(obj.mode ?? "")
      if (!status_id) return null
      const mode: FieldVisibilityMode =
        modeRaw === "visible" || modeRaw === "required" || modeRaw === "hidden" ? modeRaw : "editable"
      return { status_id, mode }
    })
    .filter((x): x is FieldVisibilityEntry => x !== null)
}

export function FormFieldRenderer({
  field,
  value,
  onChange,
  users = [],
  disabled = false,
  bare = false,
}: {
  field: ProjectDemandFormField
  value: unknown
  onChange: (v: unknown) => void
  users?: User[]
  disabled?: boolean
  /** Sem borda no controle — usado nas seções do drawer de demanda. */
  bare?: boolean
}) {
  const type = normalizeFieldType(field.field_type)
  const placeholder = field.placeholder ?? ""
  const bareClass = bare ? "border-0 shadow-none bg-transparent px-0 focus-visible:ring-1" : ""

  if (type === "text_long") {
    return (
      <Textarea
        rows={3}
        className={bareClass}
        value={typeof value === "string" ? value : ""}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        disabled={disabled}
      />
    )
  }

  if (type === "number") {
    return (
      <Input
        type="number"
        className={bareClass}
        value={typeof value === "number" || typeof value === "string" ? String(value) : ""}
        onChange={(e) => onChange(e.target.value === "" ? null : Number(e.target.value))}
        placeholder={placeholder}
        disabled={disabled}
      />
    )
  }

  if (type === "date" || type === "current_date") {
    return (
      <Input
        type="date"
        className={bareClass}
        value={typeof value === "string" ? value : ""}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
      />
    )
  }

  if (type === "datetime" || type === "current_datetime") {
    return (
      <Input
        type="datetime-local"
        className={bareClass}
        value={typeof value === "string" ? value : ""}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
      />
    )
  }

  if (type === "url") {
    return (
      <Input
        type="url"
        className={bareClass}
        value={typeof value === "string" ? value : ""}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder || "https://..."}
        disabled={disabled}
      />
    )
  }

  if (type === "current_user") {
    return (
      <Input
        type="text"
        className={bareClass}
        value={typeof value === "string" ? value : ""}
        placeholder={placeholder || "Usuário logado"}
        readOnly
        disabled={disabled}
      />
    )
  }

  if (type === "checkbox") {
    const checked = value === true || value === "true"
    return (
      <div className="flex items-center gap-2">
        <Switch checked={checked} onCheckedChange={onChange} disabled={disabled} />
        <Label className="text-sm">{checked ? "Sim" : "Não"}</Label>
      </div>
    )
  }

  if (type === "select") {
    const options = parseFieldOptions(field)
    const selected = typeof value === "string" ? value : ""
    return (
      <Select value={selected} onValueChange={onChange} disabled={disabled}>
        <SelectTrigger className={bareClass}><SelectValue placeholder={placeholder || "Selecionar"} /></SelectTrigger>
        <SelectContent>
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

  if (type === "multi_select") {
    const options = parseFieldOptions(field)
    const arr: string[] = Array.isArray(value) ? value.filter((x): x is string => typeof x === "string") : []
    function toggle(val: string) {
      if (disabled) return
      if (arr.includes(val)) onChange(arr.filter((x) => x !== val))
      else onChange([...arr, val])
    }
    return (
      <div className={`space-y-1.5 rounded-md p-2 ${bare ? "" : "border"} ${disabled ? "opacity-60" : ""}`}>
        {options.length === 0 ? (
          <p className="text-xs text-muted-foreground">Sem opções configuradas.</p>
        ) : options.map((opt) => {
          const checked = arr.includes(opt.value)
          return (
            <label key={opt.value} className="flex items-center gap-2 cursor-pointer text-sm">
              <input
                type="checkbox"
                checked={checked}
                onChange={() => toggle(opt.value)}
                disabled={disabled}
                className="h-4 w-4 rounded border-input"
              />
              {opt.color && <span className="h-2 w-2 rounded-full" style={{ backgroundColor: opt.color }} />}
              {opt.label}
            </label>
          )
        })}
      </div>
    )
  }

  if (type === "user") {
    const selected = typeof value === "string" ? value : ""
    return (
      <Select value={selected} onValueChange={onChange} disabled={disabled}>
        <SelectTrigger className={bareClass}><SelectValue placeholder={placeholder || "Selecionar usuário"} /></SelectTrigger>
        <SelectContent>
          {users.map((u) => (
            <SelectItem key={u.id} value={u.id}>{u.full_name}</SelectItem>
          ))}
        </SelectContent>
      </Select>
    )
  }

  if (type === "file") {
    return <AttachmentField value={value} onChange={onChange} disabled={disabled} />
  }

  return (
    <Input
      className={bareClass}
      value={typeof value === "string" ? value : ""}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      disabled={disabled}
    />
  )
}
