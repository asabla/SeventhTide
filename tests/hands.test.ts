import test from "node:test";
import assert from "node:assert/strict";
import {
  crewMember,
  handPreview,
  moves,
  play,
  start,
} from "@seventh-tide/rules";

await test("version-one fixture preserves the original hands and outcome", () => {
  const voyage = [
    "canvas",
    "swim-1",
    "sound-1",
    "haul-0",
    "lash-2",
    "hull",
  ].reduce(play, start(111, 1));
  assert.equal(voyage.deck, undefined);
  assert.deepEqual([voyage.tide, voyage.phase, voyage.hull], [2, "board", 4]);
  assert.deepEqual(
    voyage.crew.map((p) => [p.cold, p.food]),
    [
      [0, 0],
      [2, 1],
      [0, 0],
    ],
  );
  assert.throws(() => start(1, 3), /Unsupported/);
});

await test("salvage changes the deck and only the played card is replaced", () => {
  const seen = new Set<string>();
  const effects = new Set<string>();
  for (let n = 0; n < 64; n++) {
    const seed = Math.imul(n, 2654435761) >>> 0;
    for (const salvage of moves(start(seed))) {
      const board = play(start(seed), salvage.id);
      const deck = board.deck;
      assert.ok(deck);
      assert.deepEqual(
        deck.hands.map((h) => h.length),
        [2, 2, 2],
      );
      const cards = [...deck.draw, ...deck.hands.flat()];
      const copies = (id: string) => cards.filter((c) => c === id).length;
      assert.deepEqual(
        [copies("tin"), copies("patch"), copies("wrap")],
        [
          salvage.id === "locker" ? 2 : 0,
          salvage.id === "spar" ? 3 : 1,
          salvage.id === "canvas" ? 3 : 1,
        ],
      );
      seen.add(salvage.id);
      const preview = handPreview(deck, 0);
      assert.equal(preview.length, 2);
      assert.ok(preview.every((c) => c.raft && c.water));
      const state = play(board, "swim-0");
      for (const move of moves(state)) {
        const actor = move.actor;
        assert.ok(actor !== undefined);
        const next = play(state, move.id);
        assert.ok(next.deck);
        if (move.card) {
          effects.add(move.card + (actor === 0 ? "-water" : "-raft"));
          const previous: readonly string[] | undefined = deck.hands[actor];
          const changed = next.deck.hands[actor];
          assert.ok(previous && changed);
          const slot = previous.indexOf(move.card);
          assert.ok(slot >= 0);
          assert.equal(changed[1 - slot], previous[1 - slot]);
          assert.deepEqual(next.deck.discard, [move.card]);
          assert.equal(changed[slot], deck.draw.at(-1));
          assert.equal(next.deck.draw.length, 3);
          if (move.card === "hook" && actor === 0)
            assert.equal(next.hull, Math.min(5, state.hull + 2));
          if (move.card === "hook" && actor !== 0) assert.equal(next.guard, 2);
          if (move.card === "tin" && actor === 0)
            assert.equal(
              crewMember(next, actor).food,
              crewMember(state, actor).food + 1,
            );
        } else assert.deepEqual(next.deck, deck);
        assert.ok(moves(next).every((m) => m.actor !== actor));
      }
    }
  }
  assert.equal(seen.size, 3);
  assert.equal(effects.size, 10);
});

await test("Mara can keep the sounding line on tide five and use it at landfall", () => {
  const fifthTide =
    "locker swim-0 line-0 feed-1-0 lash-2 hull swim-1 float-1 feed-0-1 lash-2 dive swim-2 float-2 feed-0-2 lash-1 hull swim-0 line-0 feed-1-0 lash-2 hull swim-1 float-1"
      .split(" ")
      .reduce(play, start(1387841383));
  assert.deepEqual(fifthTide.deck?.hands[0], ["wrap", "line"]);
  const saved =
    "feed-0-1 lash-2 dive swim-2 float-2 feed-1-2 lash-0 hull swim-0 line-0 feed-2-0 lash-1 dive"
      .split(" ")
      .reduce(play, fifthTide);
  const spent = "line-0 lash-2 dive swim-2 float-2 feed-0-2 lash-1 hull"
    .split(" ")
    .reduce(play, fifthTide);
  assert.deepEqual([saved.tide, saved.phase], [7, "won"]);
  assert.deepEqual([spent.tide, spent.phase], [6, "lost"]);
});

await test("a voyage draws through its discard pile and replays with the same ten cards", () => {
  let voyage = start(0);
  const history =
    "canvas swim-1 hook-1 line-0 hook-2 hull swim-1 feed-1-1 lash-0 hook-2 hull swim-2 float-2 lash-0 feed-1-0 dive swim-1 float-1 lash-0 feed-2-2 hull swim-0 float-0 feed-1-1 patch-2 hull swim-0 feed-0-0 lash-1 lash-2 dive swim-0 feed-0-0 line-1 hook-2 hull".split(
      " ",
    );
  let reshuffled = false;
  for (const id of history) {
    const empty = voyage.phase === "cards" && voyage.deck?.draw.length === 0;
    voyage = play(voyage, id);
    const deck = voyage.deck;
    assert.ok(deck);
    assert.equal(
      deck.draw.length + deck.discard.length + deck.hands.flat().length,
      10,
    );
    if (empty && deck.draw.length > 0) reshuffled = true;
  }
  assert.ok(reshuffled);
  assert.equal(voyage.phase, "won");
  assert.deepEqual(history.reduce(play, start(0)), voyage);
});
