// Purpose: permit authority for minting, verifying, and burning one-time permits.
// Flow:
// 1. The authority holds a secret and an in-memory store.
// 2. mint(action_id) derives a token from the secret, action_id, and a nonce.
// 3. isValid(token, action_id) checks the token is known, unburned, and bound.
// 4. lookup(token) returns the record state so the executor can name the refusal.
// 5. burn(token) marks the token spent. A burned token fails isValid forever.
// The sealer and the generator hold no mint function. Only this module creates permits.
import { sha256Hex } from "./hash.js";

export interface Permit {
  token: string;        // opaque; derived by the authority
  action_id: string;    // the bound action
  issued_at: number;    // unix seconds
}

export type PermitState = "unknown" | "valid" | "burned";

export interface PermitLookup {
  state: PermitState;
  action_id?: string;
}

export interface PermitAuthority {
  mint(action_id: string): Permit;
  isValid(token: string, action_id: string): boolean;
  lookup(token: string): PermitLookup;
  burn(token: string): void;
}

interface PermitRecord {
  token: string;
  action_id: string;
  issued_at: number;
  burned: boolean;
}

export function makePermitAuthority(secret: string): PermitAuthority {
  if (typeof secret !== "string" || secret.length === 0) {
    throw new TypeError("makePermitAuthority requires a non-empty secret string");
  }

  const store = new Map<string, PermitRecord>();
  let nonceCounter = 0;

  function deriveToken(action_id: string, nonce: number): string {
    return sha256Hex(secret + action_id + String(nonce));
  }

  return {
    mint(action_id: string): Permit {
      if (typeof action_id !== "string" || action_id.length === 0) {
        throw new TypeError("PermitAuthority.mint requires a non-empty action_id string");
      }
      nonceCounter += 1;
      const token = deriveToken(action_id, nonceCounter);
      const now = Math.floor(Date.now() / 1000);
      const record: PermitRecord = {
        token,
        action_id,
        issued_at: now,
        burned: false,
      };
      store.set(token, record);
      return { token, action_id, issued_at: now };
    },

    isValid(token: string, action_id: string): boolean {
      const record = store.get(token);
      if (record === undefined) {
        return false;
      }
      if (record.burned) {
        return false;
      }
      if (record.action_id !== action_id) {
        return false;
      }
      return true;
    },

    lookup(token: string): PermitLookup {
      const record = store.get(token);
      if (record === undefined) {
        return { state: "unknown" };
      }
      if (record.burned) {
        return { state: "burned", action_id: record.action_id };
      }
      return { state: "valid", action_id: record.action_id };
    },

    burn(token: string): void {
      const record = store.get(token);
      if (record !== undefined) {
        record.burned = true;
      }
    },
  };
}
