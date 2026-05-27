import { useEffect, useState } from "react"
import { useNavigate, useParams } from "react-router-dom"
import { ArrowLeft, Loader2, FileSignature, Check, ShieldCheck, Printer } from "lucide-react"
import { contractsApi } from "@/api/crm"
import type { Contract, ContractStatus, ContractSign } from "@/api/crm"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog"
import { Switch } from "@/components/ui/switch"

const STATUS_LABELS: Record<ContractStatus, string> = {
  draft: "Rascunho", ready: "Pronto", sent: "Enviado", signed: "Assinado", cancelled: "Cancelado",
}
const STATUS_COLORS: Record<ContractStatus, "secondary" | "success" | "destructive" | "outline"> = {
  draft: "outline", ready: "secondary", sent: "secondary", signed: "success", cancelled: "destructive",
}

const fmtCurrency = (v: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(Number(v))

export default function ContractDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const [contract, setContract] = useState<Contract | null>(null)
  const [loading, setLoading] = useState(true)
  const [signDialog, setSignDialog] = useState(false)
  const [signForm, setSignForm] = useState<ContractSign>({ signer_name: "", signer_document: "", signer_email: "", accept_terms: false })
  const [signing, setSigning] = useState(false)
  const [error, setError] = useState("")

  useEffect(() => {
    if (!id) return
    contractsApi.get(id).then(setContract).finally(() => setLoading(false))
  }, [id])

  async function changeStatus(status: ContractStatus) {
    if (!contract) return
    const updated = await contractsApi.update(contract.id, { status })
    setContract(updated)
  }

  async function sign() {
    if (!contract) return
    if (!signForm.signer_name.trim()) return
    if (!signForm.accept_terms) { setError("É preciso aceitar os termos."); return }
    setSigning(true)
    setError("")
    try {
      const signed = await contractsApi.sign(contract.id, signForm)
      setContract(signed)
      setSignDialog(false)
    } catch (err: unknown) {
      const e = err as { response?: { data?: { detail?: string } } }
      setError(e?.response?.data?.detail ?? "Erro ao assinar.")
    } finally {
      setSigning(false)
    }
  }

  if (loading) return <div className="space-y-3"><Skeleton className="h-8 w-48" /><Skeleton className="h-96" /></div>
  if (!contract) return <div className="text-center py-16 text-muted-foreground">Contrato não encontrado.</div>

  return (
    <div className="space-y-4 max-w-4xl">
      <div className="flex items-center gap-3 flex-wrap">
        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => navigate("/app/modules/crm/contracts")}>
          <ArrowLeft size={15} />
        </Button>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-xs font-mono text-muted-foreground">{contract.number}</span>
            <Badge variant={STATUS_COLORS[contract.status]} className="text-xs">
              {STATUS_LABELS[contract.status]}
            </Badge>
          </div>
          <h2 className="text-lg font-bold leading-tight">{contract.title}</h2>
        </div>
        <div className="flex gap-1.5 flex-wrap">
          <Button size="sm" variant="outline" onClick={() => window.print()} className="gap-1.5">
            <Printer size={13} /> Imprimir
          </Button>
          {contract.status === "draft" && (
            <Button size="sm" onClick={() => changeStatus("ready")}>Marcar como pronto</Button>
          )}
          {(contract.status === "ready" || contract.status === "sent") && (
            <>
              {contract.status === "ready" && (
                <Button size="sm" onClick={() => changeStatus("sent")}>Marcar como enviado</Button>
              )}
              <Button size="sm" onClick={() => setSignDialog(true)} className="gap-1.5">
                <FileSignature size={13} /> Assinar
              </Button>
            </>
          )}
        </div>
      </div>

      {error && <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>}

      <div className="grid lg:grid-cols-[1fr_280px] gap-4">
        <Card>
          <CardContent className="p-6">
            <pre className="whitespace-pre-wrap font-sans text-sm leading-relaxed">{contract.body}</pre>
          </CardContent>
        </Card>

        <div className="space-y-3">
          <Card>
            <CardContent className="p-3 space-y-2 text-sm">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Cliente</p>
              <p className="font-medium">{contract.client_name ?? "—"}</p>
              {contract.client_document && <p className="text-xs text-muted-foreground font-mono">{contract.client_document}</p>}
              {contract.client_email && <p className="text-xs text-muted-foreground">{contract.client_email}</p>}
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-3 space-y-2 text-sm">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Valores</p>
              <p className="text-lg font-bold text-emerald-600">{fmtCurrency(contract.total_value)}</p>
              {contract.start_date && <p className="text-xs">Início: {new Date(contract.start_date).toLocaleDateString("pt-BR")}</p>}
              {contract.end_date && <p className="text-xs">Fim: {new Date(contract.end_date).toLocaleDateString("pt-BR")}</p>}
            </CardContent>
          </Card>

          {contract.signed_at && (
            <Card className="border-emerald-200 bg-emerald-50/50">
              <CardContent className="p-3 space-y-2 text-sm">
                <div className="flex items-center gap-2">
                  <ShieldCheck size={16} className="text-emerald-600" />
                  <p className="text-xs font-semibold uppercase tracking-wide text-emerald-700">Assinado</p>
                </div>
                <p className="font-medium">{contract.signer_name}</p>
                {contract.signer_document && <p className="text-xs text-muted-foreground font-mono">{contract.signer_document}</p>}
                <p className="text-[10px] text-muted-foreground">
                  {new Date(contract.signed_at).toLocaleString("pt-BR")}
                </p>
                {contract.signer_ip && <p className="text-[10px] text-muted-foreground">IP: {contract.signer_ip}</p>}
                {contract.signature_hash && (
                  <div className="pt-2 border-t border-emerald-200">
                    <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-0.5">Hash</p>
                    <p className="text-[9px] font-mono break-all text-muted-foreground">{contract.signature_hash}</p>
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {contract.proposal_id && (
            <Card>
              <CardContent className="p-3 text-sm">
                <button
                  onClick={() => navigate(`/app/modules/crm/proposals/${contract.proposal_id}`)}
                  className="text-xs text-primary hover:underline"
                >
                  Ver proposta de origem →
                </button>
              </CardContent>
            </Card>
          )}
        </div>
      </div>

      <Dialog open={signDialog} onOpenChange={setSignDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Assinar contrato</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <Alert>
              <AlertDescription className="text-xs">
                A assinatura gera um hash criptográfico imutável vinculando o nome, documento e IP do signatário.
                Após assinado, o contrato não pode mais ser alterado.
              </AlertDescription>
            </Alert>
            <div className="space-y-1.5">
              <Label>Nome do signatário *</Label>
              <Input value={signForm.signer_name} onChange={e => setSignForm({ ...signForm, signer_name: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label>CPF/CNPJ</Label>
              <Input value={signForm.signer_document} onChange={e => setSignForm({ ...signForm, signer_document: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label>E-mail</Label>
              <Input type="email" value={signForm.signer_email} onChange={e => setSignForm({ ...signForm, signer_email: e.target.value })} />
            </div>
            <div className="flex items-center justify-between border-t pt-3">
              <Label className="text-xs">Aceito os termos do contrato e confirmo a assinatura.</Label>
              <Switch checked={signForm.accept_terms} onCheckedChange={v => setSignForm({ ...signForm, accept_terms: v })} />
            </div>
            {error && <Alert variant="destructive"><AlertDescription className="text-xs">{error}</AlertDescription></Alert>}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSignDialog(false)}>Cancelar</Button>
            <Button onClick={sign} disabled={signing || !signForm.signer_name.trim() || !signForm.accept_terms} className="gap-1.5">
              {signing ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />}
              Confirmar Assinatura
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
