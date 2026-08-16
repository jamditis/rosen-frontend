import datetime

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
            "cursor": "page-3",
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
    assert result.stopped_at_since is True
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
    assert result.stopped_at_since is False


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
