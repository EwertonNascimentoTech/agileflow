import { Label } from "@/components/ui/label"
import { AttachmentField, type Attachment } from "@/components/AttachmentField"
import type { ProjectDefaultFormField } from "@/api/projetos"

/**
 * Renderiza o campo padrão "Anexos" (field_type "file") com o mesmo enquadramento
 * (Label + obrigatório + erro) dos demais campos padrão, mas usando o AttachmentField
 * multi-arquivo em vez do controle string genérico.
 */
export function DefaultFormAttachmentControl({
  field,
  value,
  onChange,
  disabled = false,
  error,
}: {
  field: ProjectDefaultFormField
  value: unknown
  onChange: (files: Attachment[]) => void
  disabled?: boolean
  error?: string
}) {
  return (
    <div className="space-y-1.5">
      <Label>
        {field.label}
        {field.is_required && <span className="text-destructive ml-0.5">*</span>}
      </Label>
      <AttachmentField value={value} onChange={onChange} disabled={disabled} />
      {error && <p className="text-[11px] text-destructive">{error}</p>}
    </div>
  )
}
