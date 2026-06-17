"""
Fill "Unknown" publisher fields from URL domain patterns.

Maps known URL domains to publisher names.
"""

import csv
import re
from pathlib import Path
from urllib.parse import urlparse

from csv_safe_write import atomic_csv_write

CSV_PATH = Path(__file__).parent / "archive_records-public.csv"

# Map URL domains to publisher names
DOMAIN_TO_PUBLISHER = {
    "pressthink.org": "PressThink",
    "archive.pressthink.org": "PressThink",
    "publicnotebook.wordpress.com": "Public Notebook",
    "huffpost.com": "HuffPost",
    "huffingtonpost.com": "HuffPost",
    "nytimes.com": "The New York Times",
    "washingtonpost.com": "The Washington Post",
    "theatlantic.com": "The Atlantic",
    "medium.com": "Medium",
    "salon.com": "Salon",
    "slate.com": "Slate",
    "wired.com": "Wired",
    "theguardian.com": "The Guardian",
    "niemanlab.org": "Nieman Lab",
    "cjr.org": "Columbia Journalism Review",
    "poynter.org": "Poynter",
    "prospect.org": "The American Prospect",
    "thenation.com": "The Nation",
    "newrepublic.com": "The New Republic",
    "nymag.com": "New York Magazine",
    "nybooks.com": "The New York Review of Books",
    "vox.com": "Vox",
    "buzzfeed.com": "BuzzFeed",
    "journalism.nyu.edu": "NYU Journalism",
    "x.com": "X/Twitter",
    "twitter.com": "X/Twitter",
    "youtube.com": "YouTube",
    "bsky.app": "Bluesky",
    "substack.com": "Substack",
    "insidehighered.com": "Inside Higher Ed",
    "chronicle.com": "The Chronicle of Higher Education",
    "jayrosen.tumblr.com": "Tumblr",
    "studio20nyu.tumblr.com": "Studio 20 (NYU)",
    "tmblr.co": "Tumblr",
    "newscreatorcorps.org": "News Creator Corps",
    "cnn.com": "CNN",
    "bbc.com": "BBC",
    "bbc.co.uk": "BBC",
    "npr.org": "NPR",
    "politico.com": "Politico",
    "propublica.org": "ProPublica",
    "theintercept.com": "The Intercept",
    "reason.com": "Reason",
    "foxnews.com": "Fox News",
    "latimes.com": "Los Angeles Times",
    "chicagotribune.com": "Chicago Tribune",
    "usatoday.com": "USA Today",
    "wsj.com": "The Wall Street Journal",
    "bloomberg.com": "Bloomberg",
    "reuters.com": "Reuters",
    "apnews.com": "Associated Press",
    "newyorker.com": "The New Yorker",
    "amazon.com": "Amazon",
    "goodreads.com": "Goodreads",
    "newspapers.com": "Newspapers.com",
    "thedailybeast.com": "The Daily Beast",
    "techdirt.com": "Techdirt",
    "towcenter.org": "Tow Center for Digital Journalism",
    "shorensteincenter.org": "Shorenstein Center",
    "freedomforum.org": "Freedom Forum",
    "lenfestinstitute.org": "Lenfest Institute",
    "americanpressinstitute.org": "American Press Institute",
    "reutersinstitute.politics.ox.ac.uk": "Reuters Institute",
}


def get_publisher_from_url(url):
    if not url:
        return None
    try:
        parsed = urlparse(url)
        domain = parsed.netloc.lower().replace('www.', '')

        # Direct match
        if domain in DOMAIN_TO_PUBLISHER:
            return DOMAIN_TO_PUBLISHER[domain]

        # Check parent domains (e.g., blog.example.com -> example.com)
        parts = domain.split('.')
        if len(parts) > 2:
            parent = '.'.join(parts[-2:])
            if parent in DOMAIN_TO_PUBLISHER:
                return DOMAIN_TO_PUBLISHER[parent]

        # Substack special case
        if 'substack.com' in domain:
            return "Substack"

        return None
    except Exception:
        return None


def main():
    print(f"Reading {CSV_PATH}...")

    with open(CSV_PATH, "r", encoding="utf-8", newline="") as f:
        reader = csv.DictReader(f)
        fieldnames = reader.fieldnames
        rows = list(reader)

    print(f"  Loaded {len(rows)} records")

    # Count unknowns
    unknowns = [r for r in rows
                 if (r.get('publisher', '') or '').strip().lower() in ('', 'unknown')]
    print(f"  Records with Unknown/empty publisher: {len(unknowns)}")

    fixed = 0
    unfixed_domains = set()

    for row in rows:
        publisher = (row.get('publisher', '') or '').strip()
        if publisher.lower() not in ('', 'unknown'):
            continue

        url = row.get('url', '')
        new_pub = get_publisher_from_url(url)

        if new_pub:
            # Also update original_publication if it's empty/unknown
            orig_pub = (row.get('original_publication', '') or '').strip()
            if orig_pub.lower() in ('', 'unknown'):
                row['original_publication'] = new_pub

            row['publisher'] = new_pub
            fixed += 1
            if fixed <= 10:
                print(f"    {row.get('id', '?')}: Unknown -> {new_pub} (from {url[:60]})")
        else:
            try:
                domain = urlparse(url).netloc.lower().replace('www.', '')
                if domain:
                    unfixed_domains.add(domain)
            except Exception:
                pass

    print(f"\n  Fixed publishers: {fixed} / {len(unknowns)}")
    print(f"  Remaining unknown domains ({len(unfixed_domains)}):")
    for domain in sorted(unfixed_domains)[:20]:
        count = sum(1 for r in rows
                    if (r.get('publisher', '') or '').strip().lower() in ('', 'unknown')
                    and domain in (r.get('url', '') or ''))
        print(f"    {domain} ({count} records)")

    if fixed > 0:
        print(f"\n  Writing {CSV_PATH}...")
        with atomic_csv_write(CSV_PATH) as f:
            writer = csv.DictWriter(f, fieldnames=fieldnames)
            writer.writeheader()
            writer.writerows(rows)
        print("  Done!")
    else:
        print("  No changes needed.")


if __name__ == "__main__":
    main()
