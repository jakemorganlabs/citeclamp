#!/usr/bin/env bash
# Purpose: send a signed request to the local /seal endpoint and print the seal outcome.
# Flow:
# 1. Read the port from config/server.json and the shared secret from the environment.
# 2. Build a draft body. Sign the timestamp and the raw body with openssl.
# 3. POST the signed request. Print the HTTP status and the body.
set -euo pipefail

PORT="$(node -pe "JSON.parse(require('fs').readFileSync('config/server.json','utf8')).port")"
BASE_URL="http://127.0.0.1:${PORT}"

if [[ -z "${HMAC_SECRET:-}" ]]; then
  echo "smoke_seal: set HMAC_SECRET in the environment" >&2
  exit 1
fi

# A draft whose single number is a byte-span copy of example evidence e-1.
BODY='{"sentences":[{"text":"The link is limited to 90 metres.","kind":"factual","citations":["e-1"],"numbers":[{"value":"90","claim":{"kind":"evidence_span","evidence_id":"e-1","start":23,"end":25}}]}],"tool_calls":[]}'

TIMESTAMP="$(date +%s)"
SIGNATURE="$(printf '%s.%s' "${TIMESTAMP}" "${BODY}" | openssl dgst -sha256 -hmac "${HMAC_SECRET}" -hex | awk '{print $2}')"

RESPONSE="$(curl -s -w $'\n%{http_code}' -X POST "${BASE_URL}/seal" \
  -H "content-type: application/json" \
  -H "x-citeclamp-timestamp: ${TIMESTAMP}" \
  -H "x-citeclamp-signature: ${SIGNATURE}" \
  --data-binary "${BODY}")"

HTTP_CODE="$(printf '%s' "${RESPONSE}" | tail -n 1)"
PAYLOAD="$(printf '%s' "${RESPONSE}" | sed '$d')"

printf 'status=%s\n' "${HTTP_CODE}"
printf '%s\n' "${PAYLOAD}"
