# Documentation map

A guide to the documentation in this repository — where to start depending on who you are and what you're looking for.

## Start here

| If you want to… | Read… |
|-----------------|-------|
| Understand what the archive is | The [root README](../README.md), or just visit [the live site](https://pressthink.org/j/rosen-archive/) |
| Use or analyze the archive data | [`data/README.md`](../data/README.md) and the data dictionary in [`data/SCHEMA.md`](../data/SCHEMA.md) |
| Suggest a record without editing files | [`JAY_ADDING_RECORDS.md`](JAY_ADDING_RECORDS.md) — public suggestions and the optional submission sheet |
| Prepare or correct a catalog record | [`ADDING-RECORDS.md`](../ADDING-RECORDS.md) — source fields, IDs, checks, and the complete publication path |
| Take responsibility for the archive | [`HANDOFF.md`](HANDOFF.md) — roles, account control, preservation, recovery, and acceptance evidence |
| Work on the code | [`CLAUDE.md`](../CLAUDE.md) (full technical reference) and [`AGENTS.md`](../AGENTS.md) (conventions summary) |
| Understand the project's vocabulary | [`CONTEXT.md`](../CONTEXT.md) — what "Record," "Entity," and "Facet" mean here |
| Deploy the site | [`DEPLOYMENT.md`](../DEPLOYMENT.md) — the file-by-file deploy manifest |
| Understand the backend pipeline | [`backend/README.md`](../backend/README.md) |
| Operate the current automated intake | [`operations/bluesky-stewardship.md`](operations/bluesky-stewardship.md) and [`operations/pressthink-ingestion.md`](operations/pressthink-ingestion.md) — implemented behavior and recovery |
| Read the broader stewardship design | [`bluesky-stewardship-pipeline.md`](bluesky-stewardship-pipeline.md) — plans and design context, not proof that every component is deployed |
| Prepare and verify a preservation copy | [`preservation/BASELINE.md`](../preservation/BASELINE.md) and [`preservation/README.md`](../preservation/README.md) — selected-data packages and source-preservation evidence |

## What's in this directory

The `docs/` directory holds the project's working documentation — history, plans, audits, and reference material. It is not deployed to the live site.

### Project history and narrative

- [`narrative/`](narrative/) — how the project came to be: [`project-history.md`](narrative/project-history.md), [`architecture.md`](narrative/architecture.md), [`data-pipeline.md`](narrative/data-pipeline.md), and a [`changelog.md`](narrative/changelog.md)
- [`narrative/INTERVIEW_GUIDE.md`](narrative/INTERVIEW_GUIDE.md) — the interview protocol for the making-of story (a work in progress; the draft page is not published)

### Plans, research, and audits

- [`plans/`](plans/) — dated design and implementation plans, kept as a record of decisions
- [`research/`](research/) — dated discovery and inventory writeups
- [`bluesky-stewardship-pipeline.md`](bluesky-stewardship-pipeline.md) — the broader source, preservation, processing, and escalation design; current implementation is documented in the operations guides above
- [`feature-audit/`](feature-audit/) — the June 2026 feature inventory, its two current catalog checks, test-pinned harnesses, and separated historical phase machinery
- [`pressthink-recovery-index-2026-07-23.md`](pressthink-recovery-index-2026-07-23.md) — the 2009-onward PressThink recovery evidence index
- [`pressthink-2004-2008-gap-2026-08-27.md`](pressthink-2004-2008-gap-2026-08-27.md) — the Movable Type era gap measurement, regenerated from the checked-in inventories in [`backend/inventories/`](../backend/inventories/README.md)
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
