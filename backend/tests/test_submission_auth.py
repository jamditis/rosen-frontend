# -*- coding: utf-8 -*-
"""Tests for the submission-server shared-secret auth gate (issue #136)."""
import importlib
import pathlib
import sys

import pytest

# Flask is only installed in the Poetry/CI environment; skip cleanly elsewhere.
pytest.importorskip("flask")

# submission_server lives at backend/submission_server, not under src/.
_BACKEND = pathlib.Path(__file__).resolve().parents[1]
if str(_BACKEND) not in sys.path:
    sys.path.insert(0, str(_BACKEND))


@pytest.fixture
def client(monkeypatch):
    """A test client for an app instance configured with an auth token."""
    monkeypatch.setenv("SUBMISSION_AUTH_TOKEN", "test-secret")
    # Reload config then app so both pick up the token from the environment.
    from submission_server import config as config_mod
    importlib.reload(config_mod)
    from submission_server import app as app_mod
    importlib.reload(app_mod)
    app_mod.app.config.update(TESTING=True)
    return app_mod.app.test_client()


def test_request_without_token_is_rejected(client):
    assert client.get("/queue").status_code == 401


def test_token_via_query_param_is_accepted(client):
    assert client.get("/queue?token=test-secret").status_code == 200


def test_token_via_header_is_accepted(client):
    resp = client.get("/queue", headers={"X-Auth-Token": "test-secret"})
    assert resp.status_code == 200


def test_wrong_token_is_rejected(client):
    assert client.get("/queue?token=wrong").status_code == 401
