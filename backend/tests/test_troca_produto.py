"""Troca do produto vinculado a um projeto já classificado (kanban Projetos e Programas):
barrada quando há contratação no kanban Contratar — o card de Contratar copiou o produto e o
contrato é lançado nele ao ganhar (invariante de Contratação/conversão)."""
import asyncio
import uuid
from types import SimpleNamespace

import pytest
from fastapi import HTTPException

from app.modules.projetos.service import ProjectTaskService


@pytest.mark.parametrize("task_id, locked", [(uuid.uuid4(), False), (None, True)])
def test_troca_de_produto_barrada_com_contratacao(task_id, locked):
    card = SimpleNamespace(procurement_task_id=task_id, procurement_locked=locked, linked_product_id=uuid.uuid4())
    with pytest.raises(HTTPException) as exc:
        # db=None: a checagem vem antes de qualquer consulta.
        asyncio.run(ProjectTaskService._record_product_change(None, card, uuid.uuid4(), None))
    assert exc.value.status_code == 400
    assert "Contratar" in exc.value.detail
