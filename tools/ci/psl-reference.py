# PSL reference oracle — emits `tldextract`'s registrable-domain answers as
# JSON so a Node test can compare them against `tldts` directly.
#
# WHY THIS EXISTS. `rulesets/rules-v0.1.0.json` declares
# `pslVersion: "tldextract==5.3.0 (...)"` and `tools/capture/capture.py`
# computes the corpus SPLIT KEYS with tldextract, while the extractor
# (apps/harness/extract/) resolves registrable domains with `tldts`. Two PSL
# snapshots that disagree on an eTLD+1 boundary would silently change
# `registrableDomain` — the field CRED-01 and CRED-07 both key on.
#
# V-15 gates that both sides are PINNED and their pairing is declared
# reconciled. This script is what makes the reconciliation EMPIRICAL rather
# than asserted: the caller runs both libraries over the same inputs and
# requires agreement.
#
# Exit codes are meaningful to the caller:
#   0  JSON on stdout, one {url: registrable_domain_or_null} object
#   3  tldextract is not importable  -> caller degrades to its pinned baseline
#      and MUST say so rather than claiming a live cross-check happened
#
# USAGE
#   python3 tools/ci/psl-reference.py <url> [url...]

import json
import os
import sys

try:
    import tldextract
except ImportError:
    print("tldextract is not importable", file=sys.stderr)
    sys.exit(3)


# ⚠️ DEFECT-34 — THIS CONFIGURATION IS THE POINT OF THIS FILE.
#
# This previously called `tldextract.extract()` with library DEFAULTS, while
# `tools/capture/capture.py:86-92` runs with `include_psl_private_domains=True`.
# The conformance fixture therefore compared tldts-default against
# tldextract-default, found agreement, and passed — while the two PSLs actually
# in use disagreed on 32.5% of phishing snapshots.
#
# A conformance check must verify against the PRODUCER'S ACTUAL RUNTIME
# CONFIGURATION, never against a second implementation's default. Defaults
# agreeing with each other proves only that two libraries ship the same
# opinion; it says nothing about the configuration this project runs.
#
# `suffix_list_urls=()` forbids a network fetch so the snapshot is fixed and
# reproducible — the same discipline capture.py applies, for the same reason.
# DEC-32: read from the shared manifest. Previously this hardcoded `True` to
# "MUST match capture.py" -- a comment is not a mechanism. Now there is nothing
# to match, because there is only one value.
_CFG_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'psl-config.json')
with open(_CFG_PATH, encoding='utf-8') as _fh:
    _CFG = json.load(_fh)
if 'includePrivateDomains' not in _CFG:
    print(f"PSL CONFIG INVALID: {_CFG_PATH} has no 'includePrivateDomains'", file=sys.stderr)
    sys.exit(2)
_INCLUDE_PRIVATE = bool(_CFG['includePrivateDomains'])

_EXTRACT = tldextract.TLDExtract(
    suffix_list_urls=(),
    fallback_to_snapshot=True,
    include_psl_private_domains=_INCLUDE_PRIVATE,
)


def main():
    urls = sys.argv[1:]
    if not urls:
        print("usage: psl-reference.py <url> [url...]", file=sys.stderr)
        sys.exit(2)

    out = {}
    for url in urls:
        e = _EXTRACT(url)
        # `top_domain_under_public_suffix` is the non-deprecated name for what
        # used to be `registered_domain`; fall back for older installs so this
        # script does not itself become a version-coupling problem.
        rd = getattr(e, 'top_domain_under_public_suffix', None)
        if rd is None:
            rd = e.registered_domain
        out[url] = rd or None

    # sort_keys so the output is canonical and diffable — the same determinism
    # discipline S-6 imposes on the extractor.
    print(json.dumps({
        'library': 'tldextract',
        'version': getattr(tldextract, '__version__', 'unknown'),
        # Echoed so the TypeScript side can ASSERT the oracle ran configured,
        # rather than trusting that it did.
        'includePrivateDomains': _INCLUDE_PRIVATE,
        'results': out,
    }, sort_keys=True))


if __name__ == '__main__':
    main()
