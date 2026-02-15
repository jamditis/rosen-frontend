#!/usr/bin/env python3
"""
Batch metadata filler using the Anthropic Batch API.

Fills missing `thematic_categories` and `key_concepts` fields in archive records
by submitting classification requests to the Anthropic Batch API.

Usage:
    # Scan for gaps
    python scripts/batch_metadata_filler.py --scan

    # Submit batch for categories
    python scripts/batch_metadata_filler.py --fill thematic_categories --provider anthropic

    # Submit batch for key_concepts
    python scripts/batch_metadata_filler.py --fill key_concepts --provider anthropic

    # Apply completed batch results to CSV
    python scripts/batch_metadata_filler.py --apply --batch-id <id>

    # Generate spot-check report
    python scripts/batch_metadata_filler.py --spot-check --sample-pct 15
"""

import argparse
import csv
import json
import random
import re
import sys
from datetime import datetime
from pathlib import Path
from typing import Dict, List, Optional, Tuple

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

DEFAULT_MODEL = "claude-sonnet-4-5-20250929"
DEFAULT_MAX_TOKENS = 1024
DEFAULT_POLL_INTERVAL = 30  # seconds

# Content types to exclude from metadata filling
SOCIAL_CONTENT_TYPES = {"Tweet/Thread", "Social Media Thread"}

# Valid thematic categories (from schema.json)
VALID_CATEGORIES = {
    "Press & Media Criticism",
    "Journalism Theory & Practice",
    "Journalism Education",
    "Politics & Democracy",
    "Technology & Digital Media",
    "Audience & Public Engagement",
}

CATEGORY_DESCRIPTIONS = {
    "Press & Media Criticism": "Critical analysis of media institutions, news coverage patterns, professional journalistic practices, media performance, press behavior, and critiques of how journalism operates.",
    "Journalism Theory & Practice": "Foundational principles, methodologies, and evolving practices in journalism. Theoretical frameworks for understanding journalism's role and function.",
    "Journalism Education": "Teaching journalism, pedagogical approaches, curriculum development, academic programs.",
    "Politics & Democracy": "Political coverage, democratic institutions, journalism's civic role, election reporting, government accountability.",
    "Technology & Digital Media": "Digital platforms, technological tools, online media, social networks, and how technology is transforming journalism.",
    "Audience & Public Engagement": "Reader/viewer participation, community interaction, audience evolution, user-generated content, public journalism.",
}

# Valid key concepts (from schema.json)
VALID_KEY_CONCEPTS = {
    "View from Nowhere",
    "Church of the Savvy",
    "The People Formerly Known as the Audience",
    "Parity Product",
    "Verification in reverse",
    "He said/she said journalism",
    "Audience atomization overcome",
    "The Production of Innocence",
    "Horse-race journalism",
    "False balance",
    "The Citizens' Agenda",
    "Not the odds but the stakes",
    "Mindcasting",
}

CONCEPT_DESCRIPTIONS = {
    "View from Nowhere": "The stance of studied neutrality where journalists refuse to take a position, presenting 'both sides' even when one side is demonstrably wrong.",
    "Church of the Savvy": "The press corps' worship of political savviness — knowing the game, the inside moves — over substance and policy.",
    "The People Formerly Known as the Audience": "Former passive consumers of media who now have the tools to create, publish, and distribute their own content.",
    "Parity Product": "When news outlets produce indistinguishable coverage, making their product interchangeable rather than distinctive.",
    "Verification in reverse": "When powerful actors make claims and force journalists to spend time disproving them, reversing the normal burden of verification.",
    "He said/she said journalism": "Reporting that presents opposing claims without evaluating their truth, creating false equivalence.",
    "Audience atomization overcome": "The internet's ability to connect previously isolated audience members, giving them collective power.",
    "The Production of Innocence": "How journalists construct deniability for the consequences of their coverage choices.",
    "Horse-race journalism": "Coverage that focuses on who's winning and losing rather than policy substance.",
    "False balance": "Giving equal weight to unequal positions in the name of objectivity.",
    "The Citizens' Agenda": "Letting voters' concerns — not the campaign's or the press corps' — drive election coverage.",
    "Not the odds but the stakes": "Covering elections by focusing on what's at stake for citizens rather than who's likely to win.",
    "Mindcasting": "Broadcasting your intellectual interests to attract a like-minded network, as opposed to lifecasting.",
}

# Limits
MAX_CATEGORIES = 3
MAX_CONCEPTS = 2


# ---------------------------------------------------------------------------
# CSV helpers
# ---------------------------------------------------------------------------


def read_archive_csv(csv_path: Path) -> List[Dict]:
    """Read the archive CSV and return all rows as dicts."""
    csv.field_size_limit(10**7)
    records = []
    with open(csv_path, "r", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        for row in reader:
            records.append(dict(row))
    return records


def write_archive_csv(csv_path: Path, records: List[Dict], fieldnames: List[str]):
    """Write records back to the archive CSV."""
    with open(csv_path, "w", encoding="utf-8", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(records)


# ---------------------------------------------------------------------------
# Record filtering
# ---------------------------------------------------------------------------


def find_records_missing_field(
    records: List[Dict],
    field: str,
) -> List[Dict]:
    """
    Find non-social archive records that are missing a given field.

    Args:
        records: All archive records as dicts.
        field: The field name to check (thematic_categories or key_concepts).

    Returns:
        List of records where the field is empty or whitespace-only,
        excluding social post types.
    """
    missing = []
    for record in records:
        content_type = record.get("content_type", "").strip()
        if content_type in SOCIAL_CONTENT_TYPES:
            continue
        value = record.get(field, "").strip()
        if not value:
            missing.append(record)
    return missing


# ---------------------------------------------------------------------------
# Prompt building
# ---------------------------------------------------------------------------


def _build_categories_prompt(record: Dict) -> str:
    """Build the classification prompt for thematic_categories."""
    title = record.get("title", "")
    url = record.get("url", "")
    summary = record.get("summary", "")
    excerpt = record.get("excerpt", "")

    categories_list = "\n".join(
        f"- {name}: {desc}" for name, desc in CATEGORY_DESCRIPTIONS.items()
    )

    return f"""You are classifying records for the Jay Rosen Internet Archive — a collection of the works, critiques, and teachings of Jay Rosen, NYU professor of journalism.

Assign 1-3 thematic categories to this record. Choose ONLY from the categories listed below.

VALID CATEGORIES:
{categories_list}

RECORD TO CLASSIFY:
Title: {title}
URL: {url}
Summary: {summary}
Excerpt: {excerpt}

Return ONLY valid JSON with no additional text:
{{
  "thematic_categories": ["Category 1", "Category 2"]
}}

Rules:
- Choose 1-3 categories that best describe the record's content.
- Use the exact category names listed above.
- Do not invent new categories.
- If uncertain, prefer fewer categories over guessing."""


def _build_concepts_prompt(record: Dict) -> str:
    """Build the classification prompt for key_concepts."""
    title = record.get("title", "")
    url = record.get("url", "")
    summary = record.get("summary", "")
    excerpt = record.get("excerpt", "")

    concepts_list = "\n".join(
        f"- {name}: {desc}" for name, desc in CONCEPT_DESCRIPTIONS.items()
    )

    return f"""You are classifying records for the Jay Rosen Internet Archive — a collection of the works, critiques, and teachings of Jay Rosen, NYU professor of journalism.

Identify which of Jay Rosen's key concepts (if any) are explicitly discussed in this record. Only assign a concept if it is a substantive part of the content — not just mentioned in passing.

VALID KEY CONCEPTS:
{concepts_list}

RECORD TO CLASSIFY:
Title: {title}
URL: {url}
Summary: {summary}
Excerpt: {excerpt}

Return ONLY valid JSON with no additional text:
{{
  "key_concepts": ["Concept 1"]
}}

Rules:
- Assign 0-2 concepts. Most records will have 0 or 1.
- Only assign a concept if it is explicitly discussed, not merely referenced.
- Use the exact concept names listed above.
- If no concepts apply, return {{"key_concepts": []}}."""


# ---------------------------------------------------------------------------
# Formatting and parsing
# ---------------------------------------------------------------------------


def format_record_for_classification(
    record: Dict,
    field: str,
    model: str = DEFAULT_MODEL,
    max_tokens: int = DEFAULT_MAX_TOKENS,
) -> Dict:
    """
    Format a record into an Anthropic Batch API request for classification.

    Args:
        record: Archive record dict.
        field: Field to classify (thematic_categories or key_concepts).
        model: Model ID.
        max_tokens: Max response tokens.

    Returns:
        Anthropic Batch API request dict.
    """
    record_id = record.get("id", "UNKNOWN")

    if field == "thematic_categories":
        prompt = _build_categories_prompt(record)
    else:
        prompt = _build_concepts_prompt(record)

    return {
        "custom_id": record_id,
        "params": {
            "model": model,
            "max_tokens": max_tokens,
            "messages": [
                {"role": "user", "content": prompt}
            ],
        },
    }


def parse_classification_response(
    raw_text: str,
    field: str,
) -> List[str]:
    """
    Parse an AI classification response and validate against the taxonomy.

    Handles raw JSON and JSON wrapped in markdown code fences.
    Filters out invalid values and enforces count limits.

    Args:
        raw_text: Raw response text from the model.
        field: Field name (thematic_categories or key_concepts).

    Returns:
        List of validated category/concept strings.
    """
    # Strip markdown code fences
    cleaned = raw_text.strip()
    if cleaned.startswith("```"):
        cleaned = re.sub(r"^```\w*\n?", "", cleaned)
        cleaned = re.sub(r"\n?```$", "", cleaned)
        cleaned = cleaned.strip()

    # Parse JSON
    try:
        data = json.loads(cleaned)
    except json.JSONDecodeError:
        return []

    raw_values = data.get(field, [])
    if not isinstance(raw_values, list):
        return []

    # Validate against allowed values
    if field == "thematic_categories":
        allowed = VALID_CATEGORIES
        max_count = MAX_CATEGORIES
    else:
        allowed = VALID_KEY_CONCEPTS
        max_count = MAX_CONCEPTS

    validated = [v for v in raw_values if v in allowed]
    return validated[:max_count]


# ---------------------------------------------------------------------------
# BatchMetadataFiller class
# ---------------------------------------------------------------------------


class BatchMetadataFiller:
    """
    Manages batch metadata filling via the Anthropic Batch API.

    Handles scanning for gaps, submitting classification requests,
    applying results back to the CSV, and generating spot-check reports.
    """

    def __init__(
        self,
        csv_path: Path,
        provider: str = "anthropic",
        model: str = DEFAULT_MODEL,
    ):
        self.csv_path = Path(csv_path)
        self.provider = provider
        self.model = model
        self._client = None

        # Tracking file lives next to the CSV
        self.tracking_dir = self.csv_path.parent / "metadata_fill"
        self.tracking_dir.mkdir(parents=True, exist_ok=True)
        self.batch_tracking_file = self.tracking_dir / "batch_tracking.json"

    def _get_client(self):
        """Get or create the Anthropic API client."""
        if self._client is None:
            try:
                from anthropic import Anthropic
                self._client = Anthropic()
            except ImportError:
                print("[FILL] ERROR: anthropic package not installed.")
                print("[FILL] Run: pip install anthropic")
                sys.exit(1)
            except Exception as e:
                print(f"[FILL] ERROR: Failed to create Anthropic client: {e}")
                sys.exit(1)
        return self._client

    # ----- Scanning -----

    def scan(self):
        """Scan the CSV and report how many records are missing each field."""
        records = read_archive_csv(self.csv_path)

        total = len(records)
        non_social = [
            r for r in records
            if r.get("content_type", "").strip() not in SOCIAL_CONTENT_TYPES
        ]

        missing_categories = find_records_missing_field(records, "thematic_categories")
        missing_concepts = find_records_missing_field(records, "key_concepts")

        print(f"[FILL] Archive CSV: {self.csv_path}")
        print(f"[FILL] Total records: {total}")
        print(f"[FILL] Non-social records: {len(non_social)}")
        print(f"[FILL] Missing thematic_categories: {len(missing_categories)}")
        print(f"[FILL] Missing key_concepts: {len(missing_concepts)}")

        if missing_categories:
            print(f"\n[FILL] Sample records missing categories:")
            for r in missing_categories[:5]:
                print(f"  - {r['id']}: {r.get('title', '(no title)')}")

        if missing_concepts:
            print(f"\n[FILL] Sample records missing key_concepts:")
            for r in missing_concepts[:5]:
                print(f"  - {r['id']}: {r.get('title', '(no title)')}")

    # ----- Batch submission -----

    def submit_fill_batch(self, field: str) -> Optional[str]:
        """
        Submit a batch of classification requests for records missing the given field.

        Args:
            field: thematic_categories or key_concepts.

        Returns:
            Batch ID, or None if no records need filling.
        """
        records = read_archive_csv(self.csv_path)
        missing = find_records_missing_field(records, field)

        if not missing:
            print(f"[FILL] No records missing {field}.")
            return None

        print(f"[FILL] Found {len(missing)} records missing {field}")

        client = self._get_client()

        # Format all records into batch requests
        requests = [
            format_record_for_classification(r, field, model=self.model)
            for r in missing
        ]

        print(f"[FILL] Submitting {len(requests)} requests to Anthropic Batch API...")

        batch = client.messages.batches.create(requests=requests)
        batch_id = batch.id

        print(f"[FILL] Batch created: {batch_id}")
        print(f"[FILL] Status: {batch.processing_status}")

        # Save tracking info
        self._save_batch_tracking(batch_id, field, len(missing), missing)

        return batch_id

    def _save_batch_tracking(
        self, batch_id: str, field: str, count: int, records: List[Dict]
    ):
        """Save batch tracking info."""
        tracking = self._load_batch_tracking()
        tracking[batch_id] = {
            "batch_id": batch_id,
            "field": field,
            "record_count": count,
            "record_ids": [r.get("id") for r in records],
            "submitted_at": datetime.now().isoformat(),
            "status": "submitted",
        }
        with open(self.batch_tracking_file, "w", encoding="utf-8") as f:
            json.dump(tracking, f, indent=2)

    def _load_batch_tracking(self) -> Dict:
        """Load batch tracking info."""
        if self.batch_tracking_file.exists():
            with open(self.batch_tracking_file, "r", encoding="utf-8") as f:
                return json.load(f)
        return {}

    # ----- Status -----

    def check_status(self, batch_id: str) -> Dict:
        """Check the status of a batch."""
        client = self._get_client()
        batch = client.messages.batches.retrieve(batch_id)

        result = {
            "batch_id": batch.id,
            "status": batch.processing_status,
            "created_at": str(getattr(batch, "created_at", "")),
        }

        if hasattr(batch, "request_counts"):
            counts = batch.request_counts
            result["succeeded"] = getattr(counts, "succeeded", 0)
            result["errored"] = getattr(counts, "errored", 0)
            result["expired"] = getattr(counts, "expired", 0)
            result["processing"] = getattr(counts, "processing", 0)

        return result

    # ----- Apply results -----

    def apply_results(self, batch_id: str) -> Tuple[int, int]:
        """
        Download batch results and update the CSV.

        Args:
            batch_id: The batch ID to process.

        Returns:
            Tuple of (records_updated, records_failed).
        """
        client = self._get_client()

        # Get tracking info for this batch
        tracking = self._load_batch_tracking()
        batch_info = tracking.get(batch_id, {})
        field = batch_info.get("field")

        if not field:
            print(f"[FILL] ERROR: No tracking info for batch {batch_id}")
            print("[FILL] Cannot determine which field was being filled.")
            return 0, 0

        print(f"[FILL] Downloading results for batch {batch_id} (field: {field})...")

        # Download results
        result_stream = client.messages.batches.results(batch_id)

        # Build a map of record_id -> classified values
        classifications = {}
        failed = 0

        for entry in result_stream:
            record_id = entry.custom_id

            if entry.result.type != "succeeded":
                print(f"[FILL] FAILED: {record_id}")
                failed += 1
                continue

            # Extract text from response
            message = entry.result.message
            response_text = ""
            for block in message.content:
                if block.type == "text":
                    response_text += block.text

            values = parse_classification_response(response_text, field)
            if values:
                classifications[record_id] = values

        print(f"[FILL] Parsed {len(classifications)} classifications, {failed} failed")

        if not classifications:
            print("[FILL] No classifications to apply.")
            return 0, failed

        # Read CSV, update records, write back
        records = read_archive_csv(self.csv_path)

        # Get fieldnames from the file
        with open(self.csv_path, "r", encoding="utf-8") as f:
            reader = csv.DictReader(f)
            fieldnames = reader.fieldnames

        updated = 0
        for record in records:
            rid = record.get("id")
            if rid in classifications:
                record[field] = "|".join(classifications[rid])
                updated += 1

        # Write back
        write_archive_csv(self.csv_path, records, fieldnames)
        print(f"[FILL] Updated {updated} records in {self.csv_path}")

        # Save results to tracking
        results_file = self.tracking_dir / f"results_{batch_id}.json"
        with open(results_file, "w", encoding="utf-8") as f:
            json.dump(classifications, f, indent=2)
        print(f"[FILL] Saved classification results to {results_file}")

        # Update tracking
        if batch_id in tracking:
            tracking[batch_id]["status"] = "applied"
            tracking[batch_id]["applied_at"] = datetime.now().isoformat()
            tracking[batch_id]["records_updated"] = updated
            tracking[batch_id]["records_failed"] = failed
            with open(self.batch_tracking_file, "w", encoding="utf-8") as f:
                json.dump(tracking, f, indent=2)

        return updated, failed

    # ----- Spot-check report -----

    def spot_check(self, sample_pct: float = 15.0, batch_id: Optional[str] = None):
        """
        Generate a spot-check report for recently filled metadata.

        Samples a percentage of records that have been filled and prints
        them for human review.

        Args:
            sample_pct: Percentage of records to sample (default 15).
            batch_id: If provided, only check records from this batch.
        """
        records = read_archive_csv(self.csv_path)

        if batch_id:
            # Check only records from this batch
            tracking = self._load_batch_tracking()
            batch_info = tracking.get(batch_id, {})
            field = batch_info.get("field", "thematic_categories")
            target_ids = set(batch_info.get("record_ids", []))
            pool = [r for r in records if r.get("id") in target_ids]
        else:
            # Check all non-social records that have both fields filled
            field = None
            pool = [
                r for r in records
                if r.get("content_type", "").strip() not in SOCIAL_CONTENT_TYPES
                and r.get("thematic_categories", "").strip()
                and r.get("key_concepts", "").strip()
            ]

        if not pool:
            print("[FILL] No records available for spot-checking.")
            return

        sample_size = max(1, int(len(pool) * sample_pct / 100))
        sample = random.sample(pool, min(sample_size, len(pool)))

        print(f"\n[FILL] === Spot-check report ===")
        print(f"[FILL] Pool size: {len(pool)}")
        print(f"[FILL] Sample size: {len(sample)} ({sample_pct}%)")
        if batch_id:
            print(f"[FILL] Batch: {batch_id}")
            print(f"[FILL] Field: {field}")
        print()

        for i, record in enumerate(sample, 1):
            print(f"--- Record {i}/{len(sample)} ---")
            print(f"  ID:         {record.get('id', '')}")
            print(f"  Title:      {record.get('title', '')}")
            print(f"  URL:        {record.get('url', '')}")
            print(f"  Categories: {record.get('thematic_categories', '')}")
            print(f"  Concepts:   {record.get('key_concepts', '')}")
            print(f"  Summary:    {record.get('summary', '')[:200]}")
            print()


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------


def main():
    parser = argparse.ArgumentParser(
        description="Batch metadata filler via Anthropic Batch API"
    )

    # Path to CSV
    default_csv = (
        Path(__file__).parent.parent.parent / "data" / "archive_records-public.csv"
    )
    parser.add_argument(
        "--csv",
        type=Path,
        default=default_csv,
        help="Path to archive CSV",
    )

    # Actions
    parser.add_argument(
        "--scan",
        action="store_true",
        help="Scan CSV and report metadata gaps",
    )
    parser.add_argument(
        "--fill",
        type=str,
        choices=["thematic_categories", "key_concepts", "categories"],
        help="Submit batch to fill a field (categories is alias for thematic_categories)",
    )
    parser.add_argument(
        "--apply",
        action="store_true",
        help="Apply completed batch results to CSV",
    )
    parser.add_argument(
        "--spot-check",
        action="store_true",
        help="Generate spot-check report",
    )

    # Options
    parser.add_argument(
        "--batch-id",
        type=str,
        help="Batch ID for --apply or --spot-check",
    )
    parser.add_argument(
        "--provider",
        type=str,
        choices=["anthropic"],
        default="anthropic",
        help="API provider (default: anthropic)",
    )
    parser.add_argument(
        "--model",
        type=str,
        default=DEFAULT_MODEL,
        help=f"Model to use (default: {DEFAULT_MODEL})",
    )
    parser.add_argument(
        "--sample-pct",
        type=float,
        default=15.0,
        help="Spot-check sample percentage (default: 15)",
    )

    args = parser.parse_args()

    # Normalize 'categories' alias
    if args.fill == "categories":
        args.fill = "thematic_categories"

    filler = BatchMetadataFiller(
        csv_path=args.csv,
        provider=args.provider,
        model=args.model,
    )

    if args.scan:
        filler.scan()

    elif args.fill:
        batch_id = filler.submit_fill_batch(args.fill)
        if batch_id:
            print(f"\n[FILL] Batch submitted: {batch_id}")
            print(f"[FILL] Check status: python {__file__} --apply --batch-id {batch_id}")

    elif args.apply:
        if not args.batch_id:
            print("[FILL] ERROR: --batch-id required for --apply")
            return 1
        updated, failed = filler.apply_results(args.batch_id)
        print(f"\n[FILL] Records updated: {updated}")
        print(f"[FILL] Records failed:  {failed}")

    elif args.spot_check:
        filler.spot_check(
            sample_pct=args.sample_pct,
            batch_id=args.batch_id,
        )

    else:
        # Default: show scan
        filler.scan()

    return 0


if __name__ == "__main__":
    sys.exit(main())
