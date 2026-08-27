import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Issue #524: Jay asked to be able to add or remove a thematic category
// himself. ADDING-RECORDS.md now documents that runbook. These tests pin the
// runbook's factual claims to the actual source, so a later refactor that
// breaks a claim (e.g. giving categories fixed per-name colors, or reading
// the sidebar list straight from schema.json) fails a test instead of
// quietly making the guide wrong.

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const addingRecords = fs.readFileSync(path.join(rootDir, 'ADDING-RECORDS.md'), 'utf8');
const archiveResults = fs.readFileSync(
  path.join(rootDir, 'frontend/components/ArchiveResults.js'),
  'utf8',
);
const constants = fs.readFileSync(path.join(rootDir, 'frontend/constants.js'), 'utf8');
const schema = JSON.parse(fs.readFileSync(path.join(rootDir, 'backend/schema.json'), 'utf8'));

describe('thematic category self-service runbook (ADDING-RECORDS.md)', () => {
  it('documents adding or removing a category, separate from tagging one record', () => {
    assert.match(addingRecords, /## Adding or removing a thematic category/);
  });

  it('points at backend\/schema.json as the one place the category list lives', () => {
    const section = addingRecords.split('## Adding or removing a thematic category')[1];
    assert.ok(section, 'the runbook section must exist');
    assert.match(section, /`backend\/schema\.json`/);
    assert.match(section, /taxonomy\.thematic_categories/);
  });

  it('tells the curator to keep the ADDING-RECORDS list in step with schema.json', () => {
    const section = addingRecords.split('## Adding or removing a thematic category')[1];
    assert.match(section, /Thematic categories to use/);
  });

  it('tells the curator to regenerate the JSON and bump the version', () => {
    const section = addingRecords.split('## Adding or removing a thematic category')[1];
    assert.match(section, /node data\/export-archive-data\.js/);
    assert.match(section, /bump-version/);
  });

  it('claims category colors are automatic, not something the curator sets', () => {
    const section = addingRecords.split('## Adding or removing a thematic category')[1];
    assert.match(section, /automatic/i);
    assert.match(section, /frontend\/constants\.js/);
  });
});

describe('the runbook\'s color claim matches the code', () => {
  it('ArchiveResults.js still derives a category\'s color from a hash of its name, not a fixed mapping', () => {
    assert.match(archiveResults, /hashString\(primaryCategory\)\s*%\s*COLORS\.length/);
    assert.match(archiveResults, /hashString\(group\.name\)\s*%\s*COLORS\.length/);
    // No per-category color lookup table (e.g. a name -> color object) exists
    // alongside the hash-based assignment the runbook describes.
    assert.doesNotMatch(archiveResults, /CATEGORY_COLOR(S)?\s*[:=]/);
  });

  it('constants.js still exports COLORS as one fixed palette shared by every category', () => {
    assert.match(constants, /export const COLORS\s*=\s*\[/);
  });
});

describe('the runbook\'s schema-mirror claim matches the code', () => {
  it('backend/schema.json still has a non-empty taxonomy.thematic_categories list', () => {
    const categories = schema?.taxonomy?.thematic_categories;
    assert.ok(Array.isArray(categories) && categories.length > 0);
  });

  it('every schema category name appears in the ADDING-RECORDS "Thematic categories to use" list', () => {
    const section = addingRecords
      .split('### Thematic categories to use')[1]
      ?.split('###')[0];
    assert.ok(section, 'the Step 2 category list must exist');

    const listed = new Set(
      [...section.matchAll(/^- `([^`]+)`\s*$/gm)].map((match) => match[1]),
    );
    const canonical = schema.taxonomy.thematic_categories.map((entry) =>
      typeof entry === 'string' ? entry : entry.name,
    );

    for (const name of canonical) {
      assert.ok(listed.has(name), `schema category "${name}" is missing from ADDING-RECORDS.md`);
    }
    assert.equal(listed.size, canonical.length);
  });
});
