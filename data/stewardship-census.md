# Stewardship coverage census

Schema: `stewardship-census/1.0.0`

Input commit: `31543425c3c2d8af15f1b5dee3c6f2a3fc330b65` (input files clean)

## Record reconciliation

| Group | Source | Published source rows | Filtered |
| --- | --- | --- | --- |
| Curated | 1,030 | 1,030 | 0 |
| Social | 29,747 | 25,660 | 4,087 |

Runtime total: 26,698 records, including 7 generated thread containers and 1 injected record.

### Social source and runtime by platform

| Platform | Source | Published source rows |
| --- | --- | --- |
| Bluesky | 3,117 | 2,672 |
| Mastodon | 516 | 481 |
| Twitter/X | 26,114 | 22,507 |

### Filtered source rows

Classification is `first_match`; every omitted source row appears in exactly one reason.

| Source | Order | Reason | Count |
| --- | --- | --- | --- |
| social | 1 | Thread member | 143 |
| social | 2 | Repost or quoted-post title | 1,715 |
| social | 3 | Non-Rosen author | 55 |
| social | 4 | Short generic reply | 2,170 |
| social | 6 | Final invalid title | 4 |

## Missing field coverage

| Field | Curated source | Social source | Runtime |
| --- | --- | --- | --- |
| url | 0 / 1,030 | 38 / 29,747 | 0 / 26,698 |
| raw text | 14 / 1,030 | 4 / 29,747 | Not shipped by design |
| summary | 0 / 1,030 | 29,746 / 29,747 | 0 / 26,698 |
| tags | 319 / 1,030 | 9,530 / 29,747 | 8,519 / 26,698 |
| concepts | 84 / 1,030 | 29,298 / 29,747 | 25,339 / 26,698 |
| quote | 34 / 1,030 | 4,407 / 29,747 | 0 / 26,698 |
| related ids | 318 / 1,030 | 21,675 / 29,747 | 25,821 / 26,698 |

## Graph coverage

Entities: 7,324 source, 7,324 runtime. Relationship assertions: 11,153.

| Group | Source rows | Source rows with assertions | Assertions | Published rows | Published rows with assertions |
| --- | --- | --- | --- | --- | --- |
| Curated | 1,030 | 875 | 11,151 | 1,030 | 875 |
| Social | 29,747 | 2 | 2 | 25,660 | 2 |

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

Source: 30,729 unique external URLs across 120 hosts; 38 rows have no URL.

Runtime: 26,697 unique external URLs across 120 hosts; 0 rows have no URL.

Preservation link evidence appears in 6 source records. Another 91 records contain archive.org candidates only in prose fields.

## Comparison with the 2026-07-22 baseline

Baseline data commit: `5d3d5351346a9712de4f54d95e69ba0f410c6efd`.

| Metric | 2026-07-22 | Current | Delta |
| --- | --- | --- | --- |
| curated source | 1,029 | 1,030 | +1 |
| social source | 29,747 | 29,747 | 0 |
| published curated source | 950 | 1,030 | +80 |
| published social source | 25,657 | 25,660 | +3 |
| generated thread containers | 8 | 7 | -1 |
| injected records | 1 | 1 | 0 |
| published total | 26,616 | 26,698 | +82 |
| entities | 8,150 | 7,324 | -826 |
| relationships | 12,556 | 11,153 | -1,403 |

- PR #751 verified the previously held curated batch and regenerated the runtime corpus.
- PR #751 also reconciled filtered social rows, first mentions, orphan entities, and relationship mappings, so graph totals intentionally differ from the baseline.
- Source and runtime values in this report are recomputed independently; deltas are not carried forward as assumptions.

The JSON report contains exact input hashes, record IDs for every filter reason, full type and confidence breakdowns, host distribution, preservation evidence, and cross-file findings.
