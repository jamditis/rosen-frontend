#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Pillar 3c full-site SFTP deploy.

Invoked from `.github/workflows/deploy.yml` on workflow_dispatch. Walks the
hardcoded manifest below, uploads every file via paramiko SFTP with an
atomic .tmp+posix_rename, and aborts on the first transfer failure (a
partial deploy is worse than no deploy — half the page would resolve to
v3.4.0 imports while the other half stayed on v3.3.0, pinning visitors
into a broken half-updated state).

Two distinct env vars on purpose:
  - ROSEN_SFTP_REMOTE_PATH → the per-record `submit-record.yml` data dir
    (.../j/rosen-archive/data)
  - ROSEN_SFTP_SITE_PATH → THIS workflow's site root
    (.../j/rosen-archive)
Separate names so a misconfigured per-record workflow can't accidentally
overwrite anything outside data/.

Manifest mirrors DEPLOYMENT.md "Files to deploy". A pytest checks both
directions: every entry must exist on disk, and DEPLOYMENT.md's top-level
list must all appear here.

Usage::

    python backend/scripts/deploy_full_site.py [--dry-run]

Exit codes:
    0 — success, or --dry-run completed
    1 — transfer failed (partial deploy aborted)
    2 — required env vars missing
"""
from __future__ import annotations

import argparse
import logging
import os
import sys
from pathlib import Path
from typing import Any, Dict, Iterable, List, Optional, Set, Tuple

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s %(levelname)s %(message)s',
)
logger = logging.getLogger('deploy_full_site')


# ---------- Manifest --------------------------------------------------------

# Mirrors DEPLOYMENT.md "Files to deploy". Drift-checked by
# backend/tests/test_deploy_full_site.py::TestDeploymentMdAlignment.

_DEPLOY_FILES: Tuple[str, ...] = (
    'index.html',
    'favicon.ico',
    'shared-styles.css',
    'version.json',
    'metadata.json',
    '.htaccess',
    'ADDING-RECORDS.md',
)

_DEPLOY_DIRS: Tuple[str, ...] = (
    'frontend',
    'dissertation',
    'faq',
    'dissertation-launch',
    'features/shared',
    'features/status-report',
    'tools/active/dataexplorer',
    'tools/active/dataviz',
    'data/feeds',
)

_DEPLOY_DATA_FILES: Tuple[str, ...] = (
    'data/archive-core.json',
    'data/archive-data.json',
    'data/archive-details.json',
    'data/archive-entities.json',
    'data/archive-analytics.json',
    'data/search-index.json',  # prebuilt MiniSearch full-text index, loaded lazily on first search, issue 276
    'data/wiki-seed.json',
    'data/schema.json',  # data dictionary; linked from the open-data download UI
)

# Walking _DEPLOY_DIRS, prune these.
_EXCLUDE_NAMES: frozenset = frozenset({'__pycache__', '.DS_Store', '.gitkeep'})
_EXCLUDE_SUFFIXES: Tuple[str, ...] = ('.pyc', '.test.js', '.spec.js', '.csv')

# Entry-point files that must upload AFTER everything else they reference.
# Atomic per-file rename protects each file individually, but cross-file
# consistency needs ordering: a visitor mid-deploy must never load a new
# index.html pointing at ?v=3.4.0/App.js while App.js is still serving v3.3.0
# content. CDNs will cache the stale-under-new-URL pair until TTL expiry.
#
# Order within the tuple is earliest-flips-first:
#   index.html      — the page itself. It flips first in this group; the JS/CSS
#     bundle it references already uploaded in the dir walk above, so index.html
#     plus that bundle are all live before sw.js flips.
#   frontend/sw.js  — flips AFTER index.html. On install the worker PRECACHES
#     index.html and the JS/CSS bundle (cache.add) and then serves .html/.js/.css
#     cache-first, so it snapshots whatever is live at install time. If sw.js
#     flipped first, a client that registered the new worker before index.html
#     renamed would precache the OLD index.html and pin it under the new
#     CACHE_VERSION until the next deploy. Flipping sw.js last among precached
#     files makes the new worker snapshot an all-new tree — that is what its
#     CACHE_VERSION bump fixes (the #430 stale-deploy class) without trading it
#     for a stale-HTML pin.
#   version.json    — the refresh signal; not precached (served network-first),
#     so it flips LAST as the least-harmful stale state: a client racing the
#     final rename pins the old version.json (a missed update nudge) rather than
#     any asset the worker would cache.
_ENTRY_POINTS: Tuple[str, ...] = ('index.html', 'frontend/sw.js', 'version.json')


# ---------- Config ----------------------------------------------------------

def _read_env() -> Optional[Dict[str, Any]]:
    """Return SFTP config from env, or None when required vars are missing.

    Mirrors backend/submission_server/sftp_push.py:_read_env but reads
    ROSEN_SFTP_SITE_PATH (the full-site root) instead of the data-only
    ROSEN_SFTP_REMOTE_PATH.
    """
    host = os.environ.get('ROSEN_SFTP_HOST', '').strip()
    user = os.environ.get('ROSEN_SFTP_USER', '').strip()
    site_path = os.environ.get('ROSEN_SFTP_SITE_PATH', '').strip()
    password = os.environ.get('ROSEN_SFTP_PASSWORD', '')
    key_path = os.environ.get('ROSEN_SFTP_KEY_PATH', '').strip()

    if not (host and user and site_path and (password or key_path)):
        return None

    try:
        port = int(os.environ.get('ROSEN_SFTP_PORT', '22'))
    except (TypeError, ValueError):
        logger.warning("ROSEN_SFTP_PORT is not an integer; treating as unconfigured")
        return None

    return {
        'host': host,
        'port': port,
        'user': user,
        'site_path': site_path.rstrip('/'),
        'password': password or None,
        'key_path': key_path or None,
        'key_passphrase': os.environ.get('ROSEN_SFTP_KEY_PASSPHRASE') or None,
        'known_hosts': os.environ.get(
            'ROSEN_SFTP_KNOWN_HOSTS',
            str(Path.home() / '.ssh' / 'known_hosts')),
    }


# ---------- File collection -------------------------------------------------

def _is_excluded(path: Path) -> bool:
    if path.name in _EXCLUDE_NAMES:
        return True
    for suffix in _EXCLUDE_SUFFIXES:
        if path.name.endswith(suffix):
            return True
    return False


def collect_local_files(
    repo_root: Path,
    top_files: Iterable[str] = _DEPLOY_FILES,
    dirs: Iterable[str] = _DEPLOY_DIRS,
    data_files: Iterable[str] = _DEPLOY_DATA_FILES,
    entry_points: Iterable[str] = _ENTRY_POINTS,
) -> List[Path]:
    """Walk the manifest and return every file to upload, ordered so that
    entry-point files (index.html, frontend/sw.js, version.json) come LAST.

    Skips entries that don't exist on disk (the existence tests catch
    those at PR time — at deploy time we keep going so a missing optional
    file doesn't block the rest of the push).

    The entry-points-last ordering is the cross-file consistency hinge for
    version-bump deploys: see the _ENTRY_POINTS comment for why.
    """
    files: List[Path] = []
    seen: Set[Path] = set()
    entry_set = set(entry_points)

    def _add(p: Path) -> None:
        rp = p.resolve()
        if rp not in seen:
            seen.add(rp)
            files.append(p)

    # First: every top-level deploy file EXCEPT entry points.
    for relpath in top_files:
        if relpath in entry_set:
            continue
        p = repo_root / relpath
        if p.is_file():
            _add(p)

    for relpath in dirs:
        d = repo_root / relpath
        if not d.is_dir():
            continue
        for sub in sorted(d.rglob('*')):
            if sub.is_file() and not _is_excluded(sub):
                # Also prune anything under an excluded-dir name anywhere
                # in the path (e.g. frontend/foo/__pycache__/bar.pyc).
                if any(part in _EXCLUDE_NAMES for part in sub.parts):
                    continue
                # Entry points living inside a walked dir (e.g. frontend/sw.js)
                # are appended LAST for cross-file consistency; skip them here so
                # _add()'s dedup doesn't pin them to this early walk position.
                if sub.relative_to(repo_root).as_posix() in entry_set:
                    continue
                _add(sub)

    for relpath in data_files:
        p = repo_root / relpath
        if p.is_file():
            _add(p)

    # LAST: entry points, in the order declared.
    for relpath in entry_points:
        p = repo_root / relpath
        if p.is_file():
            _add(p)

    return files


# ---------- SFTP upload -----------------------------------------------------

def _ensure_remote_dir(sftp, remote_dir: str, cache: Set[str]) -> None:
    """SFTP `mkdir -p`. Walks remote_dir segment by segment, creating
    missing dirs. Caches successful dirs so the next 50 files in the
    same dir don't re-stat it 50 times."""
    if remote_dir in cache or remote_dir in ('', '/'):
        return
    parent = remote_dir.rsplit('/', 1)[0]
    if parent and parent != remote_dir:
        _ensure_remote_dir(sftp, parent, cache)
    try:
        sftp.stat(remote_dir)
    except IOError:
        try:
            sftp.mkdir(remote_dir)
        except IOError as exc:
            # Race or already-exists: re-stat to confirm and move on.
            try:
                sftp.stat(remote_dir)
            except IOError:
                raise exc
    cache.add(remote_dir)


def push_files(
    files: List[Path],
    repo_root: Path,
    cfg: Dict[str, Any],
) -> Dict[str, Any]:
    """Upload every file via .tmp + posix_rename. Aborts on first error.

    Returns {ok, files_pushed, error}. The atomic-rename guarantee mirrors
    backend/submission_server/sftp_push.py — readers on the live site
    never see a half-written file.
    """
    try:
        import paramiko
    except ImportError:
        return {'ok': False, 'files_pushed': 0,
                'error': 'paramiko not installed'}

    pushed = 0
    error: Optional[str] = None
    dir_cache: Set[str] = set()
    tmp_known_hosts: Optional[str] = None
    client = paramiko.SSHClient()

    try:
        # The ROSEN_SFTP_KNOWN_HOSTS secret can hold either a path on disk
        # OR the raw host-key content. Disambiguation: if the value resolves
        # to an existing file, treat it as a path; otherwise (any non-empty
        # value) treat it as raw content and materialize to a tempfile so
        # paramiko can load it. The is_file/content split avoids an
        # algorithm allowlist — OpenSSH supports ssh-rsa, ssh-ed25519,
        # ssh-dss, ecdsa-sha2-nistp{256,384,521}, hashed-host '|1|', plus
        # whatever ships next — and a malformed content blob will raise
        # cleanly from load_host_keys rather than failing later under
        # RejectPolicy. Sibling backend/submission_server/sftp_push.py
        # has the older path-only pattern; see follow-up issue for backport.
        known_hosts_raw = cfg['known_hosts']
        known_hosts_path = Path(known_hosts_raw).expanduser()
        if known_hosts_path.is_file():
            client.load_host_keys(str(known_hosts_path))
        elif known_hosts_raw and known_hosts_raw.strip():
            import tempfile
            with tempfile.NamedTemporaryFile(
                mode='w', delete=False, suffix='.known_hosts',
            ) as f:
                f.write(known_hosts_raw)
                if not known_hosts_raw.endswith('\n'):
                    f.write('\n')
                tmp_known_hosts = f.name
            client.load_host_keys(tmp_known_hosts)
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
            for local in files:
                rel = local.relative_to(repo_root).as_posix()
                remote_final = f"{cfg['site_path']}/{rel}"
                remote_tmp = f"{remote_final}.tmp"
                remote_dir = remote_final.rsplit('/', 1)[0]
                _ensure_remote_dir(sftp, remote_dir, dir_cache)
                sftp.put(str(local), remote_tmp)
                try:
                    sftp.posix_rename(remote_tmp, remote_final)
                except (IOError, AttributeError):
                    try:
                        sftp.remove(remote_final)
                    except IOError:
                        pass
                    sftp.rename(remote_tmp, remote_final)
                pushed += 1
                if pushed % 25 == 0 or pushed == len(files):
                    logger.info(f"Pushed {pushed}/{len(files)} files")
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
        if tmp_known_hosts:
            try:
                os.unlink(tmp_known_hosts)
            except OSError:
                pass

    return {
        'ok': error is None and pushed == len(files),
        'files_pushed': pushed,
        'error': error,
    }


# ---------- CLI -------------------------------------------------------------

def main(argv: Optional[List[str]] = None) -> int:
    parser = argparse.ArgumentParser(
        description='Push the full Jay Rosen archive site to pressthink.org via SFTP.',
    )
    parser.add_argument(
        '--dry-run',
        action='store_true',
        default=False,
        help='Print the file list and exit without connecting',
    )
    parser.add_argument(
        '--repo-root',
        default=None,
        help='Override repo root (defaults to the path two parents up from this script)',
    )
    args = parser.parse_args(argv)

    if args.repo_root:
        repo_root = Path(args.repo_root).resolve()
    else:
        repo_root = Path(__file__).resolve().parents[2]

    files = collect_local_files(repo_root)

    if args.dry_run:
        print(f"dry-run: would upload {len(files)} files from {repo_root}")
        for f in files:
            print(f"  {f.relative_to(repo_root).as_posix()}")
        return 0

    cfg = _read_env()
    if cfg is None:
        print(
            'error: required SFTP env vars missing — set ROSEN_SFTP_HOST, '
            'ROSEN_SFTP_USER, ROSEN_SFTP_SITE_PATH, and either '
            'ROSEN_SFTP_PASSWORD or ROSEN_SFTP_KEY_PATH',
            file=sys.stderr,
        )
        return 2

    logger.info(f'Deploying {len(files)} files to {cfg["host"]}:{cfg["site_path"]}')
    result = push_files(files, repo_root, cfg)
    if result['ok']:
        logger.info(f'Deploy complete: {result["files_pushed"]} files pushed')
        return 0
    logger.error(f'Deploy failed after {result["files_pushed"]} files: {result["error"]}')
    return 1


if __name__ == '__main__':
    sys.exit(main())
