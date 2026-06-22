import { useCallback, useEffect, useMemo, useState } from "react"
import { Eye, Loader2, RefreshCw, ScrollText } from "lucide-react"

import {
  projetosApi,
  type ProjectAgentExecutionLogItem,
  type ProjectStageAgentBinding,
  type ProjectStageAgentKind,
} from "@/api/projetos"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Skeleton } from "@/components/ui/skeleton"
import { EmptyState } from "@/components/EmptyState"

const PAGE_SIZE = 30
const ALL = "__all__"
const ALL_STATUS = "__all__"

const AGENT_KIND_LABELS: Record<ProjectStageAgentKind, string> = {
  ask: "Pergunta livre",
  classify_and_advance: "Classificação + avançar",
}

const EXEC_STATUS_LABELS: Record<string, string> = {
  pending: "Pendente",
  success: "Sucesso",
  failed: "Falha",
}

function execStatusVariant(status: string): "success" | "destructive" | "secondary" | "info" {
  if (status === "success") return "success"
  if (status === "failed") return "destructive"
  if (status === "pending") return "info"
  return "secondary"
}

function formatDateTime(value: string): string {
  return new Date(value).toLocaleString("pt-BR")
}

function truncate(text: string | null, max = 120): string {
  if (!text) return "—"
  return text.length <= max ? text : `${text.slice(0, max)}…`
}

function JsonBlock({ value }: { value: Record<string, unknown> | null }) {
  if (!value || Object.keys(value).length === 0) {
    return <p className="text-sm text-muted-foreground italic">Sem dados.</p>
  }
  return (
    <pre className="max-h-64 overflow-auto rounded-md bg-muted p-3 text-xs font-mono whitespace-pre-wrap break-all">
      {JSON.stringify(value, null, 2)}
    </pre>
  )
}

export default function ProjectAgentLogsConfigPage() {
  const [logs, setLogs] = useState<ProjectAgentExecutionLogItem[]>([])
  const [agents, setAgents] = useState<ProjectStageAgentBinding[]>([])
  const [total, setTotal] = useState(0)
  const [offset, setOffset] = useState(0)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [statusFilter, setStatusFilter] = useState(ALL_STATUS)
  const [agentFilter, setAgentFilter] = useState(ALL)
  const [detail, setDetail] = useState<ProjectAgentExecutionLogItem | null>(null)

  const load = useCallback(async (off: number, silent = false) => {
    if (silent) setRefreshing(true)
    else setLoading(true)
    try {
      const page = await projetosApi.listAgentExecutionLogs({
        limit: PAGE_SIZE,
        offset: off,
        status: statusFilter !== ALL_STATUS ? statusFilter as "pending" | "success" | "failed" : undefined,
        binding_id: agentFilter !== ALL ? agentFilter : undefined,
      })
      setLogs(page.items)
      setTotal(page.total)
      setOffset(page.offset)
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [statusFilter, agentFilter])

  useEffect(() => {
    projetosApi.listStageAgents().then(setAgents).catch(() => setAgents([]))
  }, [])

  useEffect(() => {
    void load(0)
  }, [load])

  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE))
  const currentPage = Math.floor(offset / PAGE_SIZE) + 1
  const canPrev = offset > 0
  const canNext = offset + PAGE_SIZE < total

  const agentsById = useMemo(() => {
    const m = new Map<string, ProjectStageAgentBinding>()
    for (const a of agents) m.set(a.id, a)
    return m
  }, [agents])

  return (
    <div className="w-full space-y-4 p-1">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-bold">Logs de agentes</h1>
          <p className="text-sm text-muted-foreground">
            Histórico de execuções dos agentes IDCortex vinculados às etapas do kanban.
          </p>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={refreshing}
          onClick={() => void load(offset, true)}
        >
          {refreshing ? <Loader2 size={14} className="animate-spin mr-1.5" /> : <RefreshCw size={14} className="mr-1.5" />}
          Atualizar
        </Button>
      </div>

      <Card>
        <CardContent className="p-4 flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground shrink-0">Status:</span>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL_STATUS}>Todos</SelectItem>
                <SelectItem value="success">Sucesso</SelectItem>
                <SelectItem value="failed">Falha</SelectItem>
                <SelectItem value="pending">Pendente</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-center gap-2 min-w-0">
            <span className="text-sm text-muted-foreground shrink-0">Agente:</span>
            <Select value={agentFilter} onValueChange={setAgentFilter}>
              <SelectTrigger className="w-56 max-w-full"><SelectValue placeholder="Todos" /></SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>Todos</SelectItem>
                {agents.map((a) => (
                  <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="text-sm text-muted-foreground sm:ml-auto">
            {total} registro{total !== 1 ? "s" : ""}
          </div>
        </CardContent>
      </Card>

      {loading ? (
        <Skeleton className="h-96 rounded-lg" />
      ) : logs.length === 0 ? (
        <EmptyState
          icon={ScrollText}
          title="Nenhuma execução registrada"
          description="Quando um card entrar numa etapa com agente vinculado, a execução aparecerá aqui."
        />
      ) : (
        <Card>
          <CardContent className="p-0 overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/40 text-left text-xs text-muted-foreground">
                  <th className="px-4 py-2 font-medium">Data</th>
                  <th className="px-4 py-2 font-medium">Agente</th>
                  <th className="px-4 py-2 font-medium">Etapa</th>
                  <th className="px-4 py-2 font-medium">Card</th>
                  <th className="px-4 py-2 font-medium">Status</th>
                  <th className="px-4 py-2 font-medium">Resumo</th>
                  <th className="px-4 py-2 font-medium w-12" />
                </tr>
              </thead>
              <tbody>
                {logs.map((log) => (
                  <tr key={log.id} className="border-b last:border-0 hover:bg-muted/20">
                    <td className="px-4 py-2 whitespace-nowrap text-xs">{formatDateTime(log.created_at)}</td>
                    <td className="px-4 py-2">
                      <div className="font-medium">{log.agent_name}</div>
                      <div className="text-[11px] text-muted-foreground">
                        {AGENT_KIND_LABELS[log.agent_kind] ?? log.agent_kind}
                      </div>
                    </td>
                    <td className="px-4 py-2">{log.status_name}</td>
                    <td className="px-4 py-2 max-w-[200px] truncate" title={log.task_title}>{log.task_title}</td>
                    <td className="px-4 py-2">
                      <Badge variant={execStatusVariant(log.status)} className="text-[10px]">
                        {EXEC_STATUS_LABELS[log.status] ?? log.status}
                      </Badge>
                    </td>
                    <td className="px-4 py-2 max-w-xs text-xs text-muted-foreground">
                      {log.status === "failed"
                        ? truncate(log.error_message, 100)
                        : truncate(log.answer_message, 100)}
                    </td>
                    <td className="px-4 py-2">
                      <Button type="button" variant="ghost" size="icon" className="h-8 w-8" onClick={() => setDetail(log)}>
                        <Eye size={14} />
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}

      {!loading && total > PAGE_SIZE && (
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">Página {currentPage} de {pageCount}</span>
          <div className="flex gap-2">
            <Button type="button" variant="outline" size="sm" disabled={!canPrev} onClick={() => void load(offset - PAGE_SIZE)}>
              Anterior
            </Button>
            <Button type="button" variant="outline" size="sm" disabled={!canNext} onClick={() => void load(offset + PAGE_SIZE)}>
              Próxima
            </Button>
          </div>
        </div>
      )}

      <Dialog open={!!detail} onOpenChange={(open) => !open && setDetail(null)}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          {detail && (
            <>
              <DialogHeader>
                <DialogTitle>Detalhe da execução</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 text-sm">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <p className="text-xs text-muted-foreground">Data</p>
                    <p>{formatDateTime(detail.created_at)}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Status</p>
                    <Badge variant={execStatusVariant(detail.status)}>{EXEC_STATUS_LABELS[detail.status] ?? detail.status}</Badge>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Agente</p>
                    <p>{detail.agent_name}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Etapa</p>
                    <p>{detail.status_name}</p>
                  </div>
                  <div className="col-span-2">
                    <p className="text-xs text-muted-foreground">Card</p>
                    <p>{detail.task_title}</p>
                    <p className="text-[11px] text-muted-foreground font-mono mt-0.5">{detail.task_id}</p>
                  </div>
                  {detail.thread_id && (
                    <div className="col-span-2">
                      <p className="text-xs text-muted-foreground">Thread ID</p>
                      <p className="font-mono text-xs break-all">{detail.thread_id}</p>
                    </div>
                  )}
                </div>

                {detail.error_message && (
                  <div>
                    <p className="text-xs font-medium text-destructive mb-1">Erro</p>
                    <pre className="rounded-md bg-destructive/10 p-3 text-xs whitespace-pre-wrap break-words">{detail.error_message}</pre>
                  </div>
                )}

                {detail.answer_message && (
                  <div>
                    <p className="text-xs font-medium mb-1">Resposta do agente</p>
                    <pre className="rounded-md bg-muted p-3 text-xs whitespace-pre-wrap break-words max-h-48 overflow-auto">{detail.answer_message}</pre>
                  </div>
                )}

                <div>
                  <p className="text-xs font-medium mb-1">Requisição (payload enviado ao gateway)</p>
                  <JsonBlock value={detail.request_payload} />
                </div>

                <div>
                  <p className="text-xs font-medium mb-1">Resposta completa (gateway)</p>
                  <JsonBlock value={detail.response_payload} />
                </div>

                {agentsById.get(detail.binding_id) && (
                  <p className="text-[11px] text-muted-foreground">
                    ID do agente IDCortex: {agentsById.get(detail.binding_id)?.agent_id}
                  </p>
                )}
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
