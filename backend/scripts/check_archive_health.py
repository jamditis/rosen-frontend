#!/usr/bin/env python3
"""Check the fixed Rosen source-discovery health endpoint."""

from __future__ import annotations

import argparse
import datetime
import json
import os
import subprocess
import tempfile
from dataclasses import dataclass
from pathlib import Path
from typing import Callable

import requests


HEALTH_URL = "https://rosen-source-discovery.jamditis.workers.dev/health"
REQUEST_TIMEOUT_SECONDS = (5, 10)
MAX_RESPONSE_BYTES = 64 * 1024
FAILURES_BEFORE_ALERT = 2
DEFAULT_STATE_PATH = (
    Path.home() / ".local/state/rosen-archive/source-discovery-health.json"
)
USER_AGENT = "RosenArchive-HealthWatcher/1.0"

EXIT_HEALTHY = 0
EXIT_DEGRADED = 1
EXIT_OUTAGE = 2
EXIT_WATCHER_ERROR = 3


@dataclass(frozen=True)
class ProbeResult:
    health: str
    http_status: int | None = None
    service_status: str | None = None
    mode: str | None = None
    manifest_version: str | None = None
    source_count: int | None = None
    error: str | None = None


def _utc_iso(value: datetime.datetime) -> str:
    return value.astimezone(datetime.timezone.utc).isoformat(timespec="seconds")


def _read_bounded_body(response: object) -> bytes:
    content_length = getattr(response, "headers", {}).get("Content-Length")
    if content_length is not None:
        try:
            declared_length = int(content_length)
        except (TypeError, ValueError) as exc:
            raise ValueError("invalid_content_length") from exc
        if declared_length < 0 or declared_length > MAX_RESPONSE_BYTES:
            raise ValueError("response_too_large")

    body = bytearray()
    for chunk in response.iter_content(chunk_size=8192):
        if not chunk:
            continue
        if len(chunk) > MAX_RESPONSE_BYTES - len(body):
            raise ValueError("response_too_large")
        body.extend(chunk)
    return bytes(body)


def _valid_sources(value: object) -> bool:
    if not isinstance(value, list):
        return False
    return all(
        isinstance(source, dict)
        and isinstance(source.get("id"), str)
        and bool(source["id"])
        and isinstance(source.get("kind"), str)
        and bool(source["kind"])
        for source in value
    )


def probe_health(
    *,
    request_fn: Callable[..., object] = requests.get,
) -> ProbeResult:
    """Read and validate the one allowlisted public health endpoint."""
    response = None
    try:
        response = request_fn(
            HEALTH_URL,
            headers={
                "User-Agent": USER_AGENT,
                "Accept": "application/json",
                "Accept-Encoding": "identity",
            },
            timeout=REQUEST_TIMEOUT_SECONDS,
            allow_redirects=False,
            stream=True,
        )
        status_code = getattr(response, "status_code", None)
        if not isinstance(status_code, int):
            return ProbeResult(health="outage", error="invalid_http_status")
        if status_code != 200:
            return ProbeResult(
                health="outage",
                http_status=status_code,
                error="unexpected_http_status",
            )
        response_url = getattr(response, "url", HEALTH_URL)
        if response_url != HEALTH_URL:
            return ProbeResult(
                health="outage",
                http_status=status_code,
                error="unexpected_response_url",
            )
        try:
            body = _read_bounded_body(response)
            payload = json.loads(body.decode("utf-8"))
        except (UnicodeDecodeError, json.JSONDecodeError):
            return ProbeResult(
                health="outage",
                http_status=status_code,
                error="invalid_json",
            )
        except ValueError as exc:
            return ProbeResult(
                health="outage",
                http_status=status_code,
                error=str(exc),
            )
    except requests.RequestException:
        return ProbeResult(health="outage", error="request_failed")
    finally:
        close = getattr(response, "close", None)
        if callable(close):
            close()

    if not isinstance(payload, dict):
        return ProbeResult(
            health="outage",
            http_status=200,
            error="invalid_payload",
        )

    service_status = payload.get("status")
    mode = payload.get("mode")
    manifest_version = payload.get("manifestVersion")
    sources = payload.get("sources")
    if not (
        isinstance(service_status, str)
        and isinstance(mode, str)
        and isinstance(manifest_version, str)
        and bool(manifest_version)
        and _valid_sources(sources)
    ):
        return ProbeResult(
            health="outage",
            http_status=200,
            error="invalid_payload",
        )

    source_count = len(sources)
    health = (
        "healthy"
        if service_status == "ok" and mode == "live" and source_count > 0
        else "degraded"
    )
    return ProbeResult(
        health=health,
        http_status=200,
        service_status=service_status,
        mode=mode,
        manifest_version=manifest_version,
        source_count=source_count,
        error=None if health == "healthy" else "unexpected_health_values",
    )


def _default_state() -> dict:
    return {
        "schema_version": 1,
        "consecutive_failures": 0,
        "alert_active": False,
    }


def _load_state(path: Path) -> dict:
    if not path.exists():
        return _default_state()
    if path.stat().st_size > 16 * 1024:
        raise ValueError("state_too_large")
    try:
        value = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, UnicodeDecodeError, json.JSONDecodeError) as exc:
        raise ValueError("invalid_state") from exc
    if not isinstance(value, dict) or value.get("schema_version") != 1:
        raise ValueError("invalid_state")
    failures = value.get("consecutive_failures")
    alert_active = value.get("alert_active")
    if (
        not isinstance(failures, int)
        or isinstance(failures, bool)
        or failures < 0
        or not isinstance(alert_active, bool)
    ):
        raise ValueError("invalid_state")
    return {
        "schema_version": 1,
        "consecutive_failures": failures,
        "alert_active": alert_active,
    }


def _write_state(path: Path, state: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
    payload = (json.dumps(state, sort_keys=True) + "\n").encode("utf-8")
    temporary_path: Path | None = None
    try:
        with tempfile.NamedTemporaryFile(
            mode="wb",
            dir=path.parent,
            prefix=f".{path.name}.",
            delete=False,
        ) as handle:
            temporary_path = Path(handle.name)
            os.chmod(handle.name, 0o600)
            handle.write(payload)
            handle.flush()
            os.fsync(handle.fileno())
        os.replace(temporary_path, path)
    finally:
        if temporary_path is not None and temporary_path.exists():
            temporary_path.unlink()


def send_telegram(message: str) -> None:
    """Send through the installed credential-owning notification command."""
    subprocess.run(
        ["jawn-ops", "telegram", "notify", "--message", message],
        stdin=subprocess.DEVNULL,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
        timeout=20,
        check=True,
    )


def _notification_message(event: str, probe: ProbeResult, failures: int) -> str:
    if event == "recovery":
        return (
            "Rosen source discovery health recovered. "
            f"Endpoint: {HEALTH_URL}. Status: {probe.service_status}. "
            f"Mode: {probe.mode}."
        )
    detail = probe.error or "unexpected_health_values"
    return (
        "Rosen source discovery health alert. "
        f"Endpoint: {HEALTH_URL}. State: {probe.health}. "
        f"Consecutive failures: {failures}. Detail: {detail}."
    )


def _notification_event(probe: ProbeResult, state: dict) -> str | None:
    if probe.health == "healthy":
        return "recovery" if state["alert_active"] else None
    if (
        state["consecutive_failures"] >= FAILURES_BEFORE_ALERT
        and not state["alert_active"]
    ):
        return "outage"
    return None


def run_check(
    *,
    state_path: Path,
    notify: bool,
    request_fn: Callable[..., object] = requests.get,
    sender_fn: Callable[[str], None] = send_telegram,
    now_fn: Callable[[], datetime.datetime] = lambda: datetime.datetime.now(
        datetime.timezone.utc
    ),
) -> tuple[dict, int]:
    checked_at = now_fn()
    if checked_at.tzinfo is None:
        raise ValueError("now_fn must return a timezone-aware datetime")
    try:
        state = _load_state(state_path)
    except (OSError, ValueError) as exc:
        report = {
            "schema_version": 1,
            "checked_at": _utc_iso(checked_at),
            "endpoint": HEALTH_URL,
            "health": "unknown",
            "error": str(exc),
            "notification": {"event": None, "status": "not_attempted"},
            "exit_code": EXIT_WATCHER_ERROR,
        }
        return report, EXIT_WATCHER_ERROR

    probe = probe_health(request_fn=request_fn)
    if probe.health == "healthy":
        state["consecutive_failures"] = 0
    else:
        state["consecutive_failures"] += 1

    event = _notification_event(probe, state)
    if event is None:
        if state["alert_active"] and probe.health != "healthy":
            notification_status = "deduplicated"
        elif probe.health != "healthy" and not notify:
            notification_status = "disabled"
        elif probe.health != "healthy":
            notification_status = "below_threshold"
        else:
            notification_status = "not_needed"
    elif not notify:
        notification_status = "disabled"
    else:
        try:
            sender_fn(
                _notification_message(
                    event,
                    probe,
                    state["consecutive_failures"],
                )
            )
        except (OSError, subprocess.SubprocessError):
            notification_status = "failed"
        else:
            notification_status = "sent"
            state["alert_active"] = event == "outage"

    state.update(
        {
            "last_checked_at": _utc_iso(checked_at),
            "last_health": probe.health,
        }
    )
    exit_code = {
        "healthy": EXIT_HEALTHY,
        "degraded": EXIT_DEGRADED,
        "outage": EXIT_OUTAGE,
    }[probe.health]
    if notification_status == "failed":
        exit_code = EXIT_WATCHER_ERROR

    try:
        _write_state(state_path, state)
    except OSError:
        exit_code = EXIT_WATCHER_ERROR
        state_error = "state_write_failed"
    else:
        state_error = None

    report = {
        "schema_version": 1,
        "checked_at": _utc_iso(checked_at),
        "endpoint": HEALTH_URL,
        "health": probe.health,
        "http_status": probe.http_status,
        "service_status": probe.service_status,
        "mode": probe.mode,
        "manifest_version": probe.manifest_version,
        "source_count": probe.source_count,
        "error": state_error
        or ("notification_failed" if notification_status == "failed" else probe.error),
        "consecutive_failures": state["consecutive_failures"],
        "alert_active": state["alert_active"],
        "notification": {"event": event, "status": notification_status},
        "exit_code": exit_code,
    }
    return report, exit_code


def _parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Check the fixed Rosen source-discovery health endpoint"
    )
    parser.add_argument("--state", type=Path, default=DEFAULT_STATE_PATH)
    parser.add_argument(
        "--notify",
        action="store_true",
        help="Send deduplicated outage and recovery messages through jawn-ops",
    )
    return parser.parse_args()


def main() -> None:
    args = _parse_args()
    report, exit_code = run_check(state_path=args.state, notify=args.notify)
    print(json.dumps(report, sort_keys=True))
    raise SystemExit(exit_code)


if __name__ == "__main__":
    main()
