---
type: concept
title: Re-verification playbook
description: Commands and files to re-check before quoting project facts, counts, versions, routes, deploy state, or issue status.
source: [package.json, version.json, data/archive-analytics.json, .github/workflows/, AGENTS.md, wiki/sources/provenance.md]
verified: 2026-06-23
tags: [sources, verification, commands]
timestamp: 2026-06-23
---

# Re-verification playbook

Use this when a fact in the OKF bundle may have drifted.

## Repo and branch state

```bash
git status --short --branch
git remote -v
git log --oneline -5
```

## Version and counts

```bash
jq '.version, .updated, .cache_version' version.json
jq '.stats' data/archive-analytics.json
```

Use `data/archive-analytics.json` for public counts. Use `version.json`, `index.html`, and `frontend/sw.js` together for release-version facts.

## Available test commands

```bash
jq '.scripts' package.json
find tests -maxdepth 1 -type f -name '*.test.js' | sort
```

Run `npm test` for a broad Node pass, or a narrower script from [systems/ci-and-testing.md](../systems/ci-and-testing.md).

## Routes and public wiki

```bash
rg -n "wiki|ROUTES|WikiPage" frontend/App.js frontend/services frontend/components tests
jq '.schemaVersion, .generatedAt, .status, (.pages | length)' data/wiki-seed.json
```

This verifies the public `#wiki` feature, not the repo-maintenance `wiki/` OKF bundle.

## Deploy state

```bash
sed -n '1,220p' DEPLOYMENT.md
find .github/workflows -maxdepth 1 -type f | sort
```

Check [systems/deploy-and-hosting.md](../systems/deploy-and-hosting.md) for the current blocker, then verify against workflow files and GitHub issue state before acting.

## GitHub issue selection

```bash
gh issue list --search 'is:open -label:"do-not-automate"'
```

This keeps human-visibility issues out of automated work selection.
