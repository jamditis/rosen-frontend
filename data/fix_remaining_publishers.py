"""Fix the remaining unknown publishers that weren't caught by the domain map."""

import csv
from pathlib import Path
from urllib.parse import urlparse

CSV_PATH = Path(__file__).parent / "archive_records-public.csv"

EXTRA_DOMAINS = {
    "archive.org": "Internet Archive",
    "pbs.org": "PBS",
    "cpj.org": "Committee to Protect Journalists",
    "cnet.com": "CNET",
    "edge.org": "Edge",
    "grist.org": "Grist",
    "mediaite.com": "Mediaite",
    "mediamatters.org": "Media Matters",
    "mediashift.org": "MediaShift",
    "soundcloud.com": "SoundCloud",
    "peabodyawards.com": "Peabody Awards",
    "abebooks.com": "AbeBooks",
    "nyunews.com": "NYU News",
    "poynder.blogspot.com": "Open and Shut? (Blogspot)",
    "radioopensource.org": "Radio Open Source",
    "gazettenet.com": "Daily Hampshire Gazette",
    "berks.psu.edu": "Penn State Berks",
    "news.uga.edu": "University of Georgia",
    "bylinesupplement.com": "Byline Supplement",
    "georgiahumanities.org": "Georgia Humanities",
}


def main():
    with open(CSV_PATH, "r", encoding="utf-8", newline="") as f:
        reader = csv.DictReader(f)
        fieldnames = reader.fieldnames
        rows = list(reader)

    fixed = 0
    for row in rows:
        publisher = (row.get('publisher', '') or '').strip()
        if publisher.lower() not in ('', 'unknown'):
            continue

        url = row.get('url', '')
        try:
            domain = urlparse(url).netloc.lower().replace('www.', '')
        except Exception:
            continue

        for d, name in EXTRA_DOMAINS.items():
            if d in domain:
                row['publisher'] = name
                orig = (row.get('original_publication', '') or '').strip()
                if orig.lower() in ('', 'unknown'):
                    row['original_publication'] = name
                fixed += 1
                break

    print(f"  Fixed {fixed} more publishers")

    if fixed > 0:
        with open(CSV_PATH, "w", encoding="utf-8", newline="") as f:
            writer = csv.DictWriter(f, fieldnames=fieldnames)
            writer.writeheader()
            writer.writerows(rows)
        print("  Done!")


if __name__ == "__main__":
    main()
