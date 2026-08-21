#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Pillar 3c full-site deploy over verified SFTP or explicit FTPS.

Invoked from `.github/workflows/deploy.yml` on workflow_dispatch. Walks the
hardcoded manifest below, uploads every file through the shared remote adapter
with an atomic temporary-file rename, then removes explicitly non-public remote
directories.
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

ROSEN_SFTP_TRANSACTION_PATH names the approved private remote directory for
recoverable recall-pair rollback state. It must sit outside the public site
root and end in `.rosen-archive-transactions`.

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
import hashlib
import logging
import os
import shutil
import stat
import sys
import tempfile
from pathlib import Path
from typing import Any, Dict, Iterable, List, Optional, Set, Tuple

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s %(levelname)s %(message)s',
)
logger = logging.getLogger('deploy_full_site')

_BACKEND = Path(__file__).resolve().parents[1]
if str(_BACKEND) not in sys.path:
    sys.path.insert(0, str(_BACKEND))

from submission_runtime.record_pages import (  # noqa: E402
    RECORD_SHELL_RE,
    generate_record_pages,
)
from submission_runtime import remote_transfer  # noqa: E402


# ---------- Manifest --------------------------------------------------------

# Mirrors DEPLOYMENT.md "Files to deploy". Drift-checked by
# backend/tests/test_deploy_full_site.py::TestDeploymentMdAlignment.

_DEPLOY_FILES: Tuple[str, ...] = (
    'index.html',
    'sw.js',  # root-scope bridge; imports frontend/sw.js
    'favicon.ico',
    'favicon.svg',  # SVG favicon referenced by index.html, the FAQ, and dataviz
    'og-image.png',  # social card referenced by the OG/Twitter meta tags
    'shared-styles.css',
    'version.json',
    'metadata.json',
    '.htaccess',
    'ADDING-RECORDS.md',
    # Shared Tailwind build for the standalone data visualization tool. It sits
    # at tools/active/, one level above the deployed tool dir, so the dir walk
    # below never reaches it; dataviz loads it as ../tailwind.css.
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

# The hardened data explorer source remains in the repository as an internal
# prototype, but any old manually uploaded copy must not remain a hidden public
# endpoint. Keep this distinct from retired routes so dry-run output records the
# product decision rather than implying that the source itself was deleted.
_REMOTE_INTERNAL_PRUNE_DIRS: Tuple[str, ...] = (
    'tools/active/dataexplorer',
)
_REMOTE_PRUNE_TARGETS: Tuple[str, ...] = (
    *_REMOTE_PRUNE_DIRS,
    *_REMOTE_INTERNAL_PRUNE_DIRS,
)

# Exact retired files need separate reconciliation because the surrounding
# frontend directory remains public. Remove them only after replacement uploads
# succeed, using the same archive-root scope validation as every upload.
_REMOTE_PRUNE_FILES: Tuple[str, ...] = (
    'frontend/components/RiverOfNews.js',
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
    'data/social-search-index.json',  # social-body MiniSearch index, loaded lazily on first search, issue 669
    # Similar-in-theme artifact pair. Upload the binary first and its hash-bound
    # sidecar second so the live index never advertises bytes that are not present.
    'data/archive-embeddings.bin',
    'data/archive-embeddings.json',
    # Fixed public-safe relationship shards. Upload the manifest last so it
    # never points a reader at a shard that has not uploaded yet. Issue 807.
    'data/relationship-adjacency-0.json',
    'data/relationship-adjacency-1.json',
    'data/relationship-adjacency-2.json',
    'data/relationship-adjacency-3.json',
    'data/relationship-adjacency-4.json',
    'data/relationship-adjacency-5.json',
    'data/relationship-adjacency-6.json',
    'data/relationship-adjacency-7.json',
    'data/relationship-adjacency-8.json',
    'data/relationship-adjacency-9.json',
    'data/relationship-adjacency-a.json',
    'data/relationship-adjacency-b.json',
    'data/relationship-adjacency-c.json',
    'data/relationship-adjacency-d.json',
    'data/relationship-adjacency-e.json',
    'data/relationship-adjacency-f.json',
    'data/relationship-adjacency-manifest.json',
    'data/wiki-seed.json',
    'data/schema.json',  # data dictionary; linked from the open-data download UI
    'data/SCHEMA.md',  # human-readable data guide; linked from participation/open-data UI
    'data/eras.js',  # canonical era taxonomy imported by the frontend
)

_RECALL_ARTIFACT_PAIR: Tuple[str, str] = (
    'data/archive-embeddings.bin',
    'data/archive-embeddings.json',
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
    """Return transfer config from env, or None when required vars are missing.

    Mirrors backend/submission_runtime/sftp_push.py:_read_env but reads
    ROSEN_SFTP_SITE_PATH (the full-site root) instead of the data-only
    ROSEN_SFTP_REMOTE_PATH.
    """
    host = os.environ.get('ROSEN_SFTP_HOST', '').strip()
    user = os.environ.get('ROSEN_SFTP_USER', '').strip()
    site_path = os.environ.get('ROSEN_SFTP_SITE_PATH', '').strip()
    transaction_path = os.environ.get(
        'ROSEN_SFTP_TRANSACTION_PATH', '').strip()
    password = os.environ.get('ROSEN_SFTP_PASSWORD', '')
    key_path = os.environ.get('ROSEN_SFTP_KEY_PATH', '').strip()
    protocol = remote_transfer.normalize_protocol(
        os.environ.get('ROSEN_TRANSFER_PROTOCOL', 'sftp'))

    has_auth = bool(password) if protocol == 'ftps' else bool(password or key_path)
    if not (host and user and site_path and has_auth):
        return None

    try:
        default_port = '21' if protocol == 'ftps' else '22'
        port = int(os.environ.get('ROSEN_SFTP_PORT') or default_port)
    except (TypeError, ValueError) as exc:
        raise ValueError("ROSEN_SFTP_PORT must be an integer") from exc

    return {
        'protocol': protocol,
        'host': host,
        'port': port,
        'user': user,
        'site_path': site_path.rstrip('/'),
        'transaction_path': transaction_path.rstrip('/') or None,
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
    each HTML entry point follows its dependencies. Generated record shells
    come after assets/data, followed by the global app entry points LAST.

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
    resolved_repo_root = repo_root.resolve()

    def _deployable_file(path: Path) -> bool:
        if path.is_symlink() or not path.is_file():
            return False
        try:
            path.resolve().relative_to(resolved_repo_root)
        except ValueError:
            return False
        return True

    # Every deployed standalone page gets dependency-first semantics without a
    # second hand-maintained manifest. Directories are walked normally, but
    # nested index.html files are held until all deployed dirs/data have landed.
    # This covers dissertation/, faq/, tools/, and features/ uniformly as their
    # versioned surfaces evolve. Generated r/*.html shells keep their dedicated
    # ordering below because they depend on the global frontend and archive data.
    standalone_entry_points = tuple(sorted(
        path.relative_to(repo_root).as_posix()
        for relpath in dirs
        if relpath.rstrip('/') != 'r'
        and not (repo_root / relpath).is_symlink()
        for path in (repo_root / relpath).rglob('index.html')
        if _deployable_file(path)
    ))
    record_entry_points = tuple(sorted(
        path.relative_to(repo_root).as_posix()
        for relpath in dirs
        if relpath.rstrip('/') == 'r'
        and not (repo_root / relpath).is_symlink()
        for path in (repo_root / relpath).glob('*.html')
        if _deployable_file(path) and RECORD_SHELL_RE.fullmatch(path.name)
    ))
    entry_set = (
        set(declared_entry_points)
        | set(standalone_entry_points)
        | set(record_entry_points)
    )

    def _add(p: Path) -> None:
        if not _deployable_file(p):
            return
        rp = p.resolve()
        if rp not in seen:
            seen.add(rp)
            files.append(p)

    # First: every top-level deploy file EXCEPT entry points.
    for relpath in top_files:
        if relpath in entry_set:
            continue
        p = repo_root / relpath
        if _deployable_file(p):
            _add(p)

    # Shared JavaScript modules under data/ must exist before the frontend files
    # that import them flip live. Other data files stay after the directory walk
    # so this only changes ordering for runtime module dependencies.
    for relpath in data_files:
        if not relpath.endswith('.js'):
            continue
        p = repo_root / relpath
        if _deployable_file(p):
            _add(p)

    for relpath in dirs:
        d = repo_root / relpath
        if d.is_symlink() or not d.is_dir():
            continue
        for sub in sorted(d.rglob('*')):
            if _deployable_file(sub) and not _is_excluded(sub):
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
        if _deployable_file(p):
            _add(p)

    # Standalone entry points flip only after every walked dependency and data
    # file is live. The global app/SW/version entry points retain their declared
    # absolute-last ordering after the standalone pages.
    for relpath in standalone_entry_points:
        p = repo_root / relpath
        if _deployable_file(p):
            _add(p)

    # Record shells reference the global frontend and archive data. Flip them
    # only after those dependencies, but before the root app/SW/version group.
    for relpath in record_entry_points:
        p = repo_root / relpath
        if _deployable_file(p):
            _add(p)

    # LAST: global entry points, in the order declared.
    for relpath in declared_entry_points:
        p = repo_root / relpath
        if _deployable_file(p):
            _add(p)

    return files


# ---------- Remote upload ---------------------------------------------------

def _ensure_remote_dir(sftp, remote_dir: str, cache: Set[str]) -> None:
    """Remote `mkdir -p`. Walks remote_dir segment by segment, creating
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


def _remove_remote_file(sftp, remote_path: str) -> bool:
    """Remove one retired remote file, returning False when already absent."""
    try:
        sftp.stat(remote_path)
    except IOError as exc:
        if exc.errno == errno.ENOENT:
            return False
        raise
    try:
        sftp.remove(remote_path)
    except IOError as exc:
        if exc.errno == errno.ENOENT:
            return False
        raise
    return True


def _prune_remote_record_shells(
    sftp,
    remote_dir: str,
    expected_names: Set[str],
) -> int:
    """Remove stale generated shells while preserving all unrelated entries."""
    try:
        entries = sftp.listdir_attr(remote_dir)
    except IOError:
        try:
            sftp.stat(remote_dir)
        except IOError as exc:
            if exc.errno == errno.ENOENT:
                return 0
            raise
        raise

    removed = 0
    for entry in entries:
        if not stat.S_ISREG(entry.st_mode):
            continue
        if not RECORD_SHELL_RE.fullmatch(entry.filename):
            continue
        if entry.filename in expected_names:
            continue
        sftp.remove(f'{remote_dir}/{entry.filename}')
        removed += 1
    return removed


def _remote_exists(remote, path: str) -> bool:
    try:
        remote.stat(path)
        return True
    except IOError as exc:
        if getattr(exc, 'errno', None) == errno.ENOENT:
            return False
        raise


def _remove_remote_if_exists(remote, path: str) -> None:
    if not _remote_exists(remote, path):
        return
    try:
        remote.remove(path)
    except IOError as exc:
        if getattr(exc, 'errno', None) != errno.ENOENT:
            raise


def _copy_remote_file(remote, source: str, target: str) -> None:
    """Copy one remote file without moving its live source path."""
    with tempfile.NamedTemporaryFile() as local_copy:
        with remote.open(source, 'rb') as remote_source:
            shutil.copyfileobj(remote_source, local_copy)
        local_copy.flush()
        remote.put(local_copy.name, target)


def _local_file_digest(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open('rb') as source:
        for chunk in iter(lambda: source.read(64 * 1024), b''):
            digest.update(chunk)
    return digest.hexdigest()


def _remote_file_digest(remote, path: str) -> str:
    digest = hashlib.sha256()
    with remote.open(path, 'rb') as source:
        for chunk in iter(lambda: source.read(64 * 1024), b''):
            digest.update(chunk)
    return digest.hexdigest()


def _replace_remote_file(remote, source: str, target: str) -> None:
    """Replace target atomically, with a safe absent-target fallback.

    An ordinary rename is safe only when no destination exists. A live target
    is never removed if the server rejects atomic rename-over-existing.
    """
    target_exists = _remote_exists(remote, target)
    try:
        remote.posix_rename(source, target)
    except (IOError, AttributeError):
        if target_exists:
            raise
        remote.rename(source, target)


def _publish_recall_artifact_pair(
    remote,
    local_by_relpath: Dict[str, Path],
    cfg: Dict[str, Any],
    dir_cache: Set[str],
) -> None:
    """Publish the hash-bound binary and sidecar as one rollback-safe unit."""
    transaction_root = cfg.get('transaction_path')
    entries = []
    for relpath in _RECALL_ARTIFACT_PAIR:
        local = local_by_relpath[relpath]
        final = remote_transfer.scoped_archive_child(cfg['site_path'], relpath)
        name = Path(relpath).name
        entries.append({
            'relpath': relpath,
            'local': local,
            'final': final,
            'tmp': f'{final}.pair-tmp',
            # Read and remove these public paths only for compatibility with
            # transactions created by older deploy code.
            'legacy_backup': f'{final}.pair-backup',
            'legacy_backup_tmp': f'{final}.pair-backup-tmp',
            'legacy_restore_tmp': f'{final}.pair-restore-tmp',
            'private_backup': (
                remote_transfer.scoped_archive_child(
                    transaction_root, f'{name}.pair-backup')
                if transaction_root else None
            ),
            'private_backup_tmp': (
                remote_transfer.scoped_archive_child(
                    transaction_root, f'{name}.pair-backup-tmp')
                if transaction_root else None
            ),
            'private_restore_tmp': (
                remote_transfer.scoped_archive_child(
                    transaction_root, f'{name}.pair-restore-tmp')
                if transaction_root else None
            ),
        })

    local_digests = tuple(
        _local_file_digest(entry['local']) for entry in entries)

    private_root_exists = bool(
        transaction_root and _remote_exists(remote, transaction_root))

    def ensure_private_root() -> None:
        nonlocal private_root_exists
        if not transaction_root:
            raise RuntimeError(
                'ROSEN_SFTP_TRANSACTION_PATH is required to replace the '
                'existing recall artifact pair'
            )
        if not private_root_exists:
            remote.mkdir(transaction_root)
            private_root_exists = True

    def scratch_paths(entry) -> List[str]:
        paths = [
            entry['tmp'],
            entry['legacy_backup_tmp'],
            entry['legacy_restore_tmp'],
        ]
        if private_root_exists:
            paths.extend([
                entry['private_backup_tmp'],
                entry['private_restore_tmp'],
            ])
        return paths

    # Inspect both members before changing either one. Recover an interrupted
    # transaction from the configured private root, while still accepting and
    # removing backup files left by the older public-path implementation.
    for entry in entries:
        _ensure_remote_dir(
            remote, entry['final'].rsplit('/', 1)[0], dir_cache)
        entry['final_exists'] = _remote_exists(remote, entry['final'])
        entry['legacy_backup_exists'] = _remote_exists(
            remote, entry['legacy_backup'])
        entry['private_backup_exists'] = bool(
            private_root_exists
            and _remote_exists(remote, entry['private_backup']))

    has_legacy_backups = any(
        entry['legacy_backup_exists'] for entry in entries)
    has_private_backups = any(
        entry['private_backup_exists'] for entry in entries)
    if has_legacy_backups and has_private_backups:
        raise RuntimeError('multiple recall artifact backup locations found')

    if has_private_backups:
        backup_key = 'private_backup'
        backup_exists_key = 'private_backup_exists'
        restore_key = 'private_restore_tmp'
    else:
        backup_key = 'legacy_backup'
        backup_exists_key = 'legacy_backup_exists'
        # Legacy public backups are read in place, but all newly created
        # recovery files still belong in the private transaction directory.
        restore_key = 'private_restore_tmp'

    backup_entries = [
        entry for entry in entries if entry[backup_exists_key]]
    if backup_entries:
        missing_finals = [entry for entry in entries if not entry['final_exists']]
        if len(backup_entries) == len(entries):
            if not missing_finals:
                final_digests = tuple(
                    _remote_file_digest(remote, entry['final'])
                    for entry in entries)
                backup_digests = tuple(
                    _remote_file_digest(remote, entry[backup_key])
                    for entry in entries)
                if final_digests in (backup_digests, local_digests):
                    restore_entries = []
                else:
                    restore_entries = backup_entries
            else:
                restore_entries = backup_entries
        elif not missing_finals:
            # The process stopped while preparing backups or cleaning them
            # after a complete publish. The public pair is already complete.
            restore_entries = []
        elif (
            has_legacy_backups
            and len(missing_finals) == 1
            and missing_finals[0][backup_exists_key]
        ):
            # Compatibility with the previous move-based backup transaction.
            restore_entries = missing_finals
        else:
            raise RuntimeError(
                'cannot restore incomplete recall artifact backup pair'
            )

        if restore_entries:
            ensure_private_root()
        for entry in restore_entries:
            _remove_remote_if_exists(remote, entry[restore_key])
            _copy_remote_file(
                remote, entry[backup_key], entry[restore_key])
        for entry in restore_entries:
            _replace_remote_file(
                remote, entry[restore_key], entry['final'])
        for entry in backup_entries:
            _remove_remote_if_exists(remote, entry[backup_key])
        for entry in entries:
            entry['final_exists'] = _remote_exists(remote, entry['final'])

    for entry in entries:
        for transaction_path in scratch_paths(entry):
            _remove_remote_if_exists(remote, transaction_path)

    existing_entries = [entry for entry in entries if entry['final_exists']]
    if len(existing_entries) == len(entries):
        final_digests = tuple(
            _remote_file_digest(remote, entry['final']) for entry in entries)
        if final_digests == local_digests:
            return
        ensure_private_root()
    elif existing_entries:
        # An interrupted first publication has no previous complete pair to
        # preserve. Remove its orphan so the absent-target path can retry.
        for entry in existing_entries:
            _remove_remote_if_exists(remote, entry['final'])
            entry['final_exists'] = False

    if private_root_exists:
        for entry in entries:
            for transaction_path in (
                entry['private_backup'],
                entry['private_backup_tmp'],
                entry['private_restore_tmp'],
            ):
                _remove_remote_if_exists(remote, transaction_path)

    for entry in entries:
        remote.put(str(entry['local']), entry['tmp'])

    backed_up = []
    published = []
    try:
        for entry in entries:
            if entry['final_exists']:
                _copy_remote_file(
                    remote, entry['final'], entry['private_backup_tmp'])
                _replace_remote_file(
                    remote, entry['private_backup_tmp'],
                    entry['private_backup'])
                backed_up.append(entry)

        for entry in entries:
            _replace_remote_file(remote, entry['tmp'], entry['final'])
            published.append(entry)
    except Exception as publish_error:
        rollback_errors = []
        restorable = []
        for entry in backed_up:
            try:
                final_matches_backup = (
                    _remote_exists(remote, entry['final'])
                    and _remote_file_digest(remote, entry['final'])
                    == _remote_file_digest(remote, entry['private_backup'])
                )
                if final_matches_backup:
                    continue
                _remove_remote_if_exists(
                    remote, entry['private_restore_tmp'])
                _copy_remote_file(
                    remote, entry['private_backup'],
                    entry['private_restore_tmp'])
                restorable.append(entry)
            except Exception as exc:  # best-effort rollback, reported below
                rollback_errors.append(exc)
        for entry in restorable:
            try:
                _replace_remote_file(
                    remote, entry['private_restore_tmp'], entry['final'])
            except Exception as exc:  # best-effort rollback, reported below
                rollback_errors.append(exc)
        for entry in published:
            if entry not in backed_up:
                try:
                    _remove_remote_if_exists(remote, entry['final'])
                except Exception as exc:
                    rollback_errors.append(exc)
        for entry in entries:
            for transaction_path in scratch_paths(entry):
                try:
                    _remove_remote_if_exists(remote, transaction_path)
                except Exception as exc:
                    rollback_errors.append(exc)
        if not rollback_errors:
            for entry in entries:
                try:
                    _remove_remote_if_exists(
                        remote, entry['private_backup'])
                except Exception as exc:
                    rollback_errors.append(exc)
                    break
        if rollback_errors:
            raise RuntimeError(
                f'{publish_error}; recall artifact rollback also failed: '
                f'{rollback_errors[0]}'
            ) from publish_error
        raise

    for entry in backed_up:
        _remove_remote_if_exists(remote, entry['private_backup'])


def push_files(
    files: List[Path],
    repo_root: Path,
    cfg: Dict[str, Any],
    remote_prune_dirs: Iterable[str] = _REMOTE_PRUNE_TARGETS,
    record_shells: Optional[Iterable[Path]] = None,
    remote_prune_files: Iterable[str] = _REMOTE_PRUNE_FILES,
) -> Dict[str, Any]:
    """Upload files atomically, then reconcile non-public remote content.

    Returns {ok, files_pushed, error}. The atomic-rename guarantee mirrors
    backend/submission_runtime/sftp_push.py — readers on the live site
    never see a half-written file. ``record_shells=None`` disables record-shell
    reconciliation; an empty iterable intentionally clears every safe shell.
    """
    expected_record_shells: Optional[Set[str]] = None
    if record_shells is not None:
        expected_record_shells = set()
        for page in record_shells:
            name = Path(page).name
            if not RECORD_SHELL_RE.fullmatch(name):
                return {
                    'ok': False,
                    'files_pushed': 0,
                    'error': f'unsafe record shell name: {name!r}',
                }
            expected_record_shells.add(name)
    try:
        cfg['site_path'] = remote_transfer.validate_archive_root(
            cfg['site_path'], cfg.get('protocol', 'sftp'))
        if cfg.get('transaction_path'):
            cfg['transaction_path'] = (
                remote_transfer.validate_recall_transaction_root(
                    cfg['transaction_path'],
                    cfg['site_path'],
                    cfg.get('protocol', 'sftp'),
                )
            )
    except ValueError as exc:
        return {'ok': False, 'files_pushed': 0, 'error': str(exc)}

    local_by_relpath = {
        local.relative_to(repo_root).as_posix(): local
        for local in files
    }
    pair_members = [
        relpath for relpath in _RECALL_ARTIFACT_PAIR
        if relpath in local_by_relpath
    ]
    if pair_members and len(pair_members) != len(_RECALL_ARTIFACT_PAIR):
        return {
            'ok': False,
            'files_pushed': 0,
            'error': 'recall binary and sidecar must be deployed together',
        }
    pair_trigger = None
    if pair_members:
        pair_trigger = min(
            pair_members,
            key=lambda relpath: list(local_by_relpath).index(relpath),
        )

    pushed = 0
    error: Optional[str] = None
    # The archive root already exists. Treat it as the mkdir boundary so the
    # publisher never stats or creates its broader parent (the account can see
    # more of PressThink than this automation is authorized to touch).
    dir_cache: Set[str] = {cfg['site_path']}
    remote = None

    try:
        remote = remote_transfer.connect_remote(cfg)
        for local in files:
            rel = local.relative_to(repo_root).as_posix()
            if rel == pair_trigger:
                _publish_recall_artifact_pair(
                    remote, local_by_relpath, cfg, dir_cache)
                pushed += len(_RECALL_ARTIFACT_PAIR)
                if pushed % 25 == 0 or pushed == len(files):
                    logger.info(f"Pushed {pushed}/{len(files)} files")
                continue
            if rel in _RECALL_ARTIFACT_PAIR:
                continue

            remote_final = remote_transfer.scoped_archive_child(
                cfg['site_path'], rel)
            remote_tmp = f"{remote_final}.tmp"
            remote_dir = remote_final.rsplit('/', 1)[0]
            _ensure_remote_dir(remote, remote_dir, dir_cache)
            remote.put(str(local), remote_tmp)
            try:
                remote.posix_rename(remote_tmp, remote_final)
            except (IOError, AttributeError):
                try:
                    remote.remove(remote_final)
                except IOError:
                    pass
                remote.rename(remote_tmp, remote_final)
            pushed += 1
            if pushed % 25 == 0 or pushed == len(files):
                logger.info(f"Pushed {pushed}/{len(files)} files")

        if expected_record_shells is not None:
            remote_record_dir = remote_transfer.scoped_archive_child(
                cfg['site_path'], 'r')
            removed = _prune_remote_record_shells(
                remote, remote_record_dir, expected_record_shells)
            if removed:
                logger.info(f'Removed {removed} stale record metadata shells')

        for relpath in remote_prune_files:
            remote_file = remote_transfer.scoped_archive_child(
                cfg['site_path'], relpath)
            if _remove_remote_file(remote, remote_file):
                logger.info(f'Removed retired file: {relpath}')

        for relpath in remote_prune_dirs:
            remote_dir = remote_transfer.scoped_archive_child(
                cfg['site_path'], relpath)
            if _remove_remote_tree(remote, remote_dir):
                logger.info(f'Removed non-public directory: {relpath}')
    except Exception as exc:
        error = f'Transfer error: {exc}'
        logger.error(error)
    finally:
        if remote is not None:
            remote.close()

    return {
        'ok': error is None and pushed == len(files),
        'files_pushed': pushed,
        'error': error,
    }


# ---------- CLI -------------------------------------------------------------

def main(argv: Optional[List[str]] = None) -> int:
    parser = argparse.ArgumentParser(
        description='Push the full Jay Rosen archive site to pressthink.org.',
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
        print(
            f'would remove {len(_REMOTE_INTERNAL_PRUNE_DIRS)} internal '
            'prototype directory after upload'
        )
        for relpath in _REMOTE_INTERNAL_PRUNE_DIRS:
            print(f'  {relpath}')
        print(
            f'would remove {len(_REMOTE_PRUNE_FILES)} retired file '
            'after upload'
        )
        for relpath in _REMOTE_PRUNE_FILES:
            print(f'  {relpath}')
        return 0

    try:
        cfg = _read_env()
    except ValueError as exc:
        print(f'error: {exc}', file=sys.stderr)
        return 2
    if cfg is None:
        print(
            'error: required transfer env vars missing — set ROSEN_SFTP_HOST, '
            'ROSEN_SFTP_USER, ROSEN_SFTP_SITE_PATH, and valid authentication '
            'for the selected protocol',
            file=sys.stderr,
        )
        return 2

    logger.info(f'Deploying {len(files)} files to {cfg["host"]}:{cfg["site_path"]}')
    result = push_files(files, repo_root, cfg, record_shells=record_pages)
    if result['ok']:
        logger.info(f'Deploy complete: {result["files_pushed"]} files pushed')
        return 0
    logger.error(f'Deploy failed after {result["files_pushed"]} files: {result["error"]}')
    return 1


if __name__ == '__main__':
    sys.exit(main())
