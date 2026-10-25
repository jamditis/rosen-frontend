# Stewardship coverage census

Schema: `stewardship-census/1.0.0`

Input commit: `9ad4cfa7bb49853486db92fd1df68046b3a40c79` (input files clean)

## Record reconciliation

| Group | Source | Published source rows | Filtered |
| --- | --- | --- | --- |
| Curated | 1,030 | 1,030 | 0 |
| Social | 30,085 | 25,827 | 4,258 |

Runtime total: 26,867 records, including 9 generated thread containers and 1 injected record.

### Social source and runtime by platform

| Platform | Source | Published source rows |
| --- | --- | --- |
| Bluesky | 3,455 | 2,839 |
| Mastodon | 516 | 481 |
| Twitter/X | 26,114 | 22,507 |

### Filtered source rows

Classification is `first_match`; every omitted source row appears in exactly one reason.

| Source | Order | Reason | Count |
| --- | --- | --- | --- |
| social | 1 | Thread member | 150 |
| social | 2 | Repost or quoted-post title | 1,715 |
| social | 3 | Non-Rosen author | 55 |
| social | 4 | Short generic reply | 2,206 |
| social | 5 | Explicitly unverified | 128 |
| social | 6 | Final invalid title | 4 |

## Missing field coverage

| Field | Curated source | Social source | Runtime |
| --- | --- | --- | --- |
| url | 0 / 1,030 | 38 / 30,085 | 0 / 26,867 |
| raw text | 14 / 1,030 | 4 / 30,085 | Not shipped by design |
| summary | 0 / 1,030 | 30,032 / 30,085 | 0 / 26,867 |
| tags | 313 / 1,030 | 9,868 / 30,085 | 8,682 / 26,867 |
| concepts | 78 / 1,030 | 29,586 / 30,085 | 25,453 / 26,867 |
| quote | 40 / 1,030 | 4,407 / 30,085 | 0 / 26,867 |
| related ids | 317 / 1,030 | 22,013 / 30,085 | 25,986 / 26,867 |

## Graph coverage

Entities: 7,303 source, 7,303 runtime. Relationship assertions: 10,986.

| Group | Source rows | Source rows with assertions | Assertions | Published rows | Published rows with assertions |
| --- | --- | --- | --- | --- | --- |
| Curated | 1,030 | 869 | 10,974 | 1,030 | 869 |
| Social | 30,085 | 12 | 12 | 25,827 | 12 |

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

Source: 31,067 unique external URLs across 122 hosts; 38 rows have no URL.

Runtime: 26,866 unique external URLs across 122 hosts; 0 rows have no URL.

Preservation link evidence appears in 6 source records. Another 91 records contain archive.org candidates only in prose fields.

## Comparison with the 2026-07-22 baseline

Baseline data commit: `5d3d5351346a9712de4f54d95e69ba0f410c6efd`.

| Metric | 2026-07-22 | Current | Delta |
| --- | --- | --- | --- |
| curated source | 1,029 | 1,030 | +1 |
| social source | 29,747 | 30,085 | +338 |
| published curated source | 950 | 1,030 | +80 |
| published social source | 25,657 | 25,827 | +170 |
| generated thread containers | 8 | 9 | +1 |
| injected records | 1 | 1 | 0 |
| published total | 26,616 | 26,867 | +251 |
| entities | 8,150 | 7,303 | -847 |
| relationships | 12,556 | 10,986 | -1,570 |

- PR #751 verified the previously held curated batch and regenerated the runtime corpus.
- PR #751 also reconciled filtered social rows, first mentions, orphan entities, and relationship mappings, so graph totals intentionally differ from the baseline.
- Source and runtime values in this report are recomputed independently; deltas are not carried forward as assumptions.

The JSON report contains exact input hashes, record IDs for every filter reason, full type and confidence breakdowns, host distribution, preservation evidence, and cross-file findings.
