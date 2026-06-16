/**
 * Renderizador genérico de custom fields.
 * Recebe a lista de definições (CustomFieldDefinition) e o objeto custom_data,
 * e exibe um formulário editável ou modo somente leitura.
 */
import { useState } from "react"
import { Check, X, Pencil } from "lucide-react"
import type { CustomField } from "@/api/crm"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"

interface Props {
  fields: CustomField[]
  values: Record<string, unknown>
  onSave?: (updated: Record<string, unknown>) => Promise<void>
  readOnly?: boolean
}

export function CustomFieldsRenderer({ fields, values, onSave, readOnly = false }: Props) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState<Record<string, unknown>>(values)
  const [saving, setSaving] = useState(false)

  if (!fields.length) return null

  function set(key: string, value: unknown) {
    setDraft(prev => ({ ...prev, [key]: value }))
  }

  async function save() {
    if (!onSave) return
    setSaving(true)
    try {
      await onSave(draft)
      setEditing(false)
    } finally {
      setSaving(false)
    }
  }

  function cancel() {
    setDraft(values)
    setEditing(false)
  }

  const isEditing = editing && !readOnly

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
          Campos Personalizados
        </p>
        {!readOnly && !isEditing && onSave && (
          <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => setEditing(true)}>
            <Pencil size={12} />
          </Button>
        )}
        {isEditing && (
          <div className="flex gap-1">
            <Button size="icon" variant="ghost" className="h-6 w-6 text-emerald-600" onClick={save} disabled={saving}>
              <Check size={12} />
            </Button>
            <Button size="icon" variant="ghost" className="h-6 w-6 text-red-500" onClick={cancel}>
              <X size={12} />
            </Button>
          </div>
        )}
      </div>

      <div className="grid gap-2">
        {fields.filter(f => f.is_active).sort((a, b) => a.order - b.order).map(field => (
          <div key={field.field_key} className="flex items-center gap-3">
            <Label className="text-xs text-muted-foreground w-32 shrink-0 truncate">
              {field.name}{field.is_required && <span className="text-red-500 ml-0.5">*</span>}
            </Label>
            <div className="flex-1">
              <FieldInput
                field={field}
                value={draft[field.field_key]}
                onChange={v => set(field.field_key, v)}
                disabled={!isEditing}
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

function FieldInput({
  field, value, onChange, disabled,
}: {
  field: CustomField
  value: unknown
  onChange: (v: unknown) => void
  disabled: boolean
}) {
  const strVal = value == null ? "" : String(value)

  if (disabled) {
    if (field.field_type === "boolean") {
      return <span className="text-xs">{value ? "Sim" : "Não"}</span>
    }
    if (!strVal) return <span className="text-xs text-muted-foreground">—</span>
    return <span className="text-xs">{strVal}</span>
  }

  switch (field.field_type) {
    case "text":
    case "number":
      return (
        <Input
          type={field.field_type}
          value={strVal}
          onChange={e => onChange(field.field_type === "number" ? Number(e.target.value) : e.target.value)}
          className="h-7 text-xs"
          placeholder={field.name}
        />
      )
    case "textarea":
      return (
        <textarea
          value={strVal}
          onChange={e => onChange(e.target.value)}
          rows={2}
          className="w-full rounded-md border bg-background px-3 py-1.5 text-xs resize-none"
          placeholder={field.name}
        />
      )
    case "date":
      return (
        <Input
          type="date"
          value={strVal}
          onChange={e => onChange(e.target.value)}
          className="h-7 text-xs"
        />
      )
    case "boolean":
      return (
        <Switch
          checked={!!value}
          onCheckedChange={onChange}
        />
      )
    case "select":
      return (
        <Select value={strVal || "__none__"} onValueChange={v => onChange(v === "__none__" ? null : v)}>
          <SelectTrigger className="h-7 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__none__">—</SelectItem>
            {(field.options ?? []).map(opt => (
              <SelectItem key={opt} value={opt}>{opt}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      )
    default:
      return <Input value={strVal} onChange={e => onChange(e.target.value)} className="h-7 text-xs" />
  }
}
