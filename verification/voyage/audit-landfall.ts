import assert from "node:assert/strict";
import {
  coldLimit,
  crewMember,
  moves,
  play,
  previewRoutes,
  rulesVersion,
  start,
  type Voyage,
} from "@seventh-tide/rules";
import { botMove, playWithBots, seatMoves } from "@seventh-tide/rules/crew";
import { maxMoves, profiles, sail, type Profile } from "./sail.ts";

function exploreLandfall(entry: Voyage, { players, absent, helm }: Profile) {
  const finalTideMoves = entry.crew.length + 2;
  let rescues = 0;
  let losses = 0;
  let rescue: string[] | undefined;
  const history: string[] = [];

  function explore(state: Voyage) {
    assert.equal(state.tide, 7);
    if (state.phase === "event") {
      assert.equal(history.length, finalTideMoves - 1);
      const routes = previewRoutes(state);
      assert.deepEqual(
        routes.map(({ id }) => id),
        seatMoves(state, helm, players, [], helm).map(({ id }) => id),
      );
      assert.ok(routes.length > 0);
      const swimmer = state.swimmer;
      assert.ok(swimmer !== null);
      for (const { id, forecast } of routes) {
        const next = play(state, id);
        const cold = next.crew.map((sailor) => sailor.cold);
        const ending =
          next.hull > 0 && cold.every((value) => value < coldLimit)
            ? "won"
            : "lost";
        assert.equal(next.phase, ending);
        assert.deepEqual(moves(next), []);
        assert.deepEqual(forecast, {
          hull: next.hull,
          cold,
          ration:
            crewMember(next, swimmer).food - crewMember(state, swimmer).food,
          outcome: ending,
        });
        if (ending === "won") {
          rescues++;
          rescue ??= [...history, id];
        } else losses++;
      }
      return;
    }

    assert.ok(state.phase === "board" || state.phase === "cards");
    const actingSeats =
      state.phase === "board"
        ? [helm]
        : state.crew.flatMap((_, seat) =>
            seat < players && !state.acted.includes(seat) ? [seat] : [],
          );
    assert.ok(actingSeats.length > 0);
    for (const seat of actingSeats) {
      const choices =
        state.phase === "cards" && seat === absent
          ? [botMove(state, seat)]
          : seatMoves(state, seat, players, [], helm);
      assert.ok(choices.length > 0);
      for (const choice of choices) {
        assert.ok(choice);
        const next = playWithBots(state, choice.id, players);
        history.push(...next.history);
        // One swimmer, three crew plays, and one route resolve the last tide.
        assert.ok(history.length < finalTideMoves);
        explore(next.state);
        history.length -= next.history.length;
      }
    }
  }

  explore(entry);
  return { rescues, losses, rescue };
}

const [countArg = "16", firstArg = "0"] = process.argv.slice(2);
const seeds = Number(countArg);
const first = Number(firstArg);
assert.ok(
  Number.isSafeInteger(seeds) &&
    seeds > 0 &&
    Number.isSafeInteger(first) &&
    first >= 0 &&
    first + seeds <= 0x100000000,
  "Use a positive seed count and an optional nonnegative starting index in the 32-bit range.",
);

const crewReports = profiles.map((profile) => {
  let entries = 0;
  let entriesWithRescue = 0;
  let entriesWithOnlyRescues = 0;
  let rescuingSequences = 0;
  let losingSequences = 0;
  let missedRescues = 0;
  let missedExample:
    { seed: number; mixed: string[]; rescue: string[] } | undefined;
  for (let deal = first; deal < first + seeds; deal++) {
    const seed = Math.imul(deal, 2654435761) >>> 0;
    const initial = start(seed);
    for (const { id: opening } of initial.salvage) {
      let entry: Voyage | undefined;
      const baseline = sail(seed, profile, "mixed", {
        opening,
        decisions: {
          phases: ["board"],
          observe(state) {
            if (state.tide === 7) entry = state;
          },
        },
      });
      if (!entry) continue;
      const endings = exploreLandfall(entry, profile);
      entries++;
      entriesWithRescue += Number(endings.rescues > 0);
      entriesWithOnlyRescues += Number(endings.losses === 0);
      rescuingSequences += endings.rescues;
      losingSequences += endings.losses;
      if (baseline.state.phase === "won") assert.ok(endings.rescue);
      if (baseline.state.phase === "lost" && endings.rescue) {
        missedRescues++;
        if (!missedExample) {
          const beforeLandfall = baseline.history.slice(
            0,
            -endings.rescue.length,
          );
          assert.deepEqual(beforeLandfall.reduce(play, initial), entry);
          const rescue = [...beforeLandfall, ...endings.rescue];
          assert.ok(rescue.length <= maxMoves);
          assert.equal(rescue.reduce(play, initial).phase, "won");
          missedExample = { seed, mixed: baseline.history, rescue };
        }
      }
    }
  }
  return {
    crew: profile.name,
    entries,
    entriesWithRescue,
    entriesWithOnlyRescues,
    missedRescues,
    rescuingSequences,
    losingSequences,
    missedExample,
  };
});

console.log(
  JSON.stringify({ version: rulesVersion, first, seeds, crewReports }, null, 2),
);
