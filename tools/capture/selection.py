#!/usr/bin/env python3
"""
Candidate selection for multi-feed diversity capture (DEC-51, Part 6c).

PURE and NETWORK-FREE on purpose. This module decides *which* candidate URLs a
capture run admits — cross-feed dedup, the corpus-wide per-domain cap, and
split inheritance — with no I/O of its own. `capture.py` builds the inputs
(feed lists, INDEX-derived counts/splits, the prior-URL set) and performs the
actual fetching; this module only chooses. That split is what lets the whole
selection be unit-tested deterministically with no browser and no network.

DEC-51 Architecture-Owner amendments honored here:

  #1 Corpus-wide cap. `existing_domain_counts` (built from INDEX.jsonl) counts
     toward N; a domain already at/over N admits zero, a domain at k<N admits
     up to N-k.

  #3 ONE PSL function. This module never computes a registrable domain itself.
     The caller injects `domain_of` — in production that is EXACTLY
     `capture.registrable_domain` (the splitKey helper); in the unit test it is
     the same function imported from capture.py. No second PSL implementation
     exists here (DEFECT-34 lesson).

  #4 Deterministic admission order. Within a registrable domain, when more
     candidates survive than the remaining cap admits, they are admitted in
     ascending Unicode-code-point order of their NORMALIZED url, and the first
     N-k are taken. The final admitted list is then globally sorted by the same
     key, so the set the `--limit` truncation sees is reproducible regardless of
     feed fetch order or dict/set iteration order.

Split inheritance (amendment #2): a candidate whose registrable domain already
appears in INDEX.jsonl inherits that domain's existing split and is NOT part of
the fresh blind set. Only genuinely new registrable domains get a fresh split
via the injected `assign_split_fn`, and only those that land in `test` are the
fresh blind set.
"""

from __future__ import annotations

from typing import Any, Callable, NamedTuple
from urllib.parse import urlsplit, urlunsplit

# Lower number wins when the SAME normalized URL arrives from more than one
# feed within a single run. PhishTank's record is richest (verification flag +
# target brand), so it takes precedence; OpenPhish next; Tranco (negatives)
# last. A URL colliding across a phishing feed and the benign feed is
# vanishingly rare and is resolved here, deterministically, in favor of the
# phishing record — a benign label on a URL a phishing feed also lists would be
# the more dangerous mislabel.
FEED_PRIORITY: dict[str, int] = {"phishtank": 0, "openphish": 1, "tranco": 2}


def normalize_url(url: str) -> str:
    """
    Deterministic, conservative normalization used ONLY as a dedup/ordering key.

    Pure, no network. Intentionally minimal — over-normalizing would merge
    distinct phishing URLs (whose case-sensitive paths and queries are often the
    only thing distinguishing two kits on one host):
      - strip surrounding whitespace
      - lower-case the scheme and host ONLY (never the path/query)
      - drop the fragment (never identifies a distinct capture target)
      - collapse an empty path to '' (so 'https://h' and 'https://h/' match)
    The original url string is what is actually captured; this is key material.
    """
    s = url.strip()
    parts = urlsplit(s)
    scheme = parts.scheme.lower()
    netloc = parts.netloc.lower()
    path = parts.path
    if path == "/":
        path = ""
    return urlunsplit((scheme, netloc, path, parts.query, ""))


def uses_new_selection(feeds: list[str] | None, max_per_domain: int | None) -> bool:
    """
    Routing predicate — the backward-compat guarantee in one place.

    True iff a run must go through the new multi-feed selection path: more than
    one --feed, OR a --max-per-domain cap. A single --feed with no cap (and no
    --feed at all) returns False, so capture.py keeps its original, untouched
    code path and behaves byte-identically to today (DEC-51 backward-compat).
    """
    if max_per_domain is not None:
        return True
    return feeds is not None and len(feeds) > 1


class Admitted(NamedTuple):
    entry: dict[str, Any]   # the original feed entry (url + metadata), with "feed" set
    url: str                # the original (un-normalized) url to capture
    norm: str               # normalized url (dedup/ordering key)
    feed: str               # winning feed for this url
    domain: str             # registrable domain (via injected domain_of)
    split: str              # inherited (existing domain) or freshly assigned (new domain)
    is_new_domain: bool     # True iff the domain had NO prior INDEX.jsonl entry
    is_fresh_blind: bool    # True iff is_new_domain AND split == "test"


class SelectionResult(NamedTuple):
    admitted: list[Admitted]
    dropped_dup_within_run: int    # same normalized url arriving from >1 feed (lower-priority copies)
    dropped_dup_vs_corpus: int     # normalized url already present in the corpus
    dropped_over_cap: int          # rejected because the domain hit the corpus-wide cap
    per_feed_candidates: dict[str, int]
    per_feed_admitted: dict[str, int]
    fresh_blind_domains: list[str]  # sorted, unique: new TEST-split domains (the blind set)


def select(
    candidates: list[dict[str, Any]],
    *,
    existing_domain_counts: dict[str, int],
    existing_domain_splits: dict[str, str],
    seen_urls: set[str],
    max_per_domain: int | None,
    domain_of: Callable[[str], str],
    assign_split_fn: Callable[[str], str],
) -> SelectionResult:
    """
    Choose which candidate URLs to admit. Pure; deterministic for fixed inputs.

    Each candidate dict must carry at least "url" and "feed". All other keys are
    passed through untouched on the admitted entry (so PhishTank metadata rides
    along to capture_one). `seen_urls` and the normalized key use `normalize_url`.
    """
    per_feed_candidates: dict[str, int] = {}
    for c in candidates:
        per_feed_candidates[c["feed"]] = per_feed_candidates.get(c["feed"], 0) + 1

    # ── Layer (i): within-run cross-feed dedup by normalized url ──────────
    # Group by normalized url; keep the entry whose feed has the lowest
    # FEED_PRIORITY. Ties inside one feed are broken by the smallest ORIGINAL
    # url string, so the choice is fully deterministic.
    def rank(c: dict[str, Any]) -> tuple[int, str]:
        return (FEED_PRIORITY.get(c["feed"], 99), c["url"])

    best_by_norm: dict[str, dict[str, Any]] = {}
    dropped_dup_within_run = 0
    for c in candidates:
        n = normalize_url(c["url"])
        prev = best_by_norm.get(n)
        if prev is None:
            best_by_norm[n] = c
        else:
            dropped_dup_within_run += 1
            if rank(c) < rank(prev):
                best_by_norm[n] = c

    # ── Layer (ii): drop normalized urls already in the corpus ────────────
    dropped_dup_vs_corpus = 0
    surviving: list[tuple[str, dict[str, Any]]] = []
    for n, c in best_by_norm.items():
        if n in seen_urls:
            dropped_dup_vs_corpus += 1
            continue
        surviving.append((n, c))

    # ── Corpus-wide cap (amendment #1) + split inheritance (amendment #2) ─
    # Bucket survivors by registrable domain.
    by_domain: dict[str, list[tuple[str, dict[str, Any]]]] = {}
    for n, c in surviving:
        d = domain_of(c["url"])
        by_domain.setdefault(d, []).append((n, c))

    admitted: list[Admitted] = []
    dropped_over_cap = 0
    for domain in sorted(by_domain):  # outer order deterministic; inner sort is the real tie-break
        items = sorted(by_domain[domain], key=lambda nc: nc[0])  # amendment #4: ascending normalized url
        existing = existing_domain_counts.get(domain, 0)
        is_new = domain not in existing_domain_counts
        if domain in existing_domain_splits:
            split = existing_domain_splits[domain]   # inherit (not re-rolled)
        else:
            split = assign_split_fn(domain)          # genuinely new domain
        if max_per_domain is None:
            remaining = len(items)
        else:
            remaining = max(0, max_per_domain - existing)
        for idx, (n, c) in enumerate(items):
            if idx >= remaining:
                dropped_over_cap += 1
                continue
            admitted.append(Admitted(
                entry=c, url=c["url"], norm=n, feed=c["feed"], domain=domain,
                split=split, is_new_domain=is_new,
                is_fresh_blind=(is_new and split == "test"),
            ))

    # Final global order: ascending normalized url, so the set --limit sees is
    # reproducible independent of feed/dict iteration order.
    admitted.sort(key=lambda a: a.norm)

    per_feed_admitted: dict[str, int] = {}
    for a in admitted:
        per_feed_admitted[a.feed] = per_feed_admitted.get(a.feed, 0) + 1

    fresh_blind_domains = sorted({a.domain for a in admitted if a.is_fresh_blind})

    return SelectionResult(
        admitted=admitted,
        dropped_dup_within_run=dropped_dup_within_run,
        dropped_dup_vs_corpus=dropped_dup_vs_corpus,
        dropped_over_cap=dropped_over_cap,
        per_feed_candidates=per_feed_candidates,
        per_feed_admitted=per_feed_admitted,
        fresh_blind_domains=fresh_blind_domains,
    )
