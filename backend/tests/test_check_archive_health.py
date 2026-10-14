import datetime
import json
import subprocess

from scripts import check_archive_health as watcher


NOW = datetime.datetime(2026, 10, 14, 17, 0, tzinfo=datetime.timezone.utc)


class _Response:
    def __init__(self, *, status=200, payload=None, body=None, headers=None, url=None):
        self.status_code = status
        if body is None:
            body = json.dumps(payload).encode("utf-8")
        self.body = body
        self.headers = headers or {}
        self.url = url or watcher.HEALTH_URL
        self.closed = False

    def iter_content(self, chunk_size):
        for start in range(0, len(self.body), chunk_size):
            yield self.body[start : start + chunk_size]

    def close(self):
        self.closed = True


def _health_payload(*, status="ok", mode="live"):
    return {
        "status": status,
        "mode": mode,
        "manifestVersion": "2026-08-14.3",
        "sources": [
            {
                "id": "jay-rosen-bluesky",
                "label": "Jay Rosen Bluesky activity",
                "kind": "atproto-author-feed",
                "maxCandidates": 100,
            }
        ],
    }


def _request_for(response, calls=None):
    def request(url, **kwargs):
        if calls is not None:
            calls.append((url, kwargs))
        return response

    return request


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
    assert report["service_status"] == "ok"
    assert report["mode"] == "live"
    assert report["source_count"] == 1
    assert report["consecutive_failures"] == 0
    assert report["notification"] == {"event": None, "status": "not_needed"}
    assert len(calls) == 1
    assert calls[0][0] == watcher.HEALTH_URL
    assert calls[0][1]["allow_redirects"] is False
    assert calls[0][1]["stream"] is True
    assert calls[0][1]["timeout"] == watcher.REQUEST_TIMEOUT_SECONDS
    assert calls[0][1]["headers"]["Accept-Encoding"] == "identity"
    assert response.closed is True


def test_live_endpoint_with_nonlive_mode_is_degraded(tmp_path):
    report, exit_code = _run(
        tmp_path / "state.json",
        _Response(payload=_health_payload(mode="disabled")),
    )

    assert exit_code == watcher.EXIT_DEGRADED
    assert report["health"] == "degraded"
    assert report["error"] == "unexpected_health_values"
    assert report["consecutive_failures"] == 1
    assert report["alert_active"] is False


def test_outage_alert_is_deduplicated_and_followed_by_one_recovery(tmp_path):
    state_path = tmp_path / "state.json"
    messages = []

    first, first_exit = _run(
        state_path,
        _Response(status=503, body=b"unavailable"),
        notify=True,
        sender=messages.append,
    )
    second, second_exit = _run(
        state_path,
        _Response(status=503, body=b"unavailable"),
        notify=True,
        sender=messages.append,
    )
    third, third_exit = _run(
        state_path,
        _Response(status=503, body=b"unavailable"),
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
    _run(state_path, _Response(status=503, body=b"unavailable"), notify=True)
    attempts = []

    def failed_sender(message):
        attempts.append(message)
        raise subprocess.CalledProcessError(1, ["jawn-ops"])

    failed, failed_exit = _run(
        state_path,
        _Response(status=503, body=b"unavailable"),
        notify=True,
        sender=failed_sender,
    )
    retried, retried_exit = _run(
        state_path,
        _Response(status=503, body=b"unavailable"),
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
