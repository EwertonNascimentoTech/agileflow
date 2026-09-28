import { Plus, Trash2 } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  normalizeOptionsPayload,
  parseDefaultFieldOptions,
  slugifyOptionLabel,
  type DefaultSelectOption,
} from "@/modules/projetos/defaultFormOptions"
import type { ProjectDefaultFormField } from "@/api/projetos"

export function DefaultFormSelectOptionsEditor({
  field,
  onChange,
}: {
  field: ProjectDefaultFormField
  onChange: (options: { items: DefaultSelectOption[] }) => void
}) {
  const items = parseDefaultFieldOptions(field)

  function setItems(next: DefaultSelectOption[]) {
    onChange(normalizeOptionsPayload(next))
  }

  function updateLabel(index: number, label: string) {
    const next = [...items]
    const row = next[index]
    if (!row) return
    next[index] = {
      ...row,
      label,
      value: row.value || slugifyOptionLabel(label),
    }
    setItems(next)
  }

  function addOption() {
    const n = items.length + 1
    setItems([...items, { value: `opcao_${n}`, label: `Opção ${n}` }])
  }

  function removeOption(index: number) {
    setItems(items.filter((_, i) => i !== index))
  }

  return (
    <div className="space-y-2 rounded-xl border border-dashed border-border bg-muted/40 p-3 md:col-span-2 lg:col-span-4">
      <div className="flex items-center justify-between gap-2">
        <Label className="text-sm font-semibold">
          Opções do campo (seleção)
        </Label>
        <Button type="button" variant="outline" size="sm" className="bg-background" onClick={addOption}>
          <Plus className="mr-1 h-3.5 w-3.5" /> Adicionar opção
        </Button>
      </div>
      {items.length === 0 ? (
        <p className="text-xs text-muted-foreground">
          Nenhuma opção cadastrada. Adicione os valores que aparecerão no dropdown.
        </p>
      ) : (
        <div className="space-y-2">
          {items.map((opt, index) => (
            <div key={`${opt.value}-${index}`} className="flex items-center gap-2">
              <Input
                value={opt.label}
                onChange={(e) => updateLabel(index, e.target.value)}
                placeholder="Nome exibido"
                className="h-9 flex-1 bg-background"
              />
              <span className="hidden shrink-0 font-mono text-xs text-muted-foreground sm:inline">
                {opt.value}
              </span>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-8 w-8 shrink-0 text-destructive"
                onClick={() => removeOption(index)}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
