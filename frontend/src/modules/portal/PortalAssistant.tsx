import { Fragment, useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from "react"
import { Link, useLocation } from "react-router-dom"
import { FolderKanban, Layers, Loader2, MessageCircle, RotateCcw, SendHorizontal, Sparkles, X } from "lucide-react"

import {
  portalAssistantApi,
  type PortalAssistantSource,
  type PortalAssistantTurn,
} from "@/api/portalPortfolio"
import { apiErrorDetail } from "@/modules/portal/occurrenceUi"
import { usePortalBase } from "@/modules/portal/portfolioMeta"

interface Message {
  id: number
  role: "user" | "assistant"
  content: string
  sources?: PortalAssistantSource[]
  error?: boolean
}

const UUID = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}"

/** Projeto/programa aberto na tela (o assistente dá prioridade a ele). */
function pageFocus(pathname: string, base: string): { project_id?: string; program_id?: string } {
  const rest = pathname.startsWith(base) ? pathname.slice(base.length) : ""
  const project = new RegExp(`^/projetos/(${UUID})`, "i").exec(rest)
  if (project) return { project_id: project[1] }
  const program = new RegExp(`^/programas/(${UUID})`, "i").exec(rest)
  if (program) return { program_id: program[1] }
  return {}
}

function suggestionsFor(focus: { project_id?: string; program_id?: string }): string[] {
  if (focus.project_id) {
    return [
      "Qual o próximo marco deste projeto?",
      "Tem alguma entrega atrasada neste projeto?",
      "Quando este projeto deve terminar?",
    ]
  }
  if (focus.program_id) {
    return [
      "Como está a saúde deste programa?",
      "Quais projetos deste programa estão críticos?",
      "Quanto o programa evoluiu no último mês?",
    ]
  }
  return [
    "Quais projetos estão críticos ou em atenção?",
    "O que está previsto para os próximos 30 dias?",
    "O que foi entregue nas últimas semanas?",
  ]
}

/** Negrito (**texto**) dentro de uma linha — sem HTML vindo da resposta. */
function inline(text: string): ReactNode {
  const parts = text.split(/(\*\*[^*]+\*\*)/g)
  return parts.map((p, i) =>
    p.startsWith("**") && p.endsWith("**") && p.length > 4 ? (
      <strong key={i} className="font-semibold">{p.slice(2, -2)}</strong>
    ) : (
      <Fragment key={i}>{p}</Fragment>
    ),
  )
}

const BULLET = /^\s*(?:[-*•]|\d+[.)])\s+/

/** Markdown mínimo da resposta: parágrafos, listas e negrito. */
function RichText({ text }: { text: string }) {
  const blocks: { list: boolean; ordered: boolean; lines: string[] }[] = []
  for (const raw of text.split("\n")) {
    const line = raw.replace(/^#{1,6}\s+/, "").trimEnd()
    if (!line.trim()) {
      blocks.push({ list: false, ordered: false, lines: [] })
      continue
    }
    const isItem = BULLET.test(line)
    const last = blocks[blocks.length - 1]
    if (last && last.lines.length > 0 && last.list === isItem) {
      last.lines.push(line)
    } else {
      blocks.push({ list: isItem, ordered: isItem && /^\s*\d/.test(line), lines: [line] })
    }
  }
  return (
    <div className="space-y-2">
      {blocks.filter((b) => b.lines.length > 0).map((b, i) =>
        b.list ? (
          b.ordered ? (
            <ol key={i} className="list-decimal space-y-1 pl-5">
              {b.lines.map((l, j) => <li key={j}>{inline(l.replace(BULLET, ""))}</li>)}
            </ol>
          ) : (
            <ul key={i} className="list-disc space-y-1 pl-5">
              {b.lines.map((l, j) => <li key={j}>{inline(l.replace(BULLET, ""))}</li>)}
            </ul>
          )
        ) : (
          <p key={i}>
            {b.lines.map((l, j) => (
              <Fragment key={j}>
                {j > 0 && <br />}
                {inline(l)}
              </Fragment>
            ))}
          </p>
        ),
      )}
    </div>
  )
}

function SourceChips({ sources, base }: { sources: PortalAssistantSource[]; base: string }) {
  return (
    <div className="mt-2 flex flex-wrap gap-1.5">
      {sources.map((s) => {
        const Icon = s.kind === "programa" ? Layers : FolderKanban
        const to = `${base}/${s.kind === "programa" ? "programas" : "projetos"}/${s.id}`
        return (
          <Link
            key={`${s.kind}-${s.id}`}
            to={to}
            className="inline-flex max-w-full items-center gap-1 rounded-full border bg-background px-2 py-0.5 text-xs text-muted-foreground hover:border-primary/50 hover:text-foreground"
            title={s.title}
          >
            <Icon size={12} className="shrink-0" />
            <span className="truncate">{s.title}</span>
          </Link>
        )
      })}
    </div>
  )
}

/** Chat do Portal: perguntas sobre programas, projetos, entregas e prazos que a pessoa vê.
 *  A conversa fica só no navegador (some ao recarregar); a IA recebe os dados anonimizados. */
export function PortalAssistant() {
  const base = usePortalBase()
  const { pathname } = useLocation()
  const focus = pageFocus(pathname, base)
  const [open, setOpen] = useState(false)
  const [messages, setMessages] = useState<Message[]>([])
  const [draft, setDraft] = useState("")
  const [busy, setBusy] = useState(false)
  const nextId = useRef(1)
  const scrollRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    if (open) inputRef.current?.focus()
  }, [open])

  useEffect(() => {
    const el = scrollRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [messages, busy, open])

  useEffect(() => {
    if (!open) return
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false)
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [open])

  async function send(text: string) {
    const question = text.trim()
    if (!question || busy) return
    const history: PortalAssistantTurn[] = messages
      .filter((m) => !m.error)
      .slice(-8)
      .map((m) => ({ role: m.role, content: m.content.slice(0, 4000) }))
    setMessages((ms) => [...ms, { id: nextId.current++, role: "user", content: question }])
    setDraft("")
    setBusy(true)
    try {
      const r = await portalAssistantApi.ask({ question: question.slice(0, 1000), history, ...focus })
      setMessages((ms) => [...ms, { id: nextId.current++, role: "assistant", content: r.answer, sources: r.sources }])
    } catch (err) {
      setMessages((ms) => [
        ...ms,
        {
          id: nextId.current++,
          role: "assistant",
          content: apiErrorDetail(err, "Não consegui responder agora. Tente de novo em instantes."),
          error: true,
        },
      ])
    } finally {
      setBusy(false)
      inputRef.current?.focus()
    }
  }

  function retry() {
    const lastQuestion = [...messages].reverse().find((m) => m.role === "user")
    if (!lastQuestion) return
    setMessages((ms) => {
      const cut = ms.map((m) => m.id).lastIndexOf(lastQuestion.id)
      return ms.slice(0, cut)
    })
    void send(lastQuestion.content)
  }

  function onKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault()
      void send(draft)
    }
  }

  const lastIsError = messages.length > 0 && messages[messages.length - 1].error

  return (
    <div className="print:hidden">
      {open && (
        <section
          role="dialog"
          aria-label="Assistente do Portal"
          className="fixed inset-x-3 bottom-24 z-50 flex h-[min(640px,calc(100dvh-8rem))] flex-col overflow-hidden rounded-2xl border bg-background shadow-2xl sm:inset-x-auto sm:right-6 sm:w-[420px]"
        >
          <header className="flex items-center gap-3 border-b bg-primary/5 px-4 py-3">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground">
              <Sparkles size={18} />
            </span>
            <div className="min-w-0 flex-1">
              <h2 className="text-sm font-semibold leading-tight">Assistente do Portal</h2>
              <p className="truncate text-xs text-muted-foreground">Programas, projetos, entregas e prazos</p>
            </div>
            {messages.length > 0 && (
              <button
                type="button"
                onClick={() => setMessages([])}
                disabled={busy}
                className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-50"
                title="Nova conversa"
                aria-label="Nova conversa"
              >
                <RotateCcw size={16} />
              </button>
            )}
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
              title="Fechar"
              aria-label="Fechar assistente"
            >
              <X size={16} />
            </button>
          </header>

          <div ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto px-4 py-4 text-sm" aria-live="polite">
            {messages.length === 0 && (
              <div className="space-y-3">
                <div className="rounded-2xl rounded-tl-sm bg-muted px-3.5 py-2.5">
                  Olá! Posso responder sobre os programas e projetos que você acompanha: andamento, saúde, fases,
                  próximos marcos, entregas e datas.
                </div>
                <p className="text-xs font-medium text-muted-foreground">Experimente perguntar</p>
                <div className="flex flex-col items-start gap-2">
                  {suggestionsFor(focus).map((s) => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => void send(s)}
                      className="rounded-full border bg-background px-3 py-1.5 text-left text-xs hover:border-primary/50 hover:bg-primary/5"
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {messages.map((m) =>
              m.role === "user" ? (
                <div key={m.id} className="flex justify-end">
                  <div className="max-w-[85%] whitespace-pre-wrap break-words rounded-2xl rounded-tr-sm bg-primary px-3.5 py-2.5 text-primary-foreground">
                    {m.content}
                  </div>
                </div>
              ) : (
                <div key={m.id} className="max-w-[92%]">
                  <div
                    className={`break-words rounded-2xl rounded-tl-sm px-3.5 py-2.5 ${
                      m.error ? "bg-destructive/10 text-destructive" : "bg-muted"
                    }`}
                  >
                    {m.error ? m.content : <RichText text={m.content} />}
                  </div>
                  {m.sources && m.sources.length > 0 && <SourceChips sources={m.sources} base={base} />}
                </div>
              ),
            )}

            {busy && (
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Loader2 size={14} className="animate-spin" />
                Consultando seus projetos…
              </div>
            )}
            {lastIsError && !busy && (
              <button type="button" onClick={retry} className="text-xs font-medium text-primary hover:underline">
                Tentar de novo
              </button>
            )}
          </div>

          <footer className="border-t px-3 pb-2 pt-3">
            <div className="flex items-end gap-2 rounded-xl border bg-background px-3 py-2 focus-within:border-primary/60 focus-within:ring-2 focus-within:ring-primary/15">
              <textarea
                ref={inputRef}
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={onKeyDown}
                rows={1}
                maxLength={1000}
                placeholder="Pergunte sobre seus projetos…"
                aria-label="Pergunta"
                className="max-h-28 min-h-[24px] flex-1 resize-none bg-transparent text-sm outline-none placeholder:text-muted-foreground [field-sizing:content]"
              />
              <button
                type="button"
                onClick={() => void send(draft)}
                disabled={busy || !draft.trim()}
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground disabled:opacity-40"
                aria-label="Enviar pergunta"
                title="Enviar"
              >
                <SendHorizontal size={16} />
              </button>
            </div>
            <p className="mt-1.5 px-1 text-[11px] leading-snug text-muted-foreground">
              Usa só o que você vê no Portal. Nomes de pessoas são anonimizados antes de ir para a IA; confira datas
              importantes na tela do projeto.
            </p>
          </footer>
        </section>
      )}

      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="fixed bottom-6 right-6 z-50 flex h-14 w-14 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg ring-4 ring-primary/15 transition hover:scale-105 hover:shadow-xl"
        aria-label={open ? "Fechar assistente" : "Abrir assistente do Portal"}
        aria-expanded={open}
        title={open ? "Fechar assistente" : "Perguntar ao assistente"}
      >
        {open ? <X size={22} /> : <MessageCircle size={24} />}
      </button>
    </div>
  )
}
