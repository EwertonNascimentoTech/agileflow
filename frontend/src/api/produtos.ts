import api from "./client"

// ── Types ─────────────────────────────────────

export type ProductOrigem = "interno" | "cots" | "customizacao" | "saas"
export type ProductLifecycle = "concepcao" | "desenvolvimento" | "producao" | "descontinuado"
export type ProductCriticidade = "baixa" | "media" | "alta" | "critica"
export type ProcessoNivel = "macroprocesso" | "processo" | "subprocesso"
export type Sustentacao = "interna" | "externa" | "hibrida"
export type GroupBy = "produto" | "area" | "setor" | "portfolio"

// ── Enums "Produtos Digitais" (spec TI corporativa) ──
export type ProductStatus = "ideia" | "discovery" | "desenvolvimento" | "homologacao" | "producao" | "sustentacao" | "evolucao" | "suspenso" | "descontinuado"
export type ProductCategoria = "sistema_interno_dev" | "sistema_interno_ia" | "sistema_externo_ia" | "sistema_externo_implantacao" | "sistema_externo_hibrido" | "sistema_externo_dn"
export type ProductUnidade = "sesi" | "senai" | "iel" | "fiea" | "corporativo"
export type ProductTipoDev = "interno" | "externo" | "hibrido"
export type ProductModeloContratacao = "licenca" | "saas" | "fabrica" | "servico_continuado" | "projeto_pontual" | "interno" | "outro"
export type ServicoSuporte = "interno" | "fornecedor" | "compartilhado" | "service_desk" | "devops" | "desenvolvimento" | "infraestrutura"
export type ServicoStatus = "ativo" | "em_implantacao" | "suspenso" | "descontinuado"
export type DocumentoEspecie =
  | "relatorio" | "parecer" | "termo" | "certificado" | "formulario_eletronico" | "dashboard"
  | "registro_sistemico" | "comprovante_recibo" | "extrato" | "documento_fiscal_eletronico" | "oficio" | "outro"
/** @deprecated use DocumentoEspecie */
export type DocumentoTipo = DocumentoEspecie
export type DocumentoFormato = "pdf" | "xlsx" | "xls" | "docx" | "doc" | "xml" | "csv" | "txt" | "imagem" | "outro"
export type NivelDadosPessoais = "sem_dados_pessoais" | "dados_pessoais" | "dados_pessoais_sensiveis"
export type ClassificacaoInformacao = "publica" | "interna" | "confidencial" | "restrita"
export type ContratoStatus = "sem_contrato" | "em_formalizacao" | "vigente" | "a_vencer" | "vencido" | "em_renovacao" | "encerrado"
export type ContratoTipoValor = "mensal" | "anual" | "global" | "sob_demanda"
export type ReleaseTipo = "correcao" | "melhoria" | "nova_funcionalidade" | "seguranca" | "integracao" | "refatoracao" | "ajuste_tecnico"
export type ReleaseStatus = "planejada" | "em_desenvolvimento" | "em_homologacao" | "publicada" | "cancelada" | "revertida"
export type ReleaseImpacto = "baixo" | "medio" | "alto"
export type ReleaseAmbiente = "dev" | "hml" | "prd"
export type DocumentacaoTipo = "usuario" | "tecnica" | "api" | "implantacao" | "sustentacao" | "arquitetura" | "seguranca" | "operacional"
export type DocumentacaoStatus = "nao_iniciada" | "em_elaboracao" | "publicada" | "necessita_atualizacao" | "obsoleta"

export interface AnexoItem {
  object_name: string
  filename: string
  content_type?: string | null
  size?: number | null
}

export interface AreaRefMini {
  id: string
  name: string
  setor_name: string | null
}

export interface PersonMini {
  id: string
  full_name: string
}

export interface StackMini {
  id: string
  name: string
  category: string | null
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
  cnpj?: string | null
  contato?: string | null
  email?: string | null
  telefone?: string | null
  notes?: string | null
}

export type FornecedorUpdate = Partial<FornecedorCreate>

export interface Servico {
  id: string
  name: string
  description: string | null
  data_publicacao: string | null
  ano_referencia: number
  area_usuaria: string | null
  processo_relacionado: string | null
  disponibilidade: string | null
  sla_atendimento: string | null
  tipo_suporte: ServicoSuporte | null
  status_servico: ServicoStatus | null
  responsavel_person_id: string | null
  responsavel: PersonMini | null
  process_links?: ServiceProcessLink[]
  sem_subprocesso_disponivel: boolean
  justificativa_sem_subprocesso: string | null
  is_active: boolean
  order: number
}

export interface ServicoCreate {
  name: string
  description?: string | null
  data_publicacao?: string | null
  status_servico: ServicoStatus
  responsavel_person_id?: string | null
  ano_referencia?: number | null
  area_usuaria?: string | null
  processo_relacionado?: string | null
  disponibilidade?: string | null
  sla_atendimento?: string | null
  tipo_suporte?: ServicoSuporte | null
}

export interface ServicoSubprocessoDispensa {
  sem_subprocesso_disponivel: boolean
  justificativa_sem_subprocesso?: string | null
}

export interface Documento {
  id: string
  name: string
  data_documento: string | null
  ano_referencia: number
  object_name: string | null
  filename: string | null
  content_type: string | null
  size: number | null
  category: string | null
  external_link: string | null
  tipo_documento: DocumentoEspecie | null
  formato: DocumentoFormato | string | null
  origem_sistema: string | null
  is_nato_digital: boolean
  assinatura_digital: boolean
  trilha_auditoria: boolean
  local_armazenamento: string | null
  prazo_retencao: string | null
  classificacao: ClassificacaoInformacao | null
  nivel_dados_pessoais: NivelDadosPessoais | null
  dados_pessoais: boolean
  dados_sensiveis: boolean
  observacoes: string | null
  is_active: boolean
  order: number
  created_at: string
}

export interface DocumentoCreate {
  name: string
  data_documento?: string | null
  ano_referencia?: number
  object_name?: string
  filename?: string
  content_type?: string
  size?: number
  category?: string
  external_link?: string
  tipo_documento?: DocumentoEspecie | null
  formato?: DocumentoFormato | string | null
  origem_sistema?: string | null
  is_nato_digital?: boolean
  assinatura_digital?: boolean
  trilha_auditoria?: boolean
  local_armazenamento?: string | null
  prazo_retencao?: string | null
  classificacao?: ClassificacaoInformacao | null
  nivel_dados_pessoais?: NivelDadosPessoais | null
  dados_pessoais?: boolean
  dados_sensiveis?: boolean
  observacoes?: string | null
}

export type DocumentoUpdate = Partial<DocumentoCreate>

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
  numero: string | null
  objeto_contratual: string | null
  status_contrato: ContratoStatus | null
  valor: number | null
  tipo_valor: ContratoTipoValor | null
  centro_custo: string | null
  fiscal_person_id: string | null
  fiscal_nome: string | null
  sla_contratual: string | null
  aditivos: AnexoItem[] | null
  observacoes: string | null
  is_active: boolean
  dias_para_vencer: number | null
}

export interface ContratoCreate {
  fornecedor_id: string
  identificador?: string | null
  vigencia_inicio: string
  vigencia_fim: string
  renovacao_automatica?: boolean
  modelo_licenciamento?: string | null
  gestor_person_id?: string | null
  sustentacao_n1?: Sustentacao
  sustentacao_n2?: Sustentacao
  sustentacao_n3?: Sustentacao
  alerta_dias?: number[]
  object_name?: string
  filename?: string
  content_type?: string
  size?: number
  external_link?: string
  numero?: string | null
  objeto_contratual?: string | null
  status_contrato?: ContratoStatus | null
  valor?: number | null
  tipo_valor?: ContratoTipoValor | null
  centro_custo?: string | null
  fiscal_person_id?: string | null
  sla_contratual?: string | null
  aditivos?: AnexoItem[] | null
  observacoes?: string | null
}

export type ContratoUpdate = Partial<
  Omit<ContratoCreate, "fornecedor_id" | "vigencia_inicio" | "vigencia_fim" | "object_name" | "filename" | "content_type" | "size">
> & {
  vigencia_inicio?: string
  vigencia_fim?: string
  object_name?: string | null
  filename?: string | null
  content_type?: string | null
  size?: number | null
}

export type ProductAlertaCode =
  | "producao_sem_servico" | "tecnico_nao_referencia" | "sem_documentacao"
  | "externo_sem_contrato" | "produto_parado" | "doc_desatualizada"

export interface ProductAlerta {
  code: ProductAlertaCode
  nivel: "alto" | "medio"
  message: string
}

export type SaudeClasse = "saudavel" | "atencao" | "critico"

export interface HealthCheck {
  code: string
  label: string
  status: "pass" | "fail" | "na"
  weight: number
}

export interface ProductHealth {
  score: number
  classe: SaudeClasse
  applicable_weight: number
  passed_weight: number
  checks: HealthCheck[]
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
  responsavel_tecnico_nome: string | null
  requires_contract: boolean
  has_active_contract: boolean
  is_active: boolean
  created_at: string
  sigla: string | null
  categoria: ProductCategoria | null
  unidade: ProductUnidade | null
  status_produto: ProductStatus | null
  tipo_desenvolvimento: ProductTipoDev | null
  fornecedor_nome: string | null
  contrato_status: ContratoStatus | null
  contrato_vigencia_fim: string | null
  contrato_a_vencer: boolean
  ultima_release: string | null
  doc_status: DocumentacaoStatus | null
  has_documentation: boolean
  tem_dados_pessoais: boolean
  is_critico: boolean
  corporativo?: boolean
  alertas: ProductAlerta[]
  score: number
  classe: SaudeClasse
  saude_gaps: string[]
  servicos_count: number
  stacks?: StackMini[]
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
  responsavel_tecnico: PersonMini | null
  stacks: StackMini[]
  fornecedor: Fornecedor | null
  origin_task_id: string | null
  is_active: boolean
  requires_contract: boolean
  has_active_contract: boolean
  created_at: string
  updated_at: string
  // campos novos "Produtos Digitais"
  sigla: string | null
  link_descricao: string | null
  categoria: ProductCategoria | null
  unidade: ProductUnidade | null
  dono_negocio: PersonMini | null
  publico_alvo: string | null
  url_acesso: string | null
  observacoes: string | null
  status_produto: ProductStatus | null
  tipo_desenvolvimento: ProductTipoDev | null
  desenvolvido_por: string | null
  fornecedor_cnpj: string | null
  modelo_contratacao: ProductModeloContratacao | null
  ambiente_tecnologico: string | null
  tecnologias: string | null
  link_repositorio: string | null
  link_dev: string | null
  link_hml: string | null
  link_prd: string | null
  login_idigital: boolean
  corporativo: boolean
  servicos: Servico[]
  documentos: Documento[]
  processos: ProdutoProcessoLink[]
  contratos: Contrato[]
  releases: Release[]
  documentations: Documentation[]
  supports: Support[]
  health: ProductHealth | null
}

export interface ProductCreate {
  name: string
  simbolo?: string | null
  description?: string | null
  dominio_funcional?: string | null
  origem?: ProductOrigem
  lifecycle?: ProductLifecycle
  criticidade?: ProductCriticidade
  data_entrada_producao?: string | null
  area_id?: string | null
  responsavel_person_id?: string | null
  responsavel_tecnico_person_id?: string | null
  stack_ids?: string[] | null
  fornecedor_id?: string | null
  origin_task_id?: string
  // campos novos
  sigla?: string | null
  link_descricao?: string | null
  categoria?: ProductCategoria | null
  unidade?: ProductUnidade | null
  dono_negocio_person_id?: string | null
  publico_alvo?: string | null
  url_acesso?: string | null
  observacoes?: string | null
  status_produto?: ProductStatus | null
  desenvolvido_por?: string | null
  fornecedor_cnpj?: string | null
  modelo_contratacao?: ProductModeloContratacao | null
  ambiente_tecnologico?: string | null
  tecnologias?: string | null
  link_repositorio?: string | null
  link_dev?: string | null
  link_hml?: string | null
  link_prd?: string | null
  login_idigital?: boolean | null
  corporativo?: boolean | null
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
  by_status: Record<string, number>
  em_desenvolvimento: number
  em_producao: number
  em_sustentacao: number
  descontinuados: number
  internos: number
  externos: number
  sem_contrato: number
  contratos_a_vencer_90d: number
  sem_documentacao: number
  criticos: number
  com_dados_pessoais: number
  releases_publicadas_mes: number
}

// ── Release / Documentação / Sustentação / Segurança ──
export interface Release {
  id: string
  versao: string
  nome: string | null
  data_release: string | null
  ambiente: ReleaseAmbiente | null
  tipo: ReleaseTipo | null
  descricao_mudanca: string | null
  impacto: ReleaseImpacto | null
  responsavel_person_id: string | null
  responsavel_nome: string | null
  evidencia_link: string | null
  evidencia_anexos: AnexoItem[] | null
  changelog: string | null
  tem_rollback: boolean
  descricao_rollback: string | null
  doc_atualizada: boolean
  status: ReleaseStatus
  created_at: string
}

export interface ReleaseCreate {
  versao: string
  nome?: string | null
  data_release?: string | null
  ambiente?: ReleaseAmbiente | null
  tipo?: ReleaseTipo | null
  descricao_mudanca?: string | null
  impacto?: ReleaseImpacto | null
  responsavel_person_id?: string | null
  evidencia_link?: string | null
  evidencia_anexos?: AnexoItem[] | null
  changelog?: string | null
  tem_rollback?: boolean
  descricao_rollback?: string | null
  doc_atualizada?: boolean
  status?: ReleaseStatus
}

export type ReleaseUpdate = Partial<ReleaseCreate>

export interface Documentation {
  id: string
  tipo: DocumentacaoTipo
  titulo: string
  conteudo_md: string | null
  versao_relacionada: string | null
  autor_person_id: string | null
  autor_nome: string | null
  status: DocumentacaoStatus
  link_interno: string | null
  anexos: AnexoItem[] | null
  created_at: string
  updated_at: string
}

export interface DocumentationCreate {
  titulo: string
  tipo?: DocumentacaoTipo | null
  conteudo_md?: string | null
  versao_relacionada?: string | null
  autor_person_id?: string | null
  status?: DocumentacaoStatus | null
  link_interno?: string | null
  anexos?: AnexoItem[] | null
}

export type DocumentationUpdate = Partial<DocumentationCreate>

export type SupportNivel = "n1" | "n2" | "n3"

export interface Support {
  id: string
  canal_atendimento: string | null
  nivel: SupportNivel
  interno: boolean
  person_ids: string[]
  nomes_externos: string[]
  sla_horas: number | null
  responsaveis: PersonMini[]
  observacoes: string | null
}

export interface SupportCreate {
  canal_atendimento?: string | null
  nivel: SupportNivel
  interno: boolean
  person_ids: string[]
  nomes_externos: string[]
  sla_horas?: number | null
  observacoes?: string | null
}

export type SupportUpdate = Partial<SupportCreate>

export interface AlertaContrato {
  tipo: string
  product_id: string
  product_name: string
  contrato_id: string | null
  vigencia_fim: string | null
  dias_para_vencer: number | null
  mensagem: string
}

// ── Inteligência de portfólio ──
export interface PendenciaAgg {
  code: ProductAlertaCode | string
  nivel: "alto" | "medio"
  label: string
  count: number
}
export interface MatrizRiscoCell {
  criticidade: ProductCriticidade
  classe: SaudeClasse
  count: number
}
export interface TopRiscoItem {
  id: string
  name: string
  score: number
  classe: SaudeClasse
  criticidade: ProductCriticidade
  principais_gaps: string[]
}
export interface ProdutoParadoItem {
  id: string
  name: string
  ultima_release_date: string | null
  meses: number | null
}
export interface DocDebtItem {
  id: string
  name: string
  doc_status: string | null
}
export interface PortfolioInteligencia {
  media_score: number
  distribuicao: Record<SaudeClasse, number>
  matriz_risco: MatrizRiscoCell[]
  top_risco: TopRiscoItem[]
  pendencias: PendenciaAgg[]
  produtos_parados: ProdutoParadoItem[]
  doc_debt: DocDebtItem[]
}
export interface FornecedorContratoAgg {
  fornecedor_id: string | null
  fornecedor_nome: string
  produtos_count: number
  contratos_count: number
  valor_total: number
  proximo_vencimento: string | null
}
export interface ContratoAVencerItem {
  contrato_id: string
  product_id: string
  product_name: string
  fornecedor_nome: string | null
  vigencia_fim: string
  dias_para_vencer: number
  valor: number | null
}
export interface ContratosInteligencia {
  valor_total: number
  valor_total_por_tipo: Record<string, number>
  valor_ambiguo: boolean
  por_fornecedor: FornecedorContratoAgg[]
  buckets_vencimento: Record<string, number>
  sem_renovacao_avencer: ContratoAVencerItem[]
}

// ── Configuração do Índice de Saúde ──
export interface HealthConfigCheck {
  code: string
  label: string
  weight: number
  default_weight: number
  aplicabilidade: string
}
export interface HealthConfigResponse {
  checks: HealthConfigCheck[]
  limiar_saudavel: number
  limiar_atencao: number
  is_customizado: boolean
}
export interface HealthConfigUpdate {
  weights: Record<string, number>
  limiar_saudavel: number
  limiar_atencao: number
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

// ── Portfólio de Processos (versionado) ──────

export type ProcessNivel = "diretoria" | "macroprocesso" | "processo" | "subprocesso"
export type ProcessVersionStatus = "rascunho" | "consolidada" | "arquivada"
export type ProcessItemStatus = "planejado" | "em_andamento" | "concluido"
export type ProcessCriticidade = "baixa" | "media" | "alta" | "critica"
export type ProcessMaturidade = "inexistente" | "inicial" | "definido" | "gerenciado" | "otimizado"

export interface Anexo {
  object_name: string
  filename: string
  content_type?: string | null
  size?: number | null
}

export interface ProcessPortfolio {
  id: string
  name: string
  description: string | null
  is_active: boolean
  current_version_id: string | null
  current_version: number | null
  versions_count: number
  created_at: string
}

export interface ProcessVersionSummary {
  id: string
  version: number
  status: ProcessVersionStatus
  justification: string | null
  consolidated_at: string | null
  created_at: string
}

export interface ProcessItem {
  id: string
  lineage_id: string
  parent_id: string | null
  nivel: ProcessNivel
  codigo: string | null
  name: string
  description: string | null
  diretoria: string | null
  area: string | null
  analista: string | null
  dono: string | null
  order: number
  analista_person_id: string | null
  analista_nome: string | null
  dono_person_id: string | null
  dono_nome: string | null
  area_id: string | null
  area_nome: string | null
  vigencia_inicio: string | null
  vigencia_fim: string | null
  data_documentacao: string | null
  doc_previsao_inicio: string | null
  doc_previsao_fim: string | null
  passagem_para_ti: boolean
  documentado?: boolean
  anexos: Anexo[] | null
  status_item: ProcessItemStatus
  criticidade: ProcessCriticidade | null
  objetivo: string | null
  nivel_maturidade: ProcessMaturidade | null
  tipo_documento: string | null
  versao_documento: string | null
  proxima_revisao: string | null
  link_externo: string | null
  frequencia: string | null
  entradas: string | null
  saidas: string | null
  children: ProcessItem[]
}

export interface ProcessVersionTree {
  id: string
  portfolio_id: string
  version: number
  status: ProcessVersionStatus
  justification: string | null
  consolidated_at: string | null
  created_at: string
  editable: boolean
  items: ProcessItem[]
}

export interface ProcessItemInput {
  nivel: ProcessNivel
  codigo?: string | null
  name: string
  description?: string | null
  diretoria?: string | null
  area?: string | null
  analista?: string | null
  dono?: string | null
  parent_id?: string | null
  order?: number | null
  analista_person_id?: string | null
  dono_person_id?: string | null
  area_id?: string | null
  vigencia_inicio?: string | null
  vigencia_fim?: string | null
  data_documentacao?: string | null
  doc_previsao_inicio?: string | null
  doc_previsao_fim?: string | null
  passagem_para_ti?: boolean
  documentado?: boolean
  anexos?: Anexo[] | null
  status_item?: ProcessItemStatus
  criticidade?: ProcessCriticidade | null
  objetivo?: string | null
  nivel_maturidade?: ProcessMaturidade | null
  tipo_documento?: string | null
  versao_documento?: string | null
  proxima_revisao?: string | null
  link_externo?: string | null
  frequencia?: string | null
  entradas?: string | null
  saidas?: string | null
}

export interface ServiceProcessLink {
  item_lineage_id: string
  portfolio_id: string
  name: string | null
  codigo: string | null
}

// ── API ───────────────────────────────────────

export const produtosApi = {
  getDashboard: () =>
    api.get<DashboardKpis>("/produtos/dashboard").then((r) => r.data),

  getAlertasContratos: () =>
    api.get<AlertaContrato[]>("/produtos/alertas/contratos").then((r) => r.data),

  getPortfolioIntelligence: () =>
    api.get<PortfolioInteligencia>("/produtos/inteligencia/portfolio").then((r) => r.data),

  getContratosIntelligence: () =>
    api.get<ContratosInteligencia>("/produtos/inteligencia/contratos").then((r) => r.data),

  getHealthConfig: () =>
    api.get<HealthConfigResponse>("/produtos/config/health").then((r) => r.data),

  updateHealthConfig: (data: HealthConfigUpdate) =>
    api.put<HealthConfigResponse>("/produtos/config/health", data).then((r) => r.data),

  listAreas: () =>
    api.get<AreaRefMini[]>("/produtos/areas").then((r) => r.data),

  listSetores: () =>
    api.get<AreaRefMini[]>("/produtos/setores").then((r) => r.data),

  listPersons: () =>
    api.get<PersonMini[]>("/produtos/persons").then((r) => r.data),

  listPos: () =>
    api.get<PersonMini[]>("/produtos/pos").then((r) => r.data),

  listTechReferences: () =>
    api.get<PersonMini[]>("/produtos/tech-references").then((r) => r.data),

  listStacks: () =>
    api.get<StackMini[]>("/produtos/stacks").then((r) => r.data),

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

  definirFornecedor: (productId: string, fornecedorId: string | null) =>
    api
      .patch<Product>(`/produtos/${productId}/fornecedor`, { fornecedor_id: fornecedorId })
      .then((r) => r.data),

  deleteProduct: (id: string) =>
    api.delete<void>(`/produtos/${id}`).then((r) => r.data),

  addServico: (productId: string, data: ServicoCreate) =>
    api.post<Servico>(`/produtos/${productId}/servicos`, data).then((r) => r.data),

  updateServico: (productId: string, servicoId: string, data: ServicoCreate) =>
    api.patch<Servico>(`/produtos/${productId}/servicos/${servicoId}`, data).then((r) => r.data),

  deleteServico: (productId: string, servicoId: string) =>
    api.delete<void>(`/produtos/${productId}/servicos/${servicoId}`).then((r) => r.data),

  setServicoSubprocessoDispensa: (productId: string, servicoId: string, data: ServicoSubprocessoDispensa) =>
    api
      .patch<Servico>(`/produtos/${productId}/servicos/${servicoId}/subprocesso-dispensa`, data)
      .then((r) => r.data),

  addDocumento: (productId: string, data: DocumentoCreate) =>
    api.post<Documento>(`/produtos/${productId}/documentos`, data).then((r) => r.data),

  updateDocumento: (productId: string, docId: string, data: DocumentoUpdate) =>
    api.patch<Documento>(`/produtos/${productId}/documentos/${docId}`, data).then((r) => r.data),

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

  // ── Releases ──
  listReleases: (productId: string) =>
    api.get<Release[]>(`/produtos/${productId}/releases`).then((r) => r.data),
  addRelease: (productId: string, data: ReleaseCreate) =>
    api.post<Release>(`/produtos/${productId}/releases`, data).then((r) => r.data),
  updateRelease: (productId: string, releaseId: string, data: ReleaseUpdate) =>
    api.patch<Release>(`/produtos/${productId}/releases/${releaseId}`, data).then((r) => r.data),
  deleteRelease: (productId: string, releaseId: string) =>
    api.delete<void>(`/produtos/${productId}/releases/${releaseId}`).then((r) => r.data),

  // ── Documentação (Markdown) ──
  getDocTemplate: () =>
    api.get<{ conteudo_md: string }>("/produtos/documentation-template").then((r) => r.data.conteudo_md),
  listDocumentations: (productId: string) =>
    api.get<Documentation[]>(`/produtos/${productId}/documentations`).then((r) => r.data),
  addDocumentation: (productId: string, data: DocumentationCreate) =>
    api.post<Documentation>(`/produtos/${productId}/documentations`, data).then((r) => r.data),
  updateDocumentation: (productId: string, docId: string, data: DocumentationUpdate) =>
    api.patch<Documentation>(`/produtos/${productId}/documentations/${docId}`, data).then((r) => r.data),
  deleteDocumentation: (productId: string, docId: string) =>
    api.delete<void>(`/produtos/${productId}/documentations/${docId}`).then((r) => r.data),

  // ── Sustentação / SLA ──
  listSupports: (productId: string) =>
    api.get<Support[]>(`/produtos/${productId}/supports`).then((r) => r.data),
  createSupport: (productId: string, data: SupportCreate) =>
    api.post<Support>(`/produtos/${productId}/supports`, data).then((r) => r.data),
  updateSupport: (productId: string, supportId: string, data: SupportUpdate) =>
    api.patch<Support>(`/produtos/${productId}/supports/${supportId}`, data).then((r) => r.data),
  deleteSupport: (productId: string, supportId: string) =>
    api.delete<void>(`/produtos/${productId}/supports/${supportId}`).then((r) => r.data),

  // ── Portfólio de Processos ──
  listProcessPortfolios: () =>
    api.get<ProcessPortfolio[]>("/produtos/process-portfolios").then((r) => r.data),

  createProcessPortfolio: (data: { name: string; description?: string }) =>
    api.post<ProcessPortfolio>("/produtos/process-portfolios", data).then((r) => r.data),

  updateProcessPortfolio: (
    portfolioId: string,
    data: { name?: string; description?: string | null; is_active?: boolean },
  ) => api.patch<ProcessPortfolio>(`/produtos/process-portfolios/${portfolioId}`, data).then((r) => r.data),

  deleteProcessPortfolio: (portfolioId: string) =>
    api.delete<void>(`/produtos/process-portfolios/${portfolioId}`).then((r) => r.data),

  getCurrentPortfolioTree: (portfolioId: string) =>
    api.get<ProcessVersionTree>(`/produtos/process-portfolios/${portfolioId}/current`).then((r) => r.data),

  listPortfolioVersions: (portfolioId: string) =>
    api.get<ProcessVersionSummary[]>(`/produtos/process-portfolios/${portfolioId}/versions`).then((r) => r.data),

  createPortfolioVersion: (portfolioId: string, justification: string) =>
    api
      .post<ProcessVersionTree>(`/produtos/process-portfolios/${portfolioId}/versions`, { justification })
      .then((r) => r.data),

  getVersionTree: (versionId: string) =>
    api.get<ProcessVersionTree>(`/produtos/process-portfolios/versions/${versionId}/tree`).then((r) => r.data),

  consolidateVersion: (versionId: string) =>
    api
      .post<ProcessVersionTree>(`/produtos/process-portfolios/versions/${versionId}/consolidate`)
      .then((r) => r.data),

  createPortfolioItem: (versionId: string, data: ProcessItemInput) =>
    api
      .post<ProcessItem>(`/produtos/process-portfolios/versions/${versionId}/items`, data)
      .then((r) => r.data),

  updatePortfolioItem: (versionId: string, itemId: string, data: Partial<ProcessItemInput>) =>
    api
      .patch<ProcessItem>(`/produtos/process-portfolios/versions/${versionId}/items/${itemId}`, data)
      .then((r) => r.data),

  deletePortfolioItem: (versionId: string, itemId: string) =>
    api
      .delete<void>(`/produtos/process-portfolios/versions/${versionId}/items/${itemId}`)
      .then((r) => r.data),

  reorderPortfolioItems: (versionId: string, items: { id: string; order: number }[]) =>
    api
      .patch<ProcessVersionTree>(`/produtos/process-portfolios/versions/${versionId}/items/reorder`, { items })
      .then((r) => r.data),

  listServiceProcessLinks: (servicoId: string) =>
    api.get<ServiceProcessLink[]>(`/produtos/servicos/${servicoId}/process-links`).then((r) => r.data),

  setServiceProcessLinks: (servicoId: string, portfolioId: string, itemLineageIds: string[]) =>
    api
      .put<ServiceProcessLink[]>(`/produtos/servicos/${servicoId}/process-links`, {
        portfolio_id: portfolioId,
        item_lineage_ids: itemLineageIds,
      })
      .then((r) => r.data),
}
