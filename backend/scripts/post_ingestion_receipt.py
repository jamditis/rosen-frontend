#!/usr/bin/env python3
"""Post one bounded stewardship receipt to the fixed discovery endpoint."""

from __future__ import annotations

import argparse
import json
import os
import time
from pathlib import Path
from typing import Any, Iterator

import requests


ENDPOINT = "https://rosen-source-discovery.jamditis.workers.dev/ingestion-receipt"
MAX_RECORDS_PER_REQUEST = 40
MAX_ATTEMPTS = 3


def receipt_batches(payload: dict[str, Any]) -> Iterator[dict[str, Any]]:
    """Yield small receipt requests while retaining the shared run totals."""
    records = payload.get("records")
    if not isinstance(records, list):
        raise ValueError("receipt records must be a list")
    if payload.get("status") == "failed":
        if records:
            raise ValueError("failed receipts must not include record decisions")
        yield payload
        return
    if not records:
        yield payload
        return
    for start in range(0, len(records), MAX_RECORDS_PER_REQUEST):
        yield {**payload, "records": records[start:start + MAX_RECORDS_PER_REQUEST]}


def post_batch(payload: dict[str, Any], token: str) -> None:
    """Post one batch with bounded transient retries and no redirects."""
    for attempt in range(MAX_ATTEMPTS):
        response = requests.post(
            ENDPOINT,
            json=payload,
            headers={"Authorization": f"Bearer {token}"},
            timeout=30,
            allow_redirects=False,
        )
        if 300 <= response.status_code < 400:
            raise RuntimeError("ingestion receipt endpoint returned a redirect")
        if response.status_code == 429 or response.status_code >= 500:
            if attempt + 1 < MAX_ATTEMPTS:
                time.sleep(2 ** attempt)
                continue
        response.raise_for_status()
        return
    raise RuntimeError("ingestion receipt transient retry limit reached")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("receipt", type=Path)
    args = parser.parse_args()
    token = os.environ.get("ROSEN_INGESTION_RECEIPT_TOKEN", "").strip()
    if not token:
        raise SystemExit("ROSEN_INGESTION_RECEIPT_TOKEN is required")
    payload = json.loads(args.receipt.read_text(encoding="utf-8"))
    batches = list(receipt_batches(payload))
    for batch in batches:
        post_batch(batch, token)
    print(f"Ingestion receipt accepted in {len(batches)} request(s).")


if __name__ == "__main__":
    main()
