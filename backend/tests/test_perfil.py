"""Tela de perfil: foto (só JPEG/PNG/WebP de verdade, até 2 MB), contato editável pela própria
pessoa e a janela de meses da série de "Meu desempenho"."""
import asyncio
from datetime import date, timedelta

import pytest
from fastapi import HTTPException

from app.modules.projetos.my_performance import _month_start
from app.modules.super_admin.avatar import MAX_AVATAR_BYTES, AvatarService, _content_type
from app.modules.teamops.schemas import MeContatoUpdate

JPEG = b"\xff\xd8\xff\xe0" + b"0" * 32
PNG = b"\x89PNG\r\n\x1a\n" + b"0" * 32
WEBP = b"RIFF\x00\x00\x00\x00WEBPVP8 " + b"0" * 32


def test_foto_reconhece_formato_pelos_bytes():
    assert _content_type(JPEG) == "image/jpeg"
    assert _content_type(PNG) == "image/png"
    assert _content_type(WEBP) == "image/webp"
    assert _content_type(b"GIF89a" + b"0" * 32) is None
    assert _content_type(b"%PDF-1.7") is None
    assert _content_type(b"<svg xmlns='http://www.w3.org/2000/svg'/>") is None


@pytest.mark.parametrize("data, status", [
    (b"", 400),
    (b"%PDF-1.7 nao e imagem", 400),
    (JPEG + b"0" * MAX_AVATAR_BYTES, 413),
])
def test_foto_recusada_antes_de_tocar_no_banco(data, status):
    with pytest.raises(HTTPException) as exc:
        asyncio.run(AvatarService.save(None, None, data))  # db=None: a validação vem antes
    assert exc.value.status_code == status


def test_contato_valida_telefone_e_nascimento():
    ok = MeContatoUpdate(phone="(82) 3333-0000", whatsapp="+55 82 99999-0000", birth_date=date(1990, 5, 1))
    assert ok.phone == "(82) 3333-0000"
    with pytest.raises(ValueError):
        MeContatoUpdate(phone="liga pra mim")
    with pytest.raises(ValueError):
        MeContatoUpdate(birth_date=date.today() + timedelta(days=1))
    assert MeContatoUpdate(phone="").phone == ""  # vazio limpa o campo


def test_serie_de_meses_atravessa_o_ano():
    assert _month_start(date(2026, 9, 28)) == date(2026, 9, 1)
    assert _month_start(date(2026, 2, 15), 3) == date(2025, 11, 1)
    assert _month_start(date(2026, 1, 1), 12) == date(2025, 1, 1)


def test_cache_do_usuario_guarda_a_foto_e_aceita_entrada_antiga():
    import uuid
    from datetime import datetime
    from app.core.security import _deserialize_user, _serialize_user
    from app.modules.super_admin.models import User, UserRole

    u = User(id=uuid.uuid4(), tenant_id=None, email="a@b.c", full_name="A B", hashed_password="x",
             role=UserRole.COMPANY_USER, role_id=None, is_active=True, last_login=None,
             created_at=datetime(2026, 1, 1), updated_at=None, avatar_key="avatars/x/y.jpg")
    d = _serialize_user(u)
    assert _deserialize_user(d).avatar_key == "avatars/x/y.jpg"
    d.pop("avatar_key")  # cache gravado antes da foto do perfil existir
    assert _deserialize_user(d).avatar_key is None
