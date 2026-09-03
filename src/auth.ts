// Purpose: HMAC-SHA256 verification and timestamp freshness for the /seal route.
// Flow (header contract):
// 1. The client sends two headers: `x-citeclamp-timestamp` and `x-citeclamp-signature`.
// 2. The signing string is the timestamp followed by the raw body. Match the RAG deploy style.
// 3. The signature is the hex HMAC-SHA256 of the signing string under the shared secret.
// 4. The server reads the raw body first, verifies the signature, and only then parses JSON.
// Contract notes:
// 1. verifyHmac tags the outcome as ok only when the signature matches and the timestamp is fresh.
// 2. An absent signature returns reason "missing". A wrong signature returns "bad_signature".
// 3. A timestamp outside the skew window returns "stale". The compare is constant-time.
import { createHmac, timingSafeEqual } from "node:crypto";

export interface AuthConfig {
  skewSeconds: number;
}

export type AuthResult =
  | { ok: true }
  | { ok: false; reason: "missing" | "bad_signature" | "stale" };

const HEX_64 = /^[0-9a-f]{64}$/;
const UNIX_SECONDS = /^[0-9]+$/;

// Build the signing string: the timestamp followed by the raw body, in that order.
function signingString(timestamp: string, rawBody: string): string {
  return `${timestamp}.${rawBody}`;
}

// Compute the hex HMAC-SHA256 tag of the signing string under the secret.
function hmacHex(timestamp: string, rawBody: string, secret: string): string {
  return createHmac("sha256", secret).update(signingString(timestamp, rawBody), "utf8").digest("hex");
}

// Assert the timestamp precondition: a unix seconds string. Throw on a violation.
function assertTimestampShape(timestamp: string): void {
  if (!UNIX_SECONDS.test(timestamp)) {
    throw new TypeError(`verifyHmac requires a unix seconds string; got ${JSON.stringify(timestamp)}`);
  }
}

// Assert the secret precondition: a non-empty string. Throw on a violation.
function assertSecretShape(secret: string): void {
  if (typeof secret !== "string" || secret.length === 0) {
    throw new TypeError("verifyHmac requires a non-empty secret");
  }
}

// Assert the config precondition. Throw on a violation.
function assertConfig(config: AuthConfig): void {
  if (typeof config !== "object" || config === null) {
    throw new TypeError("verifyHmac requires an AuthConfig object");
  }
  if (!Number.isInteger(config.skewSeconds) || config.skewSeconds < 0) {
    throw new TypeError(`verifyHmac requires a non-negative integer skewSeconds; got ${config.skewSeconds}`);
  }
}

// Assert the result contract: the tag and the reason line up. Throw on a violation.
function assertAuthResult(result: AuthResult): void {
  if (result.ok === true) {
    return;
  }
  if (result.ok === false) {
    if (
      result.reason !== "missing" &&
      result.reason !== "bad_signature" &&
      result.reason !== "stale"
    ) {
      throw new Error(
        `auth broke its contract: a failed result must carry a known reason; got ${JSON.stringify(result.reason)}`,
      );
    }
    return;
  }
  throw new Error("auth broke its contract: the result is neither ok nor a reasoned fail");
}

export function signHmac(timestamp: string, rawBody: string, secret: string): string {
  assertTimestampShape(timestamp);
  assertSecretShape(secret);

  const signature = hmacHex(timestamp, rawBody, secret);

  // Contract: the tag matches the hex signature shape.
  if (!HEX_64.test(signature)) {
    throw new Error("signHmac broke its contract: the signature is not a hex sha256 tag");
  }
  return signature;
}

export function verifyHmac(
  timestamp: string,
  rawBody: string,
  signature: string,
  secret: string,
  config: AuthConfig
): AuthResult {
  assertTimestampShape(timestamp);
  assertSecretShape(secret);
  assertConfig(config);

  let result: AuthResult;

  // Gate 1: the signature must be present before any other check runs.
  if (typeof signature !== "string" || signature.length === 0) {
    result = { ok: false, reason: "missing" };
    assertAuthResult(result);
    return result;
  }

  // Gate 2: the timestamp must sit inside the skew window.
  const ageSeconds = Math.abs(Math.floor(Date.now() / 1000) - Number.parseInt(timestamp, 10));
  if (ageSeconds > config.skewSeconds) {
    result = { ok: false, reason: "stale" };
    assertAuthResult(result);
    return result;
  }

  // Gate 3: the signature must match, compared in constant time.
  const expected = hmacHex(timestamp, rawBody, secret);
  const a = Buffer.from(signature, "utf8");
  const b = Buffer.from(expected, "utf8");
  const match = a.length === b.length && timingSafeEqual(a, b);
  result = match ? { ok: true } : { ok: false, reason: "bad_signature" };
  assertAuthResult(result);
  return result;
}
