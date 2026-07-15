import { useEffect, useMemo, useRef, useState } from "react"
import { Check, ChevronDown, Loader2, Plus, Search, X } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { toast } from "@/lib/toast"
import {
  produtosApi,
  type ProductCategoria,
  type ProductListItem,
  type ReleaseTipo,
} from "@/api/produtos"
import { CATEGORIA_LABEL, CATEGORIA_OPTS } from "@/modules/produtos/constants"
import { teamopsApi, type Person } from "@/api/teamops"
import type { CardClassification, ProjectTask } from "@/api/projetos"

type ClassificationResult = {
  classification: CardClassification
  productId: string
  releaseId: string | null
}

interface Props {
  open: boolean
  task: ProjectTask | null
  mode?: "backlog_exit" | "late"
  onCancel: () => void
  onConfirm: (result: ClassificationResult) => Promise<void> | void
}

const CLASSIFICATIONS: { value: CardClassification; label: string; hint: string }[] = [
  { value: "desenvolvimento", label: "Desenvolvimento", hint: "Cria um produto novo ou vincula a um existente." },
  { value: "implantacao", label: "Implantação", hint: "Cria um produto novo ou vincula a um existente." },
  { value: "melhoria", label: "Melhoria", hint: "Vincula a um produto existente e cria uma release." },
]

const RELEASE_TIPOS: ReleaseTipo[] = [
  "correcao", "melhoria", "nova_funcionalidade", "seguranca", "integracao", "refatoracao", "ajuste_tecnico",
]

function apiMessage(err: unknown, fallback: string): string {
  const detail = (err as { response?: { data?: { detail?: unknown }; status?: number } })?.response
  if (detail?.status === 403) return "Módulo Produtos indisponível ou sem permissão."
  const d = detail?.data?.detail
  if (typeof d === "string") return d
  return fallback
}

/** Select de produto com campo de pesquisa (lista longa no vínculo do card). */
function ProductSearchSelect({
  products,
  value,
  onChange,
  disabled,
  loading,
}: {
  products: ProductListItem[]
  value: string
  onChange: (id: string) => void
  disabled?: boolean
  loading?: boolean
}) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState("")
  const rootRef = useRef<HTMLDivElement>(null)
  const searchRef = useRef<HTMLInputElement>(null)

  const selected = products.find((p) => p.id === value) ?? null
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return products
    return products.filter((p) => p.name.toLowerCase().includes(q))
  }, [products, query])

  useEffect(() => {
    if (!open) return
    const onDoc = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener("mousedown", onDoc)
    return () => document.removeEventListener("mousedown", onDoc)
  }, [open])

  useEffect(() => {
    if (open) {
      setQuery("")
      requestAnimationFrame(() => searchRef.current?.focus())
    }
  }, [open])

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        disabled={disabled || loading}
        onClick={() => setOpen((v) => !v)}
        className="flex h-10 w-full items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
      >
        <span className={selected ? "truncate text-foreground" : "truncate text-muted-foreground"}>
          {loading ? "Carregando produtos…" : (selected?.name ?? "Selecione um produto")}
        </span>
        <ChevronDown size={16} className="ml-2 shrink-0 opacity-50" />
      </button>
      {open && !loading && (
        <div className="absolute z-50 mt-1 w-full overflow-hidden rounded-md border bg-popover text-popover-foreground shadow-md">
          <div className="relative border-b p-2">
            <Search size={14} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              ref={searchRef}
              className="h-9 pl-8"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Pesquisar produto…"
              onKeyDown={(e) => {
                if (e.key === "Escape") setOpen(false)
              }}
            />
          </div>
          <ul className="max-h-52 overflow-y-auto p-1">
            {filtered.length === 0 ? (
              <li className="px-2 py-3 text-center text-xs text-muted-foreground">
                Nenhum produto encontrado{query.trim() ? ` para “${query.trim()}”` : ""}.
              </li>
            ) : filtered.map((p) => {
              const active = p.id === value
              return (
                <li key={p.id}>
                  <button
                    type="button"
                    className={`flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm hover:bg-accent hover:text-accent-foreground ${
                      active ? "bg-accent text-accent-foreground" : ""
                    }`}
                    onClick={() => {
                      onChange(p.id)
                      setOpen(false)
                    }}
                  >
                    <Check size={14} className={active ? "shrink-0 opacity-100" : "shrink-0 opacity-0"} />
                    <span className="truncate">{p.name}</span>
                  </button>
                </li>
              )
            })}
          </ul>
        </div>
      )}
    </div>
  )
}

export function BacklogClassificationDialog({ open, task, mode = "backlog_exit", onCancel, onConfirm }: Props) {
  const [classification, setClassification] = useState<CardClassification | null>(null)
  const [products, setProducts] = useState<ProductListItem[]>([])
  const [loadingProducts, setLoadingProducts] = useState(false)
  const [moduleError, setModuleError] = useState<string | null>(null)
  const [selectedProductId, setSelectedProductId] = useState("")
  // 'select' = usar produto existente · 'new' = cadastrar produto novo (dev/implantação).
  const [productMode, setProductMode] = useState<"select" | "new">("select")
  const [newName, setNewName] = useState("")
  const [newDescription, setNewDescription] = useState("")
  const [newCategoria, setNewCategoria] = useState<ProductCategoria | "">("")
  // PO do produto = responsável do card (pré-preenchido, editável).
  const [newPoPersonId, setNewPoPersonId] = useState("")
  // Produto corporativo: o PO é definido por serviço, não no produto.
  const [newCorporativo, setNewCorporativo] = useState(false)
  const [persons, setPersons] = useState<Person[]>([])
  // Release (melhoria).
  const [relVersao, setRelVersao] = useState("")
  const [relNome, setRelNome] = useState("")
  const [relTipo, setRelTipo] = useState<ReleaseTipo>("melhoria")
  const [relDescricao, setRelDescricao] = useState("")
  const [saving, setSaving] = useState(false)

  // Pré-preenche a partir do card (reclassificação após voltar ao backlog) e carrega produtos.
  useEffect(() => {
    if (!open || !task) return
    setClassification(task.card_classification ?? null)
    setSelectedProductId(task.linked_product_id ?? "")
    setProductMode("select")
    setNewName("")
    setNewDescription("")
    setNewCategoria("")
    // PO já vem preenchido pelo responsável do card (task.assigned_to = person_id).
    setNewPoPersonId(task.assigned_to ?? "")
    setNewCorporativo(false)
    setRelVersao("")
    setRelNome("")
    setRelTipo("melhoria")
    setRelDescricao("")
    setModuleError(null)
    setLoadingProducts(true)
    produtosApi
      .listProducts()
      .then((list) => setProducts(list.filter((p) => p.is_active)))
      .catch((err) => setModuleError(apiMessage(err, "Não foi possível carregar os produtos.")))
      .finally(() => setLoadingProducts(false))
    teamopsApi.listPersons().then(setPersons).catch(() => setPersons([]))
  }, [open, task])

  const needsRelease = classification === "melhoria"
  const allowNewProduct = classification === "desenvolvimento" || classification === "implantacao"

  const canConfirm = useMemo(() => {
    if (!classification || moduleError) return false
    if (allowNewProduct) {
      if (productMode === "new") return newName.trim().length >= 2
      return !!selectedProductId
    }
    // melhoria: produto existente + release.
    return !!selectedProductId && relVersao.trim().length >= 1
  }, [classification, moduleError, allowNewProduct, productMode, newName, selectedProductId, relVersao])

  async function handleConfirm() {
    if (!task || !classification) return
    setSaving(true)
    try {
      let productId = selectedProductId
      // Cadastro inline mínimo de produto (apenas dev/implantação).
      if (allowNewProduct && productMode === "new") {
        const created = await produtosApi.createProduct({
          name: newName.trim(),
          description: newDescription.trim() || undefined,
          categoria: newCategoria || undefined,
          // Produto corporativo: o PO é definido por serviço, não no produto.
          responsavel_person_id: newCorporativo ? undefined : (newPoPersonId || undefined),
          corporativo: newCorporativo,
          origin_task_id: task.id,
        })
        productId = created.id
      }
      if (!productId) {
        toast.error("Selecione ou cadastre um produto.")
        return
      }
      let releaseId: string | null = null
      if (needsRelease) {
        const release = await produtosApi.addRelease(productId, {
          versao: relVersao.trim(),
          nome: relNome.trim() || null,
          tipo: relTipo,
          descricao_mudanca: relDescricao.trim() || null,
          status: "planejada",
        })
        releaseId = release.id
      }
      await onConfirm({ classification, productId, releaseId })
    } catch (err) {
      toast.error(apiMessage(err, "Não foi possível concluir a classificação."))
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onCancel() }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {mode === "late" ? "Classificar projeto" : "Classificar card para sair do backlog"}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            {mode === "late"
              ? "Este projeto avançou sem classificação. Vincule-o ao portfólio de Produtos."
              : "Para avançar este card é preciso classificá-lo e vinculá-lo ao portfólio de Produtos."}
          </p>

          {moduleError && (
            <div className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {moduleError}
            </div>
          )}

          {/* Tipo de classificação */}
          <div className="space-y-1.5">
            <Label>Tipo</Label>
            <div className="flex gap-2">
              {CLASSIFICATIONS.map((c) => (
                <button
                  key={c.value}
                  type="button"
                  onClick={() => setClassification(c.value)}
                  className={`flex-1 rounded-md border px-3 py-2 text-sm font-medium transition ${
                    classification === c.value ? "border-primary bg-primary/10 text-primary" : "text-muted-foreground hover:bg-muted"
                  }`}
                >
                  {c.label}
                </button>
              ))}
            </div>
            {classification && (
              <p className="text-[11px] text-muted-foreground">
                {CLASSIFICATIONS.find((c) => c.value === classification)?.hint}
              </p>
            )}
          </div>

          {/* Vínculo de produto */}
          {classification && !moduleError && (
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <Label>Produto</Label>
                {allowNewProduct && (
                  <button
                    type="button"
                    onClick={() => setProductMode((m) => (m === "new" ? "select" : "new"))}
                    className="flex items-center gap-1 text-xs font-medium text-primary hover:underline"
                  >
                    {productMode === "new" ? (<><X size={13} /> Usar existente</>) : (<><Plus size={13} /> Novo produto</>)}
                  </button>
                )}
              </div>

              {productMode === "select" || !allowNewProduct ? (
                <>
                  <ProductSearchSelect
                    products={products}
                    value={selectedProductId}
                    onChange={setSelectedProductId}
                    disabled={saving}
                    loading={loadingProducts}
                  />
                  {needsRelease && products.length === 0 && !loadingProducts && (
                    <p className="text-[11px] text-muted-foreground">
                      Nenhum produto cadastrado. Cadastre um produto no módulo Produtos antes de registrar uma melhoria.
                    </p>
                  )}
                </>
              ) : (
                <div className="space-y-2 rounded-md border p-3">
                  <div className="space-y-1.5">
                    <Label htmlFor="bc-name">Nome do produto</Label>
                    <Input id="bc-name" value={newName} maxLength={200} autoFocus
                      onChange={(e) => setNewName(e.target.value)} />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="bc-desc">Descrição</Label>
                    <Textarea id="bc-desc" rows={2} value={newDescription}
                      onChange={(e) => setNewDescription(e.target.value)} />
                  </div>
                  <div className="rounded-md border border-dashed p-2.5">
                    <label className="flex items-center gap-2 text-sm">
                      <input type="checkbox" checked={newCorporativo}
                        onChange={(e) => setNewCorporativo(e.target.checked)}
                        className="h-4 w-4 rounded border-input accent-primary" />
                      <span>Produto <strong>corporativo</strong></span>
                    </label>
                    <p className="mt-1 text-[11px] text-muted-foreground">
                      Em produtos corporativos o Responsável (PO) não é do produto — é definido por serviço (na aba Serviços).
                    </p>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    {!newCorporativo && (
                      <div className="space-y-1.5">
                        <Label>PO (responsável)</Label>
                        <Select value={newPoPersonId || "__none__"} onValueChange={(v) => setNewPoPersonId(v === "__none__" ? "" : v)}>
                          <SelectTrigger><SelectValue placeholder="Selecione o PO" /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="__none__">Sem responsável</SelectItem>
                            {persons.map((p) => (
                              <SelectItem key={p.id} value={p.id}>{p.full_name}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    )}
                    <div className="space-y-1.5">
                      <Label>Categoria</Label>
                      <Select value={newCategoria || "__none__"} onValueChange={(v) => setNewCategoria(v === "__none__" ? "" : (v as ProductCategoria))}>
                        <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="__none__">Sem categoria</SelectItem>
                          {CATEGORIA_OPTS.map((c) => (
                            <SelectItem key={c} value={c}>{CATEGORIA_LABEL[c]}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <p className="text-[11px] text-muted-foreground">
                    Cadastro mínimo — complete os detalhes depois no módulo Produtos.
                  </p>
                </div>
              )}
            </div>
          )}

          {/* Release (melhoria) */}
          {needsRelease && !moduleError && (
            <div className="space-y-2 rounded-md border p-3">
              <Label>Release do produto</Label>
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1.5">
                  <Label htmlFor="bc-versao">Versão</Label>
                  <Input id="bc-versao" placeholder="ex: 1.2.0" value={relVersao} maxLength={60}
                    onChange={(e) => setRelVersao(e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="bc-relnome">Nome (opcional)</Label>
                  <Input id="bc-relnome" value={relNome} maxLength={200}
                    onChange={(e) => setRelNome(e.target.value)} />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label>Tipo da release</Label>
                <Select value={relTipo} onValueChange={(v) => setRelTipo(v as ReleaseTipo)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {RELEASE_TIPOS.map((t) => (
                      <SelectItem key={t} value={t}>{t.replace(/_/g, " ")}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="bc-reldesc">Descrição da mudança (opcional)</Label>
                <Textarea id="bc-reldesc" rows={2} value={relDescricao}
                  onChange={(e) => setRelDescricao(e.target.value)} />
              </div>
              <p className="text-[11px] text-muted-foreground">
                A release é criada como “planejada” — ajuste depois no módulo Produtos.
              </p>
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onCancel} disabled={saving}>Cancelar</Button>
          <Button onClick={() => void handleConfirm()} disabled={!canConfirm || saving}>
            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Classificar e avançar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
