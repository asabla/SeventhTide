import assert from "node:assert/strict";
import test from "node:test";
import { currentEvent, moves, play, start } from "@seventh-tide/rules";

const approach =
  "canvas swim-0 float-0 lash-1 lash-2 hull swim-1 float-1 feed-0-1 lash-2 dive swim-2 float-2 feed-1-2 lash-0 hull swim-0 float-0 feed-2-0 lash-1 dive swim-1 float-1 feed-0-1 lash-2 dive".split(
    " ",
  );

await test("only the tide-six swimmer can mark the channel, and it takes their card action", () => {
  const board = approach.reduce(play, start(4203543429, 3));
  assert.equal(board.tide, 6);
  assert.match(currentEvent(board)[1], /Two lanterns/);
  const aboard = play(play(board, "swim-0"), "line-2");
  assert.equal(aboard.channelMarked, false);
  const swimming = play(board, "swim-2");
  assert.match(
    moves(swimming).find((m) => m.id === "line-2")?.detail ?? "",
    /Mark the safe channel/,
  );
  const marked = play(swimming, "line-2");
  assert.equal(marked.channelMarked, true);
  assert.equal(marked.plays[0]?.markedChannel, true);
  assert.match(currentEvent(marked)[1], /has marked/);
  assert.equal(marked.guard, 1);
  assert.equal(marked.crew[2]?.cold, 3);
  assert.throws(() => play(marked, "line-2"));
  const sixth = ["feed-1-2", "lash-0"].reduce(play, marked);
  assert.throws(() => play(sixth, "channel"));
  const landing = "dive swim-0 float-0 feed-2-0 lash-1"
    .split(" ")
    .reduce(play, sixth);
  assert.match(currentEvent(landing)[1], /marked channel/);
  assert.deepEqual(
    moves(landing).map((m) => m.id),
    ["channel", "hull", "dive"],
  );
  assert.equal(play(landing, "hull").phase, "lost");
  assert.equal(play(landing, "dive").phase, "lost");
  const ashore = play(landing, "channel");
  assert.equal(ashore.phase, "won");
  assert.deepEqual(ashore.tideResult?.route, { kind: "channel" });
  assert.equal(ashore.hull, landing.hull);
  assert.equal(ashore.crew[0]?.cold, 3);
  assert.equal(ashore.crew[1]?.cold, 4);
});

await test("a crew that never holds a sounding line can scout the reef and land", () => {
  let s = start(1796699749, 3);
  const history =
    "spar swim-0 float-0 lash-1 lash-2 hull swim-1 float-1 feed-0-1 lash-2 dive swim-2 float-2 feed-1-2 lash-0 hull swim-0 float-0 feed-2-0 lash-1 hull swim-1 float-1 feed-0-1 lash-2 dive swim-2 float-2 feed-1-2 lash-0 dive swim-0 float-0 feed-2-0 lash-1".split(
      " ",
    );
  for (const id of history) {
    s = play(s, id);
    assert.equal(s.deck?.hands.flat().includes("line"), false);
  }
  assert.match(currentEvent(s)[1], /without a marked channel/);
  assert.deepEqual(
    moves(s).map((m) => m.id),
    ["hull", "dive"],
  );
  assert.throws(() => play(s, "channel"));
  const ashore = play(s, "dive");
  assert.equal(ashore.phase, "won");
  assert.equal(ashore.crew[0]?.cold, 4);
});
