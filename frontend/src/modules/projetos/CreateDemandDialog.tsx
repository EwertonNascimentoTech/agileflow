import { useEffect, useMemo, useState } from "react"
import { Loader2 } from "lucide-react"

import {
  projetosApi,
  type ProjectDemandFormField,
  type ProjectDemandFormSection,
  type ProjectDemandType,
  type ProjectStatus,
  type ProjectStatusDefaultFormLink,
  type ProjectStatusSectionLink,
  type ProjectTask,
} from "@/api/projetos"
import type { User } from "@/types"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { applyAutoFillCurrentFields } from "@/modules/projetos/FormFieldRenderer"
import { DemandFormSectionsPanel } from "@/modules/projetos/DemandFormSectionsPanel"
import { DefaultFormOrderedFields } from "@/modules/projetos/DefaultFormOrderedFields"
import { isDefaultFieldShown } from "@/modules/projetos/defaultFormVisibility"
import { type DefaultFormValues, validateDefaultFormValues } from "@/modules/projetos/defaultFormUtils"
import { useDefaultFormConfig } from "@/modules/projetos/useDefaultFormConfig"
import { formatMissingFieldsMessage, resolveFieldMode, resolveSectionMode, validateRequiredFields } from "@/modules/projetos/validation"
import { toast } from "@/lib/toast"

function getApiError(err: unknown): string {
  const e = err as { response?: { data?: { detail?: unknown } } }
  const d = e.response?.data?.detail
  if (typeof d === "string") return d
  return "Não foi possível criar a solicitação."
}

function emptyDefaultValues(): DefaultFormValues {
  return {
    title: "",
    description: "",
    assigned_to: null,
    diretoria: null,
    area: null,
    start_date: "",
    due_date: "",
    anexos: null,
  }
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
  const { fields: defaultFormFields } = useDefaultFormConfig()
  const [defaultValues, setDefaultValues] = useState<DefaultFormValues>(emptyDefaultValues())
  const [defaultFormLinks, setDefaultFormLinks] = useState<ProjectStatusDefaultFormLink[]>([])
  const [defaultFieldErrors, setDefaultFieldErrors] = useState<Partial<Record<keyof DefaultFormValues, string>>>({})
  const [formSections, setFormSections] = useState<ProjectDemandFormSection[]>([])
  const [fieldsBySection, setFieldsBySection] = useState<Record<string, ProjectDemandFormField[]>>({})
  const [statuses, setStatuses] = useState<ProjectStatus[]>([])
  const [sectionLinks, setSectionLinks] = useState<ProjectStatusSectionLink[]>([])
  const [formValues, setFormValues] = useState<Record<string, unknown>>({})
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState(false)

  const targetStatusId =
    targetStatusIdProp ?? (statuses.find((s) => s.is_initial) ?? statuses[0])?.id ?? null

  const visibleDefaultFields = useMemo(
    () => defaultFormFields.filter((f) => isDefaultFieldShown(f, defaultFormLinks)),
    [defaultFormFields, defaultFormLinks],
  )

  useEffect(() => {
    if (!open) return
    setDefaultValues(emptyDefaultValues())
    setFormValues({})
    setFieldErrors({})
    setDefaultFieldErrors({})
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

  useEffect(() => {
    if (!open || !targetStatusId) {
      setDefaultFormLinks([])
      return
    }
    projetosApi.listStatusDefaultFormLinks(projectId, targetStatusId)
      .then(setDefaultFormLinks)
      .catch(() => setDefaultFormLinks([]))
  }, [open, projectId, targetStatusId])

  async function handleSubmit() {
    if (!targetStatusId) return

    const { errors: defErrors, missingLabels: defMissing } = validateDefaultFormValues(
      defaultFormFields,
      defaultValues,
      defaultFormLinks,
    )
    const { errors, missingLabels } = validateRequiredFields({
      statusId: targetStatusId,
      formSections,
      fieldsBySection,
      sectionLinks,
      formValues,
    })
    const allMissing = [...defMissing, ...missingLabels]
    if (allMissing.length > 0) {
      setDefaultFieldErrors(defErrors)
      setFieldErrors(errors)
      toast.error(formatMissingFieldsMessage(allMissing))
      return
    }

    const title = defaultValues.title.trim()
    if (title.length < 2) {
      toast.error("Informe um título com ao menos 2 caracteres.")
      return
    }

    setDefaultFieldErrors({})
    setFieldErrors({})
    setSaving(true)
    try {
      const created = await projetosApi.createTask(projectId, {
        demand_type_id: demandType.id,
        title: title.slice(0, 200),
        description: defaultValues.description.trim() || null,
        status_id: targetStatusId,
        assigned_to: defaultValues.assigned_to || null,
        diretoria: defaultValues.diretoria || null,
        area: defaultValues.area || null,
        start_date: defaultValues.start_date || null,
        due_date: defaultValues.due_date || null,
        anexos: defaultValues.anexos ?? null,
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

  const canSubmit = defaultValues.title.trim().length >= 2 && !!targetStatusId

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-6xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Nova Solicitação — {demandType.name}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          {visibleDefaultFields.length > 0 && (
            <DefaultFormOrderedFields
              fields={defaultFormFields}
              values={defaultValues}
              onChange={(patch) => setDefaultValues((prev) => ({ ...prev, ...patch }))}
              users={users}
              errors={defaultFieldErrors}
              defaultFormLinks={defaultFormLinks}
            />
          )}

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
          <Button type="button" onClick={() => void handleSubmit()} disabled={saving || !canSubmit}>
            {saving && <Loader2 size={13} className="animate-spin mr-1.5" />}
            Criar Solicitação
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
