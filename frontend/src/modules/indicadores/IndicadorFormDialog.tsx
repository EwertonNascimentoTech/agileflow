import { useEffect, useState } from "react"
import { Loader2 } from "lucide-react"

import {
  indicadoresApi, type AreaRefMini, type Categoria, type FonteDados, type FonteMetrica, type Granularidade,
  type Indicador, type IndicadorCreate, type PersonMini, type Sentido,
} from "@/api/indicadores"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { toast } from "@/lib/toast"
import { loadLoggedPersonAutoFill } from "@/lib/loggedPersonContext"
import {
  ANOS, CATEGORIA_LABEL, CATEGORIA_OPTS, FONTE_LABEL, FONTE_OPTS, GRANULARIDADE_LABEL, GRANULARIDADE_OPTS,
  MESES, METRICA_LABEL, METRICA_OPTS, SENTIDO_LABEL, SENTIDO_OPTS, STATUS_LABEL, STATUS_OPTS,
} from "@/modules/indicadores/constants"

const NONE = "__none__"
const num = (s: string): number | null => (s.trim() === "" ? null : Number(s))

export function IndicadorFormDialog({ open, onOpenChange, indicador, onSaved }: {
  open: boolean; onOpenChange: (v: boolean) => void; indicador?: Indicador | null; onSaved: (i: Indicador) => void
}) {
  const editing = !!indicador
  const [areas, setAreas] = useState<AreaRefMini[]>([])
  const [persons, setPersons] = useState<PersonMini[]>([])
  const [saving, setSaving] = useState(false)

  const [codigo, setCodigo] = useState("")
  const [nome, setNome] = useState("")
  const [categoria, setCategoria] = useState<Categoria>("estrategico")
  const [descricao, setDescricao] = useState("")
  const [objetivo, setObjetivo] = useState("")
  const [areaId, setAreaId] = useState(NONE)
  const [responsavelId, setResponsavelId] = useState(NONE)
  const [unidade, setUnidade] = useState("")
  const [formula, setFormula] = useState("")
  const [fonte, setFonte] = useState("")
  const [granularidade, setGranularidade] = useState<Granularidade>("mensal")
  const [periodicidade, setPeriodicidade] = useState("")
  const [sentido, setSentido] = useState<Sentido>("maior_melhor")
  const [metaMin, setMetaMin] = useState("")
  const [metaMax, setMetaMax] = useState("")
  const [tolerancia, setTolerancia] = useState("20")
  const [status, setStatus] = useState<"ativo" | "inativo">("ativo")
  const [anos, setAnos] = useState<number[]>([new Date().getFullYear()])
  // Origem dos dados (manual × portfólio)
  const [origem, setOrigem] = useState<FonteDados>("manual")
  const [metrica, setMetrica] = useState<FonteMetrica>("servicos_publicados")
  const [corteMes, setCorteMes] = useState<number>(new Date().getMonth() + 1)
  const [corteAno, setCorteAno] = useState<number>(new Date().getFullYear())

  useEffect(() => {
    if (!open) return
    Promise.all([
      indicadoresApi.listAreas().catch(() => []),
      indicadoresApi.listPersons().catch(() => []),
    ]).then(([a, p]) => { setAreas(a); setPersons(p) })

    setCodigo(indicador?.codigo ?? "")
    setNome(indicador?.nome ?? "")
    setCategoria(indicador?.categoria ?? "estrategico")
    setDescricao(indicador?.descricao ?? "")
    setObjetivo(indicador?.objetivo_estrategico ?? "")
    setAreaId(indicador?.area?.id ?? NONE)
    setResponsavelId(indicador?.responsavel?.id ?? NONE)
    setUnidade(indicador?.unidade_medida ?? "")
    setFormula(indicador?.formula_calculo ?? "")
    setFonte(indicador?.fonte_dados ?? "")
    setGranularidade(indicador?.granularidade ?? "mensal")
    setPeriodicidade(indicador?.periodicidade_atualizacao ?? "")
    setSentido(indicador?.sentido ?? "maior_melhor")
    setMetaMin(indicador?.meta_min != null ? String(indicador.meta_min) : "")
    setMetaMax(indicador?.meta_max != null ? String(indicador.meta_max) : "")
    setTolerancia(indicador?.tolerancia_pct != null ? String(indicador.tolerancia_pct) : "20")
    setStatus(indicador?.status ?? "ativo")
    setAnos([new Date().getFullYear()])
    setOrigem(indicador?.fonte ?? "manual")
    setMetrica(indicador?.fonte_metrica ?? "servicos_publicados")
    if (indicador?.fonte_corte) {
      const [y, m] = indicador.fonte_corte.split("-").map(Number)
      setCorteAno(y); setCorteMes(m)
    } else {
      setCorteAno(new Date().getFullYear()); setCorteMes(new Date().getMonth() + 1)
    }

    // Novo indicador: pré-preenche responsável com a pessoa logada
    if (!indicador) {
      loadLoggedPersonAutoFill().then((me) => { if (me?.personId) setResponsavelId(me.personId) }).catch(() => {})
    }
  }, [open, indicador])

  async function save() {
    if (!codigo.trim() || !nome.trim()) return
    if (sentido === "faixa_ideal" && (metaMin.trim() === "" || metaMax.trim() === "")) {
      toast.error("Faixa ideal exige meta mínima e máxima.")
      return
    }
    if (!editing && anos.length === 0) {
      toast.error("Selecione ao menos um ano para gerar os acompanhamentos.")
      return
    }
    setSaving(true)
    const sel = (v: string) => (v === NONE ? null : v)
    const base: IndicadorCreate = {
      codigo: codigo.trim(), nome: nome.trim(), categoria, descricao: descricao.trim() || null,
      objetivo_estrategico: objetivo.trim() || null, area_id: sel(areaId), responsavel_person_id: sel(responsavelId),
      unidade_medida: unidade.trim() || null, formula_calculo: formula.trim() || null, fonte_dados: fonte.trim() || null,
      granularidade, periodicidade_atualizacao: periodicidade.trim() || null, sentido,
      meta_min: sentido === "faixa_ideal" ? num(metaMin) : null,
      meta_max: sentido === "faixa_ideal" ? num(metaMax) : null,
      tolerancia_pct: num(tolerancia) ?? 20,
      status,
      anos_referencia: anos,
      fonte: origem,
      fonte_metrica: origem === "portfolio" ? metrica : null,
      fonte_corte: origem === "portfolio" ? `${corteAno}-${String(corteMes).padStart(2, "0")}-01` : null,
    }
    try {
      const saved = editing
        ? await indicadoresApi.update(indicador!.id, base)
        : await indicadoresApi.create(base)
      toast.success(editing ? "Indicador atualizado." : "Indicador criado.")
      onSaved(saved)
    } catch (e) {
      const detail = (e as { response?: { data?: { detail?: string } } })?.response?.data?.detail
      toast.error(detail || "Não foi possível salvar.")
    } finally { setSaving(false) }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle>{editing ? "Editar indicador" : "Novo indicador"}</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="space-y-1.5"><Label>Código</Label><Input value={codigo} onChange={(e) => setCodigo(e.target.value)} placeholder="Ex.: IND-001" /></div>
            <div className="space-y-1.5 sm:col-span-2"><Label>Nome</Label><Input value={nome} onChange={(e) => setNome(e.target.value)} /></div>
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <FieldSelect label="Categoria" value={categoria} onChange={(v) => setCategoria(v as Categoria)}
              options={CATEGORIA_OPTS.map((c) => [c, CATEGORIA_LABEL[c]])} />
            <FieldSelect label="Granularidade" value={granularidade} onChange={(v) => setGranularidade(v as Granularidade)}
              options={GRANULARIDADE_OPTS.map((g) => [g, GRANULARIDADE_LABEL[g]])} />
            <FieldSelect label="Sentido" value={sentido} onChange={(v) => setSentido(v as Sentido)}
              options={SENTIDO_OPTS.map((s) => [s, SENTIDO_LABEL[s]])} />
          </div>

          <div className="space-y-1.5"><Label>Descrição</Label><Textarea rows={2} value={descricao} onChange={(e) => setDescricao(e.target.value)} /></div>
          <div className="space-y-1.5"><Label>Objetivo estratégico relacionado</Label><Textarea rows={2} value={objetivo} onChange={(e) => setObjetivo(e.target.value)} /></div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Área responsável</Label>
              <Select value={areaId} onValueChange={setAreaId}>
                <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>—</SelectItem>
                  {areas.map((a) => <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Responsável pelo indicador</Label>
              <Select value={responsavelId} onValueChange={setResponsavelId}>
                <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>—</SelectItem>
                  {persons.map((p) => <SelectItem key={p.id} value={p.id}>{p.full_name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <div className="space-y-1.5"><Label>Unidade de medida</Label><Input value={unidade} onChange={(e) => setUnidade(e.target.value)} placeholder="%, R$, dias..." /></div>
            <div className="space-y-1.5"><Label>Periodicidade de atualização</Label><Input value={periodicidade} onChange={(e) => setPeriodicidade(e.target.value)} placeholder="Ex.: Mensal" /></div>
            <FieldSelect label="Status" value={status} onChange={(v) => setStatus(v as "ativo" | "inativo")}
              options={STATUS_OPTS.map((s) => [s, STATUS_LABEL[s]])} />
          </div>

          <div className="space-y-1.5"><Label>Fórmula de cálculo</Label><Textarea rows={2} value={formula} onChange={(e) => setFormula(e.target.value)} /></div>
          <div className="space-y-1.5"><Label>Fonte de dados</Label><Input value={fonte} onChange={(e) => setFonte(e.target.value)} /></div>

          {/* ── Origem do acompanhamento (Manual × Portfólio) ── */}
          <div className="space-y-3 rounded-md border border-dashed p-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <FieldSelect label="Origem dos dados" value={origem} onChange={(v) => setOrigem(v as FonteDados)}
                options={FONTE_OPTS.map((f) => [f, FONTE_LABEL[f]])} />
              {origem === "portfolio" && (
                <FieldSelect label="Métrica do portfólio" value={metrica} onChange={(v) => setMetrica(v as FonteMetrica)}
                  options={METRICA_OPTS.map((m) => [m, METRICA_LABEL[m]])} />
              )}
            </div>
            {origem === "portfolio" && (
              <>
                <div className="grid gap-3 sm:grid-cols-2">
                  <FieldSelect label="Portfólio a partir do mês" value={String(corteMes)} onChange={(v) => setCorteMes(Number(v))}
                    options={MESES.map(([n, l]) => [String(n), l])} />
                  <FieldSelect label="Ano de corte" value={String(corteAno)} onChange={(v) => setCorteAno(Number(v))}
                    options={ANOS.map((y) => [String(y), String(y)])} />
                </div>
                <p className="text-[11px] text-muted-foreground">
                  Os meses a partir do corte vêm automaticamente do portfólio (Realizado calculado); meses anteriores ficam manuais.
                  A Meta (alvo) continua manual em todos. Cada mês pode ser alternado depois na tela do indicador.
                </p>
              </>
            )}
          </div>

          {sentido === "faixa_ideal" && (
            <div className="grid gap-3 rounded-md border border-dashed p-3 sm:grid-cols-3">
              <div className="space-y-1.5"><Label>Meta mínima (ideal)</Label><Input type="number" value={metaMin} onChange={(e) => setMetaMin(e.target.value)} /></div>
              <div className="space-y-1.5"><Label>Meta máxima (ideal)</Label><Input type="number" value={metaMax} onChange={(e) => setMetaMax(e.target.value)} /></div>
              <div className="space-y-1.5"><Label>Tolerância "Em atenção" (%)</Label><Input type="number" value={tolerancia} onChange={(e) => setTolerancia(e.target.value)} /></div>
            </div>
          )}

          {!editing && (
            <div className="space-y-1.5">
              <Label>Gerar acompanhamentos dos anos</Label>
              <div className="flex flex-wrap gap-2">
                {ANOS.map((y) => {
                  const on = anos.includes(y)
                  return (
                    <button
                      key={y}
                      type="button"
                      onClick={() => setAnos((prev) => prev.includes(y) ? prev.filter((x) => x !== y) : [...prev, y].sort((a, b) => a - b))}
                      className={`rounded-md border px-3 py-1.5 text-sm transition ${on ? "border-primary bg-primary/10 font-medium text-primary" : "text-muted-foreground hover:bg-muted"}`}
                      aria-pressed={on}
                    >
                      {y}
                    </button>
                  )
                })}
              </div>
              <p className="text-[11px] text-muted-foreground">
                Selecione um ou mais anos — indicadores plurianuais geram os períodos de cada ano. Outros anos podem ser gerados depois na tela do indicador.
              </p>
            </div>
          )}
        </div>
        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={() => void save()} disabled={saving || !codigo.trim() || !nome.trim()}>
            {saving && <Loader2 size={14} className="mr-1.5 animate-spin" />}{editing ? "Salvar" : "Criar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function FieldSelect({ label, value, onChange, options }: {
  label: string; value: string; onChange: (v: string) => void; options: [string, string][]
}) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger><SelectValue /></SelectTrigger>
        <SelectContent>{options.map(([v, l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}</SelectContent>
      </Select>
    </div>
  )
}
