/**
 * Shared credential-field classification core (A1.2).
 *
 * WHY THIS LIVES IN packages/engine. Two producers must classify credential
 * fields IDENTICALLY: the offline harness (`apps/harness/extract/
 * loginInterface.ts`, parse5 over a static HTML string) and the live extension
 * (`apps/extension/collect-evidence.ts`, a real DOM). The dependency matrix
 * (CLAUDE.md §2) forbids the extension from importing the harness, so the
 * shared logic cannot live in the harness. `engine` is the ONLY package both
 * may import (`extension` → contracts+engine; `harness` → contracts+engine), so
 * the shared core lands here.
 *
 * This is PRODUCER logic sitting in the engine package for reachability, not
 * because it is evaluation logic — it derives none of D0.2. It is admissible
 * here only because it is PURE: it takes primitive attribute values (never a
 * parse5 node, never a DOM Element) and returns contract enums. It references
 * NO browser global (G-3) and NO DOM/parse5 type, so both adapters can feed it
 * and neither carries a copy of the logic — closing the cross-implementation
 * drift risk DEFECT-34 established (two copies of one heuristic silently
 * diverging).
 *
 * Every function below is byte-for-byte the logic previously inline in
 * `loginInterface.ts`; the ONLY change is that inputs arrive as plain values
 * instead of being read off a parse5 element. See DEFECT-32 for why `kind` is
 * a heuristic with bidirectional error, unchanged by this relocation.
 */

import type { CredentialFieldKind, FormMethod } from '../contracts/evidence.contract.v1';

/** The three SECRET-bearing kinds. `credentialFormPresent` counts a form as a
 *  credential interface only if it asks for one of these (DEFECT-32 option 2,
 *  Architecture Owner ruling 2026-08-29). Shared so both producers apply the
 *  same page-level definition. */
export const SECRET_KINDS: ReadonlySet<CredentialFieldKind> = new Set(['password', 'otp', 'pin']);

/** The declared/guessable attributes `classifyField` reads. Both adapters
 *  construct this from their own element representation. `null` means the
 *  attribute is absent, matching how both parse5 `attr()` and DOM
 *  `getAttribute()` report absence. */
export interface CredentialFieldAttrs {
  readonly type: string | null;
  readonly name: string | null;
  readonly id: string | null;
  readonly autocomplete: string | null;
}

/**
 * Classify one input as a credential field, or null if it is not one.
 *
 * ⚠️ HEURISTIC WITH BIDIRECTIONAL ERROR — see DEFECT-32. Precedence is
 * deliberate: STRONGEST SIGNAL FIRST. `type` and `autocomplete` are declared
 * semantics the page author opted into; `name`/`id` matching is guesswork over
 * free text and is consulted only when nothing declarative said anything.
 */
export function classifyField(attrs: CredentialFieldAttrs): CredentialFieldKind | null {
  const type = (attrs.type ?? 'text').toLowerCase().trim();
  const autocomplete = (attrs.autocomplete ?? '').toLowerCase().trim();

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

  const hay = `${attrs.name ?? ''} ${attrs.id ?? ''}`.toLowerCase();
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

/** Inputs for `isCredentialFieldHidden`. `hiddenAttrPresent` is the boolean
 *  `hidden` ATTRIBUTE's presence (not a value) — parse5 reads it via
 *  `el.attrs.some`, the DOM via `el.hasAttribute('hidden')`. */
export interface HiddenAttrs {
  readonly type: string | null;
  readonly hiddenAttrPresent: boolean;
  readonly ariaHidden: string | null;
  readonly style: string | null;
}

/**
 * Hidden — MARKUP-ONLY (DEFECT-31, STATIC_EXTRACTION_RECALL_FLOOR).
 *
 * Detects `type="hidden"`, the boolean `hidden` attribute, `aria-hidden`, and
 * inline styles that visually remove the field. Cannot detect stylesheet- or
 * class-based concealment from markup alone. Under-reports only, never over —
 * a floor on CRED-07's recall, not a measurement.
 */
export function isCredentialFieldHidden(attrs: HiddenAttrs): boolean {
  if ((attrs.type ?? '').toLowerCase().trim() === 'hidden') return true;
  if (attrs.hiddenAttrPresent) return true;
  if ((attrs.ariaHidden ?? '').toLowerCase().trim() === 'true') return true;

  const style = (attrs.style ?? '').toLowerCase().replace(/\s+/g, '');
  if (style === '') return false;
  return /display:none/.test(style)
    || /visibility:hidden/.test(style)
    || /opacity:0(?![.\d])/.test(style)
    || /(?:^|;)(?:width|height):0(?:px|em|rem|%)?(?:;|$)/.test(style);
}

/**
 * autocomplete="off" on the field, OR inherited from the form. Reading only
 * the field would miss `<form autocomplete="off">`, the more common way to
 * suppress autofill across a whole credential form.
 */
export function isAutocompleteDisabled(
  ownAutocomplete: string | null,
  formAutocomplete: string | null,
): boolean {
  const own = (ownAutocomplete ?? '').toLowerCase().trim();
  if (own === 'off') return true;
  if (own !== '') return false;   // an explicit non-off value overrides the form
  return (formAutocomplete ?? '').toLowerCase().trim() === 'off';
}

/**
 * Form method normalisation. An absent `method` means GET — the HTML default,
 * not "unknown". OTHER is reserved for a method genuinely neither GET nor POST,
 * e.g. `method="dialog"`.
 */
export function classifyMethod(method: string | null): FormMethod {
  const m = (method ?? 'get').toLowerCase().trim();
  if (m === 'get') return 'GET';
  if (m === 'post') return 'POST';
  return 'OTHER';
}
