/**
 * fix-missing-summaries.js
 *
 * Adds summaries to 39 gap-fill records (RECORD-00663 to RECORD-00701)
 * that were recovered via Wayback Machine but lack summaries.
 *
 * Summaries are generated from titles, excerpts, categories, and
 * knowledge of Jay Rosen's published work.
 *
 * Usage: node data/fixes/fix-missing-summaries.js [--dry-run]
 */

import { readFileSync, writeFileSync } from 'fs';
import { parse } from 'csv-parse/sync';
import { stringify } from 'csv-stringify/sync';

const DRY_RUN = process.argv.includes('--dry-run');
const csvPath = 'data/archive_records-public.csv';

// Summaries keyed by record ID
const SUMMARIES = {
  'RECORD-00663': 'Rosen examines the culture of media punditry through the lens of The Baffler, critiquing how political commentary devolves into spectacle and performance rather than meaningful public discourse.',

  'RECORD-00664': 'An analysis of what Rosen calls "the awayness problem" in journalism — how the press can be physically present yet intellectually absent from the stories it covers. Published in Columbia Journalism Review.',

  'RECORD-00665': 'Rosen assesses the digital revolution\'s impact on journalism practice, arguing that the shift to online media requires rethinking core assumptions about how news organizations operate. Published in Columbia Journalism Review.',

  'RECORD-00666': 'Writing for The American Prospect, Rosen examines what journalists owe the public and how the profession\'s obligations extend beyond simply reporting facts to fostering democratic engagement.',

  'RECORD-00667': 'A substantial essay on civic leadership and journalism\'s role in public life, written for a University of Pennsylvania / Pew Center project exploring the intersection of media, democracy, and civic participation.',

  'RECORD-00668': 'Rosen argues that investigative journalist Murray Waas, through his dogged coverage of the CIA leak case and Bush administration, represents the kind of accountability reporting that Bob Woodward once embodied.',

  'RECORD-00669': 'An early "ghost" draft of Rosen\'s introduction to PressThink, his blog on journalism and its ordeals, laying out the intellectual framework for what would become one of the most influential media criticism sites.',

  'RECORD-00670': 'Rosen examines the press\'s response to Attorney General John Ashcroft\'s post-9/11 policies, questioning whether journalists showed appropriate skepticism or fell into patterns of deference to authority.',

  'RECORD-00671': 'Analysis of the controversy surrounding CBS\'s planned miniseries about Ronald and Nancy Reagan, and what the network\'s decision to pull the program revealed about the relationship between media, politics, and conservative criticism.',

  'RECORD-00672': 'Rosen reflects on the Judith Miller case at the New York Times, arguing that the episode should prompt greater transparency and accountability in how major news organizations handle sourcing and editorial judgment.',

  'RECORD-00673': 'Coverage of Harvard\'s "Blogging, Journalism, and Credibility" conference, examining the emerging tensions and common ground between professional journalists and bloggers during the early blog era. Published in The Nation.',

  'RECORD-00674': 'Rosen reflects on the relationship between traditional literary journalism (exemplified by Norman Mailer) and the new forms of writing emerging through blogs, arguing that bloggers are pushing the boundaries of the form in ways the establishment should recognize.',

  'RECORD-00675': 'Rosen traces the shift in press behavior from deference to authority to outrage during Hurricane Katrina coverage, arguing that the disaster revealed what happens when reporters drop their usual stance of studied neutrality.',

  'RECORD-00676': 'A critique of the New York Times\'s TimesSelect paywall experiment, questioning whether charging for access to columnists like Thomas Friedman and Maureen Dowd was worth the trade-off in reduced influence and readership.',

  'RECORD-00677': 'Rosen examines Bob Woodward\'s role in the Valerie Plame affair, arguing that Woodward\'s transformation from accountability journalist to establishment insider reveals deeper problems with Washington\'s access journalism culture.',

  'RECORD-00678': 'An interview-based piece examining the departure of John Harris and Jim VandeHei from the Washington Post to launch Politico, and the controversy over Dan Froomkin\'s White House Briefing column at washingtonpost.com.',

  'RECORD-00679': 'Rosen examines New York Times editor Bill Keller\'s approach to press criticism, particularly around the paper\'s handling of the Iraq war and domestic surveillance stories, and his preference for letting "our pages" speak for themselves.',

  'RECORD-00680': 'A compilation and analysis of journalism\'s notable failures, examining cases where news organizations got major stories wrong and what these episodes reveal about structural problems in how the press operates.',

  'RECORD-00681': 'Rosen argues that political journalism has retreated from empiricism — the commitment to verifiable facts — in favor of he-said/she-said balance that treats all claims as equivalent regardless of evidence.',

  'RECORD-00682': 'Analysis of how NBC\'s coverage of Hurricane Katrina broke from the conventions of television news, arguing that the emotional directness of reporters like Brian Williams and Anderson Cooper was not a mistake but a return to honest reporting.',

  'RECORD-00683': 'Rosen\'s landmark essay coining the phrase "the people formerly known as the audience," arguing that the internet has transformed passive media consumers into active participants who create, share, and talk back to the press.',

  'RECORD-00684': 'Coverage of a resolution passed by the Association for Education in Journalism and Mass Communication (AEJMC), examining what the professional body\'s stance reveals about tensions within journalism education.',

  'RECORD-00685': 'Rosen examines Karl Rove\'s media strategy and the "cult of the insider" in Washington political journalism, where access to powerful sources becomes more valued than holding those sources accountable.',

  'RECORD-00686': 'A response to Howard Kurtz\'s column about the decline of the traditional media interview, examining how the internet and blogging have changed the power dynamics between journalists and their subjects.',

  'RECORD-00687': 'Rosen publishes editorial guidelines for OffTheBus, the citizen journalism project he co-founded with Arianna Huffington for the 2008 presidential campaign, establishing standards for volunteer bloggers.',

  'RECORD-00688': 'A companion piece to the OffTheBus launch, defining the project\'s editorial mission — "Inquire. Discover. Inform Others." — and articulating what citizen journalism at its best should look like.',

  'RECORD-00689': 'A complete transcript and analysis of all citizen-submitted questions from the CNN/YouTube Democratic presidential debate in Charleston, SC, examining what this format revealed about the gap between what citizens and journalists consider important.',

  'RECORD-00690': 'Rosen analyzes the New York Times\'s decision to shut down TimesSelect, framing it as a verdict by "the court of the web" against paywalling opinion content, and what it means for the future of newspaper business models.',

  'RECORD-00691': 'An examination of the OffTheBus/NewsTrust collaboration to crowdsource quality political coverage, describing a test of filtering the best citizen journalism to the front page during the 2008 campaign.',

  'RECORD-00692': 'Rosen examines Mother Jones\'s approach to debunking media hype and political spin, analyzing how the magazine\'s investigative methods contrast with the credulity of mainstream political reporting.',

  'RECORD-00693': 'An analysis of the press corps\'s long-standing favorable relationship with John McCain, examining how the senator cultivated reporters through access and candor, and what this meant for coverage of his 2008 presidential campaign.',

  'RECORD-00694': 'Rosen proposes a specific editorial assignment for the New York Times, arguing that the paper\'s journalism would improve if it approached certain stories with different methods and greater accountability.',

  'RECORD-00695': 'Rosen analyzes Barack Obama\'s 2008 campaign narrative, arguing that Obama succeeded because he told a more compelling political story than his opponents — one that connected personal biography to national purpose.',

  'RECORD-00696': 'An account of how OffTheBus, the citizen journalism project, grew from an experimental Huffington Post blog into a platform that broke real news during the 2008 campaign, including its relationship with traditional outlets like Meet the Press.',

  'RECORD-00697': 'Rosen examines New York Times executive editor Bill Keller\'s defense of a contested story, analyzing what "I\'m proud to stand by this story" reveals about how editors handle criticism and accountability at major newspapers.',

  'RECORD-00698': 'Analysis of former White House press secretary Scott McClellan\'s memoir and what his account of the Bush administration\'s media strategy reveals about how the press briefing room was used to obscure rather than illuminate.',

  'RECORD-00699': 'Rosen introduces the concept of "audience atomization overcome," arguing that the internet allows dispersed individuals to find each other and organize, breaking the monopoly that mass media once held over public attention and narrative.',

  'RECORD-00700': 'Rosen critiques "he said, she said" journalism — the practice of presenting two opposing claims without assessing their truth — arguing that this form of false balance fails the public and should be abandoned.',

  'RECORD-00701': 'Analysis of the Huffington Post\'s acquisition by AOL, examining the political and media implications of merging a partisan digital publication with a legacy internet company and what it means for the future of online news.',
};

// Read CSV
const content = readFileSync(csvPath, 'utf-8');
const records = parse(content, { columns: true, skip_empty_lines: true });

let updated = 0;
let skipped = 0;

for (const record of records) {
  if (SUMMARIES[record.id]) {
    if (record.summary && record.summary.trim()) {
      console.log(`SKIP ${record.id}: already has summary`);
      skipped++;
      continue;
    }
    record.summary = SUMMARIES[record.id];
    updated++;
    console.log(`UPDATE ${record.id}: ${record.title.substring(0, 50)}...`);
    console.log(`  Summary: ${SUMMARIES[record.id].substring(0, 80)}...`);
  }
}

console.log(`\n--- Results ---`);
console.log(`Updated: ${updated}`);
console.log(`Skipped (already had summary): ${skipped}`);
console.log(`Total summaries available: ${Object.keys(SUMMARIES).length}`);

if (!DRY_RUN) {
  const columns = Object.keys(records[0]);
  const output = stringify(records, { header: true, columns });
  writeFileSync(csvPath, output);
  console.log(`\nWrote ${csvPath}`);
} else {
  console.log('\n[DRY RUN] No files modified.');
}
