# -*- coding: utf-8 -*-
"""Lint the @claude responder workflow so it can't be triggered by anyone.

.github/workflows/claude.yml runs an AI agent on a secret OAuth token. The job
gate must require BOTH an @claude mention AND a trusted author association
(OWNER/MEMBER/COLLABORATOR) on every trigger branch -- otherwise any GitHub
user can fire the agent by opening an issue titled "@claude ...". This parses
the workflow and asserts the gate so the guard can't be dropped silently (same
discipline as test_maintenance_workflow.py).
"""
from __future__ import annotations

import pathlib

import pytest

yaml = pytest.importorskip("yaml")

_REPO_ROOT = pathlib.Path(__file__).resolve().parents[2]
_WORKFLOW = _REPO_ROOT / ".github" / "workflows" / "claude.yml"


@pytest.fixture(scope="module")
def wf():
    with _WORKFLOW.open(encoding="utf-8") as f:
        return yaml.safe_load(f)


def test_workflow_parses():
    # Reaching here means yaml.safe_load did not raise on a syntax error.
    assert _WORKFLOW.exists()


def test_claude_job_still_requires_mention(wf):
    # The fix must not drop the @claude mention requirement.
    gate = wf["jobs"]["claude"]["if"]
    assert "@claude" in gate


def test_claude_job_requires_trusted_author_association(wf):
    # An @claude mention alone is not enough; the author must be trusted, or any
    # GitHub user can trigger the secret-bearing agent on a public repo.
    gate = wf["jobs"]["claude"]["if"]
    assert "author_association" in gate
    for role in ("OWNER", "MEMBER", "COLLABORATOR"):
        assert role in gate
    # One association field per trigger branch (comment / review / issue).
    assert "github.event.comment.author_association" in gate
    assert "github.event.review.author_association" in gate
    assert "github.event.issue.author_association" in gate


def test_every_trigger_branch_couples_mention_and_association(wf):
    # The checks above only prove the guard strings appear somewhere in the
    # expression. Because two branches share github.event.comment.author_association,
    # a branch could drop its trust check and those checks would still pass.
    # Split on the per-event marker so each branch's clause is isolated, then
    # require every branch to couple the @claude mention AND an author_association
    # guard. Splitting on "github.event_name ==" survives the issues branch's
    # internal body-or-title `||`; the fragment before the first marker is dropped.
    gate = wf["jobs"]["claude"]["if"]
    branches = gate.split("github.event_name ==")[1:]
    assert len(branches) == 4, (
        f"expected 4 individually gated trigger branches, found {len(branches)}")
    for clause in branches:
        assert "@claude" in clause, f"branch missing @claude mention check: {clause!r}"
        assert "author_association" in clause, (
            f"branch missing author_association trust guard: {clause!r}")
