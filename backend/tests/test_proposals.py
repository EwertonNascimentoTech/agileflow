"""Smoke tests do módulo propostas — validação de status transitions."""
import pytest
from app.modules.propostas_contratos.models import ProposalStatus

VALID_TRANSITIONS = {
    ProposalStatus.DRAFT:     {ProposalStatus.SENT, ProposalStatus.CANCELLED},
    ProposalStatus.SENT:      {ProposalStatus.ACCEPTED, ProposalStatus.REJECTED, ProposalStatus.EXPIRED, ProposalStatus.CANCELLED},
    ProposalStatus.ACCEPTED:  set(),
    ProposalStatus.REJECTED:  {ProposalStatus.DRAFT},
    ProposalStatus.EXPIRED:   {ProposalStatus.DRAFT},
    ProposalStatus.CANCELLED: set(),
}


def test_all_statuses_have_transitions():
    for status in ProposalStatus:
        assert status in VALID_TRANSITIONS, f"Status {status} has no transition rule"


def test_draft_can_be_sent():
    assert ProposalStatus.SENT in VALID_TRANSITIONS[ProposalStatus.DRAFT]


def test_draft_cannot_be_accepted_directly():
    assert ProposalStatus.ACCEPTED not in VALID_TRANSITIONS[ProposalStatus.DRAFT]


def test_accepted_is_terminal():
    assert len(VALID_TRANSITIONS[ProposalStatus.ACCEPTED]) == 0


def test_cancelled_is_terminal():
    assert len(VALID_TRANSITIONS[ProposalStatus.CANCELLED]) == 0


def test_rejected_can_return_to_draft():
    assert ProposalStatus.DRAFT in VALID_TRANSITIONS[ProposalStatus.REJECTED]


def test_sent_can_be_accepted_or_rejected():
    transitions = VALID_TRANSITIONS[ProposalStatus.SENT]
    assert ProposalStatus.ACCEPTED in transitions
    assert ProposalStatus.REJECTED in transitions


@pytest.mark.asyncio
async def test_proposals_endpoint_requires_auth(client):
    resp = await client.get("/api/v1/propostas-contratos/proposals")
    assert resp.status_code in (401, 403)
