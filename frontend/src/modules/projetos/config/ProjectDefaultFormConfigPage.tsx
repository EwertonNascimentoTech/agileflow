import { useEffect, useState } from "react"
import { useNavigate } from "react-router-dom"
import { ArrowLeft, ClipboardList, GripVertical, Loader2 } from "lucide-react"

import { projetosApi, type DefaultFormFieldKey, type ProjectDefaultFormField } from "@/api/projetos"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Skeleton } from "@/components/ui/skeleton"
import { Switch } from "@/components/ui/switch"
import { toast } from "@/lib/toast"
import { moveDefaultFormFieldOrder } from "@/modules/projetos/defaultFormLayout"
import { sortDefaultFormFields } from "@/modules/projetos/defaultFormUtils"
import {
  allowedTypesForKey,
  normalizeDefaultFieldType,
  typeLabel,
} from "@/modules/projetos/defaultFormFieldTypes"
import { invalidateDefaultFormCache } from "@/modules/projetos/useDefaultFormConfig"
import { normalizeOptionsPayload, parseDefaultFieldOptions } from "@/modules/projetos/defaultFormOptions"
import { DefaultFormSelectOptionsEditor } from "@/modules/projetos/config/DefaultFormSelectOptionsEditor"

const FIELD_HINTS: Record<DefaultFormFieldKey, string> = {
  title: "Nome principal da demanda (sempre visível e obrigatório).",
  description: "Detalhes da demanda — o tipo define como o usuário preenche.",
  assigned_to: "Pessoa responsável (sempre seleção de usuário).",
  diretoria: "Lista suspensa — cadastre as diretorias disponíveis abaixo.",
  area: "Lista suspensa — cadastre as áreas disponíveis abaixo.",
  start_date: "Início para planejamento e cronograma.",
  due_date: "Data limite de entrega.",
}

export default function ProjectDefaultFormConfigPage() {
  const navigate = useNavigate()
  const [fields, setFields] = useState<ProjectDefaultFormField[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [draggingKey, setDraggingKey] = useState<DefaultFormFieldKey | null>(null)
  const [dragOverKey, setDragOverKey] = useState<DefaultFormFieldKey | null>(null)

  useEffect(() => {
    projetosApi.getDefaultFormFields()
      .then((rows) => setFields(sortDefaultFormFields(rows)))
      .finally(() => setLoading(false))
  }, [])

  function patchField(key: DefaultFormFieldKey, patch: Partial<ProjectDefaultFormField>) {
    setFields((prev) => prev.map((f) => (f.field_key === key ? { ...f, ...patch } : f)))
  }

  function handleDropField(targetKey: DefaultFormFieldKey) {
    setDragOverKey(null)
    if (!draggingKey || draggingKey === targetKey) {
      setDraggingKey(null)
      return
    }
    setFields((prev) => {
      const sorted = sortDefaultFormFields(prev)
      const from = sorted.findIndex((f) => f.field_key === draggingKey)
      const to = sorted.findIndex((f) => f.field_key === targetKey)
      if (from < 0 || to < 0) return prev
      return moveDefaultFormFieldOrder(sorted, from, to)
    })
    setDraggingKey(null)
  }

  const sortedFields = sortDefaultFormFields(fields)

  async function handleSave() {
    setSaving(true)
    try {
      const saved = await projetosApi.updateDefaultFormFields(
        sortDefaultFormFields(fields).map((f) => {
          const fieldType = normalizeDefaultFieldType(f.field_key, f.field_type)
          return {
            field_key: f.field_key,
            label: f.label.trim() || f.field_key,
            field_type: fieldType,
            options: fieldType === "select"
              ? normalizeOptionsPayload(parseDefaultFieldOptions(f))
              : null,
            is_visible: f.field_key === "title" ? true : f.is_visible,
            is_required: f.field_key === "title" ? true : f.is_required,
            order: f.order,
          }
        }),
      )
      invalidateDefaultFormCache()
      setFields(sortDefaultFormFields(saved))
      toast.success("Formulário padrão salvo.")
    } catch (err) {
      const e = err as { response?: { data?: { detail?: unknown } } }
      toast.error(typeof e.response?.data?.detail === "string" ? e.response.data.detail : "Não foi possível salvar.")
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="w-full space-y-4">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" onClick={() => navigate("/app/modules/projetos/config")}>
          <ArrowLeft className="mr-2 h-4 w-4" /> Voltar
        </Button>
      </div>

      <div>
        <h2 className="text-lg font-bold flex items-center gap-2">
          <ClipboardList size={20} className="text-primary" />
          Formulário padrão
        </h2>
        <p className="text-sm text-muted-foreground mt-1">
          Configure rótulo, tipo, visibilidade e ordem dos campos. Arraste pelo ícone para reordenar — a ordem vale no card, na criação e na coluna Planejamento.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Campos do formulário</CardTitle>
          <CardDescription>
            Arraste os campos para definir a ordem de exibição. Tipos compatíveis com o dado salvo no card (ex.: responsável = usuário).
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {loading ? (
            <div className="space-y-3">
              {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-20" />)}
            </div>
          ) : (
            sortedFields.map((field, index) => {
              const isTitle = field.field_key === "title"
              const typeOptions = allowedTypesForKey(field.field_key)
              const typeLocked = typeOptions.length <= 1

              const isSelect = normalizeDefaultFieldType(field.field_key, field.field_type) === "select"
              const isDragging = draggingKey === field.field_key
              const isDropTarget = dragOverKey === field.field_key && draggingKey !== field.field_key

              return (
                <div
                  key={field.field_key}
                  onDragOver={(e) => {
                    if (!draggingKey || draggingKey === field.field_key) return
                    e.preventDefault()
                    if (dragOverKey !== field.field_key) setDragOverKey(field.field_key)
                  }}
                  onDragLeave={() => {
                    if (dragOverKey === field.field_key) setDragOverKey(null)
                  }}
                  onDrop={() => handleDropField(field.field_key)}
                  className={[
                    "space-y-3 rounded-lg border border-border p-4 transition-all",
                    isDragging ? "opacity-50" : "",
                    isDropTarget ? "ring-2 ring-primary ring-offset-1" : "",
                  ].filter(Boolean).join(" ")}
                >
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <span
                    draggable
                    onDragStart={(e) => {
                      setDraggingKey(field.field_key)
                      e.dataTransfer.effectAllowed = "move"
                    }}
                    onDragEnd={() => { setDraggingKey(null); setDragOverKey(null) }}
                    className="flex h-7 w-7 cursor-grab items-center justify-center rounded-md hover:bg-muted active:cursor-grabbing"
                    title="Arraste para reordenar"
                  >
                    <GripVertical size={14} />
                  </span>
                  <span className="font-medium text-foreground">{index + 1}.</span>
                  <span>{field.label}</span>
                  <span className="text-[10px] uppercase tracking-wide">({field.field_key})</span>
                </div>
                <div className="grid gap-4 lg:grid-cols-[1fr_200px_auto_auto]"
                >
                  <div className="space-y-2">
                    <Label>Rótulo</Label>
                    <Input
                      value={field.label}
                      onChange={(e) => patchField(field.field_key, { label: e.target.value })}
                    />
                    <p className="text-xs text-muted-foreground">{FIELD_HINTS[field.field_key]}</p>
                  </div>

                  <div className="space-y-2">
                    <Label>Tipo de campo</Label>
                    <Select
                      value={normalizeDefaultFieldType(field.field_key, field.field_type)}
                      onValueChange={(v) => patchField(field.field_key, { field_type: v })}
                      disabled={typeLocked}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {typeOptions.map((opt) => (
                          <SelectItem key={opt.value} value={opt.value}>
                            {opt.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <p className="text-xs text-muted-foreground">
                      {typeLocked
                        ? `Fixo: ${typeLabel(field.field_type)}`
                        : typeOptions.find((o) => o.value === field.field_type)?.description}
                    </p>
                  </div>

                  <div className="flex flex-col items-start gap-1 lg:items-center">
                    <Label className="text-xs text-muted-foreground">Visível</Label>
                    <Switch
                      checked={field.is_visible}
                      disabled={isTitle}
                      onCheckedChange={(v) => patchField(field.field_key, { is_visible: v, is_required: v ? field.is_required : false })}
                    />
                  </div>

                  <div className="flex flex-col items-start gap-1 lg:items-center">
                    <Label className="text-xs text-muted-foreground">Obrigatório</Label>
                    <Switch
                      checked={field.is_required}
                      disabled={isTitle || !field.is_visible}
                      onCheckedChange={(v) => patchField(field.field_key, { is_required: v })}
                    />
                  </div>
                </div>
                {isSelect && (
                  <DefaultFormSelectOptionsEditor
                    field={field}
                    onChange={(options) => patchField(field.field_key, { options })}
                  />
                )}
                </div>
              )
            })
          )}

          <div className="flex justify-end pt-2">
            <Button onClick={() => void handleSave()} disabled={saving || loading}>
              {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Salvar alterações
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
