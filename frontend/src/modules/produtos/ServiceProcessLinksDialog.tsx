import { useEffect, useState } from "react"
import { Loader2, Workflow } from "lucide-react"

import { produtosApi, type ProcessItem, type ProcessPortfolio } from "@/api/produtos"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { toast } from "@/lib/toast"

/** Achata a árvore retornando apenas sub-processos (folhas vinculáveis a serviços). */
function collectSubprocessos(items: ProcessItem[], acc: { item: ProcessItem; path: string }[] = [], path = ""): { item: ProcessItem; path: string }[] {
  for (const it of items) {
    const here = path ? `${path} › ${it.name}` : it.name
    if (it.nivel === "subprocesso") acc.push({ item: it, path: here })
    if (it.children?.length) collectSubprocessos(it.children, acc, here)
  }
  return acc
}

export default function ServiceProcessLinksDialog({
  servicoId,
  servicoName,
  onClose,
}: {
  servicoId: string
  servicoName: string
  onClose: () => void
}) {
  const [portfolios, setPortfolios] = useState<ProcessPortfolio[]>([])
  const [portfolioId, setPortfolioId] = useState("")
  const [subs, setSubs] = useState<{ item: ProcessItem; path: string }[]>([])
  const [selected, setSelected] = useState<Set<string>>(new Set())
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
    if (!portfolioId) { setSubs([]); return }
    setLoadingTree(true)
    produtosApi.getCurrentPortfolioTree(portfolioId)
      .then((tree) => setSubs(collectSubprocessos(tree.items)))
      .catch(() => setSubs([]))
      .finally(() => setLoadingTree(false))
  }, [portfolioId])

  function toggle(lineageId: string) {
    setSelected((cur) => {
      const next = new Set(cur)
      if (next.has(lineageId)) next.delete(lineageId); else next.add(lineageId)
      return next
    })
  }

  async function save() {
    if (!portfolioId) return
    setSaving(true)
    try {
      // só envia os lineage_ids deste portfólio (set é por serviço, mas o backend recria por portfólio)
      const idsThisPortfolio = subs.map((s) => s.item.lineage_id).filter((id) => selected.has(id))
      await produtosApi.setServiceProcessLinks(servicoId, portfolioId, idsThisPortfolio)
      toast.success("Vínculos salvos.")
      onClose()
    } catch {
      toast.error("Falha ao salvar vínculos.")
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open onOpenChange={(v) => { if (!v) onClose() }}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader><DialogTitle>Vincular sub-processos · {servicoName}</DialogTitle></DialogHeader>

        {loading ? (
          <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
        ) : portfolios.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">Nenhum portfólio de processos cadastrado.</p>
        ) : (
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Portfólio</Label>
              <Select value={portfolioId} onValueChange={setPortfolioId}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{portfolios.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>

            {loadingTree ? (
              <div className="flex justify-center py-6"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
            ) : subs.length === 0 ? (
              <div className="flex flex-col items-center gap-1 py-6 text-center text-sm text-muted-foreground">
                <Workflow size={20} /> Nenhum sub-processo na versão consolidada deste portfólio.
              </div>
            ) : (
              <ul className="space-y-1">
                {subs.map(({ item, path }) => (
                  <li key={item.lineage_id}>
                    <label className="flex cursor-pointer items-start gap-2 rounded-md border p-2 text-sm hover:bg-muted/40">
                      <input type="checkbox" className="mt-0.5" checked={selected.has(item.lineage_id)} onChange={() => toggle(item.lineage_id)} />
                      <span className="min-w-0">
                        <span className="font-medium">{item.name}</span>
                        <span className="block truncate text-[11px] text-muted-foreground">{path}</span>
                      </span>
                    </label>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button onClick={() => void save()} disabled={saving || !portfolioId}>{saving && <Loader2 size={14} className="mr-1.5 animate-spin" />}Salvar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
