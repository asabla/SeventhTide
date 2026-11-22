import assert from "node:assert/strict";
import {
  coldLimit,
  currentEvent,
  isRulesVersion,
  previewRoutes,
  rulesVersion,
  start,
} from "@seventh-tide/rules";
import { profiles, sail, type Policy, type Profile } from "./sail.ts";

interface OpeningResult {
  survived: number;
  hullLoss: number;
  coldLoss: number;
  combinedLoss: number;
  reachedReef: number;
}

interface PairResult {
  deals: number;
  onlyFirstRescued: number;
  onlySecondRescued: number;
  first: OpeningResult;
  second: OpeningResult;
}

interface RouteResult {
  offered: number;
  survives: number;
  soleSurvivor: number;
  chosen: number;
}

const [countArg = "512", firstArg = "0", versionArg = String(rulesVersion)] =
  process.argv.slice(2);
const count = Number(countArg);
const first = Number(firstArg);
const version = Number(versionArg);
assert.ok(
  Number.isSafeInteger(count) &&
    count > 0 &&
    Number.isSafeInteger(first) &&
    first >= 0 &&
    first + count <= 0x100000000,
  "Use a positive seed count and a starting index in the 32-bit range.",
);
assert.ok(isRulesVersion(version), "Use a supported rules version.");

function openingResult(): OpeningResult {
  return {
    survived: 0,
    hullLoss: 0,
    coldLoss: 0,
    combinedLoss: 0,
    reachedReef: 0,
  };
}

function compareOpenings(profile: Profile, policy: Policy) {
  const pairs = new Map<string, PairResult>();
  const encounters = new Map<string, Map<string, RouteResult>>();
  let doomedAtDecision = 0;
  let choseFatalRoute = 0;

  for (let index = first; index < first + count; index++) {
    const seed = Math.imul(index, 2654435761) >>> 0;
    const [firstOpening, secondOpening] = start(seed, version)
      .salvage.map(({ id }) => id)
      .toSorted();
    assert.ok(firstOpening && secondOpening && firstOpening !== secondOpening);
    const pairName = firstOpening + "/" + secondOpening;
    let pair = pairs.get(pairName);
    if (!pair) {
      pair = {
        deals: 0,
        onlyFirstRescued: 0,
        onlySecondRescued: 0,
        first: openingResult(),
        second: openingResult(),
      };
      pairs.set(pairName, pair);
    }
    pair.deals++;

    const run = (opening: string, results: OpeningResult) => {
      const { state } = sail(seed, profile, policy, {
        version,
        opening,
        observeRoute(position, choice) {
          const forecasts = previewRoutes(position);
          const survivors = forecasts.filter(
            ({ forecast }) => forecast.outcome !== "lost",
          );
          const chosen = forecasts.find(({ id }) => id === choice.id);
          assert.ok(chosen);
          if (!survivors.length) doomedAtDecision++;
          else if (chosen.forecast.outcome === "lost") choseFatalRoute++;

          const [encounter] = currentEvent(position);
          let routes = encounters.get(encounter);
          if (!routes) {
            routes = new Map();
            encounters.set(encounter, routes);
          }
          for (const { name, forecast, id } of forecasts) {
            let counts = routes.get(name);
            if (!counts) {
              counts = { offered: 0, survives: 0, soleSurvivor: 0, chosen: 0 };
              routes.set(name, counts);
            }
            const survives = forecast.outcome !== "lost";
            counts.offered++;
            counts.survives += Number(survives);
            counts.soleSurvivor += Number(survives && survivors.length === 1);
            counts.chosen += Number(id === choice.id);
          }
        },
      });

      results.reachedReef += Number(state.tide === 7);
      if (state.phase === "won") results.survived++;
      else if (state.hull === 0) {
        if (state.crew.some(({ cold }) => cold >= coldLimit))
          results.combinedLoss++;
        else results.hullLoss++;
      } else results.coldLoss++;
      return state.phase === "won";
    };

    const firstRescued = run(firstOpening, pair.first);
    const secondRescued = run(secondOpening, pair.second);
    pair.onlyFirstRescued += Number(firstRescued && !secondRescued);
    pair.onlySecondRescued += Number(!firstRescued && secondRescued);
  }

  return {
    crew: profile.name,
    policy,
    doomedAtDecision,
    choseFatalRoute,
    pairs: Object.fromEntries(pairs),
    encounters: Object.fromEntries(
      Array.from(encounters, ([name, routes]) => [
        name,
        Object.fromEntries(routes),
      ]),
    ),
  };
}

const policies = ["cautious", "mixed", "random"] as const;
console.log(
  JSON.stringify(
    {
      version,
      first,
      seeds: count,
      voyages: count * 2 * profiles.length * policies.length,
      comparisons: profiles.flatMap((profile) =>
        policies.map((policy) => compareOpenings(profile, policy)),
      ),
    },
    null,
    2,
  ),
);
