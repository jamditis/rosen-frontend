"""
Audit key concept assignments.

Check which concepts are assigned to records where they don't belong,
particularly "The People Formerly Known as the Audience" on unrelated content.
"""

import csv
from collections import Counter, defaultdict
from pathlib import Path

CSV_PATH = Path(__file__).parent / "archive_records-public.csv"


def main():
    with open(CSV_PATH, "r", encoding="utf-8", newline="") as f:
        reader = csv.DictReader(f)
        rows = list(reader)

    print(f"Loaded {len(rows)} records\n")

    # Count concept frequency
    concept_counts = Counter()
    concept_records = defaultdict(list)

    for row in rows:
        concepts = row.get('key_concepts', '')
        if not concepts:
            continue
        for concept in [c.strip() for c in concepts.split(',') if c.strip()]:
            concept_counts[concept] += 1
            concept_records[concept].append(row)

    print("Top 20 key concepts by frequency:")
    print("-" * 60)
    for concept, count in concept_counts.most_common(20):
        print(f"  {count:4d}  {concept}")

    # Spot-check the most-assigned concept
    print("\n\nSpot-checking 'The People Formerly Known as the Audience':")
    print("-" * 60)

    target = "The People Formerly Known as the Audience"
    if target in concept_records:
        records = concept_records[target]
        print(f"  Assigned to {len(records)} records\n")

        # Check for obviously unrelated records
        suspicious = []
        related_keywords = [
            'audience', 'formerly known', 'people', 'citizen',
            'participat', 'public', 'readers', 'users', 'consumers',
            'crowd', 'amateur', 'pro-am', 'user-generated', 'blog'
        ]

        for r in records:
            title = r.get('title', '').lower()
            summary = r.get('summary', '').lower()
            raw = r.get('raw_text', '').lower()
            combined = f"{title} {summary} {raw}"

            has_match = any(kw in combined for kw in related_keywords)
            if not has_match:
                suspicious.append(r)

        print(f"  Suspicious (no audience-related keywords): {len(suspicious)}")
        for r in suspicious:
            print(f"    {r.get('id', '?')}: {r.get('title', '?')[:70]}")
            print(f"      Summary: {r.get('summary', '?')[:100]}")
            print()

    # Check for other potentially over-assigned concepts
    print("\n\nOther concepts worth checking (assigned to 50+ records):")
    print("-" * 60)
    for concept, count in concept_counts.most_common():
        if count < 50:
            break
        print(f"  {count:4d}  {concept}")


if __name__ == "__main__":
    main()
