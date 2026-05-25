"""
Append Pillar 2 podcast guest-appearance backfill records to
archive_records-public.csv.

Self-contained, one-shot. Verified URLs + metadata captured 2026-05-25.
Each record is sanitized against CSV formula injection before write, then
the whole file is replaced atomically via the existing csv_safe_write
helper. Run from the repo root: python3 data/_add_pillar2_podcasts.py
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
    """Match the canonical era labels used by neighbouring records in the
    CSV. Aligns with the 8-era taxonomy documented in PR #218; the
    export-archive-data.js getEra() override will translate to the 4-era
    set the data-integrity test still expects."""
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


def make_record(
    *,
    rec_id: str,
    title: str,
    url: str,
    author: str,
    date: str,
    original_publication: str,
    publisher: str,
    excerpt: str,
    summary: str,
    thematic_categories: str,
    key_concepts: str,
    series: str = "",
    tags: str = "",
    length_in_seconds: str = "",
    pull_quote: str = "",
    notes: str = "",
) -> dict:
    year = int(date.split("-")[0])
    return {
        "id": rec_id,
        "title": title,
        "url": url,
        "author": author,
        "publication_date": date,
        "original_publication": original_publication,
        "publisher": publisher,
        "platform": "Podcast",
        "collection_id": "PUBLIC",
        "content_type": "Interview (Audio/Video)",
        "format": "audio",
        "word_count": "",
        "length_in_seconds": length_in_seconds,
        "excerpt": excerpt,
        "summary": summary,
        "thematic_categories": thematic_categories,
        "key_concepts": key_concepts,
        "series": series,
        "era": era_for(year),
        "scope": "Industry",
        "tags": tags,
        "related_to": "",
        "responds_to": "",
        "influence": "",
        "copyright": publisher or original_publication,
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
        "notes": notes,
    }


NEW_RECORDS = [
    # 1. Lydon 2003 — pre-Open Source, Harvard Law blogs era
    make_record(
        rec_id="RECORD-00879",
        title="Jay Rosen: The Blog Transformation of Journalism",
        url="https://archive.blogs.harvard.edu/lydondev/2003/10/04/jay-rosen-the-blog-transformation-of-journalism/",
        author="Christopher Lydon",
        date="2003-10-04",
        original_publication="Christopher Lydon Interviews",
        publisher="Harvard Law School Blogs",
        excerpt="Recorded after the opening day of BloggerCon at Harvard. Rosen discusses how the tools of journalism are being democratized, how the Kremlin model of newsroom authority is failing, and why amateurs from Baghdad Blogger to Instapundit have shown a flair for the game.",
        summary="An early Lydon long-form conversation with Rosen following BloggerCon at Harvard Law's Berkman Center. Rosen argues that 'the terms of authority are changing in American journalism' and connects his decade of public-journalism advocacy to the new democratised tools of blogging and digital media. The interview also covers Rosen's reading of the New York Times' internal review of the Jayson Blair scandal.",
        thematic_categories="Press & Media Criticism, Technology & Digital Media, Journalism Theory & Practice",
        key_concepts="blogging; public journalism; democratisation of journalism; press authority; Jayson Blair; PressThink",
        series="Christopher Lydon Interviews",
        tags="BloggerCon, Christopher Lydon, Harvard, Public Journalism, Press Authority, Blogging",
        pull_quote="Blogs are undoing the system for generating authority and therefore credibility of news providers that's been accumulating for well over 100 years.",
        notes="Pre-dates Lydon's Radio Open Source. Recorded after BloggerCon at the Berkman Center. Added 2026-05-25 from Pillar 2 podcast candidate sweep.",
    ),
    # 2. Re-musing Ourselves (2006)
    make_record(
        rec_id="RECORD-00880",
        title="Re-musing Ourselves",
        url="https://www.wnycstudios.org/podcasts/otm/segments/128823-re-musing-ourselves",
        author="Brooke Gladstone; Jay Rosen",
        date="2006-03-03",
        original_publication="WNYC",
        publisher="WNYC Studios",
        excerpt="Rosen reflects on the late Neil Postman, his mentor at NYU, and on the renewed relevance of Postman's Amusing Ourselves to Death in the cable-news era.",
        summary="On the Media segment with Rosen on Neil Postman, his mentor in the NYU Journalism Department and author of Amusing Ourselves to Death. Rosen counts Postman as both mentor and hero and explains why Postman's argument about the superiority of the printed word for sustaining ideas has only grown more relevant.",
        thematic_categories="Press & Media Criticism, Journalism Theory & Practice",
        key_concepts="Neil Postman; Amusing Ourselves to Death; print culture; television and discourse",
        series="On the Media",
        tags="Neil Postman, On The Media, Brooke Gladstone, Print Culture, NYU",
        pull_quote="It was in print that we learned how to make an argument cohere. It was in print that we learned that we could classify what we know.",
        notes="WNYC segment ID 128823. Added 2026-05-25 from Pillar 2 podcast candidate sweep.",
    ),
    # 3. HuffPost morning podcast 2008
    make_record(
        rec_id="RECORD-00881",
        title="Morning podcast with Jay Rosen",
        url="https://www.huffpost.com/entry/morning-podcast-with-jay_b_126312",
        author="Jay Rosen",
        date="2008-09-14",
        original_publication="HuffPost",
        publisher="HuffPost",
        excerpt="Short HuffPost morning podcast featuring Jay Rosen on press think and the 2008 campaign.",
        summary="A brief HuffPost morning podcast appearance by Rosen, published in the late stages of the 2008 presidential campaign. HuffPost's modern templated page preserves only the title and publication metadata; full episode audio is not surfaced on the current page.",
        thematic_categories="Press & Media Criticism",
        key_concepts="2008 campaign; press think; podcasting",
        series="HuffPost morning podcast",
        tags="HuffPost, 2008 Campaign, Press Think, Podcast",
        notes="HuffPost stub _b_126312 (2008). Original audio not surfaced on the templated 2020s rebuild; metadata verified via og:title and og:published_time. Added 2026-05-25 from Pillar 2 podcast candidate sweep.",
    ),
    # 4. Pub #43 - 2015
    make_record(
        rec_id="RECORD-00882",
        title="The Pub #43: Why public media are sponsoring polls, and how a CBC video went viral",
        url="https://current.org/2015/11/the-pub-43-why-public-media-are-sponsoring-polls%E2%80%8B-and-how-a-cbc-video-went-viral/",
        author="Adam Ragusea",
        date="2015-11-05",
        original_publication="Current",
        publisher="Current (public media)",
        excerpt="Rosen pushed back on public radio horse-race polls in a Twitter exchange with Dan Kennedy. WBUR Managing Director of News and Programming Sam Fleming responds on The Pub.",
        summary="The Pub podcast episode opens with Rosen's Twitter critique of WBUR for sponsoring horse-race polls and asks how polling fits with public media's mission. WBUR's Sam Fleming responds to Rosen's argument; the episode also features Marketplace host Kai Ryssdal.",
        thematic_categories="Press & Media Criticism, Politics & Democracy",
        key_concepts="horse race journalism; public media; polling; WBUR; citizen's agenda",
        series="The Pub podcast",
        tags="Public Media, Horse Race, Polling, WBUR, Adam Ragusea, The Pub",
        notes="Episode #43, predates the live-taping episode #62 (RECORD-00772) by five months. Added 2026-05-25 from Pillar 2 podcast candidate sweep.",
    ),
    # 5. Recode Media 2019 - via Vox URL (recode.net dead)
    make_record(
        rec_id="RECORD-00883",
        title="NYU's Jay Rosen says 2020's political journalism will be even worse than 2016's",
        url="https://www.vox.com/2019/1/24/18195097/jay-rosen-trump-politics-media-horse-race-recode-podcast-2020-predictions",
        author="Peter Kafka",
        date="2019-01-24",
        original_publication="Recode Media",
        publisher="Vox Media",
        excerpt="Rosen returns to Peter Kafka's Recode Media to argue that political journalism in 2020 will be even worse than in 2016 if newsrooms keep treating the Trump presidency as politics-as-usual.",
        summary="Two years after the first Recode Media appearance (RECORD-00784/00785), Rosen returns to Peter Kafka's podcast to forecast the 2020 cycle. He argues the horse-race frame is structurally incapable of covering an anti-democratic candidate and warns that the press has not absorbed the lessons of 2016.",
        thematic_categories="Press & Media Criticism, Politics & Democracy",
        key_concepts="horse race journalism; 2020 election; Trump coverage; press failure",
        series="Recode Media",
        tags="Recode, Peter Kafka, 2020 Election, Trump, Horse Race, Vox",
        notes="Originally at recode.net (domain decommissioned); URL is the Vox.com successor of the same post. Added 2026-05-25 from Pillar 2 podcast candidate sweep.",
    ),
    # 6. Channels with Peter Kafka - 2021 Trump vs the Press final report card
    make_record(
        rec_id="RECORD-00884",
        title="Trump vs the Press: a final report card from Jay Rosen",
        url="https://podcasts.apple.com/us/podcast/trump-vs-the-press-a-final-report-card-from-jay-rosen/id1080467174?i=1000506011822",
        author="Peter Kafka",
        date="2021-01-21",
        original_publication="Channels with Peter Kafka",
        publisher="Vox Media",
        excerpt="Recorded the day after Biden's inauguration: Rosen delivers a final report card on the press's four years of covering Trump, alongside a separate Apple subscriptions segment with Bryan Alvarez.",
        summary="Peter Kafka's podcast (previously Recode Media) hosts Rosen for a final report card on the press's coverage of the Trump presidency, one day after the Biden inauguration. The 50-minute episode pairs the Rosen interview with a separate segment featuring Figure Four Online's Bryan Alvarez on Apple's potential venture into podcast subscriptions.",
        thematic_categories="Press & Media Criticism, Politics & Democracy",
        key_concepts="Trump-era press; report card; emergency mode; press failure",
        series="Channels with Peter Kafka",
        length_in_seconds="3005",
        tags="Recode, Peter Kafka, Trump Era, Report Card, Press Failure",
        notes="Pillar 2 sweep originally identified this as a Trumpcast (Slate) finale; Apple Podcasts series metadata confirms it is the Recode Media / Channels with Peter Kafka feed. Added 2026-05-25.",
    ),
    # 7. Reliable Sources 2021
    make_record(
        rec_id="RECORD-00885",
        title="Jay Rosen on right-wing TV drifting 'further from the real,' and how journalists should 'rethink and rebuild' to cover it",
        url="https://podcasts.apple.com/us/podcast/jay-rosen-on-right-wing-tv-drifting-further-from-the/id466789756?i=1000525927837",
        author="Brian Stelter",
        date="2021-06-17",
        original_publication="Reliable Sources",
        publisher="CNN",
        excerpt="Rosen on Reliable Sources discussing the devolution of Fox News and the difficulty of describing a shifted political universe in the United States.",
        summary="CNN's Reliable Sources podcast hosts Rosen for a 44-minute discussion of the devolution of Fox News, the difficulty of describing a shifted political universe in the United States, and why journalists should rethink and rebuild to cover it.",
        thematic_categories="Press & Media Criticism, Politics & Democracy",
        key_concepts="Fox News; cable news; right-wing media; press rebuilding",
        series="Reliable Sources",
        length_in_seconds="2668",
        tags="Brian Stelter, Reliable Sources, Fox News, Cable News, CNN",
        notes="Added 2026-05-25 from Pillar 2 podcast candidate sweep.",
    ),
    # 8. Media Masters 2021
    make_record(
        rec_id="RECORD-00886",
        title="The 'troubled' relationship media and big tech have with democracy",
        url="https://mediamasters.fm/jay-rosen/",
        author="Paul Blanchard",
        date="2021-06-24",
        original_publication="Media Masters",
        publisher="Media Masters",
        excerpt="Rosen on Paul Blanchard's Media Masters: the Trump administration still casts a shadow, Fox News plays a corrosive role, and Facebook is ungovernable and a danger to democracy around the world.",
        summary="UK-based Media Masters interviews Rosen at length. He argues the United States lives in a two-party system where one party is anti-democratic and the other is unsure that is a problem; attacks Fox News for deliberately and cynically provoking rage and loyalty; and condemns Facebook as ungovernable and a danger to democracy around the world.",
        thematic_categories="Press & Media Criticism, Politics & Democracy, Technology & Digital Media",
        key_concepts="democracy; Trump shadow; Fox News; Facebook; big tech",
        series="Media Masters",
        tags="Paul Blanchard, Media Masters, Fox News, Facebook, Democracy",
        pull_quote="We live in a two-party system... one of the two is anti-democratic, and the other is not sure that's a problem.",
        notes="UK podcast. Added 2026-05-25 from Pillar 2 podcast candidate sweep.",
    ),
    # 9. Ezra Klein 2021 (guest-hosted by Nicole Hemmer)
    make_record(
        rec_id="RECORD-00887",
        title="It's Time for the Media to Choose: Neutrality or Democracy?",
        url="https://podcasts.apple.com/us/podcast/its-time-for-the-media-to-choose-neutrality-or-democracy/id1548604447?i=1000541587609",
        author="Nicole Hemmer",
        date="2021-11-12",
        original_publication="The Ezra Klein Show",
        publisher="The New York Times",
        excerpt="Guest host Nicole Hemmer interviews Rosen on whether journalism's commitment to neutrality is compatible with the defence of democracy against a party that has turned anti-democratic.",
        summary="The Ezra Klein Show (guest-hosted by Nicole Hemmer for the New York Times) interviews Rosen on his argument that 'making it harder to vote, and harder to understand what the party is really about — these are two parts of the same project' for the Republican Party. The conflict with honest journalism is structural, not merely partisan.",
        thematic_categories="Press & Media Criticism, Politics & Democracy",
        key_concepts="pro-democracy press; neutrality; both-sides journalism; democratic backsliding",
        series="The Ezra Klein Show",
        tags="Ezra Klein, Nicole Hemmer, NYT, Pro-Democracy, Neutrality, Both-Sidesism",
        pull_quote="Making it harder to vote, and harder to understand what the party is really about — these are two parts of the same project.",
        notes="Guest-hosted episode (Ezra Klein away). Added 2026-05-25 from Pillar 2 podcast candidate sweep.",
    ),
    # 10. On the Media - Again and Again (2022)
    make_record(
        rec_id="RECORD-00888",
        title="Again and Again",
        url="https://www.wnycstudios.org/podcasts/otm/episodes/on-the-media-again-and-again",
        author="Brooke Gladstone; Jay Rosen",
        date="2022-05-20",
        original_publication="WNYC",
        publisher="WNYC Studios",
        excerpt="Recorded after the Buffalo shooting and amid the 2022 midterm cycle: Rosen restates the emergency-mode argument and calls the Republican Party's investment in Trump's lies a civic emergency.",
        summary="On the Media episode anchored in the aftermath of the Buffalo mass shooting. Rosen restates the emergency-mode argument and reframes horse-race coverage as a portable lens that fails the moment democracy disintegrates. The Republican Party's continued investment in Trump's lies, Rosen argues, is itself a civic emergency that newsrooms keep failing to confront.",
        thematic_categories="Press & Media Criticism, Politics & Democracy, Journalism Theory & Practice",
        key_concepts="emergency mode; horse race; pro-democracy press; civic emergency; Buffalo shooting",
        series="On the Media",
        tags="Emergency Mode, On The Media, Brooke Gladstone, Horse Race, 2022 Midterms, Buffalo Shooting",
        pull_quote="We live in a two party system and one of the two parties is anti-democratic. That is a civic emergency.",
        notes="Aired May 20, 2022, in the wake of the Buffalo shooting. Added 2026-05-25 from Pillar 2 podcast candidate sweep.",
    ),
    # 11. Jen Rubin's Green Room 2023
    make_record(
        rec_id="RECORD-00889",
        title="Jay Rosen",
        url="https://podcasts.apple.com/us/podcast/jay-rosen/id1686973843?i=1000623902777",
        author="Jen Rubin",
        date="2023-08-09",
        original_publication="Jen Rubin's Green Room",
        publisher="Jen Rubin's Green Room",
        excerpt="Rosen on Jen Rubin's Green Room: how the modern media ecosystem and the classic both-sides approach are failing American democracy.",
        summary="Washington Post columnist Jen Rubin hosts Rosen on her Green Room podcast for a 49-minute discussion of the modern media ecosystem. They cover how the classic both-sides approach and opinion-free corporate coverage fail audiences and democracy, with repeated coverage choices Rosen frames as institutional, not individual.",
        thematic_categories="Press & Media Criticism, Politics & Democracy",
        key_concepts="both-sidesism; corporate journalism; modern media ecosystem; pro-democracy press",
        series="Jen Rubin's Green Room",
        length_in_seconds="2958",
        tags="Jen Rubin, Green Room, Both-Sidesism, Modern Media Ecosystem",
        notes="Added 2026-05-25 from Pillar 2 podcast candidate sweep.",
    ),
    # 12. Local News Matters 2024
    make_record(
        rec_id="RECORD-00890",
        title="Reimagining local election coverage for community trust with NYU's Jay Rosen (LNM Episode 36)",
        url="https://localnewsmatterspodcast.com/reimagining-local-election-coverage-for-community-trust-with-nyus-jay-rosen-lnm-episode-36/",
        author="Local News Matters Podcast",
        date="2024-07-18",
        original_publication="Local News Matters Podcast",
        publisher="Local News Matters Podcast",
        excerpt="Rosen on local election coverage and the Citizens Agenda model as an alternative to the horse race, with attention to local issues and grounded community concerns.",
        summary="LNM Episode 36 with Rosen on the critical role of local election coverage and the Citizens Agenda model as an alternative to the traditional horse-race approach. Rosen presses for local journalists to ground election coverage in their communities' concerns and addresses the polarisation in American politics.",
        thematic_categories="Press & Media Criticism, Politics & Democracy, Audience & Public Engagement",
        key_concepts="citizens agenda; local journalism; horse race alternative; community trust; election coverage",
        series="Local News Matters Podcast",
        tags="Local News, Citizens Agenda, Election Coverage, Community Trust, Local Journalism",
        notes="Local News Matters Podcast Episode 36. Added 2026-05-25 from Pillar 2 podcast candidate sweep.",
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
        # sanitize every string field
        clean = {k: _sanitize_cell(v) for k, v in rec.items()}
        # ensure every column is present
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
