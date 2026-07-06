import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.join(__dirname, '..');

describe('Bluesky outbound links', () => {
  it('renders record and thread hrefs from the stored URL without a Bluesky-specific rewrite', () => {
    const recordModal = fs.readFileSync(path.join(rootDir, 'frontend/components/RecordModal.js'), 'utf-8');
    const threadModal = fs.readFileSync(path.join(rootDir, 'frontend/components/ThreadModal.js'), 'utf-8');

    assert.match(recordModal, /href=\$\{sanitizeHref\(displayRecord\.url\)\}/);
    assert.match(threadModal, /href=\$\{sanitizeHref\(post\.url\)\}/);

    for (const source of [recordModal, threadModal]) {
      assert.doesNotMatch(source, /bskyEmbed|toEmbedUrl|toBlueskyAppUrl/);
      assert.doesNotMatch(source, /embed\.bsky\.app/);
    }
  });

  it('stores the reported record as a canonical bsky.app URL', () => {
    const archiveData = fs.readFileSync(path.join(rootDir, 'data/archive-data.json'), 'utf-8');

    assert.match(
      archiveData,
      /"id": "BSKY-00597"[\s\S]*"url": "https:\/\/bsky\.app\/profile\/jayrosen\.bsky\.social\/post\/3ltucpnb3c22j"/,
    );
    assert.doesNotMatch(archiveData, /https:\/\/embed\.bsky\.app\/profile\/jayrosen\.bsky\.social\/post\/3ltucpnb3c22j/);
  });
});
