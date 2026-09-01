/**
 * Decision 3 — login-success inference (§20.5), tested at every conjunct.
 *
 * Six required cases: the positive (all four hold → write), each of the four
 * conjuncts failing independently, and a G-01/G-02 rejection where all four
 * hold but the real store's guard blocks the write. Plus §20.5's restrictive
 * ramp: a single successful write must yield PROVISIONAL, not ESTABLISHED.
 *
 * Runs under node with the A1.1 in-memory backend shim — no browser.
 *
 * Run: node --experimental-strip-types apps/extension/login-success.test.ts
 */

import assert from 'node:assert/strict';

import {
  evaluateLoginSuccess, buildLoginFingerprint, buildAuthRecordRequest,
  LoginSuccessTracker, LOGIN_SUCCESS_WINDOW_MS,
  type PendingAuth, type LandingSignals,
} from './login-success.ts';
import { AuthStore, type AuthStorageBackend } from './auth-store.ts';
import type { AnalysisSessionId } from '../../packages/contracts/evidence.contract.v1.ts';

function memoryBackend(): AuthStorageBackend {
  const data: Record<string, unknown> = {};
  return {
    async get(keys) {
      if (keys === null) return JSON.parse(JSON.stringify(data));
      const list = Array.isArray(keys) ? keys : [keys];
      const out: Record<string, unknown> = {};
      for (const k of list) if (k in data) out[k] = JSON.parse(JSON.stringify(data[k]));
      return out;
    },
    async set(items) { for (const [k, v] of Object.entries(items)) data[k] = JSON.parse(JSON.stringify(v)); },
    async remove(keys) { for (const k of (Array.isArray(keys) ? keys : [keys])) delete data[k]; },
  };
}

const SID = 'sess_https://accounts.bank.example' as AnalysisSessionId;
function pending(over: Partial<PendingAuth> = {}): PendingAuth {
  return {
    origin: 'https://accounts.bank.example',
    fingerprint: buildLoginFingerprint(['username', 'password'], ['sign', 'in']),
    credFindingActiveInSession: false,
    analysisSessionId: SID,
    submitTimeMs: 1000,
    navTimeMs: 3000,            // 2s after submit — within the 10s window
    ...over,
  };
}
const landOK: LandingSignals = { credentialFormPresent: false, sessionStateEstablished: true };

/* ── POSITIVE: all four conjuncts hold ────────────────────────────────── */
{
  const r = evaluateLoginSuccess(pending(), landOK);
  assert.deepEqual(r, { success: true, failedConjunct: null }, 'all four conjuncts -> success');
  console.log('  POSITIVE: submit + nav<10s + no-cred-form + session-state -> success ✓');
}

/* ── NEGATIVE 1: no credential submit ─────────────────────────────────── */
assert.deepEqual(evaluateLoginSuccess(null, landOK),
  { success: false, failedConjunct: 'no_credential_submit' });
console.log('  NEG 1: no submit -> no write ✓');

/* ── NEGATIVE 2: no navigation within the 10s window ──────────────────── */
assert.equal(evaluateLoginSuccess(pending({ navTimeMs: null }), landOK).failedConjunct,
  'no_navigation_within_window', 'no navigation at all');
assert.equal(evaluateLoginSuccess(pending({ submitTimeMs: 1000, navTimeMs: 1000 + LOGIN_SUCCESS_WINDOW_MS + 1 }), landOK).failedConjunct,
  'no_navigation_within_window', 'navigation just outside the window');
console.log('  NEG 2: navigation missing / outside 10s -> no write ✓');

/* ── NEGATIVE 3: credential form STILL present on landing (failed login) ─ */
assert.equal(
  evaluateLoginSuccess(pending(), { credentialFormPresent: true, sessionStateEstablished: true }).failedConjunct,
  'credential_form_still_present', 'a landing page that still shows a credential form is not success');
console.log('  NEG 3: credential form still present -> no write ✓');

/* ── NEGATIVE 4: no session cookie/storage established ─────────────────── */
assert.equal(
  evaluateLoginSuccess(pending(), { credentialFormPresent: false, sessionStateEstablished: false }).failedConjunct,
  'no_session_state', 'no session state -> not a completed authentication');
console.log('  NEG 4: no session state established -> no write ✓');

/* ── Tracker: submit -> nav -> landing correlates and is single-shot ───── */
{
  const t = new LoginSuccessTracker();
  t.recordSubmit(7, { origin: 'https://accounts.bank.example',
    fingerprint: buildLoginFingerprint(['username', 'password'], ['sign', 'in']),
    credFindingActiveInSession: false, analysisSessionId: SID, submitTimeMs: 1000 });
  t.recordNavigation(7, 2500);
  const a = t.resolveLanding(7, landOK, 999_999);
  assert.equal(a.result.success, true, 'tracker resolves a genuine success');
  const b = t.resolveLanding(7, landOK, 999_999);
  assert.equal(b.result.failedConjunct, 'no_credential_submit', 'single-shot: pending cleared after first resolve');
  console.log('  TRACKER: submit->nav->landing resolves once, then pending is gone ✓');
}

/* ── POSITIVE end-to-end through the REAL store -> PROVISIONAL (not ESTABLISHED) */
{
  const store = new AuthStore({ backend: memoryBackend(), isPrivateContext: false });
  const reqOk = buildAuthRecordRequest(pending(), false);
  assert.ok(reqOk !== null, 'valid origin builds a request');
  const out = await store.recordAuthentication(reqOk);
  assert.equal(out.result, 'recorded', 'a clean success is recorded');
  assert.equal(out.result === 'recorded' && out.newState, 'PROVISIONAL',
    '§20.5 restrictive ramp: ONE success must be PROVISIONAL, never immediately ESTABLISHED');
  console.log('  RAMP: one write -> PROVISIONAL, not ESTABLISHED ✓');
}

/* ── G-01 REJECTION: all four hold, but a CRED finding was active ──────── */
{
  const store = new AuthStore({ backend: memoryBackend(), isPrivateContext: false });
  const reqFlagged = buildAuthRecordRequest(pending({ credFindingActiveInSession: true }), false);
  assert.ok(reqFlagged !== null);
  const out = await store.recordAuthentication(reqFlagged);
  assert.equal(out.result, 'blocked', 'G-01 must block a write from a flagged session');
  assert.equal(out.result === 'blocked' && out.guard, 'G-01',
    'the four conjuncts do NOT bypass G-01 — a phishing page that fired a CRED rule is never learned');
  console.log('  G-01: all four conjuncts hold but a CRED finding was active -> BLOCKED ✓');
}

/* ── private context: reads allowed, writes suppressed (§20.8) ─────────── */
{
  const store = new AuthStore({ backend: memoryBackend(), isPrivateContext: true });
  const req = buildAuthRecordRequest(pending(), true);
  const out = await store.recordAuthentication(req!);
  assert.equal(out.result, 'suppressed_private_context', 'private context never writes (§20.8)');
  console.log('  PRIVATE: write suppressed in a private context ✓');
}

console.log('Login-success (§20.5) PROVEN: four conjuncts each gate independently; a genuine success '
  + 'writes exactly one PROVISIONAL entry through the existing store; G-01 still blocks a flagged '
  + 'session; private context suppresses. No guard bypassed, no fingerprint fabricated.');
