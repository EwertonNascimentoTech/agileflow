import { useEffect, useState } from "react"
import { Loader2 } from "lucide-react"

import { projetosApi, type ProjectDemandFormField, type ProjectDemandFormSection, type ProjectDemandType, type ProjectStatus, type ProjectStatusSectionLink, type ProjectTask } from "@/api/projetos"
import type { User } from "@/types"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { applyAutoFillCurrentFields } from "@/modules/projetos/FormFieldRenderer"
import { DemandFormSectionsPanel } from "@/modules/projetos/DemandFormSectionsPanel"
import { formatMissingFieldsMessage, resolveFieldMode, resolveSectionMode, validateRequiredFields } from "@/modules/projetos/validation"
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
            <DemandFormSectionsPanel
              sections={formSections}
              fieldsBySection={fieldsBySection}
              sectionMode={(sectionId) => resolveSectionMode(sectionId, sectionLinks)}
              fieldMode={(field, parentMode) => resolveFieldMode(field, targetStatusId, parentMode)}
              formValues={formValues}
              fieldErrors={fieldErrors}
              users={users}
              onFieldChange={(fieldKey, value, fieldId) => {
                setFormValues((prev) => ({ ...prev, [fieldKey]: value }))
                if (fieldErrors[fieldId]) {
                  setFieldErrors((prev) => {
                    const next = { ...prev }
                    delete next[fieldId]
                    return next
                  })
                }
              }}
            />
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
