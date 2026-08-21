# -*- coding: utf-8 -*-
"""Tests for the shared SFTP/FTPS archive transport boundary."""

import io
import pathlib
import ssl
import stat
from unittest.mock import MagicMock, call, patch

import pytest

from submission_runtime import remote_transfer

_REPO_ROOT = pathlib.Path(__file__).resolve().parents[2]


def _config(protocol="ftps", **overrides):
    config = {
        "protocol": protocol,
        "host": "archive.example.com",
        "port": 21 if protocol == "ftps" else 22,
        "user": "rosen",
        "password": "secret",
        "key_path": None,
        "key_passphrase": None,
        "known_hosts": "",
    }
    config.update(overrides)
    return config


@pytest.mark.parametrize(
    "path",
    (
        "j/rosen-archive",
        "/j/rosen-archive",
        "j/rosen-archive/",
    ),
)
def test_ftps_archive_root_accepts_only_the_chrooted_site_path(path):
    assert remote_transfer.validate_archive_root(path, "ftps")


@pytest.mark.parametrize(
    "path",
    (
        "",
        "/",
        "j",
        "wp-content/rosen-archive",
        "j/rosen-archive/data",
        "j/rosen-archive/../wp-admin",
        "_sites/pressthink.org/j/rosen-archive",
    ),
)
def test_ftps_archive_root_rejects_broader_or_ambiguous_paths(path):
    with pytest.raises(ValueError, match="archive root"):
        remote_transfer.validate_archive_root(path, "ftps")


def test_sftp_archive_root_allows_server_prefix_but_requires_archive_suffix():
    assert remote_transfer.validate_archive_root(
        "/home/rosen/public_html/j/rosen-archive", "sftp"
    )
    with pytest.raises(ValueError, match="archive root"):
        remote_transfer.validate_archive_root("/home/rosen/public_html", "sftp")


def test_data_path_must_be_the_archive_data_child():
    assert remote_transfer.validate_archive_data_path("j/rosen-archive/data", "ftps")
    with pytest.raises(ValueError, match="archive data"):
        remote_transfer.validate_archive_data_path("j/rosen-archive", "ftps")


def test_recall_transaction_root_must_be_private_and_outside_the_archive():
    assert (
        remote_transfer.validate_recall_transaction_root(
            "/home/rosen/.rosen-archive-transactions",
            "/home/rosen/public_html/j/rosen-archive",
            "sftp",
        )
        == "/home/rosen/.rosen-archive-transactions"
    )
    assert (
        remote_transfer.validate_recall_transaction_root(
            ".rosen-archive-transactions",
            "j/rosen-archive",
            "ftps",
        )
        == ".rosen-archive-transactions"
    )

    with pytest.raises(ValueError, match="outside the public archive root"):
        remote_transfer.validate_recall_transaction_root(
            "j/rosen-archive/.rosen-archive-transactions",
            "j/rosen-archive",
            "ftps",
        )
    with pytest.raises(ValueError, match="private chroot directory"):
        remote_transfer.validate_recall_transaction_root(
            "private/.rosen-archive-transactions",
            "j/rosen-archive",
            "ftps",
        )
    with pytest.raises(ValueError, match="must be absolute"):
        remote_transfer.validate_recall_transaction_root(
            ".rosen-archive-transactions",
            "/home/rosen/public_html/j/rosen-archive",
            "sftp",
        )


@pytest.mark.parametrize(
    "child",
    ("../wp-admin", "/wp-admin", "assets/../../wp-admin", "assets\\admin", ""),
)
def test_archive_child_join_rejects_scope_escape(child):
    with pytest.raises(ValueError, match="archive child"):
        remote_transfer.scoped_archive_child("j/rosen-archive", child)


def test_archive_child_join_preserves_absolute_sftp_parent():
    assert remote_transfer.scoped_archive_child(
        "/home/rosen/public_html/j/rosen-archive", "assets/app.js"
    ) == "/home/rosen/public_html/j/rosen-archive/assets/app.js"


def test_ftps_connection_requires_password_and_verified_tls():
    with patch.object(remote_transfer.ftplib, "FTP_TLS") as ftp_cls:
        ftp = MagicMock()
        ftp_cls.return_value = ftp

        session = remote_transfer.connect_remote(_config())

    context = ftp_cls.call_args.kwargs["context"]
    assert context.check_hostname is True
    assert context.verify_mode == ssl.CERT_REQUIRED
    assert ftp.method_calls[:4] == [
        call.connect("archive.example.com", 21, timeout=30),
        call.auth(),
        call.login("rosen", "secret"),
        call.prot_p(),
    ]
    session.close()


def test_ftps_rejects_key_only_auth_before_connecting():
    config = _config(password=None, key_path="/tmp/id_ed25519")
    with patch.object(remote_transfer.ftplib, "FTP_TLS") as ftp_cls:
        with pytest.raises(ValueError, match="password"):
            remote_transfer.connect_remote(config)
    ftp_cls.assert_not_called()


def test_ftps_adapter_uploads_reads_lists_and_renames(tmp_path):
    ftp = MagicMock()
    ftp.mlsd.return_value = [
        ("index.html", {"type": "file"}),
        ("assets", {"type": "dir"}),
        (".", {"type": "cdir"}),
    ]

    def retrieve(_command, callback):
        callback(b"archive")

    ftp.retrbinary.side_effect = retrieve
    session = remote_transfer.FTPSRemote(ftp)
    local = tmp_path / "local"
    local.write_bytes(b"payload")

    session.put(str(local), "j/rosen-archive/index.html.tmp")
    session.posix_rename(
        "j/rosen-archive/index.html.tmp",
        "j/rosen-archive/index.html",
    )
    with session.open("j/rosen-archive/index.html", "r") as handle:
        assert handle.read() == b"archive"
    entries = session.listdir_attr("j/rosen-archive")

    uploaded = ftp.storbinary.call_args
    assert uploaded.args[0] == "STOR j/rosen-archive/index.html.tmp"
    assert isinstance(uploaded.args[1], io.BufferedReader)
    ftp.rename.assert_called_once_with(
        "j/rosen-archive/index.html.tmp",
        "j/rosen-archive/index.html",
    )
    assert [(entry.filename, stat.S_IFMT(entry.st_mode)) for entry in entries] == [
        ("index.html", stat.S_IFREG),
        ("assets", stat.S_IFDIR),
    ]


def test_ftps_adapter_marks_symlinks_without_following_them():
    ftp = MagicMock()
    ftp.mlsd.return_value = [
        ("outside", {"type": "OS.unix=symlink"}),
        ("other", {"type": "OS.unix=slink"}),
    ]

    entries = remote_transfer.FTPSRemote(ftp).listdir_attr("j/rosen-archive")

    assert all(stat.S_ISLNK(entry.st_mode) for entry in entries)


def test_ftps_adapter_refuses_to_stat_archive_root_via_parent_listing():
    ftp = MagicMock()
    session = remote_transfer.FTPSRemote(ftp)

    with pytest.raises(ValueError, match="archive root"):
        session.stat("j/rosen-archive")

    ftp.mlsd.assert_not_called()


def test_ftps_rename_error_is_translated_for_atomic_fallback():
    ftp = MagicMock()
    ftp.rename.side_effect = remote_transfer.ftplib.error_perm("550 File exists")
    session = remote_transfer.FTPSRemote(ftp)

    with pytest.raises(OSError):
        session.posix_rename("j/rosen-archive/file.tmp", "j/rosen-archive/file")


@pytest.mark.parametrize("workflow", ("deploy.yml", "submit-record.yml"))
def test_production_workflows_pass_the_protocol_selector(workflow):
    source = (_REPO_ROOT / ".github" / "workflows" / workflow).read_text()

    assert "ROSEN_TRANSFER_PROTOCOL: ${{ secrets.ROSEN_TRANSFER_PROTOCOL }}" in source
    assert 'protocol="${ROSEN_TRANSFER_PROTOCOL:-sftp}"' in source
    assert 'protocol="${protocol,,}"' in source
    assert 'protocol="${protocol//[[:space:]]/}"' in source
    assert 'if [ "$protocol" = "sftp" ]' in source
