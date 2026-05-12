import { useEffect, useState } from "react"
import { useNavigate } from "react-router-dom"
import { useForm, type Resolver } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { Building2, Plus, Search, Loader2, Users, MessageSquare } from "lucide-react"
import { companiesApi } from "@/api/atendimento"
import type { CompanySummary } from "@/api/atendimento"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { EmptyState } from "@/components/EmptyState"

const schema = z.object({
  name: z.string().min(2, "Mínimo 2 caracteres"),
  trade_name: z.string().optional(),
  document: z.string().optional(),
  email: z.string().email("E-mail inválido").optional().or(z.literal("")),
  phone: z.string().optional(),
  website: z.string().optional(),
  industry: z.string().optional(),
})
type FormData = z.infer<typeof schema>

function getApiError(err: unknown): string {
  const e = err as { response?: { data?: { detail?: unknown } } }
  const d = e.response?.data?.detail
  if (typeof d === "string") return d
  if (Array.isArray(d)) return d.map((x) => x.msg).join(", ")
  return "Erro ao processar."
}

export default function CompaniesPage() {
  const navigate = useNavigate()
  const [companies, setCompanies] = useState<CompanySummary[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState("")
  const [open, setOpen] = useState(false)
  const [serverError, setServerError] = useState("")

  const { register, handleSubmit, reset, formState: { errors, isSubmitting } } = useForm<FormData>({
    resolver: zodResolver(schema) as Resolver<FormData>,
  })

  useEffect(() => {
    companiesApi.list({ limit: 200, active_only: false })
      .then(setCompanies)
      .finally(() => setLoading(false))
  }, [])

  const filtered = companies.filter(c =>
    c.name.toLowerCase().includes(search.toLowerCase()) ||
    (c.trade_name ?? "").toLowerCase().includes(search.toLowerCase()) ||
    (c.document ?? "").includes(search)
  )

  async function onSubmit(data: FormData) {
    setServerError("")
    try {
      const payload = { ...data, email: data.email || undefined }
      const created = await companiesApi.create(payload)
      setCompanies(prev => [
        { ...created, contact_count: 0, attendance_count: 0 } as CompanySummary,
        ...prev,
      ])
      reset()
      setOpen(false)
      navigate(`/app/modules/atendimento/companies/${created.id}`)
    } catch (err) {
      setServerError(getApiError(err))
    }
  }

  return (
    <div className="space-y-4 h-full overflow-y-auto">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold">Empresas</h2>
          <p className="text-sm text-muted-foreground">
            {loading ? "…" : `${companies.length} empresa${companies.length !== 1 ? "s" : ""}`}
          </p>
        </div>
        <Button size="sm" onClick={() => { reset(); setServerError(""); setOpen(true) }} className="gap-1.5">
          <Plus size={14} /> Nova Empresa
        </Button>
      </div>

      <div className="relative max-w-sm">
        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
        <Input placeholder="Buscar por nome, fantasia ou CNPJ…" value={search} onChange={e => setSearch(e.target.value)} className="pl-9 h-9" />
      </div>

      {loading ? (
        <div className="space-y-2">
          {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-16 rounded-lg" />)}
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={Building2}
          title={search ? "Nenhuma empresa encontrada" : "Nenhuma empresa cadastrada"}
          description={search ? "Tente buscar por outro termo." : "Cadastre a primeira empresa para vincular contatos e atendimentos."}
          action={!search ? { label: "Nova Empresa", onClick: () => { reset(); setServerError(""); setOpen(true) } } : undefined}
        />
      ) : (
        <div className="space-y-2">
          {filtered.map(c => (
            <Card
              key={c.id}
              className={`cursor-pointer hover:shadow-md transition-shadow ${!c.is_active ? "opacity-60" : ""}`}
              onClick={() => navigate(`/app/modules/atendimento/companies/${c.id}`)}
            >
              <CardContent className="p-4 flex items-center gap-3">
                <div className="h-10 w-10 rounded-lg bg-primary/10 text-primary flex items-center justify-center shrink-0">
                  <Building2 size={18} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="font-semibold text-sm truncate">{c.name}</p>
                    {!c.is_active && <span className="text-[10px] text-muted-foreground">inativa</span>}
                  </div>
                  <div className="flex items-center gap-2 text-xs text-muted-foreground mt-0.5">
                    {c.trade_name && <span className="truncate">{c.trade_name}</span>}
                    {c.industry && <><span>·</span><span>{c.industry}</span></>}
                    {c.document && <><span>·</span><span className="font-mono">{c.document}</span></>}
                  </div>
                </div>
                <div className="flex items-center gap-3 text-xs text-muted-foreground shrink-0">
                  <span className="flex items-center gap-1"><Users size={11} /> {c.contact_count}</span>
                  <span className="flex items-center gap-1"><MessageSquare size={11} /> {c.attendance_count}</span>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Nova Empresa</DialogTitle></DialogHeader>
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-3">
            {serverError && <Alert variant="destructive"><AlertDescription>{serverError}</AlertDescription></Alert>}

            <div className="space-y-1.5">
              <Label>Razão social *</Label>
              <Input placeholder="Acme Ltda" {...register("name")} />
              {errors.name && <p className="text-xs text-destructive">{errors.name.message}</p>}
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Nome fantasia</Label>
                <Input placeholder="Acme" {...register("trade_name")} />
              </div>
              <div className="space-y-1.5">
                <Label>CNPJ</Label>
                <Input placeholder="00.000.000/0000-00" {...register("document")} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>E-mail</Label>
                <Input type="email" placeholder="contato@acme.com" {...register("email")} />
                {errors.email && <p className="text-xs text-destructive">{errors.email.message}</p>}
              </div>
              <div className="space-y-1.5">
                <Label>Telefone</Label>
                <Input placeholder="(11) 0000-0000" {...register("phone")} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Site</Label>
                <Input placeholder="acme.com" {...register("website")} />
              </div>
              <div className="space-y-1.5">
                <Label>Segmento</Label>
                <Input placeholder="Tecnologia" {...register("industry")} />
              </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting && <Loader2 size={13} className="animate-spin mr-1.5" />}
                Criar
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}
