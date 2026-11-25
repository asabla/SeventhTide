import assert from "node:assert/strict";
import { parseArgs } from "node:util";
import { reefPursuit, rulesVersion } from "@seventh-tide/rules";
import { maxMoves, profiles, sail, voyageEnding } from "./sail.ts";

const { positionals, values } = parseArgs({
  allowPositionals: true,
  options: { "require-all-endings": { type: "boolean" } },
});
const [countArg = "512", startArg = "0"] = positionals;
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
  const endings = { rescue: 0, hull: 0, cold: 0, hullAndCold: 0 };
  const examples = new Map<
    ReturnType<typeof voyageEnding>,
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
      const ending = voyageEnding(state);
      endings[ending]++;
      if (!examples.has(ending))
        examples.set(ending, { seed, cautious, moves: history });
    }
  }
  return {
    mode: profile.name,
    won: endings.rescue,
    lost: endings.hull + endings.cold + endings.hullAndCold,
    hullLoss: endings.hull + endings.hullAndCold,
    coldLoss: endings.cold,
    ...counts,
    endings,
    examples: {
      won: examples.get("rescue"),
      hullLoss: examples.get("hull") ?? examples.get("hullAndCold"),
      coldLoss: examples.get("cold"),
      hullAndColdLoss: examples.get("hullAndCold"),
    },
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
if (values["require-all-endings"]) {
  const missing = profilesReport.flatMap(({ mode, endings }) =>
    Object.entries(endings).flatMap(([ending, occurrences]) =>
      occurrences ? [] : [`${mode}: ${ending}`],
    ),
  );
  assert.deepEqual(
    missing,
    [],
    "The sample must reach each ending in every crew setup.",
  );
}
