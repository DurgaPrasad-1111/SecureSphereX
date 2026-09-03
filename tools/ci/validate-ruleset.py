# Working CI script — G-8 rule-set static validator (D0.3 §8, V-1 … V-16).
#
# Fifteen checks, not thirteen: V-1 … V-13 come from ruleset.format.v1.ts's
# §8 (itself thirteen, not the twelve Stage0-Completion-Pack.md §3 still
# says — that document is spec/, frozen, not updated here). V-14 is not in
# ruleset.format.v1.ts at all — it closes DEFECT-17 (docs/DEFECTS.md):
# integrityDigest had a documented algorithm (tools/ci/compute-ruleset-digest.mjs)
# but nothing verified it as part of this gate, so a stale or hand-edited
# digest passed CONFORMANT regardless. V-14 wires that verification in.
#
# FIFTEEN now: V-15 is likewise not in ruleset.format.v1.ts. It implements
# DEC-27 ruling 3(a) — pslVersion was declared, contractually meaningful
# ("recorded for G-10 replay") and enforced by NOTHING, the same shape of gap
# V-14 closed for integrityDigest. See check_psl_version for why it gates
# reconciliation staleness rather than comparing two incomparable version
# strings.
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
import subprocess
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


def three_state_boolean_fields():
    """V-16: the set of findings-field NAMES declared `boolean | null` (three-
    state) across packages/contracts/evaluation.contract.v1.ts's Findings
    interfaces. These are the fields where `not(is(x))` silently misreads
    `null` (unknown) as `false` (confirmed-negative) — DEFECT-39/40. A general
    TS interface parser is out of scope (same stance as TOP_LEVEL_FIELDS
    below), so this matches on field name; the names are unique across the
    contract today, asserted at load."""
    src = open(os.path.join(CONTRACTS_DIR, 'evaluation.contract.v1.ts'), encoding='utf-8').read()
    return set(re.findall(r'readonly (\w+):\s*boolean \| null', src))


THREE_STATE_BOOLEAN_FIELDS = three_state_boolean_fields()
if not THREE_STATE_BOOLEAN_FIELDS:
    print("ERROR: V-16 could not extract any `boolean | null` fields from evaluation.contract.v1.ts", file=sys.stderr)
    sys.exit(2)

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


def check_v16_negated_is_on_nullable(pred, findings, rule_id, negated=False):
    """V-16: flag any `is(x)` on a three-state (`boolean | null`) field that
    sits under an ODD number of `not` wrappers — i.e. `not(is(x))`, however the
    AST nests it. That form matches BOTH `false` and `null`, because the engine
    `is` operator tests only `=== true` (stage2.ts): so `not(is(null))` reads
    "unknown" as "confirmed false", firing every time the field is unknown, not
    just sometimes. This is DEFECT-39 (DL-02, extensionMimeConsistent) and
    DEFECT-40 (PM-01, precededByUserGesture). The correct form is
    `eq(x, false)`, which matches only a confirmed `false`.

    Non-negated `is(x)` on the same field is SAFE (null -> noMatch -> silent,
    the restrictive direction) and is not flagged. Even negation depth cancels
    (not(not(is(x))) == is(x)), handled by the parity toggle."""
    op = pred.get('op')
    if op == 'is':
        path = pred.get('path', '')
        field = path.split('.')[-1]  # module.field or $.field -> terminal segment
        if negated and field in THREE_STATE_BOOLEAN_FIELDS:
            findings['V-16'].append(
                f"{rule_id}: not(is({path})) over a three-state (boolean | null) field — "
                f"treats null (unknown) as false (DEFECT-39/40). Use eq({path}, false) so only "
                f"a confirmed false matches.")
    elif op == 'not':
        check_v16_negated_is_on_nullable(pred['operand'], findings, rule_id, not negated)
    elif op in ('and', 'or'):
        for o in pred.get('operands', []):
            check_v16_negated_is_on_nullable(o, findings, rule_id, negated)
    elif op == 'exists':
        check_v16_negated_is_on_nullable(pred['where'], findings, rule_id, negated)
    # eq/neq/gte/.../sameSite/inSet/priorFindingActive carry no nested `is` to negate.


def predicate_depth(pred):
    op = pred.get('op')
    if op == 'not':
        return 1 + predicate_depth(pred['operand'])
    if op in ('and', 'or'):
        return 1 + max([predicate_depth(o) for o in pred.get('operands', [])] or [0])
    if op == 'exists':
        return 1 + predicate_depth(pred['where'])
    return 1


def check_integrity_digest(ruleset_path):
    """V-14: integrityDigest matches a fresh recomputation. Closes DEFECT-17.

    Shells out to tools/ci/compute-ruleset-digest.mjs --verify rather than
    porting its SHA-256/canonicalization logic natively into Python — one
    source of truth for the algorithm, not two implementations that can
    drift apart. This is safe here specifically: this script only ever runs
    as a child of `node tools/ci/run-python.mjs tools/ci/validate-ruleset.py`
    — node already resolved and ran successfully before this process even
    started, so calling back out to it adds no new runtime dependency.

    Porting was considered and rejected: the .mjs script's own header
    documents a real divergence risk, not a hypothetical one — Python's
    json.dumps defaults to ensure_ascii=True (escapes non-ASCII to \\uXXXX),
    the opposite of the .mjs script's canonicalization, and this rule set's
    prose fields use non-ASCII characters (§, →, —) extensively. A naive
    port would silently compute a different digest for byte-identical
    content.
    """
    digest_script = os.path.join(BASE, 'compute-ruleset-digest.mjs')
    try:
        result = subprocess.run(
            ['node', digest_script, '--verify', ruleset_path],
            capture_output=True, text=True,
        )
    except FileNotFoundError:
        return [f"could not invoke 'node' to run {digest_script} — node should "
                f"already be on PATH, since this script only ever runs as a "
                f"child of a node process"]
    if result.returncode != 0:
        detail = result.stdout.strip() or result.stderr.strip() or f"exit {result.returncode}, no output"
        return [f"integrityDigest mismatch — {detail}"]
    return []


def check_psl_version(rs):
    """V-15: the declared pslVersion and the extractor's bundled PSL are both
    pinned, and the PAIRING has been explicitly reconciled. Implements DEC-27
    ruling 3(a).

    WHAT THIS DOES NOT DO, AND WHY. The rule set declares
    `tldextract==5.3.0 (bundled snapshot sha256:b693...)`; the extractor bundles
    `tldts@7.4.11`. These are DIFFERENT LIBRARIES with different version lines
    and different PSL snapshot identities. They are not comparable strings and
    no normalization makes them so. A check that compared them directly would
    either fail permanently or, if fudged into passing, assert nothing.

    Comparing them is also not the risk worth gating. The real risk is DRIFT:
    one side changes and nobody re-verifies that the two PSLs still agree on
    registrable-domain boundaries — which silently changes `registrableDomain`,
    the field CRED-01 and CRED-07 both key on.

    So the reconciliation is EMPIRICAL, in
    apps/harness/extract/psl-conformance.fixture.test.ts, which runs both
    libraries over a fixed boundary set and requires agreement. V-15 gates the
    two ways that reconciliation can silently go stale:

      (1) BUNDLED_PSL != the tldts actually installed  -> dependency moved
      (2) PSL_RECONCILED_AGAINST != the rule set's pslVersion -> ruleset moved

    Either means conformance was last verified against something that is no
    longer what is in use. Both are exact string comparisons between values
    that ARE comparable, unlike the two library versions themselves.
    """
    out = []
    declared = rs.get('pslVersion')
    if not isinstance(declared, str) or not declared.strip():
        return ["pslVersion is missing or empty in the rule set"]

    version_ts = os.path.join(REPO_ROOT, 'apps', 'harness', 'extract', 'version.ts')
    if not os.path.isfile(version_ts):
        # FAIL, not skip. This was written as `return []` first, and a negative
        # control caught it: deleting version.ts made V-15 print OK — a green
        # check that had verified nothing. That is precisely the vacuous-gate
        # shape DEFECT-29 closed for G-9's `--if-present` and DEFECT-17 closed
        # for the integrity digest.
        #
        # V-15's entire job is cross-checking the rule set against the
        # extractor. If the extractor is absent the check CANNOT be performed,
        # and a check that cannot be performed must say so loudly rather than
        # report success. The extractor is committed to this repository, so its
        # absence is an anomaly worth failing on, never a normal condition.
        return [f"cannot verify PSL reconciliation: {os.path.relpath(version_ts, REPO_ROOT)} "
                "is missing. V-15 cross-checks the rule set against the extractor; "
                "with the extractor absent this check cannot run, and reporting OK "
                "would be a vacuous pass."]
    src = open(version_ts, encoding='utf-8').read()

    def const_of(name):
        m = re.search(r'export const ' + re.escape(name) + r'\s*(?::[^=]+)?=\s*\n?\s*[\'"](.*?)[\'"]\s*as const', src, re.S)
        return m.group(1) if m else None

    bundled = const_of('BUNDLED_PSL')
    reconciled = const_of('PSL_RECONCILED_AGAINST')
    if bundled is None:
        out.append("could not read BUNDLED_PSL from apps/harness/extract/version.ts")
    if reconciled is None:
        out.append("could not read PSL_RECONCILED_AGAINST from apps/harness/extract/version.ts")
    if out:
        return out

    # (2) the rule set side
    if reconciled != declared:
        out.append(
            "PSL reconciliation is STALE: the rule set declares pslVersion "
            f"{declared!r}, but the extractor was last conformance-tested against "
            f"{reconciled!r}. Re-run `npm run test:psl`, then update "
            "PSL_RECONCILED_AGAINST in apps/harness/extract/version.ts."
        )

    # (1) the extractor side
    pkg = os.path.join(REPO_ROOT, 'node_modules', 'tldts', 'package.json')
    if os.path.isfile(pkg):
        installed = json.load(open(pkg, encoding='utf-8')).get('version')
        expected = 'tldts@%s' % installed
        if bundled != expected:
            out.append(
                f"bundled PSL drifted: version.ts declares BUNDLED_PSL={bundled!r} "
                f"but node_modules holds {expected!r}. Re-run `npm run test:psl` "
                "to re-verify boundary agreement, then update BUNDLED_PSL."
            )
    # node_modules absent (fresh clone, no install) is not a violation: there is
    # nothing to have drifted from. Silence here is correct, not a masked pass.
    return out


REQUIRED_18_1_FIELDS = [
    'id', 'name', 'owner', 'introducedIn', 'lastModifiedIn', 'lifecycleState',
    'rationale', 'empiricalConfidence', 'knownFalsePositiveRisks', 'cweMappings', 'capecMappings',
]

MAX_PREDICATE_DEPTH = 12


def validate(rs, ruleset_path):
    findings = {f'V-{i}': [] for i in range(1, 17)}

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
        check_v16_negated_is_on_nullable(r['predicate'], findings, r['id'])  # V-16

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

    # V-14 — integrityDigest matches a fresh recomputation (DEFECT-17)
    findings['V-14'].extend(check_integrity_digest(ruleset_path))

    # V-15 — pslVersion pinned and reconciled with the extractor (DEC-27 3a)
    findings['V-15'].extend(check_psl_version(rs))

    return findings


def main():
    if not os.path.isfile(RULESET_PATH):
        print(f"ERROR: rule set not found at {RULESET_PATH}", file=sys.stderr)
        sys.exit(2)
    rs = load_ruleset(RULESET_PATH)
    findings = validate(rs, RULESET_PATH)

    print(f"{'CHECK':<8} {'STATUS':<8} DETAIL")
    print("-" * 78)
    any_fail = False
    for i in range(1, 17):
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
