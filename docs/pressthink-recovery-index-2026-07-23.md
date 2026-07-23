# PressThink recovery index — 2026-07-23

This note consolidates the saved offline PressThink recovery audit packets on
`legion2025`. It is an evidence index only. It does not assign permanent
archive IDs, import order, rights status, full-text treatment, taxonomy,
entities, or relationships.

## Scope

- Source: saved official PressThink recovery packets under `%TEMP%`.
- Network calls made for this consolidation: 0.
- Canonical CSV rows changed by this consolidation: 0.
- Local audit rows indexed: 184.
- Distinct missing PressThink works proposed for curator import: 167.
- Source or edition mapping decisions deferred for curator review: 17.

The row count is based on the local audit packets, not on the earlier handoff
estimate. The packet set includes 20 WordPress API rows for 2011 and two 2009
source-structure rows that are mapping decisions rather than missing works.

## Year summary

| Packet | Candidate rows | Distinct missing works | Deferred mappings | Local evidence |
| --- | ---: | ---: | ---: | --- |
| 2009 | 2 | 0 | 2 | `%TEMP%/rosen-pressthink-recovery-2009-audit` |
| 2010 | 15 | 11 | 4 | `%TEMP%/rosen-pressthink-recovery-2010-audit` |
| 2011 | 20 | 18 | 2 | `%TEMP%/rosen-pressthink-recovery-2011-audit` |
| 2012 | 13 | 13 | 0 | `%TEMP%/rosen-pressthink-recovery-2012-audit` |
| 2013 | 27 | 27 | 0 | `%TEMP%/rosen-pressthink-recovery-2013-audit` |
| 2014 | 31 | 30 | 1 | `%TEMP%/rosen-pressthink-recovery-2014-audit` |
| 2015 | 21 | 20 | 1 | `%TEMP%/rosen-pressthink-recovery-2015-audit-02-03`; `%TEMP%/rosen-pressthink-recovery-2015-audit-04` |
| 2016 | 12 | 11 | 1 | `%TEMP%/rosen-pressthink-recovery-2016-audit` |
| 2017 | 10 | 10 | 0 | `%TEMP%/rosen-pressthink-recovery-2017-audit` |
| 2018 | 12 | 10 | 2 | `%TEMP%/rosen-pressthink-recovery-2018-audit` |
| 2019 | 6 | 4 | 2 | `%TEMP%/rosen-pressthink-recovery-2019-audit` |
| 2020 | 12 | 10 | 2 | `%TEMP%/rosen-pressthink-recovery-2020-audit` |
| 2021, 2025, 2026 | 3 | 3 | 0 | `%TEMP%/rosen-pressthink-recovery-2021-2026-audit` |

## Deferred source and edition decisions

These rows need curator review before import, merge, or source-link changes.

| Year | Existing row | Candidate | PressThink URL |
| --- | --- | --- | --- |
| 2009 | `RECORD-00496` | Write it Yourself: My Advice to Barack Obama | https://pressthink.org/2009/01/write-it-yourself-my-advice-to-barack-obama/ |
| 2009 | `RECORD-00437` | Help Me Explain Twitter to Eggheads | https://pressthink.org/2009/01/help-me-explain-twitter-to-eggheads/ |
| 2010 | `RECORD-00420` | The Politico Opens the Kimono. And then Pretends it Never Happened. | https://pressthink.org/2010/06/the-politico-opens-the-kimono-and-then-pretends-it-never-happened/ |
| 2010 | `RECORD-00270` | Clowns to the Left of Me, Jokers to the Right: On the Actual Ideology of the American Press | https://pressthink.org/2010/06/clowns-to-the-left-of-me-jokers-to-the-right-on-the-actual-ideology-of-the-american-press/ |
| 2010 | `RECORD-00456` | News Without the Narrative Needed to Make Sense of the News: What I Will Say at South by Southwest | https://pressthink.org/2010/03/news-without-the-narrative-needed-to-make-sense-of-the-news-what-i-will-say-at-south-by-southwest/ |
| 2010 | `RECORD-00519` | Fixing The Ideology Problem in Our Political Press: A Reply to The Atlantic’s Marc Ambinder | https://pressthink.org/2010/06/fixing-the-ideology-problem-in-our-political-press-a-reply-to-the-atlantics-marc-ambinder/ |
| 2011 | `RECORD-00701`; `RECORD-00877` | The Politics of the New Huffington Post at AOL | https://pressthink.org/2011/02/the-politics-of-the-new-huffington-post-at-aol/ |
| 2011 | `RECORD-00609` | Why Political Coverage is Broken | https://pressthink.org/2011/08/why-political-coverage-is-broken/ |
| 2014 | `RECORD-00712` | How to be literate in what’s changing journalism | https://pressthink.org/2014/11/how-to-be-literate-in-whats-changing-journalism/ |
| 2015 | `RECORD-00878` | Tone poem for the “leave it there” press | https://pressthink.org/2015/12/tone-poem-for-the-leave-it-there-press/ |
| 2016 | `RECORD-00065` | Speaking truth to audience power | https://pressthink.org/2016/11/speaking-truth-audiences-power/ |
| 2018 | `RECORD-00720` | What The Correspondent adds to the American press | https://pressthink.org/2018/10/what-the-correspondent-adds-to-the-american-press/ |
| 2018 | `RECORD-00050` | A current list of my top problems in pressthink | https://pressthink.org/2018/09/a-current-list-of-my-top-problems-in-pressthink/ |
| 2019 | `RECORD-00050` | A current list of my top problems in pressthink, April 2019 | https://pressthink.org/2019/04/a-current-list-of-my-top-problems-in-pressthink-april-2019/ |
| 2019 | `RECORD-00050` | A current list of my top problems in pressthink, August 2019 | https://pressthink.org/2019/08/a-current-list-of-my-top-problems-in-pressthink-august-2019/ |
| 2020 | `RECORD-00050` | A current list of my top problems in pressthink, April 2020 | https://pressthink.org/2020/04/a-current-list-of-my-top-problems-in-pressthink-april-2020/ |
| 2020 | `RECORD-00707` | You cannot keep from getting swept up in Trump’s agenda without a firm grasp on your own | https://pressthink.org/2020/05/you-cannot-keep-from-getting-swept-up-in-trumps-agenda-without-a-firm-grasp-on-your-own/ |

## Import boundary

Do not import the 167 distinct missing works until a curator decides:

- permanent IDs and insertion order;
- whether PressThink full text may be published in `raw_text`;
- rights and permission language;
- taxonomy, concepts, and categories;
- entity extraction and relationship approval;
- how edition mappings should appear in the canonical rows.

## Manual help needed

This PressThink packet set does not need new browser capture from Joe right now.
The only current archive record still requiring hands-on browser verification is
`RECORD-00865`, listed in
`docs/manual-verification-required-2026-07-23.md`.
