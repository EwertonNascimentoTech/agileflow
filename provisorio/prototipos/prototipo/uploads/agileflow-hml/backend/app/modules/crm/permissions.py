"""
Permissions declaradas pelo módulo CRM (consolidação física de atendimento +
propostas_contratos + company).

Como o módulo agrega múltiplos slugs lógicos (cada um com sua linha em
`modules`), usamos PERMISSIONS_BY_SLUG para que o sync registre cada conjunto
sob o slug correto. O loader em `app/core/permissions.py` aceita esse formato.
"""

# Mantemos os codes existentes para não invalidar role bindings já criados.

_ATENDIMENTO_PERMISSIONS: list[tuple[str, str, str | None]] = [
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

_PROPOSTAS_PERMISSIONS: list[tuple[str, str, str | None]] = [
    ("propostas_contratos.proposal.view",   "Visualizar propostas",   "Acessa a lista e o detalhe das propostas."),
    ("propostas_contratos.proposal.create", "Criar propostas",        "Pode criar novas propostas comerciais."),
    ("propostas_contratos.proposal.update", "Editar propostas",       "Pode alterar itens, valores e dados das propostas."),
    ("propostas_contratos.proposal.send",   "Enviar propostas",       "Pode mudar a proposta para status 'enviada'."),
    ("propostas_contratos.proposal.accept", "Aceitar/rejeitar propostas", "Pode marcar proposta como aceita ou rejeitada."),
    ("propostas_contratos.proposal.delete", "Excluir propostas",      "Pode excluir propostas (apenas draft)."),
    ("propostas_contratos.template.manage", "Gerenciar templates",    "Cria, edita e exclui templates de proposta."),
    ("propostas_contratos.contract.view",   "Visualizar contratos",   "Acessa contratos."),
    ("propostas_contratos.contract.manage", "Gerenciar contratos",    "Cria, edita e gera contratos."),
    ("propostas_contratos.contract.sign",   "Assinar contratos",      "Pode assinar contratos manualmente pelo painel."),
]

PERMISSIONS_BY_SLUG: dict[str, list[tuple[str, str, str | None]]] = {
    "atendimento": _ATENDIMENTO_PERMISSIONS,
    "propostas_contratos": _PROPOSTAS_PERMISSIONS,
}
