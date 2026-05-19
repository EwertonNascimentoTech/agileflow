"""
Permissions declaradas pelo módulo CRM.
São sincronizadas para `module_permissions` no startup do app.

Cada item: (code, name, description?)
- code: identificador estável usado por require_permission(...)
- name: rótulo legível para o admin escolher numa role
"""

MODULE_SLUG = "crm"

PERMISSIONS: list[tuple[str, str, str | None]] = [
    ("crm.attendance.view",   "Visualizar atendimentos",   "Acessa o kanban e a lista de atendimentos."),
    ("crm.attendance.create", "Criar atendimentos",        "Pode abrir novos atendimentos manualmente."),
    ("crm.attendance.update", "Editar atendimentos",       "Pode alterar status, prioridade, mensagens e dados dos atendimentos."),
    ("crm.attendance.assign", "Atribuir atendimentos",     "Pode atribuir atendimentos a outros usuários."),
    ("crm.client.view",       "Visualizar clientes",       "Acessa a lista e detalhes dos clientes."),
    ("crm.client.manage",     "Gerenciar clientes",        "Pode criar, editar e excluir clientes."),
    ("crm.company.view",      "Visualizar empresas",       "Acessa a lista e detalhes das empresas."),
    ("crm.company.manage",    "Gerenciar empresas",        "Pode criar, editar e excluir empresas."),
    ("crm.task.view",         "Visualizar tarefas",        "Vê tarefas vinculadas aos atendimentos."),
    ("crm.task.manage",       "Gerenciar tarefas",         "Cria, edita e conclui tarefas."),
    ("crm.timeline.view",     "Visualizar timeline",       "Acessa o histórico de eventos do atendimento."),
    ("crm.timeline.manage",   "Adicionar notas na timeline","Pode adicionar notas manuais ao histórico."),
    ("crm.automation.manage", "Gerenciar automações",      "Cria, edita e exclui regras de automação."),
    ("crm.followup.manage",   "Gerenciar follow-ups",      "Cria templates de mensagem automática por etapa."),
    ("crm.config.manage",     "Configurar módulo",         "Acessa configurações do kanban, canais, campos e regras."),
    ("crm.reports.view",      "Visualizar relatórios",     "Acessa relatórios e métricas do módulo."),
    # — Propostas e Contratos (absorvido) —
    ("crm.proposal.view",     "Visualizar propostas",   "Acessa a lista e o detalhe das propostas."),
    ("crm.proposal.create",   "Criar propostas",        "Pode criar novas propostas comerciais."),
    ("crm.proposal.update",   "Editar propostas",       "Pode alterar itens, valores e dados das propostas."),
    ("crm.proposal.send",     "Enviar propostas",       "Pode mudar a proposta para status 'enviada'."),
    ("crm.proposal.accept",   "Aceitar/rejeitar propostas", "Pode marcar proposta como aceita ou rejeitada."),
    ("crm.proposal.delete",   "Excluir propostas",      "Pode excluir propostas (apenas draft)."),
    ("crm.template.manage",   "Gerenciar templates",    "Cria, edita e exclui templates de proposta."),
    ("crm.contract.view",     "Visualizar contratos",   "Acessa contratos."),
    ("crm.contract.manage",   "Gerenciar contratos",    "Cria, edita e gera contratos."),
    ("crm.contract.sign",     "Assinar contratos",      "Pode assinar contratos manualmente pelo painel."),
]
