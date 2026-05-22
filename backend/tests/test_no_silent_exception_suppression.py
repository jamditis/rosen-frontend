"""Regression guard for issue #158: broad, silent exception suppression.

PR #179 cleared every bare ``except:`` (ruff E722) by rewriting them as
``except Exception:``. That stopped ``KeyboardInterrupt``/``SystemExit`` from
being swallowed, but left the second half of the finding untouched: handlers
whose entire body is ``pass`` still discard the error with no trace.

Ruff's default rule set (E4/E7/E9/F) does not flag ``except Exception: pass``,
so this test is the guard. It fails if any handler in ``src/`` or ``scripts/``
catches broadly (bare, ``Exception``, or ``BaseException``) and does nothing but
``pass``. The fix is always the same: bind the exception and log it.

A narrow handler such as ``except ValueError: pass`` is intentionally allowed —
it is a scoped, deliberate decision, not silent blanket suppression.
"""

import ast
import pathlib

BACKEND_ROOT = pathlib.Path(__file__).resolve().parents[1]
SCANNED_DIRS = ("src", "scripts")
BROAD_NAMES = {"Exception", "BaseException"}


def _is_broad(node: ast.expr | None) -> bool:
    """True if an except clause catches broadly enough to hide unrelated bugs."""
    if node is None:  # bare ``except:``
        return True
    if isinstance(node, ast.Name) and node.id in BROAD_NAMES:
        return True
    if isinstance(node, ast.Tuple):
        return any(
            isinstance(elt, ast.Name) and elt.id in BROAD_NAMES for elt in node.elts
        )
    return False


def _find_silent_handlers() -> list[str]:
    offenders: list[str] = []
    for sub in SCANNED_DIRS:
        for path in sorted((BACKEND_ROOT / sub).rglob("*.py")):
            if "__pycache__" in path.parts:
                continue
            tree = ast.parse(path.read_text(encoding="utf-8", errors="replace"))
            for node in ast.walk(tree):
                if not isinstance(node, ast.ExceptHandler):
                    continue
                if _is_broad(node.type) and all(
                    isinstance(stmt, ast.Pass) for stmt in node.body
                ):
                    rel = path.relative_to(BACKEND_ROOT)
                    offenders.append(f"{rel}:{node.lineno}")
    return offenders


def test_no_broad_silent_exception_suppression():
    offenders = _find_silent_handlers()
    assert not offenders, (
        "Broad exception handlers that only `pass` (issue #158) — bind the "
        "exception and log it instead:\n  " + "\n  ".join(offenders)
    )
