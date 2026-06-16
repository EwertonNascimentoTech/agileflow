import api from "./client"

// ── Types ─────────────────────────────────────

export type ProductOrigem = "interno" | "cots" | "customizacao" | "saas"
export type ProductLifecycle = "concepcao" | "desenvolvimento" | "producao" | "descontinuado"
export type ProductCriticidade = "baixa" | "media" | "alta" | "critica"
export type ProcessoNivel = "macroprocesso" | "processo" | "subprocesso"
export type Sustentacao = "interna" | "externa" | "hibrida"
export type GroupBy = "produto" | "area" | "setor" | "portfolio"

export interface AreaRefMini {
  id: string
  name: string
  setor_name: string | null
}

export interface PersonMini {
  id: string
  full_name: string
}

export interface Fornecedor {
  id: string
  nome: string
  cnpj: string | null
  contato: string | null
  email: string | null
  telefone: string | null
  notes: string | null
  is_active: boolean
}

export interface FornecedorCreate {
  nome: string
  cnpj?: string
  contato?: string
  email?: string
  telefone?: string
  notes?: string
}

export type FornecedorUpdate = Partial<FornecedorCreate>

export interface Servico {
  id: string
  name: string
  description: string | null
  ano_referencia: number
  is_active: boolean
  order: number
}

export interface ServicoCreate {
  name: string
  description?: string
  ano_referencia?: number
}

export interface Documento {
  id: string
  name: string
  ano_referencia: number
  object_name: string | null
  filename: string | null
  content_type: string | null
  size: number | null
  category: string | null
  external_link: string | null
  is_active: boolean
  order: number
  created_at: string
}

export interface DocumentoCreate {
  name: string
  ano_referencia?: number
  object_name?: string
  filename?: string
  content_type?: string
  size?: number
  category?: string
  external_link?: string
}

export interface ProcessoCatalog {
  id: string
  name: string
  description: string | null
  nivel: ProcessoNivel
  parent_id: string | null
  is_active: boolean
  order: number
  children: ProcessoCatalog[]
}

export interface ProcessoCreate {
  name: string
  description?: string
  nivel: ProcessoNivel
  parent_id?: string | null
}

export interface ProcessoUpdate {
  name?: string
  description?: string
  order?: number
}

export interface ProdutoProcessoLink {
  id: string
  processo_id: string
  processo_nome: string | null
  macroprocesso_nome: string | null
  processo_pai_nome: string | null
  ano_referencia: number
  automatizado: boolean
  is_active: boolean
}

export interface ProdutoProcessoCreate {
  processo_id: string
  ano_referencia?: number
  automatizado?: boolean
}

export interface ProdutoProcessoUpdate {
  automatizado?: boolean
  ano_referencia?: number
}

export interface Contrato {
  id: string
  fornecedor_id: string
  fornecedor_nome: string | null
  identificador: string | null
  vigencia_inicio: string
  vigencia_fim: string
  renovacao_automatica: boolean
  modelo_licenciamento: string | null
  gestor_person_id: string | null
  gestor_nome: string | null
  sustentacao_n1: Sustentacao
  sustentacao_n2: Sustentacao
  sustentacao_n3: Sustentacao
  alerta_dias: number[]
  object_name: string | null
  filename: string | null
  external_link: string | null
  is_active: boolean
  dias_para_vencer: number | null
}

export interface ContratoCreate {
  fornecedor_id: string
  identificador?: string
  vigencia_inicio: string
  vigencia_fim: string
  renovacao_automatica?: boolean
  modelo_licenciamento?: string
  gestor_person_id?: string
  sustentacao_n1?: Sustentacao
  sustentacao_n2?: Sustentacao
  sustentacao_n3?: Sustentacao
  alerta_dias?: number[]
  object_name?: string
  filename?: string
  content_type?: string
  size?: number
  external_link?: string
}

export interface ContratoUpdate {
  identificador?: string
  vigencia_inicio?: string
  vigencia_fim?: string
  renovacao_automatica?: boolean
  modelo_licenciamento?: string
  gestor_person_id?: string
  sustentacao_n1?: Sustentacao
  sustentacao_n2?: Sustentacao
  sustentacao_n3?: Sustentacao
  alerta_dias?: number[]
}

export interface ProductListItem {
  id: string
  name: string
  simbolo: string | null
  origem: ProductOrigem
  lifecycle: ProductLifecycle
  criticidade: ProductCriticidade
  area_name: string | null
  setor_name: string | null
  responsavel_nome: string | null
  requires_contract: boolean
  has_active_contract: boolean
  is_active: boolean
  created_at: string
}

export interface Product {
  id: string
  name: string
  simbolo: string | null
  description: string | null
  dominio_funcional: string | null
  origem: ProductOrigem
  lifecycle: ProductLifecycle
  criticidade: ProductCriticidade
  data_entrada_producao: string | null
  area: AreaRefMini | null
  setor_name: string | null
  responsavel: PersonMini | null
  fornecedor: Fornecedor | null
  origin_task_id: string | null
  is_active: boolean
  requires_contract: boolean
  has_active_contract: boolean
  created_at: string
  updated_at: string
  servicos: Servico[]
  documentos: Documento[]
  processos: ProdutoProcessoLink[]
  contratos: Contrato[]
}

export interface ProductCreate {
  name: string
  simbolo?: string
  description?: string
  dominio_funcional?: string
  origem?: ProductOrigem
  lifecycle?: ProductLifecycle
  criticidade?: ProductCriticidade
  data_entrada_producao?: string
  area_id?: string | null
  responsavel_person_id?: string | null
  fornecedor_id?: string | null
  origin_task_id?: string
}

export type ProductUpdate = Partial<ProductCreate> & { is_active?: boolean }

export interface FinalizedProject {
  task_id: string
  title: string
  description: string | null
  completed_at: string | null
  already_promoted: boolean
  product_id: string | null
}

export interface CreateFromProjectRequest {
  task_id: string
  name?: string
  description?: string
  area_id?: string
  responsavel_person_id?: string
}

export interface ProductUpload {
  object_name: string
  filename: string
  content_type: string
  size: number
}

export interface DashboardKpis {
  total_products: number
  active_products: number
  by_lifecycle: Record<string, number>
  by_criticidade: Record<string, number>
  total_servicos: number
  total_documentos: number
  total_processos_automatizados: number
  contratos_vencendo: number
}

export interface AlertaContrato {
  tipo: string
  product_id: string
  product_name: string
  contrato_id: string | null
  vigencia_fim: string | null
  dias_para_vencer: number | null
  mensagem: string
}

export interface IndicadorCounts {
  servicos: number
  documentos: number
  processos_automatizados: number
}

export interface IndicadorGroupItem {
  key: string
  label: string
  counts: IndicadorCounts
}

export interface IndicadorResponse {
  ano: number
  group_by: GroupBy
  grupos: IndicadorGroupItem[]
  total: IndicadorCounts
}

export interface IndicadorSeriesPoint {
  ano: number
  counts: IndicadorCounts
}

export interface ProcessoConsolidacaoNode {
  id: string
  name: string
  nivel: ProcessoNivel
  automatizados: number
  children: ProcessoConsolidacaoNode[]
}

// ── API ───────────────────────────────────────

export const produtosApi = {
  getDashboard: () =>
    api.get<DashboardKpis>("/produtos/dashboard").then((r) => r.data),

  getAlertasContratos: () =>
    api.get<AlertaContrato[]>("/produtos/alertas/contratos").then((r) => r.data),

  listAreas: () =>
    api.get<AreaRefMini[]>("/produtos/areas").then((r) => r.data),

  listSetores: () =>
    api.get<AreaRefMini[]>("/produtos/setores").then((r) => r.data),

  listPersons: () =>
    api.get<PersonMini[]>("/produtos/persons").then((r) => r.data),

  listFinalizedProjects: () =>
    api.get<FinalizedProject[]>("/produtos/finalized-projects").then((r) => r.data),

  createFromProject: (data: CreateFromProjectRequest) =>
    api.post<Product>("/produtos/from-project", data).then((r) => r.data),

  uploadFile: (file: File) => {
    const fd = new FormData()
    fd.append("file", file)
    return api.post<ProductUpload>("/produtos/uploads", fd).then((r) => r.data)
  },

  getUploadUrl: (objectName: string) =>
    api
      .get<{ url: string }>("/produtos/uploads/url", { params: { object_name: objectName } })
      .then((r) => r.data.url),

  listProcessos: () =>
    api.get<ProcessoCatalog[]>("/produtos/processos").then((r) => r.data),

  createProcesso: (data: ProcessoCreate) =>
    api.post<ProcessoCatalog>("/produtos/processos", data).then((r) => r.data),

  updateProcesso: (id: string, data: ProcessoUpdate) =>
    api.patch<ProcessoCatalog>(`/produtos/processos/${id}`, data).then((r) => r.data),

  deleteProcesso: (id: string) =>
    api.delete<void>(`/produtos/processos/${id}`).then((r) => r.data),

  listFornecedores: () =>
    api.get<Fornecedor[]>("/produtos/fornecedores").then((r) => r.data),

  createFornecedor: (data: FornecedorCreate) =>
    api.post<Fornecedor>("/produtos/fornecedores", data).then((r) => r.data),

  updateFornecedor: (id: string, data: FornecedorUpdate) =>
    api.patch<Fornecedor>(`/produtos/fornecedores/${id}`, data).then((r) => r.data),

  deleteFornecedor: (id: string) =>
    api.delete<void>(`/produtos/fornecedores/${id}`).then((r) => r.data),

  getIndicadores: (ano: number, groupBy: GroupBy) =>
    api
      .get<IndicadorResponse>("/produtos/indicadores", { params: { ano, group_by: groupBy } })
      .then((r) => r.data),

  getIndicadoresSeries: (anos: number[]) =>
    api
      .get<IndicadorSeriesPoint[]>("/produtos/indicadores/series", {
        params: { anos },
        paramsSerializer: { indexes: null },
      })
      .then((r) => r.data),

  getIndicadoresProcessos: (ano: number, productId?: string) =>
    api
      .get<ProcessoConsolidacaoNode[]>("/produtos/indicadores/processos", {
        params: { ano, product_id: productId },
      })
      .then((r) => r.data),

  listProducts: () =>
    api.get<ProductListItem[]>("/produtos").then((r) => r.data),

  createProduct: (data: ProductCreate) =>
    api.post<Product>("/produtos", data).then((r) => r.data),

  getProduct: (id: string) =>
    api.get<Product>(`/produtos/${id}`).then((r) => r.data),

  updateProduct: (id: string, data: ProductUpdate) =>
    api.patch<Product>(`/produtos/${id}`, data).then((r) => r.data),

  deleteProduct: (id: string) =>
    api.delete<void>(`/produtos/${id}`).then((r) => r.data),

  addServico: (productId: string, data: ServicoCreate) =>
    api.post<Servico>(`/produtos/${productId}/servicos`, data).then((r) => r.data),

  updateServico: (productId: string, servicoId: string, data: ServicoCreate) =>
    api.patch<Servico>(`/produtos/${productId}/servicos/${servicoId}`, data).then((r) => r.data),

  deleteServico: (productId: string, servicoId: string) =>
    api.delete<void>(`/produtos/${productId}/servicos/${servicoId}`).then((r) => r.data),

  addDocumento: (productId: string, data: DocumentoCreate) =>
    api.post<Documento>(`/produtos/${productId}/documentos`, data).then((r) => r.data),

  deleteDocumento: (productId: string, docId: string) =>
    api.delete<void>(`/produtos/${productId}/documentos/${docId}`).then((r) => r.data),

  linkProcesso: (productId: string, data: ProdutoProcessoCreate) =>
    api.post<ProdutoProcessoLink>(`/produtos/${productId}/processos`, data).then((r) => r.data),

  updateLink: (productId: string, linkId: string, data: ProdutoProcessoUpdate) =>
    api.patch<ProdutoProcessoLink>(`/produtos/${productId}/processos/${linkId}`, data).then((r) => r.data),

  unlinkProcesso: (productId: string, linkId: string) =>
    api.delete<void>(`/produtos/${productId}/processos/${linkId}`).then((r) => r.data),

  addContrato: (productId: string, data: ContratoCreate) =>
    api.post<Contrato>(`/produtos/${productId}/contratos`, data).then((r) => r.data),

  updateContrato: (productId: string, contratoId: string, data: ContratoUpdate) =>
    api.patch<Contrato>(`/produtos/${productId}/contratos/${contratoId}`, data).then((r) => r.data),

  deleteContrato: (productId: string, contratoId: string) =>
    api.delete<void>(`/produtos/${productId}/contratos/${contratoId}`).then((r) => r.data),
}
