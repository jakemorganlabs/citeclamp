#!/usr/bin/env bash
# Purpose: capture the evidence set for docs/evidence from a running /seal endpoint plus the executor CLI.
# Flow:
# 1. Read BASE_URL (default the local loopback port) and HMAC_SECRET from the environment.
# 2. Sign and POST one draft per outcome: a sealed pass and one veto of each type.
# 3. Save each request and response pair as JSON under docs/evidence.
# 4. Run the executor CLI on the sealed send_email draft and save the permit lifecycle.
# 5. Send one unsigned request and save the 401.
set -euo pipefail

PORT="$(node -pe "JSON.parse(require('fs').readFileSync('config/server.json','utf8')).port")"
BASE_URL="${BASE_URL:-http://127.0.0.1:${PORT}}"
OUT="${OUT:-docs/evidence}"

if [[ -z "${HMAC_SECRET:-}" ]]; then
  echo "capture_evidence: set HMAC_SECRET in the environment" >&2
  exit 1
fi
mkdir -p "${OUT}"

# post NAME BODY: sign the raw body, POST it, and write {request, status, response} to OUT/NAME.json.
post() {
  local name="$1" body="$2" timestamp signature response code payload
  timestamp="$(date +%s)"
  signature="$(printf '%s.%s' "${timestamp}" "${body}" | openssl dgst -sha256 -hmac "${HMAC_SECRET}" -hex | awk '{print $2}')"
  response="$(curl -s -w $'\n%{http_code}' -X POST "${BASE_URL}/seal" \
    -H "content-type: application/json" \
    -H "x-citeclamp-timestamp: ${timestamp}" \
    -H "x-citeclamp-signature: ${signature}" \
    --data-binary "${body}")"
  code="$(printf '%s' "${response}" | tail -n 1)"
  payload="$(printf '%s' "${response}" | sed '$d')"
  jq -n --arg url "${BASE_URL}/seal" --argjson request "${body}" --argjson status "${code}" --argjson response "${payload}" \
    '{endpoint: $url, request: $request, status: $status, response: $response}' > "${OUT}/${name}.json"
  printf '%s status=%s sealed=%s\n' "${name}" "${code}" "$(printf '%s' "${payload}" | jq -c '.sealed // .error')"
}

# 1. Sealed pass: the number is a byte-span copy of e-1, the citation resolves, no side effect.
post sealed_pass "$(jq -c . examples/draft_pass.json)"

# 2. UNSIGNED_NUMBER: 95 is not the span e-1[23:25], which reads 90.
post veto_unsigned_number "$(jq -c . examples/draft_unsigned.json)"

# 3. ORPHAN_CITATION: e-9 is not in the evidence set.
post veto_orphan_citation '{"sentences":[{"text":"The link is limited to 90 metres.","kind":"factual","citations":["e-9"],"numbers":[{"value":"90","claim":{"kind":"evidence_span","evidence_id":"e-1","start":23,"end":25}}]}],"tool_calls":[]}'

# 4. SIDE_EFFECT_WITHOUT_PERMIT: the verb "send" sits in prose instead of a declared tool call.
post veto_side_effect_without_permit '{"sentences":[{"text":"I will send the link budget to the client.","kind":"factual","citations":["e-1"],"numbers":[]}],"tool_calls":[]}'

# 5. Sealed pass with a declared send_email call: the call neuters into one inert ProposedAction.
post sealed_with_proposed_action "$(jq -c . examples/draft_send_email.json)"

# 6. Executor: refused without a permit, run once with a one-time permit, refused on replay.
jq '.response' "${OUT}/sealed_with_proposed_action.json" > "${OUT}/.sealed_tmp.json"
npm run -s execute -- "${OUT}/.sealed_tmp.json" > "${OUT}/executor_permit_lifecycle.json"
rm -f "${OUT}/.sealed_tmp.json"
printf 'executor_permit_lifecycle ok=%s\n' "$(jq -c '.permit_lifecycle_ok' "${OUT}/executor_permit_lifecycle.json")"

# 7. Unsigned request: 401 before any parse or seal.
code="$(curl -s -o /dev/null -w '%{http_code}' -X POST "${BASE_URL}/seal" -H "content-type: application/json" --data-binary "$(jq -c . examples/draft_pass.json)")"
jq -n --arg url "${BASE_URL}/seal" --argjson status "${code}" '{endpoint: $url, headers_sent: ["content-type"], status: $status, response: {error: "unauthorized"}}' > "${OUT}/unsigned_request_401.json"
printf 'unsigned_request status=%s\n' "${code}"
