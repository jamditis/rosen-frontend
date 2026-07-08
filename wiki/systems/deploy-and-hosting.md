---
type: system
title: Deploy and hosting
description: The archive is served from a legacy NYU Media Temple/Plesk box behind Cloudflare DNS on a GoDaddy domain; automated deploy exists but lacks SFTP credentials, so uploads are manual.
source: ["GitHub #458/#459/#367", "2026-06-19 call", "DEPLOYMENT.md", "deploy.yml"]
verified: 2026-06-22
tags: [deploy, hosting, sftp, blocker, cloudflare]
timestamp: 2026-06-22
---

# Deploy and hosting

The archive is served at `https://pressthink.org/j/rosen-archive/`, with files under `/wp-content/rosen-archive/` (SFTP target path `/J`).

## The hosting tangle

- **Domain:** `pressthink.org` is on **GoDaddy**, owned by [Jay](../people/jay-rosen.md).
- **DNS:** on **Cloudflare** (`jeff.ns.cloudflare.com`).
- **Origin/hosting:** a legacy **Media Temple / Plesk** box with reverse DNS `nyuhyperlocal.org` (legacy NYU) — **not** GoDaddy's standard cPanel/Managed-WordPress product. The dry-run deploy confirmed this; on the call Jay first thought it was "on GoDaddy," which was the domain.

## The blocker

The deploy automation exists (`.github/workflows/deploy.yml` + `backend/scripts/deploy_full_site.py`) and expects SFTP credentials as repo secrets, but **no working credentials are set**, so it fails safe to manual. Getting credentials is the single unblock — request tracked in #458 (relayed via Jay to whoever manages hosting/DNS), full-site deploy wiring in #367. This blocker is known and already discussed with Jay; it is not waiting on Joe.

## The interim path (manual)

Until credentials land, the [Curator](../people/joe-amditis.md) keeps the site current with a manual upload via the WordPress File Manager plugin — drop the built files into `/wp-content/rosen-archive/`. The weekly emailed-zip fallback is #459. Manifest of what to upload: [DEPLOYMENT.md](../../DEPLOYMENT.md). Do not include `features/making-of/` in a manual upload until its handoff chapter is approved; it is listed under "What NOT to deploy" in that manifest.

## Cache busting (three layers)

`?v=` (Cloudflare) → `sw.js CACHE_VERSION` (service-worker cache, since `ignoreSearch: true` defeats `?v=`) → archive data cache version. The version bump is a release-time step, done once across merged work, not per-PR.
