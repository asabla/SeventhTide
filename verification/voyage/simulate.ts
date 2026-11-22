import assert from "node:assert/strict";
import { reefPursuit, rulesVersion } from "@seventh-tide/rules";
import { maxMoves, profiles, sail } from "./sail.ts";

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
    wakeDecoys: 0,
    buoyChains: 0,
    raftPries: 0,
    pursuedLandfalls: 0,
    reefLures: 0,
    echoCrossings: 0,
    lockerHauls: 0,
    lockerSwaps: 0,
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
      const { state, history, assisted } = sail(
        seed,
        profile,
        cautious ? "cautious" : "random",
      );
      if (state.phase === "won") counts.won++;
      else counts.lost++;
      counts.longest = Math.max(counts.longest, history.length);
      counts.assisted += assisted;
      counts.marked += Number(state.channelMarked);
      if (history.includes("decoy")) counts.wakeDecoys++;
      if (history.includes("chain")) counts.buoyChains++;
      if (history.includes("pry")) counts.raftPries++;
      if (reefPursuit(state)) counts.pursuedLandfalls++;
      if (reefPursuit(state) === "drawn-off") counts.reefLures++;
      if (history.includes("echo-crossing")) counts.echoCrossings++;
      if (history.includes("haul-locker")) counts.lockerHauls++;
      if (history.some((id) => id.startsWith("stow-"))) counts.lockerSwaps++;
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
