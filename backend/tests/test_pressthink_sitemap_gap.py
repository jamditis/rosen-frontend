"""Tests for the PressThink sitemap-vs-archive gap matcher.

These exercise the pure matching logic with small in-memory fixtures and no
network, so they prove the part that is genuinely hard: classifying a modern
WordPress sitemap URL against an archive that holds the same post under a
legacy Movable Type URL with a different slug.
"""

import importlib.util
from pathlib import Path

# The module lives in backend/scripts/, which is not an importable package, so
# load it by path rather than via a package import.
_MODULE_PATH = (
    Path(__file__).resolve().parents[1] / "scripts" / "pressthink_sitemap_gap.py"
)
_spec = importlib.util.spec_from_file_location("pressthink_sitemap_gap", _MODULE_PATH)
gap = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(gap)


def _record(record_id, title, url, publication_date):
    return {
        "id": record_id,
        "title": title,
        "url": url,
        "publication_date": publication_date,
    }


def test_normalize_url_is_scheme_www_and_slash_agnostic():
    a = gap.normalize_url("https://www.PressThink.org/2010/07/foo/")
    b = gap.normalize_url("http://pressthink.org/2010/07/foo")
    assert a == b == "pressthink.org/2010/07/foo"


def test_tokenize_strips_pressthink_prefix_quotes_and_stopwords():
    tokens = gap.tokenize('PressThink: "Objectivity as a Form of Persuasion"')
    assert tokens == frozenset({"objectivity", "form", "persuasion"})
    # one-character tokens and stopwords are dropped
    assert "a" not in tokens
    assert "as" not in tokens


def test_parse_modern_post_url_extracts_year_month_slug():
    assert gap.parse_modern_post_url("https://pressthink.org/2010/07/the-slug/") == (
        2010,
        7,
        "the-slug",
    )
    # the homepage has no dated path
    assert gap.parse_modern_post_url("https://pressthink.org/") is None


def test_parse_modern_post_url_handles_day_based_urls():
    # Day-based modern URLs (/YYYY/MM/DD/slug/) must parse as posts too; the day
    # is ignored so the result is still (year, month, slug). Before #393 they
    # failed the matcher, fell into the non_post bucket, and deflated the post
    # denominator.
    assert gap.parse_modern_post_url(
        "https://pressthink.org/2010/07/07/objectivity-as-persuasion/"
    ) == (2010, 7, "objectivity-as-persuasion")
    # a numeric-prefixed slug is not mistaken for a day segment: the day pattern
    # requires the two digits to be followed by a slash, which "99-problems" is not
    assert gap.parse_modern_post_url("https://pressthink.org/2010/07/99-problems/") == (
        2010,
        7,
        "99-problems",
    )


def test_exact_url_match_when_archive_holds_modern_url():
    rows = [
        _record(
            "RECORD-1",
            "Asymmetry Between the Major Parties",
            "https://pressthink.org/2016/09/asymmetry/",
            "2016-09-12",
        )
    ]
    index = gap.build_index(rows)
    res = gap.classify_post("https://pressthink.org/2016/09/asymmetry/", index)
    assert res["tier"] == "exact_url"
    assert res["matched_id"] == "RECORD-1"


def test_legacy_record_matches_modern_sitemap_url_by_title_same_month():
    # The crux: legacy Movable Type URL, different slug, same year+month.
    rows = [
        _record(
            "RECORD-00376",
            'PressThink: "Objectivity as a Form of Persuasion: A Few Notes for Marcus Brauchli"',
            "http://archive.pressthink.org/2010/07/07/obj_persuasion_p.html",
            "2010-07-07",
        )
    ]
    index = gap.build_index(rows)
    res = gap.classify_post(
        "https://pressthink.org/2010/07/objectivity-as-a-form-of-persuasion-a-few-notes-for-marcus-brauchli/",
        index,
    )
    assert res["tier"] == "title_strong"
    assert res["matched_id"] == "RECORD-00376"


def test_gap_when_month_has_no_archive_record():
    rows = [
        _record(
            "RECORD-1",
            "Something From 2010",
            "http://archive.pressthink.org/2010/01/01/x_p.html",
            "2010-01-01",
        )
    ]
    index = gap.build_index(rows)
    res = gap.classify_post(
        "https://pressthink.org/2026/04/subscribers-buy-a-product-members-join-the-cause/",
        index,
    )
    assert res["tier"] == "gap"
    assert res["matched_id"] is None


def test_different_post_same_month_is_a_gap_not_a_false_match():
    # Same year+month, genuinely different post: must NOT be confirmed present.
    rows = [
        _record(
            "RECORD-1",
            "Old Testament and New Testament Journalism",
            "http://archive.pressthink.org/2013/11/20/ot_nt_p.html",
            "2013-11-20",
        )
    ]
    index = gap.build_index(rows)
    res = gap.classify_post("https://pressthink.org/2013/11/newco/", index)
    assert res["tier"] == "gap"


def test_weak_same_month_overlap_is_flagged_for_review():
    rows = [
        _record(
            "RECORD-1",
            "If Bloggers Had No Ethics Blogging Would Have Failed",
            "http://archive.pressthink.org/2008/09/01/bloggers_p.html",
            "2008-09-01",
        )
    ]
    index = gap.build_index(rows)
    res = gap.classify_post(
        "https://pressthink.org/2008/09/if-bloggers-had-no-ethics-blogging-would-have-failed-but-it-didnt-so-lets-get-a-clue/",
        index,
    )
    assert res["tier"] == "review"


def test_strong_title_match_in_other_month_same_year_is_review_not_gap():
    # WordPress migration can shift a post's month; a strong title match in a
    # different month of the same year is surfaced for review, never confirmed.
    rows = [
        _record(
            "RECORD-1",
            "The Citizens Agenda in Campaign Coverage",
            "http://archive.pressthink.org/2010/08/20/citizens_agenda_p.html",
            "2010-08-20",
        )
    ]
    index = gap.build_index(rows)
    res = gap.classify_post(
        "https://pressthink.org/2010/12/the-citizens-agenda-in-campaign-coverage/",
        index,
    )
    assert res["tier"] == "review"
    assert "not 2010-12" in res["note"]
    assert res["matched_id"] == "RECORD-1"


def test_strong_jaccard_cross_month_match_is_review_not_gap():
    # A cross-month match that is strong by Jaccard but NOT full containment
    # must be surfaced for review, matching how the same-month branch treats it.
    # The slug carries one token ("today") the archived title lacks, so
    # containment is false; overlap is 7/8 = 0.875, above STRONG_JACCARD. The
    # old code checked only containment here and would have called this a gap.
    rows = [
        _record(
            "RECORD-1",
            "Watchdog Press Confronts Hostile White House Pressroom",
            "http://archive.pressthink.org/2010/03/15/watchdog_p.html",
            "2010-03-15",
        )
    ]
    index = gap.build_index(rows)
    res = gap.classify_post(
        "https://pressthink.org/2010/09/watchdog-press-confronts-hostile-white-house-pressroom-today/",
        index,
    )
    assert res["tier"] == "review"
    assert res["matched_id"] == "RECORD-1"
    assert "not 2010-09" in res["note"]


def test_homepage_is_classified_non_post():
    index = gap.build_index([])
    res = gap.classify_post("https://pressthink.org/", index)
    assert res["tier"] == "non_post"


def test_build_report_counts_and_summary():
    rows = [
        _record(
            "RECORD-1",
            "Asymmetry",
            "https://pressthink.org/2016/09/asymmetry/",
            "2016-09-12",
        ),
    ]
    sitemap = [
        "https://pressthink.org/",  # non_post
        "https://pressthink.org/2016/09/asymmetry/",  # exact_url
        "https://pressthink.org/2026/04/brand-new-post/",  # gap
    ]
    report = gap.build_report(sitemap, rows)
    assert report["sitemap_post_count"] == 2  # homepage excluded
    assert report["archive_record_count"] == 1
    assert report["counts"]["exact_url"] == 1
    assert report["counts"]["gap"] == 1
    assert report["summary"]["confirmed_present"] == 1
    assert report["summary"]["candidate_gaps"] == 1


def test_archive_record_count_counts_only_datable_records():
    # The "X of N records" framing rests on this denominator. It counts records
    # that landed in a year/month bucket, i.e. records with a parseable date in
    # publication_date OR the URL. A row with neither must be excluded, so the
    # denominator means "datable records" explicitly, not "all rows" by accident.
    rows = [
        _record(
            "RECORD-1",
            "Datable",
            "http://archive.pressthink.org/2010/03/15/x_p.html",
            "2010-03-15",
        ),
        _record("RECORD-2", "Undatable", "https://example.com/no-date-here", ""),
    ]
    report = gap.build_report([], rows)
    assert report["archive_record_count"] == 1
