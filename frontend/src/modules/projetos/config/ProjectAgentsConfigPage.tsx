import { useEffect, useMemo, useState } from "react"
import { Bot, GitBranch, Loader2, Pencil, Plus, ScrollText, Trash2 } from "lucide-react"
import { Link } from "react-router-dom"

import {
  projetosApi,
  type Project,
  type ProjectFunnel,
  type ProjectStageAgentBinding,
  type ProjectStageAgentBindingInput,
  type ProjectStageAgentKind,
  type ProjectStatus,
} from "@/api/projetos"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { EmptyState } from "@/components/EmptyState"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Skeleton } from "@/components/ui/skeleton"
import { Switch } from "@/components/ui/switch"
import { Textarea } from "@/components/ui/textarea"
import { toast } from "@/lib/toast"

const DEFAULT_PROMPT = `Você recebeu um card do kanban para processar nesta etapa.

Título: {{title}}
Descrição: {{description}}

Dados do formulário:
{{form_values}}`

const DEFAULT_CLASSIFY_PROMPT = `Você é um analista de priorização. Leia os dados completos da solicitação abaixo e classifique-a na matriz Impacto × Esforço.

{{task_context}}

{{priority_rubric}}

Responda APENAS com um JSON válido (sem markdown, sem texto extra), neste formato exato:
{
  "pillar_codes": ["F1"],
  "impact_scores": {
    "aderencia_estrategica": 1,
    "cliente": 1,
    "financeiro": 1,
    "eficiencia": 1,
    "risco": 1,
    "alcance": 1
  },
  "effort_scores": {
    "documentacao": 1,
    "areas": 1,
    "maturidade": 1,
    "complexidade": 1,
    "integracoes": 1
  },
  "justificativa": "Breve explicação da classificação"
}`

const AGENT_KIND_LABELS: Record<ProjectStageAgentKind, string> = {
  ask: "Pergunta livre",
  classify_and_advance: "Classificação (matriz + avançar)",
}

type AgentForm = {
  agent_kind: ProjectStageAgentKind
  name: string
  agent_id: string
  usuario: string
  prompt_template: string
  gateway_url: string
  gateway_client_id: string
  gateway_client_secret: string
  continue_thread: boolean
  add_comment_on_success: boolean
  is_active: boolean
}

const emptyForm = (kind: ProjectStageAgentKind = "classify_and_advance"): AgentForm => ({
  agent_kind: kind,
  name: "",
  agent_id: "",
  usuario: "",
  prompt_template: kind === "classify_and_advance" ? DEFAULT_CLASSIFY_PROMPT : DEFAULT_PROMPT,
  gateway_url: "",
  gateway_client_id: "",
  gateway_client_secret: "",
  continue_thread: false,
  add_comment_on_success: true,
  is_active: true,
})

export default function ProjectAgentsConfigPage() {
  const [projects, setProjects] = useState<Project[]>([])
  const [projectId, setProjectId] = useState("")
  const [funnels, setFunnels] = useState<ProjectFunnel[]>([])
  const [statuses, setStatuses] = useState<ProjectStatus[]>([])
  const [agents, setAgents] = useState<ProjectStageAgentBinding[]>([])
  const [loading, setLoading] = useState(true)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [editing, setEditing] = useState<ProjectStageAgentBinding | null>(null)
  const [targetStatus, setTargetStatus] = useState<ProjectStatus | null>(null)
  const [form, setForm] = useState<AgentForm>(emptyForm())

  async function refresh(project: string) {
    if (!project) return
    const [fs, sts, ags] = await Promise.all([
      projetosApi.listFunnels(project, true),
      projetosApi.listStatuses(project, undefined, true),
      projetosApi.listStageAgents(project),
    ])
    setFunnels(fs)
    setStatuses(sts)
    setAgents(ags)
  }

  useEffect(() => {
    projetosApi.listProjects(true).then((ps) => {
      setProjects(ps)
      const first = ps[0]?.id || ""
      setProjectId((cur) => cur || first)
    }).finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    if (!projectId) return
    setLoading(true)
    refresh(projectId).finally(() => setLoading(false))
  }, [projectId])

  const agentsByStatus = useMemo(() => {
    const m = new Map<string, ProjectStageAgentBinding>()
    for (const a of agents) m.set(a.status_id, a)
    return m
  }, [agents])

  const statusesByFunnel = useMemo(() => {
    const m = new Map<string, ProjectStatus[]>()
    for (const s of [...statuses].sort((a, b) => a.order - b.order)) {
      const arr = m.get(s.funnel_id) ?? []
      arr.push(s)
      m.set(s.funnel_id, arr)
    }
    return m
  }, [statuses])

  function openCreate(status: ProjectStatus) {
    setEditing(null)
    setTargetStatus(status)
    setForm(emptyForm("classify_and_advance"))
    setDialogOpen(true)
  }

  function openEdit(agent: ProjectStageAgentBinding, status: ProjectStatus) {
    setEditing(agent)
    setTargetStatus(status)
    setForm({
      agent_kind: agent.agent_kind ?? "ask",
      name: agent.name,
      agent_id: agent.agent_id,
      usuario: agent.usuario,
      prompt_template: agent.prompt_template,
      gateway_url: agent.gateway_url ?? "",
      gateway_client_id: agent.gateway_client_id ?? "",
      gateway_client_secret: "",
      continue_thread: agent.continue_thread,
      add_comment_on_success: agent.add_comment_on_success,
      is_active: agent.is_active,
    })
    setDialogOpen(true)
  }

  async function handleSave() {
    if (!targetStatus || !projectId) return
    if (!form.name.trim() || !form.agent_id.trim() || !form.usuario.trim() || !form.prompt_template.trim()) {
      toast.error("Preencha nome, ID do agente, usuário e prompt.")
      return
    }
    const clientId = form.gateway_client_id.trim()
    const secretInput = form.gateway_client_secret.trim()
    const hasStoredSecret = Boolean(editing?.has_gateway_client_secret)
    const needsSecret = !editing || !hasStoredSecret || !editing.gateway_client_id
    if (!clientId) {
      toast.error("Informe o X-Client-ID (credencial do gateway IDCortex).")
      return
    }
    if (needsSecret && !secretInput) {
      toast.error("Informe o X-Client-Secret (credencial do gateway IDCortex).")
      return
    }
    setSaving(true)
    try {
      if (editing) {
        const payload: Partial<ProjectStageAgentBindingInput> = {
          agent_kind: form.agent_kind,
          name: form.name.trim(),
          agent_id: form.agent_id.trim(),
          usuario: form.usuario.trim(),
          prompt_template: form.prompt_template,
          continue_thread: form.continue_thread,
          add_comment_on_success: form.add_comment_on_success,
          is_active: form.is_active,
          gateway_url: form.gateway_url.trim() || null,
          gateway_client_id: clientId,
        }
        if (secretInput) {
          payload.gateway_client_secret = secretInput
        }
        await projetosApi.updateStageAgent(editing.id, payload)
        toast.success("Agente atualizado.")
      } else {
        const payload: ProjectStageAgentBindingInput = {
          project_id: projectId,
          funnel_id: targetStatus.funnel_id,
          status_id: targetStatus.id,
          agent_kind: form.agent_kind,
          name: form.name.trim(),
          agent_id: form.agent_id.trim(),
          usuario: form.usuario.trim(),
          prompt_template: form.prompt_template,
          continue_thread: form.continue_thread,
          add_comment_on_success: form.add_comment_on_success,
          is_active: form.is_active,
          gateway_url: form.gateway_url.trim() || null,
          gateway_client_id: clientId,
          gateway_client_secret: secretInput,
        }
        await projetosApi.createStageAgent(payload)
        toast.success("Agente vinculado à etapa.")
      }
      setDialogOpen(false)
      await refresh(projectId)
    } catch (err) {
      const e = err as { response?: { data?: { detail?: unknown } } }
      toast.error(typeof e.response?.data?.detail === "string" ? e.response.data.detail : "Não foi possível salvar.")
    } finally {
      setSaving(false)
    }
  }

  if (loading && projects.length === 0) {
    return <div className="p-1"><Skeleton className="h-96 rounded-lg" /></div>
  }

  const orderedFunnels = [...funnels].sort((a, b) => a.order - b.order)

  return (
    <div className="w-full space-y-4 p-1">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-bold">Agentes por etapa</h1>
          <p className="text-sm text-muted-foreground">
            Vincule um agente IDCortex a uma raia do kanban. Quando um card entrar na etapa,
            o sistema chamará o gateway com o prompt configurado.
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Button type="button" variant="outline" size="sm" asChild>
            <Link to="/app/modules/projetos/config/agentes/logs">
              <ScrollText size={14} className="mr-1.5" />
              Ver logs
            </Link>
          </Button>
          {projects.length > 1 && (
          <Select value={projectId} onValueChange={setProjectId}>
            <SelectTrigger className="w-48"><SelectValue placeholder="Projeto" /></SelectTrigger>
            <SelectContent>
              {projects.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
            </SelectContent>
          </Select>
          )}
        </div>
      </div>

      {loading ? (
        <Skeleton className="h-64 rounded-lg" />
      ) : orderedFunnels.length === 0 ? (
        <EmptyState
          icon={GitBranch}
          title="Nenhum fluxo configurado"
          description="Crie fluxos e etapas em Configurações → Funis / Etapas Kanban."
        />
      ) : (
        <div className="space-y-4">
          {orderedFunnels.map((f) => {
            const sts = statusesByFunnel.get(f.id) ?? []
            return (
              <Card key={f.id}>
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3">
                    <GitBranch size={16} className="text-muted-foreground" />
                    <h2 className="font-semibold">{f.name}</h2>
                  </div>
                  {sts.length === 0 ? (
                    <p className="text-sm text-muted-foreground italic">Nenhuma etapa neste fluxo.</p>
                  ) : (
                    <div className="space-y-2">
                      {sts.map((s) => {
                        const agent = agentsByStatus.get(s.id)
                        return (
                          <div
                            key={s.id}
                            className="flex flex-col gap-2 rounded-md border p-3 sm:flex-row sm:items-center sm:justify-between"
                          >
                            <div className="min-w-0">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="font-medium">{s.name}</span>
                                {agent ? (
                                  <>
                                    <Badge variant="info" className="gap-1">
                                      <Bot size={12} /> {agent.name}
                                    </Badge>
                                    <Badge variant="secondary" className="text-[10px]">
                                      {AGENT_KIND_LABELS[agent.agent_kind ?? "ask"]}
                                    </Badge>
                                    {!agent.is_active && <Badge variant="secondary">inativo</Badge>}
                                  </>
                                ) : (
                                  <span className="text-xs text-muted-foreground">Sem agente</span>
                                )}
                              </div>
                              {agent && (
                                <p className="text-xs text-muted-foreground mt-1 truncate">
                                  Agente {agent.agent_id} · {agent.usuario}
                                  {!agent.gateway_client_id && (
                                    <span className="text-destructive ml-1">· falta X-Client-ID</span>
                                  )}
                                  {agent.gateway_client_id && !agent.has_gateway_client_secret && (
                                    <span className="text-destructive ml-1">· falta X-Client-Secret</span>
                                  )}
                                </p>
                              )}
                            </div>
                            <div className="flex items-center gap-1 shrink-0">
                              {agent ? (
                                <>
                                  <Button type="button" variant="outline" size="sm" className="h-8 gap-1" onClick={() => openEdit(agent, s)}>
                                    <Pencil size={13} /> Editar
                                  </Button>
                                  <Button
                                    type="button"
                                    variant="ghost"
                                    size="icon"
                                    className="h-8 w-8"
                                    onClick={async () => {
                                      if (!confirm(`Remover o agente "${agent.name}" da etapa "${s.name}"?`)) return
                                      await projetosApi.deleteStageAgent(agent.id)
                                      toast.success("Agente removido.")
                                      await refresh(projectId)
                                    }}
                                  >
                                    <Trash2 size={14} />
                                  </Button>
                                </>
                              ) : (
                                <Button type="button" variant="outline" size="sm" className="h-8 gap-1" onClick={() => openCreate(s)}>
                                  <Plus size={13} /> Vincular agente
                                </Button>
                              )}
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  )}
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {editing ? "Editar agente" : "Vincular agente"}
              {targetStatus && <span className="block text-sm font-normal text-muted-foreground mt-1">Etapa: {targetStatus.name}</span>}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-1">
              <Label>Tipo de agente</Label>
              <Select
                value={form.agent_kind}
                onValueChange={(v) => {
                  const kind = v as ProjectStageAgentKind
                  setForm((f) => ({
                    ...f,
                    agent_kind: kind,
                    prompt_template:
                      kind === "classify_and_advance" && (!f.prompt_template || f.prompt_template === DEFAULT_PROMPT)
                        ? DEFAULT_CLASSIFY_PROMPT
                        : f.prompt_template,
                  }))
                }}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="classify_and_advance">Classificação (matriz Impacto × Esforço + avançar)</SelectItem>
                  <SelectItem value="ask">Pergunta livre ao IDCortex</SelectItem>
                </SelectContent>
              </Select>
              {form.agent_kind === "classify_and_advance" && (
                <p className="text-[11px] text-muted-foreground">
                  Lê todos os dados do card, classifica na matriz e move automaticamente para a próxima raia do funil.
                </p>
              )}
            </div>
            <div className="space-y-1">
              <Label>Nome (identificação interna)</Label>
              <Input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} placeholder="Ex.: Triagem automática" />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>ID do agente (IDCortex)</Label>
                <p className="text-[11px] text-muted-foreground">Body → id_agente</p>
                <Input value={form.agent_id} onChange={(e) => setForm((f) => ({ ...f, agent_id: e.target.value }))} placeholder="asst_..." />
              </div>
              <div className="space-y-1">
                <Label>E-mail do usuário</Label>
                <p className="text-[11px] text-muted-foreground">Body → usuario</p>
                <Input type="email" value={form.usuario} onChange={(e) => setForm((f) => ({ ...f, usuario: e.target.value }))} />
              </div>
            </div>

            <div className="rounded-md border p-3 space-y-3 bg-muted/20">
              <p className="text-sm font-medium">Credenciais do gateway IDCortex</p>
              <p className="text-[11px] text-muted-foreground">
                Fornecidas pelo time IDCortex. Enviadas nos headers de cada chamada ao gateway.
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label>X-Client-ID</Label>
                  <p className="text-[11px] text-muted-foreground">Header → X-Client-ID</p>
                  <Input
                    value={form.gateway_client_id}
                    onChange={(e) => setForm((f) => ({ ...f, gateway_client_id: e.target.value }))}
                    placeholder="Client ID do gateway"
                    autoComplete="off"
                  />
                </div>
                <div className="space-y-1">
                  <Label>X-Client-Secret</Label>
                  <p className="text-[11px] text-muted-foreground">Header → X-Client-Secret</p>
                  <Input
                    type="password"
                    value={form.gateway_client_secret}
                    onChange={(e) => setForm((f) => ({ ...f, gateway_client_secret: e.target.value }))}
                    placeholder={
                      editing?.has_gateway_client_secret && editing.gateway_client_id
                        ? "•••••• (deixe vazio para manter)"
                        : "Client Secret do gateway"
                    }
                    autoComplete="new-password"
                  />
                </div>
              </div>
            </div>

            <details className="rounded-md border p-3 text-sm">
              <summary className="cursor-pointer font-medium">URL do gateway (opcional)</summary>
              <p className="text-xs text-muted-foreground mt-2 mb-2">
                Padrão: https://idcortex-dev.sistemafiea.com.br/gateway/ask (ou IDCORTEX_GATEWAY_URL no .env)
              </p>
              <Input value={form.gateway_url} onChange={(e) => setForm((f) => ({ ...f, gateway_url: e.target.value }))} placeholder="https://.../gateway/ask" />
            </details>

            <div className="space-y-1">
              <Label>Prompt (mensagem enviada ao agente)</Label>
              <Textarea
                rows={8}
                value={form.prompt_template}
                onChange={(e) => setForm((f) => ({ ...f, prompt_template: e.target.value }))}
                className="font-mono text-xs"
              />
              <p className="text-[11px] text-muted-foreground">
                {form.agent_kind === "classify_and_advance"
                  ? "Placeholders: {{task_context}}, {{priority_rubric}}, {{title}}, {{description}}, {{task_id}}"
                  : "Placeholders: {{title}}, {{description}}, {{task_id}}, {{form_values}}"}
              </p>
            </div>
            <div className="flex flex-col gap-3 pt-1">
              <label className="flex items-center justify-between gap-2 text-sm">
                <span>Continuar thread (reutilizar conversa anterior neste card)</span>
                <Switch checked={form.continue_thread} onCheckedChange={(v) => setForm((f) => ({ ...f, continue_thread: v }))} />
              </label>
              <label className="flex items-center justify-between gap-2 text-sm">
                <span>Registrar resposta como comentário no card</span>
                <Switch checked={form.add_comment_on_success} onCheckedChange={(v) => setForm((f) => ({ ...f, add_comment_on_success: v }))} />
              </label>
              <label className="flex items-center justify-between gap-2 text-sm">
                <span>Agente ativo</span>
                <Switch checked={form.is_active} onCheckedChange={(v) => setForm((f) => ({ ...f, is_active: v }))} />
              </label>
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>Cancelar</Button>
            <Button type="button" onClick={() => void handleSave()} disabled={saving}>
              {saving && <Loader2 size={14} className="animate-spin mr-1.5" />}
              Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
