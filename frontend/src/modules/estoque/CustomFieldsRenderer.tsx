import type { ProductTypeField } from "@/api/estoque"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Switch } from "@/components/ui/switch"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"

interface Props {
  fields: ProductTypeField[]
  values: Record<string, unknown>
  onChange: (next: Record<string, unknown>) => void
}

export default function CustomFieldsRenderer({ fields, values, onChange }: Props) {
  if (!fields || fields.length === 0) return null

  function set(key: string, v: unknown) {
    onChange({ ...values, [key]: v })
  }

  return (
    <div className="space-y-3 rounded-md border p-3 bg-muted/20">
      <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Campos do tipo</p>
      <div className="grid grid-cols-2 gap-3">
        {fields.map((f) => {
          const v = values[f.key]
          const labelEl = (
            <Label className="text-xs">
              {f.label}
              {f.required && <span className="text-destructive ml-0.5">*</span>}
            </Label>
          )

          if (f.type === "textarea") {
            return (
              <div key={f.key} className="col-span-2 space-y-1.5">
                {labelEl}
                <Textarea rows={2} value={(v as string) ?? ""} onChange={e => set(f.key, e.target.value)} />
              </div>
            )
          }
          if (f.type === "number") {
            return (
              <div key={f.key} className="space-y-1.5">
                {labelEl}
                <Input
                  type="number"
                  value={v === undefined || v === null ? "" : String(v)}
                  onChange={e => set(f.key, e.target.value === "" ? null : Number(e.target.value))}
                />
              </div>
            )
          }
          if (f.type === "date") {
            return (
              <div key={f.key} className="space-y-1.5">
                {labelEl}
                <Input type="date" value={(v as string) ?? ""} onChange={e => set(f.key, e.target.value || null)} />
              </div>
            )
          }
          if (f.type === "boolean") {
            return (
              <div key={f.key} className="flex items-center justify-between rounded-md border p-2">
                {labelEl}
                <Switch checked={!!v} onCheckedChange={(b) => set(f.key, b)} />
              </div>
            )
          }
          if (f.type === "select") {
            return (
              <div key={f.key} className="space-y-1.5">
                {labelEl}
                <Select value={(v as string) ?? ""} onValueChange={(val) => set(f.key, val)}>
                  <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                  <SelectContent>
                    {(f.options ?? []).map(o => <SelectItem key={o} value={o}>{o}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            )
          }
          // text default
          return (
            <div key={f.key} className="space-y-1.5">
              {labelEl}
              <Input value={(v as string) ?? ""} onChange={e => set(f.key, e.target.value)} />
            </div>
          )
        })}
      </div>
    </div>
  )
}
