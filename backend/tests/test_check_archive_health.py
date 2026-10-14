import datetime
import http.client
import io
import json
from pathlib import Path
import subprocess
import sys
import textwrap
import urllib.error
import urllib.request

from scripts import check_archive_health as watcher


NOW = datetime.datetime(2026, 10, 14, 17, 0, tzinfo=datetime.timezone.utc)
REPOSITORY_ROOT = Path(__file__).resolve().parents[2]


class _Response:
    def __init__(self, *, status=200, payload=None, body=None, headers=None, url=None):
        self.status = status
        if body is None:
            body = json.dumps(payload).encode("utf-8")
        self._body = io.BytesIO(body)
        self.headers = headers or {}
        self._url = url or watcher.HEALTH_URL
        self.closed = False
        self.read_sizes = []

    def read(self, size=-1):
        self.read_sizes.append(size)
        return self._body.read(size)

    def getcode(self):
        return self.status

    def geturl(self):
        return self._url

    def close(self):
        self.closed = True
        self._body.close()


class _IncompleteResponse(_Response):
    def read(self, size=-1):
        self.read_sizes.append(size)
        raise http.client.IncompleteRead(b'{"healthy":', 100)


def _health_payload(
    *,
    healthy=True,
    discovery_healthy=True,
    ingestion_healthy=True,
    ingestion_status="published",
    error_class=None,
):
    return {
        "healthy": healthy,
        "discovery": [
            {
                "sourceId": "jay-rosen-bluesky",
                "lastCheckedAt": "2026-10-14T16:58:00Z",
                "lastSuccessAt": "2026-10-14T16:58:00Z",
                "lastStatus": "ok" if discovery_healthy else "request_failed",
                "healthy": discovery_healthy,
            }
        ],
        "ingestion": {
            "status": ingestion_status,
            "checkedAt": "2026-10-14T16:59:00Z",
            "canonicalCommit": "a" * 40,
            "releaseVersion": "3.8.38",
            "healthy": ingestion_healthy,
            "errorClass": error_class,
        },
    }


def _request_for(response, calls=None):
    def request(request, **kwargs):
        if calls is not None:
            calls.append((request, kwargs))
        if isinstance(response, urllib.error.HTTPError):
            raise response
        return response

    return request


def _http_error(*, status, payload=None, body=None, headers=None):
    if body is None:
        body = json.dumps(payload).encode("utf-8")
    return urllib.error.HTTPError(
        watcher.HEALTH_URL,
        status,
        "test response",
        headers or {},
        io.BytesIO(body),
    )


def _run(state_path, response, *, notify=False, sender=lambda _message: None):
    return watcher.run_check(
        state_path=state_path,
        notify=notify,
        request_fn=_request_for(response),
        sender_fn=sender,
        now_fn=lambda: NOW,
    )


def test_healthy_check_uses_only_the_fixed_bounded_request(tmp_path):
    calls = []
    response = _Response(payload=_health_payload())

    report, exit_code = watcher.run_check(
        state_path=tmp_path / "state.json",
        notify=False,
        request_fn=_request_for(response, calls),
        sender_fn=lambda _message: (_ for _ in ()).throw(
            AssertionError("notification must not be sent")
        ),
        now_fn=lambda: NOW,
    )

    assert exit_code == watcher.EXIT_HEALTHY
    assert report["health"] == "healthy"
    assert report["discovery_count"] == 1
    assert report["ingestion_status"] == "published"
    assert report["affected_components"] == []
    assert report["affected_sources"] == []
    assert report["consecutive_failures"] == 0
    assert report["notification"] == {"event": None, "status": "not_needed"}
    assert len(calls) == 1
    request = calls[0][0]
    assert isinstance(request, urllib.request.Request)
    assert request.full_url == watcher.HEALTH_URL
    assert request.get_method() == "GET"
    assert calls[0][1]["timeout"] == watcher.REQUEST_TIMEOUT_SECONDS
    assert request.get_header("Accept-encoding") == "identity"
    assert response.closed is True


def test_native_http_redirect_response_is_rejected_without_retry(tmp_path):
    calls = []
    response = _http_error(
        status=302,
        body=b"",
        headers={"Location": "https://example.com/not-allowlisted"},
    )

    report, exit_code = watcher.run_check(
        state_path=tmp_path / "state.json",
        notify=False,
        request_fn=_request_for(response, calls),
        now_fn=lambda: NOW,
    )

    assert exit_code == watcher.EXIT_OUTAGE
    assert report["http_status"] == 302
    assert report["error"] == "unexpected_http_status"
    assert len(calls) == 1
    assert calls[0][0].full_url == watcher.HEALTH_URL


def test_protocol_read_failures_follow_outage_alert_progression(tmp_path):
    state_path = tmp_path / "state.json"
    messages = []
    responses = [_IncompleteResponse(body=b""), _IncompleteResponse(body=b"")]

    first, first_exit = _run(
        state_path,
        responses[0],
        notify=True,
        sender=messages.append,
    )
    second, second_exit = _run(
        state_path,
        responses[1],
        notify=True,
        sender=messages.append,
    )

    assert first_exit == watcher.EXIT_OUTAGE
    assert first["error"] == "request_failed"
    assert first["consecutive_failures"] == 1
    assert first["notification"] == {"event": None, "status": "below_threshold"}
    assert second_exit == watcher.EXIT_OUTAGE
    assert second["error"] == "request_failed"
    assert second["consecutive_failures"] == 2
    assert second["notification"] == {"event": "outage", "status": "sent"}
    assert second["alert_active"] is True
    assert len(messages) == 1
    assert all(response.closed for response in responses)


def test_reported_false_health_cannot_pass_on_http_200(tmp_path):
    report, exit_code = _run(
        tmp_path / "state.json",
        _Response(payload=_health_payload(healthy=False)),
    )

    assert exit_code == watcher.EXIT_DEGRADED
    assert report["health"] == "degraded"
    assert report["error"] == "reported_unhealthy"
    assert report["affected_components"] == [
        "archive discovery",
        "archive publication",
    ]
    assert report["consecutive_failures"] == 1
    assert report["alert_active"] is False


def test_old_configuration_only_health_payload_cannot_false_green(tmp_path):
    old_payload = {
        "status": "ok",
        "mode": "live",
        "manifestVersion": "2026-08-14.3",
        "sources": [{"id": "jay-rosen-bluesky", "kind": "atproto-author-feed"}],
    }

    report, exit_code = _run(
        tmp_path / "state.json",
        _Response(payload=old_payload),
    )

    assert exit_code == watcher.EXIT_OUTAGE
    assert report["health"] == "outage"
    assert report["error"] == "invalid_payload"


def test_http_200_with_malformed_nested_health_is_an_outage(tmp_path):
    payload = _health_payload()
    payload["discovery"][0]["healthy"] = "true"

    report, exit_code = _run(
        tmp_path / "state.json",
        _Response(payload=payload),
    )

    assert exit_code == watcher.EXIT_OUTAGE
    assert report["health"] == "outage"
    assert report["error"] == "invalid_payload"


def test_http_503_exposes_only_validated_failed_ingestion_diagnostics(tmp_path):
    state_path = tmp_path / "state.json"
    payload = _health_payload(
        healthy=False,
        ingestion_healthy=False,
        ingestion_status="receipt_stale",
        error_class="publication_receipt_stale",
    )
    messages = []

    first, first_exit = _run(
        state_path,
        _http_error(status=503, payload=payload),
        notify=True,
        sender=messages.append,
    )
    second, second_exit = _run(
        state_path,
        _http_error(status=503, payload=payload),
        notify=True,
        sender=messages.append,
    )

    assert first_exit == watcher.EXIT_OUTAGE
    assert first["affected_components"] == ["archive publication"]
    assert first["affected_sources"] == []
    assert first["ingestion_status"] == "receipt_stale"
    assert first["error_class"] == "publication_receipt_stale"
    assert second_exit == watcher.EXIT_OUTAGE
    assert second["notification"] == {"event": "outage", "status": "sent"}
    assert len(messages) == 1
    assert "Affected: archive publication" in messages[0]
    assert "publication_receipt_stale" in messages[0]
    assert watcher.ACTIONS_URL in messages[0]
    assert watcher.RUNBOOK_PATH in messages[0]


def test_http_503_exposes_validated_failed_discovery_source(tmp_path):
    report, exit_code = _run(
        tmp_path / "state.json",
        _http_error(
            status=503,
            payload=_health_payload(healthy=False, discovery_healthy=False),
        ),
    )

    assert exit_code == watcher.EXIT_OUTAGE
    assert report["affected_components"] == ["archive discovery"]
    assert report["affected_sources"] == ["jay-rosen-bluesky"]
    assert report["error_class"] is None


def test_outage_alert_is_deduplicated_and_followed_by_one_recovery(tmp_path):
    state_path = tmp_path / "state.json"
    messages = []

    first, first_exit = _run(
        state_path,
        _http_error(status=503, body=b"unavailable"),
        notify=True,
        sender=messages.append,
    )
    second, second_exit = _run(
        state_path,
        _http_error(status=503, body=b"unavailable"),
        notify=True,
        sender=messages.append,
    )
    third, third_exit = _run(
        state_path,
        _http_error(status=503, body=b"unavailable"),
        notify=True,
        sender=messages.append,
    )
    recovery, recovery_exit = _run(
        state_path,
        _Response(payload=_health_payload()),
        notify=True,
        sender=messages.append,
    )
    steady, steady_exit = _run(
        state_path,
        _Response(payload=_health_payload()),
        notify=True,
        sender=messages.append,
    )

    assert first_exit == watcher.EXIT_OUTAGE
    assert first["notification"]["status"] == "below_threshold"
    assert second_exit == watcher.EXIT_OUTAGE
    assert second["notification"] == {"event": "outage", "status": "sent"}
    assert second["alert_active"] is True
    assert third_exit == watcher.EXIT_OUTAGE
    assert third["notification"] == {"event": None, "status": "deduplicated"}
    assert recovery_exit == watcher.EXIT_HEALTHY
    assert recovery["notification"] == {"event": "recovery", "status": "sent"}
    assert recovery["alert_active"] is False
    assert steady_exit == watcher.EXIT_HEALTHY
    assert steady["notification"] == {"event": None, "status": "not_needed"}
    assert len(messages) == 2
    assert "health alert" in messages[0]
    assert "health recovered" in messages[1]


def test_failed_outage_notification_retries_on_the_next_check(tmp_path):
    state_path = tmp_path / "state.json"
    _run(state_path, _http_error(status=503, body=b"unavailable"), notify=True)
    attempts = []

    def failed_sender(message):
        attempts.append(message)
        raise subprocess.CalledProcessError(1, ["jawn-ops"])

    failed, failed_exit = _run(
        state_path,
        _http_error(status=503, body=b"unavailable"),
        notify=True,
        sender=failed_sender,
    )
    retried, retried_exit = _run(
        state_path,
        _http_error(status=503, body=b"unavailable"),
        notify=True,
        sender=attempts.append,
    )

    assert failed_exit == watcher.EXIT_WATCHER_ERROR
    assert failed["notification"] == {"event": "outage", "status": "failed"}
    assert failed["error"] == "notification_failed"
    assert failed["alert_active"] is False
    assert retried_exit == watcher.EXIT_OUTAGE
    assert retried["notification"] == {"event": "outage", "status": "sent"}
    assert retried["alert_active"] is True
    assert len(attempts) == 2


def test_oversized_response_is_an_outage_without_reading_past_bound(tmp_path):
    responses = [
        _Response(
            body=b"{}",
            headers={"Content-Length": str(watcher.MAX_RESPONSE_BYTES + 1)},
        ),
        _Response(body=b"x" * (watcher.MAX_RESPONSE_BYTES + 1)),
    ]

    for index, response in enumerate(responses):
        report, exit_code = _run(tmp_path / f"state-{index}.json", response)

        assert exit_code == watcher.EXIT_OUTAGE
        assert report["health"] == "outage"
        assert report["error"] == "response_too_large"

    assert responses[0].read_sizes == []
    assert sum(responses[1].read_sizes) <= watcher.MAX_RESPONSE_BYTES + 1


def test_systemd_script_cli_loads_without_site_packages():
    service = (
        REPOSITORY_ROOT
        / "automation/systemd/rosen-source-discovery-health.service"
    ).read_text(encoding="utf-8")
    assert "ExecStart=/usr/bin/python3 -S " in service

    completed = subprocess.run(
        [
            sys.executable,
            "-S",
            str(REPOSITORY_ROOT / "backend/scripts/check_archive_health.py"),
            "--help",
        ],
        cwd=REPOSITORY_ROOT,
        capture_output=True,
        text=True,
        check=False,
    )

    assert completed.returncode == 0, completed.stderr
    assert "--notify" in completed.stdout


def test_probe_runs_without_site_packages_or_a_real_network_request():
    payload = json.dumps(_health_payload()).encode("utf-8")
    program = textwrap.dedent(
        f"""
        import io
        import sys
        from scripts import check_archive_health as watcher

        assert "requests" not in sys.modules

        class Response:
            status = 200
            headers = {{}}

            def __init__(self):
                self.body = io.BytesIO({payload!r})

            def read(self, size=-1):
                return self.body.read(size)

            def getcode(self):
                return self.status

            def geturl(self):
                return watcher.HEALTH_URL

            def close(self):
                self.body.close()

        calls = []

        def open_request(request, *, timeout):
            calls.append((request.full_url, request.get_method(), timeout))
            return Response()

        result = watcher.probe_health(request_fn=open_request)
        assert result.health == "healthy"
        assert calls == [(
            watcher.HEALTH_URL,
            "GET",
            watcher.REQUEST_TIMEOUT_SECONDS,
        )]
        """
    )
    completed = subprocess.run(
        [sys.executable, "-S", "-c", program],
        cwd=REPOSITORY_ROOT / "backend",
        capture_output=True,
        text=True,
        check=False,
    )

    assert completed.returncode == 0, completed.stderr


def test_supported_telegram_command_uses_no_shell_or_copied_credentials(monkeypatch):
    calls = []

    def run(command, **kwargs):
        calls.append((command, kwargs))

    monkeypatch.setattr(watcher.subprocess, "run", run)
    watcher.send_telegram("bounded test message")

    assert calls[0][0] == [
        "jawn-ops",
        "telegram",
        "notify",
        "--message",
        "bounded test message",
    ]
    assert calls[0][1]["check"] is True
    assert calls[0][1]["timeout"] == 20
