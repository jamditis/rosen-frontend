"""Finite RSS metadata, source identity and shared durable write contracts."""

import csv
import io
import json
from xml.sax.saxutils import escape

import pytest

from scripts import publisher_feed_batch_update as feed

CJR = "cjr-jay-rosen-author"
SEARCH = "cjr-jay-rosen-search"


def rss(
    *,
    title="A source title about journalism",
    author="Jay Rosen",
    url="https://www.cjr.org/analysis/example.php",
    description="Private full article must not be retained",
):
    return f"""<rss xmlns:dc="http://purl.org/dc/elements/1.1/"><channel><item>
<title>{escape(title)}</title><link>{escape(url)}</link><guid>old-staging-guid</guid>
<dc:creator>{escape(author)}</dc:creator><pubDate>Mon, 29 Dec 2025 09:00:00 -0500</pubDate>
<description>{escape(description)}</description></item></channel></rss>""".encode()


def fixture(tmp_path):
    sources = feed.parse_feed(CJR, rss())
    row = feed.metadata_fields(sources[0], "2026-01-01T00:00:00Z")
    columns = ["id", *row]
    source = tmp_path / "data/archive_records-public.csv"
    source.parent.mkdir()
    out = io.StringIO(newline="")
    csv.DictWriter(out, fieldnames=columns, lineterminator="\r\n").writeheader()
    source.write_bytes(out.getvalue().encode())
    source.with_name("record-id-sequence.json").write_text(
        '{"version":1,"high_water":0}\n'
    )
    return source, tmp_path / "preservation/publisher-feeds/versions.jsonl", sources


def test_capture_requires_robots_and_never_reads_article_bodies():
    calls = []

    def get(url):
        calls.append(url)
        return b"User-agent: *\nDisallow:\n" if url.endswith("robots.txt") else rss()

    captured = feed.capture_feed(CJR, get)
    assert calls == ["https://www.cjr.org/robots.txt", feed.FEEDS[CJR]["url"]]
    assert captured[0]["published_local"] == "2025-12-29T09:00:00-05:00"
    assert "Private full article" not in json.dumps(captured)
    assert not any(k in captured[0] for k in ("description", "html", "text"))
    with pytest.raises(ValueError, match="robots"):
        feed.capture_feed(CJR, lambda _: b"User-agent: *\nDisallow: /")


@pytest.mark.parametrize(
    "body",
    [
        b'<!DOCTYPE rss [<!ENTITY x "expansion">]><rss/>',
        b"<html>login</html>",
        rss(url="https://example.test/item"),
        rss(url="https://www.cjr.org/item?q=1"),
        rss(author=""),
    ],
)
def test_invalid_sources_fail_closed(body):
    with pytest.raises((ValueError, TypeError)):
        feed.parse_feed(CJR, body)


def test_byline_and_about_title_are_separate_relevance_boundaries():
    assert (
        feed.parse_feed(CJR, rss(author="Emily Bell"))[0]["admission_basis"] == "review"
    )
    source = feed.parse_feed(
        SEARCH, rss(title="Jay Rosen on journalism", author="Emily Bell")
    )[0]
    assert source["admission_basis"] == "about_jay"
    assert feed.metadata_fields(source, "2026-01-01")["author"] == "Emily Bell"
    assert feed.parse_feed(SEARCH, rss())[0]["admission_basis"] == "review"


def test_shared_writer_preserves_versions_curator_edits_and_cross_feed_ids(tmp_path):
    csv_path, history, sources = fixture(tmp_path)
    first = feed.run_batch(
        CJR, csv_path=csv_path, history_path=history, sources=sources
    )
    assert first["added"] == first["versions_added"] == 1
    record_id = first["associations"][0]["record_id"]
    columns, rows = feed.archive.read_archive_csv(csv_path)
    assert rows[0]["raw_text"] == ""
    assert rows[0]["word_count"] == ""
    assert "Article text has not been captured" in rows[0]["summary"]
    rows[0]["summary"] = "Curator's protected description"
    feed.archive.write_archive_csv(csv_path, columns, rows)
    changed = [{**sources[0], "title": "Changed source title"}]
    update = feed.run_batch(
        CJR, csv_path=csv_path, history_path=history, sources=changed
    )
    assert update["added"] == 0
    assert update["updated"] == update["versions_added"] == 1
    assert (
        feed.archive.read_archive_csv(csv_path)[1][0]["summary"]
        == "Curator's protected description"
    )
    other = feed.parse_feed(
        SEARCH, rss(title="Jay Rosen on journalism", author="Emily Bell")
    )
    cross = feed.run_batch(
        SEARCH, csv_path=csv_path, history_path=history, sources=other
    )
    assert cross["added"] == 0
    assert cross["associations"][0]["record_id"] == record_id
    assert feed.archive.read_archive_csv(csv_path)[1][0]["author"] == "Jay Rosen"
    assert cross["missing_source_ids"] == []
    before = history.read_bytes()
    again = feed.run_batch(
        SEARCH, csv_path=csv_path, history_path=history, sources=other
    )
    assert not again["changed"]
    assert history.read_bytes() == before
    feed.archive.load_history(history)


def test_retirement_and_syndication_remain_held_across_feeds(tmp_path):
    csv_path, history, sources = fixture(tmp_path)
    first = feed.run_batch(
        CJR, csv_path=csv_path, history_path=history, sources=sources
    )
    columns, rows = feed.archive.read_archive_csv(csv_path)
    other_url = [
        {
            **sources[0],
            "id": SEARCH + ":https://www.cjr.org/other.php",
            "feed_id": SEARCH,
            "url": "https://www.cjr.org/other.php",
            "admission_basis": "about_jay",
        }
    ]
    held = feed.run_batch(
        SEARCH, csv_path=csv_path, history_path=history, sources=other_url
    )
    assert held["added"] == 0
    assert held["excluded"][0]["candidate_record_ids"] == [
        first["associations"][0]["record_id"]
    ]
    feed.archive.write_archive_csv(csv_path, columns, [])
    same_url = [
        {
            **sources[0],
            "id": SEARCH + ":" + sources[0]["url"],
            "feed_id": SEARCH,
            "admission_basis": "about_jay",
        }
    ]
    retired = feed.run_batch(
        SEARCH, csv_path=csv_path, history_path=history, sources=same_url
    )
    assert retired["added"] == 0
    assert retired["retired_record_ids"] == [first["associations"][0]["record_id"]]


def test_dry_run_and_interrupted_transaction_use_existing_recovery(
    tmp_path, monkeypatch
):
    csv_path, history, sources = fixture(tmp_path)
    before = csv_path.read_bytes()
    proposed = feed.run_batch(
        CJR, dry_run=True, csv_path=csv_path, history_path=history, sources=sources
    )
    assert proposed["added"] == 1
    assert not history.exists()
    assert csv_path.read_bytes() == before
    original = feed.archive.transaction.recover
    calls = []

    def interrupted(*args):
        calls.append(1)
        if len(calls) > 1:
            raise RuntimeError("interrupted after durable journal")
        return original(*args)

    monkeypatch.setattr(feed.archive.transaction, "recover", interrupted)
    with pytest.raises(RuntimeError, match="interrupted"):
        feed.run_batch(CJR, csv_path=csv_path, history_path=history, sources=sources)
    assert feed.archive.transaction.journal_path(history).exists()
    with pytest.raises(ValueError, match="pending source"):
        feed.archive.record_id_sequence.reserve(csv_path, [])
    monkeypatch.setattr(feed.archive.transaction, "recover", original)
    recovered = feed.run_batch(
        CJR, csv_path=csv_path, history_path=history, sources=sources
    )
    assert recovered["added"] == 0
    assert len(feed.archive.read_archive_csv(csv_path)[1]) == 1
    assert not feed.archive.transaction.journal_path(history).exists()


def test_managed_publisher_relevance_changes_use_neutral_metadata_and_recover(tmp_path):
    csv_path, history, sources = fixture(tmp_path)
    first = feed.run_batch(
        CJR, csv_path=csv_path, history_path=history, sources=sources
    )
    record_id = first["associations"][0]["record_id"]
    changed = feed.parse_feed(CJR, rss(author="Corrected public byline"))
    review = feed.run_batch(
        CJR, csv_path=csv_path, history_path=history, sources=changed
    )
    assert review["updated"] == 1
    assert review["excluded"][0]["record_id"] == record_id
    assert review["associations"] == []
    row = feed.archive.read_archive_csv(csv_path)[1][0]
    assert row["author"] == "Corrected public byline"
    assert "Relevance requires review" in row["summary"]
    assert "about Jay Rosen" not in row["summary"]
    restored = feed.run_batch(
        CJR, csv_path=csv_path, history_path=history, sources=sources
    )
    assert restored["updated"] == 1
    assert restored["associations"][0]["record_id"] == record_id
    assert feed.archive.read_archive_csv(csv_path)[1][0]["author"] == "Jay Rosen"
