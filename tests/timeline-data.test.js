import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { buildTimelineModel } from '../frontend/utils/timelineData.js';

describe('timeline data model', () => {
  it('keeps the displayed data range separate from the padded bar axis', () => {
    const model = buildTimelineModel([
      { year: '1986' },
      { year: 1986 },
      { year: '2000' },
      { year: '2026' },
      { year: 'not-a-year' },
    ]);

    assert.equal(model.dataMinYear, '1986');
    assert.equal(model.dataMaxYear, '2026');
    assert.deepEqual(model.timelineData[0], { year: '1985', count: 0 });
    assert.deepEqual(model.timelineData.at(-1), { year: '2027', count: 0 });
    assert.deepEqual(
      model.timelineData.find(({ year }) => year === '1986'),
      { year: '1986', count: 2 },
    );
    assert.deepEqual(
      model.timelineData.find(({ year }) => year === '2026'),
      { year: '2026', count: 1 },
    );
  });

  it('returns no range or bars when no valid years exist', () => {
    assert.deepEqual(buildTimelineModel([{ year: '' }, { year: null }]), {
      timelineData: [],
      dataMinYear: null,
      dataMaxYear: null,
    });
  });
});
