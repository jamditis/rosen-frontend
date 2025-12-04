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

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Era definitions (matching constants.js)
const ERAS = [
  "Public Journalism (90s)",
  "Web & Blogging (00s)",
  "View from Nowhere (10s)",
  "Democracy in Crisis (20s)"
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
  url: '/wp-content/rosen-archive/features/dissertation-reader/',
  summary: 'Rosen\'s doctoral dissertation traces the history of the idea that the function of the press is to inform the public. It argues that the rise of the mass circulation newspaper, while creating a technical ability to reach everyone, actually undermined the conditions necessary for a "universal town meeting." Drawing heavily on Walter Lippmann and John Dewey, it suggests that the professionalization of journalism ("objectivity") was a retreat from the problem of creating a genuine public life in a complex society. It contrasts news as "symptom" vs. news as "symbol" and explores how the press creates a "pseudo-environment" of public opinion.',
  quote: 'An impossible press was born, one which sought to solve the whole problem of public life simply by controlling the conduct of journalists.',
  categories: ['Journalism History', 'Democratic Theory', 'Press Criticism', 'Public Life'],
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
  if (y < 2000) return ERAS[0];
  if (y < 2010) return ERAS[1];
  if (y < 2020) return ERAS[2];
  return ERAS[3];
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
                     type === 'social';

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
    era: getEra(date),
    pub: pub,
    url: rawUrl,
    summary: (row.summary || row.Summary || title),
    quote: (row.pull_quote || row.Pull_Quote || ''),
    categories: cats,
    concepts: concepts,
    tags: tags,
    verified: isVerified,
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

    record.categories.forEach(c => { categories.add(c); searchTerms.add(c); });
    record.concepts.forEach(c => searchTerms.add(c));
    record.tags.forEach(t => searchTerms.add(t));
    if (record.pub && record.pub.length > 2) { publications.add(record.pub); searchTerms.add(record.pub); }
    if (record.title.length > 3) searchTerms.add(record.title);

    return record;
  });

  const socialRecords = socialPostsData.map((row, i) => {
    const record = processRecord(row, i, 'social', relationshipsMap);

    record.categories.forEach(c => { categories.add(c); searchTerms.add(c); });
    record.concepts.forEach(c => searchTerms.add(c));
    record.tags.forEach(t => searchTerms.add(t));
    if (record.pub && record.pub.length > 2) { publications.add(record.pub); searchTerms.add(record.pub); }
    if (record.title.length > 3) searchTerms.add(record.title);

    return record;
  });

  // Combine all records
  let allRecords = [...mainRecords, ...socialRecords];

  // Build lookup map for social post content (id -> raw_text)
  const socialContentMap = new Map();
  socialPostsData.forEach(row => {
    const id = row.id || row.ID;
    const content = row.raw_text || row.content || row.excerpt || '';
    if (id && content) {
      socialContentMap.set(id, content);
    }
  });

  // Enrich thread_data with content from social posts
  console.log('\n🧵 Enriching thread data with post content...');
  let enrichedThreads = 0;
  let enrichedPosts = 0;
  let titlesGenerated = 0;

  allRecords.forEach(record => {
    if (record.thread_data && record.thread_data.posts) {
      let threadEnriched = false;
      record.thread_data.posts.forEach(post => {
        // If post has no content, try to look it up
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

      // Generate better title from first post content
      if (record.title === '[Bluesky Thread]' || record.title.startsWith('[Bluesky Thread]')) {
        const firstPost = record.thread_data.posts[0];
        if (firstPost && firstPost.content) {
          // Get first sentence or first 80 chars
          let titleText = firstPost.content.trim();
          // Remove URLs
          titleText = titleText.replace(/https?:\/\/\S+/g, '').trim();
          // Remove @mentions at start
          titleText = titleText.replace(/^(@\S+\s*)+/, '').trim();
          // Take first sentence or truncate
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
    // Include truncated summary for card preview
    summaryPreview: r.summary.length > 180 ? r.summary.substring(0, 180) + '...' : r.summary
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
}

main().catch(err => {
  console.error('❌ Error:', err);
  process.exit(1);
});
