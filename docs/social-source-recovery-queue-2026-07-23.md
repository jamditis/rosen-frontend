# Social source recovery queue — 2026-07-23

This note tracks social rows that have an explicit `verified=FALSE` state after
the July 23 data cleanup. These are not Jay Rosen posts. They are imported
non-Rosen Bluesky rows whose false `jayrosen.bsky.social` post URLs were
removed because the native source records were not available locally.

This is a source-recovery queue, not a manual browser queue. Do not infer source
URLs from author names or copied text. Mark a row verified only if native
ATProto data, an authoritative capture, or another source-preserving record
proves the original author URL and post identity.

## Current state

- Rows in queue: 54.
- Platform: Bluesky.
- Current `verified` value: `FALSE`.
- Current URL field: blank.
- Canonical data changed here: no rows changed by this doc.

## Queued row IDs

```text
BSKY-00060
BSKY-00241
BSKY-00333
BSKY-00334
BSKY-00336
BSKY-00383
BSKY-00441
BSKY-00446
BSKY-00459
BSKY-00586
BSKY-00650
BSKY-00684
BSKY-00740
BSKY-00765
BSKY-00785
BSKY-00863
BSKY-00878
BSKY-00902
BSKY-01170
BSKY-01188
BSKY-01269
BSKY-01270
BSKY-01271
BSKY-01277
BSKY-01278
BSKY-01401
BSKY-01418
BSKY-01426
BSKY-01441
BSKY-01629
BSKY-01640
BSKY-01689
BSKY-01693
BSKY-01694
BSKY-01695
BSKY-01820
BSKY-01830
BSKY-01832
BSKY-01911
BSKY-02220
BSKY-02329
BSKY-02344
BSKY-02355
BSKY-02518
BSKY-02522
BSKY-02585
BSKY-02616
BSKY-02690
BSKY-02796
BSKY-02847
BSKY-02874
BSKY-02878
BSKY-03038
BSKY-03062
```

## Verification rule

For each queued row, recovery must provide:

- the original Bluesky author DID or handle;
- the native post URI or URL;
- source text or embed content matching the stored row;
- enough provenance to distinguish repost, quote-post, reply, and thread
  context.

If that evidence cannot be recovered, leave the row `verified=FALSE` and keep
the source URL blank rather than restoring the false Jay-profile URL.
