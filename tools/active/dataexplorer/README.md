# Data explorer prototype

**Status: internal; not deployed.**

The tabular data explorer is retained because it has a product specification, a security hardening pass, and useful interaction work. It is not linked from the public archive and is excluded from the full-site deploy because its only runtime data source is a large published Google Sheet with no local fallback.

Production deliberately does not allow the Google Sheet origins in Content Security Policy. A full deploy also removes any previously uploaded `tools/active/dataexplorer/` directory, so an old manual upload cannot leave a hidden public endpoint behind.

Before reconsidering public deployment:

1. Migrate the tool to committed local archive artifacts rather than a live Sheet.
2. Measure initial and repeat-load cost against the current archive interfaces.
3. Re-run the product, accessibility, security, and deployment review.
4. Add an intentional public navigation entry only after those checks pass.

The source-level security regression remains active:

```bash
node --test tests/data-explorer-security.test.js
```
