# Preservation pilot sample

Schema `preservation-sample/1.0.0`. Seed `rosen-preservation-pilot-v1`. Sample size 100.

Input commit: `abfd3f754762c7f78054b9bd1df24e5f13b2de69` (input files clean), stewardship census `stewardship-census/1.0.0`.

This file is a human-readable summary. The versioned manifest is `preservation-sample.json`.
Only `sources` there is meant for the blind pilot worker — `selection` (and the tables below) are for curator review.

## Credential policy

The pilot worker must never supply login credentials, a paid subscription, a session cookie, or any other access-control circumvention to fetch a source. A paywalled, login-gated, or bot-walled response (for example, from a newspapers.com clipping) is a valid, recorded failure for that source — not a signal to authenticate or work around the wall.

## Coverage

| Stratum | Group | Target | Selected | Shortfall |
| --- | --- | --- | --- | --- |
| platform_pressthink_longform | platform | 8 | 8 | 0 |
| platform_newspaper_clipping | platform | 3 | 3 | 0 |
| platform_tumblr | platform | 5 | 5 | 0 |
| platform_thread | platform | 3 | 3 | 0 |
| platform_twitter_x | platform | 8 | 8 | 0 |
| platform_bluesky | platform | 6 | 6 | 0 |
| platform_mastodon | platform | 5 | 5 | 0 |
| url_missing | url_status | 3 | 3 | 0 |
| url_known_difficult | url_status | 5 | 5 | 0 |
| url_redirector | url_status | 3 | 3 | 0 |
| verification_unverified | verification | 4 | 4 | 0 |
| text_missing_raw_text | raw_text | 4 | 4 | 0 |
| graph_has_links | graph_links | 4 | 4 | 0 |
| notable_high_value | notable | 3 | 3 | 0 |
| notable_at_risk | notable | 3 | 3 | 0 |
| page_pdf | page_type | 3 | 3 | 0 |
| page_media | page_type | 3 | 3 | 0 |
| page_dynamic | page_type | 2 | 2 | 0 |
| page_static | page_type | 2 | 2 | 0 |
| random_seed_slice | random | 23 | 23 | 0 |

Random component: 23 of 100 (23%).

## By source

| Source | Count |
| --- | --- |
| curated | 48 |
| social | 52 |

## By platform

| Platform group | Count |
| --- | --- |
| bluesky | 18 |
| mastodon | 6 |
| newspaper_clipping | 7 |
| pressthink_longform | 29 |
| thread | 3 |
| tumblr | 9 |
| twitter_x | 28 |

## By URL status

| URL status | Count |
| --- | --- |
| known_difficult | 19 |
| likely_live | 64 |
| missing | 7 |
| redirector | 10 |

## By page type

| Page type | Count |
| --- | --- |
| dynamic | 52 |
| media | 6 |
| pdf | 7 |
| redirect | 9 |
| static | 26 |

