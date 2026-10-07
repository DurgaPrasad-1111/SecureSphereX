#!/usr/bin/env python3
"""
Unit tests for DEC-51 Part 6c multi-feed selection.

Self-contained: asserts, prints a summary, exits non-zero on the first failure
(wired into verify:all as test:captureselection via run-python.mjs). No network.

Amendment #3 (one PSL) is tested for real: the PSL edge cases exercise the EXACT
`registrable_domain` capture.py uses. CI installs `tldextract` (pinned) but not
`httpx`; capture.py's only top-level third-party import is httpx, so we stub it
when absent purely to import capture and reach its real registrable_domain.
"""

from __future__ import annotations

import os
import sys
import types

_here = os.path.dirname(os.path.abspath(__file__))
if _here not in sys.path:
    sys.path.insert(0, _here)

# Reach capture.registrable_domain without needing httpx installed (CI has none).
try:
    import httpx  # noqa: F401
except ModuleNotFoundError:
    sys.modules["httpx"] = types.ModuleType("httpx")

import capture  # noqa: E402  — for the REAL registrable_domain / assign_split
from selection import (  # noqa: E402
    FEED_PRIORITY, normalize_url, select, uses_new_selection,
)

FAILURES: list[str] = []


def check(name: str, cond: bool, detail: str = "") -> None:
    if cond:
        print(f"  PASS  {name}")
    else:
        FAILURES.append(f"{name}: {detail}")
        print(f"  FAIL  {name}  {detail}")


def entry(url: str, feed: str, **meta) -> dict:
    return {"url": url, "feed": feed, **meta}


# A fake split assigner the pure tests control, so split-dependent assertions
# are deterministic without depending on the real hash buckets.
def fake_split(domain: str) -> str:
    return {"newtest.com": "test", "newtrain.com": "train"}.get(domain, "validation")


print("normalize_url")
check("fragment dropped + scheme/host lowercased",
      normalize_url("HTTPS://Evil.EXAMPLE.com/Path?a=B#frag") == "https://evil.example.com/Path?a=B",
      normalize_url("HTTPS://Evil.EXAMPLE.com/Path?a=B#frag"))
check("empty-path trailing slash collapses",
      normalize_url("https://h.com/") == normalize_url("https://h.com"),
      f'{normalize_url("https://h.com/")!r} vs {normalize_url("https://h.com")!r}')
check("non-empty path case preserved",
      normalize_url("https://h.com/AbC") == "https://h.com/AbC")

print("uses_new_selection (routing / backward-compat)")
check("single feed, no cap -> legacy", uses_new_selection(["phishtank"], None) is False)
check("no feed -> legacy", uses_new_selection(None, None) is False)
check("two feeds -> new path", uses_new_selection(["phishtank", "openphish"], None) is True)
check("cap present -> new path", uses_new_selection(["phishtank"], 5) is True)

print("within-run cross-feed dedup (PhishTank wins)")
r = select(
    [entry("https://dup.com/login", "openphish"),
     entry("https://dup.com/login", "phishtank", target="PayPal")],
    existing_domain_counts={}, existing_domain_splits={}, seen_urls=set(),
    max_per_domain=None, domain_of=capture.registrable_domain, assign_split_fn=fake_split,
)
check("one admitted after within-run dedup", len(r.admitted) == 1, f"admitted={len(r.admitted)}")
check("phishtank record kept on overlap", r.admitted and r.admitted[0].feed == "phishtank")
check("kept record carries PhishTank metadata", r.admitted and r.admitted[0].entry.get("target") == "PayPal")
check("within-run drop counted", r.dropped_dup_within_run == 1, f"={r.dropped_dup_within_run}")
check("FEED_PRIORITY orders phishtank < openphish < tranco",
      FEED_PRIORITY["phishtank"] < FEED_PRIORITY["openphish"] < FEED_PRIORITY["tranco"])

print("vs-corpus dedup")
r = select(
    [entry("https://seen.com/a", "openphish"),
     entry("https://fresh.com/b", "openphish")],
    existing_domain_counts={}, existing_domain_splits={},
    seen_urls={normalize_url("https://seen.com/a")},
    max_per_domain=None, domain_of=capture.registrable_domain, assign_split_fn=fake_split,
)
check("already-captured url dropped", {a.url for a in r.admitted} == {"https://fresh.com/b"})
check("vs-corpus drop counted", r.dropped_dup_vs_corpus == 1, f"={r.dropped_dup_vs_corpus}")

print("corpus-wide cap (amendment #1)")
r = select(
    [entry(f"https://cap.com/{p}", "openphish") for p in ("c", "a", "b")],
    existing_domain_counts={"cap.com": 4}, existing_domain_splits={"cap.com": "train"},
    seen_urls=set(), max_per_domain=5,
    domain_of=capture.registrable_domain, assign_split_fn=fake_split,
)
check("domain at k=4, N=5 admits exactly 1", len(r.admitted) == 1, f"admitted={len(r.admitted)}")
check("admitted is the lexicographically smallest normalized url (tie-break #4)",
      r.admitted and r.admitted[0].url == "https://cap.com/a", r.admitted and r.admitted[0].url)
check("over-cap drops counted", r.dropped_over_cap == 2, f"={r.dropped_over_cap}")

r = select(
    [entry("https://full.com/x", "openphish")],
    existing_domain_counts={"full.com": 5}, existing_domain_splits={"full.com": "test"},
    seen_urls=set(), max_per_domain=5,
    domain_of=capture.registrable_domain, assign_split_fn=fake_split,
)
check("domain already at N admits zero", len(r.admitted) == 0, f"admitted={len(r.admitted)}")

print("split inheritance + fresh blind set (amendment #2)")
r = select(
    [entry("https://old.com/a", "openphish"),
     entry("https://newtest.com/a", "openphish"),
     entry("https://newtrain.com/a", "openphish")],
    existing_domain_counts={"old.com": 2},
    existing_domain_splits={"old.com": "test"},  # existing TEST domain: NOT blind
    seen_urls=set(), max_per_domain=None,
    domain_of=capture.registrable_domain, assign_split_fn=fake_split,
)
by_domain = {a.domain: a for a in r.admitted}
check("existing domain inherits its split", by_domain["old.com"].split == "test")
check("existing TEST domain is NOT a fresh-blind domain",
      by_domain["old.com"].is_new_domain is False and by_domain["old.com"].is_fresh_blind is False)
check("new domain gets assigned split", by_domain["newtest.com"].split == "test")
check("new TEST-split domain IS fresh-blind", by_domain["newtest.com"].is_fresh_blind is True)
check("new TRAIN-split domain is new but NOT blind",
      by_domain["newtrain.com"].is_new_domain is True and by_domain["newtrain.com"].is_fresh_blind is False)
check("fresh_blind_domains = exactly the new TEST domain",
      r.fresh_blind_domains == ["newtest.com"], r.fresh_blind_domains)

print("determinism: feed/order-independent admitted set")
base_candidates = [
    entry("https://d.com/2", "openphish"),
    entry("https://d.com/1", "phishtank"),
    entry("https://e.com/9", "tranco"),
]
kw = dict(existing_domain_counts={}, existing_domain_splits={}, seen_urls=set(),
          max_per_domain=10, domain_of=capture.registrable_domain, assign_split_fn=fake_split)
a1 = [(x.url, x.feed) for x in select(list(base_candidates), **kw).admitted]
a2 = [(x.url, x.feed) for x in select(list(reversed(base_candidates)), **kw).admitted]
check("admitted order identical regardless of input order", a1 == a2, f"{a1} != {a2}")

print("PSL edge cases via capture.registrable_domain (amendment #3, ONE PSL)")
check("co.uk is a single registrable group",
      capture.registrable_domain("https://a.example.co.uk/x") == "example.co.uk"
      and capture.registrable_domain("https://b.c.example.co.uk/") == "example.co.uk",
      capture.registrable_domain("https://a.example.co.uk/x"))
check("github.io is a PRIVATE suffix (per-subdomain registrable)",
      capture.registrable_domain("https://evil1.github.io/login") == "evil1.github.io"
      and capture.registrable_domain("https://evil2.github.io/") == "evil2.github.io",
      capture.registrable_domain("https://evil1.github.io/login"))
# And that select() caps co.uk siblings as ONE domain (uses the same function):
r = select(
    [entry("https://a.example.co.uk/1", "openphish"),
     entry("https://b.example.co.uk/2", "openphish")],
    existing_domain_counts={}, existing_domain_splits={}, seen_urls=set(),
    max_per_domain=1, domain_of=capture.registrable_domain, assign_split_fn=fake_split,
)
check("two co.uk subdomains counted as one domain under the cap",
      len(r.admitted) == 1 and r.dropped_over_cap == 1,
      f"admitted={len(r.admitted)} overcap={r.dropped_over_cap}")
check("two github.io subdomains counted as two domains under the cap",
      len(select(
          [entry("https://x.github.io/1", "openphish"), entry("https://y.github.io/2", "openphish")],
          existing_domain_counts={}, existing_domain_splits={}, seen_urls=set(),
          max_per_domain=1, domain_of=capture.registrable_domain, assign_split_fn=fake_split,
      ).admitted) == 2)

print("DEC-51 benign tail — Tranco rank-band extraction (DEFECT-48)")
# Pure band filter: inclusive bounds, ascending-rank order, out-of-band dropped.
band = capture.filter_rank_band(
    [(1, "a.com"), (10001, "b.com"), (30000, "c.com"), (60000, "d.com"), (60001, "e.com"), (9999, "f.com")],
    10001, 60000)
check("rank band is inclusive and rank-ordered, out-of-band dropped",
      band == ["b.com", "c.com", "d.com"], band)

# Small real zip round-trip (no network): build a top-1m.csv-shaped zip in a
# temp dir and extract a sub-band through the real reader.
import io as _io, zipfile as _zip, tempfile as _tmp  # noqa: E402
from pathlib import Path as _Path  # noqa: E402
with _tmp.TemporaryDirectory() as _d:
    _zp = _Path(_d) / "tranco-top1m.zip"
    _buf = "\n".join(f"{i},host{i}.example" for i in range(1, 101)) + "\n"
    with _zip.ZipFile(_zp, "w") as _zf:
        _zf.writestr("top-1m.csv", _buf)
    got = capture.load_tranco_tail(_zp, lo=10, hi=12)
    check("load_tranco_tail reads a zip and slices by rank",
          got == ["host10.example", "host11.example", "host12.example"], got)
    # Determinism: identical inputs -> identical output.
    check("load_tranco_tail is deterministic", capture.load_tranco_tail(_zp, lo=10, hi=12) == got)
# Absent zip raises loudly (DEC-51: stop, don't silently fall back).
try:
    capture.load_tranco_tail(_Path(_d) / "nonexistent.zip")
    check("absent tranco zip raises", False, "no exception raised")
except SystemExit:
    check("absent tranco zip raises SystemExit (no silent fallback)", True)

print()
if FAILURES:
    print(f"selection_test: {len(FAILURES)} FAILURE(S)")
    for f in FAILURES:
        print(f"  - {f}")
    sys.exit(1)
print("selection_test: ALL PASS")
