// Purpose: serve /seal behind an HMAC signature and /health open. The route adds no seal logic.
// Flow:
// 1. Read the raw body and the request headers before any JSON parse.
// 2. On /seal, verify the HMAC signature. A fail returns 401 before the seal runs. A pass runs seal().
// 3. On /health, return 200 with no auth and no seal. Any other path returns 404.
// 4. Log one structured event per request with a trace_id.
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { randomBytes } from "node:crypto";
import { verifyHmac, type AuthConfig } from "./auth.js";
import { makeRegistry, type Calculator } from "./calculators.js";
import { validateEvidence } from "./schema.js";
import { seal } from "./sealer.js";
import { makeToolPolicy } from "./seal_side_effects.js";
import type { EvidenceItem } from "./types.js";
import serverConfig from "../config/server.json" with { type: "json" };
import toolsConfig from "../config/tools.json" with { type: "json" };
import evidenceInput from "../examples/evidence.json" with { type: "json" };

const sum: Calculator = (inputs) => {
  const a = Number.parseInt(inputs.a ?? "", 10);
  const b = Number.parseInt(inputs.b ?? "", 10);
  return String(a + b);
};

const registry = makeRegistry({ sum });
const policy = makeToolPolicy(toolsConfig);
const evidence: EvidenceItem[] = validateEvidence(evidenceInput);
const authConfig: AuthConfig = { skewSeconds: serverConfig.skewSeconds };

// Assert the port before the server binds. Throw on a violation.
function assertPort(port: number): void {
  if (!Number.isInteger(port) || port <= 0 || port > 65535) {
    throw new TypeError(`server requires an integer port between 1 and 65535; got ${port}`);
  }
}

// Assert the secret is present. Throw on a violation so the server never starts unprotected.
function assertSecret(secret: string | undefined): asserts secret is string {
  if (typeof secret !== "string" || secret.length === 0) {
    throw new Error("server requires HMAC_SECRET in the environment");
  }
}

// Assert the /seal body contract: a status plus sealed or vetoes. Throw on a violation.
function assertSealBody(body: { sealed: boolean; vetoes?: unknown; [key: string]: unknown }): void {
  if (body.sealed === true && Array.isArray(body.vetoes)) {
    throw new Error("server broke its contract: a sealed body must not carry a veto list");
  }
  if (body.sealed === false && !Array.isArray(body.vetoes)) {
    throw new Error("server broke its contract: an unsealed body must carry the veto list");
  }
}

// Log one structured event per request as a JSON line.
function logEvent(event: Record<string, unknown>): void {
  process.stdout.write(`${JSON.stringify(event)}\n`);
}

// Write a JSON response with a status code.
function sendJson(res: ServerResponse, status: number, payload: unknown): void {
  const text = JSON.stringify(payload);
  res.writeHead(status, { "content-type": "application/json" });
  res.end(text);
}

// Read the raw body as a string. The route verifies the signature over these exact bytes.
async function readRawBody(req: IncomingMessage): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(chunk as Buffer);
  }
  return Buffer.concat(chunks).toString("utf8");
}

async function main(): Promise<void> {
  const secret = process.env.HMAC_SECRET;
  assertSecret(secret);
  assertPort(serverConfig.port);

  const server = createServer(async (req, res) => {
    const traceId = randomBytes(8).toString("hex");
    try {
      if (req.method === "GET" && req.url === "/health") {
        logEvent({ trace_id: traceId, route: "/health", action: "health", status: 200 });
        sendJson(res, 200, { status: "ok" });
        return;
      }

      if (req.method === "POST" && req.url === "/seal") {
        const timestampHeader = req.headers["x-citeclamp-timestamp"];
        const signatureHeader = req.headers["x-citeclamp-signature"];
        const timestamp = typeof timestampHeader === "string" ? timestampHeader : "";
        const signature = typeof signatureHeader === "string" ? signatureHeader : "";
        const rawBody = await readRawBody(req);

        // An absent or malformed timestamp header is an unsigned request. Reject with 401.
        if (!/^[0-9]+$/.test(timestamp)) {
          logEvent({ trace_id: traceId, route: "/seal", action: "auth", result: "missing", status: 401 });
          sendJson(res, 401, { error: "unauthorized" });
          return;
        }

        // Verify the signature before any parse or seal. A fail returns 401.
        const auth = verifyHmac(timestamp, rawBody, signature, secret, authConfig);
        if (!auth.ok) {
          logEvent({ trace_id: traceId, route: "/seal", action: "auth", result: auth.reason, status: 401 });
          sendJson(res, 401, { error: "unauthorized" });
          return;
        }

        const body = buildSealBody(rawBody, traceId);
        assertSealBody(body);
        logEvent({ trace_id: traceId, route: "/seal", action: "seal", sealed: body.sealed, status: 200 });
        sendJson(res, 200, body);
        return;
      }

      logEvent({ trace_id: traceId, route: req.url ?? "", action: "route", status: 404 });
      sendJson(res, 404, { error: "not found" });
    } catch (err) {
      logEvent({
        trace_id: traceId,
        route: req.url ?? "",
        action: "error",
        detail: (err as Error).message,
        status: 500,
      });
      sendJson(res, 500, { error: "internal" });
    }
  });

  server.listen(serverConfig.port, "127.0.0.1", () => {
    logEvent({ route: "server", action: "listening", host: "127.0.0.1", port: serverConfig.port });
  });

  process.on("SIGINT", () => server.close());
  process.on("SIGTERM", () => server.close());
}

// Run the seal and shape the HTTP body. Always 200: a veto is a valid outcome, not an error.
function buildSealBody(rawBody: string, traceId: string): { sealed: boolean } & Record<string, unknown> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawBody);
  } catch {
    return { sealed: false, vetoes: [{ code: "MALFORMED_DRAFT", detail: "body is not valid JSON", locus: "/" }] };
  }

  const outcome = seal(parsed, { evidence, registry, policy, traceId });
  if (outcome.sealed) {
    return {
      sealed: true,
      sentences: outcome.response.sentences,
      sealed_numbers: outcome.response.sealed_numbers,
      proposed_actions: outcome.response.proposed_actions,
    };
  }
  return { sealed: false, vetoes: outcome.vetoes };
}

main().catch((err) => {
  process.stderr.write(`fatal: ${(err as Error).message}\n`);
  process.exit(1);
});
