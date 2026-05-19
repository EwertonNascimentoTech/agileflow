"""
Modelos do módulo CRM (unificado).

Este módulo unifica `atendimento` + `propostas_contratos` num único conjunto
de tabelas. Para evitar registro duplicado no `TenantBase.metadata` (que
quebra o SQLAlchemy com `InvalidRequestError: Table is already defined`),
NÃO redeclaramos as classes ORM aqui — apenas re-exportamos as classes
originais. Quando os módulos antigos forem removidos, mover as definições
para cá.
"""

# Re-exporta tudo do módulo atendimento
from app.modules.atendimento.models import *  # noqa: F401,F403
from app.modules.atendimento.models import (  # noqa: F401
    ClientType, ClientEntityType, ChannelType, SenderType, MessageType,
    FieldType, FieldEntity, AssignmentRuleType, AttendancePriority,
    StageOutcome, TaskStatus, TaskPriority,
    LeadEventType, AutomationTrigger, AutomationAction,
    FollowUpChannel,
)

# Re-exporta tudo do módulo propostas_contratos
from app.modules.propostas_contratos.models import *  # noqa: F401,F403
from app.modules.propostas_contratos.models import (  # noqa: F401
    ProposalStatus, ContractStatus,
)
