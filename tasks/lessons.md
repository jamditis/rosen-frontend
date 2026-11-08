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
