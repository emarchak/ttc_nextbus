#!/bin/bash
# Verification suite for ttc_nextbus — run via `npm test`.
# Checks syntax, data shape, TRMNL config, template structure, and
# handler behavior (stop-ID path is offline; address path hits Nominatim live).
set -uo pipefail
cd "$(dirname "$0")/.."
pass=0; fail=0
check() { local name=$1; shift
  if "$@" >/dev/null 2>&1; then echo "PASS: $name"; ((pass++)); else echo "FAIL: $name"; ((fail++)); fi; }

check "api/stops.js parses"    node --check api/stops.js
check "build-stops.mjs parses" node --check scripts/build-stops.mjs
check "test-api.mjs parses"    node --check scripts/test-api.mjs

check "stops.json valid + shaped" node -e '
  const s = JSON.parse(require("fs").readFileSync("data/stops.json","utf8"));
  if (!Array.isArray(s) || s.length < 9000) throw "too few stops";
  for (const [code,name,lat,lon] of s.slice(0,100))
    if (typeof code!=="string"||typeof name!=="string"||typeof lat!=="number"||typeof lon!=="number") throw "bad tuple";
  if (!s.some(x => x[0]==="6916")) throw "missing known stop 6916";'

check "form-fields.yaml parses + keynames" python3 -c '
import yaml
fields = yaml.safe_load(open("trmnl/form-fields.yaml"))
keys = {f["keyname"] for f in fields}
assert {"stop_id","direction","max_predictions"} <= keys, keys
assert all("field_type" in f for f in fields)'

for f in trmnl/markup/*.liquid; do
  check "$f structure" python3 -c "
s = open('$f').read()
assert 'DOMContentLoaded' in s
assert 'asArray' in s
assert 'if (!route.direction) return' in s
assert s.count('<script') == s.count('</script>')
assert '{{ stop_id }}' in s"
done

check "handler: stop id lookup" bash -c 'node scripts/test-api.mjs 6916 | grep -q "The Queensway at South Kingsway (Stop 6916)"'
check "handler: empty query prompt" bash -c 'node scripts/test-api.mjs "" | grep -q "Type an address"'
check "handler: address geocode (live)" bash -c 'node scripts/test-api.mjs "Queen St W and Spadina Ave" | grep -q "Stop "'

echo "----------------------------------------"
echo "RESULT: $pass passed, $fail failed"
exit $fail
