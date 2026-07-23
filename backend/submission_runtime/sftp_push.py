# -*- coding: utf-8 -*-
"""Push regenerated JSON files from the local staging dir to pressthink.org.

Authentication is by password (ROSEN_SFTP_PASSWORD) or private key
(ROSEN_SFTP_KEY_PATH, preferred over the password when both are set).
ROSEN_SFTP_KEY_PATH is a path on disk, not a secret: in GitHub Actions the
deploy workflows materialize it from the ROSEN_SFTP_KEY_CONTENT secret in their
"Materialize SFTP private key" step, which writes a 0600 runner-temp file and
exports ROSEN_SFTP_KEY_PATH. Locally it points at your own key file, so there is
no ROSEN_SFTP_KEY_PATH secret to look for.
"""

from __future__ import annotations

import errno
import logging
import os
import tempfile
from pathlib import Path, PurePosixPath
from typing import Any, Dict, Iterable, Optional, Tuple

from .artifacts import DATA_DEPLOY_JSON_FILES
from .config import FTP_STAGING_DIR
from .record_pages import render_record_pages, validate_record_id

logger = logging.getLogger("submission_runtime.sftp_push")

_PUSH_FILES = DATA_DEPLOY_JSON_FILES


def _read_env() -> Optional[Dict[str, Any]]:
    """Return SFTP config from env, or None when required vars are missing."""
    host = os.environ.get("ROSEN_SFTP_HOST", "").strip()
    user = os.environ.get("ROSEN_SFTP_USER", "").strip()
    remote = os.environ.get("ROSEN_SFTP_REMOTE_PATH", "").strip()
    password = os.environ.get("ROSEN_SFTP_PASSWORD", "")
    key_path = os.environ.get("ROSEN_SFTP_KEY_PATH", "").strip()

    if not (host and user and remote and (password or key_path)):
        return None

    try:
        port = int(os.environ.get("ROSEN_SFTP_PORT", "22"))
    except (TypeError, ValueError):
        logger.warning("ROSEN_SFTP_PORT is not an integer; treating as unconfigured")
        return None

    return {
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
    cfg = _read_env()
    if cfg is None:
        logger.warning("SFTP env vars not set — skipping production push")
        return {"ok": True, "skipped": True, "files_pushed": 0, "error": None}

    src_dir = Path(staging_dir) if staging_dir else FTP_STAGING_DIR
    if not src_dir.exists():
        return {
            "ok": False,
            "skipped": False,
            "files_pushed": 0,
            "error": f"Staging dir does not exist: {src_dir}",
        }

    missing = [f for f in _PUSH_FILES if not (src_dir / f).exists()]
    if missing:
        return {
            "ok": False,
            "skipped": False,
            "files_pushed": 0,
            "error": f"Staged files missing: {missing}",
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
        import paramiko
    except ImportError:
        return {
            "ok": False,
            "skipped": False,
            "files_pushed": 0,
            "error": "paramiko not installed",
        }

    pushed = 0
    error = None
    tmp_known_hosts = None
    rendered_shells: Dict[str, str] = {}
    completed = False
    client = paramiko.SSHClient()

    try:
        known_hosts_raw = cfg["known_hosts"]
        known_hosts_path = Path(known_hosts_raw).expanduser()
        if known_hosts_path.is_file():
            client.load_host_keys(str(known_hosts_path))
        elif known_hosts_raw and known_hosts_raw.strip():
            with tempfile.NamedTemporaryFile(
                mode="w",
                delete=False,
                suffix=".known_hosts",
            ) as f:
                f.write(known_hosts_raw)
                if not known_hosts_raw.endswith("\n"):
                    f.write("\n")
                tmp_known_hosts = f.name
            client.load_host_keys(tmp_known_hosts)
        client.set_missing_host_key_policy(paramiko.RejectPolicy())

        connect_kwargs = {
            "hostname": cfg["host"],
            "port": cfg["port"],
            "username": cfg["user"],
            "timeout": 30,
            "allow_agent": False,
            "look_for_keys": False,
        }
        if cfg["key_path"]:
            connect_kwargs["key_filename"] = cfg["key_path"]
            if cfg["key_passphrase"]:
                connect_kwargs["passphrase"] = cfg["key_passphrase"]
        else:
            connect_kwargs["password"] = cfg["password"]

        client.connect(**connect_kwargs)
        sftp = client.open_sftp()
        try:
            if selected_ids:
                live_template = _read_remote_text(sftp, f"{site_path}/index.html")
                rendered_shells = render_record_pages(
                    live_template,
                    src_dir / "archive-data.json",
                    selected_ids,
                )

            for filename in _PUSH_FILES:
                local = src_dir / filename
                remote_final = f"{cfg['remote_path']}/{filename}"
                _atomic_upload(sftp, local, remote_final)
                pushed += 1
                logger.info(f"Pushed {filename} to {cfg['host']}:{remote_final}")

            if selected_ids:
                record_dir = f"{site_path}/r"
                try:
                    sftp.stat(record_dir)
                except IOError as exc:
                    if exc.errno != errno.ENOENT:
                        raise
                    sftp.mkdir(record_dir)

                for record_id in selected_ids:
                    remote_final = f"{record_dir}/{record_id}.html"
                    source = rendered_shells.get(record_id)
                    if source is None:
                        try:
                            sftp.remove(remote_final)
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
                        _atomic_upload(sftp, local_tmp, remote_final)
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
        finally:
            sftp.close()
    except paramiko.SSHException as exc:
        error = f"SSH error: {exc}"
        logger.error(error)
    except (TypeError, ValueError, UnicodeError) as exc:
        error = f"Record shell error: {exc}"
        logger.error(error)
    except (IOError, OSError) as exc:
        error = f"Transfer error: {exc}"
        logger.error(error)
    finally:
        client.close()
        if tmp_known_hosts:
            try:
                os.unlink(tmp_known_hosts)
            except OSError:
                pass

    return {
        "ok": error is None and completed,
        "skipped": False,
        "files_pushed": pushed,
        "error": error,
    }
