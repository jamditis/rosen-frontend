"""PressThink API and byte-preserving CSV contracts; network is the only fake."""

import csv
import io
import json

import pytest

from scripts import pressthink_batch_update as batch


def post(post_id=10903, *, body="<p>Journalism should show its work.</p>"):
    # Shape and source identity from the public WordPress v2 response reported
    # during recovery. The body is synthetic, not a quotation from the article.
    return {
        "id": post_id,
        "link": f"https://pressthink.org/2017/12/article-{post_id}/",
        "status": "publish",
        "type": "post",
        "date_gmt": "2017-12-01T14:00:00",
        "modified_gmt": "2017-12-02T14:00:00",
        "title": {"rendered": "Show work &amp; trust"},
        "content": {"rendered": body, "protected": False},
        "yoast_head_json": {"author": "Jay Rosen"},
    }


def test_full_pagination_and_missing_final_page():
    calls = []

    def get(url, *, params=None):
        calls.append((url, params))
        if url == batch.ROBOTS:
            return b"User-agent: *\nDisallow:\n", {}
        page = params["page"]
        payload = [post(i) for i in range(1, 101)] if page == 1 else [post(101)]
        return json.dumps(payload).encode(), {
            "X-WP-Total": "101",
            "X-WP-TotalPages": "2",
        }

    assert len(batch.capture_posts(get)) == 101
    assert [params["page"] for url, params in calls if url == batch.ENDPOINT] == [
        1,
        2,
    ]

    def incomplete(url, *, params=None):
        body, headers = get(url, params=params)
        return (
            (b"[]", headers)
            if params and params["page"] == 2
            else (body, headers)
        )

    with pytest.raises(ValueError, match="Incomplete"):
        batch.capture_posts(incomplete)


@pytest.mark.parametrize(
    "robots",
    [b"User-agent: *\nDisallow: /wp-json/", b"User-agent: Other\nDisallow:"],
)
def test_robots_denial_or_missing_applicable_group_stops_api_reads(robots):
    def get(url, *, params=None):
        assert url == batch.ROBOTS
        return robots, {}

    with pytest.raises(ValueError, match="robots policy"):
        batch.capture_posts(get)


@pytest.mark.parametrize(
    "field,value",
    [("link", "https://example.test/2017/12/article/"), ("status", "private")],
)
def test_rejects_wrong_origin_or_nonpublic_source(field, value):
    item = post()
    item[field] = value
    with pytest.raises(ValueError):
        batch.source_post(item)


def test_source_text_is_literal_and_active_markup_is_removed():
    source = batch.source_post(
        post(body="<p>A &amp; B.</p><script>alert(1)</script><p>C.</p>")
    )
    assert source["title"] == "Show work & trust"
    assert source["text"] == "A & B.\nC."
    assert "<script>" in source["html"]  # Preserve the original separately.


def canonical_fixture(tmp_path):
    source = batch.source_post(post(1))
    row = {
        "id": "RECORD-00001",
        **batch.source_fields(source, "2026-01-01T00:00:00Z"),
    }
    row["summary"] = "Curator's existing summary, with a comma."
    row["notes"] = "Keep this reviewed record."
    columns = list(row)
    output = io.StringIO(newline="")
    writer = csv.DictWriter(output, fieldnames=columns, lineterminator="\r\n")
    writer.writeheader()
    writer.writerow(row)
    path = tmp_path / "archive.csv"
    path.write_bytes(output.getvalue().encode())
    return path, tmp_path / "versions.jsonl"


def test_real_csv_bridge_preserves_curated_bytes_ids_and_prior_source_versions(tmp_path):
    csv_path, history = canonical_fixture(tmp_path)
    before = csv_path.read_bytes()
    kwargs = {"csv_path": csv_path, "history_path": history}
    result = batch.run_batch(posts=[post(1), post(2)], **kwargs)
    assert result["added"] == 1
    assert result["versions_added"] == 2
    assert csv_path.read_bytes().startswith(before)
    columns, rows = batch.read_archive_csv(csv_path)
    assert [row["id"] for row in rows] == ["RECORD-00001", "RECORD-00002"]
    assert rows[0]["summary"] == "Curator's existing summary, with a comma."
    assert rows[1]["raw_text"] == "Journalism should show its work."
    csv_once, history_once = csv_path.read_bytes(), history.read_bytes()
    assert not batch.run_batch(posts=[post(1), post(2)], **kwargs)["changed"]
    assert (csv_path.read_bytes(), history.read_bytes()) == (csv_once, history_once)

    # A later curator edit must survive a source update. Other source-owned
    # fields still refresh, with the prior captured source retained byte for byte.
    rows[1]["summary"] = "A later human summary."
    batch.write_archive_csv(csv_path, columns, rows)
    changed = post(2, body="<p>Updated source text.</p>")
    result = batch.run_batch(posts=[post(1), changed], **kwargs)
    assert result["updated"] == 1
    _, rows = batch.read_archive_csv(csv_path)
    assert rows[1]["id"] == "RECORD-00002"
    assert rows[1]["summary"] == "A later human summary."
    assert rows[1]["raw_text"] == "Updated source text."
    assert history.read_bytes().startswith(history_once)
    entries, heads = batch.load_history(history)
    assert len(entries) == 3
    assert entries[-1]["previous"] == entries[1]["sha256"]
    assert entries[-1]["sha256"] == heads["2"]


def test_dry_run_missing_source_and_other_author_preserve_canonical_rows(tmp_path):
    csv_path, history = canonical_fixture(tmp_path)
    before = csv_path.read_bytes()
    other = post(3)
    other["yoast_head_json"]["author"] = "Guest Author"
    kwargs = {"csv_path": csv_path, "history_path": history}
    result = batch.run_batch(posts=[other], dry_run=True, **kwargs)
    assert not history.exists()
    assert csv_path.read_bytes() == before
    assert result["added"] == 0
    assert result["excluded"] == [{"source_id": 3, "reason": "Author requires review"}]
    batch.run_batch(posts=[post(1)], **kwargs)
    result = batch.run_batch(posts=[other], **kwargs)
    assert result["missing_source_ids"] == ["1"]
    assert csv_path.read_bytes() == before


def test_corrupt_history_aborts_before_csv_changes(tmp_path):
    csv_path, history = canonical_fixture(tmp_path)
    kwargs = {"csv_path": csv_path, "history_path": history}
    batch.run_batch(posts=[post(1)], **kwargs)
    before = csv_path.read_bytes()
    entry = json.loads(history.read_text())
    entry["source"]["title"] = "Corrupted title"
    history.write_text(json.dumps(entry) + "\n")
    with pytest.raises(ValueError, match="hash mismatch"):
        batch.run_batch(posts=[post(1), post(2)], **kwargs)
    assert csv_path.read_bytes() == before
