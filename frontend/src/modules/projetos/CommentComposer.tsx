import { useCallback, useEffect, useRef, useState, type ReactNode } from "react"
import {
  AtSign,
  Bold,
  Code,
  Eraser,
  GitBranch,
  Hash,
  Image,
  IndentDecrease,
  IndentIncrease,
  Italic,
  Link2,
  Link2Off,
  List,
  ListOrdered,
  Loader2,
  Smile,
  Type,
  Underline,
} from "lucide-react"

import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { cn } from "@/lib/utils"

function initials(name: string): string {
  const p = name.trim().split(/\s+/).filter(Boolean)
  if (p.length === 0) return "?"
  if (p.length === 1) return p[0].slice(0, 2).toUpperCase()
  return (p[0][0] + p[p.length - 1][0]).toUpperCase()
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
}

export function sanitizeCommentHtml(html: string): string {
  return html
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, "")
    .replace(/\son\w+="[^"]*"/gi, "")
    .replace(/\son\w+='[^']*'/gi, "")
    .replace(/javascript:/gi, "")
}

export function isHtmlComment(content: string): boolean {
  return /<[a-z][\s\S]*>/i.test(content.trim())
}

export function commentHasContent(content: string): boolean {
  const trimmed = content.trim()
  if (!trimmed) return false
  if (isHtmlComment(trimmed)) {
    return trimmed.replace(/<[^>]+>/g, "").replace(/&nbsp;/gi, " ").trim().length > 0
  }
  return true
}

export function CommentBody({ content }: { content: string }) {
  if (isHtmlComment(content)) {
    return (
      <div
        className="comment-body text-sm leading-relaxed [&_a]:text-primary [&_a]:underline [&_code]:rounded [&_code]:bg-muted [&_code]:px-1 [&_ol]:list-decimal [&_ol]:pl-5 [&_ul]:list-disc [&_ul]:pl-5"
        dangerouslySetInnerHTML={{ __html: sanitizeCommentHtml(content) }}
      />
    )
  }
  return <p className="text-sm whitespace-pre-wrap leading-relaxed">{content}</p>
}

type EditorMode = "rich" | "markdown"

function ToolbarButton({
  title,
  onClick,
  children,
}: {
  title: string
  onClick: () => void
  children: ReactNode
}) {
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      className="flex h-7 w-7 shrink-0 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
    >
      {children}
    </button>
  )
}

export function CommentComposer({
  value,
  onChange,
  onSubmit,
  submitting,
  authorName,
  placeholder = "Escreva um comentário…",
}: {
  value: string
  onChange: (value: string) => void
  onSubmit: () => void
  submitting: boolean
  authorName: string
  placeholder?: string
}) {
  const editorRef = useRef<HTMLDivElement>(null)
  const [mode, setMode] = useState<EditorMode>("rich")
  const [focused, setFocused] = useState(false)

  const exec = useCallback((command: string, arg?: string) => {
    editorRef.current?.focus()
    document.execCommand(command, false, arg)
    const html = editorRef.current?.innerHTML ?? ""
    onChange(html === "<br>" ? "" : html)
  }, [onChange])

  const insertAtCursor = useCallback((text: string) => {
    editorRef.current?.focus()
    document.execCommand("insertText", false, text)
    const html = editorRef.current?.innerHTML ?? ""
    onChange(html === "<br>" ? "" : html)
  }, [onChange])

  const promptLink = useCallback(() => {
    const url = window.prompt("URL do link:")
    if (!url?.trim()) return
    exec("createLink", url.trim())
  }, [exec])

  const promptImage = useCallback(() => {
    const url = window.prompt("URL da imagem:")
    if (!url?.trim()) return
    exec("insertImage", url.trim())
  }, [exec])

  const switchMode = useCallback((next: EditorMode) => {
    if (next === mode) return
    if (next === "markdown") {
      const plain = editorRef.current?.innerText ?? value.replace(/<[^>]+>/g, "")
      onChange(plain.trim())
    } else {
      const lines = value.split("\n").filter((l) => l.length > 0)
      const html = lines.length > 0
        ? lines.map((l) => `<p>${escapeHtml(l)}</p>`).join("")
        : ""
      onChange(html)
      requestAnimationFrame(() => {
        if (editorRef.current) editorRef.current.innerHTML = html
      })
    }
    setMode(next)
  }, [mode, onChange, value])

  const handleCancel = useCallback(() => {
    onChange("")
    if (editorRef.current) editorRef.current.innerHTML = ""
  }, [onChange])

  useEffect(() => {
    if (mode === "rich" && editorRef.current && value === "") {
      editorRef.current.innerHTML = ""
    }
  }, [value, mode])

  const hasContent = commentHasContent(value)

  return (
    <div className="flex gap-3">
      <span
        className="mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/15 text-[11px] font-semibold text-primary"
        title={authorName}
      >
        {initials(authorName)}
      </span>

      <div className="min-w-0 flex-1 space-y-2">
        <div
          className={cn(
            "overflow-hidden rounded-md border bg-background transition-shadow",
            focused ? "border-primary ring-2 ring-primary/25" : "border-input",
          )}
        >
          {mode === "rich" ? (
            <div
              ref={editorRef}
              contentEditable
              role="textbox"
              aria-multiline
              aria-label="Comentário"
              data-placeholder={placeholder}
              className="comment-editor min-h-[88px] max-h-40 overflow-y-auto px-3 py-2 text-sm outline-none empty:before:text-muted-foreground empty:before:content-[attr(data-placeholder)]"
              onFocus={() => setFocused(true)}
              onBlur={() => setFocused(false)}
              onInput={() => {
                const html = editorRef.current?.innerHTML ?? ""
                onChange(html === "<br>" ? "" : html)
              }}
              suppressContentEditableWarning
            />
          ) : (
            <Textarea
              value={value}
              onChange={(e) => onChange(e.target.value)}
              onFocus={() => setFocused(true)}
              onBlur={() => setFocused(false)}
              placeholder={placeholder}
              rows={4}
              className="min-h-[88px] resize-none border-0 bg-transparent px-3 py-2 shadow-none focus-visible:ring-0 focus-visible:ring-offset-0"
            />
          )}

          {mode === "rich" && (
            <div className="flex flex-wrap items-center gap-0.5 border-t border-border/60 bg-muted/20 px-1.5 py-1">
              <ToolbarButton title="Negrito" onClick={() => exec("bold")}>
                <Bold size={14} />
              </ToolbarButton>
              <ToolbarButton title="Itálico" onClick={() => exec("italic")}>
                <Italic size={14} />
              </ToolbarButton>
              <ToolbarButton title="Sublinhado" onClick={() => exec("underline")}>
                <Underline size={14} />
              </ToolbarButton>
              <span className="mx-0.5 h-4 w-px bg-border" />
              <ToolbarButton title="Lista com marcadores" onClick={() => exec("insertUnorderedList")}>
                <List size={14} />
              </ToolbarButton>
              <ToolbarButton title="Lista numerada" onClick={() => exec("insertOrderedList")}>
                <ListOrdered size={14} />
              </ToolbarButton>
              <span className="mx-0.5 h-4 w-px bg-border" />
              <ToolbarButton title="Destaque" onClick={() => exec("hiliteColor", "#fef08a")}>
                <span className="text-[11px] font-semibold underline decoration-yellow-400 decoration-2">ab</span>
              </ToolbarButton>
              <ToolbarButton title="Cor do texto" onClick={() => exec("foreColor", "#dc2626")}>
                <span className="text-[11px] font-semibold text-red-600 underline decoration-red-600 decoration-2">A</span>
              </ToolbarButton>
              <span className="mx-0.5 h-4 w-px bg-border" />
              <ToolbarButton title="Emoji" onClick={() => insertAtCursor(" 🙂 ")}>
                <Smile size={14} />
              </ToolbarButton>
              <ToolbarButton title="Aumentar recuo" onClick={() => exec("indent")}>
                <IndentIncrease size={14} />
              </ToolbarButton>
              <ToolbarButton title="Diminuir recuo" onClick={() => exec("outdent")}>
                <IndentDecrease size={14} />
              </ToolbarButton>
              <ToolbarButton title="Tamanho da fonte" onClick={() => exec("fontSize", "4")}>
                <Type size={14} />
              </ToolbarButton>
              <span className="mx-0.5 h-4 w-px bg-border" />
              <ToolbarButton title="Código" onClick={() => exec("formatBlock", "pre")}>
                <Code size={14} />
              </ToolbarButton>
              <ToolbarButton title="Menção" onClick={() => insertAtCursor("@")}>
                <AtSign size={14} />
              </ToolbarButton>
              <ToolbarButton title="Tag" onClick={() => insertAtCursor("#")}>
                <Hash size={14} />
              </ToolbarButton>
              <ToolbarButton title="Vínculo de workflow" onClick={() => insertAtCursor(" → ")}>
                <GitBranch size={14} />
              </ToolbarButton>
              <span className="mx-0.5 h-4 w-px bg-border" />
              <ToolbarButton title="Limpar formatação" onClick={() => exec("removeFormat")}>
                <Eraser size={14} />
              </ToolbarButton>
              <ToolbarButton title="Inserir imagem" onClick={promptImage}>
                <Image size={14} />
              </ToolbarButton>
              <ToolbarButton title="Inserir link" onClick={promptLink}>
                <Link2 size={14} />
              </ToolbarButton>
              <ToolbarButton title="Remover link" onClick={() => exec("unlink")}>
                <Link2Off size={14} />
              </ToolbarButton>
            </div>
          )}
        </div>

        <div className="flex flex-wrap items-center justify-end gap-2">
          <button
            type="button"
            className="text-xs text-primary hover:underline"
            onClick={() => switchMode(mode === "rich" ? "markdown" : "rich")}
          >
            {mode === "rich" ? "Alternar para editor Markdown" : "Alternar para editor visual"}
          </button>
          <Button type="button" variant="outline" size="sm" onClick={handleCancel} disabled={!hasContent || submitting}>
            Cancelar
          </Button>
          <Button type="button" size="sm" onClick={onSubmit} disabled={!hasContent || submitting}>
            {submitting && <Loader2 size={13} className="animate-spin mr-1.5" />}
            Salvar
          </Button>
        </div>
      </div>
    </div>
  )
}
