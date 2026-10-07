#!/usr/bin/env python3
"""
SecureSphere X — Corpus Capture Pipeline (day one)

Conforms to: D0.5 Snapshot Format v1, Specification v0.7 §13.3
Owner:       Role C

PURPOSE
    Capture RAW MATERIAL ONLY. Evidence extraction is deliberately NOT done
    here: the Evidence Contract will change, and when it does the corpus must
    be re-extractable without re-crawling. Re-crawling is impossible, because
    phishing URLs decay within hours. Raw material captured today stays usable
    against evidence contract v2 and beyond.

WHY THIS RUNS BEFORE EVERYTHING ELSE
    This is the only Stage 0 item with a clock on it. A day not captured is
    positives that cannot be recovered.

USAGE
    pip install playwright httpx && playwright install chromium
    python capture.py --feed phishtank --once
    python capture.py --feed phishtank --poll 30      # every 30 minutes
    python capture.py --tranco tranco_top10k.csv      # negatives
    python capture.py --report                        # outcome distribution
"""

from __future__ import annotations

import argparse
import csv
import gzip
import hashlib
import io
import json
import os
import random
import sys
import time

import httpx
from dataclasses import dataclass, asdict
from datetime import date, datetime, timezone
from pathlib import Path
from typing import Any

# DEC-51 Part 6c — multi-feed selection (pure, network-free). Imported by
# bare name: this script's own directory is on sys.path when it is run
# directly (`python tools/capture/capture.py`) and when the unit test adds
# tools/capture to the path before importing capture. The import is additive;
# the legacy single-feed path below does not touch this module.
_here = os.path.dirname(os.path.abspath(__file__))
if _here not in sys.path:
    sys.path.insert(0, _here)
from selection import select, uses_new_selection, normalize_url  # noqa: E402

SNAPSHOT_FORMAT_VERSION = "1.1.0"
SPLIT_FUNCTION_VERSION = "split-v2"
SPLIT_PROPORTIONS = {"train": 0.60, "validation": 0.20, "test": 0.20}

# Anchored to the script's own location, not cwd (DEFECT-35). A bare
# Path("corpus") resolves relative to wherever the process happens to be
# launched from -- running this script from tools/capture/ (instead of the
# repo root) silently created a SECOND, separate corpus/ under tools/capture/
# rather than erroring, and it took a real invocation actually doing that to
# surface it. The --tranco CSV path already got this exact fix
# (Path(__file__).parent / "tranco_top10k.csv", load_feed_urls); this constant
# never received the same treatment despite being the more consequential of
# the two, since every persisted snapshot and INDEX.jsonl append depends on it.
# tools/capture/capture.py -> tools/capture -> tools -> repo root.
REPO_ROOT = Path(__file__).resolve().parent.parent.parent
CORPUS_DIR = REPO_ROOT / "corpus"
FETCH_TIMEOUT_MS = 15_000

# DEC-51 benign tail (DEFECT-48 fix): the Tranco negatives are widened from the
# old top-10k CSV toward ranks ~10k-60k, sourced from the locally-present
# tranco-top1m.zip at the repo root. Bounds are inclusive and 1-indexed, exactly
# as Tranco's `rank,domain` CSV is (verified: line "10001,mgln.ai" ..
# "60000,zoig.com"). Chosen deliberately: below 10k overlaps the popular sites
# the corpus already holds; 60k keeps the band a well-known-site tail rather than
# long-tail noise. The band is a fixed slice of a fixed file -> deterministic.
TRANCO_TAIL_LO = 10_001
TRANCO_TAIL_HI = 60_000
USER_AGENT = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/127.0.0.0 Safari/537.36"
)

# ── DEC-30 Part 4 — Tier 3 SCAFFOLDING (steps 1-4 only; NOT YET WIRED IN) ──
#
# Same field set `loginInterface.ts`'s `classifyField` Tier 1/2 recognise by
# DECLARED semantics, so the two categories cannot disagree about which
# fields carry credential intent from markup alone. This selector is
# narrower than `classifyField`'s full Tier 3 (name/id guesswork over
# <select>/<textarea> and plain <input type=text|tel|number|hidden>) --
# flagged below at the call site as an open design question, not silently
# glossed over.
CREDENTIAL_FIELD_SELECTOR = "input[type=password], input[type=email], input[autocomplete]"

# listenerOnCredentialField's definition (DEC-30 Part 4, step 4): true iff any
# credential field carries a listener of one of these types. Kept as a set so
# the observation records WHICH types fired, not a collapsed boolean --
# collapsing at capture time destroys information DEC-30 says cannot be
# recovered later.
LISTENER_TYPES_OF_INTEREST = frozenset({"input", "keyup", "keydown", "change", "blur", "paste"})


# ── Split assignment (D0.5 §3, invariants S-2, S-2a, S-2b) ──────────────
#
# Assigned AT CAPTURE TIME, keyed on the REGISTRABLE DOMAIN, immutable after.
#
# Keying on the snapshot id (split-v1) embedded the capture date, so the same
# URL captured on two days landed in two splits. Under 30-minute polling a live
# URL yields roughly a dozen snapshots — meaning essentially every URL straddled
# splits, and the held-out set measured memorisation.
#
# Domain keying does NOT address kit reuse across domains. That residual is
# reported as a metric (§13.3), not engineered away: fixing it would require
# clustering before assignment, surrendering the capture-time immutability that
# makes a re-split impossible rather than merely discouraged.

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

    # DEC-32: the configuration is READ, not hardcoded. tools/ci/psl-config.json
    # is the single source of truth shared by this producer, the extractor
    # (apps/harness/extract/psl.ts) and the conformance oracle
    # (tools/ci/psl-reference.py). DEFECT-34 happened because three copies of
    # this flag existed and one silently differed; there is now one copy.
    #
    # No default is supplied on purpose. A missing or malformed manifest MUST
    # fail loudly -- defaulting here would reintroduce exactly the silent
    # divergence this change removes, and Specification 15.1 requires degraded
    # capability to be loud.
    cfg_path = os.path.join(
        os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'ci', 'psl-config.json')
    with open(cfg_path, encoding='utf-8') as fh:
        cfg = json.load(fh)
    if 'includePrivateDomains' not in cfg:
        raise SystemExit(f"PSL CONFIG INVALID: {cfg_path} has no 'includePrivateDomains'")

    return tldextract.TLDExtract(
        suffix_list_urls=(),
        fallback_to_snapshot=True,
        include_psl_private_domains=bool(cfg['includePrivateDomains']),
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


def snapshot_id_for(captured_at: str, url: str) -> str:
    # captured_at is a full-precision UTC ISO timestamp, unique per capture.
    # DEFECT-7: keying on the day + attempt=1 caused same-day re-captures to
    # collide and overwrite (violates S-1). Timestamp identity makes each
    # capture distinct. NOT keyed on attempt — attemptOrdinal is reserved for
    # real fetch retries (snapshot_format_v1.ts:57). NOT keyed on the day —
    # the retired split-v1 model.
    return hashlib.sha256(f"{captured_at}|{url}".encode()).hexdigest()[:32]


# ── Fetch outcome taxonomy (D0.5 §1) ─────────────────────────────────────
#
# Recorded separately from evidence and never conflated with it. Phishing
# infrastructure cloaks against datacenter IPs far more aggressively than
# legitimate infrastructure. A silent fetch failure is indistinguishable from
# a rule that did not fire, so outcome distribution must be reported alongside
# every confusion matrix.

@dataclass
class FetchRecord:
    outcome: str
    httpStatus: int | None
    durationMs: int
    finalUrl: str | None
    attemptOrdinal: int


def classify_error(exc: Exception) -> str:
    text = str(exc).lower()
    if "timeout" in text:
        return "timeout"
    if "err_name_not_resolved" in text or "dns" in text:
        return "dns_resolution_failed"
    if "ssl" in text or "cert" in text or "tls" in text:
        return "tls_handshake_failed"
    if "too many redirects" in text or "redirect" in text:
        return "redirect_loop"
    return "navigation_error"


# ── DEC-30 Part 4 — Tier 3 SCAFFOLDING: CDP listener detection ───────────
#
# 🚫 HARD CONSTRAINT (DEC-30, verbatim): monkey-patching
# EventTarget.prototype.addEventListener to observe listener registration is
# FORBIDDEN, not disfavoured. Patching runs OUR code inside the hostile page's
# context, where malicious script can detect it, disable it, or feed it false
# data -- a phishing kit that detects instrumentation and behaves benignly
# makes the evidence actively misleading, worse than absent. CDP observes
# from OUTSIDE the page, out of reach of page script. This function must stay
# that way; do not "simplify" it into a page-context patch.
#
# NOT YET WIRED INTO capture_one(). NOT YET RUN. Scaffolding only, per DEC-30
# design review -- deliberately not executed against a live or synthetic page
# in this pass so it does not compete with other work for CPU/browser
# resources on this machine. Needs validation against known synthetic pages
# before it is trusted, exactly as Tier 1 was (DEC-30 Part 1's DCL bug was
# found that way, not any other).
#
# Excludes step 5 (credentialInterfaceInjected via a pre-load MutationObserver)
# by design -- DEC-30 flags that step as unable to run from outside the page,
# lower-confidence, build-last, and possibly warranting its own decision since
# its only consumer (CRED-A1) is already DEC-14 non-functional. Not attempted
# here.
def _collect_listener_observations(ctx, page) -> list[dict[str, Any]]:
    """
    DOMDebugger.getEventListeners over each credential-shaped field, via CDP.

    Intended call site: after page.goto(..., wait_until="load") and the
    existing 2s settle (DEC-30's specified sequence) -- the DOM must already
    be in its settled, post-script state before nodes are queried.

    Returns one entry per matched field carrying at least one listener of
    interest, in the exact shape RawMaterial.listenerObservations expects
    (packages/contracts/snapshot.format.v1.ts, DEC-30/DEC-33/DEC-34
    amendment): `{"mainFrame": bool, "fieldIndex": int, "listenerTypes":
    [...]}`. `fieldIndex` is 0-based, in document order, among matches
    WITHIN ITS OWN DOCUMENT ROOT's DOM.querySelectorAll call -- resets per
    root, not a running count across the whole page. `mainFrame` is true
    only for the page's actual top-level document (the one `renderedDom`
    serializes); every iframe -- same-process or out-of-process -- is
    `mainFrame: false`, because both are equally invisible to
    `loginInterface.ts`'s parse5 pass over `renderedDom` (see the contract
    field's own doc comment).
    """
    # TWO mechanisms, combined -- neither one alone covers both cases, and
    # this was found by testing, not assumed:
    #
    #   1. SAME-PROCESS frames (typical for same-origin src/srcdoc iframes):
    #      reached via the MAIN frame's single session, DOM.getDocument
    #      with pierce=True, then walking the returned tree for each
    #      iframe's `contentDocument` (querySelectorAll does not cross that
    #      boundary on its own, so each nested document is queried
    #      explicitly).
    #
    #   2. OUT-OF-PROCESS frames (genuinely cross-origin, confirmed against
    #      a real cross-origin iframe forced via --site-per-process --
    #      loopback addresses are NOT isolated from each other under
    #      Chromium's default policy, which is why forcing was needed to
    #      test this at all; real cross-site phishing kits on the public
    #      internet get default Site Isolation): `contentDocument` is
    #      entirely ABSENT for these in the pierced tree, so (1) cannot see
    #      them. `ctx.new_cdp_session(frame)` -- Playwright's Python API
    #      accepts a Frame here, not just a Page -- gives a session scoped
    #      to that frame's own out-of-process target, with Playwright
    #      handling Target.attachToTarget internally.
    #
    # `new_cdp_session(frame)` THROWS for a same-process frame ("this frame
    # does not have a separate CDP session, it is a part of the parent
    # frame's session") -- confirmed empirically, not assumed. That error is
    # the signal used below to skip frames already covered by mechanism 1,
    # rather than double-counting them.
    def find_nested_content_documents(node: dict[str, Any]):
        for child in node.get("children") or []:
            yield from find_nested_content_documents(child)
        content_doc = node.get("contentDocument")
        if content_doc is not None:
            yield content_doc
            yield from find_nested_content_documents(content_doc)

    def query_root(cdp_session, doc_root: dict[str, Any], is_main_frame: bool,
                    frame_label: str) -> list[dict[str, Any]]:
        # fieldIndex is this root's OWN 0-based position count -- reset per
        # root (a plain enumerate() over ITS OWN matched nodeIds), never a
        # running count across the whole page. A future field-level consumer
        # correlating back to `renderedDom` needs "Nth match within this one
        # document", not an opaque page-wide counter.
        found: list[dict[str, Any]] = []
        root_id = doc_root["nodeId"]
        try:
            matched = cdp_session.send("DOM.querySelectorAll", {
                "nodeId": root_id,
                "selector": CREDENTIAL_FIELD_SELECTOR,
            })
        except Exception as exc:
            print(f"DOM.querySelectorAll error in {frame_label} (ignored): {exc}", file=sys.stderr)
            return found
        for field_index, node_id in enumerate(matched["nodeIds"]):
            try:
                resolved = cdp_session.send("DOM.resolveNode", {"nodeId": node_id})
                object_id = resolved["object"]["objectId"]
                listeners = cdp_session.send("DOMDebugger.getEventListeners", {"objectId": object_id})
                types = sorted({
                    entry["type"] for entry in listeners.get("listeners", [])
                    if entry.get("type") in LISTENER_TYPES_OF_INTEREST
                })
                if types:
                    found.append({
                        "mainFrame": is_main_frame,
                        "fieldIndex": field_index,
                        "listenerTypes": types,
                    })
            except Exception as exc:
                # One field's introspection failing must not lose the rest --
                # same "observation must not break capture" discipline Tier 1
                # applies to its per-request handler.
                print(f"CDP getEventListeners error for node {node_id} in {frame_label} (ignored): {exc}",
                      file=sys.stderr)
        return found

    def query_session(cdp_session, frame_label: str, top_root_is_main: bool) -> list[dict[str, Any]]:
        # `top_root_is_main` is true ONLY for the page's actual top-level
        # session query. ANY nested content document found via the pierce
        # walk -- even inside that same session -- is a same-process IFRAME,
        # not the top-level document, so it is always queried as
        # is_main_frame=False regardless of which session found it.
        try:
            doc = cdp_session.send("DOM.getDocument", {"depth": -1, "pierce": True})
        except Exception as exc:
            print(f"DOM.getDocument error in {frame_label} (ignored): {exc}", file=sys.stderr)
            return []
        found: list[dict[str, Any]] = list(query_root(cdp_session, doc["root"], top_root_is_main, frame_label))
        for nested_doc in find_nested_content_documents(doc["root"]):
            found.extend(query_root(cdp_session, nested_doc, False, f"{frame_label} (nested same-process iframe)"))
        return found

    results: list[dict[str, Any]] = []

    main_cdp = ctx.new_cdp_session(page)
    try:
        results.extend(query_session(main_cdp, "main frame", top_root_is_main=True))
    finally:
        main_cdp.detach()

    for frame in page.frames:
        if frame == page.main_frame:
            continue
        try:
            frame_cdp = ctx.new_cdp_session(frame)
        except Exception:
            # Expected, common case: a same-process frame has no separate
            # session and was already covered above. Not logged as an error
            # -- this is the normal path for most iframes, not a failure.
            continue
        try:
            results.extend(query_session(frame_cdp, f"out-of-process frame {frame.url}", top_root_is_main=False))
        finally:
            frame_cdp.detach()

    return results


# ── Capture ──────────────────────────────────────────────────────────────

def capture_one(
    url: str,
    label: str,
    feed: str,
    *,
    impersonated_brand: str | None = None,
    feed_verified: bool | None = None,
    reported_on: str | None = None,
    feed_record_id: str | None = None,
    attempt: int = 1,
) -> dict[str, Any]:
    from playwright.sync_api import sync_playwright

    captured_at = datetime.now(timezone.utc).isoformat()   # identity + collision safety
    captured_on = date.today().isoformat()                 # §20.3: body stays day-granular
    sid = snapshot_id_for(captured_at, url)
    split_key = registrable_domain(url)             # split-v2 (D0.5 §3)

    redirect_chain: list[dict[str, Any]] = []
    response_headers: dict[str, str] | None = None
    tls_chain: list[str] | None = None

    # ── DEC-29 Tier 1 — network-layer observation ────────────────────────
    #
    # PASSIVE ONLY. `page.on("request")` observes requests the page makes; it
    # neither injects script into the page nor blocks anything. It adds NO new
    # execution risk: page.goto(wait_until="load") below already executes every
    # script on the page, which is what makes renderedDom useful at all. This
    # records more of what already happens.
    #
    # Deliberately NOT using BrowserContext.route(): route() intercepts and
    # requires an explicit continue/fulfil per request, so a handler bug stalls
    # the page and corrupts the capture. Observation must never be able to
    # change what is captured. on("request") cannot.
    #
    # Ordering is APPEND-ORDER = chronological, and deduplication happens at
    # serialisation, not here — see the S-6 note at the snapshot assembly.
    network_posts: list[dict[str, Any]] = []
    dynamic_scripts: list[dict[str, Any]] = []
    # DEC-30/33/34 Tier 3. Initialized here, not just before its own call
    # site below, so it is always defined for the `raw` dict even if
    # page.goto itself fails before that call site is ever reached.
    listener_observations: list[dict[str, Any]] = []

    # ⚠️ THE BOUNDARY IS DOMContentLoaded, NOT load. This was found by
    # validation against a page whose behaviour was known in advance, and it
    # would not have been found any other way.
    #
    # Playwright's `load` event is delivered to US *after* the page's own
    # `window.addEventListener('load', ...)` handlers have already run and
    # issued their requests. Observed ordering, verbatim from the trace:
    #
    #     req document  GET  kit.html
    #     DCL
    #     req fetch     POST /beacon      <- page's load handler already ran
    #     req script    GET  /late.js     <- page's load handler already ran
    #     LOAD-EVENT                      <- Playwright notifies us LAST
    #
    # A flag set on `load` is therefore ALWAYS False for anything the page does
    # in its own load handler — which is precisely where exfiltration beacons
    # and late script injection live. Gating on it would have reported
    # dynamicScriptLoadCount = 0 across an entire re-captured corpus, silently,
    # with no error to investigate.
    #
    # DOMContentLoaded fires BEFORE the page's load handlers, so it is a sound
    # boundary. Known imprecision, accepted and documented rather than hidden:
    # `async`/`defer` scripts declared in the ORIGINAL HTML can also land after
    # DCL and will be counted as dynamic. That over-counts in a benign
    # direction and is vastly preferable to a flag that is structurally always
    # false.
    dom_content_loaded = False
    rendered_dom: str | None = None
    final_url: str | None = None
    http_status: int | None = None
    outcome = "success"

    started = time.time()
    browser = None
    ctx = None
    with sync_playwright() as pw:
        # Widened to cover launch()/new_context()/new_page(), not just
        # page.goto(). A Chromium launch timeout previously propagated
        # straight out of this function, out of main()'s poll loop, and
        # killed an unattended poller outright — observed directly during
        # this session's first two launch attempts, unrelated to any
        # feed-specific issue. Same principle as load_feed_urls's 429
        # handling: a transient failure here must degrade to a recorded
        # outcome, not take the whole process down.
        try:
            browser = pw.chromium.launch(headless=True)
            ctx = browser.new_context(user_agent=USER_AGENT, ignore_https_errors=True)
            page = ctx.new_page()

            def on_response(resp):
                nonlocal response_headers, http_status
                if resp.request.is_navigation_request():
                    if 300 <= resp.status < 400:
                        redirect_chain.append({
                            "fromUrl": resp.url,
                            "toUrl": resp.headers.get("location", ""),
                            "statusCode": resp.status,
                            "mechanism": "http_3xx",
                        })
                    elif response_headers is None:
                        response_headers = dict(resp.headers)
                        http_status = resp.status

            page.on("response", on_response)

            # ── DEC-29 Tier 1 handlers ───────────────────────────────────
            #
            # Every handler is wrapped: an exception raised inside a Playwright
            # event callback must never propagate into the navigation and turn
            # a successful capture into a failed one. Observation is strictly
            # subordinate to capture — S-8's spirit applied to instrumentation.
            def on_dcl() -> None:
                nonlocal dom_content_loaded
                dom_content_loaded = True

            def on_request(req) -> None:
                try:
                    rtype = req.resource_type

                    # dynamicScriptOrigins / dynamicScriptLoadCount: scripts
                    # fetched AFTER load. Observed at the network layer rather
                    # than by watching <script> insertion, because the page
                    # cannot interfere with our bookkeeping here.
                    if rtype == "script" and dom_content_loaded:
                        dynamic_scripts.append({"url": req.url})

                    # transmissionEndpoints: script-initiated POSTs. Navigation
                    # requests are excluded deliberately — a form submission is
                    # CRED-01's territory (declared action), not CRED-05's
                    # (script-mediated). Conflating them would let CRED-05 fire
                    # on ordinary form posts.
                    if req.method == "POST" and rtype in ("xhr", "fetch") \
                            and not req.is_navigation_request():
                        # post_data raises on some non-UTF8 bodies; the DESTINATION
                        # is what CRED-05 needs, so a body we cannot decode must
                        # not lose us the endpoint.
                        try:
                            has_body = req.post_data is not None
                        except Exception:
                            has_body = None
                        network_posts.append({
                            "url": req.url,
                            "resourceType": rtype,
                            "afterDcl": dom_content_loaded,
                            "hasBody": has_body,
                        })
                except Exception as exc:   # never let observation break capture
                    print(f"on_request observer error (ignored): {exc}", file=sys.stderr)

            page.on("domcontentloaded", on_dcl)
            # Bound at CONTEXT level, not page level: a phishing page may open a
            # popup or use nested frames, and context-level events cover every
            # page and frame in the context. Page-level would miss them.
            ctx.on("request", on_request)

            page.goto(url, timeout=FETCH_TIMEOUT_MS, wait_until="load")
            page.wait_for_timeout(2000)             # allow scripts to settle

            # ── DEC-30 Part 4 / DEC-33 / DEC-34 — Tier 3 listener detection ──
            #
            # Call site is exactly where DEC-30 specifies: after load +
            # settle, so the DOM is in its post-script state before nodes are
            # queried. Wrapped at the top level too, not just internally --
            # `_collect_listener_observations` isolates per-field and
            # per-frame failures already, but the call itself must not be
            # able to turn a successful capture into a failed one, same
            # principle as every other Tier 1/3 observer in this function.
            try:
                listener_observations = _collect_listener_observations(ctx, page)
            except Exception as exc:
                print(f"_collect_listener_observations error (ignored): {exc}", file=sys.stderr)
                listener_observations = []

            rendered_dom = page.content()
            final_url = page.url
            if http_status and http_status >= 400:
                outcome = "http_error"
            elif not rendered_dom or len(rendered_dom) < 200:
                outcome = "empty_document"
        except Exception as exc:                     # noqa: BLE001
            outcome = classify_error(exc)
        finally:
            if ctx is not None:
                ctx.close()
            if browser is not None:
                browser.close()

    duration_ms = int((time.time() - started) * 1000)

    # NOTE: `blocked_or_cloaked` is deliberately NOT auto-classified here.
    # Distinguishing a bot wall from a genuine page needs review, and guessing
    # would silently bias the positive set. Flag for manual triage instead.

    snapshot = {
        "snapshotId": sid,
        "formatVersion": SNAPSHOT_FORMAT_VERSION,
        "capturedOn": captured_on,
        "provenance": {
            "label": label,
            "feed": feed,
            "feedVerified": feed_verified,
            "reportedOn": reported_on,
            "feedRecordId": feed_record_id,
            # Required for CRED-02 validation: the synthetic seeding protocol
            # pairs a phishing snapshot with the benign login snapshot of the
            # brand it targets. Without this at ingest, CRED-02 cannot be
            # validated offline at all.
            "impersonatedBrand": impersonated_brand,
        },
        "split": {
            "split": assign_split(split_key),
            "assignmentFunctionVersion": SPLIT_FUNCTION_VERSION,
            "splitKey": split_key,
            "proportions": SPLIT_PROPORTIONS,
            "assignedOn": captured_on,
        },
        "fetch": asdict(FetchRecord(
            outcome=outcome,
            httpStatus=http_status,
            durationMs=duration_ms,
            finalUrl=final_url,
            attemptOrdinal=attempt,
        )),
        "raw": {
            "requestedUrl": url,
            "finalUrl": final_url,
            "renderedDom": rendered_dom,
            "domContentHash": (
                hashlib.sha256(rendered_dom.encode()).hexdigest()
                if rendered_dom else None
            ),
            "responseHeaders": response_headers,
            "redirectChain": redirect_chain,
            "tlsCertificateChain": tls_chain,
            "dnsRecords": None,
            "screenshotRef": None,

            # ── DEC-29 Tier 1 — scriptRuntime raw observations ────────────
            #
            # ⚠️ NOT YET IN THE FROZEN CONTRACT. `RawMaterial`
            # (packages/contracts/snapshot.format.v1.ts:177-197) has NO field
            # for network observations, and it is frozen — the amendment is a
            # HAND edit by the Architecture Owner, never by tooling. Until it
            # lands, a snapshot carrying this key is a superset of RawMaterial:
            # every existing consumer ignores the extra key, and the extractor
            # reads it only when present. Nothing breaks; nothing type-checks
            # it either. See DEC-29 for the exact proposed amendment.
            #
            # S-6 DETERMINISM. Both lists are sorted and de-duplicated HERE, at
            # serialisation, not at observation time. Request arrival order is
            # a property of the network and the page's scheduler — it is NOT
            # reproducible across captures, and neither is it meaningful. What
            # CRED-05 needs is the SET of endpoints. Sorting makes two captures
            # of an unchanged page produce byte-identical output, which is the
            # same discipline DEFECT-26/27 established for the engine's arrays.
            "scriptRuntimeObservations": {
                "transmissionEndpoints": sorted({p["url"] for p in network_posts}),
                "dynamicScriptOrigins": sorted({s["url"] for s in dynamic_scripts}),
                "dynamicScriptLoadCount": len({s["url"] for s in dynamic_scripts}),
                # Retained unsorted-but-derived detail for diagnosis. Counts
                # only — no bodies are stored: a POST body to a phishing
                # endpoint may contain third-party data, and §20.2's
                # never-transmit discipline argues against warehousing it.
                "postRequestCount": len(network_posts),
                "postAfterDclCount": sum(1 for p in network_posts if p["afterDcl"]),
            },

            # ── DEC-30 Part 4 / DEC-33 / DEC-34 — Tier 3 listener observations ──
            #
            # Now IN the frozen contract (RawMaterial.listenerObservations,
            # packages/contracts/snapshot.format.v1.ts) -- hand-typed by the
            # Architecture Owner per the drafted amendment, unlike
            # scriptRuntimeObservations above whose "not yet in the frozen
            # contract" comment predates its own amendment landing and is now
            # stale (left as-is here rather than edited as part of this
            # unrelated change).
            #
            # Each entry is `{mainFrame, fieldIndex, listenerTypes}`, already
            # shaped exactly as the contract expects by
            # _collect_listener_observations -- no transformation needed here.
            #
            # ⚠️ ALWAYS the real list, including an EMPTY one -- never
            # collapsed to None here. The contract's `null` means
            # specifically "captured before Tier 3 existed" (S-7): every
            # snapshot captured by THIS version of capture.py had Tier 3
            # actually run, so an empty result is a genuine "queried, found
            # no listener", not an absence of observation. Writing None for
            # an empty list would conflate those two -- exactly the I-2
            # failure this project's own S-7 discipline exists to prevent.
            "listenerObservations": listener_observations,
        },
        # Extraction is deliberately deferred (D0.5 §5). Raw material outlives
        # the Evidence Contract.
        "extraction": None,
        "presentsCredentialInterface": None,
    }
    return snapshot


def index_entry_for(snapshot: dict[str, Any], path: Path) -> dict[str, Any]:
    """
    The DEC-1 Implementation §1 field set, derived from a snapshot and the
    path it was (or will be) written to. Shared by append_index() and
    reconcile_index() so the two can't drift out of sync with each other.
    """
    return {
        "snapshotId": snapshot["snapshotId"],
        "capturedOn": snapshot["capturedOn"],
        "label": snapshot["provenance"]["label"],
        "feed": snapshot["provenance"]["feed"],
        "feedRecordId": snapshot["provenance"]["feedRecordId"],
        "impersonatedBrand": snapshot["provenance"]["impersonatedBrand"],
        "split": snapshot["split"]["split"],
        "splitKey": snapshot["split"]["splitKey"],
        "assignmentFunctionVersion": snapshot["split"]["assignmentFunctionVersion"],
        "fetchOutcome": snapshot["fetch"]["outcome"],
        "httpStatus": snapshot["fetch"]["httpStatus"],
        "domContentHash": snapshot["raw"]["domContentHash"],
        "bytes": path.stat().st_size,
        "relativePath": str(path.relative_to(CORPUS_DIR)),
    }


def append_index(snapshot: dict[str, Any], path: Path) -> None:
    """
    DEC-1 Implementation §1. One line per snapshot, append-only. This is the
    record that survives if payload is lost — S-2b, S-3, and S-4/S-5 all
    depend on it. `INDEX.jsonl` is committed; payload under corpus/ is not.
    """
    entry = index_entry_for(snapshot, path)
    index_path = CORPUS_DIR / "INDEX.jsonl"
    with index_path.open("a", encoding="utf-8") as f:
        f.write(json.dumps(entry, ensure_ascii=False) + "\n")


def persist(snapshot: dict[str, Any]) -> Path:
    day = snapshot["capturedOn"]
    label = snapshot["provenance"]["label"]
    out_dir = CORPUS_DIR / label / day
    out_dir.mkdir(parents=True, exist_ok=True)
    path = out_dir / f"{snapshot['snapshotId']}.json.gz"
    if path.exists():
        # DEFECT-7 guard: with timestamp-keyed identity a collision should be
        # impossible. Raising rather than overwriting turns a silent S-1
        # violation into a loud one if this assumption is ever wrong again
        # (§15.1 — degraded capability must be loud, not silent).
        raise RuntimeError(
            f"snapshot id collision: {path} already exists. Timestamp-keyed "
            "identity should make this impossible; refusing to overwrite "
            "raw material (D0.5 S-1)."
        )
    with gzip.open(path, "wt", encoding="utf-8") as f:
        f.write(json.dumps(snapshot, ensure_ascii=False))
    append_index(snapshot, path)
    return path


# ── Index reconciliation (DEFECT-7 §4) ───────────────────────────────────
#
# The pre-fix identity scheme (day + attempt=1) let a same-day re-capture of
# the same URL collide and silently overwrite the on-disk file, while
# append_index() still appended a new line — leaving old INDEX.jsonl holding
# multiple lines that cite the same path with different bytes/hash, only the
# LAST one of which matches what is actually on disk now. This cannot
# recover the overwritten raw material; it makes the index stop lying about
# what survived.

def reconcile_index() -> None:
    index_path = CORPUS_DIR / "INDEX.jsonl"

    old_lines: list[dict[str, Any]] = []
    if index_path.exists():
        for line in index_path.read_text(encoding="utf-8").splitlines():
            line = line.strip()
            if line:
                old_lines.append(json.loads(line))
    old_count = len(old_lines)

    # Collision count: distinct relativePaths that had more than one line
    # pointing at them in the OLD index — files that were silently
    # overwritten one or more times under the pre-fix identity scheme.
    lines_per_path: dict[str, int] = {}
    for entry in old_lines:
        rp = entry.get("relativePath")
        if rp is not None:
            lines_per_path[rp] = lines_per_path.get(rp, 0) + 1
    collided_paths = sum(1 for n in lines_per_path.values() if n > 1)

    if index_path.exists():
        backup_path = index_path.with_name("INDEX.jsonl.pre-reconcile")
        backup_path.write_text(index_path.read_text(encoding="utf-8"), encoding="utf-8")

    new_lines: list[str] = []
    for path in sorted(CORPUS_DIR.rglob("*.json.gz")):
        with gzip.open(path, "rt", encoding="utf-8") as f:
            snap = json.loads(f.read())
        new_lines.append(json.dumps(index_entry_for(snap, path), ensure_ascii=False))

    index_path.write_text("\n".join(new_lines) + ("\n" if new_lines else ""), encoding="utf-8")
    new_count = len(new_lines)

    print("INDEX.jsonl RECONCILE")
    print("=" * 60)
    print(f"  old line count      {old_count}")
    print(f"  new line count      {new_count}")
    print(f"  lines dropped       {old_count - new_count}")
    print(f"  collided paths      {collided_paths}  "
          f"(distinct files that had >1 index line pointing at them — "
          f"the damage this reconcile is correcting)")
    print(f"\nBackup of the pre-reconcile index: {index_path.with_name('INDEX.jsonl.pre-reconcile')}")


# ── Reporting (D0.5 invariants S-4, S-5) ─────────────────────────────────
#
# Failed fetches STAY in the corpus. Excluding them biases the positive set
# toward non-cloaking — that is, less sophisticated — phishing, and flatters
# recall. Outcome distribution by label is a finding, not noise.

def report() -> None:
    from collections import Counter, defaultdict

    by_label: dict[str, Counter] = defaultdict(Counter)
    splits: dict[str, Counter] = defaultdict(Counter)

    for path in CORPUS_DIR.rglob("*.json.gz"):
        with gzip.open(path, "rt", encoding="utf-8") as f:
            snap = json.loads(f.read())
        label = snap["provenance"]["label"]
        by_label[label][snap["fetch"]["outcome"]] += 1
        splits[label][snap["split"]["split"]] += 1

    if not by_label:
        print("Corpus is empty.")
        return

    print("\nFETCH OUTCOME DISTRIBUTION BY LABEL")
    print("=" * 60)
    for label, counts in sorted(by_label.items()):
        total = sum(counts.values())
        ok = counts.get("success", 0)
        print(f"\n{label}  (n={total}, success={ok / total:.1%})")
        for outcome, n in counts.most_common():
            print(f"    {outcome:<26} {n:>6}  {n / total:>6.1%}")

    if "phishing" in by_label and "benign" in by_label:
        p = by_label["phishing"]
        b = by_label["benign"]
        ps = p.get("success", 0) / max(sum(p.values()), 1)
        bs = b.get("success", 0) / max(sum(b.values()), 1)
        print("\n" + "-" * 60)
        print(f"Success-rate asymmetry: benign {bs:.1%} vs phishing {ps:.1%} "
              f"(gap {bs - ps:+.1%})")
        print("A large gap indicates cloaking against the capture environment.")
        print("Report this alongside every confusion matrix (D0.5 S-5).")

    print("\nSPLIT DISTRIBUTION")
    print("=" * 60)
    for label, counts in sorted(splits.items()):
        total = sum(counts.values())
        parts = "  ".join(f"{k}={v} ({v / total:.0%})" for k, v in sorted(counts.items()))
        print(f"{label:<10} {parts}")


# ── Feed ingestion ───────────────────────────────────────────────────────

def filter_rank_band(rows: list[tuple[int, str]], lo: int, hi: int) -> list[str]:
    """
    PURE, network-free, deterministic. `rows` is (rank, domain) pairs; returns
    the domains whose rank is in [lo, hi], in ascending rank order (the final
    admission order is re-derived by the selection sort, but a stable order here
    keeps the function testable and reproducible). DEC-51 benign tail core.
    """
    band = [(r, d) for (r, d) in rows if lo <= r <= hi]
    band.sort(key=lambda rd: rd[0])
    return [d for (_, d) in band]


def load_tranco_tail(
    zip_path: Path | None = None, lo: int = TRANCO_TAIL_LO, hi: int = TRANCO_TAIL_HI,
) -> list[str]:
    """
    Extract the DEC-51 benign tail (ranks [lo, hi]) from tranco-top1m.zip.
    Network-free and deterministic: reads a local zip and slices by rank.

    Raises loudly (SystemExit) if the zip is absent — DEC-51 requires the task to
    STOP and ask for a download rather than silently fall back to a narrower list.
    """
    import zipfile

    zip_path = zip_path if zip_path is not None else (REPO_ROOT / "tranco-top1m.zip")
    if not zip_path.exists():
        raise SystemExit(
            f"TRANCO TAIL UNAVAILABLE: {zip_path} not found. DEC-51 requires the "
            "benign tail to come from tranco-top1m.zip; refusing to silently fall "
            "back to a narrower negatives list. Place the Tranco top-1M zip at the "
            "repo root and re-run."
        )
    csv_members = [n for n in zipfile.ZipFile(zip_path).namelist() if n.lower().endswith(".csv")]
    if not csv_members:
        raise SystemExit(f"TRANCO ZIP MALFORMED: {zip_path} contains no .csv member.")

    rows: list[tuple[int, str]] = []
    with zipfile.ZipFile(zip_path) as zf, zf.open(csv_members[0]) as raw:
        for line in io.TextIOWrapper(raw, encoding="utf-8"):
            line = line.strip()
            if not line:
                continue
            parts = line.split(",")
            if len(parts) < 2:
                continue
            try:
                rank = int(parts[0])
            except ValueError:
                continue
            rows.append((rank, parts[1].strip().lower()))
    return filter_rank_band(rows, lo, hi)


def load_feed_urls(feed: str) -> list[dict[str, Any]]:
    """
    Both PhishTank and OpenPhish publish downloadable lists; PhishTank
    additionally supplies a verification flag and frequently a target brand
    (often "Other" — not every entry names one) — captured where supplied.

    PhishTank's anonymous quota is shared and tight (observed: 75 requests
    per 259200s / 3 days) — this can 429 without any key at all, independent
    of registration. PHISHTANK_APP_KEY is read from the environment and
    applied if set, but is not required to succeed.
    """
    if feed == "openphish":
        # Free community feed: bare URL list, no metadata whatsoever.
        resp = httpx.get("https://openphish.com/feed.txt", timeout=15, follow_redirects=True)
        resp.raise_for_status()
        return [
            {"url": line.strip(), "id": None, "verified": None, "reportedOn": None, "target": None}
            for line in resp.text.splitlines()
            if line.strip()
        ]

    if feed == "phishtank":
        # PhishTank's own headers state the anonymous quota exactly:
        # x-request-limit 75 per x-request-limit-interval 259200s — one
        # request per 57.6 minutes. An unhandled exception here must never
        # kill a 48-hour unattended process (that is what happened on the
        # first launch attempt: a bare 429 propagated out of this function,
        # out of load_feed_urls, out of main()'s while-loop, and took the
        # whole poller down). On 429: exponential backoff with jitter,
        # capped, up to a fixed attempt budget. On ANY final failure —
        # exhausted retries, a non-429 HTTP error, a network error, a
        # malformed response — return an empty list. An empty list just
        # means this poll cycle captures nothing from this feed; that is
        # recoverable. A raised exception is not.
        params = {}
        key = os.environ.get("PHISHTANK_APP_KEY")
        if key:
            params["app_key"] = key

        max_attempts = 5
        base_delay_s = 2.0
        max_delay_s = 60.0
        resp = None

        try:
            for attempt in range(1, max_attempts + 1):
                try:
                    resp = httpx.get(
                        "https://data.phishtank.com/data/online-valid.csv",
                        params=params,
                        timeout=30,
                        follow_redirects=True,
                    )
                    resp.raise_for_status()
                    break
                except httpx.HTTPStatusError as exc:
                    is_429 = exc.response.status_code == 429
                    if not is_429 or attempt == max_attempts:
                        print(
                            f"load_feed_urls(phishtank): giving up after {attempt} "
                            f"attempt(s): {exc}. Returning empty for this poll cycle.",
                            file=sys.stderr,
                        )
                        return []
                    delay = min(base_delay_s * (2 ** (attempt - 1)), max_delay_s)
                    delay += random.uniform(0, delay * 0.25)  # jitter
                    print(
                        f"load_feed_urls(phishtank): 429, backing off {delay:.1f}s "
                        f"(attempt {attempt}/{max_attempts})",
                        file=sys.stderr,
                    )
                    time.sleep(delay)

            if resp is None:
                return []

            reader = csv.DictReader(io.StringIO(resp.text))
            entries = []
            for row in reader:
                target = (row.get("target") or "").strip()
                entries.append({
                    "url": row["url"],
                    "id": row.get("phish_id"),
                    "verified": (row.get("verified", "").strip().lower() == "yes"),
                    "reportedOn": (row.get("submission_time") or "")[:10] or None,
                    # "Other" is PhishTank's own value for "no specific brand
                    # identified" — treated as null, not as a brand name.
                    "target": target if target and target.lower() != "other" else None,
                })
            return entries
        except Exception as exc:  # noqa: BLE001 — feed loaders must not crash the poller
            print(f"load_feed_urls(phishtank): unexpected error, returning empty: {exc}", file=sys.stderr)
            return []

    if feed == "tranco":
        # DEC-51 benign tail (DEFECT-48 fix): ranks ~10k-60k from the repo-root
        # tranco-top1m.zip, NOT the old top-10k CSV (which this loader pointed at
        # via a non-existent tools/capture/ path — the bug this fixes). Bounded,
        # deterministic, network-free; raises loudly if the zip is absent.
        domains = load_tranco_tail()
        return [
            {"url": f"https://{d}", "id": None, "verified": None, "reportedOn": None, "target": None}
            for d in domains
        ]

    raise ValueError(f"unknown feed: {feed}")


# ── DEC-51 Part 6c — multi-feed selection path ───────────────────────────
#
# Reached only when uses_new_selection() is true (>1 --feed, or a
# --max-per-domain cap). The LEGACY single-feed path is untouched and
# byte-identical. The pure decision logic lives in selection.py; this shell
# builds its inputs from INDEX.jsonl + the on-disk payloads, then captures.

def _label_for_feed(feed: str) -> str:
    # Same convention as the legacy path: tranco is the negatives source.
    return "benign" if feed == "tranco" else "phishing"


def _build_corpus_state(
    candidate_domains: set[str],
) -> tuple[dict[str, int], dict[str, str], set[str]]:
    """
    Read INDEX.jsonl + the payloads of candidate domains to build the inputs
    selection.select() needs. Impure (file I/O), deliberately kept OUT of the
    pure module.

      existing_domain_counts: per-registrable-domain snapshot count across the
        whole corpus (INDEX line count per splitKey) — the corpus-wide cap base.
      existing_domain_splits: per-registrable-domain split (from INDEX) — the
        value a new URL on an existing domain inherits.
      seen_urls: normalized requestedUrls already captured, but ONLY for the
        candidate domains (payloads of other domains are never opened). This is
        the vs-corpus URL dedup set. INDEX.jsonl stores no URL (DEC-1 §1 field
        set), so prior URLs come from the payloads, not the index.
    """
    from collections import Counter

    index_path = CORPUS_DIR / "INDEX.jsonl"
    counts: Counter[str] = Counter()
    splits: dict[str, str] = {}
    paths_by_domain: dict[str, list[str]] = {}

    if index_path.exists():
        for line in index_path.read_text(encoding="utf-8").splitlines():
            line = line.strip()
            if not line:
                continue
            e = json.loads(line)
            key = e.get("splitKey")
            if key is None:
                continue
            counts[key] += 1
            if key not in splits and e.get("split") is not None:
                splits[key] = e["split"]
            rp = e.get("relativePath")
            if rp is not None:
                paths_by_domain.setdefault(key, []).append(rp)

    # vs-corpus URL dedup: open only the payloads of candidate domains.
    seen_urls: set[str] = set()
    for domain in candidate_domains:
        for rp in paths_by_domain.get(domain, []):
            p = CORPUS_DIR / rp
            if not p.exists():
                continue
            try:
                with gzip.open(p, "rt", encoding="utf-8") as f:
                    snap = json.loads(f.read())
                prior = snap.get("raw", {}).get("requestedUrl")
                if prior:
                    seen_urls.add(normalize_url(prior))
            except Exception as exc:  # noqa: BLE001 — a bad payload must not abort selection
                print(f"_build_corpus_state: skipping unreadable payload {rp}: {exc}", file=sys.stderr)

    return dict(counts), splits, seen_urls


def run_multi_feed(
    feeds: list[str],
    max_per_domain: int | None,
    limit: int,
    once: bool,
    poll: int | None,
) -> int:
    while True:
        # 1. Load every requested feed, annotate each entry with its feed.
        candidates: list[dict[str, Any]] = []
        for feed in feeds:
            for entry in load_feed_urls(feed):
                e = dict(entry)
                e["feed"] = feed
                candidates.append(e)

        # 2. Pre-filter urls whose registrable domain cannot be derived (unknown
        #    suffix / malformed) — the legacy path would raise on these inside
        #    capture_one; here we drop them loudly so selection never raises.
        clean: list[dict[str, Any]] = []
        dropped_bad_domain = 0
        candidate_domains: set[str] = set()
        for c in candidates:
            try:
                candidate_domains.add(registrable_domain(c["url"]))
                clean.append(c)
            except Exception as exc:  # noqa: BLE001
                dropped_bad_domain += 1
                print(f"skip (no registrable domain): {c['url']}  ({exc})", file=sys.stderr)

        # 3. Build corpus state (INDEX counts/splits + prior urls for candidate domains).
        counts, splits, seen_urls = _build_corpus_state(candidate_domains)

        # 4. Pure selection — the exact same registrable_domain / assign_split
        #    this producer uses everywhere (DEC-51 amendment #3).
        result = select(
            clean,
            existing_domain_counts=counts,
            existing_domain_splits=splits,
            seen_urls=seen_urls,
            max_per_domain=max_per_domain,
            domain_of=registrable_domain,
            assign_split_fn=assign_split,
        )

        # 5. --limit bounds the already-deduped, already-capped, deterministically
        #    ordered admitted set (DEC-51: cap applied BEFORE limit).
        to_capture = result.admitted[:limit]

        # Fresh blind set must reflect what ACTUALLY enters the corpus this run —
        # i.e. the CAPTURED set, not the full pre-limit admitted set. Deriving it
        # from result.fresh_blind_domains (computed over all admitted) would list
        # new TEST-split domains that --limit never captured (DEFECT-47).
        captured_blind = sorted({a.domain for a in to_capture if a.is_fresh_blind})

        print("DEC-51 MULTI-FEED SELECTION")
        print("=" * 60)
        print(f"  feeds                 {', '.join(feeds)}")
        print(f"  max-per-domain        {max_per_domain}")
        print(f"  candidates/feed       {dict(result.per_feed_candidates)}")
        print(f"  dropped dup within-run {result.dropped_dup_within_run}")
        print(f"  dropped dup vs-corpus  {result.dropped_dup_vs_corpus}")
        print(f"  dropped over cap       {result.dropped_over_cap}")
        print(f"  dropped bad domain     {dropped_bad_domain}")
        print(f"  admitted (pre-limit)   {len(result.admitted)}  -> capturing {len(to_capture)} (limit={limit})")
        print(f"  fresh blind (admitted) {len(result.fresh_blind_domains)} new TEST-split domains pre-limit")
        print(f"  fresh blind (captured) {len(captured_blind)} new TEST-split domains actually captured")

        # 6. Capture. capture_one re-derives split from the registrable domain
        #    via assign_split(), which is a pure function of the domain — so an
        #    existing domain's split is INHERITED automatically (same domain ->
        #    same split), matching what select() reported.
        per_feed_captured: dict[str, int] = {}
        for a in to_capture:
            snap = capture_one(
                a.url, _label_for_feed(a.feed), a.feed,
                impersonated_brand=a.entry.get("target"),
                feed_verified=a.entry.get("verified"),
                reported_on=a.entry.get("reportedOn"),
                feed_record_id=a.entry.get("id"),
            )
            persist(snap)
            per_feed_captured[a.feed] = per_feed_captured.get(a.feed, 0) + 1
            print(f"{snap['fetch']['outcome']:<24} [{a.feed}] {a.url}")

        print("\nPER-FEED YIELD (this cycle)")
        for feed in feeds:
            print(f"  {feed:<12} captured {per_feed_captured.get(feed, 0)}")

        # 7. Record the fresh blind set (new TEST-split domains) for the
        #    pre-registration note. Written to the corpus dir (untracked); the
        #    committed note (step e/f) is authored from this. Uses the CAPTURED
        #    set (DEFECT-47) so the list + hash match what is actually on disk.
        blind = captured_blind
        blind_digest = hashlib.sha256("\n".join(blind).encode()).hexdigest()
        blind_out = CORPUS_DIR / "blind-set-latest.json"
        blind_out.write_text(json.dumps({
            "generatedOn": date.today().isoformat(),
            "feeds": feeds,
            "maxPerDomain": max_per_domain,
            "freshBlindDomainCount": len(blind),
            "freshBlindDomains": blind,
            "sha256OverSortedDomains": blind_digest,
            "note": "New registrable domains (no prior INDEX entry) that landed in the "
                    "TEST split this run. NOT to be scored (DEC-51 amendment #2).",
        }, indent=2) + "\n", encoding="utf-8")
        print(f"\nFresh blind set -> {blind_out} "
              f"({len(blind)} domains, sha256={blind_digest[:16]}…)")

        if once or not poll:
            return 0
        time.sleep(poll * 60)


def main() -> int:
    ap = argparse.ArgumentParser(description="SecureSphere X corpus capture")
    # DEC-51 Part 6c: --feed is now REPEATABLE (action="append"). A single
    # --feed is unchanged (yields a one-element list routed to the legacy
    # path); no --feed is unchanged. The choices set is unchanged.
    ap.add_argument("--feed", choices=["phishtank", "openphish", "tranco"],
                    action="append",
                    help="feed to pull from; repeat for multi-feed diversity capture")
    # DEC-51 Part 6c: corpus-wide per-registrable-domain admission cap. When
    # present (or with >1 --feed) the run uses the new selection path; absent
    # with a single --feed it is byte-identical to today.
    ap.add_argument("--max-per-domain", type=int, default=None, metavar="N",
                    help="DEC-51: corpus-wide cap on snapshots per registrable domain "
                         "(counts existing INDEX.jsonl entries toward N)")
    ap.add_argument("--tranco", type=Path, help="CSV of negatives")
    ap.add_argument("--poll", type=int, metavar="MINUTES")
    ap.add_argument("--once", action="store_true")
    ap.add_argument("--report", action="store_true")
    ap.add_argument("--reconcile-index", action="store_true",
                     help="DEFECT-7: rebuild INDEX.jsonl from on-disk *.json.gz truth")
    ap.add_argument("--limit", type=int, default=200)
    args = ap.parse_args()

    _self_test()

    if args.reconcile_index:
        reconcile_index()
        return 0

    if args.report:
        report()
        return 0

    if args.tranco:
        rows = [r.strip().split(",") for r in args.tranco.read_text().splitlines() if r.strip()]
        urls = [f"https://{r[-1]}" for r in rows[: args.limit]]
        for u in urls:
            snap = capture_one(u, "benign", "tranco")
            persist(snap)
            print(f"{snap['fetch']['outcome']:<24} {u}")
        return 0

    feeds: list[str] = args.feed or []   # args.feed is a list (action="append") or None

    if not feeds:
        ap.print_help()
        return 2

    # DEC-51 routing: multi-feed OR a --max-per-domain cap uses the new
    # selection path; a lone --feed with no cap stays on the legacy path and
    # behaves byte-identically to before this change.
    if uses_new_selection(feeds, args.max_per_domain):
        return run_multi_feed(feeds, args.max_per_domain, args.limit, args.once, args.poll)

    feed = feeds[0]
    while True:
        # Label convention (unchanged, extended): "tranco" is the negatives
        # source, hardcoded to "benign" here exactly as the --tranco branch
        # above hardcodes it; every other feed is "phishing".
        label = "benign" if feed == "tranco" else "phishing"
        for entry in load_feed_urls(feed)[: args.limit]:
            snap = capture_one(
                entry["url"], label, feed,
                impersonated_brand=entry.get("target"),
                feed_verified=entry.get("verified"),
                reported_on=entry.get("reportedOn"),
                feed_record_id=entry.get("id"),
            )
            persist(snap)
            print(f"{snap['fetch']['outcome']:<24} {entry['url']}")
        if args.once or not args.poll:
            return 0
        time.sleep(args.poll * 60)


if __name__ == "__main__":
    sys.exit(main())
