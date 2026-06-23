import { type ComponentProps } from "react"
import ReactMarkdown from "react-markdown"
import remarkGfm from "remark-gfm"

import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"

/** Modelo padrão de documentação (espelha o backend; usado como fallback no frontend). */
export const MARKDOWN_TEMPLATE = `# Nome do Produto

## 1. Visão Geral
Descreva a finalidade do produto.

## 2. Público-alvo
Informe quem utiliza o produto.

## 3. Principais Funcionalidades
- Funcionalidade 1
- Funcionalidade 2

## 4. Fluxo de Uso
Descreva o passo a passo de utilização.

## 5. Perfis de Acesso
Descreva os perfis e permissões.

## 6. Integrações
Informe sistemas, APIs e bases envolvidas.

## 7. Regras de Negócio
Liste as principais regras aplicadas.

## 8. Suporte
Informe como solicitar atendimento.

## 9. Histórico de Versões
Registre as alterações relevantes.
`

const mdComponents: ComponentProps<typeof ReactMarkdown>["components"] = {
  h1: (p) => <h1 className="mb-2 mt-3 border-b pb-1 text-xl font-bold" {...p} />,
  h2: (p) => <h2 className="mb-1.5 mt-3 text-lg font-semibold" {...p} />,
  h3: (p) => <h3 className="mb-1 mt-2 text-base font-semibold" {...p} />,
  p: (p) => <p className="my-1.5 text-sm leading-relaxed" {...p} />,
  ul: (p) => <ul className="my-1.5 ml-5 list-disc space-y-0.5 text-sm" {...p} />,
  ol: (p) => <ol className="my-1.5 ml-5 list-decimal space-y-0.5 text-sm" {...p} />,
  li: (p) => <li className="text-sm leading-relaxed" {...p} />,
  a: (p) => <a className="text-primary underline" target="_blank" rel="noreferrer" {...p} />,
  code: (p) => <code className="rounded bg-muted px-1 py-0.5 font-mono text-[12px]" {...p} />,
  pre: (p) => <pre className="my-2 overflow-x-auto rounded-md bg-muted p-3 text-[12px]" {...p} />,
  blockquote: (p) => <blockquote className="my-2 border-l-2 border-muted-foreground/30 pl-3 text-sm italic text-muted-foreground" {...p} />,
  table: (p) => <table className="my-2 w-full border-collapse text-sm" {...p} />,
  th: (p) => <th className="border px-2 py-1 text-left font-semibold" {...p} />,
  td: (p) => <td className="border px-2 py-1" {...p} />,
  hr: (p) => <hr className="my-3" {...p} />,
}

/** Render somente-leitura de conteúdo Markdown (GFM). */
export function MarkdownPreview({ content }: { content: string }) {
  if (!content?.trim()) {
    return <p className="text-sm text-muted-foreground">Sem conteúdo.</p>
  }
  return (
    <div className="break-words">
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={mdComponents}>
        {content}
      </ReactMarkdown>
    </div>
  )
}

/** Editor de Markdown: textarea editável + preview renderizado lado a lado. */
export default function MarkdownEditor({
  value,
  onChange,
  rows = 18,
}: {
  value: string
  onChange: (v: string) => void
  rows?: number
}) {
  return (
    <div className="grid gap-3 md:grid-cols-2">
      <div className="space-y-1.5">
        <Label className="text-xs">Markdown</Label>
        <Textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          rows={rows}
          className="font-mono text-[13px] leading-relaxed"
          placeholder="# Título&#10;&#10;Escreva a documentação em Markdown..."
        />
      </div>
      <div className="space-y-1.5">
        <Label className="text-xs">Pré-visualização</Label>
        <div className="min-h-[120px] overflow-auto rounded-md border bg-background p-3" style={{ maxHeight: `${rows * 1.6}rem` }}>
          <MarkdownPreview content={value} />
        </div>
      </div>
    </div>
  )
}
