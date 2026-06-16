import { useEffect, useMemo, useState } from "react"
import { useNavigate, useParams } from "react-router-dom"
import { ArrowLeft, Check, ChevronDown, ChevronUp, Eye, EyeOff, FileText, GripVertical, Loader2, Pencil, Plus, Trash2, X } from "lucide-react"
import {
  DndContext,
  PointerSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core"
import { CSS } from "@dnd-kit/utilities"

import {
  projetosApi,
  type ProjectDemandFormField,
  type ProjectDemandFormSection,
  type ProjectDemandType,
} from "@/api/projetos"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { EmptyState } from "@/components/EmptyState"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Skeleton } from "@/components/ui/skeleton"
import { Switch } from "@/components/ui/switch"
import { Textarea } from "@/components/ui/textarea"
import { getRowBreak, groupIntoRows } from "@/modules/projetos/layout"

interface RichOption {
  value: string
  label: string
  color?: string
}

interface FieldTypeMeta {
  value: string
  label: string
  description: string
  hasOptions?: boolean
}

const FIELD_TYPES: FieldTypeMeta[] = [
  { value: "text",             label: "Texto curto",     description: "Linha única, até 255 caracteres." },
  { value: "text_long",        label: "Texto longo",     description: "Área de texto com múltiplas linhas." },
  { value: "number",           label: "Número",          description: "Valor numérico (inteiro ou decimal)." },
  { value: "date",             label: "Data",            description: "Somente data (dia/mês/ano)." },
  { value: "datetime",         label: "Data e hora",     description: "Data com horário." },
  { value: "current_date",     label: "Data atual",      description: "Pré-preenche automaticamente com a data de hoje." },
  { value: "current_datetime", label: "Data e hora atual", description: "Pré-preenche automaticamente com a data e hora atual." },
  { value: "current_user",     label: "Usuário logado",  description: "Pré-preenche automaticamente com o nome do usuário logado (somente leitura)." },
  { value: "select",           label: "Seleção única",   description: "Lista de opções; usuário escolhe uma.", hasOptions: true },
  { value: "multi_select",     label: "Multi-seleção",   description: "Lista de opções; usuário escolhe várias.", hasOptions: true },
  { value: "checkbox",         label: "Sim / Não",       description: "Toggle (verdadeiro/falso)." },
  { value: "url",              label: "URL",             description: "Texto validado como link." },
  { value: "user",             label: "Usuário",         description: "Referência a um usuário do sistema." },
  { value: "file",             label: "Anexo",           description: "Upload de arquivo (PDF, imagem, documento…), até 20 MB." },
]

const LEGACY_TYPE_MAP: Record<string, string> = {
  textarea: "text_long",
  boolean: "checkbox",
}

function normalizeFieldType(t: string): string {
  return LEGACY_TYPE_MAP[t] ?? t
}

function typeMeta(value: string): FieldTypeMeta {
  const normalized = normalizeFieldType(value)
  return FIELD_TYPES.find((x) => x.value === normalized) ?? FIELD_TYPES[0]
}

function slugify(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/\s+/g, "_")
    .replace(/[^a-z0-9_]/g, "")
}

function parseOptions(raw: unknown): RichOption[] {
  const items = (raw as { items?: unknown })?.items
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

function newBlankOption(): RichOption {
  return { value: "", label: "", color: "#7C3AED" }
}

interface FieldFormState {
  label: string
  field_key: string
  field_type: string
  description: string
  placeholder: string
  options: RichOption[]
  is_required: boolean
  is_active: boolean
}

function emptyFieldForm(): FieldFormState {
  return {
    label: "",
    field_key: "",
    field_type: "text",
    description: "",
    placeholder: "",
    options: [],
    is_required: false,
    is_active: true,
  }
}

function FieldCard({
  field,
  fmeta,
  options,
  onEdit,
  onToggleActive,
  onDelete,
}: {
  field: ProjectDemandFormField
  fmeta: FieldTypeMeta
  options: RichOption[]
  onEdit: () => void
  onToggleActive: () => void
  onDelete: () => void
}) {
  const { attributes, listeners, setNodeRef: setDragRef, transform, isDragging } = useDraggable({ id: `field-${field.id}` })
  const { setNodeRef: setDropRef, isOver } = useDroppable({ id: `card-${field.id}` })

  const setRef = (node: HTMLDivElement | null) => {
    setDragRef(node)
    setDropRef(node)
  }

  const style = {
    transform: CSS.Translate.toString(transform),
    opacity: isDragging ? 0.4 : 1,
  }

  return (
    <div
      ref={setRef}
      style={style}
      className={`flex-1 min-w-0 rounded-md border p-2.5 space-y-2 transition bg-card ${
        isOver && !isDragging ? "border-l-4 border-l-primary border-primary/40 ring-1 ring-primary/30" : "hover:shadow-sm"
      }`}
    >
      <div className="flex items-start gap-2 min-w-0">
        <button
          type="button"
          className="mt-0.5 cursor-grab touch-none text-muted-foreground hover:text-foreground active:cursor-grabbing shrink-0"
          aria-label="Arrastar para reordenar"
          {...attributes}
          {...listeners}
        >
          <GripVertical size={14} />
        </button>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5 flex-wrap">
            <p className="text-sm font-medium truncate">{field.label}</p>
            <Badge variant="outline" className="text-[10px] shrink-0">{fmeta.label}</Badge>
            {field.is_required && <Badge variant="secondary" className="text-[10px] shrink-0">obrig.</Badge>}
            {!field.is_active && <Badge variant="secondary" className="text-[10px] shrink-0">inativo</Badge>}
          </div>
          <p className="text-[11px] text-muted-foreground mt-0.5 truncate">
            <span className="uppercase tracking-wide">{field.field_key}</span>
          </p>
        </div>
        <div className="flex items-center gap-0.5 shrink-0">
          <Button type="button" variant="ghost" size="icon" onClick={onEdit} title="Editar">
            <Pencil size={13} />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={onToggleActive}
            title={field.is_active ? "Inativar" : "Ativar"}
          >
            {field.is_active ? <EyeOff size={13} /> : <Eye size={13} />}
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="text-muted-foreground hover:text-destructive"
            onClick={onDelete}
            title="Excluir"
          >
            <Trash2 size={13} />
          </Button>
        </div>
      </div>
      {fmeta.hasOptions && (
        <div className="flex flex-wrap gap-1 pl-5 min-w-0">
          {options.length === 0 ? (
            <span className="text-[11px] text-muted-foreground italic">sem opções</span>
          ) : options.slice(0, 3).map((opt) => (
            <span
              key={opt.value}
              className="inline-flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-[10px]"
              style={opt.color ? { borderColor: opt.color, color: opt.color } : undefined}
            >
              {opt.color && (
                <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: opt.color }} />
              )}
              {opt.label}
            </span>
          ))}
          {options.length > 3 && (
            <span className="text-[10px] text-muted-foreground">+{options.length - 3}</span>
          )}
        </div>
      )}
    </div>
  )
}

function RowGapDropZone({ id, dragging }: { id: string; dragging: boolean }) {
  const { setNodeRef, isOver } = useDroppable({ id })
  return (
    <div
      ref={setNodeRef}
      className={`transition-all rounded ${
        dragging
          ? isOver
            ? "h-8 bg-primary/15 border-2 border-dashed border-primary"
            : "h-3 bg-muted/40 border border-dashed border-muted-foreground/30"
          : "h-0"
      }`}
    />
  )
}

export default function ProjectDemandTypeFormEditorPage() {
  const navigate = useNavigate()
  const { demandTypeId } = useParams<{ demandTypeId: string }>()
  const [types, setTypes] = useState<ProjectDemandType[]>([])
  const [sections, setSections] = useState<ProjectDemandFormSection[]>([])
  const [fields, setFields] = useState<ProjectDemandFormField[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedSectionId, setSelectedSectionId] = useState("")

  const [newSectionTitle, setNewSectionTitle] = useState("")
  const [editingSectionId, setEditingSectionId] = useState<string | null>(null)
  const [sectionDraftTitle, setSectionDraftTitle] = useState("")
  const [reorderingSections, setReorderingSections] = useState(false)

  const [openField, setOpenField] = useState(false)
  const [savingField, setSavingField] = useState(false)
  const [editingField, setEditingField] = useState<ProjectDemandFormField | null>(null)
  const [form, setForm] = useState<FieldFormState>(emptyFieldForm())

  const selectedType = useMemo(
    () => types.find((x) => x.id === demandTypeId) ?? null,
    [types, demandTypeId]
  )
  const selectedSection = useMemo(
    () => sections.find((x) => x.id === selectedSectionId) ?? null,
    [sections, selectedSectionId]
  )
  useEffect(() => {
    if (!demandTypeId) return
    Promise.all([
      projetosApi.listDemandTypes(false),
      projetosApi.listDemandSections(demandTypeId, false),
    ]).then(([ts, ss]) => {
      setTypes(ts)
      const orderedSections = ss.sort((a, b) => a.order - b.order)
      setSections(orderedSections)
      setSelectedSectionId(orderedSections[0]?.id ?? "")
    }).finally(() => setLoading(false))
  }, [demandTypeId])

  useEffect(() => {
    if (!demandTypeId || !selectedSectionId) {
      setFields([])
      return
    }
    projetosApi.listDemandFields(demandTypeId, selectedSectionId, false).then((data) => {
      setFields(data.sort((a, b) => a.order - b.order))
    })
  }, [demandTypeId, selectedSectionId])

  async function handleCreateSection() {
    if (!demandTypeId || !newSectionTitle.trim()) return
    const created = await projetosApi.createDemandSection(demandTypeId, {
      key: slugify(newSectionTitle),
      title: newSectionTitle.trim(),
      order: sections.length,
      is_active: true,
    })
    const next = [...sections, created]
    const reordered = await projetosApi.reorderDemandSections(demandTypeId, next.map((x, index) => ({ id: x.id, order: index })))
    setSections(reordered)
    setSelectedSectionId(created.id)
    setNewSectionTitle("")
  }

  async function handleDeleteSection(sectionId: string) {
    if (!demandTypeId) return
    if (!confirm("Excluir essa sessão? Todos os campos dela serão removidos.")) return
    await projetosApi.deleteDemandSection(demandTypeId, sectionId)
    const next = sections.filter((x) => x.id !== sectionId)
    const reordered = await projetosApi.reorderDemandSections(demandTypeId, next.map((x, index) => ({ id: x.id, order: index })))
    setSections(reordered)
    setSelectedSectionId(reordered[0]?.id ?? "")
  }

  function beginEditSection(section: ProjectDemandFormSection) {
    setEditingSectionId(section.id)
    setSectionDraftTitle(section.title)
  }

  function cancelEditSection() {
    setEditingSectionId(null)
    setSectionDraftTitle("")
  }

  async function saveEditSection(sectionId: string) {
    if (!demandTypeId || !sectionDraftTitle.trim()) return
    const updated = await projetosApi.updateDemandSection(demandTypeId, sectionId, {
      title: sectionDraftTitle.trim(),
    })
    setSections((prev) => prev.map((s) => (s.id === sectionId ? updated : s)))
    cancelEditSection()
  }

  async function handleMoveSection(sectionId: string, dir: -1 | 1) {
    if (!demandTypeId || reorderingSections) return
    const from = sections.findIndex((s) => s.id === sectionId)
    const to = from + dir
    if (from < 0 || to < 0 || to >= sections.length) return
    const next = [...sections]
    const [moved] = next.splice(from, 1)
    next.splice(to, 0, moved)
    setSections(next) // otimista
    setReorderingSections(true)
    try {
      const reordered = await projetosApi.reorderDemandSections(
        demandTypeId,
        next.map((x, index) => ({ id: x.id, order: index })),
      )
      setSections(reordered)
    } finally {
      setReorderingSections(false)
    }
  }

  function openCreateField() {
    setEditingField(null)
    setForm(emptyFieldForm())
    setOpenField(true)
  }

  function openEditField(field: ProjectDemandFormField) {
    setEditingField(field)
    setForm({
      label: field.label,
      field_key: field.field_key,
      field_type: normalizeFieldType(field.field_type),
      description: field.placeholder ?? "",
      placeholder: field.placeholder ?? "",
      options: parseOptions(field.options),
      is_required: field.is_required,
      is_active: field.is_active,
    })
    setOpenField(true)
  }

  function patchForm(patch: Partial<FieldFormState>) {
    setForm((prev) => ({ ...prev, ...patch }))
  }

  function addOption() {
    patchForm({ options: [...form.options, newBlankOption()] })
  }

  function updateOption(index: number, patch: Partial<RichOption>) {
    const next = form.options.map((opt, i) => (i === index ? { ...opt, ...patch } : opt))
    patchForm({ options: next })
  }

  function removeOption(index: number) {
    patchForm({ options: form.options.filter((_, i) => i !== index) })
  }

  async function handleSaveField() {
    if (!demandTypeId || !selectedSectionId || !form.label.trim()) return
    const meta = typeMeta(form.field_type)
    const needsOptions = !!meta.hasOptions
    const validOptions = form.options
      .map((opt) => ({
        value: opt.value.trim(),
        label: opt.label.trim() || opt.value.trim(),
        color: opt.color,
      }))
      .filter((opt) => opt.value.length > 0)
    if (needsOptions && validOptions.length === 0) {
      alert("Adicione ao menos uma opção válida (com valor preenchido).")
      return
    }
    setSavingField(true)
    try {
      const existingValidation = (editingField?.validation ?? {}) as Record<string, unknown>
      const validationPayload: Record<string, unknown> = {}
      if (existingValidation.row_break === false) validationPayload.row_break = false
      if (existingValidation.visibility !== undefined) validationPayload.visibility = existingValidation.visibility
      const payload = {
        label: form.label.trim(),
        field_key: slugify(form.field_key || form.label),
        field_type: form.field_type,
        placeholder: form.placeholder.trim() || null,
        options: needsOptions ? { items: validOptions } : null,
        validation: Object.keys(validationPayload).length > 0 ? validationPayload : null,
        is_required: form.is_required,
        is_active: form.is_active,
      }
      if (editingField) {
        const updated = await projetosApi.updateDemandField(demandTypeId, selectedSectionId, editingField.id, payload)
        setFields((prev) => prev.map((f) => (f.id === updated.id ? updated : f)))
      } else {
        const created = await projetosApi.createDemandField(demandTypeId, selectedSectionId, {
          ...payload,
          order: fields.length,
        })
        const next = [...fields, created]
        const reordered = await projetosApi.reorderDemandFields(demandTypeId, selectedSectionId, next.map((x, index) => ({ id: x.id, order: index })))
        setFields(reordered)
      }
      setOpenField(false)
      setEditingField(null)
      setForm(emptyFieldForm())
    } finally {
      setSavingField(false)
    }
  }

  function setFieldRowBreak(field: ProjectDemandFormField, rowBreak: boolean): ProjectDemandFormField {
    const existing = (field.validation ?? {}) as Record<string, unknown>
    const next: Record<string, unknown> = { ...existing }
    if (rowBreak) delete next.row_break
    else next.row_break = false
    const validation = Object.keys(next).length > 0 ? next : null
    return { ...field, validation } as ProjectDemandFormField
  }

  async function persistLayout(nextFields: ProjectDemandFormField[]) {
    if (!demandTypeId || !selectedSectionId) return
    setFields(nextFields)
    // Persist row_break for each field, then reorder.
    const beforeById = new Map(fields.map((f) => [f.id, f]))
    const validationUpdates = nextFields
      .filter((f) => {
        const before = beforeById.get(f.id)
        const beforeRb = (before?.validation as { row_break?: unknown } | null | undefined)?.row_break
        const afterRb = (f.validation as { row_break?: unknown } | null | undefined)?.row_break
        return beforeRb !== afterRb
      })
      .map((f) =>
        projetosApi.updateDemandField(demandTypeId, selectedSectionId, f.id, { validation: f.validation as Record<string, unknown> | null })
      )
    await Promise.all(validationUpdates)
    const reordered = await projetosApi.reorderDemandFields(
      demandTypeId,
      selectedSectionId,
      nextFields.map((x, index) => ({ id: x.id, order: index }))
    )
    setFields(reordered)
  }

  async function handleDropOnCard(activeFieldId: string, targetFieldId: string) {
    if (activeFieldId === targetFieldId) return
    const fromIndex = fields.findIndex((f) => f.id === activeFieldId)
    const toIndex = fields.findIndex((f) => f.id === targetFieldId)
    if (fromIndex === -1 || toIndex === -1) return
    const target = fields[toIndex]
    const targetRowBreak = getRowBreak(target.validation)
    const next = [...fields]
    const [moved] = next.splice(fromIndex, 1)
    const insertIdx = next.findIndex((f) => f.id === targetFieldId)
    // Moved field takes the target's row_break (joins target's row at its position).
    const movedAdjusted = setFieldRowBreak(moved, targetRowBreak)
    // Target now becomes "after moved" in the same row → must be a continuation, not a break.
    const targetAdjusted = setFieldRowBreak(target, false)
    next[insertIdx] = targetAdjusted
    next.splice(insertIdx, 0, movedAdjusted)
    await persistLayout(next)
  }

  async function handleDropOnGap(activeFieldId: string, gapIndex: number) {
    const rows = groupIntoRows(fields, (f) => getRowBreak(f.validation))
    const fromIndex = fields.findIndex((f) => f.id === activeFieldId)
    if (fromIndex === -1) return
    const moved = setFieldRowBreak(fields[fromIndex], true)
    const next = [...fields]
    next.splice(fromIndex, 1)
    // Find insertion index in the trimmed list: first field of rows[gapIndex] (or end).
    let insertAt = next.length
    if (gapIndex < rows.length) {
      const firstOfRow = rows[gapIndex].items[0]
      // Skip if it was the moved field itself (shouldn't happen because we removed it).
      const idx = next.findIndex((f) => f.id === firstOfRow.id)
      if (idx !== -1) insertAt = idx
    }
    next.splice(insertAt, 0, moved)
    await persistLayout(next)
  }

  async function handleDeleteField(fieldId: string) {
    if (!demandTypeId || !selectedSectionId) return
    if (!confirm("Excluir esse campo? Os valores preenchidos serão perdidos.")) return
    await projetosApi.deleteDemandField(demandTypeId, selectedSectionId, fieldId)
    const next = fields.filter((x) => x.id !== fieldId)
    const reordered = await projetosApi.reorderDemandFields(demandTypeId, selectedSectionId, next.map((x, index) => ({ id: x.id, order: index })))
    setFields(reordered)
  }

  async function handleToggleFieldActive(field: ProjectDemandFormField) {
    if (!demandTypeId || !selectedSectionId) return
    const updated = await projetosApi.updateDemandField(demandTypeId, selectedSectionId, field.id, {
      is_active: !field.is_active,
    })
    setFields((prev) => prev.map((f) => (f.id === updated.id ? updated : f)))
  }

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }))
  const [activeDragId, setActiveDragId] = useState<string | null>(null)

  function onFieldDragStart(event: DragStartEvent) {
    setActiveDragId(String(event.active.id))
  }

  function onFieldDragEnd(event: DragEndEvent) {
    setActiveDragId(null)
    const { active, over } = event
    if (!over) return
    const activeId = String(active.id)
    const overId = String(over.id)
    if (!activeId.startsWith("field-")) return
    const draggedFieldId = activeId.slice(6)
    if (overId.startsWith("card-")) {
      void handleDropOnCard(draggedFieldId, overId.slice(5))
    } else if (overId.startsWith("gap-")) {
      void handleDropOnGap(draggedFieldId, Number(overId.slice(4)))
    }
  }

  if (loading) return <Skeleton className="h-32 rounded-lg" />

  if (!demandTypeId || !selectedType) {
    return (
      <EmptyState
        icon={FileText}
        title="Tipo de demanda não encontrado"
        description="Volte para a lista e selecione um tipo válido."
      />
    )
  }

  const meta = typeMeta(form.field_type)
  const showOptionsEditor = !!meta.hasOptions

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="icon" onClick={() => navigate("/app/modules/projetos/config/demand-types")}>
          <ArrowLeft size={16} />
        </Button>
        <div className="flex-1">
          <h2 className="text-lg font-bold">Formulário · {selectedType.name}</h2>
          <p className="text-sm text-muted-foreground">Organize as sessões e os campos do tipo de demanda.</p>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-1">
          <CardHeader>
            <CardTitle className="text-base">Sessões</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex gap-2">
              <Input
                placeholder="Nova sessão"
                value={newSectionTitle}
                onChange={(e) => setNewSectionTitle(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") void handleCreateSection() }}
              />
              <Button type="button" onClick={handleCreateSection} disabled={!newSectionTitle.trim()}>
                <Plus size={14} />
              </Button>
            </div>
            {sections.length === 0 ? (
              <p className="text-xs text-muted-foreground">Nenhuma sessão criada ainda.</p>
            ) : (
              <div className="space-y-1.5">
                {sections.map((section, index) => {
                  const isSelected = section.id === selectedSectionId
                  const isEditing = editingSectionId === section.id
                  if (isEditing) {
                    return (
                      <div key={section.id} className="rounded-md border border-primary/40 bg-primary/5">
                        <div className="flex items-center gap-1 p-1.5">
                          <Input
                            autoFocus
                            value={sectionDraftTitle}
                            onChange={(e) => setSectionDraftTitle(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") { e.preventDefault(); void saveEditSection(section.id) }
                              if (e.key === "Escape") { e.preventDefault(); cancelEditSection() }
                            }}
                            className="h-8"
                          />
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 shrink-0 text-primary"
                            onClick={() => void saveEditSection(section.id)}
                            disabled={!sectionDraftTitle.trim()}
                            title="Salvar"
                          >
                            <Check size={14} />
                          </Button>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 shrink-0"
                            onClick={cancelEditSection}
                            title="Cancelar"
                          >
                            <X size={14} />
                          </Button>
                        </div>
                      </div>
                    )
                  }
                  return (
                    <div
                      key={section.id}
                      role="button"
                      tabIndex={0}
                      onClick={() => setSelectedSectionId(section.id)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault()
                          setSelectedSectionId(section.id)
                        }
                      }}
                      className={`group cursor-pointer rounded-md border transition ${
                        isSelected ? "border-primary/40 bg-primary/5" : "hover:bg-muted/40"
                      }`}
                    >
                      <div className="flex items-center gap-1 p-2">
                        <div className="flex flex-col">
                          <button
                            type="button"
                            className="text-muted-foreground transition enabled:hover:text-foreground disabled:opacity-30"
                            disabled={index === 0 || reorderingSections}
                            onClick={(e) => { e.stopPropagation(); void handleMoveSection(section.id, -1) }}
                            title="Mover para cima"
                          >
                            <ChevronUp size={13} />
                          </button>
                          <button
                            type="button"
                            className="text-muted-foreground transition enabled:hover:text-foreground disabled:opacity-30"
                            disabled={index === sections.length - 1 || reorderingSections}
                            onClick={(e) => { e.stopPropagation(); void handleMoveSection(section.id, 1) }}
                            title="Mover para baixo"
                          >
                            <ChevronDown size={13} />
                          </button>
                        </div>
                        <div className="flex-1 text-left text-sm truncate">{section.title}</div>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8"
                          onClick={(e) => {
                            e.stopPropagation()
                            beginEditSection(section)
                          }}
                          title="Renomear"
                        >
                          <Pencil size={13} />
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-muted-foreground hover:text-destructive"
                          onClick={(e) => {
                            e.stopPropagation()
                            void handleDeleteSection(section.id)
                          }}
                          title="Excluir"
                        >
                          <Trash2 size={13} />
                        </Button>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader className="flex flex-row items-center justify-between space-y-0">
            <div>
              <CardTitle className="text-base">
                Campos {selectedSection && <span className="text-muted-foreground font-normal">· {selectedSection.title}</span>}
              </CardTitle>
              <p className="text-xs text-muted-foreground mt-1">
                {selectedSection
                  ? "Arraste ou edite cada campo. Para Seleção e Multi-seleção, configure as opções."
                  : "Selecione uma sessão para gerenciar os campos."}
              </p>
            </div>
            {selectedSection && (
              <Button type="button" size="sm" className="gap-1.5" onClick={openCreateField}>
                <Plus size={14} />
                Novo Campo
              </Button>
            )}
          </CardHeader>
          <CardContent>
            {!selectedSection ? (
              <p className="text-sm text-muted-foreground">Selecione uma sessão à esquerda.</p>
            ) : fields.length === 0 ? (
              <EmptyState
                icon={FileText}
                title="Nenhum campo nesta sessão"
                description="Crie campos para compor o formulário desse tipo de demanda."
                action={{ label: "Novo Campo", onClick: openCreateField }}
              />
            ) : (
              <DndContext sensors={sensors} onDragStart={onFieldDragStart} onDragEnd={onFieldDragEnd}>
                <div className="space-y-2">
                  {(() => {
                    const rows = groupIntoRows(fields, (f) => getRowBreak(f.validation))
                    const dragging = activeDragId !== null
                    return (
                      <>
                        <RowGapDropZone id="gap-0" dragging={dragging} />
                        {rows.map((row, rowIdx) => (
                          <div key={rowIdx} className="space-y-2">
                            <div className="flex flex-col md:flex-row gap-2">
                              {row.items.map((field) => (
                                <FieldCard
                                  key={field.id}
                                  field={field}
                                  fmeta={typeMeta(field.field_type)}
                                  options={parseOptions(field.options)}
                                  onEdit={() => openEditField(field)}
                                  onToggleActive={() => void handleToggleFieldActive(field)}
                                  onDelete={() => void handleDeleteField(field.id)}
                                />
                              ))}
                            </div>
                            <RowGapDropZone id={`gap-${rowIdx + 1}`} dragging={dragging} />
                          </div>
                        ))}
                      </>
                    )
                  })()}
                </div>
                {activeDragId && (
                  <p className="text-[11px] text-muted-foreground mt-2 pl-1">
                    Solte sobre um campo para entrar na mesma linha, ou em uma faixa entre linhas para criar uma nova.
                  </p>
                )}
              </DndContext>
            )}
          </CardContent>
        </Card>
      </div>

      <Dialog open={openField} onOpenChange={setOpenField}>
        <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingField ? "Editar Campo" : "Novo Campo"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label>Rótulo</Label>
                <Input
                  value={form.label}
                  onChange={(e) => patchForm({ label: e.target.value })}
                  placeholder="Ex: Telefone do solicitante"
                  autoFocus
                />
              </div>
              <div className="space-y-1.5">
                <Label>Tipo</Label>
                <Select value={form.field_type} onValueChange={(v) => patchForm({ field_type: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {FIELD_TYPES.map((t) => (
                      <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-[11px] text-muted-foreground">{meta.description}</p>
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label>Chave (slug)</Label>
                <Input
                  value={form.field_key}
                  onChange={(e) => patchForm({ field_key: e.target.value })}
                  placeholder={form.label ? slugify(form.label) : "auto a partir do rótulo"}
                />
                <p className="text-[11px] text-muted-foreground">
                  Identificador estável. Deixe vazio para gerar automaticamente.
                </p>
              </div>
              <div className="space-y-1.5">
                <Label>Placeholder</Label>
                <Input
                  value={form.placeholder}
                  onChange={(e) => patchForm({ placeholder: e.target.value })}
                  placeholder="Texto de exemplo no campo (opcional)"
                />
              </div>
            </div>


            <div className="space-y-1.5">
              <Label>Descrição / ajuda</Label>
              <Textarea
                rows={2}
                value={form.description}
                onChange={(e) => patchForm({ description: e.target.value })}
                placeholder="Texto de ajuda exibido perto do campo (opcional)"
              />
            </div>

            {showOptionsEditor && (
              <div className="space-y-2 rounded-md border p-3">
                <div className="flex items-center justify-between">
                  <Label className="text-sm">Opções</Label>
                  <Button type="button" size="sm" variant="outline" onClick={addOption} className="gap-1.5">
                    <Plus size={13} />
                    Adicionar opção
                  </Button>
                </div>
                {form.options.length === 0 ? (
                  <p className="text-xs text-muted-foreground">
                    Esse tipo exige ao menos uma opção. Clique em "Adicionar opção".
                  </p>
                ) : (
                  <div className="space-y-2">
                    {form.options.map((opt, index) => (
                      <div key={index} className="grid grid-cols-[1fr_1fr_auto_auto] gap-2 items-center">
                        <Input
                          value={opt.value}
                          onChange={(e) => updateOption(index, { value: e.target.value })}
                          placeholder="value (slug)"
                          className="font-mono text-xs"
                        />
                        <Input
                          value={opt.label}
                          onChange={(e) => updateOption(index, { label: e.target.value })}
                          placeholder="Rótulo exibido"
                        />
                        <Input
                          type="color"
                          value={opt.color ?? "#7C3AED"}
                          onChange={(e) => updateOption(index, { color: e.target.value })}
                          className="h-9 w-12 p-1"
                          title="Cor do badge"
                        />
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          onClick={() => removeOption(index)}
                          className="text-muted-foreground hover:text-destructive"
                        >
                          <Trash2 size={13} />
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            <div className="flex items-center gap-6">
              <div className="flex items-center gap-2">
                <Switch checked={form.is_required} onCheckedChange={(v) => patchForm({ is_required: v })} />
                <Label className="text-sm">Obrigatório (padrão)</Label>
              </div>
              <div className="flex items-center gap-2">
                <Switch checked={form.is_active} onCheckedChange={(v) => patchForm({ is_active: v })} />
                <Label className="text-sm">{form.is_active ? "Ativo" : "Inativo"}</Label>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpenField(false)}>
              Cancelar
            </Button>
            <Button type="button" onClick={() => void handleSaveField()} disabled={savingField || !form.label.trim()}>
              {savingField && <Loader2 size={13} className="animate-spin mr-1.5" />}
              {editingField ? "Salvar alterações" : "Criar Campo"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
