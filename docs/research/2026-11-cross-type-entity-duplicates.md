# Cross-type entity duplicates: curator decision sheet

Prepared 2026-11-08 for issue #875. Nothing on this sheet has been merged. Each row needs a curator ruling.

## Where things stand

An entity name is a cross-type duplicate when `data/extracted_entities.csv` holds it under more than one entity type, for example "Marketplace" as both an Organization and a Work. On 2026-11-08 the table had 63 exact-name groups like this.

- **17 merged.** `data/fixes/cross-type-duplicate-rules.js` (the rules moved out of `fix-cross-type-duplicates.js`) already had a rule for each of these names. `data/fixes/apply-2026-11-cross-type-merges.js` applied those rules. Each merge has a row in `data/entity-merges.csv`, and the relationships that named a retired id now point at the canonical id.
- **5 left alone on purpose.** Open Source, The Nation, World Economic Forum, White House and Wonkette have rules that keep more than one type.
- **1 held.** First Draft has a rule, but its kept row is itself mixed up. See [Held](#held-names-with-a-rule).
- **40 with no rule.** These are in the [main table](#names-with-no-rule).

Two more lists follow the main table. One covers C0757 "Pressthink", which the issue asked about. The other covers 21 groups whose names differ only in capitalization or punctuation. The exact-name rules never matched those groups.

Counts are as of 2026-11-08. "Mentions" is `total_mentions`. "Rels" is the number of rows in `data/extracted_relationships.csv` that name the id as source or target.

## How to record a ruling

A merge ruling retires one id into another:

1. Remove the retired row from `extracted_entities.csv`. Add its mention count to the canonical row.
2. Re-point every relationship that names the retired id at the canonical id and name.
3. Append a row to `data/entity-merges.csv` with `retired_id`, `retired_type`, `retired_name`, `canonical_id`, `merged_on`, `issue` and `reason`.

`apply-2026-11-cross-type-merges.js` does all three for any name in `CROSS_TYPE_RULES`. So the easiest way to carry out a ruling on this sheet is to add the name to that file and run the script again. "Keep both" rulings need no data change. Add the name with `KEEP_BOTH` so the next sweep skips it.

## Policy questions that cover several rows

Two questions settle about a third of the table.

1. **Coined terms and the posts that introduced them.** Audience Atomization Overcome, Rollback, The plan is to have no plan, The View from Nowhere, and several case variants below each have two rows: the idea (Concept) and the essay that named it (Work). The suggestion here is to keep both. The idea and the essay are different things to cite, and records discuss each one separately. If the curator would rather have one entity per term, keep the Concept row.
2. **Shows, blogs and newsletters.** The existing rules type a media outlet or program as an Organization even when the extractor called it a Work. Examples are 60 Minutes, This American Life, Instapundit and Daily Kos. The suggestions below follow that precedent. A ruling to the contrary would also reopen the 17 merges already made.

## Names with no rule

| Name | Rows (id, type, mentions, rels) | Suggested keep-type | Reason |
|------|---------------------------------|---------------------|--------|
| Public Opinion | C0162 Concept 5/8; W0877 Work 1/4 | Work | Every row on both ids cites Lippmann's 1922 book, not public opinion as an idea. |
| Rollback | C0292 Concept 3/15; W0726 Work 1/3 | Keep both | Coined term plus the post that named it (policy question 1). |
| Creative Commons | C0394 Concept 1/0; O1680 Organization 1/2 | Organization | The licences in these records are issued by the organization, and the Concept row has no relationships. |
| White House press corps | C0452 Concept 2/4; O1359 Organization 1/7 | Concept | A loose collective of reporters, typed like "Mainstream Press" and "Big Media". |
| Living Stories | C0536 Concept 1/0; W1052 Work 1/2 | Work | Google's open-source news project; the Concept row has no relationships. |
| Audience Atomization Overcome | C0651 Concept 2/3; W0935 Work 1/1 | Keep both | Coined term plus the post that named it (policy question 1). |
| Davos | E0071 Event 1/2; L0212 Location 1/1 | Keep both | The 2005 Eason Jordan remarks at the forum, and the town itself. |
| Columbia Journalism School | L0038 Location 1/0; O1336 Organization 1/1 | Organization | An institution with a dean; the Location row has no relationships. |
| Marketplace | O0013 Organization 4/4; W1019 Work 1/2 | Organization | A public-radio program, typed like This American Life. |
| Membership Puzzle Project | O0164 Organization 2/43; W0925 Work 1/13 | Organization | An NYU research project, typed like Assignment Zero. |
| Studio 20 | O0179 Organization 3/283; W0894 Work 1/3 | Organization | Rosen's NYU program; nearly all evidence is already on O0179. |
| PolitiFact | O0272 Organization 1/8; W1071 Work 1/3 | Organization | A fact-checking outlet (media-outlet precedent). |
| Design Observer | O0525 Organization 2/1; W0983 Work 1/3 | Organization | A blog, typed like Instapundit. |
| Baristanet | O0616 Organization 5/10; W0954 Work 1/1 | Organization | A hyperlocal site (media-outlet precedent). |
| Google News | O0680 Organization 1/2; W0993 Work 1/2 | Organization | A news service (media-outlet precedent). |
| Kausfiles | O0865 Organization 1/0; W0804 Work 1/1 | Organization | A blog (media-outlet precedent). |
| Never Pay Retail | O0866 Organization 1/0; W0805 Work 1/0 | Organization | A website. Neither row has relationships, so either ruling is cheap. |
| Blinq | O0961 Organization 1/0; W0978 Work 1/1 | Organization | The Inquirer blog Dan Rubin wrote (media-outlet precedent). |
| Charlie Rose | P0049 Person 1/2; W0970 Work 1/0 | Person, and the show as an Organization | The host and his program, kept apart the way the Romenesko rule keeps Person and Organization. W0970 has no relationships. |
| Global Voices | W0065 Work 1/1; O1340 Organization 1/1 | Organization | Matches the existing "Global Voices Online" rule. |
| Tampa Bay Times | W0082 Work 1/1; O1578 Organization 1/1 | Organization | A newspaper (media-outlet precedent). |
| Fresh Air | W0109 Work 3/1; O1458 Organization 1/0 | Organization | An NPR program (media-outlet precedent). The merge would fold the busier Work row into O1458. |
| PBS Newshour | W0150 Work 1/0; O1381 Organization 1/6 | Organization | Matches the existing "Newshour" rule. |
| Blue Plate Special | W0181 Work 1/2; O1672 Organization 1/1 | Organization | A PressThink spin-off site (media-outlet precedent). |
| Scripting News | W0323 Work 4/5; O1742 Organization 1/2 | Organization | Dave Winer's blog (media-outlet precedent). |
| TimesSelect | W0419 Work 3/15; C1143 Concept 1/1 | Work | A Times subscription product, not an idea; the Concept row is a stray. |
| McCain News Hunt | W0424 Work 1/1; E0306 Event 1/4 | Event | A one-week crowdsourced review (June 2 to 9) run by OffTheBus and NewsTrust. |
| Placeblogger.com | W0470 Work 1/5; O1751 Organization 1/2 | Organization | Lisa Williams's company and site (media-outlet precedent). |
| The View from Nowhere | C0659 Concept 1/27; W0917 Work 1/3 | Concept | W0917 mixes the term with Thomas Nagel's book of that title. Keep the Concept and decide whether Nagel's book needs its own Work row. |
| Straight Talk Express | O1351 Organization 1/1; C0724 Concept 1/2 | Concept | Records discuss McCain's open-access campaign style, not an institution. |
| Capitol Leader | O1354 Organization 1/7; W0811 Work 1/3 | Organization | The working name of the newspaper that became Politico (media-outlet precedent). |
| CBS This Morning | O1356 Organization 1/0; W0985 Work 1/1 | Organization | A CBS program, typed like Face the Nation. |
| Hotline | O1362 Organization 1/1; W0812 Work 1/1 | Organization | A political tipsheet, typed like The Note. |
| The plan is to have no plan | C0932 Concept 1/4; W0869 Work 1/2 | Keep both | Coined thesis plus the PressThink post (policy question 1). |
| Stop the Presses | W0856 Work 1/2; O1533 Organization 1/1 | Organization | Mark Jacob's newsletter (media-outlet precedent). |
| Threat Modeling | C0962 Concept 1/5; W0871 Work 1/2 | Keep both | The security practice, and Swiderski and Snyder's book of that title. |
| Project on Public Life and the Press | E0339 Event 1/2; O1616 Organization 1/3 | Organization | The Knight-funded project Rosen directed from 1993 to 1997; it was not an event. |
| Yahoo News | O1648 Organization 1/2; W0994 Work 1/1 | Organization | A news portal (media-outlet precedent). |
| Rebooting the News | O1737 Organization 1/2; W1039 Work 1/19 | Organization | Dave Winer's podcast with Rosen, typed like This American Life. Most of the evidence is on W1039. |
| Authentically Local | O1752 Organization 1/3; C1315 Concept 1/1 | Organization | An association of local sites. The one C1315 relationship links the two rows to each other. A merge would turn it into a self-link, so drop that row rather than re-point it. |

## Held: names with a rule

| Name | Rows (id, type, mentions, rels) | Suggested keep-type | Reason |
|------|---------------------------------|---------------------|--------|
| First Draft | O0084 Organization 5/4; W0951 Work 1/1 | Split O0084 first | O0084 mixes two referents: Claire Wardle's misinformation nonprofit (RECORD-00034) and Tim Porter's press blog (RECORD-00262, RECORD-00330). W0951 is Porter's blog. Split the Porter rows into their own Organization, then merge W0951 into that new row. The hold is recorded in `HELD_FOR_CURATOR`. |

## C0757 "Pressthink"

| Name | Rows (id, type, mentions, rels) | Suggested keep-type | Reason |
|------|---------------------------------|---------------------|--------|
| Pressthink / PressThink | C0757 Concept 1/8; O0033 Organization 253/234 | Keep both | Not merged; the evidence is mixed. In RECORD-00504 and RECORD-00834, "pressthink" is the press's belief system ("their pressthink"), the idea the blog is named for. RECORD-00834_REL_023 already says C0757 Originated By O0033, and a merge would turn that row into a self-link. The three RECORD-00755 rows (Carey, Postman and McLuhan "inspired" Pressthink) read as the blog or Rosen's work. Moving those three to O0033 may be worth a ruling. |

## Case and spelling variants

These groups differ only in capitalization or punctuation, so the exact-name rules never matched them. Several fall under an existing rule once the spelling is normalized.

| Names | Rows (id, type, mentions, rels) | Suggested keep-type | Reason |
|-------|---------------------------------|---------------------|--------|
| The people formerly known as the audience | C0098 Concept 15/33; W0916 Work 1/4 | Keep both | Coined term plus the 2006 essay (policy question 1). |
| He said, she said, we said | C0494 Concept 1/1; W0845 Work 1/2 | Keep both | Coined term plus the post (policy question 1). |
| Watergate scandal | E0006 Event 4/9; W0049 Work 1/0 | Event | A historical event. W0049 has no relationships. |
| Bloggercon / BloggerCon | E0058 Event 9/11; O1404 Organization 1/0 | Event | A conference. O1404 has no relationships. |
| Republican Convention | E0088 Event 1/0; O1020 Organization 1/0 | Event | Matches the "Democratic National Convention" rule. |
| TomPaine.com | O0154 Organization 3/2; W0169 Work 1/1 | Organization | A website (media-outlet precedent). |
| On The Media | O0441 Organization 1/11; W0253 Work 3/27 | Organization | A public-radio program (media-outlet precedent). Most of the evidence is on W0253. |
| Buzzmachine / BuzzMachine | O0455 Organization 13/4; W0764 Work 1/3 | Organization | Matches the existing "Buzzmachine" rule. |
| NewAssignment.Net | O0456 Organization 25/97; W0084 Work 6/8 | Organization | Matches the existing "NewAssignment.Net" rule. |
| Back-to-Iraq.com | O0580 Organization 1/1; W0087 Work 2/1 | Organization | A reader-supported blog (media-outlet precedent). |
| Blog for America | O0683 Organization 1/0; W0585 Work 1/1 | Organization | The Dean campaign's blog (media-outlet precedent). |
| OffTheBus.Net | O0751 Organization 3/35; W0673 Work 1/11 | Organization, and consider folding into O0447 OffTheBus | Matches the existing "OffTheBus.Net" rule. Both rows name the same project as O0447. |
| PaidContent.org | O0864 Organization 2/3; W0531 Work 1/1 | Organization | A media website (media-outlet precedent). |
| h2otown.info | O0936 Organization 1/2; W0407 Work 1/0 | Organization | A hyperlocal blog (media-outlet precedent). |
| Beatblogging.org | O1032 Organization 1/5; W0415 Work 3/2 | Organization | A project website, typed like Assignment Zero. |
| Off the Bus | W0036 Work 1/12; C1216 Concept 1/1 | Organization: fold W0036 into O0447 OffTheBus | The existing "Off The Bus" rule keeps Organization, and the only Organization for the project is O0447. C1216 is the idea behind the name (contributors without a Big Media calling card) and can stay a Concept. |
| Cablenewser / CableNewser | W0248 Work 1/1; O1408 Organization 1/0 | Organization | A blog (media-outlet precedent). |
| The obsolete interview | W0289 Work 1/2; C0899 Concept 1/5 | Keep both | Jeff Jarvis's post and the idea it argued, which other records discuss on its own (policy question 1). |
| Spot.us | W0518 Work 1/2; O1557 Organization 1/7 | Organization | A crowdfunded journalism platform (media-outlet precedent). |
| The View from Somewhere | C0837 Concept 1/1; W0928 Work 1/2 | Keep both | Different referents: C0837 is Rosen's phrase in RECORD-00655, and W0928 is Lewis Raven Wallace's book. |
| Unbreaking news | W0885 Work 1/1; C1059 Concept 1/1 | Keep both | Rob Wijnberg's essay series and the De Correspondent approach it describes (policy question 1). |
