import assert from "node:assert/strict";
import { parseArgs } from "node:util";
import {
  coldLimit,
  currentEvent,
  isRulesVersion,
  rulesVersion,
  start,
  type Move,
  type Voyage,
} from "@seventh-tide/rules";
import { profiles, sail, type Policy, type Profile } from "./sail.ts";

const { positionals, values } = parseArgs({
  allowPositionals: true,
  options: {
    summary: { type: "boolean" },
    "all-decisions": { type: "boolean" },
  },
});
const [countArg = "128", firstArg = "0", versionArg = String(rulesVersion)] =
  positionals;
const seeds = Number(countArg);
const first = Number(firstArg);
const version = Number(versionArg);
assert.ok(
  Number.isSafeInteger(seeds) &&
    seeds > 0 &&
    Number.isSafeInteger(first) &&
    first >= 0 &&
    first + seeds <= 0x100000000,
  "Use a positive seed count and a starting index in the 32-bit range.",
);
assert.ok(isRulesVersion(version), "Use a supported rules version.");

const phases: Voyage["phase"][] = values["all-decisions"]
  ? ["salvage", "board", "cards", "event", "recover"]
  : ["event"];

function ending(state: Voyage) {
  if (state.phase === "won") return "rescue";
  assert.equal(state.phase, "lost");
  if (state.hull > 0) return "cold";
  return state.crew.some(({ cold }) => cold >= coldLimit)
    ? "hullAndCold"
    : "hull";
}

function emptyChoice() {
  return {
    offered: 0,
    survivesTide: 0,
    endings: { rescue: 0, cold: 0, hull: 0, hullAndCold: 0 },
  };
}

interface DecisionExample {
  seed: number;
  tide: number;
  first: string[];
  second: string[];
}

function emptyPair() {
  const examples: Partial<Record<"firstOnly" | "secondOnly", DecisionExample>> =
    {};
  return { both: 0, neither: 0, firstOnly: 0, secondOnly: 0, examples };
}

interface DecisionAudit {
  positions: number;
  missedRescues: number;
  choices: Map<string, ReturnType<typeof emptyChoice>>;
  pairs: Map<string, ReturnType<typeof emptyPair>>;
}

function decisionName(position: Voyage, chosen: Move) {
  const [encounter] = currentEvent(position);
  switch (position.phase) {
    case "salvage":
      return "Salvage";
    case "board":
      return `Choose swimmer · ${encounter}`;
    case "cards":
      return `${chosen.actor === position.swimmer ? "Swimmer" : "Raft"} play · ${encounter}`;
    case "recover":
      return `Stow equipment · ${encounter}`;
    default:
      return encounter;
  }
}

function audit(profile: Profile, policy: Policy) {
  const decisions = new Map<string, DecisionAudit>();
  let baselineVoyages = 0;
  let continuations = 0;
  for (let deal = first; deal < first + seeds; deal++) {
    const seed = Math.imul(deal, 2654435761) >>> 0;
    for (const { id: opening } of start(seed, version).salvage) {
      baselineVoyages++;
      const chosenContinuations: ReturnType<typeof sail>[] = [];
      const voyage = sail(seed, profile, policy, {
        version,
        opening,
        decisions: {
          phases,
          observe(position, chosen, choices, follow) {
            const name = decisionName(position, chosen);
            let group = decisions.get(name);
            if (!group) {
              group = {
                positions: 0,
                missedRescues: 0,
                choices: new Map(),
                pairs: new Map(),
              };
              decisions.set(name, group);
            }
            group.positions++;
            const results = choices
              .map((choice) => {
                const finished = follow(choice.id);
                if (choice.id === chosen.id) chosenContinuations.push(finished);
                const outcome = ending(finished.state);
                let counts = group.choices.get(choice.name);
                if (!counts) {
                  counts = emptyChoice();
                  group.choices.set(choice.name, counts);
                }
                counts.offered++;
                counts.survivesTide += Number(
                  finished.state.phase === "won" ||
                    finished.state.tide > position.tide,
                );
                counts.endings[outcome]++;
                continuations++;
                return {
                  id: choice.id,
                  name: choice.name,
                  rescued: outcome === "rescue",
                  history: finished.history,
                };
              })
              .toSorted((a, b) => a.id.localeCompare(b.id));
            const selected = results.find(({ id }) => id === chosen.id);
            assert.ok(selected);
            if (!selected.rescued && results.some(({ rescued }) => rescued))
              group.missedRescues++;
            for (const [index, firstChoice] of results.entries()) {
              for (const secondChoice of results.slice(index + 1)) {
                const key = firstChoice.name + " / " + secondChoice.name;
                let counts = group.pairs.get(key);
                if (!counts) {
                  counts = emptyPair();
                  group.pairs.set(key, counts);
                }
                if (firstChoice.rescued === secondChoice.rescued) {
                  counts[firstChoice.rescued ? "both" : "neither"]++;
                } else {
                  const outcome = firstChoice.rescued
                    ? "firstOnly"
                    : "secondOnly";
                  counts[outcome]++;
                  counts.examples[outcome] ??= {
                    seed,
                    tide: position.tide,
                    first: firstChoice.history,
                    second: secondChoice.history,
                  };
                }
              }
            }
          },
        },
      });
      // Following the policy's own choice must reproduce its entire voyage.
      for (const continued of chosenContinuations)
        assert.deepEqual(continued, voyage);
    }
  }
  return {
    crew: profile.name,
    policy,
    baselineVoyages,
    continuations,
    [values["all-decisions"] ? "decisions" : "encounters"]: Object.fromEntries(
      Array.from(decisions, ([name, { choices, pairs, ...counts }]) => [
        name,
        {
          ...counts,
          [values["all-decisions"] ? "choices" : "routes"]:
            Object.fromEntries(choices),
          pairs: Object.fromEntries(pairs),
        },
      ]),
    ),
  };
}

const policies = ["cautious", "mixed", "random"] as const;
const crewReports = profiles.flatMap((profile) =>
  policies.map((policy) => audit(profile, policy)),
);
const summary = {
  version,
  ...(values["all-decisions"] ? { phases } : {}),
  first,
  seeds,
  baselineVoyages: crewReports.reduce(
    (total, report) => total + report.baselineVoyages,
    0,
  ),
  continuations: crewReports.reduce(
    (total, report) => total + report.continuations,
    0,
  ),
};
console.log(
  JSON.stringify(
    values.summary ? summary : { ...summary, crewReports },
    null,
    2,
  ),
);
