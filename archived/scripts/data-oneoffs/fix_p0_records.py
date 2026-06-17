"""
Fix P0 critical records identified in DATA_QUALITY_AUDIT_2026-02-06.md

Records fixed:
1. RECORD-00637 - Gemini prompt leak, wrong title/date/summary (was "Digital Divide", is about Assange)
2. RECORD-00633 - Ice cream hallucination in summary/tags (actually about journalistic scoops)
3. RECORD-00602 - Summary/tags from wrong article (NYT blog → should be News Creator Corps)
4. RECORD-00592 - Summary from Colbert segment (should be about academics leaving X)
5. RECORD-00159 - 20-year date error (2023→2003) and sidebar-scrape summary
"""

import csv
import sys
from pathlib import Path

from csv_safe_write import atomic_csv_write

CSV_PATH = Path(__file__).parent / "archive_records-public.csv"

# Define the fixes for each record
FIXES = {
    "RECORD-00637": {
        "title": "Julian Assange Ducks the Question a Lot of Us Have",
        "publication_date": "2010-12-04",
        "era": "Social Media & Financial Crisis (2010-2015)",
        "excerpt": (
            "Rosen responds to Julian Assange's evasion during a Guardian Q&A, "
            "where Assange blamed the newspaper for preventing him from addressing "
            "rape allegations — a claim Rosen calls dissembling."
        ),
        "summary": (
            "Rosen dissects Julian Assange's refusal to address rape allegations "
            "during a Guardian reader Q&A session in December 2010. Assange claimed "
            "the Guardian asked him not to answer, but Rosen argues this was a false "
            "impression — it was his lawyer, not the newspaper, keeping him quiet. "
            "Rosen warns that Assange's evasiveness was eroding support among the "
            "very people who had defended him and funded WikiLeaks."
        ),
        "tags": (
            "Julian Assange, WikiLeaks, Guardian, Transparency, Rape allegations, "
            "Dissembling, Press freedom, Accountability"
        ),
        "thematic_categories": "Press & Media Criticism, Politics & Democracy",
        "key_concepts": "",
    },
    "RECORD-00633": {
        "publication_date": "2012-04-20",
        "author": "Jonathan Stray",
        "excerpt": (
            "Stray identifies four types of journalistic scoops — confidential "
            "source leaks, enterprise reporting, expert interviews, and original "
            "analysis — and argues enterprise reporting creates the most value."
        ),
        "summary": (
            "Jonathan Stray identifies four ways journalists beat the competition: "
            "exclusive leaks from confidential sources, enterprise reporting through "
            "public records and legwork, expert interviews, and original analysis. "
            "He argues that enterprise reporting — digging through obscure records "
            "and finding on-the-record sources — is the most valuable form, yet also "
            "the most threatened by the economics of modern journalism."
        ),
        "tags": (
            "Journalism, Scoops, Enterprise reporting, Confidential sources, "
            "Investigative journalism, Reporting methods, News competition"
        ),
        "key_concepts": "",
    },
    "RECORD-00602": {
        "publication_date": "2025-06-13",
        "excerpt": (
            "Rosen announces his new role as president of News Creator Corps, "
            "a nonprofit focused on getting good information to people where they "
            "already are."
        ),
        "summary": (
            "Rosen announces he has taken a new position as president of News "
            "Creator Corps, a nonprofit startup working to reach news consumers "
            "through the platforms and creators they already follow. The move "
            "follows his retirement from a 39-year career as a professor of "
            "journalism at NYU."
        ),
        "tags": (
            "News Creator Corps, Career change, NYU, Retirement, Nonprofit, "
            "News distribution, Content creators"
        ),
        "thematic_categories": "Journalism Theory & Practice, Audience & Public Engagement",
        "key_concepts": "The People Formerly Known as the Audience",
    },
    "RECORD-00592": {
        "summary": (
            "Josh Moody reports on a second wave of academics leaving X/Twitter "
            "after the 2024 presidential election. High-profile professors cite "
            "platform toxicity, disinformation, and Elon Musk's open support for "
            "Donald Trump as reasons for departing. Some see this as the end of "
            "Academic Twitter, while others debate whether ceding the platform "
            "serves anyone's interests."
        ),
        "excerpt": (
            "A second wave of academics is leaving X after the 2024 election, "
            "citing toxicity and Musk's role in spreading disinformation — "
            "potentially marking the end of Academic Twitter."
        ),
        "tags": (
            "Twitter, X, Elon Musk, Academic Twitter, Social media exodus, "
            "Disinformation, 2024 election, Platform migration, Donald Trump"
        ),
        "thematic_categories": "Technology & Digital Media, Audience & Public Engagement",
        "key_concepts": "",
    },
    "RECORD-00159": {
        "publication_date": "2003-12-03",
        "era": "Web & Blogging (00s)",
        "excerpt": (
            "Rosen examines President Bush's secret Thanksgiving flight to "
            "Baghdad, arguing the American political language lacks a grown-up "
            "vocabulary for events that are inseparable from the publicity they "
            "generate."
        ),
        "summary": (
            "Rosen analyzes President Bush's secret Thanksgiving 2003 flight to "
            "Baghdad as a case study in the politics of publicity. Reporters on "
            "the trip had their phones confiscated and were sworn to secrecy. "
            "Rosen identifies two inadequate frameworks for discussing such events "
            "— the cynical dismissal ('PR stunt') and the savvy admiration "
            "('political masterstroke') — and traces the roots of the modern "
            "publicity state to the 1919 Versailles peace talks, when mass media "
            "first made public opinion a real-time factor in diplomacy."
        ),
        "tags": (
            "George W. Bush, Baghdad, Publicity, Media events, Iraq War, "
            "Press corps, Propaganda, Political theater, Versailles"
        ),
        "thematic_categories": "Politics & Democracy, Press & Media Criticism, Journalism Theory & Practice",
        "key_concepts": "Church of the Savvy",
    },
}


def main():
    print(f"Reading {CSV_PATH}...")

    with open(CSV_PATH, "r", encoding="utf-8", newline="") as f:
        reader = csv.DictReader(f)
        fieldnames = reader.fieldnames
        rows = list(reader)

    print(f"  Loaded {len(rows)} records")
    print(f"  Fields: {len(fieldnames)}")

    fixed_count = 0
    for row in rows:
        record_id = row.get("id", "")
        if record_id in FIXES:
            fixes = FIXES[record_id]
            print(f"\n  Fixing {record_id}: {row.get('title', '?')[:60]}...")
            for field, new_value in fixes.items():
                old_value = row.get(field, "")
                old_preview = old_value[:80].replace("\n", " ") if old_value else "(empty)"
                new_preview = new_value[:80].replace("\n", " ") if new_value else "(empty)"
                print(f"    {field}: {old_preview}")
                print(f"         -> {new_preview}")
                row[field] = new_value
            fixed_count += 1

    if fixed_count != len(FIXES):
        missing = set(FIXES.keys()) - {r.get("id") for r in rows}
        print(f"\n  WARNING: Could not find records: {missing}")

    print(f"\n  Fixed {fixed_count} / {len(FIXES)} records")

    # Write back
    print(f"\n  Writing {CSV_PATH}...")
    with atomic_csv_write(CSV_PATH) as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(rows)

    print("  Done!")


if __name__ == "__main__":
    main()
