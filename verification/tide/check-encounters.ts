import assert from "node:assert/strict";
import {
  crewMember,
  moves,
  play,
  rulesVersion,
  start,
  type TideResult,
  type Voyage,
} from "../../packages/rules/voyage.ts";
import { record, tag, type BendCall } from "./reference.ts";

const routeTags = {
  hull: "Hull",
  dive: "Dive",
  decoy: "Decoy",
  chain: "Chain",
  channel: "Channel",
} as const;
type Route = TideResult["route"]["kind"];
const routeIds: Route[] = ["hull", "dive", "decoy", "chain", "channel"];

const outcomes = {
  lost: "VoyageLost",
  won: "VoyageRescued",
  board: "VoyageAdrift",
} as const;

function replay(seed: number, version: number, history: string) {
  const state = history.split(" ").reduce(play, start(seed, version));
  assert.equal(state.phase, "event", history);
  return state;
}

function waterAt(state: Voyage) {
  switch (state.events[state.tide - 1]?.[0]) {
    case "The second wake":
      return "SecondWake";
    case "The bell buoy":
      return "BellBuoy";
    case "The answering light":
      return "Landing";
    default:
      return "OpenWater";
  }
}

function checkRoutes(call: BendCall, state: Voyage, context: string) {
  assert.notEqual(state.swimmer, null, context);
  const bellPlays = state.plays.filter(({ card }) => card === "bell");
  const swimmerBells = bellPlays.filter(({ actor }) => actor === state.swimmer);
  const ring =
    bellPlays.length > swimmerBells.length
      ? "RaftBell"
      : swimmerBells.length
        ? "SwimmerBell"
        : "Silent";
  const routes = call(
    "routes",
    tag(waterAt(state)),
    state.rulesVersion ?? 1,
    tag(ring),
    state.tide === 7 && state.channelMarked === true,
  );
  const expected = routeIds.filter(
    (id) => call("allowed", tag(routeTags[id]), routes) === true,
  );
  assert.deepEqual(
    moves(state)
      .map(({ id }) => id)
      .toSorted(),
    expected.toSorted(),
    context,
  );
  return expected;
}

function checkResolution(
  call: BendCall,
  state: Voyage,
  id: Route,
  context: string,
) {
  const swimmer = state.swimmer;
  const water = state.events[state.tide - 1];
  assert.ok(swimmer !== null && water, context);
  const raft = state.crew.flatMap((_, i) => (i === swimmer ? [] : [i]));
  const [first, second] = raft;
  assert.ok(first !== undefined && second !== undefined, context);
  const [, , , incoming, diveCold] = water;
  const effect = call(
    "effects",
    tag(routeTags[id]),
    state.guard,
    incoming,
    diveCold,
  );
  record(effect);
  const resolution = call(
    "resolve",
    effect,
    state.hull,
    crewMember(state, swimmer).cold,
    crewMember(state, first).cold,
    crewMember(state, second).cold,
    state.tide === 7,
  );

  const after = play(state, id);
  const result = after.tideResult;
  assert.ok(result && result.route.kind === id, context);
  assert.ok(
    after.phase === "lost" || after.phase === "won" || after.phase === "board",
    context,
  );
  assert.deepEqual(
    resolution,
    {
      $: "Resolution",
      hull: after.hull,
      swim_cold: crewMember(after, swimmer).cold,
      first_cold: crewMember(after, first).cold,
      second_cold: crewMember(after, second).cold,
      rations: result.ration,
      outcome: tag(outcomes[after.phase]),
    },
    context,
  );
  assert.equal(result.swimmer, swimmer, context);
  assert.equal(result.tide, state.tide, context);
  assert.equal(result.exposure[swimmer], effect.exposure, context);
  const extra =
    result.route.kind === "chain" || result.route.kind === "dive"
      ? result.route.cold
      : 0;
  assert.equal(extra, effect.extra_cold, context);
  if (result.route.kind === "hull") {
    assert.equal(result.route.incoming, incoming, context);
    assert.equal(
      result.route.blocked,
      Math.min(incoming, state.guard),
      context,
    );
    assert.equal(result.route.lost, state.hull - after.hull, context);
  }
  for (const sailor of raft) {
    assert.equal(
      result.exposure[sailor],
      crewMember(after, sailor).cold - crewMember(state, sailor).cold,
      context,
    );
  }
  assert.deepEqual(
    after.crew.map(({ food }, i) => food - crewMember(state, i).food),
    state.crew.map((_, i) => (i === swimmer ? result.ration : 0)),
    context,
  );
  assert.equal(
    after.tide,
    after.phase === "board" ? state.tide + 1 : state.tide,
    context,
  );
  assert.equal(
    after.swimmer,
    after.phase === "board" ? null : swimmer,
    context,
  );
}

export function checkEncounters(call: BendCall) {
  const quietWake = replay(
    456,
    rulesVersion,
    "locker swim-1 lash-0 float-1 lash-2",
  );
  const fixtures = [
    { name: "wake / silence", state: quietWake, water: "SecondWake" },
    {
      name: "wake / raft bell",
      state: replay(456, rulesVersion, "locker swim-1 bell-0 float-1 lash-2"),
      water: "SecondWake",
    },
    {
      name: "wake / underwater bell",
      state: replay(456, rulesVersion, "locker swim-0 bell-0 lash-1 lash-2"),
      water: "SecondWake",
    },
    {
      name: "wake / legacy raft bell",
      state: replay(456, 5, "locker swim-1 bell-0 float-1 lash-2"),
      water: "SecondWake",
    },
    {
      name: "buoy / bare raft",
      state: replay(256, rulesVersion, "locker swim-1 lash-0 float-1 lash-2"),
      water: "BellBuoy",
    },
    {
      name: "buoy / brace",
      state: replay(256, rulesVersion, "locker swim-1 mitts-0 float-1 lash-2"),
      water: "BellBuoy",
    },
    {
      name: "buoy / legacy brace",
      state: replay(256, 6, "locker swim-1 mitts-0 float-1 lash-2"),
      water: "BellBuoy",
    },
  ];
  // Exercise each other event and both landing cases at the resource boundaries.
  for (let tide = 1; tide <= quietWake.events.length; tide++) {
    const state = { ...quietWake, tide };
    const water = waterAt(state);
    if (water === "OpenWater")
      fixtures.push({ name: "open water / tide " + tide, state, water });
    if (water === "Landing") {
      for (const channelMarked of [false, true])
        fixtures.push({
          name: "landing / " + (channelMarked ? "marked" : "unmarked"),
          state: { ...state, channelMarked },
          water,
        });
    }
  }

  let checked = 0;
  for (const { name, state, water } of fixtures) {
    assert.equal(waterAt(state), water, name);
    for (const id of checkRoutes(call, state, name)) {
      checkResolution(call, state, id, name + " / " + id);
      checked++;
    }
    for (const hull of [0, 1, 2, 5]) {
      for (const guard of [0, 1, 2, 4]) {
        const boundary = structuredClone(state);
        Object.assign(boundary, { hull, guard });
        for (let sailor = 0; sailor < boundary.crew.length; sailor++) {
          for (const cold of [0, 1, 2, 3, 4, 5, 6]) {
            const member = crewMember(boundary, sailor);
            const previous = member.cold;
            member.cold = cold;
            const context = `${name}, hull ${hull}, brace ${guard}, seat ${sailor} at ${cold} cold`;
            for (const id of checkRoutes(call, boundary, context)) {
              checkResolution(call, boundary, id, context + " / " + id);
              checked++;
            }
            member.cold = previous;
          }
        }
      }
    }
  }
  console.log(
    `${checked} tide resolutions across ${fixtures.length} cases agree with Bend on route availability, resources, and the next phase.`,
  );
}
