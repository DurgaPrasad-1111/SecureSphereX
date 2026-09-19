/**
 * Incident History store (dashboard v3) — accumulation incl. Safe, 30-day expiry
 * via an injectable clock (same pattern AuthStore uses), manual clear-all, and
 * no-lost-update under concurrent records.
 *
 * Run: node --experimental-strip-types apps/extension/incident-history.test.ts
 */

import assert from 'node:assert/strict';
import {
  IncidentHistory, INCIDENT_RETENTION_MS, INCIDENTS_KEY,
  type IncidentStorageBackend,
} from './incident-history.ts';

function memoryBackend(): IncidentStorageBackend & { raw: () => unknown } {
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
    raw: () => data[INCIDENTS_KEY],
  };
}

const T0 = Date.parse('2026-09-01T00:00:00Z');

// ── 1. Accumulation across a multi-page session, INCLUDING Safe (Low) ────────
{
  const backend = memoryBackend();
  let clock = T0;
  const h = new IncidentHistory({ backend, now: () => clock });

  clock = T0 + 1 * 1000; await h.record({ url: 'https://safe.example/', domain: 'safe.example', tier: 'Low', fired: [] });
  clock = T0 + 2 * 1000; await h.record({ url: 'https://warn.example/login', domain: 'warn.example', tier: 'Medium', fired: ['CRED-07'] });
  clock = T0 + 3 * 1000; await h.record({ url: 'https://bad.example/login', domain: 'bad.example', tier: 'High', fired: ['CRED-01', 'CRED-06'] });

  const list = await h.list();
  assert.equal(list.length, 3, 'all three page visits recorded');
  assert.deepEqual(list.map((i) => i.tier), ['High', 'Medium', 'Low'], 'newest first');
  assert.ok(list.some((i) => i.tier === 'Low' && i.fired.length === 0), 'a Safe (Low, no rules) page IS recorded — full-history decision');
  assert.deepEqual(list[0]!.fired, ['CRED-01', 'CRED-06'], 'fired rule ids preserved');
  assert.ok(!('score' in list[0]!), 'an incident record carries NO score field');
  console.log('  [1] accumulation: 3 visits recorded newest-first, Safe (Low) included, fired ids kept, no score ✓');
}

// ── 2. 30-day expiry via the injectable clock ────────────────────────────────
{
  const backend = memoryBackend();
  let clock = T0;
  const h = new IncidentHistory({ backend, now: () => clock });

  await h.record({ at: T0, url: 'https://old.example/', domain: 'old.example', tier: 'High', fired: ['CRED-01'] });
  assert.equal((await h.list()).length, 1, 'the old incident is present at T0');

  // Advance the clock just past the 30-day retention window.
  clock = T0 + INCIDENT_RETENTION_MS + 1;
  await h.record({ at: clock, url: 'https://new.example/', domain: 'new.example', tier: 'Low', fired: [] });
  const list = await h.list();
  assert.equal(list.length, 1, 'the 30-day-old incident was pruned; only the fresh one remains');
  assert.equal(list[0]!.domain, 'new.example', 'the surviving incident is the recent one');
  // and it was pruned from STORAGE, not merely filtered on read:
  assert.equal((backend.raw() as unknown[]).length, 1, 'expired incident removed from persisted storage');

  // Exactly-at-the-boundary is retained (>= cutoff).
  clock = T0;
  const h2 = new IncidentHistory({ backend: memoryBackend(), now: () => clock });
  await h2.record({ at: T0, url: 'https://edge.example/', domain: 'edge.example', tier: 'Low', fired: [] });
  clock = T0 + INCIDENT_RETENTION_MS; // exactly 30 days later
  assert.equal((await h2.list()).length, 1, 'an incident exactly at the retention boundary is still retained');
  console.log('  [2] 30-day expiry: aged incident pruned from storage; boundary retained ✓');
}

// ── 3. Manual clear-all ──────────────────────────────────────────────────────
{
  const backend = memoryBackend();
  const h = new IncidentHistory({ backend, now: () => T0 });
  await h.record({ url: 'https://a.example/', domain: 'a.example', tier: 'Medium', fired: ['CRED-07'] });
  await h.record({ url: 'https://b.example/', domain: 'b.example', tier: 'Low', fired: [] });
  assert.equal((await h.list()).length, 2, 'two before clear');
  await h.clearAll();
  assert.equal((await h.list()).length, 0, 'clear-all empties the history');
  assert.equal(backend.raw(), undefined, 'clear-all removes the storage key entirely');
  console.log('  [3] manual clear-all empties history + storage key ✓');
}

// ── 4. No lost update under concurrent records (DEC-44 lesson) ────────────────
{
  const backend = memoryBackend();
  const h = new IncidentHistory({ backend, now: () => T0 });
  const N = 50;
  await Promise.all(Array.from({ length: N }, (_, i) =>
    h.record({ url: `https://x${i}.example/`, domain: `x${i}.example`, tier: 'Low', fired: [] })));
  const list = await h.list();
  assert.equal(list.length, N, `all ${N} concurrent records land — no lost update (got ${list.length})`);
  assert.equal(new Set(list.map((i) => i.id)).size, N, 'every incident has a distinct id');
  console.log(`  [4] concurrency: ${N} concurrent records all persisted, distinct ids, no lost update ✓`);
}

console.log('Incident History PROVEN: full-history accumulation (Safe included), 30-day expiry pruned from storage via injectable clock, manual clear-all, and serialized writes with no lost update. No score stored.');
