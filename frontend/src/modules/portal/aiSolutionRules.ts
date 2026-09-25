import type { AiSolutionFormField } from "@/api/clientes"

// Regras de tela de Soluções com IA (sem componentes — ficam em aiSolutionUi.tsx).

/** Campo condicional (show_if) só aparece quando o campo de referência tem o valor indicado. */
export function aiFieldShown(f: AiSolutionFormField, values: Record<string, string>): boolean {
  return !f.show_if || (values[f.show_if.field] ?? "") === f.show_if.equals
}

/** Obrigatório: marcado no formulário ou condicional visível. */
export function aiFieldRequired(f: AiSolutionFormField, values: Record<string, string>): boolean {
  return aiFieldShown(f, values) && (f.required || !!f.show_if)
}

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/

/** Campo com problema: obrigatório vazio (caixa de ciência desmarcada) ou e-mail inválido. */
export function aiFieldInvalid(f: AiSolutionFormField, values: Record<string, string>): boolean {
  if (!aiFieldShown(f, values)) return false
  const v = (values[f.key] ?? "").trim()
  if (f.field_type === "checkbox") return aiFieldRequired(f, values) && v !== "true"
  if (f.field_type === "email" && v && !EMAIL_RE.test(v)) return true
  return aiFieldRequired(f, values) && !v
}

export function missingAiFields(fields: AiSolutionFormField[], values: Record<string, string>): string[] {
  return fields
    .filter((f) => aiFieldInvalid(f, values))
    .map((f) => (f.key === "ciencia" ? "a ciência sobre o fluxo institucional" : f.label))
}

/** Valor enviado ao backend: campo oculto vai vazio. */
export function aiFieldPayload(fields: AiSolutionFormField[], values: Record<string, string>): Record<string, string | null> {
  return Object.fromEntries(fields.map((f) => [f.key, aiFieldShown(f, values) ? (values[f.key] ?? "").trim() || null : null]))
}

/** Os dois recados do fluxo institucional (mostrados no pedido e na etapa de construção). */
export const AI_INSTITUTIONAL_PATH =
  "Este é o caminho institucionalmente definido para desenvolver e prototipar soluções com IA. A área de Tecnologias Digitais não recebe soluções com IA desenvolvidas por outros meios ou fora deste fluxo."
export const AI_PROTOTYPE_NOT_RELEASE =
  "Concluir a prototipação não disponibiliza a solução: depois dela, o protótipo ainda é adequado à stack tecnológica da instituição e aos padrões de governança e de Segurança da Informação."

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
  versao: "Aprovada! Construa a solução no Base44 e avise quando tiver uma versão funcional.",
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
