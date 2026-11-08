/**
 * Refuse CSV writes while a source capture transaction is pending.
 *
 * Mirrors assert_no_pending_capture in backend/scripts/record_id_sequence.py.
 * A crashed PressThink or publisher-feed capture leaves a journal that rolls
 * the CSV forward only if the CSV still holds the recorded bytes. Any other
 * write in between makes recovery fail and blocks every RECORD-* writer.
 */
import fs from 'node:fs';
import path from 'node:path';

const CAPTURE_SOURCES = ['pressthink', 'publisher-feeds'];

export function pendingCaptureJournals(csvPath) {
  const preservation = path.join(path.dirname(path.dirname(path.resolve(csvPath))), 'preservation');
  return CAPTURE_SOURCES.map(name => path.join(preservation, name, 'versions.jsonl.pending.json'));
}

export function assertNoPendingCapture(csvPath) {
  if (pendingCaptureJournals(csvPath).some(journal => fs.existsSync(journal))) {
    throw new Error('Recover the pending source transaction before other CSV writes');
  }
}
