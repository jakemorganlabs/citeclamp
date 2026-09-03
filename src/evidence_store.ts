// Purpose: evidence lookup and byte-span match over the evidence set.
// Flow:
// 1. Build a map from evidence id to item.
// 2. Answer get with a map read.
// 3. Answer spanEquals with a raw slice and a strict compare.
import type { EvidenceItem } from "./types.js";

export interface EvidenceStore {
  get(id: string): EvidenceItem | undefined;
  spanEquals(id: string, start: number, end: number, value: string): boolean;
}

function assertSpanArgs(start: number, end: number): void {
  if (!Number.isInteger(start) || !Number.isInteger(end)) {
    throw new TypeError(`spanEquals requires integer bounds; got start=${start}, end=${end}`);
  }
  if (start < 0) {
    throw new RangeError(`spanEquals requires start at least 0; got ${start}`);
  }
  if (end < start) {
    throw new RangeError(`spanEquals requires end at least start; got start=${start}, end=${end}`);
  }
}

export function makeEvidenceStore(items: EvidenceItem[]): EvidenceStore {
  const byId = new Map<string, EvidenceItem>();
  for (const item of items) {
    byId.set(item.id, item);
  }
  return {
    get(id: string): EvidenceItem | undefined {
      return byId.get(id);
    },
    spanEquals(id: string, start: number, end: number, value: string): boolean {
      assertSpanArgs(start, end);
      const item = byId.get(id);
      if (item === undefined) {
        return false;
      }
      return item.text.slice(start, end) === value;
    },
  };
}
