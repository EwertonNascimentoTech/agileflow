import { useEffect, useState } from "react"
import { ExternalLink, Loader2, Sparkles } from "lucide-react"

import {
  indicadoresApi,
  type Acompanhamento,
  type AcompanhamentoEvidenciasPayload,
  type AnexoItem,
  type PortfolioServicoRef,
} from "@/api/indicadores"
import { AttachmentField, type Attachment } from "@/components/AttachmentField"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { toast } from "@/lib/toast"

function evidenciasCount(data: {
  evidencias?: AnexoItem[] | null
  evidencias_novos?: AnexoItem[] | null
  portfolio_links?: { url: string }[] | null
  portfolio_links_novos?: { url: string }[] | null
  portfolio_servicos_novos?: PortfolioServicoRef[] | null
}) {
  return (
    (data.portfolio_servicos_novos?.length ?? 0)
    + (data.evidencias_novos?.length ?? 0)
    + (data.portfolio_links_novos?.length ?? 0)
    + (data.evidencias?.length ?? 0)
    + (data.portfolio_links?.length ?? 0)
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

function LinksList({ links }: { links: { label: string; url: string }[] }) {
  if (!links.length) return null
  return (
    <ul className="space-y-1">
      {links.map((link) => (
        <li key={link.url}>
          <a
            href={link.url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 text-sm text-primary hover:underline"
          >
            <ExternalLink size={13} />
            {link.label}
          </a>
        </li>
      ))}
    </ul>
  )
}

export function AcompanhamentoEvidenciasDialog({
  acomp,
  onClose,
  onSaved,
}: {
  acomp: Acompanhamento
  onClose: () => void
  onSaved: (updated: Acompanhamento) => void
}) {
  const isPortfolio = acomp.fonte === "portfolio"
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
    } catch {
      toast.error("Não foi possível salvar as evidências.")
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
      portfolio_links: data.portfolio_links,
    }
  }

  const acumuladoSemNovos = (payload?.portfolio_servicos ?? []).filter((s) => !s.novo_no_mes)

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
            {/* Novos no mês — destaque */}
            <section className="space-y-2 rounded-lg border border-primary/30 bg-primary/5 p-3">
              <p className="flex items-center gap-1.5 text-sm font-medium">
                <Sparkles size={15} className="text-primary" />
                Publicados em {acomp.competencia}
                <span className="font-normal text-muted-foreground">
                  ({acomp.periodo_inicio} a {acomp.periodo_fim})
                </span>
              </p>
              {payload.portfolio_servicos_novos.length > 0 ? (
                <ServicosTable rows={payload.portfolio_servicos_novos} highlight />
              ) : (
                <p className="text-sm text-muted-foreground">Nenhum serviço novo publicado neste mês.</p>
              )}
              {payload.portfolio_links_novos.length > 0 && (
                <div className="space-y-1 pt-1">
                  <p className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">Links do mês</p>
                  <LinksList links={payload.portfolio_links_novos} />
                </div>
              )}
              {(payload.evidencias_novos.length > 0) && (
                <div className="space-y-1 pt-1">
                  <p className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">Anexos do mês</p>
                  <AttachmentField value={payload.evidencias_novos} onChange={() => {}} disabled getUrl={indicadoresApi.getUploadUrl} />
                </div>
              )}
            </section>

            {/* Acumulado no numerador */}
            <section className="space-y-2">
              <p className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
                Acumulado no numerador até {acomp.periodo_fim} ({payload.portfolio_servicos.length} serviço(s))
              </p>
              {acumuladoSemNovos.length > 0 ? (
                <ServicosTable rows={acumuladoSemNovos} />
              ) : payload.portfolio_servicos_novos.length === 0 ? (
                <p className="text-sm text-muted-foreground">Nenhum serviço de produto em produção no numerador.</p>
              ) : null}

              {payload.portfolio_links.length > 0 && (
                <div className="space-y-1">
                  <p className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">Links (acumulado)</p>
                  <LinksList links={payload.portfolio_links} />
                </div>
              )}
              {payload.evidencias.length > 0 && (
                <div className="space-y-1">
                  <p className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">Anexos (acumulado)</p>
                  <AttachmentField value={payload.evidencias} onChange={() => {}} disabled getUrl={indicadoresApi.getUploadUrl} />
                </div>
              )}
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
