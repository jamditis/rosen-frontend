// Allowlisted bridge from the static participation page into the existing
// in-archive report modal. It removes only parameters this bridge owns so Back
// returns to the static page and unrelated archive state survives.

export const readReportDeepLink = (href) => {
  const url = new URL(href);
  const report = url.searchParams.get('report');
  const source = url.searchParams.get('source');
  if (source !== 'participate' || (report !== 'record' && report !== 'problem')) {
    return { intent: null, cleanHref: href };
  }
  url.searchParams.delete('report');
  url.searchParams.delete('source');
  return { intent: report, cleanHref: url.toString() };
};
