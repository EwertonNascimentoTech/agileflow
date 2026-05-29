import { FileText } from "lucide-react"

import type { ProjectDemandFormField, ProjectDemandFormSection } from "@/api/projetos"
import type { User } from "@/types"
import { Label } from "@/components/ui/label"
import { CollapsibleFormSection } from "@/modules/projetos/CollapsibleFormSection"
import { FormFieldRenderer, type FieldVisibilityMode } from "@/modules/projetos/FormFieldRenderer"
import { getRowBreak, groupIntoRows } from "@/modules/projetos/layout"

export function DemandFormSectionsPanel({
  sections,
  fieldsBySection,
  sectionMode,
  fieldMode,
  formValues,
  onFieldChange,
  fieldErrors = {},
  users = [],
}: {
  sections: ProjectDemandFormSection[]
  fieldsBySection: Record<string, ProjectDemandFormField[]>
  sectionMode: (sectionId: string) => FieldVisibilityMode
  fieldMode: (field: ProjectDemandFormField, parentMode: FieldVisibilityMode) => FieldVisibilityMode
  formValues: Record<string, unknown>
  onFieldChange: (fieldKey: string, value: unknown, fieldId: string) => void
  fieldErrors?: Record<string, string>
  users?: User[]
}) {
  const visibleSections = sections
    .map((section) => {
      const secMode = sectionMode(section.id)
      const visibleFields = (fieldsBySection[section.id] ?? [])
        .filter((f) => f.is_active)
        .filter((f) => fieldMode(f, secMode) !== "hidden")
      return { section, secMode, visibleFields }
    })
    .filter((x) => x.visibleFields.length > 0)

  if (visibleSections.length === 0) return null

  return (
    <>
      {visibleSections.map(({ section, secMode, visibleFields }) => (
        <CollapsibleFormSection
          key={section.id}
          sectionId={`demand-section-${section.id}`}
          title={section.title}
          icon={FileText}
          badges={
            <>
              {secMode === "visible" && (
                <span className="text-[10px] uppercase tracking-wide text-muted-foreground">somente leitura</span>
              )}
              {secMode === "required" && (
                <span className="text-[10px] uppercase tracking-wide text-destructive">obrigatória</span>
              )}
            </>
          }
        >
          {groupIntoRows(visibleFields, (f) => getRowBreak(f.validation)).map((row, rowIdx) => (
            <div key={rowIdx} className="flex flex-col gap-3 md:flex-row">
              {row.items.map((field) => {
                const mode = fieldMode(field, secMode)
                const isReadOnly = mode === "visible"
                const isRequired = mode === "required" || (mode === "editable" && field.is_required)
                const fieldError = fieldErrors[field.id]
                return (
                  <div key={field.id} className="min-w-0 flex-1 space-y-1">
                    <Label>
                      {field.label}
                      {isRequired && <span className="ml-0.5 text-destructive">*</span>}
                      {isReadOnly && (
                        <span className="ml-2 text-[10px] uppercase tracking-wide text-muted-foreground">
                          só leitura
                        </span>
                      )}
                    </Label>
                    <div className={fieldError ? "rounded-md ring-2 ring-destructive/60" : ""}>
                      <FormFieldRenderer
                        field={field}
                        value={formValues[field.field_key]}
                        onChange={(v) => onFieldChange(field.field_key, v, field.id)}
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
        </CollapsibleFormSection>
      ))}
    </>
  )
}
