import {
  coldLimit,
  currentEvent,
  moves,
  play,
  swimmerCold,
  type Move,
  type Voyage,
} from "./voyage.ts";

export function seatMoves(
  state: Voyage,
  seat: number,
  players: number,
  volunteers: readonly number[] = [],
) {
  const available = moves(state);
  if (state.phase === "cards")
    return available.filter(({ actor }) => actor === seat);
  if (seat !== 0) return [];
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

export function assistSeats(state: Voyage, seat: number, players: number) {
  if (state.phase !== "cards" || seat !== 0) return [];
  const ready = humansPlayed(state, players);
  return state.crew.flatMap((_, i) =>
    i > 0 && (i < players || ready) && !state.acted.includes(i) ? [i] : [],
  );
}

function conditionScore(state: Voyage, exposure: boolean) {
  if (state.phase === "won") return 1_000;
  if (state.phase === "lost") return -1_000;
  return (
    state.hull * 7 +
    (state.hull === 0 ? -35 : 0) +
    (state.channelMarked ? 7 : 0) +
    state.crew.reduce((score, sailor, i) => {
      const cold = exposure
        ? Math.max(0, sailor.cold + (i === state.swimmer ? swimmerCold : -1))
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

export function botMove(state: Voyage, sailor: number): Move | undefined {
  if (state.phase !== "cards") return undefined;
  const incoming = currentEvent(state)[3];
  let best: Move | undefined;
  let bestScore = -Infinity;
  for (const move of seatMoves(state, sailor, state.crew.length)) {
    const next = play(state, move.id);
    const score =
      next.phase === "event"
        ? Math.max(
            ...moves(next).map(({ id }) =>
              conditionScore(play(next, id), false),
            ),
          )
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
