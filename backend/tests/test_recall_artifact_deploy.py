# -*- coding: utf-8 -*-
"""Atomic deployment contract for the hash-bound recall artifact pair."""

from __future__ import annotations

import errno
import importlib.util
import io
import sys
from pathlib import Path

import pytest

_BACKEND = Path(__file__).resolve().parents[1]
if str(_BACKEND) not in sys.path:
    sys.path.insert(0, str(_BACKEND))

pytest.importorskip("paramiko")


def _load_deploy_module():
    path = _BACKEND / "scripts" / "deploy_full_site.py"
    spec = importlib.util.spec_from_file_location("deploy_full_site_recall", path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


deploy = _load_deploy_module()

_TRANSACTION_SUFFIXES = (
    ".pair-tmp",
    ".pair-backup",
    ".pair-backup-tmp",
    ".pair-restore-tmp",
)


class MemoryRemote:
    def __init__(
        self,
        root: str,
        *,
        fail_publish_target: str | None = None,
        fail_stat_target: str | None = None,
    ):
        self.files: dict[str, bytes] = {}
        self.directories = {root, f"{root}/data"}
        self.fail_publish_target = fail_publish_target
        self.fail_stat_target = fail_stat_target
        self.history: list[tuple[str, dict[str, bytes]]] = []
        self.closed = False

    def stat(self, path):
        if path == self.fail_stat_target:
            raise IOError("injected generic stat failure")
        if path in self.files or path in self.directories:
            return object()
        raise IOError(errno.ENOENT, path)

    def mkdir(self, path):
        self.directories.add(path)

    def put(self, local, remote):
        self.files[remote] = Path(local).read_bytes()
        self.history.append((f"put {remote}", dict(self.files)))

    def open(self, remote, mode="rb"):
        assert mode == "rb"
        if remote not in self.files:
            raise IOError(errno.ENOENT, remote)
        return io.BytesIO(self.files[remote])

    def _rename(self, source, target):
        if target == self.fail_publish_target and source.endswith(".pair-tmp"):
            raise IOError(errno.EIO, "injected sidecar publish failure")
        if source not in self.files:
            raise IOError(errno.ENOENT, source)
        self.files[target] = self.files.pop(source)
        self.history.append((f"rename {source} {target}", dict(self.files)))

    def posix_rename(self, source, target):
        self._rename(source, target)

    def rename(self, source, target):
        self._rename(source, target)

    def remove(self, path):
        if path not in self.files:
            raise IOError(errno.ENOENT, path)
        del self.files[path]
        self.history.append((f"remove {path}", dict(self.files)))

    def close(self):
        self.closed = True


def _fixture(tmp_path):
    data = tmp_path / "data"
    data.mkdir()
    binary = data / "archive-embeddings.bin"
    sidecar = data / "archive-embeddings.json"
    binary.write_bytes(b"new-binary")
    sidecar.write_bytes(b'{"binarySha256":"new"}')
    return binary, sidecar


def _cfg(root):
    return {
        "protocol": "sftp",
        "site_path": root,
        "host": "example.invalid",
        "port": 22,
        "user": "archive",
        "password": "secret",
        "key_path": None,
        "key_passphrase": None,
        "known_hosts": "/dev/null",
    }


def test_pair_publish_replaces_both_files_and_cleans_transaction_paths(
    tmp_path, monkeypatch
):
    binary, sidecar = _fixture(tmp_path)
    root = "/home/archive/public_html/j/rosen-archive"
    remote = MemoryRemote(root)
    binary_final = f"{root}/data/archive-embeddings.bin"
    sidecar_final = f"{root}/data/archive-embeddings.json"
    remote.files[binary_final] = b"old-binary"
    remote.files[sidecar_final] = b'{"binarySha256":"old"}'
    monkeypatch.setattr(deploy.remote_transfer, "connect_remote", lambda cfg: remote)

    result = deploy.push_files(
        [binary, sidecar],
        tmp_path,
        _cfg(root),
        remote_prune_dirs=(),
    )

    assert result == {"ok": True, "files_pushed": 2, "error": None}
    assert remote.files[binary_final] == b"new-binary"
    assert remote.files[sidecar_final] == b'{"binarySha256":"new"}'
    assert not any(path.endswith(_TRANSACTION_SUFFIXES) for path in remote.files)
    assert remote.closed is True


def test_existing_pair_stays_readable_while_backups_are_prepared(tmp_path, monkeypatch):
    binary, sidecar = _fixture(tmp_path)
    root = "/home/archive/public_html/j/rosen-archive"
    remote = MemoryRemote(root)
    binary_final = f"{root}/data/archive-embeddings.bin"
    sidecar_final = f"{root}/data/archive-embeddings.json"
    remote.files[binary_final] = b"old-binary"
    remote.files[sidecar_final] = b'{"binarySha256":"old"}'
    monkeypatch.setattr(deploy.remote_transfer, "connect_remote", lambda cfg: remote)

    result = deploy.push_files(
        [binary, sidecar],
        tmp_path,
        _cfg(root),
        remote_prune_dirs=(),
    )

    assert result["ok"] is True
    for operation, files in remote.history:
        assert binary_final in files, operation
        assert sidecar_final in files, operation


def test_unknown_stat_failure_aborts_before_changing_the_live_pair(
    tmp_path, monkeypatch
):
    binary, sidecar = _fixture(tmp_path)
    root = "/home/archive/public_html/j/rosen-archive"
    binary_final = f"{root}/data/archive-embeddings.bin"
    sidecar_final = f"{root}/data/archive-embeddings.json"
    remote = MemoryRemote(root, fail_stat_target=binary_final)
    remote.files[binary_final] = b"old-binary"
    remote.files[sidecar_final] = b'{"binarySha256":"old"}'
    original_files = dict(remote.files)
    monkeypatch.setattr(deploy.remote_transfer, "connect_remote", lambda cfg: remote)

    result = deploy.push_files(
        [binary, sidecar],
        tmp_path,
        _cfg(root),
        remote_prune_dirs=(),
    )

    assert result["ok"] is False
    assert "injected generic stat failure" in result["error"]
    assert remote.files == original_files
    assert remote.history == []
    assert remote.closed is True


def test_sidecar_publish_failure_restores_the_previous_complete_pair(
    tmp_path, monkeypatch
):
    binary, sidecar = _fixture(tmp_path)
    root = "/home/archive/public_html/j/rosen-archive"
    binary_final = f"{root}/data/archive-embeddings.bin"
    sidecar_final = f"{root}/data/archive-embeddings.json"
    remote = MemoryRemote(root, fail_publish_target=sidecar_final)
    remote.files[binary_final] = b"old-binary"
    remote.files[sidecar_final] = b'{"binarySha256":"old"}'
    monkeypatch.setattr(deploy.remote_transfer, "connect_remote", lambda cfg: remote)

    result = deploy.push_files(
        [binary, sidecar],
        tmp_path,
        _cfg(root),
        remote_prune_dirs=(),
    )

    assert result["ok"] is False
    assert result["files_pushed"] == 0
    assert "injected sidecar publish failure" in result["error"]
    assert remote.files[binary_final] == b"old-binary"
    assert remote.files[sidecar_final] == b'{"binarySha256":"old"}'
    assert not any(path.endswith(_TRANSACTION_SUFFIXES) for path in remote.files)
    assert remote.closed is True


def test_retry_restores_an_interrupted_pair_before_staging_new_bytes(
    tmp_path, monkeypatch
):
    binary, sidecar = _fixture(tmp_path)
    root = "/home/archive/public_html/j/rosen-archive"
    binary_final = f"{root}/data/archive-embeddings.bin"
    sidecar_final = f"{root}/data/archive-embeddings.json"
    remote = MemoryRemote(root, fail_publish_target=sidecar_final)
    remote.files[binary_final] = b"interrupted-new-binary"
    remote.files[f"{binary_final}.pair-backup"] = b"old-binary"
    remote.files[f"{sidecar_final}.pair-backup"] = b'{"binarySha256":"old"}'
    monkeypatch.setattr(deploy.remote_transfer, "connect_remote", lambda cfg: remote)

    result = deploy.push_files(
        [binary, sidecar],
        tmp_path,
        _cfg(root),
        remote_prune_dirs=(),
    )

    assert result["ok"] is False
    assert remote.files[binary_final] == b"old-binary"
    assert remote.files[sidecar_final] == b'{"binarySha256":"old"}'
    assert not any(path.endswith(_TRANSACTION_SUFFIXES) for path in remote.files)
    assert remote.closed is True


def test_retry_restores_copy_backups_when_both_mixed_finals_remain(
    tmp_path, monkeypatch
):
    binary, sidecar = _fixture(tmp_path)
    root = "/home/archive/public_html/j/rosen-archive"
    binary_final = f"{root}/data/archive-embeddings.bin"
    sidecar_final = f"{root}/data/archive-embeddings.json"
    remote = MemoryRemote(root, fail_publish_target=sidecar_final)
    remote.files[binary_final] = b"interrupted-new-binary"
    remote.files[sidecar_final] = b'{"binarySha256":"old"}'
    remote.files[f"{binary_final}.pair-backup"] = b"old-binary"
    remote.files[f"{sidecar_final}.pair-backup"] = b'{"binarySha256":"old"}'
    monkeypatch.setattr(deploy.remote_transfer, "connect_remote", lambda cfg: remote)

    result = deploy.push_files(
        [binary, sidecar],
        tmp_path,
        _cfg(root),
        remote_prune_dirs=(),
    )

    assert result["ok"] is False
    assert remote.files[binary_final] == b"old-binary"
    assert remote.files[sidecar_final] == b'{"binarySha256":"old"}'
    assert not any(path.endswith(_TRANSACTION_SUFFIXES) for path in remote.files)
    assert remote.closed is True


def test_pair_manifest_must_include_both_members(tmp_path, monkeypatch):
    binary, _sidecar = _fixture(tmp_path)
    root = "/home/archive/public_html/j/rosen-archive"
    remote = MemoryRemote(root)
    monkeypatch.setattr(deploy.remote_transfer, "connect_remote", lambda cfg: remote)

    result = deploy.push_files(
        [binary],
        tmp_path,
        _cfg(root),
        remote_prune_dirs=(),
    )

    assert result["ok"] is False
    assert result["files_pushed"] == 0
    assert "must be deployed together" in result["error"]
    assert remote.files == {}
