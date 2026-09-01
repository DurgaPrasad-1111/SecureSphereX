/**
 * Login-success inference (§20.5) — the PRODUCER of an authStore write.
 *
 * §20.5 verbatim: "Successful authentication … SHALL be inferred from the
 * conjunction of: credential submission, subsequent navigation, absence of a
 * credential interface on the resulting page, and establishment of
 * session-scoped storage or cookie state." Calibrated RESTRICTIVELY — a store
 * that learns slowly is materially safer than one that learns wrongly.
 *
 * This file owns ONLY the detection/inference. The write itself goes through
 * the EXISTING `AuthStore.recordAuthentication`, whose guards G-01 (no learning
 * from a session with an active CRED finding) and G-02 (no learning past an
 * overridden intervention) and the PROVISIONAL→ESTABLISHED ramp are NOT
 * duplicated here — this producer feeds that path, it does not bypass it.
 *
 * The four conjuncts are evaluated by the PURE `evaluateLoginSuccess`, so the
 * inference is deterministic and unit-testable independent of the browser.
 * The stateful `LoginSuccessTracker` correlates the submit (login page) with
 * the landing page's evidence across a navigation, per tab. Worker restart or
 * a missed event fails SAFE (no write) — which is exactly the restrictive
 * direction §20.5 mandates.
 */

import {
  toOrigin,
  type LoginFingerprint, type Origin, type AnalysisSessionId, type CredentialFieldKind,
} from '../../packages/contracts/evidence.contract.v1.ts';
import type { AuthRecordRequest } from '../../packages/contracts/boundary.interfaces.v1.ts';

/** §20.5's "subsequent navigation" window: the main-frame navigation must
 *  commit within this long of the credential submit to be counted. */
export const LOGIN_SUCCESS_WINDOW_MS = 10_000;

/** State captured at credential submit on the LOGIN page. */
export interface PendingAuth {
  readonly origin: string;
  readonly fingerprint: LoginFingerprint;
  /** G-01 input, captured from the login page's own analysis verdict at submit
   *  time: did any CRED-family rule fire on this session? */
  readonly credFindingActiveInSession: boolean;
  readonly analysisSessionId: AnalysisSessionId;
  readonly submitTimeMs: number;
  /** Set when the next main-frame navigation commits; null until then. */
  navTimeMs: number | null;
}

/** Signals from the LANDING page (post-navigation). */
export interface LandingSignals {
  readonly credentialFormPresent: boolean;
  readonly sessionStateEstablished: boolean;
}

export interface LoginSuccessResult {
  readonly success: boolean;
  /** Which conjunct failed (for diagnostics/tests); null on success. */
  readonly failedConjunct:
    | 'no_credential_submit' | 'no_navigation_within_window'
    | 'credential_form_still_present' | 'no_session_state' | null;
}

/**
 * The PURE four-conjunct evaluation. All four must hold, in §20.5's order.
 * No clock, no browser — `pending.navTimeMs` and the landing signals are the
 * observed facts; the caller supplies them.
 */
export function evaluateLoginSuccess(
  pending: PendingAuth | null,
  landing: LandingSignals,
  windowMs: number = LOGIN_SUCCESS_WINDOW_MS,
): LoginSuccessResult {
  // Conjunct 1 — credential submission.
  if (pending === null) return { success: false, failedConjunct: 'no_credential_submit' };
  // Conjunct 2 — subsequent main-frame navigation within the window.
  if (pending.navTimeMs === null
    || pending.navTimeMs < pending.submitTimeMs
    || pending.navTimeMs - pending.submitTimeMs > windowMs) {
    return { success: false, failedConjunct: 'no_navigation_within_window' };
  }
  // Conjunct 3 — no credential interface on the resulting page (the primary
  // failed-login discriminator: a failed login re-shows the form).
  if (landing.credentialFormPresent) return { success: false, failedConjunct: 'credential_form_still_present' };
  // Conjunct 4 — session-scoped storage or cookie state established.
  if (!landing.sessionStateEstablished) return { success: false, failedConjunct: 'no_session_state' };
  return { success: true, failedConjunct: null };
}

/** Build the LoginFingerprint from content-script-observable data. faviconHash
 *  / heroImagePerceptualHash / dominantColors are honestly null/[] — a content
 *  script does not cheaply compute perceptual hashes, and fabricating them
 *  would be worse than absent. fieldComposition + titleTokens are real. */
export function buildLoginFingerprint(
  fieldComposition: readonly CredentialFieldKind[],
  titleTokens: readonly string[],
): LoginFingerprint {
  return {
    fingerprintAlgorithmVersion: 'ssx-ext-fp-1',
    fieldComposition,
    titleTokens,
    faviconHash: null,
    heroImagePerceptualHash: null,
    dominantColors: [],
  };
}

/** Assemble the write request from a successful PendingAuth. Returns null if
 *  the origin string is not a valid Origin (never write a malformed origin).
 *  `interventionOverriddenInSession` is false: the InterventionReporter path
 *  (boundary contract) is not wired yet, so override-state is unobserved — and
 *  false is the value that lets G-02 permit the write; this is a KNOWN GAP,
 *  documented, not a silent assumption. G-01 (credFindingActiveInSession) IS
 *  observed and is the primary phishing guard. */
export function buildAuthRecordRequest(pending: PendingAuth, isPrivateContext: boolean): AuthRecordRequest | null {
  const origin: Origin | null = toOrigin(pending.origin);
  if (origin === null) return null;
  return {
    origin,
    fingerprint: pending.fingerprint,
    credFindingActiveInSession: pending.credFindingActiveInSession,
    interventionOverriddenInSession: false,
    isPrivateContext,
    analysisSessionId: pending.analysisSessionId,
  };
}

/**
 * Per-tab correlation of submit → navigation → landing. In-memory (Map): the
 * submit→landing span is seconds during active navigation, which keeps the MV3
 * worker alive; a restart mid-flow simply loses the pending entry and no write
 * occurs — the safe direction.
 */
export class LoginSuccessTracker {
  readonly #pending = new Map<number, PendingAuth>();

  recordSubmit(tabId: number, p: Omit<PendingAuth, 'navTimeMs'>): void {
    this.#pending.set(tabId, { ...p, navTimeMs: null });
  }

  /** A main-frame navigation committed in this tab. Records the time against
   *  any pending submit; ignored if none pending. */
  recordNavigation(tabId: number, navTimeMs: number): void {
    const p = this.#pending.get(tabId);
    if (p !== undefined && p.navTimeMs === null) p.navTimeMs = navTimeMs;
  }

  /**
   * Evaluate the landing page against the pending submit. On success, returns
   * the pending auth AND clears it (single-shot). On any failed conjunct,
   * clears the pending too (this navigation resolved it — success or not) and
   * returns the result. Returns `{ result, pending: null }` when nothing was
   * pending.
   */
  resolveLanding(tabId: number, landing: LandingSignals, windowMs: number = LOGIN_SUCCESS_WINDOW_MS):
  { result: LoginSuccessResult; pending: PendingAuth | null } {
    const pending = this.#pending.get(tabId) ?? null;
    const result = evaluateLoginSuccess(pending, landing, windowMs);
    // Single-shot: one landing resolves the pending submit either way (success
    // or a failed conjunct). Clearing on failure is the restrictive direction —
    // a stale pending must never linger to be matched against a later,
    // unrelated navigation.
    this.#pending.delete(tabId);
    return { result, pending };
  }
}
