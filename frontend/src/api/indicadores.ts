import api from "./client"

// ── Types ─────────────────────────────────────

export type Categoria = "estrategico" | "tatico"
export type Granularidade = "mensal" | "bimestral" | "trimestral" | "semestral" | "anual"
export type Sentido = "maior_melhor" | "menor_melhor" | "faixa_ideal"
export type IndicadorStatus = "ativo" | "inativo"
export type FonteDados = "manual" | "portfolio"
export type FonteMetrica =
  // Produtos
  | "servicos_publicados"
  | "documentos_natos_digitais"
  // Projetos (indicadores táticos)
  | "cronograma_desenvolvimento"
  | "cronograma_implantacao"
  | "desvio_trabalho_desenvolvimento"
  | "desvio_trabalho_implantacao"
  | "pct_desenvolvimento"
  | "tempo_analise_oportunidade"
  | "lead_time_us"
  | "pct_sla_estourado"
  | "taxa_impedimento"
  | "pct_projetos_ia"
export type AcompStatus = "pendente" | "atingido" | "em_atencao" | "nao_atingido"

export interface AreaRefMini {
  id: string
  name: string
  setor_name: string | null
}

export interface PersonMini {
  id: string
  full_name: string
}

export interface AnexoItem {
  object_name: string
  filename: string
  content_type?: string | null
  size?: number | null
}

export interface PortfolioServicoRef {
  product_id: string
  product_name: string
  servico_id: string
  servico_name: string
  lifecycle: string
  data_publicacao: string | null
  em_producao: boolean
  novo_no_mes?: boolean
}

export interface PortfolioDocumentoRef {
  product_id: string
  product_name: string
  documento_id: string
  documento_name: string
  lifecycle: string
  data_documento: string | null
  em_producao: boolean
  novo_no_mes?: boolean
}

export interface PortfolioLinkRef {
  label: string
  url: string
}

export interface AcompanhamentoEvidenciasPayload {
  fonte: FonteDados
  evidencias: AnexoItem[]
  evidencias_novos: AnexoItem[]
  portfolio_servicos: PortfolioServicoRef[]
  portfolio_servicos_novos: PortfolioServicoRef[]
  portfolio_documentos: PortfolioDocumentoRef[]
  portfolio_documentos_novos: PortfolioDocumentoRef[]
  portfolio_links: PortfolioLinkRef[]
  portfolio_links_novos: PortfolioLinkRef[]
}

export interface Acompanhamento {
  id: string
  indicador_id: string
  ano_referencia: number
  ordem: number
  competencia: string
  periodo_inicio: string
  periodo_fim: string
  meta: number | null
  realizado: number | null
  percentual_atingimento: number | null
  status: AcompStatus
  fonte: FonteDados
  bloqueado: boolean
  observacao: string | null
  evidencias?: AnexoItem[] | null
  portfolio_servicos?: PortfolioServicoRef[] | null
  portfolio_servicos_novos?: PortfolioServicoRef[] | null
  portfolio_documentos?: PortfolioDocumentoRef[] | null
  portfolio_documentos_novos?: PortfolioDocumentoRef[] | null
  portfolio_links?: PortfolioLinkRef[] | null
  portfolio_links_novos?: PortfolioLinkRef[] | null
  created_at: string
  updated_at: string
  updated_by: string | null
}

export interface Indicador {
  id: string
  codigo: string
  nome: string
  categoria: Categoria
  descricao: string | null
  objetivo_estrategico: string | null
  sub_processo: string | null
  area: AreaRefMini | null
  responsavel: PersonMini | null
  unidade_medida: string | null
  formula_calculo: string | null
  fonte_dados: string | null
  granularidade: Granularidade
  periodicidade_atualizacao: string | null
  sentido: Sentido
  meta_min: number | null
  meta_max: number | null
  tolerancia_pct: number
  fonte: FonteDados
  fonte_metrica: FonteMetrica | null
  fonte_corte: string | null
  fonte_portfolio_num: number | null
  fonte_portfolio_den: number | null
  fonte_portfolio_pct: number | null
  status: IndicadorStatus
  is_active: boolean
  created_at: string
  updated_at: string
  anos: number[]
  acompanhamentos: Acompanhamento[]
}

export interface IndicadorCreate {
  codigo: string
  nome: string
  categoria: Categoria
  descricao?: string | null
  objetivo_estrategico?: string | null
  sub_processo?: string | null
  area_id?: string | null
  responsavel_person_id?: string | null
  unidade_medida?: string | null
  formula_calculo?: string | null
  fonte_dados?: string | null
  granularidade: Granularidade
  periodicidade_atualizacao?: string | null
  sentido: Sentido
  meta_min?: number | null
  meta_max?: number | null
  tolerancia_pct?: number | null
  fonte?: FonteDados
  fonte_metrica?: FonteMetrica | null
  fonte_corte?: string | null
  status?: IndicadorStatus
  anos_referencia?: number[]
}

export type IndicadorUpdate = Partial<IndicadorCreate> & { is_active?: boolean }

export interface IndicadorListItem {
  id: string
  codigo: string
  nome: string
  categoria: Categoria
  sub_processo: string | null
  area_id: string | null
  area_name: string | null
  responsavel_person_id: string | null
  responsavel_nome: string | null
  unidade_medida: string | null
  granularidade: Granularidade
  sentido: Sentido
  status: IndicadorStatus
  is_active: boolean
  ano_referencia: number | null
  percentual_atingimento: number | null
  status_atual: AcompStatus | null
  created_at: string
}

export interface DashboardFilters {
  ano?: number
  categoria?: string
  area_id?: string
  responsavel_id?: string
  granularidade?: string
  status?: string
}

export interface DashboardKpis {
  total: number
  total_estrategicos: number
  total_taticos: number
  atingidos: number
  em_atencao: number
  nao_atingidos: number
  pendentes_atualizacao: number
  percentual_geral_atingimento: number
  por_categoria: Record<string, number>
  por_area: Record<string, number>
}

export interface DashboardChartPeriodo {
  competencia: string
  ordem: number
  meta: number | null
  realizado: number | null
  percentual_atingimento: number | null
  status: AcompStatus
}

export interface DashboardChartIndicador {
  id: string
  codigo: string
  nome: string
  categoria: Categoria
  unidade_medida: string | null
  area_name: string | null
  sub_processo: string | null
  formula_calculo: string | null
  sentido: Sentido | null
  periodos: DashboardChartPeriodo[]
}

export interface DashboardCharts {
  indicadores: DashboardChartIndicador[]
}

export interface AcompanhamentoUpdate {
  meta?: number | null
  realizado?: number | null
  observacao?: string | null
  evidencias?: AnexoItem[]
  fonte?: FonteDados
  limpar_meta?: boolean
  limpar_realizado?: boolean
  bloqueado?: boolean
}

export interface IndicadorUpload {
  object_name: string
  filename: string
  content_type: string
  size: number
}

// ── API ───────────────────────────────────────

export const indicadoresApi = {
  listAreas: () =>
    api.get<AreaRefMini[]>("/indicadores/areas").then((r) => r.data),

  listPersons: () =>
    api.get<PersonMini[]>("/indicadores/persons").then((r) => r.data),

  getDashboard: (filters: DashboardFilters) =>
    api.get<DashboardKpis>("/indicadores/dashboard", { params: filters }).then((r) => r.data),

  getDashboardGraficos: (filters: DashboardFilters) =>
    api.get<DashboardCharts>("/indicadores/dashboard/graficos", { params: filters }).then((r) => r.data),

  list: (filters: DashboardFilters) =>
    api.get<IndicadorListItem[]>("/indicadores", { params: filters }).then((r) => r.data),

  get: (id: string) =>
    api.get<Indicador>(`/indicadores/${id}`).then((r) => r.data),

  create: (data: IndicadorCreate) =>
    api.post<Indicador>("/indicadores", data).then((r) => r.data),

  update: (id: string, data: IndicadorUpdate) =>
    api.patch<Indicador>(`/indicadores/${id}`, data).then((r) => r.data),

  remove: (id: string) =>
    api.delete<void>(`/indicadores/${id}`).then((r) => r.data),

  gerarAcompanhamentos: (indicadorId: string, ano: number) =>
    api
      .post<Acompanhamento[]>(`/indicadores/${indicadorId}/acompanhamentos/gerar`, null, { params: { ano } })
      .then((r) => r.data),

  atualizarPortfolio: (indicadorId: string) =>
    api.post<Indicador>(`/indicadores/${indicadorId}/portfolio/atualizar`).then((r) => r.data),

  atualizarAcompanhamentoPortfolio: (acompId: string) =>
    api.post<Acompanhamento>(`/indicadores/acompanhamentos/${acompId}/portfolio/atualizar`).then((r) => r.data),

  updateAcompanhamento: (acompId: string, data: AcompanhamentoUpdate) =>
    api.patch<Acompanhamento>(`/indicadores/acompanhamentos/${acompId}`, data).then((r) => r.data),

  getAcompanhamentoEvidencias: (acompId: string) =>
    api.get<AcompanhamentoEvidenciasPayload>(`/indicadores/acompanhamentos/${acompId}/evidencias`).then((r) => r.data),

  uploadFile: (file: File) => {
    const fd = new FormData()
    fd.append("file", file)
    return api.post<IndicadorUpload>("/indicadores/uploads", fd).then((r) => r.data)
  },

  getUploadUrl: (objectName: string) =>
    api
      .get<{ url: string }>("/indicadores/uploads/url", { params: { object_name: objectName } })
      .then((r) => r.data.url),
}
