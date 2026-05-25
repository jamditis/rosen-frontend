"""
Append Pillar 2 RTN Phase-1 backfill records to archive_records-public.csv.

Self-contained, one-shot. Adds 11 verified episodes of "Rebooting the News"
(Jay Rosen + Dave Winer, weekly podcast 2009-2011) spread evenly across the
show's run (#7, #15, #24, #32, #41, #50, #58, #67, #76, #85, #94). The
catalog of all 87 numbered episodes was indexed via
backend/scripts/rtn_backfill_scrape.py against rebootnews.wordpress.com.

This is the schema-validation phase. After Joe signs off on shape, Pillar 2
RTN Phase-2 will add the remaining ~76 episodes in a follow-up PR.

Verification (2026-05-25):
  - Every post URL returned HTTP 200 against rebootnews.wordpress.com.
  - Every MP3 URL at mp3.morningcoffeenotes.com returned HEAD 200.
  - Show-notes excerpts pulled from the post body's hentry div (sidebar
    chrome stripped), with the byline "by Dave Winer" / "by Jay Rosen"
    used as the start-of-content marker.

Schema notes:
  - This is the first podcast-as-host record set in the archive (prior
    podcast records are all guest appearances). To avoid schema drift, this
    PR uses the same content_type=Interview (Audio/Video) + format=audio +
    platform=Podcast pattern as PR #222 (podcast guest backfill). The
    co-host role is documented in the notes column rather than as a new
    content_type.

Run from the repo root: python3 data/_add_pillar2_rtn_p1.py
"""
from __future__ import annotations

import csv
from pathlib import Path
from typing import Any

from csv_safe_write import atomic_csv_write

CSV_PATH = Path(__file__).resolve().parent / "archive_records-public.csv"
_FORMULA_TRIGGERS = ("=", "+", "-", "@")
_MAX_FIELD_LENGTH = 10000


def _sanitize_cell(value: Any) -> str:
    if value is None:
        return ""
    text = str(value).strip()
    if text and text[0] in _FORMULA_TRIGGERS:
        text = "'" + text
    if len(text) > _MAX_FIELD_LENGTH:
        text = text[:_MAX_FIELD_LENGTH]
    return text


def era_for(year: int) -> str:
    if year < 2000:
        return "Public Journalism (90s)"
    if year < 2005:
        return "Blogging Launch & Digital Disruption (2000-2004)"
    if year < 2010:
        return "Peak Blogging & Citizen Journalism (2005-2009)"
    if year < 2016:
        return "Social Media & Financial Crisis (2010-2015)"
    if year < 2021:
        return "Trump Era & Democratic Crisis (2016-2020)"
    return "Platform Transition & Future Models (2021-Present)"


def rtn_record(
    *,
    rec_id: str,
    episode: int,
    date: str,
    post_url: str,
    mp3_url: str,
    excerpt: str,
    summary: str,
    key_concepts: str,
    tags: str,
    pull_quote: str = "",
) -> dict:
    year = int(date.split("-")[0])
    return {
        "id": rec_id,
        "title": f"Rebooting the News #{episode}",
        "url": post_url,
        "author": "Jay Rosen; Dave Winer",
        "publication_date": date,
        "original_publication": "Rebooting The News",
        "publisher": "Rebooting The News",
        "platform": "Podcast",
        "collection_id": "PUBLIC",
        "content_type": "Interview (Audio/Video)",
        "format": "audio",
        "word_count": "",
        "length_in_seconds": "",
        "excerpt": excerpt,
        "summary": summary,
        "thematic_categories": "Press & Media Criticism, Technology & Digital Media, Journalism Theory & Practice",
        "key_concepts": key_concepts,
        "series": "Rebooting The News",
        "era": era_for(year),
        "scope": "Industry",
        "tags": tags,
        "related_to": "",
        "responds_to": "",
        "influence": "",
        "copyright": "Jay Rosen / Dave Winer",
        "license": "",
        "permissions": "",
        "date_processed": "2026-05-25",
        "gdrive_pdf_link": "",
        "gdrive_raw_file_link": "",
        "gdrive_transcript_link": "",
        "transcript_filepath": "",
        "pull_quote": pull_quote,
        "raw_text": "",
        "verified": "TRUE",
        "notes": (
            f"RTN #{episode}, co-hosted by Jay Rosen and Dave Winer. "
            f"Direct MP3: {mp3_url}. Indexed via rebootnews.wordpress.com. "
            "Added 2026-05-25 from Pillar 2 RTN P1 backfill."
        ),
    }


NEW_RECORDS = [
    rtn_record(
        rec_id="RECORD-00891",
        episode=7,
        date="2009-04-26",
        post_url="https://rebootnews.wordpress.com/2009/04/26/rebooting-the-news-7/",
        mp3_url="http://mp3.morningcoffeenotes.com/reboot09Apr26.mp3",
        excerpt="Weekly 40-plus minute Rebooting The News conversation between Jay Rosen and Dave Winer, recorded April 26, 2009.",
        summary="Episode 7 of the weekly Rebooting The News podcast, an open conversation between NYU journalism professor Jay Rosen and software developer / blogger Dave Winer about the future of news in the post-print, social-web era. Show notes are minimal; the canonical archive is the rebootnews.wordpress.com post.",
        key_concepts="future of news; press and technology; podcasting as journalism criticism",
        tags="Rebooting The News, Dave Winer, Public Journalism, Press Criticism, Podcast",
    ),
    rtn_record(
        rec_id="RECORD-00892",
        episode=15,
        date="2009-07-06",
        post_url="https://rebootnews.wordpress.com/2009/07/06/rebooting-the-news-15/",
        mp3_url="http://mp3.morningcoffeenotes.com/reboot09Jul06.mp3",
        excerpt="Rosen and Winer on the Reboot conference in Copenhagen and the state of online news experimentation in mid-2009.",
        summary="Episode 15. Dave reports back from the Reboot conference in Copenhagen; Jay leads the show-notes write-up. The conversation surveys the European context for the kinds of news experiments Rebooting The News has been chronicling on the US side.",
        key_concepts="Reboot conference; European news innovation; international press criticism",
        tags="Rebooting The News, Reboot Conference, Copenhagen, Europe, News Innovation",
    ),
    rtn_record(
        rec_id="RECORD-00893",
        episode=24,
        date="2009-09-08",
        post_url="https://rebootnews.wordpress.com/2009/09/08/rebooting-the-news-24/",
        mp3_url="http://mp3.morningcoffeenotes.com/reboot09Sep08.mp3",
        excerpt="Rosen and Winer discuss WordPress's growing financial scale and the week in ReadWriteWeb-flagged news experiments.",
        summary="Episode 24, recorded 9 AM Pacific. The week's news includes WordPress's revenue milestones (per ReadWriteWeb) and other stories from the open-publishing / social-web beat that Rosen and Winer regularly cover.",
        key_concepts="WordPress; open publishing platforms; ReadWriteWeb; news economy",
        tags="Rebooting The News, WordPress, ReadWriteWeb, Open Publishing, Platforms",
    ),
    rtn_record(
        rec_id="RECORD-00894",
        episode=32,
        date="2009-11-12",
        post_url="https://rebootnews.wordpress.com/2009/11/12/rebooting-the-news-32/",
        mp3_url="http://mp3.morningcoffeenotes.com/reboot09Nov09.mp3",
        excerpt="RBTN #32 — Jay and Dave's weekly survey of news, technology, and the press.",
        summary="Episode 32, posted with a brief note from Dave about the delay in publishing. Show notes for this episode are unusually short, so the canonical record is the audio file; the rebootnews.wordpress.com post serves as the index entry.",
        key_concepts="weekly news roundup; press criticism; podcasting workflow",
        tags="Rebooting The News, Press Criticism, Weekly Roundup",
    ),
    rtn_record(
        rec_id="RECORD-00895",
        episode=41,
        date="2010-02-16",
        post_url="https://rebootnews.wordpress.com/2010/02/16/rebooting-the-news-41/",
        mp3_url="http://mp3.morningcoffeenotes.com/reboot10Feb16.mp3",
        excerpt="On the rocky launch of Google Buzz and Google's broken trust contract with users.",
        summary="Episode 41 opens with the unfortunate launch of Google Buzz — Dave's post called out that 'Google did something' that broke the trust contract with its users, and Jay frames it as a press-criticism question about how platforms communicate with the people who depend on them.",
        key_concepts="Google Buzz; platform trust; user-data privacy; tech-press accountability",
        tags="Rebooting The News, Google Buzz, Privacy, Platform Trust, Tech Criticism",
        pull_quote="Google did something here that broke the trust contract.",
    ),
    rtn_record(
        rec_id="RECORD-00896",
        episode=50,
        date="2010-05-03",
        post_url="https://rebootnews.wordpress.com/2010/05/03/rebooting-the-news-50/",
        mp3_url="http://mp3.morningcoffeenotes.com/reboot10May03.mp3",
        excerpt="The 50th episode of Rebooting The News — an all-requests milestone show.",
        summary="Episode 50, marked as a milestone for the show. Jay and Dave do their version of an 'all-requests' format, revisiting topics the audience has asked them to come back to since the show started in 2009.",
        key_concepts="podcasting milestones; audience requests; press-criticism retrospective",
        tags="Rebooting The News, Milestone, Audience, Retrospective, Podcast",
    ),
    rtn_record(
        rec_id="RECORD-00897",
        episode=58,
        date="2010-07-12",
        post_url="https://rebootnews.wordpress.com/2010/07/12/rebooting-the-news-58/",
        mp3_url="http://mp3.morningcoffeenotes.com/reboot10Jul12.mp3",
        excerpt="Several classic Rebooting The News topics from the prior week, including platform behavior and press response.",
        summary="Episode 58. Jay and Dave work through several items from the past week that hit the show's recurring themes: platform behavior, the press response to it, and the gap between newsroom assumptions and how the open web actually works.",
        key_concepts="recurring beats; platform behavior; press response to platforms",
        tags="Rebooting The News, Platforms, Press Response, Weekly Roundup",
    ),
    rtn_record(
        rec_id="RECORD-00898",
        episode=67,
        date="2010-10-11",
        post_url="https://rebootnews.wordpress.com/2010/10/11/rebooting-the-news-67/",
        mp3_url="http://mp3.morningcoffeenotes.com/reboot10Oct11.mp3",
        excerpt="Guest: Saul Hansell, programming director of AOL's Seed.com and former New York Times technology reporter.",
        summary="Episode 67 features a guest conversation with Saul Hansell, then programming director of AOL's Seed.com content marketplace and previously a long-time New York Times technology reporter. The discussion covers algorithmic content commissioning and the shift from staff bylines to networked freelance contribution.",
        key_concepts="Saul Hansell; AOL Seed; algorithmic commissioning; networked freelance journalism",
        tags="Rebooting The News, Saul Hansell, AOL Seed, Content Farms, Algorithmic Journalism",
    ),
    rtn_record(
        rec_id="RECORD-00899",
        episode=76,
        date="2010-12-15",
        post_url="https://rebootnews.wordpress.com/2010/12/15/rebooting-the-news-76/",
        mp3_url="http://mp3.morningcoffeenotes.com/reboot10Dec13.mp3",
        excerpt="Wikileaks continued, plus the recurring listener joke about Dave-as-Jeff-Bridges and Jay-as-Wallace-Shawn.",
        summary="Episode 76, mid-December 2010. The conversation continues the show's Wikileaks coverage — by this point the State Department cables release was several weeks old and the press response was the through-line. Jay and Dave also riff on listener mail comparing their voices to Jeff Bridges and Wallace Shawn.",
        key_concepts="Wikileaks; State Department cables; press response to leaks; podcast voice",
        tags="Rebooting The News, Wikileaks, State Department, Press Response, Leaks",
    ),
    rtn_record(
        rec_id="RECORD-00900",
        episode=85,
        date="2011-03-13",
        post_url="https://rebootnews.wordpress.com/2011/03/13/rebooting-the-news-85/",
        mp3_url="http://mp3.morningcoffeenotes.com/reboot11Mar07.mp3",
        excerpt="Dave's minimal blogging toolkit; why the bloggers-vs-journalists frame is still with us.",
        summary="Episode 85. Two through-lines: an update on Dave's evolving minimal blogging toolkit (the set of small open tools he uses for his own posting workflow), and Jay's argument that the bloggers-versus-journalists frame is still alive in 2011 even though the technology debate it grew out of has moved on.",
        key_concepts="minimal blogging tools; bloggers vs journalists; open publishing workflow",
        tags="Rebooting The News, Blogging Tools, Bloggers vs Journalists, Open Web",
    ),
    rtn_record(
        rec_id="RECORD-00901",
        episode=94,
        date="2011-05-23",
        post_url="https://rebootnews.wordpress.com/2011/05/23/rebooting-the-news-94/",
        mp3_url="http://mp3.morningcoffeenotes.com/reboot11May23.mp3",
        excerpt="Final episode before the open-ended summer break. Guest: Lisa Williams, CEO of Placeblogger.com.",
        summary="Episode 94, the final numbered Rebooting The News before Dave and Jay went on a 'summer break' that turned out to be permanent. The guest is Lisa Williams — blogger, news hacker, and CEO of Placeblogger.com, the directory of hyperlocal news sites she founded. The episode also includes an update on Dave's Blork blogging system.",
        key_concepts="Lisa Williams; Placeblogger; hyperlocal news directories; final-episode retrospective",
        tags="Rebooting The News, Lisa Williams, Placeblogger, Hyperlocal, Final Episode",
        pull_quote="Our guest this week: Lisa Williams — blogger, news hacker and CEO of Placeblogger.com.",
    ),
]


def main() -> None:
    with open(CSV_PATH, encoding="utf-8") as f:
        reader = csv.DictReader(f)
        fieldnames = reader.fieldnames
        existing = list(reader)
    assert fieldnames is not None, "CSV missing header"

    existing_ids = {r["id"] for r in existing}
    existing_urls = {r["url"].strip() for r in existing if r["url"].strip()}

    appended = 0
    for rec in NEW_RECORDS:
        if rec["id"] in existing_ids:
            raise SystemExit(f"refuse to overwrite existing id {rec['id']}")
        if rec["url"] in existing_urls:
            raise SystemExit(f"refuse to write duplicate url {rec['url']}")
        clean = {k: _sanitize_cell(v) for k, v in rec.items()}
        for col in fieldnames:
            clean.setdefault(col, "")
        existing.append(clean)
        appended += 1

    with atomic_csv_write(CSV_PATH) as out:
        writer = csv.DictWriter(out, fieldnames=fieldnames, extrasaction="ignore")
        writer.writeheader()
        writer.writerows(existing)
    print(f"appended {appended} records; total rows now {len(existing)}")


if __name__ == "__main__":
    main()
