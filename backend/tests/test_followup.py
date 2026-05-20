"""Tests do FollowUpService.interpolate (sem DB)."""
from app.modules.crm.service import FollowUpService


def test_interpolate_basic():
    result = FollowUpService._interpolate("Olá {{client_name}}!", {"client_name": "Maria"})
    assert result == "Olá Maria!"


def test_interpolate_multiple_variables():
    msg = "Olá {{client_first_name}}, seu atendimento {{protocol}} foi aberto."
    ctx = {"client_first_name": "João", "protocol": "ATD-001"}
    result = FollowUpService._interpolate(msg, ctx)
    assert "João" in result
    assert "ATD-001" in result


def test_interpolate_missing_variable_kept():
    result = FollowUpService._interpolate("Olá {{undefined_var}}!", {})
    assert "{{undefined_var}}" in result


def test_interpolate_empty_message():
    result = FollowUpService._interpolate("", {"client_name": "X"})
    assert result == ""


def test_render_preview_returns_string():
    preview = FollowUpService.render_preview("Olá {{client_name}}, seu funil é {{funnel_name}}.")
    assert "Maria Silva" in preview
    assert isinstance(preview, str)


def test_render_preview_custom_context():
    preview = FollowUpService.render_preview("{{client_name}}", {"client_name": "Customizado"})
    assert "Customizado" in preview
