# -*- coding: utf-8 -*-
"""Lint the batch-maintenance workflow so a YAML or wiring error can't ship.

A broken workflow fails silently -- it just never runs, or runs the wrong
command. This parses .github/workflows/maintenance.yml and asserts the
load-bearing structure: the job picker, the safe defaults, that every job's
script exists, and that dispatch inputs are not interpolated into the run
script (the command-injection guard from submit-record.yml).
"""
from __future__ import annotations

import pathlib

import pytest

yaml = pytest.importorskip("yaml")

_REPO_ROOT = pathlib.Path(__file__).resolve().parents[2]
_WORKFLOW = _REPO_ROOT / ".github" / "workflows" / "maintenance.yml"


@pytest.fixture(scope="module")
def wf():
    with _WORKFLOW.open(encoding="utf-8") as f:
        return yaml.safe_load(f)


def _trigger(wf):
    # PyYAML parses the bare key `on` as the boolean True (YAML 1.1), the classic
    # GitHub Actions gotcha. Accept either so the test is robust.
    return wf.get(True, wf.get("on"))


def test_workflow_parses():
    # Reaching here means yaml.safe_load did not raise on a syntax error.
    assert _WORKFLOW.exists()


def test_dispatch_only(wf):
    trigger = _trigger(wf)
    assert "workflow_dispatch" in trigger
    # Manual dispatch only in v1 -- no auto-cron until a job has proven safe.
    assert "schedule" not in trigger


def test_job_picker_options(wf):
    inputs = _trigger(wf)["workflow_dispatch"]["inputs"]
    assert inputs["job"]["options"] == ["key_concepts", "dedup", "sync_to_archive"]


def test_safe_defaults(wf):
    inputs = _trigger(wf)["workflow_dispatch"]["inputs"]
    # dry_run defaults TRUE and limit defaults to a small batch.
    assert inputs["dry_run"]["default"] is True
    assert str(inputs["limit"]["default"]) == "25"


def _run_step(wf):
    steps = wf["jobs"]["maintenance"]["steps"]
    for step in steps:
        if step.get("name") == "Run maintenance job":
            return step
    raise AssertionError("no 'Run maintenance job' step found")


def _step(wf, name):
    for step in wf["jobs"]["maintenance"]["steps"]:
        if step.get("name") == name:
            return step
    raise AssertionError(f"no {name!r} step found")


def test_inputs_not_interpolated_into_run(wf):
    step = _run_step(wf)
    # Inputs must arrive via env, never as ${{ ... }} expanded inside the shell
    # command (command-injection guard).
    assert "${{" not in step["run"]
    env = step["env"]
    assert env["JOB"] == "${{ inputs.job }}"
    assert env["LIMIT"] == "${{ inputs.limit }}"
    assert env["DRY_RUN"] == "${{ inputs.dry_run }}"
    # The run script reads the env vars.
    assert "$JOB" in step["run"]
    assert "$LIMIT" in step["run"]


def test_configuration_preflight_runs_before_app_token(wf):
    steps = wf["jobs"]["maintenance"]["steps"]
    names = [step.get("name") for step in steps]
    assert names.index("Check required configuration") < names.index(
        "Mint GitHub App installation token")

    preflight = _step(wf, "Check required configuration")
    assert preflight["env"]["SPREADSHEET_NAME"] == "${{ secrets.SPREADSHEET_NAME }}"
    assert preflight["env"]["ROSEN_SHEETS_SA_KEY_JSON"] == (
        "${{ secrets.ROSEN_SHEETS_SA_KEY_JSON }}")
    assert "ROSEN_GH_APP_ID" in preflight["env"]
    assert "ROSEN_GH_APP_PRIVATE_KEY" in preflight["env"]


def test_app_token_is_only_required_for_sync_job(wf):
    token_step = _step(wf, "Mint GitHub App installation token")
    assert token_step["if"] == "${{ inputs.job == 'sync_to_archive' }}"

    checkout = _step(wf, "Checkout main")
    assert "github.token" in checkout["with"]["token"]


def test_workflow_passes_configurable_master_tab(wf):
    env = _run_step(wf)["env"]
    assert env["ROSEN_MASTER_SHEET_TAB"] == "${{ vars.ROSEN_MASTER_SHEET_TAB }}"


def test_referenced_scripts_exist(wf):
    step = _run_step(wf)
    run = step["run"]
    # The module form and the two script paths the case-statement dispatches to.
    assert "rosen_scraper.key_concepts_updater" in run
    assert (_REPO_ROOT / "backend" / "src" / "rosen_scraper"
            / "key_concepts_updater.py").exists()
    assert "scripts/diagnostics/data_deduper.py" in run
    assert (_REPO_ROOT / "backend" / "scripts" / "diagnostics"
            / "data_deduper.py").exists()
    assert "scripts/sync_sheet_to_archive.py" in run
    assert (_REPO_ROOT / "backend" / "scripts" / "sync_sheet_to_archive.py").exists()
