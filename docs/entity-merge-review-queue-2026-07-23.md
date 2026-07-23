# Entity merge review queue — 2026-07-23

This note promotes the local orphan-entity merge audit into a tracked review
queue. It does not merge entities, change canonical entity IDs, aggregate
mention counts, rewrite source text, or update relationships.

## Source packet

- Local packet: `%TEMP%/rosen-orphan-entity-merge-audit`
- Main artifact: `entity-merge-audit.json`
- Packet report: `report.md`
- Network calls made for this consolidation: 0
- Canonical CSV rows changed by this consolidation: 0

The audit simulated all 28 candidate-to-canonical mappings and found no
relationship references would be orphaned after the simulated candidate-row
removals. `safe_auto_candidate` means the pair is suitable for a
curator-approved batch; it is not merge authorization.

## Summary

| Disposition | Count | Meaning |
| --- | ---: | --- |
| `safe_auto_candidate` | 19 | Strong same-identity evidence, but still waiting on curator approval for retained ID, display name, aliases, mention counts, and row removal. |
| `curator_required` | 9 | Needs a curator decision because of type conflicts, display-name evidence gaps, broad labels, or source-text limits. |
| `keep_separate` | 0 | No pair has local evidence requiring separate identities. |

## Safe batch candidates

| Candidate | Proposed canonical | Type | Evidence records | Note |
| --- | --- | --- | --- | --- |
| `C0160` Freedom of speech | `C0534` Free Speech | Concept | `RECORD-00237` | Display label remains a stewardship choice because both phrases appear in the archive. |
| `C0261` World citizenship | `C0654` Citizen of the world | Concept | `RECORD-00165` | Same concept in the cited source passage. |
| `C0316` Gatekeeper Model | `C0212` Gatekeeper Model of a Professionalized Press | Concept | `RECORD-00146` | Candidate is a shorter same-type label. |
| `C0545` One-to-many | `C1268` One-to-Many Broadcasting Model | Concept | `RECORD-00879` | Candidate is a shorter same-type label. |
| `C0562` News/Opinion Distinction | `C0878` News vs. opinion distinction | Concept | `RECORD-00127` | Same distinction with variant phrasing. |
| `C0650` Norm of Objectivity | `C1018` Objectivity norm | Concept | `RECORD-00183`, `RECORD-00737` | Same concept with reversed wording. |
| `E0106` War in Iraq | `E0004` Iraq War | Event | `RECORD-00125` | Same event label. |
| `E0119` Jason Blair crisis | `E0167` Jayson Blair Scandal | Event | `RECORD-00103`, `RECORD-00110` | Source preserves one `Jason` spelling; display spelling remains separate from source text. |
| `E0197` Harvard conference on journalists, bloggers and trust | `E0089` Blogging, Journalism and Credibility Conference | Event | `RECORD-00200`, `RECORD-00673` | Same conference. |
| `E0222` Rathergate Affair | `E0160` Rathergate | Event | `RECORD-00391` | Same event label. |
| `L0131` Cambridge, Mass | `L0209` Cambridge, Massachusetts | Location | `CLIP-00076` | Same location. |
| `O1189` MediaChannel | `O0438` MediaChannel.org | Organization | `RECORD-00410` | Same organization label. |
| `O1207` Mercer University's Center for Collaborative Journalism | `O1598` Mercer University Center for Collaborative Journalism | Organization | `RECORD-00772`, `RECORD-00882` | Same organization, possessive variant. |
| `P0626` Doc Searles | `P0579` Doc Searls | Person | `RECORD-00158`, `RECORD-00509` | Typo is present in source text and must not be rewritten. |
| `P1015` Matthew Yglesisas | `P0405` Matthew Yglesias | Person | `RECORD-00101`, `RECORD-00159` | Typo is present in source text and must not be rewritten. |
| `P1213` Salaam Pax | `P2659` Salam Pax | Person | `RECORD-00115` | Identity match rests on both rows describing the Baghdad blogger. |
| `P1929` Karen G. Schneider | `P1995` Karen Schneider | Person | `RECORD-00544` | No competing Karen Schneider identity appears in local evidence. |
| `P2012` Murdoch | `P0289` Rupert Murdoch | Person | `RECORD-00138` | The cited record spells out Rupert Murdoch. |
| `P2094` Rony Albovitz | `P0634` Rony Abovitz | Person | `RECORD-00170` | Both spellings are preserved in source text; merge must not rewrite the transcript. |

## Curator-required cases

| Candidate | Proposed canonical | Evidence records | Reason curator review is required |
| --- | --- | --- | --- |
| `C0604` Easongate | `E0264` Easongate / Eason Jordan Davos controversy | `RECORD-00503` | Cross-type merge: concept to event. |
| `E0121` California Gubernatorial Election | `E0046` California Recall Election | `RECORD-00118` | Candidate label could describe a regular gubernatorial election; blank first mention prevents proving original assignment. |
| `E0221` Trent Lott Episode | `E0251` Trent Lott downed-by-weblogs story | `RECORD-00492` | No exact `Trent Lott Episode` occurrence is stored. |
| `O0313` Fort Worth Star-Telegram | `O0152` Fort Worth Star | `RECORD-00056`, `RECORD-00208` | Canonical first-mention text is truncated after `Fort Worth Star-`; display name needs curator choice. |
| `O1118` Monacle | `W1069` Monocle | `RECORD-00140`, `RECORD-00755` | Cross-type merge: organization to work. The typo evidence and cited-row evidence are split. |
| `P1050` Dan Gilmour | `P0128` Dan Gillmor | `RECORD-00030_REL_001`, `RECORD-00132` | Exact candidate spelling is only in generated `responds_to` metadata, not stored source text. |
| `P2092` Danny Schechter | `P1675` Danny Schecter | `RECORD-00410` | Local source supports `Schecter`; candidate row stores `Schechter`. Preferred display spelling needs evidence beyond this packet. |
| `W0160` Downie's book about protecting serious journalism | `W0100` Book on serious journalism | `RECORD-00130` | Neither label is an exact title in stored source text. |
| `W0573` Powerline.com | `O0612` Powerline | `RECORD-00225` | Cross-type modeling decision: publication work or organization. |

## Approval boundary

Before applying any merge batch, decide:

- retained entity ID for each pair;
- retained display name and aliases;
- whether mention counts should be summed or recalculated;
- whether first-mention fields should change;
- whether same-type safe candidates can be merged in one batch;
- how cross-type cases should be modeled.
