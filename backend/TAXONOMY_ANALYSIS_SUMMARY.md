# Taxonomy Analysis Summary

**Date:** 2025-12-02
**Records Analyzed:** 659

## Executive Summary

The taxonomy analysis revealed **significant inconsistencies** across eras, tags, and key_concepts fields. While the entity extraction schema v3.0 is well-structured, the CSV data has accumulated case variations, duplicates, and logical inconsistencies over time.

---

## 🔴 HIGH PRIORITY ISSUES

### 1. Era Date Range Overlaps

**Problem:** Multiple eras have overlapping date ranges, making categorization ambiguous.

**Examples:**
- **2005-2009:** Both "The Rise of the Web & Blogging (2000-2009)" and "Peak Blogging & Citizen Journalism (2005-2009)" cover this period
- **2016:** "Social Media & Networked Journalism (2010-2016)" and "Trump Era & Democratic Crisis (2016-2020)" both claim 2016
- **2017-2021:** Three eras overlap here:
  - "Trump Era & Press Crisis (2017-2021)"
  - "Trump Era & Democratic Crisis (2016-2020)"
  - "Digital Media & Platform Era (2017-Present)"

**Additional Issues:**
- Name variations: "The Rise of the Web & Blogging" vs "Rise of Web & Blogging" (same date range)
- Date range variations: "Early Career (1989-1999)" vs "Early Career (1990-1999)"
- 6 records missing date ranges entirely

**Impact:** 13 separate era overlap issues detected

**Recommendation:** **Redesign era taxonomy with clear, non-overlapping date boundaries**

#### Proposed Era Consolidation (REVISED - 8 Eras):

The [schema.json](backend/schema.json:44-69) defines 6 eras, but we need to add **COVID-19** and **Second Trump Administration** for completeness:

1. **Early Career & Public Journalism (1990-1999)** - Public journalism movement, civic engagement, dissertation to practice
2. **Blogging Launch & Digital Disruption (2000-2004)** - PressThink launch, post-9/11 coverage, Iraq War critique
3. **Peak Blogging & Citizen Journalism (2005-2009)** - Pro-am experiments, newspaper industry collapse, participatory journalism
4. **Social Media & Financial Crisis (2010-2015)** - Twitter/Facebook emergence, "View from Nowhere" critique, platform power
5. **Trump Era & Democratic Crisis (2016-2019)** - 2016 election coverage failures, "not the odds but the stakes," authoritarian threat
6. **COVID-19 & Misinformation Crisis (2020-2021)** - Pandemic journalism, public health communication, verification crisis intensifies
7. **Post-Trump Transition (2022-2024)** - Newsletter economics, Bluesky migration, membership models, AI emergence
8. **Second Trump Administration (2025-Present)** - Return to power, press under renewed threat, democratic journalism frameworks tested

**Key Changes from schema.json:**
- Split 2016-2020 into two eras (2016-2019 and 2020-2021) to separate Trump I from COVID
- Split 2021-Present into two eras (2022-2024 and 2025-Present) to separate post-Trump from Trump II
- This creates clear, non-overlapping boundaries with major historical events as dividing lines

This eliminates all overlaps and provides logical progression aligned with major historical shifts in journalism.

---

### 2. Tag Case Variations

**Problem:** 375 tags have case inconsistencies (e.g., "new york times" vs "New York Times")

**Top Examples:**
- "new york times" (97) vs "the new york times" (2) = **99 total**
- "New York Times" (50) vs "new york times" (47) = **97 total different tags**
- "2004 election" (48) vs "2004 Election" (1)
- "abc news" (3) vs "ABC News" (4)
- "60 minutes" (3) vs "60 Minutes" (2)

**Impact:** 2,549 unique tags, but ~375 are likely duplicates due to casing

**Recommendation:** Standardize to Title Case for proper nouns, lowercase for generic terms

---

### 3. Key_Concepts Case Variations

**Problem:** 3 key concepts have case variations

**Examples:**
- "View from Nowhere" (163) vs "View From Nowhere" (5) vs "view from nowhere" (1) = **169 total**
- "Citizen Journalism" (7) vs "Citizen journalism" (1)
- "Pro-am journalism" (1) vs "pro-am journalism" (1)

**Additional Issue:** Empty string has 3 occurrences

**Recommendation:** Standardize to exact casing from [schema.json](backend/schema.json:29-43)

---

## 🟡 MEDIUM PRIORITY ISSUES

### 4. Tag Potential Duplicates (Concept Consolidation)

**Problem:** Multiple tags refer to the same entity/concept

**Examples:**

| Concept | Variants | Total Mentions |
|---------|----------|----------------|
| New York Times | "new york times" (97), "the new york times" (2), "New York Times" (50), "nyt" (0 found) | 149+ |
| Social Media | "social media" (23), "social networks" (7) | 30 |
| Twitter | "twitter" (9), "x" (1), "twitter/x" (0 found) | 10+ |
| Journalism | "journalism" (183), "journalists" (1), "journalist" (0 found) | 184+ |
| Media | "media" (32), "news media" (8), "mainstream media" (42), "msm" (9) | 91 |

**Recommendation:** Create tag normalization mapping

---

### 5. Missing Era Assignments

**Problem:** 11 records (out of 659) are missing era assignments entirely

**Recommendation:** Backfill missing eras based on publication_date

---

## 🟢 LOW PRIORITY ISSUES

### 6. Key_Concepts May Be Too Generic

**Problem:** Top concepts appear in 50-300+ records, potentially too broad

| Concept | Occurrences | % of Archive |
|---------|-------------|--------------|
| The People Formerly Known as the Audience | 318 | 48% |
| View from Nowhere | 163 | 25% |
| He said/she said journalism | 134 | 20% |
| Audience atomization overcome | 128 | 19% |
| The Production of Innocence | 125 | 19% |
| False balance | 103 | 16% |
| Verification in reverse | 57 | 9% |

**Consideration:** These ARE Jay Rosen's signature concepts, so high frequency is expected. May not need action.

---

## Schema Comparison

### What's Working Well ✅

1. **Entity Extraction Schema v3.0** ([entity_extraction_schema_v3.json](backend/entity_extraction_schema_v3.json:1-338))
   - ✅ Well-structured entity types (Person, Organization, Work, Concept, Event, Location)
   - ✅ Clear relationship definitions (14 types)
   - ✅ Negative examples to prevent errors
   - ✅ Record context awareness built-in

2. **Main Schema** ([schema.json](backend/schema.json:1-130))
   - ✅ Clean 6-era taxonomy (proposed, not yet applied to data)
   - ✅ 6 thematic categories well-defined
   - ✅ 13 key_concepts list (canonical)
   - ✅ 11 content_format types

### What's Broken ❌

1. **CSV Data** ([data/archive_records-public.csv])
   - ❌ Eras don't match schema.json definitions
   - ❌ 14 different era variations (vs 6 in schema)
   - ❌ Case inconsistencies across 375 tags
   - ❌ Tag duplicates not consolidated
   - ❌ Key_concepts have case variations

---

## Taxonomy Standardization Plan

### Phase 1: Era Consolidation (HIGH PRIORITY)
1. Map existing 14 eras → 6 canonical eras from schema.json
2. Assign eras to 11 records missing them
3. Update all records to use consistent era names with date ranges

**Mapping Required (14 existing → 8 revised):**
```
EXISTING ERA → NEW ERA (based on publication_date)
"The Rise of the Web & Blogging (2000-2009)" → Split based on date:
  - 2000-2004 records → "Blogging Launch & Digital Disruption (2000-2004)"
  - 2005-2009 records → "Peak Blogging & Citizen Journalism (2005-2009)"

"Rise of Web & Blogging (2000-2009)" → Split based on date:
  - 2000-2004 records → "Blogging Launch & Digital Disruption (2000-2004)"
  - 2005-2009 records → "Peak Blogging & Citizen Journalism (2005-2009)"

"Peak Blogging & Citizen Journalism (2005-2009)" → "Peak Blogging & Citizen Journalism (2005-2009)" ✓

"Social Media & Networked Journalism (2010-2016)" → Split based on date:
  - 2010-2015 records → "Social Media & Financial Crisis (2010-2015)"
  - 2016 records → "Trump Era & Democratic Crisis (2016-2019)"

"Social Media & Financial Crisis (2010-2015)" → "Social Media & Financial Crisis (2010-2015)" ✓

"Trump Era & Democratic Crisis (2016-2020)" → Split based on date:
  - 2016-2019 records → "Trump Era & Democratic Crisis (2016-2019)"
  - 2020 records → "COVID-19 & Misinformation Crisis (2020-2021)"

"Trump Era & Press Crisis (2017-2021)" → Split based on date:
  - 2017-2019 records → "Trump Era & Democratic Crisis (2016-2019)"
  - 2020-2021 records → "COVID-19 & Misinformation Crisis (2020-2021)"

"Digital Media & Platform Era (2017-Present)" → Split based on date:
  - 2017-2019 records → "Trump Era & Democratic Crisis (2016-2019)"
  - 2020-2021 records → "COVID-19 & Misinformation Crisis (2020-2021)"
  - 2022-2024 records → "Post-Trump Transition (2022-2024)"
  - 2025+ records → "Second Trump Administration (2025-Present)"

"Platform Transition & Future Models (2021-Present)" → Split based on date:
  - 2021 records → "COVID-19 & Misinformation Crisis (2020-2021)"
  - 2022-2024 records → "Post-Trump Transition (2022-2024)"
  - 2025+ records → "Second Trump Administration (2025-Present)"

"Post-Trump & Future of News (2022-Present)" → Split based on date:
  - 2022-2024 records → "Post-Trump Transition (2022-2024)"
  - 2025+ records → "Second Trump Administration (2025-Present)"

"Early Career & Public Journalism (1989-1999)" → "Early Career & Public Journalism (1990-1999)"
"Early Career & Public Journalism (1990-1999)" → "Early Career & Public Journalism (1990-1999)" ✓

Records WITHOUT date ranges (6 total) → Assign based on publication_date
Records MISSING eras (11 total) → Assign based on publication_date
```

**Key Decision:** Most existing eras need to be **split based on actual publication_date** rather than simple 1:1 mapping, since many span multiple new eras.

### Phase 2: Tag Standardization (HIGH PRIORITY)
1. Normalize all 375 case variations to consistent casing
2. Create tag consolidation map for duplicates (NYT variants, social media variants, etc.)
3. Apply normalization to all 7,633 tag instances

### Phase 3: Key_Concepts Standardization (HIGH PRIORITY)
1. Match against canonical list in schema.json
2. Fix 3 case variations
3. Remove 3 empty string entries

### Phase 4: Documentation (MEDIUM PRIORITY)
1. Update CLAUDE.md with standardized taxonomy
2. Document tag normalization rules
3. Create validation script for future imports

---

## Files to Modify

1. **Data Files:**
   - `data/archive_records-public.csv` - Main data file (apply all fixes)
   - `data/archive_records-public_CLEANED.csv` - Already has URL/author fixes, needs taxonomy fixes

2. **Schema Files (reference only, already correct):**
   - `backend/schema.json` - ✅ Already defines correct taxonomy
   - `backend/entity_extraction_schema_v3.json` - ✅ Already well-structured

3. **Scripts to Create:**
   - `backend/scripts/consolidate_taxonomy.py` - Apply all taxonomy fixes
   - `backend/scripts/validate_taxonomy.py` - Validate taxonomy compliance

---

## Next Steps

1. **Review this document** - Confirm proposed era mappings
2. **Create consolidation script** - Safe, non-destructive with preview
3. **Test on sample records** - Verify changes make sense
4. **Apply to full dataset** - With backup and change log
5. **Update schema documentation** - Ensure future consistency

---

## Questions for Review

1. **Eras (REVISED):** Do the 8 proposed eras make sense? Specifically:
   - Should COVID (2020-2021) be its own era, or folded into Trump I?
   - Should Second Trump Administration (2025-Present) be separate from Post-Trump Transition?
   - Are the date boundaries logical (1999/2000, 2004/2005, 2015/2016, 2019/2020, 2021/2022, 2024/2025)?

2. **Era Naming:** Review proposed era names:
   - "Trump Era & Democratic Crisis (2016-2019)" - Should this mention the 2016 election specifically?
   - "COVID-19 & Misinformation Crisis (2020-2021)" - Too specific or appropriately descriptive?
   - "Second Trump Administration (2025-Present)" - Should this be "Trump II" or something else?

3. **Era Mapping Logic:** The consolidation script will need to:
   - Parse `publication_date` field
   - Assign era based on year (not existing era field)
   - Override any manually-assigned eras
   - **Is this the right approach?**

4. **Tag Normalization:** Should we consolidate "NYT" / "New York Times" / "the new york times" into one canonical form?

5. **Key Concepts:** The current 13 concepts in schema.json - are these complete or should more be added?

6. **Scope:** Should we tackle tags (2,549 unique) or focus only on eras + key_concepts for now?

---

## Appendix: Top Tags (Current State)

Top 30 tags before normalization:

| Tag | Count |
|-----|-------|
| blogging | 230 |
| citizen journalism | 179 |
| media criticism | 169 |
| journalism | 162 |
| journalism ethics | 133 |
| media bias | 112 |
| pressthink | 92 |
| political journalism | 90 |
| objectivity | 86 |
| internet | 76 |
| blogs | 66 |
| weblogs | 65 |
| transparency | 63 |
| online journalism | 59 |
| press criticism | 56 |
| journalistic ethics | 52 |
| pro-am journalism | 51 |
| New York Times | 50 |
| 2004 election | 48 |
| new york times | 47 |
| digital media | 44 |
| blogosphere | 44 |
| mainstream media | 42 |
| online news | 41 |
| political communication | 34 |
| media ethics | 33 |
| bloggers | 31 |
| democracy | 28 |
| media | 27 |
| investigative journalism | 27 |

*Note: "New York Times" (50) and "new york times" (47) are DIFFERENT tags - clear case variation issue*
