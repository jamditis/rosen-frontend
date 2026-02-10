"""Quick verification that all P0-P2 fixes were applied correctly."""

import csv
from pathlib import Path

CSV_PATH = Path(__file__).parent / "archive_records-public.csv"


def main():
    with open(CSV_PATH, "r", encoding="utf-8", newline="") as f:
        reader = csv.DictReader(f)
        rows = list(reader)

    print(f"Total records: {len(rows)}")
    errors = []

    # P0: Check critical records
    id_map = {r['id']: r for r in rows}

    # RECORD-00637 should now be about Assange
    r = id_map.get('RECORD-00637')
    if r:
        if 'Assange' not in r.get('title', ''):
            errors.append("RECORD-00637: Title not fixed")
        if '2010' not in r.get('publication_date', ''):
            errors.append("RECORD-00637: Date not fixed")
        if 'Please provide' in r.get('summary', ''):
            errors.append("RECORD-00637: Prompt leak still present")
    else:
        errors.append("RECORD-00637: Not found!")

    # RECORD-00633 should have Jonathan Stray as author
    r = id_map.get('RECORD-00633')
    if r:
        if 'Stray' not in r.get('author', ''):
            errors.append("RECORD-00633: Author not fixed")
        if 'ice cream' in r.get('summary', '').lower():
            errors.append("RECORD-00633: Ice cream still in summary")

    # RECORD-00159 should have 2003 date
    r = id_map.get('RECORD-00159')
    if r:
        if '2003' not in r.get('publication_date', ''):
            errors.append("RECORD-00159: Date not fixed")

    # P0: No prompt leaks
    for r in rows:
        if 'Please provide the scraped' in (r.get('summary', '') or ''):
            errors.append(f"{r['id']}: Prompt leak in summary")
        if 'Please provide the text' in (r.get('responds_to', '') or ''):
            errors.append(f"{r['id']}: Prompt leak in responds_to")

    # P1: No "This collection of blog posts" summaries
    sidebar_count = sum(1 for r in rows if 'This collection of blog posts' in (r.get('summary', '') or ''))
    if sidebar_count > 0:
        errors.append(f"Still {sidebar_count} sidebar-scrape summaries")

    # P1: Check typo
    r = id_map.get('RECORD-00023')
    if r and 'Treview' in (r.get('original_publication', '') or ''):
        errors.append("RECORD-00023: Typo still present")

    # P2: No _p.html duplicates
    urls = [r.get('url', '') for r in rows]
    p_urls = [u for u in urls if '_p.htm' in u and 'archive.pressthink.org' in u]
    # Check if regular version also exists for any _p URL
    regular_urls = set(u for u in urls if 'archive.pressthink.org' in u and '_p.htm' not in u)
    for p_url in p_urls:
        regular = p_url.replace('_p.htm', '.htm')
        if regular in regular_urls:
            errors.append(f"Duplicate _p URL still present: {p_url[:60]}")

    # P2: Count remaining unknown publishers
    unknown_pubs = sum(1 for r in rows if (r.get('publisher', '') or '').strip().lower() in ('', 'unknown'))
    print(f"Unknown publishers remaining: {unknown_pubs}")

    # Count "The author" in summaries
    author_refs = sum(1 for r in rows if 'The author ' in (r.get('summary', '') or ''))
    print(f"'The author' in summaries: {author_refs}")

    if errors:
        print(f"\nERRORS ({len(errors)}):")
        for e in errors:
            print(f"  - {e}")
    else:
        print("\nAll checks passed!")


if __name__ == "__main__":
    main()
