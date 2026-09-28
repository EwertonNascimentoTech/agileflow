import type { PortalProjectSummary } from "@/api/portalPortfolio"

/** Evento global que inicia o tour (botão "?" do Portal / "Tour do Portal" no Modo Cliente). */
export const TOUR_EVENT = "portal-tour:start"

export function startPortalTour() {
  window.dispatchEvent(new Event(TOUR_EVENT))
}

/** O que muda o roteiro: quem é a pessoa e o que ela tem para ver. */
export interface TourCtx {
  /** Cliente (vê Ocorrências e Soluções com IA). */
  isClient: boolean
  /** Portal com menu próprio (/portal). Falso = Modo Cliente, dentro do AgileFlow. */
  standalone: boolean
  /** Tela larga (>= 1024 px): o menu lateral do Portal aparece (no celular ele fica recolhido). */
  wide: boolean
  /** Programa e projeto usados como exemplo nas telas de detalhe (null = pula esses passos). */
  programId: string | null
  projectId: string | null
  /** Ocorrência de exemplo (de preferência aberta pela pessoa); null = pula o passo do detalhe. */
  occurrenceId: string | null
}

export interface TourStep {
  id: string
  /** Tela do passo, relativa à base do Portal ("" = Visão geral). Sem `path`, fica na tela atual. */
  path?: string | ((c: TourCtx) => string)
  /** Valor do `data-tour` destacado. Sem alvo: balão no centro. Alvo que não aparece: passo pulado. */
  target?: string
  /** Folga do destaque em volta do alvo (padrão 8 px; 0 para alvo colado na borda, ex.: menu). */
  pad?: number
  title: string
  body?: string | ((c: TourCtx) => string)
  bullets?: string[] | ((c: TourCtx) => string[])
  when?: (c: TourCtx) => boolean
}

// Os alvos (data-tour) ficam nas telas do Portal: ao renomear ou remover um, ajuste aqui.
export const TOUR_STEPS: TourStep[] = [
  {
    id: "inicio",
    path: "",
    target: "home-title",
    title: "Sua página inicial",
    body:
      "A Visão geral é um retrato de todo o portfólio que você acompanha. Os números vêm direto da gestão dos projetos, então estão sempre atualizados.",
  },
  {
    id: "menu",
    path: "",
    target: "portal-nav",
    pad: 0,
    when: (c) => c.standalone && c.wide,
    title: "Menu do Portal",
    body: "Pelo menu você chega às outras telas:",
    bullets: (c) => [
      "Programas: os grandes objetivos e os projetos de cada um",
      "Projetos: a lista completa, com filtros",
      "Entregas e Marcos: o calendário de entregas",
      ...(c.isClient ? ["Ocorrências e Soluções com IA: os seus pedidos e chamados"] : []),
    ],
  },
  {
    id: "busca",
    path: "",
    target: "portal-search",
    when: (c) => c.standalone,
    title: "Busca rápida",
    body: "Digite o nome de um programa ou projeto para abri-lo, de qualquer tela. O sino ao lado traz os avisos do Portal.",
  },
  {
    id: "filtros",
    path: "",
    target: "home-filters",
    title: "Filtros",
    body:
      "Alterne o mapa entre Projetos e Programas e filtre por escopo (todo o portfólio ou só os projetos em que você está), área e status. Os filtros valem para o mapa e para o resumo.",
  },
  {
    id: "mapa",
    path: "",
    target: "home-map",
    title: "Mapa Estratégico",
    body: "Cada bolha é um projeto (ou programa):",
    bullets: [
      "Mais alto: maior impacto estratégico",
      "Mais à direita: maior esforço de implementação",
      "Bolha maior: mais horas estimadas de entrega",
      "Clique numa bolha para abrir o projeto",
    ],
  },
  {
    id: "quadrantes",
    path: "",
    target: "home-quadrants",
    title: "Classificação estratégica",
    body:
      "O cruzamento de impacto e esforço coloca cada projeto num quadrante do mapa. Aqui você vê quantos há em cada um. Em \"Saiba mais sobre os critérios\" está como as notas são dadas.",
  },
  {
    id: "tabela",
    path: "",
    target: "home-table",
    title: "Projetos do Portfólio",
    body: "Todos os projetos, agrupados por programa, com:",
    bullets: [
      "Status e saúde: No prazo, Em atenção ou Crítico",
      "Evolução: quanto as entregas já avançaram",
      "Próximo marco e previsão de entrega",
      "Clique no nome do projeto para ver o detalhe",
    ],
  },
  {
    id: "programas",
    path: "/programas",
    target: "programs-grid",
    when: (c) => !!c.programId,
    title: "Programas",
    body:
      "Cada cartão é um programa: saúde, classificação, quantos projetos e pilares ele tem, a evolução média e o próximo marco. Clique no cartão para abrir.",
  },
  {
    id: "programa-indicadores",
    path: (c) => `/programas/${c.programId}`,
    target: "detail-kpis",
    when: (c) => !!c.programId,
    title: "Indicadores do programa",
    bullets: [
      "Evolução geral, com a variação dos últimos 30 dias",
      "Quantos pilares e projetos o programa tem",
      "Saúde, patrocinador e Product Owner",
      "Próximo marco relevante",
    ],
  },
  {
    id: "programa-visoes",
    path: (c) => `/programas/${c.programId}`,
    target: "detail-tabs",
    when: (c) => !!c.programId,
    title: "Três formas de ver o programa",
    bullets: [
      "Visão por Pilares: os projetos agrupados por objetivo estratégico",
      "Visão por Projetos: a árvore Projeto → Feature → História, com busca",
      "Roadmap: a linha do tempo das fases de cada projeto",
    ],
  },
  {
    id: "projeto-cabecalho",
    path: (c) => `/projetos/${c.projectId}`,
    target: "detail-header",
    when: (c) => !!c.projectId,
    title: "Página do projeto",
    body: "No topo ficam a fase atual, a etapa, o início e a previsão de entrega.",
    bullets: [
      "A estrela guarda o projeto nos seus favoritos",
      "Em \"Mais ações\" você exporta em PDF ou copia o link para compartilhar",
    ],
  },
  {
    id: "projeto-indicadores",
    path: (c) => `/projetos/${c.projectId}`,
    target: "detail-kpis",
    when: (c) => !!c.projectId,
    title: "Números do projeto",
    bullets: [
      "Evolução geral: o anel mostra o avanço das histórias; ao lado, a variação em 30 dias",
      "Features e User Stories: o total e quantas já foram concluídas",
      "Saúde: No prazo, Em atenção (impedimento ou pausa) ou Crítico (item atrasado)",
      "Quem responde pelo projeto: patrocinador e Product Owner",
    ],
  },
  {
    id: "projeto-abas",
    path: (c) => `/projetos/${c.projectId}`,
    target: "detail-tabs",
    when: (c) => !!c.projectId,
    title: "Entregas do projeto",
    bullets: (c) => [
      "Visão por Features: cada entrega com as histórias, a situação e as datas",
      "Roadmap: as fases do projeto e das Features ao longo dos meses",
      ...(c.isClient ? ["Operação Assistida (quando houver): indicadores, atas e encerramento depois da entrega"] : []),
    ],
  },
  {
    id: "roadmap",
    path: (c) => `/projetos/${c.projectId}?aba=roadmap`,
    target: "roadmap",
    when: (c) => !!c.projectId,
    title: "Roadmap",
    bullets: [
      "Cada linha é o projeto ou uma Feature; a barra colorida mostra a fase em cada período",
      "O losango é um marco: a data prevista de entrega",
      "A linha \"Hoje\" mostra onde estamos no calendário",
      "Nos filtros acima você escolhe o período (ex.: próximos 6 meses) e a escala: meses ou trimestres",
    ],
  },
  {
    id: "entregas",
    path: "/entregas",
    target: "deliveries",
    title: "Entregas e Marcos",
    body:
      "O calendário de entregas de todos os seus projetos, mês a mês. Em \"Próximas\" está o que vem pela frente (as atrasadas aparecem em destaque); em \"Entregues\", o que já foi concluído.",
  },
  // ── Ocorrências: como abrir e como acompanhar (só cliente) ──
  {
    id: "ocorrencias",
    path: "/ocorrencias",
    target: "occurrences-title",
    when: (c) => c.isClient,
    title: "Ocorrências",
    body:
      "Depois que um projeto é entregue, na Operação Assistida, é aqui que você registra um erro, uma dúvida ou uma sugestão de melhoria e acompanha o atendimento até a solução. Para abrir, clique em \"Nova ocorrência\" (o botão aparece quando algum projeto seu está em Operação Assistida).",
  },
  {
    id: "ocorrencia-nova",
    path: "/ocorrencias/nova",
    target: "form-steps",
    when: (c) => c.isClient,
    title: "Como abrir uma ocorrência",
    body: "O formulário tem 4 etapas; preencha e clique em \"Enviar ocorrência\":",
    bullets: [
      "Sobre o quê? O projeto e o tipo: correção (erro), dúvida de uso ou melhoria. Na dúvida, responda 3 perguntas e o Portal sugere o tipo",
      "Descreva: o que aconteceu, os passos e o que você esperava",
      "Impacto: quanto atrapalha e quem é afetado; isso define a criticidade",
      "Anexos (opcional): prints e vídeos ajudam o time a entender",
    ],
  },
  {
    id: "ocorrencia-depois",
    path: "/ocorrencias/nova",
    target: "how-it-works",
    when: (c) => c.isClient,
    title: "Depois de enviar",
    bullets: [
      "O time de atendimento do projeto é avisado na hora e um responsável assume",
      "Se o time precisar de alguma informação, você recebe um aviso e responde na conversa da ocorrência",
      "Quando o ajuste fica pronto, você testa e confirma se resolveu, com uma nota de 1 a 5",
      "Se não resolveu, é só devolver dizendo o que falta: ela volta para o time",
    ],
  },
  {
    id: "ocorrencias-acompanhar",
    path: "/ocorrencias",
    target: "detail-kpis",
    when: (c) => c.isClient,
    title: "Como acompanhar",
    bullets: [
      "Aguardando você: as ocorrências em que o time espera a sua resposta ou a sua validação (clique para filtrar)",
      "Em aberto e Resolvidas: o andamento de todas as ocorrências dos seus projetos",
      "Na lista, a coluna Situação mostra a etapa; os botões \"Responder\" e \"Validar\" aparecem quando é a sua vez",
      "O sino no topo avisa quando algo muda",
    ],
  },
  {
    id: "ocorrencia-detalhe",
    path: (c) => `/ocorrencias/${c.occurrenceId}`,
    target: "occ-progress",
    when: (c) => c.isClient && !!c.occurrenceId,
    title: "Dentro de uma ocorrência",
    bullets: [
      "Andamento: a etapa atual (Recebida, Em atendimento, Validação, Resolvida) e o que acontece a seguir",
      "Conversa: troque mensagens com o time e anexe arquivos",
      "Validação da solução: quando o time concluir, você aprova ou devolve por aqui",
      "Histórico: todas as mudanças de etapa, com data",
    ],
  },
  // ── Soluções com IA: como pedir e como acompanhar (só cliente) ──
  {
    id: "solucoes",
    path: "/solucoes-ia",
    target: "ai-solutions-title",
    when: (c) => c.isClient,
    title: "Soluções com IA",
    body:
      "Tem uma ideia de uso de inteligência artificial no seu processo? Este é o caminho institucional: você pede a análise, constrói o protótipo no Base44 e a TI adequa, publica e sustenta. Para começar, clique em \"Solicitar análise\".",
  },
  {
    id: "solucao-nova",
    path: "/solucoes-ia/nova",
    target: "form-steps",
    when: (c) => c.isClient,
    title: "Como pedir uma solução",
    body: "O pedido tem 5 etapas; preencha e clique em \"Enviar para análise\":",
    bullets: [
      "A solução: nome, objetivo e o problema que ela resolve",
      "Quem usa e o que faz: público, principais funcionalidades e integrações",
      "Dados: que dados a solução usa e como se classificam (ex.: dados pessoais)",
      "Acesso ao Base44 e custos: quem vai construir e os custos previstos",
      "Ciência: a confirmação de que você conhece o caminho institucional",
    ],
  },
  {
    id: "solucao-caminho",
    path: "/solucoes-ia",
    target: "ai-journey",
    when: (c) => c.isClient,
    title: "O caminho do pedido",
    body: "São 8 etapas da solicitação até a produção. As destacadas em amarelo dependem de você:",
    bullets: [
      "Solicitação: você conta o que quer construir",
      "Seu desenvolvimento: aprovado o pedido, você constrói no Base44 e envia o link da versão",
      "Sua homologação: depois que a TI adequa o protótipo, você testa e aprova ou pede ajustes",
      "As demais (análise, apresentação, adequação, segurança e publicação) ficam com a TI",
    ],
  },
  {
    id: "solucoes-acompanhar",
    path: "/solucoes-ia",
    target: "detail-kpis",
    when: (c) => c.isClient,
    title: "Como acompanhar seus pedidos",
    bullets: [
      "Com você: pedidos que esperam uma ação sua, como ajustar e reenviar, enviar a versão ou homologar",
      "Em andamento, Em produção e Não aprovadas ou canceladas (sempre com o motivo)",
      "Na lista, a coluna Próximo passo diz o que falta e leva direto à ação",
      "Dentro do pedido: andamento, mensagens com a TI, links da versão e histórico",
    ],
  },
  {
    id: "assistente",
    target: "assistant-button",
    title: "Assistente do Portal",
    body:
      "Ficou com dúvida? Pergunte em linguagem natural, como \"quando termina o projeto X?\" ou \"o que foi entregue este mês?\". Ele responde só com o que você pode ver no Portal.",
  },
  {
    id: "fim",
    path: "",
    target: "tour-button",
    title: "Pronto!",
    body: "Para rever este tour quando quiser, é só clicar aqui. Bom acompanhamento!",
  },
]

/** Projeto de exemplo para as telas de detalhe: de preferência um em execução. */
export function pickProject(projects: PortalProjectSummary[]): string | null {
  const running = projects.find((p) => p.status === "execucao")
  const alive = projects.find((p) => p.status !== "cancelado" && p.status !== "concluido")
  return (running ?? alive ?? projects[0])?.task_id ?? null
}

export function resolve<T>(v: T | ((c: TourCtx) => T) | undefined, c: TourCtx): T | undefined {
  return typeof v === "function" ? (v as (c: TourCtx) => T)(c) : v
}
