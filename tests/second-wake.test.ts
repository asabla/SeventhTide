import assert from "node:assert/strict";
import test from "node:test";
import {
  currentEvent,
  moves,
  play,
  secondWake,
  start,
} from "@seventh-tide/rules";

const raftBell = ["locker", "swim-1", "bell-0", "float-1", "lash-2"];

await test("ringing the bell on the raft lets the swimmer haul in on the echo", () => {
  const before = raftBell.slice(0, 2).reduce(play, start(456));
  assert.equal(secondWake(before), "following");
  assert.match(currentEvent(before)[1], /Ring the Wreck bell from the raft/);
  assert.match(
    moves(before).find(({ id }) => id === "bell-0")?.detail ?? "",
    /Gain 3 brace\. Take 2 cold\. Draw the wake away/,
  );
  const ready = raftBell.slice(2).reduce(play, before);
  assert.equal(secondWake(ready), "drawn-off");
  assert.deepEqual(
    moves(ready).map(({ id }) => id),
    ["decoy", "hull", "dive"],
  );
  assert.equal(ready.crew[0]?.cold, 3);
  assert.equal(ready.guard, 3);

  const hauled = play(ready, "decoy");
  const braced = play(ready, "hull");
  assert.equal(hauled.hull, braced.hull);
  assert.deepEqual(hauled.tideResult?.route, { kind: "decoy" });
  assert.deepEqual(hauled.tideResult?.exposure, [-1, 1, -1]);
  assert.deepEqual(
    hauled.crew.map(({ cold, food }) => [cold, food]),
    [
      [2, 1],
      [1, 2],
      [2, 1],
    ],
  );
  assert.equal(hauled.phase, "board");
  assert.equal(hauled.tide, 2);
  assert.equal(secondWake(hauled), undefined);
  assert.equal(braced.crew[1]?.cold, 2);
});

await test("the bell underwater and an unprepared crew leave the two standard routes", () => {
  const underwater = ["locker", "swim-0", "bell-0", "lash-1", "lash-2"].reduce(
    play,
    start(456),
  );
  const unprepared = [
    "locker",
    "swim-1",
    "mitts-0",
    "float-1",
    "lash-2",
  ].reduce(play, start(456));
  for (const state of [underwater, unprepared]) {
    assert.equal(secondWake(state), "following");
    assert.deepEqual(
      moves(state).map(({ id }) => id),
      ["hull", "dive"],
    );
    assert.throws(() => play(state, "decoy"), /unavailable/);
    assert.deepEqual(play(state, "dive").tideResult?.route, {
      kind: "dive",
      cold: 1,
    });
  }
});

await test("the recorded version-five Second Wake outcome replays as before", () => {
  const ready = raftBell.reduce(play, start(456, 5));
  assert.equal(secondWake(ready), undefined);
  assert.deepEqual(
    moves(ready).map(({ id }) => id),
    ["hull", "dive"],
  );
  const result = play(ready, "hull");
  assert.deepEqual([result.phase, result.hull, result.tide], ["board", 3, 2]);
  assert.deepEqual(
    result.crew.map(({ cold, food }) => [cold, food]),
    [
      [2, 1],
      [2, 2],
      [2, 1],
    ],
  );
  assert.deepEqual(result.tideResult, {
    tide: 1,
    event: "The second wake",
    choice: "Let the raft take it",
    swimmer: 1,
    route: { kind: "hull", incoming: 2, blocked: 2, lost: 0 },
    exposure: [-1, 2, -1],
    ration: 1,
  });
});
