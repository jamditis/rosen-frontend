// The typewriter (#754): type the site's name outside a form field and the
// page wears a typewriter face for a few seconds, then puts it back.
//
// The treatment is a font change, not an animation, so a visitor who asks for
// reduced motion sees the same thing everyone else does with nothing moving.
// Escape ends it early, and the timer ends it on its own, so nobody can get
// stuck in it. The trigger logic lives in utils/easterEggs.js and is unit
// tested there; this module only wires it to the document.

import {
  TYPEWRITER_DURATION_MS,
  TYPEWRITER_SEQUENCE,
  createSequenceMatcher,
  isTypingTarget,
} from '../utils/easterEggs.js?v=3.8.33';

export const TYPEWRITER_CLASS = 'archive-typewriter-egg';

/**
 * Listen for the sequence and apply the treatment when it lands.
 * Returns a teardown function that removes the listener and the class.
 */
export function installTypewriterEgg({
  doc = typeof document === 'undefined' ? null : document,
  sequence = TYPEWRITER_SEQUENCE,
  durationMs = TYPEWRITER_DURATION_MS,
} = {}) {
  if (!doc || typeof doc.addEventListener !== 'function') return () => {};

  const matcher = createSequenceMatcher(sequence);
  let timer = null;

  const stop = () => {
    if (timer !== null) {
      clearTimeout(timer);
      timer = null;
    }
    doc.body?.classList.remove(TYPEWRITER_CLASS);
  };

  const start = () => {
    if (!doc.body) return;
    if (timer !== null) clearTimeout(timer);
    doc.body.classList.add(TYPEWRITER_CLASS);
    timer = setTimeout(stop, durationMs);
  };

  const handleKeydown = (event) => {
    if (event.metaKey || event.ctrlKey || event.altKey) return;
    if (isTypingTarget(event.target)) return;
    if (event.key === 'Escape') {
      matcher.reset();
      stop();
      return;
    }
    if (typeof event.key !== 'string' || event.key.length !== 1) return;
    if (matcher.push(event.key)) start();
  };

  doc.addEventListener('keydown', handleKeydown);

  return () => {
    doc.removeEventListener('keydown', handleKeydown);
    stop();
  };
}

export default { installTypewriterEgg, TYPEWRITER_CLASS };
