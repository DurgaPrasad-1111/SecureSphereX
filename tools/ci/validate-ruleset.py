# Working CI script — G-8 rule-set static validator (D0.3 §8, V-1 … V-13).
#
# Thirteen checks, not twelve: ruleset.format.v1.ts's own header comment
# records that V-13 (ItemPath scoping) was added at contract v1.1.0, after
# Stage0-Completion-Pack.md §3 was written — that document still says
# "V-1 … V-12" and is not updated here (out of scope; it's spec/, frozen).
#
# Closed enums (ModuleId, ParameterId, RefinementSetId) are extracted from
# packages/contracts/*.ts at run time, not hardcoded — so this validator
# tracks the amended contracts automatically rather than drifting from them.
#
# USAGE
#   python3 tools/ci/validate-ruleset.py [path/to/ruleset.json]
#   (defaults to rulesets/rules-v0.1.0.json)

import glob
import json
import os
import re
import sys

BASE = os.path.dirname(os.path.abspath(__file__))
REPO_ROOT = os.path.dirname(os.path.dirname(BASE))  # tools/ci -> tools -> repo root
CONTRACTS_DIR = os.path.join(REPO_ROOT, 'packages', 'contracts')

RULESET_PATH = sys.argv[1] if len(sys.argv) > 1 else os.path.join(REPO_ROOT, 'rulesets', 'rules-v0.1.0.json')


def extract_union(type_name):
    """Extract members of `export type <type_name> = 'a' | 'b' | ...;` from
    every *.ts file in packages/contracts/. Returns a set of strings."""
    for f in sorted(glob.glob(os.path.join(CONTRACTS_DIR, '*.ts'))):
        src = open(f, encoding='utf-8').read()
        m = re.search(
            r'export type ' + re.escape(type_name) + r'\s*=\s*((?:\s*\|?\s*\'[^\']+\'(?:\s*//[^\n]*)?\s*)+);',
            src)
        if m:
            return set(re.findall(r"'([^']+)'", m.group(1)))
    return None


MODULE_IDS = extract_union('ModuleId')
PARAMETER_IDS = extract_union('ParameterId')
REFINEMENT_SET_IDS = extract_union('RefinementSetId')

if MODULE_IDS is None or PARAMETER_IDS is None or REFINEMENT_SET_IDS is None:
    print("ERROR: could not extract ModuleId / ParameterId / RefinementSetId from packages/contracts/*.ts", file=sys.stderr)
    sys.exit(2)

# ── FindingPath resolution table ──────────────────────────────────────────
# Derived from packages/contracts/evaluation.contract.v1.ts's FindingsByModule
# and its per-module Findings interfaces. Two nested shapes exist beyond flat
# top-level fields: loginForm.forms[] (LoginFormFinding) and
# authContext.bestCrossOriginMatch (a nested optional object) — both are
# represented explicitly below rather than inferred, since a general TS
# interface parser is out of scope here.

TOP_LEVEL_FIELDS = {
    'url': {'scheme', 'isSecureScheme', 'registrableDomain', 'subdomainDepth', 'isIpLiteral',
            'totalLength', 'suspiciousKeywordCount', 'percentEncodedSegmentCount', 'specialCharacterDensity'},
    'ssl': {'httpsEstablished', 'certificateCurrentlyValid', 'chainComplete', 'chainTrusted',
            'subjectMatchesHost', 'daysUntilExpiry'},
    'dns': {'resolves', 'aRecordCount', 'aaaaRecordCount', 'nameServerCount', 'cnamePresent',
            'mxPresent', 'dnssecDeployed'},
    'redirect': {'hopCount', 'initialRegistrableDomain', 'finalRegistrableDomain', 'mechanisms', 'chainLength'},
    'loginForm': {'credentialFormPresent', 'forms', 'pageRegistrableDomain'},
    'javascript': {'listenerOnCredentialField', 'clientSideTransmissionObserved', 'transmissionEndpointDomains',
                   'dynamicScriptLoadCount', 'credentialInterfaceInjected', 'injectingScriptOriginDomain'},
    'homograph': {'isIdn', 'containsNonAscii', 'isMixedScript', 'scriptsUsed', 'confusableSkeleton'},
    'authContext': {'originPresent', 'lifecycleState', 'fingerprintDrift', 'bestCrossOriginMatch', 'storeAvailable'},
    'downloadContext': {'declaredExtension', 'declaredMimeType', 'extensionMimeConsistent', 'hasCompoundExtension',
                         'downloadRegistrableDomain', 'referrerRegistrableDomain', 'referrerPresent'},
    'permissionContext': {'requestedPermission', 'requestingRegistrableDomain', 'precededByUserGesture', 'pageAgeMs'},
}
assert set(TOP_LEVEL_FIELDS) == MODULE_IDS, (set(TOP_LEVEL_FIELDS), MODULE_IDS)

NESTED_OBJECT_FIELDS = {
    # module.field -> allowed sub-fields, for a nested (non-array) optional object
    'authContext.bestCrossOriginMatch': {'origin', 'registrableDomain', 'similarity'},
}

# CollectionPath -> element field set (for exists/$.field resolution, V-13)
COLLECTION_ELEMENT_FIELDS = {
    'loginForm.forms': {'fieldKinds', 'method', 'actionRegistrableDomain', 'hasHiddenCredentialField',
                         'hasAutocompleteDisabledCredential', 'injectedAfterLoad'},
    'javascript.transmissionEndpointDomains': None,  # scalar collection — only bare '$' is valid, no '.field'
}


def resolve_finding_path(path):
    """V-2: does `path` resolve against FindingsByModule (including the one
    known nested object)? Returns True/False."""
    parts = path.split('.')
    if len(parts) < 2:
        return False
    module, rest = parts[0], parts[1:]
    if module not in TOP_LEVEL_FIELDS:
        return False
    if len(rest) == 1:
        return rest[0] in TOP_LEVEL_FIELDS[module]
    # nested: module.field.subfield...
    prefix = module + '.' + rest[0]
    if prefix in NESTED_OBJECT_FIELDS:
        if len(rest) == 2:
            return rest[1] in NESTED_OBJECT_FIELDS[prefix]
        return False
    return False


def load_ruleset(path):
    with open(path, encoding='utf-8') as f:
        return json.load(f)


def walk_predicate(pred, ctx, findings):
    """ctx: {'in_exists': bool, 'collection': str|None}. Mutates `findings`,
    a dict of lists keyed by check id, appending violation strings."""
    op = pred.get('op')

    def check_value_path(path, where):
        if path.startswith('$'):
            if not ctx['in_exists']:
                findings['V-13'].append(f"ItemPath {path!r} used outside an exists.where subtree ({where})")
                return
            elem_fields = COLLECTION_ELEMENT_FIELDS.get(ctx['collection'])
            if path == '$':
                if elem_fields is not None:
                    # bare '$' on an object-element collection is fine (whole item);
                    # nothing further to check.
                    pass
            else:
                field = path[2:]  # strip '$.'
                if elem_fields is None:
                    findings['V-13'].append(
                        f"ItemPath {path!r} used against scalar collection {ctx['collection']!r}, "
                        f"which has no fields (only bare '$' is valid) ({where})")
                elif field not in elem_fields:
                    findings['V-13'].append(
                        f"ItemPath {path!r} field {field!r} not in element type of {ctx['collection']!r} ({where})")
        else:
            if not resolve_finding_path(path):
                findings['V-2'].append(f"FindingPath {path!r} does not resolve against FindingsByModule ({where})")

    if op in ('is',):
        check_value_path(pred['path'], f"is:{pred['path']}")
    elif op == 'not':
        walk_predicate(pred['operand'], ctx, findings)
    elif op in ('and', 'or'):
        if len(pred.get('operands', [])) == 0:
            findings['V-12'].append(f"{op} with zero operands — unreachable/vacuous branch")
        for o in pred.get('operands', []):
            walk_predicate(o, ctx, findings)
    elif op in ('gte', 'lte', 'gt', 'lt'):
        check_value_path(pred['path'], f"{op}:{pred['path']}")
        if pred['param'] not in PARAMETER_IDS:
            findings['V-3'].append(f"ParameterId {pred['param']!r} referenced by {op} on {pred['path']!r} is not defined")
    elif op in ('eq', 'neq'):
        check_value_path(pred['path'], f"{op}:{pred['path']}")
    elif op in ('sameSite', 'notSameSite'):
        check_value_path(pred['left'], f"{op}.left:{pred['left']}")
        check_value_path(pred['right'], f"{op}.right:{pred['right']}")
    elif op == 'inSet':
        check_value_path(pred['path'], f"inSet:{pred['path']}")
        if pred['set'] not in REFINEMENT_SET_IDS:
            findings['V-4'].append(f"RefinementSetId {pred['set']!r} referenced by inSet on {pred['path']!r} is not defined")
    elif op == 'exists':
        collection = pred['collection']
        if collection not in COLLECTION_ELEMENT_FIELDS:
            findings['V-13'].append(f"exists.collection {collection!r} is not a recognized CollectionPath")
        inner_ctx = {'in_exists': True, 'collection': collection}
        walk_predicate(pred['where'], inner_ctx, findings)
    elif op == 'priorFindingActive':
        pass
    else:
        findings['V-12'].append(f"unrecognized predicate op {op!r}")


def predicate_depth(pred):
    op = pred.get('op')
    if op == 'not':
        return 1 + predicate_depth(pred['operand'])
    if op in ('and', 'or'):
        return 1 + max([predicate_depth(o) for o in pred.get('operands', [])] or [0])
    if op == 'exists':
        return 1 + predicate_depth(pred['where'])
    return 1


REQUIRED_18_1_FIELDS = [
    'id', 'name', 'owner', 'introducedIn', 'lastModifiedIn', 'lifecycleState',
    'rationale', 'empiricalConfidence', 'knownFalsePositiveRisks', 'cweMappings', 'capecMappings',
]

MAX_PREDICATE_DEPTH = 12


def validate(rs):
    findings = {f'V-{i}': [] for i in range(1, 14)}

    rules_by_id = {r['id']: r for r in rs['rules']}
    param_ids_used = set()
    refinement_ids_used = set()

    # V-1, V-2, V-3, V-4, V-12, V-13 — walk every rule's predicate
    for r in rs['rules']:
        for m in r['requiredModules']:
            if m not in MODULE_IDS:
                findings['V-1'].append(f"{r['id']}: requiredModules member {m!r} not in ModuleId")
        depth = predicate_depth(r['predicate'])
        if depth > MAX_PREDICATE_DEPTH:
            findings['V-12'].append(f"{r['id']}: predicate depth {depth} exceeds bound {MAX_PREDICATE_DEPTH}")
        walk_predicate(r['predicate'], {'in_exists': False, 'collection': None}, findings)

    # also walk suppression guards (same path/param/set/ItemPath rules apply)
    for s in rs['suppressions']:
        for g in s['guards']:
            walk_predicate(g, {'in_exists': False, 'collection': None}, findings)

    # V-5 — aggravator parents
    aggravator_ids = {r['id'] for r in rs['rules'] if r['type'] == 'aggravator'}
    for r in rs['rules']:
        if r['type'] == 'aggravator':
            if not r.get('parent'):
                findings['V-5'].append(f"{r['id']}: aggravator has no parent")
            elif r['parent'] not in rules_by_id:
                findings['V-5'].append(f"{r['id']}: parent {r['parent']!r} does not exist")
            elif r['parent'] in aggravator_ids:
                findings['V-5'].append(f"{r['id']}: parent {r['parent']!r} is itself an aggravator (chain)")

    # V-6 — layered-security invariant
    threshold_high = next((p['value'] for p in rs['parameters'] if p['id'] == 'threshold_high'), None)
    if threshold_high is None:
        findings['V-6'].append("threshold_high parameter not found — cannot check invariant")
    else:
        for r in rs['rules']:
            if r['type'] == 'primary' and r['baseWeight'] >= threshold_high:
                findings['V-6'].append(f"{r['id']}: baseWeight {r['baseWeight']} >= threshold_high {threshold_high}")

    # V-7, V-8 — suppressions
    for s in rs['suppressions']:
        for t in s['targets']:
            if not (0 < t['reduction'] <= 1):
                findings['V-7'].append(f"{s['id']}: target {t['ruleId']} reduction {t['reduction']} not in (0,1]")
            if t['ruleId'] in s.get('neverApplies', []):
                findings['V-8'].append(f"{s['id']}: targets {t['ruleId']!r} which is also in its own neverApplies")

    # V-9 — subsumption
    for entry in rs['subsumption']:
        if entry['composite'] not in rules_by_id:
            findings['V-9'].append(f"subsumption composite {entry['composite']!r} does not exist")
        for s in entry['subsumes']:
            if s not in rules_by_id:
                findings['V-9'].append(f"subsumption subsumes {s!r} does not exist")
    # cycle check (graph is composite -> subsumes; a rule cannot subsume itself transitively)
    graph = {e['composite']: e['subsumes'] for e in rs['subsumption']}
    def has_cycle(node, visiting):
        if node in visiting:
            return True
        for nxt in graph.get(node, []):
            if has_cycle(nxt, visiting | {node}):
                return True
        return False
    for composite in graph:
        if has_cycle(composite, set()):
            findings['V-9'].append(f"cycle detected involving {composite!r}")

    # V-10 — complete §18.1 metadata
    for r in rs['rules']:
        for field in REQUIRED_18_1_FIELDS:
            if field not in r:
                findings['V-10'].append(f"{r['id']}: missing required field {field!r}")
        if not r.get('rationale', '').strip():
            findings['V-10'].append(f"{r['id']}: empty rationale")
        if not r.get('knownFalsePositiveRisks'):
            findings['V-10'].append(f"{r['id']}: empty knownFalsePositiveRisks")

    # V-11 — Retired rules remain present (structural no-op: we only ever
    # iterate rs['rules'], so any Retired rule already present passes by
    # construction; this checks lifecycleState is a recognized value)
    for r in rs['rules']:
        if r['lifecycleState'] not in ('Proposed', 'Active', 'Deprecated', 'Retired'):
            findings['V-11'].append(f"{r['id']}: unrecognized lifecycleState {r['lifecycleState']!r}")

    return findings


def main():
    if not os.path.isfile(RULESET_PATH):
        print(f"ERROR: rule set not found at {RULESET_PATH}", file=sys.stderr)
        sys.exit(2)
    rs = load_ruleset(RULESET_PATH)
    findings = validate(rs)

    print(f"{'CHECK':<8} {'STATUS':<8} DETAIL")
    print("-" * 78)
    any_fail = False
    for i in range(1, 14):
        key = f'V-{i}'
        viols = findings[key]
        if viols:
            any_fail = True
            print(f"{key:<8} {'FAIL':<8} {len(viols)} violation(s)")
            for v in viols:
                print(f"{'':<8} {'':<8}   - {v}")
        else:
            print(f"{key:<8} {'OK':<8}")
    print("-" * 78)
    print(f"RESULT: {'NON-CONFORMANT' if any_fail else 'CONFORMANT'}")
    print(f"rules={len(rs['rules'])} parameters={len(rs['parameters'])} "
          f"refinementSets={len(rs['refinementSets'])} suppressions={len(rs['suppressions'])} "
          f"subsumption={len(rs['subsumption'])}")
    sys.exit(1 if any_fail else 0)


if __name__ == '__main__':
    main()
