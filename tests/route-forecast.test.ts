import assert from "node:assert/strict";
import test from "node:test";
import { moves, play, previewRoutes, start } from "@seventh-tide/rules";
import { marked, unmarked } from "./fixtures/landfall-pursuit.ts";

await test("every route projects the same hull, cold and ration as the settled tide", () => {
  for (const version of [9, 10]) {
    for (const { seed, history, plays } of [marked, unmarked]) {
      const board = history.reduce(play, start(seed, version));
      assert.deepEqual(previewRoutes(board), []);
      const decision = plays.reduce(play, board);
      const input = structuredClone(decision);
      const routes = previewRoutes(decision);
      assert.deepEqual(
        routes.map(({ id }) => id),
        moves(decision).map(({ id }) => id),
      );
      assert.deepEqual(input, decision);
      for (const { id, forecast } of routes) {
        const after = play(decision, id);
        assert.deepEqual(forecast, {
          hull: after.hull,
          cold: after.crew.map(({ cold }) => cold),
          ration: after.tideResult?.ration,
          outcome: after.phase,
        });
      }
    }
  }
});

await test("the forecast includes raft-side cold and detects an otherwise safe crossing as fatal", () => {
  const { seed, history } = unmarked;
  const decision = [...history, "swim-1", "hook-0", "bell-1", "lash-2"].reduce(
    play,
    start(seed),
  );
  const forecasts = previewRoutes(decision);
  assert.equal(decision.crew[2]?.cold, 6);
  assert.deepEqual(
    forecasts.map(({ forecast }) => forecast),
    [
      { hull: 3, cold: [2, 5, 5], ration: 1, outcome: "lost" },
      { hull: 5, cold: [2, 7, 5], ration: 1, outcome: "lost" },
    ],
  );
});
