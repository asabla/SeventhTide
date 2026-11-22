import assert from "node:assert/strict";
import test from "node:test";
import {
  crewMember,
  lockerFind,
  moves,
  play,
  start,
} from "@seventh-tide/rules";
import {
  assistSeats,
  botMove,
  playWithBots,
  seatMoves,
} from "@seventh-tide/rules/crew";

const history =
  "spar swim-0 float-0 line-1 lash-2 hull swim-0 feed-0-0 lash-1 line-2 hull swim-1 feed-0-1 anchor-1 patch-2".split(
    " ",
  );
const decision = history.reduce(play, start(0));
const carried = ["kettle", "patch"];

await test("version nine has one locker on tide three through five and preserves prior encounters", () => {
  for (let seed = 0; seed < 24; seed++) {
    const previous = start(seed, 8).events.map(([name]) => name);
    const current = start(seed).events.map(([name]) => name);
    assert.equal(current.length, 7);
    assert.equal(
      current.filter((name) => name === "The drifting locker").length,
      1,
    );
    assert.ok(current.slice(2, 5).includes("The drifting locker"));
    assert.deepEqual(
      current.filter((name) => name !== "The drifting locker").toSorted(),
      previous.filter((name) => name !== "The black squall").toSorted(),
    );
  }
  const archived = "spar swim-0 float-0 comb-1 mitts-2 hull"
    .split(" ")
    .reduce(play, start(7, 8));
  assert.equal(archived.tideResult?.event, "The black squall");
  assert.deepEqual(archived.tideResult?.route, {
    kind: "hull",
    incoming: 1,
    blocked: 1,
    lost: 0,
  });
  assert.equal(archived.hull, 4);
  assert.deepEqual(
    archived.crew.map(({ cold, food }) => [cold, food]),
    [
      [3, 1],
      [2, 2],
      [0, 0],
    ],
  );
});

await test("only the swimmer can exchange the find and the swap is deterministic", () => {
  assert.equal(lockerFind(decision)?.id, "line");
  assert.deepEqual(
    moves(decision).map(({ id }) => id),
    ["haul-locker", "hull"],
  );
  const pending = play(decision, "haul-locker");
  assert.equal(pending.phase, "recover");
  assert.equal(pending.tide, decision.tide);
  assert.equal(pending.guard, 0);
  assert.equal(crewMember(pending, 1).cold, crewMember(decision, 1).cold + 3);
  assert.equal(crewMember(pending, 1).food, crewMember(decision, 1).food + 1);
  assert.deepEqual(pending.deck?.hands[1], carried);
  assert.deepEqual(seatMoves(pending, 0, 2), []);
  assert.deepEqual(assistSeats(pending, 0, 2), [1]);
  assert.deepEqual(
    seatMoves(pending, 1, 2).map(({ id }) => id),
    ["stow-kettle", "stow-patch", "keep-hand"],
  );
  const swapped = play(pending, "stow-patch");
  assert.equal(swapped.phase, "board");
  assert.equal(swapped.tide, pending.tide + 1);
  assert.equal(swapped.swimmer, null);
  assert.equal(lockerFind(swapped), undefined);
  assert.deepEqual(swapped.crew, pending.crew);
  assert.deepEqual(swapped.deck?.hands[1], ["kettle", "line"]);
  assert.deepEqual(swapped.deck?.hands[0], pending.deck?.hands[0]);
  assert.deepEqual(swapped.deck?.hands[2], pending.deck?.hands[2]);
  assert.equal(swapped.deck?.discard.at(-1), "patch");
  assert.deepEqual(swapped.deck?.draw, pending.deck?.draw);
  assert.deepEqual(swapped.tideResult?.route, {
    kind: "haul-locker",
    cold: 1,
    find: "Sounding line",
    stowed: true,
  });
  assert.deepEqual(
    [...history, "haul-locker", "stow-patch"].reduce(play, start(0)),
    swapped,
  );
  assert.throws(() => play(swapped, "stow-patch"), /unavailable/);

  const kept = play(pending, "keep-hand");
  assert.equal(kept.phase, "board");
  assert.deepEqual(kept.deck, pending.deck);
  assert.deepEqual(kept.tideResult?.route, {
    kind: "haul-locker",
    cold: 1,
    find: "Sounding line",
    stowed: false,
  });
});

await test("the cut applies normal exposure and a fatal haul ends before any swap", () => {
  const cold = structuredClone(decision);
  crewMember(cold, 1).cold = 2;
  assert.match(
    moves(cold).find(({ id }) => id === "haul-locker")?.detail ?? "",
    /5\/5 cold \(fatal\)/,
  );
  const drift = play(cold, "hull");
  const fatal = play(cold, "haul-locker");
  assert.equal(drift.phase, "board");
  assert.equal(drift.hull, cold.hull);
  assert.equal(crewMember(drift, 1).cold, 4);
  assert.deepEqual(drift.deck, cold.deck);
  assert.equal(fatal.phase, "lost");
  assert.equal(crewMember(fatal, 1).cold, 5);
  assert.deepEqual(fatal.deck, cold.deck);
  assert.deepEqual(moves(fatal), []);
});

await test("a solo bot chooses a useful swap and leaves an already identical find", () => {
  const bot = playWithBots(decision, "haul-locker", 1);
  assert.deepEqual(bot.history, ["haul-locker", "stow-patch"]);
  assert.equal(bot.state.phase, "board");
  const duplicate = structuredClone(decision);
  assert.ok(duplicate.deck);
  duplicate.deck.hands[1] = ["line", "line"];
  const pending = play(duplicate, "haul-locker");
  assert.equal(botMove(pending, 1)?.id, "keep-hand");
  assert.equal(botMove(pending, 0), undefined);
  assert.deepEqual(
    moves(pending).map(({ id }) => id),
    ["keep-hand"],
  );
});
