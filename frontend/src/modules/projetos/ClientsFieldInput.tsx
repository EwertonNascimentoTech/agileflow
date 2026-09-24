import { useState } from "react"
import { Plus, X } from "lucide-react"

import { clientesApi, PROJECT_CLIENT_ROLE_LABEL, type ProjectClientRole } from "@/api/clientes"
import { Button } from "@/components/ui/button"
import { ClientPicker, clientRoleLabel, type PickedClient } from "@/modules/projetos/ClientPicker"

/** Funções que a solicitação exige (espelha REQUIRED_REQUEST_ROLES do backend). */
export const REQUIRED_CLIENT_ROLES: ProjectClientRole[] = ["solicitante", "sponsor"]

export function asClientEntries(value: unknown): PickedClient[] {
  return Array.isArray(value)
    ? value.filter((v): v is PickedClient => !!v && typeof v === "object" && "email" in v && "project_role" in v)
    : []
}

export function missingClientRoles(value: unknown): string[] {
  const roles = new Set(asClientEntries(value).map((c) => c.project_role))
  return REQUIRED_CLIENT_ROLES.filter((r) => !roles.has(r)).map((r) => PROJECT_CLIENT_ROLE_LABEL[r])
}

export function formatClientEntries(value: unknown): string | null {
  const list = asClientEntries(value)
  if (!list.length) return null
  return list.map((c) => `${c.full_name || c.email} (${clientRoleLabel(c.project_role, c.project_role_other)})`).join(", ")
}

/** Campo "Clientes" da solicitação: pessoas + função no projeto. Quando a solicitação vira
 *  projeto, elas passam a ser os clientes do projeto (Portal do Cliente). */
export function ClientsFieldInput({
  value,
  onChange,
  disabled = false,
}: {
  value: unknown
  onChange: (v: PickedClient[]) => void
  disabled?: boolean
}) {
  const list = asClientEntries(value)
  const [adding, setAdding] = useState(false)
  const missing = missingClientRoles(list)

  return (
    <div className="space-y-2">
      {list.length > 0 && (
        <div className="space-y-1.5">
          {list.map((c) => (
            <div key={c.email} className="flex items-center gap-2 rounded-md border bg-background px-2 py-1.5 text-xs">
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium">{c.full_name || c.email}</p>
                <p className="truncate text-[11px] text-muted-foreground">
                  {[c.email, c.department, c.job_title].filter(Boolean).join(" · ")}
                </p>
              </div>
              <span className="shrink-0 rounded bg-sky-100 px-1.5 py-0.5 text-[11px] font-medium text-sky-800 dark:bg-sky-900 dark:text-sky-200">
                {clientRoleLabel(c.project_role, c.project_role_other)}
              </span>
              {!disabled && (
                <Button
                  type="button" variant="ghost" size="icon" className="h-6 w-6 text-muted-foreground hover:text-destructive"
                  title="Tirar da lista" onClick={() => onChange(list.filter((x) => x.email !== c.email))}
                >
                  <X size={13} />
                </Button>
              )}
            </div>
          ))}
        </div>
      )}

      {list.length === 0 && disabled && <p className="text-xs text-muted-foreground">Nenhum cliente informado.</p>}

      {!disabled && missing.length > 0 && (
        <p className="text-[11px] text-muted-foreground">
          Inclua {missing.join(" e ")}{list.length === 0 ? " (pessoas diferentes)" : ""}.
        </p>
      )}

      {!disabled && (
        adding ? (
          <ClientPicker
            search={(q) => clientesApi.candidates(q)}
            excludeEmails={list.map((c) => c.email)}
            initialRole={(missing.length ? REQUIRED_CLIENT_ROLES.find((r) => missing.includes(PROJECT_CLIENT_ROLE_LABEL[r])) : "usuario_chave") ?? "solicitante"}
            onPick={(c) => { onChange([...list, c]); setAdding(false); return true }}
            onCancel={() => setAdding(false)}
          />
        ) : (
          <Button type="button" variant="outline" size="sm" className="h-8 gap-1 text-xs" onClick={() => setAdding(true)}>
            <Plus size={13} /> Adicionar cliente
          </Button>
        )
      )}
    </div>
  )
}
