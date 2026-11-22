import assert from "node:assert/strict";
import test from "node:test";
import { moves, play, start } from "@seventh-tide/rules";

await test("securing spare timber keeps four hull and adds the same patch cards", () => {
  const version10 = start(0, 10);
  assert.match(
    moves(version10).find(({ id }) => id === "spar")?.detail ?? "",
    /Each sailor gains 1 cold/,
  );
  const prior = play(version10, "spar");
  assert.equal(prior.hull, 5);
  assert.deepEqual(
    prior.crew.map(({ cold }) => cold),
    [2, 2, 2],
  );

  const version11 = start(0, 11);
  assert.match(
    moves(version11).find(({ id }) => id === "spar")?.detail ?? "",
    /Keep all 4 hull/,
  );
  const board = play(version11, "spar");
  assert.equal(board.phase, "board");
  assert.equal(board.hull, 4);
  assert.deepEqual(
    board.crew.map(({ cold, food }) => [cold, food]),
    [
      [1, 0],
      [1, 0],
      [1, 0],
    ],
  );
  assert.deepEqual(board.deck, prior.deck);
  assert.deepEqual(board.events, prior.events);
});
