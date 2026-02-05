# Jay Rosen feedback session - December 10, 2025

This document records all changes requested by Jay Rosen during the final review of the dissertation landing page.

## Changes implemented

### 1. Committee text too faded/small on title page
**Request:** The text "Jay Rosen's 1986 PhD Dissertation at New York University / Committee: Professors Neil Postman (Chair), Christine Nystrom, Henry Perkinson" felt faded and hard to read.

**Fix:** Updated `.hero-meta` CSS:
- Font size: `0.85rem` → `0.95rem`
- Text color: `stone-500` → `stone-300` (lighter, more visible)
- Added `font-weight: 400`
- Strong text now uses `stone-100` instead of `stone-300`

---

### 2. Change "Read the Announcement" to "Read Jay's Essay"
**Request:** Rename the button/link text from "Read the Announcement" to "Read Jay's Essay"

**Fix:** Updated in three locations:
- Hero button: "Read the Announcement →" → "Read Jay's Essay →"
- Nav card title (later removed): "Read the announcement" → "Read Jay's essay"
- Nav card arrow (later removed): "→ Read post" → "→ Read essay"

---

### 3. Missing dead simple path to the dissertation
**Request:** "One thing I think we might be missing is the dead simple, no frills way for the user to immediately push a button and be 'in' or at the dissertation."

**Fix:** Added a new section directly below the hero with a prominent "Read the Dissertation →" button that links directly to `/j/rosen-archive/dissertation/reader/`

---

### 4. Dan Kennedy attribution format
**Request:** Change the hero quote attribution to "—Dan Kennedy, Media Nation, read the rest"

**Fix:** Updated attribution from:
`—Dan Kennedy, Media Nation` (with Media Nation as link)

To:
`—Dan Kennedy, Media Nation, read the rest` (with "read the rest" as link)

---

### 5. Samuel Earle's commentary buried too deep
**Request:** "We don't get to read Samuel Earle's commentary until the very end. I don't think that works. We hear about it, but we don't actually 'get' it."

**Fix:**
- Moved the full "Scholars respond" section (with Samuel Earle's card) up to right after "How to explore this dissertation"
- Removed the duplicate teaser card from the "Explore the dissertation" section
- New page order: Hero → Start Reading → How to explore → Scholars respond → About Jay Rosen → Coming Soon → Footer

---

### 6. How to explore cards need obvious buttons
**Request:** Add obvious buttons to the two cards in the "How to explore" section to make it clear they are clickable.

**Fix:**
- Added "Open the Reader →" button to the reader card
- Added "Open NotebookLM →" button to the PDF/AI tools card
- Created `.how-to-cta` CSS class with sky blue button styling

---

### 7. Remove redundant "Explore the dissertation" section
**Request:** Get rid of the redundant section with Jay's essay since it's already accessible via the hero button.

**Fix:** Removed the entire "Explore the dissertation" section that only contained the Jay's essay card.

---

### 8. Align CTA buttons at bottom of How to explore cards
**Request:** Align both buttons in the "How to explore" section with the bottom of the cards instead of having them float under the text.

**Fix:**
- Changed `.how-to-card` from `display: block` to `display: flex; flex-direction: column`
- Changed `.how-to-cta` to use `margin-top: auto` to push buttons to the bottom

---

### 9. Add "Scholars respond" scroll button
**Request:** Add a secondary subdued button next to the blue "Read the Dissertation" button that says "Scholars respond" with a down arrow that scrolls to Earle's section.

**Fix:**
- Added `id="scholars-respond"` to the Scholars section
- Added secondary button with ghost/outline style next to the primary CTA
- Button text: "Scholars respond ↓"
- Links to `#scholars-respond` for smooth scroll

---

## Final page structure

1. **Hero** - Title, subtitle, committee info, Dan Kennedy quote, two buttons (Read Jay's Essay, Read Full Bio)
2. **Start Reading** - Two buttons: "Read the Dissertation →" (primary) and "Scholars respond ↓" (secondary)
3. **How to explore** - Two cards with CTA buttons: Reader and NotebookLM
4. **Scholars respond** - Samuel Earle's full commentary card with timeline visualization
5. **About Jay Rosen** - Bio section with photo and Dan Kennedy text
6. **Coming Soon** - Teaser for the full Jay Rosen Internet Archive
7. **Footer** - Links and attribution

---

## Pending items mentioned by Jay

1. **NotebookLM explanation:** Jay mentioned he will explore NotebookLM in coming days and may want to edit the subheading to make it easier to understand what NotebookLM is and how to use it.

2. **Glasses icon:** Attempted to extract the glasses icon (👓) that appears at the end of PressThink posts, but it's rendered via CSS `::after` pseudo-element and couldn't be extracted via web fetch. May need to get the asset directly from Jay or screenshot it.
