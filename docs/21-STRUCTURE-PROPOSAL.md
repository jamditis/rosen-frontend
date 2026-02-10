# The number 21: implementation plan for the Jay Rosen Internet Archive

**Created:** February 5, 2026
**Status:** Implementation plan — Joe and Claude build it, Jay reviews when done
**Renamed:** Jay Rosen Internet Archive (per Jay, February 2026)

---

## The idea

Jay wants the archive structured around the number 21 as a recurring motif. Every major feature presents 21 curated items. The number signals that this is a deliberately structured intellectual project, not a data dump.

Landing page framing:

> *21 key ideas. 21 essential quotations. 21 featured works. 21 milestones. The Impossible Press was written in 1986. This archive traces how one dissertation became a life's work.*

---

## Current state (updated February 6, 2026)

| Feature | Count | Target | Status |
|---------|-------|--------|--------|
| Key themes | 21 | 21 | Done |
| Quotations | 21 | 21 | Done |
| Featured works | 21 | 21 | Done (Feb 6, 2026) |
| Glossary | 29 | 21+ | Done (exceeds target) |
| Timeline | 21 | 21 | Done |
| Excerpts | 21 | 21 | Done |
| Context 1986 | 21 | 21 | Done (9+4+8 across three arrays) |
| FAQ | 46 | 46 | Skipped — works better at 46 |
| Comparisons | 21 | 21 | Done |

**All 21-item expansions are complete.** Remaining work: landing page "21" branding and UI presentation design.

---

## Feature-by-feature plan

### 1. Key themes: 7 → 21 (+14) — DRAFT READY

**File:** `frontend/components/dissertationData.js` (KEY_THEMES array)

All 14 new themes drawn from chapter content already in dissertationData.js. Full draft with descriptions saved. Implementation is just appending to the array.

**Current 7:**
1. Journalism as transaction, not action
2. Information is relational
3. The impossibility of the informed citizen
4. Scale matters
5. Communication does not equal community
6. The competition for attention transforms public life
7. The professional attitude obscures fundamental problems

**14 additions:**
8. News arises from distance
9. The public is not found but formed
10. Each new medium inspires and then disappoints
11. The newspaper both connects and dissolves
12. Mobilized privacy replaces public life
13. News as drama turns citizens into spectators
14. We respond to pictures in our heads, not reality
15. More communication creates more to communicate about
16. Media-created publics are inherently unstable
17. The conflict between commerce and public duty is structural
18. Making things public does not make a public
19. Communication is an art, not merely transmission
20. The press structures events to its own demands
21. The press-public relationship requires ecological thinking

**Implementation:** Append to KEY_THEMES array. ~30 minutes.

---

### 2. Notable quotations: 9 → 21 (+12) — DRAFT READY

**File:** `frontend/components/dissertationData.js` (NOTABLE_QUOTATIONS array)

All 12 new quotations sourced from pull quotes in the dissertation nodes. Each has page reference. Need to spot-check page numbers against the actual PDF.

**12 additions:**
10. "News arrives from a distance..." (Ch. 1, p. 13)
11. "The journalist becomes a dramatist..." (Ch. 2, p. 72)
12. "Improvements in communication also make communication more difficult..." (Ch. 3, p. 95)
13. "As a way of tying people together the newspaper has a dissolving as well as a connecting tendency." (Ch. 4, p. 140)
14. "When there is an indefinite supply of available information, attention is scarce..." (Ch. 5, p. 180)
15. "An impossible press was born..." (Ch. 6, p. 220)
16. "Yellow journalism put a sharper edge on the conflict..." (Ch. 6, p. 240)
17. "One could free all the facts in the world and still not be informing the public..." (Ch. 7, p. 280)
18. "The stereotype is a form of perception that works from private belief toward reality..." (Ch. 7, p. 282)
19. "The trouble lies deeper than the press, and so does the remedy." (Ch. 7, p. 320)
20. "Till the Great Society is converted into a Great Community, the Public will remain in eclipse." (Ch. 8, p. 340)
21. "Providing information is not all there is to informing the public." (Conclusion, p. 380)

**Implementation:** Append to NOTABLE_QUOTATIONS array. ~30 minutes. Spot-check page numbers first.

---

### 3. Featured works: 6 → 21 (+15) — DRAFT READY

**File:** `frontend/constants.js` (FEATURED_WORKS array)

All 15 additions sourced from verified archive records with record IDs, URLs, and years. Spans 1995-2025. Covers every major Rosen concept.

**Bug to fix first:** Current #6 ("Audience Atomization") links to the wrong URL. Points to "People Formerly Known as the Audience" (RECORD-00620). Should point to "Audience Atomization Overcome" (RECORD-00616, https://pressthink.org/2009/01/12/audience-atomization-overcome-why-the-internet-weakens-the-authority-of-the-press/).

**15 additions:**
7. Public Journalism: A Case for Public Scholarship (1995) — RECORD-00086
8. The Master Narrative in Journalism (2003) — RECORD-00111 — 14 inbound refs
9. The Press Is a Player (2003) — RECORD-00289 — 16 inbound refs
10. Bloggers vs. Journalists Is Over (2005) — RECORD-00564
11. The Production of Innocence (2005) — RECORD-00304
12. The People Formerly Known as the Audience (2006) — RECORD-00620 — 17 inbound refs
13. What I Learned from Assignment Zero (2007) — RECORD-00185
14. The Beast Without a Brain (2008) — RECORD-00011
15. The Quest for Innocence and the Loss of Reality (2010) — RECORD-00388
16. The Citizens' Agenda in Election Coverage (2011) — RECORD-00060
17. Asymmetry Fries the Circuits (2015) — RECORD-00029
18. Winter Is Coming (2016) — RECORD-00057
19. America's Press and the Asymmetric War for Truth (2020) — RECORD-00023
20. Interview on the Ezra Klein Show (2021) — RECORD-00028
21. Trump, Truth, and "Freedom from Fact" (2025) — RECORD-00021

**Implementation:** Update FEATURED_WORKS array with full objects (title, description, image, link, type). Need to find/generate card images. ~2 hours.

---

### 4. Glossary terms: 16 → 21 (+5) — EASY

**File:** `dissertation/glossary/data.js`

**5 additions:**
17. The Lippmann-Dewey Debate
18. The Eclipse of the Public
19. Yellow Journalism (as structural concept)
20. The Searchlight Metaphor
21. The Great Community

**Implementation:** Add 5 entries to the glossary data. Write definition, context, and contemporary relevance for each. ~1 hour.

---

### 5. Timeline milestones: 13 → 21 (+8) — MEDIUM

**File:** `dissertation/timeline/data.js`

**8 additions:**
14. Early academic career (early 1980s)
15. Neil Postman as advisor (1983-1986)
16. Civic Journalism Movement (1994)
17. Blog era and press criticism (2004-2005)
18. Audience Atomization Overcome (2006)
19. False balance critique (2011)
20. Send the Interns / White House coverage (2019)
21. Retirement from NYU (2024)

**Note:** Items 14, 15, and 21 are biographical rather than bibliographic. The existing timeline mixes both (e.g., "Joins NYU Faculty"), so this is consistent.

**Implementation:** Add 8 entries with year, title, description, and connection to dissertation themes. ~1.5 hours.

---

### 6. "Then and Now" comparisons: 7 → 21 (+14) — HARDEST

**File:** `dissertation/comparison/data.js`

This is the biggest lift. Each comparison needs a "1986 view" section, a "2025 reality" section, and connecting commentary. We can write the first drafts ourselves — they don't need Jay's original prose since the existing 7 were generated too.

**14 additions:**
8. The Omnicompetent Citizen
9. Scale of Democracy
10. The Professional Attitude
11. Mobilized Privacy
12. Journalism as Transaction
13. Stereotypes and Perception
14. Yellow Journalism
15. The Lippmann-Dewey Debate
16. News as Spectacle
17. Trust in the Press
18. The Local News Crisis
19. Who is the Public?
20. Propaganda and PR
21. The Role of Distance

**Implementation:** Write 14 comparison entries. Each needs ~200-300 words (1986 paragraph + 2025 paragraph + one-sentence connection). ~4 hours.

---

### 7. Annotated excerpts: 12 → 21 (+9) — MEDIUM

**File:** `dissertation/excerpts/data.js`

Each excerpt needs: the actual passage from the dissertation, chapter/page reference, academic context, and contemporary relevance. The "2025 commentary" field can stay as placeholder for now (existing 12 already have placeholder text).

**9 additions:**
13. News Arises from Distance
14. The Newspaper's Dissolving Tendency
15. The Attention Economy
16. Yellow Journalism's Structural Lesson
17. The Searchlight and the Darkness
18. The Omnicompetent Citizen
19. The Great Community
20. More Communication, More Difficulty
21. Five Factors Between Press and Public

**Implementation:** Pull passages from dissertation PDF/markdown, write context and relevance. ~2.5 hours.

---

### 8. FAQ: 46 → grouped into 21 categories — OPTIONAL

**File:** `dissertation/faq/data.js`

The FAQ already has 46 questions. Forcing them into exactly 21 categories creates some awkward single-question categories. Two options:

**Option A:** Group into 21 categories as a UI layer (add a `category` field to each Q&A, build a category filter). Some categories will have 1 question, some will have 8.

**Option B:** Skip this one. The FAQ is already the richest feature at 46 entries. "21" works better as a motif when it isn't forced on everything.

**Recommendation:** Option B. The FAQ gets a pass.

---

### 9. Context 1986: 18 → 21 (+3) — EASY

**File:** `dissertation/context/data.js`

**3 additions:**
19. The academic landscape in 1986 — Postman's NYU program, state of communication theory and media studies
20. Public journalism didn't exist yet — The idea that journalists should help communities solve problems hadn't been invented
21. What the dissertation couldn't predict — The internet, social media, the collapse of the business model, global disinformation

**Implementation:** Write 3 entries. ~45 minutes.

---

## Implementation order

1. **Key themes + quotations** — Fastest, drafts are ready, just append to arrays
2. **Featured works** — Fix #6 bug, then add 15 entries with descriptions
3. **Glossary + context 1986** — Small additions, easy wins
4. **Timeline** — 8 new entries, straightforward
5. **Annotated excerpts** — Need to pull actual passages from the dissertation
6. **Comparisons** — Most writing, do last

**Estimated total implementation time:** ~12 hours of focused work

---

## Naming update

Jay wants to rename the project from "Jay Rosen Internet Archive" to "Jay Rosen Internet Archive." This affects:

- Landing page title and hero text
- README.md
- CLAUDE.md
- All documentation references
- Meta tags and page titles across all feature tools
- The "About" section bio text

This should be a single find-and-replace pass across the codebase once the 21-item expansions are done.

---

## Open questions for Joe

1. Should the FAQ get the 21 treatment or skip it?
2. For the comparisons — do we write all 14 ourselves, or hold off until we can get Jay to weigh in on which ones matter most?
3. For the landing page "21" branding — do we want a dedicated section ("21 things"), or just weave the number into the existing sections?
4. Card images for featured works — use Unsplash stock photos (like the current 6), or generate something else?
