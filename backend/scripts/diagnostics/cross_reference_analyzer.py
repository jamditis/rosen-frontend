# -*- coding: utf-8 -*-
"""
Cross-Reference Analysis System for Rosen Archive

Implements intelligent cross-referencing with dual relationship detection:

1. responds_to: Explicit mention detection for discourse mapping
   - Identifies when records directly reference/respond to each other
   - Used for frontend visualization of interconnected conversations
   - Based on textual analysis of titles, authors, URLs, and content

2. related_to: Similarity-based thematic connections
   - Multi-factor analysis using keywords, entities, themes, temporal proximity
   - Identifies topically similar content for broader relationship mapping
   - Confidence scoring and evidence tracking for relationship validation
"""

import re
import json
import math
from datetime import datetime, timedelta
from typing import Dict, List, Tuple, Set, Any, Optional
from collections import Counter, defaultdict
from dataclasses import dataclass

import gspread
import os
import sys
from pathlib import Path
from dotenv import load_dotenv

ROOT_DIR = Path(__file__).resolve().parents[2]
SRC_DIR = ROOT_DIR / "src"
if str(SRC_DIR) not in sys.path:
    sys.path.append(str(SRC_DIR))

from src.logger import get_logger

load_dotenv()

@dataclass
class RelationshipScore:
    """Represents a relationship between two records."""
    record_id_1: str
    record_id_2: str
    similarity_score: float
    relationship_type: str  # "related_to", "responds_to", "influence"
    confidence: float
    evidence: Dict[str, Any]

class ContentSimilarityAnalyzer:
    """
    Analyzes content similarity using multiple techniques including
    keyword overlap, entity mentions, and thematic categorization.
    """

    def __init__(self):
        """Initialize the content similarity analyzer."""
        self.logger = get_logger()

        # Stop words to exclude from analysis
        self.stop_words = {
            'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for',
            'of', 'with', 'by', 'from', 'up', 'about', 'into', 'through', 'during',
            'before', 'after', 'above', 'below', 'between', 'among', 'within',
            'is', 'are', 'was', 'were', 'be', 'been', 'being', 'have', 'has', 'had',
            'do', 'does', 'did', 'will', 'would', 'should', 'could', 'can', 'may',
            'might', 'must', 'shall', 'this', 'that', 'these', 'those', 'i', 'you',
            'he', 'she', 'it', 'we', 'they', 'me', 'him', 'her', 'us', 'them'
        }

        # Journalism-specific important terms that should be weighted higher
        self.journalism_terms = {
            'journalism', 'media', 'press', 'news', 'reporter', 'editor', 'publisher',
            'newspaper', 'magazine', 'broadcast', 'digital', 'online', 'coverage',
            'story', 'article', 'investigation', 'interview', 'source', 'ethics',
            'objectivity', 'bias', 'credibility', 'verification', 'fact-checking'
        }

    def extract_keywords(self, text: str, min_length: int = 3, max_keywords: int = 100) -> List[str]:
        """
        Extract meaningful keywords from text.

        Args:
            text: Text to analyze
            min_length: Minimum keyword length
            max_keywords: Maximum number of keywords to return

        Returns:
            List of keywords sorted by importance
        """
        if not text:
            return []

        # Clean and normalize text
        text = re.sub(r'[^\w\s]', ' ', text.lower())
        words = text.split()

        # Filter out stop words and short words
        keywords = [word for word in words
                   if len(word) >= min_length and word not in self.stop_words]

        # Count word frequencies
        word_counts = Counter(keywords)

        # Weight journalism terms higher
        for word, count in word_counts.items():
            if word in self.journalism_terms:
                word_counts[word] = count * 2

        # Return top keywords
        return [word for word, count in word_counts.most_common(max_keywords)]

    def calculate_keyword_similarity(self, keywords1: List[str], keywords2: List[str]) -> float:
        """
        Calculate similarity based on keyword overlap using Jaccard similarity.

        Args:
            keywords1: Keywords from first document
            keywords2: Keywords from second document

        Returns:
            Similarity score between 0.0 and 1.0
        """
        if not keywords1 or not keywords2:
            return 0.0

        set1 = set(keywords1)
        set2 = set(keywords2)

        intersection = len(set1.intersection(set2))
        union = len(set1.union(set2))

        return intersection / union if union > 0 else 0.0

    def calculate_entity_similarity(self, entities1: List[str], entities2: List[str]) -> float:
        """
        Calculate similarity based on shared entity mentions.

        Args:
            entities1: Entity mentions from first document
            entities2: Entity mentions from second document

        Returns:
            Similarity score between 0.0 and 1.0
        """
        if not entities1 or not entities2:
            return 0.0

        # Parse comma-separated entity strings if needed
        if isinstance(entities1, str):
            entities1 = [e.strip() for e in entities1.split(',') if e.strip()]
        if isinstance(entities2, str):
            entities2 = [e.strip() for e in entities2.split(',') if e.strip()]

        set1 = set([e.lower() for e in entities1])
        set2 = set([e.lower() for e in entities2])

        if not set1 or not set2:
            return 0.0

        intersection = len(set1.intersection(set2))
        union = len(set1.union(set2))

        return intersection / union if union > 0 else 0.0

    def calculate_thematic_similarity(self, themes1: List[str], themes2: List[str]) -> float:
        """
        Calculate similarity based on thematic categories.

        Args:
            themes1: Thematic categories from first document
            themes2: Thematic categories from second document

        Returns:
            Similarity score between 0.0 and 1.0
        """
        if not themes1 or not themes2:
            return 0.0

        # Parse comma-separated theme strings if needed
        if isinstance(themes1, str):
            themes1 = [t.strip() for t in themes1.split(',') if t.strip()]
        if isinstance(themes2, str):
            themes2 = [t.strip() for t in themes2.split(',') if t.strip()]

        set1 = set([t.lower() for t in themes1])
        set2 = set([t.lower() for t in themes2])

        if not set1 or not set2:
            return 0.0

        intersection = len(set1.intersection(set2))
        union = len(set1.union(set2))

        return intersection / union if union > 0 else 0.0

    def calculate_temporal_proximity(self, date1: str, date2: str) -> float:
        """
        Calculate temporal proximity score between two dates.

        Args:
            date1: First date string
            date2: Second date string

        Returns:
            Proximity score between 0.0 and 1.0 (higher = closer in time)
        """
        if not date1 or not date2:
            return 0.0

        try:
            # Parse dates - handle multiple formats
            d1 = self._parse_date(date1)
            d2 = self._parse_date(date2)

            if not d1 or not d2:
                return 0.0

            # Calculate days difference
            diff_days = abs((d1 - d2).days)

            # Convert to proximity score (closer dates = higher score)
            # Full score for same day, declining over time
            if diff_days == 0:
                return 1.0
            elif diff_days <= 7:
                return 0.8
            elif diff_days <= 30:
                return 0.6
            elif diff_days <= 90:
                return 0.4
            elif diff_days <= 365:
                return 0.2
            else:
                return 0.1

        except Exception as e:
            self.logger.log_error("date_parsing", f"Error parsing dates: {e}",
                                details={"date1": date1, "date2": date2})
            return 0.0

    def _parse_date(self, date_str: str) -> Optional[datetime]:
        """Parse date string in various formats."""
        if not date_str:
            return None

        # Common date formats
        formats = [
            "%Y-%m-%d",
            "%Y-%m-%d %H:%M:%S",
            "%m/%d/%Y",
            "%d/%m/%Y",
            "%B %d, %Y",
            "%b %d, %Y",
            "%Y"
        ]

        for fmt in formats:
            try:
                return datetime.strptime(date_str.strip(), fmt)
            except ValueError:
                continue

        return None

    def detect_explicit_mention(self, record1: Dict[str, Any], record2: Dict[str, Any]) -> Tuple[bool, Dict[str, Any]]:
        """
        Detect if record1 explicitly mentions record2 (for responds_to relationship).

        Args:
            record1: Record that might contain the mention
            record2: Record being mentioned

        Returns:
            Tuple of (is_mentioned, evidence_dict)
        """
        evidence = {}
        is_mentioned = False

        # Get text content to search
        search_text = (
            (record1.get('raw_text', '') or '') + ' ' +
            (record1.get('summary', '') or '') + ' ' +
            (record1.get('title', '') or '') + ' ' +
            (record1.get('excerpt', '') or '')
        ).lower()

        # Get record2 identifiers to search for
        record2_id = record2.get('id', '')
        record2_title = record2.get('title', '')
        record2_author = record2.get('author', '')
        record2_url = record2.get('url', '')

        # Search patterns for explicit mentions
        mention_patterns = []
        mention_contexts = []

        # 1. Direct ID references
        if record2_id and record2_id.lower() in search_text:
            mention_patterns.append(f"record ID: {record2_id}")
            is_mentioned = True

        # 2. Title references (exact or partial)
        if record2_title and len(record2_title) > 10:
            # Look for significant portions of the title (5+ words)
            title_words = record2_title.lower().split()
            if len(title_words) >= 5:
                # Check for 5+ consecutive words from title
                for i in range(len(title_words) - 4):
                    title_phrase = ' '.join(title_words[i:i+5])
                    if title_phrase in search_text:
                        mention_patterns.append(f"title reference: '{title_phrase}'")
                        is_mentioned = True
                        break

        # 3. URL references
        if record2_url:
            # Check for domain or significant URL parts
            from urllib.parse import urlparse
            parsed_url = urlparse(record2_url)
            domain = parsed_url.netloc
            if domain and domain.lower() in search_text:
                mention_patterns.append(f"URL reference: {domain}")
                # URL mentions are weaker evidence

        # 4. Author + title combination (strong indicator)
        if record2_author and record2_title and len(record2_title) > 5:
            author_lower = record2_author.lower()
            title_words = record2_title.lower().split()[:3]  # First 3 words
            if author_lower in search_text and any(word in search_text for word in title_words):
                mention_patterns.append(f"author + title: {record2_author} + {' '.join(title_words)}")
                is_mentioned = True

        # 5. Look for response indicators near mentions
        response_indicators = [
            'responds to', 'responding to', 'in response to', 'reply to', 'replying to',
            'critique of', 'critiquing', 'criticizing', 'criticism of',
            'disagree with', 'disagreeing with', 'take issue with',
            'builds on', 'building on', 'expanding on', 'expands on',
            'references', 'referencing', 'refers to', 'cites', 'citing'
        ]

        for indicator in response_indicators:
            if indicator in search_text:
                mention_contexts.append(indicator)

        # Compile evidence
        evidence['mention_patterns'] = mention_patterns
        evidence['response_contexts'] = mention_contexts
        evidence['search_text_length'] = len(search_text)
        evidence['confidence'] = 1.0 if len(mention_patterns) >= 2 else 0.8 if mention_patterns else 0.0

        return is_mentioned, evidence

    def calculate_comprehensive_similarity(self, record1: Dict[str, Any], record2: Dict[str, Any]) -> RelationshipScore:
        """
        Calculate comprehensive similarity between two records using multiple factors.

        Args:
            record1: First record data
            record2: Second record data

        Returns:
            RelationshipScore with detailed similarity analysis
        """
        evidence = {}

        # Extract text for keyword analysis
        text1 = record1.get('raw_text', '') or record1.get('summary', '') or record1.get('title', '')
        text2 = record2.get('raw_text', '') or record2.get('summary', '') or record2.get('title', '')

        # 1. Keyword similarity (40% weight)
        keywords1 = self.extract_keywords(text1)
        keywords2 = self.extract_keywords(text2)
        keyword_score = self.calculate_keyword_similarity(keywords1, keywords2)
        evidence['keyword_score'] = keyword_score
        shared_keywords = list(set(keywords1).intersection(set(keywords2)))
        evidence['shared_keywords'] = shared_keywords[:10]

        # 2. Entity similarity (25% weight)
        entities1 = record1.get('mentioned_entities', '') or record1.get('key_concepts', '')
        entities2 = record2.get('mentioned_entities', '') or record2.get('key_concepts', '')
        entity_score = self.calculate_entity_similarity(entities1, entities2)
        evidence['entity_score'] = entity_score

        # 3. Thematic similarity (20% weight)
        themes1 = record1.get('thematic_categories', '')
        themes2 = record2.get('thematic_categories', '')
        thematic_score = self.calculate_thematic_similarity(themes1, themes2)
        evidence['thematic_score'] = thematic_score

        # 4. Temporal proximity (15% weight)
        date1 = record1.get('publication_date', '')
        date2 = record2.get('publication_date', '')
        temporal_score = self.calculate_temporal_proximity(date1, date2)
        evidence['temporal_score'] = temporal_score

        # Calculate weighted overall score
        overall_score = (
            keyword_score * 0.4 +
            entity_score * 0.25 +
            thematic_score * 0.20 +
            temporal_score * 0.15
        )

        # Determine relationship type and confidence
        relationship_type, confidence = self._determine_relationship_type(
            overall_score, keyword_score, entity_score, thematic_score, temporal_score,
            record1, record2
        )

        return RelationshipScore(
            record_id_1=record1.get('id', ''),
            record_id_2=record2.get('id', ''),
            similarity_score=overall_score,
            relationship_type=relationship_type,
            confidence=confidence,
            evidence=evidence
        )

    def _determine_relationship_type(self, overall_score: float, keyword_score: float,
                                   entity_score: float, thematic_score: float,
                                   temporal_score: float, record1: Dict, record2: Dict) -> Tuple[str, float]:
        """
        Determine the type of relationship and confidence level.
        Prioritizes explicit mentions for responds_to, falls back to similarity for related_to.

        Returns:
            Tuple of (relationship_type, confidence)
        """
        # First check for explicit mentions in either direction for responds_to relationships
        is_mentioned_1to2, evidence_1to2 = self.detect_explicit_mention(record1, record2)
        is_mentioned_2to1, evidence_2to1 = self.detect_explicit_mention(record2, record1)

        # If explicit mention found, this is a responds_to relationship
        if is_mentioned_1to2:
            confidence = evidence_1to2.get('confidence', 0.8)
            return "responds_to", min(0.95, confidence)
        elif is_mentioned_2to1:
            confidence = evidence_2to1.get('confidence', 0.8)
            return "responds_to", min(0.95, confidence)

        # No explicit mention found - use similarity analysis for related_to
        # High temporal proximity + good content similarity = potential thematic relationship
        if temporal_score > 0.6 and overall_score > 0.4:
            return "related_to", min(0.8, overall_score)

        # Very high similarity scores suggest strong relationship
        if overall_score > 0.7:
            return "related_to", overall_score
        elif overall_score > 0.5:
            return "related_to", overall_score * 0.8
        elif overall_score > 0.3:
            return "related_to", overall_score * 0.6
        else:
            return "related_to", overall_score * 0.4


class CrossReferenceManager:
    """
    Main class for managing cross-reference analysis and updating relationships.
    """

    def __init__(self):
        """Initialize the cross-reference manager."""
        self.logger = get_logger()
        self.analyzer = ContentSimilarityAnalyzer()
        self.relationship_cache = {}

        # Thresholds for different relationship types
        self.thresholds = {
            "related_to": 0.3,
            "responds_to": 0.4,
            "influence": 0.6
        }

    def analyze_all_relationships(self, batch_size: int = 50) -> List[RelationshipScore]:
        """
        Analyze relationships between all records in the archive.

        Args:
            batch_size: Number of records to process in each batch

        Returns:
            List of significant relationships found
        """
        self.logger.logger.info("Starting comprehensive cross-reference analysis")

        try:
            # Connect to Google Sheets
            credentials_path = os.path.join(
                os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
                os.environ.get("GOOGLE_APPLICATION_CREDENTIALS", "google_credentials.json")
            )
            gc = gspread.service_account(filename=credentials_path)
            sh = gc.open(os.environ.get("SPREADSHEET_NAME", "Rosen Archive URL List"))
            worksheet = sh.worksheet("test_runs")

            # Get all records
            all_data = worksheet.get_all_records()
            self.logger.logger.info(f"Analyzing relationships for {len(all_data)} records")

            relationships = []
            total_comparisons = len(all_data) * (len(all_data) - 1) // 2
            completed_comparisons = 0

            # Compare each record with every other record
            for i, record1 in enumerate(all_data):
                for j in range(i + 1, len(all_data)):
                    record2 = all_data[j]

                    # Skip if either record lacks essential data
                    if not self._has_sufficient_data(record1) or not self._has_sufficient_data(record2):
                        continue

                    # Calculate similarity
                    relationship = self.analyzer.calculate_comprehensive_similarity(record1, record2)

                    # Only keep relationships above threshold
                    if relationship.similarity_score >= self.thresholds[relationship.relationship_type]:
                        relationships.append(relationship)

                    completed_comparisons += 1

                    # Log progress periodically
                    if completed_comparisons % 1000 == 0:
                        progress = (completed_comparisons / total_comparisons) * 100
                        self.logger.logger.info(f"Analysis progress: {progress:.1f}% ({completed_comparisons}/{total_comparisons})")

            # Sort relationships by similarity score (highest first)
            relationships.sort(key=lambda x: x.similarity_score, reverse=True)

            self.logger.logger.info(f"Found {len(relationships)} significant relationships")
            return relationships

        except Exception as e:
            self.logger.log_error("cross_reference_analysis", f"Error during relationship analysis: {e}")
            return []

    def update_related_to_fields(self, relationships: List[RelationshipScore],
                                max_relations_per_record: int = 5) -> Dict[str, int]:
        """
        Update the 'related_to' fields in Google Sheets based on analysis results.

        Args:
            relationships: List of relationship scores
            max_relations_per_record: Maximum number of relationships per record

        Returns:
            Dict with update statistics
        """
        self.logger.logger.info("Updating related_to fields in Google Sheets")

        try:
            # Connect to Google Sheets
            credentials_path = os.path.join(
                os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
                os.environ.get("GOOGLE_APPLICATION_CREDENTIALS", "google_credentials.json")
            )
            gc = gspread.service_account(filename=credentials_path)
            sh = gc.open(os.environ.get("SPREADSHEET_NAME", "Rosen Archive URL List"))
            worksheet = sh.worksheet("test_runs")

            # Group relationships by record ID
            record_relationships = defaultdict(list)

            for rel in relationships:
                if rel.relationship_type == "related_to":
                    record_relationships[rel.record_id_1].append((rel.record_id_2, rel.similarity_score))
                    record_relationships[rel.record_id_2].append((rel.record_id_1, rel.similarity_score))

            # Get current data to find row positions
            all_data = worksheet.get_all_records()
            id_to_row = {record['id']: i + 2 for i, record in enumerate(all_data)}  # +2 for header row

            # Find the 'related_to' column
            headers = worksheet.row_values(1)
            related_to_col = None
            for i, header in enumerate(headers):
                if header == 'related_to':
                    related_to_col = i + 1  # +1 for 1-based indexing
                    break

            if not related_to_col:
                self.logger.log_error("sheets_operation", "Could not find 'related_to' column in sheet")
                return {"error": "Column not found"}

            stats = {"updated": 0, "errors": 0}

            # Update each record's related_to field
            for record_id, relations in record_relationships.items():
                if record_id not in id_to_row:
                    continue

                # Sort by similarity score and take top N
                relations.sort(key=lambda x: x[1], reverse=True)
                top_relations = relations[:max_relations_per_record]

                # Create comma-separated string of related IDs
                related_ids = ", ".join([rel[0] for rel in top_relations])

                try:
                    # Update the cell
                    row_num = id_to_row[record_id]
                    worksheet.update_cell(row_num, related_to_col, related_ids)
                    stats["updated"] += 1

                    self.logger.logger.info(f"Updated {record_id} with {len(top_relations)} relationships")

                except Exception as e:
                    self.logger.log_error("sheets_update", f"Failed to update {record_id}: {e}")
                    stats["errors"] += 1

            self.logger.logger.info(f"Relationship update complete: {stats}")
            return stats

        except Exception as e:
            self.logger.log_error("cross_reference_update", f"Error updating relationships: {e}")
            return {"error": str(e)}

    def _has_sufficient_data(self, record: Dict[str, Any]) -> bool:
        """
        Check if a record has sufficient data for relationship analysis.

        Args:
            record: Record to check

        Returns:
            True if record has enough data for analysis
        """
        # Must have an ID
        if not record.get('id'):
            return False

        # Must have at least one of: title, summary, raw_text
        text_fields = [record.get('title'), record.get('summary'), record.get('raw_text')]
        if not any(field and len(str(field).strip()) > 10 for field in text_fields):
            return False

        return True

    def generate_relationship_report(self, relationships: List[RelationshipScore]) -> Dict[str, Any]:
        """
        Generate a comprehensive report of relationship analysis results.

        Args:
            relationships: List of relationship scores

        Returns:
            Dict containing analysis report
        """
        if not relationships:
            return {"total_relationships": 0}

        # Group by relationship type
        by_type = defaultdict(list)
        for rel in relationships:
            by_type[rel.relationship_type].append(rel)

        # Calculate statistics
        scores = [rel.similarity_score for rel in relationships]

        report = {
            "total_relationships": len(relationships),
            "by_type": {k: len(v) for k, v in by_type.items()},
            "score_statistics": {
                "mean": sum(scores) / len(scores),
                "min": min(scores),
                "max": max(scores),
                "high_confidence": len([s for s in scores if s > 0.7]),
                "medium_confidence": len([s for s in scores if 0.4 <= s <= 0.7]),
                "low_confidence": len([s for s in scores if s < 0.4])
            },
            "top_relationships": [
                {
                    "id_1": rel.record_id_1,
                    "id_2": rel.record_id_2,
                    "score": round(rel.similarity_score, 3),
                    "type": rel.relationship_type,
                    "evidence": rel.evidence
                }
                for rel in relationships[:10]  # Top 10
            ]
        }

        return report

# Global manager instance
_global_cross_ref_manager = None

def get_cross_reference_manager() -> CrossReferenceManager:
    """Get the global cross-reference manager instance."""
    global _global_cross_ref_manager
    if _global_cross_ref_manager is None:
        _global_cross_ref_manager = CrossReferenceManager()
    return _global_cross_ref_manager
