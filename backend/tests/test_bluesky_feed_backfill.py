import datetime
import sys

import pytest

from scripts import bluesky_feed_backfill as backfill


JAY_DID = "did:plc:3t37x6vfigdzzp2gjcfnzlz4"


class _Response:
    def raise_for_status(self):
        return None

    def json(self):
        return {"feed": [], "cursor": None}


def _feed_item(
    rkey,
    created_at,
    text,
    *,
    reply_to="",
    reason=None,
    author_handle=None,
    author_did=JAY_DID,
    uri_did=JAY_DID,
):
    record = {"text": text, "createdAt": created_at}
    if reply_to:
        record["reply"] = {
            "parent": {"uri": reply_to},
            "root": {"uri": reply_to},
        }

    item = {
        "post": {
            "uri": f"at://{uri_did}/app.bsky.feed.post/{rkey}",
            "author": {
                "did": author_did,
                "handle": author_handle or backfill.ACTOR,
            },
            "record": record,
            "likeCount": 1,
            "repostCount": 2,
            "replyCount": 3,
        }
    }
    if reason is not None:
        item["reason"] = reason
    return item


def test_fetch_page_requests_replies_in_threads_started_by_other_people(monkeypatch):
    captured = {}

    def fake_get(url, *, params, headers, timeout):
        captured.update({
            "url": url,
            "params": params,
            "headers": headers,
            "timeout": timeout,
        })
        return _Response()

    monkeypatch.setattr(backfill.requests, "get", fake_get)

    backfill.fetch_page("next-page")

    assert captured["params"]["filter"] == "posts_with_replies"
    assert captured["params"]["cursor"] == "next-page"


def test_parse_since_treats_a_calendar_date_as_utc_midnight():
    assert backfill.parse_since("2026-06-18") == datetime.datetime(
        2026, 6, 18, tzinfo=datetime.timezone.utc
    )


def test_derive_title_skips_leading_punctuation_and_handle_mentions():
    text = (
        "...@scripting.com Hi, Dave. "
        "I have something I want to dedicate to you."
    )

    assert backfill.derive_title(text) == "Hi, Dave..."


def test_collect_new_rows_honors_since_and_assigns_ids_oldest_first():
    pages = iter([
        {
            "feed": [
                _feed_item(
                    "newest",
                    "2026-08-14T20:00:00.000Z",
                    "Newest substantive post.",
                ),
                _feed_item(
                    "older",
                    "2026-06-19T12:00:00.000Z",
                    "Older substantive reply.",
                    reply_to=(
                        "at://did:plc:other/app.bsky.feed.post/parent"
                    ),
                ),
            ],
            "cursor": "page-2",
        },
        {
            "feed": [
                _feed_item(
                    "beforewindow",
                    "2026-06-17T23:59:59.000Z",
                    "This post is already outside the sweep window.",
                )
            ],
            "cursor": None,
        },
    ])

    result = backfill.collect_new_rows(
        existing_urls=set(),
        max_id=3172,
        since=backfill.parse_since("2026-06-18"),
        today="2026-08-15 12:00:00",
        fetch_page_fn=lambda cursor: next(pages),
        sleep_fn=lambda _seconds: None,
    )

    assert [row["id"] for row in result.rows] == [
        "BSKY-03173",
        "BSKY-03174",
    ]
    assert [row["url"].rsplit("/", 1)[-1] for row in result.rows] == [
        "older",
        "newest",
    ]
    assert result.rows[0]["responds_to"].endswith("/parent")
    assert result.skipped_before_since == 1
    assert result.complete is True
    assert result.pages == 2


def test_collect_new_rows_skips_repost_dates_before_testing_the_window():
    page = {
        "feed": [
            _feed_item(
                "newest",
                "2026-08-14T20:00:00.000Z",
                "Newest substantive post.",
            ),
            _feed_item(
                "old-repost",
                "2020-01-01T00:00:00.000Z",
                "Someone else's old post.",
                reason={"$type": "app.bsky.feed.defs#reasonRepost"},
                author_handle="someone-else.example",
            ),
            _feed_item(
                "olderinwindow",
                "2026-06-19T12:00:00.000Z",
                "Older substantive post in the requested window.",
            ),
        ],
        "cursor": None,
    }

    result = backfill.collect_new_rows(
        existing_urls=set(),
        max_id=3172,
        since=backfill.parse_since("2026-06-18"),
        today="2026-08-15 12:00:00",
        fetch_page_fn=lambda _cursor: page,
        sleep_fn=lambda _seconds: None,
    )

    assert [row["url"].rsplit("/", 1)[-1] for row in result.rows] == [
        "olderinwindow",
        "newest",
    ]
    assert result.skipped_repost == 1
    assert result.skipped_before_since == 0
    assert result.complete is True


def test_collect_new_rows_uses_stable_did_instead_of_current_handle():
    page = {
        "feed": [
            _feed_item(
                "renamed",
                "2026-08-14T20:00:00.000Z",
                "Jay post after a handle change.",
                author_handle="renamed.example",
            ),
            _feed_item(
                "impostor",
                "2026-08-13T20:00:00.000Z",
                "A mismatched author must not enter the archive.",
                author_did="did:plc:someoneelse",
                uri_did="did:plc:someoneelse",
            ),
        ],
        "cursor": None,
    }

    result = backfill.collect_new_rows(
        existing_urls=set(),
        max_id=3172,
        since=backfill.parse_since("2026-06-18"),
        today="2026-08-15 12:00:00",
        fetch_page_fn=lambda _cursor: page,
        sleep_fn=lambda _seconds: None,
    )

    assert [row["url"].rsplit("/", 1)[-1] for row in result.rows] == [
        "renamed"
    ]
    assert result.skipped_wrong_author == 1


def test_collect_new_rows_samples_oldest_posts_to_preserve_future_id_order():
    page = {
        "feed": [
            _feed_item("newest", "2026-08-14T20:00:00.000Z", "Newest."),
            _feed_item("middle", "2026-07-14T20:00:00.000Z", "Middle."),
            _feed_item("oldest", "2026-06-19T20:00:00.000Z", "Oldest."),
        ],
        "cursor": None,
    }

    result = backfill.collect_new_rows(
        existing_urls=set(),
        max_id=3172,
        since=backfill.parse_since("2026-06-18"),
        today="2026-08-15 12:00:00",
        fetch_page_fn=lambda _cursor: page,
        sleep_fn=lambda _seconds: None,
        sample=2,
    )

    assert [row["url"].rsplit("/", 1)[-1] for row in result.rows] == [
        "oldest",
        "middle",
    ]


def test_collect_new_rows_rejects_nonpositive_samples():
    with pytest.raises(ValueError, match="sample must be at least 1"):
        backfill.collect_new_rows(
            existing_urls=set(),
            max_id=3172,
            since=backfill.parse_since("2026-06-18"),
            today="2026-08-15 12:00:00",
            sample=0,
        )


def test_collect_new_rows_includes_exact_utc_midnight_and_normalizes_date():
    page = {
        "feed": [
            _feed_item(
                "exactmidnight",
                "2026-06-18T02:00:00+02:00",
                "This post lands exactly on UTC midnight.",
            ),
            _feed_item(
                "beforemidnight",
                "2026-06-17T23:59:59Z",
                "This post is one second before the window.",
            ),
        ],
        "cursor": None,
    }

    result = backfill.collect_new_rows(
        existing_urls=set(),
        max_id=3172,
        since=backfill.parse_since("2026-06-18"),
        today="2026-08-15 12:00:00",
        fetch_page_fn=lambda _cursor: page,
        sleep_fn=lambda _seconds: None,
    )

    assert [row["id"] for row in result.rows] == ["BSKY-03173"]
    assert result.rows[0]["publication_date"] == "2026-06-18 00:00:00"
    assert result.skipped_before_since == 1


def test_collect_new_rows_follows_cursor_after_an_empty_page():
    pages = iter([
        {"feed": [], "cursor": "after-empty"},
        {
            "feed": [
                _feed_item(
                    "afterempty",
                    "2026-07-01T12:00:00Z",
                    "A later page must not be dropped.",
                )
            ],
            "cursor": None,
        },
    ])

    result = backfill.collect_new_rows(
        existing_urls=set(),
        max_id=3172,
        since=backfill.parse_since("2026-06-18"),
        today="2026-08-15 12:00:00",
        fetch_page_fn=lambda _cursor: next(pages),
        sleep_fn=lambda _seconds: None,
    )

    assert [row["url"].rsplit("/", 1)[-1] for row in result.rows] == [
        "afterempty"
    ]
    assert result.pages == 2
    assert result.complete is True


def test_collect_new_rows_keeps_pinned_original_posts():
    page = {
        "feed": [
            _feed_item(
                "pinned",
                "2026-07-01T12:00:00Z",
                "This pinned post is still Jay's original work.",
                reason={"$type": "app.bsky.feed.defs#reasonPin"},
            )
        ],
        "cursor": None,
    }

    result = backfill.collect_new_rows(
        existing_urls=set(),
        max_id=3172,
        since=backfill.parse_since("2026-06-18"),
        today="2026-08-15 12:00:00",
        fetch_page_fn=lambda _cursor: page,
        sleep_fn=lambda _seconds: None,
    )

    assert [row["url"].rsplit("/", 1)[-1] for row in result.rows] == [
        "pinned"
    ]
    assert result.skipped_repost == 0


def test_collect_new_rows_does_not_stop_at_one_out_of_order_old_item():
    page = {
        "feed": [
            _feed_item(
                "oldclientdate",
                "2020-01-01T00:00:00Z",
                "A client supplied an old timestamp.",
            ),
            _feed_item(
                "stillinwindow",
                "2026-07-01T12:00:00Z",
                "This later item is still in the requested window.",
            ),
        ],
        "cursor": None,
    }

    result = backfill.collect_new_rows(
        existing_urls=set(),
        max_id=3172,
        since=backfill.parse_since("2026-06-18"),
        today="2026-08-15 12:00:00",
        fetch_page_fn=lambda _cursor: page,
        sleep_fn=lambda _seconds: None,
    )

    assert [row["url"].rsplit("/", 1)[-1] for row in result.rows] == [
        "stillinwindow"
    ]
    assert result.skipped_before_since == 1


@pytest.mark.parametrize(
    "bad_item",
    [
        "not-a-feed-item",
        _feed_item(
            "baduri",
            "2026-07-01T12:00:00Z",
            "Bad URI.",
            uri_did="",
        ),
        _feed_item(
            "badparent",
            "2026-07-01T12:00:00Z",
            "Bad parent URI.",
            reply_to="not-an-at-uri",
        ),
    ],
)
def test_collect_new_rows_fails_closed_on_malformed_items(bad_item):
    result = backfill.collect_new_rows(
        existing_urls=set(),
        max_id=3172,
        since=backfill.parse_since("2026-06-18"),
        today="2026-08-15 12:00:00",
        fetch_page_fn=lambda _cursor: {"feed": [bad_item], "cursor": None},
        sleep_fn=lambda _seconds: None,
    )

    assert result.complete is False
    assert result.rows == []
    assert result.failure_reason


def test_collect_new_rows_fails_closed_on_cursor_replay():
    calls = []

    def replaying_fetch(cursor):
        calls.append(cursor)
        return {"feed": [], "cursor": "repeated"}

    result = backfill.collect_new_rows(
        existing_urls=set(),
        max_id=3172,
        since=backfill.parse_since("2026-06-18"),
        today="2026-08-15 12:00:00",
        fetch_page_fn=replaying_fetch,
        sleep_fn=lambda _seconds: None,
        max_pages=10,
    )

    assert calls == [None, "repeated"]
    assert result.complete is False
    assert result.rows == []
    assert "cursor" in result.failure_reason.lower()


def test_collect_new_rows_fails_closed_at_page_cap_without_assigning_ids():
    def endless_fetch(cursor):
        page_number = 1 if cursor is None else int(cursor)
        return {
            "feed": [
                _feed_item(
                    f"post{page_number}",
                    "2026-07-01T12:00:00Z",
                    f"Candidate from page {page_number}.",
                )
            ],
            "cursor": str(page_number + 1),
        }

    result = backfill.collect_new_rows(
        existing_urls=set(),
        max_id=3172,
        since=backfill.parse_since("2026-06-18"),
        today="2026-08-15 12:00:00",
        fetch_page_fn=endless_fetch,
        sleep_fn=lambda _seconds: None,
        max_pages=2,
    )

    assert result.pages == 2
    assert result.complete is False
    assert result.rows == []
    assert "page cap" in result.failure_reason.lower()


def test_collect_new_rows_deduplicates_existing_did_profile_url():
    page = {
        "feed": [
            _feed_item(
                "samepost",
                "2026-07-01T12:00:00Z",
                "This post already exists under its stable DID URL.",
            )
        ],
        "cursor": None,
    }

    result = backfill.collect_new_rows(
        existing_urls={
            f"https://bsky.app/profile/{JAY_DID}/post/samepost"
        },
        max_id=3172,
        since=backfill.parse_since("2026-06-18"),
        today="2026-08-15 12:00:00",
        fetch_page_fn=lambda _cursor: page,
        sleep_fn=lambda _seconds: None,
    )

    assert result.rows == []
    assert result.skipped_existing == 1
    assert result.complete is True


def test_load_existing_urls_preserves_urls_and_stable_identity(tmp_path):
    csv_path = tmp_path / "social_posts.csv"
    csv_path.write_text(
        "id,url\n"
        "BSKY-00009,https://bsky.app/profile/jayrosen.bsky.social/post/shared\n"
        f"BSKY-00010,https://bsky.app/profile/{JAY_DID}/post/shared\n",
        encoding="utf-8",
    )

    urls, max_id = backfill.load_existing_urls(csv_path)

    assert len(urls) == 2
    assert max_id == 10
    assert backfill._existing_post_identities(urls) == {(JAY_DID, "shared")}


def test_main_never_opens_write_path_for_an_incomplete_walk(
    monkeypatch,
    tmp_path,
):
    csv_path = tmp_path / "social_posts.csv"
    csv_path.write_text("id,url\n", encoding="utf-8")
    monkeypatch.setattr(backfill, "SOCIAL_POSTS_CSV", csv_path)
    monkeypatch.setattr(
        backfill,
        "collect_new_rows",
        lambda **_kwargs: backfill.CollectionResult(
            rows=[],
            pages=2,
            complete=False,
            failure_reason="page cap reached",
        ),
    )
    monkeypatch.setattr(
        backfill,
        "atomic_csv_write",
        lambda _path: pytest.fail("write path opened for incomplete walk"),
    )
    monkeypatch.setattr(
        sys,
        "argv",
        [
            "bluesky_feed_backfill.py",
            "--since",
            "2026-06-18",
            "--all",
        ],
    )

    with pytest.raises(SystemExit, match="No rows written"):
        backfill.main()
