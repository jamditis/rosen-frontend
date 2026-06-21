# -*- coding: utf-8 -*-
"""
Entity Metadata Backfill

This script fills in missing role_or_description and affiliation data
for deduplicated entities by analyzing their first mention in the source text.
"""

import os
import time
from typing import Dict, List, Optional

import gspread
from dotenv import load_dotenv
import google.generativeai as genai

from rosen_scraper.gemini_json import parse_gemini_json
from rosen_scraper.path_utils import find_project_root

load_dotenv()

# Define the project's base directory using pathlib for cleaner path handling
BASE_DIR = find_project_root()

# Rate limiting
RATE_LIMIT_DELAY = 2  # seconds between API calls


def _empty_metadata() -> Dict:
    """Return a fresh blank metadata dict for the extraction failure paths.

    A new dict on every call so a caller may mutate the result without
    affecting any other failure branch.
    """
    return {
        'role_or_description': '',
        'affiliation': '',
        'confidence': 0.0,
        'text_evidence': '',
    }


class EntityMetadataBackfiller:
    """Backfills missing role and affiliation data for entities."""

    def __init__(self, spreadsheet_name: Optional[str] = None):
        """Initialize the backfiller."""
        self.spreadsheet_name = spreadsheet_name or os.environ.get("SPREADSHEET_NAME")
        self.gc = None
        self.spreadsheet = None
        self.entities_sheet = None
        self.test_runs_sheet = None

        # Configure Gemini
        api_key = os.environ.get("GEMINI_API_KEY")
        if not api_key:
            raise ValueError("GEMINI_API_KEY not found in environment")
        genai.configure(api_key=api_key)
        self.model = genai.GenerativeModel('gemini-2.0-flash-exp')

    def connect_to_sheets(self):
        """Connect to Google Sheets."""
        try:
            credentials_path = BASE_DIR / os.environ.get("GOOGLE_APPLICATION_CREDENTIALS", "google_credentials.json")

            print("[BACKFILL] Connecting to Google Sheets...")
            self.gc = gspread.service_account(filename=str(credentials_path))
            self.spreadsheet = self.gc.open(self.spreadsheet_name)
            self.entities_sheet = self.spreadsheet.worksheet("extracted_entities")
            self.test_runs_sheet = self.spreadsheet.worksheet("test_runs")
            print("[BACKFILL] Successfully connected")
            return True
        except Exception as e:
            print(f"[BACKFILL] ERROR: Failed to connect: {e}")
            return False

    def load_entities_needing_metadata(self) -> List[Dict]:
        """Load entities that are missing role or affiliation data."""
        print("[BACKFILL] Loading entities from sheet...")
        all_values = self.entities_sheet.get_all_values()

        if len(all_values) < 2:
            print("[BACKFILL] No entities found")
            return []

        headers = all_values[0]
        rows = all_values[1:]

        # Find column indices
        try:
            entity_id_col = headers.index("entity_id")
            entity_type_col = headers.index("entity_type")
            entity_name_col = headers.index("entity_name")
            role_col = headers.index("role_or_description")
            affiliation_col = headers.index("affiliation")
            first_mention_col = headers.index("first_mention_record_id")
        except ValueError as e:
            print(f"[BACKFILL] ERROR: Required column not found: {e}")
            return []

        entities_needing_metadata = []
        for row_idx, row in enumerate(rows):
            if len(row) <= max(entity_id_col, entity_type_col, entity_name_col,
                              role_col, affiliation_col, first_mention_col):
                continue

            entity_id = row[entity_id_col]
            entity_type = row[entity_type_col]
            entity_name = row[entity_name_col]
            role = row[role_col] if role_col < len(row) else ""
            affiliation = row[affiliation_col] if affiliation_col < len(row) else ""
            first_mention_record_id = row[first_mention_col]

            # Only process if missing role or affiliation, and has a first mention
            if (not role or not affiliation) and first_mention_record_id:
                entities_needing_metadata.append({
                    'row_number': row_idx + 2,  # +2 for header and 0-indexing
                    'entity_id': entity_id,
                    'entity_type': entity_type,
                    'entity_name': entity_name,
                    'role': role,
                    'affiliation': affiliation,
                    'first_mention_record_id': first_mention_record_id,
                    'needs_role': not role,
                    'needs_affiliation': not affiliation
                })

        print(f"[BACKFILL] Found {len(entities_needing_metadata)} entities needing metadata")
        return entities_needing_metadata

    def get_record_text(self, record_id: str) -> Optional[str]:
        """Get raw_text for a record from test_runs sheet."""
        try:
            all_values = self.test_runs_sheet.get_all_values()
            if len(all_values) < 2:
                return None

            headers = all_values[0]
            id_col = headers.index("id")
            raw_text_col = headers.index("raw_text")

            for row in all_values[1:]:
                if len(row) > max(id_col, raw_text_col):
                    if row[id_col] == record_id:
                        return row[raw_text_col]
            return None
        except Exception as e:
            print(f"[BACKFILL] ERROR: Could not get text for {record_id}: {e}")
            return None

    def extract_metadata_with_ai(self, entity_name: str, entity_type: str, text: str) -> Dict:
        """Use AI to extract role and affiliation for an entity from text with confidence scoring."""
        prompt = f"""Analyze the following text and extract metadata about the entity "{entity_name}" (type: {entity_type}).

CRITICAL: Base your response ONLY on information explicitly stated or clearly implied in the text below. Do NOT use external knowledge or make assumptions.

Text:
{text[:4000]}

Provide:
1. role_or_description: A brief description of this entity's role, position, or function (e.g., "Reporter at CNN", "Professor of Journalism", "Online news platform"). ONLY fill this if clearly stated in the text.
2. affiliation: The organization, institution, or publication this entity is affiliated with. ONLY fill this if explicitly mentioned in the text.
3. confidence: Your confidence (0.0 to 1.0) that the extracted information is accurate based on the text:
   - 1.0: Explicitly stated in text with clear context
   - 0.7-0.9: Clearly implied or described in text
   - 0.4-0.6: Mentioned but context is ambiguous
   - 0.0-0.3: Minimal or no information in text

Respond in JSON format:
{{
  "role_or_description": "...",
  "affiliation": "...",
  "confidence": 0.0,
  "text_evidence": "Brief quote or description showing where you found this info"
}}

If the information is not in the text, leave fields empty and set confidence to 0.0."""

        try:
            response = self.model.generate_content(prompt)

            # Check if response is valid
            if not response:
                print("  [WARNING] No response from AI")
                return _empty_metadata()

            # Check for safety ratings or blocked content
            if hasattr(response, 'prompt_feedback') and response.prompt_feedback:
                if hasattr(response.prompt_feedback, 'block_reason') and response.prompt_feedback.block_reason:
                    print(f"  [WARNING] Content blocked: {response.prompt_feedback.block_reason}")
                    return _empty_metadata()

            # Try to access response.text safely
            try:
                result_text = response.text
                if not result_text:
                    print("  [WARNING] Empty text in response")
                    if hasattr(response, 'candidates') and response.candidates:
                        print(f"  [DEBUG] Candidates: {len(response.candidates)}")
                        if hasattr(response.candidates[0], 'finish_reason'):
                            print(f"  [DEBUG] Finish reason: {response.candidates[0].finish_reason}")
                    return _empty_metadata()
                result_text = result_text.strip()
            except AttributeError as ae:
                print(f"  [WARNING] Could not access response.text: {ae}")
                return _empty_metadata()

            # Extract JSON from response (strips any markdown code fence)
            result = parse_gemini_json(result_text)

            return {
                'role_or_description': result.get('role_or_description', '').strip(),
                'affiliation': result.get('affiliation', '').strip(),
                'confidence': float(result.get('confidence', 0.0)),
                'text_evidence': result.get('text_evidence', '').strip()
            }
        except Exception as e:
            print(f"  [ERROR] AI extraction failed for {entity_name}: {e}")
            return _empty_metadata()

    def supplement_with_web_search(self, entity_name: str, entity_type: str, existing_metadata: Dict) -> Dict:
        """Use web search to supplement low-confidence metadata."""
        print("    [WEB SEARCH] Low confidence - searching for additional context...")

        # Check if googlesearch is available
        try:
            from googlesearch import search as google_search
        except ImportError:
            print("    [WEB SEARCH] googlesearch-python not installed, skipping")
            print("    [INFO] Install with: pip install googlesearch-python")
            return existing_metadata

        # Build search query
        if entity_type == "Person":
            search_query = f"{entity_name} journalist reporter writer"
        elif entity_type == "Organization":
            search_query = f"{entity_name} news media organization"
        elif entity_type == "Concept":
            search_query = f'"{entity_name}" journalism concept definition'
        else:
            search_query = f'"{entity_name}" {entity_type}'

        try:
            # Get top 2 search results
            results = []
            for url in google_search(search_query, num_results=2):
                results.append(url)

            if not results:
                print("    [WEB SEARCH] No results found")
                return existing_metadata

            print(f"    [WEB SEARCH] Found {len(results)} results")

            # Use AI to analyze search results and supplement metadata
            supplement_prompt = f"""Based on these search results for "{entity_name}" (type: {entity_type}), provide BRIEF supplemental information.

Current metadata (from source text):
- Role: {existing_metadata.get('role_or_description', 'Unknown')}
- Affiliation: {existing_metadata.get('affiliation', 'Unknown')}

Search results:
{' | '.join(results[:2])}

Provide concise supplemental information to fill gaps or confirm existing data. Be brief and factual.

Respond in JSON format:
{{
  "role_or_description": "Brief role/description if found",
  "affiliation": "Affiliation if found",
  "source": "web search"
}}

Only provide information that is clearly evident from the search results."""

            response = self.model.generate_content(supplement_prompt)
            result_text = response.text.strip()

            # Extract JSON (strips any markdown code fence)
            web_result = parse_gemini_json(result_text)

            # Merge with existing, preferring text-based info
            merged = {
                'role_or_description': existing_metadata.get('role_or_description') or web_result.get('role_or_description', ''),
                'affiliation': existing_metadata.get('affiliation') or web_result.get('affiliation', ''),
                'confidence': existing_metadata.get('confidence', 0.0),
                'text_evidence': existing_metadata.get('text_evidence', '') + ' [supplemented with web search]'
            }

            print("    [WEB SEARCH] Enhanced metadata")
            return merged

        except Exception as e:
            print(f"    [WEB SEARCH] Failed: {e}")
            return existing_metadata

    def update_entity_metadata(self, entity: Dict, metadata: Dict):
        """Update entity row with extracted metadata."""
        try:
            row_number = entity['row_number']
            updates = []

            # Get column letters
            headers = self.entities_sheet.row_values(1)
            role_col_idx = headers.index("role_or_description") + 1
            affiliation_col_idx = headers.index("affiliation") + 1

            # Only update if we extracted something and field was empty
            if entity['needs_role'] and metadata['role_or_description']:
                updates.append({
                    'range': f'{gspread.utils.rowcol_to_a1(row_number, role_col_idx)}',
                    'values': [[metadata['role_or_description']]]
                })

            if entity['needs_affiliation'] and metadata['affiliation']:
                updates.append({
                    'range': f'{gspread.utils.rowcol_to_a1(row_number, affiliation_col_idx)}',
                    'values': [[metadata['affiliation']]]
                })

            if updates:
                self.entities_sheet.batch_update(updates)
                return True
            return False
        except Exception as e:
            print(f"[BACKFILL] ERROR: Could not update {entity['entity_id']}: {e}")
            return False

    def run(self, limit: Optional[int] = None, confidence_threshold: float = 0.6):
        """Run the backfill process.

        Args:
            limit: Maximum number of entities to process
            confidence_threshold: Trigger web search if confidence is below this (0.0-1.0)
        """
        print("\n" + "="*80)
        print("ENTITY METADATA BACKFILL")
        print("="*80 + "\n")

        # Connect
        if not self.connect_to_sheets():
            return

        # Load entities needing metadata
        entities = self.load_entities_needing_metadata()
        if not entities:
            print("[BACKFILL] No entities need metadata backfill")
            return

        # Apply limit if specified
        if limit:
            entities = entities[:limit]
            print(f"[BACKFILL] Processing {limit} entities (limited)")

        # Process each entity
        processed = 0
        updated = 0
        skipped = 0

        for idx, entity in enumerate(entities):
            print(f"\n[{idx+1}/{len(entities)}] Processing {entity['entity_id']} - {entity['entity_name']}")

            # Get the text from first mention
            record_text = self.get_record_text(entity['first_mention_record_id'])
            if not record_text:
                print(f"  [SKIP] Could not find text for record {entity['first_mention_record_id']}")
                skipped += 1
                continue

            # Extract metadata using AI
            metadata = self.extract_metadata_with_ai(
                entity['entity_name'],
                entity['entity_type'],
                record_text
            )

            confidence = metadata.get('confidence', 0.0)
            print(f"  Confidence: {confidence:.2f}")
            print(f"  Role: {metadata['role_or_description'][:60] if metadata['role_or_description'] else '(none)'}")
            print(f"  Affiliation: {metadata['affiliation'][:60] if metadata['affiliation'] else '(none)'}")

            # If confidence is low, supplement with web search
            if confidence < confidence_threshold and confidence > 0.0:
                metadata = self.supplement_with_web_search(
                    entity['entity_name'],
                    entity['entity_type'],
                    metadata
                )
                print(f"  Role (enhanced): {metadata['role_or_description'][:60] if metadata['role_or_description'] else '(none)'}")
                print(f"  Affiliation (enhanced): {metadata['affiliation'][:60] if metadata['affiliation'] else '(none)'}")

            # Update the sheet
            if self.update_entity_metadata(entity, metadata):
                updated += 1
                print("  [UPDATED]")
            else:
                print("  [NO UPDATE NEEDED]")

            processed += 1

            # Rate limiting
            if idx < len(entities) - 1:
                time.sleep(RATE_LIMIT_DELAY)

        # Summary
        print("\n" + "="*80)
        print("BACKFILL COMPLETE")
        print("="*80)
        print(f"Processed: {processed}")
        print(f"Updated: {updated}")
        print(f"Skipped: {skipped}")
        print("="*80 + "\n")


def main():
    """Main entry point."""
    import argparse

    parser = argparse.ArgumentParser(description="Backfill entity metadata")
    parser.add_argument(
        "--limit",
        type=int,
        default=None,
        help="Maximum number of entities to process (default: all)"
    )
    parser.add_argument(
        "--spreadsheet",
        type=str,
        default=None,
        help="Google Sheet name (default: from environment)"
    )
    parser.add_argument(
        "--confidence-threshold",
        type=float,
        default=0.6,
        help="Confidence threshold for triggering web search (0.0-1.0, default: 0.6)"
    )

    args = parser.parse_args()

    backfiller = EntityMetadataBackfiller(spreadsheet_name=args.spreadsheet)
    backfiller.run(limit=args.limit, confidence_threshold=args.confidence_threshold)


if __name__ == "__main__":
    main()
