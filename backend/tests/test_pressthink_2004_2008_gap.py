"""Tests for the 2004-2008 PressThink gap measurement (issue #815).

Every test runs offline against small in-memory fixtures, plus one checked-in
sample inventory file. That is the point: the measurement must never depend on
a packet nobody else can read.

The regression cases the issue asks for are pinned here:

* the Movable Type canonical URL pair, ``slug.html`` and its ``slug_p.html``
  print twin, must fold to one key;
* known false title matches must never be graded present.
"""

import importlib.util
import json
from pathlib import Path

# The module lives in backend/scripts/, which is not an importable package, so
# load it by path rather than via a package import.
_MODULE_PATH = (
    Path(__file__).resolve().parents[1] / "scripts" / "pressthink_2004_2008_gap.py"
)
_spec = importlib.util.spec_from_file_location("pressthink_2004_2008_gap", _MODULE_PATH)
gap = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(gap)

FIXTURE_INVENTORY = (
    Path(__file__).resolve().parent
    / "fixtures"
    / "pressthink-2004-2008-sample-inventory.json"
)


def _record(record_id, title, url, publication_date, raw_text="", excerpt=""):
    return {
        "id": record_id,
        "title": title,
        "url": url,
        "publication_date": publication_date,
        "raw_text": raw_text,
        "excerpt": excerpt,
    }


def _entry(url, date, title=None, body=None, source_id="test-source"):
    entry = {"url": url, "date": date, "source_id": source_id}
    if title:
        entry["title"] = title
    if body:
        entry["body"] = body
    return entry


# --------------------------------------------------------------------------
# canonicalisation
# --------------------------------------------------------------------------


def test_canonical_url_folds_the_movable_type_print_twin():
    # The archive stores some rows under slug.html and some under the print
    # twin slug_p.html. They are the same work, so they must share one key.
    plain = gap.canonical_source_url(
        "http://archive.pressthink.org/2004/08/31/cnn_rnc.html"
    )
    twin = gap.canonical_source_url(
        "http://archive.pressthink.org/2004/08/31/cnn_rnc_p.html"
    )
    assert plain == twin == "archive.pressthink.org/2004/08/31/cnn_rnc"


def test_canonical_url_folds_scheme_www_port_query_and_slash():
    # Wayback records the legacy host with an explicit :80 port.
    variants = [
        "http://archive.pressthink.org:80/2005/03/08/nlsn_blg.html",
        "https://www.archive.pressthink.org/2005/03/08/nlsn_blg_p.html?utm=1",
        "HTTP://Archive.PressThink.org/2005/03/08/nlsn_blg.html#comments",
    ]
    keys = {gap.canonical_source_url(v) for v in variants}
    assert keys == {"archive.pressthink.org/2005/03/08/nlsn_blg"}


def test_canonical_url_does_not_strip_a_port_like_path_segment():
    # The port strip must anchor on the host, never on a path that happens to
    # contain a colon-and-digits shape.
    assert gap.canonical_source_url("http://example.com/a:80/b") == "example.com/a:80/b"


def test_legacy_host_is_fetched_over_plain_http():
    # archive.pressthink.org serves an untrusted certificate, so an https fetch
    # of it fails. Archive rows correctly use http for that host.
    assert (
        gap.legacy_fetch_url("https://archive.pressthink.org/2004/08/31/cnn_rnc.html")
        == "http://archive.pressthink.org/2004/08/31/cnn_rnc.html"
    )
    # any other host is left alone
    assert (
        gap.legacy_fetch_url("https://pressthink.org/2016/09/asymmetry/")
        == "https://pressthink.org/2016/09/asymmetry/"
    )


def test_date_from_url_reads_the_legacy_path():
    assert gap.date_from_url(
        gap.canonical_source_url(
            "http://archive.pressthink.org/2004/08/31/cnn_rnc.html"
        )
    ) == (2004, 8, 31)
    # a month index page carries no day, so it is not a post
    assert (
        gap.date_from_url(
            gap.canonical_source_url("http://archive.pressthink.org/2004/08/")
        )
        is None
    )


def test_fingerprint_ignores_punctuation_and_refuses_short_text():
    a = gap.fingerprint_body(
        "And after the big march went by--saying what it came to say--I went on."
    )
    b = gap.fingerprint_body(
        "And after the big march went by, saying what it came to say, I went on."
    )
    assert a == b != ""
    # too little text to be safe
    assert gap.fingerprint_body("three short words") == ""


# --------------------------------------------------------------------------
# match tiers
# --------------------------------------------------------------------------


def test_exact_url_tier_matches_across_the_print_twin():
    rows = [
        _record(
            "RECORD-00226",
            "PressThink: Down at the Tick Tock Diner, I Caught Up With CNN",
            "http://archive.pressthink.org/2004/08/31/cnn_rnc_p.html",
            "2004-08-31",
        )
    ]
    index = gap.build_archive_index(rows)
    res = gap.classify_entry(
        _entry("http://archive.pressthink.org/2004/08/31/cnn_rnc.html", "2004-08-31"),
        index,
    )
    assert res["tier"] == "exact_url"
    assert res["status"] == "present"
    assert res["matched_id"] == "RECORD-00226"


def test_title_strong_tier_when_the_row_lives_at_another_host():
    # Some 2004-2008 works are held under a republication URL, so the URL tier
    # cannot fire. Same publication date plus title agreement can.
    rows = [
        _record(
            "RECORD-1",
            "PressThink: The Convention in Section View",
            "https://www.huffpost.com/entry/the-convention-in-section-view",
            "2004-08-26",
        )
    ]
    index = gap.build_archive_index(rows)
    res = gap.classify_entry(
        _entry(
            "http://archive.pressthink.org/2004/08/26/conv_sec.html",
            "2004-08-26",
            title="The Convention in Section View",
        ),
        index,
    )
    assert res["tier"] == "title_strong"
    assert res["status"] == "present"
    assert res["matched_id"] == "RECORD-1"


def test_body_fingerprint_tier_matches_when_url_and_title_both_fail():
    # The monthly index carries the post's standfirst, and the archive stores
    # the same words at the head of raw_text.
    body = (
        "In which the demise of the network sky box is confirmed, a conceit of "
        "Americana is indulged."
    )
    rows = [
        _record(
            "RECORD-1",
            "Untitled clipping",
            "https://example.com/some-other-copy",
            "1999-01-01",
            raw_text=body + " Madison Square Garden, Aug. 30.",
        )
    ]
    index = gap.build_archive_index(rows)
    res = gap.classify_entry(
        _entry(
            "http://archive.pressthink.org/2004/08/31/cnn_rnc.html",
            "2004-08-31",
            title="Down at the Tick Tock Diner, I Caught Up With CNN",
            body=body,
        ),
        index,
    )
    assert res["tier"] == "body_fingerprint"
    assert res["status"] == "present"
    assert res["matched_id"] == "RECORD-1"


def test_body_fingerprint_matches_an_excerpt_that_repeats_the_title():
    # The exported excerpt often repeats the title before the body text.
    title = "RNC Drops the Battleship-Style Stage; Goes Lighter, More Flexible"
    body = (
        "And after the big march went by saying what it came to say I went to "
        "look at what the Republicans did to transform the Garden."
    )
    rows = [
        _record(
            "RECORD-1",
            "PressThink: " + title,
            "https://example.com/elsewhere",
            "1999-01-01",
            excerpt=title + " " + body,
        )
    ]
    index = gap.build_archive_index(rows)
    res = gap.classify_entry(
        _entry(
            "http://archive.pressthink.org/2004/08/30/rnc_red.html",
            "2004-08-30",
            body=body,
        ),
        index,
    )
    assert res["tier"] == "body_fingerprint"
    assert res["matched_id"] == "RECORD-1"


def test_known_false_title_match_is_never_graded_present():
    # Two different posts from the same month share the generic tokens
    # "guest", "critic", and "unity". Grading that as present would hide a
    # genuine gap.
    rows = [
        _record(
            "RECORD-1",
            "PressThink: Guest Critic Juan Gonzalez, Unity Board Member: Our 2008 "
            "Convention Must Go Beyond Journalism",
            "http://archive.pressthink.org/2004/08/12/unity_gonzalez_p.html",
            "2004-08-12",
        )
    ]
    index = gap.build_archive_index(rows)
    res = gap.classify_entry(
        _entry(
            "http://archive.pressthink.org/2004/08/10/unity_prez.html",
            "2004-08-10",
            title=(
                "Guest Critic: The President of Unity Says Don't Blame Us for the "
                "Liberal Media Charge"
            ),
        ),
        index,
    )
    assert res["status"] == "missing"
    assert res["tier"] == "missing"


def test_second_known_false_title_match_stays_out_of_present():
    # A near-miss pair from the same month: only the trailing words differ, so
    # token overlap is high but neither title contains the other.
    rows = [
        _record(
            "RECORD-1",
            "PressThink: Convention De-Briefing Rolls On: August 4-5",
            "http://archive.pressthink.org/2004/08/05/dnc_dbrf2_p.html",
            "2004-08-05",
        )
    ]
    index = gap.build_archive_index(rows)
    res = gap.classify_entry(
        _entry(
            "http://archive.pressthink.org/2004/08/02/debrief_one.html",
            "2004-08-02",
            title="Convention De-Briefing Begins: August 2-3",
        ),
        index,
    )
    assert res["status"] != "present"


def test_strong_title_on_another_day_of_the_month_is_review_not_present():
    # Movable Type sometimes filed a post a day off from its stated date. That
    # is a human decision, never an automatic confirmation.
    rows = [
        _record(
            "RECORD-1",
            "PressThink: Swift Boat Story a Sad Chord",
            "http://archive.pressthink.org/2004/08/24/swift_sad_p.html",
            "2004-08-24",
        )
    ]
    index = gap.build_archive_index(rows)
    res = gap.classify_entry(
        _entry(
            "http://archive.pressthink.org/2004/08/23/swift_sad.html",
            "2004-08-23",
            title="Swift Boat Story a Sad Chord",
        ),
        index,
    )
    assert res["tier"] == "review"
    assert res["status"] == "needs_review"
    assert res["matched_id"] == "RECORD-1"


def test_strong_title_in_another_month_of_the_year_is_review():
    rows = [
        _record(
            "RECORD-1",
            "PressThink: Bias Critics Meet Newsroom Joe, Apolitical Man",
            "http://archive.pressthink.org/2004/11/03/ep_column_p.html",
            "2004-11-03",
        )
    ]
    index = gap.build_archive_index(rows)
    res = gap.classify_entry(
        _entry(
            "http://archive.pressthink.org/2004/08/03/ep_column.html",
            "2004-08-03",
            title="Bias Critics Meet Newsroom Joe, Apolitical Man",
        ),
        index,
    )
    assert res["tier"] == "review"
    assert "not 2004-08" in res["note"]


def test_weak_same_day_overlap_is_review():
    # Same day, part of the title in common, neither title contained in the
    # other. That is a human decision, not a confirmation.
    rows = [
        _record(
            "RECORD-1",
            "PressThink: Reactions to the Swift Boat Story a Sad Chord",
            "https://example.com/elsewhere",
            "2004-08-23",
        )
    ]
    index = gap.build_archive_index(rows)
    res = gap.classify_entry(
        _entry(
            "http://archive.pressthink.org/2004/08/23/swift_sad.html",
            "2004-08-23",
            title="Reactions to the Swift Boat Story from Readers",
        ),
        index,
    )
    assert res["tier"] == "review"
    assert res["matched_id"] == "RECORD-1"


def test_a_truncated_archive_title_still_confirms_on_the_same_day():
    # The archive sometimes stores a shortened form of the published title.
    # Containment is checked in both directions so that still confirms.
    rows = [
        _record(
            "RECORD-1",
            "PressThink: Reactions to What if Everything Changed for American "
            "Journalists",
            "https://example.com/elsewhere",
            "2004-08-19",
        )
    ]
    index = gap.build_archive_index(rows)
    res = gap.classify_entry(
        _entry(
            "http://archive.pressthink.org/2004/08/19/911_react.html",
            "2004-08-19",
            title=(
                "Reactions to What if Everything Changed for American Journalists "
                "on September 11th"
            ),
        ),
        index,
    )
    assert res["tier"] == "title_strong"
    assert res["matched_id"] == "RECORD-1"


def test_missing_when_nothing_matches():
    rows = [
        _record(
            "RECORD-1",
            "PressThink: Something Else Entirely",
            "http://archive.pressthink.org/2004/01/05/other_p.html",
            "2004-01-05",
        )
    ]
    index = gap.build_archive_index(rows)
    res = gap.classify_entry(
        _entry(
            "http://archive.pressthink.org/2006/09/20/rts_gft.html",
            "2006-09-20",
            title="Editing Horizontally: Thanks to Reuters",
        ),
        index,
    )
    assert res["status"] == "missing"
    assert res["matched_id"] is None


def test_titleless_entry_records_why_only_the_url_tier_ran():
    # The capture index carries no titles. When such an entry is missing, the
    # report must say the other tiers never had anything to work with.
    index = gap.build_archive_index([])
    res = gap.classify_entry(
        _entry("http://archive.pressthink.org/2007/04/01/x.html", "2007-04-01"), index
    )
    assert res["status"] == "missing"
    assert "no title or body" in res["note"]


# --------------------------------------------------------------------------
# source parsing
# --------------------------------------------------------------------------


SAMPLE_MONTHLY_HTML = """
<div class="side">
  <h3 class="title"><a href="http://archive.pressthink.org/2010/08/15/citizens_agenda.html"
     class="titlelink">The Citizens Agenda in Campaign Coverage</a></h3>
</div>
<h2 class="date">August 31, 2004</h2>
<div class="blogbody">
<h3 class="title"><a href="http://archive.pressthink.org/2004/08/31/cnn_rnc.html"
   class="titlelink">Down at the Tick Tock Diner, I Caught Up With CNN</a></h3>
<h4 class="subhead">In which the demise of the network sky box is confirmed.</h4>
<div class="posted">Posted by Jay Rosen at
  <a href="http://archive.pressthink.org/2004/08/31/cnn_rnc.html"> 2:15 AM</a></div>
</div>
<h2 class="date">August 26, 2004</h2>
<div class="blogbody">
<h3 class="title"><a href="http://archive.pressthink.org/2004/08/26/conv_sec.html"
   class="titlelink">The Convention in Section &amp; View</a></h3>
</div>
"""


def test_parse_monthly_index_keeps_only_the_requested_month():
    entries = gap.parse_monthly_index(SAMPLE_MONTHLY_HTML, 2004, 8)
    urls = [e["url"] for e in entries]
    assert len(entries) == 2
    assert "http://archive.pressthink.org/2004/08/31/cnn_rnc.html" in urls
    # the sidebar link to a 2010 post is not part of this month's inventory
    assert all("2010" not in u for u in urls)


def test_parse_monthly_index_reads_title_body_and_entities():
    entries = {
        e["url"]: e for e in gap.parse_monthly_index(SAMPLE_MONTHLY_HTML, 2004, 8)
    }
    first = entries["http://archive.pressthink.org/2004/08/31/cnn_rnc.html"]
    assert first["title"] == "Down at the Tick Tock Diner, I Caught Up With CNN"
    assert first["body"].startswith("In which the demise")
    assert first["date"] == "2004-08-31"
    second = entries["http://archive.pressthink.org/2004/08/26/conv_sec.html"]
    assert second["title"] == "The Convention in Section & View"
    # a post with no standfirst carries no body key rather than an empty one
    assert "body" not in second


SAMPLE_CDX = """\
http://archive.pressthink.org:80/ 20100920220623 text/html 200 AAA
http://archive.pressthink.org:80/2004/08/ 20100924162642 text/html 200 BBB
http://archive.pressthink.org:80/2004/08/31/cnn_rnc.html 20110811215744 text/html 200 CCC
http://archive.pressthink.org/2004/08/31/cnn_rnc_p.html 20120529222611 text/html 200 DDD
http://archive.pressthink.org/2003/08/25/recall_cliches.html 20110811215744 text/html 200 EEE
"""


def test_strip_default_port_cleans_the_host_only():
    assert (
        gap.strip_default_port("http://archive.pressthink.org:80/2004/08/")
        == "http://archive.pressthink.org/2004/08/"
    )
    assert (
        gap.strip_default_port("http://example.com:8080/a")
        == "http://example.com:8080/a"
    )


def test_parse_cdx_dedupes_the_print_twin_and_drops_non_posts():
    entries = gap.parse_cdx(SAMPLE_CDX, 2004, 2008)
    assert len(entries) == 1
    # the capture index records the host as archive.pressthink.org:80; the
    # stored inventory url is the clean one a person can open
    assert entries[0]["url"] == "http://archive.pressthink.org/2004/08/31/cnn_rnc.html"
    assert entries[0]["date"] == "2004-08-31"
    assert entries[0]["evidence"].startswith("https://web.archive.org/web/")


def test_parse_cdx_respects_the_window():
    assert gap.parse_cdx(SAMPLE_CDX, 2003, 2003)[0]["date"] == "2003-08-25"


def test_cdx_query_url_asks_for_html_captures_only():
    query = gap.cdx_query_url("archive.pressthink.org")
    assert "url=archive.pressthink.org*" in query
    assert "filter=statuscode:200" in query
    assert "filter=mimetype:text/html" in query


def test_monthly_index_url_uses_plain_http():
    assert gap.monthly_index_url(2004, 8) == "http://archive.pressthink.org/2004/08/"


def test_parse_month_snapshots_picks_out_month_index_captures():
    text = (
        "http://archive.pressthink.org:80/2004/08/ 20100924162704\n"
        "http://archive.pressthink.org/2004/08/ 20110811215744\n"
        "http://archive.pressthink.org/2004/08/31/cnn_rnc.html 20110811215744\n"
        "http://archive.pressthink.org:80/ 20100920220623\n"
    )
    snapshots = gap.parse_month_snapshots(text)
    # only the month index page, and both of its captures, sorted oldest first
    assert set(snapshots) == {(2004, 8)}
    assert snapshots[(2004, 8)] == ["20100924162704", "20110811215744"]


def test_month_snapshots_query_reuses_the_collapsed_host_query():
    # One query shape to trust, and small enough that the response arrives whole.
    assert gap.month_snapshots_query() == gap.cdx_query_url(gap.LEGACY_HOST)
    assert "collapse=urlkey" in gap.month_snapshots_query()


def test_month_fallback_query_asks_for_one_month_only():
    query = gap.month_fallback_query(2004, 8)
    assert "url=archive.pressthink.org/2004/08/" in query
    assert "limit=6" in query


# --------------------------------------------------------------------------
# report
# --------------------------------------------------------------------------


def test_load_inventory_stamps_the_source_id_on_every_entry():
    inv = gap.load_inventory(FIXTURE_INVENTORY)
    assert inv["source_id"] == "sample-monthly-index"
    assert all(e["source_id"] == "sample-monthly-index" for e in inv["entries"])


def test_report_from_the_checked_in_fixture_groups_by_status_year_and_source():
    inv = gap.load_inventory(FIXTURE_INVENTORY)
    rows = [
        # present by url, stored under the print twin
        _record(
            "RECORD-00226",
            "PressThink: Down at the Tick Tock Diner, I Caught Up With CNN",
            "http://archive.pressthink.org/2004/08/31/cnn_rnc_p.html",
            "2004-08-31",
        ),
        # present by title, held at another host
        _record(
            "RECORD-00300",
            "PressThink: The Convention in Section View",
            "https://www.huffpost.com/entry/convention-section-view",
            "2004-08-26",
        ),
        # present by body fingerprint only
        _record(
            "RECORD-00400",
            "Untitled clipping",
            "https://example.com/clip",
            "1999-01-01",
            raw_text=(
                "And after the big march went by--saying what it came to say--I "
                "went to look at what the Republicans did."
            ),
        ),
    ]
    report = gap.build_report([inv], rows)

    # the 2011 row in the fixture is outside the measured window
    assert report["entries_outside_window"] == 1
    assert report["candidates_considered"] == 4
    assert report["totals"] == {"present": 3, "needs_review": 0, "missing": 1}
    assert report["tier_counts"]["exact_url"] == 1
    assert report["tier_counts"]["title_strong"] == 1
    assert report["tier_counts"]["body_fingerprint"] == 1
    assert report["by_year"]["2004"]["missing"] == 1
    assert report["by_source"]["sample-monthly-index"]["present"] == 3
    assert report["by_source_year"]["sample-monthly-index"]["2004"]["present"] == 3
    assert report["sources"][0]["retrieved_at"] == "2026-08-27"
    assert report["sources"][0]["provenance"].startswith("https://web.archive.org/")
    # one source, so the distinct-work rollup matches the listing counts
    assert report["distinct_works"]["count"] == 4
    assert report["distinct_works"]["totals"]["missing"] == 1


def test_distinct_work_rollup_counts_a_shared_work_once():
    # Both sources list the same post. It is one work, present once, and the
    # rollup must not report it as two.
    shared = _entry(
        "http://archive.pressthink.org/2004/08/31/cnn_rnc.html", "2004-08-31"
    )
    only_in_b = _entry(
        "http://archive.pressthink.org/2004/08/30/rnc_red.html", "2004-08-30"
    )
    inv_a = {"source_id": "a", "entries": [dict(shared, source_id="a")]}
    inv_b = {
        "source_id": "b",
        "entries": [dict(shared, source_id="b"), dict(only_in_b, source_id="b")],
    }
    rows = [
        _record(
            "RECORD-1",
            "PressThink: Down at the Tick Tock Diner",
            "http://archive.pressthink.org/2004/08/31/cnn_rnc_p.html",
            "2004-08-31",
        )
    ]
    report = gap.build_report([inv_a, inv_b], rows)
    # three listings across the two sources
    assert report["candidates_considered"] == 3
    assert report["totals"] == {"present": 2, "needs_review": 0, "missing": 1}
    # but only two distinct works
    assert report["distinct_works"]["count"] == 2
    assert report["distinct_works"]["totals"] == {
        "present": 1,
        "needs_review": 0,
        "missing": 1,
    }
    assert report["distinct_works"]["missing_urls"] == [
        "archive.pressthink.org/2004/08/30/rnc_red"
    ]


def test_distinct_work_rollup_keeps_the_strongest_result_across_sources():
    # One source carries a title and confirms the work; the other carries only
    # a url and cannot. The work is present, not missing.
    url = "http://archive.pressthink.org/2004/08/26/conv_sec.html"
    inv_titled = {
        "source_id": "titled",
        "entries": [
            _entry(
                url,
                "2004-08-26",
                title="The Convention in Section View",
                source_id="titled",
            )
        ],
    }
    inv_bare = {
        "source_id": "bare",
        "entries": [_entry(url, "2004-08-26", source_id="bare")],
    }
    rows = [
        _record(
            "RECORD-1",
            "PressThink: The Convention in Section View",
            "https://www.huffpost.com/entry/convention-section-view",
            "2004-08-26",
        )
    ]
    report = gap.build_report([inv_titled, inv_bare], rows)
    assert report["totals"] == {"present": 1, "needs_review": 0, "missing": 1}
    assert report["distinct_works"]["totals"]["present"] == 1
    assert report["distinct_works"]["totals"]["missing"] == 0


def test_report_keeps_the_three_statuses_separate():
    inv = {
        "source_id": "s",
        "entries": [
            _entry(
                "http://archive.pressthink.org/2004/08/23/swift_sad.html",
                "2004-08-23",
                title="Swift Boat Story a Sad Chord",
                source_id="s",
            ),
            _entry(
                "http://archive.pressthink.org/2006/09/20/rts_gft.html",
                "2006-09-20",
                title="Editing Horizontally Thanks to Reuters",
                source_id="s",
            ),
        ],
    }
    rows = [
        _record(
            "RECORD-1",
            "PressThink: Swift Boat Story a Sad Chord",
            "http://archive.pressthink.org/2004/08/24/swift_sad_p.html",
            "2004-08-24",
        )
    ]
    report = gap.build_report([inv], rows)
    assert report["totals"] == {"present": 0, "needs_review": 1, "missing": 1}
    assert report["by_year"]["2004"] == {"needs_review": 1}
    assert report["by_year"]["2006"] == {"missing": 1}


def test_report_counts_one_candidate_per_canonical_url_per_source():
    inv = {
        "source_id": "s",
        "entries": [
            _entry(
                "http://archive.pressthink.org/2004/08/31/cnn_rnc.html",
                "2004-08-31",
                source_id="s",
            ),
            _entry(
                "http://archive.pressthink.org/2004/08/31/cnn_rnc_p.html",
                "2004-08-31",
                source_id="s",
            ),
        ],
    }
    report = gap.build_report([inv], [])
    assert report["candidates_considered"] == 1


def test_report_keeps_the_same_url_from_two_sources_apart():
    entry = _entry(
        "http://archive.pressthink.org/2004/08/31/cnn_rnc.html", "2004-08-31"
    )
    inv_a = {"source_id": "a", "entries": [dict(entry, source_id="a")]}
    inv_b = {"source_id": "b", "entries": [dict(entry, source_id="b")]}
    report = gap.build_report([inv_a, inv_b], [])
    assert report["candidates_considered"] == 2
    assert set(report["by_source"]) == {"a", "b"}


def test_markdown_report_states_its_coverage_limits():
    inv = gap.load_inventory(FIXTURE_INVENTORY)
    report = gap.build_report([inv], [])
    text = gap.render_markdown(report, "2026-08-27")
    assert "# PressThink 2004-2008 gap measurement — 2026-08-27" in text
    assert "## Coverage limits" in text
    assert "not proof that a work never existed" in text
    assert "## The answer" in text
    assert "## Missing listings (4)" in text
    assert "## By source and year" in text
    # the source table names the inventory and its retrieval date
    assert "2026-08-27" in text
    assert "slug_p.html" in text


def test_checked_in_fixture_inventory_matches_the_documented_shape():
    data = json.loads(FIXTURE_INVENTORY.read_text(encoding="utf-8"))
    for key in ("source_id", "source_name", "provenance", "retrieved_at", "entries"):
        assert key in data, key
    for entry in data["entries"]:
        assert entry["url"].startswith("http://archive.pressthink.org/")
        assert gap.parse_date(entry["date"]) is not None
