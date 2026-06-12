"""DOM-aware article recovery via Playwright (Firefox headless).

Complements `firecrawl_scrape.py` for sites where Firecrawl's page-to-markdown
extraction fails — typically because modern nav/footer chrome floods the
output. Example failure mode the existing pipeline hits:

    "HuffPost legacy URLs return 90k chars of modern nav chrome,
     not the article."  (from firecrawl_scrape.py docstring)

DOM-aware extraction sidesteps this by selecting `article p` directly and
filtering known nav noise, instead of running the whole page through an
HTML-to-markdown converter.

Strategy:
  1. Try the live URL with Playwright Firefox (headless, viewport 1280x1800).
  2. Use site-specific selectors when registered; fall back to generic
     `h1` + `article p` + first `<time>`.
  3. If body length < MIN_OK_LEN, mark recovery as inconclusive and try
     Wayback closest snapshot to publication_date as a second pass.
  4. Emit structured JSON: title, author, date, body_text, source flag,
     and (when used) the Wayback snapshot URL.

Verified 2026-05-26 against `https://www.huffpost.com/entry/the-production-of-innocen_b_3560`
(see jamditis/rosen-frontend#209). Live URL returned 29 paragraphs / 10170 chars
where Firecrawl returned ~90k chars of nav chrome.

Usage (from the backend/ directory):
    poetry run python scripts/recover_articles_playwright.py --url <URL>
    poetry run python scripts/recover_articles_playwright.py --huffpost-gap ../data/_recovery_tmp/huffpost_gap.json --limit 5
"""

from __future__ import annotations
import argparse
import json
import re
import sys
import time
import urllib.parse
import urllib.request
from pathlib import Path

from playwright.sync_api import sync_playwright

# Lay the package roots on sys.path so the script is runnable both via
# `python backend/scripts/recover_articles_playwright.py` and via a
# `cd backend && python scripts/...` invocation, mirroring process_submission.py.
_BACKEND = Path(__file__).resolve().parents[1]
for _candidate in (_BACKEND, _BACKEND / "src"):
    if str(_candidate) not in sys.path:
        sys.path.insert(0, str(_candidate))

from rosen_scraper.url_safety import is_safe_public_url  # noqa: E402


MIN_OK_LEN = 500
USER_AGENT = "rosen-archive-recovery/1.0 (+https://github.com/jamditis/rosen-frontend)"

NAV_NOISE_PREFIXES = (
    "Skip to",
    "Power Our",
    "SUPPORT THE",
    "Log In",
    "Sign Up",
    "Subscribe",
    "Share this",
    "Share on",
    "© ",
    "Privacy Policy",
    "Terms of Service",
    "Already a member",
    "We Demand",
    "DEMAND THE TRUTH",
    "Click here",
    "BREAKING",
    "Advertisement",
    "Read More",
    "MORE FROM",
    "Follow us",
    "Cookie",
)


def looks_like_body(t: str) -> bool:
    if len(t) < 40:
        return False
    if any(t.startswith(p) for p in NAV_NOISE_PREFIXES):
        return False
    return True


# Site-specific selector overrides. Add entries as new failure modes are
# diagnosed and verified. The default ('generic') extractor below works for
# anything semantic; overrides exist only when the generic path is wrong.
SITE_OVERRIDES = {
    "huffpost.com": {
        "title": "h1",
        "paragraphs": "article p",
        "time": "time",
        "author_regex": r"By\s+([A-Z][a-zA-Z]+\s+[A-Z][a-zA-Z]+)",
        "provenance_signal": (
            "This post was published on the now-closed HuffPost Contributor platform"
        ),
    },
}


def pick_overrides(url: str) -> dict:
    # removeprefix, not lstrip — lstrip("www.") strips any leading char in
    # the set {'w', '.'} and corrupts hosts like "www.weather.com" to
    # "eather.com".
    host = urllib.parse.urlparse(url).netloc.lower().removeprefix("www.")
    for domain, cfg in SITE_OVERRIDES.items():
        # Exact match or proper subdomain match. `domain in host` would
        # treat "not-huffpost.com" as a match for "huffpost.com".
        if host == domain or host.endswith("." + domain):
            return cfg
    return {}


def extract_article(page, url: str) -> dict:
    overrides = pick_overrides(url)
    title_sel = overrides.get("title", "h1")
    para_sel = overrides.get("paragraphs", "article p, main p")
    time_sel = overrides.get("time", "time")
    author_re = overrides.get("author_regex", r"By\s+([A-Z][a-zA-Z]+\s+[A-Z][a-zA-Z]+)")
    provenance_signal = overrides.get("provenance_signal")

    title = ""
    title_el = page.locator(title_sel).first
    if title_el.count() > 0:
        title = title_el.inner_text().strip()

    date = ""
    time_el = page.locator(time_sel).first
    if time_el.count() > 0:
        date = time_el.inner_text().strip()

    raw_paras = [el.inner_text().strip() for el in page.locator(para_sel).all()]
    body_paras = [t for t in raw_paras if looks_like_body(t)]
    body_text = "\n\n".join(body_paras)

    body_full = page.inner_text("body")
    author = ""
    m = re.search(author_re, body_full)
    if m:
        author = m.group(1)

    provenance = ""
    if provenance_signal and provenance_signal in body_full:
        provenance = provenance_signal

    return {
        "title": title,
        "author": author,
        "date": date,
        "body_paragraph_count": len(body_paras),
        "body_char_count": len(body_text),
        "body_text": body_text,
        "provenance_signal": provenance,
    }


def wayback_closest(url: str, yyyymmdd: str | None) -> str | None:
    api = f"https://archive.org/wayback/available?url={urllib.parse.quote(url)}"
    if yyyymmdd:
        api += f"&timestamp={yyyymmdd}"
    try:
        req = urllib.request.Request(api, headers={"User-Agent": USER_AGENT})
        with urllib.request.urlopen(req, timeout=30) as resp:
            data = json.loads(resp.read())
        snap = data.get("archived_snapshots", {}).get("closest", {})
        return snap.get("url") if snap.get("available") else None
    except Exception:
        return None


def _block_unsafe_request(route, request) -> None:
    """Playwright route handler that aborts http(s) requests to non-public hosts.

    The pre-navigation check in recover() only sees the initial URL; a redirect
    or a subresource can still reach a private/loopback/link-local host. This
    re-checks every request at fire time and aborts the unsafe ones, covering
    redirects and subresources the entry check can't.

    Only http/https are SSRF-checked. data:, blob:, and about: carry no network
    request to an internal host, so they pass through — aborting them would
    break rendering of pages with inline images or fonts (is_safe_public_url
    rejects every non-http scheme outright, so they must be excluded here).
    """
    scheme = urllib.parse.urlparse(request.url).scheme.lower()
    if scheme in ("http", "https"):
        ok, _reason = is_safe_public_url(request.url)
        if not ok:
            route.abort()
            return
    route.continue_()


def recover(page, url: str, fallback_timestamp: str | None = None) -> dict:
    """Try live URL first; on short body or HTTP error, try Wayback snapshot."""
    result = {
        "input_url": url,
        "source": "live",
        "live_url_status": None,
        "wayback_url": None,
        "error": None,
    }

    # SSRF guard: never navigate to a private/loopback/link-local target. The
    # URL can come from an operator-supplied --url or an untrusted gap JSON
    # file, and recovery runs on a host with internal services on localhost and
    # Tailscale (#287). Reject before launching any navigation.
    safe, reason = is_safe_public_url(url)
    if not safe:
        result["source"] = "rejected"
        result["error"] = f"unsafe target: {reason}"
        return result

    try:
        resp = page.goto(url, wait_until="domcontentloaded", timeout=45000)
        result["live_url_status"] = resp.status if resp else None
        page.wait_for_timeout(2500)
        extracted = extract_article(page, url)
        result.update(extracted)
        if extracted["body_char_count"] >= MIN_OK_LEN:
            return result
        result["error"] = f"live body too short ({extracted['body_char_count']} chars)"
    except Exception as e:
        result["error"] = f"live navigation failed: {e}"

    wb = wayback_closest(url, fallback_timestamp)
    if not wb:
        result["source"] = "neither"
        return result
    # The Wayback URL is normally archive.org, but it comes back from an
    # external API and feeds another page.goto — re-validate before navigating.
    wb_safe, wb_reason = is_safe_public_url(wb)
    if not wb_safe:
        result["source"] = "neither"
        result["error"] = f"unsafe wayback target: {wb_reason}"
        return result
    try:
        resp = page.goto(wb, wait_until="domcontentloaded", timeout=60000)
        page.wait_for_timeout(2500)
        extracted = extract_article(page, url)  # use original URL's overrides
        result.update(extracted)
        result["wayback_url"] = wb
        # Mirror the live-path length check — Wayback can also return a stub.
        if extracted["body_char_count"] >= MIN_OK_LEN:
            result["source"] = "wayback"
            result["error"] = None
        else:
            result["source"] = "neither"
            result["error"] = (
                f"both live and wayback bodies too short "
                f"(wayback {extracted['body_char_count']} chars)"
            )
    except Exception as e:
        result["error"] = f"wayback navigation failed: {e}"
    return result


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--url", help="Single URL to recover")
    ap.add_argument("--huffpost-gap", help="Path to huffpost_gap.json for bulk run")
    ap.add_argument(
        "--limit", type=int, default=0, help="Limit bulk run count (0 = all)"
    )
    ap.add_argument("--output", choices=["json", "text"], default="json")
    args = ap.parse_args()

    if not args.url and not args.huffpost_gap:
        ap.error("Provide --url or --huffpost-gap")

    targets = []
    if args.url:
        targets.append({"url": args.url, "timestamp": None})
    if args.huffpost_gap:
        data = json.loads(Path(args.huffpost_gap).read_text())
        for post in data.get("missing_posts", []):
            targets.append(
                {
                    "url": post["modern_url"],
                    "timestamp": post.get("earliest_ts"),
                    "post_id": post.get("post_id"),
                }
            )
    if args.limit:
        targets = targets[: args.limit]

    results = []
    with sync_playwright() as p:
        browser = p.firefox.launch(headless=True)
        ctx = browser.new_context(
            viewport={"width": 1280, "height": 1800}, user_agent=USER_AGENT
        )
        page = ctx.new_page()
        # Abort any redirect or subresource that resolves to a non-public host,
        # covering the navigation paths the per-URL entry check can't see (#287).
        page.route("**/*", _block_unsafe_request)
        for i, t in enumerate(targets, 1):
            print(f"[{i}/{len(targets)}] {t['url']}", file=sys.stderr)
            r = recover(page, t["url"], t.get("timestamp"))
            if "post_id" in t:
                r["post_id"] = t["post_id"]
            results.append(r)
            time.sleep(1)  # polite throttle for bulk
        browser.close()

    if args.output == "json":
        print(json.dumps(results, ensure_ascii=False, indent=2))
    else:
        for r in results:
            print(f"== {r.get('title', '?')} ({r.get('source')}) ==")
            print(f"  url: {r['input_url']}")
            print(f"  author: {r.get('author', '')}")
            print(f"  date: {r.get('date', '')}")
            print(
                f"  body: {r.get('body_char_count', 0)} chars / {r.get('body_paragraph_count', 0)} paragraphs"
            )
            if r.get("error"):
                print(f"  error: {r['error']}")
            if r.get("wayback_url"):
                print(f"  wayback: {r['wayback_url']}")
            print()

    return 0 if all(r.get("body_char_count", 0) >= MIN_OK_LEN for r in results) else 1


if __name__ == "__main__":
    sys.exit(main())
