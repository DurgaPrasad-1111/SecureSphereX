/**
 * Multi-pass session orchestration — the browser-free core of DEC-43's
 * production wiring (Option 1). Splits out of `service-worker.ts` exactly so it
 * is testable under `node --experimental-strip-types` with a fake backend and
 * no browser, the same discipline `session-store.ts` follows.
 *
 * Two pieces:
 *   - `DocumentIndex`: the documentId → (tabId, navigationId) bridge. Populated
 *     from `webNavigation.onCommitted` (a genuine browser event) and rebuilt
 *     from persisted `SessionRecord`s after a worker restart. NEVER from a
 *     page-supplied value — the SW attaches `runtime.MessageSender.documentId`,
 *     which the browser mints per document and page JS cannot forge.
 *   - `runPassInSession`: reads the session's committed `priorPassState`, runs
 *     the engine pass with it threaded, then folds the outcome back at the
 *     pass-commit boundary (DEC-43's binding requirement — `recordCommittedPass`
 *     UNCONDITIONALLY, `recordIntervention` only when an intervention was
 *     presented), atomically per session key.
 */

import type { SecurityEvidence } from '../../packages/contracts/evidence.contract.v1';
import type { RuleSet } from '../../packages/contracts/ruleset.format.v1';
import type { AuthStoreReader } from '../../packages/contracts/boundary.interfaces.v1';
import { runAnalysisPass } from '../../packages/engine/pass.ts';
import type { AnalysisPassOutcome } from '../../packages/engine/pass.ts';
import { recordCommittedPass, recordIntervention } from '../../packages/engine/stage7-8.ts';
import type { PriorPassState } from '../../packages/engine/stage7-8.ts';
import { SessionStore, type SessionKeyParts } from './session-store.ts';

/**
 * documentId → session key. A message's `sender.documentId` is fixed to the
 * document that sent it, so a LATE evidence message from a previous page is
 * still attributed to that page's navigation, never to whatever navigation is
 * current on the tab now. In-memory only; rebuilt on wake via `rebuildFrom`.
 */
export class DocumentIndex {
  readonly #map = new Map<string, SessionKeyParts>();

  /** Record the mapping seen at `onCommitted`. Empty documentId is ignored. */
  record(documentId: string, parts: SessionKeyParts): void {
    if (documentId === '') return;
    this.#map.set(documentId, { tabId: parts.tabId, navigationId: parts.navigationId });
  }

  resolve(documentId: string): SessionKeyParts | null {
    return this.#map.get(documentId) ?? null;
  }

  /** Rebuild after a worker restart from persisted records (each carries its
   *  own documentId). Records with an empty documentId are skipped. */
  rebuildFrom(records: readonly { readonly documentId: string; readonly tabId: number; readonly navigationId: number }[]): void {
    for (const r of records) {
      if (r.documentId !== '') this.#map.set(r.documentId, { tabId: r.tabId, navigationId: r.navigationId });
    }
  }

  /** Drop mappings for a closed tab (paired with `SessionStore.endTabSessions`). */
  forgetTab(tabId: number): void {
    for (const [docId, parts] of this.#map) {
      if (parts.tabId === tabId) this.#map.delete(docId);
    }
  }
}

export interface RunPassInSessionArgs {
  readonly store: SessionStore;
  readonly parts: SessionKeyParts;
  readonly evidence: SecurityEvidence;
  readonly ruleSet: RuleSet;
  readonly storeReader: AuthStoreReader;
  /**
   * Whether Role A presented a user-facing intervention (Warn/Block) for this
   * pass. Structurally `false` today — the Tier-2 gate UI does not exist yet —
   * but the plumbing is real: when it does, this drives `recordIntervention`.
   */
  readonly interventionWasPresented?: boolean;
}

/**
 * One pass, threaded through the persisted session. Returns the engine outcome
 * (the SW still needs it for the verdict/badge). If the session record is
 * missing (unattributed pass), the pass still runs with `prior=null` but nothing
 * is committed back — an unattributable pass must not fabricate or mutate state.
 */
export async function runPassInSession(args: RunPassInSessionArgs): Promise<AnalysisPassOutcome> {
  const record = await args.store.getSession(args.parts);
  const prior = record?.priorPassState ?? null;

  const outcome = await runAnalysisPass(args.evidence, args.ruleSet, args.storeReader, prior);

  if (record !== null) {
    await args.store.recordPassOutcome(args.parts, (latest: PriorPassState | null) => {
      // DEC-43 binding requirement: recordCommittedPass runs on EVERY committed
      // pass, at the commit boundary, independent of intervention. `latest` is
      // re-read inside the store's per-key lock, so a concurrent pass isn't lost.
      let next = recordCommittedPass(latest, outcome.scoring);
      if (args.interventionWasPresented === true) {
        next = recordIntervention(next, outcome.aggregation.effectiveTier);
      }
      return next;
    });
  }

  return outcome;
}
