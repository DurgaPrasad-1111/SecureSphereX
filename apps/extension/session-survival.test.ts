/**
 * A1.1 EXIT CRITERION test: "Survives worker termination mid-session."
 *
 * Proves the real property, not a proxy. The failure mode this guards against
 * is §11.4's: a Session that has presented an intervention, whose worker is
 * then killed, coming back having FORGOTTEN the intervention — which would let
 * the block be silently withdrawn on the next pass. So the test seeds a
 * genuine `PriorPassState` produced by the ENGINE's own `recordIntervention`,
 * simulates worker death by discarding the SessionStore instance (keeping only
 * the backing bytes), reconstructs from those bytes alone, and asserts the
 * engine-typed intervention state came back intact.
 *
 * Runs under `node --experimental-strip-types` with an in-memory backend — the
 * same interface chrome.storage.session satisfies — so no browser is needed.
 *
 * Run:
 *   node --experimental-strip-types apps/extension/session-survival.test.ts
 */

import assert from 'node:assert/strict';

import {
  SessionStore,
  sessionKey,
  deserializePriorPassState,
  type SessionStorageBackend,
  type SessionKeyParts,
} from './session-store.ts';
import { recordIntervention, computeEffectiveTier } from '../../packages/engine/stage7-8.ts';
import type { PriorPassState } from '../../packages/engine/stage7-8.ts';

/** In-memory stand-in for chrome.storage.session. Serialises through JSON
 *  exactly as the real area does, so nothing that survives here would fail to
 *  survive in the browser (and vice versa). This object IS the "backing bytes"
 *  that persist across a simulated worker death. */
function makeMemoryBackend(): SessionStorageBackend & { dump: () => Record<string, unknown> } {
  const data: Record<string, unknown> = {};
  return {
    async get(keys) {
      if (keys === null) return JSON.parse(JSON.stringify(data));
      const list = Array.isArray(keys) ? keys : [keys];
      const out: Record<string, unknown> = {};
      for (const k of list) if (k in data) out[k] = JSON.parse(JSON.stringify(data[k]));
      return out;
    },
    async set(items) {
      for (const [k, v] of Object.entries(items)) data[k] = JSON.parse(JSON.stringify(v));
    },
    async remove(keys) {
      const list = Array.isArray(keys) ? keys : [keys];
      for (const k of list) delete data[k];
    },
    dump: () => JSON.parse(JSON.stringify(data)),
  };
}

const parts: SessionKeyParts = { tabId: 42, navigationId: 1788000000000 };

// ── (a) start a session (simulates onCommitted) ────────────────────────────
const backend = makeMemoryBackend();
{
  const store = new SessionStore(backend);
  await store.startSession(parts, 'https://login.example/signin', '2026-08-30');
  const created = await store.getSession(parts);
  assert.ok(created !== null, 'session must exist after startSession');
  assert.equal(created.reachedTier, 0, 'a freshly committed session is at Tier 0');
  assert.equal(created.priorPassState, null, 'no intervention yet -> priorPassState null');
}

// ── (b) record state: reach Tier 1, then present a HIGH intervention ────────
// The PriorPassState is built by the engine's OWN recordIntervention, not a
// hand-written literal — the extension persists exactly what the engine emits.
const interventionState: PriorPassState = recordIntervention(null, 'High');
{
  const store = new SessionStore(backend);
  await store.updateSession(parts, { reachedTier: 2 });
  const updated = await store.updateSession(parts, { priorPassState: interventionState });
  assert.ok(updated !== null, 'update must find the session');
  assert.equal(updated.priorPassState?.highestInterventionTier, 'High');
  assert.equal(updated.priorPassState?.interventionPresented, true);
}

// ── (c) simulate worker termination ────────────────────────────────────────
// Drop every in-memory reference to the store. Only `backend`'s bytes remain —
// exactly what chrome.storage.session would hold after the worker is killed.
// (No `store` variable survives this block; the next step must rebuild from
// nothing but the backend.)
const bytesAfterDeath = backend.dump();
assert.ok(
  Object.keys(bytesAfterDeath).includes(sessionKey(parts)),
  'the session bytes must be in storage, not only in a dropped in-memory object',
);

// ── (d) reconstruct from chrome.storage.session (the backend) alone ─────────
const revived = new SessionStore(backend);
const reconstructed = await revived.reconstructAll();

// ── (e) assert the session state survived — specifically PriorPassState ─────
assert.equal(reconstructed.length, 1, 'exactly one live session reconstructed');
const s = reconstructed[0]!;
assert.equal(s.tabId, 42);
assert.equal(s.navigationId, 1788000000000);
assert.equal(s.targetUrl, 'https://login.example/signin');
assert.equal(s.reachedTier, 2, 'reachedTier survived');

// The load-bearing assertion: the ENGINE-typed intervention state is intact,
// and is not merely "some data" -- it deep-equals the PriorPassState the
// engine produced before the worker died.
assert.notEqual(s.priorPassState, null, 'priorPassState survived worker death');
assert.deepEqual(s.priorPassState, interventionState,
  'reconstructed PriorPassState must equal the engine-produced one, field for field');

// And it is a value the ENGINE accepts unchanged: feeding the reconstructed
// state back into computeEffectiveTier must still enforce the §11.4 lock --
// a Low raw tier post-revival cannot de-escalate below the High intervention.
const escalation = computeEffectiveTier('Low', s.priorPassState);
assert.equal(escalation.effectiveTier, 'High',
  'the reconstructed lock must still floor a later pass -- §11.3/§11.4 held across the restart');
assert.equal(escalation.interventionLocked, true,
  'interventionLocked must survive: a block already shown cannot be withdrawn by a worker restart');

// ── negative control: a corrupt stored value must NOT revive as a session ───
await backend.set({ [sessionKey({ tabId: 7, navigationId: 9 })]: { sessionId: 'x', tabId: 'not-a-number' } });
const afterCorrupt = await revived.reconstructAll();
assert.equal(afterCorrupt.length, 1,
  'a malformed record is skipped, not revived as a half-valid session (still just the one good session)');
assert.equal(deserializePriorPassState({ interventionPresented: 'yes' }), null,
  'a malformed PriorPassState degrades to null, never a trusted value');

console.log('A1.1 exit criterion PROVEN: session (incl. engine PriorPassState + §11.4 lock) '
  + 'survives worker termination mid-session; reconstructed state is accepted unchanged by the engine.');
console.log('Negative controls fired: corrupt session skipped; malformed PriorPassState -> null.');
