import { useEffect, useMemo, useState } from "react"
import { Loader2 } from "lucide-react"

import { teamopsApi, type CatalogPermission, type Position } from "@/api/teamops"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Skeleton } from "@/components/ui/skeleton"

const MODULE_LABELS: Record<string, string> = {
  atendimento: "Atendimento (CRM)",
  propostas_contratos: "Propostas & Contratos",
  projetos: "Projetos",
  teamops: "Gestão de Times",
  estoque: "Estoque",
  pdv: "PDV",
}

const OP_LABELS: Record<string, string> = {
  view: "Visualizar",
  view_own: "Ver próprios",
  view_team: "Ver do time",
  create: "Criar",
  update: "Editar",
  update_own: "Editar próprios",
  manage: "Gerenciar (tudo)",
  delete: "Excluir",
  approve: "Aprovar",
  assign: "Atribuir",
  request: "Solicitar",
  send: "Enviar",
  accept: "Aceitar",
  sign: "Assinar",
  operate: "Operar",
  cancel: "Cancelar",
}

const RESOURCE_LABELS: Record<string, string> = {
  "": "Geral",
  attendance: "Atendimentos", client: "Clientes", company: "Empresas", task: "Tarefas",
  timeline: "Timeline", automation: "Automações", followup: "Follow-ups", config: "Configurações",
  reports: "Relatórios",
  proposal: "Propostas", template: "Modelos", contract: "Contratos",
  project: "Projetos", status: "Etapas/Colunas", demand_type: "Tipos de demanda", form: "Formulários", comment: "Comentários",
  org: "Organograma", person: "Pessoas", stack: "Stacks", person_stack: "Stacks das pessoas", absence: "Ausências",
  cash: "Caixa", sale: "Vendas", payment_method: "Formas de pagamento", report: "Relatórios",
  type: "Tipos de produto", category: "Categorias", product: "Produtos", warehouse: "Depósitos",
  supplier: "Fornecedores", movement: "Movimentações", batch: "Lotes", serial: "Nº de série",
}

const OP_ORDER = Object.keys(OP_LABELS)

function parseCode(code: string): { module: string; resource: string; op: string } {
  const parts = code.split(".")
  if (parts.length >= 3) return { module: parts[0], resource: parts[1], op: parts.slice(2).join(".") }
  return { module: parts[0], resource: "", op: parts[1] ?? "" }
}

function humanize(s: string): string {
  return s.replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase())
}

export function PositionAccessDialog({
  position, onClose, onSaved,
}: { position: Position; onClose: () => void; onSaved: () => void }) {
  const [catalog, setCatalog] = useState<CatalogPermission[]>([])
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    Promise.all([
      teamopsApi.getPermissionsCatalog(),
      teamopsApi.getPositionPermissions(position.id),
    ])
      .then(([cat, codes]) => {
        setCatalog(cat)
        setSelected(new Set(codes))
      })
      .catch(() => setError("Não foi possível carregar as permissões."))
      .finally(() => setLoading(false))
  }, [position.id])

  // module -> resource -> [{code, op, name}]
  const grouped = useMemo(() => {
    const m = new Map<string, Map<string, { code: string; op: string; name: string }[]>>()
    for (const p of catalog) {
      const { module, resource, op } = parseCode(p.code)
      if (!m.has(module)) m.set(module, new Map())
      const byRes = m.get(module)!
      if (!byRes.has(resource)) byRes.set(resource, [])
      byRes.get(resource)!.push({ code: p.code, op, name: p.name })
    }
    return m
  }, [catalog])

  function toggle(code: string) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(code)) next.delete(code); else next.add(code)
      return next
    })
  }

  function toggleModule(codes: string[]) {
    const allOn = codes.every((c) => selected.has(c))
    setSelected((prev) => {
      const next = new Set(prev)
      codes.forEach((c) => (allOn ? next.delete(c) : next.add(c)))
      return next
    })
  }

  async function handleSave() {
    setSaving(true)
    setError(null)
    try {
      await teamopsApi.setPositionPermissions(position.id, [...selected])
      onSaved()
    } catch (err: any) {
      setError(err?.response?.data?.detail ?? "Erro ao salvar.")
      setSaving(false)
    }
  }

  const modules = [...grouped.keys()].sort((a, b) =>
    (MODULE_LABELS[a] ?? a).localeCompare(MODULE_LABELS[b] ?? b))

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Acesso do cargo · {position.name}</DialogTitle>
        </DialogHeader>

        <p className="text-sm text-muted-foreground">
          Defina o que este cargo pode fazer em cada módulo que a empresa tem. Quem tem este cargo
          (com acesso ao sistema) herda estas permissões.
        </p>

        {loading ? (
          <div className="space-y-2">{[...Array(3)].map((_, i) => <Skeleton key={i} className="h-24" />)}</div>
        ) : modules.length === 0 ? (
          <p className="rounded-md border p-4 text-sm text-muted-foreground">
            Nenhum módulo ativo na empresa para configurar.
          </p>
        ) : (
          <div className="space-y-4">
            {modules.map((module) => {
              const byRes = grouped.get(module)!
              const allCodes = [...byRes.values()].flat().map((x) => x.code)
              const allOn = allCodes.every((c) => selected.has(c))
              const resources = [...byRes.keys()].sort((a, b) =>
                (RESOURCE_LABELS[a] ?? a).localeCompare(RESOURCE_LABELS[b] ?? b))
              return (
                <div key={module} className="rounded-md border">
                  <div className="flex items-center justify-between border-b bg-muted/40 px-3 py-2">
                    <span className="text-sm font-semibold">{MODULE_LABELS[module] ?? module}</span>
                    <label className="flex cursor-pointer items-center gap-2 text-xs text-muted-foreground">
                      <input type="checkbox" checked={allOn} onChange={() => toggleModule(allCodes)} />
                      Marcar tudo
                    </label>
                  </div>
                  <div className="divide-y">
                    {resources.map((res) => {
                      const perms = byRes.get(res)!.slice().sort(
                        (a, b) => OP_ORDER.indexOf(a.op) - OP_ORDER.indexOf(b.op))
                      return (
                        <div key={res} className="flex flex-wrap items-center gap-x-4 gap-y-1.5 px-3 py-2">
                          <span className="w-40 shrink-0 text-sm font-medium">
                            {RESOURCE_LABELS[res] ?? humanize(res)}
                          </span>
                          <div className="flex flex-wrap gap-x-4 gap-y-1.5">
                            {perms.map((p) => (
                              <label key={p.code} className="flex cursor-pointer items-center gap-1.5 text-sm" title={p.name}>
                                <input type="checkbox" checked={selected.has(p.code)} onChange={() => toggle(p.code)} />
                                {OP_LABELS[p.op] ?? humanize(p.op)}
                              </label>
                            ))}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )
            })}
          </div>
        )}

        {error && (
          <p className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">{error}</p>
        )}

        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose}>Cancelar</Button>
          <Button type="button" onClick={handleSave} disabled={saving || loading}>
            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Salvar acesso
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
