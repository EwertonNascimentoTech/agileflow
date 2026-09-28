import { useEffect, useMemo, useState, type ReactNode } from "react"
import { useNavigate } from "react-router-dom"
import { AlertTriangle, CalendarClock, CheckCircle2, ChevronDown, Clock, Flag, Gauge, Info, Layers, Presentation, Rocket, ShieldAlert, Star, TrendingUp, Users } from "lucide-react"

import {
  projetosApi,
  type PoOption,
  type PoOverviewItem,
  type PoPortfolioItem,
  type PoPortfolioResponse,
  type PriorityConfidenceLevel,
  type PriorityCriterion,
  type PriorityPillar,
  type PriorityQuadrant,
  type PrioritySettings,
  type ProjectDefaultFormField,
  type QuadrantCode,
} from "@/api/projetos"
import { teamopsApi } from "@/api/teamops"
import { parseDefaultFieldOptions } from "@/modules/projetos/defaultFormOptions"
import { useAuth } from "@/contexts/AuthContext"
import { EmptyState } from "@/components/EmptyState"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import {
  Card, FilterSelect, KpiCount, KpiRow, Pill, SectionCard, Segmented, TABLE, type KpiTone,
} from "@/components/ds"
import { QuadrantBadge } from "@/modules/projetos/priority/QuadrantBadge"
import { PriorityMatrixSvg, type MatrixPoint } from "@/modules/projetos/priority/PriorityMatrixSvg"
import { ProjectPriorityDialog } from "@/modules/projetos/priority/ProjectPriorityDialog"
import { CompletionBadge, completionOf } from "@/modules/projetos/CompletionBadge"

const ALL_POS = "__all__" // sentinela: portfólio consolidado de todos os POs
const ALL_DIM = "__all__" // sentinela: sem filtro de diretoria/área (Radix proíbe value="")

function fmtShortDate(s: string | null): string {
  if (!s) return "—"
  return new Date(s).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" })
}
const HEALTH_COLOR: Record<string, string> = { verde: "#16A34A", amarelo: "#CA8A04", vermelho: "#DC2626" }
const HEALTH_LABEL: Record<string, string> = { verde: "No prazo", amarelo: "Atenção", vermelho: "Risco" }

function HealthDot({
  health,
  tip,
}: {
  health: string
  tip?: string
}) {
  const label = tip || HEALTH_LABEL[health] || health
  return (
    <span className="group/hd relative inline-flex shrink-0">
      <span
        className="inline-block h-2.5 w-2.5 cursor-help rounded-full ring-2 ring-transparent group-hover/hd:ring-offset-1"
        style={{ backgroundColor: HEALTH_COLOR[health] ?? "#6B7280" }}
        aria-label={label}
      />
      <span className="pointer-events-none absolute left-1/2 top-full z-[60] mt-1.5 hidden w-max max-w-[240px] -translate-x-1/2 rounded-md border bg-popover px-2.5 py-1.5 text-left text-[11px] leading-snug text-popover-foreground shadow-md group-hover/hd:block">
        <span className="font-semibold">{HEALTH_LABEL[health] ?? health}</span>
        {tip && tip !== (HEALTH_LABEL[health] ?? health) && (
          <span className="mt-0.5 block text-muted-foreground">{tip}</span>
        )}
      </span>
    </span>
  )
}

function riskTipForItem(it: PoPortfolioItem): string {
  const reasons: string[] = []
  if (it.overdue) reasons.push("prazo ultrapassado")
  if (it.breached_count > 0) reasons.push(`${it.breached_count} SLA estourado(s)`)
  if (it.absence_conflict) reasons.push("ausência do responsável no período")
  if (it.blocked_count > 0) reasons.push(`${it.blocked_count} card(s) bloqueado(s)`)
  if (it.overallocated_users.length > 0) reasons.push("sobrecarga de equipe")
  if (it.no_due_date) reasons.push("sem data de prazo")
  if (it.unscored) reasons.push("sem score de prioridade")
  if (reasons.length === 0) {
    if (it.health === "vermelho") return "Progresso muito atrás do esperado no cronograma"
    if (it.health === "amarelo") return "Atenção — possível bloqueio ou sobrecarga"
    return "Sem sinais de risco"
  }
  return reasons.join(" · ")
}

function BarRow({ label, value, max, color }: { label: string; value: number; max: number; color?: string }) {
  const pct = max > 0 ? Math.max(2, Math.round((value / max) * 100)) : 0
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between gap-2 text-sm">
        <span className="truncate">{label}</span>
        <span className="shrink-0 tabular-nums text-muted-foreground">{value}</span>
      </div>
      <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
        <div className="h-full rounded-full" style={{ width: `${pct}%`, backgroundColor: color ?? "hsl(var(--primary))" }} />
      </div>
    </div>
  )
}

/**
 * Explica a metodologia de priorização com os parâmetros REAIS configurados pelo tenant:
 * fórmula do impacto efetivo / esforço / densidade, cortes dos quadrantes, critérios e
 * pesos por eixo, pilares (moduladores) e o fator de confiança global vigente.
 */
function MethodologyPanel({
  criteria,
  pillars,
  confidence,
  settings,
}: {
  criteria: PriorityCriterion[]
  pillars: PriorityPillar[]
  confidence: PriorityConfidenceLevel[]
  settings: PrioritySettings | null
}) {
  const byOrder = (a: { order: number }, b: { order: number }) => a.order - b.order
  const impact = criteria.filter((c) => c.axis === "impact" && c.is_active).sort(byOrder)
  const effort = criteria.filter((c) => c.axis === "effort" && c.is_active).sort(byOrder)
  const activePillars = pillars.filter((p) => p.is_active).sort(byOrder)
  const conf = confidence.find((c) => c.id === settings?.confidence_id) ?? null
  const pct = (w: number) => `${Math.round(w * 100)}%`

  const CriteriaList = ({ title, list }: { title: string; list: PriorityCriterion[] }) => (
    <div>
      <p className="mb-1 text-sm font-semibold">{title}</p>
      {list.length === 0 ? (
        <p className="text-xs text-muted-foreground">Nenhum critério ativo.</p>
      ) : (
        <ul className="space-y-0.5">
          {list.map((c) => (
            <li key={c.id} className="flex items-center justify-between gap-2 text-xs">
              <span className="truncate">{c.label}</span>
              <span className="shrink-0 font-mono font-semibold tabular-nums">{pct(c.weight)}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )

  return (
    <div className="mb-3 space-y-3 rounded-xl border bg-muted/30 p-4 text-sm">
      <div className="space-y-1">
        <p className="font-semibold">Como a prioridade é calculada</p>
        <div className="space-y-0.5 font-mono text-[11px] text-muted-foreground">
          <p>Impacto efetivo = (Σ peso × nota do impacto) × modulador do pilar ÷ divisor de confiança</p>
          <p>Esforço = Σ peso × nota do esforço</p>
          <p>Densidade de valor = Impacto efetivo ÷ Esforço <span className="not-italic">(usada para ordenar/desempatar)</span></p>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <CriteriaList title="Critérios de impacto (peso)" list={impact} />
        <CriteriaList title="Critérios de esforço (peso)" list={effort} />
      </div>

      <div>
        <p className="mb-1 text-sm font-semibold">Pilares estratégicos (modulador)</p>
        {activePillars.length === 0 ? (
          <p className="text-xs text-muted-foreground">Nenhum pilar ativo.</p>
        ) : (
          <div className="flex flex-wrap gap-1.5">
            {activePillars.map((p) => (
              <span
                key={p.id}
                className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium text-white"
                style={{ backgroundColor: p.color }}
                title={p.perspective}
              >
                {p.label} ×{Number(p.modifier).toFixed(2)}
              </span>
            ))}
          </div>
        )}
        <p className="mt-1 text-xs text-muted-foreground">
          Quando há mais de um pilar, vale o <strong>maior modulador</strong> entre eles.
        </p>
      </div>

      <div className="grid gap-3 text-xs sm:grid-cols-3">
        <div className="rounded-lg border bg-background p-2.5">
          <p className="text-xs text-muted-foreground">Corte de impacto</p>
          <p className="font-mono text-base font-bold">{settings?.impact_cut ?? "—"}</p>
        </div>
        <div className="rounded-lg border bg-background p-2.5">
          <p className="text-xs text-muted-foreground">Corte de esforço</p>
          <p className="font-mono text-base font-bold">{settings?.effort_cut ?? "—"}</p>
        </div>
        <div className="rounded-lg border bg-background p-2.5">
          <p className="text-xs text-muted-foreground">Confiança (divisor)</p>
          <p className="text-sm font-semibold">{conf ? `${conf.label} ÷${Number(conf.divisor).toFixed(2)}` : "—"}</p>
        </div>
      </div>
      <p className="text-xs text-muted-foreground">
        Os cortes definem os quadrantes: impacto ≥ {settings?.impact_cut ?? "—"} é alto; esforço ≥ {settings?.effort_cut ?? "—"} é alto.
        Dentro de cada quadrante, a ordem é pela densidade de valor.
      </p>
    </div>
  )
}

export default function PODashboardPage() {
  const navigate = useNavigate()
  const { user } = useAuth()
  const [persons, setPersons] = useState<{ id: string; full_name: string }[]>([])
  const [pos, setPos] = useState<PoOption[]>([])
  const [quadrants, setQuadrants] = useState<PriorityQuadrant[]>([])
  const [settings, setSettings] = useState<PrioritySettings | null>(null)
  const [criteria, setCriteria] = useState<PriorityCriterion[]>([])
  const [pillars, setPillars] = useState<PriorityPillar[]>([])
  const [confidence, setConfidence] = useState<PriorityConfidenceLevel[]>([])
  const [showMethod, setShowMethod] = useState(false)
  const [mode, setMode] = useState<"individual" | "gestao">("individual")
  const [selectedKey, setSelectedKey] = useState("") // person_id do PO
  const [diretoria, setDiretoria] = useState(ALL_DIM) // filtro de diretoria
  const [area, setArea] = useState(ALL_DIM) // filtro de área
  const [defaultFields, setDefaultFields] = useState<ProjectDefaultFormField[]>([])
  // Opções dos filtros (tenant-wide) — persistem ao trocar de modo/PO.
  const [availDiretorias, setAvailDiretorias] = useState<string[]>([])
  const [availAreas, setAvailAreas] = useState<string[]>([])
  const [portfolio, setPortfolio] = useState<PoPortfolioResponse | null>(null)
  const [overview, setOverview] = useState<PoOverviewItem[] | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadingPortfolio, setLoadingPortfolio] = useState(false)
  const [refreshKey, setRefreshKey] = useState(0)
  const [presentMode, setPresentMode] = useState(false)
  const [dialogItem, setDialogItem] = useState<PoPortfolioItem | null>(null)
  const [dialogOpen, setDialogOpen] = useState(false)

  // Permissão de pontuar/repriorizar (gateia o modal em modo edição).
  const canScore = !!user && (!!user.permissions?.includes("*") || !!user.permissions?.includes("projetos.priority.score"))

  // Responsável é Pessoa: nomes resolvidos por person_id.
  const nameByUser = useMemo(() => new Map(persons.map((p) => [p.id, p.full_name])), [persons])
  const selectedPo = useMemo(() => pos.find((p) => p.person_id === selectedKey) ?? null, [pos, selectedKey])

  // value → label das opções de diretoria/área (do formulário padrão), fallback no valor cru.
  const labelMaps = useMemo(() => {
    const build = (key: string) => {
      const field = defaultFields.find((f) => f.field_key === key)
      const map = new Map<string, string>()
      if (field) parseDefaultFieldOptions(field).forEach((o) => map.set(o.value, o.label))
      return map
    }
    return { diretoria: build("diretoria"), area: build("area") }
  }, [defaultFields])

  useEffect(() => {
    Promise.all([
      projetosApi.listPos().catch(() => [] as PoOption[]),
      teamopsApi.listPersons().catch(() => []),
      projetosApi.listPriorityQuadrants().catch(() => [] as PriorityQuadrant[]),
      projetosApi.getPrioritySettings().catch(() => null),
      projetosApi.listPriorityCriteria().catch(() => [] as PriorityCriterion[]),
      projetosApi.listPriorityPillars().catch(() => [] as PriorityPillar[]),
      projetosApi.listPriorityConfidence().catch(() => [] as PriorityConfidenceLevel[]),
      projetosApi.getDefaultFormFields().catch(() => [] as ProjectDefaultFormField[]),
    ])
      .then(([poList, ps, qd, st, cr, pl, cf, df]) => {
        setPos(poList); setPersons(ps.map((p) => ({ id: p.id, full_name: p.full_name }))); setQuadrants(qd); setSettings(st)
        setCriteria(cr); setPillars(pl); setConfidence(cf); setDefaultFields(df)
        const mine = poList.find((p) => p.user_id && p.user_id === user?.id)
        // PMO/coordenador abre direto na visão consolidada; PO abre no próprio portfólio.
        const pmo = !!user && (
          user.permissions?.includes("*") ||
          user.role === "company_admin" || user.role === "super_admin" ||
          !!user.permissions?.includes("projetos.project.manage")
        )
        setSelectedKey(pmo ? ALL_POS : (mine?.person_id ?? ALL_POS))
      })
      .finally(() => setLoading(false))
  }, [user?.id])

  useEffect(() => {
    if (mode !== "individual" || !selectedKey) { setPortfolio(null); return }
    if (selectedKey !== ALL_POS && !selectedPo) { setPortfolio(null); return }
    let cancelled = false
    setLoadingPortfolio(true)
    projetosApi.getPoPortfolio(
      selectedKey === ALL_POS ? undefined : selectedPo!.person_id,
      { diretoria: diretoria === ALL_DIM ? null : diretoria, area: area === ALL_DIM ? null : area },
    )
      .then((p) => {
        if (cancelled) return
        setPortfolio(p)
        setAvailDiretorias(p.available_diretorias)
        setAvailAreas(p.available_areas)
      })
      .catch(() => { if (!cancelled) setPortfolio(null) })
      .finally(() => { if (!cancelled) setLoadingPortfolio(false) })
    return () => { cancelled = true }
  }, [mode, selectedKey, selectedPo?.person_id, diretoria, area, refreshKey])

  useEffect(() => {
    if (mode !== "gestao") return
    let cancelled = false
    projetosApi.getPoOverview({ diretoria: diretoria === ALL_DIM ? null : diretoria, area: area === ALL_DIM ? null : area })
      .then((r) => {
        if (cancelled) return
        setOverview(r.items)
        setAvailDiretorias(r.available_diretorias)
        setAvailAreas(r.available_areas)
      })
      .catch(() => { if (!cancelled) setOverview([]) })
    return () => { cancelled = true }
  }, [mode, diretoria, area, refreshKey])

  const items = portfolio?.items ?? []
  const agg = portfolio?.aggregates
  // Itens já chegam na ordem de priorização canônica do backend (quadrante primeiro;
  // densidade de valor desc como desempate dentro do quadrante; sem-score ao fim) — a
  // mesma ordem da Matriz. Aqui só expomos `priority_rank` (densidade) p/ exibição.
  const ranked = useMemo(
    () => items.map((it) => ({ it, density: it.priority_rank })),
    [items],
  )
  const matrixPoints: MatrixPoint[] = useMemo(
    () => items
      .filter((i) => i.impacto_efetivo != null && i.esforco != null)
      .map((i) => ({
        task_id: i.task_id, title: i.title,
        impacto_efetivo: i.impacto_efetivo as number, esforco: i.esforco as number,
        pillar_code: i.pillar_code, perspective: i.perspective, color: i.color,
      })),
    [items],
  )

  function openGantt(it: PoPortfolioItem) {
    navigate(`/app/modules/projetos/${it.project_id}/gantt?root=${it.task_id}`)
  }
  function openModal(it: PoPortfolioItem) {
    setDialogItem(it)
    setDialogOpen(true)
  }

  const densityOf = (i: PoPortfolioItem) =>
    i.impacto_efetivo != null && i.esforco != null && i.esforco > 0 ? i.impacto_efetivo / i.esforco : null

  // "Próximos a iniciar": projetos não iniciados (0% e não concluídos), por densidade de valor.
  const upcomingToStart = useMemo(
    () => items
      .filter((i) => i.progress_pct === 0 && i.completed_count === 0)
      .sort((a, b) => (densityOf(b) ?? b.impacto_efetivo ?? 0) - (densityOf(a) ?? a.impacto_efetivo ?? 0)),
    [items],
  )
  // "Próximas entregas": itens com próxima entrega futura, por data ascendente.
  const upcomingDeliveries = useMemo(
    () => items
      .filter((i) => i.next_due_date != null)
      .sort((a, b) => new Date(a.next_due_date as string).getTime() - new Date(b.next_due_date as string).getTime())
      .slice(0, 8),
    [items],
  )

  if (loading) {
    return (
      <div className="space-y-5">
        <Skeleton className="h-24 rounded-2xl" />
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-6">
          {Array.from({ length: 6 }, (_, i) => <Skeleton key={i} className="h-[74px] rounded-xl" />)}
        </div>
        <Skeleton className="h-80 rounded-2xl" />
      </div>
    )
  }

  if (pos.length === 0) {
    return (
      <Card>
        <EmptyState
          icon={Users}
          title="Nenhum PO configurado"
          description="Cadastre pessoas com o cargo 'PO / Product Owner' (teamops) para usar o painel."
        />
      </Card>
    )
  }

  const cap = agg?.capacity_vs_demand
  const overCap = !!cap && cap.allocated_hours > cap.capacity_hours
  const emRisco = agg?.rag.vermelho ?? 0
  const emAtencao = agg?.rag.amarelo ?? 0

  return (
    <div className="space-y-5">
      {/* Filtros: visão (individual/gestão), PO, diretoria e área */}
      <Card className="p-4">
        <div className="flex flex-wrap items-end gap-3">
          <div className="space-y-1">
            <span className="block text-xs text-muted-foreground">Visão</span>
            <Segmented
              value={mode}
              onChange={setMode}
              options={[{ value: "individual", label: "Individual" }, { value: "gestao", label: "Gestão" }]}
            />
          </div>
          {mode === "individual" && (
            <FilterSelect
              label="Product Owner"
              value={selectedKey}
              onChange={setSelectedKey}
              options={[
                { value: ALL_POS, label: "Todos os POs" },
                ...pos.map((p) => ({ value: p.person_id, label: `${p.full_name}${!p.has_login ? " (sem login)" : ""}` })),
              ]}
            />
          )}
          <FilterSelect
            label="Diretoria"
            value={diretoria}
            onChange={setDiretoria}
            options={[
              { value: ALL_DIM, label: "Todas as diretorias" },
              ...availDiretorias.map((v) => ({ value: v, label: labelMaps.diretoria.get(v) ?? v })),
            ]}
          />
          <FilterSelect
            label="Área"
            value={area}
            onChange={setArea}
            options={[
              { value: ALL_DIM, label: "Todas as áreas" },
              ...availAreas.map((v) => ({ value: v, label: labelMaps.area.get(v) ?? v })),
            ]}
          />
          {(diretoria !== ALL_DIM || area !== ALL_DIM) && (
            <Button variant="ghost" className="h-10 gap-1" onClick={() => { setDiretoria(ALL_DIM); setArea(ALL_DIM) }}>
              Limpar filtros
            </Button>
          )}
          {mode === "individual" && (
            <Button
              variant={presentMode ? "default" : "outline"}
              className="ml-auto h-10 shrink-0 gap-1.5"
              onClick={() => setPresentMode((v) => !v)}
              title="Oculta detalhes operacionais (capacidade, gargalos) para apresentar ao cliente"
            >
              <Presentation size={16} />
              {presentMode ? "Sair da apresentação" : "Modo apresentação"}
            </Button>
          )}
        </div>
      </Card>

      {mode === "gestao" ? (
        <GestaoView overview={overview} onPick={(poId) => { setSelectedKey(poId); setMode("individual") }} />
      ) : loadingPortfolio ? (
        <Skeleton className="h-80 w-full rounded-2xl" />
      ) : items.length === 0 ? (
        <Card>
          <EmptyState icon={Layers} title="Sem projetos" description={selectedKey === ALL_POS ? "Nenhum PO possui projetos/programas atribuídos." : "Este PO não possui projetos/programas atribuídos."} />
        </Card>
      ) : (
        <>
          {/* Resumo executivo — leitura rápida para a reunião */}
          <Card className="p-4">
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              <SummaryItem icon={Star} tone="primary" label="Top prioridades">
                {ranked.filter((r) => !r.it.unscored).slice(0, 3).map((r) => r.it.title).join(" · ") || "—"}
              </SummaryItem>
              <SummaryItem icon={ShieldAlert} tone="red" label="Em risco">
                {agg?.rag.vermelho ?? 0} projeto(s)
              </SummaryItem>
              <SummaryItem icon={Flag} tone="primary" label="Próxima entrega">
                {upcomingDeliveries[0]
                  ? `${upcomingDeliveries[0].title} — ${fmtShortDate(upcomingDeliveries[0].next_due_date)}`
                  : "—"}
              </SummaryItem>
              <SummaryItem icon={CheckCircle2} tone="emerald" label="Concluídos">
                {items.filter((i) => completionOf({ subtreeTotal: i.subtree_total, subtreeCompleted: i.subtree_completed }).isFinalized).length}/{items.length} em etapa final
              </SummaryItem>
            </div>
          </Card>

          {/* KPIs do portfólio (saúde: no prazo = verde, atenção = âmbar, risco = vermelho) */}
          <KpiRow className={presentMode ? "sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-6" : "sm:grid-cols-2 lg:grid-cols-4"}>
            <KpiCount icon={Layers} value={`${agg?.total_projetos ?? 0} / ${agg?.total_programas ?? 0}`} label="Projetos / Programas" />
            <KpiCount
              icon={ShieldAlert}
              value={emRisco}
              label="Em risco (saúde)"
              tone={emRisco > 0 ? "red" : "slate"}
              highlight={emRisco > 0}
            />
            <KpiCount icon={AlertTriangle} value={emAtencao} label="Em atenção (saúde)" tone={emAtencao > 0 ? "amber" : "slate"} />
            <KpiCount icon={CheckCircle2} value={agg?.rag.verde ?? 0} label="Saúde ok (no prazo)" tone="emerald" />
            <KpiCount icon={TrendingUp} value={agg?.on_time_pct != null ? `${agg.on_time_pct}%` : "—"} label="Entrega no prazo" />
            <KpiCount icon={Gauge} value={agg?.avg_progress_pct != null ? `${agg.avg_progress_pct}%` : "—"} label="Progresso médio" />
            {!presentMode && (
              <>
                <KpiCount
                  icon={Clock}
                  value={cap ? `${cap.allocated_hours}h / ${cap.capacity_hours}h` : "—"}
                  label="Capacidade vs demanda"
                  tone={overCap ? "red" : "primary"}
                  highlight={overCap}
                />
                <KpiCount
                  icon={Users}
                  value={cap ? cap.overallocated_user_days : "—"}
                  label="Dia(s)/pessoa em sobrecarga"
                  tone={cap && cap.overallocated_user_days > 0 ? "amber" : "slate"}
                />
              </>
            )}
          </KpiRow>

          {/* Matriz + Priorização lado a lado (6/6) */}
          <div className="grid gap-4 lg:grid-cols-2 items-start">
          {/* Matriz */}
          <SectionCard
            title="Matriz Impacto × Esforço"
            subtitle="Projetos/programas pontuados do PO. Clique num ponto para abrir o cronograma."
          >
            {matrixPoints.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nenhum projeto pontuado ainda.</p>
            ) : (
              <PriorityMatrixSvg
                items={matrixPoints}
                quadrants={quadrants}
                settings={settings}
                onPointClick={(taskId) => {
                  const it = items.find((x) => x.task_id === taskId)
                  if (it) openModal(it)
                }}
              />
            )}
          </SectionCard>

          {/* Lista priorizada */}
          <SectionCard
            title="Priorização"
            subtitle={
              <>
                Ordem por <strong>quadrante</strong>, depois por <strong>densidade de valor</strong> (impacto ÷ esforço); "Sem score" por último. Clique para {canScore ? "repriorizar" : "ver"}.
              </>
            }
            right={
              <Button
                variant="outline"
                className="h-9 shrink-0 gap-1.5"
                onClick={() => setShowMethod((v) => !v)}
              >
                <Info size={15} />
                Como é calculado?
                <ChevronDown size={15} className={`transition-transform ${showMethod ? "rotate-180" : ""}`} />
              </Button>
            }
          >
            <div className="space-y-2">
              {showMethod && (
                <MethodologyPanel
                  criteria={criteria}
                  pillars={pillars}
                  confidence={confidence}
                  settings={settings}
                />
              )}
              {ranked.map(({ it, density }, idx) => (
                <button
                  key={it.task_id}
                  type="button"
                  onClick={() => openModal(it)}
                  className="flex w-full items-center gap-3 rounded-xl border p-3 text-left transition-colors hover:bg-muted/40"
                >
                  <span className="w-5 shrink-0 text-right font-mono text-xs text-muted-foreground">{idx + 1}</span>
                  <HealthDot health={it.health} tip={riskTipForItem(it)} />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="truncate text-sm font-medium">{it.title}</span>
                      {it.planning_kind === "programa" && <Pill tone="violet">Programa</Pill>}
                      <CompletionBadge subtreeTotal={it.subtree_total} subtreeCompleted={it.subtree_completed} progressPct={it.progress_pct} pendingStages={it.pending_stages} />
                      {it.quadrant_code && <QuadrantBadge code={it.quadrant_code as QuadrantCode} quadrants={quadrants} />}
                      {density !== null && (
                        <span
                          className="rounded-md bg-muted px-1.5 py-0.5 font-mono text-xs font-semibold"
                          title="Valor por unidade de esforço (impacto ÷ esforço)"
                        >
                          {density.toFixed(2)}×
                        </span>
                      )}
                      {it.unscored && <Pill tone="slate">Sem score</Pill>}
                    </div>
                    <div className="mt-1 flex flex-wrap items-center gap-2">
                      <div className="h-1.5 w-32 overflow-hidden rounded-full bg-muted">
                        <div className="h-full rounded-full" style={{ width: `${it.progress_pct}%`, backgroundColor: HEALTH_COLOR[it.health] }} />
                      </div>
                      <span className="text-xs tabular-nums text-muted-foreground">
                        {it.progress_pct}% · {it.subtree_completed}/{it.subtree_total} em etapa final
                      </span>
                      {!it.unscored && it.impacto_efetivo != null && (
                        <span className="text-xs tabular-nums text-muted-foreground">
                          · Impacto {it.impacto_efetivo.toFixed(2)} · Esforço {it.esforco != null ? it.esforco.toFixed(2) : "—"}
                          {density !== null && <> · <span className="font-semibold text-foreground">{density.toFixed(2)}×</span></>}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="flex shrink-0 flex-wrap items-center justify-end gap-1">
                    {it.overdue && <span title="Há itens com prazo ultrapassado"><Pill tone="red">Atrasado</Pill></span>}
                    {it.breached_count > 0 && <span title={`${it.breached_count} item(ns) com SLA estourado`}><Pill tone="red">{it.breached_count} SLA</Pill></span>}
                    {it.blocked_count > 0 && <span title={`${it.blocked_count} card(s) bloqueado(s)`}><Pill tone="amber">{it.blocked_count} bloq.</Pill></span>}
                    {it.absence_conflict && <span title="Responsável ausente no período do projeto"><Pill tone="amber">Ausência</Pill></span>}
                    {it.no_due_date && <span title="Projeto sem data de prazo cadastrada"><Pill tone="slate">Sem prazo</Pill></span>}
                  </div>
                </button>
              ))}
            </div>
          </SectionCard>
          </div>

          {/* Próximos a iniciar + Próximas entregas */}
          <div className="grid gap-4 lg:grid-cols-2">
            <SectionCard
              title="Próximos a iniciar"
              icon={Rocket}
              subtitle="Projetos não iniciados, por prioridade — o que vamos tocar a seguir."
            >
              <div className="space-y-1.5">
                {upcomingToStart.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Nenhum projeto na fila de início.</p>
                ) : (
                  upcomingToStart.slice(0, 6).map((it, idx) => (
                    <button
                      key={it.task_id}
                      type="button"
                      onClick={() => openModal(it)}
                      className="flex w-full items-center gap-2 rounded-xl border p-2.5 text-left text-sm transition-colors hover:bg-muted/40"
                    >
                      <span className="w-4 shrink-0 text-right font-mono text-xs text-muted-foreground">{idx + 1}</span>
                      <span className="flex-1 truncate font-medium">{it.title}</span>
                      {it.quadrant_code && <QuadrantBadge code={it.quadrant_code as QuadrantCode} quadrants={quadrants} />}
                      {it.start_date && <span className="shrink-0 text-xs text-muted-foreground">início {fmtShortDate(it.start_date)}</span>}
                    </button>
                  ))
                )}
              </div>
            </SectionCard>

            <SectionCard
              title="Próximas entregas"
              icon={Flag}
              subtitle="Próximos prazos dos projetos — o que vem pela frente."
            >
              <div className="space-y-1.5">
                {upcomingDeliveries.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Nenhuma entrega futura agendada.</p>
                ) : (
                  upcomingDeliveries.map((it) => (
                    <button
                      key={it.task_id}
                      type="button"
                      onClick={() => openModal(it)}
                      className="flex w-full items-center gap-2 rounded-xl border p-2.5 text-left text-sm transition-colors hover:bg-muted/40"
                    >
                      <HealthDot health={it.health} tip={riskTipForItem(it)} />
                      <span className="flex-1 truncate font-medium">{it.title}</span>
                      <CompletionBadge subtreeTotal={it.subtree_total} subtreeCompleted={it.subtree_completed} progressPct={it.progress_pct} pendingStages={it.pending_stages} />
                      <span className="shrink-0 tabular-nums text-xs font-semibold">{fmtShortDate(it.next_due_date)}</span>
                    </button>
                  ))
                )}
              </div>
            </SectionCard>
          </div>

          {/* Painéis: Riscos / Gargalos / Previsibilidade (ocultos no modo apresentação) */}
          {!presentMode && (
          <div className="grid gap-4 lg:grid-cols-3">
            <SectionCard title="Riscos" icon={AlertTriangle}>
              <div className="space-y-3">
                {(() => {
                  const risky = items.filter((i) => i.overdue || i.breached_count > 0 || i.absence_conflict || i.no_due_date || i.unscored)
                  if (risky.length === 0) return <p className="text-sm text-muted-foreground">Nenhum risco detectado. 🎉</p>
                  const max = Math.max(1, ...risky.map((i) => i.breached_count + (i.overdue ? 1 : 0)))
                  return risky.map((i) => (
                    <div key={i.task_id}>
                      <BarRow label={i.title} value={i.breached_count + (i.overdue ? 1 : 0)} max={max} color="#DC2626" />
                      <div className="mt-1 flex flex-wrap gap-1">
                        {i.overdue && <Pill tone="red">atrasado</Pill>}
                        {i.breached_count > 0 && <Pill tone="red">{i.breached_count} SLA estourado</Pill>}
                        {i.absence_conflict && <Pill tone="amber">ausência</Pill>}
                        {i.no_due_date && <Pill tone="slate">sem prazo</Pill>}
                        {i.unscored && <Pill tone="slate">sem score</Pill>}
                      </div>
                    </div>
                  ))
                })()}
              </div>
            </SectionCard>

            <SectionCard title="Gargalos" icon={CalendarClock}>
              <div className="space-y-2">
                {(() => {
                  const bott = items.filter((i) => i.critical_count > 0 || i.blocked_count > 0 || i.overallocated_users.length > 0)
                  if (bott.length === 0) return <p className="text-sm text-muted-foreground">Sem gargalos no momento.</p>
                  return bott.map((i) => (
                    <div key={i.task_id} className="rounded-xl border p-2.5">
                      <p className="truncate text-sm font-medium">{i.title}</p>
                      <div className="mt-1 flex flex-wrap gap-2 text-xs text-muted-foreground">
                        {i.critical_count > 0 && <span>⚡ {i.critical_count} no caminho crítico</span>}
                        {i.blocked_count > 0 && <span>⛔ {i.blocked_count} bloqueada(s)</span>}
                        {i.overallocated_users.length > 0 && (
                          <span>👤 sobrecarga: {i.overallocated_users.map((u) => nameByUser.get(u) ?? "—").join(", ")}</span>
                        )}
                      </div>
                    </div>
                  ))
                })()}
              </div>
            </SectionCard>

            <SectionCard title="Previsibilidade" icon={Gauge}>
              <div className="space-y-2">
                {items.map((i) => {
                  const onTime = i.completed_count > 0 ? Math.round((100 * i.on_time_completed) / i.completed_count) : null
                  const hoursVar = i.est_hours > 0 ? Math.round((100 * (i.actual_hours - i.est_hours)) / i.est_hours) : null
                  return (
                    <div key={i.task_id} className="rounded-xl border p-2.5">
                      <p className="truncate text-sm font-medium">{i.title}</p>
                      <div className="mt-1 flex flex-wrap gap-2 text-xs text-muted-foreground">
                        <span>No prazo: {onTime != null ? `${onTime}% (${i.on_time_completed}/${i.completed_count})` : "—"}</span>
                        <span>Horas: {i.actual_hours}/{i.est_hours}h{hoursVar != null ? ` (${hoursVar > 0 ? "+" : ""}${hoursVar}%)` : ""}</span>
                        {i.avg_lead_time_days != null && <span>Lead time: {i.avg_lead_time_days}d</span>}
                      </div>
                    </div>
                  )
                })}
              </div>
            </SectionCard>
          </div>
          )}
        </>
      )}

      <ProjectPriorityDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        item={dialogItem}
        quadrants={quadrants}
        canScore={canScore}
        users={persons}
        onSaved={() => setRefreshKey((k) => k + 1)}
        onOpenGantt={(it) => { setDialogOpen(false); openGantt(it) }}
      />
    </div>
  )
}

// ── Resumo executivo: ícone colorido + rótulo + texto (quebra linha, não trunca) ──────────────
const SUMMARY_TONE: Record<KpiTone, string> = {
  primary: "bg-primary/10 text-primary",
  amber: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300",
  emerald: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300",
  red: "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300",
  violet: "bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-300",
  slate: "bg-muted text-muted-foreground",
}

function SummaryItem({
  icon: Icon,
  tone,
  label,
  children,
}: {
  icon: typeof Star
  tone: KpiTone
  label: string
  children: ReactNode
}) {
  return (
    <div className="flex min-w-0 items-start gap-3">
      <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${SUMMARY_TONE[tone]}`}><Icon size={19} /></span>
      <div className="min-w-0">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="text-sm font-medium">{children}</p>
      </div>
    </div>
  )
}

// ── Modo gestão: POs lado a lado ──────────────
function RagBar({ rag }: { rag: { verde: number; amarelo: number; vermelho: number } }) {
  const total = rag.verde + rag.amarelo + rag.vermelho
  if (total === 0) return <span className="text-xs text-muted-foreground">—</span>
  const seg = (n: number, c: string) => (n > 0 ? <span style={{ width: `${(100 * n) / total}%`, backgroundColor: c }} className="h-2 inline-block" /> : null)
  return (
    <span className="inline-flex h-2 w-28 overflow-hidden rounded-full bg-muted align-middle" title={`${rag.verde} ok · ${rag.amarelo} atenção · ${rag.vermelho} risco`}>
      {seg(rag.verde, HEALTH_COLOR.verde)}{seg(rag.amarelo, HEALTH_COLOR.amarelo)}{seg(rag.vermelho, HEALTH_COLOR.vermelho)}
    </span>
  )
}

function GestaoView({ overview, onPick }: { overview: PoOverviewItem[] | null; onPick: (poId: string) => void }) {
  if (!overview) return <Skeleton className="h-64 w-full rounded-2xl" />
  if (overview.length === 0) {
    return (
      <Card>
        <EmptyState icon={Users} title="Sem POs com portfólio" description="Nenhum PO possui projetos/programas atribuídos ainda." />
      </Card>
    )
  }
  return (
    <SectionCard
      title="Gestão — portfólios por PO"
      subtitle="Comparativo de saúde e entrega entre os POs. Clique para abrir o portfólio."
      flush
    >
      <div className={TABLE.wrap}>
        <table className={TABLE.table}>
          <thead className={TABLE.thead}>
            <tr>
              <th className={TABLE.thFirst}>PO</th>
              <th className={TABLE.th}>Proj/Prog</th>
              <th className={TABLE.th}>Saúde</th>
              <th className={TABLE.th}>No prazo</th>
              <th className={TABLE.th}>Progresso</th>
              <th className={TABLE.th}>Sobrecarga</th>
            </tr>
          </thead>
          <tbody>
            {overview.map((o) => (
              <tr key={o.po_id} className={`${TABLE.tr} cursor-pointer`} onClick={() => onPick(o.po_id)}>
                <td className={`${TABLE.tdFirst} font-medium`}>{o.full_name}</td>
                <td className={`${TABLE.td} tabular-nums`}>{o.total_projetos} / {o.total_programas}</td>
                <td className={TABLE.td}>
                  <span className="inline-flex items-center gap-2">
                    <RagBar rag={o.rag} /> {o.rag.vermelho > 0 && <Pill tone="red">{o.rag.vermelho}</Pill>}
                  </span>
                </td>
                <td className={`${TABLE.td} tabular-nums`}>{o.on_time_pct != null ? `${o.on_time_pct}%` : "—"}</td>
                <td className={`${TABLE.td} tabular-nums`}>{o.avg_progress_pct != null ? `${o.avg_progress_pct}%` : "—"}</td>
                <td className={`${TABLE.td} tabular-nums`}>{o.overallocated_user_days > 0 ? `${o.overallocated_user_days} dia(s)/pessoa` : "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </SectionCard>
  )
}
