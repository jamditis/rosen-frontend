# Stewardship coverage census

Schema: `stewardship-census/1.0.0`

Input commit: `fc1dc57df63842c46aa0cbc81967179add3da571` (input files clean)

## Record reconciliation

| Group | Source | Published source rows | Filtered |
| --- | --- | --- | --- |
| Curated | 1,029 | 1,029 | 0 |
| Social | 29,868 | 25,777 | 4,091 |

Runtime total: 26,815 records, including 8 generated thread containers and 1 injected record.

### Social source and runtime by platform

| Platform | Source | Published source rows |
| --- | --- | --- |
| Bluesky | 3,238 | 2,789 |
| Mastodon | 516 | 481 |
| Twitter/X | 26,114 | 22,507 |

### Filtered source rows

Classification is `first_match`; every omitted source row appears in exactly one reason.

| Source | Order | Reason | Count |
| --- | --- | --- | --- |
| social | 1 | Thread member | 147 |
| social | 2 | Repost or quoted-post title | 1,715 |
| social | 3 | Non-Rosen author | 55 |
| social | 4 | Short generic reply | 2,170 |
| social | 6 | Final invalid title | 4 |

## Missing field coverage

| Field | Curated source | Social source | Runtime |
| --- | --- | --- | --- |
| url | 0 / 1,029 | 38 / 29,868 | 0 / 26,815 |
| raw text | 14 / 1,029 | 4 / 29,868 | Not shipped by design |
| summary | 0 / 1,029 | 29,867 / 29,868 | 0 / 26,815 |
| tags | 313 / 1,029 | 9,651 / 29,868 | 8,631 / 26,815 |
| concepts | 78 / 1,029 | 29,419 / 29,868 | 25,451 / 26,815 |
| quote | 40 / 1,029 | 4,407 / 29,868 | 0 / 26,815 |
| related ids | 317 / 1,029 | 21,796 / 29,868 | 25,945 / 26,815 |

## Graph coverage

Entities: 7,304 source, 7,304 runtime. Relationship assertions: 10,965.

| Group | Source rows | Source rows with assertions | Assertions | Published rows | Published rows with assertions |
| --- | --- | --- | --- | --- | --- |
| Curated | 1,029 | 868 | 10,963 | 1,029 | 868 |
| Social | 29,868 | 2 | 2 | 25,777 | 2 |

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

Source: 30,849 unique external URLs across 122 hosts; 38 rows have no URL.

Runtime: 26,814 unique external URLs across 122 hosts; 0 rows have no URL.

Preservation link evidence appears in 6 source records. Another 91 records contain archive.org candidates only in prose fields.

## Comparison with the 2026-07-22 baseline

Baseline data commit: `5d3d5351346a9712de4f54d95e69ba0f410c6efd`.

| Metric | 2026-07-22 | Current | Delta |
| --- | --- | --- | --- |
| curated source | 1,029 | 1,029 | 0 |
| social source | 29,747 | 29,868 | +121 |
| published curated source | 950 | 1,029 | +79 |
| published social source | 25,657 | 25,777 | +120 |
| generated thread containers | 8 | 8 | 0 |
| injected records | 1 | 1 | 0 |
| published total | 26,616 | 26,815 | +199 |
| entities | 8,150 | 7,304 | -846 |
| relationships | 12,556 | 10,965 | -1,591 |

- PR #751 verified the previously held curated batch and regenerated the runtime corpus.
- PR #751 also reconciled filtered social rows, first mentions, orphan entities, and relationship mappings, so graph totals intentionally differ from the baseline.
- Source and runtime values in this report are recomputed independently; deltas are not carried forward as assumptions.

The JSON report contains exact input hashes, record IDs for every filter reason, full type and confidence breakdowns, host distribution, preservation evidence, and cross-file findings.
