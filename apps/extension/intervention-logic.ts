/**
 * Tier-2 intervention decision (§9.4, §11.3), browser-free so it is unit-testable
 * with no chrome and no DOM. Given a pass's EFFECTIVE tier — already floored by
 * §11.3's monotonic lock inside `computeEffectiveTier` — decide what the user
 * sees. Role A (service-worker.ts) owns the chrome-side effects; this owns only
 * the decision.
 */

import type { RiskTier } from '../../packages/contracts/passresult.contract.v1';

export type InterventionAction = 'none' | 'interstitial' | 'block';

/**
 * The A-01 (§6.4 User-Trusted Origin) record written when a user proceeds past a
 * Medium interstitial. Scoped to ONE origin for THIS session (kept in
 * chrome.storage.session, so it never crosses a browser restart). It is Role A's
 * audit of the proceed AND the signal that the auth store must not learn trust
 * from this session (G-02). It never modifies the engine suppression pipeline or
 * the frozen rule set (DEC-16 stays open) and never writes cross-session trust.
 */
export interface ProceedRecord {
  readonly origin: string;
  readonly tier: RiskTier;
  readonly suppressionId: 'A-01';
  readonly at: number;
}

/**
 * §9.4 outcomes, with §11.3/§11.4 already applied to `effectiveTier`:
 *  - High (≥60): hard BLOCK. No exception, no bypass — a prior Medium proceed
 *    does NOT suppress it (A-01 never applies to the High-only rules, §6.4;
 *    "never nullifies").
 *  - Medium (30–59): interstitial, UNLESS the user already proceeded on THIS
 *    origin this session — then the passive badge stands but no interstitial
 *    re-appears (the A-01 record's whole purpose).
 *  - Low (<30): passive badge only.
 */
export function decideIntervention(
  effectiveTier: RiskTier,
  proceeded: ProceedRecord | null,
  currentOrigin: string,
): InterventionAction {
  if (effectiveTier === 'High') return 'block';
  if (effectiveTier === 'Medium') {
    return proceeded !== null && proceeded.origin === currentOrigin ? 'none' : 'interstitial';
  }
  return 'none';
}
