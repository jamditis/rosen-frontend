export function buildTimelineModel(records = []) {
  const counts = new Map();
  let dataMinYear = null;
  let dataMaxYear = null;

  for (const record of Array.isArray(records) ? records : []) {
    const year = Number.parseInt(record?.year, 10);
    if (!Number.isFinite(year)) continue;

    const key = String(year);
    counts.set(key, (counts.get(key) || 0) + 1);
    dataMinYear = dataMinYear === null ? year : Math.min(dataMinYear, year);
    dataMaxYear = dataMaxYear === null ? year : Math.max(dataMaxYear, year);
  }

  if (dataMinYear === null || dataMaxYear === null) {
    return {
      timelineData: [],
      dataMinYear: null,
      dataMaxYear: null,
    };
  }

  const timelineData = [];
  for (let year = dataMinYear - 1; year <= dataMaxYear + 1; year += 1) {
    const key = String(year);
    timelineData.push({ year: key, count: counts.get(key) || 0 });
  }

  return {
    timelineData,
    dataMinYear: String(dataMinYear),
    dataMaxYear: String(dataMaxYear),
  };
}
