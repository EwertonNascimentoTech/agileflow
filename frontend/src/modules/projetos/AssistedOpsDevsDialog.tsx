import type { AssistedOpsDev } from "@/api/clientes"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { AssistedOpsDevsSection } from "@/modules/projetos/AssistedOpsDevsSection"

/** O backend responde 428 com este código quando o projeto vai para a Operação Assistida
 *  sem os desenvolvedores de atendimento definidos. */
export const ASSISTED_OPS_DEVS_REQUIRED = "assisted_ops_devs_required"

export function isAssistedOpsDevsRequired(err: unknown): boolean {
  const r = (err as { response?: { status?: number; data?: { detail?: unknown } } })?.response
  const d = r?.data?.detail as { code?: string } | undefined
  return r?.status === 428 && typeof d === "object" && d?.code === ASSISTED_OPS_DEVS_REQUIRED
}

/** Modal que aparece ao mover o projeto para a Operação Assistida sem devs de atendimento:
 *  o PO do projeto ou a coordenação define quem recebe as ocorrências ali mesmo e, ao salvar,
 *  o movimento é reenviado. Os demais veem só o aviso — o card não entra na raia. */
export function AssistedOpsDevsDialog({
  open, projectTaskId, projectTitle, canEdit, poName, onCancel, onSaved,
}: {
  open: boolean
  projectTaskId: string | null
  projectTitle?: string
  canEdit: boolean
  poName?: string | null
  onCancel: () => void
  onSaved: (devs: AssistedOpsDev[]) => void
}) {
  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onCancel() }}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Operação Assistida · atendimento</DialogTitle>
          <DialogDescription>
            Antes de mover {projectTitle ? <strong>{projectTitle}</strong> : "o projeto"} para a Operação Assistida,
            defina os desenvolvedores que vão atender as ocorrências dos clientes. O card só entra na raia depois de salvar.
          </DialogDescription>
        </DialogHeader>
        {open && projectTaskId && canEdit ? (
          <AssistedOpsDevsSection
            key={projectTaskId}
            projectTaskId={projectTaskId}
            readOnly={false}
            autoEdit
            requireOne
            bare
            onSaved={onSaved}
            onCancel={onCancel}
          />
        ) : (
          <>
            <p className="text-sm text-muted-foreground">
              Só o PO do projeto{poName ? ` (${poName})` : ""} ou a coordenação definem os desenvolvedores de
              atendimento. Peça a um deles para definir antes de mover o projeto para a Operação Assistida.
            </p>
            <DialogFooter>
              <Button onClick={onCancel}>Entendi</Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}
