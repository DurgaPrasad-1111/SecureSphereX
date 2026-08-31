/**
 * Content script — runs INSIDE the page, collects live-DOM evidence, sends it
 * to the service worker. The service worker cannot touch the DOM; only a
 * content script can. This is the browser-facing edge of Role A's evidence
 * collection.
 *
 * Starts the injection tracker as early as possible so injectedAfterLoad
 * (DEFECT-31 / CRED-A1's real signal) reflects forms added dynamically, then
 * collects on DOMContentLoaded + a short settle.
 */

import {
  collectLoginInterface, collectUrl, collectTransport, collectScriptRuntime,
  createInjectionTracker,
} from './collect-evidence.ts';

// Start observing for injected credential forms immediately, before the page
// finishes building, so anything added after now is seen as injected.
const tracker = createInjectionTracker(document);

function collectAndSend(): void {
  const parts = {
    url: collectUrl(location.href),
    transport: collectTransport(location.protocol),
    loginInterface: collectLoginInterface(document, document.baseURI, tracker.isInjected),
    // Network observations come from the SW's webRequest side; the content
    // script contributes none, so this pass reports the observable subset as
    // empty. (Wiring SW-observed endpoints into here is a later step.)
    scriptRuntime: collectScriptRuntime({ transmissionEndpoints: [], dynamicScriptOrigins: [] }),
  };
  chrome.runtime.sendMessage({ type: 'ssx-evidence', targetUrl: location.href, parts });
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => setTimeout(collectAndSend, 500));
} else {
  setTimeout(collectAndSend, 500);
}
