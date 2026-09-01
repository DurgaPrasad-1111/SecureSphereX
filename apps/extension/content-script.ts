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
  collectDomainRepresentation, createInjectionTracker,
} from './collect-evidence.ts';
import { classifyField, SECRET_KINDS } from '../../packages/engine/field-classify.ts';
import type { CredentialFieldKind } from '../../packages/contracts/evidence.contract.v1.ts';

// Start observing for injected credential forms immediately, before the page
// finishes building, so anything added after now is seen as injected.
const tracker = createInjectionTracker(document);

/** §20.5 conjunct 4 — session-scoped storage or cookie state. Content-script-
 *  observable proxy: any (non-httpOnly) cookie, or any session/local storage
 *  entry, for this origin. Known limit: httpOnly session cookies are invisible
 *  to JS, so this UNDER-reports — the restrictive direction §20.5 wants. */
function sessionStateEstablished(): boolean {
  try {
    if (document.cookie !== '') return true;
    if (window.sessionStorage.length > 0) return true;
    if (window.localStorage.length > 0) return true;
  } catch { /* storage access can throw in some contexts — treat as not established */ }
  return false;
}

/** document.title -> lowercased alphanumeric tokens, for the fingerprint. */
function titleTokens(): string[] {
  return document.title.toLowerCase().split(/[^a-z0-9]+/).filter((t) => t !== '');
}

/** Ordered credential-field kinds of one form, via the SHARED classifier. */
function formFieldComposition(form: Element): CredentialFieldKind[] {
  const kinds: CredentialFieldKind[] = [];
  for (const el of Array.from(form.querySelectorAll('input, select, textarea'))) {
    const kind = classifyField({
      type: el.getAttribute('type'), name: el.getAttribute('name'),
      id: el.getAttribute('id'), autocomplete: el.getAttribute('autocomplete'),
    });
    if (kind !== null) kinds.push(kind);
  }
  return kinds;
}

/**
 * §20.5 conjunct 1 — credential submission. Attach a submit listener to every
 * form that carries a SECRET-bearing field (the same page-level definition
 * `credentialFormPresent` uses). On submit, tell the service worker; it holds
 * the pending auth and correlates the following navigation/landing. This
 * OBSERVES the submit only — it never reads or transmits the entered value
 * (§20.2/§20.3): only the field COMPOSITION and the page title travel.
 */
function armCredentialSubmitListeners(): void {
  for (const form of Array.from(document.querySelectorAll('form'))) {
    const composition = formFieldComposition(form);
    if (!composition.some((k) => SECRET_KINDS.has(k))) continue;
    form.addEventListener('submit', () => {
      chrome.runtime.sendMessage({
        type: 'ssx-cred-submit',
        origin: location.origin,
        fieldComposition: composition,
        titleTokens: titleTokens(),
      });
    }, { capture: true });
  }
}

function collectAndSend(): void {
  const parts = {
    url: collectUrl(location.href),
    domainRepresentation: collectDomainRepresentation(location.href),
    transport: collectTransport(location.protocol),
    loginInterface: collectLoginInterface(document, document.baseURI, tracker.isInjected),
    // Network observations come from the SW's webRequest side; the content
    // script contributes none, so this pass reports the observable subset as
    // empty. (Wiring SW-observed endpoints into here is a later step.)
    scriptRuntime: collectScriptRuntime({ transmissionEndpoints: [], dynamicScriptOrigins: [] }),
  };
  chrome.runtime.sendMessage({
    type: 'ssx-evidence',
    targetUrl: location.href,
    parts,
    // §20.5 conjunct 4, observed on THIS (possibly landing) page.
    sessionStateEstablished: sessionStateEstablished(),
  });
  armCredentialSubmitListeners();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => setTimeout(collectAndSend, 500));
} else {
  setTimeout(collectAndSend, 500);
}
