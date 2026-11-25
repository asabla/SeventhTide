import assert from "node:assert/strict";
import {
  assistSeats,
  botMove,
  channelScouts,
  playWithBots,
  recoveryGain,
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

export const profiles = [
  { name: "solo", players: 1, absent: undefined, helm: 0 },
  { name: "two friends", players: 2, absent: undefined, helm: 0 },
  { name: "three friends", players: 3, absent: undefined, helm: 0 },
  { name: "friend away", players: 3, absent: 1, helm: 0 },
  { name: "host away", players: 3, absent: 0, helm: 1 },
] as const;

export type Profile = (typeof profiles)[number];
export const maxMoves = 1 + 7 * 5 + 1;

export function voyageEnding(state: Voyage) {
  if (state.phase === "won") return "rescue";
  assert.equal(state.phase, "lost");
  if (state.hull > 0) return "cold";
  return state.crew.some(({ cold }) => cold >= coldLimit)
    ? "hullAndCold"
    : "hull";
}

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
  if (state.phase === "cards" || state.phase === "recover")
    return botMove(state, choices[0]?.actor ?? -1);
  if (state.phase === "board") {
    const scouts = channelScouts(state);
    const score = ({ id }: Move) => {
      const i = Number(id.slice(5));
      return (state.crew[i]?.cold ?? coldLimit) - (scouts.includes(i) ? 2 : 0);
    };
    return choices.toSorted((left, right) => score(left) - score(right))[0];
  }
  const ranked = choices.map((choice) => {
    const next = play(state, choice.id);
    const gain = Math.max(
      0,
      ...moves(next).map((move) => recoveryGain(next, move)),
    );
    return { choice, score: positionScore(next) + gain };
  });
  return ranked.toSorted((left, right) => right.score - left.score)[0]?.choice;
}

export type Policy = "cautious" | "mixed" | "random";

interface SailingPosition {
  state: Voyage;
  history: string[];
  random: number;
  assisted: number;
}

interface FinishedVoyage {
  state: Voyage;
  history: string[];
  assisted: number;
}

interface RunOptions {
  version?: number;
  opening?: string;
  decisions?: {
    phases: readonly Voyage["phase"][];
    observe: (
      position: Voyage,
      choice: Move,
      choices: readonly Move[],
      follow: (id: string) => FinishedVoyage,
    ) => void;
  };
}

export function sail(
  seed: number,
  profile: Profile,
  policy: Policy,
  options: RunOptions = {},
) {
  const initial = start(seed, options.version ?? rulesVersion);
  return sailFrom(
    seed,
    initial,
    profile,
    policy,
    {
      state: initial,
      random: seed ^ 0x53261be3,
      history: [],
      assisted: 0,
    },
    options,
  );
}

function sailFrom(
  seed: number,
  startState: Voyage,
  profile: Profile,
  policy: Policy,
  position: SailingPosition,
  { opening, decisions }: RunOptions = {},
): FinishedVoyage {
  const { players, absent, name, helm } = profile;
  let { state, random, assisted } = position;
  const { history } = position;
  const draw = (length: number) =>
    Math.floor(((random = nextSeed(random)) / 0x100000000) * length);
  while (state.phase !== "won" && state.phase !== "lost") {
    const checkpoint = () =>
      JSON.stringify({
        seed,
        name,
        policy,
        history,
        tide: state.tide,
        phase: state.phase,
      });
    assert.ok(history.length < maxMoves, checkpoint());
    let seat: number = helm;
    let volunteers: number[] = [];
    if (state.phase === "cards") {
      const waiting = state.crew.flatMap((_, i) =>
        i < players && !state.acted.includes(i) ? [i] : [],
      );
      seat = waiting[draw(waiting.length)] ?? -1;
      assert.ok(seat >= 0, checkpoint());
    } else if (state.phase === "recover") {
      seat = state.swimmer ?? -1;
      assert.ok(seat >= 0 && seat < players, checkpoint());
    } else if (state.phase === "board" && players > 1) {
      volunteers = state.crew.flatMap((_, i) =>
        i < players && i !== absent && draw(2) ? [i] : [],
      );
    }
    const choices = seatMoves(state, seat, players, volunteers, helm);
    assert.ok(choices.length, checkpoint());
    let move: Move | undefined;
    if (state.phase === "salvage" && opening)
      move = choices.find(({ id }) => id === opening);
    else if (
      policy === "random" ||
      (policy === "mixed" && state.phase === "cards" && draw(2) === 0)
    )
      move = choices[draw(choices.length)];
    else move = bestChoice(state, choices);
    const delegated =
      (state.phase === "cards" || state.phase === "recover") && seat === absent;
    if (delegated) {
      assert.ok(
        assistSeats(state, helm, players, helm).includes(seat),
        checkpoint(),
      );
      move = botMove(state, seat);
      assisted++;
    }
    assert.ok(move && choices.some(({ id }) => id === move.id), checkpoint());
    const advance = (id: string) => {
      const next = playWithBots(state, id, players);
      if (state.phase === "cards") {
        assert.ok(next.state.acted.length > state.acted.length, checkpoint());
        assert.equal(
          new Set(next.state.acted).size,
          next.state.acted.length,
          checkpoint(),
        );
        for (const botId of next.history.slice(1)) {
          const actor = next.state.plays.find(
            (candidate) => candidate.id === botId,
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
      return next;
    };
    if (!delegated && decisions?.phases.includes(state.phase)) {
      const decision = { state, random, history: history.slice(), assisted };
      decisions.observe(decision.state, move, choices, (id) => {
        assert.ok(choices.some((choice) => choice.id === id));
        const next = advance(id);
        return sailFrom(seed, startState, profile, policy, {
          ...decision,
          state: next.state,
          history: [...decision.history, ...next.history],
        });
      });
    }
    const next = advance(move.id);
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
