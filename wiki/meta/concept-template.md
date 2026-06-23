---
type: template
title: Concept templates
description: Copyable OKF document templates for the Rosen project profile and other project wikis.
source: ["wiki/meta/okf-profile.md", "https://github.com/GoogleCloudPlatform/knowledge-catalog/blob/main/okf/SPEC.md"]
verified: 2026-06-23
tags: [okf, templates, authoring]
timestamp: 2026-06-23
---

# Concept templates

Copy these into new concept files, then replace placeholders with sourced facts. Keep one concept per file.

## Project or domain concept

````markdown
---
type: concept
title: <name>
description: <one-sentence summary>
source: ["<repo path, command, issue, call, or URL>"]
verified: YYYY-MM-DD
tags: [<domain>, <purpose>]
timestamp: YYYY-MM-DD
---

# <name>

What this concept is and why it matters.

## Current state

- Fact checked against source material.
- Fact checked against source material.

## Risks

- Anything likely to drift, break, or mislead.

## Verification

```bash
<command>
```
````

## System concept

````markdown
---
type: system
title: <system name>
description: <what the system does and why it exists>
source: ["<code path>", "<workflow>", "<runbook>"]
verified: YYYY-MM-DD
tags: [system, <domain>]
timestamp: YYYY-MM-DD
---

# <system name>

The short operating model.

## Components

- `<path>` — role.
- `<path>` — role.

## Commands

```bash
<command>
```

## Failure modes

- Known failure mode and what to check first.
````

## Person or organization concept

````markdown
---
type: person
title: <name>
description: <role in this project>
source: ["<source path or event>"]
verified: YYYY-MM-DD
tags: [person, <role>]
timestamp: YYYY-MM-DD
---

# <name>

Project-specific role only. Do not write a biography unless the project needs it.

## Role

- Decision or responsibility.
- External dependency they own.

## Related concepts

- [related concept](../path/file.md)
````

## Event concept

````markdown
---
type: event
title: <event name and date>
description: <what changed>
source: ["<meeting, email, issue, log, or commit>"]
verified: YYYY-MM-DD
tags: [event, <domain>]
timestamp: YYYY-MM-DD
---

# <event name and date>

What happened.

## Outcome

- Decision, handoff, blocker, or artifact created.

## Follow-up

- Work that remains.
````

## Playbook concept

````markdown
---
type: playbook
title: <task name>
description: <when to use this playbook>
source: ["<runbook or workflow source>"]
verified: YYYY-MM-DD
tags: [playbook, <domain>]
timestamp: YYYY-MM-DD
---

# <task name>

Use this when <trigger>.

## Steps

1. First action.
2. Second action.
3. Verification action.

## Stop conditions

- When to ask for review or stop.
````
