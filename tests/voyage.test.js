import test from "node:test";
import assert from "node:assert/strict";
import { start, play, moves } from "../web/rules/voyage.js";

function board(seed = 17) {
  const s = start(seed);
  return play(s, moves(s)[0].id);
}

test("the salvage draw and six hazards replay from the seed, with rescue last", () => {
  const s = start(42);
  assert.deepEqual(start(42), s);
  assert.equal(new Set(s.salvage.map((c) => c.id)).size, 2);
  assert.equal(new Set(s.events.map((e) => e[0])).size, 7);
  assert.equal(s.events.at(-1)[0], "The answering light");
});

test("one swimmer gets the ration once, only after all crew play and the event resolves", () => {
  const before = board();
  const swim = play(before, "swim-1");
  assert.throws(() => play(swim, "dive"));
  const sound = play(swim, "sound-1");
  assert.throws(() => play(sound, "sound-1"));
  const ready = play(play(sound, "haul-0"), "lash-2");
  assert.deepEqual(
    ready.crew.map((p) => p.food),
    before.crew.map((p) => p.food),
  );
  const next = play(ready, "hull");
  assert.deepEqual(
    next.crew.map((p) => p.food),
    before.crew.map((p, i) => p.food + Number(i === 1)),
  );
  assert.equal(next.tide, 2);
  assert.throws(() => play(next, "hull"));
  const hand = play(next, "swim-0");
  const fed = play(hand, "feed-1-1");
  assert.equal(fed.crew[1].food, hand.crew[1].food - 1);
  assert.equal(fed.crew[1].cold, Math.max(0, hand.crew[1].cold - 2));
});

test("a crew can reach shore on tide seven and replay the same voyage", () => {
  const seed = 111;
  let s = start(seed);
  const history = [];
  function act(id) {
    history.push(id);
    s = play(s, id);
  }
  act(s.salvage[0].id);
  for (let t = 1; t <= 7; t++) {
    const swimmer = (t - 1) % 3;
    const mates = [0, 1, 2].filter((i) => i !== swimmer);
    act("swim-" + swimmer);
    act("sound-" + swimmer);
    const helper = mates.find((i) => s.crew[i].food > 0) ?? mates[0];
    const repairer = mates.find((i) => i !== helper);
    act(
      s.crew[helper].food ? "feed-" + helper + "-" + swimmer : "haul-" + helper,
    );
    act("lash-" + repairer);
    act(s.hull > s.events[t - 1][3] - s.guard ? "hull" : "dive");
  }
  assert.equal(s.phase, "won");
  assert.deepEqual(history.reduce(play, start(seed)), s);
  assert.equal(moves(s).length, 0);
});

test("exposure can end a voyage before the seventh tide", () => {
  let s = board();
  while (s.phase === "board") {
    s = ["swim-0", "sound-0", "lash-1", "lash-2", "dive"].reduce(play, s);
  }
  assert.equal(s.phase, "lost");
  assert.ok(s.tide < 7);
  assert.match(s.log.at(-1), /cold/);
});
