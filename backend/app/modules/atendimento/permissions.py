"""
Permissions declaradas pelo módulo Atendimento.
São sincronizadas para `module_permissions` no startup do app.

Cada item: (code, name, description?)
- code: identificador estável usado por require_permission(...)
- name: rótulo legível para o admin escolher numa role
"""

MODULE_SLUG = "atendimento"

PERMISSIONS: list[tuple[str, str, str | None]] = [
    ("atendimento.attendance.view",   "Visualizar atendimentos",   "Acessa o kanban e a lista de atendimentos."),
    ("atendimento.attendance.create", "Criar atendimentos",        "Pode abrir novos atendimentos manualmente."),
    ("atendimento.attendance.update", "Editar atendimentos",       "Pode alterar status, prioridade, mensagens e dados dos atendimentos."),
    ("atendimento.attendance.assign", "Atribuir atendimentos",     "Pode atribuir atendimentos a outros usuários."),
    ("atendimento.client.view",       "Visualizar clientes",       "Acessa a lista e detalhes dos clientes."),
    ("atendimento.client.manage",     "Gerenciar clientes",        "Pode criar, editar e excluir clientes."),
    ("atendimento.company.view",      "Visualizar empresas",       "Acessa a lista e detalhes das empresas."),
    ("atendimento.company.manage",    "Gerenciar empresas",        "Pode criar, editar e excluir empresas."),
    ("atendimento.task.view",         "Visualizar tarefas",        "Vê tarefas vinculadas aos atendimentos."),
    ("atendimento.task.manage",       "Gerenciar tarefas",         "Cria, edita e conclui tarefas."),
    ("atendimento.timeline.view",     "Visualizar timeline",       "Acessa o histórico de eventos do atendimento."),
    ("atendimento.timeline.manage",   "Adicionar notas na timeline","Pode adicionar notas manuais ao histórico."),
    ("atendimento.automation.manage", "Gerenciar automações",      "Cria, edita e exclui regras de automação."),
    ("atendimento.followup.manage",   "Gerenciar follow-ups",      "Cria templates de mensagem automática por etapa."),
    ("atendimento.config.manage",     "Configurar módulo",         "Acessa configurações do kanban, canais, campos e regras."),
]
