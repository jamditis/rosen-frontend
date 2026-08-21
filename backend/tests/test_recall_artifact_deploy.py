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
        fail_open_target: str | None = None,
    ):
        self.files: dict[str, bytes] = {}
        self.directories = {root, f"{root}/data"}
        self.fail_publish_target = fail_publish_target
        self.fail_stat_target = fail_stat_target
        self.fail_open_target = fail_open_target
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
        if remote == self.fail_open_target:
            raise IOError(errno.EIO, "injected backup read failure")
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


class FtpsNoOverwriteRemote(MemoryRemote):
    """Model an FTPS server that refuses rename-over-existing."""

    def posix_rename(self, source, target):
        if target in self.files:
            raise IOError(errno.EIO, "rename-over-existing refused")
        self._rename(source, target)


class SftpNoPosixRenameRemote(MemoryRemote):
    """Model an SFTP server without the posix-rename extension."""

    def posix_rename(self, source, target):
        raise IOError(errno.EOPNOTSUPP, "posix rename unsupported")


class GenericMissingDeleteRemote(MemoryRemote):
    """Model FTPS DELE returning a generic 550 for an absent path."""

    def __init__(self, root):
        super().__init__(root)
        self.remove_attempts = []

    def remove(self, path):
        self.remove_attempts.append(path)
        if path not in self.files:
            raise IOError(errno.EIO, "550 Delete operation failed")
        super().remove(path)


def _fixture(tmp_path):
    data = tmp_path / "data"
    data.mkdir()
    binary = data / "archive-embeddings.bin"
    sidecar = data / "archive-embeddings.json"
    binary.write_bytes(b"new-binary")
    sidecar.write_bytes(b'{"binarySha256":"new"}')
    return binary, sidecar


def _transaction_root(root):
    if root.startswith("/"):
        private_parent = root.split("/public_html/", 1)[0]
        return f"{private_parent}/.rosen-archive-transactions"
    return ".rosen-archive-transactions"


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
        "transaction_path": _transaction_root(root),
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


def test_ftps_replacement_failure_keeps_the_live_pair_readable(tmp_path, monkeypatch):
    binary, sidecar = _fixture(tmp_path)
    root = "j/rosen-archive"
    remote = FtpsNoOverwriteRemote(root)
    binary_final = f"{root}/data/archive-embeddings.bin"
    sidecar_final = f"{root}/data/archive-embeddings.json"
    remote.files[binary_final] = b"old-binary"
    remote.files[sidecar_final] = b'{"binarySha256":"old"}'
    monkeypatch.setattr(deploy.remote_transfer, "connect_remote", lambda cfg: remote)
    cfg = _cfg(root)
    cfg.update({"protocol": "ftps", "port": 21})

    result = deploy.push_files(
        [binary, sidecar],
        tmp_path,
        cfg,
        remote_prune_dirs=(),
    )

    assert result["ok"] is False
    assert "rename-over-existing refused" in result["error"]
    assert remote.files[binary_final] == b"old-binary"
    assert remote.files[sidecar_final] == b'{"binarySha256":"old"}'
    for operation, files in remote.history:
        assert binary_final in files, operation
        assert sidecar_final in files, operation
    assert remote.closed is True


def test_unchanged_pair_skips_ftps_no_overwrite_switch(tmp_path, monkeypatch):
    binary, sidecar = _fixture(tmp_path)
    root = "j/rosen-archive"
    remote = FtpsNoOverwriteRemote(root)
    binary_final = f"{root}/data/archive-embeddings.bin"
    sidecar_final = f"{root}/data/archive-embeddings.json"
    remote.files[binary_final] = binary.read_bytes()
    remote.files[sidecar_final] = sidecar.read_bytes()
    monkeypatch.setattr(deploy.remote_transfer, "connect_remote", lambda cfg: remote)
    cfg = _cfg(root)
    cfg.update({"protocol": "ftps", "port": 21, "transaction_path": None})

    result = deploy.push_files(
        [binary, sidecar],
        tmp_path,
        cfg,
        remote_prune_dirs=(),
    )

    assert result == {"ok": True, "files_pushed": 2, "error": None}
    assert remote.history == []
    assert _transaction_root(root) not in remote.directories
    assert remote.closed is True


def test_unchanged_pair_does_not_probe_private_transaction_root(tmp_path, monkeypatch):
    binary, sidecar = _fixture(tmp_path)
    root = "/home/archive/public_html/j/rosen-archive"
    transaction_root = _transaction_root(root)
    remote = MemoryRemote(root, fail_stat_target=transaction_root)
    binary_final = f"{root}/data/archive-embeddings.bin"
    sidecar_final = f"{root}/data/archive-embeddings.json"
    remote.files[binary_final] = binary.read_bytes()
    remote.files[sidecar_final] = sidecar.read_bytes()
    monkeypatch.setattr(deploy.remote_transfer, "connect_remote", lambda cfg: remote)

    result = deploy.push_files(
        [binary, sidecar],
        tmp_path,
        _cfg(root),
        remote_prune_dirs=(),
    )

    assert result == {"ok": True, "files_pushed": 2, "error": None}
    assert remote.history == []
    assert remote.closed is True


def test_first_publish_falls_back_to_rename_when_target_is_absent(
    tmp_path, monkeypatch
):
    binary, sidecar = _fixture(tmp_path)
    root = "/home/archive/public_html/j/rosen-archive"
    remote = SftpNoPosixRenameRemote(root)
    binary_final = f"{root}/data/archive-embeddings.bin"
    sidecar_final = f"{root}/data/archive-embeddings.json"
    monkeypatch.setattr(deploy.remote_transfer, "connect_remote", lambda cfg: remote)
    cfg = _cfg(root)
    cfg["transaction_path"] = None

    result = deploy.push_files(
        [binary, sidecar],
        tmp_path,
        cfg,
        remote_prune_dirs=(),
    )

    assert result == {"ok": True, "files_pushed": 2, "error": None}
    assert remote.files[binary_final] == binary.read_bytes()
    assert remote.files[sidecar_final] == sidecar.read_bytes()
    assert _transaction_root(root) not in remote.directories
    assert remote.closed is True


def test_retained_backups_stay_outside_the_public_site(tmp_path, monkeypatch):
    binary, sidecar = _fixture(tmp_path)
    root = "/home/archive/public_html/j/rosen-archive"
    transaction_root = "/home/archive/.rosen-archive-transactions"
    binary_final = f"{root}/data/archive-embeddings.bin"
    sidecar_final = f"{root}/data/archive-embeddings.json"
    binary_backup = f"{transaction_root}/archive-embeddings.bin.pair-backup"
    sidecar_backup = f"{transaction_root}/archive-embeddings.json.pair-backup"
    remote = MemoryRemote(
        root,
        fail_publish_target=sidecar_final,
        fail_open_target=binary_backup,
    )
    remote.files[binary_final] = b"old-binary"
    remote.files[sidecar_final] = b'{"binarySha256":"old"}'
    monkeypatch.setattr(deploy.remote_transfer, "connect_remote", lambda cfg: remote)
    cfg = _cfg(root)
    cfg["transaction_path"] = transaction_root

    result = deploy.push_files(
        [binary, sidecar],
        tmp_path,
        cfg,
        remote_prune_dirs=(),
    )

    assert result["ok"] is False
    assert "recall artifact rollback also failed" in result["error"]
    assert remote.files[binary_backup] == b"old-binary"
    assert remote.files[sidecar_backup] == b'{"binarySha256":"old"}'
    assert not any(
        path.startswith(f"{root}/") and ".pair-backup" in path for path in remote.files
    )
    assert remote.closed is True


def test_changed_pair_requires_a_private_transaction_root(tmp_path, monkeypatch):
    binary, sidecar = _fixture(tmp_path)
    root = "/home/archive/public_html/j/rosen-archive"
    remote = MemoryRemote(root)
    binary_final = f"{root}/data/archive-embeddings.bin"
    sidecar_final = f"{root}/data/archive-embeddings.json"
    remote.files[binary_final] = b"old-binary"
    remote.files[sidecar_final] = b'{"binarySha256":"old"}'
    monkeypatch.setattr(deploy.remote_transfer, "connect_remote", lambda cfg: remote)
    cfg = _cfg(root)
    cfg["transaction_path"] = None

    result = deploy.push_files(
        [binary, sidecar],
        tmp_path,
        cfg,
        remote_prune_dirs=(),
    )

    assert result["ok"] is False
    assert "ROSEN_SFTP_TRANSACTION_PATH is required" in result["error"]
    assert remote.files[binary_final] == b"old-binary"
    assert remote.files[sidecar_final] == b'{"binarySha256":"old"}'
    assert remote.history == []
    assert remote.closed is True


def test_legacy_backup_recovery_does_not_create_new_public_rollback_files(
    tmp_path, monkeypatch
):
    binary, sidecar = _fixture(tmp_path)
    root = "/home/archive/public_html/j/rosen-archive"
    binary_final = f"{root}/data/archive-embeddings.bin"
    sidecar_final = f"{root}/data/archive-embeddings.json"
    remote = MemoryRemote(root)
    remote.files[binary_final] = b"interrupted-new-binary"
    remote.files[f"{binary_final}.pair-backup"] = b"old-binary"
    remote.files[f"{sidecar_final}.pair-backup"] = b'{"binarySha256":"old"}'
    original_files = dict(remote.files)
    monkeypatch.setattr(deploy.remote_transfer, "connect_remote", lambda cfg: remote)
    cfg = _cfg(root)
    cfg["transaction_path"] = None

    result = deploy.push_files(
        [binary, sidecar],
        tmp_path,
        cfg,
        remote_prune_dirs=(),
    )

    assert result["ok"] is False
    assert "ROSEN_SFTP_TRANSACTION_PATH is required" in result["error"]
    assert remote.files == original_files
    assert remote.history == []
    assert remote.closed is True


def test_missing_cleanup_stats_before_generic_ftps_delete(tmp_path, monkeypatch):
    binary, sidecar = _fixture(tmp_path)
    root = "j/rosen-archive"
    remote = GenericMissingDeleteRemote(root)
    monkeypatch.setattr(deploy.remote_transfer, "connect_remote", lambda cfg: remote)
    cfg = _cfg(root)
    cfg.update({"protocol": "ftps", "port": 21})

    result = deploy.push_files(
        [binary, sidecar],
        tmp_path,
        cfg,
        remote_prune_dirs=(),
    )

    assert result == {"ok": True, "files_pushed": 2, "error": None}
    assert remote.remove_attempts == []
    assert remote.closed is True


def test_cleanup_does_not_swallow_unknown_stat_failures(tmp_path, monkeypatch):
    binary, sidecar = _fixture(tmp_path)
    root = "j/rosen-archive"
    binary_tmp = f"{root}/data/archive-embeddings.bin.pair-tmp"
    remote = MemoryRemote(root, fail_stat_target=binary_tmp)
    monkeypatch.setattr(deploy.remote_transfer, "connect_remote", lambda cfg: remote)
    cfg = _cfg(root)
    cfg.update({"protocol": "ftps", "port": 21})

    result = deploy.push_files(
        [binary, sidecar],
        tmp_path,
        cfg,
        remote_prune_dirs=(),
    )

    assert result["ok"] is False
    assert "injected generic stat failure" in result["error"]
    assert remote.history == []
    assert remote.closed is True


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


def test_failed_rollback_keeps_both_backups_for_the_next_deploy(tmp_path, monkeypatch):
    binary, sidecar = _fixture(tmp_path)
    root = "/home/archive/public_html/j/rosen-archive"
    binary_final = f"{root}/data/archive-embeddings.bin"
    sidecar_final = f"{root}/data/archive-embeddings.json"
    transaction_root = _transaction_root(root)
    binary_backup = f"{transaction_root}/archive-embeddings.bin.pair-backup"
    sidecar_backup = f"{transaction_root}/archive-embeddings.json.pair-backup"
    remote = MemoryRemote(
        root,
        fail_publish_target=sidecar_final,
        fail_open_target=binary_backup,
    )
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
    assert "recall artifact rollback also failed" in result["error"]
    assert remote.files[binary_backup] == b"old-binary"
    assert remote.files[sidecar_backup] == b'{"binarySha256":"old"}'
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
    transaction_root = _transaction_root(root)
    remote.directories.add(transaction_root)
    remote.files[binary_final] = b"interrupted-new-binary"
    remote.files[sidecar_final] = b'{"binarySha256":"old"}'
    remote.files[f"{transaction_root}/archive-embeddings.bin.pair-backup"] = (
        b"old-binary"
    )
    remote.files[f"{transaction_root}/archive-embeddings.json.pair-backup"] = (
        b'{"binarySha256":"old"}'
    )
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
