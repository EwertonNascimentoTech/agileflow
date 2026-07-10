import { useEffect, useMemo, useState } from "react"
import { CheckCircle2, Loader2, Search, Workflow } from "lucide-react"

import { produtosApi, type ProcessItem, type ProcessPortfolio } from "@/api/produtos"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { toast } from "@/lib/toast"

type SubEntry = { item: ProcessItem; path: string }

/** Achata a árvore retornando apenas sub-processos (folhas vinculáveis a serviços). */
function collectSubprocessos(items: ProcessItem[], acc: SubEntry[] = [], path = ""): SubEntry[] {
  for (const it of items) {
    const here = path ? `${path} › ${it.name}` : it.name
    if (it.nivel === "subprocesso") acc.push({ item: it, path: here })
    if (it.children?.length) collectSubprocessos(it.children, acc, here)
  }
  return acc
}

function normalize(s: string) {
  return s.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase()
}

export default function ServiceProcessLinksDialog({
  productId,
  servicoId,
  servicoName,
  semSubprocessoInicial = false,
  justificativaInicial = "",
  onClose,
  onSaved,
}: {
  productId: string
  servicoId: string
  servicoName: string
  semSubprocessoInicial?: boolean
  justificativaInicial?: string
  onClose: () => void
  onSaved?: () => void
}) {
  const [portfolios, setPortfolios] = useState<ProcessPortfolio[]>([])
  const [portfolioId, setPortfolioId] = useState("")
  const [subs, setSubs] = useState<SubEntry[]>([])
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [query, setQuery] = useState("")
  const [semDispensa, setSemDispensa] = useState(semSubprocessoInicial)
  const [justificativa, setJustificativa] = useState(justificativaInicial)
  const [loading, setLoading] = useState(true)
  const [loadingTree, setLoadingTree] = useState(false)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    Promise.all([produtosApi.listProcessPortfolios(), produtosApi.listServiceProcessLinks(servicoId)])
      .then(([pfs, links]) => {
        setPortfolios(pfs)
        setSelected(new Set(links.map((l) => l.item_lineage_id)))
        const withVersion = pfs.find((p) => p.current_version_id) ?? pfs[0]
        setPortfolioId(withVersion?.id ?? "")
      })
      .catch(() => toast.error("Falha ao carregar portfólios."))
      .finally(() => setLoading(false))
  }, [servicoId])

  useEffect(() => {
    setSemDispensa(semSubprocessoInicial)
    setJustificativa(justificativaInicial)
  }, [semSubprocessoInicial, justificativaInicial, servicoId])

  useEffect(() => {
    if (!portfolioId) { setSubs([]); return }
    setLoadingTree(true)
    setQuery("")
    produtosApi.getCurrentPortfolioTree(portfolioId)
      .then((tree) => setSubs(collectSubprocessos(tree.items)))
      .catch(() => setSubs([]))
      .finally(() => setLoadingTree(false))
  }, [portfolioId])

  const selectedInPortfolio = useMemo(
    () => subs.filter((s) => selected.has(s.item.lineage_id)).length,
    [subs, selected],
  )

  const totalSelected = selected.size

  const visibleSubs = useMemo(() => {
    const q = normalize(query.trim())
    let list = subs
    if (q) {
      list = subs.filter(
        (s) => normalize(s.item.name).includes(q) || normalize(s.path).includes(q) || (s.item.codigo && normalize(s.item.codigo).includes(q)),
      )
    }
    return [...list].sort((a, b) => {
      const aSel = selected.has(a.item.lineage_id)
      const bSel = selected.has(b.item.lineage_id)
      if (aSel !== bSel) return aSel ? -1 : 1
      return a.item.name.localeCompare(b.item.name, "pt-BR")
    })
  }, [subs, selected, query])

  function toggle(lineageId: string) {
    setSelected((cur) => {
      const next = new Set(cur)
      if (next.has(lineageId)) next.delete(lineageId)
      else next.add(lineageId)
      return next
    })
    if (semDispensa) setSemDispensa(false)
  }

  async function save() {
    if (totalSelected === 0 && semDispensa && !justificativa.trim()) {
      toast.error("Informe a justificativa quando não houver sub-processo disponível.")
      return
    }
    setSaving(true)
    try {
      if (portfolioId && portfolios.length > 0) {
        const idsThisPortfolio = subs
          .filter((s) => selected.has(s.item.lineage_id))
          .map((s) => s.item.lineage_id)
        await produtosApi.setServiceProcessLinks(servicoId, portfolioId, idsThisPortfolio)
      }

      if (totalSelected === 0) {
        await produtosApi.setServicoSubprocessoDispensa(productId, servicoId, {
          sem_subprocesso_disponivel: semDispensa,
          justificativa_sem_subprocesso: semDispensa ? justificativa.trim() : null,
        })
      }

      toast.success("Salvo com sucesso.")
      onSaved?.()
      onClose()
    } catch (e) {
      toast.error((e as { response?: { data?: { detail?: string } } })?.response?.data?.detail || "Falha ao salvar.")
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open onOpenChange={(v) => { if (!v) onClose() }}>
      <DialogContent className="flex max-h-[90vh] flex-col gap-0 overflow-hidden p-0 sm:max-w-3xl">
        <DialogHeader className="shrink-0 space-y-1 border-b px-6 py-4">
          <DialogTitle>Vincular sub-processos</DialogTitle>
          <DialogDescription>
            Serviço <span className="font-medium text-foreground">{servicoName}</span> — selecione um ou mais sub-processos do portfólio.
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="flex flex-1 justify-center py-16">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : portfolios.length === 0 ? (
          <div className="flex-1 space-y-4 px-6 py-8">
            <p className="text-center text-sm text-muted-foreground">
              Nenhum portfólio de processos cadastrado.
            </p>
            <DispensaSection
              semDispensa={semDispensa}
              onSemDispensa={setSemDispensa}
              justificativa={justificativa}
              onJustificativa={setJustificativa}
            />
          </div>
        ) : (
          <>
            <div className="shrink-0 space-y-3 border-b bg-muted/20 px-6 py-4">
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label className="text-xs">Portfólio</Label>
                  <Select value={portfolioId} onValueChange={setPortfolioId}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {portfolios.map((p) => (
                        <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Pesquisar</Label>
                  <div className="relative">
                    <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      className="pl-9"
                      value={query}
                      onChange={(e) => setQuery(e.target.value)}
                      placeholder="Nome, código ou caminho..."
                      disabled={loadingTree || subs.length === 0}
                    />
                  </div>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                <Badge variant="secondary" className="font-normal">
                  {selectedInPortfolio} selecionado{selectedInPortfolio !== 1 ? "s" : ""} neste portfólio
                </Badge>
                <Badge variant="outline" className="font-normal">
                  {totalSelected} no total
                </Badge>
                {subs.length > 0 && (
                  <span>{visibleSubs.length} de {subs.length} exibido{visibleSubs.length !== 1 ? "s" : ""}</span>
                )}
              </div>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto px-6 py-4">
              {loadingTree ? (
                <div className="flex justify-center py-16">
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
              ) : subs.length === 0 ? (
                <div className="flex flex-col items-center gap-2 py-8 text-center text-sm text-muted-foreground">
                  <Workflow size={24} className="opacity-50" />
                  Nenhum sub-processo na versão consolidada deste portfólio.
                </div>
              ) : visibleSubs.length === 0 ? (
                <div className="flex flex-col items-center gap-2 py-8 text-center text-sm text-muted-foreground">
                  <Search size={24} className="opacity-50" />
                  Nenhum sub-processo encontrado para &quot;{query}&quot;.
                </div>
              ) : (
                <ul className="space-y-1.5">
                  {visibleSubs.map(({ item, path }, idx) => {
                    const isSelected = selected.has(item.lineage_id)
                    const showDivider = idx > 0 && !isSelected && selected.has(visibleSubs[idx - 1].item.lineage_id)
                    return (
                      <li key={item.lineage_id}>
                        {showDivider && (
                          <div className="mb-1.5 mt-3 flex items-center gap-2 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                            <span className="h-px flex-1 bg-border" />
                            Demais sub-processos
                            <span className="h-px flex-1 bg-border" />
                          </div>
                        )}
                        <label
                          className={`flex cursor-pointer items-start gap-3 rounded-lg border p-3 text-sm transition-colors hover:bg-muted/40 ${
                            isSelected ? "border-primary/40 bg-primary/5" : "border-border"
                          }`}
                        >
                          <input
                            type="checkbox"
                            className="mt-1 size-4 shrink-0 accent-primary"
                            checked={isSelected}
                            onChange={() => toggle(item.lineage_id)}
                          />
                          <span className="min-w-0 flex-1">
                            <span className="flex flex-wrap items-center gap-1.5">
                              {item.codigo && (
                                <Badge variant="outline" className="text-[10px] font-mono font-normal">{item.codigo}</Badge>
                              )}
                              <span className="font-medium">{item.name}</span>
                              {isSelected && <CheckCircle2 size={14} className="shrink-0 text-primary" />}
                            </span>
                            <span className="mt-0.5 block text-xs leading-relaxed text-muted-foreground">{path}</span>
                          </span>
                        </label>
                      </li>
                    )
                  })}
                </ul>
              )}

              {totalSelected === 0 && (
                <div className="mt-4">
                  <DispensaSection
                    semDispensa={semDispensa}
                    onSemDispensa={setSemDispensa}
                    justificativa={justificativa}
                    onJustificativa={setJustificativa}
                  />
                </div>
              )}
            </div>
          </>
        )}

        <DialogFooter className="shrink-0 gap-2 border-t px-6 py-4">
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button onClick={() => void save()} disabled={saving || loading}>
            {saving && <Loader2 size={14} className="mr-1.5 animate-spin" />}
            Salvar{totalSelected > 0 ? ` (${totalSelected})` : semDispensa ? " (dispensa)" : ""}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function DispensaSection({
  semDispensa,
  onSemDispensa,
  justificativa,
  onJustificativa,
}: {
  semDispensa: boolean
  onSemDispensa: (v: boolean) => void
  justificativa: string
  onJustificativa: (v: string) => void
}) {
  return (
    <div className="rounded-lg border border-dashed border-amber-300 bg-amber-50/50 p-3">
      <label className="flex items-start gap-2 text-sm">
        <input
          type="checkbox"
          className="mt-0.5 size-4 shrink-0 accent-primary"
          checked={semDispensa}
          onChange={(e) => onSemDispensa(e.target.checked)}
        />
        <span>
          <strong>Não há sub-processo disponível</strong> para vincular a este serviço
        </span>
      </label>
      <p className="mt-1 pl-6 text-[11px] text-muted-foreground">
        Marque esta opção somente quando o portfólio de processos não oferece sub-processo aplicável.
        Com justificativa preenchida, o critério de saúde não penaliza este serviço.
      </p>
      {semDispensa && (
        <div className="mt-3 space-y-1.5 pl-6">
          <Label className="text-xs">Justificativa *</Label>
          <Textarea
            rows={3}
            value={justificativa}
            onChange={(e) => onJustificativa(e.target.value)}
            placeholder="Explique por que não existe sub-processo para vincular..."
          />
        </div>
      )}
    </div>
  )
}
