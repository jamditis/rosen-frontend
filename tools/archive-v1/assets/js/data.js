import {
  CSV_URL,
  LOCAL_DATASET,
  DISPLAY_FIELDS,
  ARRAY_FIELDS,
  INTEGER_FIELDS,
  FLOAT_FIELDS,
  BOOLEAN_FIELDS,
  DATE_FIELDS
} from './config.js';

const parseArrayField = (value) =>
  value
    ? value
        .split(/[|,;]/)
        .map((item) => item.trim())
        .filter(Boolean)
    : [];

const normaliseRecord = (row) => {
  const record = {};

  DISPLAY_FIELDS.forEach((field) => {
    const value = row[field] ?? '';

    if (ARRAY_FIELDS.includes(field)) {
      record[field] = parseArrayField(value);
      return;
    }

    if (INTEGER_FIELDS.includes(field)) {
      const parsed = parseInt(value, 10);
      record[field] = Number.isNaN(parsed) ? null : parsed;
      return;
    }

    if (FLOAT_FIELDS.includes(field)) {
      const parsed = parseFloat(value);
      record[field] = Number.isNaN(parsed) ? null : parsed;
      return;
    }

    if (BOOLEAN_FIELDS.includes(field)) {
      const normalized = String(value).trim().toLowerCase();
      record[field] =
        !normalized
          ? ''
          : ['true', 'yes', '1', 'verified'].includes(normalized)
          ? true
          : ['false', 'no', '0'].includes(normalized)
          ? false
          : value.trim();
      return;
    }

    if (DATE_FIELDS.includes(field)) {
      record[field] = value ? new Date(value) : null;
      return;
    }

    record[field] = typeof value === 'string' ? value.trim() : value;
  });

  record._searchBlob = [
    record.title,
    record.summary,
    record.excerpt,
    record.pull_quote,
    record.author,
    record.original_publication,
    record.publisher,
    record.platform,
    record.scope,
    record.series,
    record.tags.join(' '),
    record.key_concepts.join(' '),
    record.thematic_categories.join(' '),
    record.responds_to.join(' '),
    record.related_to.join(' '),
    record.influence.join(' '),
    record.notes
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();

  return record;
};

const parseCsv = (url) =>
  new Promise((resolve, reject) => {
    Papa.parse(url, {
      download: true,
      header: true,
      skipEmptyLines: true,
      complete: ({ data }) => resolve(data),
      error: (error) => reject(error)
    });
  });

const prepareRecords = (rows) =>
  rows
    .filter((row) => row.title && row.url)
    .map(normaliseRecord);

export async function fetchArchiveData() {
  try {
    const remoteRows = await parseCsv(CSV_URL);
    const records = prepareRecords(remoteRows);

    if (records.length) {
      return records;
    }
    console.warn('[Archive] Remote CSV returned no records, falling back to local sample.');
  } catch (error) {
    console.warn('[Archive] Failed to load remote CSV, using fallback data.', error);
  }

  const fallbackRows = await parseCsv(LOCAL_DATASET);
  const fallbackRecords = prepareRecords(fallbackRows);
  return fallbackRecords;
}
