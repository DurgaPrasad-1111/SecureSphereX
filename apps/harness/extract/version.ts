/**
 * Extractor identity — the second half of S-6's determinism condition.
 *
 * `snapshot.format.v1.ts:277-278`, verbatim:
 *
 *   S-6  Re-extraction is deterministic: identical RawMaterial + identical
 *        extractorVersion ⇒ identical SecurityEvidence.
 *
 * S-6 is conditioned on `extractorVersion`, so the version must be a REAL
 * value that changes when derivation logic changes — not a placeholder. Two
 * snapshots extracted under different versions are not required to agree, and
 * a version that never moves would make S-6 unfalsifiable in the other
 * direction: it would silently promise agreement across genuinely different
 * logic.
 *
 * BUMP THIS whenever any extract/*.ts derivation changes observable output.
 */
export const EXTRACTOR_VERSION = 'extract-v0.1.0' as const;

/**
 * The PSL snapshot this extractor actually bundles.
 *
 * DEC-27 ruling 3: `rulesets/rules-v0.1.0.json` declares
 * `pslVersion: "tldextract==5.3.0 (bundled snapshot sha256:b693…)"`, and
 * `tools/capture/capture.py` computes the corpus SPLIT KEYS with that same
 * library. This extractor uses `tldts` instead, so it ships a DIFFERENT PSL
 * snapshot from the one the frozen rule set declares.
 *
 * `registrableDomain` is the field CRED-01 and CRED-07 both key on, so a
 * suffix-boundary disagreement changes findings while `pslVersion` still
 * claims tldextract. This constant exists so V-15 (DEC-27 ruling 3a, NOT YET
 * BUILT) has something to compare the rule set's declaration against.
 *
 * ⚠️ Until V-15 exists, the divergence is unenforced. `psl-conformance
 * .fixture.test.ts` covers the four agreed boundary cases empirically, which
 * is a floor, not the gate.
 */
export const BUNDLED_PSL = 'tldts@7.4.11' as const;

/**
 * The rule set's `pslVersion` string this extractor has been CONFORMANCE-TESTED
 * against, copied verbatim.
 *
 * ⚠️ WHY THIS EXISTS RATHER THAN A DIRECT COMPARISON. `BUNDLED_PSL` and this
 * constant name DIFFERENT LIBRARIES — `tldts@7.4.11` versus
 * `tldextract==5.3.0`. They are not comparable strings and no string
 * transformation makes them so: different projects, different version lines,
 * different PSL snapshot identities. A V-15 that string-compared them would
 * either fail permanently (they will never match) or, if fudged into passing,
 * assert nothing at all.
 *
 * So the two PSLs are reconciled EMPIRICALLY, not lexically:
 * `psl-conformance.fixture.test.ts` runs both libraries' answers over a fixed
 * set of registrable-domain boundaries and requires agreement. This constant
 * records WHICH declared `pslVersion` that reconciliation was performed
 * against, so V-15 can detect the two ways the pairing can silently rot:
 *
 *   - the rule set's `pslVersion` changes and nobody re-runs conformance
 *     (this constant no longer matches the rule set), or
 *   - the bundled PSL is upgraded and nobody re-runs conformance
 *     (`BUNDLED_PSL` no longer matches `node_modules/tldts`).
 *
 * V-15 checks both. Neither is caught by comparing the two version strings to
 * each other, which is exactly why it does not try to.
 *
 * WHEN YOU CHANGE EITHER SIDE: re-run `npm run test:psl`, then update the
 * corresponding constant here. Updating the constant without re-running the
 * conformance test defeats the entire mechanism.
 */
export const PSL_RECONCILED_AGAINST =
  'tldextract==5.3.0 include_psl_private_domains=true (bundled snapshot sha256:b69315c085d53972724b8f2df111ffc329b0c84fe0a47d62c8c91655cc774a38)' as const;
