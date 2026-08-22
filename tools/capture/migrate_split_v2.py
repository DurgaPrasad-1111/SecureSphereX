#!/usr/bin/env python3
"""
SecureSphere X — One-time corpus split migration (split-v1 → split-v2)

Conforms to: D0.5 v1.1.0 §3, Specification v0.8 §13.3

WHY THIS IS PERMISSIBLE EXACTLY ONCE
    D0.5 S-2 forbids a snapshot changing split, because a re-split during
    calibration leaks test data into tuning and invalidates every reported
    number. This migration is permissible ONLY because it precedes all tuning.

    After the first weight or threshold is calibrated, running this is a
    methodological breach. The script refuses to run if it detects evidence
    that calibration has begun.

WHAT IT DOES
    Recomputes SplitAssignment from the registrable domain, records the
    `splitKey`, and reports the resulting distribution and churn.

USAGE
    python migrate_split_v2.py --dry-run
    python migrate_split_v2.py --apply
"""

from __future__ import annotations

import argparse
import gzip
import hashlib
import json
import sys
from collections import Counter, defaultdict
from datetime import date
from pathlib import Path

CORPUS_DIR = Path("corpus")
CALIBRATION_MARKERS = [
    Path("rulesets/.calibrated"),
    Path("reports/metrics"),
]
SPLIT_FUNCTION_VERSION = "split-v2"
SPLIT_PROPORTIONS = {"train": 0.60, "validation": 0.20, "test": 0.20}


def _psl_extractor():
    """
    Offline, deterministic PSL extractor.

    `suffix_list_urls=()` forbids network fetch: the bundled snapshot is used,
    so the derivation is reproducible and cannot silently change between runs.

    `include_psl_private_domains=True` is REQUIRED. Without it every
    `*.github.io`, `*.web.app`, `*.pages.dev` and `*.blogspot.com` host
    collapses to the platform domain — placing every phishing page hosted on
    that platform, and every legitimate one, into a single split. Phishing
    leans heavily on these platforms, so the ICANN-only view produces a
    badly-grouped corpus.
    """
    import tldextract

    return tldextract.TLDExtract(
        suffix_list_urls=(),
        fallback_to_snapshot=True,
        include_psl_private_domains=True,
    )


_EXTRACT = None


def _self_test() -> None:
    """
    Abort if the PSL did not load correctly.

    Execution testing found that a failed PSL fetch degrades SILENTLY: every
    host resolved to the same key, the entire corpus collapsed into one split,
    and the tooling reported success. That is precisely the failure mode
    Specification §15.1 forbids — degraded capability must be loud, never
    silent. This check makes it loud.
    """
    cases = {
        "https://www.example.co.uk/a": "example.co.uk",
        "https://a.b.example.com/x": "example.com",
        "https://evil1.github.io/login": "evil1.github.io",
        "https://192.0.2.44/login": "192.0.2.44",
    }
    for url, expected in cases.items():
        got = registrable_domain(url)
        if got != expected:
            raise SystemExit(
                f"PSL SELF-TEST FAILED: {url} -> {got!r}, expected {expected!r}.\n"
                "The Public Suffix List did not load correctly. Refusing to run: "
                "a degraded PSL collapses the corpus into a single split and "
                "silently destroys the benchmark."
            )


def registrable_domain(url: str) -> str:
    """
    eTLD+1 via the Public Suffix List, or the host itself for IP literals.

    The result is STORED as `splitKey` and never re-derived, so a later PSL
    update cannot retroactively move a snapshot between splits (D0.5 S-2b).

    Raises on a host whose TLD is unknown to the PSL. Degrading to a partial
    key there is what collapsed the corpus during testing.
    """
    global _EXTRACT
    if _EXTRACT is None:
        _EXTRACT = _psl_extractor()

    ext = _EXTRACT(url)

    # IP literals have no registrable domain; the host IS the unit.
    if ext.ipv4 or (ext.domain.startswith("[") and ext.domain.endswith("]")):
        return ext.domain.lower()

    if not ext.suffix:
        raise ValueError(
            f"Unknown public suffix for {url!r} (domain={ext.domain!r}). "
            "Either the bundled PSL snapshot is stale relative to this TLD, or "
            "the host is a reserved/special-use name. Resolve deliberately — "
            "do not fall back to a partial key."
        )

    return f"{ext.domain}.{ext.suffix}".lower()


def assign_split(split_key: str) -> str:
    digest = hashlib.sha256(split_key.encode()).hexdigest()
    bucket = int(digest[:8], 16) / 0xFFFFFFFF
    if bucket < SPLIT_PROPORTIONS["train"]:
        return "train"
    if bucket < SPLIT_PROPORTIONS["train"] + SPLIT_PROPORTIONS["validation"]:
        return "validation"
    return "test"


def guard_against_post_calibration_run() -> None:
    found = [str(m) for m in CALIBRATION_MARKERS if m.exists()]
    if found:
        print("REFUSING TO RUN.", file=sys.stderr)
        print(f"Calibration evidence present: {', '.join(found)}", file=sys.stderr)
        print(
            "Re-splitting after tuning has begun invalidates every reported "
            "metric (D0.5 S-2). If this is a false positive, remove the marker "
            "deliberately and record why.",
            file=sys.stderr,
        )
        sys.exit(2)


def main() -> int:
    ap = argparse.ArgumentParser()
    g = ap.add_mutually_exclusive_group(required=True)
    g.add_argument("--dry-run", action="store_true")
    g.add_argument("--apply", action="store_true")
    args = ap.parse_args()

    guard_against_post_calibration_run()
    _self_test()

    paths = sorted(CORPUS_DIR.rglob("*.json.gz"))
    if not paths:
        print("Corpus is empty; nothing to migrate.")
        return 0

    moved = 0
    unchanged = 0
    already_v2 = 0
    new_dist: Counter[str] = Counter()
    domains_by_split: dict[str, set[str]] = defaultdict(set)
    snapshots_per_domain: Counter[str] = Counter()
    today = date.today().isoformat()

    for path in paths:
        with gzip.open(path, "rt", encoding="utf-8") as f:
            snap = json.loads(f.read())
        split_block = snap.get("split", {})

        if split_block.get("assignmentFunctionVersion") == SPLIT_FUNCTION_VERSION:
            already_v2 += 1
            new_dist[split_block["split"]] += 1

            # DEFECT-6 fix: an already-split-v2 snapshot still counts toward
            # the domain-level distribution and the S-2a straddling check.
            # Key on the STORED splitKey — never re-derive via
            # registrable_domain() here. S-2b requires splitKey be treated
            # as immutable once assigned; re-deriving it would let a later
            # PSL update silently reclassify an already-assigned snapshot.
            split_key = split_block.get("splitKey")
            if not split_key:
                raise ValueError(
                    f"{path}: assignmentFunctionVersion is {SPLIT_FUNCTION_VERSION!r} "
                    "but splitKey is missing. Refusing to skip it silently — that "
                    "would just relocate the vacuous-pass defect (DEFECT-6) rather "
                    "than fix it."
                )
            domains_by_split[split_block["split"]].add(split_key)
            snapshots_per_domain[split_key] += 1
            continue

        url = snap["raw"]["requestedUrl"]
        key = registrable_domain(url)
        new_split = assign_split(key)
        old_split = split_block.get("split")

        if new_split != old_split:
            moved += 1
        else:
            unchanged += 1

        new_dist[new_split] += 1
        domains_by_split[new_split].add(key)
        snapshots_per_domain[key] += 1

        if args.apply:
            snap["formatVersion"] = "1.1.0"
            snap["split"] = {
                "split": new_split,
                "assignmentFunctionVersion": SPLIT_FUNCTION_VERSION,
                "splitKey": key,
                "proportions": SPLIT_PROPORTIONS,
                "assignedOn": today,
            }
            with gzip.open(path, "wt", encoding="utf-8") as f:
                f.write(json.dumps(snap, ensure_ascii=False))

    total = moved + unchanged + already_v2
    print(f"\n{'APPLIED' if args.apply else 'DRY RUN'} — {total} snapshots\n")
    print(f"  reassigned        {moved}")
    print(f"  unchanged         {unchanged}")
    print(f"  already split-v2  {already_v2}")

    print("\nSNAPSHOT-LEVEL DISTRIBUTION")
    for k in ("train", "validation", "test"):
        n = new_dist[k]
        print(f"  {k:<12} {n:>6}  {n / max(total,1):>6.1%}  (target {SPLIT_PROPORTIONS[k]:.0%})")

    # Domains carry unequal snapshot counts, so snapshot-level proportions will
    # NOT match domain-level proportions. Specification §13.3 requires both.
    print("\nDOMAIN-LEVEL DISTRIBUTION")
    dom_total = sum(len(v) for v in domains_by_split.values())
    for k in ("train", "validation", "test"):
        n = len(domains_by_split[k])
        print(f"  {k:<12} {n:>6}  {n / max(dom_total,1):>6.1%}")

    print(f"\nEffective independent units: {dom_total} domains "
          f"(not {total} snapshots).")
    print("Confidence intervals must be computed against the domain count "
          "(§13.3, statistical power).")

    # Verify S-2a: no registrable domain straddles splits.
    straddling = [
        d for d in snapshots_per_domain
        if sum(1 for s in ("train", "validation", "test") if d in domains_by_split[s]) > 1
    ]
    print(f"\nS-2a straddling domains: {len(straddling)} (must be 0)")
    if straddling:
        print("  FAIL:", straddling[:5], file=sys.stderr)
        return 1

    if args.dry_run:
        print("\nNo files written. Re-run with --apply to commit.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
