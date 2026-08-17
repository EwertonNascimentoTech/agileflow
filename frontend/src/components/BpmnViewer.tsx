import { useEffect, useRef, useState } from "react"
import NavigatedViewer from "bpmn-js/lib/NavigatedViewer"
import "bpmn-js/dist/assets/diagram-js.css"
import "bpmn-js/dist/assets/bpmn-js.css"
import "bpmn-js/dist/assets/bpmn-font/css/bpmn-embedded.css"
import { Code2, Loader2, Maximize2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

type Props = {
  xml: string
  className?: string
  heightClassName?: string
}

/**
 * Visualizador BPMN 2.0 (bpmn.io / bpmn-js NavigatedViewer).
 * Pan + zoom; fallback para XML bruto se a importação falhar.
 */
export function BpmnViewer({ xml, className, heightClassName = "h-[min(70vh,640px)]" }: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const viewerRef = useRef<InstanceType<typeof NavigatedViewer> | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [showXml, setShowXml] = useState(false)

  useEffect(() => {
    const el = containerRef.current
    if (!el || !xml?.trim()) return

    let cancelled = false
    setLoading(true)
    setError(null)
    el.replaceChildren()

    const viewer = new NavigatedViewer({
      container: el,
    })
    viewerRef.current = viewer

    ;(async () => {
      try {
        await viewer.importXML(xml)
        if (cancelled) return
        zoomFit(viewer)
      } catch (err) {
        if (cancelled) return
        const message = err instanceof Error ? err.message : "Falha ao renderizar o diagrama BPMN."
        setError(message)
        setShowXml(true)
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()

    return () => {
      cancelled = true
      try {
        viewer.destroy()
      } catch {
        /* ignore */
      }
      viewerRef.current = null
    }
  }, [xml])

  function fitViewport() {
    if (viewerRef.current) zoomFit(viewerRef.current)
  }

  return (
    <div className={cn("space-y-3", className)}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-muted-foreground">
          Diagrama BPMN 2.0 (bpmn.io) · arraste para pan · scroll para zoom
        </p>
        <div className="flex items-center gap-1.5">
          <Button type="button" variant="outline" size="sm" className="h-8 gap-1.5" onClick={fitViewport}>
            <Maximize2 size={14} />
            Ajustar
          </Button>
          <Button
            type="button"
            variant={showXml ? "default" : "outline"}
            size="sm"
            className="h-8 gap-1.5"
            onClick={() => setShowXml((v) => !v)}
          >
            <Code2 size={14} />
            {showXml ? "Ocultar XML" : "Ver XML"}
          </Button>
        </div>
      </div>

      {error && (
        <div className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
          Não foi possível desenhar o fluxo com bpmn.io: {error}
        </div>
      )}

      <div className={cn("relative overflow-hidden rounded-lg border bg-white dark:bg-zinc-950", heightClassName)}>
        {loading && (
          <div className="absolute inset-0 z-10 flex items-center justify-center bg-background/70 text-sm text-muted-foreground">
            <Loader2 size={16} className="mr-2 animate-spin" />
            A renderizar diagrama…
          </div>
        )}
        <div
          ref={containerRef}
          className="bpmn-viewer-host h-full w-full [&_.djs-container]:h-full [&_.djs-container]:w-full [&_.bjs-powered-by]:opacity-70"
        />
      </div>

      {showXml && (
        <pre className="max-h-80 overflow-auto rounded-lg border bg-muted/50 p-4 font-mono text-[12px] leading-relaxed whitespace-pre-wrap">
          {xml}
        </pre>
      )}
    </div>
  )
}

function zoomFit(viewer: InstanceType<typeof NavigatedViewer>) {
  try {
    const canvas = viewer.get("canvas") as { zoom: (mode: string) => void }
    canvas.zoom("fit-viewport")
  } catch {
    /* viewer pode não estar pronto */
  }
}
