import { useEffect, useState } from "react"
import { Loader2 } from "lucide-react"

import { projetosApi, type ProjectDemandFormField, type ProjectDemandFormSection, type ProjectDemandType, type ProjectStatus, type ProjectStatusSectionLink, type ProjectTask } from "@/api/projetos"
import type { User } from "@/types"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { FormFieldRenderer, applyAutoFillCurrentFields } from "@/modules/projetos/FormFieldRenderer"
import { formatMissingFieldsMessage, resolveFieldMode, resolveSectionMode, validateRequiredFields } from "@/modules/projetos/validation"
import { getRowBreak, groupIntoRows } from "@/modules/projetos/layout"
import { toast } from "@/lib/toast"

function getApiError(err: unknown): string {
  const e = err as { response?: { data?: { detail?: unknown } } }
  const d = e.response?.data?.detail
  if (typeof d === "string") return d
  return "Não foi possível criar a solicitação."
}

export function CreateDemandDialog({
  open,
  onOpenChange,
  projectId,
  demandType,
  targetStatusId: targetStatusIdProp,
  users,
  onCreated,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
  projectId: string
  demandType: ProjectDemandType
  targetStatusId?: string | null
  users: User[]
  onCreated: (task: ProjectTask) => void
}) {
  const [title, setTitle] = useState("")
  const [description, setDescription] = useState("")
  const [formSections, setFormSections] = useState<ProjectDemandFormSection[]>([])
  const [fieldsBySection, setFieldsBySection] = useState<Record<string, ProjectDemandFormField[]>>({})
  const [statuses, setStatuses] = useState<ProjectStatus[]>([])
  const [sectionLinks, setSectionLinks] = useState<ProjectStatusSectionLink[]>([])
  const [formValues, setFormValues] = useState<Record<string, unknown>>({})
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState(false)

  const targetStatusId =
    targetStatusIdProp ?? (statuses.find((s) => s.is_initial) ?? statuses[0])?.id ?? null

  useEffect(() => {
    if (!open) return
    setTitle("")
    setDescription("")
    setFormValues({})
    setFieldErrors({})
  }, [open, demandType.id])

  useEffect(() => {
    if (!open) return
    projetosApi.listDemandSections(demandType.id, true).then(async (sections) => {
      const ordered = sections.sort((a, b) => a.order - b.order)
      setFormSections(ordered)
      const rows = await Promise.all(
        ordered.map(async (s) => ({
          sectionId: s.id,
          fields: (await projetosApi.listDemandFields(demandType.id, s.id, true)).sort((a, b) => a.order - b.order),
        })),
      )
      const mapped: Record<string, ProjectDemandFormField[]> = {}
      const allFields: ProjectDemandFormField[] = []
      rows.forEach((r) => { mapped[r.sectionId] = r.fields; allFields.push(...r.fields) })
      setFieldsBySection(mapped)
      setFormValues((prev) => applyAutoFillCurrentFields(allFields, prev))
    }).catch(() => {
      setFormSections([])
      setFieldsBySection({})
    })
  }, [open, demandType.id])

  useEffect(() => {
    if (!open) return
    const funnelId = demandType.funnel?.id ?? demandType.funnel_id
    if (!funnelId) {
      setStatuses([])
      return
    }
    projetosApi.listStatuses(projectId, funnelId, true)
      .then((data) => setStatuses([...data].sort((a, b) => a.order - b.order)))
      .catch(() => setStatuses([]))
  }, [open, projectId, demandType.funnel_id, demandType.funnel?.id])

  useEffect(() => {
    if (!open || !targetStatusId) {
      setSectionLinks([])
      return
    }
    projetosApi.listStatusSectionLinks(projectId, targetStatusId)
      .then(setSectionLinks)
      .catch(() => setSectionLinks([]))
  }, [open, projectId, targetStatusId])

  async function handleSubmit() {
    if (!title.trim() || !targetStatusId) return
    const { errors, missingLabels } = validateRequiredFields({
      statusId: targetStatusId,
      formSections,
      fieldsBySection,
      sectionLinks,
      formValues,
    })
    if (missingLabels.length > 0) {
      setFieldErrors(errors)
      toast.error(formatMissingFieldsMessage(missingLabels))
      return
    }
    setFieldErrors({})
    setSaving(true)
    try {
      const created = await projetosApi.createTask(projectId, {
        demand_type_id: demandType.id,
        title: title.trim().slice(0, 200),
        description: description.trim() || null,
        status_id: targetStatusId,
        assigned_to: null,
        due_date: null,
        form_values: formValues,
      })
      onCreated(created)
      onOpenChange(false)
    } catch (err) {
      toast.error(getApiError(err))
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-6xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Nova Solicitação — {demandType.name}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label>Título</Label>
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Ex: Ajustar fluxo de aprovação"
              autoFocus
            />
          </div>
          <div className="space-y-1.5">
            <Label>Descrição</Label>
            <Textarea
              rows={3}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Detalhes adicionais (opcional)"
            />
          </div>

          {formSections.length > 0 && targetStatusId && (
            <div className="space-y-6">
              {formSections.map((section) => {
                const secMode = resolveSectionMode(section.id, sectionLinks)
                const visibleFields = (fieldsBySection[section.id] ?? [])
                  .filter((f) => f.is_active)
                  .filter((f) => resolveFieldMode(f, targetStatusId, secMode) !== "hidden")
                if (visibleFields.length === 0) return null
                return (
                  <div key={section.id} className="space-y-3 border-t border-border pt-4 first:border-t-0 first:pt-0">
                    <div className="flex items-center gap-2">
                      <span className="h-4 w-1 rounded-full bg-primary" />
                      <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-primary">
                        {section.title}
                      </p>
                      {secMode === "visible" && (
                        <span className="text-[10px] uppercase tracking-wide text-muted-foreground">somente leitura</span>
                      )}
                      {secMode === "required" && (
                        <span className="text-[10px] uppercase tracking-wide text-destructive">obrigatória</span>
                      )}
                    </div>
                    <div className="space-y-3">
                      {groupIntoRows(
                        visibleFields,
                        (f) => getRowBreak(f.validation),
                      ).map((row, rowIdx) => (
                        <div key={rowIdx} className="flex flex-col md:flex-row gap-3">
                          {row.items.map((field) => {
                            const mode = resolveFieldMode(field, targetStatusId, secMode)
                            const isReadOnly = mode === "visible"
                            const isRequired = mode === "required" || (mode === "editable" && field.is_required)
                            const fieldError = fieldErrors[field.id]
                            return (
                              <div key={field.id} className="space-y-1 flex-1 min-w-0">
                                <Label>
                                  {field.label}
                                  {isRequired && <span className="text-destructive ml-0.5">*</span>}
                                  {isReadOnly && (
                                    <span className="ml-2 text-[10px] uppercase tracking-wide text-muted-foreground">só leitura</span>
                                  )}
                                </Label>
                                <div className={fieldError ? "rounded-md ring-2 ring-destructive/60" : ""}>
                                  <FormFieldRenderer
                                    field={field}
                                    value={formValues[field.field_key]}
                                    onChange={(v) => {
                                      setFormValues((prev) => ({ ...prev, [field.field_key]: v }))
                                      if (fieldErrors[field.id]) {
                                        setFieldErrors((prev) => {
                                          const next = { ...prev }
                                          delete next[field.id]
                                          return next
                                        })
                                      }
                                    }}
                                    users={users}
                                    disabled={isReadOnly}
                                  />
                                </div>
                                {fieldError && (
                                  <p className="text-[11px] text-destructive">{fieldError}</p>
                                )}
                              </div>
                            )
                          })}
                        </div>
                      ))}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button type="button" onClick={() => void handleSubmit()} disabled={saving || !title.trim() || !targetStatusId}>
            {saving && <Loader2 size={13} className="animate-spin mr-1.5" />}
            Criar Solicitação
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
