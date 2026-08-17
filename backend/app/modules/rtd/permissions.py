"""Permissões do módulo RTD (Reunião de Tomada de Decisão). Sync automático no startup."""

MODULE_SLUG = "rtd"

PERMISSIONS: list[tuple[str, str, str | None]] = [
    ("rtd.view", "Visualizar RTD", "Acessa as reuniões de tomada de decisão e o relatório da cerimônia."),
    ("rtd.manage", "Gerenciar RTD", "Cria/edita reuniões e registra deliberações (decisões, apoio, priorização)."),
]
