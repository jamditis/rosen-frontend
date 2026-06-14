"""Tests for the offline parallel entity-extraction script.

Regression for #292: when a ProcessPoolExecutor worker raised, main() caught the
exception, printed it, and still returned 0 — so a run where every worker died
reported success. The failure-counting now lives in a testable helper,
_collect_worker_results, and main() returns non-zero when any worker failed.
"""

import importlib.util
import pathlib
import sys
from concurrent.futures import Future

_BACKEND = pathlib.Path(__file__).resolve().parents[1]
if str(_BACKEND) not in sys.path:
    sys.path.insert(0, str(_BACKEND))


def _load_module():
    path = _BACKEND / "scripts" / "extract_entities_full_parallel.py"
    spec = importlib.util.spec_from_file_location(
        "extract_entities_full_parallel", path
    )
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


eefp = _load_module()


def _resolved_future(result=None, exc=None):
    """Build an already-resolved Future so as_completed yields it immediately."""
    fut = Future()
    if exc is not None:
        fut.set_exception(exc)
    else:
        fut.set_result(result)
    return fut


class TestCollectWorkerResults:
    """The aggregation helper must count worker failures, not swallow them."""

    def test_counts_worker_failure_and_aggregates_successes(self):
        good = _resolved_future(
            result={
                "worker_id": 1,
                "entities": [{"name": "Jay Rosen"}],
                "relationships": [{"source": "A", "target": "B"}],
                "errors": ["a soft per-post error"],
                "posts_processed": 5,
            }
        )
        bad = _resolved_future(exc=RuntimeError("worker crashed"))

        collected = eefp._collect_worker_results({good: 1, bad: 2})

        assert collected.worker_failures == 1
        assert collected.total_processed == 5
        assert collected.entities == [{"name": "Jay Rosen"}]
        assert collected.relationships == [{"source": "A", "target": "B"}]
        assert collected.errors == ["a soft per-post error"]

    def test_no_failures_when_all_workers_succeed(self):
        a = _resolved_future(
            result={
                "worker_id": 1,
                "entities": [],
                "relationships": [],
                "errors": [],
                "posts_processed": 3,
            }
        )
        b = _resolved_future(
            result={
                "worker_id": 2,
                "entities": [],
                "relationships": [],
                "errors": [],
                "posts_processed": 4,
            }
        )

        collected = eefp._collect_worker_results({a: 1, b: 2})

        assert collected.worker_failures == 0
        assert collected.total_processed == 7
