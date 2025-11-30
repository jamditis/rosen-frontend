# -*- coding: utf-8 -*-
"""
Test script for the cross-reference analysis system.
"""

import sys
import os
from pathlib import Path

ROOT_DIR = Path(__file__).resolve().parents[2]
SRC_DIR = ROOT_DIR / "src"
DIAGNOSTICS_DIR = ROOT_DIR / "tools" / "diagnostics"
for path in (SRC_DIR, DIAGNOSTICS_DIR):
    if str(path) not in sys.path:
        sys.path.append(str(path))

from cross_reference_analyzer import get_cross_reference_manager, ContentSimilarityAnalyzer

def test_cross_reference_system():
    """Test the cross-reference analysis system with sample data."""
    print("Testing Cross-Reference Analysis System")
    print("=" * 50)

    analyzer = ContentSimilarityAnalyzer()

    # Sample records for testing
    sample_records = [
        {
            "id": "TEST-00001",
            "title": "The Future of Journalism in Digital Media",
            "raw_text": "Journalism is evolving rapidly with digital technologies. The traditional press model is being challenged by online platforms and social media. Reporters now need to adapt to new verification methods and audience engagement strategies.",
            "thematic_categories": "Journalism Theory & Practice, Technology & Digital Media",
            "key_concepts": "Digital transformation, Social media impact, Verification methods",
            "publication_date": "2024-01-15",
            "mentioned_entities": "Twitter, Facebook, Google"
        },
        {
            "id": "TEST-00002",
            "title": "Social Media's Impact on News Verification",
            "raw_text": "The rise of social media has created new challenges for news verification. Journalists must now verify information from multiple digital sources and combat misinformation. Traditional verification methods need updating for the digital age.",
            "thematic_categories": "Journalism Theory & Practice, Technology & Digital Media",
            "key_concepts": "Verification methods, Social media impact, Misinformation",
            "publication_date": "2024-01-18",
            "mentioned_entities": "Twitter, Instagram, TikTok"
        },
        {
            "id": "TEST-00003",
            "title": "Press Freedom and Democracy",
            "raw_text": "A free press is essential for democratic societies. Government transparency and accountability depend on independent journalism. Press freedom is under threat in many countries worldwide.",
            "thematic_categories": "Politics & Democracy, Press & Media Criticism",
            "key_concepts": "Press freedom, Government accountability, Democracy",
            "publication_date": "2024-02-20",
            "mentioned_entities": "Government, Congress, Supreme Court"
        }
    ]

    print(f"Testing similarity analysis with {len(sample_records)} sample records\n")

    # Test pairwise comparisons
    for i in range(len(sample_records)):
        for j in range(i + 1, len(sample_records)):
            record1 = sample_records[i]
            record2 = sample_records[j]

            relationship = analyzer.calculate_comprehensive_similarity(record1, record2)

            print(f"Relationship: {record1['id']} <-> {record2['id']}")
            print(f"  Overall Score: {relationship.similarity_score:.3f}")
            print(f"  Type: {relationship.relationship_type}")
            print(f"  Confidence: {relationship.confidence:.3f}")
            print(f"  Evidence:")
            for key, value in relationship.evidence.items():
                if key == 'shared_keywords':
                    print(f"    {key}: {value[:5]}")  # Show first 5 keywords
                else:
                    print(f"    {key}: {value:.3f}")
            print()

    # Test keyword extraction
    print("Testing keyword extraction:")
    for record in sample_records:
        keywords = analyzer.extract_keywords(record['raw_text'], max_keywords=10)
        print(f"{record['id']}: {keywords[:10]}")

    print("\nCross-reference analysis test completed!")

if __name__ == "__main__":
    test_cross_reference_system()
