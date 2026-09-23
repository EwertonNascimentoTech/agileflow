// Domain data adapted from the real AgileFlow API shape (projetos module).
// Shape mirrors: Project → Funnel → ProjectStatus → ProjectTask.
window.AppData = (() => {

  const members = [
    { id: 'u-mc', full_name: 'Marina Castro',    initials: 'MC', color: '#014898' },
    { id: 'u-rs', full_name: 'Rafael Souza',     initials: 'RS', color: '#7C3AED' },
    { id: 'u-ap', full_name: 'Ana Paula Lima',   initials: 'AP', color: '#6AB42F' },
    { id: 'u-jp', full_name: 'João Pedro',       initials: 'JP', color: '#E84E0F' },
    { id: 'u-cb', full_name: 'Camila Bastos',    initials: 'CB', color: '#008BD2' },
    { id: 'u-le', full_name: 'Lucas Eiras',      initials: 'LE', color: '#66C1BF' },
    { id: 'u-fs', full_name: 'Fernanda Silva',   initials: 'FS', color: '#DB2777' },
    { id: 'u-eg', full_name: 'Eduardo Gomes',    initials: 'EG', color: '#0F766E' },
  ];

  const projects = [
    { id: 'p-marketing',  name: 'Marketing Web',       slug: 'marketing-web', color: '#014898' },
    { id: 'p-plataforma', name: 'Plataforma Digital',  slug: 'plataforma',    color: '#7C3AED' },
    { id: 'p-ti',         name: 'Operações TI',         slug: 'ti',            color: '#008BD2' },
    { id: 'p-discovery',  name: 'Discovery 2026',       slug: 'discovery',     color: '#6AB42F' },
  ];

  const funnels = [
    { id: 'f-triagem',  project_id: 'p-marketing', name: 'Triagem PMO',     order: 1, is_default: true },
    { id: 'f-execucao', project_id: 'p-marketing', name: 'Execução',         order: 2, is_default: false },
    { id: 'f-suporte',  project_id: 'p-marketing', name: 'Suporte & Bugs',   order: 3, is_default: false },
  ];

  // Status (column) — matches ProjectStatus shape
  const statuses = [
    // Triagem PMO funnel
    { id: 's-rec',  funnel_id: 'f-triagem', name: 'Recebida',     color: '#94A3B8', order: 1, is_initial: true,  creates_demand_type_id: null },
    { id: 's-tri',  funnel_id: 'f-triagem', name: 'Em Triagem',   color: '#008BD2', order: 2, is_initial: false, creates_demand_type_id: null },
    { id: 's-apr',  funnel_id: 'f-triagem', name: 'Aprovada',     color: '#6AB42F', order: 3, is_initial: false, creates_demand_type_id: 'dt-projeto' },
    // Execução funnel
    { id: 's-bk',   funnel_id: 'f-execucao', name: 'Backlog',      color: '#94A3B8', order: 1, is_initial: true,  creates_demand_type_id: null },
    { id: 's-doing',funnel_id: 'f-execucao', name: 'Em Execução',  color: '#014898', order: 2, is_initial: false, creates_demand_type_id: null },
    { id: 's-rev',  funnel_id: 'f-execucao', name: 'Em Revisão',   color: '#E84E0F', order: 3, is_initial: false, creates_demand_type_id: null },
    { id: 's-done', funnel_id: 'f-execucao', name: 'Concluída',    color: '#6AB42F', order: 4, is_initial: false, creates_demand_type_id: null },
    // Suporte funnel
    { id: 's-new',  funnel_id: 'f-suporte', name: 'Novo',         color: '#94A3B8', order: 1, is_initial: true, creates_demand_type_id: null },
    { id: 's-inv',  funnel_id: 'f-suporte', name: 'Investigando', color: '#008BD2', order: 2, is_initial: false, creates_demand_type_id: null },
    { id: 's-fix',  funnel_id: 'f-suporte', name: 'Corrigindo',   color: '#014898', order: 3, is_initial: false, creates_demand_type_id: null },
    { id: 's-clo',  funnel_id: 'f-suporte', name: 'Resolvido',    color: '#6AB42F', order: 4, is_initial: false, creates_demand_type_id: null },
  ];

  // Demand types — with parent/child hierarchy
  const demandTypes = [
    { id: 'dt-demanda',  name: 'Demanda',              color: '#008BD2', allowed_child_type_ids: ['dt-tarefa'] },
    { id: 'dt-projeto',  name: 'Projeto',              color: '#014898', allowed_child_type_ids: ['dt-tarefa', 'dt-subtarefa'] },
    { id: 'dt-bug',      name: 'Bug',                  color: '#E84E0F', allowed_child_type_ids: [] },
    { id: 'dt-melhoria', name: 'Melhoria',             color: '#7C3AED', allowed_child_type_ids: [] },
    { id: 'dt-site',     name: 'Solicitação de Site',  color: '#008BD2', allowed_child_type_ids: [] },
    { id: 'dt-conteudo', name: 'Conteúdo',             color: '#D97706', allowed_child_type_ids: [] },
    { id: 'dt-campanha', name: 'Campanha',             color: '#6AB42F', allowed_child_type_ids: [] },
    { id: 'dt-tarefa',   name: 'Tarefa',               color: '#64748B', allowed_child_type_ids: [] },
    { id: 'dt-subtarefa',name: 'Subtarefa',            color: '#94A3B8', allowed_child_type_ids: [] },
  ];

  // SLA states: 'ok' | 'warning' | 'breached' | 'none' (matches API)
  const tasks = [
    // Triagem PMO
    { id: 'T-241', funnel_id:'f-triagem', status_id:'s-rec', demand_type_id:'dt-site',     parent_task_id:null, origin_task_id:null,
      title:'Landing page do novo curso de Liderança', assigned_to:'u-mc',
      start_date:'2026-05-22', due_date:'2026-05-28', sla_state:'ok',
      sub_total:8, sub_done:0, comments:3, attachments:2, tags:['Marketing','Q2'],
      description:'Criar landing page com formulário de pré-cadastro e integração com RD Station.' },

    { id: 'T-242', funnel_id:'f-triagem', status_id:'s-rec', demand_type_id:'dt-conteudo', parent_task_id:null, origin_task_id:null,
      title:'Revisão de copy do email de boas-vindas', assigned_to:'u-cb',
      start_date:'2026-05-24', due_date:'2026-05-31', sla_state:'ok',
      sub_total:3, sub_done:0, comments:1, attachments:0, tags:['CRM'],
      description:'Atualizar o template do email de onboarding com a nova proposta de valor.' },

    { id: 'T-243', funnel_id:'f-triagem', status_id:'s-rec', demand_type_id:'dt-melhoria', parent_task_id:null, origin_task_id:null,
      title:'Otimização SEO da home institucional', assigned_to:'u-le',
      start_date:'2026-05-26', due_date:'2026-06-07', sla_state:'ok',
      sub_total:6, sub_done:0, comments:0, attachments:0, tags:['SEO'],
      description:'Auditoria + correções de Core Web Vitals.' },

    { id: 'T-244', funnel_id:'f-triagem', status_id:'s-tri', demand_type_id:'dt-demanda', parent_task_id:null, origin_task_id:null,
      title:'Estudo de viabilidade — App de campo', assigned_to:'u-ap',
      start_date:'2026-05-23', due_date:'2026-05-29', sla_state:'warning',
      sub_total:6, sub_done:2, comments:2, attachments:1, tags:['Discovery'],
      description:'Avaliar custo/benefício de construir vs. comprar.' },

    { id: 'T-245', funnel_id:'f-triagem', status_id:'s-tri', demand_type_id:'dt-site', parent_task_id:null, origin_task_id:null,
      title:'Solicitação de site — Programa Trainees', assigned_to:'u-mc',
      start_date:'2026-05-25', due_date:'2026-06-01', sla_state:'ok',
      sub_total:4, sub_done:0, comments:0, attachments:1, tags:['RH'],
      description:'Hot site para divulgação do programa.' },

    { id: 'T-246', funnel_id:'f-triagem', status_id:'s-apr', demand_type_id:'dt-campanha', parent_task_id:null, origin_task_id:null,
      title:'Campanha "Volta às aulas" — peças sociais', assigned_to:'u-cb',
      start_date:'2026-05-20', due_date:'2026-05-30', sla_state:'ok',
      sub_total:12, sub_done:3, comments:5, attachments:8, tags:['Social','Q3'],
      description:'10 peças para Instagram + 4 reels.' },

    { id: 'T-247', funnel_id:'f-triagem', status_id:'s-apr', demand_type_id:'dt-melhoria', parent_task_id:null, origin_task_id:null,
      title:'Melhoria no fluxo de aprovação de orçamentos', assigned_to:'u-eg',
      start_date:'2026-05-24', due_date:'2026-06-05', sla_state:'ok',
      sub_total:7, sub_done:0, comments:1, attachments:0, tags:['Financeiro'],
      description:'Reduzir cliques para aprovar orçamento abaixo de R$ 5k.' },

    // Execução funnel
    { id: 'T-248', funnel_id:'f-execucao', status_id:'s-bk', demand_type_id:'dt-projeto', parent_task_id:null, origin_task_id:'T-246',
      title:'Projeto: Campanha Volta às aulas — execução', assigned_to:'u-cb',
      start_date:'2026-06-02', due_date:'2026-06-20', sla_state:'ok',
      sub_total:8, sub_done:0, comments:0, attachments:4, tags:['Campanha'],
      description:'Card gerado pela aprovação da demanda T-246.' },

    { id: 'T-249', funnel_id:'f-execucao', status_id:'s-doing', demand_type_id:'dt-projeto', parent_task_id:null, origin_task_id:null, predecessor_id:'T-248',
      title:'Integração com SSO corporativo (Azure AD)', assigned_to:'u-rs',
      start_date:'2026-05-15', due_date:'2026-05-27', sla_state:'breached',
      sub_total:14, sub_done:8, comments:22, attachments:6, tags:['TI','Segurança'],
      description:'Habilitar login único para colaboradores.' },

    { id: 'T-250', funnel_id:'f-execucao', status_id:'s-doing', demand_type_id:'dt-tarefa', parent_task_id:'T-249', origin_task_id:null, predecessor_id:'T-249',
      title:'Configurar tenant Azure AD em homologação', assigned_to:'u-jp',
      start_date:'2026-05-22', due_date:'2026-05-28', sla_state:'warning',
      sub_total:2, sub_done:1, comments:4, attachments:0, tags:['Subtarefa'],
      description:'Filho de T-249 — provisionar tenant.' },

    { id: 'T-251', funnel_id:'f-execucao', status_id:'s-doing', demand_type_id:'dt-conteudo', parent_task_id:null, origin_task_id:null,
      title:'Whitepaper sobre transformação digital', assigned_to:'u-cb',
      start_date:'2026-05-23', due_date:'2026-06-03', sla_state:'ok',
      sub_total:5, sub_done:3, comments:2, attachments:1, tags:['Conteúdo'],
      description:'Materiais para captação de leads B2B.' },

    { id: 'T-252', funnel_id:'f-execucao', status_id:'s-rev', demand_type_id:'dt-site', parent_task_id:null, origin_task_id:null, predecessor_id:'T-251',
      title:'Landing page — Webinar de Outubro', assigned_to:'u-mc',
      start_date:'2026-05-18', due_date:'2026-05-29', sla_state:'warning',
      sub_total:6, sub_done:5, comments:8, attachments:3, tags:['Eventos'],
      description:'Página com inscrição e contagem regressiva.' },

    { id: 'T-253', funnel_id:'f-execucao', status_id:'s-rev', demand_type_id:'dt-melhoria', parent_task_id:null, origin_task_id:null,
      title:'Atualização da identidade visual — Manual de marca', assigned_to:'u-fs',
      start_date:'2026-05-12', due_date:'2026-06-04', sla_state:'ok',
      sub_total:8, sub_done:6, comments:3, attachments:2, tags:['Brand'],
      description:'Revisar o manual de marca com novas regras de logo.' },

    { id: 'T-254', funnel_id:'f-execucao', status_id:'s-done', demand_type_id:'dt-campanha', parent_task_id:null, origin_task_id:null,
      title:'Campanha de retenção — Black Friday', assigned_to:'u-ap',
      start_date:'2026-04-01', due_date:'2026-05-15', sla_state:'ok', completed_at:'2026-05-15',
      sub_total:10, sub_done:10, comments:14, attachments:12, tags:['Campanha','Q4'],
      description:'Pacote completo de campanha com remarketing.' },

    { id: 'T-255', funnel_id:'f-execucao', status_id:'s-done', demand_type_id:'dt-demanda', parent_task_id:null, origin_task_id:null,
      title:'Pesquisa de satisfação NPS Q1', assigned_to:'u-eg',
      start_date:'2026-04-05', due_date:'2026-04-30', sla_state:'ok', completed_at:'2026-04-28',
      sub_total:4, sub_done:4, comments:2, attachments:1, tags:['CX'],
      description:'Disparo trimestral.' },

    // Suporte funnel
    { id: 'T-256', funnel_id:'f-suporte', status_id:'s-new', demand_type_id:'dt-bug', parent_task_id:null, origin_task_id:null,
      title:'Bug: notificação duplicada no app móvel', assigned_to:'u-jp',
      start_date:'2026-05-25', due_date:'2026-05-27', sla_state:'warning',
      sub_total:3, sub_done:0, comments:6, attachments:1, tags:['Mobile'],
      description:'Acontece somente em iOS após o último deploy.' },

    { id: 'T-257', funnel_id:'f-suporte', status_id:'s-inv', demand_type_id:'dt-bug', parent_task_id:null, origin_task_id:null,
      title:'Bug: cálculo de SLA na dashboard PMO', assigned_to:'u-rs',
      start_date:'2026-05-24', due_date:'2026-05-26', sla_state:'breached',
      sub_total:5, sub_done:1, comments:7, attachments:4, tags:['PMO','Hotfix'],
      description:'Em alguns casos o contador volta a zero quando o card muda de coluna.' },

    { id: 'T-258', funnel_id:'f-suporte', status_id:'s-fix', demand_type_id:'dt-bug', parent_task_id:null, origin_task_id:null, predecessor_id:'T-257',
      title:'Bug: filtro de SLA não persiste ao recarregar', assigned_to:'u-le',
      start_date:'2026-05-23', due_date:'2026-05-29', sla_state:'ok',
      sub_total:2, sub_done:1, comments:4, attachments:0, tags:['Bug','UX'],
      description:'Filtro volta para o default quando o usuário dá F5.' },
  ];

  // Helpers
  const memberById = (id) => members.find(m => m.id === id);
  const statusById = (id) => statuses.find(s => s.id === id);
  const typeById   = (id) => demandTypes.find(t => t.id === id);
  const taskById   = (id) => tasks.find(t => t.id === id);

  return { members, projects, funnels, statuses, demandTypes, tasks, memberById, statusById, typeById, taskById };
})();

// Color for an arbitrary user id (matches the project's colorForUser util)
window.colorForUser = function colorForUser(id) {
  if (!id) return '#94a3b8';
  const palette = ['#7C3AED', '#008BD2', '#6AB42F', '#E84E0F', '#014898', '#DB2777', '#0F766E', '#64748B'];
  let hash = 0;
  for (let i = 0; i < id.length; i++) hash = (hash * 31 + id.charCodeAt(i)) | 0;
  return palette[Math.abs(hash) % palette.length];
};

window.initialsOf = function initialsOf(name) {
  if (!name) return '?';
  const p = name.trim().split(/\s+/).filter(Boolean);
  if (p.length === 1) return p[0].slice(0,2).toUpperCase();
  return (p[0][0] + p[p.length-1][0]).toUpperCase();
};
