import { type ComponentProps } from "react"
import ReactMarkdown from "react-markdown"
import remarkGfm from "remark-gfm"

const mdComponents: ComponentProps<typeof ReactMarkdown>["components"] = {
  h1: (p) => <h1 className="mb-3 mt-4 border-b border-border pb-2 text-2xl font-bold tracking-tight" {...p} />,
  h2: (p) => <h2 className="mb-2 mt-6 text-xl font-semibold" {...p} />,
  h3: (p) => <h3 className="mb-1.5 mt-4 text-lg font-semibold" {...p} />,
  p: (p) => <p className="my-2 text-sm leading-relaxed text-foreground/90" {...p} />,
  ul: (p) => <ul className="my-2 ml-5 list-disc space-y-1 text-sm" {...p} />,
  ol: (p) => <ol className="my-2 ml-5 list-decimal space-y-1 text-sm" {...p} />,
  li: (p) => <li className="text-sm leading-relaxed" {...p} />,
  a: (p) => <a className="text-primary underline underline-offset-2" target="_blank" rel="noreferrer" {...p} />,
  code: ({ className, children, ...p }) => {
    const isBlock = Boolean(className?.includes("language-"))
    if (isBlock) {
      return (
        <code className={cnCode(className)} {...p}>
          {children}
        </code>
      )
    }
    return (
      <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-[12px]" {...p}>
        {children}
      </code>
    )
  },
  pre: (p) => <pre className="my-3 overflow-x-auto rounded-lg border bg-muted/60 p-3 text-[12px] leading-relaxed" {...p} />,
  blockquote: (p) => (
    <blockquote className="my-3 border-l-2 border-primary/40 pl-3 text-sm italic text-muted-foreground" {...p} />
  ),
  table: (p) => (
    <div className="my-3 overflow-x-auto">
      <table className="w-full border-collapse text-sm" {...p} />
    </div>
  ),
  th: (p) => <th className="border border-border bg-muted/50 px-2.5 py-1.5 text-left font-semibold" {...p} />,
  td: (p) => <td className="border border-border px-2.5 py-1.5 align-top" {...p} />,
  hr: () => <hr className="my-6 border-border" />,
}

function cnCode(className?: string) {
  return ["font-mono text-[12px]", className].filter(Boolean).join(" ")
}

/** Render somente-leitura de conteúdo Markdown (GFM). */
export function MarkdownPreview({ content }: { content: string }) {
  if (!content?.trim()) {
    return <p className="text-sm text-muted-foreground">Sem conteúdo.</p>
  }
  return (
    <div className="docs-markdown break-words">
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={mdComponents}>
        {content}
      </ReactMarkdown>
    </div>
  )
}
