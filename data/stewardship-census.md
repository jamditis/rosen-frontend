# Stewardship coverage census

Schema: `stewardship-census/1.0.0`

Input commit: `4e3adf29d83cbe6b422999032274f98020b73ecc` (input files clean)

## Record reconciliation

| Group | Source | Published source rows | Filtered |
| --- | --- | --- | --- |
| Curated | 1,213 | 1,213 | 0 |
| Social | 30,106 | 25,828 | 4,278 |

Runtime total: 27,051 records, including 9 generated thread containers and 1 injected record.

### Social source and runtime by platform

| Platform | Source | Published source rows |
| --- | --- | --- |
| Bluesky | 3,476 | 2,840 |
| Mastodon | 516 | 481 |
| Twitter/X | 26,114 | 22,507 |

### Filtered source rows

Classification is `first_match`; every omitted source row appears in exactly one reason.

| Source | Order | Reason | Count |
| --- | --- | --- | --- |
| social | 1 | Thread member | 150 |
| social | 2 | Repost or quoted-post title | 1,715 |
| social | 3 | Non-Rosen author | 55 |
| social | 4 | Short generic reply | 2,208 |
| social | 5 | Explicitly unverified | 146 |
| social | 6 | Final invalid title | 4 |

## Missing field coverage

| Field | Curated source | Social source | Runtime |
| --- | --- | --- | --- |
| url | 0 / 1,213 | 38 / 30,106 | 0 / 27,051 |
| raw text | 14 / 1,213 | 5 / 30,106 | Not shipped by design |
| summary | 0 / 1,213 | 30,052 / 30,106 | 0 / 27,051 |
| tags | 496 / 1,213 | 9,889 / 30,106 | 8,866 / 27,051 |
| concepts | 261 / 1,213 | 29,607 / 30,106 | 25,637 / 27,051 |
| quote | 222 / 1,213 | 4,408 / 30,106 | 0 / 27,051 |
| related ids | 500 / 1,213 | 22,034 / 30,106 | 25,986 / 27,051 |

## Graph coverage

Entities: 7,488 source, 7,488 runtime. Relationship assertions: 11,172.

| Group | Source rows | Source rows with assertions | Assertions | Published rows | Published rows with assertions |
| --- | --- | --- | --- | --- | --- |
| Curated | 1,213 | 1,053 | 11,160 | 1,213 | 1,053 |
| Social | 30,106 | 12 | 12 | 25,828 | 12 |

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

Source: 31,271 unique external URLs across 122 hosts; 38 rows have no URL.

Runtime: 27,050 unique external URLs across 122 hosts; 0 rows have no URL.

Preservation link evidence appears in 6 source records. Another 91 records contain archive.org candidates only in prose fields.

## Comparison with the 2026-07-22 baseline

Baseline data commit: `5d3d5351346a9712de4f54d95e69ba0f410c6efd`.

| Metric | 2026-07-22 | Current | Delta |
| --- | --- | --- | --- |
| curated source | 1,029 | 1,213 | +184 |
| social source | 29,747 | 30,106 | +359 |
| published curated source | 950 | 1,213 | +263 |
| published social source | 25,657 | 25,828 | +171 |
| generated thread containers | 8 | 9 | +1 |
| injected records | 1 | 1 | 0 |
| published total | 26,616 | 27,051 | +435 |
| entities | 8,150 | 7,488 | -662 |
| relationships | 12,556 | 11,172 | -1,384 |

- PR #751 verified the previously held curated batch and regenerated the runtime corpus.
- PR #751 also reconciled filtered social rows, first mentions, orphan entities, and relationship mappings, so graph totals intentionally differ from the baseline.
- Source and runtime values in this report are recomputed independently; deltas are not carried forward as assumptions.

The JSON report contains exact input hashes, record IDs for every filter reason, full type and confidence breakdowns, host distribution, preservation evidence, and cross-file findings.
