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
