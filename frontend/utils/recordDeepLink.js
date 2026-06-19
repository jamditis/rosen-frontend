// Pure helpers for the ?record=ID deep link, split out of the window-bound
// navigation code so they can be unit-tested without a browser (#422).
//
// router.js imports viewState.js with a ?v= suffix that Node's test loader can't
// resolve, so the suite can't import router.js directly. Keeping these two pure
// functions here — with no ?v= imports of their own — lets the behavioural tests
// import them by bare relative path while the browser code imports them with the
// usual ?v= cache-busting suffix. Both router.js (getRecordIdFromUrl, navigateTo)
// and App.js (the URL-sync effect) delegate here, so there is a single
// definition of the read and the set/delete rule rather than three copies.

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

export default { parseRecordId, setRecordParam };
