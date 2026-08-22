# One-off extraction script. Not part of the CI run itself — run by hand
# whenever the LDD's CREATE TYPE ... AS ENUM blocks change, to regenerate
# tools/ci/storage-enums.json.
#
# DESIGN NOTE (this is my own recommendation for this working-copy path, not
# an authorized decision — no DECISIONS.md entry covers it): rather than
# have contract-conformance-check.py re-parse the full 170 KB LDD markdown
# file on every CI run, extract the enum blocks once into a small committed
# JSON file, pinned to a SHA-256 digest of the source LDD. On each run the
# conformance check recomputes that digest and compares it to the pinned
# value — a stale extraction then fails loudly as a digest mismatch (exit 2)
# rather than silently checking against out-of-date enum data. Re-run this
# script and commit the regenerated storage-enums.json whenever the LDD's
# enum blocks change.
#
# USAGE
#   python3 tools/ci/extract-storage-enums.py

import hashlib
import json
import os
import re

BASE = os.path.dirname(os.path.abspath(__file__))
REPO_ROOT = os.path.dirname(os.path.dirname(BASE))  # tools/ci -> tools -> repo root
LDD_NAME = 'Logical-Database-Design-Specification-v1_1.md'
LDD_PATH = os.path.join(REPO_ROOT, 'spec', LDD_NAME)
OUT_PATH = os.path.join(BASE, 'storage-enums.json')

with open(LDD_PATH, 'rb') as f:
    ldd_bytes = f.read()
digest = hashlib.sha256(ldd_bytes).hexdigest()

ldd_text = ldd_bytes.decode('utf-8')
enums = {}
for m in re.finditer(r"CREATE TYPE (\w+\.\w+)\s+AS ENUM \(([^)]+)\)", ldd_text, re.S):
    enums[m.group(1)] = sorted(re.findall(r"'([^']+)'", m.group(2)))

out = {
    'lddFile': LDD_NAME,
    'lddDigestSha256': digest,
    'enums': enums,
}
with open(OUT_PATH, 'w', encoding='utf-8') as f:
    json.dump(out, f, indent=2, sort_keys=True)
    f.write('\n')

print(f"Wrote {OUT_PATH}")
print(f"  source: {LDD_PATH}")
print(f"  digest: {digest}")
print(f"  enums extracted: {len(enums)}")
