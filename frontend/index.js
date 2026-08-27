import { createRoot } from 'react-dom/client';
import { html } from './html.js?v=3.8.34';
import App from './App.js?v=3.8.34';
import { registerArchiveSiteTools } from './services/siteTools.js?v=3.8.34';
import { logWatchdog } from './utils/consoleWatchdog.js?v=3.8.34';
import { installTypewriterEgg } from './services/typewriterEgg.js?v=3.8.34';

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error("Could not find root element to mount to");
}

const root = createRoot(rootElement);
root.render(html`<${App} />`);

// Hidden extras (#754): the console watchdog barks once per load, and the
// typewriter waits for its sequence. Both are additive, silent, and wrapped so
// a failure here can never take down the app mounted above.
try {
  logWatchdog();
  installTypewriterEgg();
} catch {
  // An archive that loads matters more than an extra that does not.
}

// WebMCP is progressive enhancement. Supporting browsers receive structured,
// read-only archive tools. Every other browser continues with the same app.
registerArchiveSiteTools()
  .catch(error => console.warn('[site tools] registration failed:', error.message));

// Opt-in client-side performance instrumentation (#280). Off by default;
// enable with `localStorage.jrda_debug = '1'` in DevTools and reload (the #170
// toggle). Everything below is gated so production never loads web-vitals or
// registers an observer, and a CDN hiccup or storage-policy throw cannot break
// the app mounted above.
function perfDebugEnabled() {
  try {
    return typeof localStorage !== 'undefined' && localStorage.getItem('jrda_debug') === '1';
  } catch {
    return false;
  }
}

if (perfDebugEnabled()) {
  // Log the custom data-load measure emitted around fetchCoreData (App.js).
  // buffered:true replays the measure even if it lands before this registers.
  try {
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        // Only data:load lands here today; the prefix keeps any future data:*
        // measures in scope without re-touching this observer.
        if (entry.name.startsWith('data:')) {
          console.log(`[perf] ${entry.name}: ${Math.round(entry.duration)}ms`);
        }
      }
    }).observe({ type: 'measure', buffered: true });
  } catch (err) {
    console.warn('[perf] measure observer unavailable:', err);
  }

  // Core Web Vitals (LCP/INP/CLS), console-only -- no analytics SDK. Dynamic
  // import so the ~1.5 KB module is fetched only when the flag is on.
  import('https://esm.sh/web-vitals@4.2.4')
    .then(({ onLCP, onINP, onCLS }) => {
      onLCP((m) => console.log('[perf] LCP:', Math.round(m.value)));
      onINP((m) => console.log('[perf] INP:', Math.round(m.value)));
      onCLS((m) => console.log('[perf] CLS:', Number(m.value.toFixed(4))));
    })
    .catch((err) => console.warn('[perf] web-vitals failed to load:', err));
}
