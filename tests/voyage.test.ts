import test from "node:test";
import assert from "node:assert/strict";
import {
  start,
  play,
  moves,
  currentEvent,
  crewMember,
} from "@seventh-tide/rules";

function board(seed = 17) {
  const s = start(seed, 1);
  const [card] = moves(s);
  assert.ok(card);
  return play(s, card.id);
}

await test("the salvage draw and six hazards replay from the seed, with rescue last", () => {
  const s = start(42);
  assert.deepEqual(start(42), s);
  assert.equal(new Set(s.salvage.map((c) => c.id)).size, 2);
  assert.equal(new Set(s.events.map((e) => e[0])).size, 7);
  assert.equal(s.events.at(-1)?.[0], "The answering light");
});

await test("one swimmer gets the ration once, only after all crew play and the event resolves", () => {
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
  assert.equal(crewMember(fed, 1).food, crewMember(hand, 1).food - 1);
  assert.equal(
    crewMember(fed, 1).cold,
    Math.max(0, crewMember(hand, 1).cold - 2),
  );
});

await test("a crew can reach shore on tide seven and replay the same voyage", () => {
  const seed = 111;
  let s = start(seed, 1);
  const history: string[] = [];
  function act(id: string) {
    history.push(id);
    s = play(s, id);
  }
  const [salvage] = s.salvage;
  assert.ok(salvage);
  act(salvage.id);
  for (let t = 1; t <= 7; t++) {
    const swimmer = (t - 1) % 3;
    const mates = [0, 1, 2].filter((i) => i !== swimmer);
    act("swim-" + swimmer);
    act("sound-" + swimmer);
    const helper = mates.find((i) => crewMember(s, i).food > 0) ?? mates[0];
    assert.ok(helper !== undefined);
    const repairer = mates.find((i) => i !== helper);
    assert.ok(repairer !== undefined);
    act(
      crewMember(s, helper).food
        ? "feed-" + helper + "-" + swimmer
        : "haul-" + helper,
    );
    act("lash-" + repairer);
    act(s.hull > currentEvent(s)[3] - s.guard ? "hull" : "dive");
  }
  assert.equal(s.phase, "won");
  assert.deepEqual(history.reduce(play, start(seed, 1)), s);
  assert.equal(moves(s).length, 0);
});

await test("exposure can end a voyage before the seventh tide", () => {
  let s = board();
  while (s.phase === "board") {
    s = ["swim-0", "sound-0", "lash-1", "lash-2", "dive"].reduce(play, s);
  }
  assert.equal(s.phase, "lost");
  assert.ok(s.tide < 7);
  assert.match(s.log.at(-1) ?? "", /cold/);
});

await test("floating trades one hull for one cold and leaves the previous turn intact", () => {
  const before = play(board(), "swim-0");
  const after = play(before, "float-0");
  assert.equal(after.hull, before.hull - 1);
  assert.equal(
    crewMember(after, 0).cold,
    Math.max(0, crewMember(before, 0).cold - 1),
  );
  assert.deepEqual(before.acted, []);
  assert.deepEqual(after.acted, [0]);
});

await test("the play-by-play records card targets and separates brace from exposure", () => {
  const water = ["locker", "swim-0"].reduce(play, start(318));
  const sound = play(water, "line-0");
  assert.deepEqual(sound.plays[0], {
    actor: 0,
    id: "line-0",
    name: "Sounding line",
    kind: "card",
    changes: [
      { sailor: null, resource: "brace", amount: 1 },
      { sailor: 0, resource: "cold", amount: 1 },
    ],
    markedChannel: false,
  });
  const ready = ["hook-1", "tin-2-0"].reduce(play, sound);
  assert.deepEqual(ready.plays[2]?.changes, [
    { sailor: 0, resource: "cold", amount: -2 },
    { sailor: 2, resource: "cold", amount: 1 },
  ]);
  const hull = play(ready, "hull");
  assert.deepEqual(hull.tideResult, {
    tide: 1,
    event: "The wreck field",
    choice: "Let the raft take it",
    swimmer: 0,
    route: { kind: "hull", incoming: 3, blocked: 3, lost: 0 },
    exposure: [2, -1, -1],
    ration: 1,
  });
  const boarding = play(hull, "swim-1");
  assert.deepEqual(boarding.plays, []);
  assert.deepEqual(boarding.tideResult, hull.tideResult);
  const dive = play(ready, "dive");
  assert.deepEqual(dive.tideResult?.route, { kind: "dive", cold: 1 });
  assert.deepEqual(dive.tideResult?.exposure, hull.tideResult?.exposure);
  assert.equal(dive.crew[0]?.cold, 3);
});
