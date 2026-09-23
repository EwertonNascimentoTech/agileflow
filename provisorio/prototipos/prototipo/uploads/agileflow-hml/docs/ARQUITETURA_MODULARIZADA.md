# Regra de Arquitetura Modularizada (Reutilizavel)

Este documento define uma regra pratica para implementar uma arquitetura modularizada em qualquer projeto, mantendo baixo acoplamento, alta coesao e evolucao previsivel.

## 1) Objetivo

- Separar o sistema por **dominios de negocio** (modulos), nao por tipo tecnico.
- Garantir que cada modulo possa evoluir sem quebrar os demais.
- Facilitar reaproveitamento da estrutura em novos projetos.

## 2) Principios obrigatorios

1. **Modulo e unidade de negocio**
   - Cada modulo representa um contexto funcional claro (ex.: `atendimento`, `financeiro`, `estoque`).
2. **Baixo acoplamento**
   - Um modulo nao acessa internals de outro modulo diretamente.
   - Integracao entre modulos ocorre por contratos explicitos (API, eventos ou interfaces).
3. **Alta coesao**
   - Tudo que pertence ao contexto de negocio do modulo fica dentro dele (modelos, regras, casos de uso e rotas).
4. **Camadas com responsabilidade unica**
   - `api` recebe/valida entrada e delega.
   - `service` concentra regra de negocio.
   - `repository`/ORM cuida de persistencia.
5. **Dependencias apontam para dentro**
   - Camadas externas dependem das internas, nunca o contrario.
6. **Contrato estavel e versionado**
   - Alteracao quebravel exige nova versao de contrato (ex.: `v2`).

## 3) Estrutura de pastas de referencia

```txt
projeto/
├── backend/
│   ├── app/
│   │   ├── core/                    # configuracao, seguranca, db, dependencias globais
│   │   ├── modules/
│   │   │   ├── modulo_x/
│   │   │   │   ├── api/
│   │   │   │   │   └── routes.py
│   │   │   │   ├── schemas.py
│   │   │   │   ├── models.py
│   │   │   │   ├── repository.py    # opcional
│   │   │   │   └── service.py
│   │   │   └── modulo_y/
│   │   └── main.py                  # registry de rotas dos modulos
│   └── alembic/
├── frontend/
│   └── src/
│       ├── modules/
│       │   ├── modulo_x/
│       │   │   ├── pages/
│       │   │   ├── components/
│       │   │   ├── api/
│       │   │   └── index.ts
│       │   └── modulo_y/
│       ├── components/              # componentes compartilhados
│       └── App.tsx                  # roteamento principal
└── docs/
    └── ARQUITETURA_MODULARIZADA.md
```

## 4) Regra de fronteira entre modulos

- Permitido:
  - Usar contratos publicos de outro modulo.
  - Compartilhar apenas utilitarios tecnicos em `core`/`shared`.
- Proibido:
  - Importar `service` interno de outro modulo.
  - Acessar tabela/model interno de outro modulo sem contrato.
  - Reutilizar DTO/schemas internos de forma acoplada.

## 5) Contrato minimo por modulo (backend)

Cada modulo deve expor:

- `api/routes.py`: endpoints do modulo.
- `schemas.py`: DTOs de entrada/saida.
- `service.py`: regras de negocio e transacoes.
- `models.py`: entidades do modulo.
- `README.md` (opcional, recomendado): objetivos, dependencias e limites.

## 6) Contrato minimo por modulo (frontend)

Cada modulo deve expor:

- `pages/`: telas do modulo.
- `components/`: componentes locais.
- `api/`: cliente HTTP do modulo.
- `index.ts`: ponto de exportacao publico.
- Rotas registradas de forma isolada no roteador principal.

## 7) Padrao de fluxo (request lifecycle)

1. `Route` valida permissao/autenticacao.
2. `Route` valida payload e chama `Service`.
3. `Service` executa regras de negocio.
4. `Service` usa persistencia e faz commit/rollback.
5. `Route` retorna resposta serializada por schema.

> Regra: a rota nunca concentra regra de negocio complexa.

## 8) Regras de evolucao

- Adicionar funcionalidade? Preferir **estender o modulo existente** antes de criar modulo novo.
- Criar modulo novo apenas quando houver novo contexto de negocio claro.
- Mudanca quebravel de contrato deve ser versionada.
- Toda regra transversal vai para `core`/`shared`, nunca para um modulo especifico.

## 9) Checklist para aplicar em outro projeto

1. Definir dominios de negocio (modulos) e escopo de cada um.
2. Criar estrutura base `core` + `modules`.
3. Definir contrato minimo backend/frontend por modulo.
4. Implementar autenticacao/autorizacao no `core`.
5. Registrar rotas por modulo no bootstrap da aplicacao.
6. Criar padrao de testes por modulo (unitario + integracao).
7. Documentar fronteiras e regras de dependencia.
8. Automatizar lint, format e validacoes em CI.

## 10) Anti-padroes (nao fazer)

- "Modulo" que so agrupa arquivos tecnicos sem contexto de negocio.
- Services gigantes que concentram regras de varios dominios.
- Copiar e colar regra entre modulos em vez de extrair para `shared`.
- Rotas com logica de negocio e transacao misturadas.

## 11) Template rapido para novo modulo

```txt
modules/novo_modulo/
├── api/routes.py
├── schemas.py
├── models.py
├── repository.py
├── service.py
└── README.md
```

`README.md` do modulo deve responder:
- Qual problema de negocio este modulo resolve?
- Quais sao as entradas e saidas publicas?
- De quais contratos externos ele depende?
- Quais regras sao criticas e precisam de testes?

---

Se seguir esta regra, voce consegue replicar a mesma arquitetura em diferentes projetos com previsibilidade, menor risco de regressao e onboarding mais rapido do time.
