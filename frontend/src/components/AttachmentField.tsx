import { useCallback, useRef, useState, type DragEvent } from "react"
import { Download, Loader2, Paperclip, Upload, X } from "lucide-react"

import { projetosApi } from "@/api/projetos"

/** Metadados de um anexo já enviado ao storage (mesma forma do ProjectUpload). */
export interface Attachment {
  object_name: string
  filename: string
  content_type: string
  size: number
}

function isAttachment(v: unknown): v is Attachment {
  return !!v && typeof v === "object" && typeof (v as Attachment).object_name === "string"
}

/** Normaliza um valor (array, objeto único legado ou null) para uma lista de anexos. */
export function toAttachmentList(v: unknown): Attachment[] {
  if (Array.isArray(v)) return v.filter(isAttachment)
  if (isAttachment(v)) return [v]
  return []
}

function uploadErrorMessage(err: unknown, maxSizeMb: number): string {
  const e = err as { response?: { status?: number; data?: { detail?: unknown } } }
  const status = e.response?.status
  const detail = e.response?.data?.detail
  if (status === 413) return `Arquivo excede o limite de ${maxSizeMb} MB.`
  if (status === 422) return "Falha ao enviar o arquivo. Tente novamente."
  if (typeof detail === "string" && detail.trim()) return detail
  return "Falha no upload. Tente novamente."
}

function formatBytes(n: number): string {
  if (!n || n < 1024) return `${n || 0} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`
  return `${(n / (1024 * 1024)).toFixed(1)} MB`
}

const DEFAULT_MAX_MB = 20

export interface AttachmentFieldProps {
  value: unknown
  onChange: (files: Attachment[]) => void
  disabled?: boolean
  multiple?: boolean
  accept?: string
  maxFiles?: number
  maxSizeMb?: number
  upload?: (file: File) => Promise<Attachment>
  getUrl?: (objectName: string) => Promise<string>
}

export function AttachmentField({
  value,
  onChange,
  disabled = false,
  multiple = true,
  accept,
  maxFiles,
  maxSizeMb = DEFAULT_MAX_MB,
  upload = projetosApi.uploadFile,
  getUrl = projetosApi.getUploadUrl,
}: AttachmentFieldProps) {
  const files = toAttachmentList(value)
  const [uploading, setUploading] = useState(0)
  const [error, setError] = useState("")
  const [dragOver, setDragOver] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const atLimit = maxFiles != null && files.length >= maxFiles
  const canAdd = !disabled && (multiple || files.length === 0) && !atLimit

  const processFiles = useCallback(
    async (incoming: File[]) => {
      if (!incoming.length || disabled) return
      setError("")
      const maxBytes = maxSizeMb * 1024 * 1024
      const allowed = maxFiles != null ? Math.max(0, maxFiles - files.length) : incoming.length
      const batch = incoming.slice(0, allowed)
      const tooLarge = batch.find((f) => f.size > maxBytes)
      if (tooLarge) {
        setError(`"${tooLarge.name}" excede o limite de ${maxSizeMb} MB.`)
        return
      }
      setUploading((n) => n + batch.length)
      const results = await Promise.allSettled(batch.map((f) => upload(f)))
      setUploading((n) => n - batch.length)
      const uploaded: Attachment[] = []
      let failed = false
      for (const r of results) {
        if (r.status === "fulfilled") uploaded.push(r.value)
        else failed = true
      }
      if (uploaded.length) {
        onChange(multiple ? [...files, ...uploaded] : uploaded)
      }
      if (failed) {
        setError(uploadErrorMessage(results.find((r) => r.status === "rejected")?.reason, maxSizeMb))
      }
    },
    [disabled, files, maxFiles, maxSizeMb, multiple, onChange, upload],
  )

  function onInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    const list = e.target.files ? Array.from(e.target.files) : []
    void processFiles(list)
    e.target.value = ""
  }

  function onDrop(e: DragEvent) {
    e.preventDefault()
    setDragOver(false)
    if (!canAdd) return
    void processFiles(Array.from(e.dataTransfer.files))
  }

  function removeAt(index: number) {
    if (disabled) return
    onChange(files.filter((_, i) => i !== index))
  }

  async function downloadFile(att: Attachment) {
    try {
      const url = await getUrl(att.object_name)
      if (url) window.open(url, "_blank", "noopener")
    } catch {
      setError("Não foi possível abrir o arquivo.")
    }
  }

  return (
    <div className="space-y-2">
      {canAdd && (
        <div
          role="button"
          tabIndex={0}
          onKeyDown={(e) => e.key === "Enter" && inputRef.current?.click()}
          onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
          onDragLeave={() => setDragOver(false)}
          onDrop={onDrop}
          onClick={() => inputRef.current?.click()}
          className={`flex cursor-pointer flex-col items-center justify-center gap-1 rounded-md border border-dashed px-4 py-5 text-center text-sm transition-colors ${
            dragOver ? "border-primary bg-primary/5" : "border-muted-foreground/30 hover:border-primary/50"
          }`}
        >
          {uploading > 0 ? (
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          ) : (
            <Upload className="h-5 w-5 text-muted-foreground" />
          )}
          <span className="text-muted-foreground">
            Arraste arquivos ou <span className="text-primary underline-offset-2 hover:underline">clique para selecionar</span>
          </span>
          <span className="text-[11px] text-muted-foreground/80">Até {maxSizeMb} MB por arquivo</span>
          <input
            ref={inputRef}
            type="file"
            className="hidden"
            accept={accept}
            multiple={multiple}
            disabled={disabled}
            onChange={onInputChange}
          />
        </div>
      )}

      {files.length > 0 && (
        <ul className="space-y-1.5">
          {files.map((f, i) => (
            <li key={`${f.object_name}-${i}`} className="flex items-center gap-2 rounded-md border bg-muted/30 px-2.5 py-1.5 text-sm">
              <Paperclip className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
              <span className="min-w-0 flex-1 truncate" title={f.filename}>{f.filename}</span>
              <span className="shrink-0 text-[11px] text-muted-foreground">{formatBytes(f.size)}</span>
              <button type="button" className="shrink-0 text-muted-foreground hover:text-foreground" onClick={() => void downloadFile(f)} title="Baixar">
                <Download className="h-3.5 w-3.5" />
              </button>
              {!disabled && (
                <button type="button" className="shrink-0 text-muted-foreground hover:text-destructive" onClick={() => removeAt(i)} title="Remover">
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </li>
          ))}
        </ul>
      )}

      {error && <p className="text-[11px] text-destructive">{error}</p>}
    </div>
  )
}
