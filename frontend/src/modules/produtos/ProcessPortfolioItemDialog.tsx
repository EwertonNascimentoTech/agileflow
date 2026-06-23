import { useEffect, useMemo, useState } from "react"
import { Loader2 } from "lucide-react"

import {
  produtosApi,
  type ProcessItem,
  type ProcessItemInput,
  type ProcessNivel,
  type Anexo,
} from "@/api/produtos"
import { AttachmentField, type Attachment } from "@/components/AttachmentField"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Textarea } from "@/components/ui/textarea"
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { toast } from "@/lib/toast"
import type { DefaultSelectOption } from "@/modules/projetos/defaultFormOptions"
import { defaultSelectOptions } from "@/modules/projetos/defaultFormUtils"
import { useDefaultFormConfig } from "@/modules/projetos/useDefaultFormConfig"
import { formatVigenciaRange, vigenciaFromSubprocessos } from "./processPortfolioDocUtils"

const NIVEL_LABEL: Record<ProcessNivel, string> = {
  diretoria: "Diretoria",
  macroprocesso: "Macro Processo",
  processo: "Processo",
  subprocesso: "Sub Processo",
}

const NONE = "__none__"

function resolveDefaultFormSelectValue(
  raw: string | null | undefined,
  labelFallback: string | null | undefined,
  options: DefaultSelectOption[],
): string {
  if (raw?.trim()) {
    const hit = options.find((o) => o.value === raw || o.label === raw)
    if (hit) return hit.value
  }
  if (labelFallback?.trim()) {
    const hit = options.find((o) => o.label === labelFallback)
    if (hit) return hit.value
  }
  if (raw?.trim()) return raw
  return NONE
}

export interface ItemDialogSpec {
  versionId: string
  nivel: ProcessNivel
  parentId: string | null
  /** quando presente, edição; senão criação */
  item?: ProcessItem
}

function detail(e: unknown): string {
  return (e as { response?: { data?: { detail?: string } } })?.response?.data?.detail || "Falha ao salvar."
}

export default function ProcessPortfolioItemDialog({
  spec,
  onClose,
  onSaved,
}: {
  spec: ItemDialogSpec
  onClose: () => void
  onSaved: () => void
}) {
  const editing = !!spec.item
  const it = spec.item
  const [name, setName] = useState(it?.name ?? "")
  const [description, setDescription] = useState(it?.description ?? "")
  const { fields: defaultFormFields } = useDefaultFormConfig()
  const [diretoria, setDiretoria] = useState(NONE)
  const [area, setArea] = useState(NONE)
  const [analista, setAnalista] = useState(it?.analista ?? it?.analista_nome ?? "")
  const [dono, setDono] = useState(it?.dono ?? it?.dono_nome ?? "")
  const [vigInicio, setVigInicio] = useState(it?.vigencia_inicio ?? "")
  const [vigFim, setVigFim] = useState(it?.vigencia_fim ?? "")
  const [documentado, setDocumentado] = useState(it?.documentado ?? false)
  const [dataDoc, setDataDoc] = useState(it?.data_documentacao ?? "")
  const [docPrevIni, setDocPrevIni] = useState(it?.doc_previsao_inicio ?? "")
  const [docPrevFim, setDocPrevFim] = useState(it?.doc_previsao_fim ?? "")
  const [anexos, setAnexos] = useState<Anexo[]>(it?.anexos ?? [])
  const [saving, setSaving] = useState(false)

  const diretoriaFormOptions = useMemo(
    () => defaultSelectOptions(defaultFormFields, "diretoria"),
    [defaultFormFields],
  )

  const diretoriaSelectOptions = useMemo(() => {
    const opts = diretoriaFormOptions.map((o) => ({ value: o.value, label: o.label }))
    if (diretoria !== NONE && !opts.some((o) => o.value === diretoria)) {
      opts.push({ value: diretoria, label: diretoria })
    }
    return opts
  }, [diretoriaFormOptions, diretoria])

  const areaFormOptions = useMemo(
    () => defaultSelectOptions(defaultFormFields, "area"),
    [defaultFormFields],
  )

  const areaSelectOptions = useMemo(() => {
    const opts = areaFormOptions.map((o) => ({ value: o.value, label: o.label }))
    if (area !== NONE && !opts.some((o) => o.value === area)) {
      opts.push({ value: area, label: area })
    }
    return opts
  }, [areaFormOptions, area])

  useEffect(() => {
    setDiretoria(resolveDefaultFormSelectValue(it?.diretoria, null, diretoriaFormOptions))
  }, [it?.id, it?.diretoria, diretoriaFormOptions])

  useEffect(() => {
    setArea(resolveDefaultFormSelectValue(it?.area, it?.area_nome, areaFormOptions))
  }, [it?.id, it?.area, it?.area_nome, areaFormOptions])

  useEffect(() => {
    setAnalista(it?.analista ?? it?.analista_nome ?? "")
    setDono(it?.dono ?? it?.dono_nome ?? "")
  }, [it?.id, it?.analista, it?.analista_nome, it?.dono, it?.dono_nome])

  const isSubprocesso = spec.nivel === "subprocesso"

  const vigenciaPreview = useMemo(() => {
    if (isSubprocesso || !it) return null
    const { inicio, fim } = it.vigencia_inicio || it.vigencia_fim
      ? { inicio: it.vigencia_inicio, fim: it.vigencia_fim }
      : vigenciaFromSubprocessos(it)
    return formatVigenciaRange(inicio, fim)
  }, [isSubprocesso, it])

  async function save() {
    if (!name.trim()) return
    const payload: ProcessItemInput = {
      nivel: spec.nivel,
      parent_id: spec.parentId,
      name: name.trim(),
      description: description.trim() || null,
      diretoria: diretoria === NONE ? null : diretoria,
      area: area === NONE ? null : area,
      analista: analista.trim() || null,
      dono: dono.trim() || null,
      ...(isSubprocesso
        ? { vigencia_inicio: vigInicio || null, vigencia_fim: vigFim || null }
        : {}),
      documentado: isSubprocesso ? documentado : false,
      data_documentacao: isSubprocesso && documentado ? dataDoc || null : null,
      doc_previsao_inicio: isSubprocesso && !documentado ? docPrevIni || null : null,
      doc_previsao_fim: isSubprocesso && !documentado ? docPrevFim || null : null,
      anexos: isSubprocesso ? anexos : [],
    }
    setSaving(true)
    try {
      if (editing && it) await produtosApi.updatePortfolioItem(spec.versionId, it.id, payload)
      else await produtosApi.createPortfolioItem(spec.versionId, payload)
      onSaved()
    } catch (e) {
      toast.error(detail(e))
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open onOpenChange={(v) => { if (!v) onClose() }}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>
            {editing ? "Editar" : "Novo"} {NIVEL_LABEL[spec.nivel].toLowerCase()}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label>Nome *</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} autoFocus />
          </div>

          <div className="space-y-1.5">
            <Label>Descrição</Label>
            <Textarea rows={2} value={description} onChange={(e) => setDescription(e.target.value)} />
          </div>

          {spec.nivel === "macroprocesso" && (
            <SelectField
              label="Diretoria demandante"
              value={diretoria}
              onChange={setDiretoria}
              options={diretoriaSelectOptions}
              noneLabel="Selecione a diretoria"
              emptyHint={
                diretoriaSelectOptions.length === 0
                  ? "Cadastre as diretorias em Projetos → Configurações → Formulário padrão."
                  : undefined
              }
            />
          )}

          <SelectField
            label="Área responsável"
            value={area}
            onChange={setArea}
            options={areaSelectOptions}
            noneLabel="Selecione a área"
            emptyHint={
              areaSelectOptions.length === 0
                ? "Cadastre as áreas em Projetos → Configurações → Formulário padrão."
                : undefined
            }
          />

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Analista do processo</Label>
              <Input value={analista} onChange={(e) => setAnalista(e.target.value)} placeholder="Nome do analista" />
            </div>
            <div className="space-y-1.5">
              <Label>Dono do processo</Label>
              <Input value={dono} onChange={(e) => setDono(e.target.value)} placeholder="Nome do dono" />
            </div>
          </div>

          {/* Vigência — editável apenas no sub processo */}
          {isSubprocesso ? (
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5"><Label>Início da vigência</Label><Input type="date" value={vigInicio} onChange={(e) => setVigInicio(e.target.value)} /></div>
              <div className="space-y-1.5"><Label>Fim da vigência</Label><Input type="date" value={vigFim} onChange={(e) => setVigFim(e.target.value)} /></div>
            </div>
          ) : (
            <p className="rounded-md border border-dashed bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
              {vigenciaPreview
                ? <>Vigência calculada a partir dos sub processos: <span className="font-medium text-foreground">{vigenciaPreview}</span></>
                : "Vigência calculada a partir dos sub processos (atualizada ao salvar)."}
            </p>
          )}

          {/* Documentação — apenas sub processo */}
          {isSubprocesso && (
          <div className="rounded-md border p-3 space-y-3">
            <div className="flex items-center justify-between">
              <Label className="cursor-pointer" htmlFor="doc-switch">Sub processo documentado?</Label>
              <Switch id="doc-switch" checked={documentado} onCheckedChange={setDocumentado} />
            </div>
            {documentado ? (
              <div className="space-y-1.5">
                <Label>Data da documentação</Label>
                <Input type="date" value={dataDoc} onChange={(e) => setDataDoc(e.target.value)} />
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5"><Label>Previsão início doc.</Label><Input type="date" value={docPrevIni} onChange={(e) => setDocPrevIni(e.target.value)} /></div>
                <div className="space-y-1.5"><Label>Previsão fim doc.</Label><Input type="date" value={docPrevFim} onChange={(e) => setDocPrevFim(e.target.value)} /></div>
              </div>
            )}
            <div className="space-y-1.5">
              <Label>Anexos da documentação</Label>
              <AttachmentField
                value={anexos}
                onChange={(files: Attachment[]) => setAnexos(files)}
                upload={produtosApi.uploadFile}
                getUrl={produtosApi.getUploadUrl}
              />
            </div>
          </div>
          )}

          {!isSubprocesso && (
            <p className="rounded-md border border-dashed bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
              A documentação é gerenciada nos sub processos. O percentual de documentação aparece na árvore do portfólio.
            </p>
          )}
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button onClick={() => void save()} disabled={saving || !name.trim()}>
            {saving && <Loader2 size={14} className="mr-1.5 animate-spin" />}
            {editing ? "Salvar" : "Criar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function SelectField({
  label, value, onChange, options, noneLabel, emptyHint,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  options: { value: string; label: string }[]
  noneLabel?: string
  emptyHint?: string
}) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger><SelectValue placeholder={noneLabel} /></SelectTrigger>
        <SelectContent>
          {noneLabel && <SelectItem value={NONE}>{noneLabel}</SelectItem>}
          {options.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
        </SelectContent>
      </Select>
      {emptyHint && <p className="text-xs text-muted-foreground">{emptyHint}</p>}
    </div>
  )
}
