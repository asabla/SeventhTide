import assert from "node:assert/strict";
import test from "node:test";
import { playWithBots } from "@seventh-tide/rules/crew";
import {
  currentEvent,
  crewMember,
  moves,
  play,
  reefBellEffect,
  reefPursuit,
  start,
} from "@seventh-tide/rules";
import {
  hauled,
  marked,
  pried,
  unmarked,
} from "./fixtures/landfall-pursuit.ts";

const routeIds = (state: ReturnType<typeof start>) =>
  moves(state).map(({ id }) => id);

await test("the earlier fallbacks carry the creature to tide seven and prying sheds it", () => {
  for (const { seed, history } of [unmarked, hauled, pried]) {
    let state = start(seed);
    for (const id of history) {
      assert.equal(reefPursuit(state), undefined);
      state = play(state, id);
    }
    assert.equal(state.tide, 7);
    const follows = seed !== pried.seed;
    assert.equal(reefPursuit(state), follows ? "following" : undefined);
    assert.equal(state.creatureFollowing, follows);
  }

  const safe = pried.history.reduce(play, start(pried.seed));
  const decision = ["swim-0", "feed-0-0", "feed-1-0", "lash-2"].reduce(
    play,
    safe,
  );
  assert.doesNotMatch(currentEvent(decision)[2], /creature/);
  assert.deepEqual(routeIds(decision), ["hull", "dive"]);
  assert.equal(play(decision, "dive").phase, "won");
});

await test("a raft bell opens the echo crossing without removing the marked channel or the fallbacks", () => {
  for (const { seed, history, plays } of [unmarked, marked]) {
    const board = history.reduce(play, start(seed));
    const cards = play(board, "swim-0");
    assert.match(currentEvent(cards)[1], /Ring the Wreck bell from the raft/);
    assert.ok(
      moves(cards)
        .find(({ id }) => id === "bell-1")
        ?.detail.includes(reefBellEffect),
    );
    const landing = plays.reduce(play, board);
    assert.equal(reefPursuit(landing), "drawn-off");
    assert.match(currentEvent(landing)[2], /Its wake bends/);
    assert.deepEqual(routeIds(landing), [
      ...(board.channelMarked ? ["channel"] : []),
      "echo-crossing",
      "hull",
      "dive",
    ]);
    assert.equal(landing.guard, 0);
    const ashore = play(landing, "echo-crossing");
    assert.equal(ashore.phase, "won");
    assert.deepEqual(ashore.tideResult?.route, {
      kind: "echo-crossing",
      lost: 1,
    });
    assert.equal(ashore.hull, landing.hull - 1);
    assert.equal(crewMember(ashore, 0).cold, crewMember(landing, 0).cold + 2);
    assert.equal(crewMember(ashore, 0).food, crewMember(landing, 0).food + 1);
    if (board.channelMarked) {
      const channel = play(landing, "channel");
      assert.equal(channel.phase, "won");
      assert.equal(channel.hull, landing.hull);
      assert.deepEqual(channel.crew, ashore.crew);
    }
  }
});

await test("silence or an underwater bell leaves the creature and the original routes", () => {
  const board = unmarked.history.reduce(play, start(unmarked.seed));
  const underwater = play(board, "swim-1");
  assert.ok(
    !moves(underwater)
      .find(({ id }) => id === "bell-1")
      ?.detail.includes(reefBellEffect),
  );
  const states = [
    ["swim-0", "feed-0-2", "lash-1", "lash-2"].reduce(play, board),
    ["hook-0", "bell-1", "lash-2"].reduce(play, underwater),
  ];
  for (const landing of states) {
    assert.equal(reefPursuit(landing), "following");
    assert.deepEqual(routeIds(landing), ["hull", "dive"]);
    assert.throws(() => play(landing, "echo-crossing"), /unavailable/);
  }

  const bell = { ...unmarked.plays.reduce(play, board), guard: 4 };
  assert.equal(play(bell, "echo-crossing").hull, bell.hull - 1);
  const fragile = { ...bell, hull: 1 };
  assert.match(moves(fragile)[0]?.detail ?? "", /Hull 1 → 0 \(raft breaks\)/);
  assert.equal(play(fragile, "echo-crossing").phase, "lost");
  const cold = structuredClone(bell);
  crewMember(cold, 0).cold = 3;
  assert.match(moves(cold)[0]?.detail ?? "", /Mara 3 → 5\/5 cold \(fatal\)/);
  assert.equal(play(cold, "echo-crossing").phase, "lost");
});

await test("a solo bot uses the bell when the echo crossing saves hull", () => {
  const cards = [...unmarked.history, "swim-0"].reduce(
    play,
    start(unmarked.seed),
  );
  const { state, history } = playWithBots(cards, "feed-0-2", 1);
  assert.deepEqual(history, ["feed-0-2", "bell-1", "lash-2"]);
  assert.equal(reefPursuit(state), "drawn-off");
  assert.ok(play(state, "echo-crossing").hull > play(state, "hull").hull);
});

await test("the version-nine landing archive keeps its original routes and exact outcome", () => {
  const archived = [...unmarked.history, ...unmarked.plays].reduce(
    play,
    start(unmarked.seed, 9),
  );
  assert.equal(archived.creatureFollowing, undefined);
  assert.equal(reefPursuit(archived), undefined);
  assert.deepEqual(routeIds(archived), ["hull", "dive"]);
  const ashore = play(archived, "hull");
  assert.equal(ashore.phase, "won");
  assert.equal(ashore.hull, 4);
  assert.deepEqual(ashore.tideResult?.route, {
    kind: "hull",
    incoming: 4,
    blocked: 3,
    lost: 1,
  });
  assert.deepEqual(
    ashore.crew.map(({ cold }) => cold),
    [4, 2, 3],
  );
});
