import { Check, Info, ShieldAlert, ShieldCheck, Sparkles, Wand2, type LucideIcon } from "lucide-react"

import type { AiSolutionFormField } from "@/api/clientes"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { ChoiceCards, FieldError, Req, type Choice } from "@/modules/portal/portalForm"
import { AI_TRACK } from "@/modules/portal/aiSolutionRules"

export function AiSolutionStepper({ stageKey }: { stageKey: string | null }) {
  const current = Math.max(0, AI_TRACK.findIndex((s) => s.keys.includes(stageKey ?? "")))
  const lastDone = stageKey === "producao"
  return (
    <ol className="flex w-full items-start">
      {AI_TRACK.map((step, i) => {
        const done = i < current || (lastDone && i === current)
        const active = i === current && !lastDone
        const waiting = active && (stageKey === "aguardando_cliente" || stageKey === "homologacao" || stageKey === "necessita_ajustes")
        return (
          <li key={step.label} className="relative flex flex-1 flex-col items-center text-center">
            {i > 0 && (
              <span className={`absolute right-1/2 top-4 h-0.5 w-full -translate-y-1/2 ${i <= current ? "bg-primary" : "bg-border"}`} aria-hidden />
            )}
            <span
              className={`relative z-10 flex h-8 w-8 items-center justify-center rounded-full border-2 text-xs font-semibold ${
                done
                  ? "border-primary bg-primary text-primary-foreground"
                  : waiting
                    ? "border-amber-500 bg-amber-50 text-amber-700 dark:bg-amber-950"
                    : active
                      ? "border-primary bg-background text-primary"
                      : "border-border bg-background text-muted-foreground"
              }`}
            >
              {done ? <Check size={15} strokeWidth={3} /> : i + 1}
            </span>
            <span className={`mt-2 px-0.5 text-[11px] leading-tight sm:text-sm ${active || done ? "font-medium text-foreground" : "text-muted-foreground"}`}>
              {step.label}
            </span>
            {waiting && <span className="mt-0.5 text-xs font-medium text-amber-700 dark:text-amber-300">com você</span>}
          </li>
        )
      })}
    </ol>
  )
}

const WITH_CLIENT = new Set(["aguardando_cliente", "homologacao", "necessita_ajustes"])

/** Selo da etapa no padrão do Portal (fundo claro, anel e bolinha). */
export function AiStageBadge({
  stageKey,
  name,
  isClosed,
  size = "sm",
}: {
  stageKey: string | null
  name: string | null
  isClosed: boolean
  size?: "sm" | "lg"
}) {
  const tone =
    stageKey === "producao"
      ? "bg-emerald-50 text-emerald-700 ring-emerald-200 dark:bg-emerald-950/60 dark:text-emerald-300 dark:ring-emerald-800"
      : isClosed
        ? "bg-slate-100 text-slate-600 ring-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:ring-slate-700"
        : WITH_CLIENT.has(stageKey ?? "")
          ? "bg-amber-50 text-amber-800 ring-amber-200 dark:bg-amber-950/60 dark:text-amber-300 dark:ring-amber-800"
          : "bg-sky-50 text-sky-700 ring-sky-200 dark:bg-sky-950/60 dark:text-sky-300 dark:ring-sky-800"
  const dot =
    stageKey === "producao" ? "bg-emerald-500" : isClosed ? "bg-slate-400" : WITH_CLIENT.has(stageKey ?? "") ? "bg-amber-500" : "bg-sky-500"
  return (
    <span
      className={`inline-flex max-w-full items-center gap-1.5 whitespace-nowrap rounded-md font-medium ring-1 ring-inset ${
        size === "lg" ? "px-2.5 py-0.5 text-sm" : "px-2 py-0.5 text-xs"
      } ${tone}`}
      title={name ?? undefined}
    >
      <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${dot}`} aria-hidden />
      <span className="truncate">{name ?? "—"}</span>
    </span>
  )
}

/** "Passo 3 de 8 · Seu desenvolvimento" com barra (encerrada sem produção = "Encerrada"). */
export function AiProgress({ stageKey, isClosed }: { stageKey: string | null; isClosed: boolean }) {
  const idx = AI_TRACK.findIndex((s) => s.keys.includes(stageKey ?? ""))
  if (idx < 0 || (isClosed && stageKey !== "producao")) {
    return <span className="text-sm text-muted-foreground">{isClosed ? "Encerrada" : "—"}</span>
  }
  const done = stageKey === "producao" ? AI_TRACK.length : idx + 1
  const pct = Math.round((100 * done) / AI_TRACK.length)
  return (
    <div className="min-w-0">
      <div className="flex items-center gap-2">
        <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted dark:bg-white/10">
          <div className={`h-full rounded-full ${stageKey === "producao" ? "bg-emerald-500" : "bg-primary"}`} style={{ width: `${pct}%` }} />
        </div>
        <span className="shrink-0 text-xs tabular-nums text-muted-foreground">{done}/{AI_TRACK.length}</span>
      </div>
      <p className="mt-1 truncate text-xs text-muted-foreground">{AI_TRACK[idx].label}</p>
    </div>
  )
}

export function AiSolutionFieldInput({
  field,
  value,
  onChange,
}: {
  field: AiSolutionFormField
  value: string
  onChange: (v: string) => void
}) {
  if (field.field_type === "text_long") {
    return <Textarea rows={3} value={value} onChange={(e) => onChange(e.target.value)} placeholder={field.placeholder ?? ""} />
  }
  if (field.field_type === "select") {
    return (
      <Select value={value || undefined} onValueChange={onChange}>
        <SelectTrigger><SelectValue placeholder="Selecionar" /></SelectTrigger>
        <SelectContent>
          {field.options.map((o) => (
            <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
          ))}
        </SelectContent>
      </Select>
    )
  }
  return <Input value={value} onChange={(e) => onChange(e.target.value)} placeholder={field.placeholder ?? ""} />
}

/** Dica no campo quando o formulário não traz uma. */
const HINTS: Record<string, string> = {
  objetivo: "O que a solução vai fazer, em poucas frases.",
  problema: "Qual dor, retrabalho ou risco ela resolve hoje?",
  publico: "Quem vai usar (área, cargo) e quantas pessoas, aproximadamente.",
  funcionalidades: "As principais telas ou ações, uma por linha.",
  dados_envolvidos: "Que informações a solução lê ou grava (ex.: planilhas, cadastros, sistemas).",
  plataforma_outra: "Nome da ferramenta",
}

/** Ícone e descrição das opções conhecidas (as demais aparecem só com o rótulo). */
const CHOICE_META: Record<string, Record<string, { icon: LucideIcon; desc: string }>> = {
  dados_pessoais: {
    Sim: { icon: ShieldAlert, desc: "Nomes, CPF, e-mails, dados de saúde ou de colaboradores." },
    Não: { icon: ShieldCheck, desc: "Só dados institucionais ou anônimos." },
  },
  plataforma: {
    Base44: { icon: Sparkles, desc: "Ferramenta autorizada pela TI." },
    Outra: { icon: Wand2, desc: "Informe qual; a TI avalia se pode ser usada." },
  },
}

/** Campo do pedido no padrão dos formulários do Portal (pedido novo e "ajustar pedido"):
 *  select curto vira cartões; texto longo, área de texto; o resto, campo simples. */
export function AiFieldEditor({
  field,
  value,
  onChange,
  required,
  invalid,
}: {
  field: AiSolutionFormField
  value: string
  onChange: (v: string) => void
  required: boolean
  invalid: boolean
}) {
  const f = field
  const cards = f.field_type === "select" && f.options.length <= 4
  const placeholder = f.placeholder ?? HINTS[f.key] ?? ""
  let input
  if (cards) {
    const meta = CHOICE_META[f.key] ?? {}
    const choices: Choice<string>[] = f.options.map((o) => ({ value: o.value, label: o.label, icon: meta[o.value]?.icon, desc: meta[o.value]?.desc }))
    input = <ChoiceCards name={f.label} value={value || null} choices={choices} onChange={onChange} invalid={invalid} columns={2} />
  } else if (f.field_type === "text_long") {
    input = (
      <Textarea id={`ai-input-${f.key}`} rows={3} value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder}
        aria-invalid={invalid} className={invalid ? "border-destructive" : ""} />
    )
  } else if (f.field_type === "text" || f.field_type === "url") {
    input = (
      <Input id={`ai-input-${f.key}`} value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder}
        aria-invalid={invalid} className={`h-10 ${invalid ? "border-destructive" : ""}`} />
    )
  } else {
    input = <AiSolutionFieldInput field={f} value={value} onChange={onChange} />
  }
  return (
    <div id={`ai-field-${f.key}`} className="scroll-mt-24 space-y-1.5">
      <Label htmlFor={cards ? undefined : `ai-input-${f.key}`}>
        {f.label}
        {required && <Req />}
      </Label>
      {input}
      <FieldError show={invalid}>Preencha este campo.</FieldError>
      {f.key === "dados_pessoais" && value === "Sim" && (
        <p className="flex items-start gap-2 rounded-xl bg-muted/60 px-4 py-3 text-sm text-muted-foreground">
          <Info size={15} className="mt-0.5 shrink-0" />
          Os dados usados são avaliados na análise, e a solução passa pela Segurança da Informação antes de ir para produção.
        </p>
      )}
    </div>
  )
}
