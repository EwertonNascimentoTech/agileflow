import uuid
from datetime import datetime
from typing import Optional, List

from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, delete, func, text
from sqlalchemy.orm import selectinload
from fastapi import HTTPException, status

from app.modules.atendimento.models import (
    Funnel,
    AttendanceStatusConfig, KanbanTransition, CustomFieldDefinition,
    ChannelConfig, AssignmentRule, Client, Company, Attendance,
    AttendanceMessage, AttendanceStatusLog, MessageAttachment, Task,
    LeadEvent, AutomationRule as AutomationRuleModel,
    FollowUpTemplate, FollowUpChannel,
    AssignmentRuleType, SenderType, TaskStatus, MessageType,
    LeadEventType, AutomationTrigger, AutomationAction,
    StageOutcome, AttendancePriority, ChannelType, ClientEntityType,
    Tag, ClientTag, AttendanceTag,
)
from app.modules.atendimento.schemas import (
    FunnelCreate, FunnelUpdate,
    StatusConfigCreate, StatusConfigUpdate,
    KanbanTransitionCreate,
    CustomFieldCreate, CustomFieldUpdate,
    ChannelConfigCreate, ChannelConfigUpdate,
    AssignmentRuleCreate, AssignmentRuleUpdate,
    ClientCreate, ClientUpdate,
    AttendanceCreate, AttendanceUpdate,
    AttendanceStatusChange, AttendanceAssign,
    MessageCreate,
    CompanyCreate, CompanyUpdate,
    TaskCreate, TaskUpdate,
    LeadEventCreate,
    AutomationRuleCreate, AutomationRuleUpdate,
    FollowUpTemplateCreate, FollowUpTemplateUpdate,
    TagCreate, TagUpdate,
)
from app.modules.super_admin.models import User

# Tags de classificação (seed tenant_migrations 014)
CLASSIFICATION_TAG_SLUGS = frozenset({"classificacao_pf", "classificacao_pj"})


# ══════════════════════════════════════════════
# CONFIG SERVICE
# ══════════════════════════════════════════════

class ConfigService:

    # ── Funis ────────────────────────────────

    @staticmethod
    async def list_funnels(db: AsyncSession, active_only: bool = False) -> List[Funnel]:
        q = select(Funnel).order_by(Funnel.order, Funnel.name)
        if active_only:
            q = q.where(Funnel.is_active == True)
        result = await db.execute(q)
        return list(result.scalars().all())

    @staticmethod
    async def get_funnel(db: AsyncSession, funnel_id: uuid.UUID) -> Funnel:
        result = await db.execute(select(Funnel).where(Funnel.id == funnel_id))
        f = result.scalar_one_or_none()
        if not f:
            raise HTTPException(status_code=404, detail="Funil não encontrado.")
        return f

    @staticmethod
    async def get_default_funnel(db: AsyncSession) -> Funnel:
        result = await db.execute(
            select(Funnel).where(Funnel.is_default == True).limit(1)
        )
        f = result.scalar_one_or_none()
        if not f:
            # fallback: primeiro funil ativo
            result = await db.execute(
                select(Funnel).where(Funnel.is_active == True).order_by(Funnel.order).limit(1)
            )
            f = result.scalar_one_or_none()
        if not f:
            raise HTTPException(status_code=400, detail="Nenhum funil cadastrado.")
        return f

    @staticmethod
    async def create_funnel(db: AsyncSession, data: FunnelCreate) -> Funnel:
        existing = await db.execute(select(Funnel).where(Funnel.name == data.name))
        if existing.scalar_one_or_none():
            raise HTTPException(status_code=400, detail="Já existe um funil com este nome.")
        if data.is_default:
            await db.execute(
                Funnel.__table__.update().values(is_default=False)
            )
        f = Funnel(**data.model_dump())
        db.add(f)
        await db.commit()
        await db.refresh(f)
        return f

    @staticmethod
    async def update_funnel(db: AsyncSession, funnel_id: uuid.UUID, data: FunnelUpdate) -> Funnel:
        f = await ConfigService.get_funnel(db, funnel_id)
        if data.name and data.name != f.name:
            dup = await db.execute(
                select(Funnel).where(Funnel.name == data.name, Funnel.id != f.id)
            )
            if dup.scalar_one_or_none():
                raise HTTPException(status_code=400, detail="Já existe um funil com este nome.")
        if data.is_default is True:
            await db.execute(
                Funnel.__table__.update().values(is_default=False)
            )
        for field, value in data.model_dump(exclude_unset=True).items():
            setattr(f, field, value)
        f.updated_at = datetime.utcnow()
        await db.commit()
        await db.refresh(f)
        return f

    @staticmethod
    async def delete_funnel(db: AsyncSession, funnel_id: uuid.UUID) -> None:
        f = await ConfigService.get_funnel(db, funnel_id)
        if f.is_default:
            raise HTTPException(status_code=400, detail="Funil padrão não pode ser excluído.")
        # Bloqueia se houver atendimento em alguma stage do funil
        in_use = await db.execute(
            select(func.count(Attendance.id))
            .join(AttendanceStatusConfig, Attendance.status_id == AttendanceStatusConfig.id)
            .where(AttendanceStatusConfig.funnel_id == funnel_id)
        )
        if (in_use.scalar() or 0) > 0:
            raise HTTPException(400, "Funil tem atendimentos vinculados. Mova-os para outro funil antes de excluir.")
        await db.delete(f)
        await db.commit()

    @staticmethod
    async def list_funnels_with_stage_count(db: AsyncSession) -> List[dict]:
        funnels = await ConfigService.list_funnels(db, active_only=False)
        out: List[dict] = []
        for f in funnels:
            count_q = await db.execute(
                select(func.count(AttendanceStatusConfig.id)).where(
                    AttendanceStatusConfig.funnel_id == f.id
                )
            )
            count = count_q.scalar() or 0
            out.append({
                "id": f.id,
                "name": f.name,
                "description": f.description,
                "color": f.color,
                "order": f.order,
                "is_default": f.is_default,
                "is_active": f.is_active,
                "stage_count": count,
                "created_at": f.created_at,
            })
        return out

    # ── Status / Kanban (stages dentro de um funil) ──

    @staticmethod
    async def list_statuses(
        db: AsyncSession, funnel_id: Optional[uuid.UUID] = None
    ) -> List[AttendanceStatusConfig]:
        q = select(AttendanceStatusConfig).order_by(AttendanceStatusConfig.order)
        if funnel_id is not None:
            q = q.where(AttendanceStatusConfig.funnel_id == funnel_id)
        result = await db.execute(q)
        return list(result.scalars().all())

    @staticmethod
    async def get_status(db: AsyncSession, status_id: uuid.UUID) -> AttendanceStatusConfig:
        result = await db.execute(
            select(AttendanceStatusConfig).where(AttendanceStatusConfig.id == status_id)
        )
        obj = result.scalar_one_or_none()
        if not obj:
            raise HTTPException(status_code=404, detail="Status não encontrado.")
        return obj

    @staticmethod
    async def create_status(db: AsyncSession, data: StatusConfigCreate) -> AttendanceStatusConfig:
        # Valida funnel existe
        await ConfigService.get_funnel(db, data.funnel_id)
        # is_initial é único POR FUNIL
        if data.is_initial:
            await db.execute(
                AttendanceStatusConfig.__table__.update()
                .where(AttendanceStatusConfig.funnel_id == data.funnel_id)
                .values(is_initial=False)
            )
        obj = AttendanceStatusConfig(**data.model_dump())
        db.add(obj)
        await db.commit()
        await db.refresh(obj)
        return obj

    @staticmethod
    async def update_status(
        db: AsyncSession, status_id: uuid.UUID, data: StatusConfigUpdate
    ) -> AttendanceStatusConfig:
        obj = await ConfigService.get_status(db, status_id)
        if data.is_initial:
            await db.execute(
                AttendanceStatusConfig.__table__.update()
                .where(AttendanceStatusConfig.funnel_id == obj.funnel_id)
                .values(is_initial=False)
            )
        for field, value in data.model_dump(exclude_unset=True).items():
            setattr(obj, field, value)
        obj.updated_at = datetime.utcnow()
        await db.commit()
        await db.refresh(obj)
        return obj

    @staticmethod
    async def delete_status(db: AsyncSession, status_id: uuid.UUID) -> None:
        obj = await ConfigService.get_status(db, status_id)
        # Não pode deletar status em uso
        in_use = await db.execute(
            select(func.count(Attendance.id)).where(Attendance.status_id == status_id)
        )
        if in_use.scalar() > 0:
            raise HTTPException(400, "Status está em uso por atendimentos e não pode ser removido.")
        await db.delete(obj)
        await db.commit()

    @staticmethod
    async def reorder_statuses(
        db: AsyncSession, items: List[dict],
    ) -> List[AttendanceStatusConfig]:
        funnel_ids: set[uuid.UUID] = set()
        for item in items:
            result = await db.execute(
                select(AttendanceStatusConfig).where(
                    AttendanceStatusConfig.id == uuid.UUID(str(item["id"]))
                )
            )
            obj = result.scalar_one_or_none()
            if obj:
                obj.order = item["order"]
                funnel_ids.add(obj.funnel_id)
        await db.commit()
        # Devolve apenas o(s) funil(s) afetado(s) pra o caller atualizar
        if len(funnel_ids) == 1:
            return await ConfigService.list_statuses(db, funnel_id=funnel_ids.pop())
        return await ConfigService.list_statuses(db)

    # ── Transições ───────────────────────────

    @staticmethod
    async def list_transitions(db: AsyncSession) -> List[KanbanTransition]:
        result = await db.execute(select(KanbanTransition))
        return list(result.scalars().all())

    @staticmethod
    async def create_transition(db: AsyncSession, data: KanbanTransitionCreate) -> KanbanTransition:
        await ConfigService.get_status(db, data.to_status_id)
        if data.from_status_id:
            await ConfigService.get_status(db, data.from_status_id)

        obj = KanbanTransition(**data.model_dump())
        db.add(obj)
        try:
            await db.commit()
        except Exception:
            await db.rollback()
            raise HTTPException(400, "Transição entre esses status já existe.")
        await db.refresh(obj)
        return obj

    @staticmethod
    async def delete_transition(db: AsyncSession, transition_id: uuid.UUID) -> None:
        result = await db.execute(
            select(KanbanTransition).where(KanbanTransition.id == transition_id)
        )
        obj = result.scalar_one_or_none()
        if not obj:
            raise HTTPException(404, "Transição não encontrada.")
        await db.delete(obj)
        await db.commit()

    # ── Campos Personalizados ────────────────

    @staticmethod
    async def list_custom_fields(
        db: AsyncSession, entity_type: Optional[str] = None
    ) -> List[CustomFieldDefinition]:
        q = select(CustomFieldDefinition).order_by(CustomFieldDefinition.order)
        if entity_type:
            q = q.where(CustomFieldDefinition.entity_type == entity_type)
        result = await db.execute(q)
        return list(result.scalars().all())

    @staticmethod
    async def create_custom_field(db: AsyncSession, data: CustomFieldCreate) -> CustomFieldDefinition:
        existing = await db.execute(
            select(CustomFieldDefinition).where(
                CustomFieldDefinition.field_key == data.field_key,
                CustomFieldDefinition.entity_type == data.entity_type,
            )
        )
        if existing.scalar_one_or_none():
            raise HTTPException(400, "Já existe um campo com essa chave para esta entidade.")
        obj = CustomFieldDefinition(**data.model_dump())
        db.add(obj)
        await db.commit()
        await db.refresh(obj)
        return obj

    @staticmethod
    async def update_custom_field(
        db: AsyncSession, field_id: uuid.UUID, data: CustomFieldUpdate
    ) -> CustomFieldDefinition:
        result = await db.execute(
            select(CustomFieldDefinition).where(CustomFieldDefinition.id == field_id)
        )
        obj = result.scalar_one_or_none()
        if not obj:
            raise HTTPException(404, "Campo não encontrado.")
        for field, value in data.model_dump(exclude_unset=True).items():
            setattr(obj, field, value)
        obj.updated_at = datetime.utcnow()
        await db.commit()
        await db.refresh(obj)
        return obj

    @staticmethod
    async def delete_custom_field(db: AsyncSession, field_id: uuid.UUID) -> None:
        result = await db.execute(
            select(CustomFieldDefinition).where(CustomFieldDefinition.id == field_id)
        )
        obj = result.scalar_one_or_none()
        if not obj:
            raise HTTPException(404, "Campo não encontrado.")
        await db.delete(obj)
        await db.commit()

    # ── Canais ───────────────────────────────

    @staticmethod
    async def list_channels(db: AsyncSession) -> List[ChannelConfig]:
        result = await db.execute(select(ChannelConfig).order_by(ChannelConfig.name))
        return list(result.scalars().all())

    @staticmethod
    async def get_channel(db: AsyncSession, channel_id: uuid.UUID) -> ChannelConfig:
        result = await db.execute(
            select(ChannelConfig).where(ChannelConfig.id == channel_id)
        )
        obj = result.scalar_one_or_none()
        if not obj:
            raise HTTPException(404, "Canal não encontrado.")
        return obj

    @staticmethod
    async def create_channel(db: AsyncSession, data: ChannelConfigCreate) -> ChannelConfig:
        obj = ChannelConfig(**data.model_dump())
        db.add(obj)
        await db.commit()
        await db.refresh(obj)
        return obj

    @staticmethod
    async def update_channel(
        db: AsyncSession, channel_id: uuid.UUID, data: ChannelConfigUpdate
    ) -> ChannelConfig:
        obj = await ConfigService.get_channel(db, channel_id)
        for field, value in data.model_dump(exclude_unset=True).items():
            setattr(obj, field, value)
        obj.updated_at = datetime.utcnow()
        await db.commit()
        await db.refresh(obj)
        return obj

    @staticmethod
    async def delete_channel(db: AsyncSession, channel_id: uuid.UUID) -> None:
        obj = await ConfigService.get_channel(db, channel_id)
        await db.delete(obj)
        await db.commit()

    # ── Regras de Atribuição ─────────────────

    @staticmethod
    async def list_assignment_rules(db: AsyncSession) -> List[AssignmentRule]:
        result = await db.execute(
            select(AssignmentRule).order_by(AssignmentRule.order)
        )
        return list(result.scalars().all())

    @staticmethod
    async def create_assignment_rule(db: AsyncSession, data: AssignmentRuleCreate) -> AssignmentRule:
        obj = AssignmentRule(**data.model_dump())
        db.add(obj)
        await db.commit()
        await db.refresh(obj)
        return obj

    @staticmethod
    async def update_assignment_rule(
        db: AsyncSession, rule_id: uuid.UUID, data: AssignmentRuleUpdate
    ) -> AssignmentRule:
        result = await db.execute(
            select(AssignmentRule).where(AssignmentRule.id == rule_id)
        )
        obj = result.scalar_one_or_none()
        if not obj:
            raise HTTPException(404, "Regra não encontrada.")
        for field, value in data.model_dump(exclude_unset=True).items():
            setattr(obj, field, value)
        obj.updated_at = datetime.utcnow()
        await db.commit()
        await db.refresh(obj)
        return obj

    @staticmethod
    async def delete_assignment_rule(db: AsyncSession, rule_id: uuid.UUID) -> None:
        result = await db.execute(
            select(AssignmentRule).where(AssignmentRule.id == rule_id)
        )
        obj = result.scalar_one_or_none()
        if not obj:
            raise HTTPException(404, "Regra não encontrada.")
        await db.delete(obj)
        await db.commit()


# ══════════════════════════════════════════════
# CLIENT SERVICE
# ══════════════════════════════════════════════

class ClientService:

    @staticmethod
    async def list_clients(
        db: AsyncSession,
        skip: int = 0,
        limit: int = 50,
        search: Optional[str] = None,
        client_type: Optional[str] = None,
        active_only: bool = True,
    ) -> List[Client]:
        q = select(Client).offset(skip).limit(limit)
        if active_only:
            q = q.where(Client.is_active == True)
        if search:
            q = q.where(
                Client.name.ilike(f"%{search}%")
                | Client.email.ilike(f"%{search}%")
                | Client.phone.ilike(f"%{search}%")
                | Client.document.ilike(f"%{search}%")
            )
        if client_type:
            q = q.where(Client.client_type == client_type)
        result = await db.execute(q.order_by(Client.name))
        return list(result.scalars().all())

    @staticmethod
    async def get_client(db: AsyncSession, client_id: uuid.UUID) -> Client:
        result = await db.execute(
            select(Client)
            .options(selectinload(Client.tags))
            .where(Client.id == client_id)
        )
        obj = result.scalar_one_or_none()
        if not obj:
            raise HTTPException(404, "Cliente não encontrado.")
        return obj

    @staticmethod
    async def create_client(db: AsyncSession, data: ClientCreate) -> Client:
        obj = Client(**data.model_dump())
        db.add(obj)
        await db.commit()
        await db.refresh(obj)
        return obj

    @staticmethod
    async def update_client(
        db: AsyncSession, client_id: uuid.UUID, data: ClientUpdate
    ) -> Client:
        obj = await ClientService.get_client(db, client_id)
        for field, value in data.model_dump(exclude_unset=True).items():
            setattr(obj, field, value)
        obj.updated_at = datetime.utcnow()
        await db.commit()
        await db.refresh(obj)
        return obj

    @staticmethod
    async def get_client_attendances(
        db: AsyncSession, client_id: uuid.UUID, skip: int = 0, limit: int = 50
    ) -> List[Attendance]:
        await ClientService.get_client(db, client_id)
        result = await db.execute(
            select(Attendance)
            .where(Attendance.client_id == client_id)
            .order_by(Attendance.opened_at.desc())
            .offset(skip)
            .limit(limit)
        )
        return list(result.scalars().all())


# ══════════════════════════════════════════════
# ATTENDANCE SERVICE
# ══════════════════════════════════════════════

class AttendanceService:

    @staticmethod
    async def _get_initial_status(db: AsyncSession) -> AttendanceStatusConfig:
        result = await db.execute(
            select(AttendanceStatusConfig).where(AttendanceStatusConfig.is_initial == True)
        )
        s = result.scalar_one_or_none()
        if not s:
            raise HTTPException(
                status_code=400,
                detail="Nenhum status inicial configurado. Configure um status como inicial antes de criar atendimentos.",
            )
        return s

    @staticmethod
    async def _generate_protocol(db: AsyncSession) -> str:
        date_part = datetime.utcnow().strftime("%Y%m%d")
        result = await db.execute(
            select(func.count(Attendance.id)).where(
                func.date(Attendance.opened_at) == func.current_date()
            )
        )
        count = (result.scalar() or 0) + 1
        return f"AT{date_part}{count:04d}"

    @staticmethod
    async def _apply_assignment(
        db: AsyncSession, data: AttendanceCreate, channel: str, client_type: str
    ) -> Optional[uuid.UUID]:
        """Aplica regras de atribuição automática. Retorna user_id ou None."""
        if data.assigned_to is not None:
            return data.assigned_to

        rules_result = await db.execute(
            select(AssignmentRule)
            .where(AssignmentRule.is_active == True)
            .order_by(AssignmentRule.order)
        )
        for rule in rules_result.scalars():
            if not _check_rule_conditions(rule.conditions, channel, client_type):
                continue
            if rule.rule_type == AssignmentRuleType.MANUAL:
                return None
            if rule.rule_type == AssignmentRuleType.SPECIFIC_USER:
                user_id = (rule.config or {}).get("user_id")
                return uuid.UUID(user_id) if user_id else None
            if rule.rule_type in (AssignmentRuleType.ROUND_ROBIN, AssignmentRuleType.LEAST_BUSY):
                # Implementação básica: retorna None (manual). Evolução futura.
                return None
        return None

    @staticmethod
    def _is_classification_slug(slug: Optional[str]) -> bool:
        return bool(slug and slug in CLASSIFICATION_TAG_SLUGS)

    @staticmethod
    async def _require_classification_tag(db: AsyncSession, tag_id: uuid.UUID) -> Tag:
        tag = await TagService.get_tag(db, tag_id)
        if tag.entity_type != "attendance" or not AttendanceService._is_classification_slug(tag.slug):
            raise HTTPException(
                status_code=400,
                detail="Use a tag de classificação PF ou PJ (tags do atendimento com slug classificacao_pf / classificacao_pj).",
            )
        return tag

    @staticmethod
    async def _clear_attendance_classification_tags(db: AsyncSession, attendance_id: uuid.UUID) -> None:
        await db.execute(
            delete(AttendanceTag).where(
                AttendanceTag.attendance_id == attendance_id,
                AttendanceTag.tag_id.in_(
                    select(Tag.id).where(
                        Tag.entity_type == "attendance",
                        Tag.slug.in_(CLASSIFICATION_TAG_SLUGS),
                    )
                ),
            )
        )

    @staticmethod
    async def _apply_classification_to_client(
        db: AsyncSession,
        client: Client,
        tag: Tag,
        company_id: Optional[uuid.UUID],
        attendance: Optional[Attendance] = None,
    ) -> Optional[uuid.UUID]:
        """Atualiza contato (e opcionalmente o objeto atendimento) conforme tag PF/PJ. Retorna company_id a gravar no atendimento."""
        is_pj = tag.slug == "classificacao_pj"
        if is_pj:
            if not company_id:
                raise HTTPException(
                    status_code=400,
                    detail="Classificação PJ exige empresa vinculada ao atendimento.",
                )
            await CompanyService.get_company(db, company_id)
            client.entity_type = ClientEntityType.PJ
            client.company_id = company_id
            client.updated_at = datetime.utcnow()
            if attendance is not None:
                attendance.company_id = company_id
            return company_id
        client.entity_type = ClientEntityType.PF
        client.company_id = None
        client.updated_at = datetime.utcnow()
        if attendance is not None:
            attendance.company_id = None
        return None

    @staticmethod
    async def list_attendances(
        db: AsyncSession,
        skip: int = 0,
        limit: int = 50,
        status_id: Optional[uuid.UUID] = None,
        channel: Optional[str] = None,
        assigned_to: Optional[uuid.UUID] = None,
        client_id: Optional[uuid.UUID] = None,
    ) -> List[Attendance]:
        q = select(Attendance).offset(skip).limit(limit)
        if status_id:
            q = q.where(Attendance.status_id == status_id)
        if channel:
            q = q.where(Attendance.channel == channel)
        if assigned_to:
            q = q.where(Attendance.assigned_to == assigned_to)
        if client_id:
            q = q.where(Attendance.client_id == client_id)
        result = await db.execute(q.order_by(Attendance.opened_at.desc()))
        return list(result.scalars().all())

    @staticmethod
    async def get_attendance(db: AsyncSession, attendance_id: uuid.UUID) -> Attendance:
        result = await db.execute(
            select(Attendance)
            .options(
                selectinload(Attendance.status),
                selectinload(Attendance.client),
                selectinload(Attendance.tags),
            )
            .where(Attendance.id == attendance_id)
        )
        obj = result.scalar_one_or_none()
        if not obj:
            raise HTTPException(404, "Atendimento não encontrado.")
        return obj

    @staticmethod
    async def create_attendance(
        db: AsyncSession, data: AttendanceCreate, current_user: User
    ) -> Attendance:
        await ClientService.get_client(db, data.client_id)
        initial_status = await AttendanceService._get_initial_status(db)
        protocol = await AttendanceService._generate_protocol(db)

        client_result = await db.execute(
            select(Client).where(Client.id == data.client_id)
        )
        client = client_result.scalar_one()

        tag = await AttendanceService._require_classification_tag(db, data.classification_tag_id)
        attendance_company_id = await AttendanceService._apply_classification_to_client(
            db, client, tag, data.company_id, attendance=None
        )

        assigned_to = await AttendanceService._apply_assignment(
            db, data, data.channel.value, client.client_type.value
        )

        attendance = Attendance(
            protocol=protocol,
            client_id=data.client_id,
            company_id=attendance_company_id,
            channel=data.channel,
            channel_config_id=data.channel_config_id,
            status_id=initial_status.id,
            assigned_to=assigned_to,
            subject=data.subject,
            priority=data.priority,
            value=data.value,
            expected_close_date=data.expected_close_date,
            custom_data=data.custom_data,
        )
        db.add(attendance)
        await db.flush()

        await AttendanceService._clear_attendance_classification_tags(db, attendance.id)
        db.add(AttendanceTag(attendance_id=attendance.id, tag_id=tag.id))

        # Registra no log de status
        db.add(AttendanceStatusLog(
            attendance_id=attendance.id,
            from_status_id=None,
            to_status_id=initial_status.id,
            changed_by=current_user.id,
        ))

        # Timeline: criação
        await TimelineService.add_event(
            db, attendance.id,
            content=f"Atendimento aberto por {current_user.full_name}.",
            event_type=LeadEventType.SYSTEM,
            author_id=current_user.id,
            author_name=current_user.full_name,
            commit=False,
        )

        # Dispara automações de criação
        await AutomationRunner.run(db, attendance, AutomationTrigger.CREATED, current_user)

        # Dispara follow-ups configurados para a etapa inicial
        await FollowUpService.trigger_for_stage_enter(db, attendance, initial_status, current_user)

        await db.commit()
        return await AttendanceService.get_attendance(db, attendance.id)

    @staticmethod
    async def update_attendance(
        db: AsyncSession, attendance_id: uuid.UUID, data: AttendanceUpdate
    ) -> Attendance:
        obj = await AttendanceService.get_attendance(db, attendance_id)
        data_dict = data.model_dump(exclude_unset=True)
        cls_tid = data_dict.pop("classification_tag_id", None)

        for field, value in data_dict.items():
            setattr(obj, field, value)

        if cls_tid is not None:
            tag = await AttendanceService._require_classification_tag(db, cls_tid)
            is_pj = tag.slug == "classificacao_pj"
            cid = obj.company_id if is_pj else None
            if is_pj and not cid:
                raise HTTPException(
                    status_code=400,
                    detail="Classificação PJ exige empresa. Envie company_id no mesmo PATCH ou associe a empresa antes.",
                )
            await AttendanceService._apply_classification_to_client(
                db, obj.client, tag, cid, attendance=obj
            )
            await AttendanceService._clear_attendance_classification_tags(db, obj.id)
            db.add(AttendanceTag(attendance_id=obj.id, tag_id=tag.id))
        else:
            pj = any(
                getattr(t, "slug", None) == "classificacao_pj" for t in (obj.tags or [])
            )
            if pj and obj.company_id is None:
                raise HTTPException(
                    status_code=400,
                    detail="Atendimento classificado como PJ deve manter empresa vinculada.",
                )
            if pj and obj.company_id and obj.client:
                await CompanyService.get_company(db, obj.company_id)
                obj.client.entity_type = ClientEntityType.PJ
                obj.client.company_id = obj.company_id
                obj.client.updated_at = datetime.utcnow()

        obj.updated_at = datetime.utcnow()
        await db.commit()
        return await AttendanceService.get_attendance(db, attendance_id)

    @staticmethod
    async def change_status(
        db: AsyncSession,
        attendance_id: uuid.UUID,
        data: AttendanceStatusChange,
        current_user: User,
    ) -> Attendance:
        attendance = await AttendanceService.get_attendance(db, attendance_id)
        new_status = await ConfigService.get_status(db, data.to_status_id)

        # Valida transição se existirem regras
        transitions_result = await db.execute(select(KanbanTransition))
        transitions = list(transitions_result.scalars().all())

        if transitions:
            allowed = any(
                (t.from_status_id is None or t.from_status_id == attendance.status_id)
                and t.to_status_id == data.to_status_id
                for t in transitions
            )
            if not allowed:
                raise HTTPException(
                    status_code=400,
                    detail=f"Transição do status atual para '{new_status.name}' não é permitida.",
                )

        old_status_id = attendance.status_id
        attendance.status_id = data.to_status_id
        attendance.updated_at = datetime.utcnow()

        if new_status.is_final and not attendance.closed_at:
            attendance.closed_at = datetime.utcnow()
        elif not new_status.is_final and attendance.closed_at:
            attendance.closed_at = None

        db.add(AttendanceStatusLog(
            attendance_id=attendance.id,
            from_status_id=old_status_id,
            to_status_id=data.to_status_id,
            changed_by=current_user.id,
            notes=data.notes,
        ))

        # Registra na timeline
        await TimelineService.add_event(
            db, attendance.id,
            content=f"Etapa alterada para '{new_status.name}'." + (f" Notas: {data.notes}" if data.notes else ""),
            event_type=LeadEventType.STATUS_CHANGED,
            author_id=current_user.id,
            author_name=current_user.full_name,
            extra_data={"from_status_id": str(old_status_id), "to_status_id": str(data.to_status_id)},
            commit=False,
        )

        # Dispara automações (enter_stage, status_won/lost conforme outcome)
        await AutomationRunner.trigger_for_stage_change(db, attendance, new_status, current_user)

        # Dispara follow-ups configurados para essa etapa
        await FollowUpService.trigger_for_stage_enter(db, attendance, new_status, current_user)

        await db.commit()
        await db.refresh(attendance)
        return attendance

    @staticmethod
    async def assign(
        db: AsyncSession, attendance_id: uuid.UUID, data: AttendanceAssign
    ) -> Attendance:
        obj = await AttendanceService.get_attendance(db, attendance_id)
        obj.assigned_to = data.assigned_to
        obj.updated_at = datetime.utcnow()
        await db.commit()
        await db.refresh(obj)
        return obj

    @staticmethod
    async def get_history(
        db: AsyncSession, attendance_id: uuid.UUID
    ) -> List[AttendanceStatusLog]:
        await AttendanceService.get_attendance(db, attendance_id)
        result = await db.execute(
            select(AttendanceStatusLog)
            .where(AttendanceStatusLog.attendance_id == attendance_id)
            .order_by(AttendanceStatusLog.changed_at)
        )
        return list(result.scalars().all())

    # ── Mensagens ────────────────────────────

    @staticmethod
    async def list_messages(
        db: AsyncSession, attendance_id: uuid.UUID, skip: int = 0, limit: int = 100
    ) -> List[AttendanceMessage]:
        await AttendanceService.get_attendance(db, attendance_id)
        result = await db.execute(
            select(AttendanceMessage)
            .where(AttendanceMessage.attendance_id == attendance_id)
            .options(selectinload(AttendanceMessage.attachments))
            .order_by(AttendanceMessage.sent_at)
            .offset(skip)
            .limit(limit)
        )
        messages = list(result.scalars().all())
        # Enriquece attachments com presigned URLs (não armazenadas no DB)
        from app.core.storage import get_presigned_url
        for msg in messages:
            for att in msg.attachments:
                try:
                    att._presigned_url = get_presigned_url(att.object_name)
                except Exception:  # noqa: BLE001
                    att._presigned_url = None
        return messages

    @staticmethod
    async def add_message(
        db: AsyncSession,
        attendance_id: uuid.UUID,
        data: MessageCreate,
        current_user: User,
    ) -> AttendanceMessage:
        attendance = await AttendanceService.get_attendance(db, attendance_id)
        msg = AttendanceMessage(
            attendance_id=attendance_id,
            sender_type=SenderType.AGENT,
            sender_id=current_user.id,
            content=data.content,
            message_type=data.message_type,
            media_url=data.media_url,
            extra_data=data.extra_data,
        )
        db.add(msg)
        attendance.last_interaction = datetime.utcnow()
        await db.commit()
        await db.refresh(msg)
        return msg

    @staticmethod
    async def mark_messages_read(db: AsyncSession, attendance_id: uuid.UUID) -> None:
        await db.execute(
            AttendanceMessage.__table__.update()
            .where(AttendanceMessage.attendance_id == attendance_id)
            .values(is_read=True)
        )
        await db.commit()

    @staticmethod
    async def upload_attachment(
        db: AsyncSession,
        attendance_id: uuid.UUID,
        message_id: uuid.UUID,
        file_name: str,
        content_type: str,
        data: bytes,
        current_user: "User",
    ) -> MessageAttachment:
        from app.core.storage import upload_file, get_presigned_url
        # Verifica que a mensagem pertence ao atendimento
        result = await db.execute(
            select(AttendanceMessage).where(
                AttendanceMessage.id == message_id,
                AttendanceMessage.attendance_id == attendance_id,
            )
        )
        msg = result.scalar_one_or_none()
        if not msg:
            raise HTTPException(status_code=404, detail="Mensagem não encontrada")

        object_name = upload_file(
            data=data,
            content_type=content_type,
            folder=f"attachments/{attendance_id}",
        )

        attachment = MessageAttachment(
            message_id=message_id,
            attendance_id=attendance_id,
            file_name=file_name,
            content_type=content_type,
            object_name=object_name,
            file_size=len(data),
        )
        db.add(attachment)
        await db.commit()
        await db.refresh(attachment)
        return attachment


# ─────────────────────────────────────────────
# HELPERS INTERNOS
# ─────────────────────────────────────────────

def _check_rule_conditions(
    conditions: Optional[dict], channel: str, client_type: str
) -> bool:
    """Verifica se as condições de uma regra batem com o atendimento."""
    if not conditions:
        return True
    allowed_channels = conditions.get("channels")
    if allowed_channels and channel not in allowed_channels:
        return False
    allowed_types = conditions.get("client_types")
    if allowed_types and client_type not in allowed_types:
        return False
    return True


# ══════════════════════════════════════════════
# COMPANY SERVICE
# ══════════════════════════════════════════════

class CompanyService:

    @staticmethod
    async def list_companies(
        db: AsyncSession,
        skip: int = 0,
        limit: int = 50,
        search: Optional[str] = None,
        active_only: bool = True,
    ) -> List[dict]:
        q = select(Company).offset(skip).limit(limit).order_by(Company.name)
        if active_only:
            q = q.where(Company.is_active == True)
        if search:
            like = f"%{search.lower()}%"
            q = q.where(
                func.lower(Company.name).like(like)
                | func.lower(Company.trade_name).like(like)
                | Company.document.like(f"%{search}%")
            )
        result = await db.execute(q)
        companies = list(result.scalars().all())

        # Conta contatos e atendimentos por empresa
        out: List[dict] = []
        for c in companies:
            contact_q = await db.execute(
                select(func.count(Client.id)).where(Client.company_id == c.id)
            )
            attendance_q = await db.execute(
                select(func.count(Attendance.id)).where(Attendance.company_id == c.id)
            )
            out.append({
                "id": c.id,
                "name": c.name,
                "trade_name": c.trade_name,
                "document": c.document,
                "industry": c.industry,
                "is_active": c.is_active,
                "contact_count": contact_q.scalar() or 0,
                "attendance_count": attendance_q.scalar() or 0,
                "created_at": c.created_at,
            })
        return out

    @staticmethod
    async def get_company(db: AsyncSession, company_id: uuid.UUID) -> Company:
        result = await db.execute(select(Company).where(Company.id == company_id))
        c = result.scalar_one_or_none()
        if not c:
            raise HTTPException(status_code=404, detail="Empresa não encontrada.")
        return c

    @staticmethod
    async def create_company(db: AsyncSession, data: CompanyCreate) -> Company:
        c = Company(**data.model_dump())
        db.add(c)
        await db.commit()
        await db.refresh(c)
        return c

    @staticmethod
    async def update_company(
        db: AsyncSession, company_id: uuid.UUID, data: CompanyUpdate
    ) -> Company:
        c = await CompanyService.get_company(db, company_id)
        for field, value in data.model_dump(exclude_unset=True).items():
            setattr(c, field, value)
        c.updated_at = datetime.utcnow()
        await db.commit()
        await db.refresh(c)
        return c

    @staticmethod
    async def delete_company(db: AsyncSession, company_id: uuid.UUID) -> None:
        c = await CompanyService.get_company(db, company_id)
        # Bloqueia se há atendimentos abertos
        in_use = await db.execute(
            select(func.count(Attendance.id)).where(Attendance.company_id == company_id)
        )
        if (in_use.scalar() or 0) > 0:
            raise HTTPException(
                400, "Empresa tem atendimentos vinculados. Reatribua-os antes de excluir."
            )
        await db.delete(c)
        await db.commit()


# ══════════════════════════════════════════════
# TASK SERVICE
# ══════════════════════════════════════════════

class TaskService:

    @staticmethod
    async def list_tasks(
        db: AsyncSession,
        attendance_id: Optional[uuid.UUID] = None,
        assigned_to: Optional[uuid.UUID] = None,
        status: Optional[TaskStatus] = None,
        skip: int = 0,
        limit: int = 100,
    ) -> List[Task]:
        q = select(Task).offset(skip).limit(limit).order_by(
            Task.status.asc(), Task.due_date.asc().nullslast(), Task.created_at.desc()
        )
        if attendance_id:
            q = q.where(Task.attendance_id == attendance_id)
        if assigned_to:
            q = q.where(Task.assigned_to == assigned_to)
        if status:
            q = q.where(Task.status == status)
        result = await db.execute(q)
        return list(result.scalars().all())

    @staticmethod
    async def get_task(db: AsyncSession, task_id: uuid.UUID) -> Task:
        result = await db.execute(select(Task).where(Task.id == task_id))
        t = result.scalar_one_or_none()
        if not t:
            raise HTTPException(status_code=404, detail="Tarefa não encontrada.")
        return t

    @staticmethod
    async def create_task(
        db: AsyncSession, data: TaskCreate, current_user: "User"
    ) -> Task:
        t = Task(
            **data.model_dump(),
            created_by=current_user.id,
        )
        db.add(t)
        await db.commit()
        await db.refresh(t)
        return t

    @staticmethod
    async def update_task(
        db: AsyncSession, task_id: uuid.UUID, data: TaskUpdate, current_user: "User"
    ) -> Task:
        t = await TaskService.get_task(db, task_id)
        previous_status = t.status
        for field, value in data.model_dump(exclude_unset=True).items():
            setattr(t, field, value)
        # Marca completed_at se transição para DONE
        if data.status == TaskStatus.DONE and previous_status != TaskStatus.DONE:
            t.completed_at = datetime.utcnow()
            t.completed_by = current_user.id
        elif data.status is not None and data.status != TaskStatus.DONE:
            t.completed_at = None
            t.completed_by = None
        t.updated_at = datetime.utcnow()
        await db.commit()
        await db.refresh(t)
        return t

    @staticmethod
    async def delete_task(db: AsyncSession, task_id: uuid.UUID) -> None:
        t = await TaskService.get_task(db, task_id)
        await db.delete(t)
        await db.commit()


# ══════════════════════════════════════════════
# TIMELINE SERVICE
# ══════════════════════════════════════════════

class TimelineService:

    @staticmethod
    async def list_events(
        db: AsyncSession, attendance_id: uuid.UUID,
        skip: int = 0, limit: int = 100,
    ) -> List[LeadEvent]:
        result = await db.execute(
            select(LeadEvent)
            .where(LeadEvent.attendance_id == attendance_id)
            .order_by(LeadEvent.created_at.desc())
            .offset(skip).limit(limit)
        )
        return list(result.scalars().all())

    @staticmethod
    async def add_event(
        db: AsyncSession,
        attendance_id: uuid.UUID,
        content: str,
        event_type: LeadEventType = LeadEventType.NOTE,
        author_id: Optional[uuid.UUID] = None,
        author_name: Optional[str] = None,
        extra_data: Optional[dict] = None,
        commit: bool = True,
    ) -> LeadEvent:
        ev = LeadEvent(
            attendance_id=attendance_id,
            type=event_type,
            content=content,
            author_id=author_id,
            author_name=author_name,
            extra_data=extra_data,
        )
        db.add(ev)
        if commit:
            await db.commit()
            await db.refresh(ev)
        return ev

    @staticmethod
    async def add_note(
        db: AsyncSession,
        attendance_id: uuid.UUID,
        data: LeadEventCreate,
        current_user: User,
    ) -> LeadEvent:
        return await TimelineService.add_event(
            db, attendance_id,
            content=data.content,
            event_type=data.type,
            author_id=current_user.id,
            author_name=current_user.full_name,
            extra_data=data.extra_data,
        )


# ══════════════════════════════════════════════
# AUTOMATION RULE CRUD
# ══════════════════════════════════════════════

class AutomationService:

    @staticmethod
    async def list_rules(
        db: AsyncSession,
        active_only: bool = False,
        trigger: Optional[AutomationTrigger] = None,
    ) -> List[AutomationRuleModel]:
        q = select(AutomationRuleModel).order_by(AutomationRuleModel.order, AutomationRuleModel.name)
        if active_only:
            q = q.where(AutomationRuleModel.is_active == True)
        if trigger:
            q = q.where(AutomationRuleModel.trigger == trigger)
        result = await db.execute(q)
        return list(result.scalars().all())

    @staticmethod
    async def get_rule(db: AsyncSession, rule_id: uuid.UUID) -> AutomationRuleModel:
        result = await db.execute(
            select(AutomationRuleModel).where(AutomationRuleModel.id == rule_id)
        )
        r = result.scalar_one_or_none()
        if not r:
            raise HTTPException(status_code=404, detail="Regra não encontrada.")
        return r

    @staticmethod
    async def create_rule(db: AsyncSession, data: AutomationRuleCreate) -> AutomationRuleModel:
        r = AutomationRuleModel(**data.model_dump())
        db.add(r)
        await db.commit()
        await db.refresh(r)
        return r

    @staticmethod
    async def update_rule(
        db: AsyncSession, rule_id: uuid.UUID, data: AutomationRuleUpdate
    ) -> AutomationRuleModel:
        r = await AutomationService.get_rule(db, rule_id)
        for field, value in data.model_dump(exclude_unset=True).items():
            setattr(r, field, value)
        r.updated_at = datetime.utcnow()
        await db.commit()
        await db.refresh(r)
        return r

    @staticmethod
    async def delete_rule(db: AsyncSession, rule_id: uuid.UUID) -> None:
        r = await AutomationService.get_rule(db, rule_id)
        await db.delete(r)
        await db.commit()


# ══════════════════════════════════════════════
# AUTOMATION RUNNER — executor de regras
# ══════════════════════════════════════════════

class AutomationRunner:
    """Aplica regras de automação a um atendimento dado um trigger."""

    @staticmethod
    async def run(
        db: AsyncSession,
        attendance: Attendance,
        trigger: AutomationTrigger,
        current_user: Optional[User] = None,
    ) -> int:
        """
        Executa as regras matching e retorna o número de regras executadas.
        Sempre cria um LeadEvent registrando a execução.
        """
        # Busca status atual (precisamos saber funnel_id e outcome)
        stage_result = await db.execute(
            select(AttendanceStatusConfig).where(
                AttendanceStatusConfig.id == attendance.status_id
            )
        )
        stage = stage_result.scalar_one_or_none()

        # Carrega regras ativas do trigger
        q = (
            select(AutomationRuleModel)
            .where(
                AutomationRuleModel.trigger == trigger,
                AutomationRuleModel.is_active == True,
            )
            .order_by(AutomationRuleModel.order, AutomationRuleModel.created_at)
        )
        result = await db.execute(q)
        rules = list(result.scalars().all())

        executed = 0
        for rule in rules:
            # Filtra por funil/etapa se a regra especificar
            if rule.funnel_id and stage and rule.funnel_id != stage.funnel_id:
                continue
            if rule.stage_id and rule.stage_id != attendance.status_id:
                continue

            try:
                await AutomationRunner._apply_action(db, attendance, rule, current_user)
                executed += 1
            except Exception as e:  # noqa: BLE001
                # Não derruba a transação principal — registra o erro na timeline
                await TimelineService.add_event(
                    db, attendance.id,
                    content=f"Falha ao executar regra '{rule.name}': {e}",
                    event_type=LeadEventType.AUTOMATION,
                    author_name="sistema",
                    commit=False,
                )
        return executed

    @staticmethod
    async def _apply_action(
        db: AsyncSession,
        attendance: Attendance,
        rule: AutomationRuleModel,
        current_user: Optional[User],
    ) -> None:
        cfg = rule.action_config or {}

        if rule.action == AutomationAction.CREATE_TASK:
            title = cfg.get("task_title") or f"Tarefa: {rule.name}"
            due_hours = int(cfg.get("due_hours") or 24)
            from datetime import timedelta as _td
            db.add(Task(
                attendance_id=attendance.id,
                title=title,
                description=cfg.get("description"),
                due_date=datetime.utcnow() + _td(hours=due_hours),
                assigned_to=attendance.assigned_to,
                created_by=current_user.id if current_user else None,
            ))
            await TimelineService.add_event(
                db, attendance.id,
                content=f"Tarefa criada por automação: {title}",
                event_type=LeadEventType.AUTOMATION,
                author_name="sistema",
                extra_data={"rule_id": str(rule.id)},
                commit=False,
            )

        elif rule.action == AutomationAction.SEND_NOTIFICATION:
            message = cfg.get("message") or f"Notificação da regra '{rule.name}'."
            await TimelineService.add_event(
                db, attendance.id,
                content=message,
                event_type=LeadEventType.AUTOMATION,
                author_name="sistema",
                extra_data={"rule_id": str(rule.id)},
                commit=False,
            )

        elif rule.action == AutomationAction.UPDATE_PRIORITY:
            new_priority = cfg.get("priority")
            if new_priority and new_priority in [p.value for p in AttendancePriority]:
                attendance.priority = AttendancePriority(new_priority)
                await TimelineService.add_event(
                    db, attendance.id,
                    content=f"Prioridade alterada para '{new_priority}' por automação.",
                    event_type=LeadEventType.AUTOMATION,
                    author_name="sistema",
                    extra_data={"rule_id": str(rule.id)},
                    commit=False,
                )

        elif rule.action == AutomationAction.ASSIGN_USER:
            user_id = cfg.get("user_id")
            if user_id:
                try:
                    attendance.assigned_to = uuid.UUID(str(user_id))
                except Exception:
                    return
                await TimelineService.add_event(
                    db, attendance.id,
                    content="Atendimento atribuído por automação.",
                    event_type=LeadEventType.AUTOMATION,
                    author_name="sistema",
                    extra_data={"rule_id": str(rule.id), "user_id": str(user_id)},
                    commit=False,
                )

    @staticmethod
    async def trigger_for_stage_change(
        db: AsyncSession,
        attendance: Attendance,
        new_stage: AttendanceStatusConfig,
        current_user: Optional[User] = None,
    ) -> None:
        """Dispara enter_stage e, conforme outcome da nova etapa, status_won/lost."""
        await AutomationRunner.run(db, attendance, AutomationTrigger.ENTER_STAGE, current_user)
        if new_stage.outcome == StageOutcome.WON:
            await AutomationRunner.run(db, attendance, AutomationTrigger.STATUS_WON, current_user)
        elif new_stage.outcome == StageOutcome.LOST:
            await AutomationRunner.run(db, attendance, AutomationTrigger.STATUS_LOST, current_user)


# ══════════════════════════════════════════════
# FOLLOW-UP SERVICE
# ══════════════════════════════════════════════

class FollowUpService:
    """Templates de mensagem automática disparados na entrada de etapas."""

    @staticmethod
    def _interpolate(message: str, ctx: dict) -> str:
        """Substitui variáveis {{key}} pelos valores do contexto."""
        out = message
        for key, value in ctx.items():
            out = out.replace("{{" + key + "}}", str(value) if value is not None else "")
        return out

    @staticmethod
    async def _build_context(
        db: AsyncSession,
        attendance: Attendance,
        stage: Optional[AttendanceStatusConfig],
        user: Optional[User],
    ) -> dict:
        # Cliente
        client_result = await db.execute(
            select(Client).where(Client.id == attendance.client_id)
        )
        client = client_result.scalar_one_or_none()

        # Funil
        funnel_name = ""
        if stage:
            funnel_result = await db.execute(
                select(Funnel).where(Funnel.id == stage.funnel_id)
            )
            funnel = funnel_result.scalar_one_or_none()
            funnel_name = funnel.name if funnel else ""

        client_name = client.name if client else ""
        first_name = client_name.split()[0] if client_name else ""
        value = ""
        if attendance.value is not None:
            value = f"R$ {float(attendance.value):,.2f}".replace(",", "X").replace(".", ",").replace("X", ".")

        return {
            "client_name":       client_name,
            "client_first_name": first_name,
            "client_email":      (client.email if client else "") or "",
            "client_phone":      (client.phone if client else "") or "",
            "stage_name":        stage.name if stage else "",
            "funnel_name":       funnel_name,
            "protocol":          attendance.protocol,
            "user_name":         user.full_name if user else "",
            "value":             value,
        }

    @staticmethod
    async def list_templates(
        db: AsyncSession,
        active_only: bool = False,
        funnel_id: Optional[uuid.UUID] = None,
        stage_id: Optional[uuid.UUID] = None,
    ) -> List[FollowUpTemplate]:
        q = select(FollowUpTemplate).order_by(FollowUpTemplate.name)
        if active_only:
            q = q.where(FollowUpTemplate.is_active == True)
        if funnel_id is not None:
            q = q.where(FollowUpTemplate.funnel_id == funnel_id)
        if stage_id is not None:
            q = q.where(FollowUpTemplate.stage_id == stage_id)
        result = await db.execute(q)
        return list(result.scalars().all())

    @staticmethod
    async def get_template(db: AsyncSession, template_id: uuid.UUID) -> FollowUpTemplate:
        result = await db.execute(
            select(FollowUpTemplate).where(FollowUpTemplate.id == template_id)
        )
        t = result.scalar_one_or_none()
        if not t:
            raise HTTPException(status_code=404, detail="Template não encontrado.")
        return t

    @staticmethod
    async def create_template(db: AsyncSession, data: FollowUpTemplateCreate) -> FollowUpTemplate:
        t = FollowUpTemplate(**data.model_dump())
        db.add(t)
        await db.commit()
        await db.refresh(t)
        return t

    @staticmethod
    async def update_template(
        db: AsyncSession, template_id: uuid.UUID, data: FollowUpTemplateUpdate
    ) -> FollowUpTemplate:
        t = await FollowUpService.get_template(db, template_id)
        for field, value in data.model_dump(exclude_unset=True).items():
            setattr(t, field, value)
        t.updated_at = datetime.utcnow()
        await db.commit()
        await db.refresh(t)
        return t

    @staticmethod
    async def delete_template(db: AsyncSession, template_id: uuid.UUID) -> None:
        t = await FollowUpService.get_template(db, template_id)
        await db.delete(t)
        await db.commit()

    @staticmethod
    async def trigger_for_stage_enter(
        db: AsyncSession,
        attendance: Attendance,
        stage: AttendanceStatusConfig,
        current_user: Optional[User],
    ) -> int:
        """
        Busca templates ativos da etapa (ou globais do funil) e envia/registra.
        Retorna número de templates executados.
        """
        # Templates onde:
        #   - stage_id == stage.id, OU
        #   - stage_id IS NULL AND (funnel_id == stage.funnel_id OR funnel_id IS NULL)
        result = await db.execute(
            select(FollowUpTemplate).where(
                FollowUpTemplate.is_active == True,
                (
                    (FollowUpTemplate.stage_id == stage.id)
                    | (
                        (FollowUpTemplate.stage_id.is_(None))
                        & (
                            (FollowUpTemplate.funnel_id == stage.funnel_id)
                            | (FollowUpTemplate.funnel_id.is_(None))
                        )
                    )
                ),
            )
        )
        templates = list(result.scalars().all())
        if not templates:
            return 0

        ctx = await FollowUpService._build_context(db, attendance, stage, current_user)

        # Schema do tenant extraído do search_path atual
        schema_result = await db.execute(text("SHOW search_path"))
        schema = (schema_result.scalar() or "").split(",")[0].strip()

        executed = 0
        for tpl in templates:
            try:
                # Templates com delay_minutes > 0: agenda via Celery
                if tpl.delay_minutes and tpl.delay_minutes > 0:
                    from app.tasks.messaging import send_followup_delayed_task
                    send_followup_delayed_task.apply_async(
                        args=[schema, str(attendance.id), str(tpl.id)],
                        countdown=tpl.delay_minutes * 60,
                    )
                    await TimelineService.add_event(
                        db, attendance.id,
                        content=f"⏳ Follow-up '{tpl.name}' agendado em {tpl.delay_minutes} min via {tpl.channel.value}.",
                        event_type=LeadEventType.AUTOMATION,
                        author_name="sistema",
                        extra_data={"template_id": str(tpl.id), "delayed": True},
                        commit=False,
                    )
                    executed += 1
                    continue

                rendered = FollowUpService._interpolate(tpl.message, ctx)

                if tpl.channel == FollowUpChannel.INTERNAL:
                    await TimelineService.add_event(
                        db, attendance.id,
                        content=f"📋 Follow-up '{tpl.name}': {rendered}",
                        event_type=LeadEventType.AUTOMATION,
                        author_name="sistema",
                        extra_data={"template_id": str(tpl.id), "channel": "internal"},
                        commit=False,
                    )
                else:
                    msg = AttendanceMessage(
                        attendance_id=attendance.id,
                        sender_type=SenderType.BOT,
                        content=rendered,
                        message_type=MessageType.TEXT,
                        extra_data={
                            "follow_up_template_id": str(tpl.id),
                            "follow_up_channel": tpl.channel.value,
                        },
                    )
                    db.add(msg)
                    attendance.last_interaction = datetime.utcnow()
                    await db.flush()

                    # Despacha para o canal real se configurado
                    from app.tasks.messaging import _dispatch_outbound
                    await _dispatch_outbound(db, schema, attendance, msg, tpl.channel)

                    await TimelineService.add_event(
                        db, attendance.id,
                        content=f"📨 Follow-up '{tpl.name}' enviado via {tpl.channel.value}.",
                        event_type=LeadEventType.MESSAGE_SENT,
                        author_name="sistema",
                        extra_data={
                            "template_id": str(tpl.id),
                            "channel": tpl.channel.value,
                        },
                        commit=False,
                    )
                executed += 1
            except Exception as e:  # noqa: BLE001
                await TimelineService.add_event(
                    db, attendance.id,
                    content=f"⚠️ Falha no follow-up '{tpl.name}': {e}",
                    event_type=LeadEventType.AUTOMATION,
                    author_name="sistema",
                    commit=False,
                )
        return executed

    @staticmethod
    def render_preview(message: str, sample_ctx: Optional[dict] = None) -> str:
        """Renderiza um preview da mensagem com dados de exemplo."""
        default = {
            "client_name":       "Maria Silva",
            "client_first_name": "Maria",
            "client_email":      "maria@exemplo.com",
            "client_phone":      "+55 11 99999-9999",
            "stage_name":        "Qualificação",
            "funnel_name":       "Vendas",
            "protocol":          "ATD-001",
            "user_name":         "Atendente",
            "value":             "R$ 1.500,00",
        }
        ctx = {**default, **(sample_ctx or {})}
        return FollowUpService._interpolate(message, ctx)


# ══════════════════════════════════════════════
# METRICS SERVICE
# ══════════════════════════════════════════════

class MetricsService:

    @staticmethod
    async def funnel_metrics(db: AsyncSession, funnel_id: uuid.UUID) -> dict:
        """Retorna contagem + valor por etapa e top 10 oportunidades."""
        # Etapas do funil
        stages_result = await db.execute(
            select(AttendanceStatusConfig)
            .where(AttendanceStatusConfig.funnel_id == funnel_id)
            .order_by(AttendanceStatusConfig.order)
        )
        stages = list(stages_result.scalars().all())
        stage_ids = [s.id for s in stages]

        if not stage_ids:
            return {"stages": [], "top_opportunities": []}

        # Agregados por etapa
        from sqlalchemy import case
        agg_result = await db.execute(
            select(
                Attendance.status_id,
                func.count(Attendance.id).label("count"),
                func.coalesce(func.sum(Attendance.value), 0).label("total_value"),
            )
            .where(Attendance.status_id.in_(stage_ids))
            .group_by(Attendance.status_id)
        )
        agg_by_stage = {row.status_id: {"count": row.count, "total_value": float(row.total_value)} for row in agg_result}

        stage_data = []
        for s in stages:
            agg = agg_by_stage.get(s.id, {"count": 0, "total_value": 0.0})
            stage_data.append({
                "id": str(s.id),
                "name": s.name,
                "color": s.color,
                "order": s.order,
                "outcome": s.outcome.value if s.outcome else None,
                "count": agg["count"],
                "total_value": agg["total_value"],
            })

        # Top 10 oportunidades por valor
        top_result = await db.execute(
            select(Attendance, Client)
            .join(Client, Client.id == Attendance.client_id)
            .where(
                Attendance.status_id.in_(stage_ids),
                Attendance.value.isnot(None),
            )
            .order_by(Attendance.value.desc())
            .limit(10)
        )
        top = []
        for att, client in top_result:
            stage = next((s for s in stages if s.id == att.status_id), None)
            top.append({
                "id": str(att.id),
                "protocol": att.protocol,
                "client_name": client.name if client else None,
                "value": float(att.value or 0),
                "stage_name": stage.name if stage else None,
            })

        return {"stages": stage_data, "top_opportunities": top}

    @staticmethod
    async def attendance_overview(db: AsyncSession) -> dict:
        """Visão geral: total, por canal, por status."""
        total_result = await db.execute(select(func.count(Attendance.id)))
        total = total_result.scalar() or 0

        by_channel_result = await db.execute(
            select(Attendance.channel, func.count(Attendance.id))
            .group_by(Attendance.channel)
        )
        by_channel = {row[0].value: row[1] for row in by_channel_result}

        # Abertos nos últimos 30 dias
        from datetime import timedelta
        cutoff = datetime.utcnow() - timedelta(days=30)
        recent_result = await db.execute(
            select(func.count(Attendance.id)).where(Attendance.opened_at >= cutoff)
        )
        recent = recent_result.scalar() or 0

        return {
            "total": total,
            "last_30_days": recent,
            "by_channel": by_channel,
        }

    @staticmethod
    async def export_attendances_csv(
        db: AsyncSession,
        period_start: Optional[str],
        period_end: Optional[str],
        status_id: Optional[uuid.UUID],
        channel: Optional[str],
        assigned_to: Optional[uuid.UUID],
    ) -> str:
        import csv
        import io

        q = select(Attendance, Client).outerjoin(Client, Client.id == Attendance.client_id)

        if period_start:
            from datetime import date
            q = q.where(Attendance.opened_at >= date.fromisoformat(period_start))
        if period_end:
            from datetime import date
            q = q.where(Attendance.opened_at <= date.fromisoformat(period_end))
        if status_id:
            q = q.where(Attendance.status_id == status_id)
        if channel:
            q = q.where(Attendance.channel == channel)
        if assigned_to:
            q = q.where(Attendance.assigned_to == assigned_to)

        q = q.order_by(Attendance.opened_at.desc()).limit(5000)
        result = await db.execute(q)
        rows = result.all()

        output = io.StringIO()
        writer = csv.writer(output)
        writer.writerow(["Protocolo", "Cliente", "Canal", "Valor", "Data Abertura"])
        for att, client in rows:
            writer.writerow([
                att.protocol,
                client.name if client else "",
                att.channel.value,
                float(att.value or 0),
                att.opened_at.strftime("%d/%m/%Y %H:%M") if att.opened_at else "",
            ])
        return output.getvalue()


# ══════════════════════════════════════════════
# TAG SERVICE
# ══════════════════════════════════════════════

class TagService:

    @staticmethod
    async def list_tags(
        db: AsyncSession, entity_type: Optional[str] = None
    ) -> List[Tag]:
        q = select(Tag).order_by(Tag.name)
        if entity_type:
            q = q.where(Tag.entity_type == entity_type)
        result = await db.execute(q)
        return list(result.scalars().all())

    @staticmethod
    async def get_tag(db: AsyncSession, tag_id: uuid.UUID) -> Tag:
        result = await db.execute(select(Tag).where(Tag.id == tag_id))
        obj = result.scalar_one_or_none()
        if not obj:
            raise HTTPException(404, "Tag não encontrada.")
        return obj

    @staticmethod
    async def create_tag(db: AsyncSession, data: TagCreate) -> Tag:
        obj = Tag(**data.model_dump())
        db.add(obj)
        await db.commit()
        await db.refresh(obj)
        return obj

    @staticmethod
    async def update_tag(db: AsyncSession, tag_id: uuid.UUID, data: TagUpdate) -> Tag:
        obj = await TagService.get_tag(db, tag_id)
        for field, value in data.model_dump(exclude_unset=True).items():
            setattr(obj, field, value)
        await db.commit()
        await db.refresh(obj)
        return obj

    @staticmethod
    async def delete_tag(db: AsyncSession, tag_id: uuid.UUID) -> None:
        obj = await TagService.get_tag(db, tag_id)
        await db.delete(obj)
        await db.commit()

    @staticmethod
    async def add_to_client(db: AsyncSession, client_id: uuid.UUID, tag_id: uuid.UUID) -> None:
        await ClientService.get_client(db, client_id)
        await TagService.get_tag(db, tag_id)
        existing = await db.execute(
            select(ClientTag).where(
                ClientTag.client_id == client_id,
                ClientTag.tag_id == tag_id,
            )
        )
        if not existing.scalar_one_or_none():
            db.add(ClientTag(client_id=client_id, tag_id=tag_id))
            await db.commit()

    @staticmethod
    async def remove_from_client(db: AsyncSession, client_id: uuid.UUID, tag_id: uuid.UUID) -> None:
        result = await db.execute(
            select(ClientTag).where(
                ClientTag.client_id == client_id,
                ClientTag.tag_id == tag_id,
            )
        )
        obj = result.scalar_one_or_none()
        if obj:
            await db.delete(obj)
            await db.commit()

    @staticmethod
    async def add_to_attendance(db: AsyncSession, attendance_id: uuid.UUID, tag_id: uuid.UUID) -> None:
        attendance = await AttendanceService.get_attendance(db, attendance_id)
        tag = await TagService.get_tag(db, tag_id)
        if tag.entity_type == "attendance" and AttendanceService._is_classification_slug(tag.slug):
            await AttendanceService._clear_attendance_classification_tags(db, attendance_id)
            await db.flush()
            cid = attendance.company_id if tag.slug == "classificacao_pj" else None
            await AttendanceService._apply_classification_to_client(
                db, attendance.client, tag, cid, attendance=attendance
            )
        existing = await db.execute(
            select(AttendanceTag).where(
                AttendanceTag.attendance_id == attendance_id,
                AttendanceTag.tag_id == tag_id,
            )
        )
        if not existing.scalar_one_or_none():
            db.add(AttendanceTag(attendance_id=attendance_id, tag_id=tag_id))
        await db.commit()

    @staticmethod
    async def remove_from_attendance(db: AsyncSession, attendance_id: uuid.UUID, tag_id: uuid.UUID) -> None:
        result = await db.execute(
            select(AttendanceTag).where(
                AttendanceTag.attendance_id == attendance_id,
                AttendanceTag.tag_id == tag_id,
            )
        )
        obj = result.scalar_one_or_none()
        if obj:
            await db.delete(obj)
            await db.commit()
