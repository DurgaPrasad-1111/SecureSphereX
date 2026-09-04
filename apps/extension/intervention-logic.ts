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
 * The UI-level record written when a user proceeds past a Medium interstitial.
 *
 * NAMING: this is the interstitial's *override suppression*, deliberately NOT
 * called "A-01". A-01 (§6.4, User-Trusted Origin) is the frozen rule set's real
 * weight-HALVING suppression, which is not built (DEC-16 open). This mechanism
 * only suppresses a re-interstitial and drives G-02 (no auth-store learning) —
 * it changes no scoring and grants no trust. The name is reserved so the two are
 * never conflated when A-01 proper is eventually built.
 *
 * SCOPE: the service worker keys this per NAVIGATION SESSION (tabId, navigationId)
 * — the same per-navigation model DEC-43/44 established — not by origin across
 * navigations. `origin` is carried only to verify the record belongs to the page
 * being evaluated.
 */
export interface InterventionOverrideSuppression {
  readonly origin: string;
  readonly tier: RiskTier;
  readonly kind: 'intervention-override-suppression';
  readonly at: number;
}

/**
 * §9.4 outcomes, with §11.3/§11.4 already applied to `effectiveTier`:
 *  - High (≥60): hard BLOCK. No exception, no bypass — a prior Medium override
 *    does NOT suppress it (this mechanism never applies to a High block).
 *  - Medium (30–59): interstitial, UNLESS the user already overrode it for THIS
 *    origin in THIS navigation session — then the passive badge stands but no
 *    interstitial re-appears.
 *  - Low (<30): passive badge only.
 */
export function decideIntervention(
  effectiveTier: RiskTier,
  override: InterventionOverrideSuppression | null,
  currentOrigin: string,
): InterventionAction {
  if (effectiveTier === 'High') return 'block';
  if (effectiveTier === 'Medium') {
    return override !== null && override.origin === currentOrigin ? 'none' : 'interstitial';
  }
  return 'none';
}
