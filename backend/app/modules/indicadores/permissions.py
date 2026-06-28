"""Permissões do módulo Indicadores. Sincronizadas automaticamente no startup."""

MODULE_SLUG = "indicadores"

PERMISSIONS: list[tuple[str, str, str | None]] = [
    ("indicadores.view", "Visualizar Indicadores", "Acessa o painel, indicadores e acompanhamentos."),
    ("indicadores.manage", "Gerenciar Indicadores", "Cria, edita e remove indicadores e atualiza acompanhamentos."),
    ("indicadores.config.manage", "Gerenciar configurações", "Edita as configurações do módulo de indicadores."),
]
