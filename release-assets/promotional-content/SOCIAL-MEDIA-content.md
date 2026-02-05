# Social Media Content Package
## Jay Rosen Internet Archive Launch

---

## TWITTER/X THREADS

### Thread 1: The Origin Story (7 posts)

**Post 1:**
I spent the last 2 months building a digital archive of @jayrosen_nyu's 40 years of journalism criticism.

869 records. 29,187 social posts. 25,972 entities. 16,539 relationships.

Here's how we did it (and what we learned):

🧵

---

**Post 2:**
The challenge: Jay has been writing about journalism since 1986. His work is scattered across PressThink, newspapers, Twitter, Tumblr, YouTube, and academic journals.

Links decay. Platforms disappear. How do you preserve 40 years before it fragments?

---

**Post 3:**
The solution: A Python pipeline feeding a React frontend. But with a twist:

No build step. No Node.js. No npm.

Just files you can FTP to any server.

Why? Because archives need to last decades. Dependencies rot. Static files don't.

---

**Post 4:**
The AI collaboration part:

275 total commits
- 140 from me (51%)
- 85 from Claude (31%)
- 50 from Copilot (18%)

Nearly half the work was AI-assisted. But humans made all the architecture decisions.

---

**Post 5:**
The data pipeline:
- 10,000 posts processed through Gemini for entity extraction
- 5-worker parallel processing (7 hours → 91 minutes)
- 90.1% success rate
- ~$50 total API cost

Entity deduplication was the hard part. "NYT" and "The New York Times" are the same entity.

---

**Post 6:**
The design philosophy:

We got feedback that we were building "AI slop"—generic corporate aesthetics.

So we threw it out.

New design: 1980s research library. Aged paper. Manila folders. Faded ink.

The archive should feel like walking into a library, not a startup.

---

**Post 7:**
The archive is live at pressthink.org/j/rosen-archive/

You can:
- Search 40 years of journalism criticism
- Explore a 3D concept map of his dissertation
- Read "The Impossible Press" (1986) in full
- See how his ideas connect across decades

It's free. It's searchable. It's preserved.

---

### Thread 2: The Dissertation Focus (5 posts)

**Post 1:**
In 1986, @jayrosen_nyu wrote a dissertation called "The Impossible Press."

It argued that "the press informs the public" obscures more than it reveals.

40 years later, that thesis has never been more relevant.

Now you can read it in full—with 9 interactive exploration tools:

---

**Post 2:**
The tools we built:

1. Full-text reader with shareable quotes
2. 3D concept map (45+ nodes)
3. "Then and Now" 1986 vs 2025 comparisons
4. Glossary of 16 key concepts
5. Timeline: dissertation → today
6. FAQ with 46 questions
7. Annotated excerpts

---

**Post 3:**
The design challenge:

How do you make a 1986 academic dissertation feel alive in 2025?

Answer: You don't just digitize it. You connect it.

Every concept links to later work. Every prediction connects to what happened. The dissertation becomes a lens, not a museum piece.

---

**Post 4:**
Key finding from the data:

"The people formerly known as the audience" is Jay's most prominent concept (10/10 rating).

But here's what surprised me: 59% of concept adoption is by individuals, not institutions.

His ideas spread grassroots, not top-down.

---

**Post 5:**
Read it yourself:

Full dissertation: pressthink.org/j/rosen-archive/dissertation/reader/

Interactive archive: pressthink.org/j/rosen-archive/

The impossible press remains impossible. But now we can explore why.

---

### Thread 3: Technical Deep Dive (5 posts)

**Post 1:**
Technical thread: How do you build a 30,000-record archive with AI?

Here's our stack and what we learned about entity extraction at scale:

---

**Post 2:**
The entity extraction problem:

10,000 social posts needed processing. Sequential = 7 hours. Cost = $100.

Solution: 5-worker parallel processing with per-worker rate limiting.

Result: 91 minutes. $50. 90.1% success rate.

Key: `time.sleep(2)` per worker prevents quota exhaustion.

---

**Post 3:**
The deduplication problem:

"The New York Times" vs "NY Times" vs "NYT" vs "New York Times"

All the same entity. But naive extraction treats them as four.

Solution: Normalization pipeline with canonical ID registry. 25,972 extractions → 4,724 unique entities.

---

**Post 4:**
The zero-build decision:

We threw away Vite, Webpack, all build tools.

React 18 via CDN (esm.sh)
HTM for JSX-like syntax
Tailwind via CDN
Static JSON data

Result: FTP upload. Works forever. No dependency rot.

Counterintuitive in 2025. Essential for archives.

---

**Post 5:**
Full technical writeup coming soon.

Code is open source: github.com/jamditis/rosen-frontend

The archive: pressthink.org/j/rosen-archive/

---

## BLUESKY POSTS

### Post 1: Announcement
I built a digital archive of Jay Rosen's 40 years of journalism criticism.

869 curated records. 29,187 social posts. 16,539 mapped relationships.

And his 1986 dissertation—"The Impossible Press"—is now publicly available with 9 interactive tools.

pressthink.org/j/rosen-archive/

### Post 2: The Design Story
We got feedback that our archive looked like "AI slop"—generic corporate aesthetic.

So we redesigned everything around 1980s research libraries: aged paper, manila folders, faded ink, card catalog greens.

The archive should feel like walking into a library, not a startup.

### Post 3: The Stats
The Jay Rosen Internet Archive by the numbers:

- 869 curated records
- 29,187 social posts processed
- 25,972 entities extracted
- 16,539 relationships mapped
- 9 dissertation exploration tools
- 46 FAQ questions answered
- 40 years of journalism criticism

Free and searchable at pressthink.org/j/rosen-archive/

### Post 4: The Dissertation
"The phrase 'the press informs the public' obscures more than it reveals."

—Jay Rosen, "The Impossible Press" (1986)

Written before the internet. Before social media. Before the current media crisis.

Now available to read in full: pressthink.org/j/rosen-archive/dissertation/reader/

### Post 5: Human-AI Collaboration
275 commits to build the Jay Rosen Internet Archive:
- 51% human (me)
- 31% Claude
- 18% Copilot

AI accelerated the work. Humans directed it. Architecture decisions, design philosophy, editorial quality—all human.

The future of building is collaborative.

---

## LINKEDIN POST

**Building the Jay Rosen Internet Archive: Lessons in Human-AI Collaboration**

For the past two months, I've been building a digital archive of Jay Rosen's 40 years of journalism criticism—869 curated records, 29,187 social media posts, and his 1986 dissertation "The Impossible Press."

The project taught me something unexpected about AI collaboration.

**The numbers:**
- 275 total commits
- 51% from me
- 31% from Claude (Anthropic)
- 18% from GitHub Copilot

Nearly half the work was AI-assisted. But here's what the AI *didn't* do:

**Architecture decisions:** When we decided to abandon build tools and go zero-build (React via CDN, deployable via FTP), that was a human judgment call about longevity over convenience.

**Design philosophy:** When feedback called our aesthetic "AI slop," the decision to pivot to 1980s research library aesthetics—aged paper, manila folders, faded ink—was a human creative choice.

**Editorial quality:** When Jay Rosen himself reviewed the landing page and suggested restructuring, integrating that feedback required understanding context AI couldn't see.

**Priority calls:** Deciding what goes in Phase 1 vs Phase 2 required understanding stakeholder needs, deadline constraints, and scope management.

AI accelerated everything. Entity extraction that would have taken 7 hours took 91 minutes with parallel processing. Code that would have taken days took hours.

But acceleration only matters if you're going in the right direction. That's the human job.

**The archive is live:** pressthink.org/j/rosen-archive/

If you're interested in digital humanities, journalism history, or human-AI collaboration, take a look. The code is open source at github.com/jamditis/rosen-frontend.

#DigitalHumanities #AI #Journalism #Archives #OpenSource

---

## THREADS (META)

### Post 1
I built a digital archive of Jay Rosen's journalism criticism.

40 years of work. 869 curated records. His 1986 dissertation now publicly available.

And nearly half the commits came from AI assistants.

Here's what I learned about human-AI collaboration:

### Post 2
The AI did:
- Entity extraction from 10,000 posts
- Code generation and debugging
- Documentation drafting

The AI didn't do:
- Architecture decisions (zero-build deployment)
- Design philosophy (rejecting generic aesthetics)
- Editorial judgment (integrating Jay's feedback)

Acceleration vs. direction.

### Post 3
The archive is free and searchable.

You can explore how "the people formerly known as the audience" connects to ideas from 1986.

You can read the dissertation that predicted today's media crises.

pressthink.org/j/rosen-archive/

---

## KEY QUOTES FOR ANY PLATFORM

**On the dissertation:**
> "The phrase 'the press informs the public' obscures more than it reveals." —Jay Rosen, 1986

**On the archive:**
> "869 records, 29,187 posts, 40 years of journalism criticism—now searchable and interconnected."

**On design:**
> "We rejected 'AI slop' and designed like walking into a 1980s research library."

**On collaboration:**
> "51% human, 49% AI. Acceleration from machines, direction from humans."

**On the mission:**
> "The impossible press remains impossible. But now we can explore why."

---

## HASHTAGS BY PLATFORM

**Twitter/X:**
#Journalism #MediaCriticism #DigitalHumanities #OpenSource #AI

**Bluesky:**
(Bluesky doesn't use hashtags prominently—focus on plain text)

**LinkedIn:**
#DigitalHumanities #AI #Journalism #Archives #OpenSource #MediaStudies

**Threads:**
#Journalism #Media #AI #Archives

---

## IMAGE SUGGESTIONS

1. **Hero screenshot:** Landing page with typewriter aesthetic
2. **3D concept sphere:** Screenshot of interactive visualization
3. **Stats graphic:** Key numbers (869 records, 25,972 entities, etc.)
4. **Before/after design:** Generic vs. vintage library aesthetic
5. **Commit breakdown:** Pie chart of human vs AI contributions
6. **Timeline graphic:** 1986 → 2025 showing dissertation to present

---

## TIMING RECOMMENDATIONS

**Launch day:**
- Thread 1 (origin story) on Twitter/X
- Announcement post on Bluesky
- LinkedIn long-form post

**Day 2:**
- Thread 2 (dissertation focus) on Twitter/X
- Design story on Bluesky

**Day 3:**
- Thread 3 (technical deep dive) on Twitter/X
- Stats post on Bluesky

**Week 2:**
- Threads (Meta) content
- Follow-up posts based on engagement

---

*Content package prepared for Jay Rosen Internet Archive launch, January 2026*
