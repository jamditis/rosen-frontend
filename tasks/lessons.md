# Lessons

## Wiki scaffolds need contracts, not only screens

When adding a public knowledge feature, ship the data contract, validation tests, threat model, and moderation gates with the UI scaffold. A read-only page that renders seed data is not enough if dangling links, unsafe reference URLs, unknown slugs, or deployment-fragile links can slip through.

## Check known access before requesting more

When a later PressThink task appears to need broader access, inventory the
existing account's effective permissions first. Do not assume access is absent,
and do not treat a broad credential as authority for unrelated work. Keep every
Rosen archive automation pinned to `j/rosen-archive` or its required child.
