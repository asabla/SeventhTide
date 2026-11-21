import assert from "node:assert/strict";
import test from "node:test";
import { parseSavedRun } from "../web/saved-run.ts";

await test("version-one saves retain their seed and ordered actions", () => {
  const run = { seed: 0xffffffff, history: ["spar", "swim-2"] };
  assert.deepEqual(parseSavedRun(JSON.stringify(run)), run);
});

await test("invalid save data is rejected before replay", () => {
  for (const value of [
    null,
    {},
    { seed: -1, history: [] },
    { seed: 1.5, history: [] },
    { seed: 0x100000000, history: [] },
    { seed: 1, history: [7] },
    { seed: 1, history: "spar" },
  ]) {
    assert.throws(
      () => parseSavedRun(JSON.stringify(value)),
      /Invalid saved voyage/,
    );
  }
});
