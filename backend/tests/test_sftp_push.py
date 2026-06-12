# -*- coding: utf-8 -*-
"""Tests for submission_server.sftp_push — atomic JSON deploy to live site.

Covers the load-bearing behaviors:
  - Missing env vars: no-op success so dev / CI runs don't break.
  - Missing staged files: explicit failure (would otherwise upload a partial set).
  - Successful push: posix_rename used (atomic from the reader's perspective).
  - SFTP server without posix_rename: falls back to remove + rename.
"""

import sys
import pathlib
from unittest.mock import MagicMock, patch

import pytest

_BACKEND = pathlib.Path(__file__).resolve().parents[1]
if str(_BACKEND) not in sys.path:
    sys.path.insert(0, str(_BACKEND))

pytest.importorskip("paramiko")
import paramiko  # noqa: E402

from submission_server import sftp_push  # noqa: E402


_REQUIRED_ENV = {
    "ROSEN_SFTP_HOST": "sftp.example.com",
    "ROSEN_SFTP_USER": "rosen",
    "ROSEN_SFTP_REMOTE_PATH": "/home/rosen/public_html/j/rosen-archive/data",
    "ROSEN_SFTP_PASSWORD": "secret",
}


def _set_env(monkeypatch, **overrides):
    for key in (
        "ROSEN_SFTP_HOST",
        "ROSEN_SFTP_USER",
        "ROSEN_SFTP_REMOTE_PATH",
        "ROSEN_SFTP_PASSWORD",
        "ROSEN_SFTP_KEY_PATH",
        "ROSEN_SFTP_PORT",
        "ROSEN_SFTP_KNOWN_HOSTS",
        "ROSEN_SFTP_KEY_PASSPHRASE",
    ):
        monkeypatch.delenv(key, raising=False)
    env = dict(_REQUIRED_ENV)
    env.update(overrides)
    for k, v in env.items():
        if v is None:
            monkeypatch.delenv(k, raising=False)
        else:
            monkeypatch.setenv(k, str(v))


@pytest.fixture
def staging_dir(tmp_path):
    """A staging dir with all four canonical JSON artifacts."""
    for filename in sftp_push._PUSH_FILES:
        (tmp_path / filename).write_text("{}")
    return tmp_path


class TestMissingConfig:
    """When required env vars are absent the push is a no-op success."""

    def test_no_env_returns_skipped_ok(self, tmp_path, monkeypatch):
        for key in (
            "ROSEN_SFTP_HOST",
            "ROSEN_SFTP_USER",
            "ROSEN_SFTP_REMOTE_PATH",
            "ROSEN_SFTP_PASSWORD",
            "ROSEN_SFTP_KEY_PATH",
        ):
            monkeypatch.delenv(key, raising=False)
        result = sftp_push.push_to_production(tmp_path)
        assert result["ok"] is True
        assert result["skipped"] is True
        assert result["files_pushed"] == 0
        assert result["error"] is None

    def test_partial_env_returns_skipped(self, tmp_path, monkeypatch):
        """Host set but no user → still treated as unconfigured."""
        _set_env(
            monkeypatch,
            ROSEN_SFTP_USER=None,
            ROSEN_SFTP_PASSWORD=None,
            ROSEN_SFTP_KEY_PATH=None,
        )
        monkeypatch.setenv("ROSEN_SFTP_HOST", "sftp.example.com")
        result = sftp_push.push_to_production(tmp_path)
        assert result["skipped"] is True
        assert result["ok"] is True


class TestStagingPreflight:
    """Staging dir state is validated before we open any SSH connection."""

    def test_missing_staging_dir_fails(self, tmp_path, monkeypatch):
        _set_env(monkeypatch)
        missing = tmp_path / "nope"
        result = sftp_push.push_to_production(missing)
        assert result["ok"] is False
        assert result["skipped"] is False
        assert "does not exist" in result["error"]

    def test_missing_staged_files_fails(self, tmp_path, monkeypatch):
        """Empty staging dir is rejected — a partial deploy is worse than no deploy."""
        _set_env(monkeypatch)
        result = sftp_push.push_to_production(tmp_path)
        assert result["ok"] is False
        assert "missing" in result["error"].lower()


class TestSuccessfulPush:
    """Happy-path push uses atomic rename and reports the count."""

    def test_uses_posix_rename_per_file(self, staging_dir, monkeypatch):
        _set_env(monkeypatch)
        with patch("paramiko.SSHClient") as mock_client_cls:
            mock_client = MagicMock()
            mock_sftp = MagicMock()
            mock_client.open_sftp.return_value = mock_sftp
            mock_client_cls.return_value = mock_client

            result = sftp_push.push_to_production(staging_dir)

        assert result["ok"] is True
        assert result["files_pushed"] == len(sftp_push._PUSH_FILES)
        assert result["error"] is None
        # Every file uploaded under .tmp and atomically renamed.
        assert mock_sftp.put.call_count == len(sftp_push._PUSH_FILES)
        assert mock_sftp.posix_rename.call_count == len(sftp_push._PUSH_FILES)
        # The destination of every upload ends in .tmp — atomic write hinge.
        for call in mock_sftp.put.call_args_list:
            args = call.args
            assert args[1].endswith(".tmp"), (
                f"upload must land in .tmp first; got {args[1]!r}"
            )

    def test_falls_back_to_plain_rename_without_posix(self, staging_dir, monkeypatch):
        """An SFTP server without posix_rename should not break the push."""
        _set_env(monkeypatch)
        with patch("paramiko.SSHClient") as mock_client_cls:
            mock_client = MagicMock()
            mock_sftp = MagicMock()
            mock_sftp.posix_rename.side_effect = IOError("not supported")
            mock_client.open_sftp.return_value = mock_sftp
            mock_client_cls.return_value = mock_client

            result = sftp_push.push_to_production(staging_dir)

        assert result["ok"] is True
        assert mock_sftp.rename.call_count == len(sftp_push._PUSH_FILES)


class TestAuthMode:
    """Key auth must be preferred when ROSEN_SFTP_KEY_PATH is set."""

    def test_key_path_overrides_password(self, staging_dir, monkeypatch, tmp_path):
        key_file = tmp_path / "id_rsa"
        key_file.write_text("-----BEGIN OPENSSH PRIVATE KEY-----\n")
        _set_env(monkeypatch, ROSEN_SFTP_KEY_PATH=str(key_file))
        with patch("paramiko.SSHClient") as mock_client_cls:
            mock_client = MagicMock()
            mock_client.open_sftp.return_value = MagicMock()
            mock_client_cls.return_value = mock_client

            sftp_push.push_to_production(staging_dir)

        connect_kwargs = mock_client.connect.call_args.kwargs
        assert connect_kwargs.get("key_filename") == str(key_file)
        # Even with a password set, key auth must win to keep prod predictable.
        assert "password" not in connect_kwargs


class TestSshErrorReporting:
    """SSH failures are surfaced as ok=False with the error string captured."""

    def test_ssh_exception_returns_error(self, staging_dir, monkeypatch):
        _set_env(monkeypatch)
        with patch("paramiko.SSHClient") as mock_client_cls:
            mock_client = MagicMock()
            mock_client.connect.side_effect = paramiko.SSHException("auth failed")
            mock_client_cls.return_value = mock_client

            result = sftp_push.push_to_production(staging_dir)

        assert result["ok"] is False
        assert "auth failed" in result["error"]
        assert result["files_pushed"] == 0


class TestKnownHostsInputShape:
    """ROSEN_SFTP_KNOWN_HOSTS may hold a path OR raw host-key content (#298/#304).

    A GitHub Actions secret can only hold the inline ssh-keyscan content, not a
    runner path, so the path-only handling silently skipped load_host_keys and
    RejectPolicy then blocked every push. The value is now disambiguated: an
    existing file is loaded as a path; otherwise the content is materialized to
    a tempfile, loaded, and cleaned up.
    """

    def test_path_value_loaded_directly(self, staging_dir, monkeypatch, tmp_path):
        kh = tmp_path / "known_hosts"
        kh.write_text("sftp.example.com ssh-ed25519 AAAAC3Nza\n")
        _set_env(monkeypatch, ROSEN_SFTP_KNOWN_HOSTS=str(kh))
        with patch("paramiko.SSHClient") as mock_client_cls:
            mock_client = MagicMock()
            mock_client.open_sftp.return_value = MagicMock()
            mock_client_cls.return_value = mock_client

            result = sftp_push.push_to_production(staging_dir)

        assert result["ok"] is True
        mock_client.load_host_keys.assert_called_once_with(str(kh))

    def test_inline_content_materialized_to_tempfile(self, staging_dir, monkeypatch):
        inline = "sftp.example.com ssh-ed25519 AAAAC3NzaInlineKeyContent"
        _set_env(monkeypatch, ROSEN_SFTP_KNOWN_HOSTS=inline)

        captured = {}

        def _capture(path):
            captured["path"] = path
            captured["content"] = pathlib.Path(path).read_text()

        with patch("paramiko.SSHClient") as mock_client_cls:
            mock_client = MagicMock()
            mock_client.load_host_keys.side_effect = _capture
            mock_client.open_sftp.return_value = MagicMock()
            mock_client_cls.return_value = mock_client

            result = sftp_push.push_to_production(staging_dir)

        assert result["ok"] is True
        # load_host_keys got a tempfile path, not the raw content string.
        assert captured["path"] != inline
        assert inline in captured["content"]
        # The tempfile is cleaned up after the push.
        assert not pathlib.Path(captured["path"]).exists()
        # Strict checking is still in force — keys are loaded, not trusted blind.
        policy = mock_client.set_missing_host_key_policy.call_args.args[0]
        assert isinstance(policy, paramiko.RejectPolicy)
