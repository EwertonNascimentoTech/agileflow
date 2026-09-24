from app.modules.super_admin.payroll import PayrollService

_ITEM = {
    "document": "00000000000",
    "employeeNumber": "4010",
    "organization": "2",
    "department": "TECNOLOGIAS DIGITAIS - DESENVOLVIMENTO",
    "email": "Fulano.Silva@sistemafiea.com.br",
    "role": "ANALISTA DE SISTEMAS SENIOR",
    "trustRole": None,
    "updatedAt": None,
}


def test_pick_guarda_dados_funcionais_sem_cpf():
    data = PayrollService.pick({"items": [_ITEM], "totalPages": "1"}, "fulano.silva@sistemafiea.com.br")
    assert data == {
        "employee_number": "4010",
        "organization": "2",
        "department": "TECNOLOGIAS DIGITAIS - DESENVOLVIMENTO",
        "job_title": "ANALISTA DE SISTEMAS SENIOR",
        "trust_role": None,
        "source_updated_at": None,
    }
    assert "00000000000" not in data.values()


def test_pick_exige_o_mesmo_email():
    outro = dict(_ITEM, email="fulano.silva2@sistemafiea.com.br")
    assert PayrollService.pick({"items": [outro]}, "fulano.silva@sistemafiea.com.br") is None


def test_pick_sem_itens():
    assert PayrollService.pick({"items": [], "totalPages": "0"}, "x@sistemafiea.com.br") is None
    assert PayrollService.pick({}, "x@sistemafiea.com.br") is None


def test_pick_texto_vazio_vira_nulo():
    vazio = dict(_ITEM, trustRole="  ", department="")
    data = PayrollService.pick({"items": [vazio]}, "fulano.silva@sistemafiea.com.br")
    assert data["trust_role"] is None
    assert data["department"] is None
