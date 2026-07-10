import { useEffect, useState } from "react"
import { Loader2, Sparkles } from "lucide-react"

import {
  indicadoresApi,
  type Acompanhamento,
  type AcompanhamentoEvidenciasPayload,
  type AnexoItem,
  type FonteMetrica,
  type PortfolioDocumentoRef,
  type PortfolioServicoRef,
} from "@/api/indicadores"
import { AttachmentField, type Attachment } from "@/components/AttachmentField"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { toast } from "@/lib/toast"

function evidenciasCount(data: {
  portfolio_servicos?: PortfolioServicoRef[] | null
  portfolio_servicos_novos?: PortfolioServicoRef[] | null
  portfolio_documentos?: PortfolioDocumentoRef[] | null
  portfolio_documentos_novos?: PortfolioDocumentoRef[] | null
}) {
  return (
    (data.portfolio_servicos_novos?.length ?? 0)
    + (data.portfolio_servicos?.length ?? 0)
    + (data.portfolio_documentos_novos?.length ?? 0)
    + (data.portfolio_documentos?.length ?? 0)
  )
}

function ServicosTable({ rows, highlight }: { rows: PortfolioServicoRef[]; highlight?: boolean }) {
  if (!rows.length) return null
  return (
    <div className="overflow-hidden rounded-md border">
      <table className="w-full text-sm">
        <thead className="bg-muted/50 text-left text-[11px] uppercase tracking-wide text-muted-foreground">
          <tr>
            <th className="px-3 py-2 font-semibold">Produto</th>
            <th className="px-3 py-2 font-semibold">Serviço</th>
            <th className="px-3 py-2 font-semibold">Publicação</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((s) => (
            <tr
              key={s.servico_id}
              className={`border-t ${highlight || s.novo_no_mes ? "bg-primary/5" : ""}`}
            >
              <td className="px-3 py-2">
                <span className="flex items-center gap-1.5">
                  {s.product_name}
                  {(highlight || s.novo_no_mes) && (
                    <Badge variant="secondary" className="h-4 px-1 text-[9px] font-normal">Novo</Badge>
                  )}
                </span>
              </td>
              <td className="px-3 py-2">{s.servico_name}</td>
              <td className="px-3 py-2 text-muted-foreground">{s.data_publicacao ?? "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function DocumentosTable({ rows, highlight }: { rows: PortfolioDocumentoRef[]; highlight?: boolean }) {
  if (!rows.length) return null
  return (
    <div className="overflow-hidden rounded-md border">
      <table className="w-full text-sm">
        <thead className="bg-muted/50 text-left text-[11px] uppercase tracking-wide text-muted-foreground">
          <tr>
            <th className="px-3 py-2 font-semibold">Produto</th>
            <th className="px-3 py-2 font-semibold">Documento</th>
            <th className="px-3 py-2 font-semibold">Data</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((d) => (
            <tr
              key={d.documento_id}
              className={`border-t ${highlight || d.novo_no_mes ? "bg-primary/5" : ""}`}
            >
              <td className="px-3 py-2">
                <span className="flex items-center gap-1.5">
                  {d.product_name}
                  {(highlight || d.novo_no_mes) && (
                    <Badge variant="secondary" className="h-4 px-1 text-[9px] font-normal">Novo</Badge>
                  )}
                </span>
              </td>
              <td className="px-3 py-2">{d.documento_name}</td>
              <td className="px-3 py-2 text-muted-foreground">{d.data_documento ?? "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export function AcompanhamentoEvidenciasDialog({
  acomp,
  fonteMetrica,
  onClose,
  onSaved,
}: {
  acomp: Acompanhamento
  fonteMetrica?: FonteMetrica | null
  onClose: () => void
  onSaved: (updated: Acompanhamento) => void
}) {
  const isPortfolio = acomp.fonte === "portfolio"
  const isDocumentos = fonteMetrica === "documentos_natos_digitais"
  const [loading, setLoading] = useState(isPortfolio)
  const [payload, setPayload] = useState<AcompanhamentoEvidenciasPayload | null>(
    isPortfolio
      ? null
      : {
          fonte: acomp.fonte,
          evidencias: acomp.evidencias ?? [],
          evidencias_novos: [],
          portfolio_servicos: [],
          portfolio_servicos_novos: [],
          portfolio_documentos: [],
          portfolio_documentos_novos: [],
          portfolio_links: [],
          portfolio_links_novos: [],
        },
  )
  const [evidencias, setEvidencias] = useState<Attachment[]>((acomp.evidencias ?? []) as Attachment[])
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!isPortfolio) return
    setLoading(true)
    indicadoresApi.getAcompanhamentoEvidencias(acomp.id)
      .then(setPayload)
      .catch(() => toast.error("Não foi possível carregar evidências do portfólio."))
      .finally(() => setLoading(false))
  }, [acomp.id, isPortfolio])

  async function save() {
    setSaving(true)
    try {
      const updated = await indicadoresApi.updateAcompanhamento(acomp.id, {
        evidencias: evidencias as AnexoItem[],
      })
      toast.success("Evidências salvas.")
      onSaved(updated)
    } catch (err) {
      const detail = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail
      toast.error(typeof detail === "string" ? detail : "Não foi possível salvar as evidências.")
    } finally {
      setSaving(false)
    }
  }

  function mergePortfolioIntoAcomp(data: AcompanhamentoEvidenciasPayload): Acompanhamento {
    return {
      ...acomp,
      evidencias: data.evidencias,
      portfolio_servicos: data.portfolio_servicos,
      portfolio_servicos_novos: data.portfolio_servicos_novos,
      portfolio_documentos: data.portfolio_documentos,
      portfolio_documentos_novos: data.portfolio_documentos_novos,
      portfolio_links: data.portfolio_links,
    }
  }

  const servicosNovos = payload?.portfolio_servicos_novos ?? []
  const servicosAcum = payload?.portfolio_servicos ?? []
  const documentosNovos = payload?.portfolio_documentos_novos ?? []
  const documentosAcum = payload?.portfolio_documentos ?? []
  const servicosAcumSemNovos = servicosAcum.filter((s) => !s.novo_no_mes)
  const documentosAcumSemNovos = documentosAcum.filter((d) => !d.novo_no_mes)
  const itemLabel = isDocumentos ? "documento" : "serviço"
  const novoLabel = isDocumentos ? "Cadastrados" : "Publicados"
  const vazioNovos = isDocumentos
    ? "Nenhum documento nato-digital novo cadastrado neste mês."
    : "Nenhum serviço novo publicado neste mês."
  const vazioAcum = isDocumentos
    ? "Nenhum documento nato-digital de produto em produção no numerador."
    : "Nenhum serviço de produto em produção no numerador."
  const acumuladoCount = isDocumentos ? documentosAcum.length : servicosAcum.length

  return (
    <Dialog open onOpenChange={(v) => { if (!v) onClose() }}>
      <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            Evidências — {acomp.competencia}
            {isPortfolio && <span className="ml-2 text-sm font-normal text-muted-foreground">(Portfólio de Produtos)</span>}
          </DialogTitle>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center justify-center py-10 text-muted-foreground">
            <Loader2 size={20} className="animate-spin" />
          </div>
        ) : isPortfolio && payload ? (
          <div className="space-y-5">
            <section className="space-y-2 rounded-lg border border-primary/30 bg-primary/5 p-3">
              <p className="flex items-center gap-1.5 text-sm font-medium">
                <Sparkles size={15} className="text-primary" />
                {novoLabel} em {acomp.competencia}
                <span className="font-normal text-muted-foreground">
                  ({acomp.periodo_inicio} a {acomp.periodo_fim})
                </span>
              </p>
              {isDocumentos ? (
                documentosNovos.length > 0 ? (
                  <DocumentosTable rows={documentosNovos} highlight />
                ) : (
                  <p className="text-sm text-muted-foreground">{vazioNovos}</p>
                )
              ) : servicosNovos.length > 0 ? (
                <ServicosTable rows={servicosNovos} highlight />
              ) : (
                <p className="text-sm text-muted-foreground">{vazioNovos}</p>
              )}
            </section>

            <section className="space-y-2">
              <p className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
                Acumulado no numerador até {acomp.periodo_fim} ({acumuladoCount} {itemLabel}(s))
              </p>
              {isDocumentos ? (
                documentosAcumSemNovos.length > 0 ? (
                  <DocumentosTable rows={documentosAcumSemNovos} />
                ) : documentosNovos.length === 0 ? (
                  <p className="text-sm text-muted-foreground">{vazioAcum}</p>
                ) : null
              ) : servicosAcumSemNovos.length > 0 ? (
                <ServicosTable rows={servicosAcumSemNovos} />
              ) : servicosNovos.length === 0 ? (
                <p className="text-sm text-muted-foreground">{vazioAcum}</p>
              ) : null}
            </section>
          </div>
        ) : (
          <AttachmentField
            value={evidencias}
            onChange={setEvidencias}
            upload={indicadoresApi.uploadFile}
            getUrl={indicadoresApi.getUploadUrl}
            maxSizeMb={20}
          />
        )}

        <DialogFooter className="gap-2">
          {isPortfolio ? (
            <Button variant="outline" onClick={() => {
              if (payload) onSaved(mergePortfolioIntoAcomp(payload))
              else onClose()
            }}>
              Fechar
            </Button>
          ) : (
            <>
              <Button variant="outline" onClick={onClose}>Cancelar</Button>
              <Button onClick={() => void save()} disabled={saving}>
                {saving && <Loader2 size={14} className="mr-1.5 animate-spin" />}
                Salvar
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export { evidenciasCount }
