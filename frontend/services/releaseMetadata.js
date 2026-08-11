const SEMVER = /^\d+\.\d+\.\d+$/;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

const isRealIsoDate = (value) => {
  if (!ISO_DATE.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
};

export function normalizeReleaseMetadata(value) {
  if (!value || typeof value !== 'object') return null;
  const version = typeof value.version === 'string' ? value.version.trim() : '';
  const updated = typeof value.updated === 'string' ? value.updated.trim() : '';
  if (!SEMVER.test(version) || !isRealIsoDate(updated)) return null;
  return { version, updated };
}

export function formatReleaseDate(value) {
  if (typeof value !== 'string' || !isRealIsoDate(value)) return '';
  const date = new Date(`${value}T00:00:00.000Z`);
  return new Intl.DateTimeFormat('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(date);
}

export function createReleaseMetadataLoader({
  fetchImpl = globalThis.fetch,
  url = './version.json',
  now = Date.now,
} = {}) {
  let pending = null;

  return () => {
    if (pending) return pending;
    const separator = url.includes('?') ? '&' : '?';
    const requestUrl = `${url}${separator}t=${now()}`;
    const current = (async () => {
      const response = await fetchImpl(requestUrl, { cache: 'no-store' });
      if (!response?.ok) {
        throw new Error(`release metadata request failed: HTTP ${response?.status ?? 'unknown'}`);
      }
      const metadata = normalizeReleaseMetadata(await response.json());
      if (!metadata) throw new Error('release metadata response is invalid');
      return metadata;
    })();

    pending = current;
    current.catch(() => {
      if (pending === current) pending = null;
    });
    return current;
  };
}

export const loadReleaseMetadata = createReleaseMetadataLoader();
