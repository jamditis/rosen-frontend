---
type: system
title: Deploy and hosting
description: The archive is served from a legacy PressThink origin behind Cloudflare DNS and deploys through explicit FTPS.
source: ["GitHub #458/#459/#367", "2026-06-19 call", "DEPLOYMENT.md", "deploy.yml"]
verified: 2026-08-06
tags: [deploy, hosting, ftps, cloudflare]
timestamp: 2026-08-06
---

# Deploy and hosting

The archive is served at `https://pressthink.org/j/rosen-archive/`. The transfer
account's chroot exposes that tree as `j/rosen-archive/`.

## The hosting tangle

- **Domain:** `pressthink.org` is on **GoDaddy**, owned by [Jay](../people/jay-rosen.md).
- **DNS:** on **Cloudflare** (`jeff.ns.cloudflare.com`).
- **Origin/hosting:** a legacy PressThink origin with reverse DNS
  `nyuhyperlocal.org`. Deployment does not depend on a Plesk or cPanel control
  panel.

## Automated transfer

The server exposes certificate-verified explicit FTPS on port 21; SSH/SFTP on
port 22 is closed. `.github/workflows/deploy.yml` and the per-record submission
path select FTPS through `ROSEN_TRANSFER_PROTOCOL`. Both reject remote paths
outside `j/rosen-archive/` or its `data/` child before connecting. The server
account can list the broader PressThink document root, so this client-side
boundary is mandatory.

## Manual fallback

If the automated path is unavailable, the [Curator](../people/joe-amditis.md)
can upload through the WordPress File Manager plugin. Manifest of what to
upload: [DEPLOYMENT.md](../../DEPLOYMENT.md). Do not include
`features/making-of/` until its separate publication approval.

## Cache busting (three layers)

`?v=` (Cloudflare and exact service-worker request keys) → `sw.js CACHE_VERSION` (service-worker namespace cleanup) → archive data cache version. The version bump is a release-time step, done once across merged work, not per-PR. For manual releases, upload dependencies first and upload `index.html`, both service-worker scripts, and `version.json` last in the canonical deploy-manifest order.
