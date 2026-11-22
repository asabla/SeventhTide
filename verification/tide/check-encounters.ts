import assert from "node:assert/strict";
import {
  marked,
  pried,
  unmarked,
} from "../../tests/fixtures/landfall-pursuit.ts";
import {
  crewMember,
  moves,
  play,
  previewRoutes,
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
  pry: "Pry",
  "haul-locker": "HaulLocker",
  "echo-crossing": "EchoCrossing",
} as const;
type Route = keyof typeof routeTags;
const routeIds: Route[] = [
  "hull",
  "dive",
  "decoy",
  "chain",
  "channel",
  "pry",
  "haul-locker",
  "echo-crossing",
];

const outcomes = {
  lost: "VoyageLost",
  won: "VoyageRescued",
  board: "VoyageAdrift",
  recover: "VoyageAdrift",
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
    case "Something under the raft":
      return "RaftGrip";
    case "The drifting locker":
      return "DriftingLocker";
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
  const routes =
    waterAt(state) === "Landing" && state.channelMarked !== undefined
      ? call(
          "reef_routes",
          state.rulesVersion ?? 1,
          tag(ring),
          state.channelMarked,
          state.creatureFollowing === true,
        )
      : call(
          "routes",
          tag(waterAt(state)),
          state.rulesVersion ?? 1,
          tag(ring),
          state.tide === 7 && state.channelMarked === true,
          state.plays.some(
            ({ card, actor }) =>
              card === "line" &&
              call(
                "sets_tool",
                tag("SoundingLine"),
                actor === state.swimmer,
              ) === true,
          ),
          state.plays.some(
            ({ card, actor }) =>
              card === "hook" &&
              call("sets_tool", tag("Boathook"), actor === state.swimmer) ===
                true,
          ),
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
  const grip = waterAt(state) === "RaftGrip";
  const locker = waterAt(state) === "DriftingLocker";
  const kind: TideResult["route"]["kind"] =
    id === "hull" ? (locker ? "leave-locker" : grip ? "cut" : "hull") : id;
  if (state.channelMarked !== undefined && state.tide === 7)
    assert.deepEqual([incoming, diveCold], [4, 2], context);
  const modelRoute = tag(
    kind === "leave-locker"
      ? "LeaveLocker"
      : kind === "cut"
        ? "Cut"
        : routeTags[id],
  );
  const effect = call("effects", modelRoute, state.guard, incoming, diveCold);
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
  assert.ok(result && result.route.kind === kind, context);
  assert.ok(
    after.phase === "lost" ||
      after.phase === "won" ||
      after.phase === "board" ||
      after.phase === "recover",
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
  record(resolution);
  const forecast = previewRoutes(state).find(
    (route) => route.id === id,
  )?.forecast;
  assert.ok(forecast, context);
  assert.equal(forecast.hull, resolution.hull, context);
  assert.equal(forecast.cold[swimmer], resolution.swim_cold, context);
  assert.equal(forecast.cold[first], resolution.first_cold, context);
  assert.equal(forecast.cold[second], resolution.second_cold, context);
  assert.equal(forecast.ration, resolution.rations, context);
  assert.deepEqual(
    tag(outcomes[forecast.outcome]),
    resolution.outcome,
    context,
  );
  assert.equal(forecast.outcome, after.phase, context);
  if (state.channelMarked !== undefined && state.tide === 7) {
    const previous = crewMember(state, swimmer);
    const echo = kind === "echo-crossing";
    const cold = crewMember(after, swimmer).cold;
    const hull =
      echo || state.hull !== after.hull
        ? `Hull ${state.hull} → ${after.hull}${echo && after.hull === 0 ? " (raft breaks)" : ""}.`
        : state.hull
          ? "Hull holds."
          : "Hull at 0.";
    assert.equal(
      moves(state).find((move) => move.id === id)?.detail,
      `${hull}\n${previous.name} ${previous.cold} → ${cold}/5 cold${echo && cold >= 5 ? " (fatal)" : ""}.`,
      context,
    );
  }
  if (grip) {
    assert.equal(
      Boolean(after.creatureFollowing),
      call("follows", state.rulesVersion ?? 1, modelRoute),
      context,
    );
    const previous = crewMember(state, swimmer);
    const cold = crewMember(after, swimmer).cold;
    const fatal = cold >= 5 ? " (fatal)" : "";
    const hull =
      kind === "cut"
        ? `Hull ${state.hull} → ${after.hull}${after.hull === 0 ? " (raft breaks)" : ""}.`
        : "No hull damage.";
    assert.equal(
      moves(state).find((move) => move.id === id)?.detail,
      `${hull}\n${previous.name} ${previous.cold} → ${cold}/5 cold${fatal}.`,
      context,
    );
  }
  if (locker) {
    const previous = crewMember(state, swimmer);
    const cold = crewMember(after, swimmer).cold;
    const fatal = cold >= 5 ? " (fatal)" : "";
    assert.equal(
      moves(state)
        .find((move) => move.id === id)
        ?.detail.split("\n")[0],
      `${previous.name} ${previous.cold} → ${cold}/5 cold${fatal}.`,
      context,
    );
    assert.equal(
      after.phase === "recover",
      kind === "haul-locker" && after.phase !== "lost",
      context,
    );
  }
  assert.equal(result.swimmer, swimmer, context);
  assert.equal(result.tide, state.tide, context);
  assert.equal(result.exposure[swimmer], effect.exposure, context);
  const extra =
    result.route.kind === "chain" ||
    result.route.kind === "dive" ||
    result.route.kind === "haul-locker"
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
  }
  if (
    result.route.kind === "hull" ||
    result.route.kind === "cut" ||
    result.route.kind === "echo-crossing"
  )
    assert.equal(result.route.lost, state.hull - after.hull, context);
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
  checkChannelMarking(call);
  const quietWake = replay(
    456,
    rulesVersion,
    "locker swim-1 lash-0 float-1 lash-2",
  );
  const fixtures = [
    { name: "wake / silence", state: quietWake, water: "SecondWake" },
    {
      name: "drifting locker",
      state: replay(
        0,
        9,
        "spar swim-0 float-0 line-1 lash-2 hull swim-0 feed-0-0 lash-1 line-2 hull swim-1 feed-0-1 anchor-1 patch-2",
      ),
      water: "DriftingLocker",
    },
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
  for (const [name, history] of [
    ["line first", "swim-0 line-0 hook-1 lash-2"],
    ["hook first", "swim-0 hook-1 line-0 lash-2"],
    ["no line", "swim-0 float-0 hook-1 lash-2"],
    ["no hook", "swim-0 line-0 lash-1 lash-2"],
    ["wrong roles", "swim-1 line-0 hook-1 lash-2"],
    ["no tools", "swim-0 float-0 lash-1 lash-2"],
  ])
    fixtures.push({
      name: "raft grip / " + name,
      state: replay(96, rulesVersion, "spar " + history),
      water: "RaftGrip",
    });
  fixtures.push({
    name: "split seam / archived",
    state: replay(96, 7, "spar swim-0 line-0 hook-1 lash-2"),
    water: "OpenWater",
  });
  for (const { seed, history, plays } of [unmarked, marked]) {
    for (const version of [9, 10]) {
      const state = history.reduce(play, start(seed, version));
      const beforeBell = plays.slice(0, 2).reduce(play, state);
      const bell = play(beforeBell, "bell-1");
      assert.equal(
        bell.guard - beforeBell.guard,
        call("reef_bell_brace", version === 10),
      );
      fixtures.push({
        name: `landing / ${state.channelMarked ? "marked" : "unmarked"} / raft bell / version ${version}`,
        state: plays.reduce(play, state),
        water: "Landing",
      });
    }
  }
  const approach = unmarked.history.reduce(play, start(unmarked.seed));
  fixtures.push(
    {
      name: "landing / creature with underwater bell",
      state: ["swim-1", "hook-0", "bell-1", "lash-2"].reduce(play, approach),
      water: "Landing",
    },
    {
      name: "landing / creature with no bell",
      state: ["swim-0", "feed-0-2", "lash-1", "lash-2"].reduce(play, approach),
      water: "Landing",
    },
    {
      name: "landing / grip pried loose",
      state: ["swim-0", "feed-0-0", "feed-1-0", "lash-2"].reduce(
        play,
        pried.history.reduce(play, start(pried.seed)),
      ),
      water: "Landing",
    },
  );
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

function checkChannelMarking(call: BendCall) {
  const history = [
    "spar",
    "swim-0 glass-0 comb-1 line-2 dive",
    "swim-0 feed-0-0 feed-1-0 anchor-2 hull",
    "swim-0 feed-0-0 patch-1 belt-2 hull",
    "swim-0 block-0 feed-1-0 net-2 dive",
    "swim-0 feed-0-0 patch-1 feed-2-0 hull",
  ];
  const approach = history.join(" ").split(" ").reduce(play, start(20));
  assert.equal(approach.phase, "board");
  assert.equal(approach.tide, 6);
  assert.ok(approach.deck?.hands[1]?.includes("line"));
  let checked = 0;
  for (const tide of [5, 6, 7]) {
    for (const channelMarked of [false, true]) {
      for (const seat of [0, 1, 2]) {
        const state = play(
          { ...approach, tide, channelMarked },
          "swim-" + seat,
        );
        for (const move of moves(state)) {
          const context = `tide ${tide}, swimmer ${seat}, marked ${channelMarked}, ${move.id}`;
          const mark = call(
            "marks_channel",
            tide,
            move.card === "line",
            move.actor === seat,
            channelMarked,
          );
          const after = play(state, move.id);
          assert.equal(after.plays[0]?.markedChannel, mark, context);
          assert.equal(
            move.detail.includes("Mark the safe channel"),
            mark,
            context,
          );
          assert.equal(after.channelMarked, channelMarked || mark, context);
          checked++;
        }
      }
    }
  }
  console.log(
    `${checked} card plays agree with Bend on whether the channel is marked.`,
  );
}
