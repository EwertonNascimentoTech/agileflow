import { useEffect, useMemo, useState } from "react"
import { useLocation, useNavigate, useParams, useSearchParams } from "react-router-dom"
import { BookOpen, FileCode2, FileText, Loader2 } from "lucide-react"
import { docsApi, type DocsDocument, type DocsFileMeta, type DocsSection } from "@/api/docs"
import { MarkdownPreview } from "@/components/MarkdownPreview"
import { BpmnViewer } from "@/components/BpmnViewer"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

const SECTION_ORDER = ["usuario", "processo", "tecnico"] as const

function normalizeSection(raw: string | undefined | null): string {
  const v = (raw ?? "").trim().toLowerCase()
  if (v === "técnico" || v === "tecnico") return "tecnico"
  if (SECTION_ORDER.includes(v as (typeof SECTION_ORDER)[number])) return v
  return "usuario"
}

export default function DocumentationPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const { section: sectionFromPath } = useParams<{ section?: string }>()
  const [searchParams, setSearchParams] = useSearchParams()
  const inModuleShell = location.pathname.includes("/modules/documentacao")
  const sectionParam = normalizeSection(sectionFromPath || searchParams.get("section"))
  const fileParam = searchParams.get("file") || ""

  const [sections, setSections] = useState<DocsSection[]>([])
  const [files, setFiles] = useState<DocsFileMeta[]>([])
  const [doc, setDoc] = useState<DocsDocument | null>(null)
  const [loadingSections, setLoadingSections] = useState(true)
  const [loadingFiles, setLoadingFiles] = useState(false)
  const [loadingDoc, setLoadingDoc] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const activeSection = useMemo(() => {
    const found = sections.find((s) => s.slug === sectionParam)
    return found?.slug || SECTION_ORDER[0]
  }, [sections, sectionParam])

  useEffect(() => {
    setLoadingSections(true)
    docsApi
      .sections()
      .then(setSections)
      .catch(() => setError("Não foi possível carregar as secções de documentação."))
      .finally(() => setLoadingSections(false))
  }, [])

  useEffect(() => {
    if (!sections.length) return
    setLoadingFiles(true)
    setError(null)
    docsApi
      .files(activeSection)
      .then((list) => {
        setFiles(list)
        const preferred =
          (fileParam && list.find((f) => f.name === fileParam)?.name) ||
          list.find((f) => f.name.toLowerCase() === "readme.md")?.name ||
          list[0]?.name ||
          ""
        if (preferred && preferred !== fileParam) {
          setSearchParams({ file: preferred }, { replace: true })
        } else if (!preferred) {
          setDoc(null)
        }
      })
      .catch(() => {
        setFiles([])
        setError("Não foi possível listar os documentos desta secção.")
      })
      .finally(() => setLoadingFiles(false))
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reagir à secção; file sync é side-effect
  }, [activeSection, sections])

  useEffect(() => {
    if (!fileParam || !activeSection) return
    setLoadingDoc(true)
    setError(null)
    docsApi
      .file(activeSection, fileParam)
      .then(setDoc)
      .catch(() => {
        setDoc(null)
        setError("Documento não encontrado.")
      })
      .finally(() => setLoadingDoc(false))
  }, [activeSection, fileParam])

  function selectSection(slug: string) {
    if (inModuleShell) {
      navigate(`/app/modules/documentacao/${slug}`)
      return
    }
    setSearchParams({ section: slug })
  }

  function selectFile(name: string) {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev)
      if (!inModuleShell) next.set("section", activeSection)
      next.set("file", name)
      return next
    })
  }

  return (
    <div className="mx-auto flex h-full min-h-[calc(100vh-8rem)] max-w-7xl flex-col gap-4">
      {!inModuleShell && (
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <BookOpen size={20} />
          </div>
          <div>
            <h1 className="text-xl font-semibold tracking-tight">Documentação</h1>
            <p className="text-sm text-muted-foreground">
              Guias de utilizador, processo de negócio e referência técnica.
            </p>
          </div>
        </div>
      )}

      {error && (
        <div className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
          {error}
        </div>
      )}

      {!inModuleShell && (
        <div className="flex flex-wrap gap-2">
          {(loadingSections
            ? SECTION_ORDER.map(
                (slug): DocsSection => ({
                  slug,
                  folder: slug,
                  title: slug === "tecnico" ? "Técnico" : slug === "usuario" ? "Utilizador" : "Processo",
                  description: "",
                  file_count: 0,
                  available: true,
                }),
              )
            : sections
          ).map((s) => (
            <Button
              key={s.slug}
              type="button"
              variant={activeSection === s.slug ? "default" : "outline"}
              size="sm"
              disabled={!s.available}
              onClick={() => selectSection(s.slug)}
            >
              {s.title}
            </Button>
          ))}
        </div>
      )}

      <div className="grid min-h-0 flex-1 gap-4 lg:grid-cols-[240px_1fr]">
        <aside className="rounded-lg border bg-card p-2">
          <p className="px-2 py-1.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
            Documentos
          </p>
          {loadingFiles ? (
            <div className="flex items-center gap-2 px-2 py-4 text-sm text-muted-foreground">
              <Loader2 size={14} className="animate-spin" /> A carregar…
            </div>
          ) : files.length === 0 ? (
            <p className="px-2 py-4 text-sm text-muted-foreground">Nenhum ficheiro nesta secção.</p>
          ) : (
            <ul className="space-y-0.5">
              {files.map((f) => {
                const active = f.name === fileParam
                const Icon = f.format === "md" ? FileText : FileCode2
                return (
                  <li key={f.name}>
                    <button
                      type="button"
                      onClick={() => selectFile(f.name)}
                      className={cn(
                        "flex w-full items-start gap-2 rounded-md px-2 py-2 text-left text-sm transition",
                        active ? "bg-primary/10 text-primary" : "hover:bg-muted text-foreground",
                      )}
                    >
                      <Icon size={15} className="mt-0.5 shrink-0 opacity-70" />
                      <span className="min-w-0">
                        <span className="block truncate font-medium leading-tight">{f.title}</span>
                        <span className="block truncate text-[11px] text-muted-foreground">{f.name}</span>
                      </span>
                    </button>
                  </li>
                )
              })}
            </ul>
          )}
        </aside>

        <section className="min-w-0 rounded-lg border bg-card">
          {loadingDoc ? (
            <div className="flex items-center gap-2 p-8 text-sm text-muted-foreground">
              <Loader2 size={16} className="animate-spin" /> A renderizar documento…
            </div>
          ) : !doc ? (
            <div className="p-8 text-sm text-muted-foreground">Selecione um documento.</div>
          ) : (
            <div className="p-4 md:p-6">
              <div className="mb-4 flex flex-wrap items-center justify-between gap-2 border-b pb-3">
                <div>
                  <h2 className="text-lg font-semibold">{doc.title}</h2>
                  <p className="text-xs text-muted-foreground">{doc.name}</p>
                </div>
                <span className="rounded-full border px-2 py-0.5 text-[11px] uppercase text-muted-foreground">
                  {doc.format}
                </span>
              </div>
              {doc.format === "md" ? (
                <MarkdownPreview content={doc.content} />
              ) : doc.format === "xml" && isBpmnXml(doc.content) ? (
                <BpmnViewer xml={doc.content} />
              ) : (
                <pre className="overflow-x-auto rounded-lg border bg-muted/50 p-4 font-mono text-[12px] leading-relaxed whitespace-pre-wrap">
                  {doc.content}
                </pre>
              )}
            </div>
          )}
        </section>
      </div>
    </div>
  )
}

function isBpmnXml(content: string): boolean {
  const head = content.slice(0, 800).toLowerCase()
  return head.includes("bpmn") || head.includes("definitions")
}
