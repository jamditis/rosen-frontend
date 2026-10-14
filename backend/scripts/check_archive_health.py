#!/usr/bin/env python3
"""Check the fixed Rosen source-discovery health endpoint."""

from __future__ import annotations

import argparse
import datetime
import json
import os
import re
import subprocess
import tempfile
import urllib.error
import urllib.request
from dataclasses import dataclass
from pathlib import Path
from typing import Callable


HEALTH_URL = "https://rosen-source-discovery.jamditis.workers.dev/health"
ACTIONS_URL = (
    "https://github.com/jamditis/rosen-frontend/actions/workflows/"
    "bluesky-stewardship.yml"
)
RUNBOOK_PATH = "docs/operations/bluesky-stewardship.md"
REQUEST_TIMEOUT_SECONDS = 10
MAX_RESPONSE_BYTES = 64 * 1024
FAILURES_BEFORE_ALERT = 2
DEFAULT_STATE_PATH = (
    Path.home() / ".local/state/rosen-archive/source-discovery-health.json"
)
USER_AGENT = "RosenArchive-HealthWatcher/1.0"
SAFE_VALUE_RE = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._:+-]{0,127}$")
COMMIT_RE = re.compile(r"^[0-9a-f]{7,64}$")

EXIT_HEALTHY = 0
EXIT_DEGRADED = 1
EXIT_OUTAGE = 2
EXIT_WATCHER_ERROR = 3


class _RejectRedirects(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


_HEALTH_OPENER = urllib.request.build_opener(_RejectRedirects())


@dataclass(frozen=True)
class ProbeResult:
    health: str
    http_status: int | None = None
    discovery_count: int | None = None
    ingestion_status: str | None = None
    error_class: str | None = None
    affected_components: tuple[str, ...] = ()
    affected_sources: tuple[str, ...] = ()
    error: str | None = None


@dataclass(frozen=True)
class OperationalHealth:
    healthy: bool
    discovery_count: int
    ingestion_status: str
    error_class: str | None
    affected_components: tuple[str, ...]
    affected_sources: tuple[str, ...]


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
    while True:
        chunk = response.read(min(8192, MAX_RESPONSE_BYTES - len(body) + 1))
        if not chunk:
            break
        if len(chunk) > MAX_RESPONSE_BYTES - len(body):
            raise ValueError("response_too_large")
        body.extend(chunk)
    return bytes(body)


def _open_health_request(
    request: urllib.request.Request,
    *,
    timeout: int,
) -> object:
    return _HEALTH_OPENER.open(request, timeout=timeout)


def _safe_value(value: object) -> bool:
    return isinstance(value, str) and SAFE_VALUE_RE.fullmatch(value) is not None


def _valid_timestamp(value: object, *, optional: bool = False) -> bool:
    if value is None:
        return optional
    if not isinstance(value, str) or not value:
        return False
    try:
        parsed = datetime.datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError:
        return False
    return parsed.tzinfo is not None


def _parse_discovery(value: object) -> list[tuple[str, bool]] | None:
    if not isinstance(value, list) or not value:
        return None
    results: list[tuple[str, bool]] = []
    seen: set[str] = set()
    for source in value:
        if not isinstance(source, dict):
            return None
        source_id = source.get("sourceId")
        healthy = source.get("healthy")
        if (
            not _safe_value(source_id)
            or source_id in seen
            or type(healthy) is not bool
            or not _safe_value(source.get("lastStatus"))
            or not _valid_timestamp(source.get("lastCheckedAt"), optional=not healthy)
            or not _valid_timestamp(source.get("lastSuccessAt"), optional=not healthy)
        ):
            return None
        seen.add(source_id)
        results.append((source_id, healthy))
    return results


def _parse_ingestion(value: object) -> tuple[bool, str, str | None] | None:
    if not isinstance(value, dict):
        return None
    healthy = value.get("healthy")
    status = value.get("status")
    error_class = value.get("errorClass")
    canonical_commit = value.get("canonicalCommit")
    release_version = value.get("releaseVersion")
    if type(healthy) is not bool or not _safe_value(status):
        return None
    if error_class is not None and not _safe_value(error_class):
        return None
    if not _valid_timestamp(value.get("checkedAt"), optional=not healthy):
        return None
    if canonical_commit is not None and (
        not isinstance(canonical_commit, str)
        or COMMIT_RE.fullmatch(canonical_commit) is None
    ):
        return None
    if release_version is not None and not _safe_value(release_version):
        return None
    if healthy and (canonical_commit is None or release_version is None):
        return None
    return healthy, status, error_class


def _parse_operational_health(payload: object) -> OperationalHealth | None:
    if not isinstance(payload, dict) or type(payload.get("healthy")) is not bool:
        return None
    discovery = _parse_discovery(payload.get("discovery"))
    ingestion = _parse_ingestion(payload.get("ingestion"))
    if discovery is None or ingestion is None:
        return None

    ingestion_healthy, ingestion_status, error_class = ingestion
    discovery_healthy = all(healthy for _source_id, healthy in discovery)
    healthy = payload["healthy"] and discovery_healthy and ingestion_healthy
    affected_sources = tuple(
        source_id for source_id, source_healthy in discovery if not source_healthy
    )
    affected_components: list[str] = []
    if affected_sources:
        affected_components.append("archive discovery")
    if not ingestion_healthy:
        affected_components.append("archive publication")
    if not healthy and not affected_components:
        affected_components.extend(("archive discovery", "archive publication"))
    return OperationalHealth(
        healthy=healthy,
        discovery_count=len(discovery),
        ingestion_status=ingestion_status,
        error_class=error_class,
        affected_components=tuple(affected_components),
        affected_sources=affected_sources,
    )


def probe_health(
    *,
    request_fn: Callable[..., object] | None = None,
) -> ProbeResult:
    """Read and validate the one allowlisted public health endpoint."""
    if request_fn is None:
        request_fn = _open_health_request
    request = urllib.request.Request(
        HEALTH_URL,
        headers={
            "User-Agent": USER_AGENT,
            "Accept": "application/json",
            "Accept-Encoding": "identity",
        },
        method="GET",
    )
    response = None
    try:
        try:
            response = request_fn(request, timeout=REQUEST_TIMEOUT_SECONDS)
        except urllib.error.HTTPError as exc:
            # urllib exposes non-2xx responses as file-like exceptions. Keep the
            # fixed endpoint's HTTP 503 body available for safe diagnostics.
            response = exc
        status_code = response.getcode()
        if not isinstance(status_code, int):
            return ProbeResult(health="outage", error="invalid_http_status")
        if status_code not in {200, 503}:
            return ProbeResult(
                health="outage",
                http_status=status_code,
                error="unexpected_http_status",
            )
        response_url = response.geturl()
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
    except (urllib.error.URLError, TimeoutError, OSError):
        return ProbeResult(health="outage", error="request_failed")
    finally:
        close = getattr(response, "close", None)
        if callable(close):
            close()

    operational = _parse_operational_health(payload)
    if operational is None:
        return ProbeResult(
            health="outage",
            http_status=status_code,
            error="invalid_payload",
        )

    if status_code == 200 and operational.healthy:
        health = "healthy"
        error = None
    elif status_code == 200:
        health = "degraded"
        error = "reported_unhealthy"
    else:
        health = "outage"
        error = (
            "reported_unhealthy"
            if not operational.healthy
            else "unexpected_http_status"
        )
    return ProbeResult(
        health=health,
        http_status=status_code,
        discovery_count=operational.discovery_count,
        ingestion_status=operational.ingestion_status,
        error_class=operational.error_class,
        affected_components=operational.affected_components,
        affected_sources=operational.affected_sources,
        error=error,
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
            "Rosen archive discovery and publication health recovered. "
            f"Endpoint: {HEALTH_URL}."
        )
    affected = ", ".join(probe.affected_components) or "archive health contract"
    sources = (
        f" Affected sources: {', '.join(probe.affected_sources)}."
        if probe.affected_sources
        else ""
    )
    error_class = f" Error class: {probe.error_class}." if probe.error_class else ""
    ingestion_status = (
        f" Publication status: {probe.ingestion_status}."
        if probe.ingestion_status
        else ""
    )
    return (
        f"Rosen archive health alert. Affected: {affected}.{sources}"
        f"{ingestion_status}{error_class} Consecutive failures: {failures}. "
        f"Action: inspect {ACTIONS_URL} and follow {RUNBOOK_PATH}."
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
    request_fn: Callable[..., object] | None = None,
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
        "discovery_count": probe.discovery_count,
        "ingestion_status": probe.ingestion_status,
        "error_class": probe.error_class,
        "affected_components": list(probe.affected_components),
        "affected_sources": list(probe.affected_sources),
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
