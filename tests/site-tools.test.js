import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  buildRecordLink,
  createArchiveSiteTools,
  findRelatedEntities,
  registerArchiveSiteTools,
  searchArchiveRecords,
} from '../frontend/services/siteTools.js';

const records = [
  {
    id: 'RECORD-00001',
    title: 'The people formerly known as the audience',
    date: '2006-06-27',
    year: '2006',
    era: 'Peak Blogging & Citizen Journalism (2005-2009)',
    pub: 'PressThink',
    categories: ['Audience & Public Engagement'],
    type: 'article',
    verified: true,
    summaryPreview: 'A discussion of changing relationships between journalists and audiences.',
  },
  {
    id: 'BSKY-00001',
    title: 'Journalists’ role in public life',
    date: '2025-02-01',
    year: '2025',
    era: 'Platform Transition & Future Models (2021-Present)',
    pub: 'Bluesky',
    categories: ['Journalism Theory & Practice'],
    type: 'social',
    verified: true,
    summaryPreview: 'A short post about public life.',
  },
  {
    id: 'TWITTER-00001',
    title: 'The view from nowhere',
    date: '2011-04-10',
    year: '2011',
    era: 'View from Nowhere (10s)',
    pub: 'Twitter/X',
    categories: ['Press & Media Criticism', 'Journalism Theory & Practice'],
    type: 'social',
    verified: true,
    summaryPreview: 'A thread about political journalism.',
  },
];

const coreData = {
  records,
  facets: {
    categories: [
      'Audience & Public Engagement',
      'Journalism Theory & Practice',
      'Press & Media Criticism',
    ],
    eras: [
      'Peak Blogging & Citizen Journalism (2005-2009)',
      'View from Nowhere (10s)',
      'Platform Transition & Future Models (2021-Present)',
    ],
    publications: ['Bluesky', 'PressThink', 'Twitter/X'],
  },
};

describe('archive site-tool search', () => {
  it('reuses normalized archive search and combines narrow filters', () => {
    const result = searchArchiveRecords(records, {
      query: "journalists' role",
      categories: ['Journalism Theory & Practice'],
      year: '2025',
      publication: 'Bluesky',
      content_type: 'bluesky',
      sort: 'date-desc',
      limit: 5,
    }, { baseHref: 'https://pressthink.org/j/rosen-archive/' });

    assert.equal(result.totalMatches, 1);
    assert.equal(result.records[0].id, 'BSKY-00001');
    assert.equal(
      result.records[0].archiveUrl,
      'https://pressthink.org/j/rosen-archive/?record=BSKY-00001',
    );
  });

  it('requires every selected category and bounds the returned rows', () => {
    const result = searchArchiveRecords(records, {
      categories: ['Press & Media Criticism', 'Journalism Theory & Practice'],
      limit: 1,
    }, { baseHref: 'https://example.com/archive/' });

    assert.equal(result.totalMatches, 1);
    assert.equal(result.returned, 1);
    assert.equal(result.records[0].id, 'TWITTER-00001');
  });

  it('matches exact Twitter publication labels without accepting host substrings', () => {
    const result = searchArchiveRecords([
      ...records,
      {
        id: 'SOCIAL-00001',
        title: 'Unrelated social record',
        date: '2025-03-01',
        year: '2025',
        era: 'Platform Transition & Future Models (2021-Present)',
        pub: 'news.example-x.com',
        categories: ['Journalism Theory & Practice'],
        type: 'social',
        verified: true,
        summaryPreview: 'A record from another social publication.',
      },
    ], { content_type: 'twitter', limit: 10 });

    assert.deepEqual(result.records.map(record => record.id), ['TWITTER-00001']);
  });

  it('rejects unsupported filters instead of silently broadening the search', () => {
    assert.throws(
      () => searchArchiveRecords(records, { content_type: 'video' }),
      /content_type/,
    );
    assert.throws(
      () => searchArchiveRecords(records, { limit: 100 }),
      /limit/,
    );
    assert.throws(
      () => searchArchiveRecords(records, {
        year: '2025',
        era: 'Platform Transition & Future Models (2021-Present)',
      }),
      /year and era/,
    );
  });
});

describe('archive site-tool records and entities', () => {
  it('builds a canonical record link without stale page state', () => {
    assert.equal(
      buildRecordLink(
        'RECORD-00001',
        'https://pressthink.org/j/rosen-archive/?q=old&record=OLD#entities',
      ),
      'https://pressthink.org/j/rosen-archive/?record=RECORD-00001',
    );
  });

  it('returns related entities in prominence order with an optional type filter', () => {
    const result = findRelatedEntities({
      entities: [
        { id: 'P1', name: 'John Dewey', type: 'Person', prominence: 9, totalMentions: 20 },
        { id: 'C1', name: 'Public journalism', type: 'Concept', prominence: 12, totalMentions: 30 },
        { id: 'P2', name: 'Walter Lippmann', type: 'Person', prominence: 15, totalMentions: 25 },
      ],
      recordEntityMap: { 'RECORD-00001': ['P1', 'C1', 'P2'] },
    }, 'RECORD-00001', { entity_type: 'Person', limit: 1 });

    assert.equal(result.totalMatches, 2);
    assert.deepEqual(result.entities.map(entity => entity.name), ['Walter Lippmann']);
  });
});

describe('archive site-tool registration', () => {
  it('registers four read-only tools and executes against injected loaders', async () => {
    const tools = createArchiveSiteTools({
      loadCoreData: async () => coreData,
      loadRecordDetails: async () => ({
        author: 'Jay Rosen',
        summary: 'Full summary',
        quote: 'Selected quotation',
        concepts: ['Public journalism'],
        tags: ['Audience'],
        url: 'https://example.com/source',
        relatedIds: ['P1'],
      }),
      loadEntitiesData: async () => ({
        entities: [{ id: 'P1', name: 'John Dewey', type: 'Person', prominence: 9 }],
        recordEntityMap: { 'RECORD-00001': ['P1'] },
      }),
      loadFullTextIndexes: async () => ({ indexes: [], complete: true, failures: [] }),
      currentHref: () => 'https://pressthink.org/j/rosen-archive/',
    });

    assert.deepEqual(
      tools.map(tool => tool.name),
      ['get_archive_facets', 'search_archive', 'get_archive_record', 'find_related_entities'],
    );
    assert.ok(tools.every(tool => tool.annotations?.readOnlyHint === true));

    const recordTool = tools.find(tool => tool.name === 'get_archive_record');
    const record = await recordTool.execute({ record_id: 'RECORD-00001' });
    assert.equal(record.found, true);
    assert.equal(record.record.summary, 'Full summary');
    assert.equal(record.record.sourceUrl, 'https://example.com/source');
    assert.deepEqual(record.record.relatedEntityIds, ['P1']);
    assert.equal('relatedRecordIds' in record.record, false);
  });

  it('does nothing when the browser has no WebMCP support', async () => {
    let loadCalls = 0;
    const registered = await registerArchiveSiteTools({
      documentObject: {},
      loadCoreData: async () => {
        loadCalls += 1;
        return coreData;
      },
    });

    assert.equal(registered, false);
    assert.equal(loadCalls, 0);
  });

  it('passes every descriptor to the browser model context', async () => {
    const names = [];
    const registered = await registerArchiveSiteTools({
      documentObject: {
        modelContext: {
          registerTool: async tool => names.push(tool.name),
        },
      },
      loadCoreData: async () => coreData,
      loadRecordDetails: async () => null,
      loadEntitiesData: async () => ({ entities: [], recordEntityMap: {} }),
      loadFullTextIndexes: async () => ({ indexes: [], complete: true, failures: [] }),
      currentHref: () => 'https://pressthink.org/j/rosen-archive/',
    });

    assert.equal(registered, true);
    assert.deepEqual(names, [
      'get_archive_facets',
      'search_archive',
      'get_archive_record',
      'find_related_entities',
    ]);
  });

  it('retries entity data after a resolved loader error', async () => {
    let entityCalls = 0;
    const tools = createArchiveSiteTools({
      loadCoreData: async () => coreData,
      loadEntitiesData: async () => {
        entityCalls += 1;
        if (entityCalls === 1) {
          return { entities: [], recordEntityMap: {}, error: 'Temporary entity failure' };
        }
        return {
          entities: [{ id: 'P1', name: 'John Dewey', type: 'Person', prominence: 9 }],
          recordEntityMap: { 'RECORD-00001': ['P1'] },
        };
      },
    });
    const entityTool = tools.find(tool => tool.name === 'find_related_entities');

    await assert.rejects(
      entityTool.execute({ record_id: 'RECORD-00001' }),
      /Temporary entity failure/,
    );
    const retried = await entityTool.execute({ record_id: 'RECORD-00001' });

    assert.equal(entityCalls, 2);
    assert.equal(retried.found, true);
    assert.deepEqual(retried.entities.map(entity => entity.name), ['John Dewey']);
  });
});
