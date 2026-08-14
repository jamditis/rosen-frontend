# Documentation map

A guide to the documentation in this repository — where to start depending on who you are and what you're looking for.

## Start here

| If you want to… | Read… |
|-----------------|-------|
| Understand what the archive is | The [root README](../README.md), or just visit [the live site](https://pressthink.org/j/rosen-archive/) |
| Use or analyze the archive data | [`data/README.md`](../data/README.md) and the data dictionary in [`data/SCHEMA.md`](../data/SCHEMA.md) |
| Add a new record to the archive | [`ADDING-RECORDS.md`](../ADDING-RECORDS.md) — a step-by-step guide for non-technical curators |
| Work on the code | [`CLAUDE.md`](../CLAUDE.md) (full technical reference) and [`AGENTS.md`](../AGENTS.md) (conventions summary) |
| Understand the project's vocabulary | [`CONTEXT.md`](../CONTEXT.md) — what "Record," "Entity," and "Facet" mean here |
| Deploy the site | [`DEPLOYMENT.md`](../DEPLOYMENT.md) — the file-by-file deploy manifest |
| Understand the backend pipeline | [`backend/README.md`](../backend/README.md) |
| Follow the Bluesky-first stewardship plan | [`bluesky-stewardship-pipeline.md`](bluesky-stewardship-pipeline.md) — plain-language source, preservation, processing, and escalation map |

## What's in this directory

The `docs/` directory holds the project's working documentation — history, plans, audits, and reference material. It is not deployed to the live site.

### Project history and narrative

- [`narrative/`](narrative/) — how the project came to be: [`project-history.md`](narrative/project-history.md), [`architecture.md`](narrative/architecture.md), [`data-pipeline.md`](narrative/data-pipeline.md), and a [`changelog.md`](narrative/changelog.md)
- [`narrative/INTERVIEW_GUIDE.md`](narrative/INTERVIEW_GUIDE.md) — the interview protocol for the making-of story (a work in progress; the draft page is not published)

### Plans, research, and audits

- [`plans/`](plans/) — dated design and implementation plans, kept as a record of decisions
- [`research/`](research/) — dated discovery and inventory writeups
- [`bluesky-stewardship-pipeline.md`](bluesky-stewardship-pipeline.md) — the current source, preservation, processing, and escalation map for continuous archive stewardship
- [`feature-audit/`](feature-audit/) — a full feature inventory of the app: 166 user stories, each tested in a real browser, with fixes tracked through re-test
- Top-level audit reports (data quality, entity extraction, launch validation) — point-in-time snapshots, dated in their filenames or headers

### Contributor reference

- [`agent-personas/`](agent-personas/) — role definitions for contributors (frontend developer, data curator, code reviewer, and others)
- [`explainers/`](explainers/) — deeper explanations of specific subsystems
- [`setup/`](setup/) — environment setup notes
- [`definition-of-done.md`](definition-of-done.md), [`backlog-priority.md`](backlog-priority.md), [`decisions-pending.md`](decisions-pending.md) — working process documents

### Archived material

- [`archived/`](archived/) — older one-off audits and designs, kept for reference only

## A note on dates

Much of what's here is a snapshot: audits, plans, and research writeups describe the project as it was on the date they were written. When a document and the code disagree, the code wins. The living references are the root README, `CLAUDE.md`, and the READMEs next to the code they describe.
