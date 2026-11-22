import assert from "node:assert/strict";
import test from "node:test";
import { playWithBots } from "@seventh-tide/rules/crew";
import {
  crewMember,
  currentEvent,
  moves,
  play,
  start,
  underRaft,
} from "@seventh-tide/rules";

const board = play(start(96), "spar");
const atGrip = play(board, "swim-0");

await test("the swimmer's line and the raft's hook can be set in either order", () => {
  assert.deepEqual(underRaft(board), { line: false, hook: false });
  for (const [firstMove, secondMove] of [
    ["line-0", "hook-1"],
    ["hook-1", "line-0"],
  ] as const) {
    const first = play(atGrip, firstMove);
    assert.deepEqual(underRaft(first), {
      line: firstMove === "line-0",
      hook: firstMove === "hook-1",
    });
    const ready = [secondMove, "line-2"].reduce(play, first);
    assert.deepEqual(underRaft(ready), { line: true, hook: true });
    assert.deepEqual(
      moves(ready).map(({ id }) => id),
      ["pry", "hull", "dive"],
    );
    assert.match(currentEvent(ready)[2], /line is taut/);
    const pry = play(ready, "pry");
    assert.equal(pry.hull, ready.hull);
    assert.deepEqual(pry.tideResult?.route, { kind: "pry" });
    assert.deepEqual(pry.tideResult?.exposure, [2, -1, -1]);
    assert.equal(pry.tideResult?.ration, 1);
    assert.equal(pry.phase, "board");
    assert.equal(pry.tide, 2);
    assert.equal(underRaft(pry), undefined);
  }
});

await test("a missing tool or a tool played in the wrong position leaves two fallbacks", () => {
  for (const history of [
    ["swim-0", "line-0", "lash-1", "lash-2"],
    ["swim-0", "float-0", "hook-1", "lash-2"],
    ["swim-1", "line-0", "hook-1", "lash-2"],
  ]) {
    const unready = history.reduce(play, board);
    assert.deepEqual(
      moves(unready).map(({ id }) => id),
      ["hull", "dive"],
    );
    assert.throws(() => play(unready, "pry"), /unavailable/);
  }
  const ready = ["line-0", "hook-1", "lash-2"].reduce(play, atGrip);
  assert.ok(ready.guard > 0);
  const cut = play(ready, "hull");
  assert.equal(cut.hull, ready.hull - 1);
  assert.deepEqual(cut.tideResult?.route, { kind: "cut", lost: 1 });
  assert.equal(cut.crew[0]?.cold, crewMember(ready, 0).cold + 2);
  const haul = play(ready, "dive");
  assert.equal(haul.hull, ready.hull);
  assert.deepEqual(haul.tideResult?.route, { kind: "dive", cold: 2 });
  assert.equal(haul.crew[0]?.cold, crewMember(ready, 0).cold + 4);
  assert.equal(haul.phase, "lost");
});

await test("solo bots consider both positions when Mara plays part of the pair", () => {
  const line = playWithBots(atGrip, "line-0", 1);
  assert.ok(line.history.includes("hook-1"));
  assert.equal(moves(line.state)[0]?.id, "pry");
  const raft = ["locker", "swim-1"].reduce(play, start(511));
  const hook = playWithBots(raft, "hook-0", 1);
  assert.ok(hook.history.includes("line-1"));
  assert.equal(moves(hook.state)[0]?.id, "pry");

  const missing = playWithBots(atGrip, "float-0", 1);
  assert.deepEqual(
    moves(missing.state).map(({ id }) => id),
    ["hull", "dive"],
  );
});

await test("a recorded version-seven split seam keeps its original hull and brace outcome", () => {
  const seam = ["spar", "swim-0", "line-0", "hook-1", "lash-2"].reduce(
    play,
    start(96, 7),
  );
  assert.equal(currentEvent(seam)[0], "The split seam");
  assert.equal(underRaft(seam), undefined);
  assert.deepEqual(
    moves(seam).map(({ id }) => id),
    ["hull", "dive"],
  );
  const result = play(seam, "hull");
  assert.equal(result.hull, 5);
  assert.deepEqual(result.tideResult?.route, {
    kind: "hull",
    incoming: 2,
    blocked: 2,
    lost: 0,
  });
});
