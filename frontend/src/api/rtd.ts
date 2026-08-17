import api from "./client"

// ── Types ─────────────────────────────────────
export type TipoCompetencia = "mensal" | "trimestral"
export type ReuniaoStatus = "rascunho" | "realizada" | "fechada"
export type DeliberacaoTipo = "decisao_pendente" | "apoio" | "priorizacao"
export type DeliberacaoStatus = "pendente" | "encaminhada" | "concluida"

export interface Reuniao {
  id: string
  titulo: string
  tipo_competencia: TipoCompetencia
  ano_referencia: number
  ordem: number
  competencia: string
  periodo_inicio: string
  periodo_fim: string
  status: ReuniaoStatus
  data_realizacao: string | null
  observacoes: string | null
  epa_planos: number[] | null
  epa_planos_taticos: number[] | null
  total_deliberacoes: number
  created_at: string
}

// ── Planos Estratégicos (integração EPA) ──
export interface PlanoEpaExec {
  concluidas: number
  total: number
  pct: number | null
}

export interface PlanoEpaAcomp {
  descricao: string
  colaborador: string | null
  data: string | null
  horas: number
}

export interface PlanoEpaAcao {
  codigo: number | null
  titulo: string
  status: "concluido" | "em_andamento" | "planejado" | "atrasado" | "suspenso" | "outro"
  status_raw: string | null
  responsavel: string | null
  prazo: string | null
  repactuacoes: number
  acompanhamentos: PlanoEpaAcomp[]
}

export interface PlanoEpa {
  codigo: number
  titulo: string
  execucao_periodo: PlanoEpaExec | null
  execucao_total: PlanoEpaExec | null
  acoes: PlanoEpaAcao[]
  erro: string | null
}

export interface PlanosEpaResponse {
  configurado: boolean
  codigos: number[]
  snapshot_at: string | null
  planos: PlanoEpa[] | null
  erro: string | null
}

export interface ReuniaoCreate {
  titulo: string
  tipo_competencia: TipoCompetencia
  ano_referencia: number
  ordem: number
  observacoes?: string | null
  data_realizacao?: string | null
}

export interface Deliberacao {
  id: string
  reuniao_id: string
  project_task_id: string | null
  projeto_titulo: string | null
  tipo: DeliberacaoTipo
  titulo: string | null
  descricao: string
  responsavel_person_id: string | null
  responsavel_nome: string | null
  prazo: string | null
  status: DeliberacaoStatus
  created_at: string
}

export interface DeliberacaoCreate {
  tipo: DeliberacaoTipo
  titulo?: string | null
  descricao: string
  project_task_id?: string | null
  responsavel_person_id?: string | null
  prazo?: string | null
  status?: DeliberacaoStatus
}

// ── Seção 1: Acompanhamento dos Indicadores ──
export type IndicadorPeriodoStatus = "atingido" | "em_atencao" | "nao_atingido" | "pendente"

export interface IndicadorPeriodoRef {
  competencia: string
  ordem: number
  meta: number | null
  realizado: number | null
  percentual_atingimento: number | null
  status: IndicadorPeriodoStatus
  /** Evidências do período (o que foi entregue no mês) — tooltip do gráfico. */
  entregas?: string[] | null
}

export interface IndicadorTendencia {
  direcao: "melhorando" | "estavel" | "piorando" | null
  variacao: number | null
  base: "percentual" | "realizado" | null
}

/** Uma linha do plano de ação de reversão (N por análise). */
export interface AnaliseAcao {
  causa: string | null
  acao: string | null
  responsavel_person_id: string | null
  responsavel_nome?: string | null
  prazo: string | null
  resultado_esperado: string | null
}

export interface IndicadorAnalise {
  fatores_impacto: string | null
  riscos: string | null
  causa_analise: string | null
  plano_reversao: string | null
  responsavel_person_id: string | null
  responsavel_nome: string | null
  prazo: string | null
  resultado_esperado: string | null
  acoes?: AnaliseAcao[] | null
  updated_at?: string | null
}

export interface IndicadorDetalhe {
  indicador_id: string
  codigo: string
  nome: string
  categoria: "estrategico" | "tatico"
  sub_processo: string | null
  area_name: string | null
  unidade_medida: string | null
  formula_calculo: string | null
  sentido: "maior_melhor" | "menor_melhor" | "faixa_ideal" | null
  granularidade: string | null
  meta_min: number | null
  meta_max: number | null
  periodo: IndicadorPeriodoRef | null
  tendencia: IndicadorTendencia
  /** Tendência para o PRÓXIMO período: extrapolação do ritmo recente (Δ médio). */
  tendencia_futura: {
    competencia: string
    estimado: number
    delta_medio: number
    direcao: "melhorando" | "estavel" | "piorando"
    atinge_meta: boolean | null
    texto: string
  } | null
  /** Melhor cenário do PRÓXIMO período ("se entregarmos tudo que está planejado"). */
  projecao: { competencia: string; valor: number | null; texto: string } | null
  serie: IndicadorPeriodoRef[]
  analise: IndicadorAnalise | null
}

export interface AnaliseUpsert {
  fatores_impacto?: string | null
  riscos?: string | null
  causa_analise?: string | null
  plano_reversao?: string | null
  responsavel_person_id?: string | null
  prazo?: string | null
  resultado_esperado?: string | null
  acoes?: Array<Omit<AnaliseAcao, "responsavel_nome">> | null
}

export interface PersonMini {
  id: string
  full_name: string
}

/** Sugestão gerada pela IA — não persistida; preenche o formulário para revisão humana. */
export interface AnaliseSugestao {
  fatores_impacto: string | null
  riscos: string | null
  causa_analise: string | null
  plano_reversao: string | null
  resultado_esperado: string | null
  acoes: Array<{ causa: string | null; acao: string | null; resultado_esperado: string | null }>
  anonimizacao: Record<string, number>
}

export interface EntregaItem {
  task_id: string
  title: string
  responsavel: string | null
  due_date: string | null
  completed_at?: string | null
  no_prazo?: boolean
}

export interface ReuniaoReport {
  meta: Record<string, unknown> & {
    titulo: string
    competencia: string
    status: string
    snapshot_at?: string | null
  }
  panorama: {
    periodo: { inicio: string; fim: string }
    proximo_ciclo: { inicio: string; fim: string }
    entregas_concluidas: EntregaItem[]
    entregas_previstas: EntregaItem[]
    riscos: {
      impedimentos: number
      maiores_atrasos: Array<Record<string, unknown>>
      em_risco_por_po: Array<{ full_name: string | null; em_risco: number }>
    }
    fases: Record<string, number>
  }
  por_po: Array<Record<string, unknown>>
  indicadores: Record<string, unknown> | null
  indicadores_detalhe: IndicadorDetalhe[] | null
  produtos_digitais: {
    total_servicos: number | null
    total_documentos: number | null
    total_processos_automatizados: number | null
  } | null
  em_desenvolvimento: Record<string, boolean>
  deliberacoes: Deliberacao[]
}

// ── Client ────────────────────────────────────
export const rtdApi = {
  listReunioes: () => api.get<Reuniao[]>("/rtd/reunioes").then((r) => r.data),
  getReuniao: (id: string) => api.get<Reuniao>(`/rtd/reunioes/${id}`).then((r) => r.data),
  createReuniao: (data: ReuniaoCreate) => api.post<Reuniao>("/rtd/reunioes", data).then((r) => r.data),
  updateReuniao: (id: string, data: Partial<ReuniaoCreate> & {
    status?: ReuniaoStatus
    epa_planos?: number[]
    epa_planos_taticos?: number[]
  }) =>
    api.patch<Reuniao>(`/rtd/reunioes/${id}`, data).then((r) => r.data),
  getPlanosEpa: (id: string, categoria: "estrategico" | "tatico" = "estrategico") =>
    api.get<PlanosEpaResponse>(`/rtd/reunioes/${id}/planos-epa`, {
      params: { categoria }, timeout: 120_000,
    }).then((r) => r.data),
  deleteReuniao: (id: string) => api.delete(`/rtd/reunioes/${id}`).then((r) => r.data),
  getReport: (id: string) => api.get<ReuniaoReport>(`/rtd/reunioes/${id}/report`).then((r) => r.data),

  upsertIndicadorAnalise: (reuniaoId: string, indicadorId: string, data: AnaliseUpsert) =>
    api.put<IndicadorAnalise>(`/rtd/reunioes/${reuniaoId}/indicadores/${indicadorId}/analise`, data)
      .then((r) => r.data),
  listPersons: () => api.get<PersonMini[]>("/rtd/persons").then((r) => r.data),
  // A chamada ao agente pode levar 1-2 min (poll no Azure) — timeout generoso.
  sugerirAnalise: (reuniaoId: string, indicadorId: string) =>
    api.post<AnaliseSugestao>(
      `/rtd/reunioes/${reuniaoId}/indicadores/${indicadorId}/analise/sugerir`,
      undefined, { timeout: 180_000 },
    ).then((r) => r.data),

  listDeliberacoes: (reuniaoId: string) =>
    api.get<Deliberacao[]>(`/rtd/reunioes/${reuniaoId}/deliberacoes`).then((r) => r.data),
  createDeliberacao: (reuniaoId: string, data: DeliberacaoCreate) =>
    api.post<Deliberacao>(`/rtd/reunioes/${reuniaoId}/deliberacoes`, data).then((r) => r.data),
  updateDeliberacao: (id: string, data: Partial<DeliberacaoCreate>) =>
    api.patch<Deliberacao>(`/rtd/deliberacoes/${id}`, data).then((r) => r.data),
  deleteDeliberacao: (id: string) => api.delete(`/rtd/deliberacoes/${id}`).then((r) => r.data),
}
