/**
 * `loginInterface` category extraction: renderedDom -> LoginInterfaceEvidence.
 *
 * The highest-leverage category in the extractor and the one with the most
 * caveats attached. `credentialFormPresent` gates SIX of eleven rules —
 * CRED-01, CRED-02, CRED-03, CRED-04, CRED-06 and CRED-07 — which is every
 * rule DEC-26 identifies as fully corpus-validatable.
 *
 * Parsing is `parse5`, chosen in DEC-27 for browser semantics: it implements
 * the HTML5 tree-construction algorithm including error recovery and implied
 * tag insertion, so malformed markup parses the way Chromium parsed it. That
 * matters here specifically because `raw.renderedDom` is a POST-RENDER
 * Playwright serialisation of what Chromium actually built, and phishing pages
 * are disproportionately malformed.
 *
 * ────────────────────────────────────────────────────────────────────────
 * THREE KNOWN LIMITATIONS, each logged as a defect. None is hidden behind a
 * plausible-looking value.
 *
 *   DEFECT-31  `injectedAfterLoad` / `injectingScriptOrigin` are FABRICATED.
 *              They are plain non-`Observation` fields inside an array
 *              element, so there is no position at which to say
 *              `notCollected`. A static extractor cannot observe a runtime
 *              fact. Emitted as `false`/`null` per that defect's option 3;
 *              their only consumer, CRED-A1, is DEC-14 non-functional.
 *
 *   DEFECT-31  `hidden` is MARKUP-ONLY. Stylesheet- and class-based
 *              concealment is invisible because `renderedDom` carries markup,
 *              not computed style. Under-reports only, never over-reports —
 *              STATIC_EXTRACTION_RECALL_FLOOR. Feeds CRED-07.
 *
 *   DEFECT-32  `kind` is HEURISTIC and its error is BIDIRECTIONAL. Over-
 *              classification inflates `credentialFormPresent`; under-
 *              classification deflates it. Unlike the two above this yields
 *              no publishable bound, and requires empirical validation
 *              against hand-labelled ground truth before any CP-2 figure
 *              downstream of it is trusted.
 * ────────────────────────────────────────────────────────────────────────
 *
 * DETERMINISM (S-6). Forms are emitted in DOCUMENT ORDER and fields in
 * document order within each form — both stable properties of the parse tree,
 * not of a hash map. Nothing here iterates `Object.keys` of captured data or
 * collects through a Set whose order depends on input order.
 */

import { parse } from 'parse5';
import type { DefaultTreeAdapterMap } from 'parse5';
import { registrableDomainOf } from '../../../packages/engine/psl.ts';
import {
  present, notCollected,
  type LoginInterfaceEvidence, type LoginFormObservation,
  type CredentialField, type CredentialFieldKind, type FormMethod,
  type LoginFingerprint, type Observation,
} from '../../../packages/contracts/evidence.contract.v1.ts';
// A1.2: the classification logic is SHARED with the extension via
// packages/engine/field-classify.ts — neither producer carries a copy (DEFECT-34).
// This file adapts parse5 elements to the primitive inputs those functions
// take; the extension adapts a live DOM to the same inputs.
import {
  classifyField, isCredentialFieldHidden, isAutocompleteDisabled, classifyMethod,
  SECRET_KINDS,
} from '../../../packages/engine/field-classify.ts';

type Node = DefaultTreeAdapterMap['node'];
type Element = DefaultTreeAdapterMap['element'];

export function unobservedLoginInterface(): LoginInterfaceEvidence {
  const nc = <T>(): Observation<T> => notCollected<T>('api_unavailable');
  return {
    credentialFormPresent: nc<boolean>(),
    forms: nc<readonly LoginFormObservation[]>(),
    fingerprint: nc<LoginFingerprint>(),
  };
}

/* ── parse5 tree helpers ──────────────────────────────────────────────── */

function isElement(n: Node): n is Element {
  return 'tagName' in n;
}

/** Depth-first, DOCUMENT ORDER — the ordering S-6 relies on. */
function* walk(node: Node): Generator<Element> {
  const kids = 'childNodes' in node ? node.childNodes : [];
  for (const child of kids) {
    if (isElement(child)) yield child;
    yield* walk(child);
  }
}

function attr(el: Element, name: string): string | null {
  const a = el.attrs.find((x) => x.name === name.toLowerCase());
  return a === undefined ? null : a.value;
}

/* ── parse5 → shared-classifier adapters (A1.2) ───────────────────────────
 * These read a parse5 element into the primitive shapes the SHARED
 * classification core (packages/engine/field-classify.ts) expects, then delegate.
 * The classification logic itself lives there, not here — the extension's
 * live-DOM collector delegates to the very same functions. See DEFECT-32 for
 * why `classifyField`'s error is bidirectional; that reasoning moved with the
 * logic and is unchanged. */

function classifyFieldEl(el: Element): CredentialFieldKind | null {
  return classifyField({
    type: attr(el, 'type'),
    name: attr(el, 'name'),
    id: attr(el, 'id'),
    autocomplete: attr(el, 'autocomplete'),
  });
}

function isHiddenEl(el: Element): boolean {
  return isCredentialFieldHidden({
    type: attr(el, 'type'),
    hiddenAttrPresent: el.attrs.some((a) => a.name === 'hidden'),
    ariaHidden: attr(el, 'aria-hidden'),
    style: attr(el, 'style'),
  });
}

function isAutocompleteDisabledEl(el: Element, formAutocomplete: string | null): boolean {
  return isAutocompleteDisabled(attr(el, 'autocomplete'), formAutocomplete);
}

function methodOf(el: Element): FormMethod {
  return classifyMethod(attr(el, 'method'));
}

function extractForm(formEl: Element, pageUrl: string | null): LoginFormObservation {
  const formAutocomplete = attr(formEl, 'autocomplete');

  const fields: CredentialField[] = [];
  for (const el of walk(formEl)) {
    const tag = el.tagName.toLowerCase();
    if (tag !== 'input' && tag !== 'select' && tag !== 'textarea') continue;
    const kind = classifyFieldEl(el);
    if (kind === null) continue;
    fields.push({
      kind,
      hidden: isHiddenEl(el),
      autocompleteDisabled: isAutocompleteDisabledEl(el, formAutocomplete),
    });
  }

  // An absent or empty `action` submits to the page's own URL — that is the
  // HTML default, and treating it as null would make a self-posting form look
  // like it had no destination, which CRED-01 reads as same-site vs not.
  const rawAction = attr(formEl, 'action');
  let actionUrl: string | null = null;
  if (pageUrl !== null) {
    try {
      actionUrl = new URL(rawAction === null || rawAction.trim() === '' ? pageUrl : rawAction, pageUrl).href;
    } catch {
      actionUrl = null;
    }
  }

  // PSL resolution through the V-15-gated tldts path — the same resolver
  // url.ts uses, so `actionRegistrableDomain` and `url.registrableDomain`
  // cannot disagree about the same host. CRED-01 compares exactly these two.
  const actionRegistrableDomain =
    actionUrl === null ? null : registrableDomainOf(actionUrl);

  return {
    fields,
    method: methodOf(formEl),
    actionUrl,
    actionRegistrableDomain,

    // DEFECT-31 — FABRICATED. A static extractor cannot observe whether the
    // form appeared after `load` fired, and the contract offers no position
    // to say `notCollected` for a plain boolean inside an array element.
    // `false` is emitted per that defect's option 3, with the limitation
    // recorded out-of-band via extractorVersion rather than implied here.
    injectedAfterLoad: false,
    injectingScriptOrigin: null,
  };
}

export function extractLoginInterface(
  renderedDom: string | null,
  pageUrl: string | null,
): LoginInterfaceEvidence {
  // No DOM is a genuine capability gap, not an absence of forms: ~24% of the
  // corpus (every fetch that did not reach a response) has renderedDom null.
  // `present(false)` here would assert "we looked and there was no credential
  // form", which is exactly I-2's clean-bill-of-health conflation.
  if (renderedDom === null || renderedDom.trim() === '') return unobservedLoginInterface();

  const doc = parse(renderedDom);

  const forms: LoginFormObservation[] = [];
  for (const el of walk(doc)) {
    if (el.tagName.toLowerCase() !== 'form') continue;
    forms.push(extractForm(el, pageUrl));
  }

  // Credential fields OUTSIDE any <form> still constitute a credential
  // interface. Modern login pages frequently post via fetch() with no form
  // element at all, and treating those as "no credential form" would miss a
  // large and growing class of real login pages — including phishing kits
  // that copy them. Collected into one synthetic observation so
  // credentialFormPresent reflects the page, not the markup style.
  const inFormFieldCount = forms.reduce((n, f) => n + f.fields.length, 0);
  const allCredentialFields: CredentialField[] = [];
  for (const el of walk(doc)) {
    const tag = el.tagName.toLowerCase();
    if (tag !== 'input' && tag !== 'select' && tag !== 'textarea') continue;
    const kind = classifyFieldEl(el);
    if (kind === null) continue;
    allCredentialFields.push({
      kind, hidden: isHiddenEl(el), autocompleteDisabled: isAutocompleteDisabledEl(el, null),
    });
  }

  if (allCredentialFields.length > inFormFieldCount) {
    // Only the surplus — fields already counted inside a <form> are not
    // duplicated here. Document order is preserved by construction.
    const orphans = allCredentialFields.slice(inFormFieldCount);
    forms.push({
      fields: orphans,
      method: 'OTHER',        // no form element, so no declared method
      actionUrl: null,        // and no declared action
      actionRegistrableDomain: null,
      injectedAfterLoad: false,
      injectingScriptOrigin: null,
    });
  }

  // ── credentialFormPresent — SECRET-BEARING FIELDS ONLY ─────────────────
  //
  // Architecture Owner ruling, 2026-08-29 (DEFECT-32 option 2): a form counts
  // as a credential interface only if it asks for a SECRET — password, OTP or
  // PIN. An `email`- or `username`-only form does not.
  //
  // WHY, and why the earlier reading was defensible but wrong: the contract
  // lists `email` and `username` in `CredentialFieldKind`, so classifying an
  // `<input type="email">` as an email credential FIELD is correct and is
  // unchanged — `forms[].fields` still records them, and CRED-01/CRED-07 still
  // see them. What changed is the PAGE-LEVEL question this boolean answers:
  // "is this a credential interface?" A newsletter signup asks for an email
  // address and no secret. It is not a login page.
  //
  // Measured impact when this ruling was made: 24 of 107 positives across the
  // 617-snapshot store (22%) were email- or username-only, and the bias was
  // nearly TWICE as concentrated in the benign class (36% of benign positives
  // vs 19% of phishing) — inflating exactly the negative class that
  // CRED-01/03/06/07 are measured against.
  //
  // This does NOT close DEFECT-32. It removes the largest measured instance of
  // the over-classification arm. The under-classification arm — genuine
  // credential fields the tier-3 name/id patterns miss — is untouched and
  // still unmeasured, and tier-3 can still over-classify within the secret
  // kinds (a field named `pin` that is a postal PIN, say).
  // SECRET_KINDS is imported from the shared field-classify.ts so both producers
  // apply the identical page-level "is this a credential interface?" test.
  const credentialFormPresent = forms.some((f) => f.fields.some((x) => SECRET_KINDS.has(x.kind)));

  return {
    credentialFormPresent: present(credentialFormPresent),
    forms: present(forms),

    // NOT BUILT, and it does not block anything. `loginForm.ts:16-18` states
    // that `fingerprint` "is entirely the ACEM's concern and is ignored here",
    // and the module gates only on credentialFormPresent and forms — so this
    // staying notCollected leaves all six CRED rules evaluable. It needs
    // faviconHash and heroImagePerceptualHash, which require assets
    // `raw.screenshotRef` does not carry (0/100 non-null).
    fingerprint: notCollected<LoginFingerprint>('api_unavailable'),
  };
}
