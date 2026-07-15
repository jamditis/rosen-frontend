/**
 * fix-author-is-document-summaries.js
 *
 * Corrects summaries that open by equating the author with the document, e.g.
 * "Rosen is an open letter to Bill Gates..." or "Rosen is a response to...".
 * The summary generator sometimes used "Rosen" as the sentence subject where it
 * meant to describe the piece, producing a grammar error a reader spots at a
 * glance (reported for RECORD-00444, issue #581). The fix rewrites only the
 * "Rosen is a/an " opener to "This is a/an ", preserving the article and the
 * rest of the summary verbatim. Several of these summaries name "Jay Rosen"
 * correctly later in the same sentence, so this removes the mislabeling without
 * dropping the author from the description.
 *
 * What it targets: an explicit, reviewed set of 14 records, each PINNED to the
 * exact summary text that was inspected in origin/main (REVIEWED_BEFORE). The
 * script rewrites a target only when its current summary still equals that
 * reviewed text; if the summary already reads as corrected it is skipped (so
 * re-runs are idempotent), and if it has drifted to anything else the run fails
 * closed rather than editing on a guess. Pinning to the reviewed text — instead
 * of choosing records by a pattern — is what makes over-match impossible: a
 * bare "Rosen is a/an" opener would also rewrite a legitimate person
 * introduction ("Jay Rosen is a professor at NYU..."), and even a document-noun
 * allowlist misfires on person-compounds ("Rosen is an interview subject...").
 * The list was derived by sweeping origin/main for every "Rosen is a/an" summary
 * opener (14 of 1,029) and confirming each is the conflation. The regression
 * guard in tests/csv-quality.test.js (#581) generalizes to future records with a
 * pattern; this script does not, by design.
 *
 * Editing strategy: this does NOT round-trip the file through a CSV serializer.
 * The corpus CSV stores multi-line fields (raw_text) with bare-LF newlines and
 * CRLF record delimiters; re-serializing rewrites every record's line endings
 * and quoting (csv-stringify only force-quotes fields containing its record
 * delimiter, so bare-LF fields get un-quoted). Instead it replaces only the
 * exact escaped summary strings in the raw file bytes, then re-parses the
 * result and asserts that exactly the targeted summaries changed and every
 * other field of every record is byte-identical. That field-level post-edit
 * diff makes a wrong-field edit (e.g. matching the same text inside a raw_text
 * field) impossible rather than merely unlikely. The write is atomic: a
 * same-directory temp file is renamed over the source only after every check
 * passes, so an interrupted run never leaves a half-written CSV.
 *
 * Usage: node data/fixes/fix-author-is-document-summaries.js [--dry-run]
 */

import { readFileSync, writeFileSync, renameSync } from 'fs';
import { parse } from 'csv-parse/sync';

const DRY_RUN = process.argv.includes('--dry-run');

const csvPath = decodeURIComponent(new URL('../archive_records-public.csv', import.meta.url).pathname.replace(/^\/([A-Z]:)/, '$1'));
const raw = readFileSync(csvPath, 'utf-8');

// Strict parse (no relax_column_count) so a malformed row surfaces instead of
// being silently best-effort parsed. Matches how the export and tests read it.
const parseOptions = { columns: true, skip_empty_lines: true };
const records = parse(raw, parseOptions);

// The reviewed set: each target id pinned to the exact summary text inspected in
// origin/main and confirmed to be the author=document conflation. The fix only
// touches a summary that still equals its reviewed text, so it cannot rewrite a
// record whose summary has since been changed to something legitimate.
const REVIEWED_BEFORE = {
  "RECORD-00054": "Rosen is an interview with Mark Jacob, a retired journalist, who reflects on his experience in political journalism and critiques the \"he said/she said\" approach to news reporting. Jacob argues that this approach, prioritizing equal representation of both sides regardless of truthfulness, has been exploited by propagandists and has ultimately failed to serve democracy. He details how this approach, while intended to appear fair and objective, unintentionally enabled the spread of misinformation and undermined the power of fact-checking. He also discusses the various motivations behind this flawed approach, including commercial pressures, the pursuit of attention, and the fear of upsetting powerful figures or the public.",
  "RECORD-00173": "Rosen is a preview of Jay Rosen's attendance at the BlogHer conference in 2005. He discusses the conference's goals to increase the visibility and networking of women bloggers, notes the notable attendees and speakers, and reflects on the notable absences of prominent conservative women bloggers, prompting discussion about the conference's inclusivity and the nature of online public discourse.",
  "RECORD-00265": "Rosen is a blog post presenting a dialogue between Jay Rosen and a White House correspondent (“Hack”) regarding the role and limitations of the White House press corps. The correspondent challenges Rosen’s criticism of the corps’ coverage of the President’s trip to Iraq, arguing that the “body watch” – the constant monitoring of the President for safety reasons – necessitates their presence, even in potentially propagandistic settings. The discussion expands to explore the overreliance on the White House for news, the influence of access and “insider” information, and the need for a more balanced approach incorporating outside perspectives.",
  "RECORD-00267": "Rosen is a transcript of an email interview between Jay Rosen and Howard Kurtz, discussing the changing nature of the interview in the context of the rise of the internet and citizen journalism. Rosen argues that the traditional interview is not obsolete, but the balance of power has shifted due to sources having more direct access to audiences. He discusses his experiences with interviews, the limitations of soundbites, and the challenges of collaborative journalism projects like Assignment Zero and Off the Bus, which aim to incorporate citizen contributors into news coverage.",
  "RECORD-00281": "Rosen is a critique of \"strategy coverage\" in campaign journalism. Rosen argues that this type of reporting, which focuses on the candidates' strategic calculations and media manipulation, serves no clear public purpose and is a bankrupt form of journalism. He criticizes the lack of transparency and the inherent bias towards the 'inside' perspective, ultimately advocating for a shift towards more substantive political reporting.",
  "RECORD-00294": "Rosen is a debriefing of the 2004 Democratic National Convention, focusing on the evolving relationship between mainstream media and blogs. Rosen observes a significant shift in how journalists perceive blogs, noting increased adoption and attention from mainstream outlets. He predicts a future where blogging will become commonplace, losing its novelty, but the interactive platform of blogging as a tool for public conversation will remain important. The discussion touches upon the ritualistic aspects of political conventions, and the lack of coverage of these ritual elements by mainstream media. Rosen questions whether the significance of 'blogging' itself will fade, while the underlying practice of self-publishing and online public discourse will persist.",
  "RECORD-00299": "Rosen is a response by Jay Rosen to Zachary Roth's criticism of Campaign Desk's critique of webloggers' release of early exit poll data. Rosen defends Campaign Desk's position, arguing that their criticism wasn't merely about tone but about a perceived ethical lapse and an immature disregard for journalistic standards. He challenges Roth's claim that Campaign Desk's actions were intended to impress the traditional press, highlighting the consistent critique of both mainstream media and blogs. Rosen ultimately emphasizes the importance of public debate in establishing journalistic standards, while questioning Roth's implication that Campaign Desk's youth diminishes their arguments.",
  "RECORD-00336": "Rosen is a distillation of a New York Times Q&A with readers regarding their explosive report on John McCain's involvement with lobbyist Vicki Iseman. The NYT defends its reporting choices, addressing concerns about anonymity, the inclusion of potentially unverified information about a romantic relationship, the timing of the story, and the potential impact on McCain's campaign. They maintain the story's accuracy and their commitment to thorough investigative journalism, despite the significant backlash.",
  "RECORD-00375": "Rosen is a response to Nicholas Lemann's critique of citizen journalism, \"Amateur Hour.\"  Rosen largely agrees with Lemann's concerns about the quality and reliability of citizen journalism but argues against a simplistic dichotomy between professional and amateur journalism. He emphasizes the historical continuity between blogging and earlier forms of citizen journalism and suggests that a more nuanced understanding is needed, recognizing both the potential and limitations of both professional and citizen journalism. Rosen also highlights the challenges of funding and sustaining high-quality citizen journalism initiatives, like his own New Assignment.Net.",
  "RECORD-00386": "Rosen is a call to action, recruiting journalists and other skilled individuals to volunteer for Assignment Zero, a crowdsourced journalism project.  The project aims to collaboratively report on the spread of crowdsourcing and peer production methods, breaking down a large story into manageable parts for a team of professional and amateur contributors.  Rosen highlights the need for editors, reporters, web-savvy journalists, organizers, and developers to help manage the project's complexity and scale, emphasizing the innovative, pro-am model of journalism.",
  "RECORD-00390": "Rosen is a response to Michael Skube's opinion piece in the Los Angeles Times criticizing blogs' journalistic value.  Rosen challenges Skube's claims by providing numerous examples of blogs engaging in thorough fact-finding and investigative reporting. He argues that the traditional journalistic gatekeeping system is being challenged by the rise of citizen journalism and that the act of reporting is inherently democratic and not limited to professionally trained journalists.",
  "RECORD-00396": "Rosen is a response to David Shaw's critique of Jay Rosen's proposal for a more openly liberal news network as a counterpoint to Fox News. Rosen defends his idea as a provocation meant to challenge the prevailing journalistic norms, particularly the concept of 'objectivity' as a neutral stance. He argues against the idea that striving for neutrality prevents truth-telling and suggests that alternative approaches to journalism are needed in a changing media landscape.  The core of Rosen's argument challenges the established 'Contraption' – the standard routines and principles of mainstream journalism – arguing that it inhibits truth-telling and fails to address the evolving political and media environment.",
  "RECORD-00444": "Rosen is an open letter to Bill Gates offering advice on how to create a successful blog.  Rosen argues against a blog focused on Microsoft or technical details, suggesting instead a newsy blog where Gates shares his opinions on global issues, politics, and current events. He emphasizes authenticity and a personal voice, advocating against the use of ghostwriters and promoting a culture of freedom of speech within Microsoft for employee bloggers.",
  "RECORD-00448": "Rosen is an interview with John McQuaid, a Pulitzer Prize-winning investigative journalist who left the Times-Picayune due to cost-cutting and the changing landscape of journalism.  McQuaid discusses his transition to online investigative journalism, reflecting on the limitations of traditional newspaper models and the potential of the web for in-depth reporting. He highlights the shift in access to information, the changing role of the reader, and the challenges and opportunities of adapting investigative journalism to the dynamic nature of the internet.",
};
const TARGET_IDS = new Set(Object.keys(REVIEWED_BEFORE));

// The opener is unambiguous within a reviewed summary, so the correction is a
// deterministic rewrite of just the "Rosen is a/an " prefix. Applied only to the
// pinned reviewed text, never to arbitrary input.
const OPENER = /^(\s*)(?:Jay\s+)?Rosen\s+is\s+(an?\s+)/i;
function correct(before) {
  return before.replace(OPENER, '$1This is $2');
}

// The exact form a field takes in the raw CSV. These summaries all contain
// commas or quotes, so they are quoted; a field with an embedded " has it
// doubled. Try the quoted form first, then a bare form, so the replacement is
// correct regardless of whether the field happened to be quoted.
function rawForms(value) {
  return [`"${value.replace(/"/g, '""')}"`, value];
}

let text = raw;
const failures = [];

// Guard the pinned data itself: every reviewed text must actually open with the
// pattern the correction rewrites, or the pin is wrong and the run must stop.
for (const [id, before] of Object.entries(REVIEWED_BEFORE)) {
  if (!OPENER.test(before)) failures.push(`reviewed text for ${id} does not open with "Rosen is a/an"`);
}

// Confirm every reviewed id still exists, so a deleted or renamed record
// surfaces here instead of the fix silently doing nothing for it.
const presentIds = new Set(records.map((r) => r.id));
for (const id of TARGET_IDS) {
  if (!presentIds.has(id)) failures.push(`target ${id} not found in CSV`);
}

const edits = [];
for (const record of records) {
  if (!TARGET_IDS.has(record.id)) continue;
  const reviewed = REVIEWED_BEFORE[record.id];
  const corrected = correct(reviewed);
  const current = record.summary;
  // Already corrected: skip, so re-runs are idempotent.
  if (current === corrected) continue;
  // Drifted away from the reviewed text: fail closed rather than guess. A target
  // whose summary is neither the reviewed defect nor its known correction has
  // been edited elsewhere and must be re-reviewed before this runs again.
  if (current !== reviewed) {
    failures.push(`${record.id}: summary no longer matches the reviewed text; re-review before running`);
    continue;
  }
  edits.push({ id: record.id, before: reviewed, after: corrected });
}
for (const edit of edits) {
  let applied = false;
  for (const oldForm of rawForms(edit.before)) {
    const occurrences = text.split(oldForm).length - 1;
    if (occurrences === 1) {
      const newForm = oldForm.startsWith('"')
        ? `"${edit.after.replace(/"/g, '""')}"`
        : edit.after;
      // Function replacer, not a string: a string replacement would interpret
      // $$, $&, $`, $' and $n inside newForm as special patterns. A summary can
      // legitimately contain a "$", so return the text verbatim instead.
      text = text.replace(oldForm, () => newForm);
      applied = true;
      break;
    }
    if (occurrences > 1) {
      // Ambiguous: refuse rather than risk editing the wrong occurrence.
      failures.push(`${edit.id}: summary string found ${occurrences} times, not editing`);
      applied = true; // mark handled so it is not double-reported as "not found"
      break;
    }
  }
  if (!applied) failures.push(`${edit.id}: summary string not found in raw CSV`);
}

// Field-level post-edit verification: re-parse the edited text and confirm that
// ONLY the targeted summaries changed and nothing else moved. This is the guard
// that makes a wrong-field edit impossible -- if a replacement had landed in a
// raw_text field that shared the same text, the targeted summary would read
// unchanged (or another field would differ) and this fails closed.
if (!failures.length) {
  const expectedSummary = new Map(edits.map((e) => [e.id, e.after]));
  let after;
  try {
    after = parse(text, parseOptions);
  } catch (err) {
    failures.push(`edited CSV no longer parses: ${err.message}`);
    after = null;
  }
  if (after) {
    if (after.length !== records.length) {
      failures.push(`record count changed: ${records.length} -> ${after.length}`);
    } else {
      const columns = Object.keys(records[0]);
      for (let i = 0; i < records.length; i++) {
        const before = records[i];
        const now = after[i];
        if (before.id !== now.id) {
          failures.push(`row ${i}: id changed ${before.id} -> ${now.id}`);
          continue;
        }
        for (const col of columns) {
          if (col === 'summary') continue;
          if (before[col] !== now[col]) {
            failures.push(`${before.id}: non-summary field "${col}" changed unexpectedly`);
          }
        }
        const want = expectedSummary.has(now.id) ? expectedSummary.get(now.id) : before.summary;
        if (now.summary !== want) {
          failures.push(`${now.id}: summary did not match expected result after edit`);
        }
      }
    }
  }
}

console.log(`\n${'='.repeat(60)}`);
console.log(`  Author-is-document summary fix ${DRY_RUN ? '(DRY RUN)' : ''}`);
console.log(`${'='.repeat(60)}\n`);

for (const edit of edits) {
  console.log(`${edit.id}`);
  console.log(`  Before: ${edit.before.substring(0, 90)}`);
  console.log(`  After:  ${edit.after.substring(0, 90)}`);
  console.log();
}

console.log(`${'─'.repeat(60)}`);
console.log(`  Summaries matched: ${edits.length}`);
if (failures.length) {
  console.log(`  Failures: ${failures.length}`);
  for (const f of failures) console.log(`    - ${f}`);
}
console.log(`${'─'.repeat(60)}\n`);

// Fail closed: if any target could not be applied cleanly, or the post-edit
// verification found any unexpected change, write nothing.
if (failures.length) {
  console.error('Aborting without writing: edits could not be applied and verified safely.');
  process.exit(1);
}

if (!DRY_RUN && edits.length > 0) {
  // Atomic write: same-directory temp file, then rename over the source so an
  // interrupted run never leaves a partially written CSV.
  const tmpPath = `${csvPath}.tmp`;
  writeFileSync(tmpPath, text);
  renameSync(tmpPath, csvPath);
  console.log(`Wrote corrected CSV to ${csvPath}`);
} else if (DRY_RUN) {
  console.log('Dry run — no files were modified.');
} else {
  console.log('No changes needed.');
}
