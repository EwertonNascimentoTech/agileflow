# 07 — RTD e integração EPA

## A. Metadados do processo

- *Nome do processo:* Reunião de Tomada de Decisão (RTD)
- *Trigger:* `/api/v1/rtd/*` com `require_module("rtd")`; UI `/app/modules/rtd/reunioes`
- *Objetivo:* Preparar e conduzir reuniões com indicadores, deliberações e slides de planos EPA (estratégico/tático); opcionalmente sugerir análises via Azure AI

## B. Matriz RACI simplificada

| Ator/Sistema | Papel no processo | Responsabilidade |
| :--- | :--- | :--- |
| Facilitador RTD (`rtd.manage`) | A | Cria/edita reunião, deliberações, análises |
| Participante (`rtd.view`) | C | Visualiza reuniões e slides |
| `EpaClient` | C | Login + grid de planos no sysepa |
| Azure AI Foundry | C | `sugerir` análise de indicador |
| Módulo Indicadores | C | Fonte de KPIs ligados à reunião |

## C. Fluxograma (Mermaid)

```mermaid
flowchart TD
  A([POST /reunioes]) --> B[Status Rascunho]
  B --> C[Anexa indicadores / análises]
  C --> D[GET planos-epa categoria]
  D --> E{EPA credenciais ok?}
  E -->|não| X1[Erro integração / vazio]
  E -->|sim| F[Planos estratégicos ou táticos]
  C --> G[POST sugerir análise IA]
  G --> H{Azure configurado?}
  H -->|não| X2[Falha chamada IA]
  H -->|sim| I[Sugestão gravável]
  B --> J[Deliberações CRUD]
  J --> K{Status FECHADA?}
  K -->|sim| X3[423 Locked em edições]
  K -->|não| L[PATCH reunião / Realizada / Fechada]
  L --> M[GET report]
  M --> N([Apresentação slides])

  style A fill:#22c55e,color:#fff
  style N fill:#22c55e,color:#fff
  style E fill:#eab308,color:#000
  style H fill:#eab308,color:#000
  style K fill:#eab308,color:#000
  style X1 fill:#ef4444,color:#fff
  style X2 fill:#ef4444,color:#fff
  style X3 fill:#ef4444,color:#fff
  style C fill:#3b82f6,color:#fff
  style D fill:#3b82f6,color:#fff
  style J fill:#3b82f6,color:#fff
```

## D. Bifurcações e regras

| Condição | Sucesso | Exceção | Código referência |
| :--- | :--- | :--- | :--- |
| Mutação sem `rtd.manage` | — | 403 | routes RTD |
| Reunião `FECHADA` | Somente leitura efetiva | 423 | service RTD |
| EPA offline / credenciais | — | Erro HTTP ou lista vazia (conforme client) | `epa_client.py` |
| Categoria planos | `estrategico` \| `tatico` | Query inválida | `GET .../planos-epa` |

### Strict mode

Integração EPA depende de env: `EPA_API_BASE_URL`, `EPA_LOGIN`, `EPA_SENHA`, `EPA_PLANOS_ESTRATEGICO`, `EPA_PLANOS_TATICOS`. Se ausente, funcionalidade de planos fica **fora do repositório configurado** (hipótese de ambiente).

## E. Dicionário de dados

| Model | Uso |
| :--- | :--- |
| `RtdReuniao` | Reunião (status Rascunho / Realizada / Fechada) |
| `RtdDeliberacao` | Decisões registadas |
| `RtdIndicadorAnalise` | Análise por indicador na reunião |

## Rastreabilidade

- `backend/app/modules/rtd/api/routes.py`
- `backend/app/modules/rtd/service.py`
- `backend/app/modules/rtd/epa_client.py`
- `backend/app/modules/rtd/permissions.py`
- `frontend/src/modules/rtd/*`
- Documento auxiliar: `integracao-epa.md` (raiz do repo)
