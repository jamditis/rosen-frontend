#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Pillar 3c full-site SFTP deploy.

Invoked from `.github/workflows/deploy.yml` on workflow_dispatch. Walks the
hardcoded manifest below, uploads every file via paramiko SFTP with an
atomic .tmp+posix_rename, then removes explicitly retired remote directories.
It aborts on the first transfer failure (a partial deploy is worse than no
deploy — half the page would resolve to v3.4.0 imports while the other half
stayed on v3.3.0, pinning visitors into a broken half-updated state).

Two distinct env vars on purpose:
  - ROSEN_SFTP_REMOTE_PATH → the per-record `submit-record.yml` data dir
    (.../j/rosen-archive/data)
  - ROSEN_SFTP_SITE_PATH → THIS workflow's site root
    (.../j/rosen-archive)
Separate names so a misconfigured per-record workflow can't accidentally
overwrite anything outside data/.

SFTP key auth shares sftp_push.py's precedence (key over password). In GitHub
Actions ROSEN_SFTP_KEY_PATH is not a secret: deploy.yml's "Materialize SFTP
private key" step writes the ROSEN_SFTP_KEY_CONTENT secret to a 0600 runner-temp
file and exports ROSEN_SFTP_KEY_PATH, so there is no ROSEN_SFTP_KEY_PATH secret
to look for.

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
import errno
import html
import json
import logging
import os
import re
import stat
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
    'sw.js',  # root-scope bridge; imports frontend/sw.js
    'favicon.ico',
    'favicon.svg',  # SVG favicon referenced by index.html, the FAQ, and both data tools
    'og-image.png',  # social card referenced by the OG/Twitter meta tags
    'shared-styles.css',
    'version.json',
    'metadata.json',
    '.htaccess',
    'ADDING-RECORDS.md',
    # Shared Tailwind build for the standalone data tools. It sits at
    # tools/active/, one level above the two deployed tool dirs, so the dir
    # walk below never reaches it; both tools load it as ../tailwind.css.
    # Listed explicitly so a full deploy ships it -- dataexplorer and dataviz
    # render unstyled without it.
    'tools/active/tailwind.css',
)

_DEPLOY_DIRS: Tuple[str, ...] = (
    'r',  # generated metadata shells for ?record= deep links
    'frontend',
    'dissertation',
    'faq',
    'dissertation-launch',
    'features/shared',
    'features/winer-method',
    'features/participate',
    'tools/active/dataexplorer',
    'tools/active/dataviz',
    'data/feeds',
)

# Prune retired pages after all current files upload so a transfer failure
# cannot remove working pages before the replacement site is in place. Missing
# directories are treated as already pruned.
_REMOTE_PRUNE_DIRS: Tuple[str, ...] = (
    'dissertation/comparison',
    'dissertation/concepts',
    'dissertation/context',
    'dissertation/excerpts',
    'dissertation/glossary',
    'dissertation/timeline',
    'features/status-report',
)

# features/making-of is intentionally omitted. That page is a draft pending
# curator sign-off, and its handoff chapter carries approval-gated disclosures,
# so it is held out of the manifest to keep a routine full-site deploy from
# publishing it early. On sign-off: add 'features/making-of' here and to
# DEPLOYMENT.md, and exclude its og-image.html render template (a build-time
# social card, not a browsable page) via _EXCLUDE_NAMES.

_DEPLOY_DATA_FILES: Tuple[str, ...] = (
    'data/archive-core.json',
    'data/archive-data.json',
    'data/archive-details.json',
    'data/archive-entities.json',
    'data/archive-analytics.json',
    'data/search-index.json',  # prebuilt MiniSearch full-text index, loaded lazily on first search, issue 276
    'data/wiki-seed.json',
    'data/schema.json',  # data dictionary; linked from the open-data download UI
    'data/SCHEMA.md',  # human-readable data guide; linked from participation/open-data UI
    'data/eras.js',  # canonical era taxonomy imported by the frontend
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
#   sw.js           — the stable root-scope bridge that imports frontend/sw.js.
#     It flips after both files it connects so an update can never install from
#     a half-updated pair.
#   version.json    — the refresh signal; not precached (served network-first),
#     so it flips LAST as the least-harmful stale state: a client racing the
#     final rename pins the old version.json (a missed update nudge) rather than
#     any asset the worker would cache.
_ENTRY_POINTS: Tuple[str, ...] = ('index.html', 'frontend/sw.js', 'sw.js', 'version.json')


# ---------- Config ----------------------------------------------------------

def _read_env() -> Optional[Dict[str, Any]]:
    """Return SFTP config from env, or None when required vars are missing.

    Mirrors backend/submission_runtime/sftp_push.py:_read_env but reads
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


_RECORD_ID_RE = re.compile(r'^[A-Za-z0-9-]+$')
_SOCIAL_DESCRIPTION_LIMIT = 300


def _replace_head_value(source: str, pattern: str, value: str, label: str) -> str:
    """Replace one required head value and fail if the template drifted."""
    replaced, count = re.subn(
        pattern,
        lambda match: f'{match.group(1)}{value}{match.group(2)}',
        source,
        count=1,
        flags=re.IGNORECASE | re.DOTALL,
    )
    if count != 1:
        raise ValueError(f'index.html must contain exactly one {label}')
    return replaced


def _record_description(record: Dict[str, Any]) -> str:
    raw = record.get('summary') or record.get('quote') or record.get('title') or ''
    normalized = re.sub(r'\s+', ' ', str(raw)).strip()
    if len(normalized) > _SOCIAL_DESCRIPTION_LIMIT:
        normalized = normalized[:_SOCIAL_DESCRIPTION_LIMIT - 1].rstrip() + '…'
    return normalized


def _render_record_page(template: str, record: Dict[str, Any]) -> str:
    record_id = str(record.get('id') or '').strip()
    if not _RECORD_ID_RE.fullmatch(record_id):
        raise ValueError(f'unsafe or missing record id for social page: {record_id!r}')

    raw_title = re.sub(r'\s+', ' ', str(record.get('title') or '')).strip()
    if not raw_title:
        raise ValueError(f'record {record_id} has no title for social metadata')

    title = html.escape(raw_title, quote=True)
    page_title = f'{title} | Jay Rosen\'s Internet Archive'
    description = html.escape(_record_description(record), quote=True)
    canonical = (
        'https://pressthink.org/j/rosen-archive/'
        f'?record={record_id}'
    )

    rendered = _replace_head_value(
        template, r'(<title>)[\s\S]*?(</title>)', page_title, '<title>')
    rendered = _replace_head_value(
        rendered,
        r'(<meta\s+name="description"\s+content=")[^"]*("\s*/?>)',
        description,
        'description meta tag',
    )
    rendered = _replace_head_value(
        rendered,
        r'(<link\s+rel="canonical"\s+href=")[^"]*("\s*/?>)',
        canonical,
        'canonical link',
    )
    for key, value in (
        ('og:title', title),
        ('og:description', description),
        ('og:url', canonical),
        ('og:type', 'article'),
        ('twitter:title', title),
        ('twitter:description', description),
    ):
        attribute = 'property' if key.startswith('og:') else 'name'
        rendered = _replace_head_value(
            rendered,
            rf'(<meta\s+{attribute}="{re.escape(key)}"\s+content=")[^"]*("\s*/?>)',
            value,
            f'{key} meta tag',
        )
    return rendered


def generate_record_pages(repo_root: Path) -> List[Path]:
    """Build crawler-readable HTML shells for non-social record deep links."""
    template = (repo_root / 'index.html').read_text(encoding='utf-8')
    archive = json.loads(
        (repo_root / 'data' / 'archive-data.json').read_text(encoding='utf-8'))
    records = archive.get('records')
    if not isinstance(records, list):
        raise ValueError('data/archive-data.json must contain a records list')

    output_dir = repo_root / 'r'
    output_dir.mkdir(parents=True, exist_ok=True)
    for stale in output_dir.glob('*.html'):
        stale.unlink()

    pages: List[Path] = []
    seen: Set[str] = set()
    for record in records:
        if record.get('type') == 'social':
            continue
        record_id = str(record.get('id') or '').strip()
        if record_id in seen:
            raise ValueError(f'duplicate record id for social page: {record_id}')
        seen.add(record_id)
        page = output_dir / f'{record_id}.html'
        page.write_text(_render_record_page(template, record), encoding='utf-8')
        pages.append(page)

    pages.sort(key=lambda page: page.name)
    return pages


def collect_local_files(
    repo_root: Path,
    top_files: Iterable[str] = _DEPLOY_FILES,
    dirs: Iterable[str] = _DEPLOY_DIRS,
    data_files: Iterable[str] = _DEPLOY_DATA_FILES,
    entry_points: Iterable[str] = _ENTRY_POINTS,
) -> List[Path]:
    """Walk the manifest and return every file to upload, ordered so that
    each feature's index.html follows its dependencies, and site entry-point
    files (index.html, both service-worker files, version.json) come LAST.

    Skips entries that don't exist on disk (the existence tests catch
    those at PR time — at deploy time we keep going so a missing optional
    file doesn't block the rest of the push).

    The entry-points-last ordering is the cross-file consistency hinge for
    version-bump deploys: see the _ENTRY_POINTS comment for why.
    """
    # Normalize iterables because dirs and data_files are each consumed in two
    # passes. This preserves support for callers that provide generators rather
    # than tuples.
    dirs = tuple(dirs)
    data_files = tuple(data_files)
    files: List[Path] = []
    seen: Set[Path] = set()
    declared_entry_points = tuple(entry_points)
    # Every deployed standalone feature gets dependency-first semantics without
    # requiring a second hand-maintained manifest. Its directory is walked
    # normally, but index.html is held until all deployed dirs/data have landed.
    feature_entry_points = tuple(
        f'{relpath.rstrip("/")}/index.html'
        for relpath in dirs
        if relpath.rstrip('/').startswith('features/')
        and (repo_root / relpath / 'index.html').is_file()
    )
    entry_set = set(declared_entry_points) | set(feature_entry_points)

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

    # Shared JavaScript modules under data/ must exist before the frontend files
    # that import them flip live. Other data files stay after the directory walk
    # so this only changes ordering for runtime module dependencies.
    for relpath in data_files:
        if not relpath.endswith('.js'):
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

    # Feature entry points flip only after every walked dependency and data file
    # is live. The global app/SW/version entry points retain their declared
    # absolute-last ordering after the standalone features.
    for relpath in feature_entry_points:
        p = repo_root / relpath
        if p.is_file():
            _add(p)

    # LAST: global entry points, in the order declared.
    for relpath in declared_entry_points:
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


def _remove_remote_tree(sftp, remote_dir: str) -> bool:
    """Remove a remote directory tree, returning False when already absent."""
    try:
        entries = sftp.listdir_attr(remote_dir)
    except IOError:
        try:
            sftp.stat(remote_dir)
        except IOError as exc:
            if exc.errno == errno.ENOENT:
                return False
            raise
        raise

    for entry in entries:
        child = f'{remote_dir}/{entry.filename}'
        if stat.S_ISDIR(entry.st_mode):
            _remove_remote_tree(sftp, child)
        else:
            sftp.remove(child)
    sftp.rmdir(remote_dir)
    return True


def push_files(
    files: List[Path],
    repo_root: Path,
    cfg: Dict[str, Any],
    remote_prune_dirs: Iterable[str] = _REMOTE_PRUNE_DIRS,
) -> Dict[str, Any]:
    """Upload files atomically, then remove retired remote directories.

    Returns {ok, files_pushed, error}. The atomic-rename guarantee mirrors
    backend/submission_runtime/sftp_push.py — readers on the live site
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
        # RejectPolicy. The data-only submission runtime uses the same policy.
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

            for relpath in remote_prune_dirs:
                remote_dir = f"{cfg['site_path']}/{relpath}"
                if _remove_remote_tree(sftp, remote_dir):
                    logger.info(f'Removed retired directory: {relpath}')
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

    record_pages = generate_record_pages(repo_root)
    logger.info(f'Generated {len(record_pages)} record-specific metadata pages')
    files = collect_local_files(repo_root)

    if args.dry_run:
        print(f"dry-run: would upload {len(files)} files from {repo_root}")
        for f in files:
            print(f"  {f.relative_to(repo_root).as_posix()}")
        print(
            f'would remove {len(_REMOTE_PRUNE_DIRS)} retired directories '
            'after upload'
        )
        for relpath in _REMOTE_PRUNE_DIRS:
            print(f'  {relpath}')
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
