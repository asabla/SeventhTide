import assert from "node:assert/strict";
import test from "node:test";
import {
  bellBuoy,
  currentEvent,
  moves,
  play,
  previewRoutes,
  start,
} from "@seventh-tide/rules";

const deck = ["locker", "swim-1"];
const unbraced = [...deck, "lash-0", "float-1", "lash-2"];
const braced = [...deck, "mitts-0", "float-1", "lash-2"];

await test("the true chain rewards bracing and reduces the cost of following it", () => {
  const cards = deck.reduce(play, start(256));
  assert.match(currentEvent(cards)[1], /Brace to feel the chain/);
  const event = braced.reduce(play, start(256));
  assert.equal(bellBuoy(event), "chain");
  assert.match(currentEvent(event)[2], /knocks before the bell/);
  assert.deepEqual(
    moves(event).map(({ id }) => id),
    ["hull", "chain"],
  );
  assert.match(moves(event)[1]?.detail ?? "", /3 cold and recovers 3 rations/);
  assert.match(moves(event)[0]?.detail ?? "", /^No hull damage\./);
  assert.deepEqual(
    previewRoutes(event).map(({ forecast }) => forecast.ration),
    [1, 3],
  );

  const follow = play(event, "chain");
  assert.deepEqual(follow.tideResult?.route, { kind: "chain", cold: 1 });
  assert.deepEqual(follow.tideResult?.exposure, [0, 2, -1]);
  assert.equal(follow.tideResult?.ration, 3);
  assert.deepEqual(follow.crew[1], { name: "Ivo", cold: 3, food: 4 });
  assert.equal(follow.hull, event.hull);
  assert.equal(follow.tide, 2);
  assert.equal(bellBuoy(follow), undefined);
  assert.equal(play(event, "hull").hull, event.hull);
});

await test("a saved version-eleven voyage keeps its original chain reward", () => {
  const event = braced.reduce(play, start(256, 11));
  const route = previewRoutes(event).find(({ id }) => id === "chain");
  assert.equal(route?.forecast.ration, 2);
  const result = play(event, "chain");
  assert.equal(result.tideResult?.ration, 2);
  assert.deepEqual(result.crew[1], { name: "Ivo", cold: 3, food: 3 });
});

await test("following the false bell trades one extra cold for the hull", () => {
  const event = unbraced.reduce(play, start(256));
  assert.equal(bellBuoy(event), "echo");
  assert.match(currentEvent(event)[2], /bell calls first/);
  assert.match(moves(event)[1]?.detail ?? "", /3 cold and recovers 1 ration\./);
  assert.match(moves(event)[0]?.detail ?? "", /^Lose 1 hull\./);
  const follow = play(event, "chain");
  const leave = play(event, "hull");
  assert.equal(follow.crew[1]?.cold, 3);
  assert.equal(follow.crew[1]?.food, 2);
  assert.equal(follow.hull, event.hull);
  assert.equal(leave.hull, event.hull - 1);
  assert.equal(leave.crew[1]?.cold, 2);
  assert.equal(leave.phase, "board");
});

await test("a swimmer at one cold can follow the false bell in a new voyage", () => {
  const history = ["spar", "swim-0", "mitts-0", "lash-1", "lash-2"];
  const event = history.reduce(play, start(256));
  const archived = history.reduce(play, start(256, 16));
  assert.equal(bellBuoy(event), "echo");
  assert.equal(event.crew[0]?.cold, 1);
  assert.deepEqual(
    previewRoutes(event).find(({ id }) => id === "chain")?.forecast,
    {
      hull: 5,
      cold: [4, 1, 1],
      ration: 1,
      outcome: "board",
    },
  );
  const result = play(event, "chain");
  assert.equal(result.phase, "board");
  assert.equal(result.crew[0]?.cold, 4);
  assert.deepEqual(result.tideResult?.route, { kind: "chain", cold: 1 });
  const archivedResult = play(archived, "chain");
  assert.equal(archivedResult.phase, "lost");
  assert.equal(archivedResult.crew[0]?.cold, 5);
  assert.deepEqual(archivedResult.tideResult?.route, {
    kind: "chain",
    cold: 2,
  });
});

await test("a saved version-six voyage keeps its original bell buoy outcome", () => {
  const event = unbraced.reduce(play, start(256, 6));
  assert.equal(bellBuoy(event), undefined);
  assert.deepEqual(
    moves(event).map(({ id }) => id),
    ["hull", "dive"],
  );
  assert.throws(() => play(event, "chain"), /unavailable/);
  const result = play(event, "dive");
  assert.deepEqual([result.phase, result.hull, result.tide], ["board", 4, 2]);
  assert.deepEqual(result.tideResult, {
    tide: 1,
    event: "The bell buoy",
    choice: "Send the swimmer",
    swimmer: 1,
    route: { kind: "dive", cold: 1 },
    exposure: [-1, 2, -1],
    ration: 1,
  });
});
