# -*- coding: utf-8 -*-
"""Push regenerated JSON files from the local staging dir to pressthink.org.

Reads the four canonical JSON artifacts from ``FTP_STAGING_DIR`` and uploads
each one via SFTP using an atomic write-then-rename so a reader on the live
site never sees a half-written file.

Configuration is env-only. When required vars are missing the push is skipped
rather than failing the batch — this keeps dev environments and CI runs from
needing real credentials.

Required env vars:
    ROSEN_SFTP_HOST        — hostname (e.g. box5683.bluehost.com)
    ROSEN_SFTP_USER        — username
    ROSEN_SFTP_REMOTE_PATH — absolute remote dir (e.g. /home/u/public_html/j/rosen-archive/data)
    one of:
        ROSEN_SFTP_PASSWORD     — password auth
        ROSEN_SFTP_KEY_PATH     — private-key file (preferred)

Optional:
    ROSEN_SFTP_PORT          — default 22
    ROSEN_SFTP_KNOWN_HOSTS   — default ~/.ssh/known_hosts (strict host key check)
    ROSEN_SFTP_KEY_PASSPHRASE — only if ROSEN_SFTP_KEY_PATH is encrypted
"""

from __future__ import annotations

import logging
import os
from pathlib import Path
from typing import Dict, Any, Optional

from .config import FTP_STAGING_DIR

logger = logging.getLogger('submission_server.sftp_push')

# These match the four files _stage_for_ftp() copies. Keep in sync with
# processor.py:_stage_for_ftp — a divergence would silently ship stale JSON.
_PUSH_FILES = (
    'archive-data.json',
    'archive-core.json',
    'archive-details.json',
    'archive-entities.json',
)


def _read_env() -> Optional[Dict[str, Any]]:
    """Return SFTP config from env, or None when required vars are missing."""
    host = os.environ.get('ROSEN_SFTP_HOST', '').strip()
    user = os.environ.get('ROSEN_SFTP_USER', '').strip()
    remote = os.environ.get('ROSEN_SFTP_REMOTE_PATH', '').strip()
    password = os.environ.get('ROSEN_SFTP_PASSWORD', '')
    key_path = os.environ.get('ROSEN_SFTP_KEY_PATH', '').strip()

    if not (host and user and remote and (password or key_path)):
        return None

    return {
        'host': host,
        'port': int(os.environ.get('ROSEN_SFTP_PORT', '22')),
        'user': user,
        'remote_path': remote.rstrip('/'),
        'password': password or None,
        'key_path': key_path or None,
        'key_passphrase': os.environ.get('ROSEN_SFTP_KEY_PASSPHRASE') or None,
        'known_hosts': os.environ.get('ROSEN_SFTP_KNOWN_HOSTS',
                                      str(Path.home() / '.ssh' / 'known_hosts')),
    }


def push_to_production(staging_dir: Optional[Path] = None) -> Dict[str, Any]:
    """Upload all staged JSON files to the live site.

    Returns ``{ok, skipped, files_pushed, error}``. ``ok=True`` and
    ``skipped=True`` together indicate a successful no-op (e.g. dev env with
    no creds set) — callers should treat that as success.
    """
    cfg = _read_env()
    if cfg is None:
        logger.warning("SFTP env vars not set — skipping production push")
        return {'ok': True, 'skipped': True, 'files_pushed': 0, 'error': None}

    src_dir = Path(staging_dir) if staging_dir else FTP_STAGING_DIR
    if not src_dir.exists():
        return {'ok': False, 'skipped': False, 'files_pushed': 0,
                'error': f'Staging dir does not exist: {src_dir}'}

    missing = [f for f in _PUSH_FILES if not (src_dir / f).exists()]
    if missing:
        return {'ok': False, 'skipped': False, 'files_pushed': 0,
                'error': f'Staged files missing: {missing}'}

    try:
        import paramiko
    except ImportError:
        return {'ok': False, 'skipped': False, 'files_pushed': 0,
                'error': 'paramiko not installed'}

    pushed = 0
    error = None
    client = paramiko.SSHClient()

    try:
        # Strict host-key checking. RejectPolicy means an unknown host raises
        # rather than silently trusting whatever's on the other end — required
        # for a writeable production deploy step.
        known_hosts_path = Path(cfg['known_hosts']).expanduser()
        if known_hosts_path.exists():
            client.load_host_keys(str(known_hosts_path))
        client.set_missing_host_key_policy(paramiko.RejectPolicy())

        connect_kwargs = {
            'hostname': cfg['host'],
            'port': cfg['port'],
            'username': cfg['user'],
            'timeout': 30,
            'allow_agent': False,
            'look_for_keys': False,
        }
        if cfg['key_path']:
            connect_kwargs['key_filename'] = cfg['key_path']
            if cfg['key_passphrase']:
                connect_kwargs['passphrase'] = cfg['key_passphrase']
        else:
            connect_kwargs['password'] = cfg['password']

        client.connect(**connect_kwargs)
        sftp = client.open_sftp()
        try:
            for filename in _PUSH_FILES:
                local = src_dir / filename
                remote_final = f"{cfg['remote_path']}/{filename}"
                remote_tmp = f"{remote_final}.tmp"
                sftp.put(str(local), remote_tmp)
                # POSIX rename is atomic — readers see either old or new, never
                # half-written. paramiko's posix_rename forces the semantics.
                try:
                    sftp.posix_rename(remote_tmp, remote_final)
                except (IOError, AttributeError):
                    # Older SFTP servers don't expose posix-rename@openssh.com;
                    # fall back to plain rename, removing the existing target
                    # first since SFTP rename requires the destination be absent.
                    try:
                        sftp.remove(remote_final)
                    except IOError:
                        pass
                    sftp.rename(remote_tmp, remote_final)
                pushed += 1
                logger.info(f"Pushed {filename} to {cfg['host']}:{remote_final}")
        finally:
            sftp.close()
    except paramiko.SSHException as exc:
        error = f'SSH error: {exc}'
        logger.error(error)
    except (IOError, OSError) as exc:
        error = f'Transfer error: {exc}'
        logger.error(error)
    finally:
        client.close()

    return {
        'ok': error is None and pushed == len(_PUSH_FILES),
        'skipped': False,
        'files_pushed': pushed,
        'error': error,
    }
