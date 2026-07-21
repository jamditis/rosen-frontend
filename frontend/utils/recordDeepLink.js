// Pure helpers for the ?record=ID deep link, split out of the window-bound
// navigation code so they can be unit-tested without a browser (#422).
//
// router.js imports viewState.js with a ?v= suffix that Node's test loader can't
// resolve, so the suite can't import router.js directly. Keeping these two pure
// functions here — with no ?v= imports of their own — lets the behavioural tests
// import them by bare relative path while the browser code imports them with the
// usual ?v= cache-busting suffix. Browser call sites delegate here, so there is
// one definition of the read, write, canonical-link, and share-target rules.

// Read the record id from a URL query string ('?record=ID', 'record=ID', or a
// full search with other params). Returns the id, or null when the param is
// absent or present-but-empty — an empty id must not open a modal or pin a
// phantom selection. Tolerates undefined/null search (URLSearchParams coerces
// the empty string).
export function parseRecordId(search) {
  const params = new URLSearchParams(search || '');
  return params.get('record') || null;
}

// Set or clear ?record= on a URLSearchParams: a truthy id sets it, any falsy id
// (null on deselect, undefined, '') deletes it. Returns the same params object so
// callers can chain. This is the single source of the write-effect branch that
// the mount-time deep-link race used to get wrong.
export function setRecordParam(searchParams, recordId) {
  if (recordId) {
    searchParams.set('record', recordId);
  } else {
    searchParams.delete('record');
  }
  return searchParams;
}

// Build the one shareable record URL used by every archive surface. Desktop
// windows intentionally resolve to the standard archive record URL so the
// optional shell never creates a second incompatible citation/share format.
export function canonicalRecordUrl(locationHref, recordId) {
  if (typeof locationHref !== 'string' || locationHref === '') {
    throw new TypeError('canonicalRecordUrl requires a location URL');
  }
  if (typeof recordId !== 'string' || recordId === '') {
    throw new TypeError('canonicalRecordUrl requires a record id');
  }

  const url = new URL(locationHref);
  url.search = '';
  url.hash = '';
  setRecordParam(url.searchParams, recordId);
  return url.toString();
}

// Article-like records use the generated archive metadata route. Social posts
// use their original public URL so the platform's own record-specific preview
// is available without generating tens of thousands of extra FTP files.
export function shareRecordUrl(locationHref, record) {
  if (!record || typeof record.id !== 'string' || record.id === '') {
    throw new TypeError('shareRecordUrl requires a record with an id');
  }

  if (record.type === 'social' && typeof record.url === 'string') {
    try {
      const sourceUrl = new URL(record.url);
      if (sourceUrl.protocol === 'http:' || sourceUrl.protocol === 'https:') {
        return sourceUrl.toString();
      }
    } catch {
      // Fall through to the safe archive URL.
    }
  }

  return canonicalRecordUrl(locationHref, record.id);
}

export default { canonicalRecordUrl, parseRecordId, setRecordParam, shareRecordUrl };
