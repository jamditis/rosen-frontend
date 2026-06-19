/**
 * Prev/next navigation flags for the record modal (#421).
 *
 * The modal's prev/next buttons derive from the record's position in the
 * filtered list. A deep link (?record=ID) opens the modal by looking the id up
 * in the full records set, so a filtered-out record can still be open -- and
 * then its index in `filteredRecords` is -1. The old inline derivation computed
 * `hasNext = index < filteredRecords.length - 1`, which is true for index === -1
 * whenever the list is non-empty: the Next button rendered enabled but
 * handleModalNav no-ops on index === -1, so it looked clickable and did nothing.
 *
 * A record outside the filtered list has no neighbours in that list, so both
 * flags are false. Guarding hasNext with `index >= 0` makes the button state
 * honest (disabled) instead of inert.
 */

/**
 * Derive the modal's position and prev/next availability.
 * @param {Array} filteredRecords - the currently filtered record list
 * @param {string|null} selectedRecordId - the open record's id
 * @returns {{index: number, total: number, hasPrev: boolean, hasNext: boolean}}
 */
export function deriveNavFlags(filteredRecords, selectedRecordId) {
  const list = Array.isArray(filteredRecords) ? filteredRecords : [];
  const index = list.findIndex(r => r.id === selectedRecordId);
  return {
    index,
    total: list.length,
    hasPrev: index > 0,
    hasNext: index >= 0 && index < list.length - 1,
  };
}

export default { deriveNavFlags };
