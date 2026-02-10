/**
 * processRecord() unit tests
 *
 * Tests the core record transformation logic from export-archive-data.js.
 * Since processRecord isn't exported, we re-implement the logic here
 * (same pattern as data-pipeline.test.js).
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

// ============================================
// Re-implement processRecord dependencies
// ============================================

const ERAS = [
  "Public Journalism (90s)",
  "Web & Blogging (00s)",
  "View from Nowhere (10s)",
  "Democracy in Crisis (20s)"
];

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

  let threadData = null;
  if (rawId.startsWith('THREAD-')) {
    if (row.thread_data) {
      try {
        threadData = typeof row.thread_data === 'string'
          ? JSON.parse(row.thread_data)
          : row.thread_data;
      } catch (e) {
        // ignore parse errors in test
      }
    }
    if (!threadData && row.notes) {
      const match = row.notes.match(/thread_data:\s*(\{.*\})/);
      if (match) {
        try {
          threadData = JSON.parse(match[1]);
        } catch (e) {
          // ignore
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
    summary: (row.summary || row.Summary || ''),
    quote: (row.pull_quote || row.Pull_Quote || row.excerpt || row.raw_text || ''),
    categories: cats,
    concepts: concepts,
    tags: tags,
    verified: isVerified,
    type: type,
    relatedIds: directRelIds
  };

  if (threadData) {
    record.thread_data = threadData;
  }

  return record;
}

// ============================================
// Tests
// ============================================

describe('processRecord: basic field mapping', () => {
  const baseRow = {
    id: 'RECORD-00100',
    title: 'Test Article Title',
    author: 'Jay Rosen',
    publication_date: '2022-07-15',
    original_publication: 'PressThink',
    url: 'https://pressthink.org/test',
    summary: 'A test summary.',
    pull_quote: 'A notable quote from the article.',
    thematic_categories: 'Press Criticism, Media Theory',
    key_concepts: 'View from Nowhere',
    tags: 'journalism, media',
    verified: 'TRUE'
  };

  it('maps all fields correctly', () => {
    const rec = processRecord(baseRow, 0, 'article', {});
    assert.strictEqual(rec.id, 'RECORD-00100');
    assert.strictEqual(rec.title, 'Test Article Title');
    assert.strictEqual(rec.author, 'Jay Rosen');
    assert.strictEqual(rec.date, '2022-07-15');
    assert.strictEqual(rec.year, '2022');
    assert.strictEqual(rec.pub, 'PressThink');
    assert.strictEqual(rec.url, 'https://pressthink.org/test');
    assert.strictEqual(rec.summary, 'A test summary.');
    assert.strictEqual(rec.quote, 'A notable quote from the article.');
    assert.strictEqual(rec.type, 'article');
  });

  it('assigns correct era from date', () => {
    const rec = processRecord(baseRow, 0, 'article', {});
    assert.strictEqual(rec.era, 'Democracy in Crisis (20s)');
  });

  it('parses categories into array', () => {
    const rec = processRecord(baseRow, 0, 'article', {});
    assert.deepStrictEqual(rec.categories, ['Press Criticism', 'Media Theory']);
  });

  it('parses concepts and tags', () => {
    const rec = processRecord(baseRow, 0, 'article', {});
    assert.deepStrictEqual(rec.concepts, ['View from Nowhere']);
    assert.deepStrictEqual(rec.tags, ['journalism', 'media']);
  });

  it('extracts year from date', () => {
    const rec = processRecord(baseRow, 0, 'article', {});
    assert.strictEqual(rec.year, '2022');
  });
});

describe('processRecord: title truncation', () => {
  it('does NOT truncate article titles even when long', () => {
    const row = { id: 'R1', title: 'A'.repeat(150), publication_date: '2020-01-15' };
    const rec = processRecord(row, 0, 'article', {});
    assert.strictEqual(rec.title.length, 150);
    assert.ok(!rec.title.endsWith('...'));
  });

  it('truncates social titles over 100 chars', () => {
    const longTitle = 'A'.repeat(150);
    const row = { id: 'S1', title: longTitle, publication_date: '2020-01-15' };
    const rec = processRecord(row, 0, 'social', {});
    assert.strictEqual(rec.title.length, 103); // 100 + '...'
    assert.ok(rec.title.endsWith('...'));
  });

  it('does NOT truncate social titles at exactly 100 chars', () => {
    const row = { id: 'S2', title: 'B'.repeat(100), publication_date: '2020-01-15' };
    const rec = processRecord(row, 0, 'social', {});
    assert.strictEqual(rec.title.length, 100);
    assert.ok(!rec.title.endsWith('...'));
  });

  it('does NOT truncate social titles under 100 chars', () => {
    const row = { id: 'S3', title: 'Short social post', publication_date: '2020-01-15' };
    const rec = processRecord(row, 0, 'social', {});
    assert.strictEqual(rec.title, 'Short social post');
  });
});

describe('processRecord: quote fallback chain', () => {
  it('uses pull_quote first', () => {
    const row = { id: 'R1', title: 'T', publication_date: '2020-06-15',
      pull_quote: 'The pull quote', excerpt: 'The excerpt', raw_text: 'Raw text' };
    const rec = processRecord(row, 0, 'article', {});
    assert.strictEqual(rec.quote, 'The pull quote');
  });

  it('falls back to excerpt when pull_quote is empty', () => {
    const row = { id: 'R2', title: 'T', publication_date: '2020-06-15',
      pull_quote: '', excerpt: 'The excerpt', raw_text: 'Raw text' };
    const rec = processRecord(row, 0, 'article', {});
    assert.strictEqual(rec.quote, 'The excerpt');
  });

  it('falls back to raw_text when pull_quote and excerpt are empty', () => {
    const row = { id: 'R3', title: 'T', publication_date: '2020-06-15',
      pull_quote: '', excerpt: '', raw_text: 'The raw text content' };
    const rec = processRecord(row, 0, 'article', {});
    assert.strictEqual(rec.quote, 'The raw text content');
  });

  it('returns empty string when all quote sources are missing', () => {
    const row = { id: 'R4', title: 'T', publication_date: '2020-06-15' };
    const rec = processRecord(row, 0, 'article', {});
    assert.strictEqual(rec.quote, '');
  });

  it('uses Pull_Quote (capitalized) column name', () => {
    const row = { id: 'R5', title: 'T', publication_date: '2020-06-15',
      Pull_Quote: 'Capitalized column' };
    const rec = processRecord(row, 0, 'article', {});
    assert.strictEqual(rec.quote, 'Capitalized column');
  });
});

describe('processRecord: verified field', () => {
  it('verified=TRUE (string) is verified', () => {
    const row = { id: 'R1', title: 'T', verified: 'TRUE', publication_date: '2020-06-15' };
    assert.strictEqual(processRecord(row, 0, 'article', {}).verified, true);
  });

  it('verified=true (lowercase string) is verified', () => {
    const row = { id: 'R2', title: 'T', verified: 'true', publication_date: '2020-06-15' };
    assert.strictEqual(processRecord(row, 0, 'article', {}).verified, true);
  });

  it('verified=Yes is verified', () => {
    const row = { id: 'R3', title: 'T', verified: 'Yes', publication_date: '2020-06-15' };
    assert.strictEqual(processRecord(row, 0, 'article', {}).verified, true);
  });

  it('verified=true (boolean) is verified', () => {
    const row = { id: 'R4', title: 'T', verified: true, publication_date: '2020-06-15' };
    assert.strictEqual(processRecord(row, 0, 'article', {}).verified, true);
  });

  it('social type is always verified regardless of field', () => {
    const row = { id: 'R5', title: 'T', verified: 'FALSE', publication_date: '2020-06-15' };
    assert.strictEqual(processRecord(row, 0, 'social', {}).verified, true);
  });

  it('unverified article with verified=FALSE is not verified', () => {
    const row = { id: 'R6', title: 'T', verified: 'FALSE', publication_date: '2020-06-15' };
    assert.strictEqual(processRecord(row, 0, 'article', {}).verified, false);
  });

  it('missing verified field on article is not verified', () => {
    const row = { id: 'R7', title: 'T', publication_date: '2020-06-15' };
    assert.strictEqual(processRecord(row, 0, 'article', {}).verified, false);
  });

  it('uses Verified (capitalized) column name', () => {
    const row = { id: 'R8', title: 'T', Verified: 'TRUE', publication_date: '2020-06-15' };
    assert.strictEqual(processRecord(row, 0, 'article', {}).verified, true);
  });
});

describe('processRecord: author defaulting', () => {
  it('uses author from row when present', () => {
    const row = { id: 'R1', title: 'T', author: 'Eric Nelson', publication_date: '2020-06-15' };
    assert.strictEqual(processRecord(row, 0, 'article', {}).author, 'Eric Nelson');
  });

  it('defaults to Jay Rosen when author is missing', () => {
    const row = { id: 'R2', title: 'T', publication_date: '2020-06-15' };
    assert.strictEqual(processRecord(row, 0, 'article', {}).author, 'Jay Rosen');
  });

  it('uses Author (capitalized) column name', () => {
    const row = { id: 'R3', title: 'T', Author: 'Custom Author', publication_date: '2020-06-15' };
    assert.strictEqual(processRecord(row, 0, 'article', {}).author, 'Custom Author');
  });

  it('trims whitespace from author', () => {
    const row = { id: 'R4', title: 'T', author: '  Jay Rosen  ', publication_date: '2020-06-15' };
    assert.strictEqual(processRecord(row, 0, 'article', {}).author, 'Jay Rosen');
  });
});

describe('processRecord: ID and fallback generation', () => {
  it('uses id field when present', () => {
    const row = { id: 'RECORD-00001', title: 'T', publication_date: '2020-06-15' };
    assert.strictEqual(processRecord(row, 5, 'article', {}).id, 'RECORD-00001');
  });

  it('uses ID (capitalized) field', () => {
    const row = { ID: 'RECORD-00002', title: 'T', publication_date: '2020-06-15' };
    assert.strictEqual(processRecord(row, 5, 'article', {}).id, 'RECORD-00002');
  });

  it('generates fallback ID from type and index', () => {
    const row = { title: 'T', publication_date: '2020-06-15' };
    assert.strictEqual(processRecord(row, 42, 'article', {}).id, 'article-42');
    assert.strictEqual(processRecord(row, 7, 'social', {}).id, 'social-7');
  });
});

describe('processRecord: missing fields gracefully handled', () => {
  it('handles completely empty row', () => {
    const row = {};
    const rec = processRecord(row, 0, 'article', {});
    assert.strictEqual(rec.title, 'Untitled');
    assert.strictEqual(rec.author, 'Jay Rosen');
    assert.strictEqual(rec.pub, 'Unknown');
    assert.strictEqual(rec.url, '#');
    assert.strictEqual(rec.summary, '');
    assert.strictEqual(rec.quote, '');
    assert.deepStrictEqual(rec.categories, []);
    assert.deepStrictEqual(rec.concepts, []);
    assert.deepStrictEqual(rec.tags, []);
    assert.deepStrictEqual(rec.relatedIds, []);
  });

  it('returns empty year when date is missing', () => {
    const row = { id: 'R1', title: 'T' };
    assert.strictEqual(processRecord(row, 0, 'article', {}).year, '');
  });

  it('returns empty date for invalid date string', () => {
    const row = { id: 'R1', title: 'T', publication_date: 'not-a-date' };
    assert.strictEqual(processRecord(row, 0, 'article', {}).date, '');
  });
});

describe('processRecord: thread_data parsing', () => {
  it('parses thread_data JSON string for THREAD records', () => {
    const threadDataObj = { thread_id: 'abc', total_posts: 3, posts: [{ number: 1 }] };
    const row = {
      id: 'THREAD-00001',
      title: 'Thread title',
      publication_date: '2025-06-15',
      thread_data: JSON.stringify(threadDataObj)
    };
    const rec = processRecord(row, 0, 'article', {});
    assert.deepStrictEqual(rec.thread_data, threadDataObj);
  });

  it('accepts thread_data as object (not string)', () => {
    const threadDataObj = { thread_id: 'abc', total_posts: 3, posts: [{ number: 1 }] };
    const row = {
      id: 'THREAD-00001',
      title: 'Thread title',
      publication_date: '2025-06-15',
      thread_data: threadDataObj
    };
    const rec = processRecord(row, 0, 'article', {});
    assert.deepStrictEqual(rec.thread_data, threadDataObj);
  });

  it('does NOT parse thread_data for non-THREAD records', () => {
    const row = {
      id: 'RECORD-00001',
      title: 'Normal article',
      publication_date: '2020-06-15',
      thread_data: '{"thread_id": "abc"}'
    };
    const rec = processRecord(row, 0, 'article', {});
    assert.strictEqual(rec.thread_data, undefined);
  });

  it('falls back to notes field for legacy thread_data format', () => {
    const threadDataObj = { thread_id: 'xyz', total_posts: 5, posts: [] };
    const row = {
      id: 'THREAD-00002',
      title: 'Old thread',
      publication_date: '2025-06-15',
      notes: `some text thread_data: ${JSON.stringify(threadDataObj)} more text`
    };
    const rec = processRecord(row, 0, 'article', {});
    assert.deepStrictEqual(rec.thread_data, threadDataObj);
  });

  it('handles malformed thread_data JSON gracefully', () => {
    const row = {
      id: 'THREAD-00003',
      title: 'Bad thread',
      publication_date: '2025-06-15',
      thread_data: 'not valid json {'
    };
    const rec = processRecord(row, 0, 'article', {});
    assert.strictEqual(rec.thread_data, undefined);
  });
});

describe('processRecord: relationships map integration', () => {
  it('assigns relatedIds from relationships map', () => {
    const map = { 'RECORD-001': ['ENT-001', 'ENT-002'] };
    const row = { id: 'RECORD-001', title: 'T', publication_date: '2020-06-15' };
    const rec = processRecord(row, 0, 'article', map);
    assert.deepStrictEqual(rec.relatedIds, ['ENT-001', 'ENT-002']);
  });

  it('returns empty array when record has no relationships', () => {
    const map = { 'OTHER': ['ENT-001'] };
    const row = { id: 'RECORD-001', title: 'T', publication_date: '2020-06-15' };
    const rec = processRecord(row, 0, 'article', map);
    assert.deepStrictEqual(rec.relatedIds, []);
  });
});

describe('processRecord: alternative column names', () => {
  it('handles capitalized column names (Title, Date, etc.)', () => {
    const row = {
      ID: 'ALT-001',
      Title: 'Alt Title',
      Author: 'Alt Author',
      Publication_Date: '2015-06-15',
      Original_Publication: 'Alt Pub',
      URL: 'https://example.com',
      Summary: 'Alt summary',
      Pull_Quote: 'Alt quote',
      Thematic_Categories: 'Cat A',
      Key_Concepts: 'Concept B',
      Tags: 'tag1, tag2',
      Verified: 'TRUE'
    };
    const rec = processRecord(row, 0, 'article', {});
    assert.strictEqual(rec.id, 'ALT-001');
    assert.strictEqual(rec.title, 'Alt Title');
    assert.strictEqual(rec.author, 'Alt Author');
    assert.strictEqual(rec.pub, 'Alt Pub');
    assert.strictEqual(rec.summary, 'Alt summary');
    assert.strictEqual(rec.quote, 'Alt quote');
  });
});

// ============================================
// Social summary auto-generation
// ============================================

describe('social summary generation', () => {
  // Re-implement the social summary logic from export-archive-data.js
  function generateSocialSummary(record) {
    if (record.summary) return record.summary;
    const platform = record.pub || 'social media';
    const dateStr = record.date || '';
    const catList = record.categories.length > 0 ? record.categories.join(', ') : '';
    const parts = [`A ${platform} post by ${record.author || 'Jay Rosen'}`];
    if (dateStr) parts[0] += ` from ${dateStr}`;
    parts[0] += '.';
    if (catList) parts.push(`Topics: ${catList}.`);
    return parts.join(' ');
  }

  it('generates summary with platform, author, and date', () => {
    const rec = { summary: '', pub: 'Bluesky', author: 'Jay Rosen', date: '2025-10-30', categories: [] };
    const summary = generateSocialSummary(rec);
    assert.strictEqual(summary, 'A Bluesky post by Jay Rosen from 2025-10-30.');
  });

  it('appends categories when present', () => {
    const rec = { summary: '', pub: 'Twitter/X', author: 'Jay Rosen', date: '2020-05-01', categories: ['Press Criticism', 'Media Theory'] };
    const summary = generateSocialSummary(rec);
    assert.strictEqual(summary, 'A Twitter/X post by Jay Rosen from 2020-05-01. Topics: Press Criticism, Media Theory.');
  });

  it('uses "social media" when pub is empty', () => {
    const rec = { summary: '', pub: '', author: 'Jay Rosen', date: '2020-06-15', categories: [] };
    const summary = generateSocialSummary(rec);
    assert.strictEqual(summary, 'A social media post by Jay Rosen from 2020-06-15.');
  });

  it('omits date when empty', () => {
    const rec = { summary: '', pub: 'Bluesky', author: 'Jay Rosen', date: '', categories: [] };
    const summary = generateSocialSummary(rec);
    assert.strictEqual(summary, 'A Bluesky post by Jay Rosen.');
  });

  it('preserves existing summary if non-empty', () => {
    const rec = { summary: 'Already has a summary.', pub: 'Bluesky', author: 'Jay Rosen', date: '2025-01-01', categories: [] };
    const summary = generateSocialSummary(rec);
    assert.strictEqual(summary, 'Already has a summary.');
  });

  it('defaults author to Jay Rosen', () => {
    const rec = { summary: '', pub: 'Bluesky', author: '', date: '2025-06-15', categories: [] };
    const summary = generateSocialSummary(rec);
    assert.ok(summary.includes('Jay Rosen'));
  });
});

// ============================================
// Record filtering pipeline
// ============================================

describe('record filtering pipeline', () => {
  const REPOST_TITLE_PATTERN = /^(Quoted|Retweet|RT) by/i;
  const GENERIC_TITLE_PATTERN = /^(Reply|Tweet|Post|Quote) by/i;

  function cleanText(text) {
    return (text || '')
      .replace(/https?:\/\/\S+/g, '')
      .replace(/^(\s*@\S+\s*)+/, '')
      .replace(/@\S+/g, '')
      .replace(/[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{1F1E0}-\u{1F1FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/gu, '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function shouldFilter(record, threadMemberIds) {
    if (threadMemberIds.has(record.id)) return 'thread_member';
    if (REPOST_TITLE_PATTERN.test(record.title)) return 'repost';
    if (GENERIC_TITLE_PATTERN.test(record.title)) {
      const text = cleanText(record.quote);
      if (text.length < 10) return 'short_reply';
    }
    return false;
  }

  describe('repost detection', () => {
    it('filters "Quoted by Jay Rosen"', () => {
      assert.strictEqual(shouldFilter({ id: 'S1', title: 'Quoted by Jay Rosen', quote: '' }, new Set()), 'repost');
    });

    it('filters "Retweet by Jay Rosen"', () => {
      assert.strictEqual(shouldFilter({ id: 'S2', title: 'Retweet by Jay Rosen', quote: '' }, new Set()), 'repost');
    });

    it('filters "RT by Jay Rosen"', () => {
      assert.strictEqual(shouldFilter({ id: 'S3', title: 'RT by Jay Rosen', quote: '' }, new Set()), 'repost');
    });

    it('filters reposts regardless of content length', () => {
      assert.strictEqual(shouldFilter({ id: 'S4', title: 'Quoted by Jay Rosen', quote: 'A very long quote with lots of meaningful content that should not matter' }, new Set()), 'repost');
    });

    it('is case-insensitive', () => {
      assert.strictEqual(shouldFilter({ id: 'S5', title: 'QUOTED BY Jay Rosen', quote: '' }, new Set()), 'repost');
    });
  });

  describe('short reply detection', () => {
    it('filters generic title with short content', () => {
      assert.strictEqual(shouldFilter({ id: 'S1', title: 'Reply by Jay Rosen', quote: 'Yes' }, new Set()), 'short_reply');
    });

    it('keeps generic title with substantial content', () => {
      assert.strictEqual(shouldFilter({ id: 'S2', title: 'Reply by Jay Rosen', quote: 'This is a meaningful reply with real content' }, new Set()), false);
    });

    it('strips URLs before measuring length', () => {
      assert.strictEqual(shouldFilter({ id: 'S3', title: 'Tweet by Jay Rosen', quote: 'https://example.com/very/long/url' }, new Set()), 'short_reply');
    });

    it('strips @mentions before measuring length', () => {
      assert.strictEqual(shouldFilter({ id: 'S4', title: 'Reply by Jay Rosen', quote: '@user1 @user2 ok' }, new Set()), 'short_reply');
    });

    it('does NOT filter non-generic titles even with short content', () => {
      assert.strictEqual(shouldFilter({ id: 'S5', title: 'My Thoughts on Democracy', quote: 'Yes' }, new Set()), false);
    });
  });

  describe('thread member removal', () => {
    it('filters posts that belong to a thread', () => {
      const members = new Set(['post-001', 'post-002']);
      assert.strictEqual(shouldFilter({ id: 'post-001', title: 'Normal title', quote: 'Content' }, members), 'thread_member');
    });

    it('thread membership takes priority over other filters', () => {
      const members = new Set(['post-003']);
      // This would also match repost pattern, but thread_member check comes first
      assert.strictEqual(shouldFilter({ id: 'post-003', title: 'Quoted by Jay Rosen', quote: '' }, members), 'thread_member');
    });
  });
});

// ============================================
// Final record validation filter
// ============================================

describe('final record validation', () => {
  function passesValidation(record) {
    if (!record.verified) return false;
    if (!record.title || record.title === 'Untitled' || record.title.trim().length < 5) return false;
    if (!record.date && record.url === '#') return false;
    return true;
  }

  it('accepts verified record with title and date', () => {
    assert.ok(passesValidation({ verified: true, title: 'Good Title', date: '2020-01-15', url: '#' }));
  });

  it('rejects unverified record', () => {
    assert.ok(!passesValidation({ verified: false, title: 'Good Title', date: '2020-01-15', url: '#' }));
  });

  it('rejects "Untitled" records', () => {
    assert.ok(!passesValidation({ verified: true, title: 'Untitled', date: '2020-01-15', url: '#' }));
  });

  it('rejects titles shorter than 5 chars', () => {
    assert.ok(!passesValidation({ verified: true, title: 'Hi', date: '2020-01-15', url: '#' }));
  });

  it('rejects records with no date AND no URL', () => {
    assert.ok(!passesValidation({ verified: true, title: 'Good Title', date: '', url: '#' }));
  });

  it('accepts records with no date but valid URL', () => {
    assert.ok(passesValidation({ verified: true, title: 'Good Title', date: '', url: 'https://example.com' }));
  });

  it('accepts records with date but no URL', () => {
    assert.ok(passesValidation({ verified: true, title: 'Good Title', date: '2020-01-15', url: '#' }));
  });
});
