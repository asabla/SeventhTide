import assert from "node:assert/strict";
import test from "node:test";
import {
  assistSeats,
  botMove,
  channelScouts,
  finishBotTurns,
  playWithBots,
  seatMoves,
} from "@seventh-tide/rules/crew";
import { moves, play, start } from "@seventh-tide/rules";

const board = play(start(318), "locker");

await test("each device can act for one sailor and the host can board a bot alongside volunteers", () => {
  assert.deepEqual(seatMoves(board, 1, 2), []);
  assert.deepEqual(
    seatMoves(board, 0, 2, [1]).map((m) => m.id),
    ["swim-1", "swim-2"],
  );
  assert.deepEqual(
    seatMoves(board, 0, 3, [1]).map((m) => m.id),
    ["swim-1"],
  );
  assert.deepEqual(seatMoves(board, 0, 2), moves(board));
  const hands = play(board, "swim-0");
  for (const i of [0, 1, 2])
    assert.ok(seatMoves(hands, i, 3).every((m) => m.actor === i));
  assert.deepEqual(assistSeats(board, 0, 2), []);
  assert.deepEqual(assistSeats(hands, 1, 2), []);
  assert.deepEqual(assistSeats(hands, 0, 2), [1]);
  assert.deepEqual(channelScouts(board), []);
  assert.ok(channelScouts({ ...board, tide: 6 }).includes(0));
  assert.deepEqual(
    channelScouts({ ...board, tide: 6, channelMarked: true }),
    [],
  );
});

await test("solo batches both bots and replays the exact recorded moves", () => {
  const hands = play(board, "swim-0");
  assert.deepEqual(finishBotTurns(hands, 1).history, []);
  const next = playWithBots(hands, "line-0", 1);
  assert.deepEqual(next.state.acted, [0, 1, 2]);
  assert.equal(next.history.length, 3);
  assert.equal(next.state.phase, "event");
  assert.deepEqual(next.history.reduce(play, hands), next.state);
  assert.deepEqual(seatMoves(next.state, 1, 2), []);
  assert.equal(botMove(next.state, 1), undefined);
  assert.deepEqual(finishBotTurns(next.state, 1).history, []);
});

await test("bot assist takes an absent friend's turn once and restores old rooms at the same checkpoint", () => {
  const afterMara = ["swim-0", "line-0"].reduce(play, board);
  assert.equal(botMove(afterMara, 0), undefined);
  assert.deepEqual(finishBotTurns(afterMara, 2).history, []);
  const suggestion = botMove(afterMara, 1);
  assert.ok(suggestion);
  const staleSave = play(afterMara, suggestion.id);
  assert.deepEqual(assistSeats(staleSave, 0, 2), [2]);
  const next = playWithBots(afterMara, suggestion.id, 2);
  assert.deepEqual(next.state.acted, [0, 1, 2]);
  assert.deepEqual(next.state, finishBotTurns(staleSave, 2).state);
  const resumed = play(next.state, "hull");
  assert.equal(resumed.phase, "board");
  const hands = play(resumed, "swim-1");
  assert.ok(seatMoves(hands, 1, 2).length);
});
