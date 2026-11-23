import {
  coldLimit,
  currentEvent,
  lockerFind,
  moves,
  play,
  reefPursuit,
  secondWake,
  swimmerCold,
  underRaft,
  type Move,
  type Voyage,
} from "./voyage.ts";
import { cardInfo, type CardId } from "./hands.ts";

export function seatMoves(
  state: Voyage,
  seat: number,
  players: number,
  volunteers: readonly number[] = [],
  helm = 0,
) {
  const available = moves(state);
  if (state.phase === "cards" || state.phase === "recover")
    return available.filter(({ actor }) => actor === seat);
  if (seat !== helm) return [];
  if (state.phase !== "board" || !volunteers.length) return available;
  return available.filter(({ id }) => {
    const sailor = Number(id.slice(5));
    return sailor >= players || volunteers.includes(sailor);
  });
}

export function channelScouts(state: Voyage) {
  if (state.tide !== 6 || state.channelMarked !== false) return [];
  return state.crew.flatMap((_, i) =>
    state.deck?.hands[i]?.includes("line") ? [i] : [],
  );
}

function humansPlayed(state: Voyage, players: number) {
  return state.crew.slice(0, players).every((_, i) => state.acted.includes(i));
}

export function assistSeats(
  state: Voyage,
  seat: number,
  players: number,
  helm = 0,
) {
  if (seat !== helm) return [];
  if (state.phase === "recover")
    return state.swimmer !== null && state.swimmer !== helm
      ? [state.swimmer]
      : [];
  if (state.phase !== "cards") return [];
  const ready = humansPlayed(state, players);
  return state.crew.flatMap((_, i) =>
    i !== helm && (i < players || ready) && !state.acted.includes(i) ? [i] : [],
  );
}

function equipmentValue(state: Voyage, card: CardId) {
  const { water, raft } = cardInfo(card);
  const value = (effect: typeof water) =>
    (effect.brace ?? 0) * 2 +
    (effect.hull ?? 0) * (state.hull < 4 ? 5 : 2) +
    (effect.food ?? 0) * 3 +
    (effect.swimmerFood ?? 0) * 3 -
    ((effect.cold ?? 0) +
      (effect.swimmerCold ?? 0) +
      2 * (effect.raftCold ?? 0) +
      (effect.targetCold ?? 0)) *
      3;
  const channel = card === "line" && !state.channelMarked ? 6 : 0;
  return (value(water) + value(raft)) / 2 + channel;
}

export function recoveryGain(state: Voyage, move: Move) {
  const find = lockerFind(state);
  if (
    state.phase !== "recover" ||
    !move.card ||
    !find ||
    state.swimmer === null
  )
    return 0;
  const hand = state.deck?.hands[state.swimmer] ?? [];
  const duplicate =
    Number(hand.includes(find.id)) -
    Number(hand.filter((card) => card === move.card).length > 1);
  return (
    equipmentValue(state, find.id) -
    equipmentValue(state, move.card) -
    3 * duplicate
  );
}

function conditionScore(
  state: Voyage,
  exposure: boolean,
  compareRescues = false,
) {
  if (state.phase === "won" && !compareRescues) return 1_000;
  if (state.phase === "lost") return -1_000;
  const swimmerExposure =
    swimmerCold - Number(secondWake(state) === "drawn-off");
  return (
    (state.phase === "won" ? 1_000 : 0) +
    state.hull * 7 +
    (state.hull === 0 ? -35 : 0) +
    (state.channelMarked ? 7 : 0) +
    state.crew.reduce((score, sailor, i) => {
      const cold = exposure
        ? Math.max(
            0,
            sailor.cold + (i === state.swimmer ? swimmerExposure : -1),
          )
        : sailor.cold;
      return (
        score +
        Math.min(3, sailor.food) * 4 -
        cold * cold -
        Math.max(0, cold - coldLimit + 1) * 14
      );
    }, 0)
  );
}

function routeScore(event: Voyage) {
  const compareRescues = reefPursuit(event) !== undefined;
  return Math.max(
    ...moves(event).map(({ id }) => {
      const next = play(event, id);
      return (
        conditionScore(next, false, compareRescues) +
        (next.phase === "recover"
          ? Math.max(...moves(next).map((move) => recoveryGain(next, move)))
          : 0)
      );
    }),
  );
}

export function botMove(state: Voyage, sailor: number): Move | undefined {
  if (state.phase === "recover")
    return seatMoves(state, sailor, state.crew.length).toSorted(
      (left, right) =>
        recoveryGain(state, right) - recoveryGain(state, left) ||
        Number(Boolean(left.card)) - Number(Boolean(right.card)),
    )[0];
  if (state.phase !== "cards") return undefined;
  const grip = underRaft(state);
  const checkLastPlay = grip || reefPursuit(state) === "following";
  const incoming = grip ? 0 : currentEvent(state)[3];
  let best: Move | undefined;
  let bestScore = -Infinity;
  for (const move of seatMoves(state, sailor, state.crew.length)) {
    const next = play(state, move.id);
    const score =
      next.phase === "event"
        ? routeScore(next)
        : checkLastPlay && next.acted.length === next.crew.length - 1
          ? Math.max(...moves(next).map(({ id }) => routeScore(play(next, id))))
          : conditionScore(next, true) + Math.min(incoming, next.guard) * 4;
    if (score > bestScore) {
      best = move;
      bestScore = score;
    }
  }
  return best;
}

export function finishBotTurns(state: Voyage, players: number) {
  const history: string[] = [];
  if (
    state.phase === "recover" &&
    state.swimmer !== null &&
    state.swimmer >= players
  ) {
    const move = botMove(state, state.swimmer);
    if (!move) throw new Error("The bot swimmer has no recovery move.");
    return { state: play(state, move.id), history: [move.id] };
  }
  if (state.phase === "cards" && humansPlayed(state, players)) {
    for (let sailor = players; sailor < state.crew.length; sailor++) {
      if (state.acted.includes(sailor)) continue;
      const move = botMove(state, sailor);
      if (!move)
        throw new Error(
          `Tide ${state.tide}: bot seat ${sailor + 1} has no legal move.`,
        );
      state = play(state, move.id);
      history.push(move.id);
    }
  }
  return { state, history };
}

export function playWithBots(state: Voyage, moveId: string, players: number) {
  const result = finishBotTurns(play(state, moveId), players);
  return { state: result.state, history: [moveId, ...result.history] };
}
