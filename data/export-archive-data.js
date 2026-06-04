#!/usr/bin/env node
/**
 * Export Archive Data to JSON
 *
 * This script reads the CSV files and generates a pre-processed archive-data.json
 * file that can be served statically, eliminating the need for Google Sheets fetch
 * and client-side CSV parsing.
 *
 * Usage: node csv/export-archive-data.js
 */

import fs from 'fs';
import path from 'path';
import { parse } from 'csv-parse/sync';
import { fileURLToPath } from 'url';
import { generateAllFeeds } from './lib/rss-generator.js';
import { generateOPML, generateSubscriptionOPML } from './lib/opml-generator.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Era definitions (matching constants.js)
const ERAS = [
  "Public Journalism (90s)",
  "Blogging Launch & Digital Disruption (2000-2004)",
  "Peak Blogging & Citizen Journalism (2005-2009)",
  "Social Media & Financial Crisis (2010-2015)",
  "View from Nowhere (10s)",
  "Trump Era & Democratic Crisis (2016-2020)",
  "Democracy in Crisis (20s)",
  "Platform Transition & Future Models (2021-Present)"
];

// Dissertation record (matching archiveService.js)
const DISSERTATION_RECORD = {
  id: 'dissertation-1986',
  title: 'The Impossible Press: American Journalism and the Decline of Public Life',
  author: 'Jay Rosen',
  date: '1986-01-01',
  year: '1986',
  era: 'Public Journalism (90s)',
  pub: 'New York University (Ph.D. Dissertation)',
  url: '/j/rosen-archive/dissertation/reader/',
  summary: 'Rosen\'s doctoral dissertation traces the history of the idea that the function of the press is to inform the public. It argues that the rise of the mass circulation newspaper, while creating a technical ability to reach everyone, actually undermined the conditions necessary for a "universal town meeting." Drawing heavily on Walter Lippmann and John Dewey, it suggests that the professionalization of journalism ("objectivity") was a retreat from the problem of creating a genuine public life in a complex society. It contrasts news as "symptom" vs. news as "symbol" and explores how the press creates a "pseudo-environment" of public opinion.',
  quote: 'An impossible press was born, one which sought to solve the whole problem of public life simply by controlling the conduct of journalists.',
  categories: ['Journalism Theory & Practice', 'Politics & Democracy', 'Press & Media Criticism', 'Audience & Public Engagement'],
  concepts: ['Public Sphere', 'Omnicompetent Citizen', 'Objectivity', 'Mass Society', 'Professionalism', 'Communication vs Community', 'Democracy and Distance'],
  tags: ['Walter Lippmann', 'John Dewey', 'James Gordon Bennett', 'Joseph Pulitzer', 'Penny Press', 'Yellow Journalism', 'Robert Park', 'Tocqueville'],
  verified: true,
  type: 'Dissertation'
};

// Helper functions (matching archiveService.js logic)
function cleanTags(str) {
  if (!str) return [];
  return str.replace(/[\[\]"']/g, '').split(/[;,]/)
    .map(s => s.trim())
    .filter(s => s && s.length > 0 && !s.startsWith('='));
}

function formatDate(str) {
  if (!str) return '';
  const d = new Date(str);
  return isNaN(d.getTime()) ? '' : d.toISOString().split('T')[0];
}

function getEra(dateStr) {
  const y = new Date(dateStr).getFullYear();
  if (!y || Number.isNaN(y)) return '';
  if (y < 2000) return 'Public Journalism (90s)';
  if (y < 2005) return 'Blogging Launch & Digital Disruption (2000-2004)';
  if (y < 2010) return 'Peak Blogging & Citizen Journalism (2005-2009)';
  if (y < 2016) return 'Social Media & Financial Crisis (2010-2015)';
  if (y < 2021) return 'Trump Era & Democratic Crisis (2016-2020)';
  return 'Platform Transition & Future Models (2021-Present)';
}

function processRecord(row, index, type, relationshipsMap) {
  const rawCats = row.thematic_categories || row.Thematic_Categories || row.Categories || '';
  const rawConcepts = row.key_concepts || row.Key_Concepts || row.Concepts || '';
  const rawTags = row.tags || row.Tags || '';
  const rawDate = row.publication_date || row.Publication_Date || row.Date || '';
  const rawPub = row.original_publication || row.Original_Publication || row.Platform || 'Unknown';
  const rawTitle = row.title || row.Title || row.Content || 'Untitled';
  const rawId = row.id || row.ID || `${type}-${index}`;
  const rawUrl = row.url || row.URL || '#';

  let author = (row.author || row.Author || 'Jay Rosen').trim();

  const cats = cleanTags(rawCats);
  const concepts = cleanTags(rawConcepts);
  const tags = cleanTags(rawTags);
  const date = formatDate(rawDate);
  const pub = rawPub.trim();
  const title = rawTitle.trim();

  const displayTitle = (type === 'social' && title.length > 100)
    ? title.substring(0, 100) + '...'
    : title;

  const directRelIds = relationshipsMap[rawId] || [];
  const isVerified = (row.verified || row.Verified) === 'TRUE' ||
                     (row.verified || row.Verified) === 'true' ||
                     (row.verified || row.Verified) === 'Yes' ||
                     (row.verified || row.Verified) === true ||
                     type === 'social' ||
                     rawId.startsWith('CLIP-');

  // Extract thread_data for THREAD records
  // Check if thread_data column exists directly (from merged records)
  let threadData = null;
  if (rawId.startsWith('THREAD-')) {
    if (row.thread_data) {
      try {
        threadData = typeof row.thread_data === 'string'
          ? JSON.parse(row.thread_data)
          : row.thread_data;
      } catch (e) {
        console.warn(`Failed to parse thread_data column for ${rawId}:`, e);
      }
    }
    // Fallback: try notes field (legacy format)
    if (!threadData && row.notes) {
      const match = row.notes.match(/thread_data:\s*(\{.*\})/);
      if (match) {
        try {
          threadData = JSON.parse(match[1]);
        } catch (e) {
          console.warn(`Failed to parse thread_data from notes for ${rawId}:`, e);
        }
      }
    }
  }

  const record = {
    id: rawId,
    title: displayTitle,
    author: author,
    date: date,
    year: date ? date.split('-')[0] : '',
    era: ((row.era || row.Era || '').trim() || getEra(date)),
    pub: pub,
    url: rawUrl,
    summary: (row.summary || row.Summary || ''),
    quote: (row.pull_quote || row.Pull_Quote || row.excerpt || row.raw_text || ''),
    categories: cats,
    concepts: concepts,
    tags: tags,
    verified: isVerified,
    // Auto-submitted records publish immediately but are flagged for a human
    // pass (the 'live but flagged' model in backend/scripts/process_submission.py).
    // Persisted here so review/curator tooling can find flagged records; the UI
    // marker that surfaces this to readers is tracked in issue #350.
    needsReview: (row.needs_review || row.Needs_Review || '').toString()
      .trim().toLowerCase() === 'true',
    type: type,
    relatedIds: directRelIds
  };

  // Add thread_data if present
  if (threadData) {
    record.thread_data = threadData;
  }

  return record;
}

function buildRelationshipsMap(relationshipsData) {
  const relationshipsMap = {};

  for (const rel of relationshipsData) {
    const source = rel.source_record_id || rel.Source || rel.source;
    const target = rel.target_entity_id || rel.Target || rel.target;

    if (source && target) {
      if (!relationshipsMap[source]) relationshipsMap[source] = [];
      if (!relationshipsMap[target]) relationshipsMap[target] = [];
      if (!relationshipsMap[source].includes(target)) relationshipsMap[source].push(target);
      if (!relationshipsMap[target].includes(source)) relationshipsMap[target].push(source);
    }
  }

  return relationshipsMap;
}

async function main() {
  console.log('📚 Starting archive data export...\n');

  // File paths
  const archiveRecordsPath = path.join(__dirname, 'archive_records-public.csv');
  const socialPostsPath = path.join(__dirname, 'social_posts.csv');
  const relationshipsPath = path.join(__dirname, 'extracted_relationships.csv');
  const entitiesPath = path.join(__dirname, 'extracted_entities.csv');
  const outputPath = path.join(__dirname, 'archive-data.json');

  // Check that files exist
  const filesToCheck = [
    { path: archiveRecordsPath, name: 'archive_records-public.csv' },
    { path: socialPostsPath, name: 'social_posts.csv' },
    { path: relationshipsPath, name: 'extracted_relationships.csv' },
    { path: entitiesPath, name: 'extracted_entities.csv' }
  ];

  for (const file of filesToCheck) {
    if (!fs.existsSync(file.path)) {
      console.error(`❌ Error: ${file.name} not found at ${file.path}`);
      process.exit(1);
    }
    console.log(`✓ Found ${file.name}`);
  }

  console.log('\n📖 Reading CSV files...');

  // Read and parse CSVs
  const archiveRecordsCsv = fs.readFileSync(archiveRecordsPath, 'utf-8');
  const socialPostsCsv = fs.readFileSync(socialPostsPath, 'utf-8');
  const relationshipsCsv = fs.readFileSync(relationshipsPath, 'utf-8');
  const entitiesCsv = fs.readFileSync(entitiesPath, 'utf-8');

  const archiveRecordsData = parse(archiveRecordsCsv, { columns: true, skip_empty_lines: true });
  const socialPostsData = parse(socialPostsCsv, { columns: true, skip_empty_lines: true });
  const relationshipsData = parse(relationshipsCsv, { columns: true, skip_empty_lines: true });
  const entitiesData = parse(entitiesCsv, { columns: true, skip_empty_lines: true });

  console.log(`  - Archive records: ${archiveRecordsData.length} rows`);
  console.log(`  - Social posts: ${socialPostsData.length} rows`);
  console.log(`  - Relationships: ${relationshipsData.length} rows`);
  console.log(`  - Entities: ${entitiesData.length} rows`);

  // Build relationships map
  console.log('\n🔗 Building relationships map...');
  const relationshipsMap = buildRelationshipsMap(relationshipsData);

  // Process entities
  console.log('\n👤 Processing entities...');
  const entities = entitiesData.map(row => ({
    id: row.entity_id,
    type: row.entity_type,
    name: row.entity_name,
    normalizedName: row.normalized_name,
    role: row.role_or_description || '',
    affiliation: row.affiliation || '',
    prominence: parseInt(row.prominence_score) || 0,
    firstMentionRecordId: row.first_mention_record_id,
    totalMentions: parseInt(row.total_mentions) || 1
  }));

  // Group entities by type for facets
  const entityTypes = new Set();
  entities.forEach(e => entityTypes.add(e.type));

  // Track categories, publications, and search terms
  const categories = new Set();
  const publications = new Set();
  const searchTerms = new Set();

  // Add entity names to search terms
  entities.forEach(e => {
    if (e.name && e.name.length > 2) searchTerms.add(e.name);
    if (e.normalizedName && e.normalizedName !== e.name) searchTerms.add(e.normalizedName);
  });

  // Process records
  console.log('\n⚙️  Processing records...');

  const mainRecords = archiveRecordsData.map((row, i) => {
    const record = processRecord(row, i, 'article', relationshipsMap);

    // Only contribute to facets/autocomplete if the record will survive the
    // verified filter below. Unverified rows can carry stub or 404-chrome
    // titles (e.g. HuffPost "Not Found" placeholders) that must not leak
    // into searchTerms or publications.
    if (record.verified) {
      record.categories.forEach(c => { categories.add(c); searchTerms.add(c); });
      record.concepts.forEach(c => searchTerms.add(c));
      record.tags.forEach(t => searchTerms.add(t));
      if (record.pub && record.pub.length > 2) { publications.add(record.pub); searchTerms.add(record.pub); }
      if (record.title.length > 3) searchTerms.add(record.title);
    }

    return record;
  });

  const socialRecords = socialPostsData.map((row, i) => {
    const record = processRecord(row, i, 'social', relationshipsMap);

    // Generate a useful summary for social records (CSV has no summary column).
    // Without this, summary would be empty and the modal would show nothing useful.
    if (!record.summary) {
      const platform = record.pub || 'social media';
      const dateStr = record.date || '';
      const catList = record.categories.length > 0 ? record.categories.join(', ') : '';
      const parts = [`A ${platform} post by ${record.author || 'Jay Rosen'}`];
      if (dateStr) parts[0] += ` from ${dateStr}`;
      parts[0] += '.';
      if (catList) parts.push(`Topics: ${catList}.`);
      record.summary = parts.join(' ');
    }

    if (record.verified) {
      record.categories.forEach(c => { categories.add(c); searchTerms.add(c); });
      record.concepts.forEach(c => searchTerms.add(c));
      record.tags.forEach(t => searchTerms.add(t));
      if (record.pub && record.pub.length > 2) { publications.add(record.pub); searchTerms.add(record.pub); }
      if (record.title.length > 3) searchTerms.add(record.title);
    }

    return record;
  });

  // ============================================
  // THREAD DETECTION AND FILTERING
  // ============================================
  console.log('\n🧵 Detecting threads...');

  // Build lookup map for social post content (id -> raw_text)
  const socialContentMap = new Map();
  socialPostsData.forEach(row => {
    const id = row.id || row.ID;
    const content = row.raw_text || row.content || row.excerpt || '';
    if (id && content) {
      socialContentMap.set(id, content);
    }
  });

  // Step 1: Map Bluesky post URLs to rkeys for thread chain detection
  const rkeyToRow = new Map();   // rkey -> raw CSV row
  const idToRkey = new Map();    // post ID -> rkey
  socialPostsData.forEach(row => {
    if (row.platform === 'Bluesky' && row.url) {
      const rkey = row.url.split('/').pop();
      if (rkey) {
        rkeyToRow.set(rkey, row);
        idToRkey.set(row.id || row.ID, rkey);
      }
    }
  });

  // Step 2: Build parent-child relationships from responds_to AT URIs
  const childrenOfRkey = new Map();  // parentRkey -> [childRow, ...]
  const postParentId = new Map();    // childId -> parentId
  socialPostsData.forEach(row => {
    if (row.responds_to && row.responds_to.trim()) {
      const parentRkey = row.responds_to.split('/').pop();
      if (parentRkey && rkeyToRow.has(parentRkey)) {
        if (!childrenOfRkey.has(parentRkey)) childrenOfRkey.set(parentRkey, []);
        childrenOfRkey.get(parentRkey).push(row);
        const parentRow = rkeyToRow.get(parentRkey);
        postParentId.set(row.id || row.ID, parentRow.id || parentRow.ID);
      }
    }
  });

  // Step 3: Calculate chain sizes and collect thread posts
  function getChainSize(rkey) {
    let size = 1;
    const kids = childrenOfRkey.get(rkey) || [];
    for (const kid of kids) {
      const kidRkey = idToRkey.get(kid.id || kid.ID);
      if (kidRkey) size += getChainSize(kidRkey);
    }
    return size;
  }

  function collectChainPosts(rkey, depth = 0) {
    const row = rkeyToRow.get(rkey);
    if (!row) return [];
    const result = [{ row, depth }];
    const kids = (childrenOfRkey.get(rkey) || [])
      .sort((a, b) => (a.publication_date || '').localeCompare(b.publication_date || ''));
    for (const kid of kids) {
      const kidRkey = idToRkey.get(kid.id || kid.ID);
      if (kidRkey) result.push(...collectChainPosts(kidRkey, depth + 1));
    }
    return result;
  }

  // Step 4: Find thread roots (chains of 3+ posts)
  const allRkeys = new Set([...rkeyToRow.keys()]);
  const threadRoots = [];
  for (const [rkey, row] of rkeyToRow) {
    const isRoot = !row.responds_to || !row.responds_to.trim() ||
                   !allRkeys.has(row.responds_to.split('/').pop());
    if (isRoot) {
      const size = getChainSize(rkey);
      if (size >= 3) threadRoots.push({ rkey, row, size });
    }
  }
  threadRoots.sort((a, b) => b.size - a.size);

  // Step 5: Collect post IDs covered by existing THREAD records
  const existingThreadRecords = mainRecords.filter(r => r.id.startsWith('THREAD-'));
  const existingThreadPostIds = new Set();
  existingThreadRecords.forEach(r => {
    if (r.thread_data && r.thread_data.posts) {
      r.thread_data.posts.forEach(p => existingThreadPostIds.add(p.id));
    }
  });

  // Step 6: Generate new THREAD records and collect all thread member IDs
  const threadMemberIds = new Set([...existingThreadPostIds]);
  let nextThreadNum = existingThreadRecords.length + 1;
  const generatedThreadRecords = [];

  for (const root of threadRoots) {
    const posts = collectChainPosts(root.rkey);
    const postIds = posts.map(p => (p.row.id || p.row.ID));

    // Check if already covered by an existing THREAD record
    const alreadyCovered = postIds.some(id => existingThreadPostIds.has(id));

    // Mark all posts as thread members regardless
    postIds.forEach(id => threadMemberIds.add(id));

    if (alreadyCovered) continue;

    // Generate a new THREAD record
    const threadId = `THREAD-${String(nextThreadNum).padStart(5, '0')}`;
    nextThreadNum++;

    const firstRow = posts[0].row;
    let titleText = (firstRow.raw_text || firstRow.excerpt || '').trim();
    titleText = titleText.replace(/https?:\/\/\S+/g, '').replace(/^(@\S+\s*)+/, '').trim();
    const sentEnd = titleText.search(/[.!?]\s/);
    if (sentEnd > 0 && sentEnd < 100) {
      titleText = titleText.substring(0, sentEnd + 1);
    } else if (titleText.length > 80) {
      titleText = titleText.substring(0, 80).trim() + '...';
    }
    if (titleText.length < 10) titleText = `Bluesky thread (${posts.length} posts)`;

    const threadDate = formatDate(firstRow.publication_date);
    generatedThreadRecords.push({
      id: threadId,
      title: titleText,
      author: 'Jay Rosen',
      date: threadDate,
      year: threadDate ? threadDate.split('-')[0] : '',
      era: getEra(threadDate),
      pub: 'Bluesky',
      url: firstRow.url || '#',
      summary: `A ${posts.length}-post Bluesky thread by Jay Rosen.`,
      quote: (firstRow.raw_text || '').substring(0, 200),
      categories: cleanTags(firstRow.thematic_categories || ''),
      concepts: cleanTags(firstRow.key_concepts || ''),
      tags: cleanTags(firstRow.tags || ''),
      verified: true,
      type: 'social',
      relatedIds: [],
      thread_data: {
        thread_id: firstRow.id || firstRow.ID,
        total_posts: posts.length,
        max_depth: Math.max(...posts.map(p => p.depth)),
        posts: posts.map((p, i) => ({
          number: i + 1,
          id: p.row.id || p.row.ID,
          content: p.row.raw_text || p.row.excerpt || '',
          date: p.row.publication_date || '',
          url: p.row.url || '',
          depth: p.depth,
          parent_id: postParentId.get(p.row.id || p.row.ID) || null
        }))
      }
    });
  }

  console.log(`  - Detected ${threadRoots.length} threads (3+ posts)`);
  console.log(`  - Existing THREAD records: ${existingThreadRecords.length}`);
  console.log(`  - New THREAD records generated: ${generatedThreadRecords.length}`);
  console.log(`  - Total thread member posts: ${threadMemberIds.size}`);

  // Step 7: Filter social records — remove thread members, reposts, non-Rosen posts, and short replies
  const REPOST_TITLE_PATTERN = /^(Quoted|Retweet|RT) by/i;
  const GENERIC_TITLE_PATTERN = /^(Reply|Tweet|Post|Quote) by/i;
  const beforeSocialCount = socialRecords.length;
  let threadMemberFilterCount = 0;
  let repostCount = 0;
  let nonRosenCount = 0;
  let shortReplyCount = 0;

  const filteredSocialRecords = socialRecords.filter(r => {
    // Remove individual posts that belong to threads (shown via THREAD container)
    if (threadMemberIds.has(r.id)) {
      threadMemberFilterCount++;
      return false;
    }

    // Remove all reposts/quotes of others' content entirely (not Rosen's own words)
    if (REPOST_TITLE_PATTERN.test(r.title)) {
      repostCount++;
      return false;
    }

    // Remove posts by non-Rosen authors (e.g., quoted Bluesky posts stored with original author)
    if (r.author && r.author.toLowerCase().trim() !== 'jay rosen') {
      nonRosenCount++;
      return false;
    }

    // Remove short replies with generic titles
    if (GENERIC_TITLE_PATTERN.test(r.title)) {
      const text = (r.quote || '')
        .replace(/https?:\/\/\S+/g, '')
        .replace(/^(\s*@\S+\s*)+/, '')
        .replace(/@\S+/g, '')
        .replace(/[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{1F1E0}-\u{1F1FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/gu, '')
        .replace(/\s+/g, ' ')
        .trim();
      if (text.length < 10) {
        shortReplyCount++;
        return false;
      }
    }

    return true;
  });

  const threadFiltered = beforeSocialCount - filteredSocialRecords.length;
  console.log(`  - Social records before filtering: ${beforeSocialCount}`);
  console.log(`  - Filtered: ${threadFiltered} total (${threadMemberFilterCount} thread members, ${repostCount} reposts, ${nonRosenCount} non-Rosen authors, ${shortReplyCount} short replies)`);
  console.log(`  - Social records after filtering: ${filteredSocialRecords.length}`);

  // Combine all records: main + filtered social + generated threads
  let allRecords = [...mainRecords, ...filteredSocialRecords, ...generatedThreadRecords];

  // Enrich thread_data with content from social posts
  console.log('\n🧵 Enriching thread data with post content...');
  let enrichedThreads = 0;
  let enrichedPosts = 0;
  let titlesGenerated = 0;

  allRecords.forEach(record => {
    if (record.thread_data && record.thread_data.posts) {
      let threadEnriched = false;
      record.thread_data.posts.forEach(post => {
        if (!post.content || post.content.trim() === '') {
          const content = socialContentMap.get(post.id);
          if (content) {
            post.content = content;
            enrichedPosts++;
            threadEnriched = true;
          }
        }
      });
      if (threadEnriched) enrichedThreads++;

      // Generate better title from first post content (for legacy [Bluesky Thread] titles)
      if (record.title === '[Bluesky Thread]' || record.title.startsWith('[Bluesky Thread]')) {
        const firstPost = record.thread_data.posts[0];
        if (firstPost && firstPost.content) {
          let titleText = firstPost.content.trim();
          titleText = titleText.replace(/https?:\/\/\S+/g, '').trim();
          titleText = titleText.replace(/^(@\S+\s*)+/, '').trim();
          const sentenceEnd = titleText.search(/[.!?]\s/);
          if (sentenceEnd > 0 && sentenceEnd < 100) {
            titleText = titleText.substring(0, sentenceEnd + 1);
          } else if (titleText.length > 80) {
            titleText = titleText.substring(0, 80).trim() + '...';
          }
          if (titleText.length > 10) {
            record.title = titleText;
            titlesGenerated++;
          }
        }
      }
    }
  });

  console.log(`  - Enriched ${enrichedPosts} posts across ${enrichedThreads} threads`);
  console.log(`  - Generated ${titlesGenerated} thread titles from content`);

  // Add dissertation record
  allRecords.push({ ...DISSERTATION_RECORD, relatedIds: [] });
  DISSERTATION_RECORD.categories.forEach(c => { categories.add(c); searchTerms.add(c); });
  DISSERTATION_RECORD.concepts.forEach(c => searchTerms.add(c));
  DISSERTATION_RECORD.tags.forEach(t => searchTerms.add(t));
  searchTerms.add(DISSERTATION_RECORD.title);

  // Filter records
  const beforeFilterCount = allRecords.length;
  allRecords = allRecords.filter(r => {
    if (!r.verified) return false;
    if (!r.title || r.title === 'Untitled' || r.title.trim().length < 5) return false;
    if (!r.date && r.url === '#') return false;
    return true;
  });
  const afterFilterCount = allRecords.length;

  console.log(`  - Total records before filter: ${beforeFilterCount}`);
  console.log(`  - Records after filter: ${afterFilterCount}`);
  console.log(`  - Filtered out: ${beforeFilterCount - afterFilterCount}`);

  // Sort by date (newest first)
  allRecords.sort((a, b) => b.date.localeCompare(a.date));

  // Build output structure
  const output = {
    version: "1.1.0",
    generated: new Date().toISOString(),
    records: allRecords,
    entities: entities,
    facets: {
      categories: Array.from(categories).sort(),
      eras: ERAS,
      publications: Array.from(publications).sort(),
      entityTypes: Array.from(entityTypes).sort()
    },
    autocompleteIndex: Array.from(searchTerms).sort()
  };

  // Write JSON file (full version for backward compatibility)
  console.log('\n💾 Writing archive-data.json...');
  fs.writeFileSync(outputPath, JSON.stringify(output, null, 2));

  const fileSizeBytes = fs.statSync(outputPath).size;
  const fileSizeMB = (fileSizeBytes / 1024 / 1024).toFixed(2);

  // ============================================
  // SPLIT DATA FILES FOR OPTIMIZED LOADING
  // ============================================
  console.log('\n💾 Writing split data files for optimized loading...');

  // 1. Core data - lightweight, loaded first (for card display)
  const coreRecords = allRecords.map(r => ({
    id: r.id,
    title: r.title,
    date: r.date,
    year: r.year,
    era: r.era,
    pub: r.pub,
    categories: r.categories,
    type: r.type,
    verified: r.verified,
    needsReview: r.needsReview,
    // Include truncated summary for card preview (120 chars saves ~2MB vs 180)
    summaryPreview: r.summary.length > 120 ? r.summary.substring(0, 120) + '...' : r.summary
  }));

  const coreOutput = {
    version: "1.1.0",
    generated: new Date().toISOString(),
    records: coreRecords,
    facets: output.facets,
    autocompleteIndex: output.autocompleteIndex
  };

  const coreOutputPath = path.join(__dirname, 'archive-core.json');
  fs.writeFileSync(coreOutputPath, JSON.stringify(coreOutput));
  const coreSizeBytes = fs.statSync(coreOutputPath).size;
  const coreSizeMB = (coreSizeBytes / 1024 / 1024).toFixed(2);

  // 2. Details data - full content, loaded on demand
  const detailsMap = {};
  allRecords.forEach(r => {
    const details = {
      summary: r.summary,
      quote: r.quote,
      concepts: r.concepts,
      tags: r.tags,
      url: r.url,
      author: r.author,
      needsReview: r.needsReview,
      relatedIds: r.relatedIds
    };

    // Add thread_data for THREAD records
    if (r.thread_data) {
      details.thread_data = r.thread_data;
    }

    detailsMap[r.id] = details;
  });

  const detailsOutput = {
    version: "1.1.0",
    generated: new Date().toISOString(),
    details: detailsMap
  };

  const detailsOutputPath = path.join(__dirname, 'archive-details.json');
  fs.writeFileSync(detailsOutputPath, JSON.stringify(detailsOutput));
  const detailsSizeBytes = fs.statSync(detailsOutputPath).size;
  const detailsSizeMB = (detailsSizeBytes / 1024 / 1024).toFixed(2);

  // 3. Entities data - for Explorer, loaded on demand
  const entitiesOutput = {
    version: "1.1.0",
    generated: new Date().toISOString(),
    entities: entities,
    // Include relatedIds mapping for entity connections
    recordEntityMap: allRecords.reduce((acc, r) => {
      if (r.relatedIds && r.relatedIds.length > 0) {
        acc[r.id] = r.relatedIds;
      }
      return acc;
    }, {})
  };

  const entitiesOutputPath = path.join(__dirname, 'archive-entities.json');
  fs.writeFileSync(entitiesOutputPath, JSON.stringify(entitiesOutput));
  const entitiesSizeBytes = fs.statSync(entitiesOutputPath).size;
  const entitiesSizeMB = (entitiesSizeBytes / 1024 / 1024).toFixed(2);

  console.log(`\n✅ Export complete!`);
  console.log(`\n📊 Summary:`);
  console.log(`  - Total records: ${output.records.length}`);
  console.log(`  - Entities: ${output.entities.length}`);
  console.log(`  - Entity types: ${output.facets.entityTypes.join(', ')}`);
  console.log(`  - Categories: ${output.facets.categories.length}`);
  console.log(`  - Publications: ${output.facets.publications.length}`);
  console.log(`  - Autocomplete terms: ${output.autocompleteIndex.length}`);
  console.log(`\n📦 File sizes:`);
  console.log(`  - archive-data.json (full):     ${fileSizeMB} MB`);
  console.log(`  - archive-core.json (cards):    ${coreSizeMB} MB`);
  console.log(`  - archive-details.json (modal): ${detailsSizeMB} MB`);
  console.log(`  - archive-entities.json (explorer): ${entitiesSizeMB} MB`);
  console.log(`\n📍 Output directory: ${__dirname}`);

  // ============================================
  // RSS & OPML FEED GENERATION (Dave Winer Alignment)
  // ============================================
  console.log('\n📡 Generating RSS feeds (Dave Winer alignment)...');

  // Base URL for production - update this for deployment
  const BASE_URL = 'https://pressthink.org/j/rosen-archive';

  // Generate all RSS feeds
  const rssFeeds = generateAllFeeds(allRecords, BASE_URL);

  // Create feeds directory structure
  const feedsDir = path.join(__dirname, 'feeds');
  const categoriesDir = path.join(feedsDir, 'categories');
  const erasDir = path.join(feedsDir, 'eras');

  if (!fs.existsSync(feedsDir)) fs.mkdirSync(feedsDir, { recursive: true });
  if (!fs.existsSync(categoriesDir)) fs.mkdirSync(categoriesDir, { recursive: true });
  if (!fs.existsSync(erasDir)) fs.mkdirSync(erasDir, { recursive: true });

  // Write RSS feeds
  let feedCount = 0;
  for (const [filename, content] of Object.entries(rssFeeds)) {
    const feedPath = path.join(feedsDir, filename);
    const feedDir = path.dirname(feedPath);
    if (!fs.existsSync(feedDir)) fs.mkdirSync(feedDir, { recursive: true });
    fs.writeFileSync(feedPath, content);
    feedCount++;
  }

  console.log(`  - Generated ${feedCount} RSS feeds`);

  // Generate OPML files
  console.log('\n📋 Generating OPML files...');

  const archiveOpml = generateOPML({
    title: 'Jay Rosen Digital Archive',
    ownerName: 'Joe Amditis',
    records: allRecords,
    facets: output.facets,
    baseUrl: BASE_URL
  });

  const subscriptionsOpml = generateSubscriptionOPML(BASE_URL, rssFeeds);

  fs.writeFileSync(path.join(feedsDir, 'archive.opml'), archiveOpml);
  fs.writeFileSync(path.join(feedsDir, 'subscriptions.opml'), subscriptionsOpml);

  console.log('  - Generated archive.opml (full archive structure)');
  console.log('  - Generated subscriptions.opml (RSS subscription list)');

  // Generate feeds index
  const feedsIndex = {
    version: '1.0.0',
    generated: new Date().toISOString(),
    baseUrl: BASE_URL,
    feeds: Object.keys(rssFeeds).map(name => ({
      name: name.replace('.xml', '').replace(/\//g, ' - '),
      url: `${BASE_URL}/data/feeds/${name}`,
      path: `./data/feeds/${name}`
    })),
    opml: [
      { name: 'Archive Structure', url: `${BASE_URL}/data/feeds/archive.opml` },
      { name: 'RSS Subscriptions', url: `${BASE_URL}/data/feeds/subscriptions.opml` }
    ]
  };

  fs.writeFileSync(path.join(feedsDir, 'index.json'), JSON.stringify(feedsIndex, null, 2));
  console.log('  - Generated feeds/index.json');

  console.log(`\n✅ Dave Winer alignment complete!`);
  console.log(`   RSS feeds: ${feedCount}`);
  console.log(`   OPML files: 2`);
  console.log(`   Feed directory: ${feedsDir}`);
}

main().catch(err => {
  console.error('❌ Error:', err);
  process.exit(1);
});
