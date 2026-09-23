"""
Permissions declaradas pelo módulo TeamOps.
"""

MODULE_SLUG = "teamops"

PERMISSIONS: list[tuple[str, str, str | None]] = [
    ("teamops.view", "Visualizar TeamOps", "Acessa dashboard e dados básicos do módulo."),
    ("teamops.org.view", "Visualizar áreas e organograma", "Acessa áreas e árvore organizacional."),
    ("teamops.org.manage", "Gerenciar organograma", "Cria, edita e remove áreas e vínculos hierárquicos."),
    ("teamops.person.view", "Visualizar pessoas", "Acessa a lista e detalhes das pessoas do time."),
    ("teamops.person.manage", "Gerenciar pessoas", "Cria, edita e desliga colaboradores."),
    ("teamops.stack.view", "Visualizar stacks", "Acessa catálogo e mapa de competências."),
    ("teamops.stack.manage", "Gerenciar catálogo de stacks", "Cria, edita e remove categorias e stacks."),
    ("teamops.person_stack.manage", "Gerenciar stacks das pessoas", "Edita níveis e referências por pessoa."),
    ("teamops.absence.view_own", "Visualizar próprias ausências", "Acessa apenas as ausências da própria pessoa."),
    ("teamops.absence.view_team", "Visualizar ausências do time", "Acessa todas as ausências e calendário."),
    ("teamops.absence.request", "Solicitar ausências", "Solicita férias e ausências para si mesma."),
    ("teamops.absence.manage", "Cadastrar ausências de terceiros", "Cria ausências em nome de outras pessoas."),
    ("teamops.absence.approve", "Aprovar/recusar ausências", "Aprova ou recusa solicitações de ausência."),
    ("teamops.config.manage", "Gerenciar configurações", "Edita cargos e tipos de ausência."),
]
