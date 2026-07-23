import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = (relativePath) => fs.readFileSync(new URL(`../${relativePath}`, import.meta.url), 'utf8');

describe("Jay Rosen's Internet Archive naming (#402, #551)", () => {
  it('removes the stale public name from the remaining documented surfaces', () => {
    for (const relativePath of [
      'data/SCHEMA.md',
      'backend/scripts/pdf/enhanced_pdf_generator/accessible_pdf_generator.py',
      'docs/archived/IMPLEMENTATION_PLAN.md',
    ]) {
      assert.doesNotMatch(read(relativePath), /Digital Archive/, relativePath);
    }
  });

  it('uses the canonical name in the deployed JSON schema', () => {
    const schema = JSON.parse(read('data/schema.json'));
    assert.equal(schema.title, "Jay Rosen's Internet Archive Schema");
    assert.match(schema.description, /Jay Rosen's Internet Archive/);
  });

  it('uses a matching npm-safe package identifier in both manifests', () => {
    const packageJson = JSON.parse(read('package.json'));
    const lock = JSON.parse(read('package-lock.json'));
    assert.equal(packageJson.name, 'jay-rosens-internet-archive');
    assert.equal(lock.name, packageJson.name);
    assert.equal(lock.packages[''].name, packageJson.name);
  });
});
