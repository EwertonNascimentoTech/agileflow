import type { AcompStatus, Categoria, FonteDados, FonteMetrica, Granularidade, IndicadorStatus, Sentido } from "@/api/indicadores"

const YEAR = new Date().getFullYear()

export const ANOS = [YEAR + 1, YEAR, YEAR - 1, YEAR - 2, YEAR - 3, YEAR - 4]

export const MESES: [number, string][] = [
  [1, "Janeiro"], [2, "Fevereiro"], [3, "Março"], [4, "Abril"],
  [5, "Maio"], [6, "Junho"], [7, "Julho"], [8, "Agosto"],
  [9, "Setembro"], [10, "Outubro"], [11, "Novembro"], [12, "Dezembro"],
]

export const CATEGORIA_LABEL: Record<Categoria, string> = {
  estrategico: "Estratégico",
  tatico: "Tático",
}
export const CATEGORIA_OPTS: Categoria[] = ["estrategico", "tatico"]

export const GRANULARIDADE_LABEL: Record<Granularidade, string> = {
  mensal: "Mensal",
  bimestral: "Bimestral",
  trimestral: "Trimestral",
  semestral: "Semestral",
  anual: "Anual",
}
export const GRANULARIDADE_OPTS: Granularidade[] = ["mensal", "bimestral", "trimestral", "semestral", "anual"]

export const SENTIDO_LABEL: Record<Sentido, string> = {
  maior_melhor: "Quanto maior, melhor",
  menor_melhor: "Quanto menor, melhor",
  faixa_ideal: "Faixa ideal",
}
export const SENTIDO_OPTS: Sentido[] = ["maior_melhor", "menor_melhor", "faixa_ideal"]

export const STATUS_LABEL: Record<IndicadorStatus, string> = {
  ativo: "Ativo",
  inativo: "Inativo",
}
export const STATUS_OPTS: IndicadorStatus[] = ["ativo", "inativo"]

export const FONTE_LABEL: Record<FonteDados, string> = {
  manual: "Manual",
  portfolio: "Portfólio",
}
export const FONTE_OPTS: FonteDados[] = ["manual", "portfolio"]

export const METRICA_LABEL: Record<FonteMetrica, string> = {
  // Produtos
  servicos_publicados: "Serviços digitais — % publicados (prod. produção) sobre publicados (prod. produção + desenvolvimento)",
  documentos_natos_digitais: "Documentos nato-digital — % cadastrados (prod. produção) sobre cadastrados (prod. produção + desenvolvimento); data = publicação do serviço",
  // Projetos (indicadores táticos)
  cronograma_desenvolvimento: "Projetos de desenvolvimento — % de entregas do período concluídas dentro do prazo (▲ %)",
  cronograma_implantacao: "Projetos de implantação — % de entregas do período concluídas dentro do prazo (▲ %)",
  desvio_trabalho_desenvolvimento: "Projetos de desenvolvimento — % de tarefas criadas após o comprometimento do cronograma sobre as planejadas (▼ %)",
  desvio_trabalho_implantacao: "Projetos de implantação — % de tarefas criadas após o comprometimento do cronograma sobre as planejadas (▼ %)",
  pct_desenvolvimento: "Percentual de desenvolvimento — desenvolvimentos ÷ (desenvolvimentos + implantações) do portfólio até o fim do período (▲ %)",
  tempo_analise_oportunidade: "Tempo de análise da oportunidade — dias médios da demanda até virar projeto (▼ dias)",
  lead_time_us: "Lead time de US — dias médios do backlog à entrega das US concluídas no período (▼ dias)",
  pct_sla_estourado: "% de US ativas com SLA estourado — estado corrente: calcule e feche o mês vigente (▼ %)",
  taxa_impedimento: "% de US ativas em impedimento — estado corrente: calcule e feche o mês vigente (▼ %)",
  pct_projetos_ia: "% de projetos com auxílio de IA sobre os que responderam (▲ %)",
}
export const METRICA_OPTS: FonteMetrica[] = [
  "servicos_publicados",
  "documentos_natos_digitais",
  "cronograma_desenvolvimento",
  "cronograma_implantacao",
  "desvio_trabalho_desenvolvimento",
  "desvio_trabalho_implantacao",
  "pct_desenvolvimento",
  "tempo_analise_oportunidade",
  "lead_time_us",
  "pct_sla_estourado",
  "taxa_impedimento",
  "pct_projetos_ia",
]

// Sub-processos do portfólio de TI (sugestões — o campo é texto livre).
// A ordem aqui define a ordem dos agrupamentos no painel e na RTD.
export const SUB_PROCESSOS_PORTFOLIO = [
  "Prospectar Solução de TI",
  "Desenvolver Soluções de TI",
  "Implantar Soluções de TI de Mercado",
  "Tratamento de Bugs de Sistemas",
  "Administrar Melhorias de Sistemas",
]

export const ACOMP_STATUS_LABEL: Record<AcompStatus, string> = {
  pendente: "Pendente",
  atingido: "Atingido",
  em_atencao: "Em atenção",
  nao_atingido: "Não atingido",
}
export const ACOMP_STATUS_COLOR: Record<AcompStatus, string> = {
  pendente: "bg-muted text-muted-foreground",
  atingido: "bg-emerald-100 text-emerald-800",
  em_atencao: "bg-amber-100 text-amber-800",
  nao_atingido: "bg-red-100 text-red-800",
}
