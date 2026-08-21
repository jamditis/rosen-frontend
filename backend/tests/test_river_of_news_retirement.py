# -*- coding: utf-8 -*-
from __future__ import annotations

import errno
import importlib.util
import pathlib
import sys
from unittest.mock import MagicMock, patch

import pytest

_BACKEND = pathlib.Path(__file__).resolve().parents[1]
if str(_BACKEND) not in sys.path:
    sys.path.insert(0, str(_BACKEND))

pytest.importorskip('paramiko')

_spec = importlib.util.spec_from_file_location(
    'deploy_full_site_river_test',
    _BACKEND / 'scripts' / 'deploy_full_site.py',
)
deploy_full_site = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(deploy_full_site)


def test_river_module_is_an_exact_post_upload_prune_target():
    assert deploy_full_site._REMOTE_PRUNE_FILES == (
        'frontend/components/RiverOfNews.js',
    )


def test_missing_retired_file_is_idempotent():
    remote = MagicMock()
    remote.remove.side_effect = FileNotFoundError(errno.ENOENT, 'not found')

    removed = deploy_full_site._remove_remote_file(
        remote,
        '/site/RiverOfNews.js',
    )

    assert removed is False


def test_retired_file_prune_runs_after_successful_upload(tmp_path):
    local = tmp_path / 'index.html'
    local.write_text('<html>', encoding='utf-8')
    remote = MagicMock()
    cfg = {
        'protocol': 'sftp',
        'host': 'sftp.example.com',
        'port': 22,
        'user': 'rosen',
        'site_path': '/home/rosen/public_html/j/rosen-archive',
        'password': 'secret',
        'key_path': None,
        'key_passphrase': None,
        'known_hosts': '/tmp/known_hosts',
    }

    with patch.object(
        deploy_full_site.remote_transfer,
        'connect_remote',
        return_value=remote,
    ):
        result = deploy_full_site.push_files(
            [local],
            repo_root=tmp_path,
            cfg=cfg,
            remote_prune_dirs=(),
            remote_prune_files=('frontend/components/RiverOfNews.js',),
        )

    assert result['ok'] is True
    retired = (
        '/home/rosen/public_html/j/rosen-archive/'
        'frontend/components/RiverOfNews.js'
    )
    upload_index = next(
        i for i, call in enumerate(remote.method_calls)
        if call[0] == 'posix_rename'
    )
    prune_index = next(
        i for i, call in enumerate(remote.method_calls)
        if call[0] == 'remove' and call.args == (retired,)
    )
    assert prune_index > upload_index
