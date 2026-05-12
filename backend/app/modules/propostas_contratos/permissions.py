"""
Permissions declaradas pelo módulo Propostas e Contratos.
"""

MODULE_SLUG = "propostas_contratos"

PERMISSIONS: list[tuple[str, str, str | None]] = [
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
