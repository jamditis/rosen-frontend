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
from typing import Dict, List, Tuple

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

PROVIDER_DEFAULTS = {
    "anthropic": {
        "model": "claude-sonnet-4-5-20250929",
        "max_tokens": 4096,
    },
    "openai": {
        "model": "gpt-4o-mini",
        "max_tokens": 4096,
    },
    "gemini": {
        "model": "gemini-2.5-flash",
        "max_tokens": 4096,
    },
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


def format_post_for_extraction_openai(
    post: Dict,
    model: str = "gpt-4o-mini",
    max_tokens: int = DEFAULT_MAX_TOKENS,
) -> Dict:
    """
    Format a social post into an OpenAI Batch API JSONL request line.

    OpenAI batch format:
    {"custom_id": "...", "method": "POST", "url": "/v1/chat/completions",
     "body": {"model": "...", "max_tokens": ..., "messages": [...]}}
    """
    post_id = post.get("id", "UNKNOWN")
    raw_text = post.get("raw_text", "")
    pub_date = post.get("publication_date", "")
    likes = post.get("likes", "0")
    reposts = post.get("reposts", "0")

    context = f"[Date: {pub_date} | Likes: {likes} | Reposts: {reposts}]"
    full_text = f"{context}\n{raw_text}"
    prompt = build_extraction_prompt(full_text, post_id)

    return {
        "custom_id": post_id,
        "method": "POST",
        "url": "/v1/chat/completions",
        "body": {
            "model": model,
            "max_tokens": max_tokens,
            "messages": [
                {"role": "user", "content": prompt}
            ],
        },
    }


def format_post_for_extraction_gemini(
    post: Dict,
) -> Dict:
    """
    Format a social post into a Gemini inline batch request.

    Gemini inline format:
    {"contents": [{"parts": [{"text": "..."}], "role": "user"}],
     "config": {"response_modalities": ["text"]}}

    The custom_id is stored separately since Gemini uses positional ordering
    or the 'key' field in JSONL mode.
    """
    post_id = post.get("id", "UNKNOWN")
    raw_text = post.get("raw_text", "")
    pub_date = post.get("publication_date", "")
    likes = post.get("likes", "0")
    reposts = post.get("reposts", "0")

    context = f"[Date: {pub_date} | Likes: {likes} | Reposts: {reposts}]"
    full_text = f"{context}\n{raw_text}"
    prompt = build_extraction_prompt(full_text, post_id)

    return {
        "contents": [
            {"parts": [{"text": prompt}], "role": "user"}
        ],
        "config": {"response_modalities": ["TEXT"]},
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
        """Get or create the API client for the configured provider."""
        if self._client is None:
            if self.provider == "anthropic":
                try:
                    from anthropic import Anthropic
                    self._client = Anthropic()
                except ImportError:
                    print("[BATCH] ERROR: anthropic package not installed. Run: pip install anthropic")
                    sys.exit(1)
            elif self.provider == "openai":
                try:
                    from openai import OpenAI
                    api_key = os.environ.get("OPENAI_API_KEY")
                    if not api_key:
                        print("[BATCH] ERROR: OPENAI_API_KEY not set")
                        sys.exit(1)
                    self._client = OpenAI(api_key=api_key)
                except ImportError:
                    print("[BATCH] ERROR: openai package not installed. Run: pip install openai")
                    sys.exit(1)
            elif self.provider == "gemini":
                try:
                    from google import genai
                    api_key = os.environ.get("GEMINI_API_KEY")
                    if not api_key:
                        print("[BATCH] ERROR: GEMINI_API_KEY not set")
                        sys.exit(1)
                    self._client = genai.Client(api_key=api_key)
                except ImportError:
                    print("[BATCH] ERROR: google-genai package not installed. Run: pip install google-genai")
                    sys.exit(1)
            else:
                print(f"[BATCH] ERROR: Unknown provider: {self.provider}")
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
        Submit a batch of posts to the configured provider's Batch API.

        Args:
            posts: List of post dicts to process.

        Returns:
            The batch ID from the API.
        """
        client = self._get_client()

        print(f"[BATCH] Submitting {len(posts)} requests to {self.provider} Batch API...")

        if self.provider == "anthropic":
            return self._submit_batch_anthropic(client, posts)
        elif self.provider == "openai":
            return self._submit_batch_openai(client, posts)
        elif self.provider == "gemini":
            return self._submit_batch_gemini(client, posts)
        else:
            raise ValueError(f"Unknown provider: {self.provider}")

    def _submit_batch_anthropic(self, client, posts: List[Dict]) -> str:
        """Submit batch via Anthropic Batch API."""
        requests = [
            format_post_for_extraction(post, model=self.model)
            for post in posts
        ]
        batch = client.messages.batches.create(requests=requests)
        batch_id = batch.id
        print(f"[BATCH] Batch created: {batch_id} (status: {batch.processing_status})")
        self._save_batch_tracking(batch_id, len(posts), posts)
        return batch_id

    def _submit_batch_openai(self, client, posts: List[Dict]) -> str:
        """Submit batch via OpenAI Batch API (upload JSONL → create batch)."""
        import io

        requests = [
            format_post_for_extraction_openai(post, model=self.model)
            for post in posts
        ]

        # Write JSONL to a temp file
        jsonl_content = "\n".join(json.dumps(r) for r in requests)
        jsonl_bytes = jsonl_content.encode("utf-8")

        # Upload the file
        print(f"[BATCH] Uploading {len(jsonl_bytes):,} bytes JSONL to OpenAI...")
        uploaded_file = client.files.create(
            file=io.BytesIO(jsonl_bytes),
            purpose="batch",
        )
        print(f"[BATCH] File uploaded: {uploaded_file.id}")

        # Create batch
        batch = client.batches.create(
            input_file_id=uploaded_file.id,
            endpoint="/v1/chat/completions",
            completion_window="24h",
        )
        batch_id = batch.id
        print(f"[BATCH] Batch created: {batch_id} (status: {batch.status})")
        self._save_batch_tracking(batch_id, len(posts), posts)
        return batch_id

    def _submit_batch_gemini(self, client, posts: List[Dict]) -> str:
        """Submit batch via Gemini Batch API (inline requests)."""
        requests = [
            format_post_for_extraction_gemini(post)
            for post in posts
        ]

        # Store post_id order for result mapping (Gemini uses positional ordering)
        post_ids = [p.get("id") for p in posts]

        batch = client.batches.create(
            model=self.model,
            src=requests,
        )
        batch_id = batch.name
        print(f"[BATCH] Batch created: {batch_id} (state: {batch.state})")

        # Save tracking with post_ids for positional mapping
        self._save_batch_tracking(batch_id, len(posts), posts)
        tracking = self._load_batch_tracking()
        if batch_id in tracking:
            tracking[batch_id]["post_ids_ordered"] = post_ids
            with open(self.batch_tracking_file, "w", encoding="utf-8") as f:
                json.dump(tracking, f, indent=2)

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
            Dict with normalized status info. The 'status' field is normalized:
            - "ended" / "completed" = done successfully
            - "in_progress" / "processing" = still running
            - "failed" / "canceled" / "expired" = terminal failure
        """
        client = self._get_client()

        if self.provider == "anthropic":
            return self._check_status_anthropic(client, batch_id)
        elif self.provider == "openai":
            return self._check_status_openai(client, batch_id)
        elif self.provider == "gemini":
            return self._check_status_gemini(client, batch_id)
        else:
            raise ValueError(f"Unknown provider: {self.provider}")

    def _check_status_anthropic(self, client, batch_id: str) -> Dict:
        batch = client.messages.batches.retrieve(batch_id)
        result = {
            "batch_id": batch.id,
            "status": batch.processing_status,
            "created_at": str(getattr(batch, "created_at", "")),
            "provider": "anthropic",
        }
        if hasattr(batch, "request_counts"):
            counts = batch.request_counts
            result["succeeded"] = getattr(counts, "succeeded", 0)
            result["errored"] = getattr(counts, "errored", 0)
            result["expired"] = getattr(counts, "expired", 0)
            result["canceled"] = getattr(counts, "canceled", 0)
            result["processing"] = getattr(counts, "processing", 0)
        return result

    def _check_status_openai(self, client, batch_id: str) -> Dict:
        batch = client.batches.retrieve(batch_id)
        # Normalize OpenAI status to match our expected values
        # OpenAI statuses: validating, failed, in_progress, finalizing, completed, expired, cancelling, cancelled
        status_map = {
            "completed": "ended",
            "failed": "failed",
            "expired": "expired",
            "cancelled": "canceled",
            "cancelling": "canceled",
        }
        raw_status = batch.status
        normalized = status_map.get(raw_status, raw_status)

        result = {
            "batch_id": batch.id,
            "status": normalized,
            "created_at": str(getattr(batch, "created_at", "")),
            "provider": "openai",
            "raw_status": raw_status,
        }
        if hasattr(batch, "request_counts") and batch.request_counts:
            counts = batch.request_counts
            result["succeeded"] = getattr(counts, "completed", 0)
            result["errored"] = getattr(counts, "failed", 0)
            result["processing"] = getattr(counts, "total", 0) - getattr(counts, "completed", 0) - getattr(counts, "failed", 0)
        return result

    def _check_status_gemini(self, client, batch_id: str) -> Dict:
        batch = client.batches.get(name=batch_id)
        # Normalize Gemini state
        # Gemini states: JOB_STATE_SUCCEEDED, JOB_STATE_FAILED, JOB_STATE_CANCELLED, JOB_STATE_RUNNING, etc.
        state = str(batch.state) if batch.state else "unknown"
        status_map = {
            "JOB_STATE_SUCCEEDED": "ended",
            "JOB_STATE_FAILED": "failed",
            "JOB_STATE_CANCELLED": "canceled",
        }
        normalized = status_map.get(state, "in_progress")

        result = {
            "batch_id": batch.name,
            "status": normalized,
            "provider": "gemini",
            "raw_state": state,
        }
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

        print(f"[BATCH] Downloading results for batch {batch_id} ({self.provider})...")

        if self.provider == "anthropic":
            return self._process_results_anthropic(client, batch_id)
        elif self.provider == "openai":
            return self._process_results_openai(client, batch_id)
        elif self.provider == "gemini":
            return self._process_results_gemini(client, batch_id)
        else:
            raise ValueError(f"Unknown provider: {self.provider}")

    def _save_entity_results(
        self,
        post_id: str,
        response_text: str,
    ) -> Tuple[int, int]:
        """
        Parse response text and save entities/relationships to the DB.

        Returns (entity_count, relationship_count).
        """
        entities, relationships = parse_extraction_response(response_text, post_id)

        if entities:
            updated_entities, id_mapping, existing_count, new_count = \
                self.registry.reassign_entity_ids(entities)

            updated_relationships = self.registry.update_relationship_ids(
                relationships, id_mapping
            )

            for entity in updated_entities:
                if not entity.get("first_mention_record_id"):
                    entity["first_mention_record_id"] = post_id

            self.db.save_entities(updated_entities)

            if updated_relationships:
                self.db.save_relationships(updated_relationships)

            self.db.mark_processed(
                post_id,
                entity_count=len(updated_entities),
                relationship_count=len(updated_relationships),
            )
            return len(updated_entities), len(updated_relationships)
        else:
            self.db.mark_processed(post_id, entity_count=0, relationship_count=0)
            return 0, 0

    def _finalize_tracking(
        self,
        batch_id: str,
        total_posts: int,
        total_entities: int,
        total_relationships: int,
    ):
        """Update tracking file after processing."""
        print(f"[BATCH] Done: {total_posts} posts, "
              f"{total_entities} entities, {total_relationships} relationships")

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

    def _process_results_anthropic(self, client, batch_id: str) -> Tuple[int, int, int]:
        """Process results from Anthropic Batch API."""
        result_stream = client.messages.batches.results(batch_id)

        total_posts = 0
        total_entities = 0
        total_relationships = 0

        for entry in result_stream:
            post_id = entry.custom_id

            if entry.result.type != "succeeded":
                error_msg = str(getattr(entry.result, "error", "Unknown error"))
                print(f"[BATCH] FAILED: {post_id} — {error_msg}")
                self.db.mark_processed(post_id, status="failed", error_msg=error_msg)
                continue

            message = entry.result.message
            response_text = ""
            for block in message.content:
                if block.type == "text":
                    response_text += block.text

            ent_count, rel_count = self._save_entity_results(post_id, response_text)
            total_entities += ent_count
            total_relationships += rel_count
            total_posts += 1

            if total_posts % 100 == 0:
                print(f"[BATCH] Processed {total_posts} posts...")

        self._finalize_tracking(batch_id, total_posts, total_entities, total_relationships)
        return total_posts, total_entities, total_relationships

    def _process_results_openai(self, client, batch_id: str) -> Tuple[int, int, int]:
        """Process results from OpenAI Batch API."""
        batch = client.batches.retrieve(batch_id)

        if not batch.output_file_id:
            print(f"[BATCH] ERROR: No output file for batch {batch_id}")
            return 0, 0, 0

        # Download output file content
        file_content = client.files.content(batch.output_file_id)
        lines = file_content.text.strip().split("\n")

        total_posts = 0
        total_entities = 0
        total_relationships = 0

        for line in lines:
            if not line.strip():
                continue

            try:
                entry = json.loads(line)
            except json.JSONDecodeError:
                continue

            post_id = entry.get("custom_id", "UNKNOWN")
            response = entry.get("response", {})
            status_code = response.get("status_code", 0)

            if status_code != 200:
                error_msg = str(response.get("body", {}).get("error", "API error"))
                print(f"[BATCH] FAILED: {post_id} — {error_msg}")
                self.db.mark_processed(post_id, status="failed", error_msg=error_msg)
                continue

            # Extract text from OpenAI response format
            body = response.get("body", {})
            choices = body.get("choices", [])
            if not choices:
                self.db.mark_processed(post_id, entity_count=0, relationship_count=0)
                total_posts += 1
                continue

            response_text = choices[0].get("message", {}).get("content", "")

            ent_count, rel_count = self._save_entity_results(post_id, response_text)
            total_entities += ent_count
            total_relationships += rel_count
            total_posts += 1

            if total_posts % 100 == 0:
                print(f"[BATCH] Processed {total_posts} posts...")

        self._finalize_tracking(batch_id, total_posts, total_entities, total_relationships)
        return total_posts, total_entities, total_relationships

    def _process_results_gemini(self, client, batch_id: str) -> Tuple[int, int, int]:
        """Process results from Gemini Batch API."""
        # Get the batch job to access results
        batch = client.batches.get(name=batch_id)

        # Load post_ids from tracking for positional mapping
        tracking = self._load_batch_tracking()
        post_ids = tracking.get(batch_id, {}).get("post_ids_ordered", [])

        if not post_ids:
            # Fall back to regular post_ids
            post_ids = tracking.get(batch_id, {}).get("post_ids", [])

        if not post_ids:
            print(f"[BATCH] ERROR: No post IDs found in tracking for {batch_id}")
            return 0, 0, 0

        total_posts = 0
        total_entities = 0
        total_relationships = 0

        # Gemini batch results come from the destination
        # For inline batches, results are accessible via the batch response object
        dest = batch.dest
        if dest and isinstance(dest, str) and dest.startswith("gs://"):
            print(f"[BATCH] GCS output: {dest}")
            print("[BATCH] GCS result download not implemented — use inline batches")
            return 0, 0, 0

        # For inline results, iterate through response
        if hasattr(batch, "responses") and batch.responses:
            for idx, response in enumerate(batch.responses):
                if idx >= len(post_ids):
                    break
                post_id = post_ids[idx]

                try:
                    # Extract text from Gemini response
                    response_text = ""
                    if hasattr(response, "candidates") and response.candidates:
                        for candidate in response.candidates:
                            if hasattr(candidate, "content") and candidate.content:
                                for part in candidate.content.parts:
                                    if hasattr(part, "text"):
                                        response_text += part.text

                    if not response_text:
                        self.db.mark_processed(post_id, entity_count=0, relationship_count=0)
                        total_posts += 1
                        continue

                    ent_count, rel_count = self._save_entity_results(post_id, response_text)
                    total_entities += ent_count
                    total_relationships += rel_count
                    total_posts += 1
                except Exception as e:
                    print(f"[BATCH] FAILED: {post_id} — {e}")
                    self.db.mark_processed(post_id, status="failed", error_msg=str(e))

                if total_posts % 100 == 0:
                    print(f"[BATCH] Processed {total_posts} posts...")
        else:
            # Try to get results from dest file or list approach
            print(f"[BATCH] Batch {batch_id} has no inline responses.")
            print(f"[BATCH] Batch state: {batch.state}, dest: {getattr(batch, 'dest', 'N/A')}")
            # For file-based results, we'd need to download from GCS
            # For now, try listing results if the API supports it
            try:
                results_list = list(client.batches.list())
                print(f"[BATCH] Found {len(results_list)} batch jobs total")
            except Exception:
                pass
            return 0, 0, 0

        self._finalize_tracking(batch_id, total_posts, total_entities, total_relationships)
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

        print("\n[BATCH] === Progress ===")
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
        choices=["anthropic", "openai", "gemini"],
        default="anthropic",
        help="API provider (default: anthropic)",
    )
    parser.add_argument(
        "--model",
        type=str,
        default=None,
        help="Model to use (default: provider-specific)",
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
    parser.add_argument(
        "--parallel-submit",
        action="store_true",
        help="Submit batches to all 3 providers in parallel (splits posts evenly)",
    )

    args = parser.parse_args()

    # Resolve model: explicit --model > provider default
    model = args.model or PROVIDER_DEFAULTS.get(args.provider, {}).get("model", DEFAULT_MODEL)

    extractor = BatchEntityExtractor(
        data_dir=args.data_dir,
        provider=args.provider,
        model=model,
    )

    if args.parallel_submit:
        # Submit to all 3 providers, splitting posts evenly
        providers = ["anthropic", "openai", "gemini"]
        total_batch = args.batch_size * len(providers)

        # Load posts using the configured extractor (just for loading)
        posts = extractor.load_unprocessed_posts(total_batch, args.tier)
        if not posts:
            print("[BATCH] No unprocessed posts to submit.")
            return 0

        # Split into chunks
        chunk_size = len(posts) // len(providers)
        remainder = len(posts) % len(providers)
        chunks = []
        start = 0
        for i, prov in enumerate(providers):
            end = start + chunk_size + (1 if i < remainder else 0)
            chunks.append((prov, posts[start:end]))
            start = end

        print(f"\n[BATCH] Parallel submit: {len(posts)} posts across {len(providers)} providers")
        for prov, chunk in chunks:
            print(f"  {prov}: {len(chunk)} posts")
        print()

        batch_ids = {}
        for prov, chunk in chunks:
            if not chunk:
                continue
            prov_model = PROVIDER_DEFAULTS.get(prov, {}).get("model", DEFAULT_MODEL)
            prov_extractor = BatchEntityExtractor(
                data_dir=args.data_dir,
                provider=prov,
                model=prov_model,
            )
            try:
                bid = prov_extractor.submit_batch(chunk)
                batch_ids[prov] = bid
                print(f"[BATCH] {prov}: submitted batch {bid}")
            except Exception as e:
                print(f"[BATCH] {prov}: FAILED to submit — {e}")

        print(f"\n[BATCH] Submitted {len(batch_ids)} batches:")
        for prov, bid in batch_ids.items():
            print(f"  {prov}: {bid}")
        print("\n[BATCH] Check status:")
        for prov, bid in batch_ids.items():
            print(f"  python {__file__} --status --batch-id {bid} --provider {prov}")

        return 0

    elif args.submit:
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
