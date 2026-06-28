import type {
  AutenticacaoTipo,
  ClassificacaoInformacao,
  ContratoStatus,
  ContratoTipoValor,
  DocumentacaoStatus,
  DocumentacaoTipo,
  DocumentoEspecie,
  DocumentoFormato,
  IntegracaoTipo,
  NivelDadosPessoais,
  ProductCategoria,
  ProductCriticidade,
  ProductLifecycle,
  ProductModeloContratacao,
  ProductOrigem,
  ProductStatus,
  ProductTipoDev,
  ProcessItemStatus,
  ProductUnidade,
  ReleaseAmbiente,
  ReleaseImpacto,
  ReleaseStatus,
  ReleaseTipo,
  RiscoIndisponibilidade,
  ServicoStatus,
  ServicoSuporte,
  Sustentacao,
} from "@/api/produtos"

export const TIPODEV_LABEL: Record<ProductTipoDev, string> = {
  interno: "Interno",
  externo: "Externo",
  hibrido: "Híbrido",
}

export const ORIGEM_LABEL: Record<ProductOrigem, string> = {
  interno: "Interno", cots: "COTS", customizacao: "Customização", saas: "SaaS",
}
export const LIFECYCLE_LABEL: Record<ProductLifecycle, string> = {
  concepcao: "Concepção", desenvolvimento: "Desenvolvimento", producao: "Produção", descontinuado: "Descontinuado",
}
export const CRITICIDADE_LABEL: Record<ProductCriticidade, string> = {
  baixa: "Baixa", media: "Média", alta: "Alta", critica: "Crítica",
}
export const CRITICIDADE_COLOR: Record<ProductCriticidade, string> = {
  baixa: "#16A34A", media: "#CA8A04", alta: "#EA580C", critica: "#DC2626",
}
// Saúde/maturidade do produto (índice de portfólio)
export const SAUDE_LABEL: Record<"saudavel" | "atencao" | "critico", string> = {
  saudavel: "Saudável", atencao: "Atenção", critico: "Crítico",
}
export const SAUDE_COLOR: Record<"saudavel" | "atencao" | "critico", string> = {
  saudavel: "#16A34A", atencao: "#CA8A04", critico: "#DC2626",
}
export const SUSTENTACAO_LABEL: Record<Sustentacao, string> = {
  interna: "Interna", externa: "Externa", hibrida: "Híbrida",
}

export const ORIGEM_OPTS: ProductOrigem[] = ["interno", "cots", "customizacao", "saas"]
export const LIFECYCLE_OPTS: ProductLifecycle[] = ["concepcao", "desenvolvimento", "producao", "descontinuado"]
export const CRITICIDADE_OPTS: ProductCriticidade[] = ["baixa", "media", "alta", "critica"]
export const SUSTENTACAO_OPTS: Sustentacao[] = ["interna", "externa", "hibrida"]

// ── "Produtos Digitais" (spec TI corporativa) ──
export const STATUS_LABEL: Record<ProductStatus, string> = {
  ideia: "Ideia", discovery: "Discovery", desenvolvimento: "Em desenvolvimento", homologacao: "Homologação",
  producao: "Produção", sustentacao: "Sustentação", evolucao: "Evolução", suspenso: "Suspenso", descontinuado: "Descontinuado",
}
export const STATUS_COLOR: Record<ProductStatus, string> = {
  ideia: "#6B7280", discovery: "#8B5CF6", desenvolvimento: "#2563EB", homologacao: "#CA8A04",
  producao: "#16A34A", sustentacao: "#0891B2", evolucao: "#7C3AED", suspenso: "#EA580C", descontinuado: "#DC2626",
}
export const STATUS_OPTS: ProductStatus[] = ["ideia", "discovery", "desenvolvimento", "homologacao", "producao", "sustentacao", "evolucao", "suspenso", "descontinuado"]

export const CATEGORIA_LABEL: Record<ProductCategoria, string> = {
  sistema_interno_dev: "Sistema interno (Desenvolvimento)",
  sistema_interno_ia: "Sistema interno (IA)",
  sistema_externo_ia: "Sistema externo (IA)",
  sistema_externo_implantacao: "Sistema externo (Implantação)",
  sistema_externo_dn: "Sistema externo (DN)",
}
export const CATEGORIA_OPTS: ProductCategoria[] = ["sistema_interno_dev", "sistema_interno_ia", "sistema_externo_ia", "sistema_externo_implantacao", "sistema_externo_dn"]

export const UNIDADE_LABEL: Record<ProductUnidade, string> = {
  sesi: "SESI", senai: "SENAI", iel: "IEL", fiea: "FIEA", corporativo: "Corporativo",
}
export const UNIDADE_OPTS: ProductUnidade[] = ["sesi", "senai", "iel", "fiea", "corporativo"]

export const MODELO_CONTRAT_LABEL: Record<ProductModeloContratacao, string> = {
  licenca: "Licença", saas: "SaaS", fabrica: "Fábrica de Software", servico_continuado: "Serviço continuado",
  projeto_pontual: "Projeto pontual", interno: "Desenvolvimento interno", outro: "Outro",
}
export const MODELO_CONTRAT_OPTS: ProductModeloContratacao[] = ["licenca", "saas", "fabrica", "servico_continuado", "projeto_pontual", "interno", "outro"]

export const SERVICO_SUPORTE_LABEL: Record<ServicoSuporte, string> = {
  interno: "Interno", fornecedor: "Fornecedor", compartilhado: "Compartilhado", service_desk: "Service Desk",
  devops: "DevOps", desenvolvimento: "Desenvolvimento", infraestrutura: "Infraestrutura",
}
export const SERVICO_SUPORTE_OPTS: ServicoSuporte[] = ["interno", "fornecedor", "compartilhado", "service_desk", "devops", "desenvolvimento", "infraestrutura"]

export const SERVICO_STATUS_LABEL: Record<ServicoStatus, string> = {
  ativo: "Ativo", em_implantacao: "Em implantação", suspenso: "Suspenso", descontinuado: "Descontinuado",
}
export const SERVICO_STATUS_OPTS: ServicoStatus[] = ["ativo", "em_implantacao", "suspenso", "descontinuado"]

export const DOC_ESPECIE_LABEL: Record<DocumentoEspecie, string> = {
  relatorio: "Relatório",
  parecer: "Parecer",
  termo: "Termo",
  certificado: "Certificado",
  formulario_eletronico: "Formulário eletrônico",
  dashboard: "Dashboard",
  registro_sistemico: "Registro sistêmico",
  comprovante_recibo: "Comprovante/Recibo",
  extrato: "Extrato",
  documento_fiscal_eletronico: "Documento fiscal eletrônico",
  oficio: "Ofício",
  outro: "Outro",
}
export const DOC_ESPECIE_OPTS: DocumentoEspecie[] = [
  "relatorio", "parecer", "termo", "certificado", "formulario_eletronico", "dashboard",
  "registro_sistemico", "comprovante_recibo", "extrato", "documento_fiscal_eletronico", "oficio", "outro",
]
/** Rótulos legados + espécies atuais (exibição de registros antigos). */
export const DOC_TIPO_LABEL: Record<string, string> = {
  ...DOC_ESPECIE_LABEL,
  pdf: "PDF",
  planilha: "Planilha",
  formulario: "Formulário eletrônico",
  workflow: "Workflow",
  registro: "Registro sistêmico",
}
export const DOC_TIPO_OPTS = DOC_ESPECIE_OPTS

export const DOC_FORMATO_LABEL: Record<DocumentoFormato, string> = {
  pdf: "PDF", xlsx: "XLSX", xls: "XLS", docx: "DOCX", doc: "DOC", xml: "XML",
  csv: "CSV", txt: "TXT", imagem: "Imagem", outro: "Outro",
}

export const NIVEL_LGPD_LABEL: Record<NivelDadosPessoais, string> = {
  sem_dados_pessoais: "Sem dados pessoais",
  dados_pessoais: "Dados pessoais",
  dados_pessoais_sensiveis: "Dados pessoais sensíveis",
}
export const NIVEL_LGPD_OPTS: NivelDadosPessoais[] = ["sem_dados_pessoais", "dados_pessoais", "dados_pessoais_sensiveis"]

export const CLASSIFICACAO_LABEL: Record<ClassificacaoInformacao, string> = {
  publica: "Pública", interna: "Interna", confidencial: "Confidencial", restrita: "Restrita",
}
export const CLASSIFICACAO_COLOR: Record<ClassificacaoInformacao, string> = {
  publica: "#16A34A", interna: "#2563EB", confidencial: "#EA580C", restrita: "#DC2626",
}
export const CLASSIFICACAO_OPTS: ClassificacaoInformacao[] = ["publica", "interna", "confidencial", "restrita"]

export const CONTRATO_STATUS_LABEL: Record<ContratoStatus, string> = {
  sem_contrato: "Sem contrato", em_formalizacao: "Em formalização", vigente: "Vigente", a_vencer: "A vencer",
  vencido: "Vencido", em_renovacao: "Em renovação", encerrado: "Encerrado",
}
export const CONTRATO_STATUS_COLOR: Record<ContratoStatus, string> = {
  sem_contrato: "#6B7280", em_formalizacao: "#CA8A04", vigente: "#16A34A", a_vencer: "#EA580C",
  vencido: "#DC2626", em_renovacao: "#2563EB", encerrado: "#6B7280",
}
export const CONTRATO_STATUS_OPTS: ContratoStatus[] = ["sem_contrato", "em_formalizacao", "vigente", "a_vencer", "vencido", "em_renovacao", "encerrado"]

export const CONTRATO_TIPOVALOR_LABEL: Record<ContratoTipoValor, string> = {
  mensal: "Mensal", anual: "Anual", global: "Global", sob_demanda: "Sob demanda",
}
export const CONTRATO_TIPOVALOR_OPTS: ContratoTipoValor[] = ["mensal", "anual", "global", "sob_demanda"]

export const RELEASE_TIPO_LABEL: Record<ReleaseTipo, string> = {
  correcao: "Correção", melhoria: "Melhoria", nova_funcionalidade: "Nova funcionalidade", seguranca: "Segurança",
  integracao: "Integração", refatoracao: "Refatoração", ajuste_tecnico: "Ajuste técnico",
}
export const RELEASE_TIPO_OPTS: ReleaseTipo[] = ["correcao", "melhoria", "nova_funcionalidade", "seguranca", "integracao", "refatoracao", "ajuste_tecnico"]

export const RELEASE_STATUS_LABEL: Record<ReleaseStatus, string> = {
  planejada: "Planejada", em_desenvolvimento: "Em desenvolvimento", em_homologacao: "Em homologação",
  publicada: "Publicada", cancelada: "Cancelada", revertida: "Revertida",
}
export const RELEASE_STATUS_COLOR: Record<ReleaseStatus, string> = {
  planejada: "#6B7280", em_desenvolvimento: "#2563EB", em_homologacao: "#CA8A04",
  publicada: "#16A34A", cancelada: "#DC2626", revertida: "#EA580C",
}
export const RELEASE_STATUS_OPTS: ReleaseStatus[] = ["planejada", "em_desenvolvimento", "em_homologacao", "publicada", "cancelada", "revertida"]

export const RELEASE_AMBIENTE_LABEL: Record<ReleaseAmbiente, string> = { dev: "DEV", hml: "HML", prd: "PRD" }
export const RELEASE_AMBIENTE_OPTS: ReleaseAmbiente[] = ["dev", "hml", "prd"]
export const RELEASE_IMPACTO_LABEL: Record<ReleaseImpacto, string> = { baixo: "Baixo", medio: "Médio", alto: "Alto" }
export const RELEASE_IMPACTO_OPTS: ReleaseImpacto[] = ["baixo", "medio", "alto"]

export const DOCNT_TIPO_LABEL: Record<DocumentacaoTipo, string> = {
  usuario: "Usuário", tecnica: "Técnica", api: "API", implantacao: "Implantação",
  sustentacao: "Sustentação", arquitetura: "Arquitetura", seguranca: "Segurança", operacional: "Operacional",
}
export const DOCNT_TIPO_OPTS: DocumentacaoTipo[] = ["usuario", "tecnica", "api", "implantacao", "sustentacao", "arquitetura", "seguranca", "operacional"]

export const DOCNT_STATUS_LABEL: Record<DocumentacaoStatus, string> = {
  nao_iniciada: "Não iniciada", em_elaboracao: "Em elaboração", publicada: "Publicada",
  necessita_atualizacao: "Necessita atualização", obsoleta: "Obsoleta",
}
export const DOCNT_STATUS_COLOR: Record<DocumentacaoStatus, string> = {
  nao_iniciada: "#6B7280", em_elaboracao: "#CA8A04", publicada: "#16A34A",
  necessita_atualizacao: "#EA580C", obsoleta: "#DC2626",
}
export const DOCNT_STATUS_OPTS: DocumentacaoStatus[] = ["nao_iniciada", "em_elaboracao", "publicada", "necessita_atualizacao", "obsoleta"]

export const SUPORTE_TIPO_OPTS = ["interna", "fornecedor", "compartilhada"] as const
export const SUPORTE_TIPO_LABEL: Record<string, string> = { interna: "Interna", fornecedor: "Fornecedor", compartilhada: "Compartilhada" }

export const INTEGRACAO_TIPO_LABEL: Record<IntegracaoTipo, string> = {
  api: "API", banco: "Banco de dados", arquivo: "Arquivo", etl: "ETL", webhook: "Webhook", manual: "Manual", outro: "Outro",
}
export const INTEGRACAO_TIPO_OPTS: IntegracaoTipo[] = ["api", "banco", "arquivo", "etl", "webhook", "manual", "outro"]

export const AUTENTICACAO_TIPO_LABEL: Record<AutenticacaoTipo, string> = {
  active_directory: "Active Directory", entra_id: "Microsoft Entra ID", login_local: "Login local",
  sso: "SSO", token: "Token", oauth: "OAuth", outro: "Outro",
}
export const AUTENTICACAO_TIPO_OPTS: AutenticacaoTipo[] = ["active_directory", "entra_id", "login_local", "sso", "token", "oauth", "outro"]

export const RISCO_LABEL: Record<RiscoIndisponibilidade, string> = { baixo: "Baixo", medio: "Médio", alto: "Alto", critico: "Crítico" }
export const RISCO_COLOR: Record<RiscoIndisponibilidade, string> = {
  baixo: "#16A34A", medio: "#CA8A04", alto: "#EA580C", critico: "#DC2626",
}
export const RISCO_OPTS: RiscoIndisponibilidade[] = ["baixo", "medio", "alto", "critico"]

export const PROCESS_ITEM_STATUS_LABEL: Record<ProcessItemStatus, string> = {
  planejado: "Planejado", em_andamento: "Em andamento", concluido: "Concluído",
}
export const PROCESS_ITEM_STATUS_COLOR: Record<ProcessItemStatus, string> = {
  planejado: "#6B7280", em_andamento: "#2563EB", concluido: "#16A34A",
}
export const PROCESS_ITEM_STATUS_OPTS: ProcessItemStatus[] = ["planejado", "em_andamento", "concluido"]
