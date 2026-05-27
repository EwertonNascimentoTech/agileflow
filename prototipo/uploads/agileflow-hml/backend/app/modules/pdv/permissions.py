"""
Permissions declaradas pelo módulo PDV.
Sincronizadas automaticamente para `module_permissions` no startup.
"""

MODULE_SLUG = "pdv"

PERMISSIONS: list[tuple[str, str, str | None]] = [
    ("pdv.cash.view",             "Visualizar caixa",
     "Acessa sessões de caixa e seus movimentos."),
    ("pdv.cash.operate",          "Operar caixa",
     "Abre e fecha sessões de caixa, registra sangria e suprimento."),
    ("pdv.sale.view",             "Visualizar vendas",
     "Acessa o histórico e o detalhe das vendas."),
    ("pdv.sale.create",           "Registrar vendas",
     "Pode finalizar vendas no PDV."),
    ("pdv.sale.cancel",           "Cancelar vendas",
     "Pode cancelar/estornar vendas, revertendo o estoque."),
    ("pdv.payment_method.manage", "Gerenciar formas de pagamento",
     "Cria, edita e remove formas de pagamento do PDV."),
    ("pdv.report.view",           "Visualizar relatórios",
     "Acessa o dashboard e os relatórios de vendas."),
]
