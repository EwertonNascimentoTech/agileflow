# 02 — Administrador — visão geral

Este guia cobre duas figuras: **Super Admin** (plataforma) e **Admin da empresa** (tenant).

## Super Admin

Após o login, o menu lateral mostra:

- **Dashboard** — indicadores de empresas, planos e ativação
- **Empresas** — criar e editar tenants (schema isolado por empresa)
- **Módulos** — catálogo do que a plataforma oferece (Processos, Times, Produtos, Indicadores, RTD, …)
- **Super Admins** — outros operadores da plataforma

### Fluxo típico de onboarding de uma empresa

1. Garantir que o **plano** inclui os módulos desejados.
2. **Criar a empresa** (nome, identificador, plano, validade).
3. Criar o **admin da empresa**.
4. Se preciso, ativar ou desativar módulos avulsos na ficha da empresa.

A criação da empresa prepara o ambiente de dados isolado automaticamente.

## Admin da empresa

Na área `/app` (visão da empresa):

### Visão geral

- Cartões dos **módulos ativos**.
- Atalhos conforme o perfil.

### Configurações

Aceda a **Configurações** no rodapé do menu de módulos:

| Secção | Uso |
| :--- | :--- |
| **Perfil** | Dados da sua conta |
| **Usuários** | Convidar / editar utilizadores (respeita limite do plano) |
| **Funções** | Criar funções e marcar permissões por módulo |

Só administradores da empresa gerem utilizadores e funções.

### Boas práticas

1. Cadastre primeiro a estrutura em **Gestão de Times** (áreas, cargos, pessoas) se a empresa usar capacidade e organograma.
2. Configure o módulo **Processos** (tipos de demanda, funis, etapas, priorização) antes de abrir solicitações em massa.
3. Atribua funções com o mínimo de permissões necessário.

### Módulos que o admin costuma ligar

| Módulo | Para quê |
| :--- | :--- |
| Processos | Demandas, kanban, cronograma, PMO |
| Gestão de Times | Pessoas, ausências, organograma |
| Portfólio de Produtos | Produtos e processos de negócio |
| Indicadores | Metas e acompanhamentos |
| RTD | Reuniões de decisão com indicadores e planos |

> Nota: ecrãs antigos de CRM, estoque ou PDV podem aparecer no código legado, mas **não fazem parte dos módulos ativos** da plataforma neste momento.
