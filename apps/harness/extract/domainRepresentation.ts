/**
 * `domainRepresentation` category extraction: host -> DomainRepresentationEvidence.
 *
 * The most expensive of the three categories built in this pass, and the one
 * with the most convention embedded in it. Every convention is stated here
 * rather than left implicit, because two of them (scriptsUsed's semantics,
 * confusableSkeleton's absent-vs-present) were live defects before this file
 * existed and the extractor is what settles them in practice.
 *
 * IDNA is Node's own ICU-backed `domainToUnicode`/`domainToASCII` — no
 * dependency, and the same UTS-46 implementation the URL parser uses, so the
 * Unicode and punycode forms cannot disagree with what `new URL()` produced.
 */

import { domainToUnicode, domainToASCII } from 'node:url';
import {
  present, absent, notCollected,
  type DomainRepresentationEvidence, type Observation,
} from '../../../packages/contracts/evidence.contract.v1.ts';

export function unobservedDomainRepresentation(): DomainRepresentationEvidence {
  const nc = <T>(): Observation<T> => notCollected<T>('api_unavailable');
  return {
    unicodeDomain: nc<string>(), punycodeDomain: nc<string>(),
    isIdn: nc<boolean>(), containsNonAscii: nc<boolean>(),
    scriptsUsed: nc<readonly string[]>(), isMixedScript: nc<boolean>(),
    confusableSkeleton: nc<string>(),
  };
}

/**
 * Scripts probed for, via RegExp Unicode property escapes (`\p{Script=…}`),
 * which Node 22 supports natively — no Unicode tables are bundled.
 *
 * This list is a DELIBERATE SUBSET, not all ~160 Unicode scripts. It covers
 * the scripts that actually appear in registrable domain names plus the ones
 * that carry homograph risk against Latin. A script outside this list is not
 * reported, which is a known limitation recorded rather than hidden: it would
 * cause `scriptsUsed` to under-report and, in the worst case, `isMixedScript`
 * to read false for a genuinely mixed domain in a script nobody has yet
 * registered a phishing domain in. Extend the list, do not special-case.
 *
 * ORDER IS LOAD-BEARING FOR S-6: the output array is built by testing in this
 * fixed order, so it is canonically ordered by construction and does not
 * depend on Set iteration or object-key order.
 */
const PROBED_SCRIPTS: readonly string[] = [
  'Latin', 'Cyrillic', 'Greek', 'Han', 'Hiragana', 'Katakana', 'Hangul',
  'Arabic', 'Hebrew', 'Devanagari', 'Bengali', 'Tamil', 'Thai', 'Armenian',
  'Georgian', 'Cherokee',
];

const SCRIPT_MATCHERS: readonly (readonly [string, RegExp])[] =
  PROBED_SCRIPTS.map((s) => [s, new RegExp(`\\p{Script=${s}}`, 'u')] as const);

/**
 * Every Unicode script present in the domain, INCLUDING the default/ASCII one.
 *
 * DEFECT-24, resolved 2026-08-29, settles this: the array lists ALL scripts,
 * so a pure-ASCII domain is `['Latin']`, never `[]`. The rejected reading was
 * "non-default scripts only", which is unimplementable — nothing in the
 * repository defines what "default" is relative to.
 *
 * Digits, hyphens and dots carry no script property and are correctly ignored;
 * a domain of only those (an IP literal never reaches here) yields `[]`, which
 * is the one honest empty case.
 */
export function scriptsOf(unicodeHost: string): readonly string[] {
  const letters = unicodeHost.replace(/[.\-0-9]/g, '');
  return SCRIPT_MATCHERS.filter(([, re]) => re.test(letters)).map(([name]) => name);
}

/**
 * UTS-39 confusable skeleton — BOUNDED IMPLEMENTATION, deliberately partial.
 *
 * ⚠️ READ THIS BEFORE TRUSTING CRED-03 NUMBERS. A complete implementation
 * needs the full UTS-39 `confusables.txt` mapping (~6,000 entries). That table
 * is not bundled and no dependency for it was approved, so what is implemented
 * here is the CORE HOMOGLYPH SET: Cyrillic and Greek characters that are
 * visually identical or near-identical to ASCII Latin letters, which is the
 * mapping that the overwhelming majority of real homograph attacks use.
 *
 * Consequence, stated plainly: this UNDER-detects. A confusable built from a
 * script outside the map (Armenian `ա`, Cherokee `Ꭰ`, fullwidth forms) will
 * produce no skeleton and CRED-03 will not fire. It does NOT over-detect —
 * every entry below is a genuine visual confusable — so false positives are
 * not the failure mode; false negatives are.
 *
 * ── STATIC_EXTRACTION_RECALL_FLOOR (DEFECT-23, DEFECT-31) ────────────────
 *
 * This is one instance of a SHARED PATTERN, not a local shortcut: static
 * extraction structurally cannot observe some sophisticated attack techniques
 * that a live browser can. The other instance is `CredentialField.hidden` in
 * `loginInterface` — CSS/JS-based concealment is invisible to markup-only
 * derivation, exactly as out-of-core confusables are invisible here.
 *
 * Both biases run ONE WAY: downward, never upward. Neither over-detects, so
 * neither can inflate a recall figure — they can only deflate it. And both
 * miss the MORE sophisticated attacks specifically, so the error concentrates
 * in the subpopulation the system most needs to be judged on.
 *
 * ⚠️ CONSEQUENCE FOR REPORTING, not just for code: any future CP-2 report of
 * CRED-03's or CRED-07's recall MUST cite this limitation alongside the
 * number. For the affected attack subtypes the figure is a FLOOR, not a true
 * measurement, and publishing it uncaveated would overstate what the corpus
 * establishes — in the direction that flatters the system.
 * ────────────────────────────────────────────────────────────────────────
 *
 * DEC-20's convention is honoured exactly: when the skeleton is not DISTINCT
 * from the domain, the caller emits `absent()`, never `present(sameString)`.
 * Emitting a present-and-identical skeleton is what made CRED-03 fire on
 * every page once already.
 */
const CONFUSABLE_MAP: Readonly<Record<string, string>> = {
  // Cyrillic -> Latin
  'а': 'a', 'е': 'e', 'о': 'o', 'р': 'p', 'с': 'c',
  'у': 'y', 'х': 'x', 'і': 'i', 'ј': 'j', 'һ': 'h',
  'ѕ': 's', 'ђ': 'h', 'ӏ': 'l',
  'А': 'A', 'Е': 'E', 'О': 'O', 'Р': 'P', 'С': 'C',
  'Т': 'T', 'Х': 'X', 'М': 'M', 'Н': 'H', 'К': 'K',
  'В': 'B', 'І': 'I', 'Ѕ': 'S', 'Ј': 'J',
  // Greek -> Latin
  'α': 'a', 'ο': 'o', 'ρ': 'p', 'ν': 'v', 'ι': 'i',
  'κ': 'k', 'υ': 'u', 'χ': 'x',
  'Α': 'A', 'Β': 'B', 'Ε': 'E', 'Ζ': 'Z', 'Η': 'H',
  'Ι': 'I', 'Κ': 'K', 'Μ': 'M', 'Ν': 'N', 'Ο': 'O',
  'Ρ': 'P', 'Τ': 'T', 'Υ': 'Y', 'Χ': 'X',
};

export function confusableSkeleton(unicodeHost: string): string {
  let out = '';
  // Iterates CODE POINTS, not UTF-16 units — `for…of` on a string is
  // code-point-wise, so astral characters are not split mid-surrogate.
  for (const ch of unicodeHost) out += CONFUSABLE_MAP[ch] ?? ch;
  return out.toLowerCase();
}

export function extractDomainRepresentation(hostname: string | null): DomainRepresentationEvidence {
  if (hostname === null || hostname === '') return unobservedDomainRepresentation();

  // Both directions from the SAME host string, via ICU UTS-46. `domainToUnicode`
  // is a no-op on an already-Unicode host and decodes `xn--` labels; likewise
  // `domainToASCII` in reverse. Either can return '' on an input ICU rejects.
  const unicodeDomain = domainToUnicode(hostname) || hostname;
  const punycodeDomain = domainToASCII(hostname) || hostname;

  const containsNonAscii = /[^\x00-\x7F]/.test(unicodeDomain);

  // isIdn is measured on the PUNYCODE form: a domain is an IDN iff some label
  // carries the `xn--` ACE prefix. Measuring it on the Unicode form would make
  // it a synonym for containsNonAscii, which the contract lists separately —
  // two fields that always agree would be one field.
  //
  // (This is the representation ambiguity `consistency.ts` declines to judge:
  // an IDN's punycode form is pure ASCII while its Unicode form is not, and
  // the contract never says which representation containsNonAscii measures.
  // Resolved HERE by measuring the two fields on DIFFERENT forms, which is
  // what makes them independent. Recorded, not silently chosen.)
  const isIdn = punycodeDomain.split('.').some((l) => l.toLowerCase().startsWith('xn--'));

  const scriptsUsed = scriptsOf(unicodeDomain);
  const skeleton = confusableSkeleton(unicodeDomain);

  return {
    unicodeDomain: present(unicodeDomain),
    punycodeDomain: present(punycodeDomain),
    isIdn: present(isIdn),
    containsNonAscii: present(containsNonAscii),
    scriptsUsed: present(scriptsUsed),
    isMixedScript: present(scriptsUsed.length >= 2),

    // DEC-20's convention, load-bearing: present ONLY when the skeleton
    // differs from the domain it was derived from.
    confusableSkeleton:
      skeleton !== unicodeDomain.toLowerCase() ? present(skeleton) : absent<string>(),
  };
}
