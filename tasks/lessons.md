# Lessons

## Wiki scaffolds need contracts, not only screens

When adding a public knowledge feature, ship the data contract, validation tests, threat model, and moderation gates with the UI scaffold. A read-only page that renders seed data is not enough if dangling links, unsafe reference URLs, unknown slugs, or deployment-fragile links can slip through.

## Check known access before requesting more

When a later PressThink task appears to need broader access, inventory the
existing account's effective permissions first. Do not assume access is absent,
and do not treat a broad credential as authority for unrelated work. Keep every
Rosen archive automation pinned to `j/rosen-archive` or its required child.

## Ask through the question tool, not prose

When Joe's input or attention is needed, ask with the AskUserQuestion tool.
It notifies his phone; a question written only in chat prose is missed.

## Stack pull requests

When a session produces several independent changes, open them as stacked
pull requests (each branch based on the previous one) so CI does not rerun
from scratch after every merge.

## A fresh cloud clone is shallow and has LFS pointers

Before trusting `npm test` in a cloud session, run `git fetch --unshallow`
and `git lfs pull`. Without them eight provenance, census, and model-asset
tests fail for reasons that have nothing to do with the change. Node's
built-in fetch also ignores HTTPS_PROXY; run model downloads such as
`npm run build-embeddings` with `NODE_USE_ENV_PROXY=1`.

## Stamp the census after every generator

`npm run census:stewardship` records the input commit. Any generator that
runs after it (the export, embeddings, or
`scripts/refresh-social-release-artifacts.mjs`) makes it stale, and
`validate` fails in CI even though a local run before the commit passed.
Run the census last, on committed inputs, and commit it on its own.

## Run the preview audit before a frontend push

CI runs only on pull requests into `main`, so a stacked branch gets its
first audit when the stack reaches the bottom PR. Run the routes a change
touches locally first:
`PREVIEW_AUDIT_CHROMIUM_PATH=/opt/pw-browsers/chromium-1243/chrome-linux64/chrome PREVIEW_AUDIT_ROUTES=... PREVIEW_AUDIT_VIEWPORT=tablet npm run preview:audit`.
Two limits apply. The desktop shell fails any control under 44 by 44 px.
CI measures layout shift several times higher than a local run (1.70
against 0.41 on the same route), so a route near its budget in CI can
pass locally and still fail there. Check the route's last CI value before
changing card or chip sizes.

## Check for a merged PR before redoing an issue

An issue can stay open after a PR that said "Refs" instead of "Fixes"
finished it (#861 and #929). Search merged PRs for the issue number
before assigning work.

## Merge stacked PRs by moving base branches

GitHub refuses the merge API and auto-merge for any PR it sees as part of a
stack ("Merging stacked PRs via this endpoint is not supported"). To merge
the upper PRs, push the top head to each base branch in turn, top down,
after checking that each base is an ancestor of it. GitHub then marks each
PR merged. The bottom PR into main still needs Joe's merge in the web UI,
so ask through the question tool once its checks are green.

## Codex reviews a PR only when it opens

Pushing a fix does not start a new Codex review. Verify the fix with a test
before merging, because no second automated pass will look at it.
