# Making-of narrative interview guide

This is the operating guide for interviewing Joe Amditis about how he built the
Jay Rosen Archive and turning that interview into an accurate first-person
narrative. It is both the question bank and the editorial strategy.

The existing draft at `features/making-of/index.html` is **not approved
first-person testimony**. Use it as a map of possible events and themes, not as
evidence of what Joe thought, felt, intended, or agreed to disclose.

## Assignment

Interview Joe section by section. Let him answer in fragments, tangents,
approximate dates, corrections, and stream-of-consciousness notes. Then help him
turn those answers into:

1. a coherent chronological account of the project;
2. thematic highlights about preservation, agent-assisted work, data quality,
   design, and sustainability;
3. prose that sounds recognizably like Joe rather than generic institutional
   copy; and
4. a fact-checked, curator-approved replacement for the current making-of page.

Do not publish, deploy, merge, or remove the existing deployment hold without
Joe's explicit approval.

## Source-of-truth order

When sources disagree, use this order:

1. Joe's direct account for his motivations, feelings, decisions, negotiations,
   and private conversations.
2. Current repository and data files for present-day counts, architecture,
   behavior, and deployment state.
3. Git history, merged pull requests, issues, and dated project documents for
   chronology and implementation evidence.
4. `docs/narrative/` for a useful project-history map that may contain stale
   details.
5. `features/making-of/index.html` only as a prompt generator.

Never use polished prose from the old page as proof that Joe said or approved a
claim.

## Interview strategy

### Work in short rounds

- Ask one numbered round at a time.
- Begin with one broad invitation, not a wall of questions.
- Use the listed prompts only as follow-ups for gaps in Joe's answer.
- Keep each turn conversational. Two or three follow-ups are usually enough.
- Do not move on merely because every prompt has technically been answered.
  Move on when the section has a scene, a decision, and a consequence.

### Let the first answer stay messy

Joe does not need to produce polished prose. Encourage fragments, remembered
dialogue, uncertain dates, side stories, and later corrections. Do not interrupt
a productive tangent to enforce chronology. Capture the material first;
structure it afterward.

### Reflect before advancing

At the end of each round:

1. summarize the factual sequence in a few bullets;
2. identify the emotional or thematic center you heard;
3. list uncertainties or claims that need verification;
4. ask Joe what you misunderstood, overstated, or left out; and
5. obtain a clear confirmation before starting the next round.

Do not present the summary as finished prose. It is a checkpoint.

### Preserve voice deliberately

While interviewing, note:

- phrases Joe repeats or emphasizes;
- metaphors and comparisons he reaches for naturally;
- where he becomes funny, frustrated, proud, embarrassed, or ambivalent;
- sentence rhythm, level of technical detail, and preferred vocabulary;
- distinctions he cares enough to correct; and
- moments where the meaning is in the tension rather than a neat lesson.

The final narrative may tighten repetition and reorder material, but it should
not replace Joe's specificity with motivational language, heroic framing, or
generic claims about innovation.

### Separate memory from evidence

Maintain a working claim ledger with four labels:

- **VOICE** — only Joe can authenticate this motivation, feeling, judgment, or
  recollection.
- **VERIFIED** — directly supported by current files, git history, a merged PR,
  an issue, or another primary project artifact.
- **VERIFY** — plausible but needs stronger evidence or a more precise date.
- **PRIVATE / APPROVAL REQUIRED** — contract terms, unpaid work, hosting or
  domain ownership, private conversations, disagreements, or third-party
  details that require explicit permission before publication.

If Joe's memory and the repository differ, show him the evidence and ask how to
represent the discrepancy. Do not silently "correct" his story or force a false
precision onto an approximate memory.

### Find scenes, not just milestones

The repository already contains a long milestone list. The interview should add
what the repository cannot:

- the moment a problem became visible;
- what Joe tried first and why;
- what failed in a memorable way;
- what a decision felt like before its outcome was known;
- who changed his thinking;
- what tradeoff he knowingly accepted; and
- what remains unresolved.

For every major section, try to find one concrete scene or artifact that can
carry the explanation.

## The eight interview rounds

### Round 1 — The origin: why this archive?

Broad invitation:

> Tell me the story from the first spark through the moment this became a real
> project.

Use only the follow-ups that the answer does not already cover:

- When and where did the idea begin?
- Who first raised it, and what did each person think the project was?
- Why Jay Rosen's work, and why did it matter to you personally?
- What problem did you think you were solving—for Jay, researchers, the public,
  or yourself?
- What did you originally agree or expect to build?
- What prior scraping, archiving, journalism, or technical experience shaped
  your response?
- When did it stop feeling like a bounded assignment and start feeling like a
  long-term archive?

Desired material: an opening scene, the original brief, personal stakes, and the
first mismatch between expectation and reality.

### Round 2 — Learning in public

Broad invitation:

> What did you know how to do at the beginning, and what did you have to learn
> in public while the project was already moving?

Possible follow-ups:

- How comfortable were you with git, GitHub, frontend work, data pipelines, and
  deployment when you started?
- Which early mistake best represents that learning curve?
- Was there a moment when the repository itself became part of the archive's
  institutional memory?
- What did embarrassment, uncertainty, or asking for help look like in practice?
- Which habits from that period are still visible in the project today?

Desired material: vulnerability without performative self-deprecation, one
specific early incident, and the transition from improvisation to repeatable
practice.

### Round 3 — Building the pipeline and discovering silent failure

Broad invitation:

> Walk me through how a piece of Jay's work became an archive record, and tell
> me where that process fought back.

Possible follow-ups:

- What were the first sources and extraction methods?
- Why did Google Sheets initially make sense?
- Which source types were hardest to recover—old web pages, video, audio,
  clippings, Tumblr, social posts, or something else?
- Tell the full story of the 725 identical analyses. How was it discovered, and
  what changed afterward?
- What happened in the later paid analysis that was not written back?
- Which failures were obvious, and which looked like success?
- What does "verify the output in the actual data store" mean to you now?

Desired material: a reader-understandable pipeline, two or three vivid failure
stories, and the operating rules those failures produced.

### Round 4 — Working with agents and language models

Broad invitation:

> What changed when agents became collaborators rather than occasional tools?

Possible follow-ups:

- Which models, coding agents, or workflows mattered at different stages?
- What work could agents accelerate, and what judgment stayed with you?
- How did you learn to divide work, review outputs, use tests, and preserve
  context between sessions?
- When did an agent surprise you in a good way? When did apparent confidence
  hide a bad result?
- How did cost, rate limits, context loss, or model changes shape the system?
- What is genuinely new about how the archive was built, and what is simply
  established archival or software practice executed with new tools?
- How would you explain your role: programmer, editor, product owner,
  orchestrator, archivist, or some combination?

Desired material: a candid account of agent-assisted building that avoids both
hype and false modesty, plus concrete practices a future builder could reuse.

### Round 5 — From a list of records to a web of ideas

Broad invitation:

> When did you realize that collecting links was not enough, and what did you
> want people to be able to see across Jay's body of work?

Possible follow-ups:

- How did categories, eras, key concepts, entities, and relationships emerge?
- Which taxonomy decisions required Jay's or another human's judgment?
- What did the categorization failures teach you about plausible-looking data?
- Why was a knowledge graph worth the complexity?
- Which finding or connection made the archive feel intellectually useful rather
  than merely complete?
- How did the dissertation change the scope or meaning of the project?
- Where is the boundary between evidence and curator interpretation?

Desired material: the intellectual turn in the project, an example a general
reader can follow, and an honest account of interpretation and uncertainty.

### Round 6 — Making the archive look like itself

Broad invitation:

> How did the archive find its visual language, and what did you want visitors
> to feel before they understood the technology?

Possible follow-ups:

- What looked wrong about the earliest interfaces?
- Where did the paper, manila-folder, typewriter, and retro-computing ideas come
  from?
- What does "AI slop" mean to you visually, and how did you try to avoid it?
- Which design choices are thematic rather than decorative?
- How did the welcome overlay change from a loading-time disguise into the Start
  Here experience?
- What tensions arose between orientation, sign-up or participation, and getting
  directly into the archive?
- What should the redesigned making-of page feel like that the current draft
  does not?

Desired material: the visual thesis, the visitor experience it serves, and
specific critique that can guide the redesign.

### Round 7 — Handoff, labor, and what nobody automates

This round contains sensitive material. Ask Joe before entering it and remind
him that nothing will be published without a separate approval pass.

Broad invitation:

> What did it take to keep the archive alive after the neat version of the
> project story ended?

Possible follow-ups:

- What was the contract timeline, and what happened after paid work ended?
- What work continued, why did you continue it, and how do you feel about that
  choice now?
- What hosting, domain, access, credential, or ownership constraints shaped
  deployment?
- Describe the manual zip or file-manager workflow accurately. Is it still the
  current process?
- Which design or launch disagreements are important to the story, and which
  should remain private?
- Who can maintain the archive if you step away?
- What is still missing, especially in the 2004–2008 period, and how confident
  are you in any completeness estimate?
- What support would make the archive genuinely sustainable?

Desired material: a truthful sustainability chapter without grievance theater,
unauthorized disclosure, or a falsely resolved ending.

### Round 8 — What would make it count?

Broad invitation:

> Imagine someone encountering this archive years from now. What would have to
> happen for you to feel that the work succeeded?

Possible follow-ups:

- Who do you hope uses it, and what do you hope they do that they could not do
  before?
- What should survive if today’s models, vendors, hosting, or maintainers do not?
- Which imperfection are you willing to leave visible?
- What did the project change about how you understand archives, software,
  journalism, or your own capabilities?
- What advice would you give someone attempting a similar archive with agents?
- What do you want Jay to understand about the work that may not be obvious from
  the finished site?
- What final image, scene, or sentence feels emotionally true?

Desired material: a future-facing ending grounded in use and stewardship, not a
generic statement about technology.

## Cross-cutting follow-ups

Use these sparingly when an answer needs depth:

- "Can you put me in that moment?"
- "What happened immediately before and after that?"
- "What did you believe then that you no longer believe?"
- "What was the tradeoff?"
- "Who else would remember this differently?"
- "Is that a fact we can verify, an estimate, or your interpretation?"
- "Can that be published, or is it context only?"
- "Which phrase in what you just said sounds most like the real point?"

Avoid leading questions that smuggle the old draft's conclusions into Joe's
answer.

## Evidence and verification strategy

After each round, create a private working ledger in the conversation or another
location Joe approves. Do not put raw sensitive interview notes into the public
repository by default.

For every concrete claim, record:

| Claim | Label | Approximate date | Evidence | Publication permission |
|---|---|---|---|---|
| Example: static JSON replaced live Sheet loading | VERIFIED | Dec. 2025 | git history + `docs/narrative/project-history.md` | public |

Useful project evidence includes:

- `docs/narrative/project-history.md`
- `docs/narrative/architecture.md`
- `docs/narrative/data-pipeline.md`
- `docs/narrative/changelog.md`
- `git log --all --date=short`
- merged pull requests and issues
- current source CSVs, generated JSON, `version.json`, and deployment manifest

Refresh every numeric claim immediately before drafting. The current making-of
draft is stale: it identifies release 3.6.5, dates its statistics to 2026-07-07,
and contains counts that have already changed. Never copy those numbers forward
without checking current files.

The following subjects require direct confirmation and explicit publication
approval:

- the claimed 2014 scraping origin;
- personal motivations and emotional reactions;
- git mistakes not documented in public project evidence;
- contract dates, economics, and unpaid labor;
- hosting, credential, domain, or ownership details;
- private conversations and design disagreements;
- the manual deployment arrangement;
- completeness estimates and the 2004–2008 coverage gap; and
- claims about who can or cannot maintain the archive.

## Reconstruction strategy

Do not draft the final page one interview answer at a time. Complete all rounds,
then build these intermediate artifacts:

### 1. Chronology spine

Create a one-page sequence of dated or approximately dated turning points. Keep
only events that change the direction, stakes, method, or meaning of the work.
Routine feature additions belong in supporting detail, not the spine.

### 2. Theme map

Group the strongest material under no more than five recurring themes, such as:

- preservation versus disappearance;
- learning and verification;
- agents as force multipliers that still require judgment;
- turning records into relationships and interpretations; and
- sustainability, ownership, and handoff.

Themes should recur across the chronology rather than becoming isolated essays.

### 3. Scene inventory

Select four to six concrete scenes that can carry technical explanation through
story. Candidate examples include the first agreement to build, discovery of
the identical analyses, a difficult source recovery, the shift away from live
Google Sheets, a design turning point, and a manual deployment or handoff moment.
Use only scenes Joe actually authenticates.

### 4. Voice sheet

Collect Joe's characteristic phrases, metaphors, sentence rhythms, and explicit
do-not-say preferences. Use it to detect prose that is technically polished but
does not sound like him.

### 5. Claim ledger

Resolve every VERIFY item or qualify it honestly. Remove or generalize anything
that cannot be supported. Keep PRIVATE material out of the draft unless Joe
changes its publication permission explicitly.

## Drafting strategy

- Write in first person only from authenticated interview material.
- Open with a scene or decision, not archive statistics.
- Let chronology provide orientation while themes provide meaning.
- Explain technical systems through stakes and consequences before terminology.
- Use exact numbers only when they materially help and can remain current; favor
  a generated or separately maintained stats treatment over numbers embedded in
  long-lived prose.
- Keep uncertainty visible where it matters.
- Avoid presenting every setback as a lesson or every feature as a triumph.
- Do not call the work revolutionary merely because agents were involved.
- Distinguish Joe's interpretation from what the archive data proves.
- End with stewardship and use, not launch-day completion.

The final structure need not preserve the old eight chapters. A likely shape is:

1. opening scene;
2. the original assignment and expanding scope;
3. learning through silent failure;
4. building with agents while retaining judgment;
5. from collection to intellectual map;
6. designing an archive people can enter;
7. labor, handoff, and unfinished preservation; and
8. a brief future-facing coda.

## Editorial approval gates

Do not skip these gates:

1. **Round approval:** Joe corrects the summary after each interview round.
2. **Story brief approval:** Joe approves the chronology, themes, scenes, and
   sensitive-material boundaries before prose drafting.
3. **First-person approval:** Joe reviews the complete prose for voice and
   meaning before it is placed into the page.
4. **Fact check:** Current repository evidence supports every factual claim and
   number.
5. **Design review:** The implemented page receives the requested independent,
   high-effort visual and UX review.
6. **Publication approval:** Joe explicitly authorizes removal of the deployment
   hold and publication. Approval of prose is not automatically approval to
   deploy.

## Design handoff

The current single-file "case file" design is provisional. Do not force the
interview into its chapter structure or preserve its decorative elements merely
because they exist. The redesign should be derived from the approved story and
should connect naturally to Start Here while remaining a long-form editorial
experience.

Preserve these project constraints unless a later decision explicitly changes
them:

- Special Elite as display type and Roboto Mono as body type;
- the paper, ink, archive, and manila visual language;
- responsive behavior and strong keyboard/focus support;
- reduced-motion and print-friendly treatment;
- low runtime complexity and no unnecessary framework or dependency; and
- `features/making-of/` remains excluded from deployment until publication
  approval.

## Definition of interview handoff done

Claude's interview assignment is complete only when:

- all eight rounds have been conducted or Joe explicitly skips a round;
- Joe has approved each round summary;
- the chronology spine, theme map, scene inventory, voice sheet, and claim ledger
  exist;
- sensitive material has explicit publication status;
- current facts have been verified against primary project evidence;
- Joe has approved the story brief and reconstructed prose; and
- the resulting materials are ready for design implementation without requiring
  an agent to invent Joe's voice.

## Quick resume instruction for Claude

If Joe asks to begin or resume the making-of interview:

1. Read this file completely.
2. Determine the last round Joe explicitly approved; do not infer approval.
3. If none has been approved, begin with Round 1's broad invitation.
4. Ask only one round at a time.
5. End the round with the reflection-and-correction checkpoint.
6. Do not edit or publish the making-of page during the interview unless Joe
   separately asks for implementation after approving the story brief.
