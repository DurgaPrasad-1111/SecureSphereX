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
import { registrableDomainOf } from './psl.ts';
import {
  present, notCollected,
  type LoginInterfaceEvidence, type LoginFormObservation,
  type CredentialField, type CredentialFieldKind, type FormMethod,
  type LoginFingerprint, type Observation,
} from '../../../packages/contracts/evidence.contract.v1.ts';

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

/* ── field classification (DEFECT-32) ─────────────────────────────────── */

/**
 * Classify one input as a credential field, or null if it is not one.
 *
 * ⚠️ HEURISTIC WITH BIDIRECTIONAL ERROR — see DEFECT-32. The precedence below
 * is deliberate: STRONGEST SIGNAL FIRST. `type` and `autocomplete` are
 * declared semantics the page author opted into; `name`/`id` matching is
 * guesswork over free text and is consulted only when nothing declarative
 * said anything.
 *
 * That ordering matters for the over-classification arm specifically: a search
 * box named `user_query` would match a naive `user` pattern, but only reaches
 * the name/id tier if it declared no useful `type` or `autocomplete` — which
 * most real search inputs do (`type="search"`, `role="search"`).
 *
 * `type="hidden"` is NOT excluded here. A hidden credential field is exactly
 * what CRED-07 exists to detect, so excluding it would defeat the rule. It is
 * classified normally and flagged via `hidden` below.
 */
function classifyField(el: Element): CredentialFieldKind | null {
  const type = (attr(el, 'type') ?? 'text').toLowerCase().trim();
  const autocomplete = (attr(el, 'autocomplete') ?? '').toLowerCase().trim();

  // Tier 1 — declared input type. Unambiguous.
  if (type === 'password') return 'password';
  if (type === 'email') return 'email';

  // Tier 2 — declared autocomplete token (WHATWG autofill field names).
  if (autocomplete === 'one-time-code') return 'otp';
  if (autocomplete === 'current-password' || autocomplete === 'new-password') return 'password';
  if (autocomplete === 'email') return 'email';
  if (autocomplete === 'username') return 'username';

  // Tier 3 — name/id guesswork. Only for text-like inputs, and only when
  // tiers 1 and 2 said nothing. This is the tier DEFECT-32 is about.
  if (type !== 'text' && type !== 'tel' && type !== 'number' && type !== 'hidden') return null;

  const hay = `${attr(el, 'name') ?? ''} ${attr(el, 'id') ?? ''}`.toLowerCase();
  if (hay.trim() === '') return null;

  // Order matters: `otp` before `pin` before `username`, because a field named
  // `otp_pin` is an OTP, and one named `pin_user` is a PIN.
  if (/\b(otp|2fa|mfa|one[-_]?time|verification[-_]?code|auth[-_]?code)\b/.test(hay)) return 'otp';
  if (/\bpin\b/.test(hay)) return 'pin';
  if (/\b(pass|passwd|password|pwd)\b/.test(hay)) return 'password';
  if (/\b(email|e[-_]?mail)\b/.test(hay)) return 'email';
  if (/\b(user|username|userid|user[-_]?name|login|loginid|account)\b/.test(hay)) return 'username';

  return null;
}

/**
 * Hidden — MARKUP-ONLY (DEFECT-31, STATIC_EXTRACTION_RECALL_FLOOR).
 *
 * Detects `type="hidden"`, the boolean `hidden` attribute, `aria-hidden`, and
 * inline styles that visually remove the field. CANNOT detect concealment via
 * a stylesheet rule or a CSS class, because `renderedDom` is serialised
 * markup and carries no computed style.
 *
 * The failure direction is one-way: everything detected here is genuinely
 * hidden, so this never over-reports. It under-reports, which biases CRED-07's
 * measured recall DOWNWARD — a floor, not a measurement.
 */
function isHidden(el: Element): boolean {
  if ((attr(el, 'type') ?? '').toLowerCase().trim() === 'hidden') return true;
  if (el.attrs.some((a) => a.name === 'hidden')) return true;
  if ((attr(el, 'aria-hidden') ?? '').toLowerCase().trim() === 'true') return true;

  const style = (attr(el, 'style') ?? '').toLowerCase().replace(/\s+/g, '');
  if (style === '') return false;
  return /display:none/.test(style)
    || /visibility:hidden/.test(style)
    || /opacity:0(?![.\d])/.test(style)
    || /(?:^|;)(?:width|height):0(?:px|em|rem|%)?(?:;|$)/.test(style);
}

/**
 * autocomplete="off" on the field, OR INHERITED FROM THE FORM.
 *
 * The form-level inheritance is not a convenience: `<form autocomplete="off">`
 * is the more common way to suppress autofill across a whole credential form,
 * and reading only the field attribute would miss it entirely — under-counting
 * CRED-07's second disjunct.
 */
function isAutocompleteDisabled(el: Element, formAutocomplete: string | null): boolean {
  const own = (attr(el, 'autocomplete') ?? '').toLowerCase().trim();
  if (own === 'off') return true;
  if (own !== '') return false;   // an explicit non-off value overrides the form
  return (formAutocomplete ?? '').toLowerCase().trim() === 'off';
}

/* ── form extraction ──────────────────────────────────────────────────── */

function methodOf(el: Element): FormMethod {
  // An absent `method` means GET — the HTML default, not "unknown". OTHER is
  // reserved for a method that is genuinely neither, e.g. method="dialog".
  const m = (attr(el, 'method') ?? 'get').toLowerCase().trim();
  if (m === 'get') return 'GET';
  if (m === 'post') return 'POST';
  return 'OTHER';
}

function extractForm(formEl: Element, pageUrl: string | null): LoginFormObservation {
  const formAutocomplete = attr(formEl, 'autocomplete');

  const fields: CredentialField[] = [];
  for (const el of walk(formEl)) {
    const tag = el.tagName.toLowerCase();
    if (tag !== 'input' && tag !== 'select' && tag !== 'textarea') continue;
    const kind = classifyField(el);
    if (kind === null) continue;
    fields.push({
      kind,
      hidden: isHidden(el),
      autocompleteDisabled: isAutocompleteDisabled(el, formAutocomplete),
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
    const kind = classifyField(el);
    if (kind === null) continue;
    allCredentialFields.push({
      kind, hidden: isHidden(el), autocompleteDisabled: isAutocompleteDisabled(el, null),
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
  const SECRET_KINDS: ReadonlySet<CredentialFieldKind> = new Set(['password', 'otp', 'pin']);
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
