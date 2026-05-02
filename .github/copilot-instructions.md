# Copilot review instructions — rosen-frontend

Project context, architecture, and conventions live in [CLAUDE.md](../CLAUDE.md). Both this file and CLAUDE.md are read by Copilot code review (cap ~4,000 chars each). This file lists the rules worth named attention on every PR.

## Global rules to flag

These are Joe's user-level conventions. They live in `~/.claude/CLAUDE.md`, which Copilot's PR review bot does *not* read — so they're restated here so the bot enforces them on this repo's PRs.

- **Sentence case** in headings, UI text, comments, and identifiers. Title Case is a regression.
- **No emojis** in source code, log messages, comments, commits, PR bodies, or any output. Plain text only.
- **No AI attribution.** Never include "Generated with Claude Code", `Co-Authored-By: Claude` trailers, or any AI/model/company attribution in PRs, commits, code, or any committed file.
- **Banned words** (delete or replace): *comprehensive, sophisticated, robust, transformative, leveraging, seamlessly, innovative, cutting-edge, state-of-the-art, holistic, synergy, ecosystem, paradigm, empower*.
- **No direct LLM API calls.** Use CLI tools (`claude -p`, `gemini -p`) via subprocess instead of calling Anthropic/OpenAI/Google AI SDKs directly.
- **Every HTML page must have an SVG favicon** (`<link rel="icon" type="image/svg+xml" href="...">`) and full OG/Twitter meta tags (`og:title`, `og:description`, `og:type`, `og:url`, `og:image` 1200x630, `twitter:card=summary_large_image`).

## Project-specific bug classes to flag

1. **No build step for the production frontend.** This is a zero-build static site loaded from `esm.sh` CDN via import maps. Flag any PR that introduces npm/webpack/vite as a production dependency. The only legitimate npm usage is `node data/export-archive-data.js` (data regen) and `npm test` (Node's built-in test runner).

2. **HTM, not JSX.** Components must use the `html` tagged template imported from `./html.js`, e.g. `import { html } from '../html.js?v=3.3.0'`. Flag any JSX syntax in `frontend/`.

3. **Version-string on every JS import.** Every `.js` import must include a `?v=<version>` query string matching the version in `index.html` (currently `v3.3.0`). Missing or mismatched version strings produce stale-cache bugs in production. Flag bare imports and version drift across files in the same PR.

4. **Production path awareness.** URLs must use the auto-detected base path (relative locally, `/j/rosen-archive/` in production) — see `App.js`. Flag hardcoded `./` or `/j/rosen-archive/` prefixes in new code.

5. **CSV is the source of truth; JSON is generated.** Flag any direct edit to `data/archive-core.json`, `archive-details.json`, `archive-entities.json`, or `archive-data.json`. Schema changes must update `data/export-archive-data.js` and all four output files together.

6. **Dissertation content is verified citations.** `frontend/components/dissertationData.js` contains direct quotes from Jay Rosen's 1986 dissertation. Flag any modification, paraphrase, or new quote that isn't a clearly-sourced verbatim citation.

7. **Backend uses Poetry.** Python commands in scripts, CI, and docs must use `poetry run python ...`, not bare `python`. Flag bare `python`/`python3` invocations in `backend/` or any workflow that runs against backend code.
