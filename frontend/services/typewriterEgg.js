// The typewriter (#754): type the site's name outside a form field and the
// page wears a typewriter face for a while, then puts it back.
//
// The treatment is a font change, not an animation, so a visitor who asks for
// reduced motion sees the same thing everyone else does with nothing moving.
//
// Putting the font back reflows the page. A reflow that a visitor did not ask
// for counts against the page's layout-shift score, while one that follows a
// key or a click does not. So the timer here does not revert anything. It only
// marks the treatment as spent, and the next key or pointer press takes it
// off. Escape ends it at once from anywhere, including a form field, so nobody
// can be stuck in it. The trigger logic lives in utils/easterEggs.js and is
// unit tested there; this module only wires it to the document.

import {
  TYPEWRITER_DURATION_MS,
  TYPEWRITER_SEQUENCE,
  createSequenceMatcher,
  isTypingTarget,
} from '../utils/easterEggs.js?v=3.8.35';

export const TYPEWRITER_CLASS = 'archive-typewriter-egg';

/**
 * Listen for the sequence and apply the treatment when it lands.
 * Returns a teardown function that removes the listeners and the class.
 */
export function installTypewriterEgg({
  doc = typeof document === 'undefined' ? null : document,
  sequence = TYPEWRITER_SEQUENCE,
  durationMs = TYPEWRITER_DURATION_MS,
} = {}) {
  if (!doc || typeof doc.addEventListener !== 'function') return () => {};

  const matcher = createSequenceMatcher(sequence);
  let timer = null;
  // True once the treatment has had its time and is waiting for the visitor to
  // press something before it comes off.
  let spent = false;

  const clearTimer = () => {
    if (timer !== null) {
      clearTimeout(timer);
      timer = null;
    }
  };

  const stop = () => {
    clearTimer();
    spent = false;
    doc.body?.classList.remove(TYPEWRITER_CLASS);
  };

  const start = () => {
    if (!doc.body) return;
    clearTimer();
    spent = false;
    doc.body.classList.add(TYPEWRITER_CLASS);
    timer = setTimeout(() => {
      timer = null;
      spent = true;
    }, durationMs);
  };

  const endIfSpent = () => {
    if (spent) stop();
  };

  const handleKeydown = (event) => {
    // Escape comes first, so it still works with the caret in the search box.
    if (event.key === 'Escape') {
      matcher.reset();
      stop();
      return;
    }
    endIfSpent();
    if (event.metaKey || event.ctrlKey || event.altKey) return;
    if (isTypingTarget(event.target)) return;
    if (typeof event.key !== 'string' || event.key.length !== 1) return;
    if (matcher.push(event.key)) start();
  };

  const handlePointerdown = () => {
    endIfSpent();
  };

  doc.addEventListener('keydown', handleKeydown);
  doc.addEventListener('pointerdown', handlePointerdown);

  return () => {
    doc.removeEventListener('keydown', handleKeydown);
    doc.removeEventListener('pointerdown', handlePointerdown);
    stop();
  };
}

export default { installTypewriterEgg, TYPEWRITER_CLASS };
