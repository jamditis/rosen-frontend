"""Stable Google Sheets receipts for bounded key-concept maintenance."""

from __future__ import annotations

import hashlib
import json
import re
from dataclasses import dataclass
from typing import Any, Sequence


TASK_RECEIPT_COLUMN = "key_concepts_task_receipt"
KEY_CONCEPT_TASK_TYPE = "key-concepts"
KEY_CONCEPT_TASK_VERSION = "1.0.0"
KEY_CONCEPT_RULE_VERSION = "1.0.0"
KEY_CONCEPT_MODEL_VERSION = "gemini-2.0-flash-lite"
RECEIPT_SCHEMA_VERSION = "1.0.0"

_RECEIPT_FIELDS = {
    "schemaVersion",
    "taskKey",
    "taskVersion",
    "ruleVersion",
    "modelVersion",
    "inputHash",
    "contextHash",
    "expectedConceptsHash",
}
_SHA256 = re.compile(r"^[a-f0-9]{64}$")
_TASK_KEY = re.compile(r"^urn:rosen-stewardship:task:[a-f0-9]{64}$")
_VERSION = re.compile(r"^[0-9]+\.[0-9]+\.[0-9]+$")


class ProgressReceiptError(ValueError):
    """A stored receipt cannot safely prove completed work."""


def _canonical_json(value: Any) -> str:
    return json.dumps(
        value, ensure_ascii=False, separators=(",", ":"), sort_keys=True
    )


def _sha256_text(value: str) -> str:
    return hashlib.sha256(value.encode("utf-8")).hexdigest()


def _object_identity(record_id: str) -> tuple[str, str]:
    prefix = record_id.split("-", 1)[0]
    object_type = (
        "social-post" if prefix in {"BSKY", "MAST", "TWTR"}
        else "archive-record"
    )
    return object_type, f"urn:rosen:object:{object_type}:{record_id}"


def _context_value(
    raw_text: str,
    taxonomy: Sequence[str],
    force_reprocess: bool,
    *,
    rule_version: str,
    model_version: str,
) -> dict[str, Any]:
    return {
        "forceReprocess": force_reprocess,
        "modelVersion": model_version,
        "rawText": raw_text,
        "ruleVersion": rule_version,
        "taxonomy": list(taxonomy),
    }


@dataclass(frozen=True)
class KeyConceptTask:
    """One model prompt bound to its source, policy, and curator input."""

    record_id: str
    input_hash: str
    context_hash: str
    task_key: str
    rule_version: str
    model_version: str


def key_concept_task(
    record_id: str,
    raw_text: str,
    current_concepts: str,
    taxonomy: Sequence[str],
    force_reprocess: bool,
    *,
    rule_version: str = KEY_CONCEPT_RULE_VERSION,
    model_version: str = KEY_CONCEPT_MODEL_VERSION,
) -> KeyConceptTask:
    """Build the task identity from every value that can change the prompt."""

    context = _context_value(
        raw_text,
        taxonomy,
        force_reprocess,
        rule_version=rule_version,
        model_version=model_version,
    )
    input_hash = _sha256_text(_canonical_json({
        **context,
        "currentConcepts": current_concepts,
    }))
    object_type, object_id = _object_identity(record_id)
    task_key = "urn:rosen-stewardship:task:" + _sha256_text(_canonical_json({
        "inputHash": input_hash,
        "objectId": object_id,
        "objectType": object_type,
        "taskType": KEY_CONCEPT_TASK_TYPE,
        "taskVersion": KEY_CONCEPT_TASK_VERSION,
    }))
    return KeyConceptTask(
        record_id=record_id,
        input_hash=input_hash,
        context_hash=_sha256_text(_canonical_json(context)),
        task_key=task_key,
        rule_version=rule_version,
        model_version=model_version,
    )


def encode_receipt(task: KeyConceptTask, expected_concepts: str) -> str:
    """Record task identity plus the concept state expected after its write."""

    return _canonical_json({
        "schemaVersion": RECEIPT_SCHEMA_VERSION,
        "taskKey": task.task_key,
        "taskVersion": KEY_CONCEPT_TASK_VERSION,
        "ruleVersion": task.rule_version,
        "modelVersion": task.model_version,
        "inputHash": task.input_hash,
        "contextHash": task.context_hash,
        "expectedConceptsHash": _sha256_text(expected_concepts),
    })


def receipt_matches(
    encoded: str,
    *,
    record_id: str,
    raw_text: str,
    current_concepts: str,
    taxonomy: Sequence[str],
    force_reprocess: bool,
    rule_version: str = KEY_CONCEPT_RULE_VERSION,
    model_version: str = KEY_CONCEPT_MODEL_VERSION,
) -> bool:
    """Return whether a strict receipt proves the current row is complete."""

    if not encoded:
        return False
    try:
        receipt = json.loads(encoded)
    except (TypeError, json.JSONDecodeError) as error:
        raise ProgressReceiptError("receipt is not valid JSON") from error
    if not isinstance(receipt, dict):
        raise ProgressReceiptError("receipt must be a JSON object")
    fields = set(receipt)
    if fields != _RECEIPT_FIELDS:
        missing = sorted(_RECEIPT_FIELDS - fields)
        unexpected = sorted(fields - _RECEIPT_FIELDS)
        details = []
        if missing:
            details.append(f"missing {', '.join(missing)}")
        if unexpected:
            details.append(f"unexpected {', '.join(unexpected)}")
        raise ProgressReceiptError("receipt fields are invalid: " + "; ".join(details))
    if any(not isinstance(receipt[field], str) for field in _RECEIPT_FIELDS):
        raise ProgressReceiptError("receipt fields must be strings")
    if receipt["schemaVersion"] != RECEIPT_SCHEMA_VERSION:
        raise ProgressReceiptError(
            f"unsupported receipt schemaVersion {receipt['schemaVersion']!r}"
        )
    if not _VERSION.fullmatch(receipt["taskVersion"]):
        raise ProgressReceiptError("receipt taskVersion is not a stable version")
    if not _VERSION.fullmatch(receipt["ruleVersion"]):
        raise ProgressReceiptError("receipt ruleVersion is not a stable version")
    if not receipt["modelVersion"].strip():
        raise ProgressReceiptError("receipt modelVersion must not be empty")
    if not _TASK_KEY.fullmatch(receipt["taskKey"]):
        raise ProgressReceiptError("receipt taskKey is not a stewardship task URN")
    for field in ("inputHash", "contextHash", "expectedConceptsHash"):
        if not _SHA256.fullmatch(receipt[field]):
            raise ProgressReceiptError(
                f"receipt {field} is not a lowercase SHA-256 digest"
            )
    if receipt["taskVersion"] != KEY_CONCEPT_TASK_VERSION:
        return False

    current_task = key_concept_task(
        record_id,
        raw_text,
        current_concepts,
        taxonomy,
        force_reprocess,
        rule_version=rule_version,
        model_version=model_version,
    )
    stored_context = _context_value(
        raw_text,
        taxonomy,
        force_reprocess,
        rule_version=receipt["ruleVersion"],
        model_version=receipt["modelVersion"],
    )
    object_type, object_id = _object_identity(record_id)
    expected_task_key = "urn:rosen-stewardship:task:" + _sha256_text(
        _canonical_json({
            "inputHash": receipt["inputHash"],
            "objectId": object_id,
            "objectType": object_type,
            "taskType": KEY_CONCEPT_TASK_TYPE,
            "taskVersion": receipt["taskVersion"],
        })
    )
    if receipt["taskKey"] != expected_task_key:
        raise ProgressReceiptError("receipt taskKey does not match its input identity")

    return (
        receipt["ruleVersion"] == rule_version
        and receipt["modelVersion"] == model_version
        and receipt["contextHash"] == current_task.context_hash
        and receipt["expectedConceptsHash"] == _sha256_text(current_concepts)
        and _sha256_text(_canonical_json(stored_context)) == receipt["contextHash"]
    )
