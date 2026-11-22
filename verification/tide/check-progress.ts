import assert from "node:assert/strict";
import {
  assistSeats,
  botMove,
  finishBotTurns,
  seatMoves,
} from "../../packages/rules/crew.ts";
import {
  moves,
  play,
  rulesVersion,
  start,
  type Move,
  type Voyage,
} from "../../packages/rules/voyage.ts";
import { record, tag, type BendCall } from "./reference.ts";

// Real histories reach the start of tide seven in every supported rules version.
const replays = [
  {
    versions: [1],
    seed: 0,
    history: [
      "spar",
      "swim-0 float-0 lash-1 haul-2 dive",
      "swim-0 feed-0-0 haul-1 lash-2 dive",
      "swim-0 feed-0-0 haul-1 lash-2 dive",
      "swim-0 feed-0-0 haul-1 lash-2 hull",
      "swim-0 feed-0-0 lash-1 lash-2 dive",
      "swim-0 feed-0-0 haul-1 haul-2 dive",
    ],
  },
  {
    versions: [2, 3],
    seed: 0,
    history: [
      "spar",
      "swim-0 float-0 line-1 hook-2 hull",
      "swim-0 feed-0-0 hook-1 patch-2 hull",
      "swim-0 feed-0-0 hook-1 patch-2 hull",
      "swim-0 feed-0-0 line-1 hook-2 hull",
      "swim-0 feed-0-0 patch-1 hook-2 hull",
      "swim-0 feed-0-0 hook-1 line-2 dive",
    ],
  },
  {
    versions: [4],
    seed: 0,
    history: [
      "spar",
      "swim-0 belt-0 line-1 wrap-2-1 dive",
      "swim-0 feed-0-0 patch-1 hook-2 hull",
      "swim-0 feed-0-0 anchor-1 line-2 hull",
      "swim-0 feed-0-0 patch-1 hook-2 hull",
      "swim-0 feed-0-0 line-1 net-2 dive",
      "swim-0 feed-0-0 line-1 lash-2 dive",
    ],
  },
  {
    versions: [5, 6],
    seed: 1,
    history: [
      "spar",
      "swim-0 float-0 bell-1 patch-2 hull",
      "swim-0 feed-0-0 line-1 patch-2 dive",
      "swim-0 feed-0-0 hatch-1 comb-2 hull",
      "swim-0 feed-0-0 hook-1 feed-2-0 hull",
      "swim-0 feed-0-0 patch-1 glass-2 hull",
      "swim-0 feed-0-0 mitts-1 lash-2 hull",
    ],
  },
  {
    versions: [7, 8],
    seed: 1,
    history: [
      "spar",
      "swim-0 float-0 bell-1 patch-2 hull",
      "swim-0 feed-0-0 line-1 patch-2 hull",
      "swim-0 feed-0-0 hatch-1 comb-2 hull",
      "swim-0 feed-0-0 hook-1 feed-2-1 hull",
      "swim-0 feed-0-0 patch-1 glass-2 hull",
      "swim-0 feed-0-0 mitts-1 lash-2 hull",
    ],
  },
];

const seats = [0, 1, 2];
const playOrders = [
  [0, 1, 2],
  [0, 2, 1],
  [1, 0, 2],
  [1, 2, 0],
  [2, 0, 1],
  [2, 1, 0],
];
const laterTides = (state: Voyage) => 7 - state.tide;

function stageOf(state: Voyage) {
  switch (state.phase) {
    case "salvage":
      return tag("Salvage");
    case "board":
      return tag("Boarding");
    case "cards": {
      const stages = ["ThreePlays", "TwoPlays", "OnePlay"] as const;
      const stage = stages[state.acted.length];
      assert.ok(stage);
      assert.equal(new Set(state.acted).size, state.acted.length);
      assert.ok(state.swimmer !== null);
      return tag(stage);
    }
    case "event":
      assert.deepEqual(
        state.acted.toSorted((a, b) => a - b),
        seats,
      );
      assert.ok(state.swimmer !== null);
      return tag("Resolution");
    default:
      throw new Error("The voyage already ended.");
  }
}

function ids(choices: Move[]) {
  return choices.map(({ id }) => id);
}

function checkBoardingSeats(state: Voyage, players: number, context: string) {
  const humans = seats.slice(0, players);
  const bots = seats.slice(players);
  for (let mask = 0; mask < 2 ** players; mask++) {
    const volunteers = humans.filter((seat) => (mask & (1 << seat)) !== 0);
    const candidates = volunteers.length ? [...volunteers, ...bots] : seats;
    assert.deepEqual(
      ids(seatMoves(state, 0, players, volunteers)),
      candidates.map((sailor) => "swim-" + sailor),
      context,
    );
    for (const guest of humans.slice(1)) {
      assert.deepEqual(
        seatMoves(state, guest, players, volunteers),
        [],
        context,
      );
    }
  }
}

function checkFallback(
  call: BendCall,
  state: Voyage,
  legal: Move[],
  context: string,
) {
  const fallback = call("fallback", stageOf(state));
  const waiting = seats.filter((sailor) => !state.acted.includes(sailor));
  switch (state.phase) {
    case "salvage":
      assert.deepEqual(fallback, tag("TakeSalvage"), context);
      assert.ok(
        legal.some(({ id }) => state.salvage.some((item) => item.id === id)),
        context,
      );
      break;
    case "board":
      assert.deepEqual(fallback, tag("TakeLine"), context);
      break;
    case "cards":
      assert.deepEqual(fallback, tag("CrewAction"), context);
      for (const sailor of waiting) {
        const basic = sailor === state.swimmer ? "float-" : "lash-";
        assert.ok(
          legal.some(
            ({ id, actor }) => actor === sailor && id === basic + sailor,
          ),
          context,
        );
      }
      break;
    case "event":
      assert.deepEqual(fallback, tag("TakeHull"), context);
      assert.ok(
        legal.some(({ id }) => id === "hull"),
        context,
      );
      break;
  }
  for (const players of [1, 2, 3]) {
    if (state.phase === "board") {
      checkBoardingSeats(state, players, context);
    } else if (state.phase === "cards") {
      checkCrewSeats(call, state, legal, waiting, players, context);
    } else {
      assert.deepEqual(seatMoves(state, 0, players), legal, context);
      for (const guest of seats.slice(1, players)) {
        assert.deepEqual(seatMoves(state, guest, players), [], context);
      }
    }
  }
}

function checkCrewSeats(
  call: BendCall,
  state: Voyage,
  legal: Move[],
  waiting: number[],
  players: number,
  context: string,
) {
  const ready = waiting.every((sailor) => sailor >= players);
  const cover: number[] = [];
  const automatic: number[] = [];
  let humanCanPlay = false;
  for (const sailor of seats) {
    const role =
      sailor === 0 ? "HostSeat" : sailor < players ? "GuestSeat" : "BotSeat";
    const access = call(
      "crew_access",
      waiting.includes(sailor),
      tag(role),
      ready,
    );
    record(access);
    const choices = seatMoves(state, sailor, players);
    assert.deepEqual(
      choices,
      legal.filter(({ actor }) => actor === sailor),
      context,
    );
    if (role !== "BotSeat") {
      assert.equal(choices.length > 0, access.direct, context);
      humanCanPlay ||= choices.length > 0;
    }
    if (sailor > 0)
      assert.deepEqual(assistSeats(state, sailor, players), [], context);
    if (access.cover === true) cover.push(sailor);
    if (access.automatic === true) automatic.push(sailor);
  }
  assert.deepEqual(assistSeats(state, 0, players), cover, context);
  for (const sailor of cover) {
    const choice = botMove(state, sailor);
    assert.ok(choice && choice.actor === sailor, context);
    assert.ok(
      legal.some(({ id }) => id === choice.id),
      context,
    );
  }

  const botTurns = finishBotTurns(state, players);
  assert.ok(humanCanPlay || botTurns.history.length > 0, context);
  assert.equal(botTurns.history.length, automatic.length, context);
  let checked = state;
  for (const [i, id] of botTurns.history.entries()) {
    const move = moves(checked).find((choice) => choice.id === id);
    assert.ok(move && move.actor === automatic[i], context);
    checked = checkEdge(call, checked, move, context + " / bot " + id);
  }
  assert.deepEqual(botTurns.state, checked, context);
}

function checkEdge(
  call: BendCall,
  before: Voyage,
  move: Move,
  context: string,
) {
  const after = play(before, move.id);
  const stage = stageOf(before);
  const later = laterTides(before);
  const verdict =
    after.phase === "lost"
      ? tag("VoyageLost")
      : after.phase === "won"
        ? tag("VoyageRescued")
        : tag("VoyageAdrift");
  const next = call("advance", stage, later, verdict);
  const budget = call("remaining", stage, later);
  assert.ok(typeof budget === "number", context);
  assert.ok(budget >= 1 && budget <= 36, context);
  assert.equal(call("budget_after", next), budget - 1, context);
  if (after.phase === "won" || after.phase === "lost") {
    assert.equal(before.phase, "event", context);
    assert.equal(after.tide, before.tide, context);
    assert.deepEqual(next, { $: "Stop", unused: budget - 1 }, context);
    assert.deepEqual(moves(after), [], context);
  } else {
    assert.deepEqual(
      next,
      { $: "Continue", stage: stageOf(after), later: laterTides(after) },
      context,
    );
  }
  if (before.phase === "cards") {
    assert.ok(
      move.actor !== undefined && !before.acted.includes(move.actor),
      context,
    );
    assert.deepEqual(after.acted, [...before.acted, move.actor], context);
    assert.equal(after.swimmer, before.swimmer, context);
  }
  if (before.phase === "board") {
    assert.equal(after.swimmer, Number(move.id.slice(5)), context);
    assert.deepEqual(after.acted, [], context);
  }
  return after;
}

export function checkProgress(call: BendCall) {
  assert.deepEqual(
    replays.flatMap(({ versions }) => versions),
    Array.from({ length: rulesVersion }, (_, index) => index + 1),
  );

  let edges = 0;
  function checkState(state: Voyage, version: number) {
    const context = `rules ${version}, tide ${state.tide}, ${state.phase}, swimmer ${state.swimmer}, acted [${state.acted.join(",")}]`;
    const legal = moves(state);
    assert.ok(legal.length > 0, context);
    checkFallback(call, state, legal, context);
    for (const move of legal) {
      checkEdge(call, state, move, context + " / " + move.id);
      edges++;
    }
  }

  for (const { versions, seed, history } of replays) {
    for (const version of versions) {
      const startState = start(seed, version);
      checkState(startState, version);
      let checkpoint = startState;
      for (const [index, line] of history.entries()) {
        checkpoint = line.split(" ").reduce(play, checkpoint);
        assert.equal(checkpoint.phase, "board");
        assert.equal(checkpoint.tide, index + 1);
        checkState(checkpoint, version);
        for (const swimmer of seats) {
          for (const order of playOrders) {
            let state = play(checkpoint, "swim-" + swimmer);
            for (const sailor of order) {
              checkState(state, version);
              const choice = botMove(state, sailor);
              assert.ok(choice && choice.actor === sailor);
              state = play(state, choice.id);
            }
            checkState(state, version);
          }
        }
      }
      assert.equal(checkpoint.tide, 7);
    }
  }
  console.log(
    `${edges} legal moves agree with Bend on progress across all rules versions, tides, swimmers, and crew turn orders.`,
  );
}
