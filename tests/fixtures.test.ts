// Purpose: run every fixture and assert the expected outcome.
// Flow:
// 1. Load every fixture from fixtures/cases/ and the shared evidence set.
// 2. Assert the fixture count sits between 20 and 40.
// 3. Run each fixture through runFixture and assert it passes.
// 4. On a failure, report the fixture id and the mismatch detail.
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { describe, expect, it } from "vitest";
import { loadFixtures, runFixture, type Fixture } from "../src/fixture_runner.js";

const here = dirname(fileURLToPath(import.meta.url));
const casesDir = join(here, "..", "fixtures", "cases");

describe("fixture suite", () => {
  it("loads at least 20 and at most 40 fixtures", async () => {
    const { fixtures } = await loadFixtures(casesDir);
    expect(fixtures.length).toBeGreaterThanOrEqual(20);
    expect(fixtures.length).toBeLessThanOrEqual(40);
  });

  it("gives every fixture a unique id", async () => {
    const { fixtures } = await loadFixtures(casesDir);
    const ids = fixtures.map((f: Fixture) => f.id);
    const unique = new Set(ids);
    expect(unique.size).toBe(ids.length);
  });

  it("runs every fixture and every result passes", async () => {
    const { fixtures, evidence } = await loadFixtures(casesDir);
    const results = fixtures.map((f: Fixture) => runFixture(f, evidence));
    const failures = results.filter((r) => !r.pass);
    expect(
      failures.map((r) => `${r.id}: ${r.detail}`),
      "every fixture must pass",
    ).toEqual([]);
    expect(results.length).toBe(fixtures.length);
  });
});
