import assert from "node:assert/strict";
import test from "node:test";
import {
  bellBuoy,
  currentEvent,
  moves,
  play,
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
  assert.match(moves(event)[1]?.detail ?? "", /3 cold and recovers 2 rations/);
  assert.match(moves(event)[0]?.detail ?? "", /^No hull damage\./);

  const follow = play(event, "chain");
  assert.deepEqual(follow.tideResult?.route, { kind: "chain", cold: 1 });
  assert.deepEqual(follow.tideResult?.exposure, [0, 2, -1]);
  assert.equal(follow.tideResult?.ration, 2);
  assert.deepEqual(follow.crew[1], { name: "Ivo", cold: 3, food: 3 });
  assert.equal(follow.hull, event.hull);
  assert.equal(follow.tide, 2);
  assert.equal(bellBuoy(follow), undefined);
  assert.equal(play(event, "hull").hull, event.hull);
});

await test("following the false bell adds cold and gives the usual ration", () => {
  const event = unbraced.reduce(play, start(256));
  assert.equal(bellBuoy(event), "echo");
  assert.match(currentEvent(event)[2], /bell calls first/);
  assert.match(moves(event)[1]?.detail ?? "", /4 cold and recovers 1 ration\./);
  assert.match(moves(event)[0]?.detail ?? "", /^Lose 1 hull\./);
  const follow = play(event, "chain");
  const leave = play(event, "hull");
  assert.equal(follow.crew[1]?.cold, 4);
  assert.equal(follow.crew[1]?.food, 2);
  assert.equal(leave.hull, event.hull - 1);
  assert.equal(leave.crew[1]?.cold, 2);
  assert.equal(leave.phase, "board");
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
