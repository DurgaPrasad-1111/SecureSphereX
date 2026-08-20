#!/usr/bin/env python3
"""
SecureSphere X — Canonical Schema Generator

Generates JSON Schema (2020-12) components from the D0.x TypeScript contracts.

Mandated by API Contract v1.2 §18.1: canonical-backed payloads SHALL be
`$ref` to GENERATED components. Hand-writing them in OpenAPI would create a
second canonical definition of the evidence contract — the defect class that
produced CD-1 through CD-3.

This generator is the single source path:

    D0.x TypeScript  ->  JSON Schema  ->  OpenAPI components.schemas

Anything it cannot translate is reported, never guessed.
"""

from __future__ import annotations
import re, json, sys, glob
from pathlib import Path

# Source directory holding the D0.x TypeScript contracts. Derived from this
# script's own location so the generator is runnable from any working directory
# and from any checkout; overridable by a single positional argument.
SRC = Path(sys.argv[1]).resolve() if len(sys.argv) > 1 else Path(__file__).resolve().parent

# ── Types required on the wire, per API Contract v1.2 §9.1 and §10.1 ────────
WIRE_ROOTS = [
    'SecurityEvidence',      # D0.1 — gate submission
    'SecurityStateView',     # D0.9 — gate and state responses
    'InvocationContext',     # D0.10 — gate submission envelope (projected)
    'UserDisposition',       # D0.10 — disposition
    'RecommendedResponse',   # D0.9
    'RuleSet',               # D0.3 — rule-set artifact
]

# Members excluded from the HTTP projection by the ARCHITECTURE, not by this
# generator. Backend v1.3 §5.1 excludes `tier` from InvocationContext (BI-32).
PROJECTION_EXCLUSIONS = {'InvocationContext': ['tier']}

issues: list[str] = []


def read_sources() -> str:
    parts = []
    for f in sorted(glob.glob(str(SRC / '*.ts'))):
        parts.append(Path(f).read_text())
    return '\n'.join(parts)


SRC_TEXT = read_sources()


def strip_comments(s: str) -> str:
    s = re.sub(r'/\*[\s\S]*?\*/', '', s)
    s = re.sub(r'//[^\n]*', '', s)
    return s


CODE = strip_comments(SRC_TEXT)


# ── Extract union-literal types ─────────────────────────────────────────────
UNIONS: dict[str, list[str]] = {}
for m in re.finditer(r"export type (\w+)\s*=\s*((?:\s*\|?\s*'[^']+'\s*)+);", CODE):
    UNIONS[m.group(1)] = re.findall(r"'([^']+)'", m.group(2))

# ── Extract interfaces ──────────────────────────────────────────────────────
INTERFACES: dict[str, str] = {}
for m in re.finditer(r'export interface (\w+)(?:<[^>]*>)?\s*\{([^}]*(?:\{[^}]*\}[^}]*)*)\}', CODE):
    INTERFACES[m.group(1)] = m.group(2)

# ── Extract simple type aliases to object/array/other ───────────────────────
ALIASES: dict[str, str] = {}
for m in re.finditer(r'export type (\w+)\s*=\s*([^;]+);', CODE):
    if m.group(1) not in UNIONS:
        ALIASES[m.group(1)] = m.group(2).strip()

emitted: dict[str, dict] = {}
pending: list[str] = []


def ref(name: str) -> dict:
    if name not in emitted and name not in pending:
        pending.append(name)
    return {'$ref': f'#/components/schemas/{name}'}


def ts_type_to_schema(t: str, ctx: str) -> dict:
    """Translate one TypeScript type expression into JSON Schema."""
    t = t.strip().rstrip(';').strip()

    # nullable union
    if '| null' in t:
        inner = ts_type_to_schema(t.replace('| null', '').strip(), ctx)
        if '$ref' in inner:
            return {'oneOf': [inner, {'type': 'null'}]}
        if 'type' in inner and isinstance(inner['type'], str):
            return {**inner, 'type': [inner['type'], 'null']}
        return {'oneOf': [inner, {'type': 'null'}]}

    # inline object literal, optionally as an array
    m = re.match(r'^readonly\s*\{(.+)\}\[\]$', t, re.S) or re.match(r'^\{(.+)\}\[\]$', t, re.S)
    if m:
        return {'type': 'array', 'items': inline_object_schema(m.group(1), ctx)}
    m = re.match(r'^readonly\s*\{(.+)\}$', t, re.S) or re.match(r'^\{(.+)\}$', t, re.S)
    if m:
        return inline_object_schema(m.group(1), ctx)

    # readonly array
    m = re.match(r'^readonly\s+(.+)\[\]$', t) or re.match(r'^(.+)\[\]$', t)
    if m:
        return {'type': 'array', 'items': ts_type_to_schema(m.group(1), ctx)}

    m = re.match(r'^readonly\s+(.+)$', t)
    if m:
        return ts_type_to_schema(m.group(1), ctx)

    # generic Observation<T>
    m = re.match(r'^Observation<(.+)>$', t)
    if m:
        return observation_schema(ts_type_to_schema(m.group(1), ctx))

    m = re.match(r'^Readonly<Record<([^,]+),\s*(.+)>>$', t) or \
        re.match(r'^Record<([^,]+),\s*(.+)>$', t)
    if m:
        return {'type': 'object', 'additionalProperties': ts_type_to_schema(m.group(2), ctx)}

    # numeric literal union, e.g. Tier = 0 | 1 | 2
    if re.fullmatch(r'\s*\d+(\s*\|\s*\d+)+\s*', t):
        return {'type': 'integer', 'enum': [int(x) for x in re.findall(r'\d+', t)]}

    # `typeof X_CONSTANT` — resolve the literal from source
    m = re.match(r'^typeof\s+(\w+)$', t)
    if m:
        cm = re.search(rf"{m.group(1)}\s*=\s*'([^']+)'", CODE)
        if cm:
            return {'type': 'string', 'const': cm.group(1)}
        issues.append(f'constant `{m.group(1)}` not resolvable in {ctx}')
        return {'type': 'string'}

    # branded primitive, e.g. Origin = string & { readonly [B]: true }
    m = re.match(r'^(\w+)\s*&\s*\{', t)
    if m and m.group(1) in ('string', 'number'):
        return {'type': m.group(1),
                'description': 'Branded primitive; construction is constrained '
                               'by the canonical contract, not by this schema.'}

    # inline string-literal union
    if "'" in t and '|' in t:
        return {'type': 'string', 'enum': re.findall(r"'([^']+)'", t)}

    if t.startswith("'") and t.endswith("'"):
        return {'type': 'string', 'const': t.strip("'")}

    prim = {'string': {'type': 'string'}, 'number': {'type': 'number'},
            'boolean': {'type': 'boolean'}, 'true': {'type': 'boolean', 'const': True},
            'unknown': {}, 'any': {}}
    if t in prim:
        return dict(prim[t])

    if t in UNIONS or t in INTERFACES or t in ALIASES:
        return ref(t)

    # branded types resolve to string
    if re.match(r'^\w+$', t):
        issues.append(f'unresolved type `{t}` referenced from {ctx}; emitted as string')
        return {'type': 'string'}

    issues.append(f'untranslatable type expression `{t}` in {ctx}')
    return {}


def observation_schema(value_schema: dict) -> dict:
    """D0.1 Observation<T>. The tri-state MUST NOT be flattened (§13.3)."""
    return {
        'description': 'D0.1 tri-state observation. `null` never substitutes '
                       'for any of the three states.',
        'oneOf': [
            {'type': 'object', 'required': ['state', 'value'],
             'properties': {'state': {'const': 'present'}, 'value': value_schema},
             'additionalProperties': False},
            {'type': 'object', 'required': ['state'],
             'properties': {'state': {'const': 'absent'}},
             'additionalProperties': False},
            {'type': 'object', 'required': ['state', 'reason'],
             'properties': {'state': {'const': 'notCollected'},
                            'reason': ref('NotCollectedReason')},
             'additionalProperties': False},
        ],
    }


FIELD_RE = re.compile(r'readonly\s+(\w+)(\??):\s*((?:[^;{}]|\{[^{}]*\})+);')


def inline_object_schema(body: str, ctx: str) -> dict:
    props, required = {}, []
    for fm in re.finditer(r'readonly\s+(\w+)(\??):\s*([^;]+);', body):
        props[fm.group(1)] = ts_type_to_schema(fm.group(3), ctx)
        if fm.group(2) != '?':
            required.append(fm.group(1))
    return {'type': 'object', 'properties': props, 'required': required,
            'additionalProperties': False}


def emit(name: str) -> None:
    if name in emitted:
        return
    emitted[name] = {}

    if name in UNIONS:
        emitted[name] = {'type': 'string', 'enum': UNIONS[name],
                         'description': f'Canonical enum `{name}` (D0.x). '
                                        'Canonical form only; storage form never on the wire (NM-1).'}
        return

    if name in INTERFACES:
        body = INTERFACES[name]
        props, required = {}, []
        excluded = PROJECTION_EXCLUSIONS.get(name, [])
        for fm in FIELD_RE.finditer(body):
            fname, optional, ftype = fm.group(1), fm.group(2), fm.group(3)
            if fname in excluded:
                continue
            props[fname] = ts_type_to_schema(ftype, f'{name}.{fname}')
            if optional != '?':
                required.append(fname)
        desc = f'Canonical `{name}` (D0.x), generated. Never hand-written (§18.1).'
        if excluded:
            desc += (f' HTTP projection excludes {excluded} by Backend v1.3 §5.1 '
                     f'(BI-32) — an architectural exclusion, not a generator choice.')
        emitted[name] = {'type': 'object', 'description': desc,
                         'properties': props, 'required': required,
                         'additionalProperties': False}
        return

    if name in ALIASES:
        emitted[name] = ts_type_to_schema(ALIASES[name], f'alias {name}')
        return

    issues.append(f'root type `{name}` not found in any D0.x source')
    emitted.pop(name, None)


for root in WIRE_ROOTS:
    pending.append(root)
while pending:
    emit(pending.pop(0))

emitted = {k: v for k, v in emitted.items() if v}

out = {'schemas': dict(sorted(emitted.items())), 'issues': issues}
Path('/tmp/canonical-schemas.json').write_text(json.dumps(out, indent=2))

print(f'generated {len(emitted)} canonical schemas from D0.x')
print(f'unions found: {len(UNIONS)} | interfaces found: {len(INTERFACES)}')
if issues:
    print(f'\ntranslation issues ({len(issues)}):')
    for i in sorted(set(issues)):
        print(f'  - {i}')
else:
    print('\nno translation issues')
