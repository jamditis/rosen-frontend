import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { validateOkfBundle } from '../scripts/validate-okf.js';

describe('repo OKF bundle', () => {
  it('satisfies the project OKF profile', () => {
    const result = validateOkfBundle();
    assert.deepEqual(result.errors, []);
    assert.equal(result.ok, true);
    assert.ok(result.concepts >= 30, 'expected the project wiki to have meaningful breadth');
  });

  it('rejects concept files without required profile metadata', () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'okf-bad-'));
    try {
      const wiki = path.join(tmp, 'wiki');
      const dir = path.join(wiki, 'systems');
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(path.join(wiki, 'index.md'), '---\nokf_version: "0.1"\n---\n# test\n');
      fs.writeFileSync(path.join(dir, 'index.md'), '# systems\n\n- [bad.md](bad.md) - bad\n');
      fs.writeFileSync(path.join(dir, 'bad.md'), '---\ntype: system\n---\n# bad\n');

      const result = validateOkfBundle({ rootDir: tmp, bundleDir: wiki });
      assert.equal(result.ok, false);
      assert.ok(result.errors.some(error => error.includes('missing or empty frontmatter key title')));
      assert.ok(result.errors.some(error => error.includes('missing or empty frontmatter key source')));
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });

  it('rejects dangling internal links and unindexed concepts', () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'okf-links-'));
    try {
      const wiki = path.join(tmp, 'wiki');
      const dir = path.join(wiki, 'systems');
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(path.join(wiki, 'index.md'), '---\nokf_version: "0.1"\n---\n# test\n');
      fs.writeFileSync(path.join(dir, 'index.md'), '# systems\n');
      fs.writeFileSync(path.join(dir, 'system.md'), `---
type: system
title: Example system
description: Example concept.
source: ["test"]
verified: 2026-06-23
tags: [test]
timestamp: 2026-06-23
---

# Example system

See [missing](missing.md).
`);

      const result = validateOkfBundle({ rootDir: tmp, bundleDir: wiki });
      assert.equal(result.ok, false);
      assert.ok(result.errors.some(error => error.includes('missing link to system.md')));
      assert.ok(result.errors.some(error => error.includes('dangling link -> missing.md')));
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });

  it('ignores placeholder links inside fenced code examples', () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'okf-code-links-'));
    try {
      const wiki = path.join(tmp, 'wiki');
      const dir = path.join(wiki, 'meta');
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(path.join(wiki, 'index.md'), '---\nokf_version: "0.1"\n---\n# test\n\n- [meta/](meta/index.md)\n');
      fs.writeFileSync(path.join(dir, 'index.md'), '# meta\n\n- [Template](template.md) - template\n');
      fs.writeFileSync(path.join(dir, 'template.md'), `---
type: template
title: Template
description: Example template.
source: ["test"]
verified: 2026-06-23
tags: [test]
timestamp: 2026-06-23
---

# Template

\`\`\`\`markdown
See [related concept](../path/file.md).
\`\`\`\`
`);

      const result = validateOkfBundle({ rootDir: tmp, bundleDir: wiki });
      assert.deepEqual(result.errors, []);
      assert.equal(result.ok, true);
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });

  it('accepts Markdown links with optional titles', () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'okf-link-title-'));
    try {
      const wiki = path.join(tmp, 'wiki');
      const dir = path.join(wiki, 'systems');
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(path.join(wiki, 'index.md'), '---\nokf_version: "0.1"\n---\n# test\n\n- [systems/](systems/index.md)\n');
      fs.writeFileSync(path.join(dir, 'index.md'), '# systems\n\n- [One](one.md) - one\n- [Two](two.md) - two\n');
      fs.writeFileSync(path.join(dir, 'one.md'), `---
type: system
title: One
description: One concept.
source: ["test"]
verified: 2026-06-23
tags: [test]
timestamp: 2026-06-23
---

# One

See [Two](two.md "Two concept").
`);
      fs.writeFileSync(path.join(dir, 'two.md'), `---
type: system
title: Two
description: Two concept.
source: ["test"]
verified: 2026-06-23
tags: [test]
timestamp: 2026-06-23
---

# Two
`);

      const result = validateOkfBundle({ rootDir: tmp, bundleDir: wiki });
      assert.deepEqual(result.errors, []);
      assert.equal(result.ok, true);
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });

  it('rejects invalid calendar dates', () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'okf-bad-date-'));
    try {
      const wiki = path.join(tmp, 'wiki');
      const dir = path.join(wiki, 'systems');
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(path.join(wiki, 'index.md'), '---\nokf_version: "0.1"\n---\n# test\n\n- [systems/](systems/index.md)\n');
      fs.writeFileSync(path.join(dir, 'index.md'), '# systems\n\n- [Bad date](bad-date.md) - bad date\n');
      fs.writeFileSync(path.join(dir, 'bad-date.md'), `---
type: system
title: Bad date
description: Bad date concept.
source: ["test"]
verified: 2026-02-31
tags: [test]
timestamp: 2026-99-99
---

# Bad date
`);

      const result = validateOkfBundle({ rootDir: tmp, bundleDir: wiki });
      assert.equal(result.ok, false);
      assert.ok(result.errors.some(error => error.includes('verified must be a valid YYYY-MM-DD date')));
      assert.ok(result.errors.some(error => error.includes('timestamp must be a valid YYYY-MM-DD date')));
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });

  it('detects fine-grained GitHub personal access tokens', () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'okf-secret-'));
    try {
      const wiki = path.join(tmp, 'wiki');
      const dir = path.join(wiki, 'systems');
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(path.join(wiki, 'index.md'), '---\nokf_version: "0.1"\n---\n# test\n\n- [systems/](systems/index.md)\n');
      fs.writeFileSync(path.join(dir, 'index.md'), '# systems\n\n- [Secret](secret.md) - secret\n');
      fs.writeFileSync(path.join(dir, 'secret.md'), `---
type: system
title: Secret
description: Secret concept.
source: ["test"]
verified: 2026-06-23
tags: [test]
timestamp: 2026-06-23
---

# Secret

Do not commit github_pat_1234567890abcdefghijklmnopqrstuvwxyz_ABCDEF.
`);

      const result = validateOkfBundle({ rootDir: tmp, bundleDir: wiki });
      assert.equal(result.ok, false);
      assert.ok(result.errors.some(error => error.includes('GitHub fine-grained token')));
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });
});
