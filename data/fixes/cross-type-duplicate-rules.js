/**
 * Curator rules for entity names extracted under more than one type.
 *
 * Shared by fix-cross-type-duplicates.js (the original whole-file pass) and
 * apply-2026-11-cross-type-merges.js (#875), which applies the same rules
 * without rewriting untouched CSV rows and records each merge in
 * data/entity-merges.csv.
 *
 * Format: { name: keep_types[] } -- any type NOT listed is retired into the
 * first kept row. KEEP_BOTH / KEEP_ALL mean the name is legitimately more than
 * one thing and is left alone.
 */

export const KEEP_BOTH = 'KEEP_BOTH';
export const KEEP_ALL = 'KEEP_ALL';

export const CROSS_TYPE_RULES = {
  // === Media outlets (Org + Work) → keep Organization ===
  // These are all media outlets that got tagged as both Organization and Work.
  // The Organization type is correct; the Work type is a data quality error.
  '60 Minutes': ['Organization'],
  'ABC News': ['Organization'],
  'Al Jazeera': ['Organization'],
  'Assignment Zero': ['Organization'],
  'BuzzFeed': ['Organization'],
  'Buzzmachine': ['Organization'],
  'CBS News': ['Organization'],
  'CNN': ['Organization'],
  'Columbia Journalism Review': ['Organization'],
  'Crikey': ['Organization'],
  'Daily Kos': ['Organization'],
  'Drudge Report': ['Organization'],
  'Face the Nation': ['Organization'],
  'Fox News': ['Organization'],
  'Gawker': ['Organization'],
  'Huffington Post': ['Organization'],
  'MSNBC': ['Organization'],
  'MTP': ['Organization'],
  'Meet The Press': ['Organization'],
  'Meet the Press': ['Organization'],
  'NBC News': ['Organization'],
  'NewAssignment.Net': ['Organization'],
  'Newsweek': ['Organization'],
  'Off The Bus': ['Organization'],
  'Politico': ['Organization'],
  'ProPublica': ['Organization'],
  'Salon': ['Organization'],
  'Slate': ['Organization'],
  'TED': ['Organization'],
  'Talking Points Memo': ['Organization'],
  'The Atlantic': ['Organization'],
  'The Colbert Report': ['Organization'],
  'The Daily Show': ['Organization'],
  'The Economist': ['Organization'],
  'The Guardian': ['Organization'],
  'The Intercept': ['Organization'],
  'The New Republic': ['Organization'],
  'The Reckoning': ['Organization'],
  'The Wall Street Journal': ['Organization'],
  'The Washington Monthly': ['Organization'],
  'The Weekly Standard': ['Organization'],
  'Time': ['Organization'],
  'Vox': ['Organization'],
  'Washington Monthly': ['Organization'],
  'Wikipedia': ['Organization'],
  'The American Prospect': ['Organization'],
  'This Week': ['Organization'],
  'Instapundit': ['Organization'],
  'PressThink': ['Organization'],
  'First Draft': ['Organization'],
  'Channels': ['Organization'],
  'Crossfire': ['Organization'],
  'Front Line Voices': ['Organization'],
  'Sixty Minutes': ['Organization'],
  'Nieman Watchdog': ['Organization'],
  'Public Eye': ['Organization'],
  'OffTheBus': ['Organization'],
  'Frontline': ['Organization'],
  'Newshour': ['Organization'],
  'Nightline': ['Organization'],
  'Firedoglake': ['Organization'],
  'TPM Muckraker': ['Organization'],
  'Undercurrent': ['Organization'],
  'The Revealer': ['Organization'],
  'Nieman Reports': ['Organization'],
  'Global Voices Online': ['Organization'],
  'CBS Evening News': ['Organization'],
  'Opinion Journal': ['Organization'],
  'OffTheBus.Net': ['Organization'],
  'TPM Cafe': ['Organization'],
  'Idea Lab': ['Organization'],
  'Media Shift': ['Organization'],
  'Philly Future': ['Organization'],
  'Suburban Guerilla': ['Organization'],
  'Attytood': ['Organization'],
  'Washington Week': ['Organization'],
  'The Note': ['Organization'],
  'Media Nation': ['Organization'],
  'Campaign Desk': ['Organization'],
  'Brill\'s Content': ['Organization'],
  'This American Life': ['Organization'],
  'Hardball': ['Organization'],
  'BloggerCon III': ['Organization'],
  'Blogger': ['Organization'],
  'Movable Type': ['Organization'],
  'Project 2025': ['Organization'],

  // === Concept vs Organization → keep the more appropriate ===
  'Big Media': ['Concept'],
  'Mainstream Media': ['Concept'],
  'Mainstream Press': ['Concept'],
  'MSM': ['Concept'],
  'Free Press': KEEP_BOTH,       // "free press" concept + Free Press org
  'The Nation': KEEP_BOTH,       // concept + The Nation magazine
  'Open Source': KEEP_ALL,       // concept + radio show

  // === Event vs Organization → keep Event (except WEF) ===
  'Democratic National Convention': ['Event'],
  'DNC': ['Event'],
  'Knight News Challenge': ['Event'],
  'Networked Journalism Summit': ['Event'],
  'Personal Democracy Forum': ['Event'],
  'Yearly Kos': ['Event'],
  'World Economic Forum': KEEP_BOTH,

  // === Location vs Organization → consolidate ===
  'Fleet Center': ['Location'],
  'Harvard': ['Organization'],
  'New York City': ['Location'],
  'White House': KEEP_BOTH,

  // === Person/Org/Work confusion ===
  'Romenesko': ['Person', 'Organization'],  // delete Work
  'Wonkette': ['Person', 'Organization'],   // delete Work

  // === Event vs Location — keep both ===
  'Iowa': KEEP_BOTH,
  'Vietnam': KEEP_BOTH,

  // === Concept vs Event ===
  'Bias Wars': ['Concept'],
  'Political Conventions': ['Event'],
};

/**
 * Names with a rule above that must not be merged until a curator looks again,
 * with the reason. A rule was written for the rows that existed when it was
 * made; a later extraction slice can attach a different referent to the kept
 * row, and folding another row into it would deepen that mix-up.
 */
export const HELD_FOR_CURATOR = {
  'First Draft':
    'O0084 already mixes Claire Wardle\'s First Draft nonprofit (RECORD-00034) with Tim Porter\'s '
    + 'First Draft blog (RECORD-00262, RECORD-00330); W0951 is the blog. Split O0084 before merging.',
};
