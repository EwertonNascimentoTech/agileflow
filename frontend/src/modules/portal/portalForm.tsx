import type { ReactNode } from "react"
import { CheckCircle2, type LucideIcon } from "lucide-react"

import { Card } from "@/modules/portal/portfolioUi"

// Peças dos formulários do Portal (abrir ocorrência, pedir solução com IA): etapas em cartões,
// progresso das etapas, opções em cartões e resumo lateral.

export type Choice<T extends string> = { value: T; label: string; desc?: string; icon?: LucideIcon }

/** Opções em cartões (rádio). Ícone e descrição são opcionais. */
export function ChoiceCards<T extends string>({
  name,
  value,
  choices,
  onChange,
  invalid,
  columns = 3,
}: {
  name: string
  value: T | null
  choices: Choice<T>[]
  onChange: (v: T) => void
  invalid?: boolean
  columns?: 2 | 3
}) {
  return (
    <div role="radiogroup" aria-label={name} className={`grid gap-3 ${columns === 2 ? "sm:grid-cols-2" : "sm:grid-cols-3"}`}>
      {choices.map((c) => {
        const Icon = c.icon
        const selected = value === c.value
        return (
          <label
            key={c.value}
            className={`relative flex cursor-pointer items-start gap-3 rounded-xl border bg-card p-4 text-sm transition-colors focus-within:ring-2 focus-within:ring-ring ${
              selected
                ? "border-primary bg-primary/5 ring-1 ring-primary"
                : invalid
                  ? "border-destructive/60 hover:bg-muted/40"
                  : "hover:border-primary/40 hover:bg-muted/30"
            }`}
          >
            <input type="radio" name={name} className="sr-only" checked={selected} onChange={() => onChange(c.value)} />
            {Icon && (
              <span
                className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${
                  selected ? "bg-primary text-primary-foreground" : "bg-primary/10 text-primary"
                }`}
              >
                <Icon size={19} />
              </span>
            )}
            <span className="min-w-0 pr-5">
              <span className={`block font-semibold ${selected ? "text-primary" : ""}`}>{c.label}</span>
              {c.desc && <span className="block text-muted-foreground">{c.desc}</span>}
            </span>
            {selected && <CheckCircle2 size={18} className="absolute right-3 top-3 text-primary" aria-hidden />}
          </label>
        )
      })}
    </div>
  )
}

/** Etapa do formulário: cartão com número, título e dica (vira check verde quando pronta). */
export function FormSection({
  id,
  n,
  title,
  hint,
  done,
  optional = false,
  children,
}: {
  id: string
  n: number
  title: string
  hint: string
  done: boolean
  optional?: boolean
  children: ReactNode
}) {
  return (
    <Card>
      <section id={id} aria-labelledby={`${id}-title`} className="scroll-mt-24">
        <div className="flex items-start gap-3 border-b px-5 py-4">
          <span
            className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-semibold ${
              done ? "bg-emerald-500 text-white" : "bg-primary text-primary-foreground"
            }`}
            aria-hidden
          >
            {done ? <CheckCircle2 size={16} /> : n}
          </span>
          <div className="min-w-0 flex-1">
            <h2 id={`${id}-title`} className="text-lg font-semibold leading-8">
              {title}
              {optional && <span className="ml-2 text-sm font-normal text-muted-foreground">(opcional)</span>}
            </h2>
            <p className="text-sm text-muted-foreground">{hint}</p>
          </div>
        </div>
        <div className="space-y-5 p-5">{children}</div>
      </section>
    </Card>
  )
}

export type FormStep = { id: string; label: string; done: boolean; optional?: boolean }

/** Progresso das etapas no topo do formulário; clicar leva à etapa. */
export function StepProgress({ steps }: { steps: FormStep[] }) {
  return (
    <Card className="p-4">
      <ol className={`grid grid-cols-2 gap-3 ${steps.length >= 4 ? "md:grid-cols-4" : "md:grid-cols-3"}`}>
        {steps.map((s, i) => (
          <li key={s.id}>
            <button
              type="button"
              onClick={() => document.getElementById(s.id)?.scrollIntoView({ behavior: "smooth", block: "start" })}
              className="flex w-full items-center gap-3 rounded-xl px-2 py-1.5 text-left transition-colors hover:bg-muted/60"
            >
              <span
                className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-semibold ${
                  s.done ? "bg-emerald-500 text-white" : "border-2 border-border text-muted-foreground"
                }`}
              >
                {s.done ? <CheckCircle2 size={16} /> : i + 1}
              </span>
              <span className="min-w-0">
                <span className="block truncate text-sm font-medium">{s.label}</span>
                <span className="block text-xs text-muted-foreground">{s.done ? "Pronto" : s.optional ? "Opcional" : "A preencher"}</span>
              </span>
            </button>
          </li>
        ))}
      </ol>
    </Card>
  )
}

export function Req() {
  return <span className="text-destructive" aria-hidden> *</span>
}

export function FieldError({ show, children }: { show: boolean; children: ReactNode }) {
  if (!show) return null
  return <p className="text-sm text-destructive">{children}</p>
}

export function SummaryRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-3 py-2.5 text-sm">
      <dt className="shrink-0 text-muted-foreground">{label}</dt>
      <dd className="min-w-0 text-right font-medium">{children}</dd>
    </div>
  )
}

/** Cartão lateral numerado ("Como funciona"). */
export function HowItWorks({ title = "Como funciona", items }: { title?: string; items: [string, string][] }) {
  return (
    <Card>
      <div className="border-b px-5 py-4">
        <h2 className="text-lg font-semibold">{title}</h2>
      </div>
      <ol className="space-y-3 p-5 text-sm">
        {items.map(([t, d], i) => (
          <li key={t} className="flex gap-3">
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
              {i + 1}
            </span>
            <span>
              <span className="block font-medium leading-7">{t}</span>
              <span className="block text-muted-foreground">{d}</span>
            </span>
          </li>
        ))}
      </ol>
    </Card>
  )
}
