#!/usr/bin/env python3
"""
Batch entity extraction using the Anthropic Batch API.

Replaces the manual "Ralph Loop" workflow by submitting social posts
directly to the Anthropic Batch API for entity and relationship extraction,
then processing results into the extraction database.

Usage:
    # Submit a batch of unprocessed posts
    python scripts/batch_entity_extraction.py --submit --batch-size 1000 --provider anthropic

    # Check batch status
    python scripts/batch_entity_extraction.py --status --batch-id <id>

    # Process completed batch results
    python scripts/batch_entity_extraction.py --process --batch-id <id>

    # Full auto: submit, poll, process (runs until all posts done)
    python scripts/batch_entity_extraction.py --auto --provider anthropic
"""

import argparse
import json
import os
import re
import sys
import time
from datetime import datetime
from pathlib import Path
from typing import Dict, List, Optional, Set, Tuple

# Add backend to path
backend_dir = Path(__file__).parent.parent
sys.path.insert(0, str(backend_dir))
sys.path.insert(0, str(backend_dir / "src"))

from rosen_scraper.extraction_db import ExtractionDB
from rosen_scraper.entity_registry import EntityRegistry
from rosen_scraper.csv_data_service import CSVDataService

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

VALID_ENTITY_TYPES = {
    "Person", "Organization", "Work", "Concept", "Event", "Location"
}

ENTITY_TYPE_PREFIXES = {
    "Person": "P",
    "Organization": "O",
    "Work": "W",
    "Concept": "C",
    "Event": "E",
    "Location": "L",
}

VALID_RELATIONSHIP_TYPES = {
    "Mentions", "Criticizes", "Cites", "Discusses", "Expands On",
    "Affiliated With", "Published In", "Originated By", "Occurred At",
    "Supports", "Owns", "Owned By", "Founded By", "Pioneered",
    "Inspired By",
}

# Type-specific fields that map to role_or_description in the DB
TYPE_SPECIFIC_ROLE_FIELDS = {
    "role",          # Person
    "org_type",      # Organization
    "work_type",     # Work
    "event_type",    # Event
    "location_type", # Location
    "description",   # Fallback
}

DEFAULT_MODEL = "claude-sonnet-4-5-20250929"
DEFAULT_MAX_TOKENS = 4096
DEFAULT_POLL_INTERVAL = 30  # seconds
DEFAULT_BATCH_SIZE = 1000

# ---------------------------------------------------------------------------
# Prompt
# ---------------------------------------------------------------------------


def build_extraction_prompt(post_text: str, post_id: str) -> str:
    """
    Build the entity extraction prompt for a single post.

    Args:
        post_text: The raw text of the social media post.
        post_id: The post's unique identifier.

    Returns:
        The full prompt string to send to the model.
    """
    return f"""Extract entities and relationships from this social media post by Jay Rosen (journalism professor at NYU).

Return ONLY valid JSON with no additional text. The JSON must have this structure:
{{
  "entities": [
    {{
      "entity_id": "<PREFIX><NNN>",
      "entity_type": "<Type>",
      "entity_name": "<Full name>",
      "<type_specific_field>": "<value>",
      "prominence_score": <1-10>
    }}
  ],
  "relationships": [
    {{
      "source_entity_id": "<entity_id>",
      "target_entity_id": "<entity_id>",
      "relationship_type": "<Type>",
      "context_snippet": "<max 200 chars from text>",
      "confidence_score": <0.0-1.0>
    }}
  ]
}}

ENTITY TYPES (use these ID prefixes):
- Person (P001, P002, ...): Fields: role, affiliation, prominence_score (1-10)
- Organization (O001, O002, ...): Fields: org_type, prominence_score
- Work (W001, W002, ...): Fields: work_type, author, publication_year, prominence_score
- Concept (C001, C002, ...): Fields: originator, related_concepts, prominence_score
- Event (E001, E002, ...): Fields: event_type, event_date, location, significance, prominence_score
- Location (L001, L002, ...): Fields: location_type, relevance, prominence_score

RELATIONSHIP TYPES (use exactly these strings):
Mentions, Criticizes, Cites, Discusses, Expands On, Affiliated With, Published In, Originated By, Occurred At, Supports, Owns, Owned By, Founded By, Pioneered, Inspired By

RULES:
- Skip the post author (Jay Rosen) UNLESS he is explicitly referenced in context (e.g., discussing his own past work).
- Only extract entities that are substantively discussed, not just mentioned in passing.
- Use full official names when possible (e.g., "The New York Times" not "NYT").
- If no entities are found, return {{"entities": [], "relationships": []}}.
- context_snippet must be a direct quote or close paraphrase from the post, max 200 characters.
- confidence_score: 1.0 = explicitly stated, 0.7-0.9 = strongly implied, 0.5-0.6 = inferred.

POST ID: {post_id}
POST TEXT:
{post_text}"""


# ---------------------------------------------------------------------------
# Formatting and parsing
# ---------------------------------------------------------------------------


def format_post_for_extraction(
    post: Dict,
    model: str = DEFAULT_MODEL,
    max_tokens: int = DEFAULT_MAX_TOKENS,
) -> Dict:
    """
    Format a social post into an Anthropic Batch API request.

    Args:
        post: Post dictionary with id, raw_text, publication_date, likes, reposts.
        model: Model ID to use.
        max_tokens: Maximum tokens for the response.

    Returns:
        Dict matching the Anthropic Batch API request format:
        {"custom_id": "...", "params": {"model": "...", "max_tokens": ..., "messages": [...]}}
    """
    post_id = post.get("id", "UNKNOWN")
    raw_text = post.get("raw_text", "")
    pub_date = post.get("publication_date", "")
    likes = post.get("likes", "0")
    reposts = post.get("reposts", "0")

    # Build context line
    context = f"[Date: {pub_date} | Likes: {likes} | Reposts: {reposts}]"
    full_text = f"{context}\n{raw_text}"

    prompt = build_extraction_prompt(full_text, post_id)

    return {
        "custom_id": post_id,
        "params": {
            "model": model,
            "max_tokens": max_tokens,
            "messages": [
                {"role": "user", "content": prompt}
            ],
        },
    }


def parse_extraction_response(
    raw_text: str,
    post_id: str,
) -> Tuple[List[Dict], List[Dict]]:
    """
    Parse an AI extraction response into entities and relationships.

    Handles:
    - Raw JSON
    - JSON wrapped in markdown code fences
    - Malformed responses (returns empty lists)

    Maps type-specific fields (role, org_type, work_type, event_type,
    location_type) to the DB's role_or_description column.

    Filters out invalid entity types and relationship types.
    Truncates context_snippet to 200 chars.

    Args:
        raw_text: The raw text response from the model.
        post_id: The post ID for tagging relationships.

    Returns:
        Tuple of (entities, relationships) lists.
    """
    # Strip markdown code fences if present
    cleaned = raw_text.strip()
    if cleaned.startswith("```"):
        # Remove opening fence (possibly with language tag)
        cleaned = re.sub(r"^```\w*\n?", "", cleaned)
        cleaned = re.sub(r"\n?```$", "", cleaned)
        cleaned = cleaned.strip()

    # Parse JSON
    try:
        data = json.loads(cleaned)
    except json.JSONDecodeError:
        print(f"[BATCH] WARNING: Failed to parse JSON for {post_id}")
        return [], []

    raw_entities = data.get("entities", [])
    raw_relationships = data.get("relationships", [])

    # Process entities
    entities = []
    for entity in raw_entities:
        entity_type = entity.get("entity_type", "")
        if entity_type not in VALID_ENTITY_TYPES:
            continue

        # Map type-specific fields to role_or_description
        for field in TYPE_SPECIFIC_ROLE_FIELDS:
            if field in entity and "role_or_description" not in entity:
                entity["role_or_description"] = entity.pop(field)
                break

        # Remove any remaining type-specific fields that weren't mapped
        for field in list(TYPE_SPECIFIC_ROLE_FIELDS):
            entity.pop(field, None)

        # Ensure role_or_description exists
        if "role_or_description" not in entity:
            entity["role_or_description"] = ""

        entities.append(entity)

    # Process relationships
    relationships = []
    for rel in raw_relationships:
        rel_type = rel.get("relationship_type", "")
        if rel_type not in VALID_RELATIONSHIP_TYPES:
            continue

        # Map context_snippet to evidence (DB column name)
        if "context_snippet" in rel:
            snippet = rel.pop("context_snippet")
            rel["evidence"] = snippet[:200] if snippet else ""

        # Ensure evidence field exists
        if "evidence" not in rel:
            rel["evidence"] = ""

        # Truncate evidence to 200 chars
        if len(rel.get("evidence", "")) > 200:
            rel["evidence"] = rel["evidence"][:200]

        # Add source_record_id
        rel["source_record_id"] = post_id

        relationships.append(rel)

    return entities, relationships


# ---------------------------------------------------------------------------
# BatchEntityExtractor class
# ---------------------------------------------------------------------------


class BatchEntityExtractor:
    """
    Manages batch entity extraction via the Anthropic Batch API.

    Handles submitting posts, polling for completion, and processing results
    into the extraction database.
    """

    def __init__(
        self,
        data_dir: Path,
        provider: str = "anthropic",
        model: str = DEFAULT_MODEL,
    ):
        self.data_dir = Path(data_dir)
        self.provider = provider
        self.model = model

        # Initialize database
        self.db = ExtractionDB(self.data_dir / "extraction.db")

        # Initialize entity registry
        self.registry = EntityRegistry()

        # Initialize CSV service
        self.csv_service = CSVDataService()
        self.csv_service.set_data_dir(self.data_dir)

        # Load existing entities into registry
        self._load_existing_entities()

        # API client (lazy init)
        self._client = None

        # Batch tracking file
        self.batch_tracking_file = self.data_dir / "batch_tracking.json"

    def _load_existing_entities(self):
        """Load existing entities from CSV into the registry."""
        entities_file = self.data_dir / "rosen_extracted_entities.csv"
        if entities_file.exists():
            count = self.registry.load_from_csv(entities_file)
            print(f"[BATCH] Loaded {count} existing entities into registry")
        else:
            print(f"[BATCH] No existing entities file found at {entities_file}")

    def _get_client(self):
        """Get or create the Anthropic API client."""
        if self._client is None:
            try:
                from anthropic import Anthropic
                self._client = Anthropic()
            except ImportError:
                print("[BATCH] ERROR: anthropic package not installed.")
                print("[BATCH] Run: pip install anthropic")
                sys.exit(1)
            except Exception as e:
                print(f"[BATCH] ERROR: Failed to create Anthropic client: {e}")
                sys.exit(1)
        return self._client

    # ----- Post loading / filtering -----

    def load_unprocessed_posts(
        self,
        batch_size: int = DEFAULT_BATCH_SIZE,
        tier: int = 1,
    ) -> List[Dict]:
        """
        Load and filter unprocessed social posts.

        Uses the same filtering logic as UnifiedEntityProcessor:
        - Minimum 7 words, 20 characters
        - Priority tiers: 1 (high engagement), 2 (2023+), 3 (all remaining)
        - Skip already-processed posts

        Args:
            batch_size: Max number of posts to return.
            tier: Priority tier (1, 2, or 3).

        Returns:
            List of post dicts ready for extraction.
        """
        posts = self.csv_service.read_social_posts()

        # Filter by word count and length
        filtered = []
        for post in posts:
            word_count = int(post.get("word_count", 0) or 0)
            raw_text = post.get("raw_text", "").strip()
            if word_count >= 7 and len(raw_text) >= 20:
                filtered.append(post)

        print(f"[BATCH] Loaded {len(filtered)} substantive posts (from {len(posts)} total)")

        # Filter out already-processed
        processed_ids = self.db.get_processed_ids()
        unprocessed = [p for p in filtered if p.get("id") not in processed_ids]
        print(f"[BATCH] {len(unprocessed)} posts remaining after filtering processed")

        if not unprocessed:
            return []

        # Apply tier filtering
        prioritized = self._prioritize_posts(unprocessed, tier)

        if not prioritized and tier < 3:
            print(f"[BATCH] No posts in tier {tier}, trying next tier...")
            return self.load_unprocessed_posts(batch_size, tier + 1)

        batch = prioritized[:batch_size]
        print(f"[BATCH] Prepared batch of {len(batch)} posts (tier {tier})")
        return batch

    def _prioritize_posts(self, posts: List[Dict], tier: int) -> List[Dict]:
        """Prioritize posts by engagement tier (matches UnifiedEntityProcessor)."""
        if tier == 1:
            filtered = []
            for p in posts:
                likes = int(p.get("likes", 0) or 0)
                reposts = int(p.get("reposts", 0) or 0)
                if likes >= 5 or reposts >= 2:
                    filtered.append(p)
        elif tier == 2:
            filtered = []
            for p in posts:
                likes = int(p.get("likes", 0) or 0)
                reposts = int(p.get("reposts", 0) or 0)
                if likes >= 5 or reposts >= 2:
                    continue
                pub_date = p.get("publication_date", "")
                try:
                    year = int(pub_date[:4])
                    if year >= 2023:
                        filtered.append(p)
                except (ValueError, IndexError):
                    pass
        else:
            tier1_ids = set()
            tier2_ids = set()
            for p in posts:
                likes = int(p.get("likes", 0) or 0)
                reposts = int(p.get("reposts", 0) or 0)
                pub_date = p.get("publication_date", "")
                if likes >= 5 or reposts >= 2:
                    tier1_ids.add(p.get("id"))
                else:
                    try:
                        year = int(pub_date[:4])
                        if year >= 2023:
                            tier2_ids.add(p.get("id"))
                    except (ValueError, IndexError):
                        pass
            filtered = [
                p for p in posts
                if p.get("id") not in tier1_ids and p.get("id") not in tier2_ids
            ]

        # Sort by engagement score descending
        def engagement_score(p):
            likes = int(p.get("likes", 0) or 0)
            reposts = int(p.get("reposts", 0) or 0)
            return likes + (reposts * 2)

        filtered.sort(key=engagement_score, reverse=True)
        return filtered

    # ----- Batch submission -----

    def submit_batch(
        self,
        posts: List[Dict],
    ) -> str:
        """
        Submit a batch of posts to the Anthropic Batch API.

        Args:
            posts: List of post dicts to process.

        Returns:
            The batch ID from the API.
        """
        client = self._get_client()

        # Format all posts into batch requests
        requests = [
            format_post_for_extraction(post, model=self.model)
            for post in posts
        ]

        print(f"[BATCH] Submitting {len(requests)} requests to Anthropic Batch API...")

        batch = client.messages.batches.create(requests=requests)

        batch_id = batch.id
        status = batch.processing_status

        print(f"[BATCH] Batch created: {batch_id}")
        print(f"[BATCH] Status: {status}")

        # Save tracking info
        self._save_batch_tracking(batch_id, len(posts), posts)

        return batch_id

    def _save_batch_tracking(
        self,
        batch_id: str,
        post_count: int,
        posts: List[Dict],
    ):
        """Save batch tracking info to a JSON file for resume capability."""
        tracking = self._load_batch_tracking()

        tracking[batch_id] = {
            "batch_id": batch_id,
            "post_count": post_count,
            "post_ids": [p.get("id") for p in posts],
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

    # ----- Status checking -----

    def check_batch_status(self, batch_id: str) -> Dict:
        """
        Check the status of a batch.

        Args:
            batch_id: The batch ID to check.

        Returns:
            Dict with status info.
        """
        client = self._get_client()
        batch = client.messages.batches.retrieve(batch_id)

        result = {
            "batch_id": batch.id,
            "status": batch.processing_status,
            "created_at": str(getattr(batch, "created_at", "")),
        }

        # Access request counts if available
        if hasattr(batch, "request_counts"):
            counts = batch.request_counts
            result["succeeded"] = getattr(counts, "succeeded", 0)
            result["errored"] = getattr(counts, "errored", 0)
            result["expired"] = getattr(counts, "expired", 0)
            result["canceled"] = getattr(counts, "canceled", 0)
            result["processing"] = getattr(counts, "processing", 0)

        return result

    # ----- Result processing -----

    def process_batch_results(self, batch_id: str) -> Tuple[int, int, int]:
        """
        Download and process results from a completed batch.

        Args:
            batch_id: The batch ID whose results to process.

        Returns:
            Tuple of (posts_processed, entities_saved, relationships_saved).
        """
        client = self._get_client()

        print(f"[BATCH] Downloading results for batch {batch_id}...")

        result_stream = client.messages.batches.results(batch_id)

        total_posts = 0
        total_entities = 0
        total_relationships = 0

        for entry in result_stream:
            post_id = entry.custom_id

            if entry.result.type != "succeeded":
                error_msg = str(getattr(entry.result, "error", "Unknown error"))
                print(f"[BATCH] FAILED: {post_id} — {error_msg}")
                self.db.mark_processed(
                    post_id,
                    status="failed",
                    error_msg=error_msg,
                )
                continue

            # Extract text content from the message
            message = entry.result.message
            response_text = ""
            for block in message.content:
                if block.type == "text":
                    response_text += block.text

            # Parse the extraction response
            entities, relationships = parse_extraction_response(
                response_text, post_id
            )

            # Run through entity registry for deduplication
            if entities:
                updated_entities, id_mapping, existing_count, new_count = \
                    self.registry.reassign_entity_ids(entities)

                # Update relationship IDs
                updated_relationships = self.registry.update_relationship_ids(
                    relationships, id_mapping
                )

                # Set first_mention_record_id on entities
                for entity in updated_entities:
                    if not entity.get("first_mention_record_id"):
                        entity["first_mention_record_id"] = post_id

                # Save to database
                self.db.save_entities(updated_entities)
                total_entities += len(updated_entities)

                if updated_relationships:
                    self.db.save_relationships(updated_relationships)
                    total_relationships += len(updated_relationships)
            else:
                updated_entities = []
                updated_relationships = []

            # Mark post as processed
            self.db.mark_processed(
                post_id,
                entity_count=len(updated_entities),
                relationship_count=len(updated_relationships),
            )
            total_posts += 1

            if total_posts % 100 == 0:
                print(f"[BATCH] Processed {total_posts} posts...")

        print(f"[BATCH] Done: {total_posts} posts, "
              f"{total_entities} entities, {total_relationships} relationships")

        # Update tracking
        tracking = self._load_batch_tracking()
        if batch_id in tracking:
            tracking[batch_id]["status"] = "processed"
            tracking[batch_id]["processed_at"] = datetime.now().isoformat()
            tracking[batch_id]["results"] = {
                "posts": total_posts,
                "entities": total_entities,
                "relationships": total_relationships,
            }
            with open(self.batch_tracking_file, "w", encoding="utf-8") as f:
                json.dump(tracking, f, indent=2)

        return total_posts, total_entities, total_relationships

    # ----- Auto mode -----

    def run_auto(
        self,
        batch_size: int = DEFAULT_BATCH_SIZE,
        poll_interval: int = DEFAULT_POLL_INTERVAL,
        tier: int = 1,
    ):
        """
        Full auto mode: submit, poll, process. Repeats until all posts done.

        Args:
            batch_size: Number of posts per batch.
            poll_interval: Seconds between status checks.
            tier: Starting priority tier.
        """
        while True:
            # Load next batch
            posts = self.load_unprocessed_posts(batch_size, tier)
            if not posts:
                print("[BATCH] No more unprocessed posts. Done!")
                break

            # Submit
            batch_id = self.submit_batch(posts)

            # Poll until complete
            print(f"[BATCH] Polling for completion (every {poll_interval}s)...")
            while True:
                time.sleep(poll_interval)
                status = self.check_batch_status(batch_id)

                processing_status = status.get("status", "")
                print(f"[BATCH] Status: {processing_status} "
                      f"(succeeded: {status.get('succeeded', '?')}, "
                      f"errored: {status.get('errored', '?')}, "
                      f"processing: {status.get('processing', '?')})")

                if processing_status == "ended":
                    break
                elif processing_status in ("canceled", "expired"):
                    print(f"[BATCH] Batch {processing_status}. Moving to next batch.")
                    break

            # Process results
            if processing_status == "ended":
                self.process_batch_results(batch_id)

            # Print progress
            self._print_progress()

    def _print_progress(self):
        """Print current extraction progress."""
        stats = self.db.get_stats()
        processed = stats.get("total_processed", 0)
        entities = stats.get("total_entities", 0)
        relationships = stats.get("total_relationships", 0)

        print(f"\n[BATCH] === Progress ===")
        print(f"[BATCH] Processed:     {processed:,}")
        print(f"[BATCH] Entities:      {entities:,}")
        print(f"[BATCH] Relationships: {relationships:,}")
        print()


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------


def main():
    parser = argparse.ArgumentParser(
        description="Batch entity extraction via Anthropic Batch API"
    )

    parser.add_argument(
        "--data-dir",
        type=Path,
        default=Path(__file__).parent.parent.parent / "data" / "social_import",
        help="Path to data directory",
    )

    # Actions
    parser.add_argument(
        "--submit",
        action="store_true",
        help="Submit a batch of unprocessed posts",
    )
    parser.add_argument(
        "--status",
        action="store_true",
        help="Check batch status",
    )
    parser.add_argument(
        "--process",
        action="store_true",
        help="Process completed batch results",
    )
    parser.add_argument(
        "--auto",
        action="store_true",
        help="Full auto: submit, poll, process until done",
    )

    # Options
    parser.add_argument(
        "--batch-id",
        type=str,
        help="Batch ID for --status or --process",
    )
    parser.add_argument(
        "--batch-size",
        type=int,
        default=DEFAULT_BATCH_SIZE,
        help=f"Number of posts per batch (default: {DEFAULT_BATCH_SIZE})",
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
        "--tier",
        type=int,
        choices=[1, 2, 3],
        default=1,
        help="Priority tier (1=high engagement, 2=recent, 3=all)",
    )
    parser.add_argument(
        "--poll-interval",
        type=int,
        default=DEFAULT_POLL_INTERVAL,
        help=f"Seconds between status polls (default: {DEFAULT_POLL_INTERVAL})",
    )

    args = parser.parse_args()

    extractor = BatchEntityExtractor(
        data_dir=args.data_dir,
        provider=args.provider,
        model=args.model,
    )

    if args.submit:
        posts = extractor.load_unprocessed_posts(args.batch_size, args.tier)
        if posts:
            batch_id = extractor.submit_batch(posts)
            print(f"\n[BATCH] Batch submitted: {batch_id}")
            print(f"[BATCH] Check status with: python {__file__} --status --batch-id {batch_id}")
        else:
            print("[BATCH] No unprocessed posts to submit.")

    elif args.status:
        if not args.batch_id:
            # Show tracking file info
            tracking = extractor._load_batch_tracking()
            if not tracking:
                print("[BATCH] No batches tracked. Use --batch-id to check a specific batch.")
            else:
                for bid, info in tracking.items():
                    print(f"  {bid}: {info.get('status', '?')} "
                          f"({info.get('post_count', '?')} posts, "
                          f"submitted {info.get('submitted_at', '?')})")
        else:
            status = extractor.check_batch_status(args.batch_id)
            for key, value in status.items():
                print(f"  {key}: {value}")

    elif args.process:
        if not args.batch_id:
            print("[BATCH] ERROR: --batch-id required for --process")
            return 1
        posts, entities, rels = extractor.process_batch_results(args.batch_id)
        print(f"\n[BATCH] Processed {posts} posts")
        print(f"[BATCH] Entities saved:      {entities}")
        print(f"[BATCH] Relationships saved: {rels}")

    elif args.auto:
        extractor.run_auto(
            batch_size=args.batch_size,
            poll_interval=args.poll_interval,
            tier=args.tier,
        )

    else:
        # Default: show extraction progress
        extractor._print_progress()

    return 0


if __name__ == "__main__":
    sys.exit(main())
