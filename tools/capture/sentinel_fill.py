#!/usr/bin/env python3
"""
SecureSphere X — Tier 4 sentinel-fill (DEC-35, SIGNED 2026-08-30).

Establishes `clientSideTransmissionObserved` -- the one CRED-05 conjunct that
CANNOT be measured passively, because it does not exist until a submission
happens (DEC-29 Tier 4). Fills detected credential fields on a live page with
SYNTHETIC, nonce-tagged sentinel data, submits ONCE via a real click, and
observes -- via the same Tier 1 network-observation logic capture.py already
uses -- whether the resulting request body carries our sentinel token.

⚠️ THIS SUBMITS DATA TO LIVE PHISHING INFRASTRUCTURE. Approved under DEC-35,
strictly scoped. Read DEC-35's five binding conditions before touching this.

SAFETY MODEL, per DEC-35:
  * Synthetic data only -- no real credentials, no real email, no PII. Every
    value carries a per-run nonce and is self-evidently non-functional. The
    email domain is `.invalid` (RFC 2606, can never resolve to a real mailbox).
  * Single-shot per URL. One submission, no retries, no repeated interaction.
  * Five abort guards (file upload / payment / CAPTCHA / Tranco-top-10k domain
    / no credential field) -- ANY hit SKIPS the URL, never proceeds.
  * --dry-run is the DEFAULT. --live is required to actually fill and submit.
  * Output goes to sentinel-runs/<timestamp>.jsonl ONLY. NEVER corpus/, NEVER
    INDEX.jsonl -- a sentinel-filled page was interfered with, not observed,
    and must never enter the passively-observed corpus (DEC-35 condition 4).
  * The request BODY is never stored (§20.2). Only the boolean "our nonce was
    in the body" and the destination endpoint are recorded.

USAGE
  python sentinel_fill.py                 # DRY-RUN: liveness probe + guards only
  python sentinel_fill.py --live          # actually fill + submit (3-5 URL sample)
  python sentinel_fill.py --limit 5       # cap the candidate count
"""

from __future__ import annotations

import argparse
import json
import sys
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

# Reuse capture.py's own constants and PSL logic -- same selector Tier 3 uses,
# same registrable-domain derivation the corpus split uses. NOT reimplemented.
sys.path.insert(0, str(Path(__file__).parent))
from capture import (  # noqa: E402
    CREDENTIAL_FIELD_SELECTOR,
    USER_AGENT,
    FETCH_TIMEOUT_MS,
    registrable_domain,
)

REPO_ROOT = Path(__file__).resolve().parent.parent.parent
CORPUS_INDEX = REPO_ROOT / "corpus" / "INDEX.jsonl"
TRANCO_CSV = REPO_ROOT / "tranco_top10k.csv"
SENTINEL_RUNS_DIR = REPO_ROOT / "sentinel-runs"

# ── Sentinel data (DEC-35 condition 1) ───────────────────────────────────
# Per-run nonce makes every value unique and traceable: if one ever surfaces
# in a credential dump it is provably ours, not a victim's. `.invalid` is
# RFC 2606 reserved and can NEVER resolve -- no real mailbox is ever named.
RUN_NONCE = uuid.uuid4().hex[:12]
SENTINEL = {
    "password": f"ssx-sentinel-not-a-real-password-{RUN_NONCE}",
    "email": f"test_ssx_research_{RUN_NONCE}@example.invalid",
    "username": f"test_ssx_research_{RUN_NONCE}",
    "otp": "000000",
    "pin": "0000",
}


def load_tranco_top10k() -> set[str]:
    """Registrable domains of the Tranco top 10k, for the false-positive guard."""
    out: set[str] = set()
    for line in TRANCO_CSV.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line:
            continue
        domain = line.split(",")[-1].strip().lower()
        if domain:
            out.add(domain)
    return out


def load_candidate_urls(limit: int) -> list[dict[str, str]]:
    """
    Candidate pool derived reproducibly from the corpus: post-Tier-3 phishing
    snapshots (last 640 index entries) that have a NON-EMPTY listenerObservations
    -- i.e. Tier 3 already proved a listener is attached, the highest-value
    targets for completing CRED-05's predicate. Deduped by splitKey, first URL
    kept, index order preserved (deterministic, not cherry-picked).
    """
    import gzip

    seen: dict[str, str] = {}
    lines = CORPUS_INDEX.read_text(encoding="utf-8").splitlines()[-640:]
    for line in lines:
        e = json.loads(line)
        if e["label"] != "phishing":
            continue
        path = REPO_ROOT / "corpus" / e["relativePath"].replace("\\", "/")
        try:
            with gzip.open(path, "rt", encoding="utf-8") as gf:
                snap = json.load(gf)
        except Exception:
            continue
        lo = snap["raw"].get("listenerObservations")
        if isinstance(lo, list) and len(lo) > 0:
            if e["splitKey"] not in seen:
                seen[e["splitKey"]] = snap["raw"].get("finalUrl") or snap["raw"].get("requestedUrl")
    return [{"splitKey": k, "url": u} for k, u in list(seen.items())[:limit]]


# ── Guard checks (DEC-35 condition 3 + feed false-positive guard) ─────────
#
# Every guard runs against the SETTLED, rendered page and returns a reason
# string on a hit (which SKIPS the URL) or None. Checked before any fill.

def check_guards(page, url: str, tranco: set[str]) -> tuple[list[str], int]:
    """Returns (list of triggered guard reasons, credential_field_count)."""
    triggered: list[str] = []

    # Guard: feed false-positive. Never automate a submission against a real
    # service on a possibly-bad OpenPhish label.
    try:
        rd = registrable_domain(url)
        if rd in tranco:
            triggered.append(f"tranco_top10k_domain ({rd})")
    except Exception as exc:
        triggered.append(f"registrable_domain_error ({exc})")

    # Guard: file upload.
    if page.query_selector("input[type=file]") is not None:
        triggered.append("file_upload_field")

    # Guard: payment indicators.
    payment_sel = (
        "input[autocomplete^='cc-'], input[name*='card' i], input[name*='cvv' i], "
        "iframe[src*='stripe' i], iframe[src*='braintree' i], iframe[src*='adyen' i], "
        "iframe[src*='paypal' i], iframe[src*='checkout' i]"
    )
    if page.query_selector(payment_sel) is not None:
        triggered.append("payment_indicator")

    # Guard: CAPTCHA.
    captcha_sel = (
        "iframe[src*='recaptcha' i], iframe[src*='hcaptcha' i], "
        "iframe[src*='turnstile' i], .g-recaptcha, .h-captcha, .cf-turnstile"
    )
    if page.query_selector(captcha_sel) is not None:
        triggered.append("captcha")

    # Guard: no credential field (nothing to fill).
    cred_fields = page.query_selector_all(CREDENTIAL_FIELD_SELECTOR)
    cred_count = len(cred_fields)
    if cred_count == 0:
        triggered.append("no_credential_field")

    return triggered, cred_count


def sentinel_kind_for(field) -> str | None:
    """Map a matched field to the sentinel value kind, mirroring classifyField's
    declared-signal tiers (type, then autocomplete). Returns None to skip."""
    ftype = (field.get_attribute("type") or "text").lower().strip()
    autocomplete = (field.get_attribute("autocomplete") or "").lower().strip()
    if ftype == "password":
        return "password"
    if ftype == "email":
        return "email"
    if autocomplete in ("current-password", "new-password"):
        return "password"
    if autocomplete == "email":
        return "email"
    if autocomplete == "username":
        return "username"
    if autocomplete == "one-time-code":
        return "otp"
    # A field matched by the selector via a bare autocomplete attr we don't map
    # -- fill with the username sentinel as a harmless default rather than skip.
    return "username"


def process_url(page, ctx, entry: dict[str, str], tranco: set[str], live: bool) -> dict[str, Any]:
    url = entry["url"]
    result: dict[str, Any] = {
        "splitKey": entry["splitKey"],
        "url": url,
        "live_probe": None,
        "http_status": None,
        "guards_triggered": [],
        "credential_field_count": 0,
        "submitted": False,
        "clientSideTransmissionObserved": None,
        "transmissionEndpoints": [],
        "sentinelReachedEndpoint": None,
        "skip_reason": None,
    }

    # ── Tier 1 network observer, same logic as capture.py's on_request ────
    # Records script-initiated POSTs and, for the sentinel measurement, whether
    # the request body carried OUR nonce. Body itself is never stored (§20.2).
    posts: list[dict[str, Any]] = []

    def on_request(req) -> None:
        try:
            rtype = req.resource_type
            if req.method == "POST" and rtype in ("xhr", "fetch") and not req.is_navigation_request():
                sentinel_in_body = False
                try:
                    body = req.post_data
                    sentinel_in_body = body is not None and RUN_NONCE in body
                except Exception:
                    sentinel_in_body = False
                posts.append({"url": req.url, "sentinelInBody": sentinel_in_body})
        except Exception as exc:
            print(f"  observer error (ignored): {exc}", file=sys.stderr)

    ctx.on("request", on_request)

    # ── Liveness re-probe: navigate, require 200 + settled render ─────────
    try:
        resp = page.goto(url, timeout=FETCH_TIMEOUT_MS, wait_until="load")
        page.wait_for_timeout(2000)
        result["http_status"] = resp.status if resp else None
        result["live_probe"] = bool(resp and 200 <= resp.status < 300)
    except Exception as exc:
        result["live_probe"] = False
        result["skip_reason"] = f"navigation_failed: {exc}"
        return result

    if not result["live_probe"]:
        result["skip_reason"] = f"not_live (status {result['http_status']})"
        return result

    # ── Guards ────────────────────────────────────────────────────────────
    triggered, cred_count = check_guards(page, url, tranco)
    result["guards_triggered"] = triggered
    result["credential_field_count"] = cred_count
    if triggered:
        result["skip_reason"] = "guard: " + ", ".join(triggered)
        return result

    if not live:
        # DRY-RUN stops here: live + all guards passed, but no fill/submit.
        result["skip_reason"] = None
        return result

    # ── LIVE: fill + single submission ────────────────────────────────────
    endpoints_before = {p["url"] for p in posts}
    try:
        fields = page.query_selector_all(CREDENTIAL_FIELD_SELECTOR)
        for field in fields:
            kind = sentinel_kind_for(field)
            if kind is None:
                continue
            try:
                field.fill(SENTINEL[kind])
            except Exception as exc:
                print(f"  fill error on one field (ignored): {exc}", file=sys.stderr)

        # Submit via a REAL click on the actual submit control -- NOT
        # form.submit(), which does not fire onsubmit handlers and would miss
        # exactly the JS-mediated exfiltration CRED-05 exists to detect.
        submit_btn = page.query_selector(
            "button[type=submit], input[type=submit], button:not([type])"
        )
        if submit_btn is not None:
            submit_btn.click(timeout=5000)
        else:
            # Fallback: Enter in the last credential field.
            if fields:
                fields[-1].press("Enter")
        result["submitted"] = True
    except Exception as exc:
        result["skip_reason"] = f"submit_failed: {exc}"
        return result

    page.wait_for_timeout(5000)  # allow the submission's request(s) to fire

    endpoints_after = [p for p in posts if p["url"] not in endpoints_before]
    result["transmissionEndpoints"] = sorted({p["url"] for p in endpoints_after})
    sentinel_hit = next((p for p in endpoints_after if p["sentinelInBody"]), None)
    # clientSideTransmissionObserved is TRUE only if our nonce reached an
    # endpoint -- never merely "a POST occurred" (DEC-29 Tier 4 / DEFECT-32).
    result["clientSideTransmissionObserved"] = sentinel_hit is not None
    result["sentinelReachedEndpoint"] = sentinel_hit["url"] if sentinel_hit else None
    return result


def main() -> int:
    ap = argparse.ArgumentParser(description="Tier 4 sentinel-fill (DEC-35)")
    ap.add_argument("--live", action="store_true",
                    help="Actually fill + submit. Without this, DRY-RUN (probe + guards only).")
    ap.add_argument("--limit", type=int, default=5, help="Max candidate URLs (default 5).")
    args = ap.parse_args()

    from playwright.sync_api import sync_playwright

    tranco = load_tranco_top10k()
    candidates = load_candidate_urls(args.limit)

    mode = "LIVE SUBMISSION" if args.live else "DRY-RUN (probe + guards only, NO fill/submit)"
    print(f"=== Tier 4 sentinel-fill — {mode} ===")
    print(f"run nonce: {RUN_NONCE}")
    print(f"candidates: {len(candidates)} (limit {args.limit})")
    print(f"tranco guard set: {len(tranco)} domains\n")

    results: list[dict[str, Any]] = []
    with sync_playwright() as pw:
        browser = pw.chromium.launch(headless=True)
        for entry in candidates:
            ctx = browser.new_context(user_agent=USER_AGENT, ignore_https_errors=True)
            page = ctx.new_page()
            print(f"--- {entry['splitKey']} ---")
            r = process_url(page, ctx, entry, tranco, args.live)
            results.append(r)
            status = (
                "SKIP: " + r["skip_reason"] if r["skip_reason"]
                else ("SUBMITTED, transmission=" + str(r["clientSideTransmissionObserved"]) if args.live
                      else "PASS (would submit in --live)")
            )
            print(f"  live={r['live_probe']} status={r['http_status']} "
                  f"credFields={r['credential_field_count']} -> {status}")
            ctx.close()
        browser.close()

    if args.live:
        SENTINEL_RUNS_DIR.mkdir(parents=True, exist_ok=True)
        ts = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
        out_path = SENTINEL_RUNS_DIR / f"{ts}.jsonl"
        with out_path.open("w", encoding="utf-8") as f:
            for r in results:
                f.write(json.dumps(r, ensure_ascii=False) + "\n")
        print(f"\nWrote {len(results)} results to {out_path}")
        print("(sentinel-runs/ ONLY -- never corpus/, never INDEX.jsonl)")
    else:
        passed = [r for r in results if r["skip_reason"] is None]
        print(f"\nDRY-RUN summary: {len(passed)}/{len(results)} would proceed to submission under --live.")
        for r in results:
            tag = "WOULD SUBMIT" if r["skip_reason"] is None else "excluded"
            print(f"  {r['splitKey']:<40} {tag}"
                  + (f" -- {r['skip_reason']}" if r["skip_reason"] else ""))

    return 0


if __name__ == "__main__":
    sys.exit(main())
