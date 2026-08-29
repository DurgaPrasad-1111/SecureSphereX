/**
 * The single PSL derivation path for the whole extractor.
 *
 * WHY THIS FILE EXISTS. Before it, `tldts` was imported and called inline in
 * two places — `url.ts` for `url.registrableDomain` and `loginInterface.ts`
 * for `actionRegistrableDomain`. Adding a third inline call for
 * `transmissionEndpointDomains` would have made three independent derivations
 * of the same thing, which is exactly how two of them eventually disagree
 * about the same host.
 *
 * That matters more here than in most places: CRED-01 compares
 * `actionRegistrableDomain` against `url.registrableDomain`, and CRED-05
 * compares `transmissionEndpointDomains` against `url.registrableDomain`. A
 * `notSameSite` comparison between two values derived by different code paths
 * is only meaningful if those paths cannot diverge. One function makes that
 * structural rather than a convention.
 *
 * ── THIS IS THE V-15-GATED PATH ──────────────────────────────────────────
 * V-15 (DEC-27 ruling 3a, in `tools/ci/validate-ruleset.py`) asserts that the
 * PSL snapshot bundled here matches the `pslVersion` the rule set declares,
 * and `psl-conformance.fixture.test.ts` proves `tldts` and `tldextract` agree
 * on the boundary set. Both of those gate THIS module. Any PSL resolution that
 * bypasses it is ungated — so new callers must import from here, never from
 * `tldts` directly.
 * ────────────────────────────────────────────────────────────────────────
 */

import { parse as parseDomain } from 'tldts';

/**
 * PSL configuration — MUST MATCH `tools/capture/capture.py:86-92` EXACTLY.
 *
 * ⚠️ DEFECT-34. This was `tldts`' default (ICANN-only) and `capture.py` uses
 * `include_psl_private_domains=True`. The two disagreed on **32.5% of phishing
 * snapshots** in the 617-snapshot corpus.
 *
 * `capture.py`'s own rationale, verbatim, and it is the correct one:
 *
 *   "Without it every `*.github.io`, `*.web.app`, `*.pages.dev` and
 *    `*.blogspot.com` host collapses to the platform domain — placing every
 *    phishing page hosted on that platform, and every legitimate one, into a
 *    single split. Phishing leans heavily on these platforms, so the
 *    ICANN-only view produces a badly-grouped corpus."
 *
 * Concretely: ICANN-only makes `cancelcardiffbahora.vercel.app` and
 * `attacker.vercel.app` the SAME registrable domain, so a credential form on
 * one posting to the other reads as same-site and CRED-01 does not fire.
 * `capture.py` computes `splitKey` with private domains included, so without
 * this the extractor's notion of "site" also disagreed with the corpus split.
 *
 * DEC-32: the value is READ from `tools/ci/psl-config.json`, not written here.
 * That file is the single source of truth shared with `capture.py` and
 * `psl-reference.py`. DEFECT-34 happened because three copies of this flag
 * existed and one silently differed; there is now one copy and nothing to
 * keep in sync.
 *
 * The tldts spelling (`allowPrivateDomains`) differs from tldextract's
 * (`include_psl_private_domains`) — that vocabulary mapping is the one thing
 * that CANNOT be single-sourced, so it lives here, in one place, applied once.
 */
import pslConfig from '../../../tools/ci/psl-config.json' with { type: 'json' };

const PSL_OPTIONS = { allowPrivateDomains: pslConfig.includePrivateDomains } as const;

/**
 * eTLD+1 for a URL or hostname, or `null` when there genuinely is none.
 *
 * `null` covers three real cases, all of which are "the producer looked and
 * there is no registrable domain" rather than "we could not look":
 *   - IP literals (`http://192.0.2.44/`) — no registrable domain exists.
 *   - a host that IS a public suffix in its entirety (`https://co.uk/`).
 *   - an unparseable input.
 *
 * Callers map that `null` onto their own field's convention — `absent()` for
 * `Observation` fields, `null` for the `string | null` findings fields. The
 * distinction between absent and notCollected is the CALLER's to make,
 * because only the caller knows whether it looked.
 */
export function registrableDomainOf(urlOrHost: string): string | null {
  if (urlOrHost === '') return null;
  return parseDomain(urlOrHost, PSL_OPTIONS).domain ?? null;
}

/**
 * Registrable domains for a list of endpoints — de-duplicated and SORTED.
 *
 * Sorted for S-6: the output must not depend on the order endpoints happened
 * to be observed in, which is a property of the network and the page's
 * scheduler and is not reproducible across captures. Endpoints that yield no
 * registrable domain (IP literals, `data:` and `blob:` URLs, which exfil kits
 * do use) are dropped rather than represented as null — the field is
 * `readonly string[]`, so there is no null to put in it, and a dropped entry
 * is visible as a length mismatch against `transmissionEndpoints`.
 */
export function registrableDomainsOf(endpoints: readonly string[]): readonly string[] {
  const domains = new Set<string>();
  for (const e of endpoints) {
    const d = registrableDomainOf(e);
    if (d !== null) domains.add(d);
  }
  return [...domains].sort();
}
