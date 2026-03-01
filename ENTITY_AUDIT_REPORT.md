# Jay Rosen Archive: Entity Deduplication Audit Report

**Date:** March 1, 2026
**Scope:** Near-duplicate entity names in extracted_entities.csv (5,053 entities)
**Archive:** Jay Rosen Internet Archive

---

## Executive Summary

Audit identified **21 exact-name duplicates** (same name, different entity types), numerous **organizational variants**, and several **person name spelling variants**. Implemented **7 high-confidence merges** that consolidated subsidiary/variant entities into canonical forms.

**Results:**
- **Duplicates removed:** 7 entities
- **Relationships redirected:** 31 relationships
- **Final entity count:** 5,046 (down from 5,053)
- **Remaining issues:** ~20 items flagged for human editorial review

---

## 1. COMPLETED MERGES (High Confidence)

These merges consolidated variant names into canonical entities where the relationship was clear and unambiguous.

### 1.1 Person: Spelling Variant
- **Merged:** `Dan Gillmore` (P1584, 1 mention)
- **Into:** `Dan Gillmor` (P0128, 35 mentions)
- **Reason:** "Dan Gillmor" is the correct spelling of the journalist
- **Relationships updated:** 1
- **Status:** ✓ Complete

### 1.2 Organization: Subsidiary/Brand Names

#### Fox News variants
- **Merged:** `Fox News Channel` (O0117, 8 mentions)
- **Into:** `Fox News` (O0014, 38 mentions)
- **Reason:** "Fox News Channel" is the formal brand name; "Fox News" is standard shorthand
- **Relationships updated:** 14 (5 as source, 9 as target)
- **Status:** ✓ Complete

#### New York Times variants (5 merges)
Consolidated all subsidiary and variant mentions into the canonical newspaper entity:

| Merged | Into | Mentions | Updated | Reason |
|--------|------|----------|---------|--------|
| The New York Times Company (O0397) | The New York Times (O0002) | 7 → 190 | 8 | Corporate parent of newspaper |
| The New York Times Magazine (O0491) | The New York Times (O0002) | 5 → 190 | 5 | Magazine subsection |
| NYTimes.com (O0698) | The New York Times (O0002) | 2 → 190 | 2 | Website/digital edition |
| New York Times Digital (O0854) | The New York Times (O0002) | 1 → 190 | 1 | Digital division |
| *Subtotal NYT merges* | | | **16 relationships** | |

#### Washington Post variants
- **Merged:** `The Washington Post Company` (O1077, 1 mention)
- **Into:** `The Washington Post` (O0023, 146 mentions)
- **Reason:** Corporate parent entity; newspaper is the relevant entity for archive
- **Relationships updated:** 0 (entity had no relationships)
- **Status:** ✓ Complete

---

## 2. ITEMS FLAGGED FOR HUMAN REVIEW

### 2.1 Exact-Name Duplicates (Different Entity Types)

The following entities share identical names but have been classified as different types. **Only one classification is correct per entity.**

| Entity Name | Type 1 | Type 2 | Action Required |
|-------------|--------|--------|-----------------|
| `2024 election` | Event (E0217) | Event (E0220) | Determine if one is duplicate; if so, delete |
| `iowa` | Event (E0090) | Location (L0057) | Determine which type is correct; delete incorrect |
| `vietnam` | Event (E0162) | Location (L0171) | Determine which type is correct; delete incorrect |
| `white house` | Location (L0187) | Organization (O0126) | Both valid; decide on preferred classification |
| `world economic forum` | Event (E0101) | Organization (O0423) | Both valid; decide on preferred classification |

### 2.2 Organization Variants Requiring Editorial Decision

These organizations have multiple forms that may or may not refer to the same entity. The archive curator should decide whether to merge based on content context.

#### Columbia Journalism Review (CJR)
- **Entities:** `Columbia Journalism Review` (O0358, 15 mentions) vs `CJR (Columbia Journalism Review)` (O1106, minimal mentions)
- **Decision needed:** Merge abbreviation into canonical form?

#### The Washington Post internal divisions
- **Entities:**
  - `Democracy Desk, Washington Post` (O0144, 1 mention)
  - `Washington Post-Newsweek Interactive` (O0697, 1 mention)
  - `Washington Post-Newsweek Interactive` (O1117, 1 mention) — duplicate of O0697
  - `WPNI (Washington Post Newsweek Interactive)` (O0824, 1 mention)
- **Decision needed:** Keep divisions separate (for organizational structure) or merge into main WaPo entity?

#### Assignment Zero / NewAssignment.Net
- **Entities:** `NewAssignment.Net` (O0456, 25 mentions) vs `Assignment Zero` (O1161, 13 mentions)
- **Context:** Assignment Zero was a specific project/initiative within NewAssignment.Net
- **Decision needed:** Merge as related concepts or keep separate?

### 2.3 Person Name Variants

#### Leonard Downie (with/without "Jr.")
- **Entities:** `Leonard Downie` (P0314, 7 mentions) vs `Leonard Downie Jr.` (P0485, 2 mentions)
- **Status:** Both are valid — articles may use either form
- **Recommendation:** Keep both UNLESS analysis shows they refer to different people (father vs. son)

#### Jim Romenesko
- **Entities:** `Jim Romenesko` (P0182) vs `Romenesko` (P0444, also appears as O0035 Organization)
- **Issue:** P0444 is classified as Person but refers to the blog/organization, not a person
- **Recommendation:** Clarify whether P0444 should be Organization (the blog) or Person (Jim as author)

---

## 3. ENTITY TYPE CLASSIFICATION ERRORS

The following entities are classified as one type but semantically belong to another category:

### 3.1 Concepts mislabeled as Organizations

| Entity ID | Name | Current Type | Should Be | Notes |
|-----------|------|--------------|-----------|-------|
| O0050 | The press | Organization | Concept | Generic reference to journalism/news media, not a specific org |
| O0734 | Free Press | Organization | Concept | Refers to the concept of press freedom, not an organization |
| O0821 | Democracy Now | Organization | Concept or Work | Could be concept OR the specific radio/TV program |
| O1068 | Truth Laid Bear | Organization | Concept or Work | Blog name/concept, not an organization |

### 3.2 Works misclassified as Organizations/Persons

| Entity ID | Name | Current Type | Issues |
|-----------|------|--------------|--------|
| W0528 | nytimes.com | Work | Duplicate of O0698 (already merged, should be cleaned from Works) |
| W0384 | The New York Times online edition | Work | Refer to O0002; this is a descriptor, not a distinct entity |
| W0149 | The New York Times account | Work | Unclear; probably refers to the official account on a platform |
| P0444 | Romenesko | Person | May actually refer to the blog/organization O0035 |

---

## 4. DATA QUALITY OBSERVATIONS

### 4.1 Duplicate Domain Names
Some entities appear in both Organization and Work types because they're domain names:

- `beatblogging.org` — appears as O1032 (Organization) and W0415 (Work)
- `back-to-iraq.com` — appears as O0580 (Organization) and W0087 (Work)
- `h2otown.info` — appears as O0936 (Organization) and W0407 (Work)
- `paidcontent.org` — appears as O0864 (Organization) and W0531 (Work)

**Recommendation:** Decide on convention — should domain-based entities be classified as Organizations only, or is there value in tracking the Work separately?

### 4.2 Blog/Org Ambiguity
- `"on the media"` — appears as O0441 (Organization) and W0253 (Work)
- `"romenesko"` — appears as O0035 (Organization) and P0444 (Person)
- `"tompaine.com"` — appears as O0154 (Organization) and W0169 (Work)

**Pattern:** Entities representing blogs/web-based publications appear in multiple types. Clarify extraction rules.

---

## 5. TOP ORGANIZATION MENTIONS (Post-Merge)

After cleanup, the most-mentioned organizations are:

| Rank | Organization | Mentions | Entity ID |
|------|--------------|----------|-----------|
| 1 | PressThink | 251 | O0033 |
| 2 | The New York Times | 190 | O0002 |
| 3 | The Washington Post | 146 | O0023 |
| 4 | NYU | 71 | O0049 |
| 5 | CNN | 68 | O0015 |

**Note:** The New York Times now consolidates previous 4 separate entities (Company, Magazine, Digital, Website).

---

## 6. RECOMMENDATIONS FOR NEXT STEPS

### Immediate (Low Risk)
1. ✓ **Accept completed merges** — Deploy the 7 high-confidence merges immediately
2. Delete O0698 and W0528 (nytimes.com duplicates) — these are now redundant after merger

### Short-term (Editorial Review Required)
3. **Resolve exact-name duplicates** — Decide on correct types for the 5 entities with conflicting classifications
4. **Fix WPNI variants** — Delete duplicate O1117 (exact duplicate of O0697)
5. **Review entity type errors** — Reclassify O0050, O0734, O0821, O1068 to Concept type

### Medium-term (Extraction Rule Updates)
6. **Update extraction pipeline** — Clarify rules for:
   - Domain-based entities (should they be Org or Work or both?)
   - Blog/website entities (separate from their authors/organizations?)
   - Corporate subsidiaries vs. parent companies

7. **Review Romenesko handling** — Is P0444 a person or should it reference O0035 (the blog)?

---

## 7. VERIFICATION CHECKLIST

- [x] Verified all 7 deleted entities are gone from extracted_entities.csv
- [x] Verified all 31 relationships were updated in extracted_relationships.csv
- [x] Canonical entities retain their entity_id and mentions
- [x] No orphaned relationships point to deleted entities
- [x] CSV headers and structure remain intact
- [x] Total entity count: 5,046 (down from 5,053)

---

## Files Modified

- `data/extracted_entities.csv` — 7 rows deleted (duplicate entities)
- `data/extracted_relationships.csv` — 31 rows updated (relationship redirects)

**Backup note:** Original files should be committed to git before deploying these changes.

---

## Appendix: Complete Merge Log

```
P1584 (Dan Gillmore, 1 mention) → P0128 (Dan Gillmor, 35 mentions)
  - 1 relationship updated

O0117 (Fox News Channel, 8 mentions) → O0014 (Fox News, 38 mentions)
  - 14 relationships updated (5 source, 9 target)

O0397 (The New York Times Company, 7 mentions) → O0002 (The New York Times, 190 mentions)
  - 8 relationships updated (2 source, 6 target)

O0491 (The New York Times Magazine, 5 mentions) → O0002 (The New York Times, 190 mentions)
  - 5 relationships updated (0 source, 5 target)

O0698 (NYTimes.com, 2 mentions) → O0002 (The New York Times, 190 mentions)
  - 2 relationships updated (1 source, 1 target)

O0854 (New York Times Digital, 1 mention) → O0002 (The New York Times, 190 mentions)
  - 1 relationship updated (0 source, 1 target)

O1077 (The Washington Post Company, 1 mention) → O0023 (The Washington Post, 146 mentions)
  - 0 relationships updated
```

---

**Audit completed:** March 1, 2026
**Data integrity: VERIFIED**
