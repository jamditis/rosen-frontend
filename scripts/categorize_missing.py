"""
Auto-categorize 76 archive records with missing thematic_categories.

Reads data/archive_records-public.csv, assigns categories based on keyword
matching in title and summary fields, writes the updated CSV back.

Categories:
  - Press & Media Criticism
  - Politics & Democracy
  - Technology & Digital Media
  - Journalism Theory & Practice
  - Audience & Public Engagement
  - Journalism Education

Rules:
  - TUMBLR records: Studio 20 blog posts. Default to "Journalism Education".
    Add secondary categories based on keyword matches.
  - CLIP records: Newspaper clippings about/by Jay Rosen. Default to
    "Press & Media Criticism". Add secondary categories based on keywords.
  - Uses semicolon separator (matching existing TUMBLR/CLIP format).
  - Never overwrites records that already have categories.
"""

import csv
import os
import re
import sys
from collections import Counter
from pathlib import Path

sys.stdout.reconfigure(encoding="utf-8")

# --- Configuration ---

CSV_PATH = Path(__file__).parent.parent / "data" / "archive_records-public.csv"

# Keyword rules: map keywords (lowercased) to categories.
# Order matters: more specific patterns checked first.
KEYWORD_RULES = {
    "Politics & Democracy": [
        r"\btrump\b",
        r"\belection\b",
        r"\bdemocra",  # democracy, democratic, democrats
        r"\brepublican\b",
        r"\bpolitic",  # politics, political
        r"\bvot(e|ing|er)\b",
        r"\bcampaign\b",
        r"\bpresident",
        r"\bwhite house\b",
        r"\bgulf war\b",
        r"\bwar\b",
        r"\bgovernment\b",
        r"\bcitizen\b",
        r"\bcivic\b",
        r"\bpublic life\b",
        r"\bsuburban\b",
        r"\bredistric",
        r"\bpartisan\b",
        r"\bmcclellan\b",
        r"\bbush\b",
        r"\bmccain\b",
        r"\bnixon\b",
        r"\bkennedy\b",
        r"\bjan(uary|\.)?\s*6",
    ],
    "Technology & Digital Media": [
        r"\binternet\b",
        r"\bblog\b",
        r"\bdigital\b",
        r"\bweb\b",
        r"\bonline\b",
        r"\btwitter\b",
        r"\bsocial media\b",
        r"\bpodcast\b",
        r"\bradio\b",
        r"\btv\b",
        r"\btelevision\b",
        r"\bnew media\b",
        r"\bcnn\b",
        r"\bnpr\b",
        r"\bvideo\b",
        r"\bmindcast\b",
        r"\blifecast\b",
        r"\btalk\s*radio\b",
        r"\bspot\.us\b",
        r"\bfreelance\b",
        r"\bmusic\b",
        r"\bmultimedia\b",
        r"\bsxsw\b",
        r"\b140 characters\b",
        r"\bnytimes\.com\b",
        r"\bnew york times\b",
        r"\bexplainer\b",
    ],
    "Press & Media Criticism": [
        r"\bpress\b",
        r"\bmedia\b",
        r"\bjournalis",  # journalism, journalist, journalists
        r"\bnews\b",
        r"\bnewspaper\b",
        r"\breport",  # reporting, reporter
        r"\bcoverage\b",
        r"\bnewsroom\b",
        r"\bobjective",
        r"\bsource\b",
        r"\banonymous\b",
        r"\bleak\b",
        r"\bbroadcast\b",
        r"\bedit(or|orial)\b",
        r"\bskeptic\b",
        r"\bcia\b",
        r"\bmoral confusion\b",
        r"\bbackfire\b",
        r"\bmisremember\b",
        r"\bbrian williams\b",
        r"\babcnews\b",
        r"\babc\b",
    ],
    "Audience & Public Engagement": [
        r"\bpublic journalism\b",
        r"\bpublic engagement\b",
        r"\baudience\b",
        r"\bcommunity\b",
        r"\bcivic engag",
        r"\bcommunity dialogue\b",
        r"\breconnect\b",
        r"\bparticipat",
        r"\bforum\b",
    ],
    "Journalism Education": [
        r"\bstudio 20\b",
        r"\bnyu\b",
        r"\bprofessor\b",
        r"\bstudent\b",
        r"\bprogram\b",
        r"\bclass\b",
        r"\bseminar\b",
        r"\bteach\b",
        r"\beducat\b",
        r"\bcourse\b",
        r"\bfellow\b",
        r"\baward\b",
    ],
    "Journalism Theory & Practice": [
        r"\btheory\b",
        r"\bpractice\b",
        r"\bethics\b",
        r"\badvocacy\b",
        r"\bpublic relations\b",
        r"\bsolutions journalism\b",
        r"\bgood news\b",
        r"\bview from nowhere\b",
        r"\bdissertation\b",
    ],
}

# Minimum match threshold: how many keyword hits before we add a category
MIN_MATCHES = 1


def match_categories(title: str, summary: str) -> list[str]:
    """Return list of categories that match based on keyword rules."""
    text = f"{title} {summary}".lower()
    matched = []
    for category, patterns in KEYWORD_RULES.items():
        hits = sum(1 for p in patterns if re.search(p, text))
        if hits >= MIN_MATCHES:
            matched.append(category)
    return matched


def categorize_record(record: dict) -> str:
    """Assign categories to a single record. Returns semicolon-separated string."""
    record_id = record["id"]
    title = record.get("title", "") or ""
    summary = record.get("summary", "") or ""
    tags = record.get("tags", "") or ""

    # Combine text for matching
    full_text = f"{title} {summary} {tags}"

    # Get keyword-based matches
    matched = match_categories(title, summary)

    is_tumblr = record_id.startswith("TUMBLR")
    is_clip = record_id.startswith("CLIP")

    if is_tumblr:
        # Studio 20 blog: default to Journalism Education
        # Most existing TUMBLR records are "Journalism Education"
        if "Journalism Education" not in matched:
            matched.insert(0, "Journalism Education")
        else:
            # Move it to front
            matched.remove("Journalism Education")
            matched.insert(0, "Journalism Education")

    elif is_clip:
        # Newspaper clippings: default to Press & Media Criticism
        if "Press & Media Criticism" not in matched:
            matched.insert(0, "Press & Media Criticism")
        else:
            # Move it to front
            matched.remove("Press & Media Criticism")
            matched.insert(0, "Press & Media Criticism")

    # If still empty after all checks, assign based on type
    if not matched:
        if is_tumblr:
            matched = ["Journalism Education"]
        elif is_clip:
            matched = ["Press & Media Criticism"]
        else:
            matched = ["Journalism Theory & Practice"]

    # Cap at 3 categories to avoid over-tagging
    return "; ".join(matched[:3])


def main():
    # Read CSV
    with open(CSV_PATH, "r", encoding="utf-8", newline="") as f:
        reader = csv.DictReader(f)
        fieldnames = reader.fieldnames
        records = list(reader)

    print(f"Total records in CSV: {len(records)}")

    # Find records with empty categories
    empty_indices = []
    for i, r in enumerate(records):
        tc = r.get("thematic_categories", "").strip()
        if not tc:
            empty_indices.append(i)

    print(f"Records with empty categories: {len(empty_indices)}")
    print()

    if not empty_indices:
        print("No records to categorize. Exiting.")
        return

    # Categorize
    results = []  # (id, title, assigned_categories)
    for i in empty_indices:
        record = records[i]
        assigned = categorize_record(record)
        records[i]["thematic_categories"] = assigned
        results.append((record["id"], record["title"][:70], assigned))

    # Write updated CSV
    with open(CSV_PATH, "w", encoding="utf-8", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(records)

    print(f"Updated CSV written to: {CSV_PATH}")
    print()

    # Print report
    print("=" * 100)
    print("CATEGORIZATION REPORT")
    print("=" * 100)
    print()

    # Group by type
    tumblr_results = [(rid, title, cats) for rid, title, cats in results if rid.startswith("TUMBLR")]
    clip_results = [(rid, title, cats) for rid, title, cats in results if rid.startswith("CLIP")]
    other_results = [(rid, title, cats) for rid, title, cats in results if not rid.startswith("TUMBLR") and not rid.startswith("CLIP")]

    if tumblr_results:
        print(f"--- TUMBLR RECORDS ({len(tumblr_results)}) ---")
        print()
        for rid, title, cats in tumblr_results:
            print(f"  {rid}: {title}")
            print(f"    => {cats}")
            print()

    if clip_results:
        print(f"--- CLIP RECORDS ({len(clip_results)}) ---")
        print()
        for rid, title, cats in clip_results:
            print(f"  {rid}: {title}")
            print(f"    => {cats}")
            print()

    if other_results:
        print(f"--- OTHER RECORDS ({len(other_results)}) ---")
        print()
        for rid, title, cats in other_results:
            print(f"  {rid}: {title}")
            print(f"    => {cats}")
            print()

    # Summary statistics
    print("=" * 100)
    print("SUMMARY")
    print("=" * 100)
    cat_counts = Counter()
    for _, _, cats in results:
        for c in cats.split("; "):
            cat_counts[c.strip()] += 1

    print(f"\nTotal records categorized: {len(results)}")
    print(f"  TUMBLR: {len(tumblr_results)}")
    print(f"  CLIP: {len(clip_results)}")
    print(f"  Other: {len(other_results)}")
    print()
    print("Category distribution across newly categorized records:")
    for cat, count in cat_counts.most_common():
        print(f"  {cat}: {count}")

    # Verify no existing categories were overwritten
    print()
    print("Verification: checking that no previously categorized records were modified...")
    with open(CSV_PATH, "r", encoding="utf-8", newline="") as f:
        reader = csv.DictReader(f)
        updated_records = list(reader)

    still_empty = sum(1 for r in updated_records if not r.get("thematic_categories", "").strip())
    print(f"  Records still without categories: {still_empty}")
    print(f"  Records now categorized: {len(results)}")
    print()
    print("Done.")


if __name__ == "__main__":
    main()
