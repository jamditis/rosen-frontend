# -*- coding: utf-8 -*-
"""Tests for scripts/deploy_full_site.py — full-site SFTP push.

The script is invoked once per `deploy.yml` workflow_dispatch run. It walks
a hardcoded manifest of files/directories, uploads each via paramiko SFTP
with atomic posix_rename, and bails on the first transfer failure (a
partial deploy is worse than no deploy).

These tests cover the load-bearing behaviors:
  - manifest entries all exist on disk (drift between code and reality)
  - DEPLOYMENT.md top-level entries all appear in the manifest
  - retired dissertation routes are pruned only after uploads finish
  - --dry-run does not open a connection
  - missing ROSEN_SFTP_* env exits 2 with a clear stderr message
  - the file collector respects exclusion patterns
  - the upload path uses atomic .tmp + posix_rename per file
  - a partial-transfer failure aborts without continuing
"""
from __future__ import annotations

import errno
import json
import importlib.util
import pathlib
import posixpath
import re
import stat
import sys
from types import SimpleNamespace
from unittest.mock import MagicMock, patch
from urllib.parse import urlsplit

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
    """DEPLOYMENT.md and the manifest must not drift, in both directions.

    Forward: every top-level line in the first fenced block is covered by the
    manifest (a documented path the deploy would actually walk). Reverse: every
    explicit file entry in the manifest -- including a nested one listed as an
    indented sub-entry -- is documented, so a manual FTP deploy that follows the
    doc uploads it. Directories are walked recursively, so their sub-entries are
    descriptive only and are not checked individually.
    """

    @staticmethod
    def _fenced_block():
        # First fenced block is the deploy list. Split on ``` and grab index 1.
        md = (_REPO_ROOT / 'DEPLOYMENT.md').read_text()
        return md.split('```')[1]

    @staticmethod
    def _documented_paths(fenced):
        """Full repo-relative paths documented in a fenced deploy block.

        Indented sub-entries are joined onto their parent via an indentation
        stack, so `active/tailwind.css` listed under `tools/` reconstructs to
        `tools/active/tailwind.css`. Without this, a nested file entry would be
        invisible to a plain top-level scan.
        """
        documented = set()
        stack = []  # (indent, segment) outermost -> current
        for line in fenced.splitlines():
            if not line.strip():
                continue
            indent = len(line) - len(line.lstrip())
            entry = line.split('#', 1)[0].strip().rstrip('/')
            if not entry:
                continue
            while stack and stack[-1][0] >= indent:
                stack.pop()
            prefix = '/'.join(seg for _, seg in stack)
            documented.add(f'{prefix}/{entry}' if prefix else entry)
            stack.append((indent, entry))
        return documented

    def test_top_level_md_entries_in_manifest(self):
        top_level = set()
        for line in self._fenced_block().splitlines():
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

    def test_manifest_file_entries_documented(self):
        """Reverse direction: every explicit file the manifest ships --
        _DEPLOY_FILES and _DEPLOY_DATA_FILES, including nested ones like
        tools/active/tailwind.css -- must appear in DEPLOYMENT.md. The
        top-level test only checks first path segments, so a nested file could
        drop from the doc while the manifest stayed correct; a manual deploy
        following the doc would then omit it (e.g. both data tools unstyled).
        """
        documented = self._documented_paths(self._fenced_block())
        explicit = (deploy_full_site._DEPLOY_FILES
                    + deploy_full_site._DEPLOY_DATA_FILES)
        missing = [f for f in explicit if f not in documented]
        assert not missing, (
            f"manifest file entries missing from DEPLOYMENT.md: {missing}"
        )

        # The reconstruction must genuinely resolve nested paths -- a top-level
        # or substring check would still pass with the parent context wrong.
        # Dropping the nested line must make its full path undetectable.
        pruned = '\n'.join(
            line for line in self._fenced_block().splitlines()
            if 'active/tailwind.css' not in line
        )
        assert 'tools/active/tailwind.css' not in self._documented_paths(pruned)

    def test_manifest_dir_entries_documented(self):
        """Reverse direction for directories: every _DEPLOY_DIRS entry -- even
        a nested one like features/winer-method or tools/active/dataviz --
        must be documented in DEPLOYMENT.md, either as the directory itself or
        via a file listed under it. The file reverse-check and the top-level
        segment check both miss this: a nested dir line could drop from the doc
        while the manifest stayed correct, and a manual deploy following the doc
        would then omit a whole feature directory.
        """
        documented = self._documented_paths(self._fenced_block())

        def covered(path):
            # A dir is documented if it is listed, or if any documented path
            # sits under it (the doc may name only files inside the dir).
            return path in documented or any(
                d.startswith(path + '/') for d in documented)

        missing = [d for d in deploy_full_site._DEPLOY_DIRS if not covered(d)]
        assert not missing, (
            f"manifest dir entries missing from DEPLOYMENT.md: {missing}"
        )

        # Teeth: dropping the nested Winer method line must make its path
        # undetectable -- the top-level `features/` line must not mask it.
        pruned = self._documented_paths('\n'.join(
            line for line in self._fenced_block().splitlines()
            if 'winer-method/' not in line
        ))
        assert not (
            'features/winer-method' in pruned
            or any(d.startswith('features/winer-method/') for d in pruned)
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


class TestRecordSharePages:
    """Record deep links need crawler-readable metadata before React runs."""

    def test_generates_record_specific_shells_and_removes_stale_ones(self,
                                                                     tmp_path):
        (tmp_path / 'data').mkdir()
        (tmp_path / 'r').mkdir()
        (tmp_path / 'r' / '.gitkeep').write_text('')
        (tmp_path / 'r' / 'STALE.html').write_text('old')
        (tmp_path / 'index.html').write_text(
            '<!doctype html><html><head>'
            '<title>Archive</title>'
            '<meta name="description" content="Archive description" />'
            '<link rel="canonical" href="https://pressthink.org/j/rosen-archive/" />'
            '<meta property="og:title" content="Archive" />'
            '<meta property="og:description" content="Archive description" />'
            '<meta property="og:url" content="https://pressthink.org/j/rosen-archive/" />'
            '<meta property="og:type" content="website" />'
            '<meta name="twitter:title" content="Archive" />'
            '<meta name="twitter:description" content="Archive description" />'
            '</head><body><script src="./frontend/index.js"></script></body></html>',
            encoding='utf-8',
        )
        (tmp_path / 'data' / 'archive-data.json').write_text(json.dumps({
            'records': [
                {
                    'id': 'RECORD-00001',
                    'title': 'A title with <angle> & "quotes"',
                    'summary': 'A summary for social previews.',
                    'type': 'article',
                },
                {
                    'id': 'BSKY-1',
                    'title': 'A social post',
                    'summary': 'Do not prerender social records.',
                    'type': 'social',
                },
            ],
        }), encoding='utf-8')

        pages = deploy_full_site.generate_record_pages(tmp_path)

        assert [p.name for p in pages] == ['RECORD-00001.html']
        assert not (tmp_path / 'r' / 'STALE.html').exists()
        assert (tmp_path / 'r' / '.gitkeep').exists()
        rendered = pages[0].read_text(encoding='utf-8')
        assert 'A title with &lt;angle&gt; &amp; &quot;quotes&quot;' in rendered
        assert 'A summary for social previews.' in rendered
        assert ('https://pressthink.org/j/rosen-archive/'
                '?record=RECORD-00001') in rendered
        assert 'property="og:type" content="article"' in rendered
        assert './frontend/index.js' in rendered
        assert not (tmp_path / 'r' / 'BSKY-1.html').exists()

    def test_htaccess_serves_generated_metadata_and_falls_back_for_unknown_ids(self):
        config = (_REPO_ROOT / '.htaccess').read_text(encoding='utf-8')
        assert re.search(
            r'RewriteCond\s+%\{QUERY_STRING\}.*record=.*\[NC\]', config)
        assert 'RewriteRule ^(?:index\\.html)?$ r/%2.html [L]' in config
        assert 'RewriteCond %{REQUEST_FILENAME} !-f' in config
        assert (
            'RewriteRule ^r/[A-Za-z0-9-]+\\.html$ index.html [END,QSD]'
            in config
        )


class TestEntryPointsUploadedLast:
    """Cross-file consistency: entry points (index.html, version.json) must
    upload AFTER every asset they reference. If index.html ships before
    frontend/App.js, a visitor mid-deploy fetches the new index.html (which
    has ?v=3.4.0 imports), then fetches App.js?v=3.4.0 — origin still
    serves old content, CDN caches old-under-new-URL, stale page sticks
    until TTL or manual purge.
    """

    def test_entry_points_appear_at_end_of_file_list(self, tmp_path):
        (tmp_path / 'index.html').write_text('<html>')
        (tmp_path / 'version.json').write_text('{}')
        (tmp_path / 'favicon.ico').write_text('')
        (tmp_path / 'frontend').mkdir()
        (tmp_path / 'frontend' / 'App.js').write_text('//')
        (tmp_path / 'data').mkdir()
        (tmp_path / 'data' / 'archive-core.json').write_text('[]')

        files = deploy_full_site.collect_local_files(
            tmp_path,
            top_files=('index.html', 'favicon.ico', 'version.json'),
            dirs=('frontend',),
            data_files=('data/archive-core.json',),
            entry_points=('index.html', 'version.json'),
        )
        names = [f.relative_to(tmp_path).as_posix() for f in files]
        # Entry points are last, in the order declared.
        assert names[-2:] == ['index.html', 'version.json']
        # Everything else comes before — favicon, App.js, archive-core all
        # rendered before the entry points flip live.
        for asset in ('favicon.ico', 'frontend/App.js',
                      'data/archive-core.json'):
            assert names.index(asset) < names.index('index.html')

    def test_default_manifest_entry_point_order(self):
        # Smoke check the real production manifest (no synthetic repo) — the
        # actual deploy must follow the rule, not just the test fixture. The
        # entry group flips index.html, then the implementation, then its root
        # bridge, then version.json
        # (see _ENTRY_POINTS and TestServiceWorkerEntryPointOrder for why).
        files = deploy_full_site.collect_local_files(_REPO_ROOT)
        names = [f.relative_to(_REPO_ROOT).as_posix() for f in files]
        # Direct ordering checks give a diagnostic failure if the dir-walk guard
        # is dropped (sw.js would reappear at its alphabetical walk position).
        assert names.count('frontend/sw.js') == 1
        assert names.count('sw.js') == 1
        assert names.index('index.html') < names.index('frontend/sw.js')
        assert names.index('frontend/sw.js') < names.index('sw.js')
        assert names.index('sw.js') < names.index('version.json')
        assert names[-4:] == ['index.html', 'frontend/sw.js', 'sw.js', 'version.json']

    def test_record_shells_follow_assets_and_data_before_global_entries(self,
                                                                         tmp_path):
        (tmp_path / 'index.html').write_text('<html>')
        (tmp_path / 'version.json').write_text('{}')
        (tmp_path / 'frontend').mkdir()
        (tmp_path / 'frontend' / 'App.js').write_text('// app')
        (tmp_path / 'r').mkdir()
        (tmp_path / 'r' / 'RECORD-00002.html').write_text('<html>two</html>')
        (tmp_path / 'r' / 'RECORD-00001.html').write_text('<html>one</html>')
        (tmp_path / 'data').mkdir()
        (tmp_path / 'data' / 'archive-data.json').write_text('{"records": []}')

        files = deploy_full_site.collect_local_files(
            tmp_path,
            top_files=('index.html', 'version.json'),
            dirs=('r', 'frontend'),
            data_files=('data/archive-data.json',),
            entry_points=('index.html', 'version.json'),
        )
        names = [f.relative_to(tmp_path).as_posix() for f in files]

        for dependency in ('frontend/App.js', 'data/archive-data.json'):
            assert names.index(dependency) < names.index('r/RECORD-00001.html')
        assert names[-4:] == [
            'r/RECORD-00001.html',
            'r/RECORD-00002.html',
            'index.html',
            'version.json',
        ]

    def test_shared_data_modules_upload_before_frontend_importers(self):
        files = deploy_full_site.collect_local_files(_REPO_ROOT)
        names = [f.relative_to(_REPO_ROOT).as_posix() for f in files]

        assert names.index('data/eras.js') < names.index('frontend/constants.js')

    def test_data_file_generators_are_not_consumed_before_non_js_files(self,
                                                                       tmp_path):
        data_dir = tmp_path / 'data'
        data_dir.mkdir()
        (data_dir / 'eras.js').write_text('export const ERAS = [];')
        (data_dir / 'schema.json').write_text('{}')

        files = deploy_full_site.collect_local_files(
            tmp_path,
            top_files=(),
            dirs=(),
            data_files=(name for name in (
                'data/eras.js',
                'data/schema.json',
            )),
            entry_points=(),
        )

        assert [f.relative_to(tmp_path).as_posix() for f in files] == [
            'data/eras.js',
            'data/schema.json',
        ]

    def test_each_feature_html_uploads_after_its_dependencies(self, tmp_path):
        feature = tmp_path / 'features' / 'example'
        feature.mkdir(parents=True)
        (feature / 'index.html').write_text('<script src="./script.js"></script>')
        (feature / 'script.js').write_text('// browser dependency')
        (feature / 'styles.css').write_text('/* browser dependency */')

        files = deploy_full_site.collect_local_files(
            tmp_path,
            top_files=(),
            dirs=('features/example',),
            data_files=(),
            entry_points=(),
        )
        names = [f.relative_to(tmp_path).as_posix() for f in files]

        assert names.index('features/example/script.js') < names.index(
            'features/example/index.html')
        assert names.index('features/example/styles.css') < names.index(
            'features/example/index.html')

    def test_winer_entry_html_uploads_after_all_winer_dependencies(self):
        files = deploy_full_site.collect_local_files(_REPO_ROOT)
        names = [f.relative_to(_REPO_ROOT).as_posix() for f in files]
        entry = names.index('features/winer-method/index.html')
        dependencies = [
            name for name in names
            if name.startswith('features/winer-method/')
            and name != 'features/winer-method/index.html'
        ]

        assert dependencies
        assert all(names.index(name) < entry for name in dependencies)


class TestLinkedDataGuideDeployment:
    """The participation page's data-guide link must survive a full deploy."""

    def test_schema_markdown_is_in_canonical_manifest(self):
        assert 'data/SCHEMA.md' in deploy_full_site._DEPLOY_DATA_FILES


class TestServiceWorkerEntryPointOrder:
    """The root bridge and frontend/sw.js are version-flipping entry points.

    On install the worker precaches index.html and the JS/CSS bundle (cache.add)
    and then serves .html/.js/.css cache-first, so it snapshots whatever is live
    at install time. So the worker pair must flip AFTER index.html (and after
    the JS/CSS bundle, which uploads in the dir walk): if it flipped first, a client that
    registered the new worker before index.html renamed would precache the OLD
    index.html and pin it under the new CACHE_VERSION until the next deploy.
    version.json is not precached (network-first), so it stays last as the
    least-harmful stale state.
    """

    def test_sw_js_uploads_after_index_before_version(self, tmp_path):
        (tmp_path / 'index.html').write_text('<html>')
        (tmp_path / 'sw.js').write_text("importScripts('./frontend/sw.js')")
        (tmp_path / 'version.json').write_text('{}')
        fe = tmp_path / 'frontend'
        fe.mkdir()
        (fe / 'App.js').write_text('//')
        # viewState.js sorts AFTER sw.js — without the entry-point skip in the
        # dir walk, sw.js stays pinned to its early (alphabetical) slot and the
        # "sw.js after every JS/CSS asset" ordering would not hold.
        (fe / 'viewState.js').write_text('//')
        (fe / 'sw.js').write_text('//')

        files = deploy_full_site.collect_local_files(
            tmp_path,
            top_files=('index.html', 'sw.js', 'version.json'),
            dirs=('frontend',),
            data_files=(),
            entry_points=('index.html', 'frontend/sw.js', 'sw.js', 'version.json'),
        )
        names = [f.relative_to(tmp_path).as_posix() for f in files]

        assert names.count('frontend/sw.js') == 1, "sw.js must not be uploaded twice"
        assert names.count('sw.js') == 1, "root sw.js must not be uploaded twice"
        # The JS/CSS bundle the worker precaches uploads before sw.js...
        assert names.index('frontend/App.js') < names.index('frontend/sw.js')
        assert names.index('frontend/viewState.js') < names.index('frontend/sw.js')
        # ...and so does index.html, so the new worker snapshots an all-new tree.
        assert names.index('index.html') < names.index('frontend/sw.js')
        # The root bridge flips only after the implementation it imports;
        # version.json (not precached) remains last.
        assert names[-4:] == ['index.html', 'frontend/sw.js', 'sw.js', 'version.json']


class TestReferencedAssetsAreDeployed:
    """Every local asset a deployed HTML page references must be in the manifest.

    Regression guard for the bug class where a static asset lives OUTSIDE the
    deployed directory subtrees, so the dir walk never reaches it and a full
    deploy ships pages that reference a file it never uploads. Concretely:
      - favicon.svg (repo root) is referenced by index.html, the FAQ, the
        design-system demo, and both data tools, but is not under any deployed
        dir, so a manifest without it deploys pages with a broken SVG favicon.
      - tools/active/tailwind.css sits one level above the two deployed tool
        dirs; dataexplorer and dataviz load it as ../tailwind.css, so a manifest
        without it deploys both tools unstyled.
    Such a page only "works" on the live server when a past manual upload left
    the file there -- FTP does not delete unlisted files -- which hides the gap
    until a clean deploy or an asset change. This test resolves every
    <link>/<script>/<img> href/src and every <meta content=> image reference
    in every deployed HTML page and asserts the target is in the manifest, so
    the class cannot regress.

    Scope: only assets that EXIST in the repo are in scope, since this guards
    manifest drift. A reference to a file absent from the repo is a dangling or
    live-only asset the manifest cannot ship -- a separate broken-link concern.
    """

    # href/src on the tags that pull in a static asset. The (?<![\w-]) guard
    # anchors the attribute so a data-src / data-href decoy is not read as the
    # real src / href (\b alone matches after the hyphen in data-src).
    _TAG_REF_RE = re.compile(
        r'<(?:link|script|img)\b[^>]*?(?<![\w-])(?:href|src)\s*=\s*'
        r'["\']([^"\']+)["\']',
        re.IGNORECASE | re.DOTALL,
    )
    # A whole <meta> element, so we can read its property/name before deciding
    # whether its content is an asset URL. The (?<![\w-]) guard anchors each
    # attribute to a real boundary so data-property / data-content decoys do
    # not read as the property / content attributes (\b alone matches after the
    # hyphen in data-property).
    _META_TAG_RE = re.compile(r'<meta\b[^>]*?>', re.IGNORECASE | re.DOTALL)
    _META_KEY_RE = re.compile(
        r'(?<![\w-])(?:property|name)\s*=\s*["\']([^"\']+)["\']', re.IGNORECASE)
    _META_CONTENT_RE = re.compile(
        r'(?<![\w-])content\s*=\s*["\']([^"\']+)["\']', re.IGNORECASE)
    # <meta> keys whose content is a deployable image URL. The social-card
    # assets are referenced ONLY here (never via href/src) and with the
    # absolute live URL, so a href/src-only scan misses them. Scoping to these
    # keys keeps prose (og:title, og:description) and dimensions
    # (og:image:width) out of path resolution.
    _IMAGE_META_KEYS = frozenset({
        'og:image', 'og:image:url', 'og:image:secure_url',
        'twitter:image', 'twitter:image:src',
    })
    _SITE_ORIGIN = 'https://pressthink.org'
    _SITE_HOST = urlsplit(_SITE_ORIGIN).hostname  # single source: 'pressthink.org'
    _SITE_ROOT_PREFIX = '/j/rosen-archive/'

    def _deployed_relpaths(self):
        files = deploy_full_site.collect_local_files(_REPO_ROOT)
        return {f.relative_to(_REPO_ROOT).as_posix() for f in files}

    def _image_meta_refs(self, text):
        """Content URLs of the image-bearing <meta> tags (og:image etc.).

        A tag can carry more than one key attribute (e.g. name= for prose plus
        property= for the image), so every name/property value is checked, not
        just the first. A tag counts as image-bearing if any of its keys is an
        image key.
        """
        refs = []
        for tag in self._META_TAG_RE.findall(text):
            keys = {k.strip().lower() for k in self._META_KEY_RE.findall(tag)}
            if keys & self._IMAGE_META_KEYS:
                content = self._META_CONTENT_RE.search(tag)
                if content:
                    refs.append(content.group(1))
        return refs

    def _resolve_asset_ref(self, html_path, raw):
        """Map one raw href/src/image-meta value to the repo-relative file it
        points at, or None when it is not a repo path this manifest could ship
        (external host, non-file scheme, or a path that escapes the repo).

        No extension filter: every value reaching here is a resource URL, so
        whether it is a shippable asset is decided by existence in
        _page_asset_problems, not by a hardcoded suffix allowlist.
        """
        ref = raw.split('#', 1)[0].split('?', 1)[0].strip()
        if not ref:
            return None
        parts = urlsplit(ref)
        if parts.scheme or ref.startswith('//'):
            # An absolute or protocol-relative URL. Only our own origin maps
            # back to the repo: a non-http(s) scheme (data:/mailto:/tel:/
            # javascript:/blob:) or any other host is not a repo asset. urlsplit
            # lowercases and drops the port from .hostname, so //pressthink.org/
            # and https://pressthink.org:443/ resolve to the same origin as the
            # canonical https form (og:image / twitter:image use the live URL).
            if parts.scheme and parts.scheme not in ('http', 'https'):
                return None
            if (parts.hostname or '') != self._SITE_HOST:
                return None
            site_path = parts.path
        elif ref.startswith('/'):
            site_path = ref
        else:
            # A relative reference resolves against the page's own directory.
            html_dir = html_path.parent.relative_to(_REPO_ROOT).as_posix()
            return self._repo_rel(posixpath.join(html_dir, ref))
        # Absolute or site-root path: only production site-root paths map back
        # to the repo; any other (e.g. /wp-content/...) is not a repo asset.
        if not site_path.startswith(self._SITE_ROOT_PREFIX):
            return None
        return self._repo_rel(site_path[len(self._SITE_ROOT_PREFIX):])

    @staticmethod
    def _repo_rel(rel):
        """Normalize a repo-relative URL path lexically (collapse . and .. the
        way a browser does) and bound it to the repo.

        Lexical, not Path.resolve(): a URL path is a string, so normalization
        must not touch the filesystem or dereference a symlink into its target
        -- that would hide that the URL-visible alias itself is unshipped. A
        path that climbs out of the checkout is not ours to ship.
        """
        norm = posixpath.normpath(rel)
        if norm in ('.', '..') or norm.startswith(('../', '/')):
            return None
        return norm

    def _page_asset_problems(self, deployed, rel_html):
        html_path = _REPO_ROOT / rel_html
        text = html_path.read_text(encoding='utf-8', errors='replace')
        raws = self._TAG_REF_RE.findall(text) + self._image_meta_refs(text)
        problems = []
        for raw in raws:
            target_rel = self._resolve_asset_ref(html_path, raw)
            if target_rel is None:
                continue
            # In scope: a file that EXISTS in the repo but sits outside the
            # deployed dir walk, so the manifest misses it. A ref to a file
            # absent from the repo is a dangling / live-only reference the
            # manifest cannot ship -- a separate broken-link concern, not
            # manifest drift -- so skip it here.
            if not (_REPO_ROOT / target_rel).is_file():
                continue
            if target_rel not in deployed:
                problems.append(
                    f'{rel_html} references {raw!r} -> {target_rel} '
                    f'(not in the deploy manifest)'
                )
        return problems

    def test_deployed_html_asset_refs_are_all_shipped(self):
        deployed = self._deployed_relpaths()
        deployed_html = sorted(p for p in deployed if p.endswith('.html'))
        assert deployed_html, "expected deployed HTML pages in the manifest"

        problems = []
        for rel_html in deployed_html:
            problems.extend(self._page_asset_problems(deployed, rel_html))

        assert not problems, (
            'deployed pages reference local assets the manifest does not '
            'ship:\n  ' + '\n  '.join(sorted(problems))
        )

    def test_meta_social_card_asset_is_covered(self):
        """og:image / twitter:image are referenced only via <meta content=>
        absolute URLs. The resolver must map the production origin back to the
        repo file, and dropping the asset from the manifest must fail the scan
        -- otherwise the social-card gap (og-image.png) regresses silently.
        """
        index = _REPO_ROOT / 'index.html'
        ref = f'{self._SITE_ORIGIN}{self._SITE_ROOT_PREFIX}og-image.png'
        assert self._resolve_asset_ref(index, ref) == 'og-image.png'

        deployed = self._deployed_relpaths()
        deployed.discard('og-image.png')
        problems = self._page_asset_problems(deployed, 'index.html')
        assert any('og-image.png' in p for p in problems), (
            'meta og:image asset is not covered by the deploy regression guard'
        )

    def test_resolve_covers_non_whitelisted_asset_types(self):
        """The resolver must not drop a reference by its file extension.

        A <link>/<script>/<img> href/src, and an og:image / twitter:image
        content URL, is a resource path whatever its suffix: a web manifest,
        an .avif hero, or the dissertation PDF all name a file the deploy
        must ship. Gating resolution on an extension allowlist let a deployed
        reference to any type not on the list 404 after a clean deploy while
        the guard reported nothing -- exactly the omission class it exists to
        catch. Existence, not extension, decides scope (see _page_asset_problems).
        """
        index = _REPO_ROOT / 'index.html'
        pdf = ('dissertation/reader/'
               'THE_IMPOSSIBLE_PRESS_NYU_ROSEN-JAY-1986.pdf')
        cases = {
            f'{self._SITE_ORIGIN}{self._SITE_ROOT_PREFIX}site.webmanifest':
                'site.webmanifest',
            './hero.avif': 'hero.avif',
            f'{self._SITE_ORIGIN}{self._SITE_ROOT_PREFIX}{pdf}': pdf,
        }
        for raw, expected in cases.items():
            assert self._resolve_asset_ref(index, raw) == expected, raw

    def test_resolve_normalizes_and_bounds_site_root_paths(self):
        """A site-root path must resolve to its normalized manifest key and
        stay inside the repo, matching the relative branch and the docstring.

        A browser reads `/j/rosen-archive/frontend/../og-image.png` as the
        deployed root image, so it must map to `og-image.png`, not the raw
        `frontend/../og-image.png` (which no manifest key equals, so the guard
        would falsely report the shipped image missing). A path that climbs out
        of the site root is not a repo asset and must return None, not a string
        that escapes the checkout.
        """
        index = _REPO_ROOT / 'index.html'
        assert self._resolve_asset_ref(
            index, f'{self._SITE_ROOT_PREFIX}frontend/../og-image.png'
        ) == 'og-image.png'
        assert self._resolve_asset_ref(
            index, f'{self._SITE_ORIGIN}{self._SITE_ROOT_PREFIX}'
            'frontend/../favicon.svg'
        ) == 'favicon.svg'
        assert self._resolve_asset_ref(
            index, f'{self._SITE_ROOT_PREFIX}../../etc/passwd'
        ) is None

    def test_tag_ref_re_ignores_data_prefixed_attributes(self):
        """href/src extraction must not read a data-src / data-href decoy as
        the real attribute. \\b alone matches after the hyphen in data-src, so
        a lazy-load placeholder would be scanned instead of the src a browser
        actually loads -- the same data-* class fixed in the meta regexes.
        """
        assert self._TAG_REF_RE.findall(
            "<img data-src='./placeholder.png' src='../og-image.png'>"
        ) == ['../og-image.png']
        # a normal single-attribute tag still matches
        assert self._TAG_REF_RE.findall(
            '<link rel="icon" href="/j/rosen-archive/favicon.svg">'
        ) == ['/j/rosen-archive/favicon.svg']

    def test_image_meta_refs_reads_every_attribute_exactly(self):
        """The meta scan must inspect every name/property on a tag, not just
        the first, and must not treat data-* attributes as the real key or
        content. A social card can carry prose in an earlier name= while the
        image lives in a later property=, or carry data-property/data-content
        decoys; the first-match, data-blind scan misread both.
        """
        cases = {
            '<meta content="card.png" property="og:image" />': ['card.png'],
            '<meta name="description" property="og:image" '
            'content="card.png" />': ['card.png'],
            '<meta property="og:image" data-content="ignored" '
            'content="card.png" />': ['card.png'],
            '<meta data-property="og:image" content="card.png" />': [],
        }
        for tag, expected in cases.items():
            assert self._image_meta_refs(tag) == expected, tag

    def test_resolve_handles_same_origin_url_variants(self):
        """og:image can be authored as a protocol-relative or explicit-port
        URL to our own origin; a browser resolves both to the same deployed
        file as the canonical https form, so the guard must too. A genuinely
        different host is still skipped.
        """
        index = _REPO_ROOT / 'index.html'
        for raw in (
            f'//pressthink.org{self._SITE_ROOT_PREFIX}og-image.png',
            f'https://pressthink.org:443{self._SITE_ROOT_PREFIX}og-image.png',
        ):
            assert self._resolve_asset_ref(index, raw) == 'og-image.png', raw
        assert self._resolve_asset_ref(
            index, f'https://evil.example{self._SITE_ROOT_PREFIX}og-image.png'
        ) is None


class TestKnownHostsHandling:
    """The ROSEN_SFTP_KNOWN_HOSTS secret can hold a path OR raw host-key
    content. The script must accept both: empty host-keys + RejectPolicy
    would otherwise fail every connect.
    """

    def test_path_value_is_loaded_directly(self, monkeypatch, tmp_path):
        kh_file = tmp_path / 'kh'
        kh_file.write_text('pressthink.org ssh-ed25519 AAAA\n')
        _set_env(monkeypatch, ROSEN_SFTP_KNOWN_HOSTS=str(kh_file))
        (tmp_path / 'index.html').write_text('<html>')

        with patch('paramiko.SSHClient') as mock_client_cls:
            mock_client = MagicMock()
            mock_client.open_sftp.return_value = MagicMock()
            mock_client_cls.return_value = mock_client

            deploy_full_site.push_files(
                [tmp_path / 'index.html'],
                repo_root=tmp_path,
                cfg=deploy_full_site._read_env(),
            )

        # The real path was passed straight to load_host_keys.
        mock_client.load_host_keys.assert_called_once_with(str(kh_file))

    @pytest.mark.parametrize('host_key_content', [
        # ssh-prefixed algorithms
        'pressthink.org ssh-ed25519 AAAAC3NzaC1lZDI1NTE5',
        'pressthink.org ssh-rsa AAAAB3NzaC1yc2EAAAADAQAB',
        # ECDSA algorithms — these do NOT start with 'ssh-' and would have
        # been silently dropped by an allowlist-style content check, leaving
        # the deploy connect to fail under RejectPolicy with empty host keys.
        'pressthink.org ecdsa-sha2-nistp256 AAAAE2VjZHNhLXNoYTItbmlzdHAyNTY',
        'pressthink.org ecdsa-sha2-nistp384 AAAAE2VjZHNhLXNoYTItbmlzdHAzODQ',
        # Hashed-host prefix
        '|1|F1E2D3C4|ssh-ed25519 AAAAC3NzaC1lZDI1NTE5',
    ], ids=['ed25519', 'rsa', 'ecdsa256', 'ecdsa384', 'hashed'])
    def test_content_value_is_materialized_to_tempfile(
        self, monkeypatch, tmp_path, host_key_content,
    ):
        _set_env(monkeypatch, ROSEN_SFTP_KNOWN_HOSTS=host_key_content)
        (tmp_path / 'index.html').write_text('<html>')

        with patch('paramiko.SSHClient') as mock_client_cls:
            mock_client = MagicMock()
            mock_client.open_sftp.return_value = MagicMock()
            mock_client_cls.return_value = mock_client

            deploy_full_site.push_files(
                [tmp_path / 'index.html'],
                repo_root=tmp_path,
                cfg=deploy_full_site._read_env(),
            )

        # load_host_keys was called with a temp-file path (not the raw
        # content) — the content was materialized regardless of algorithm.
        assert mock_client.load_host_keys.call_count == 1
        loaded_path = mock_client.load_host_keys.call_args.args[0]
        assert loaded_path != host_key_content
        assert loaded_path.endswith('.known_hosts')


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
        assert 'would remove 7 retired directories' in out
        assert 'dissertation/comparison' in out

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


class TestRetiredRoutes:
    """Full deploys remove retired public routes."""

    def test_prune_manifest_matches_removed_routes(self):
        expected = (
            'dissertation/comparison',
            'dissertation/concepts',
            'dissertation/context',
            'dissertation/excerpts',
            'dissertation/glossary',
            'dissertation/timeline',
            'features/status-report',
        )
        assert deploy_full_site._REMOTE_PRUNE_DIRS == expected
        archived_tools_root = _REPO_ROOT / 'archived' / 'dissertation-tools'
        for relpath in expected[:-1]:
            route_name = pathlib.PurePosixPath(relpath).name
            assert not (archived_tools_root / route_name).exists()

        assert not (_REPO_ROOT / 'features' / 'status-report').exists()
        assert 'features/status-report' not in deploy_full_site._DEPLOY_DIRS

        # Issue #166 removes only retired tools. Both live development tools
        # remain tracked and in the upload manifest.
        for relpath in (
            'tools/active/dataexplorer',
            'tools/active/dataviz',
        ):
            assert (_REPO_ROOT / relpath).is_dir()
            assert relpath in deploy_full_site._DEPLOY_DIRS

    def test_remote_prune_runs_after_uploads(self, monkeypatch, tmp_path):
        _set_env(monkeypatch)
        (tmp_path / 'index.html').write_text('<html>')

        with patch('paramiko.SSHClient') as mock_client_cls:
            mock_client = MagicMock()
            mock_sftp = MagicMock()
            mock_sftp.listdir_attr.return_value = []
            mock_client.open_sftp.return_value = mock_sftp
            mock_client_cls.return_value = mock_client

            result = deploy_full_site.push_files(
                [tmp_path / 'index.html'],
                repo_root=tmp_path,
                cfg=deploy_full_site._read_env(),
                remote_prune_dirs=('dissertation/comparison',),
            )

        assert result['ok'] is True
        remote_dir = (
            '/home/rosen/public_html/j/rosen-archive/'
            'dissertation/comparison'
        )
        mock_sftp.rmdir.assert_called_once_with(remote_dir)
        upload_call = next(
            i for i, call in enumerate(mock_sftp.method_calls)
            if call[0] == 'posix_rename'
        )
        prune_call = next(
            i for i, call in enumerate(mock_sftp.method_calls)
            if call[0] == 'rmdir'
        )
        assert prune_call > upload_call

    def test_remote_prune_removes_nested_files_before_directories(self):
        sftp = MagicMock()
        root = '/site/dissertation/context'
        assets = f'{root}/assets'
        listings = {
            root: [
                SimpleNamespace(filename='index.html', st_mode=stat.S_IFREG),
                SimpleNamespace(filename='assets', st_mode=stat.S_IFDIR),
            ],
            assets: [
                SimpleNamespace(filename='app.js', st_mode=stat.S_IFREG),
            ],
        }
        sftp.listdir_attr.side_effect = lambda path: listings[path]

        assert deploy_full_site._remove_remote_tree(sftp, root) is True
        assert [call.args[0] for call in sftp.remove.call_args_list] == [
            f'{root}/index.html',
            f'{assets}/app.js',
        ]
        assert [call.args[0] for call in sftp.rmdir.call_args_list] == [
            assets,
            root,
        ]

    def test_remote_prune_treats_missing_directory_as_complete(self):
        sftp = MagicMock()
        sftp.listdir_attr.side_effect = FileNotFoundError(
            errno.ENOENT, 'not found',
        )
        sftp.stat.side_effect = FileNotFoundError(errno.ENOENT, 'not found')

        assert deploy_full_site._remove_remote_tree(
            sftp, '/site/dissertation/context',
        ) is False
        sftp.rmdir.assert_not_called()

    def test_remote_prune_does_not_hide_permission_errors(self):
        sftp = MagicMock()
        denied = PermissionError(errno.EACCES, 'permission denied')
        sftp.listdir_attr.side_effect = denied
        sftp.stat.side_effect = denied

        with pytest.raises(PermissionError, match='permission denied'):
            deploy_full_site._remove_remote_tree(
                sftp, '/site/dissertation/context',
            )


class TestRecordShellReconciliation:
    """A full deploy makes remote r/*.html match the generated archive."""

    def test_removes_only_stale_safe_regular_shells_after_uploads(
            self, monkeypatch, tmp_path):
        _set_env(monkeypatch)
        (tmp_path / 'index.html').write_text('<html>')
        current = tmp_path / 'r' / 'RECORD-00001.html'
        current.parent.mkdir()
        current.write_text('<html>current</html>')

        with patch('paramiko.SSHClient') as mock_client_cls:
            mock_client = MagicMock()
            mock_sftp = MagicMock()
            mock_sftp.listdir_attr.return_value = [
                SimpleNamespace(filename='RECORD-00001.html', st_mode=stat.S_IFREG),
                SimpleNamespace(filename='STALE-00002.html', st_mode=stat.S_IFREG),
                SimpleNamespace(filename='notes.txt', st_mode=stat.S_IFREG),
                SimpleNamespace(filename='STALE-00003.html.tmp', st_mode=stat.S_IFREG),
                SimpleNamespace(filename='nested', st_mode=stat.S_IFDIR),
                SimpleNamespace(filename='LINK-00004.html', st_mode=stat.S_IFLNK),
            ]
            mock_client.open_sftp.return_value = mock_sftp
            mock_client_cls.return_value = mock_client

            result = deploy_full_site.push_files(
                [tmp_path / 'index.html', current],
                repo_root=tmp_path,
                cfg=deploy_full_site._read_env(),
                remote_prune_dirs=(),
                record_shells=(current,),
            )

        assert result['ok'] is True
        assert mock_sftp.remove.call_args_list == [
            ((
                '/home/rosen/public_html/j/rosen-archive/'
                'r/STALE-00002.html',
            ),),
        ]
        last_rename = max(
            i for i, call in enumerate(mock_sftp.method_calls)
            if call[0] == 'posix_rename'
        )
        prune = next(
            i for i, call in enumerate(mock_sftp.method_calls)
            if call[0] == 'remove'
        )
        assert prune > last_rename

    def test_none_disables_reconciliation_and_empty_set_clears_shells(
            self, monkeypatch, tmp_path):
        _set_env(monkeypatch)
        (tmp_path / 'index.html').write_text('<html>')

        with patch('paramiko.SSHClient') as mock_client_cls:
            mock_client = MagicMock()
            mock_sftp = MagicMock()
            mock_sftp.listdir_attr.return_value = [
                SimpleNamespace(filename='STALE.html', st_mode=stat.S_IFREG),
            ]
            mock_client.open_sftp.return_value = mock_sftp
            mock_client_cls.return_value = mock_client

            deploy_full_site.push_files(
                [tmp_path / 'index.html'], tmp_path,
                deploy_full_site._read_env(), remote_prune_dirs=(),
                record_shells=None,
            )
            mock_sftp.listdir_attr.assert_not_called()

            result = deploy_full_site.push_files(
                [tmp_path / 'index.html'], tmp_path,
                deploy_full_site._read_env(), remote_prune_dirs=(),
                record_shells=(),
            )

        assert result['ok'] is True
        mock_sftp.remove.assert_called_once_with(
            '/home/rosen/public_html/j/rosen-archive/r/STALE.html')

    def test_upload_failure_skips_shell_reconciliation(self, monkeypatch,
                                                        tmp_path):
        _set_env(monkeypatch)
        (tmp_path / 'index.html').write_text('<html>')

        with patch('paramiko.SSHClient') as mock_client_cls:
            mock_client = MagicMock()
            mock_sftp = MagicMock()
            mock_sftp.put.side_effect = IOError('disk full')
            mock_client.open_sftp.return_value = mock_sftp
            mock_client_cls.return_value = mock_client

            result = deploy_full_site.push_files(
                [tmp_path / 'index.html'], tmp_path,
                deploy_full_site._read_env(), remote_prune_dirs=(),
                record_shells=(),
            )

        assert result['ok'] is False
        mock_sftp.listdir_attr.assert_not_called()


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
