# -*- coding: utf-8 -*-
"""Tests for /submit request rate limiting (issue #262)."""
import importlib
import pathlib
import sys

import pytest

pytest.importorskip("flask")

_BACKEND = pathlib.Path(__file__).resolve().parents[1]
if str(_BACKEND) not in sys.path:
    sys.path.insert(0, str(_BACKEND))


@pytest.fixture
def client(tmp_path, monkeypatch):
    """A test client with low submission limits and a throwaway database."""
    monkeypatch.setenv("SUBMISSION_AUTH_TOKEN", "test-secret")
    monkeypatch.setenv("SUBMISSION_RATE_LIMIT_PER_MINUTE", "2")
    monkeypatch.setenv("SUBMISSION_RATE_LIMIT_PER_HOUR", "3")

    db_path = tmp_path / "submissions.db"
    from submission_server import config as config_mod

    importlib.reload(config_mod)
    monkeypatch.setattr(config_mod, "DATABASE_PATH", db_path)

    from submission_server import db as db_mod

    importlib.reload(db_mod)
    monkeypatch.setattr(db_mod, "DATABASE_PATH", db_path)
    db_mod.init_db()

    from submission_server import app as app_mod

    importlib.reload(app_mod)
    app_mod.app.config.update(TESTING=True)
    return app_mod.app.test_client()


def _post(client, suffix, token="test-secret", ip="203.0.113.10"):
    return client.post(
        "/submit",
        json={"url": f"https://example.com/rate-{suffix}"},
        headers={"X-Auth-Token": token},
        environ_base={"REMOTE_ADDR": ip},
    )


def test_submit_rate_limit_blocks_bursts_per_ip(client):
    assert _post(client, "one").status_code == 200
    assert _post(client, "two").status_code == 200

    resp = _post(client, "three")

    assert resp.status_code == 429
    body = resp.get_json()
    assert body["ok"] is False
    assert "too many submissions" in body["error"].lower()


def test_submit_rate_limit_blocks_shared_token_across_ips(client):
    assert _post(client, "one", ip="203.0.113.11").status_code == 200
    assert _post(client, "two", ip="203.0.113.12").status_code == 200

    resp = _post(client, "three", ip="203.0.113.13")

    assert resp.status_code == 429
    body = resp.get_json()
    assert body["ok"] is False
    assert "too many submissions" in body["error"].lower()
