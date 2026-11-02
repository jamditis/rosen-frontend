# -*- coding: utf-8 -*-
"""Push regenerated JSON files from staging to pressthink.org.

The legacy module name remains for callers, while the shared remote adapter
supports certificate-verified explicit FTPS and strict-known-host SFTP.
Authentication is by password (ROSEN_SFTP_PASSWORD) or, for SFTP, private key
(ROSEN_SFTP_KEY_PATH, preferred over the password when both are set).
ROSEN_SFTP_KEY_PATH is a path on disk, not a secret: in GitHub Actions the
deploy workflows materialize it from the ROSEN_SFTP_KEY_CONTENT secret in their
"Materialize SFTP private key" step, which writes a 0600 runner-temp file and
exports ROSEN_SFTP_KEY_PATH. Locally it points at your own key file, so there is
no ROSEN_SFTP_KEY_PATH secret to look for.
"""

from __future__ import annotations

import errno
import hashlib
import logging
import os
import tempfile
import time
import uuid
from pathlib import Path, PurePosixPath
from typing import Any, Dict, Iterable, Optional, Tuple

import requests

from .artifacts import DATA_DEPLOY_JSON_FILES, data_deploy_files
from .config import FTP_STAGING_DIR
from .record_pages import render_record_pages, validate_record_id
from . import remote_transfer

logger = logging.getLogger("submission_runtime.sftp_push")

_PUSH_FILES = DATA_DEPLOY_JSON_FILES
_LIVE_SITE_ROOT = "https://pressthink.org/j/rosen-archive/"


def _verify_live(artifacts):
    """Require exact public bytes before a submission can be marked live."""
    # Match the full-site verifier's bounded allowance for origin/edge lag.
    for relative_path, expected in artifacts.items():
        for attempt in range(6):
            try:
                _verify_public_artifact(relative_path, expected)
                break
            except (requests.RequestException, RuntimeError):
                if attempt == 5:
                    raise
                time.sleep(15)


def _verify_public_artifact(relative_path, expected):
    url = _LIVE_SITE_ROOT + relative_path
    with requests.get(
        url,
        params={"deploy_verify": uuid.uuid4().hex},
        headers={"Cache-Control": "no-cache", "Accept-Encoding": "identity"},
        timeout=(10, 30),
        allow_redirects=False,
        stream=True,
    ) as response:
        if response.status_code != 200:
            raise RuntimeError(f"{relative_path}: HTTP {response.status_code}")
        digest = hashlib.sha256()
        size = 0
        for block in response.iter_content(256 * 1024):
            size += len(block)
            if size > len(expected):
                raise RuntimeError(f"{relative_path}: public response is larger")
            digest.update(block)
        if (
            size != len(expected)
            or digest.digest() != hashlib.sha256(expected).digest()
        ):
            raise RuntimeError(f"{relative_path}: public bytes differ")


class TransferConfigurationError(ValueError):
    """A present transfer setting is invalid and must fail the push."""


class _RemoteConnectionError(RuntimeError):
    """Keep connection configuration failures out of record-render errors."""


def _read_env() -> Optional[Dict[str, Any]]:
    """Return transfer config from env, or None when required vars are missing."""
    host = os.environ.get("ROSEN_SFTP_HOST", "").strip()
    user = os.environ.get("ROSEN_SFTP_USER", "").strip()
    remote = os.environ.get("ROSEN_SFTP_REMOTE_PATH", "").strip()
    password = os.environ.get("ROSEN_SFTP_PASSWORD", "")
    key_path = os.environ.get("ROSEN_SFTP_KEY_PATH", "").strip()
    try:
        protocol = remote_transfer.normalize_protocol(
            os.environ.get("ROSEN_TRANSFER_PROTOCOL", "sftp")
        )
    except ValueError as exc:
        raise TransferConfigurationError(str(exc)) from exc

    if protocol == "ftps" and host and user and remote and key_path and not password:
        raise TransferConfigurationError(
            "FTPS requires ROSEN_SFTP_PASSWORD; private keys are SFTP-only"
        )

    has_auth = bool(password) if protocol == "ftps" else bool(password or key_path)
    if not (host and user and remote and has_auth):
        return None

    try:
        default_port = "21" if protocol == "ftps" else "22"
        port = int(os.environ.get("ROSEN_SFTP_PORT") or default_port)
    except (TypeError, ValueError) as exc:
        raise TransferConfigurationError("ROSEN_SFTP_PORT must be an integer") from exc

    return {
        "protocol": protocol,
        "host": host,
        "port": port,
        "user": user,
        "remote_path": remote.rstrip("/"),
        "password": password or None,
        "key_path": key_path or None,
        "key_passphrase": os.environ.get("ROSEN_SFTP_KEY_PASSPHRASE") or None,
        "known_hosts": os.environ.get(
            "ROSEN_SFTP_KNOWN_HOSTS", str(Path.home() / ".ssh" / "known_hosts")
        ),
    }


def _atomic_upload(sftp, local: Path, remote_final: str) -> None:
    """Upload one path via a temporary sibling and atomic rename."""
    remote_tmp = f"{remote_final}.tmp"
    sftp.put(str(local), remote_tmp)
    try:
        sftp.posix_rename(remote_tmp, remote_final)
    except (IOError, AttributeError):
        try:
            sftp.remove(remote_final)
        except IOError:
            pass
        sftp.rename(remote_tmp, remote_final)


def _record_site_path(remote_path: str) -> Optional[str]:
    """Return the fixed site-root parent only for the configured data dir."""
    path = PurePosixPath(remote_path)
    if path.name != "data":
        return None
    return path.parent.as_posix().rstrip("/")


def _read_remote_text(sftp, remote_path: str) -> str:
    with sftp.open(remote_path, "r") as remote_file:
        source = remote_file.read()
    if isinstance(source, bytes):
        return source.decode("utf-8")
    return str(source)


def push_to_production(
    staging_dir: Optional[Path] = None,
    record_ids: Iterable[str] = (),
) -> Dict[str, Any]:
    """Upload staged JSON, followed by the affected record metadata shells."""
    try:
        cfg = _read_env()
    except TransferConfigurationError as exc:
        logger.error(str(exc))
        return {
            "ok": False,
            "skipped": False,
            "files_pushed": 0,
            "error": str(exc),
        }
    if cfg is None:
        logger.warning("Transfer env vars not set — skipping production push")
        return {"ok": True, "skipped": True, "files_pushed": 0, "error": None}

    src_dir = Path(staging_dir) if staging_dir else FTP_STAGING_DIR
    if not src_dir.exists():
        return {
            "ok": False,
            "skipped": False,
            "files_pushed": 0,
            "error": f"Staging dir does not exist: {src_dir}",
        }

    try:
        push_files = data_deploy_files(src_dir)
    except ValueError as exc:
        return {
            "ok": False,
            "skipped": False,
            "files_pushed": 0,
            "error": str(exc),
        }

    try:
        selected_ids: Tuple[str, ...] = tuple(
            dict.fromkeys(validate_record_id(record_id) for record_id in record_ids)
        )
    except ValueError as exc:
        return {
            "ok": False,
            "skipped": False,
            "files_pushed": 0,
            "error": str(exc),
        }
    site_path = _record_site_path(cfg["remote_path"]) if selected_ids else None
    if selected_ids and not site_path:
        return {
            "ok": False,
            "skipped": False,
            "files_pushed": 0,
            "error": (
                "Record shell deployment requires ROSEN_SFTP_REMOTE_PATH "
                "to name the site's data directory"
            ),
        }

    try:
        cfg["remote_path"] = remote_transfer.validate_archive_data_path(
            cfg["remote_path"], cfg.get("protocol", "sftp")
        )
    except ValueError as exc:
        return {
            "ok": False,
            "skipped": False,
            "files_pushed": 0,
            "error": str(exc),
        }
    site_path = _record_site_path(cfg["remote_path"]) if selected_ids else None

    pushed = 0
    error = None
    rendered_shells: Dict[str, str] = {}
    completed = False
    remote = None
    live_artifacts = {}

    try:
        try:
            remote = remote_transfer.connect_remote(cfg)
        except (TypeError, ValueError, UnicodeError) as exc:
            raise _RemoteConnectionError(str(exc)) from exc
        if selected_ids:
            live_template = _read_remote_text(
                remote,
                remote_transfer.scoped_archive_child(site_path, "index.html"),
            )
            rendered_shells = render_record_pages(
                live_template,
                src_dir / "archive-data.json",
                selected_ids,
            )

        for filename in push_files:
            local = src_dir / filename
            remote_final = remote_transfer.scoped_archive_child(
                cfg["remote_path"], filename
            )
            parent = PurePosixPath(remote_final).parent
            missing_parents = []
            while parent.as_posix() != cfg["remote_path"]:
                try:
                    remote.stat(parent.as_posix())
                    break
                except IOError as exc:
                    if exc.errno != errno.ENOENT:
                        raise
                    missing_parents.append(parent.as_posix())
                    parent = parent.parent
            for directory in reversed(missing_parents):
                remote.mkdir(directory)
            _atomic_upload(remote, local, remote_final)
            live_artifacts["data/" + filename] = local.read_bytes()
            pushed += 1
            logger.info(f"Pushed {filename} to {cfg['host']}:{remote_final}")

        if selected_ids:
            record_dir = remote_transfer.scoped_archive_child(site_path, "r")
            try:
                remote.stat(record_dir)
            except IOError as exc:
                if exc.errno != errno.ENOENT:
                    raise
                remote.mkdir(record_dir)

            for record_id in selected_ids:
                remote_final = remote_transfer.scoped_archive_child(
                    record_dir, f"{record_id}.html"
                )
                source = rendered_shells.get(record_id)
                if source is None:
                    try:
                        remote.remove(remote_final)
                    except IOError as exc:
                        if exc.errno != errno.ENOENT:
                            raise
                    continue
                local_tmp = None
                try:
                    with tempfile.NamedTemporaryFile(
                        mode="w",
                        encoding="utf-8",
                        delete=False,
                        suffix=".html",
                    ) as handle:
                        handle.write(source)
                        local_tmp = Path(handle.name)
                    _atomic_upload(remote, local_tmp, remote_final)
                    live_artifacts[f"r/{record_id}.html"] = source.encode("utf-8")
                    pushed += 1
                    logger.info(
                        f"Pushed record shell {record_id} to "
                        f"{cfg['host']}:{remote_final}"
                    )
                finally:
                    if local_tmp is not None:
                        try:
                            local_tmp.unlink()
                        except OSError:
                            pass
        completed = True
    except _RemoteConnectionError as exc:
        error = f"Transfer error: {exc}"
        logger.error(error)
    except (TypeError, ValueError, UnicodeError) as exc:
        error = f"Record shell error: {exc}"
        logger.error(error)
    except Exception as exc:
        error = f"Transfer error: {exc}"
        logger.error(error)
    finally:
        if remote is not None:
            remote.close()

    if completed and error is None:
        try:
            _verify_live(live_artifacts)
        except Exception as exc:
            error = f"Live verification failed: {exc}"

    return {
        "ok": error is None and completed,
        "skipped": False,
        "files_pushed": pushed,
        "error": error,
    }
