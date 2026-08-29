/**
 * `url` category extraction: RawMaterial -> UrlEvidence.
 *
 * DETERMINISM (S-6). Every value below is a pure function of the input URL
 * string. No clock, no randomness, no environment. `tldts` resolves the
 * registrable domain from a bundled PSL snapshot — see `version.ts`'s
 * BUNDLED_PSL for why that is a gated concern rather than a free choice.
 *
 * TRI-STATE DISCIPLINE (I-2, S-7). `notCollected` means "the producer could
 * not look"; `absent` means "the producer looked and it genuinely is not
 * there". These are never interchanged. When `finalUrl` is null — 24% of the
 * corpus, every snapshot whose fetch did not reach a response — the whole
 * category is `notCollected`, because nothing was observable, not `absent`.
 */

import { registrableDomainOf } from './psl.ts';
import {
  present, absent, notCollected,
  type UrlEvidence, type Observation,
} from '../../../packages/contracts/evidence.contract.v1.ts';

/** Every field notCollected, for snapshots whose fetch produced no URL. */
export function unobservedUrlEvidence(): UrlEvidence {
  const nc = <T>(): Observation<T> => notCollected<T>('api_unavailable');
  return {
    fullUrl: nc<string>(), scheme: nc<string>(), host: nc<string>(),
    port: nc<number>(), path: nc<string>(), queryPresent: nc<boolean>(),
    registrableDomain: nc<string>(), subdomainLabels: nc<readonly string[]>(),
    isIpLiteral: nc<boolean>(), totalLength: nc<number>(),
    percentEncodedSegmentCount: nc<number>(),
  };
}

/**
 * `%XX` sequences in the PATH, counted per SEGMENT.
 *
 * "percentEncodedSegmentCount" counts segments containing at least one escape,
 * not total escapes — a segment with three escapes counts once. Chosen because
 * the field is named for segments; recorded because the contract does not say.
 */
function countPercentEncodedSegments(pathname: string): number {
  return pathname.split('/').filter((seg) => /%[0-9A-Fa-f]{2}/.test(seg)).length;
}

/**
 * IP literals. `URL.hostname` wraps IPv6 in brackets, which is the reliable
 * marker; IPv4 is four dot-separated decimal octets. A hostname that merely
 * begins with digits (`123-reg.co.uk`) is NOT an IP literal, which the
 * anchored full-match guards against.
 */
/**
 * The port AS WRITTEN in the raw URL string, or null if none was written.
 *
 * ⚠️ WHY THIS EXISTS INSTEAD OF `new URL(...).port`. The WHATWG URL parser
 * NORMALISES DEFAULT PORTS AWAY: `new URL('https://x.com:443/').port` is the
 * empty string, identical to `https://x.com/`. Using it would silently erase
 * the explicit/implicit distinction before this extractor ever saw it —
 * exactly the information loss that default-port INFERENCE was rejected for.
 * Reading `.port` and calling the result `absent()` would have produced the
 * right value for the wrong reason, and would have made the stated rationale
 * untrue.
 *
 * An explicitly written non-standard port is a real phishing signal, and an
 * explicitly written STANDARD port is itself mildly unusual. Both survive here.
 *
 * Parses the authority by hand, minimally: strip scheme, strip userinfo (which
 * may itself contain `:`), then take a trailing `:digits`. IPv6 literals are
 * bracketed, so the port can only follow the closing bracket.
 */
export function explicitPort(rawUrl: string): number | null {
  const afterScheme = rawUrl.replace(/^[A-Za-z][A-Za-z0-9+.\-]*:\/\//, '');
  const authority = afterScheme.split(/[/?#]/, 1)[0] ?? '';
  const atIdx = authority.lastIndexOf('@');
  const hostPort = atIdx === -1 ? authority : authority.slice(atIdx + 1);

  const closing = hostPort.lastIndexOf(']');
  const colon = hostPort.indexOf(':', closing === -1 ? 0 : closing);
  if (colon === -1) return null;

  const portText = hostPort.slice(colon + 1);
  if (!/^\d+$/.test(portText)) return null;
  return Number(portText);
}

function isIpLiteral(hostname: string): boolean {
  if (hostname.startsWith('[') && hostname.endsWith(']')) return true;
  const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(hostname);
  return m !== null && m.slice(1).every((o) => Number(o) <= 255);
}

export function extractUrlEvidence(finalUrl: string | null): UrlEvidence {
  if (finalUrl === null || finalUrl === '') return unobservedUrlEvidence();

  let u: URL;
  try {
    u = new URL(finalUrl);
  } catch {
    // A malformed URL is a real, observed fact about this snapshot, but it is
    // not a capability gap — the producer looked. Still notCollected rather
    // than absent, because no FIELD value was established: `absent` would
    // assert eleven confirmed-negative facts, which is exactly I-2's warning.
    return unobservedUrlEvidence();
  }

  const scheme = u.protocol.replace(/:$/, '').toLowerCase();
  const hostname = u.hostname.toLowerCase();
  const ipLiteral = isIpLiteral(hostname);

  // PSL resolution. An IP literal has no registrable domain, and neither does
  // a hostname whose entire label set IS a public suffix (`co.uk` alone).
  // Both are genuinely-absent, not uncollected: `absent()` is correct and
  // maps to UrlFindings.registrableDomain's `string | null`, exactly the
  // convention url.ts already documents.
  // Single PSL path (psl.ts) — the V-15-gated one. The IP-literal guard stays
  // HERE rather than inside the helper: an IP literal is a fact about this
  // URL's host, not about PSL resolution.
  const rd = ipLiteral ? null : registrableDomainOf(finalUrl);
  const registrableDomain: Observation<string> =
    rd !== null ? present(rd) : absent<string>();

  // Subdomain labels, in DOCUMENT ORDER (left to right as written). Not
  // sorted: order is meaningful here — `login.secure.example.com` and
  // `secure.login.example.com` are different names — and S-6 needs only
  // STABILITY, which document order already gives.
  const subdomainLabels: readonly string[] = (() => {
    if (rd === null) return [];
    const host = hostname.endsWith(rd) ? hostname.slice(0, -rd.length) : '';
    return host === '' ? [] : host.replace(/\.$/, '').split('.').filter((l) => l !== '');
  })();

  return {
    fullUrl: present(finalUrl),
    scheme: present(scheme),
    host: present(hostname),

    // DEC-27 / drafted ruling (a): `absent()` when no port is WRITTEN, never
    // default-port inference. Two distinct reasons, and the second is the one
    // that survives scrutiny:
    //
    //   1. Inference fabricates. `present(443)` for a URL with no port
    //      asserts an observation never made — I-2's capability-gap-as-clean-
    //      bill-of-health, and `Observation` describes what was OBSERVED.
    //   2. Inference is LOSSY: `https://x.com` and `https://x.com:443` would
    //      collapse to the same value. `explicitPort` reads the RAW string
    //      precisely so this distinction survives — `new URL().port` would
    //      have destroyed it first (see explicitPort's header).
    //
    // Nothing is lost the other way: `scheme` is present, so any consumer
    // wanting the effective port derives it at Stage 2, where E-4 says
    // refinement belongs. Note this field is inert today — `UrlFindings` has
    // no `port`, url.ts does not gate on it, and no rule reads `url.port`.
    port: (() => {
      const p = explicitPort(finalUrl);
      return p === null ? absent<number>() : present(p);
    })(),

    path: present(u.pathname),
    queryPresent: present(u.search !== ''),
    registrableDomain,
    subdomainLabels: present(subdomainLabels),
    isIpLiteral: present(ipLiteral),

    // Length of the FULL URL as captured, not of any normalised form —
    // normalising here would discard the padding/obfuscation signal the
    // field exists to expose.
    totalLength: present(finalUrl.length),
    percentEncodedSegmentCount: present(countPercentEncodedSegments(u.pathname)),
  };
}
