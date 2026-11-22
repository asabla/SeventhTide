import assert from "node:assert/strict";
import {
  assistSeats,
  botMove,
  channelScouts,
  playWithBots,
  seatMoves,
} from "@seventh-tide/rules/crew";
import {
  coldLimit,
  moves,
  play,
  rulesVersion,
  start,
  type Move,
  type Voyage,
} from "@seventh-tide/rules";
import { nextSeed } from "../../packages/rules/random.ts";

const profiles = [
  { name: "solo", players: 1, absent: undefined },
  { name: "two friends", players: 2, absent: undefined },
  { name: "three friends", players: 3, absent: undefined },
  { name: "friend away", players: 3, absent: 1 },
] as const;

type Profile = (typeof profiles)[number];
const maxMoves = 1 + 7 * 5;

function positionScore(s: Voyage) {
  if (s.phase === "won") return 1_000;
  if (s.phase === "lost") return -1_000;
  return (
    s.hull * 7 +
    s.crew.reduce(
      (sum, sailor) => sum + Math.min(3, sailor.food) * 4 - sailor.cold ** 2,
      0,
    )
  );
}

function bestChoice(state: Voyage, choices: Move[]) {
  if (state.phase === "cards") return botMove(state, choices[0]?.actor ?? -1);
  if (state.phase === "board") {
    const scouts = channelScouts(state);
    const score = ({ id }: Move) => {
      const i = Number(id.slice(5));
      return (state.crew[i]?.cold ?? coldLimit) - (scouts.includes(i) ? 2 : 0);
    };
    return choices.toSorted((left, right) => score(left) - score(right))[0];
  }
  const ranked = choices.map((choice) => ({
    choice,
    score: positionScore(play(state, choice.id)),
  }));
  return ranked.toSorted((left, right) => right.score - left.score)[0]?.choice;
}

function sail(
  seed: number,
  { players, absent, name }: Profile,
  cautious: boolean,
) {
  const startState = start(seed);
  let state = startState;
  let random = seed ^ 0x53261be3;
  const draw = (length: number) =>
    Math.floor(((random = nextSeed(random)) / 0x100000000) * length);
  const history: string[] = [];
  let assisted = 0;
  while (state.phase !== "won" && state.phase !== "lost") {
    const checkpoint = () =>
      JSON.stringify({
        seed,
        name,
        cautious,
        history,
        tide: state.tide,
        phase: state.phase,
      });
    assert.ok(history.length < maxMoves, checkpoint());
    let seat = 0;
    let volunteers: number[] = [];
    if (state.phase === "cards") {
      const waiting = state.crew.flatMap((_, i) =>
        i < players && !state.acted.includes(i) ? [i] : [],
      );
      seat = waiting[draw(waiting.length)] ?? -1;
      assert.ok(seat >= 0, checkpoint());
    } else if (state.phase === "board" && players > 1) {
      volunteers = state.crew.flatMap((_, i) =>
        i < players && i !== absent && draw(2) ? [i] : [],
      );
    }
    const choices = seatMoves(state, seat, players, volunteers);
    assert.ok(choices.length, checkpoint());
    let move = cautious
      ? bestChoice(state, choices)
      : choices[draw(choices.length)];
    if (state.phase === "cards" && seat === absent) {
      assert.ok(assistSeats(state, 0, players).includes(seat), checkpoint());
      move = botMove(state, seat);
      assisted++;
    }
    assert.ok(move && choices.some(({ id }) => id === move.id), checkpoint());
    const next = playWithBots(state, move.id, players);
    if (state.phase === "cards") {
      assert.ok(next.state.acted.length > state.acted.length, checkpoint());
      assert.equal(
        new Set(next.state.acted).size,
        next.state.acted.length,
        checkpoint(),
      );
      for (const id of next.history.slice(1)) {
        const actor = next.state.plays.find(
          (candidate) => candidate.id === id,
        )?.actor;
        assert.ok(actor !== undefined && actor >= players, checkpoint());
      }
      if (next.state.phase === "cards")
        assert.ok(
          next.state.crew.some(
            (_, i) => i < players && !next.state.acted.includes(i),
          ),
          checkpoint(),
        );
    }
    history.push(...next.history);
    state = next.state;
  }
  assert.ok(history.length <= maxMoves);
  assert.equal(moves(state).length, 0);
  assert.deepEqual(history.reduce(play, startState), state);
  assert.equal(
    state.phase,
    state.hull > 0 && state.crew.every(({ cold }) => cold < coldLimit)
      ? "won"
      : "lost",
  );
  if (state.phase === "won") assert.equal(state.tide, 7);
  return { state, history, assisted };
}

const [countArg = "512", startArg = "0"] = process.argv.slice(2);
const count = Number(countArg);
const first = Number(startArg);
assert.ok(
  Number.isSafeInteger(count) &&
    count > 0 &&
    Number.isSafeInteger(first) &&
    first >= 0 &&
    first + count <= 0x100000000,
  "Use a positive seed count and an optional nonnegative starting index in the 32-bit range.",
);
const profilesReport = profiles.map((profile) => {
  const counts = {
    won: 0,
    lost: 0,
    hullLoss: 0,
    coldLoss: 0,
    marked: 0,
    assisted: 0,
    longest: 0,
  };
  const examples = new Map<
    string,
    { seed: number; cautious: boolean; moves: string[] }
  >();
  for (let n = first; n < first + count; n++) {
    const seed = Math.imul(n, 2654435761) >>> 0;
    for (const cautious of [true, false]) {
      const { state, history, assisted } = sail(seed, profile, cautious);
      if (state.phase === "won") counts.won++;
      else counts.lost++;
      counts.longest = Math.max(counts.longest, history.length);
      counts.assisted += assisted;
      counts.marked += Number(state.channelMarked);
      const outcome =
        state.phase === "won"
          ? "won"
          : state.hull === 0
            ? "hullLoss"
            : "coldLoss";
      if (outcome !== "won") counts[outcome]++;
      if (!examples.has(outcome))
        examples.set(outcome, { seed, cautious, moves: history });
    }
  }
  return {
    mode: profile.name,
    ...counts,
    examples: Object.fromEntries(examples),
  };
});
console.log(
  JSON.stringify(
    {
      rulesVersion,
      first,
      seeds: count,
      voyages: count * profiles.length * 2,
      maxMoves,
      profiles: profilesReport,
    },
    null,
    2,
  ),
);
