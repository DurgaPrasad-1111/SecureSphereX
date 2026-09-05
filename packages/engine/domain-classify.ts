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

/**
 * Punycode → Unicode host decode (RFC 3492), pure JS. Lets a producer with only
 * the ASCII/`xn--` host (a browser content script — `URL.hostname` never returns
 * the decoded form) recover the Unicode domain for `scriptsOf`/`confusableSkeleton`,
 * WITHOUT ICU / node:url. Deterministic string math on the URL's OWN host — no
 * network, no permission, no page-trust boundary (DEC-30 does not apply). Proven
 * byte-identical to node:url `domainToUnicode` on the IDN cases that matter
 * (DEC-47); a non-`xn--` label is returned as-is (lowercased), matching the
 * harness for the already-Unicode/ASCII case.
 */
export function punycodeToUnicode(host: string): string {
  return host.split('.').map((label) => {
    const l = label.toLowerCase();
    return l.startsWith('xn--') ? decodePunycodeLabel(l.slice(4)) : l;
  }).join('.');
}

/** RFC 3492 decode of one label's basic-string (the part after `xn--`). */
function decodePunycodeLabel(input: string): string {
  const base = 36, tmin = 1, tmax = 26, skew = 38, damp = 700, initialBias = 72, initialN = 128;
  const output: number[] = [];
  const lastDelim = input.lastIndexOf('-');
  for (let j = 0; j < (lastDelim < 0 ? 0 : lastDelim); j += 1) output.push(input.charCodeAt(j));
  let idx = lastDelim < 0 ? 0 : lastDelim + 1;
  let i = 0, n = initialN, bias = initialBias;
  while (idx < input.length) {
    const oldi = i;
    let w = 1;
    for (let k = base; ; k += base) {
      const c = input.charCodeAt(idx); idx += 1;
      // digit-36 decode: 0-9 -> 26-35, A-Z/a-z -> 0-25.
      const digit = c - 48 < 10 ? c - 22 : c - 65 < 26 ? c - 65 : c - 97 < 26 ? c - 97 : base;
      i += digit * w;
      const t = k <= bias ? tmin : k >= bias + tmax ? tmax : k - bias;
      if (digit < t) break;
      w *= base - t;
    }
    const out = output.length + 1;
    let delta = i - oldi;
    delta = oldi === 0 ? Math.floor(delta / damp) : Math.floor(delta / 2);
    delta += Math.floor(delta / out);
    let k = 0;
    for (; delta > ((base - tmin) * tmax) >> 1; k += base) delta = Math.floor(delta / (base - tmin));
    bias = Math.floor(k + (base - tmin + 1) * delta / (delta + skew));
    n += Math.floor(i / out);
    i %= out;
    output.splice(i, 0, n);
    i += 1;
  }
  return String.fromCodePoint(...output);
}
