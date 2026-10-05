# DEFECT-46 — decision packet (CRED-01/07 benign false positives on legitimate cross-domain form actions)

**Prepared 2026-10-05 by the implementing session. Routes, does not decide.** Three
options already on record; one paragraph each on cost, what it fixes / does not fix,
and new failure modes; then my recommendation (clearly labelled as a recommendation,
not a ruling). **Awaiting Architecture Owner signature.**

## The defect, restated (not re-investigated)

On the 34,631 corpus, CRED-01 and CRED-07 produce **13 benign firings across 11
snapshots / 7 `page → off-site-action` domain pairs** (DEFECT-46; GROUND-TRUTH §5):

| Page (benign) | Off-site form action | Rule(s) | Class |
|---|---|---|---|
| porkbun.com | list-manage.com (Mailchimp) | CRED-07 | third-party SaaS form processor |
| yotpo.com | hsforms.com (HubSpot) | CRED-07 | third-party SaaS form processor |
| therapservices.net | salesforce.com | CRED-07 | third-party SaaS form processor |
| va.gov | govdelivery.com (Granicus) | CRED-07 | third-party SaaS form processor |
| keirin.jp | google.co.jp | CRED-01 | Google-hosted form/SSO |
| trenitalia.com | lefrecce.it | CRED-01+07 | **same operator**, different registrable domain |
| myhostadmin.net | yunyou.top | CRED-01+07 | genuinely ambiguous (the one unclear case) |

Root cause: `notSameSite(actionRegistrableDomain, url.registrableDomain)` cannot
distinguish "credentials posted to an attacker domain" from "a form posted to the
site's own SaaS vendor or sibling brand." **The dominant class (4 of 7 pairs, 7 of 11
snapshots) is third-party SaaS form processors**; same-entity siblings and Google
forms are the rest. The weights involved remain **Unvalidated** (Calibration /
Rule-Weight reports).

---

## Option (a) — known-form-processor allowlist

**Implementation cost — low-to-moderate, plus ongoing maintenance.** A static set of
known form-handler registrable domains (`list-manage.com`, `hsforms.com`,
`salesforce.com`, `govdelivery.com`, `formspree.io`, `google.com`, …). When a form's
`actionRegistrableDomain` is on the set, the `notSameSite` arm is treated as same-site
(suppressed). The real cost is *where it lives and how it's governed*: it should be a
declared `refinementSet` in the rule set with a V-check that it is non-empty and
curated (not a hidden module constant), so it is auditable like `executableTypes`. The
list needs periodic updates as new SaaS processors appear.

**What it fixes / does not fix.** Fixes exactly the measured dominant class — the four
SaaS-processor pairs — *if and only if each processor domain is listed*. Does **not**
fix same-entity siblings (trenitalia→lefrecce) unless those are separately added, and
does **not** fix novel/unlisted processors (an allowlist is never complete, so recall
of "benign" is always partial). The ambiguous myhostadmin→yunyou.top case stays.

**New failure modes.** An allowlist is a trust-list, therefore an evasion surface: a
phishing page that posts credentials to an allowlisted processor domain — or a
look-alike that the matcher treats as allowlisted — is silently exonerated (false
negative on the real threat). Compromise or abuse of a legitimate processor becomes a
blind spot. Maintenance drift (stale list) silently reintroduces the FPs it was meant
to remove.

---

## Option (b) — same-registrant / same-entity check

**Implementation cost — high; needs a capability the engine does not have.** Deciding
that action-domain and page-domain are the same real-world entity requires registrant
data (WHOIS — not in the evidence contract, not passively collectable, rate-limited,
frequently privacy-proxied), or org-level TLS/ASN signals (also not currently
collected), or a curated sibling-domain map (which is just a different allowlist with
the same maintenance burden). A genuine registrant lookup adds a network dependency
and a new trust input, in tension with the local-only / passive Phase-I posture.

**What it fixes / does not fix.** Fixes the same-entity sibling case
(trenitalia→lefrecce) *if* an entity source exists. Critically, it **misses the
dominant SaaS class**: Mailchimp is a *different* real-world entity from porkbun, so a
same-entity check correctly says "not the same entity" and would **not** suppress the
Mailchimp/HubSpot/Salesforce/GovDelivery firings — i.e. it addresses the minority (≈2
of 7 pairs) and leaves the majority (≈4 of 7) firing.

**New failure modes.** Registrant/WHOIS is spoofable and privacy-proxied, so the
signal is weak and gameable; a curated map drifts; and introducing WHOIS/ASN lookups
breaks the "no network side-channel, passive capture" posture and adds latency and a
new external dependency to every pass with an off-site action.

---

## Option (c) — lean on CRED-02's auth-store cross-origin logic instead

**Implementation cost — low (no new mechanism), but a semantic reframing.** Accept
that CRED-01/07's `notSameSite` arm is structurally noisy on cross-domain form
actions, and treat the AuthStore / CRED-02 path as the authoritative impersonation
detector — optionally gating or down-weighting CRED-01/07 when the action domain is
one the AuthStore recognizes as legitimately used by this user.

**What it fixes / does not fix.** Reuses an existing store with no new trust-list to
maintain. But the AuthStore is populated only by the user's *own successful logins*,
and the benign SaaS form targets are POST endpoints the user never logs into
(`list-manage.com` is a newsletter POST, not an account) — so they would never appear
in the AuthStore, and CRED-02/auth-store recognition would **not** suppress the
dominant SaaS FPs either. Its real effect is to down-weight CRED-01/07 and rely on
CRED-02 for genuine impersonation.

**New failure modes.** Down-weighting CRED-01/07 directly reduces recall on genuine
off-origin credential posts — which are the real phishing signal CRED-01 exists to
catch (and CRED-01 is the most stable predictor measured: precision 0.983). AuthStore
cold-start (empty store, a fresh user) gives no protection. It conflates two distinct
threat models (off-origin post vs. known-brand impersonation) and trades a
false-positive problem for a false-negative one on the project's strongest rule.

---

## My recommendation (NOT a ruling — Architecture Owner decides)

**I recommend Option (a), narrowly scoped, with a proper governance home — OR an
explicit "accept and document" deferral.** Reasoning, grounded in the measured
distribution:

- The FP distribution is dominated by third-party SaaS form processors (4 of 7
  pairs). **Only (a) targets that class.** (b) structurally misses it (different
  entity) and demands a capability we lack; (c) structurally misses it (not in the
  AuthStore) and pays for it in recall on CRED-01, the strongest rule.
- Scope (a) to **suppress only the CRED-07 aggravator noise** (concealed + off-site on
  a listed processor), **not** CRED-01's core off-origin signal, to avoid trading away
  recall — CRED-07 accounts for 9 of the 13 FPs and is the weaker signal; CRED-01's 4
  FPs (keirin→google, trenitalia→lefrecce, myhostadmin→yunyou.top) are a different,
  smaller set where an allowlist is less clearly right.
- Put the list in a declared `refinementSet` with a V-check, so it is auditable and
  cannot silently rot — the allowlist's evasion risk is real and must be visible.

**The honest alternative is to do nothing and document it:** the FPs are low-volume
(11 snapshots / 7 domains), the weights are Unvalidated anyway, and an allowlist adds
a standing evasion surface. If the Architecture Owner judges the maintenance +
evasion cost of (a) to outweigh 11 corpus FPs, "accept, record in DEFECT-46, revisit
when weights are validated" is a defensible Phase-I stance.

**Pick in one line and I will implement exactly that; I have picked nothing here.**
