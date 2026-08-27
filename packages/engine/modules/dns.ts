/**
 * DNS Evaluation Module (module 3 of 10, §2.6). Serves NO rules today
 * (docs/pipeline-design-note.md: "SSL and DNS serve no rules — this is why
 * DEC-5 stubs them; nothing downstream currently reads their output").
 *
 * DEC-5 (DECISIONS.md) approved deferring `ssl`/`dns` to CONFORMANT STUBS,
 * not full implementations, until a rule consumes their findings: "a
 * minimal conformant implementation (correct shape, correct `unevaluable`
 * handling, findings populated from evidence) satisfies every architectural
 * requirement until a rule consumes them." This module is that.
 *
 * Contract, verified against evaluation.contract.v1.ts directly (DEC-11):
 * a module consumes only its own evidence category and produces the
 * Evaluability<F> for its FindingsByModule slot. This function is that core
 * computation for the `dns` category: DnsEvidence in, Evaluability<DnsFindings>
 * out.
 *
 * Prohibitions observed (docs/pipeline-design-note.md, "What a module is
 * forbidden from doing"): no correlation with another module's output, no
 * network access, no store access.
 *
 * Unlike ssl.ts, EVERY DnsFindings field is genuinely groundable from
 * DnsEvidence — no structural gap here. `nameServerCount` is the length of
 * `nameServers` (the direct, non-invented projection — same reasoning as
 * url.ts's `subdomainDepth`/redirect.ts's `chainLength`); `cnamePresent` is
 * derived from whether `cnameTarget` was observed at all (the same
 * presence-derivation reasoning as downloadContext.ts's `referrerPresent`).
 * Every other field is a direct passthrough.
 */

import type { DnsEvidence } from '../../contracts/evidence.contract.v1';
import type { DnsFindings, Evaluability } from '../../contracts/evaluation.contract.v1';

/**
 * Every DnsFindings field is non-nullable, so — per evidence.contract.v1.ts
 * I-2, the same reasoning as every other module's non-nullable fields —
 * `resolves`, `aRecordCount`, `aaaaRecordCount`, `nameServers`, `mxPresent`,
 * and `dnssecDeployed` must all be `present`; anything else makes the whole
 * evaluation unevaluable.
 *
 * `cnameTarget` is the one exception, following downloadContext.ts's
 * `referrerPresent` precedent: `present` (a real target) → `cnamePresent:
 * true`, `absent` (looked, genuinely no CNAME — the ordinary case for an
 * apex/A-record-only domain) → `cnamePresent: false`, and only
 * `notCollected` (could not look) makes the evaluation unevaluable.
 */
export function computeDnsFindings(evidence: DnsEvidence): Evaluability<DnsFindings> {
  if (
    evidence.resolves.state !== 'present' ||
    evidence.aRecordCount.state !== 'present' ||
    evidence.aaaaRecordCount.state !== 'present' ||
    evidence.nameServers.state !== 'present' ||
    evidence.mxPresent.state !== 'present' ||
    evidence.dnssecDeployed.state !== 'present' ||
    evidence.cnameTarget.state === 'notCollected'
  ) {
    return { status: 'unevaluable', reason: 'required_evidence_not_collected' };
  }

  const findings: DnsFindings = {
    resolves: evidence.resolves.value,
    aRecordCount: evidence.aRecordCount.value,
    aaaaRecordCount: evidence.aaaaRecordCount.value,
    nameServerCount: evidence.nameServers.value.length,
    cnamePresent: evidence.cnameTarget.state === 'present',
    mxPresent: evidence.mxPresent.value,
    dnssecDeployed: evidence.dnssecDeployed.value,
  };

  return { status: 'evaluated', findings };
}
