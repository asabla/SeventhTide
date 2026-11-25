import assert from "node:assert/strict";
import test from "node:test";
import { currentEvent, play, previewRoutes, start } from "@seventh-tide/rules";
import {
  towlineHistory,
  towlineSeed,
  towlineV16History,
} from "./fixtures/towline.ts";

await test("a warm swimmer can slip the towline and spare the hull", () => {
  const state = towlineV16History.split(" ").reduce(play, start(towlineSeed));
  assert.equal(currentEvent(state)[0], "The towline");
  assert.deepEqual([state.hull, state.guard, state.crew[0]?.cold], [4, 1, 1]);
  const routes = previewRoutes(state).map(({ name, forecast }) => [
    name,
    forecast.hull,
    forecast.cold[0],
    forecast.outcome,
  ]);
  assert.deepEqual(routes, [
    ["Let the rope drag", 3, 3, "board"],
    ["Slip the towline", 4, 4, "board"],
  ]);
  const next = play(state, "dive");
  assert.equal(next.phase, "board");
  assert.equal(next.hull, 4);
  assert.equal(next.crew[0]?.cold, 4);
  assert.deepEqual(next.tideResult?.route, { kind: "dive", cold: 1 });
});

await test("archived Towline voyages keep their route names and original loss", () => {
  const state = towlineHistory.split(" ").reduce(play, start(towlineSeed, 13));
  const rescue = previewRoutes(state).find(({ id }) => id === "dive");
  assert.equal(rescue?.name, "Send the swimmer");
  assert.equal(rescue?.forecast.outcome, "lost");
  const next = play(state, "dive");
  assert.equal(next.phase, "lost");
  assert.deepEqual(next.tideResult?.route, { kind: "dive", cold: 2 });
});
