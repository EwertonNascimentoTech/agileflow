import { useEffect, useState } from "react"
import { Loader2, Plus, Trash2, Zap } from "lucide-react"

import { projetosApi, type ProjectAutomationAction, type ProjectAutomationRule } from "@/api/projetos"
import type { User } from "@/types"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"

const ACTION_LABELS: Record<ProjectAutomationAction, string> = {
  assign_user: "Atribuir responsável",
  create_subtask: "Criar subtarefa",
  notify: "Notificar",
  add_comment: "Comentário automático",
}

const NONE = "__none__"

export function StatusAutomationsManager({
  projectId,
  statusId,
  users,
}: {
  projectId: string
  statusId: string
  users: User[]
}) {
  const [rules, setRules] = useState<ProjectAutomationRule[]>([])
  const [loading, setLoading] = useState(false)
  const [open, setOpen] = useState(false)

  async function refresh() {
    setLoading(true)
    try {
      setRules(await projetosApi.listStatusAutomations(projectId, statusId))
    } finally {
      setLoading(false)
    }
  }
  useEffect(() => { void refresh() }, [projectId, statusId])

  function describe(rule: ProjectAutomationRule): string {
    const cfg = rule.action_config ?? {}
    if (rule.action === "assign_user") {
      if (cfg.source === "field") return `→ campo "${(cfg.field_key as string) ?? ""}"`
      const u = users.find((x) => x.id === cfg.user_id)
      return u ? `→ ${u.full_name}` : ""
    }
    if (rule.action === "create_subtask") return `“${(cfg.title as string) ?? ""}”`
    if (rule.action === "notify") return cfg.target === "assignee" ? "→ responsável" : "→ usuário"
    if (rule.action === "add_comment") return `“${(cfg.content as string) ?? ""}”`
    return ""
  }

  return (
    <div className="mt-2 rounded-md border bg-muted/30 p-2 space-y-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5 text-xs font-medium">
          <Zap size={13} className="text-primary" />
          Automações ao entrar
          {rules.length > 0 && <Badge variant="secondary" className="text-[10px]">{rules.length}</Badge>}
        </div>
        <Button type="button" variant="ghost" size="sm" className="h-7 gap-1 text-xs" onClick={() => setOpen(true)}>
          <Plus size={12} /> Adicionar
        </Button>
      </div>

      {loading ? (
        <p className="text-[11px] text-muted-foreground">Carregando…</p>
      ) : rules.length === 0 ? (
        <p className="text-[11px] italic text-muted-foreground/70">Nenhuma automação nesta etapa.</p>
      ) : (
        <div className="space-y-1">
          {rules.map((r) => (
            <div key={r.id} className="flex items-center justify-between rounded bg-background px-2 py-1 text-xs">
              <div className="flex items-center gap-2 min-w-0">
                <Badge variant="info" className="text-[10px] shrink-0">{ACTION_LABELS[r.action]}</Badge>
                <span className="font-medium truncate">{r.name}</span>
                <span className="text-muted-foreground truncate">{describe(r)}</span>
                {!r.is_active && <Badge variant="secondary" className="text-[10px]">inativa</Badge>}
              </div>
              <Button
                type="button" variant="ghost" size="icon" className="h-6 w-6 shrink-0"
                onClick={async () => {
                  if (!confirm(`Remover a automação "${r.name}"?`)) return
                  await projetosApi.deleteAutomation(projectId, r.id)
                  void refresh()
                }}
              >
                <Trash2 size={12} />
              </Button>
            </div>
          ))}
        </div>
      )}

      {open && (
        <AutomationDialog
          projectId={projectId}
          statusId={statusId}
          users={users}
          onClose={() => setOpen(false)}
          onSaved={() => { setOpen(false); void refresh() }}
        />
      )}
    </div>
  )
}

function AutomationDialog({
  projectId, statusId, users, onClose, onSaved,
}: {
  projectId: string
  statusId: string
  users: User[]
  onClose: () => void
  onSaved: () => void
}) {
  const [name, setName] = useState("")
  const [action, setAction] = useState<ProjectAutomationAction>("notify")
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // configs por ação
  const [userId, setUserId] = useState<string>(NONE)
  const [assignSource, setAssignSource] = useState<"user" | "field">("user")
  const [fieldKey, setFieldKey] = useState("requisitante")
  const [subtaskTitle, setSubtaskTitle] = useState("")
  const [assignToParent, setAssignToParent] = useState(true)
  const [notifyTarget, setNotifyTarget] = useState<"assignee" | "user">("assignee")
  const [message, setMessage] = useState("")
  const [commentContent, setCommentContent] = useState("")

  function buildConfig(): Record<string, unknown> {
    if (action === "assign_user") {
      return assignSource === "field"
        ? { source: "field", field_key: fieldKey.trim() }
        : { source: "user", user_id: userId === NONE ? null : userId }
    }
    if (action === "create_subtask") return { title: subtaskTitle, assign_to_parent_assignee: assignToParent }
    if (action === "notify") return { target: notifyTarget, user_id: notifyTarget === "user" ? (userId === NONE ? null : userId) : null, message: message || null }
    if (action === "add_comment") return { content: commentContent }
    return {}
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setError(null)
    try {
      if (action === "assign_user" && assignSource === "user" && userId === NONE) { setError("Selecione o responsável."); setSaving(false); return }
      if (action === "assign_user" && assignSource === "field" && !fieldKey.trim()) { setError("Informe a chave do campo (ex: requisitante)."); setSaving(false); return }
      await projetosApi.createStatusAutomation(projectId, statusId, {
        name: name.trim() || ACTION_LABELS[action],
        action,
        action_config: buildConfig(),
      })
      onSaved()
    } catch (err: any) {
      setError(err?.response?.data?.detail ?? "Erro ao salvar.")
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent>
        <DialogHeader><DialogTitle>Nova automação</DialogTitle></DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <Label>Nome</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex: Notificar PMO" />
          </div>
          <div>
            <Label>Ação *</Label>
            <Select value={action} onValueChange={(v) => setAction(v as ProjectAutomationAction)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {(Object.keys(ACTION_LABELS) as ProjectAutomationAction[]).map((a) => (
                  <SelectItem key={a} value={a}>{ACTION_LABELS[a]}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {action === "assign_user" && (
            <>
              <div>
                <Label>Origem do responsável *</Label>
                <Select value={assignSource} onValueChange={(v) => setAssignSource(v as "user" | "field")}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="user">Usuário fixo</SelectItem>
                    <SelectItem value="field">Campo do formulário (ex: requisitante)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {assignSource === "user" ? (
                <div>
                  <Label>Responsável *</Label>
                  <Select value={userId} onValueChange={setUserId}>
                    <SelectTrigger><SelectValue placeholder="Selecione…" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value={NONE}>—</SelectItem>
                      {users.map((u) => <SelectItem key={u.id} value={u.id}>{u.full_name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              ) : (
                <div>
                  <Label>Campo do formulário *</Label>
                  <Input value={fieldKey} onChange={(e) => setFieldKey(e.target.value)} placeholder="requisitante" />
                  <p className="mt-1 text-[11px] text-muted-foreground">
                    Chave do campo cujo valor será atribuído como responsável ao entrar na etapa. Ex.: <code>requisitante</code>.
                  </p>
                </div>
              )}
            </>
          )}

          {action === "create_subtask" && (
            <>
              <div>
                <Label>Título da subtarefa *</Label>
                <Input value={subtaskTitle} onChange={(e) => setSubtaskTitle(e.target.value)} placeholder="Ex: Checklist técnico" required />
              </div>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={assignToParent} onChange={(e) => setAssignToParent(e.target.checked)} />
                Atribuir ao mesmo responsável do card
              </label>
            </>
          )}

          {action === "notify" && (
            <>
              <div>
                <Label>Notificar</Label>
                <Select value={notifyTarget} onValueChange={(v) => setNotifyTarget(v as "assignee" | "user")}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="assignee">Responsável do card</SelectItem>
                    <SelectItem value="user">Usuário específico</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {notifyTarget === "user" && (
                <div>
                  <Label>Usuário *</Label>
                  <Select value={userId} onValueChange={setUserId}>
                    <SelectTrigger><SelectValue placeholder="Selecione…" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value={NONE}>—</SelectItem>
                      {users.map((u) => <SelectItem key={u.id} value={u.id}>{u.full_name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              )}
              <div>
                <Label>Mensagem</Label>
                <Input value={message} onChange={(e) => setMessage(e.target.value)} placeholder="(opcional)" />
              </div>
            </>
          )}

          {action === "add_comment" && (
            <div>
              <Label>Conteúdo do comentário *</Label>
              <Input value={commentContent} onChange={(e) => setCommentContent(e.target.value)} placeholder="Ex: Card entrou em desenvolvimento" required />
            </div>
          )}

          {error && <p className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">{error}</p>}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>Cancelar</Button>
            <Button type="submit" disabled={saving}>{saving && <Loader2 size={13} className="animate-spin mr-1.5" />}Salvar</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
