import assert from "node:assert/strict";
import {
  currentEvent,
  moves,
  play,
  start,
  type Voyage,
} from "../../packages/rules/voyage.ts";

// Only the sailor holding the first line is asked to reserve their last copy.
// Both crews rotate swimmers, volunteer a line holder on six, and prefer to
// take damage on the hull when the raft can survive it.
function sail(
  seed: number,
  salvage: string,
  reserve: boolean,
  basicOnly = false,
) {
  let state = play(start(seed), salvage);
  const history = [salvage];
  let keeper = -1;
  let sawLine = false;
  while (state.phase !== "won" && state.phase !== "lost") {
    assert.ok(history.length < 36, JSON.stringify({ seed, history }));
    const hands = state.deck?.hands;
    assert.ok(hands);
    const firstLine = hands.findIndex((hand) => hand.includes("line"));
    if (keeper < 0) keeper = firstLine;
    sawLine ||= firstLine >= 0;
    const id = decide(state, reserve ? keeper : -1, basicOnly);
    history.push(id);
    state = play(state, id);
  }
  assert.deepEqual(history.reduce(play, start(seed)), state);
  return {
    won: state.phase === "won",
    sawLine,
    marked: state.channelMarked,
    history,
  };
}

function decide(s: Voyage, keeper: number, basicOnly: boolean) {
  const rotating = (s.tide - 1) % 3;
  if (s.phase === "board") {
    const scouts = s.crew
      .map((p, i) => ({ i, cold: p.cold }))
      .filter((p) => s.deck?.hands[p.i]?.includes("line"))
      .toSorted((a, b) => a.cold - b.cold);
    return "swim-" + (s.tide === 6 ? (scouts[0]?.i ?? rotating) : rotating);
  }
  if (s.phase === "event") {
    if (s.tide === 7 && s.channelMarked) return "channel";
    const hullDamage = Math.max(0, currentEvent(s)[3] - s.guard);
    if (s.hull > hullDamage) return "hull";
    const alternative = moves(s).find(({ id }) => id !== "hull");
    assert.ok(alternative);
    return alternative.id;
  }
  assert.ok(s.phase === "cards" && s.swimmer !== null);
  const options = moves(s).filter((m) => {
    if (basicOnly && m.card) return false;
    if (m.card !== "line" || m.actor !== keeper || s.tide >= 6) return true;
    return s.deck?.hands[keeper]?.filter((c) => c === "line").length === 2;
  });
  if (!s.acted.length) {
    const line = options.find(
      (m) => m.card === "line" && m.actor === s.swimmer,
    );
    return line?.id ?? "float-" + s.swimmer;
  }
  if (s.acted.length === 1) {
    const helper =
      options.find(
        (m) => m.id.startsWith("feed-") && m.id.endsWith("-" + s.swimmer),
      ) ?? options.find((m) => m.card === "line");
    if (helper) return helper.id;
  }
  const repair = options.find((m) => m.id.startsWith("lash-"));
  assert.ok(repair);
  return repair.id;
}

const counts = {
  both: 0,
  reserveOnly: 0,
  spendOnly: 0,
  neither: 0,
  noLineDeals: 0,
  noLineLandings: 0,
};
const examples = new Map<
  string,
  { seed: number; salvage: string; moves: string[] }
>();
for (let n = 0; n < 512; n++) {
  const seed = Math.imul(n, 2654435761) >>> 0;
  for (const { id } of moves(start(seed))) {
    const reserved = sail(seed, id, true);
    const spent = sail(seed, id, false);
    const outcome = reserved.won
      ? spent.won
        ? "both"
        : "reserveOnly"
      : spent.won
        ? "spendOnly"
        : "neither";
    counts[outcome]++;
    if (
      ((outcome === "reserveOnly" && reserved.marked) ||
        outcome === "spendOnly") &&
      !examples.has(outcome)
    )
      examples.set(outcome, {
        seed,
        salvage: id,
        moves: (reserved.won ? reserved : spent).history,
      });
    const basic = sail(seed, id, false, true);
    if (!basic.sawLine) {
      counts.noLineDeals++;
      if (basic.won) {
        counts.noLineLandings++;
        if (!examples.has("noLine"))
          examples.set("noLine", { seed, salvage: id, moves: basic.history });
      }
    }
  }
}
console.log(
  JSON.stringify({ counts, examples: Object.fromEntries(examples) }, null, 2),
);
