# Stewardship coverage census

Schema: `stewardship-census/1.0.0`

Input commit: `06581e7fbca4d71389907ce832b522d3d3ee8ee9` (input files clean)

## Record reconciliation

| Group | Source | Published source rows | Filtered |
| --- | --- | --- | --- |
| Curated | 1,218 | 1,218 | 0 |
| Social | 30,127 | 25,829 | 4,298 |

Runtime total: 27,057 records, including 9 generated thread containers and 1 injected record.

### Social source and runtime by platform

| Platform | Source | Published source rows |
| --- | --- | --- |
| Bluesky | 3,497 | 2,841 |
| Mastodon | 516 | 481 |
| Twitter/X | 26,114 | 22,507 |

### Filtered source rows

Classification is `first_match`; every omitted source row appears in exactly one reason.

| Source | Order | Reason | Count |
| --- | --- | --- | --- |
| social | 1 | Thread member | 150 |
| social | 2 | Repost or quoted-post title | 1,715 |
| social | 3 | Non-Rosen author | 55 |
| social | 4 | Short generic reply | 2,210 |
| social | 5 | Explicitly unverified | 164 |
| social | 6 | Final invalid title | 4 |

## Missing field coverage

| Field | Curated source | Social source | Runtime |
| --- | --- | --- | --- |
| url | 0 / 1,218 | 38 / 30,127 | 0 / 27,057 |
| raw text | 19 / 1,218 | 5 / 30,127 | Not shipped by design |
| summary | 0 / 1,218 | 30,072 / 30,127 | 0 / 27,057 |
| tags | 501 / 1,218 | 9,910 / 30,127 | 8,872 / 27,057 |
| concepts | 266 / 1,218 | 29,628 / 30,127 | 25,643 / 27,057 |
| quote | 227 / 1,218 | 4,408 / 30,127 | 5 / 27,057 |
| related ids | 505 / 1,218 | 22,055 / 30,127 | 25,992 / 27,057 |

## Graph coverage

Entities: 7,488 source, 7,488 runtime. Relationship assertions: 11,172.

| Group | Source rows | Source rows with assertions | Assertions | Published rows | Published rows with assertions |
| --- | --- | --- | --- | --- | --- |
| Curated | 1,218 | 1,053 | 11,160 | 1,218 | 1,053 |
| Social | 30,127 | 12 | 12 | 25,829 | 12 |

### Reference findings

| Finding | Count |
| --- | --- |
| relationship source records missing from source | 0 |
| relationship source entities missing from source | 0 |
| relationship target entities missing from source | 0 |
| relationship endpoint name mismatches | 1 |
| entity first mentions missing from source | 0 |
| entity first mentions missing from runtime | 1 |
| runtime record map records missing from runtime | 0 |
| runtime record map entities missing from runtime | 0 |

## URL and preservation inventory

Source: 31,297 unique external URLs across 122 hosts; 38 rows have no URL.

Runtime: 27,056 unique external URLs across 122 hosts; 0 rows have no URL.

Preservation link evidence appears in 6 source records. Another 91 records contain archive.org candidates only in prose fields.

## Comparison with the 2026-07-22 baseline

Baseline data commit: `5d3d5351346a9712de4f54d95e69ba0f410c6efd`.

| Metric | 2026-07-22 | Current | Delta |
| --- | --- | --- | --- |
| curated source | 1,029 | 1,218 | +189 |
| social source | 29,747 | 30,127 | +380 |
| published curated source | 950 | 1,218 | +268 |
| published social source | 25,657 | 25,829 | +172 |
| generated thread containers | 8 | 9 | +1 |
| injected records | 1 | 1 | 0 |
| published total | 26,616 | 27,057 | +441 |
| entities | 8,150 | 7,488 | -662 |
| relationships | 12,556 | 11,172 | -1,384 |

- PR #751 verified the previously held curated batch and regenerated the runtime corpus.
- PR #751 also reconciled filtered social rows, first mentions, orphan entities, and relationship mappings, so graph totals intentionally differ from the baseline.
- Source and runtime values in this report are recomputed independently; deltas are not carried forward as assumptions.

The JSON report contains exact input hashes, record IDs for every filter reason, full type and confidence breakdowns, host distribution, preservation evidence, and cross-file findings.
