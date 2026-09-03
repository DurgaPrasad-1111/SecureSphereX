/**
 * Redirect evidence producer (service-worker side).
 *
 * Role A observes navigation and produces RedirectEvidence; the engine
 * evaluates it. This producer uses ONLY `chrome.webNavigation` (a permission
 * the extension already holds), and is deliberately honest about that API's
 * limits:
 *
 *   - `chrome.webNavigation` reports a navigation's ENDPOINTS and WHETHER a
 *     server redirect occurred (the `server_redirect` transitionQualifier on
 *     onCommitted), but NOT the intermediate hop URLs and NOT the hop count:
 *     a 3xx chain fires onBeforeNavigate once (initial URL) and onCommitted
 *     once (final URL). So a full `chain[]` / exact `hopCount` are NOT
 *     observable here. Enumerating them requires chrome.webRequest
 *     .onBeforeRedirect + host_permissions — a permission expansion NOT made
 *     in this checkpoint (surfaced as a decision instead).
 *
 * Consequently the evidence is honestly tri-stated:
 *   - NO redirect  -> hopCount present(0), chain present([]) — the module is
 *                     EVALUABLE, correctly reporting zero redirects.
 *   - redirect DID occur -> initialUrl/finalUrl/crossedRegistrableDomain are
 *                     present (endpoints + shared-PSL comparison), but
 *                     hopCount/chain are notCollected (webNavigation cannot
 *                     observe them). Never fabricated.
 *
 * `crossedRegistrableDomain` uses the shared packages/engine/psl.ts — the same
 * resolver url.registrableDomain and actionRegistrableDomain use — so the
 * three cannot disagree about a host.
 *
 * SPA History API changes (onHistoryStateUpdated) are NOT redirects and are
 * never fed here. Subframe navigations (frameId !== 0) are excluded so they
 * cannot pollute main-frame evidence.
 */

import {
  present, absent, notCollected,
  type RedirectEvidence, type RedirectHop, type Observation,
} from '../../packages/contracts/evidence.contract.v1.ts';
import { registrableDomainOf } from '../../packages/engine/psl.ts';

const nc = <T>(): Observation<T> => notCollected<T>('api_unavailable');

/** The finalized facts a single main-frame navigation yields, from
 *  webNavigation alone. `initialUrl` is null when onBeforeNavigate was not
 *  observed for this navigation (e.g. worker asleep at navigation start). */
export interface NavigationRecord {
  readonly committedUrl: string;
  readonly serverRedirect: boolean;
  readonly initialUrl: string | null;
}

/**
 * Pure producer: a NavigationRecord -> RedirectEvidence. No clock, no
 * randomness, no browser access — fully testable and deterministic.
 */
export function computeRedirectEvidence(rec: NavigationRecord): RedirectEvidence {
  if (!rec.serverRedirect) {
    // No redirect: endpoints coincide, zero hops — all HONESTLY present.
    // No redirect: endpoints coincide. Both registrable domains are the same
    // committed URL's — present when it resolves, absent for an IP literal /
    // bare public suffix (mirrors url.ts). DEFECT-19 Option B.
    const rdSame = registrableDomainOf(rec.committedUrl);
    const sameDomain: Observation<string> = rdSame === null ? absent<string>() : present(rdSame);
    return {
      initialUrl: present(rec.committedUrl),
      finalUrl: present(rec.committedUrl),
      initialRegistrableDomain: sameDomain,
      finalRegistrableDomain: sameDomain,
      chain: present([] as readonly RedirectHop[]),
      hopCount: present(0),
      crossedRegistrableDomain: present(false),
    };
  }

  // A redirect occurred. Endpoints are observable; the chain and count are not
  // (see the header). initialUrl may be unknown if onBeforeNavigate was missed.
  const initialUrl: Observation<string> = rec.initialUrl === null ? nc<string>() : present(rec.initialUrl);
  const finalUrl = present(rec.committedUrl);

  // crossedRegistrableDomain honestly derivable ONLY when both endpoints are
  // known and both resolve to a registrable domain. A null on either side
  // (IP literal, localhost, or a missing initialUrl) means "cannot determine
  // cross-registrable-domain" -> notCollected, never a fabricated boolean.
  let crossed: Observation<boolean>;
  if (rec.initialUrl === null) {
    crossed = nc<boolean>();
  } else {
    const rdInitial = registrableDomainOf(rec.initialUrl);
    const rdFinal = registrableDomainOf(rec.committedUrl);
    crossed = rdInitial === null || rdFinal === null
      ? nc<boolean>()
      : present(rdInitial !== rdFinal);
  }

  // DEFECT-19 Option B: the two registrable-domain fields, from the same
  // endpoints, via the same shared PSL resolver used for `crossed`. Each:
  // URL unobserved -> notCollected; URL present but no eTLD+1 -> absent;
  // else present(domain) — mirrors url.ts exactly.
  const initialRegistrableDomain: Observation<string> =
    rec.initialUrl === null ? nc<string>()
      : (registrableDomainOf(rec.initialUrl) === null ? absent<string>() : present(registrableDomainOf(rec.initialUrl)!));
  const finalRegistrableDomain: Observation<string> =
    registrableDomainOf(rec.committedUrl) === null ? absent<string>() : present(registrableDomainOf(rec.committedUrl)!);

  return {
    initialUrl,
    finalUrl,
    initialRegistrableDomain,
    finalRegistrableDomain,
    // NOT observable via webNavigation — never fabricated. This is why the
    // redirect module is unevaluable for redirected navigations under the
    // current (webNavigation-only) producer. See header + the reported
    // webRequest decision.
    chain: nc<readonly RedirectHop[]>(),
    hopCount: nc<number>(),
    crossedRegistrableDomain: crossed,
  };
}

/**
 * Per-tab tracking of the pending main-frame navigation, so onCommitted can
 * pair with the onBeforeNavigate that started it. Keyed by tabId: a tab's main
 * frame has exactly one in-flight navigation, and onBeforeNavigate ->
 * onCommitted is a sub-second window during active navigation (the events keep
 * the worker alive), so in-memory pending state is safe. The FINAL evidence is
 * persisted to storage by the caller, not this pending map.
 */
export class RedirectTracker {
  readonly #pendingInitialUrl = new Map<number, string>();

  /** Main-frame onBeforeNavigate: remember where this navigation started. */
  beginNavigation(tabId: number, frameId: number, url: string): void {
    if (frameId !== 0) return;             // subframes never touch main-frame state
    this.#pendingInitialUrl.set(tabId, url);
  }

  /**
   * Main-frame onCommitted: finalize into a NavigationRecord and clear pending.
   * Returns null for subframes. `transitionQualifiers` is webNavigation's
   * array; 'server_redirect' is the authoritative "a 3xx redirect happened"
   * signal. ('client_redirect' is a SEPARATE navigation in Chrome's model, not
   * part of this navigation's chain, so it is not treated as a redirect here.)
   */
  commitNavigation(
    tabId: number, frameId: number, committedUrl: string, transitionQualifiers: readonly string[],
  ): NavigationRecord | null {
    if (frameId !== 0) return null;
    const initialUrl = this.#pendingInitialUrl.get(tabId) ?? null;
    this.#pendingInitialUrl.delete(tabId);
    return {
      committedUrl,
      serverRedirect: transitionQualifiers.includes('server_redirect'),
      initialUrl,
    };
  }

  /** Main-frame navigation failure: drop pending so a stale initialUrl cannot
   *  leak into the NEXT navigation in this tab (TEST 7). */
  abortNavigation(tabId: number, frameId: number): void {
    if (frameId !== 0) return;
    this.#pendingInitialUrl.delete(tabId);
  }
}

/** Storage key for a tab's most recent main-frame redirect evidence. */
export function redirectKey(tabId: number): string {
  return `ssx:redirect:${tabId}`;
}
