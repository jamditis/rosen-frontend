# Questions for Rosen — Wednesday handoff call

Living checklist of things to confirm with Jay Rosen on the upcoming call. Joe leads the call; this list is the cheat sheet. Items get added as more autonomous work surfaces ambiguity.

Cross-reference: `docs/JAY_ROSEN_HANDOFF_GOAL_PROGRESS.md` for the broader plan.

> **Heads up:** Wednesday May 27 is NOT a 1:1 call. Per Eli Kuslansky's May 22 email, Marla Supnick and Eli are joining. They've done their own design thinking on the project and want to discuss "next best steps." Many questions below are already answered in prior emails/Fathom — they're kept here as the cheat sheet, not as "things we don't know."

## Top 5 things Joe should walk in knowing

1. **Be ready to articulate the Internet-Archive / AI-scraping mitigation.** Jay re-sent the Nieman Lab link the day before the call. "Nah I figured out a way around that" did not satisfy him.
2. **The April 7 automated-intake commitment is the deliverable Jay expects.** Quoted back to Joe May 6. Either deliver, or set a firm date.
3. **Know your position on Unified Field's role.** Marla + Eli will pitch design ideas; decide before the call how receptive vs. scoped-down.
4. **Naming:** the archive is "The Jay Rosen Internet Archive" — drop "Digital" anywhere it still appears.
5. **Hali Rosen is the second submitter alongside Rafi.** Make sure she's named in the handoff plan.

## Editorial / curation

1. **Records with no recoverable URL** (CLAUDE.md L349 + issue #199): are RECORD-00663, 00667, 00673, 00693, 00694, 00700 truly unrecoverable, or does Jay have backups (Dropbox, hard drive, old email) of the original publications?
2. **Gap-fill recoveries:** the stale branch `claude/gap-fill-early-2000s` has 39 articles recovered from Wayback / Firecrawl that lost their original URLs. Is Jay OK with the recovered text being published with a "recovered, original URL unknown" annotation, or should those records stay out of the archive until URLs are confirmed?
3. **Entity classification edits** (issue #199 + ENTITY_AUDIT_REPORT.md §2.1): "iowa", "vietnam", "white house", "world economic forum", "2024 election" are duplicate-classified (Event vs Location, Event vs Organization). Does Jay have a preference, or should we just pick one based on the dominant usage in the records?
4. **Romenesko** (ENTITY_AUDIT_REPORT.md §2.3): is "Romenesko" the person (Jim) or the blog/organization? Both are currently in the data as separate entities. Should we merge or keep distinct?
5. **Editorial preferences on era labels:** is the canonical 8-era taxonomy fine, or does Jay want different period names? (The current set is data-driven: COVID-19 era, Second Trump Administration era, etc.)

## Content gaps

6. **Substack / newsletter:** does Jay have a Substack? (PressThink is his primary; any other newsletter platforms we should pull from?)
7. **Bluesky / Mastodon ongoing:** the archive has Bluesky posts through some date — does Jay want continued ingestion of new posts going forward, and from what handles?
8. **Podcast appearances:** does Jay have a personal list of appearances he wants in the archive (Recode, On the Media, Slate Political Gabfest, etc.), or do we sweep open sources and present a list for him to approve?
9. **NYU / Studio 20 documents:** are there syllabi, course materials, or program documents from his teaching that Jay wants included?
10. **Edited volumes / chapters:** beyond the dissertation, are there book chapters or edited volumes we should include (e.g., "What Are Journalists For?" the book is in the archive — what about others)?

## Workflow & ownership

11. **Authoring workflow:** is Jay willing to use a Google Sheet as the front door for new records? He already uses Google; the alternative is asking Joe to do it.
12. **"Publish" button vs weekly cron:** would Jay prefer clicking a "Publish now" button when he's added something, or having it auto-publish every Sunday regardless? (Or both as a fallback?)
13. **Email notifications:** does Jay want an email confirmation when (a) he submits a record, (b) the deploy succeeds, (c) the deploy fails?
14. **WP credentials:** Jay's current admin can either generate a dedicated "application password" for the deploy automation, or we use direct SFTP from the host. Both are fine; which does Jay prefer / can the host (Bluehost?) provide?
15. **Repo ownership:** the GitHub repo is currently jamditis/rosen-frontend (Joe's account). Should it transfer to a Jay-owned account, an NYU-affiliated org, or stay where it is with Jay added as collaborator?
16. **Hosting bill:** who pays for pressthink.org's WordPress hosting now, and what happens at renewal? (For long-term sustainability, the answer matters.)
17. **Emergency contact:** if Joe is unreachable AND the site breaks, who does Jay call? (NYU IT? Bluehost support? A specific named person?)

## Long-term

18. **Successor curator:** is there anyone Jay trusts to help maintain the archive after he stops adding to it (a student, a colleague, family)? Useful for the handoff manual.
19. **Pace of additions:** roughly how often does Jay expect to add new records — daily, weekly, monthly, "as I write things"? Sizes the deploy automation.
20. **Right-to-remove:** if Jay wants something taken down later, what's the process? (Currently: edit CSV → re-export. Should be simpler.)
21. **Dissertation update?:** is the dissertation content as published considered final, or is there a chance of revisions/annotations Jay wants to add over time?
22. **Public takedown requests:** if a third party complains about a record (a critic, a subject, etc.), who decides what to do? Jay alone, Joe consulted, an editorial board?

## Technical (lower priority, only if Jay wants to weigh in)

23. **Site analytics:** does Jay want any usage analytics (which records are read most, etc.), or is he fine with no tracking on principle?
24. **Comments / reactions:** any interest in adding a comment or "respond" feature, or stays read-only forever?
25. **Newsletter from the archive:** any interest in a "new in the archive this month" RSS feed or email digest? The RSS infrastructure already exists.

## Facts recovered from the two Joe-Jay Fathom calls (loaded via Playwright 2026-05-24)

The summaries from these two calls answered (or partially answered) many of the questions originally on this list. The full transcripts are available behind the Fathom UI if more detail is needed.

### From the Nov 8, 2025 check-in (110 min) — https://fathom.video/share/nxXDedW1_oBqUykTojzNsw_qLidTggw9

Jay's stated preferences from that meeting:

- **AI hallucinations are a concern.** Jay wanted a chatbot that "answers questions using only the archive's content, preventing hallucinations." Decision: NotebookLM (Google, free) or custom embed.
- **A $10/mo budget cap is acceptable** for the custom AI chatbot, with per-user query limits to prevent abuse. (This **contradicts** the "zero recurring cost" framing from the March 1 Joe-Rafi call — Jay himself agreed to a bounded recurring cost.)
- **Visual aesthetic preference: "dusty library"** — distinct from the modern PressThink theme, to reflect the archive's historical nature.
- **Open-source ambition:** "out-of-the-box tool for others to replicate" — Jay wants the project to serve as a model for other scholars' legacies (matches the March 1 framing).
- **"Citizen of the web" documentation framing** — Jay specifically wanted the docs to address ethical use of content.

Action items from Nov 8 that may STILL be open:

- Jay was to **export Facebook and LinkedIn archives.** Repo has Twitter (26,114), Bluesky (3,016), Tumblr (137). No FB or LinkedIn. Worth asking Wednesday whether he still has those exports.
- Jay was to **contact NYU for digitized dissertation copy** to fill missing pages. Dissertation was published Dec 14 — likely resolved, worth confirming.

Beta testers / potential collaborators named:
- A **Columbia PhD student** received early dissertation PDF access (name not in summary)
- **Sam Earle** wrote a "Scholar's Response" commentary for the archive

### From the Dec 8, 2025 launch-prep call (29 min) — https://fathom.video/share/zdfnoeQSZro_TajSBSYNF43EVy_oiong

- **Phased rollout was the launch strategy:** Phase 1 = reader/FAQ/annotated excerpts; Phase 2+ = Concept Explorer / Then & Now / advanced tools added over time.
- **Editorial feedback workflow:** "single Google Doc with tabs" — Jay's preferred mechanism, replacing scattered emails. Jay adds notes and screenshots to a "Jay's notes on website" tab.
- **Headline SEO preference:** plain descriptive headlines like "About Jay Rosen's 1986 PhD dissertation" optimized for search-engine discovery.
- **Shareable quote PNGs** with embedded chapter citation = key feature decision (already shipped).
- **URL pattern:** `pressthink.org/jay/dissertation` (single-letter folder for clean URLs — same convention as `/j/rosen-archive/`).
- **NotebookLM integration** was the chosen AI chatbot approach.

### What this changes for the handoff plan

- "Zero recurring cost" is wrong — the working constraint is "hard budget cap, abuse-proof." This **opens up** more deploy options (Cloudflare paid tier, scheduled compute, etc.).
- "Jay is nontechnical" overstates it — Jay engaged with tech tradeoffs in the Nov 8 call (NotebookLM vs custom embed, budget caps, etc.). He's a technically curious lay user, not totally uncomfortable with the choices.
- The "Google Doc with tabs" editorial workflow is **already proven** — that's Jay's preferred input mode, not a hypothetical.
- "Beta tester / Columbia PhD student / Sam Earle" are potential backup-curator candidates — worth naming on the call.
- The Facebook + LinkedIn exports being open is a **concrete content sweep target**.

## Updated questions (post-Fathom review) — what's actually open

## Questions surfaced by the Fathom-transcript review (2026-05-24 agent run)

Only the March 1 Joe-Rafi handoff was directly extractable. There are no direct Joe-Jay recordings in Drive (the Nov 8 + Dec 8 calls are there as metadata only — see TODO above). Everything below is genuinely new info we need from Jay himself:

26. **Editorial scope vetoes:** are there categories of content you want excluded? (Guest posts on others' sites, podcast guest spots, classroom-lecture recordings.) The current ~1,000-item corpus was curated by Joe's judgment, not yours.
27. **Social posts permanence:** ~27,000 Bluesky/Tumblr/Twitter posts are a first-class part of the archive today. Do you want them to stay there, or moved into a separate "social" view?
28. **Dissertation framing:** the 1986 dissertation has "interactive tools" wrapped around it (mind map, glossary, FAQ, reader with selection sharing). Are you comfortable with that framing, or do you want it presented as a static scholarly document?
29. **Backup curators beyond Rafi:** anyone else (NYU colleagues, former students, family) you want named as backup if Rafi is unavailable?
30. **Hosting and domain ownership long-term:** stay with you indefinitely, or pass to Rafi at some point?
31. **Quietly-wanted features:** anything you've privately wished for but haven't asked for? Anything you've seen on another scholar's site you'd like here?
32. **Features to veto:** AI-generated summaries of your work? Recommendation widgets? "Related posts" surfacing other writers alongside yours?
33. **Tinder-swiping classification UI:** Joe's idea for fast classification of new records. Do you want to be in the loop on classification decisions, or fully delegate to Rafi?
34. **Free-tier Gemini credits:** today's classification uses free Gemini API credits. If those expire, three options — Rafi pays out of pocket; you fund API costs; or auto-tagging stops and new records get human-only tags. Which?
35. **Formal launch:** PressThink post / NYU comms moment, or quiet public availability?
36. **Posthumous plan:** when you're no longer adding new work, should the archive freeze gracefully, or do you want a designated literary executor to keep adding?

## Things to NOT ask (Joe's decision per 2026-05-24)

- Storage architecture (CSV vs SQLite vs Sheets) — Joe decides
- Deploy mechanism choice — Joe decides
- Repo restructuring — Joe decides

---

Update this file as new questions surface during autonomous work.
