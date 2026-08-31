/**
 * Shared domain-representation classification core (A1.2 PSL wiring).
 *
 * `scriptsOf` and `confusableSkeleton` are PURE string→value functions (RegExp
 * Unicode property escapes + a bounded homoglyph map), browser-compatible and
 * node-compatible, with NO ICU/node:url dependency. Both producers must run
 * the identical logic or CRED-03 would fire differently offline vs live — the
 * DEFECT-34 drift class. They lived inline in `apps/harness/extract/
 * domainRepresentation.ts`; the extension cannot import the harness (dependency
 * matrix), so the shared core lands in `engine`, the one package both import.
 *
 * Only the ICU UTS-46 conversion (node:url domainToUnicode/domainToASCII)
 * stays producer-specific — the harness uses node:url, the extension uses the
 * browser URL parser — because that primitive genuinely differs by platform.
 * The SCRIPT and CONFUSABLE analysis, which is where drift would actually
 * matter, is shared here. Every value below is byte-for-byte the logic
 * previously in the harness; see DEFECT-20 (absent-vs-present skeleton),
 * DEFECT-23/24 (scriptsUsed semantics), and the STATIC_EXTRACTION_RECALL_FLOOR
 * note — all unchanged by this relocation.
 */

/** Deliberate subset of Unicode scripts: those appearing in registrable domain
 *  names plus those carrying homoglyph risk against Latin. Order is
 *  load-bearing for S-6 — the output array is built by testing in this fixed
 *  order, so it is canonically ordered by construction. */
const PROBED_SCRIPTS: readonly string[] = [
  'Latin', 'Cyrillic', 'Greek', 'Han', 'Hiragana', 'Katakana', 'Hangul',
  'Arabic', 'Hebrew', 'Devanagari', 'Bengali', 'Tamil', 'Thai', 'Armenian',
  'Georgian', 'Cherokee',
];

const SCRIPT_MATCHERS: readonly (readonly [string, RegExp])[] =
  PROBED_SCRIPTS.map((s) => [s, new RegExp(`\\p{Script=${s}}`, 'u')] as const);

/**
 * Every Unicode script present in the domain, INCLUDING the default/ASCII one
 * (DEFECT-24): a pure-ASCII domain is `['Latin']`, never `[]`. Digits, hyphens
 * and dots carry no script property and are ignored.
 */
export function scriptsOf(unicodeHost: string): readonly string[] {
  const letters = unicodeHost.replace(/[.\-0-9]/g, '');
  return SCRIPT_MATCHERS.filter(([, re]) => re.test(letters)).map(([name]) => name);
}

/**
 * UTS-39 confusable skeleton — BOUNDED core homoglyph set (Cyrillic/Greek →
 * Latin), the mapping the overwhelming majority of real homograph attacks use.
 * Under-detects (out-of-map scripts produce no skeleton), never over-detects.
 * DEC-20: the CALLER emits `absent()` when the skeleton is not distinct from
 * the domain; this function just returns the skeleton.
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
  // Iterates CODE POINTS (for…of on a string), so astral characters are not
  // split mid-surrogate.
  for (const ch of unicodeHost) out += CONFUSABLE_MAP[ch] ?? ch;
  return out.toLowerCase();
}
