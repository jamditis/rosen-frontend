// The console watchdog (#754): one small dog, printed once per page load, for
// anyone who opens developer tools. It is silent, additive, and self-contained
// — no local imports — so the Node suite can import it by bare path.

export const WATCHDOG_MESSAGE = 'woof. the press is a public trust.';

export const WATCHDOG_ART = [
  '     __      _',
  "    o'')}____//",
  '     `_/      )',
  '     (_(_/-(_/',
].join('\n');

const WATCHDOG_STYLE = 'color: #78716c; font-family: "Roboto Mono", monospace; line-height: 1.2;';

// Module state, not page state: the dog barks once per load, however many
// times a caller asks.
let alreadyLogged = false;

/**
 * Print the watchdog once. Returns true on the printing call and false on
 * every later call, so a second import or a re-render cannot repeat it.
 */
export function logWatchdog(target = typeof console === 'undefined' ? null : console) {
  if (alreadyLogged) return false;
  if (!target || typeof target.log !== 'function') return false;

  alreadyLogged = true;
  target.log(`%c${WATCHDOG_ART}\n${WATCHDOG_MESSAGE}`, WATCHDOG_STYLE);
  return true;
}

export default { logWatchdog, WATCHDOG_ART, WATCHDOG_MESSAGE };
