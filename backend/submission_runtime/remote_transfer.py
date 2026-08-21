# -*- coding: utf-8 -*-
"""Verified remote transport for Rosen archive deployments.

Both supported protocols expose the small SFTP-shaped interface used by the
full-site and per-record publishers. FTPS uses the Python standard library with
certificate and data-channel verification; SFTP retains Paramiko's strict
known-host policy.
"""

from __future__ import annotations

import errno
import ftplib
import io
import os
import ssl
import stat
import tempfile
from pathlib import Path
from types import SimpleNamespace
from typing import Any, Dict, Tuple

_ARCHIVE_ROOT_PARTS = ("j", "rosen-archive")
_ARCHIVE_DATA_PARTS = (*_ARCHIVE_ROOT_PARTS, "data")
_RECALL_TRANSACTION_DIRNAME = ".rosen-archive-transactions"
_PROTOCOLS = frozenset({"sftp", "ftps"})


def normalize_protocol(value: str) -> str:
    """Return a supported lower-case transfer protocol."""
    protocol = (value or "sftp").strip().lower()
    if protocol not in _PROTOCOLS:
        raise ValueError("ROSEN_TRANSFER_PROTOCOL must be sftp or ftps")
    return protocol


def _validated_parts(remote_path: str) -> Tuple[str, ...]:
    raw = (remote_path or "").strip()
    if not raw or "\x00" in raw or "\\" in raw:
        raise ValueError("remote path is empty or malformed")
    parts = tuple(raw.strip("/").split("/"))
    if not parts or any(part in {"", ".", ".."} for part in parts):
        raise ValueError("remote path contains an unsafe segment")
    return parts


def _validate_archive_path(
    remote_path: str,
    protocol: str,
    expected_parts: Tuple[str, ...],
    label: str,
) -> str:
    protocol = normalize_protocol(protocol)
    try:
        parts = _validated_parts(remote_path)
    except ValueError as exc:
        raise ValueError(f"{label} is not safely scoped: {exc}") from exc

    if protocol == "ftps":
        valid = parts == expected_parts
    else:
        valid = (
            len(parts) >= len(expected_parts)
            and parts[-len(expected_parts) :] == expected_parts
        )
    if not valid:
        expected = "/".join(expected_parts)
        raise ValueError(f"{label} must resolve to {expected}")

    normalized = "/".join(parts)
    if protocol == "sftp" and remote_path.strip().startswith("/"):
        return f"/{normalized}"
    return normalized


def validate_archive_root(remote_path: str, protocol: str) -> str:
    """Validate and normalize the full-site archive root."""
    return _validate_archive_path(
        remote_path,
        protocol,
        _ARCHIVE_ROOT_PARTS,
        "archive root",
    )


def validate_archive_data_path(remote_path: str, protocol: str) -> str:
    """Validate and normalize the per-record data destination."""
    return _validate_archive_path(
        remote_path,
        protocol,
        _ARCHIVE_DATA_PARTS,
        "archive data path",
    )


def validate_recall_transaction_root(
    remote_path: str,
    archive_root: str,
    protocol: str,
) -> str:
    """Validate the private remote directory used for recall rollback state."""
    protocol = normalize_protocol(protocol)
    archive_root = validate_archive_root(archive_root, protocol)
    try:
        parts = _validated_parts(remote_path)
    except ValueError as exc:
        raise ValueError(
            f"recall transaction root is not safely scoped: {exc}"
        ) from exc

    archive_parts = _validated_parts(archive_root)
    if parts[-1] != _RECALL_TRANSACTION_DIRNAME:
        raise ValueError(
            "recall transaction root must end in " f"{_RECALL_TRANSACTION_DIRNAME}"
        )
    if parts[: len(archive_parts)] == archive_parts:
        raise ValueError(
            "recall transaction root must be outside the public archive root"
        )
    if protocol == "sftp" and not remote_path.strip().startswith("/"):
        raise ValueError("SFTP recall transaction root must be absolute")
    if protocol == "ftps" and parts != (_RECALL_TRANSACTION_DIRNAME,):
        raise ValueError(
            "FTPS recall transaction root must be the private chroot directory "
            f"{_RECALL_TRANSACTION_DIRNAME}"
        )

    normalized = "/".join(parts)
    if protocol == "sftp" and remote_path.strip().startswith("/"):
        return f"/{normalized}"
    return normalized


def scoped_archive_child(parent: str, relative_path: str) -> str:
    """Join a validated archive parent to one safe relative child path."""
    raw_child = (relative_path or "").strip()
    if raw_child.startswith("/"):
        raise ValueError("archive child path must be relative")
    try:
        child_parts = _validated_parts(raw_child)
    except ValueError as exc:
        raise ValueError(f"archive child path is not safely scoped: {exc}") from exc
    return f"{parent.rstrip('/')}/{'/'.join(child_parts)}"


def _ftp_error(exc: ftplib.error_perm, remote_path: str) -> OSError:
    message = str(exc)
    lowered = message.lower()
    if message.startswith("550") and any(
        marker in lowered for marker in ("no such", "not found", "failed to open")
    ):
        return FileNotFoundError(errno.ENOENT, message, remote_path)
    if message.startswith("550") and "permission" in lowered:
        return PermissionError(errno.EACCES, message, remote_path)
    return OSError(errno.EIO, message, remote_path)


class FTPSRemote:
    """SFTP-shaped adapter over an explicit, certificate-verified FTPS session."""

    def __init__(self, ftp: ftplib.FTP_TLS):
        self._ftp = ftp

    def put(self, local_path: str, remote_path: str) -> None:
        with open(local_path, "rb") as source:
            self._ftp.storbinary(f"STOR {remote_path}", source)

    def posix_rename(self, source: str, destination: str) -> None:
        self.rename(source, destination)

    def rename(self, source: str, destination: str) -> None:
        try:
            self._ftp.rename(source, destination)
        except ftplib.error_perm as exc:
            raise _ftp_error(exc, destination) from exc

    def remove(self, remote_path: str) -> None:
        try:
            self._ftp.delete(remote_path)
        except ftplib.error_perm as exc:
            raise _ftp_error(exc, remote_path) from exc

    def mkdir(self, remote_path: str) -> None:
        try:
            self._ftp.mkd(remote_path)
        except ftplib.error_perm as exc:
            raise _ftp_error(exc, remote_path) from exc

    def rmdir(self, remote_path: str) -> None:
        try:
            self._ftp.rmd(remote_path)
        except ftplib.error_perm as exc:
            raise _ftp_error(exc, remote_path) from exc

    def listdir_attr(self, remote_path: str):
        entries = []
        try:
            listing = self._ftp.mlsd(remote_path)
            for filename, facts in listing:
                entry_type = facts.get("type", "").lower()
                if entry_type in {"cdir", "pdir"}:
                    continue
                if entry_type == "dir":
                    mode = stat.S_IFDIR
                elif "symlink" in entry_type or entry_type.endswith("=slink"):
                    mode = stat.S_IFLNK
                else:
                    mode = stat.S_IFREG
                entries.append(SimpleNamespace(filename=filename, st_mode=mode))
        except ftplib.error_perm as exc:
            raise _ftp_error(exc, remote_path) from exc
        return entries

    def stat(self, remote_path: str):
        normalized = remote_path.rstrip("/")
        if tuple(normalized.strip("/").split("/")) == _ARCHIVE_ROOT_PARTS:
            raise ValueError("archive root cannot be statted via its parent")
        parent, _, filename = normalized.rpartition("/")
        parent = parent or "."
        for entry in self.listdir_attr(parent):
            if entry.filename == filename:
                return entry
        raise FileNotFoundError(errno.ENOENT, "remote path not found", remote_path)

    def open(self, remote_path: str, mode: str = "r"):
        if mode not in {"r", "rb"}:
            raise ValueError("FTPS remote files are opened read-only")
        destination = io.BytesIO()
        try:
            self._ftp.retrbinary(f"RETR {remote_path}", destination.write)
        except ftplib.error_perm as exc:
            raise _ftp_error(exc, remote_path) from exc
        destination.seek(0)
        return destination

    def close(self) -> None:
        try:
            self._ftp.quit()
        except (OSError, EOFError, ftplib.Error):
            self._ftp.close()


class SFTPRemote:
    """Own a Paramiko client and proxy the SFTP methods publishers use."""

    def __init__(self, client, sftp, temporary_known_hosts: str | None = None):
        self._client = client
        self._sftp = sftp
        self._temporary_known_hosts = temporary_known_hosts

    def __getattr__(self, name: str):
        return getattr(self._sftp, name)

    def close(self) -> None:
        try:
            self._sftp.close()
        finally:
            self._client.close()
            if self._temporary_known_hosts:
                try:
                    os.unlink(self._temporary_known_hosts)
                except OSError:
                    pass


def _connect_sftp(config: Dict[str, Any]):
    try:
        import paramiko
    except ImportError as exc:
        raise RuntimeError("paramiko not installed") from exc

    client = paramiko.SSHClient()
    temporary_known_hosts = None
    try:
        known_hosts_raw = config.get("known_hosts") or ""
        known_hosts_path = Path(known_hosts_raw).expanduser()
        if known_hosts_path.is_file():
            client.load_host_keys(str(known_hosts_path))
        elif known_hosts_raw.strip():
            with tempfile.NamedTemporaryFile(
                mode="w",
                delete=False,
                suffix=".known_hosts",
            ) as handle:
                handle.write(known_hosts_raw)
                if not known_hosts_raw.endswith("\n"):
                    handle.write("\n")
                temporary_known_hosts = handle.name
            client.load_host_keys(temporary_known_hosts)
        client.set_missing_host_key_policy(paramiko.RejectPolicy())

        connect_kwargs = {
            "hostname": config["host"],
            "port": config["port"],
            "username": config["user"],
            "timeout": 30,
            "allow_agent": False,
            "look_for_keys": False,
        }
        if config.get("key_path"):
            connect_kwargs["key_filename"] = config["key_path"]
            if config.get("key_passphrase"):
                connect_kwargs["passphrase"] = config["key_passphrase"]
        elif config.get("password"):
            connect_kwargs["password"] = config["password"]
        else:
            raise ValueError("SFTP requires a password or private key")

        client.connect(**connect_kwargs)
        return SFTPRemote(client, client.open_sftp(), temporary_known_hosts)
    except Exception:
        client.close()
        if temporary_known_hosts:
            try:
                os.unlink(temporary_known_hosts)
            except OSError:
                pass
        raise


def _connect_ftps(config: Dict[str, Any]):
    password = config.get("password")
    if not password:
        raise ValueError("FTPS requires password authentication")
    context = ssl.create_default_context()
    ftp = ftplib.FTP_TLS(context=context)
    try:
        ftp.connect(config["host"], config["port"], timeout=30)
        ftp.auth()
        ftp.login(config["user"], password)
        ftp.prot_p()
        return FTPSRemote(ftp)
    except Exception:
        ftp.close()
        raise


def connect_remote(config: Dict[str, Any]):
    """Open the configured verified remote transport."""
    protocol = normalize_protocol(config.get("protocol", "sftp"))
    if protocol == "ftps":
        return _connect_ftps(config)
    return _connect_sftp(config)
