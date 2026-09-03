/**
 * `redirect` category extraction — DEFECT-19 resolved via Option B
 * (docs/DEC-19-CRED04-fix-path-REVIEW.md, Architecture-Owner ruling).
 *
 * Un-stubs redirect for the harness ("capture.py's harness equivalent"). Builds
 * `RedirectEvidence` from `raw.redirectChain` + `raw.requestedUrl`/`finalUrl`,
 * including the two registrable-domain fields the Annex A amendment added:
 * `initialRegistrableDomain` / `finalRegistrableDomain`.
 *
 * PSL derivation uses the shared `packages/engine/psl.ts` resolver — the same
 * V-15-gated path `url.ts`, `loginInterface.ts` and `scriptRuntime.ts` use,
 * fixed by DEFECT-34 and confirmed correct on `*.framer.app` this session. The
 * producer performs the derivation §2.6 forbids the engine MODULE from doing.
 *
 * ⚠️ S-10 IS NOT LIFTED BY THIS. `snapshot.format.v1.ts:353` — CRED-04 remains
 * DIVERGENT: the harness observes SERVER-side redirect chains the extension may
 * not see, so CRED-04's corpus recall MUST still be reported separately and
 * MUST NOT be folded into a headline. This extractor lets CRED-04 FIRE on real
 * data; it does not make CRED-04 corpus-headline-valid.
 *
 * S-6: no clock, no generated ids. Registrable domains are a pure function of
 * the captured URLs via the deterministic PSL snapshot.
 */

import {
  present, absent, notCollected,
  type RedirectEvidence, type RedirectHop, type RedirectMechanism, type Observation,
} from '../../../packages/contracts/evidence.contract.v1.ts';
import type { RawMaterial, RawRedirectHop } from '../../../packages/contracts/snapshot.format.v1.ts';
import { registrableDomainOf } from '../../../packages/engine/psl.ts';

const nc = <T>(): Observation<T> => notCollected<T>('api_unavailable');

/**
 * A URL's registrable domain as an Observation, mirroring url.ts exactly:
 *   URL not observed      -> notCollected
 *   URL present, no eTLD+1 -> absent()   (IP literal, bare public suffix)
 *   URL present, resolves  -> present(domain)
 */
function domainOf(url: string | null): Observation<string> {
  if (url === null || url === '') return nc<string>();
  const rd = registrableDomainOf(url);
  return rd === null ? absent<string>() : present(rd);
}

/** `RawRedirectHop.mechanism` is a free `string`; narrow to the closed union. */
function narrowMechanism(m: string): RedirectMechanism {
  return m === 'http_3xx' || m === 'javascript' || m === 'meta_refresh' ? m : 'unknown';
}

export function extractRedirect(raw: RawMaterial): RedirectEvidence {
  // The first hop's fromUrl is the initial URL; fall back to requestedUrl.
  // finalUrl falls back to requestedUrl when the fetch produced no final URL.
  const rawChain: readonly RawRedirectHop[] = raw.redirectChain ?? [];
  const initialUrl = rawChain.length > 0 ? rawChain[0]!.fromUrl : raw.requestedUrl;
  const finalUrl = raw.finalUrl ?? raw.requestedUrl;

  const chain: readonly RedirectHop[] = rawChain.map((h) => ({
    fromUrl: h.fromUrl,
    toUrl: h.toUrl,
    mechanism: narrowMechanism(h.mechanism),
    statusCode: h.statusCode,
  }));

  return {
    initialUrl: initialUrl === null ? nc<string>() : present(initialUrl),
    finalUrl: finalUrl === null ? nc<string>() : present(finalUrl),
    // Amendment A / DEFECT-19 Option B: producer-derived, via the shared PSL path.
    initialRegistrableDomain: domainOf(initialUrl),
    finalRegistrableDomain: domainOf(finalUrl),
    chain: present(chain),
    hopCount: present(chain.length),
    // crossedRegistrableDomain: a real same-site verdict when both resolve,
    // notCollected when either does not — never a fabricated boolean.
    crossedRegistrableDomain: (() => {
      const a = registrableDomainOf(initialUrl ?? '');
      const b = registrableDomainOf(finalUrl ?? '');
      return a === null || b === null ? nc<boolean>() : present(a !== b);
    })(),
  };
}
