import type { AiSolutionFormField } from "@/api/clientes"

// Regras de tela de Soluções com IA (sem componentes — ficam em aiSolutionUi.tsx).

export function missingAiFields(fields: AiSolutionFormField[], values: Record<string, string>): string[] {
  const out = fields.filter((f) => f.required && !(values[f.key] ?? "").trim()).map((f) => f.label)
  if (values.plataforma === "Outra" && !(values.plataforma_outra ?? "").trim()) out.push("Qual ferramenta?")
  return out
}

export function aiStageTone(stageKey: string | null, isClosed: boolean): string {
  if (stageKey === "producao") return "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200"
  if (isClosed) return "bg-muted text-muted-foreground"
  if (stageKey === "aguardando_cliente" || stageKey === "homologacao" || stageKey === "necessita_ajustes") {
    return "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-200"
  }
  return "bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-200"
}

export const CLIENT_ACTION_HINT: Record<string, string> = {
  ajustar: "A TI pediu ajustes no pedido. Corrija e reenvie.",
  versao: "Aprovada! Construa a solução na ferramenta autorizada e avise quando tiver uma versão funcional.",
  homologar: "Valide a solução no ambiente de homologação e aprove ou reprove.",
}

/** Nome sem o código na frente ("IA-0001 · …"), que a tela já mostra à parte. */
export function aiTitle(s: { title: string; code_label: string }): string {
  const t = s.title ?? ""
  return t.startsWith(s.code_label) ? t.slice(s.code_label.length).replace(/^\s*[·\-–—:]\s*/, "") || t : t
}

/** Linha do tempo do cliente: as 11 raias do kanban agrupadas em 8 passos. */
export const AI_TRACK: { label: string; keys: string[] }[] = [
  { label: "Solicitação", keys: ["solicitacao"] },
  { label: "Análise", keys: ["analise", "necessita_ajustes"] },
  { label: "Seu desenvolvimento", keys: ["aguardando_cliente"] },
  { label: "Apresentação", keys: ["apresentacao"] },
  { label: "Adequação pela TI", keys: ["adequacao", "devops_hml"] },
  { label: "Sua homologação", keys: ["homologacao"] },
  { label: "Segurança e publicação", keys: ["seguranca", "liberacao", "devops_prod"] },
  { label: "Em produção", keys: ["producao"] },
]

/** Passo da jornada (1..8) da etapa; null para Não Aprovado/Cancelado. */
export function aiStep(stageKey: string | null): { n: number; total: number; label: string } | null {
  const idx = AI_TRACK.findIndex((s) => s.keys.includes(stageKey ?? ""))
  if (idx < 0) return null
  return { n: idx + 1, total: AI_TRACK.length, label: AI_TRACK[idx].label }
}

/** O que acontece agora, quando a vez é da TI. */
export function aiStageHint(stageKey: string | null): string {
  switch (stageKey) {
    case "solicitacao":
      return "Pedido recebido. Ele segue para a análise da coordenação."
    case "analise":
      return "A coordenação está analisando o pedido. Você recebe a resposta por aqui."
    case "apresentacao":
      return "A versão funcional será apresentada à coordenação e ao PO."
    case "adequacao":
    case "devops_hml":
      return "A TI está adequando o código e preparando o ambiente de homologação."
    case "seguranca":
    case "liberacao":
    case "devops_prod":
      return "Segurança da Informação e publicação em produção."
    default:
      return ""
  }
}
