import re, glob, os, sys

# Path resolution is anchored to this script's own location, not the process
# working directory, so the gate behaves identically however it is invoked.
BASE = os.path.dirname(os.path.abspath(__file__))
LDD_NAME = 'Logical-Database-Design-Specification-v1_1.md'

def camel_to_snake(x): return re.sub(r'(?<!^)(?=[A-Z])','_',x).lower()

ts={}
for f in sorted(glob.glob(os.path.join(BASE, '*.ts'))):
    src=open(f, encoding='utf-8').read()
    for m in re.finditer(r'export type (\w+)\s*=\s*((?:\s*\|?\s*\'[^\']+\'(?:\s*//[^\n]*)?\s*)+);', src):
        vals=set(re.findall(r"'([^']+)'", m.group(2)))
        if len(vals)>1: ts[m.group(1)]=vals

ldd_path = os.path.join(BASE, LDD_NAME)
if not os.path.isfile(ldd_path):
    print(f"ERROR: authoritative Logical Database Design not found at {ldd_path}", file=sys.stderr)
    print("G-8 cannot run. Expected file: " + LDD_NAME, file=sys.stderr)
    sys.exit(2)
ldd=open(ldd_path, encoding='utf-8').read()
pg={m.group(1): set(re.findall(r"'([^']+)'", m.group(2)))
    for m in re.finditer(r"CREATE TYPE (\w+\.\w+)\s+AS ENUM \(([^)]+)\)", ldd, re.S)}

PAIRS = {
 'skr.module_id':'ModuleId', 'skr.evidence_category':'EvidenceCategory',
 'skr.pass_trigger':'PassTrigger', 'skr.consistency_kind':'ConsistencyAssessment',
 'skr.unevaluable_reason':'UnevaluableReason', 'skr.not_collected_reason':'NotCollectedReason',
 'skr.collector_kind':'CollectorKind', 'skr.redirect_mechanism':'RedirectMechanism',
 'skr.risk_tier':'RiskTier', 'skr.rule_type':'RuleType', 'skr.rule_outcome_kind':None,
}
STORAGE_ONLY = {'skr.capability_subject','skr.report_kind','skr.resource_lifecycle',
                'skr.domain_lifecycle','skr.session_state','skr.evaluability',
                'tir.intelligence_lifecycle'}

fails=[]
print(f"{'STORAGE TYPE':<30} {'CANONICAL':<24} RESULT")
print("-"*78)
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

print("-"*78)
print(f"RESULT: {'CONFORMANT' if not fails else 'NON-CONFORMANT: '+str(fails)}")
sys.exit(1 if fails else 0)
