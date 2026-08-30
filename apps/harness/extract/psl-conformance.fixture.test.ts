/**
 * PSL conformance fixture — DEC-27 ruling 3(b).
 *
 * WHY THIS EXISTS. `rulesets/rules-v0.1.0.json:6` declares
 * `pslVersion: "tldextract==5.3.0 (bundled snapshot sha256:b693…)"`, and
 * `tools/capture/capture.py:224` computes the corpus SPLIT KEYS with that
 * same library. This extractor uses `tldts`. Two different PSL snapshots
 * resolve `registrableDomain` — the field CRED-01 and CRED-07 both key on —
 * and a boundary disagreement would change findings while `pslVersion` still
 * claimed tldextract.
 *
 * The expected values below are not hand-written guesses. They were produced
 * by running BOTH libraries over the same inputs and confirming agreement:
 *
 *   python3 -c "import tldextract; ..."   ->  tldextract 5.3.0
 *   node -e "require('tldts').parse(...)" ->  tldts 7.4.11
 *
 * TWO MODES, and the test says WHICH ONE RAN — it never claims more than it
 * did:
 *
 *   LIVE CROSS-CHECK  `tools/ci/psl-reference.py` is invoked and tldextract's
 *                     answers are compared against tldts's for real. This also
 *                     re-validates the pinned baseline below, so a stale
 *                     expectation cannot survive.
 *   PINNED BASELINE   tldextract is not importable (it is declared in
 *                     requirements.txt but CI installs no Python deps). Only
 *                     tldts-vs-recorded-values is checked. Strictly weaker,
 *                     and reported as such rather than passing silently.
 *
 * PAIRED WITH V-15 (DEC-27 ruling 3a), now built in `validate-ruleset.py`.
 * V-15 gates that both PSLs are pinned and their pairing is declared
 * reconciled; it deliberately does NOT compare `tldextract==5.3.0` with
 * `tldts@7.4.11`, which are different libraries and not comparable strings.
 * This file is the empirical half: V-15 proves the pairing is DECLARED
 * current, this proves the two actually AGREE.
 *
 * Run: npm run test:psl
 */

import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { extractUrlEvidence } from './url.ts';

/**
 * Each entry independently confirmed identical under tldts and tldextract
 * WITH BOTH CONFIGURED AS `capture.py` CONFIGURES THEM (private domains
 * included) — not with library defaults.
 *
 * ⚠️ DEFECT-34 — the first four entries below are the DISCRIMINATING cases.
 * The earlier version of this table asserted `user.github.io -> github.io`,
 * which is what BOTH libraries return AT THEIR DEFAULTS. That agreement was
 * real and worthless: `capture.py` runs with private domains included and
 * returns `evil1.github.io`. The fixture confirmed two defaults matched each
 * other while neither matched the producer.
 *
 * A PSL_PRIVATE case now sits at the top of the table precisely because it
 * FAILS if either side reverts to a default. Do not "simplify" these to the
 * ICANN answers — that is the bug, restored.
 */
const AGREED: readonly { url: string; registrableDomain: string; why: string }[] = [
  { url: 'https://user.github.io/x', registrableDomain: 'user.github.io',
    why: 'PSL PRIVATE section — the discriminating case; ICANN-only yields github.io' },
  { url: 'https://cancelcardiffbahora.vercel.app/', registrableDomain: 'cancelcardiffbahora.vercel.app',
    why: 'PSL PRIVATE — a real phishing host from the live feed; ICANN-only yields vercel.app' },
  { url: 'https://qg77.chris-x.workers.dev/', registrableDomain: 'chris-x.workers.dev',
    why: 'PSL PRIVATE — ICANN-only yields workers.dev' },
  { url: 'https://bucket.s3.amazonaws.com/k', registrableDomain: 'bucket.s3.amazonaws.com',
    why: 'deep PSL PRIVATE suffix; ICANN-only yields amazonaws.com' },
  { url: 'https://example.co.uk/a', registrableDomain: 'example.co.uk',
    why: 'multi-label ICANN suffix — identical under both configs, a control' },
  { url: 'https://school.pvt.k12.ma.us/', registrableDomain: 'school.pvt.k12.ma.us',
    why: 'four-label ICANN suffix — identical under both configs, a control' },
  { url: 'https://accounts.example.com/login', registrableDomain: 'example.com',
    why: 'plain two-label control' },
];

for (const { url, registrableDomain, why } of AGREED) {
  const ev = extractUrlEvidence(url);
  assert.equal(ev.registrableDomain.state, 'present', `${url}: expected a resolved domain (${why})`);
  assert.equal(
    ev.registrableDomain.state === 'present' ? ev.registrableDomain.value : null,
    registrableDomain,
    `${url}: tldts must agree with tldextract 5.3.0 — ${why}`,
  );
}

// A hostname that IS a public suffix in its entirety has no registrable
// domain. `absent()`, never notCollected: the producer looked, and there
// genuinely is no eTLD+1. This maps to UrlFindings.registrableDomain's
// `string | null`, the convention url.ts already documents.
{
  const ev = extractUrlEvidence('https://co.uk/');
  assert.equal(ev.registrableDomain.state, 'absent',
    'a bare public suffix has NO registrable domain — absent, not notCollected');
}

// IP literals bypass the PSL entirely. Same reasoning: genuinely absent.
{
  const ev = extractUrlEvidence('http://192.168.1.1:8080/login');
  assert.equal(ev.isIpLiteral.state === 'present' && ev.isIpLiteral.value, true,
    'dotted-quad host is an IP literal');
  assert.equal(ev.registrableDomain.state, 'absent', 'an IP literal has no registrable domain');
  assert.equal(ev.port.state === 'present' ? ev.port.value : null, 8080,
    'an EXPLICIT port is present(8080)');
}

// The port convention, asserted directly because it is a drafted ruling that
// nothing else pins: inference would collapse these two into one value.
{
  const implicit = extractUrlEvidence('https://example.com/');
  const explicit = extractUrlEvidence('https://example.com:443/');
  assert.equal(implicit.port.state, 'absent',
    'no port written -> absent(); default-port inference is LOSSY and rejected');
  assert.equal(explicit.port.state === 'present' ? explicit.port.value : null, 443,
    'an explicitly-written :443 is present(443)');
  assert.notDeepEqual(implicit.port, explicit.port,
    'the explicit/implicit distinction MUST survive extraction — the whole reason absent() was chosen');
}

// A host that is not an IP literal but merely starts with digits must not be
// misclassified — the anchored full-match in isIpLiteral() guards this.
{
  const ev = extractUrlEvidence('https://123-reg.co.uk/');
  assert.equal(ev.isIpLiteral.state === 'present' && ev.isIpLiteral.value, false,
    'a hostname beginning with digits is NOT an IP literal');
  assert.equal(ev.registrableDomain.state === 'present' ? ev.registrableDomain.value : null,
    '123-reg.co.uk', 'and it still resolves through the PSL normally');
}

// ── LIVE CROSS-CHECK against tldextract, when it is importable ────────────
//
// This is what makes the reconciliation empirical rather than asserted. It
// does TWO things, and the second is the one that keeps this file honest over
// time: it compares tldts against tldextract directly, AND it re-validates the
// pinned AGREED table above against live tldextract output — so a baseline
// that silently went stale is caught rather than trusted forever.

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const urls = AGREED.map((a) => a.url);

const probe = spawnSync(
  'node',
  [join(REPO_ROOT, 'tools', 'ci', 'run-python.mjs'),
    join(REPO_ROOT, 'tools', 'ci', 'psl-reference.py'), ...urls],
  { encoding: 'utf8' },
);

if (probe.status === 0 && probe.stdout.trim() !== '') {
  const ref = JSON.parse(probe.stdout) as {
    library: string; version: string; results: Record<string, string | null>;
    includePrivateDomains?: boolean;
  };

  // DEFECT-34: assert the ORACLE'S CONFIGURATION, not just its answers. An
  // oracle running at defaults would agree with a tldts running at defaults
  // and prove nothing about what capture.py does.
  assert.equal(ref.includePrivateDomains, true,
    'the tldextract oracle MUST run with include_psl_private_domains=True, matching ' +
    'capture.py:86-92. A default-configured oracle verifies the wrong question (DEFECT-34).');

  for (const { url, registrableDomain, why } of AGREED) {
    const theirs = ref.results[url];
    const ev = extractUrlEvidence(url);
    const ours = ev.registrableDomain.state === 'present' ? ev.registrableDomain.value : null;

    // The real conformance assertion: two independent PSL snapshots, same answer.
    assert.equal(ours, theirs,
      `PSL DIVERGENCE on ${url} (${why}): tldts says ${String(ours)}, ` +
      `${ref.library} ${ref.version} says ${String(theirs)}. registrableDomain feeds ` +
      'CRED-01 and CRED-07 — a boundary disagreement changes findings.');

    // The pinned baseline must still describe reality.
    //
    // ⚠️ REDUNDANT BACKSTOP, kept deliberately and labelled honestly. Seeding
    // a tldextract-side drift showed this line never fires: the DIVERGENCE
    // assertion above catches that case first, and the tldts-vs-pinned
    // assertion earlier in the file catches a wrong pinned value. Every
    // reachable failure is caught by one of those two.
    //
    // It is kept because it is the assertion that would matter if the earlier
    // pinned check were ever removed or reordered, and because a redundant
    // check that is DOCUMENTED as redundant costs nothing. It is NOT counted
    // as load-bearing coverage.
    assert.equal(theirs, registrableDomain,
      `PINNED BASELINE STALE for ${url}: this file records ${registrableDomain}, ` +
      `but ${ref.library} ${ref.version} now returns ${String(theirs)}. Update the ` +
      'AGREED table and re-run — do not edit the expectation to match tldts alone.');
  }

  console.log(
    `PSL conformance: LIVE CROSS-CHECK passed — tldts vs ${ref.library} ${ref.version}, ` +
    `${AGREED.length} boundary cases agree, pinned baseline re-validated. Plus 5 controls.`,
  );
} else {
  // status 3 is psl-reference.py's documented "tldextract not importable".
  // Anything else (no python, script missing) lands here too, and is reported
  // rather than swallowed — a conformance test that cannot run must not look
  // like one that ran and passed.
  const why = probe.status === 3
    ? 'tldextract is not importable (declared in requirements.txt)'
    : `psl-reference.py did not run (exit ${String(probe.status)})`;

  // CI sets SSX_REQUIRE_PSL_ORACLE=1 after installing tldextract at the
  // version the rule set declares. There, degrading is NOT acceptable: the
  // live cross-check is the only thing that verifies the two PSLs agree,
  // because V-15's constants are self-attested and a simultaneous update
  // that also edited the expectation table would otherwise pass unchecked.
  // Locally the degrade path stays, so a dev without tldextract can still run
  // the rest of the suite — it just says so loudly.
  if (process.env['SSX_REQUIRE_PSL_ORACLE'] === '1') {
    assert.fail(
      `PSL oracle REQUIRED but unavailable: ${why}. SSX_REQUIRE_PSL_ORACLE=1 forbids ` +
      'the pinned-baseline fallback — without tldextract this test would compare tldts ' +
      'against developer-written expectations, which verifies nothing independent.',
    );
  }

  console.log(
    `PSL conformance: PINNED BASELINE ONLY — ${why}.\n` +
    `  tldts agrees with the ${AGREED.length} recorded boundary values, plus 5 controls.\n` +
    '  ⚠️ This did NOT cross-check tldextract live. Install it (pip install -r ' +
    'tools/capture/requirements.txt) for the full check.',
  );
}
