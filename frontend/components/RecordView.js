import { html } from '../html.js?v=3.8.28';
import RecordModal from './RecordModal.js?v=3.8.28';
import { deriveNavFlags } from '../utils/modalNav.js?v=3.8.28';

/**
 * Single owner for "render the selected record."
 *
 * App.js used to carry two byte-identical <RecordModal> call sites on separate
 * routes, each with the same 13-prop spread and the same inline derivations
 * (which record is selected,
 * its index in the filtered list, and the resulting prev/next nav flags).
 * RecordView holds that knowledge in one place, so adding or changing a modal
 * prop is a one-site edit instead of a two-site edit that can drift.
 *
 * It takes the raw inputs (all records, the filtered subset, the selected id,
 * and App's handlers) and derives the record + nav flags itself. Behaviour is
 * identical to the two call sites it replaces. Part of #134 (Step B).
 */
export default function RecordView({
  records,
  filteredRecords,
  selectedRecordId,
  onClose,
  onNext,
  onPrev,
  onSelectRecord,
  onSelectEntity,
  onFilterCategory,
  onFilterSearch,
  onReportProblem,
  nestedDialogOpen,
}) {
  const record = records.find(r => r.id === selectedRecordId) || null;
  const { index, total, hasPrev, hasNext } = deriveNavFlags(filteredRecords, selectedRecordId);
  // isOpen tracks the selected id, not !!record. A deep link to an id with no
  // matching record (?record=BADID) still counts as "open" — RecordModal then
  // returns null because record is null (RecordModal.js: `if (!isOpen ||
  // !record) return null`). Deriving this from !!record would change that
  // deep-link behaviour, and no test covers the id-set-but-record-missing
  // state, so the regression would pass CI silently.
  const isOpen = !!selectedRecordId;

  return html`
    <${RecordModal}
      record=${record}
      allRecords=${records}
      isOpen=${isOpen}
      onClose=${onClose}
      onNext=${onNext}
      onPrev=${onPrev}
      onSelectRecord=${onSelectRecord}
      onSelectEntity=${onSelectEntity}
      onFilterCategory=${onFilterCategory}
      onFilterSearch=${onFilterSearch}
      onReportProblem=${onReportProblem}
      nestedDialogOpen=${nestedDialogOpen}
      hasPrev=${hasPrev}
      hasNext=${hasNext}
      currentIndex=${index}
      total=${total}
    />
  `;
}
