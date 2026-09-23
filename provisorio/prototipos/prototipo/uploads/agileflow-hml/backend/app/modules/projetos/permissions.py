"""
Permissions declaradas pelo módulo Projetos.
"""

MODULE_SLUG = "projetos"

PERMISSIONS: list[tuple[str, str, str | None]] = [
    ("projetos.project.view", "Visualizar projetos", "Acessa a lista e detalhes dos projetos."),
    ("projetos.project.manage", "Gerenciar projetos", "Cria e edita projetos e membros."),
    ("projetos.status.manage", "Gerenciar colunas do kanban", "Cria, reordena, edita e remove colunas."),
    ("projetos.demand_type.manage", "Gerenciar tipos de demanda", "Cria e mantém tipos de demanda."),
    ("projetos.form.manage", "Gerenciar formulário de demanda", "Gerencia sessões, campos e vínculos com fases."),
    ("projetos.task.view", "Visualizar tarefas", "Acessa tarefas dos projetos."),
    ("projetos.task.manage", "Gerenciar tarefas", "Cria, atualiza, move e remove tarefas."),
    ("projetos.task.view_own", "Visualizar próprias tarefas", "Acessa apenas tarefas atribuídas ao usuário."),
    ("projetos.task.update_own", "Atualizar próprias tarefas", "Atualiza status e dados das próprias tarefas."),
    ("projetos.comment.manage", "Gerenciar comentários", "Cria comentários nas tarefas."),
    ("projetos.automation.manage", "Gerenciar automações", "Cria e mantém automações por etapa do kanban."),
]

