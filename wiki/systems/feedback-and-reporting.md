---
type: system
title: Feedback and reporting
description: The live feedback path is an on-site "Report a bug" button that opens a prefilled GitHub issue; a branded in-archive form that hides GitHub is the planned replacement (#509).
source: ["GitHub #450/#451/#509", "frontend/utils/bugReport.js", "2026-06-22 decision"]
verified: 2026-06-22
tags: [feedback, report, intake, launch]
timestamp: 2026-06-22
---

# Feedback and reporting

## What's live

An on-site **"Report a bug"** button (#450/#451) that deep-links to a prefilled GitHub issue (`frontend/utils/bugReport.js`, using the `bug_report.yml` issue form). It captures the page the reporter was on. The same path is how a visitor flags a [Record](../data/corpus.md) that should be added.

This is the path given to [Jay](../people/jay-rosen.md) in the [2026-06-22 handoff](../launch/handoff-2026-06-22.md), with one caveat: filing a GitHub issue needs a GitHub account, which most public visitors won't have.

## What's planned (#509)

A **branded in-archive form** that looks like the archive (not a GitHub issue page), takes the report or record suggestion with no GitHub account required, and still creates a GitHub issue on the backend (reusing the `bugReport.js` field mapping; a likely host is the [submission server](submission-server.md)). Decided 2026-06-22: ship launch with the existing button, build the branded form next.
