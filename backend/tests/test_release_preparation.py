"""Generated release paths are complete and remain inside the repository."""

import json
from pathlib import Path
import subprocess

import pytest

from submission_runtime import release_preparation as release
from submission_runtime import sftp_push
from scripts import deploy_full_site as deploy


def test_release_preparation_uses_shared_builder_and_retains_vector_paths(monkeypatch):
    def run(command, **kwargs):
        assert command[2] == "prepare-record-release"
        Path(command[3]).write_text(
            json.dumps(
                {
                    "paths": [
                        "data/archive-embeddings.bin",
                        "data/archive-embeddings.json",
                        "version.json",
                    ]
                }
            )
        )
        assert kwargs["env"]["RUNNER_TEMP"] == str(Path(command[3]).parent)
        return subprocess.CompletedProcess(command, 0)

    monkeypatch.setattr(release.subprocess, "run", run)
    assert release.prepare_release() == [
        "data/archive-embeddings.bin",
        "data/archive-embeddings.json",
        "version.json",
    ]


@pytest.mark.parametrize(
    "paths", [[], ["../outside"], ["/absolute"], ["data\\outside"], [None]]
)
def test_release_path_report_fails_closed(monkeypatch, paths):
    def run(command, **kwargs):
        Path(command[3]).write_text(json.dumps({"paths": paths}))

    monkeypatch.setattr(release.subprocess, "run", run)
    with pytest.raises(ValueError):
        release.prepare_release()


def test_full_publication_uses_existing_rollback_deployer_and_verifies_before_success(
    monkeypatch,
):
    calls = []
    monkeypatch.setattr(deploy, "_read_env", lambda: {"example": "config"})
    monkeypatch.setattr(deploy, "generate_record_pages", lambda root: {})
    monkeypatch.setattr(
        deploy,
        "collect_local_files",
        lambda root: [root / "data/archive-embeddings.bin"],
    )

    def push(files, root, cfg, **kwargs):
        calls.append("transfer")
        return {"ok": True, "files_pushed": 7, "error": None}

    def verify(command, **kwargs):
        calls.append("verify")
        assert command[1].endswith("verify-live-deploy.mjs")

    monkeypatch.setattr(deploy, "push_files", push)
    monkeypatch.setattr(sftp_push.subprocess, "run", verify)
    result = sftp_push.push_full_release(record_ids=("RECORD-00001",))
    assert calls == ["transfer", "verify"]
    assert result == {"ok": True, "skipped": False, "files_pushed": 7, "error": None}


def test_verification_failure_never_reports_live_and_keeps_transfer_count(monkeypatch):
    monkeypatch.setattr(deploy, "_read_env", lambda: {"example": "config"})
    monkeypatch.setattr(deploy, "generate_record_pages", lambda root: {})
    monkeypatch.setattr(deploy, "collect_local_files", lambda root: [])
    monkeypatch.setattr(
        deploy,
        "push_files",
        lambda *a, **k: {"ok": True, "files_pushed": 7, "error": None},
    )

    def failed(command, **kwargs):
        raise subprocess.CalledProcessError(
            1, command, stderr="data/archive-core.json SHA mismatch"
        )

    monkeypatch.setattr(sftp_push.subprocess, "run", failed)
    result = sftp_push.push_full_release()
    assert result["ok"] is False
    assert result["skipped"] is False
    assert result["files_pushed"] == 7
    assert "archive-core.json SHA mismatch" in result["error"]


def test_full_publication_refuses_missing_selected_record_before_transfer(
    monkeypatch, tmp_path
):
    (tmp_path / "data").mkdir()
    (tmp_path / "data/archive-data.json").write_text(
        json.dumps({"records": [{"id": "RECORD-00001"}]}), encoding="utf-8"
    )
    monkeypatch.setattr(sftp_push, "PROJECT_ROOT", tmp_path)
    monkeypatch.setattr(
        deploy, "_read_env", lambda: pytest.fail("transfer setup was reached")
    )
    result = sftp_push.push_full_release(record_ids=("RECORD-00001", "RECORD-99999"))
    assert result["ok"] is False
    assert result["files_pushed"] == 0
    assert "RECORD-99999" in result["error"]
