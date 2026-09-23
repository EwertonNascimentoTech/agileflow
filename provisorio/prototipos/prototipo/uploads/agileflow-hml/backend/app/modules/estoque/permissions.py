"""
Permissions declaradas pelo módulo Estoque.
Sincronizadas automaticamente para `module_permissions` no startup.
"""

MODULE_SLUG = "estoque"

PERMISSIONS: list[tuple[str, str, str | None]] = [
    ("estoque.type.manage",        "Gerenciar tipos de produto",
     "Cria, edita e remove tipos de produto e seus schemas de campo."),
    ("estoque.category.manage",    "Gerenciar categorias",
     "Cria, edita e remove categorias de produto."),
    ("estoque.product.view",       "Visualizar produtos",
     "Acessa a lista e o detalhe dos produtos."),
    ("estoque.product.create",     "Criar produtos",
     "Pode cadastrar novos produtos no catálogo."),
    ("estoque.product.update",     "Editar produtos",
     "Pode alterar dados de produtos existentes."),
    ("estoque.product.delete",     "Excluir produtos",
     "Pode remover produtos do catálogo (apenas sem movimentações)."),
    ("estoque.warehouse.manage",   "Gerenciar depósitos",
     "Cria, edita e remove depósitos."),
    ("estoque.supplier.manage",    "Gerenciar fornecedores",
     "Cria, edita e remove fornecedores e suas relações com produtos."),
    ("estoque.movement.view",      "Visualizar movimentações",
     "Acessa o histórico de entradas, saídas, ajustes e transferências."),
    ("estoque.movement.create",    "Registrar movimentações",
     "Pode registrar entradas, saídas, ajustes e transferências de estoque."),
    ("estoque.batch.manage",       "Gerenciar lotes",
     "Cria, edita e remove lotes rastreáveis (quando o tipo do produto permite)."),
    ("estoque.serial.manage",      "Gerenciar números de série",
     "Cria, edita e remove números de série (quando o tipo do produto permite)."),
]
