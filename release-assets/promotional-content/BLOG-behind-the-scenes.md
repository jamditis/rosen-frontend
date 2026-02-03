# How We Built the Jay Rosen Digital Archive: A Behind-the-Scenes Story

*From scattered beginnings to a 30,000-record research platform in 49 days*

---

## The Challenge: 40 Years of Work, Scattered Everywhere

Jay Rosen has been writing about journalism since before the internet existed. His 1986 dissertation "The Impossible Press" predicted many of the media crises we face today. But like most academics, his work was scattered across dozens of platforms: the PressThink blog, newspaper op-eds, Twitter threads, Tumblr posts, YouTube videos, and academic papers spanning four decades.

Links decay. Platforms disappear. Paywalls go up. The challenge was clear: how do you preserve and make accessible 40 years of journalism criticism before it fragments into digital ephemera?

The answer became the Jay Rosen Digital Archive.

---

## The Numbers

Before diving into the story, here's what we built:

| Metric | Count |
|--------|-------|
| Total commits | 275 |
| Development time | 49 days (Nov 19 - Jan 6) |
| Archive records | 869 |
| Social media posts processed | 29,187 |
| Entities extracted | 25,972 |
| Relationships mapped | 16,539 |
| Dissertation exploration tools | 9 |

And perhaps most surprisingly:

| Contributor | Commits |
|-------------|---------|
| Joe Amditis (human) | 140 (51%) |
| Claude AI | 85 (31%) |
| GitHub Copilot | 50 (18%) |

Nearly half the commits came from AI assistants. This is a story of human-AI collaboration at scale.

---

## Phase 1: The Scattered Beginnings (Pre-November 2025)

The project didn't start as a monorepo. It started as two separate repositories—one for the frontend (the public interface) and one for the backend (the data pipeline). This reflected my learning curve with GitHub; I was still figuring out how to organize a project of this scope.

The backend repository (`rosen-archive`) contained:
- A Python pipeline for scraping and processing content
- Google Gemini integration for AI-powered categorization
- Entity extraction and relationship mapping
- PDF generation for archival copies

The frontend (`rosen-frontend`) was a React application for exploring the archive. Initially, it used Vite for building—the standard modern JavaScript setup.

---

## Phase 2: The Zero-Build Decision (November 29, 2025)

Ten days into development, we made an architectural pivot. The commit message reads simply:

> "Convert to vanilla JS, remove Vite build system"

Why throw away the standard tooling? Because the archive needed to be deployable via FTP to a WordPress subdirectory. No npm. No Webpack. No build step. Just upload the files and it works.

This "zero-build philosophy" became a core principle:
- All dependencies loaded via CDN (esm.sh)
- React 18 without Node.js
- Works on any static web host
- No dependency rot over decades

It's counterintuitive in 2025 to abandon build tools. But for a scholarly archive meant to last, simplicity wins.

---

## Phase 3: The Great Merge (November 29, 2025)

The same day we went zero-build, we unified the two repositories. Commit `0b51cfa`:

> "feat: Merge rosen-archive repository into monorepo"

The dissertation launch deadline was approaching (December 2025). Having everything in one place meant:
- Unified version control
- Simpler CI/CD
- Co-location of frontend, backend, data, and documentation
- Easier onboarding

From this point forward, the project accelerated.

---

## Phase 4: The December Sprint

The commit distribution tells the story:

| Month | Commits |
|-------|---------|
| November 2025 | 37 |
| December 2025 | 231 |

December saw **6x the development activity**. On December 1st alone, we pushed 136 commits—nearly half the entire project's history in a single day.

What were we building?

### The Dissertation Tools

Nine distinct tools for exploring "The Impossible Press":

1. **Mind Map** - 70+ nodes mapping the dissertation's structure
2. **3D Concept Sphere** - Three.js force-directed graph with 45+ concepts
3. **Then and Now** - 7 side-by-side 1986 vs. 2025 comparisons
4. **Glossary** - 16 key concepts with definitions
5. **Timeline** - 14 milestones from 1986 to 2025
6. **Annotated Excerpts** - 12 key passages with 2025 commentary
7. **FAQ** - 46 questions answered by the dissertation
8. **1986 Context** - The media landscape when it was written
9. **Dissertation Reader** - Full text with shareable quote generation

### The Data Pipeline

Processing at scale:
- **10,000 social media posts** run through entity extraction
- **5-worker parallel processing** reduced 7 hours to 91 minutes
- **25,972 entities** and **16,539 relationships** identified
- **90.1% success rate** on AI-powered extraction

### Thread Reconstruction

Bluesky posts don't come with threading metadata. We had to reconstruct conversations:
- 3,071 Bluesky posts parsed into hierarchies
- AT Protocol URI parsing for parent-child relationships
- Circular reference detection
- 10 major thread records generated for the archive

---

## Phase 5: The Design Philosophy Shift (December 5, 2025)

Midway through the sprint, we got feedback that stung:

> "You tend to converge toward generic, 'on distribution' outputs... make creative, distinctive frontends that surprise and delight."

We looked at what we'd built. Bright Tailwind colors. Clean corporate aesthetic. It looked like every other AI-assisted website.

So we threw it out.

The new design system drew from 1980s university research libraries:
- **Aged newsprint background** (#f5f1e8) instead of sterile white
- **Faded newspaper ink** (#2c5f82) instead of bright sky blue
- **Manila folder amber** (#d4a574) instead of generic gold
- **Library catalog green** (#3a5f3f) instead of bright emerald

We added atmospheric details: paper grain textures via SVG noise, index card lines, dog-eared corners, torn paper dividers. The goal was to make users feel like they'd walked into an archive, not a startup.

The design system shipped with 200+ CSS custom properties and 6 reusable components. But more importantly, it shipped with *character*.

---

## Phase 6: Jay Rosen's Feedback (December 8-10, 2025)

The project wasn't just technical work. Jay Rosen himself shaped the final product.

On December 8th, we had a prep call. Based on his feedback, we restructured for a "Phase 1" launch:

**Kept for Phase 1:**
- Read the announcement (blog post link)
- Read the full text (dissertation reader)
- FAQ (46 questions)
- Annotated excerpts

**Deferred to Phase 2:**
- 3D concept map
- Glossary
- Timeline
- 1986 context page

The commit messages from December 10th show real-time iteration:
- "feat: Implement Jay Rosen's Dec 10 feedback on landing page"
- "feat: Streamline landing page per Jay's feedback"

This wasn't a developer building in isolation. It was collaboration between the subject (Jay), the curator (me), and AI assistants (Claude, Copilot).

---

## What We Learned

### 1. Zero-Build Has Real Benefits

For archives meant to last decades, simplicity wins. Dependencies rot. CDN-loaded React via esm.sh will work as long as browsers support ES modules—which is to say, indefinitely.

### 2. Human-AI Collaboration Works

49% of commits came from AI. But human judgment remained essential for:
- Architectural decisions (zero-build, monorepo merge)
- Design philosophy (rejecting "AI slop")
- Editorial quality (Jay's feedback integration)
- Priority calls (Phase 1 vs Phase 2 features)

AI accelerated the work. Humans directed it.

### 3. Taxonomy Drift Is Real

We discovered 14 overlapping era definitions and 862 tag variations ("New York Times" vs "new york times"). Data quality requires constant vigilance. We consolidated to 8 clean eras and normalized 2,992 tag instances.

### 4. The Dissertation Is the Story

Everything else—the pipeline, the visualization, the design system—supports one thing: making a 1986 dissertation accessible and relevant in 2025. The technology serves the scholarship, not the reverse.

---

## The Archive Today

As of January 2026, the Jay Rosen Digital Archive contains:

- **869 archive records** spanning articles, social posts, threads, and the dissertation
- **29,187 social media posts** with full-text search
- **25,972 entities** connected through **16,539 relationships**
- **9 interactive tools** for exploring the dissertation
- **A knowledge graph** enabling research into 40 years of journalism criticism

It's deployed at pressthink.org/j/rosen-archive/ via simple FTP upload. No Node.js. No build step. Just files on a server.

---

## What's Next

Phase 2 will add:
- The full 3D concept sphere
- Interactive glossary with key figures
- Ideas timeline showing concept evolution
- 1986 historical context page

But the core mission is complete: Jay Rosen's work—from a dissertation written before the World Wide Web existed to posts published yesterday—is now searchable, interconnected, and preserved.

The impossible press remains impossible. But understanding why is now possible for anyone with a web browser.

---

*Joe Amditis is the curator of the Jay Rosen Digital Archive. The archive was built with assistance from Claude (Anthropic) and GitHub Copilot.*

---

**Links:**
- [Jay Rosen Digital Archive](https://pressthink.org/j/rosen-archive/)
- [The Impossible Press: Full Text](https://pressthink.org/j/rosen-archive/dissertation/reader/)
- [GitHub Repository](https://github.com/jamditis/rosen-frontend)
