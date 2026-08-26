# Working CI script. Derived from spec/contract-conformance-check.py, which
# is the frozen audit baseline and is NOT edited (spec/'s own E-21 fix is
# unrelated to and unaffected by this file — see the divergence note below).
#
# Governance rule G-11 (DECISIONS.md DEC-4): "contract-conformance-check.py's
# CI step is renamed G-11" — G-8 in this repo's ci.yml belongs to the
# rule-set static validator instead.
#
# DIVERGENCE FROM spec/contract-conformance-check.py, and why:
#   spec/'s copy is BASE-anchored to its own directory (E-21's fix), which is
#   *correct* for E-21's own scope — but since the only copy of the script
#   used to live in spec/, BASE resolved to spec/, and spec/ happens to also
#   hold the six FROZEN ORIGINAL contract .ts files (pre-DEC-3-amendment:
#   unbranded IDs/dates, no FetchRecord discriminated union, no pslVersion).
#   So spec/'s copy validates enum shapes against contracts nothing actually
#   builds against any more. THIS file scans packages/contracts/*.ts — the
#   amended contracts the codebase and CI's G-1 typecheck actually use.
#
#   The LDD lives in spec/ regardless of which contracts are being checked
#   (it is not duplicated), so this file locates it via REPO_ROOT rather than
#   its own BASE.
#
#   ENUM SOURCE (my own recommendation for this working-copy path — not an
#   authorized decision, no DECISIONS.md entry covers it): rather than
#   re-parse the full 170 KB LDD on every run, the enum blocks are extracted
#   once into tools/ci/storage-enums.json (see extract-storage-enums.py),
#   pinned to a SHA-256 digest of the LDD they were extracted from. Each run
#   recomputes that digest and compares it to the pinned value before
#   trusting the extracted data — a stale extraction fails loudly (exit 2)
#   as a digest mismatch, not as silent divergence.

import hashlib, json, re, glob, os, sys

BASE = os.path.dirname(os.path.abspath(__file__))
REPO_ROOT = os.path.dirname(os.path.dirname(BASE))  # tools/ci -> tools -> repo root
CONTRACTS_DIR = os.path.join(REPO_ROOT, 'packages', 'contracts')
LDD_NAME = 'Logical-Database-Design-Specification-v1_1.md'
LDD_PATH = os.path.join(REPO_ROOT, 'spec', LDD_NAME)
STORAGE_ENUMS_PATH = os.path.join(BASE, 'storage-enums.json')


def camel_to_snake(x): return re.sub(r'(?<!^)(?=[A-Z])', '_', x).lower()


ts = {}
for f in sorted(glob.glob(os.path.join(CONTRACTS_DIR, '*.ts'))):
    src = open(f, encoding='utf-8').read()
    for m in re.finditer(r'export type (\w+)\s*=\s*((?:\s*\|?\s*\'[^\']+\'(?:\s*//[^\n]*)?\s*)+);', src):
        vals = set(re.findall(r"'([^']+)'", m.group(2)))
        if len(vals) > 1: ts[m.group(1)] = vals

if not os.path.isfile(STORAGE_ENUMS_PATH):
    print(f"ERROR: {STORAGE_ENUMS_PATH} not found.", file=sys.stderr)
    print("Run tools/ci/extract-storage-enums.py to generate it.", file=sys.stderr)
    sys.exit(2)
with open(STORAGE_ENUMS_PATH, encoding='utf-8') as f:
    extracted = json.load(f)

if not os.path.isfile(LDD_PATH):
    print(f"ERROR: authoritative Logical Database Design not found at {LDD_PATH}", file=sys.stderr)
    print("G-11 cannot run. Expected file: " + LDD_NAME, file=sys.stderr)
    sys.exit(2)
with open(LDD_PATH, 'rb') as f:
    current_digest = hashlib.sha256(f.read()).hexdigest()

if current_digest != extracted['lddDigestSha256']:
    print(f"ERROR: {STORAGE_ENUMS_PATH} is stale.", file=sys.stderr)
    print(f"  LDD digest now:     {current_digest}", file=sys.stderr)
    print(f"  storage-enums.json: {extracted['lddDigestSha256']}", file=sys.stderr)
    print("The LDD changed since storage-enums.json was generated. Re-run "
          "tools/ci/extract-storage-enums.py and commit the result.", file=sys.stderr)
    sys.exit(2)

pg = {name: set(vals) for name, vals in extracted['enums'].items()}

PAIRS = {
 'skr.module_id': 'ModuleId', 'skr.evidence_category': 'EvidenceCategory',
 'skr.pass_trigger': 'PassTrigger', 'skr.consistency_kind': 'ConsistencyAssessment',
 'skr.unevaluable_reason': 'UnevaluableReason', 'skr.not_collected_reason': 'NotCollectedReason',
 'skr.collector_kind': 'CollectorKind', 'skr.redirect_mechanism': 'RedirectMechanism',
 'skr.risk_tier': 'RiskTier', 'skr.rule_type': 'RuleType', 'skr.rule_outcome_kind': None,
}
STORAGE_ONLY = {'skr.capability_subject', 'skr.report_kind', 'skr.resource_lifecycle',
                'skr.domain_lifecycle', 'skr.session_state', 'skr.evaluability',
                'tir.intelligence_lifecycle'}

fails = []
print(f"{'STORAGE TYPE':<30} {'CANONICAL':<24} RESULT")
print("-" * 78)
for pgname in sorted(pg):
    if pgname in STORAGE_ONLY:
        print(f"{pgname:<30} {'(storage-only)':<24} OK — registered §15.3.2"); continue
    canon = PAIRS.get(pgname)
    if canon is None:
        print(f"{pgname:<30} {'(derived)':<24} OK — projection"); continue
    if canon not in ts:
        print(f"{pgname:<30} {canon:<24} SKIP — single-line type"); continue
    mapped = {camel_to_snake(v) for v in ts[canon]}
    if mapped == pg[pgname]:
        print(f"{pgname:<30} {canon:<24} OK — {len(mapped)} members match under NM-1")
    else:
        fails.append(pgname)
        print(f"{pgname:<30} {canon:<24} FAIL")
        print(f"{'':<30} canonical-only: {sorted(mapped - pg[pgname])}")
        print(f"{'':<30} storage-only:   {sorted(pg[pgname] - mapped)}")

print("-" * 78)
print(f"RESULT: {'CONFORMANT' if not fails else 'NON-CONFORMANT: ' + str(fails)}")
sys.exit(1 if fails else 0)
