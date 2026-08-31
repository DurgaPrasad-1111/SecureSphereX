/**
 * A1.2 — evidence collection from a LIVE DOM (Role A, content-script context).
 *
 * The harness (`apps/harness/extract/`) produces D0.1 evidence OFFLINE, parsing
 * a static HTML string with parse5. This produces the SAME evidence ONLINE,
 * from a real DOM. The exit criterion is that the two AGREE on shared fields
 * (CP-3), and the mechanism that guarantees it is that the CLASSIFICATION logic
 * is not reimplemented here: `classifyField`, `isCredentialFieldHidden`,
 * `isAutocompleteDisabled`, `classifyMethod` and `SECRET_KINDS` are imported
 * from `packages/engine/field-classify.ts` — the identical functions the harness
 * calls. This file only ADAPTS a live `Element` into the primitive inputs those
 * functions take, exactly as `loginInterface.ts` adapts a parse5 node. Two
 * adapters, one classifier — the DEFECT-34 drift risk closed by construction.
 *
 * ── SCOPE OF THIS PASS (honest boundaries, not silent omissions) ──────────
 *  loginInterface  — FULLY collected here via the shared classifier.
 *  transport       — isHttps, from location.protocol.
 *  url             — the browser-NATIVE subset (scheme/host/path/…). PSL-derived
 *                    fields (registrableDomain, subdomainLabels) are
 *                    notCollected: PSL lives in `psl.ts` (harness, forbidden to
 *                    the extension), and duplicating `tldts` here would recreate
 *                    the DEFECT-34 config-drift risk. Sharing PSL is a scoped
 *                    follow-up (relocate psl.ts + psl-config.json).
 *  domainRepresentation — notCollected: its harness impl uses node:url's IDN
 *                    functions, absent in the browser; needs an abstracted IDN
 *                    primitive (follow-up).
 *  dns, redirect   — notCollected. DNS is not done in Phase I; redirect-chain
 *                    data comes from webNavigation events (A1.2 second phase),
 *                    not this DOM pass.
 *
 *  actionRegistrableDomain likewise stays null pending the PSL follow-up; the
 *  conformance test excludes it (and the PSL url fields) with that reason.
 */

import {
  present, absent, notCollected,
  type LoginInterfaceEvidence, type LoginFormObservation, type CredentialField,
  type TransportEvidence, type UrlEvidence, type LoginFingerprint,
  type ScriptRuntimeEvidence, type Observation,
} from '../../packages/contracts/evidence.contract.v1.ts';
import {
  classifyField, isCredentialFieldHidden, isAutocompleteDisabled, classifyMethod,
  SECRET_KINDS,
} from '../../packages/engine/field-classify.ts';

const nc = <T>(): Observation<T> => notCollected<T>('api_unavailable');

/* ── live DOM → shared-classifier adapters ────────────────────────────────
 * The mirror image of loginInterface.ts's parse5 adapters. A live Element
 * exposes exactly the primitives the shared classifier needs, more directly
 * than parse5 (getAttribute vs attrs.find; hasAttribute vs attrs.some). */

function classifyFieldEl(el: Element): ReturnType<typeof classifyField> {
  return classifyField({
    type: el.getAttribute('type'),
    name: el.getAttribute('name'),
    id: el.getAttribute('id'),
    autocomplete: el.getAttribute('autocomplete'),
  });
}

function isHiddenEl(el: Element): boolean {
  return isCredentialFieldHidden({
    type: el.getAttribute('type'),
    hiddenAttrPresent: el.hasAttribute('hidden'),
    ariaHidden: el.getAttribute('aria-hidden'),
    style: el.getAttribute('style'),
  });
}

/**
 * Predicate telling the collector whether a form was injected after load. In
 * the real content script this consults the MutationObserver tracker
 * (`createInjectionTracker` below); the harness has NO equivalent and hardcodes
 * `false` (DEFECT-31, FABRICATION_FORCED_BY_SHAPE) — so this is a field the
 * extension observes FOR REAL and the harness structurally cannot. It is a
 * genuine capability GAIN over offline extraction, not merely a different code
 * path. Excluded from CP-3 conformance precisely because only one side can
 * produce it.
 */
export type InjectionPredicate = (formEl: Element) => boolean;

const FIELD_SELECTOR = 'input, select, textarea';

function collectFieldsIn(root: ParentNode): CredentialField[] {
  const fields: CredentialField[] = [];
  // Avoid `instanceof Element`: that references the GLOBAL Element, which does
  // not exist under node/jsdom (jsdom's Element is window.Element). A tagName
  // check works identically in a real browser and in the jsdom conformance
  // test. Document has no tagName (undefined); a form Element has 'form'.
  const rootTag = (root as Partial<Element>).tagName?.toLowerCase();
  const formAutocomplete = rootTag === 'form' ? (root as Element).getAttribute('autocomplete') : null;
  for (const el of Array.from(root.querySelectorAll(FIELD_SELECTOR))) {
    const kind = classifyFieldEl(el);
    if (kind === null) continue;
    fields.push({
      kind,
      hidden: isHiddenEl(el),
      autocompleteDisabled: isAutocompleteDisabled(el.getAttribute('autocomplete'), formAutocomplete),
    });
  }
  return fields;
}

/**
 * Collect `loginInterface` evidence from a live DOM root.
 *
 * Structurally identical to `loginInterface.ts`: forms in document order, then
 * SURPLUS credential fields outside any `<form>` gathered into one synthetic
 * observation, then `credentialFormPresent` over SECRET_KINDS. Because both
 * paths run the SAME classifier over the SAME markup, the classification fields
 * are byte-identical — which the conformance test asserts.
 *
 * `root` is injectable (defaults to the global document) so the conformance
 * test can drive a jsdom document through this exact function.
 * `isInjected` defaults to "never" — matching the harness — so the shared
 * fields agree; a real content script passes the MutationObserver-backed one.
 */
export function collectLoginInterface(
  root: ParentNode,
  baseUrl: string | null,
  isInjected: InjectionPredicate = () => false,
): LoginInterfaceEvidence {
  const forms: LoginFormObservation[] = [];
  const formEls = Array.from(root.querySelectorAll('form'));

  for (const formEl of formEls) {
    forms.push({
      fields: collectFieldsIn(formEl),
      method: classifyMethod(formEl.getAttribute('method')),
      // actionUrl resolved to absolute against the page's base URL — the
      // IDENTICAL resolution loginInterface.ts performs (new URL(action ??
      // base, base).href). A raw getAttribute('action') would diverge from
      // the harness on every relative action; the conformance test caught
      // exactly that on its first run. In the content script baseUrl is
      // document.baseURI; the browser's own URL parser and node's are both
      // WHATWG, so the resolved href matches byte-for-byte.
      actionUrl: (() => {
        const raw = formEl.getAttribute('action');
        if (baseUrl === null) return null;
        try {
          return new URL(raw === null || raw.trim() === '' ? baseUrl : raw, baseUrl).href;
        } catch {
          return null;
        }
      })(),
      // actionRegistrableDomain still needs the gated PSL path (harness-only);
      // stays null pending the shared-PSL follow-up, and stays excluded from
      // conformance for that reason.
      actionRegistrableDomain: null,
      injectedAfterLoad: isInjected(formEl),
      injectingScriptOrigin: null,
    });
  }

  // Credential fields OUTSIDE any <form> — same rule as loginInterface.ts:
  // modern login pages post via fetch() with no form element, and a phishing
  // clone copying that must still count as a credential interface.
  const inFormFieldCount = forms.reduce((n, f) => n + f.fields.length, 0);
  const allFields = collectFieldsIn(root);
  if (allFields.length > inFormFieldCount) {
    forms.push({
      fields: allFields.slice(inFormFieldCount),
      method: 'OTHER',
      actionUrl: null,
      actionRegistrableDomain: null,
      injectedAfterLoad: false,
      injectingScriptOrigin: null,
    });
  }

  const credentialFormPresent = forms.some((f) => f.fields.some((x) => SECRET_KINDS.has(x.kind)));

  return {
    credentialFormPresent: present(credentialFormPresent),
    forms: present(forms),
    // Same as the harness: fingerprint needs assets this pass does not have.
    fingerprint: notCollected<LoginFingerprint>('api_unavailable'),
  };
}

/* ── transport ────────────────────────────────────────────────────────────
 * The one genuinely-derivable transport field from a content script: the
 * scheme. Certificate detail is PRODUCER_EXCLUSIVE to the harness and stays
 * notCollected, exactly as `stubs.ts` leaves it. */
export function collectTransport(protocol: string): TransportEvidence {
  const scheme = protocol.replace(/:$/, '').toLowerCase();
  return {
    isHttps: present(scheme === 'https'),
    certificateSubject: nc<string>(),
    subjectAlternativeNames: nc<readonly string[]>(),
    validFrom: nc<string>(), validTo: nc<string>(),
    issuer: nc<string>(), chainComplete: nc<boolean>(), chainTrusted: nc<boolean>(),
  };
}

/* ── url (browser-native subset) ──────────────────────────────────────────
 * Everything derivable from `new URL()` alone, present. PSL-derived fields
 * (registrableDomain, subdomainLabels) notCollected pending the shared-PSL
 * follow-up — notCollected, never absent (S-7): the extension COULD look, it
 * just does not yet have the gated PSL path the harness uses. */
export function collectUrl(href: string): UrlEvidence {
  let u: URL;
  try {
    u = new URL(href);
  } catch {
    const ncAll: UrlEvidence = {
      fullUrl: nc<string>(), scheme: nc<string>(), host: nc<string>(), port: nc<number>(),
      path: nc<string>(), queryPresent: nc<boolean>(), registrableDomain: nc<string>(),
      subdomainLabels: nc<readonly string[]>(), isIpLiteral: nc<boolean>(),
      totalLength: nc<number>(), percentEncodedSegmentCount: nc<number>(),
    };
    return ncAll;
  }
  const hostname = u.hostname.toLowerCase();
  const ipLiteral = /^\[.*\]$/.test(hostname)
    || (/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(hostname)?.slice(1).every((o) => Number(o) <= 255) ?? false);
  const explicitPort = (() => {
    const m = /:(\d+)$/.exec(href.split('?')[0]!.split('#')[0]!.replace(/^[a-z]+:\/\//i, ''));
    return m ? Number(m[1]) : null;
  })();
  return {
    fullUrl: present(href),
    scheme: present(u.protocol.replace(/:$/, '').toLowerCase()),
    host: present(hostname),
    port: explicitPort === null ? absent<number>() : present(explicitPort),
    path: present(u.pathname),
    queryPresent: present(u.search !== ''),
    // PSL follow-up — see file header. notCollected, not fabricated.
    registrableDomain: nc<string>(),
    subdomainLabels: nc<readonly string[]>(),
    isIpLiteral: present(ipLiteral),
    totalLength: present(href.length),
    percentEncodedSegmentCount: present(u.pathname.split('/').filter((s) => /%[0-9A-Fa-f]{2}/.test(s)).length),
  };
}

/* ── scriptRuntime (A1.4, javascript module input) ────────────────────────
 * The extension observes network activity via chrome.webRequest in the
 * service worker (Tier 1, the same class of observation capture.py performs
 * with page.on("request")). Those observations are passed in here and mapped
 * to ScriptRuntimeEvidence. Sorted + de-duplicated for S-6 determinism, the
 * same discipline capture.py and scriptRuntime.ts apply.
 *
 * ⚠️ TWO FIELDS STAY notCollected IN THE CONTENT-SCRIPT CONTEXT, and the
 * instruction's proposed mechanisms for them genuinely do not work here —
 * stated plainly rather than fabricated:
 *
 *   listenerOnCredentialField — a content script CANNOT enumerate a page's
 *     event listeners. `getEventListeners` is a DevTools-console-only binding,
 *     not exposed to content or page scripts. The only in-page way is
 *     monkey-patching addEventListener, which DEC-30 FORBIDS (a hostile page
 *     detects the patch and feeds false data — worse than absent). CDP from
 *     the service worker is the sanctioned path (capture.py Tier 3), not this
 *     content-script module. So: notCollected here, by constraint.
 *
 *   clientSideTransmissionObserved — establishing this passively would require
 *     reading the user's submitted credential to match it against an outgoing
 *     request body. §20.2/§20.3 forbid the extension from reading or storing
 *     credential material; the sentinel-nonce technique (DEC-35) works only
 *     because the TOOL supplies synthetic data it already knows — it does not
 *     transfer to a real user's real password. And "an off-site POST occurred"
 *     must NOT be inferred as transmission (DEC-29 Tier 4: analytics/beacons
 *     share the signature). So: notCollected here, by policy + DEC-29.
 *
 *   transmissionEndpointDomains — the PSL-derived field, notCollected pending
 *     the shared-PSL follow-up (same boundary A1.2 hit).
 */
export interface NetworkObservations {
  readonly transmissionEndpoints: readonly string[];
  readonly dynamicScriptOrigins: readonly string[];
}

export function collectScriptRuntime(obs: NetworkObservations): ScriptRuntimeEvidence {
  const endpoints = [...new Set(obs.transmissionEndpoints)].sort();
  const scriptOrigins = [...new Set(obs.dynamicScriptOrigins)].sort();
  return {
    transmissionEndpoints: present(endpoints),
    dynamicScriptOrigins: present(scriptOrigins),
    dynamicScriptLoadCount: present(scriptOrigins.length),

    // Blocked in the content-script context — see the header note above.
    listenerOnCredentialField: nc<boolean>(),
    clientSideTransmissionObserved: nc<boolean>(),
    transmissionEndpointDomains: nc<readonly string[]>(),
    credentialInterfaceInjected: nc<boolean>(),
  };
}

/* ── injection tracking (real browser only) ───────────────────────────────
 * A MutationObserver that records credential-bearing forms/fields inserted
 * AFTER initial load, so `collectLoginInterface`'s `injectedAfterLoad` reflects
 * reality — the field DEFECT-31 forced the harness to hardcode `false`. Not
 * exercised by the static conformance test (no mutations occur there); this is
 * the content-script wiring. */
export function createInjectionTracker(root: Node): { isInjected: InjectionPredicate; stop: () => void } {
  const injected = new WeakSet<Element>();
  const observer = new MutationObserver((records) => {
    for (const rec of records) {
      for (const node of Array.from(rec.addedNodes)) {
        // nodeType 1 === ELEMENT_NODE; avoids the global-`Element` pitfall.
        if (node.nodeType !== 1) continue;
        const el = node as Element;
        if (el.tagName.toLowerCase() === 'form') injected.add(el);
        for (const f of Array.from(el.querySelectorAll('form'))) injected.add(f);
      }
    }
  });
  observer.observe(root, { childList: true, subtree: true });
  return { isInjected: (el) => injected.has(el), stop: () => observer.disconnect() };
}
