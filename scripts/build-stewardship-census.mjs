#!/usr/bin/env node

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { execFileSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { parse } from 'csv-parse/sync';

const ROOT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SCHEMA_ID = 'stewardship-census/1.0.0';
const SOURCE_FILES = [
  'archive_records-public.csv',
  'social_posts.csv',
  'extracted_entities.csv',
  'extracted_relationships.csv'
];
const RUNTIME_FILES = [
  'archive-data.json',
  'archive-core.json',
  'archive-details.json',
  'archive-entities.json'
];
const ALL_INPUT_FILES = [...SOURCE_FILES, ...RUNTIME_FILES];
const REPOST_TITLE_PATTERN = /^(Quoted|Retweet|RT) by/i;
const GENERIC_TITLE_PATTERN = /^(Reply|Tweet|Post|Quote) by/i;
const PRESERVATION_URL_PATTERN = /https?:\/\/(?:web\.)?archive\.org\/(?:web\/|details\/|download\/)?[^\s"'<>)]*/i;
const LINK_FIELDS = [
  'url',
  'related_to',
  'responds_to',
  'influence',
  'gdrive_pdf_link',
  'gdrive_raw_file_link',
  'gdrive_transcript_link'
];
const EMBEDDED_FIELDS = ['excerpt', 'summary', 'pull_quote', 'raw_text', 'notes'];
const FIELD_DEFINITIONS = {
  url: source => source.url,
  raw_text: source => source.raw_text,
  summary: source => source.summary,
  tags: source => source.tags,
  concepts: source => source.key_concepts,
  quote: source => source.pull_quote,
  related_ids: source => source.related_to
};
const BASELINE_2026_07_22 = {
  date: '2026-07-22',
  data_commit: '5d3d5351346a9712de4f54d95e69ba0f410c6efd',
  observed_main: '3e19506385c8636eb76fea60e084e35b54ed2b5d',
  schema_proposal: SCHEMA_ID,
  counts: {
    curated_source: 1029,
    social_source: 29747,
    published_curated_source: 950,
    published_social_source: 25657,
    generated_thread_containers: 8,
    injected_records: 1,
    published_total: 26616,
    entities: 8150,
    relationships: 12556
  }
};

function normalizePath(value) {
  return value.split(path.sep).join('/');
}

function compareCodeUnits(left, right) {
  if (left < right) return -1;
  if (left > right) return 1;
  return 0;
}

function stableObject(entries) {
  return Object.fromEntries(
    Object.entries(entries).sort(([left], [right]) => compareCodeUnits(left, right))
  );
}

function countBy(rows, keyFn) {
  const counts = {};
  for (const row of rows) {
    const key = keyFn(row) || 'Unknown';
    counts[key] = (counts[key] || 0) + 1;
  }
  return stableObject(counts);
}

function isPresent(value) {
  if (Array.isArray(value)) return value.length > 0;
  if (value === null || value === undefined) return false;
  return String(value).trim().length > 0;
}

function isVerified(value) {
  if (value === true) return true;
  return ['true', 'yes', '1'].includes(String(value || '').trim().toLowerCase());
}

function isExplicitlyUnverified(value) {
  return ['false', 'no', '0'].includes(String(value || '').trim().toLowerCase());
}

function verificationCounts(rows, valueFn = row => row.verified) {
  const counts = { verified: 0, unverified: 0, blank: 0 };
  for (const row of rows) {
    const value = valueFn(row);
    if (!isPresent(value)) counts.blank += 1;
    else if (isVerified(value)) counts.verified += 1;
    else counts.unverified += 1;
  }
  return counts;
}

function fieldCoverage(rows, definitions = FIELD_DEFINITIONS) {
  const result = {};
  for (const [name, valueFn] of Object.entries(definitions)) {
    const present = rows.filter(row => isPresent(valueFn(row))).length;
    result[name] = { total: rows.length, present, missing: rows.length - present };
  }
  return result;
}

function runtimeFieldCoverage(records) {
  const definitions = {
    url: record => record.url,
    summary: record => record.summary,
    tags: record => record.tags,
    concepts: record => record.concepts,
    quote: record => record.quote,
    related_ids: record => record.relatedIds
  };
  const coverage = fieldCoverage(records, definitions);
  coverage.raw_text = {
    total: records.length,
    present: null,
    missing: null,
    status: 'not_shipped_by_design'
  };
  return coverage;
}

function sha256(buffer) {
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

function readCsv(filePath) {
  return parse(fs.readFileSync(filePath), {
    bom: true,
    columns: true,
    relax_column_count: true,
    skip_empty_lines: true
  });
}

function relativeInputPath(rootDir, dataDir, filename) {
  const absolute = path.join(dataDir, filename);
  const relative = path.relative(rootDir, absolute);
  return normalizePath(relative.startsWith('..') ? filename : relative);
}

export function loadStewardshipInputs({ dataDir = path.join(ROOT_DIR, 'data'), rootDir = ROOT_DIR } = {}) {
  for (const filename of ALL_INPUT_FILES) {
    const filePath = path.join(dataDir, filename);
    if (!fs.existsSync(filePath)) throw new Error(`Missing census input: ${filePath}`);
  }

  const files = ALL_INPUT_FILES.map(filename => {
    const filePath = path.join(dataDir, filename);
    return {
      path: relativeInputPath(rootDir, dataDir, filename),
      sha256: sha256(fs.readFileSync(filePath))
    };
  });

  return {
    curated: readCsv(path.join(dataDir, SOURCE_FILES[0])),
    social: readCsv(path.join(dataDir, SOURCE_FILES[1])),
    entities: readCsv(path.join(dataDir, SOURCE_FILES[2])),
    relationships: readCsv(path.join(dataDir, SOURCE_FILES[3])),
    archiveData: JSON.parse(fs.readFileSync(path.join(dataDir, RUNTIME_FILES[0]), 'utf8')),
    archiveCore: JSON.parse(fs.readFileSync(path.join(dataDir, RUNTIME_FILES[1]), 'utf8')),
    archiveDetails: JSON.parse(fs.readFileSync(path.join(dataDir, RUNTIME_FILES[2]), 'utf8')),
    archiveEntities: JSON.parse(fs.readFileSync(path.join(dataDir, RUNTIME_FILES[3]), 'utf8')),
    files
  };
}

function git(rootDir, args) {
  return execFileSync('git', ['-C', rootDir, ...args], { encoding: 'utf8' }).trim();
}

export function inspectStewardshipInputGitState({ rootDir = ROOT_DIR, files }) {
  const paths = files.map(file => file.path);
  const commit = git(rootDir, ['log', '-1', '--format=%H', '--', ...paths]);
  const dirtyPaths = git(rootDir, ['status', '--porcelain', '--', ...paths]);
  const shallow = git(rootDir, ['rev-parse', '--is-shallow-repository']) === 'true';
  return { commit, dirty: Boolean(dirtyPaths), shallow };
}

function describeInput(rootDir, files) {
  const state = inspectStewardshipInputGitState({ rootDir, files });
  if (state.shallow) {
    throw new Error(
      'Census input provenance requires complete Git history. Fetch with --unshallow or clone with full history.'
    );
  }
  if (state.dirty) {
    throw new Error(
      'Census inputs have uncommitted changes. Commit the source and runtime data before regenerating the stamped reports.'
    );
  }
  return { commit: state.commit, dirty: false, schema_version: SCHEMA_ID, files };
}

function sourceRecordType(row) {
  return String(row.content_type || row.id?.split('-')[0] || 'Unknown').trim() || 'Unknown';
}

function platformFor(row) {
  const raw = String(row.platform || row.original_publication || '').trim().toLowerCase();
  const id = String(row.id || '').toUpperCase();
  if (raw.includes('twitter') || raw === 'x' || id.startsWith('TWTR-')) return 'Twitter/X';
  if (raw.includes('bluesky') || id.startsWith('BSKY-')) return 'Bluesky';
  if (raw.includes('mastodon') || id.startsWith('MAST-')) return 'Mastodon';
  return raw || 'Unknown';
}

function cleanReplyText(row) {
  return String(row.pull_quote || row.excerpt || row.raw_text || '')
    .replace(/https?:\/\/\S+/g, '')
    .replace(/^(\s*@\S+\s*)+/, '')
    .replace(/@\S+/g, '')
    .replace(/[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{1F1E0}-\u{1F1FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/gu, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function threadMemberIds(runtimeRecords) {
  const ids = new Set();
  for (const record of runtimeRecords) {
    for (const post of record.thread_data?.posts || []) {
      if (post.id) ids.add(post.id);
    }
  }
  return ids;
}

function makeFilterReason(id, label, source, order, recordIds) {
  const sortedIds = [...recordIds].sort();
  return { id, label, source, order, count: sortedIds.length, record_ids: sortedIds };
}

function classifyFilteredRecords({ curated, social, publishedIds, runtimeRecords }) {
  const reasons = [];
  const curatedBuckets = {
    curated_unverified: [],
    curated_final_invalid_title: [],
    curated_missing_date_and_url: [],
    curated_unclassified: []
  };

  for (const row of curated) {
    if (publishedIds.has(row.id)) continue;
    const title = String(row.title || 'Untitled').trim();
    if (!isVerified(row.verified)) curatedBuckets.curated_unverified.push(row.id);
    else if (!title || title === 'Untitled' || title.length < 5) {
      curatedBuckets.curated_final_invalid_title.push(row.id);
    } else if (!isPresent(row.publication_date) && (!isPresent(row.url) || row.url === '#')) {
      curatedBuckets.curated_missing_date_and_url.push(row.id);
    } else curatedBuckets.curated_unclassified.push(row.id);
  }

  reasons.push(makeFilterReason('curated_unverified', 'Unverified', 'curated', 1, curatedBuckets.curated_unverified));
  reasons.push(makeFilterReason('curated_final_invalid_title', 'Final invalid title', 'curated', 2, curatedBuckets.curated_final_invalid_title));
  reasons.push(makeFilterReason('curated_missing_date_and_url', 'Missing date and usable URL', 'curated', 3, curatedBuckets.curated_missing_date_and_url));
  reasons.push(makeFilterReason('curated_unclassified', 'Unclassified source/runtime difference', 'curated', 4, curatedBuckets.curated_unclassified));

  const members = threadMemberIds(runtimeRecords);
  const socialBuckets = {
    social_thread_member: [],
    social_repost: [],
    social_non_rosen_author: [],
    social_short_generic_reply: [],
    social_unverified: [],
    social_final_invalid_title: [],
    social_missing_date_and_url: [],
    social_unclassified: []
  };

  for (const row of social) {
    if (publishedIds.has(row.id)) continue;
    const title = String(row.title || 'Untitled').trim();
    const author = String(row.author || 'Jay Rosen').trim().toLowerCase();
    if (members.has(row.id)) socialBuckets.social_thread_member.push(row.id);
    else if (REPOST_TITLE_PATTERN.test(title)) socialBuckets.social_repost.push(row.id);
    else if (author && author !== 'jay rosen') socialBuckets.social_non_rosen_author.push(row.id);
    else if (GENERIC_TITLE_PATTERN.test(title) && cleanReplyText(row).length < 10) {
      socialBuckets.social_short_generic_reply.push(row.id);
    } else if (isExplicitlyUnverified(row.verified)) socialBuckets.social_unverified.push(row.id);
    else if (!title || title === 'Untitled' || title.length < 5) {
      socialBuckets.social_final_invalid_title.push(row.id);
    } else if (!isPresent(row.publication_date) && (!isPresent(row.url) || row.url === '#')) {
      socialBuckets.social_missing_date_and_url.push(row.id);
    } else socialBuckets.social_unclassified.push(row.id);
  }

  const socialReasons = [
    ['social_thread_member', 'Thread member'],
    ['social_repost', 'Repost or quoted-post title'],
    ['social_non_rosen_author', 'Non-Rosen author'],
    ['social_short_generic_reply', 'Short generic reply'],
    ['social_unverified', 'Explicitly unverified'],
    ['social_final_invalid_title', 'Final invalid title'],
    ['social_missing_date_and_url', 'Missing date and usable URL'],
    ['social_unclassified', 'Unclassified source/runtime difference']
  ];
  socialReasons.forEach(([id, label], index) => {
    reasons.push(makeFilterReason(id, label, 'social', index + 1, socialBuckets[id]));
  });

  return {
    classification: 'first_match',
    total: reasons.reduce((sum, reason) => sum + reason.count, 0),
    reasons
  };
}

function relationshipIndex(relationships) {
  const byRecord = new Map();
  const entityLinksByRecord = new Map();
  for (const relationship of relationships) {
    const recordId = relationship.source_record_id;
    if (!byRecord.has(recordId)) byRecord.set(recordId, []);
    byRecord.get(recordId).push(relationship);
    if (!entityLinksByRecord.has(recordId)) entityLinksByRecord.set(recordId, new Set());
    if (relationship.source_entity_id) entityLinksByRecord.get(recordId).add(relationship.source_entity_id);
    if (relationship.target_entity_id) entityLinksByRecord.get(recordId).add(relationship.target_entity_id);
  }
  return { byRecord, entityLinksByRecord };
}

function coverageForRows(rows, publishedIds, relationshipMaps, runtimeRecordEntityMap) {
  const ids = rows.map(row => row.id);
  const publishedSourceIds = ids.filter(id => publishedIds.has(id));
  const sourceRelationships = ids.flatMap(id => relationshipMaps.byRecord.get(id) || []);
  const publishedRelationships = publishedSourceIds.flatMap(id => relationshipMaps.byRecord.get(id) || []);
  const sourceEntityPairs = ids.reduce(
    (total, id) => total + (relationshipMaps.entityLinksByRecord.get(id)?.size || 0),
    0
  );
  const runtimeEntityPairs = publishedSourceIds.reduce(
    (total, id) => total + new Set(runtimeRecordEntityMap[id] || []).size,
    0
  );

  return {
    source: {
      rows: ids.length,
      rows_with_relationship_assertions: ids.filter(id => relationshipMaps.byRecord.has(id)).length,
      relationship_assertions: sourceRelationships.length,
      rows_with_entity_links: ids.filter(id => (relationshipMaps.entityLinksByRecord.get(id)?.size || 0) > 0).length,
      distinct_record_entity_links: sourceEntityPairs
    },
    published: {
      source_backed_rows: publishedSourceIds.length,
      rows_with_relationship_assertions: publishedSourceIds.filter(id => relationshipMaps.byRecord.has(id)).length,
      relationship_assertions: publishedRelationships.length,
      rows_with_entity_links: publishedSourceIds.filter(id => (runtimeRecordEntityMap[id] || []).length > 0).length,
      distinct_record_entity_links: runtimeEntityPairs
    }
  };
}

function listFinding(items) {
  return { count: items.length, items };
}

function buildGraph({ curated, social, entities, relationships, archiveEntities, publishedIds }) {
  const sourceIds = new Set([...curated, ...social].map(row => row.id));
  const entityById = new Map(entities.map(entity => [entity.entity_id, entity]));
  const runtimeEntityIds = new Set((archiveEntities.entities || []).map(entity => entity.id));
  const runtimeRecordEntityMap = archiveEntities.recordEntityMap || {};
  const relationshipMaps = relationshipIndex(relationships);
  const endpointIds = new Set();
  for (const relationship of relationships) {
    if (relationship.source_entity_id) endpointIds.add(relationship.source_entity_id);
    if (relationship.target_entity_id) endpointIds.add(relationship.target_entity_id);
  }

  const nameMismatches = [];
  for (const relationship of relationships) {
    for (const endpoint of ['source', 'target']) {
      const id = relationship[`${endpoint}_entity_id`];
      const actual = relationship[`${endpoint}_entity_name`];
      const canonical = entityById.get(id)?.entity_name;
      if (id && canonical && actual && actual !== canonical) {
        nameMismatches.push({
          relationship_id: relationship.relationship_id,
          endpoint,
          entity_id: id,
          expected: canonical,
          actual
        });
      }
    }
  }

  const missingSourceRecords = relationships
    .filter(relationship => !sourceIds.has(relationship.source_record_id))
    .map(relationship => relationship.relationship_id)
    .sort();
  const missingSourceEntities = relationships
    .filter(relationship => !entityById.has(relationship.source_entity_id))
    .map(relationship => relationship.relationship_id)
    .sort();
  const missingTargetEntities = relationships
    .filter(relationship => !entityById.has(relationship.target_entity_id))
    .map(relationship => relationship.relationship_id)
    .sort();
  const missingFirstMentions = entities
    .filter(entity => isPresent(entity.first_mention_record_id) && !sourceIds.has(entity.first_mention_record_id))
    .map(entity => ({ entity_id: entity.entity_id, record_id: entity.first_mention_record_id }))
    .sort((left, right) => compareCodeUnits(left.entity_id, right.entity_id));
  const unpublishedFirstMentions = entities
    .filter(entity => isPresent(entity.first_mention_record_id) && sourceIds.has(entity.first_mention_record_id) && !publishedIds.has(entity.first_mention_record_id))
    .map(entity => ({ entity_id: entity.entity_id, record_id: entity.first_mention_record_id }))
    .sort((left, right) => compareCodeUnits(left.entity_id, right.entity_id));

  const runtimeMapMissingRecords = Object.keys(runtimeRecordEntityMap)
    .filter(recordId => !publishedIds.has(recordId))
    .sort();
  const runtimeMapMissingEntities = [...new Set(Object.values(runtimeRecordEntityMap).flat())]
    .filter(entityId => !runtimeEntityIds.has(entityId))
    .sort();

  const socialByPlatform = {};
  for (const platform of [...new Set(social.map(platformFor))].sort()) {
    socialByPlatform[platform] = coverageForRows(
      social.filter(row => platformFor(row) === platform),
      publishedIds,
      relationshipMaps,
      runtimeRecordEntityMap
    );
  }

  return {
    entities: {
      total: entities.length,
      by_type: countBy(entities, entity => entity.entity_type),
      detached_from_relationships: entities.filter(entity => !endpointIds.has(entity.entity_id)).length,
      blank_first_mention: entities.filter(entity => !isPresent(entity.first_mention_record_id)).length,
      runtime_total: (archiveEntities.entities || []).length
    },
    relationships: {
      total: relationships.length,
      by_type: countBy(relationships, relationship => relationship.relationship_type),
      by_confidence_score: countBy(relationships, relationship => (
        isPresent(relationship.confidence_score) ? relationship.confidence_score : 'missing'
      )),
      by_confidence: countBy(relationships, relationship => {
        const score = Number(relationship.confidence_score);
        if (!Number.isFinite(score)) return 'missing';
        if (score >= 0.8) return 'high';
        if (score >= 0.5) return 'medium';
        return 'low';
      })
    },
    coverage: {
      curated: coverageForRows(curated, publishedIds, relationshipMaps, runtimeRecordEntityMap),
      social: coverageForRows(social, publishedIds, relationshipMaps, runtimeRecordEntityMap),
      social_by_platform: socialByPlatform
    },
    reference_findings: {
      relationship_source_records_missing_from_source: listFinding(missingSourceRecords),
      relationship_source_entities_missing_from_source: listFinding(missingSourceEntities),
      relationship_target_entities_missing_from_source: listFinding(missingTargetEntities),
      relationship_endpoint_name_mismatches: listFinding(nameMismatches),
      entity_first_mentions_missing_from_source: listFinding(missingFirstMentions),
      entity_first_mentions_missing_from_runtime: listFinding(unpublishedFirstMentions),
      runtime_record_map_records_missing_from_runtime: listFinding(runtimeMapMissingRecords),
      runtime_record_map_entities_missing_from_runtime: listFinding(runtimeMapMissingEntities)
    }
  };
}

function setDifference(left, right) {
  return [...left].filter(value => !right.has(value)).sort();
}

function buildCrossFileFindings({ archiveData, archiveCore, archiveDetails, archiveEntities }) {
  const fullIds = new Set((archiveData.records || []).map(record => record.id));
  const coreIds = new Set((archiveCore.records || []).map(record => record.id));
  const detailIds = new Set(Object.keys(archiveDetails.details || {}));
  const runtimeEntityIds = new Set((archiveEntities.entities || []).map(entity => entity.id));
  const fullEntityIds = new Set((archiveData.entities || []).map(entity => entity.id));
  return {
    core_missing_from_full: listFinding(setDifference(coreIds, fullIds)),
    full_missing_from_core: listFinding(setDifference(fullIds, coreIds)),
    details_missing_from_full: listFinding(setDifference(detailIds, fullIds)),
    full_missing_from_details: listFinding(setDifference(fullIds, detailIds)),
    entity_bundle_missing_from_full: listFinding(setDifference(runtimeEntityIds, fullEntityIds)),
    full_entities_missing_from_entity_bundle: listFinding(setDifference(fullEntityIds, runtimeEntityIds))
  };
}

function urlInventory(rows, valueFn) {
  const values = rows.map(valueFn).filter(isPresent).map(value => String(value).trim());
  const external = [];
  const internal = [];
  const malformed = [];
  for (const value of values) {
    try {
      const parsed = new URL(value);
      if (parsed.protocol === 'http:' || parsed.protocol === 'https:') external.push(value);
      else internal.push(value);
    } catch {
      if (/^(?:\.|\/|#)/.test(value)) internal.push(value);
      else malformed.push(value);
    }
  }
  const uniqueExternal = [...new Set(external)].sort();
  const hostDistribution = {};
  for (const value of uniqueExternal) {
    const host = new URL(value).hostname.toLowerCase().replace(/^www\./, '');
    hostDistribution[host] = (hostDistribution[host] || 0) + 1;
  }
  return {
    total_rows: rows.length,
    missing: rows.length - values.length,
    external_values: external.length,
    unique_external_urls: uniqueExternal.length,
    duplicate_external_values: external.length - uniqueExternal.length,
    internal_values: internal.length,
    malformed_values: malformed.length,
    malformed: malformed.sort(),
    host_distribution_unit: 'unique_external_url',
    host_distribution: stableObject(hostDistribution)
  };
}

function collectPreservationEvidence(rows) {
  const linkMatches = [];
  const embeddedMatches = [];
  for (const row of rows) {
    for (const field of LINK_FIELDS) {
      const value = String(row[field] || '').trim();
      if (PRESERVATION_URL_PATTERN.test(value)) linkMatches.push({ record_id: row.id, field, value });
    }
    for (const field of EMBEDDED_FIELDS) {
      const value = String(row[field] || '');
      const match = value.match(PRESERVATION_URL_PATTERN);
      if (match) embeddedMatches.push({ record_id: row.id, field, value: match[0] });
    }
  }
  const summarize = matches => ({
    records: new Set(matches.map(match => match.record_id)).size,
    matches: matches.length,
    evidence: matches.sort((left, right) => (
      compareCodeUnits(left.record_id, right.record_id) || compareCodeUnits(left.field, right.field)
    ))
  });
  return {
    definition: {
      link_fields: LINK_FIELDS,
      embedded_candidate_fields: EMBEDDED_FIELDS,
      rule: 'archive.org links in link fields are evidence; matches in prose fields are candidates only'
    },
    link_evidence: summarize(linkMatches),
    embedded_candidates: summarize(embeddedMatches)
  };
}

function baselineComparison(census) {
  const current = {
    curated_source: census.records.source.curated.total,
    social_source: census.records.source.social.total,
    published_curated_source: census.records.runtime.source_backed.curated,
    published_social_source: census.records.runtime.source_backed.social,
    generated_thread_containers: census.records.runtime.generated.thread_containers,
    injected_records: census.records.runtime.generated.injected,
    published_total: census.records.runtime.total,
    entities: census.graph.entities.total,
    relationships: census.graph.relationships.total
  };
  const comparison = Object.keys(BASELINE_2026_07_22.counts).map(metric => ({
    metric,
    baseline: BASELINE_2026_07_22.counts[metric],
    current: current[metric],
    delta: current[metric] - BASELINE_2026_07_22.counts[metric]
  }));
  return {
    ...BASELINE_2026_07_22,
    comparison,
    explanation: [
      'PR #751 verified the previously held curated batch and regenerated the runtime corpus.',
      'PR #751 also reconciled filtered social rows, first mentions, orphan entities, and relationship mappings, so graph totals intentionally differ from the baseline.',
      'Source and runtime values in this report are recomputed independently; deltas are not carried forward as assumptions.'
    ]
  };
}

export function buildStewardshipCensus({ inputs, rootDir = ROOT_DIR, input } = {}) {
  if (!inputs) inputs = loadStewardshipInputs({ rootDir, dataDir: path.join(rootDir, 'data') });
  const {
    curated,
    social,
    entities,
    relationships,
    archiveData,
    archiveCore,
    archiveDetails,
    archiveEntities
  } = inputs;
  const runtimeRecords = archiveData.records || [];
  const publishedIds = new Set(runtimeRecords.map(record => record.id));
  const curatedIds = new Set(curated.map(row => row.id));
  const socialIds = new Set(social.map(row => row.id));
  const sourceBackedCurated = runtimeRecords.filter(record => curatedIds.has(record.id));
  const sourceBackedSocial = runtimeRecords.filter(record => socialIds.has(record.id));
  const generatedThreads = runtimeRecords.filter(record => (
    String(record.id).startsWith('THREAD-') && !curatedIds.has(record.id)
  ));
  const injected = runtimeRecords.filter(record => (
    !curatedIds.has(record.id) && !socialIds.has(record.id) && !generatedThreads.includes(record)
  ));
  const curatedById = new Map(curated.map(row => [row.id, row]));
  const socialById = new Map(social.map(row => [row.id, row]));

  const census = {
    schema: {
      id: SCHEMA_ID,
      compatibility: 'additive changes within version 1; semantic changes require a new major version'
    },
    input: input || describeInput(rootDir, inputs.files),
    records: {
      source: {
        total: curated.length + social.length,
        curated: {
          total: curated.length,
          by_record_type: countBy(curated, sourceRecordType),
          verification: verificationCounts(curated)
        },
        social: {
          total: social.length,
          by_platform: countBy(social, platformFor),
          by_record_type: countBy(social, sourceRecordType),
          verification: verificationCounts(social)
        }
      },
      runtime: {
        total: runtimeRecords.length,
        by_type: countBy(runtimeRecords, record => record.type),
        source_backed: {
          total: sourceBackedCurated.length + sourceBackedSocial.length,
          curated: sourceBackedCurated.length,
          curated_by_record_type: countBy(
            sourceBackedCurated,
            record => sourceRecordType(curatedById.get(record.id) || record)
          ),
          social: sourceBackedSocial.length,
          social_by_platform: countBy(sourceBackedSocial, record => platformFor(socialById.get(record.id) || record)),
          social_by_record_type: countBy(
            sourceBackedSocial,
            record => sourceRecordType(socialById.get(record.id) || record)
          )
        },
        generated: {
          thread_containers: generatedThreads.length,
          thread_container_ids: generatedThreads.map(record => record.id).sort(),
          injected: injected.length,
          injected_ids: injected.map(record => record.id).sort()
        },
        verification: verificationCounts(runtimeRecords)
      },
      reconciliation: {
        curated: {
          source: curated.length,
          published: sourceBackedCurated.length,
          filtered: curated.length - sourceBackedCurated.length
        },
        social: {
          source: social.length,
          published: sourceBackedSocial.length,
          filtered: social.length - sourceBackedSocial.length
        }
      },
      filtered: classifyFilteredRecords({ curated, social, publishedIds, runtimeRecords })
    },
    fields: {
      curated_source: fieldCoverage(curated),
      social_source: fieldCoverage(social),
      runtime: runtimeFieldCoverage(runtimeRecords)
    },
    graph: buildGraph({
      curated,
      social,
      entities,
      relationships,
      archiveEntities,
      publishedIds
    }),
    cross_file: buildCrossFileFindings({ archiveData, archiveCore, archiveDetails, archiveEntities }),
    urls: {
      source: urlInventory([...curated, ...social], row => row.url),
      runtime: urlInventory(runtimeRecords, record => record.url)
    },
    preservation: collectPreservationEvidence([...curated, ...social])
  };
  census.baseline_2026_07_22 = baselineComparison(census);
  return census;
}

export function formatStewardshipCensusJson(census) {
  return `${JSON.stringify(census, null, 2)}\n`;
}

function markdownTable(headers, rows) {
  const head = `| ${headers.join(' | ')} |`;
  const rule = `| ${headers.map(() => '---').join(' | ')} |`;
  return [head, rule, ...rows.map(row => `| ${row.join(' | ')} |`)].join('\n');
}

function delta(value) {
  if (value > 0) return `+${value.toLocaleString('en-US')}`;
  return value.toLocaleString('en-US');
}

export function formatStewardshipCensusMarkdown(census) {
  const injectedLabel = census.records.runtime.generated.injected === 1 ? 'record' : 'records';
  const lines = [
    '# Stewardship coverage census',
    '',
    `Schema: \`${census.schema.id}\``,
    '',
    `Input commit: \`${census.input.commit}\` (${census.input.dirty ? 'input files dirty' : 'input files clean'})`,
    '',
    '## Record reconciliation',
    '',
    markdownTable(
      ['Group', 'Source', 'Published source rows', 'Filtered'],
      [
        ['Curated', census.records.source.curated.total.toLocaleString('en-US'), census.records.runtime.source_backed.curated.toLocaleString('en-US'), census.records.reconciliation.curated.filtered.toLocaleString('en-US')],
        ['Social', census.records.source.social.total.toLocaleString('en-US'), census.records.runtime.source_backed.social.toLocaleString('en-US'), census.records.reconciliation.social.filtered.toLocaleString('en-US')]
      ]
    ),
    '',
    `Runtime total: ${census.records.runtime.total.toLocaleString('en-US')} records, including ${census.records.runtime.generated.thread_containers.toLocaleString('en-US')} generated thread containers and ${census.records.runtime.generated.injected.toLocaleString('en-US')} injected ${injectedLabel}.`,
    '',
    '### Social source and runtime by platform',
    '',
    markdownTable(
      ['Platform', 'Source', 'Published source rows'],
      Object.entries(census.records.source.social.by_platform).map(([platform, count]) => [
        platform,
        count.toLocaleString('en-US'),
        (census.records.runtime.source_backed.social_by_platform[platform] || 0).toLocaleString('en-US')
      ])
    ),
    '',
    '### Filtered source rows',
    '',
    `Classification is \`${census.records.filtered.classification}\`; every omitted source row appears in exactly one reason.`,
    '',
    markdownTable(
      ['Source', 'Order', 'Reason', 'Count'],
      census.records.filtered.reasons
        .filter(reason => reason.count > 0)
        .map(reason => [reason.source, reason.order, reason.label, reason.count.toLocaleString('en-US')])
    ),
    '',
    '## Missing field coverage',
    '',
    markdownTable(
      ['Field', 'Curated source', 'Social source', 'Runtime'],
      Object.keys(census.fields.curated_source).map(field => [
        field.replaceAll('_', ' '),
        `${census.fields.curated_source[field].missing.toLocaleString('en-US')} / ${census.fields.curated_source[field].total.toLocaleString('en-US')}`,
        `${census.fields.social_source[field].missing.toLocaleString('en-US')} / ${census.fields.social_source[field].total.toLocaleString('en-US')}`,
        census.fields.runtime[field].status === 'not_shipped_by_design'
          ? 'Not shipped by design'
          : `${census.fields.runtime[field].missing.toLocaleString('en-US')} / ${census.fields.runtime[field].total.toLocaleString('en-US')}`
      ])
    ),
    '',
    '## Graph coverage',
    '',
    `Entities: ${census.graph.entities.total.toLocaleString('en-US')} source, ${census.graph.entities.runtime_total.toLocaleString('en-US')} runtime. Relationship assertions: ${census.graph.relationships.total.toLocaleString('en-US')}.`,
    '',
    markdownTable(
      ['Group', 'Source rows', 'Source rows with assertions', 'Assertions', 'Published rows', 'Published rows with assertions'],
      [
        ['Curated', census.graph.coverage.curated.source.rows.toLocaleString('en-US'), census.graph.coverage.curated.source.rows_with_relationship_assertions.toLocaleString('en-US'), census.graph.coverage.curated.source.relationship_assertions.toLocaleString('en-US'), census.graph.coverage.curated.published.source_backed_rows.toLocaleString('en-US'), census.graph.coverage.curated.published.rows_with_relationship_assertions.toLocaleString('en-US')],
        ['Social', census.graph.coverage.social.source.rows.toLocaleString('en-US'), census.graph.coverage.social.source.rows_with_relationship_assertions.toLocaleString('en-US'), census.graph.coverage.social.source.relationship_assertions.toLocaleString('en-US'), census.graph.coverage.social.published.source_backed_rows.toLocaleString('en-US'), census.graph.coverage.social.published.rows_with_relationship_assertions.toLocaleString('en-US')]
      ]
    ),
    '',
    '### Reference findings',
    '',
    markdownTable(
      ['Finding', 'Count'],
      Object.entries(census.graph.reference_findings).map(([name, finding]) => [name.replaceAll('_', ' '), finding.count.toLocaleString('en-US')])
    ),
    '',
    '## URL and preservation inventory',
    '',
    `Source: ${census.urls.source.unique_external_urls.toLocaleString('en-US')} unique external URLs across ${Object.keys(census.urls.source.host_distribution).length.toLocaleString('en-US')} hosts; ${census.urls.source.missing.toLocaleString('en-US')} rows have no URL.`,
    '',
    `Runtime: ${census.urls.runtime.unique_external_urls.toLocaleString('en-US')} unique external URLs across ${Object.keys(census.urls.runtime.host_distribution).length.toLocaleString('en-US')} hosts; ${census.urls.runtime.missing.toLocaleString('en-US')} rows have no URL.`,
    '',
    `Preservation link evidence appears in ${census.preservation.link_evidence.records.toLocaleString('en-US')} source records. Another ${census.preservation.embedded_candidates.records.toLocaleString('en-US')} records contain archive.org candidates only in prose fields.`,
    '',
    '## Comparison with the 2026-07-22 baseline',
    '',
    `Baseline data commit: \`${census.baseline_2026_07_22.data_commit}\`.`,
    '',
    markdownTable(
      ['Metric', '2026-07-22', 'Current', 'Delta'],
      census.baseline_2026_07_22.comparison.map(item => [
        item.metric.replaceAll('_', ' '),
        item.baseline.toLocaleString('en-US'),
        item.current.toLocaleString('en-US'),
        delta(item.delta)
      ])
    ),
    '',
    ...census.baseline_2026_07_22.explanation.map(note => `- ${note}`),
    '',
    'The JSON report contains exact input hashes, record IDs for every filter reason, full type and confidence breakdowns, host distribution, preservation evidence, and cross-file findings.'
  ];
  return `${lines.join('\n')}\n`;
}

function parseArgs(argv) {
  const args = { dataDir: path.join(ROOT_DIR, 'data'), outputDir: path.join(ROOT_DIR, 'data') };
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] === '--data-dir') args.dataDir = path.resolve(argv[++index]);
    else if (argv[index] === '--output-dir') args.outputDir = path.resolve(argv[++index]);
    else throw new Error(`Unknown argument: ${argv[index]}`);
  }
  return args;
}

export function writeStewardshipCensus({ rootDir = ROOT_DIR, dataDir, outputDir } = {}) {
  const resolvedDataDir = dataDir || path.join(rootDir, 'data');
  const resolvedOutputDir = outputDir || resolvedDataDir;
  const inputs = loadStewardshipInputs({ rootDir, dataDir: resolvedDataDir });
  const census = buildStewardshipCensus({ inputs, rootDir });
  fs.mkdirSync(resolvedOutputDir, { recursive: true });
  fs.writeFileSync(path.join(resolvedOutputDir, 'stewardship-census.json'), formatStewardshipCensusJson(census));
  fs.writeFileSync(path.join(resolvedOutputDir, 'stewardship-census.md'), formatStewardshipCensusMarkdown(census));
  return census;
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  try {
    const args = parseArgs(process.argv.slice(2));
    const census = writeStewardshipCensus({ rootDir: ROOT_DIR, ...args });
    console.log(`Wrote stewardship census for ${census.records.source.total} source rows and ${census.records.runtime.total} runtime records.`);
  } catch (error) {
    console.error(`Stewardship census failed: ${error.message}`);
    process.exitCode = 1;
  }
}
