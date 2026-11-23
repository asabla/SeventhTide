import assert from "node:assert/strict";
import {
  moves,
  play,
  rulesVersion,
  start,
} from "../../packages/rules/voyage.ts";
import { tag, type BendCall } from "./reference.ts";

const salvageChoices: Record<string, string> = {
  canvas: "DryCanvas",
  locker: "RationLocker",
  spar: "SpareTimber",
};

export function checkOpenings(call: BendCall) {
  let checked = 0;
  for (let version = 1; version <= rulesVersion; version++) {
    const covered = new Set<string>();
    for (let index = 0; index < 32; index++) {
      const seed = Math.imul(index, 2654435761) >>> 0;
      const state = start(seed, version);
      for (const { id } of moves(state)) {
        const choice = salvageChoices[id];
        assert.ok(choice && Object.hasOwn(salvageChoices, id));
        const expected = call("salvage", version, tag(choice));
        const board = play(state, id);
        assert.equal(board.phase, "board");
        for (const sailor of board.crew)
          assert.deepEqual(
            expected,
            {
              $: "Supplies",
              hull: board.hull,
              cold_per_sailor: sailor.cold,
              ration_per_sailor: sailor.food,
            },
            `version ${version}, seed ${seed}, ${id}`,
          );
        covered.add(id);
        checked++;
      }
    }
    assert.equal(covered.size, Object.keys(salvageChoices).length);
  }
  console.log(
    `${checked} salvage decisions agree with Bend on the starting supplies.`,
  );
}
