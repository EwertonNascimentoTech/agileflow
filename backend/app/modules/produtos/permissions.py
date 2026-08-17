"""Permissões do módulo Produtos. Sincronizadas automaticamente no startup."""

MODULE_SLUG = "produtos"

PERMISSIONS: list[tuple[str, str, str | None]] = [
    ("produtos.view", "Visualizar Produtos", "Acessa o portfólio e os detalhes dos produtos."),
    ("produtos.manage", "Gerenciar Produtos", "Cria, edita e remove produtos, serviços, documentos e processos."),
    ("produtos.config.manage", "Gerenciar configurações", "Edita as configurações do módulo de produtos."),
    # Commits por pessoa são insumo de avaliação — não entram no produtos.view genérico,
    # pelo mesmo motivo que o painel de desempenho usa projetos.performance.view.
    ("produtos.repos.view", "Visualizar commits e repositórios",
     "Acessa o painel de commits, a evolução de entregas dos devs e o inventário de repositórios."),
]
