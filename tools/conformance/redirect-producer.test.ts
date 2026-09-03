/**
 * Redirect producer test — the webNavigation-only redirect evidence producer
 * (apps/extension/redirect-observer.ts) across the 8 required scenarios, and
 * its effect on the engine's redirect module (computeRedirectFindings).
 *
 * Deterministic, no browser: drives the RedirectTracker with synthetic
 * webNavigation event data and asserts the produced RedirectEvidence + the
 * module's evaluability. Lives in tools/conformance because it imports both the
 * extension producer and the engine module.
 *
 * HONESTY BOUNDARY under test: webNavigation observes endpoints + whether a
 * server redirect occurred, but NOT the hop chain/count. So no-redirect is
 * fully present (module EVALUABLE); a redirect is honestly present at the
 * endpoints with hopCount/chain notCollected (module unevaluable) — never
 * fabricated. Full chain/hopCount needs chrome.webRequest (a reported
 * permission decision).
 *
 * Run:
 *   node --experimental-strip-types tools/conformance/redirect-producer.test.ts
 */

import assert from 'node:assert/strict';

import { RedirectTracker, computeRedirectEvidence } from '../../apps/extension/redirect-observer.ts';
import { computeRedirectFindings } from '../../packages/engine/modules/redirect.ts';
import type { Observation } from '../../packages/contracts/evidence.contract.v1.ts';

function val<T>(o: Observation<T>): { state: string; value?: T } {
  return o.state === 'present' ? { state: 'present', value: o.value } : { state: o.state };
}

/* ── TEST 1 — NO REDIRECT ─────────────────────────────────────────────── */
{
  const t = new RedirectTracker();
  t.beginNavigation(1, 0, 'https://shop.example.com/');
  const rec = t.commitNavigation(1, 0, 'https://shop.example.com/', []);
  assert.ok(rec !== null);
  const ev = computeRedirectEvidence(rec);
  assert.deepEqual(val(ev.hopCount), { state: 'present', value: 0 }, 'no redirect -> hopCount 0');
  assert.deepEqual(val(ev.chain), { state: 'present', value: [] }, 'no redirect -> empty chain');
  assert.deepEqual(val(ev.crossedRegistrableDomain), { state: 'present', value: false });
  assert.equal(ev.initialUrl.state, 'present');
  assert.equal(ev.finalUrl.state, 'present');
  // The point: the module is now EVALUABLE for a no-redirect navigation.
  assert.equal(computeRedirectFindings(ev).status, 'evaluated', 'no-redirect nav -> module evaluable');
  console.log('  TEST 1 no-redirect: hopCount=0, chain=[], crossed=false -> module EVALUABLE ✓');
}

/* ── TEST 2 — SAME-SITE REDIRECT ──────────────────────────────────────── */
{
  const t = new RedirectTracker();
  t.beginNavigation(1, 0, 'https://accounts.example.com/');
  const rec = t.commitNavigation(1, 0, 'https://login.example.com/', ['server_redirect']);
  const ev = computeRedirectEvidence(rec!);
  assert.deepEqual(val(ev.crossedRegistrableDomain), { state: 'present', value: false },
    'accounts.example.com -> login.example.com is SAME registrable domain (example.com)');
  assert.equal(ev.initialUrl.state, 'present');
  assert.equal(ev.finalUrl.state, 'present');
  assert.equal(ev.hopCount.state, 'notCollected', 'hop count not observable via webNavigation');
  assert.equal(computeRedirectFindings(ev).status, 'unevaluable', 'redirected nav -> module honestly unevaluable (hopCount notCollected)');
  console.log('  TEST 2 same-site redirect: crossed=false (present); hopCount notCollected -> module unevaluable ✓');
}

/* ── TEST 3 — CROSS-SITE REDIRECT ─────────────────────────────────────── */
{
  const t = new RedirectTracker();
  t.beginNavigation(1, 0, 'https://accounts.example.com/');
  const rec = t.commitNavigation(1, 0, 'https://evil.example/', ['server_redirect']);
  const ev = computeRedirectEvidence(rec!);
  assert.deepEqual(val(ev.crossedRegistrableDomain), { state: 'present', value: true },
    'example.com -> evil.example is a CROSS registrable-domain redirect');
  console.log('  TEST 3 cross-site redirect: crossed=true (present) ✓');
}

/* ── TEST 4 — MULTI-HOP ───────────────────────────────────────────────── */
{
  // webNavigation reports only the endpoints of a multi-hop server redirect.
  const t = new RedirectTracker();
  t.beginNavigation(1, 0, 'https://accounts.example.com/');
  const rec = t.commitNavigation(1, 0, 'https://login.example.org/', ['server_redirect']);
  const ev = computeRedirectEvidence(rec!);
  assert.deepEqual(val(ev.crossedRegistrableDomain), { state: 'present', value: true },
    'example.com -> example.org crossed, derived from endpoints');
  // Honest: the intermediate hop (redirector.example.net) and the count are
  // NOT observable via webNavigation -> notCollected, never fabricated.
  assert.equal(ev.hopCount.state, 'notCollected', 'multi-hop count needs chrome.webRequest');
  assert.equal(ev.chain.state, 'notCollected', 'intermediate hops need chrome.webRequest');
  console.log('  TEST 4 multi-hop: endpoints crossed=true; hopCount/chain notCollected (webRequest needed) ✓');
}

/* ── TEST 5 — SUBFRAME MUST NOT POLLUTE MAIN FRAME ────────────────────── */
{
  const t = new RedirectTracker();
  t.beginNavigation(1, 0, 'https://main.example.com/');       // main frame pending
  t.beginNavigation(1, 7, 'https://ads.evil.example/');        // subframe — ignored
  const subRec = t.commitNavigation(1, 7, 'https://ads.evil.example/x', ['server_redirect']);
  assert.equal(subRec, null, 'subframe commit returns null — no main-frame evidence');
  // Main frame still resolves from its own pending initialUrl, uncorrupted.
  const mainRec = t.commitNavigation(1, 0, 'https://main.example.com/', []);
  assert.equal(mainRec!.initialUrl, 'https://main.example.com/', 'main-frame initialUrl not polluted by subframe');
  assert.equal(mainRec!.serverRedirect, false);
  console.log('  TEST 5 subframe: ignored (commit null); main-frame evidence intact ✓');
}

/* ── TEST 6 — CONSECUTIVE NAVIGATIONS ISOLATED ────────────────────────── */
{
  const t = new RedirectTracker();
  t.beginNavigation(1, 0, 'https://a.example.com/');
  t.commitNavigation(1, 0, 'https://a.example.com/', []);            // nav A done
  t.beginNavigation(1, 0, 'https://b.example.com/');
  const recB = t.commitNavigation(1, 0, 'https://evil.example/', ['server_redirect']); // nav B
  assert.equal(recB!.initialUrl, 'https://b.example.com/', 'nav B initialUrl is B, not A');
  const ev = computeRedirectEvidence(recB!);
  assert.deepEqual(val(ev.crossedRegistrableDomain), { state: 'present', value: true });
  console.log('  TEST 6 consecutive navs: B does not inherit A’s initialUrl ✓');
}

/* ── TEST 7 — NAVIGATION FAILURE CLEARS PENDING ───────────────────────── */
{
  const t = new RedirectTracker();
  t.beginNavigation(1, 0, 'https://stale.example.com/');
  t.abortNavigation(1, 0);                                            // navigation failed
  t.beginNavigation(1, 0, 'https://fresh.example.com/');
  const rec = t.commitNavigation(1, 0, 'https://evil.example/', ['server_redirect']);
  assert.equal(rec!.initialUrl, 'https://fresh.example.com/', 'stale initialUrl from failed nav did not leak');
  // And an abort with NO following begin leaves no stale pending either:
  const t2 = new RedirectTracker();
  t2.beginNavigation(2, 0, 'https://stale2.example.com/');
  t2.abortNavigation(2, 0);
  const rec2 = t2.commitNavigation(2, 0, 'https://direct.example.net/', []);
  assert.equal(rec2!.initialUrl, null, 'after abort, a commit with no begin has null initialUrl (no stale reuse)');
  console.log('  TEST 7 nav failure: pending cleared; no stale initialUrl reused ✓');
}

/* ── TEST 8 — SPA HISTORY API IS NOT A REDIRECT ───────────────────────── */
{
  // An SPA History change fires onHistoryStateUpdated, which the service
  // worker NEVER routes to the tracker. Modelled here as: a committed
  // navigation whose qualifiers do NOT include 'server_redirect' is not a
  // redirect. (client_redirect, if it appeared, is a separate navigation in
  // Chrome's model, not a hop of this one.)
  const t = new RedirectTracker();
  t.beginNavigation(1, 0, 'https://app.example.com/');
  const rec = t.commitNavigation(1, 0, 'https://app.example.com/#/dashboard', ['client_redirect']);
  const ev = computeRedirectEvidence(rec!);
  assert.equal(rec!.serverRedirect, false, 'client_redirect / history change is NOT a server redirect');
  assert.deepEqual(val(ev.hopCount), { state: 'present', value: 0 }, 'not treated as an HTTP redirect');
  console.log('  TEST 8 SPA/history: not classified as an HTTP redirect (hopCount 0) ✓');
}

console.log('Redirect producer PROVEN: 8/8 scenarios honest; no-redirect makes the module evaluable, '
  + 'redirects are honestly represented at the endpoints with hopCount/chain notCollected. '
  + 'No fabricated hops. In the EXTENSION producer, full chain/hopCount (and thus CRED-04 via this path) remain blocked on chrome.webRequest — webNavigation cannot see the hops. DEFECT-19 itself is RESOLVED (Option B): the harness path, which sees server-side chains, now fires CRED-04 (tools/conformance/cred04-live-path.test.ts) — S-10 DIVERGENT.');
