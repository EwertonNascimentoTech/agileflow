import { useEffect, useState } from "react"
import { Plus, Trash2, Loader2 } from "lucide-react"
import { stageRequiredFieldsApi } from "@/api/atendimento"
import type { StageRequiredField } from "@/api/atendimento"
import { Button } from "@/components/ui/button"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { toast } from "@/lib/toast"

const NATIVE_FIELDS = [
  { value: "value", label: "Valor (R$)" },
  { value: "expected_close_date", label: "Data prevista de fechamento" },
  { value: "company_id", label: "Empresa vinculada" },
  { value: "assigned_to", label: "Responsável" },
]

interface Props {
  statusId: string
}

export default function StageRequiredFieldsConfig({ statusId }: Props) {
  const [fields, setFields] = useState<StageRequiredField[]>([])
  const [loading, setLoading] = useState(true)
  const [newFieldName, setNewFieldName] = useState("")
  const [adding, setAdding] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)

  useEffect(() => {
    setLoading(true)
    stageRequiredFieldsApi
      .list(statusId)
      .then(setFields)
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [statusId])

  async function handleAdd() {
    if (!newFieldName) return
    const found = NATIVE_FIELDS.find(f => f.value === newFieldName)
    if (!found) return
    setAdding(true)
    try {
      const created = await stageRequiredFieldsApi.create(statusId, {
        field_name: found.value,
        field_label: found.label,
        field_type: "native",
      })
      setFields(prev => [...prev, created])
      setNewFieldName("")
      toast.success("Campo obrigatório adicionado.")
    } catch {
      toast.error("Erro ao adicionar campo.")
    } finally {
      setAdding(false)
    }
  }

  async function handleDelete(fieldId: string) {
    setDeletingId(fieldId)
    try {
      await stageRequiredFieldsApi.delete(statusId, fieldId)
      setFields(prev => prev.filter(f => f.id !== fieldId))
      toast.success("Campo removido.")
    } catch {
      toast.error("Erro ao remover campo.")
    } finally {
      setDeletingId(null)
    }
  }

  const usedNames = new Set(fields.map(f => f.field_name))
  const availableFields = NATIVE_FIELDS.filter(f => !usedNames.has(f.value))

  return (
    <div className="space-y-3">
      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Campos obrigatórios</p>
      <p className="text-xs text-muted-foreground">
        O atendimento precisará preencher estes campos antes de avançar para esta etapa.
      </p>

      {loading ? (
        <p className="text-xs text-muted-foreground">Carregando...</p>
      ) : (
        <div className="space-y-2">
          {fields.length === 0 && (
            <p className="text-xs text-muted-foreground italic">Nenhum campo obrigatório configurado.</p>
          )}
          {fields.map(f => (
            <div key={f.id} className="flex items-center justify-between rounded-md border px-3 py-2 text-sm">
              <span>{f.field_label}</span>
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6 text-destructive hover:text-destructive"
                onClick={() => handleDelete(f.id)}
                disabled={deletingId === f.id}
              >
                {deletingId === f.id ? <Loader2 size={12} className="animate-spin" /> : <Trash2 size={12} />}
              </Button>
            </div>
          ))}
        </div>
      )}

      {availableFields.length > 0 && (
        <div className="flex gap-2">
          <Select value={newFieldName} onValueChange={setNewFieldName}>
            <SelectTrigger className="h-8 text-xs flex-1">
              <SelectValue placeholder="Selecionar campo..." />
            </SelectTrigger>
            <SelectContent>
              {availableFields.map(f => (
                <SelectItem key={f.value} value={f.value}>{f.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            size="sm"
            className="h-8 gap-1"
            onClick={handleAdd}
            disabled={!newFieldName || adding}
          >
            {adding ? <Loader2 size={12} className="animate-spin" /> : <Plus size={12} />}
            Adicionar
          </Button>
        </div>
      )}
    </div>
  )
}
