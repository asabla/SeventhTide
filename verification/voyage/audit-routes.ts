import assert from "node:assert/strict";
import { parseArgs } from "node:util";
import {
  coldLimit,
  currentEvent,
  isRulesVersion,
  previewRoutes,
  rulesVersion,
  start,
  type Voyage,
} from "@seventh-tide/rules";
import { profiles, sail, type Policy, type Profile } from "./sail.ts";

const { positionals, values } = parseArgs({
  allowPositionals: true,
  options: { summary: { type: "boolean" } },
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

function ending(state: Voyage) {
  if (state.phase === "won") return "rescue";
  assert.equal(state.phase, "lost");
  if (state.hull > 0) return "cold";
  return state.crew.some(({ cold }) => cold >= coldLimit)
    ? "hullAndCold"
    : "hull";
}

function emptyRoute() {
  return {
    offered: 0,
    survivesTide: 0,
    endings: { rescue: 0, cold: 0, hull: 0, hullAndCold: 0 },
  };
}

interface RouteExample {
  seed: number;
  tide: number;
  first: string[];
  second: string[];
}

function emptyPair() {
  const examples: Partial<Record<"firstOnly" | "secondOnly", RouteExample>> =
    {};
  return { both: 0, neither: 0, firstOnly: 0, secondOnly: 0, examples };
}

interface EncounterAudit {
  positions: number;
  missedRescues: number;
  routes: Map<string, ReturnType<typeof emptyRoute>>;
  pairs: Map<string, ReturnType<typeof emptyPair>>;
}

function audit(profile: Profile, policy: Policy) {
  const encounters = new Map<string, EncounterAudit>();
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
        observeRoute(position, chosen, follow) {
          const [name] = currentEvent(position);
          let encounter = encounters.get(name);
          if (!encounter) {
            encounter = {
              positions: 0,
              missedRescues: 0,
              routes: new Map(),
              pairs: new Map(),
            };
            encounters.set(name, encounter);
          }
          encounter.positions++;
          const { routes, pairs } = encounter;
          const results = previewRoutes(position)
            .map((route) => {
              const finished = follow(route.id);
              if (route.id === chosen.id) chosenContinuations.push(finished);
              const outcome = ending(finished.state);
              let counts = routes.get(route.name);
              if (!counts) {
                counts = emptyRoute();
                routes.set(route.name, counts);
              }
              counts.offered++;
              counts.survivesTide += Number(route.forecast.outcome !== "lost");
              counts.endings[outcome]++;
              continuations++;
              return {
                id: route.id,
                name: route.name,
                rescued: outcome === "rescue",
                history: finished.history,
              };
            })
            .toSorted((a, b) => a.id.localeCompare(b.id));
          const selected = results.find(({ id }) => id === chosen.id);
          assert.ok(selected);
          if (!selected.rescued && results.some(({ rescued }) => rescued))
            encounter.missedRescues++;
          for (const [index, firstRoute] of results.entries()) {
            for (const secondRoute of results.slice(index + 1)) {
              const key = firstRoute.name + " / " + secondRoute.name;
              let counts = pairs.get(key);
              if (!counts) {
                counts = emptyPair();
                pairs.set(key, counts);
              }
              if (firstRoute.rescued === secondRoute.rescued) {
                counts[firstRoute.rescued ? "both" : "neither"]++;
              } else {
                const outcome = firstRoute.rescued ? "firstOnly" : "secondOnly";
                counts[outcome]++;
                counts.examples[outcome] ??= {
                  seed,
                  tide: position.tide,
                  first: firstRoute.history,
                  second: secondRoute.history,
                };
              }
            }
          }
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
    encounters: Object.fromEntries(
      Array.from(encounters, ([name, { routes, pairs, ...counts }]) => [
        name,
        {
          ...counts,
          routes: Object.fromEntries(routes),
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
