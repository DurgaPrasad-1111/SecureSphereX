# Blind-Set Pre-Registration — DEC-51 multi-feed capture (2026-10-07 run)

**Purpose.** Pre-register the fresh held-out blind set produced by the Part 6c
multi-feed diversity capture, BEFORE any measurement touches it. These domains
**MUST NOT be scored or evaluated** in this task or any later analysis until a
separate, explicitly pre-registered re-measurement step. Recording the list and
its hash here is what makes that commitment auditable (DEC-51 amendment #2;
[[DEC-49]] pre-registration discipline).

**Definition (DEC-51 amendment #2, as refined by [[DEFECT-47]]).** The fresh
blind set is the set of registrable domains that are, among the **actually
captured** snapshots of this run:
1. **NEW** — the registrable domain had **no prior `INDEX.jsonl` entry** before
   this run (a domain that already existed inherits its split and is NOT blind —
   its earlier snapshots were already observable); and
2. in the **`test`** split.

It is the CAPTURED set, not the admitted set — only domains whose snapshots were
written to the corpus count ([[DEFECT-47]] fix).

## Provenance (honest about the interruption)

| | |
|---|---|
| Capture command | `capture.py --feed openphish --feed tranco --max-per-domain 5 --limit 500 --once` |
| Feeds | OpenPhish (phishing) + Tranco benign tail, ranks 10001–60000 from `tranco-top1m.zip` ([[DEFECT-48]]) |
| Capture date (`capturedOn`) | 2026-10-07 |
| **Status** | **INTERRUPTED at 314 of the 500 target** (the background run stopped when the prior session ended; NOT re-launched). This blind set is derived from the 314 captured snapshots as they stand. |
| Pre-capture `INDEX.jsonl` | 35,087 lines; post-capture 35,401 (+314). `capturedOn==2026-10-07` appears 0× in the pre-capture portion, so the new run is cleanly identifiable (cross-checked two ways: append-order line boundary and `capturedOn`). |

### Captured-set composition (the 314 new snapshots)
- **Per feed:** OpenPhish 64 (phishing) · Tranco tail 250 (benign).
- **Per fetch outcome:** success 131 · dns_resolution_failed 67 · timeout 63 · http_error 42 · navigation_error 8 · tls_handshake_failed 2 · empty_document 1. (The Tranco 10k–60k tail has many dead/parked hosts — expected; failed fetches stay in the corpus per D0.5 S-4/S-5.)
- **New registrable domains:** 311 (2 of the 313 distinct captured domains already existed). Split distribution of the new domains: train 182 · **test 62** · validation 67 (≈60/20/20, the `split-v2` proportions).

## The fresh blind set — 62 domains, DO NOT SCORE

**SHA-256 over the newline-joined, sorted domain list:**
`db47b4906124321a25488d5e86d2043fd90339d38034aa07431461b9e1a66d0a`

```
000webhost.com
004430.xyz
0112532.com
01net.com
037hddmovie.com
0xpokerr.github.io
1-ofd.ru
1000bulbs.com
1000kitap.com
1001fonts.com
100ycdn.com
101.ru
101soundboards.com
10best.com
10xorder.com
111.nhs.uk
115.com
11alive.com
123-hdx.com
12371.cn
123c.vn
123rutor.su
123tor.ru
126.com
12news.com
13.cl
139.com
13newsnow.com
144.in-addr.arpa
148.in-addr.arpa
16388888.com
17.in-addr.arpa
170.in-addr.arpa
17173.com
174.in-addr.arpa
17u.cn
194964.com
195.in-addr.arpa
19fortyfive.com
19lou.com
1ahostingpro.ch
1c-cabinet.ru
1clickvpn.net
1db.click
1domainregistry.com
1filmyfly.online
1h0l00.com
1kuji.com
1news.co.nz
1plus.io
arg247.blogspot.com
banco-general.icu
cuddly-disco-alpha.vercel.app
eventivite.link
injaltransferwillgonabaid.workers.dev
ledzr-live-desktop-en.pages.dev
moonpay-commerce-ijsgokz66-heliofi.vercel.app
norqumi-vrk-zarquni-c9x1dw46.pages.dev
qanxing.com
security-server-landing-page--richuzzy2020.replit.app
trustifybep.vercel.app
zoominvite07.pages.dev
```

The first ~50 are Tranco-tail benign domains (some are reverse-DNS `*.in-addr.arpa`
and parked hosts — kept as captured, honestly); the last ~12 are OpenPhish phishing
domains on shared platforms (`*.vercel.app`, `*.pages.dev`, `*.workers.dev`,
`*.blogspot.com`, `*.replit.app`) — each its own registrable domain under the PSL.

## Held-out discipline

- These 62 domains are **excluded from scoring/evaluation** until a separate
  pre-registered re-measurement. This note is the commitment.
- Verify at re-measurement time that the live set still hashes to the value above
  (and re-derive against the then-current `INDEX.jsonl` if more of the 500-target
  run is later captured — a resumed run would ADD domains, changing the set, so a
  resumed capture requires a fresh pre-registration, not a silent reuse of this one).
- Corpus payloads remain untracked ([[DEC-1]]); only this note and the `INDEX.jsonl`
  growth are committed (as separate commits).
