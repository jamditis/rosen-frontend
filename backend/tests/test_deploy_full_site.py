# -*- coding: utf-8 -*-
"""Tests for scripts/deploy_full_site.py — full-site SFTP push.

The script is invoked once per `deploy.yml` workflow_dispatch run. It walks
a hardcoded manifest of files/directories, uploads each via paramiko SFTP
with atomic posix_rename, and bails on the first transfer failure (a
partial deploy is worse than no deploy).

These tests cover the load-bearing behaviors:
  - manifest entries all exist on disk (drift between code and reality)
  - DEPLOYMENT.md top-level entries all appear in the manifest
  - --dry-run does not open a connection
  - missing ROSEN_SFTP_* env exits 2 with a clear stderr message
  - the file collector respects exclusion patterns
  - the upload path uses atomic .tmp + posix_rename per file
  - a partial-transfer failure aborts without continuing
"""
from __future__ import annotations

import importlib.util
import pathlib
import sys
from unittest.mock import MagicMock, patch

import pytest

_BACKEND = pathlib.Path(__file__).resolve().parents[1]
_REPO_ROOT = _BACKEND.parent
if str(_BACKEND) not in sys.path:
    sys.path.insert(0, str(_BACKEND))


def _load_script_module():
    """Import deploy_full_site.py as a module."""
    path = _BACKEND / 'scripts' / 'deploy_full_site.py'
    spec = importlib.util.spec_from_file_location('deploy_full_site', path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


pytest.importorskip('paramiko')
deploy_full_site = _load_script_module()


_REQUIRED_ENV = {
    'ROSEN_SFTP_HOST': 'sftp.example.com',
    'ROSEN_SFTP_USER': 'rosen',
    'ROSEN_SFTP_SITE_PATH': '/home/rosen/public_html/j/rosen-archive',
    'ROSEN_SFTP_PASSWORD': 'secret',
}


def _set_env(monkeypatch, **overrides):
    for key in (
        'ROSEN_SFTP_HOST', 'ROSEN_SFTP_USER', 'ROSEN_SFTP_SITE_PATH',
        'ROSEN_SFTP_PASSWORD', 'ROSEN_SFTP_KEY_PATH', 'ROSEN_SFTP_PORT',
        'ROSEN_SFTP_KNOWN_HOSTS', 'ROSEN_SFTP_KEY_PASSPHRASE',
    ):
        monkeypatch.delenv(key, raising=False)
    env = dict(_REQUIRED_ENV)
    env.update(overrides)
    for k, v in env.items():
        if v is None:
            monkeypatch.delenv(k, raising=False)
        else:
            monkeypatch.setenv(k, str(v))


class TestManifestExistsOnDisk:
    """Every file/dir in the hardcoded manifest must resolve to a real path.

    This is the drift-detection test — if the script claims to deploy a
    file that doesn't exist, the workflow would crash mid-upload, leaving
    the production site in an inconsistent state.
    """

    def test_all_deploy_files_exist(self):
        for relpath in deploy_full_site._DEPLOY_FILES:
            path = _REPO_ROOT / relpath
            assert path.is_file(), f"_DEPLOY_FILES entry missing: {relpath}"

    def test_all_deploy_dirs_exist(self):
        for relpath in deploy_full_site._DEPLOY_DIRS:
            path = _REPO_ROOT / relpath
            assert path.is_dir(), f"_DEPLOY_DIRS entry missing: {relpath}"

    def test_all_deploy_data_files_exist(self):
        for relpath in deploy_full_site._DEPLOY_DATA_FILES:
            path = _REPO_ROOT / relpath
            assert path.is_file(), f"_DEPLOY_DATA_FILES entry missing: {relpath}"


class TestDeploymentMdAlignment:
    """DEPLOYMENT.md's top-level deploy targets must all appear in the manifest.

    Top-level = unindented line in the first fenced code block. Sub-entries
    (indented) are descriptive — the script walks each dir recursively.
    """

    def test_top_level_md_entries_in_manifest(self):
        md = (_REPO_ROOT / 'DEPLOYMENT.md').read_text()
        # First fenced block is the deploy list. Split on ``` and grab index 1.
        fenced = md.split('```')[1]
        top_level = set()
        for line in fenced.splitlines():
            # Skip blank lines and any indented (sub) entry.
            if not line.strip() or line.startswith(' ') or line.startswith('\t'):
                continue
            # Drop trailing comment and slash, normalize.
            entry = line.split('#')[0].strip().rstrip('/')
            if entry:
                top_level.add(entry)

        # The manifest's covered top-level paths come from the first segment
        # of every entry across all three tuples.
        manifest_first_segs = set()
        for entry in (deploy_full_site._DEPLOY_FILES
                      + deploy_full_site._DEPLOY_DIRS
                      + deploy_full_site._DEPLOY_DATA_FILES):
            manifest_first_segs.add(entry.split('/')[0])

        missing = top_level - manifest_first_segs
        assert not missing, (
            f"DEPLOYMENT.md lists top-level entries the manifest doesn't "
            f"cover: {sorted(missing)}"
        )


class TestCollectLocalFiles:
    """File collection walks the manifest and respects exclusions."""

    def test_collects_top_level_files(self, tmp_path):
        # Build a tiny synthetic repo with the manifest's structure.
        (tmp_path / 'index.html').write_text('<html>')
        (tmp_path / 'version.json').write_text('{}')
        (tmp_path / 'frontend').mkdir()
        (tmp_path / 'frontend' / 'App.js').write_text('//')

        files = deploy_full_site.collect_local_files(
            tmp_path,
            top_files=('index.html', 'version.json'),
            dirs=('frontend',),
            data_files=(),
        )
        rels = {f.relative_to(tmp_path).as_posix() for f in files}
        assert 'index.html' in rels
        assert 'version.json' in rels
        assert 'frontend/App.js' in rels

    def test_excludes_pycache_and_test_files(self, tmp_path):
        (tmp_path / 'frontend').mkdir()
        (tmp_path / 'frontend' / 'App.js').write_text('//')
        (tmp_path / 'frontend' / '__pycache__').mkdir()
        (tmp_path / 'frontend' / '__pycache__' / 'foo.pyc').write_text('')
        (tmp_path / 'frontend' / 'App.test.js').write_text('')
        (tmp_path / 'frontend' / '.DS_Store').write_text('')

        files = deploy_full_site.collect_local_files(
            tmp_path, top_files=(), dirs=('frontend',), data_files=(),
        )
        rels = {f.relative_to(tmp_path).as_posix() for f in files}
        assert 'frontend/App.js' in rels
        assert not any('__pycache__' in r for r in rels)
        assert not any(r.endswith('.test.js') for r in rels)
        assert '.DS_Store' not in rels

    def test_excludes_csv_under_data_feeds(self, tmp_path):
        # Important: data/feeds/ is in _DEPLOY_DIRS, but raw CSV under it must
        # never ship — _EXCLUDE_SUFFIXES catches that.
        (tmp_path / 'data').mkdir()
        (tmp_path / 'data' / 'feeds').mkdir()
        (tmp_path / 'data' / 'feeds' / 'rss.xml').write_text('<rss/>')
        (tmp_path / 'data' / 'feeds' / 'leaked.csv').write_text('x,y')

        files = deploy_full_site.collect_local_files(
            tmp_path, top_files=(), dirs=('data/feeds',), data_files=(),
        )
        rels = {f.relative_to(tmp_path).as_posix() for f in files}
        assert 'data/feeds/rss.xml' in rels
        assert 'data/feeds/leaked.csv' not in rels


class TestDryRun:
    """--dry-run must report the plan without opening any network connection."""

    def test_dry_run_does_not_instantiate_sshclient(self, monkeypatch, capsys):
        _set_env(monkeypatch)
        with patch('paramiko.SSHClient') as mock_client_cls:
            exit_code = deploy_full_site.main(['--dry-run'])
        assert exit_code == 0
        assert mock_client_cls.call_count == 0
        out = capsys.readouterr().out
        assert 'dry-run' in out.lower() or 'would upload' in out.lower()

    def test_dry_run_with_missing_env_still_lists_files(self, monkeypatch, capsys):
        # Even without creds, --dry-run should print the file list — useful
        # for local sanity-checking before pushing the workflow.
        for key in ('ROSEN_SFTP_HOST', 'ROSEN_SFTP_USER',
                    'ROSEN_SFTP_SITE_PATH', 'ROSEN_SFTP_PASSWORD',
                    'ROSEN_SFTP_KEY_PATH'):
            monkeypatch.delenv(key, raising=False)
        exit_code = deploy_full_site.main(['--dry-run'])
        assert exit_code == 0
        out = capsys.readouterr().out
        # The dry-run banner mentions the file count.
        assert 'would upload' in out.lower()


class TestMissingEnv:
    """Without creds, a non-dry-run invocation exits 2 with a clear message."""

    def test_missing_env_exits_2(self, monkeypatch, capsys):
        for key in ('ROSEN_SFTP_HOST', 'ROSEN_SFTP_USER',
                    'ROSEN_SFTP_SITE_PATH', 'ROSEN_SFTP_PASSWORD',
                    'ROSEN_SFTP_KEY_PATH'):
            monkeypatch.delenv(key, raising=False)
        exit_code = deploy_full_site.main([])
        assert exit_code == 2
        err = capsys.readouterr().err
        assert 'sftp' in err.lower() or 'env' in err.lower()


class TestUploadPathsUsePosixRename:
    """Every uploaded file lands at .tmp first, then posix_rename — atomic."""

    def test_each_upload_lands_at_tmp_then_renames(self, monkeypatch, tmp_path):
        _set_env(monkeypatch)
        # Build a minimal synthetic repo so the script has something to walk.
        (tmp_path / 'index.html').write_text('<html>')
        (tmp_path / 'version.json').write_text('{}')

        with patch('paramiko.SSHClient') as mock_client_cls:
            mock_client = MagicMock()
            mock_sftp = MagicMock()
            mock_client.open_sftp.return_value = mock_sftp
            mock_client_cls.return_value = mock_client

            files = [tmp_path / 'index.html', tmp_path / 'version.json']
            result = deploy_full_site.push_files(
                files,
                repo_root=tmp_path,
                cfg=deploy_full_site._read_env(),
            )

        assert result['ok'] is True
        assert result['files_pushed'] == 2
        assert mock_sftp.put.call_count == 2
        for call in mock_sftp.put.call_args_list:
            args = call.args
            assert args[1].endswith('.tmp'), (
                f"upload must land in .tmp first; got {args[1]!r}"
            )
        # Each tmp upload followed by an atomic rename to its final name.
        assert mock_sftp.posix_rename.call_count == 2


class TestAbortOnFirstFailure:
    """A transfer error on file N must not silently continue to file N+1."""

    def test_first_failure_aborts_remaining_uploads(self, monkeypatch, tmp_path):
        _set_env(monkeypatch)
        (tmp_path / 'index.html').write_text('<html>')
        (tmp_path / 'version.json').write_text('{}')
        (tmp_path / 'metadata.json').write_text('{}')

        with patch('paramiko.SSHClient') as mock_client_cls:
            mock_client = MagicMock()
            mock_sftp = MagicMock()
            mock_sftp.put.side_effect = IOError('disk full')
            mock_client.open_sftp.return_value = mock_sftp
            mock_client_cls.return_value = mock_client

            files = [
                tmp_path / 'index.html',
                tmp_path / 'version.json',
                tmp_path / 'metadata.json',
            ]
            result = deploy_full_site.push_files(
                files,
                repo_root=tmp_path,
                cfg=deploy_full_site._read_env(),
            )

        assert result['ok'] is False
        # First attempt errored; we must not have tried more.
        assert mock_sftp.put.call_count == 1
        assert 'disk full' in result['error']
