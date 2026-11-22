import { nextSeed, shuffle } from "./random.ts";
import {
  cardInfo,
  deal,
  equipmentPreview,
  replaceCard,
  salvageCard,
  type CardId,
  type Deck,
} from "./hands.ts";
export { handPreview, equipmentPreview } from "./hands.ts";

export function salvagePreview(id: string) {
  return cardInfo(salvageCard(id));
}
export const rulesVersion = 10;
export type RulesVersion = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10;
export function isRulesVersion(value: unknown): value is RulesVersion {
  return (
    typeof value === "number" &&
    Number.isInteger(value) &&
    value >= 1 &&
    value <= rulesVersion
  );
}

export type Phase =
  "salvage" | "board" | "cards" | "event" | "recover" | "won" | "lost";

export interface Move {
  id: string;
  name: string;
  detail: string;
  actor?: number;
  card?: CardId;
}

type TideEvent = [
  title: string,
  forecast: string,
  description: string,
  hullDamage: number,
  cold: number,
];

export interface ResourceChange {
  sailor: number | null;
  resource: "hull" | "brace" | "cold" | "ration";
  amount: number;
}

export interface CrewPlay {
  actor: number;
  id: string;
  name: string;
  card?: CardId;
  changes: ResourceChange[];
  markedChannel: boolean;
  luredCreature?: boolean;
}

export interface TideResult {
  tide: number;
  event: string;
  choice: string;
  swimmer: number;
  route:
    | { kind: "hull"; incoming: number; blocked: number; lost: number }
    | { kind: "cut"; lost: number }
    | { kind: "dive"; cold: number }
    | { kind: "decoy" }
    | { kind: "chain"; cold: number }
    | { kind: "pry" }
    | { kind: "haul-locker"; cold: number; find: string; stowed?: boolean }
    | { kind: "leave-locker" }
    | { kind: "echo-crossing"; lost: number }
    | { kind: "channel" };
  exposure: number[];
  ration: number;
}

export interface Voyage {
  rulesVersion?: number;
  channelMarked?: boolean;
  creatureFollowing?: boolean;
  lockerCard?: CardId;
  deck?: Deck;
  tide: number;
  phase: Phase;
  hull: number;
  swimmer: number | null;
  acted: number[];
  plays: CrewPlay[];
  tideResult: TideResult | null;
  guard: number;
  crew: { name: string; cold: number; food: number }[];
  salvage: Move[];
  events: TideEvent[];
  log: string[];
}

export const names = ["Mara", "Ivo", "Nell"];
export const jobs = ["Boatswain", "Shipwright", "Lookout"];
export const maxHull = 5;
export const coldLimit = 5;
export const swimmerRation = 1;
export const swimmerCold = 2;
const shelteredCold = swimmerCold - 1;
const echoCrossingDamage = 1;
const secondWakeTitle = "The second wake";
const bellBuoyTitle = "The bell buoy";
const splitSeamTitle = "The split seam";
const squallTitle = "The black squall";
const lockerFinds = [
  "line",
  "hook",
  "bell",
  "hatch",
  "mitts",
  "lantern",
] as const;
const cutterSighting =
  "The cutter’s lamp holds steady. A second light moves against the swell.";
export const wreckBellWakeEffect = "Draw the wake away.";
export const reefBellEffect = "Lure the creature off the crossing.";
export const gripLineEffect = "Set the line.";
export const gripHookEffect = "Set the hook.";

const salvage = [
  {
    id: "locker",
    name: "Ration locker",
    detail: "Each sailor keeps 1 ration. The heavy landing costs 1 hull.",
  },
  {
    id: "canvas",
    name: "Dry canvas",
    detail:
      "Everyone sheds 1 cold. Cut loose a timber to carry it: lose 1 hull.",
  },
  {
    id: "spar",
    name: "Spare timber",
    detail: "Gain 1 hull. Each sailor gains 1 cold while launching it.",
  },
];

const waters: TideEvent[] = [
  [
    splitSeamTitle,
    "Water beads along a seam.",
    "The lowest timber splits.",
    2,
    1,
  ],
  [
    squallTitle,
    "Rain flattens the water ahead.",
    "A squall drives spray over the bow.",
    1,
    2,
  ],
  [
    bellBuoyTitle,
    "A bell rings under the raft.",
    "Its chain catches a loose timber.",
    1,
    1,
  ],
  [
    "The towline",
    "A rope trails behind the wreck.",
    "The rope pulls tight around the raft.",
    2,
    2,
  ],
  [
    "The wreck field",
    "Splinters rise through the foam.",
    "A floating hatch blocks the channel.",
    3,
    1,
  ],
  [
    secondWakeTitle,
    "Another wake follows your own.",
    "Something pulls on the swimmer’s line.",
    2,
    1,
  ],
];

const raftGrip: TideEvent = [
  "Something under the raft",
  "A hand curls around the timbers. Rig both tools to pry it loose.",
  "Its grip tightens. The timbers begin to part.",
  1,
  2,
];

const driftingLocker: TideEvent = [
  "The drifting locker",
  "An ironbound locker rides low in the swell.",
  "The lid breaks open against the raft. The swimmer has one chance to take what’s inside.",
  0,
  1,
];

export function lockerFind(state: Voyage) {
  const card = state.lockerCard;
  if (
    card &&
    (state.phase === "event" || state.phase === "recover") &&
    state.events[state.tide - 1]?.[0] === driftingLocker[0]
  )
    return equipmentPreview(card);
  return undefined;
}

const finalTide: TideEvent = [
  "The answering light",
  "Two lanterns answer across the water.",
  "One light moves against the current. The swimmer can sound a safe path, or the crew can force a landing.",
  3,
  1,
];

const answeringLight: TideEvent = [
  "The answering light",
  "The next swell will carry the raft onto the reef.",
  "The pale light slips over the breakers. The cutter waits beyond them.",
  4,
  2,
];

function canMarkChannel(s: Voyage, card: CardId, sailor: number) {
  return (
    card === "line" &&
    sailor === s.swimmer &&
    s.tide === 6 &&
    s.channelMarked === false
  );
}

function rangBellFromRaft(s: Voyage) {
  return (
    s.swimmer !== null &&
    s.plays.some(({ card, actor }) => card === "bell" && actor !== s.swimmer)
  );
}

export function reefPursuit(s: Voyage): "drawn-off" | "following" | undefined {
  if ((s.rulesVersion ?? 1) < 10 || s.tide !== 7 || !s.creatureFollowing)
    return undefined;
  return rangBellFromRaft(s) ? "drawn-off" : "following";
}

function canLureReefCreature(
  s: Voyage,
  card: CardId | undefined,
  sailor: number,
) {
  return (
    card === "bell" && sailor !== s.swimmer && reefPursuit(s) === "following"
  );
}

function equipmentEffect(s: Voyage, card: CardId, sailor: number) {
  const { raft, water } = cardInfo(card);
  if (sailor === s.swimmer) return water;
  if (canLureReefCreature(s, card, sailor)) {
    return {
      ...raft,
      brace: 0,
      text: `Ring toward the rocks. ${reefBellEffect} Take ${raft.cold ?? 0} cold.`,
    };
  }
  return raft;
}

export function secondWake(s: Voyage): "drawn-off" | "following" | undefined {
  if (
    (s.rulesVersion ?? 1) < 6 ||
    s.events[s.tide - 1]?.[0] !== secondWakeTitle ||
    (s.phase !== "board" && s.phase !== "cards" && s.phase !== "event")
  )
    return undefined;
  return rangBellFromRaft(s) ? "drawn-off" : "following";
}

export function bellBuoy(s: Voyage): "chain" | "echo" | undefined {
  if (
    (s.rulesVersion ?? 1) < 7 ||
    s.events[s.tide - 1]?.[0] !== bellBuoyTitle ||
    (s.phase !== "board" && s.phase !== "cards" && s.phase !== "event")
  )
    return undefined;
  return s.phase !== "board" && s.guard > 0 ? "chain" : "echo";
}

export function underRaft(s: Voyage) {
  if (
    (s.rulesVersion ?? 1) < 8 ||
    s.events[s.tide - 1]?.[0] !== raftGrip[0] ||
    (s.phase !== "board" && s.phase !== "cards" && s.phase !== "event")
  )
    return undefined;
  const plays = s.phase === "board" ? [] : s.plays;
  return {
    line: plays.some(
      ({ card, actor }) => card === "line" && actor === s.swimmer,
    ),
    hook: plays.some(
      ({ card, actor }) => card === "hook" && actor !== s.swimmer,
    ),
  };
}

function chainCost(s: Voyage) {
  const braced = bellBuoy(s) === "chain";
  return { cold: braced ? 1 : 2, ration: swimmerRation + Number(braced) };
}

export function currentEvent(voyage: Voyage) {
  let event = voyage.events[voyage.tide - 1];
  if (!event) throw new RangeError("Unknown tide: " + voyage.tide);
  const wake = secondWake(voyage);
  if (wake)
    event = [
      event[0],
      wake === "drawn-off"
        ? "The wake turns toward the bell. The swimmer can come in closer."
        : "Another wake follows your own. Ring the Wreck bell from the raft to draw it away.",
      wake === "drawn-off"
        ? "The wake veers toward the bell’s echo. The line goes slack."
        : "The line jerks taut. A shadow passes under the swimmer.",
      event[3],
      event[4],
    ];
  const buoy = bellBuoy(voyage);
  if (buoy)
    event = [
      bellBuoyTitle,
      buoy === "chain"
        ? "The raft holds. Feel for the chain’s knocks before the bell."
        : "A bell rings under the raft. Brace to feel the chain through the timbers.",
      buoy === "chain"
        ? "The chain knocks before the bell. The buoy rolls against the swell."
        : "The bell calls first. The echo is drawing the swimmer deeper.",
      event[3],
      event[4],
    ];
  const grip = underRaft(voyage);
  if (grip) {
    event = [...raftGrip];
    if (voyage.phase === "board")
      event[1] = "The timbers creak beneath the swell.";
    if (grip.line && grip.hook)
      event[2] = "The line is taut. The hook is under its fingers.";
  }
  if (voyage.channelMarked !== undefined && voyage.tide === 6) {
    const line = "The swimmer can mark the channel with Sounding line.";
    const sighting = voyage.channelMarked
      ? "The swimmer has marked the channel to the rescue cutter."
      : cutterSighting + " " + line;
    const combined = voyage.channelMarked ? "Channel marked." : line;
    return [
      event[0],
      (voyage.phase !== "board" && (wake || buoy)) || grip
        ? event[1] + " " + combined
        : sighting,
      event[2],
      event[3],
      event[4],
    ] satisfies TideEvent;
  }
  if (voyage.channelMarked !== undefined && voyage.tide === 7) {
    const route = voyage.channelMarked
      ? "The marked channel leads to the cutter."
      : "The crew reaches the reef without a marked channel.";
    const pursuit = reefPursuit(voyage);
    if (pursuit) {
      return [
        event[0],
        pursuit === "drawn-off"
          ? "The bell lures the creature onto the rocks. " + route
          : "A webbed hand cuts across the cutter’s light. Ring the Wreck bell from the raft to draw it off." +
            (voyage.channelMarked ? " " + route : ""),
        pursuit === "drawn-off"
          ? "Its wake bends toward the bell. A gap opens across the reef."
          : "The creature crosses the cutter’s light. " + route,
        event[3],
        event[4],
      ] satisfies TideEvent;
    }
    return [
      event[0],
      route + " " + event[1],
      voyage.channelMarked
        ? "The pale light crosses the reef. The marked channel leads to the cutter."
        : event[2],
      event[3],
      event[4],
    ] satisfies TideEvent;
  }
  return event;
}

export function crewMember(voyage: Voyage, index: number) {
  const member = voyage.crew[index];
  if (!member) throw new RangeError("Unknown crew member: " + index);
  return member;
}

export function start(seed: number, version: number = rulesVersion): Voyage {
  if (!isRulesVersion(version))
    throw new Error("Unsupported voyage rules version.");
  let bits = seed >>> 0;
  const random = () => {
    bits = nextSeed(bits);
    return bits / 4294967296;
  };
  const offeredSalvage = shuffle(salvage, random).slice(0, 2);
  const events = shuffle(waters, random).map((event) =>
    version >= 8 && event[0] === splitSeamTitle ? raftGrip : event,
  );
  if (version >= 9) {
    const squall = events.findIndex(([title]) => title === squallTitle);
    const slot = 2 + ((seed >>> 0) % 3);
    if (squall !== slot) events[squall] = events[slot] ?? driftingLocker;
    events[slot] = driftingLocker;
  }
  return {
    ...(version >= 4 ? { rulesVersion: version } : {}),
    ...(version >= 3 ? { channelMarked: false } : {}),
    ...(version >= 9
      ? {
          lockerCard:
            lockerFinds[
              nextSeed((seed ^ 0x165667b1) >>> 0) % lockerFinds.length
            ],
        }
      : {}),
    ...(version >= 2
      ? {
          deck: {
            random: (seed ^ 0xa5a5a5a5) >>> 0,
            draw: [],
            discard: [],
            hands: [],
          },
        }
      : {}),
    tide: 1,
    phase: "salvage",
    hull: 4,
    swimmer: null,
    acted: [],
    plays: [],
    tideResult: null,
    guard: 0,
    crew: names.map((name) => ({ name, cold: 1, food: 0 })),
    salvage: offeredSalvage,
    events: [...events, version >= 3 ? answeringLight : finalTide],
    log: ["The ship is going down. Two seats remain on the raft."],
  };
}

function lockerRoutes(s: Voyage, swimmer: number): Move[] {
  const sailor = crewMember(s, swimmer);
  const extra = driftingLocker[4];
  const exposure = (cost: number) => {
    const cold = sailor.cold + swimmerCold + cost;
    return `${sailor.name} ${sailor.cold} → ${cold}/${coldLimit} cold${cold >= coldLimit ? " (fatal)" : ""}.`;
  };
  return [
    {
      id: "haul-locker",
      name: "Haul it aboard",
      detail:
        exposure(extra) +
        (sailor.cold + swimmerCold + extra < coldLimit
          ? "\nMay swap one card."
          : ""),
    },
    {
      id: "hull",
      name: "Cut it loose",
      detail: exposure(0) + "\nKeep both cards.",
    },
  ];
}

function recoveryMoves(s: Voyage, swimmer: number): Move[] {
  const find = lockerFind(s);
  if (!find) return [];
  return [
    ...Array.from(new Set(s.deck?.hands[swimmer])).flatMap((card) =>
      card === find.id
        ? []
        : [
            {
              id: "stow-" + card,
              name: "Swap " + cardInfo(card).name,
              detail: "Stow " + find.name + ".",
              actor: swimmer,
              card,
            },
          ],
    ),
    { id: "keep-hand", name: "Keep both cards", detail: "", actor: swimmer },
  ];
}

function landingMoves(s: Voyage, swimmer: number): Move[] {
  const sailor = crewMember(s, swimmer);
  const [, , , incoming, extraCold] = currentEvent(s);
  const lost = Math.min(s.hull, Math.max(0, incoming - s.guard));
  const hullHolds = s.hull > 0 ? "Hull holds.\n" : "Hull at 0.\n";
  const exposure = (extra = 0, warn = false) => {
    const cold = sailor.cold + swimmerCold + extra;
    return `${sailor.name} ${sailor.cold} → ${cold}/${coldLimit} cold${warn && cold >= coldLimit ? " (fatal)" : ""}.`;
  };
  return [
    ...(s.channelMarked
      ? [
          {
            id: "channel",
            name: "Follow the marked channel",
            detail: hullHolds + exposure(),
          },
        ]
      : []),
    ...(reefPursuit(s) === "drawn-off"
      ? [
          {
            id: "echo-crossing",
            name: "Cross on the echo",
            detail:
              `Hull ${s.hull} → ${Math.max(0, s.hull - echoCrossingDamage)}${s.hull <= echoCrossingDamage ? " (raft breaks)" : ""}.\n` +
              exposure(0, true),
          },
        ]
      : []),
    {
      id: "hull",
      name: "Force a landing",
      detail: lost
        ? `Hull ${s.hull} → ${s.hull - lost}.\n` + exposure()
        : hullHolds + exposure(),
    },
    {
      id: "dive",
      name: "Scout the reef",
      detail: hullHolds + exposure(extraCold),
    },
  ];
}

function gripMoves(
  s: Voyage,
  swimmer: number,
  { line, hook }: NonNullable<ReturnType<typeof underRaft>>,
): Move[] {
  const [, , , timber, extraCold] = raftGrip;
  const sailor = crewMember(s, swimmer);
  const exposure = (extra = 0) => {
    const cold = sailor.cold + swimmerCold + extra;
    return `${sailor.name} ${sailor.cold} → ${cold}/${coldLimit} cold${cold >= coldLimit ? " (fatal)" : ""}.`;
  };
  const holds = "No hull damage.\n";
  const hull = Math.max(0, s.hull - timber);
  const cut = `Hull ${s.hull} → ${hull}${hull === 0 ? " (raft breaks)" : ""}.\n`;
  return [
    ...(line && hook
      ? [{ id: "pry", name: "Pry it loose", detail: holds + exposure() }]
      : []),
    {
      id: "hull",
      name: "Cut a timber",
      detail: cut + exposure(),
    },
    {
      id: "dive",
      name: "Haul the swimmer through",
      detail: holds + exposure(extraCold),
    },
  ];
}

export function moves(s: Voyage): Move[] {
  if (s.phase === "salvage")
    return s.deck
      ? s.salvage.map((m) => ({
          ...m,
          detail:
            m.detail +
            " Add two copies of " +
            salvagePreview(m.id).name +
            " to the crew deck.",
        }))
      : s.salvage;
  if (s.phase === "board")
    return s.crew.map((p, i) => ({
      id: "swim-" + i,
      name: p.name,
      detail: "Take the line. Recover a ration when the tide ends.",
    }));
  if (s.phase === "recover" && s.swimmer !== null)
    return recoveryMoves(s, s.swimmer);
  const grip = underRaft(s);
  if (s.phase === "cards")
    return s.crew.flatMap((p, i) => {
      if (s.acted.includes(i)) return [];
      const options =
        i === s.swimmer
          ? [
              {
                id: "sound",
                name: "Sound the depths",
                detail: "Gain 1 brace against event damage. Take 1 cold.",
              },
              {
                id: "float",
                name: "Float on the line",
                detail:
                  "Shed 1 cold. The trailing line strains the raft for 1 hull.",
              },
            ]
          : [
              {
                id: "lash",
                name: "Lash the timbers",
                detail: s.deck
                  ? "Repair 1 hull by hand. Take 2 cold."
                  : "Repair 1 hull. Take 1 cold.",
              },
              {
                id: "haul",
                name: "Haul the line",
                detail: "The swimmer sheds 1 cold. Take 1 cold yourself.",
              },
            ];
      const basic = s.deck
        ? options.filter((o) => o.id === "float" || o.id === "lash")
        : options;
      const hand: Move[] = basic.map((o) => ({
        ...o,
        id: o.id + "-" + i,
        actor: i,
      }));
      for (const card of new Set(s.deck?.hands[i])) {
        const definition = cardInfo(card);
        const effect = equipmentEffect(s, card, i);
        if (p.food + (effect.food ?? 0) < 0) continue;
        const option = {
          card,
          actor: i,
          name: definition.name,
          detail:
            effect.text +
            (canMarkChannel(s, card, i)
              ? " Mark the safe channel for tide seven."
              : "") +
            (card === "bell" && i !== s.swimmer && secondWake(s) === "following"
              ? " " + wreckBellWakeEffect
              : "") +
            (grip && card === "line" && i === s.swimmer
              ? " " + gripLineEffect
              : grip && card === "hook" && i !== s.swimmer
                ? " " + gripHookEffect
                : ""),
          id: card + "-" + i,
        };
        if (effect.targetCold) {
          s.crew.forEach((target, j) =>
            hand.push({
              ...option,
              id: option.id + "-" + j,
              name: option.name + " · " + target.name,
            }),
          );
        } else hand.push(option);
      }
      if (p.food > 0)
        s.crew.forEach((target, j) => {
          hand.push({
            id: "feed-" + i + "-" + j,
            actor: i,
            name: "Share with " + target.name,
            detail:
              "Spend 1 of your rations. " + target.name + " sheds 2 cold.",
          });
        });
      return hand;
    });
  if (s.phase === "event" && s.swimmer !== null) {
    if (lockerFind(s)) return lockerRoutes(s, s.swimmer);
    if (s.tide === 7 && s.channelMarked !== undefined)
      return landingMoves(s, s.swimmer);
    if (grip) return gripMoves(s, s.swimmer, grip);
    const buoy = bellBuoy(s);
    if (buoy) {
      const { cold, ration } = chainCost(s);
      const swimmer = crewMember(s, s.swimmer).name;
      const hullLoss = Math.max(0, currentEvent(s)[3] - s.guard);
      const hullCost = hullLoss ? `Lose ${hullLoss} hull.` : "No hull damage.";
      return [
        {
          id: "hull",
          name: "Break away",
          detail: `${hullCost} ${swimmer} takes ${swimmerCold} cold and recovers ${swimmerRation} ration.`,
        },
        {
          id: "chain",
          name: "Follow the chain",
          detail: `${swimmer} takes ${swimmerCold + cold} cold and recovers ${ration} ${ration === 1 ? "ration" : "rations"}.`,
        },
      ];
    }
    const wake = secondWake(s);
    return [
      ...(wake === "drawn-off"
        ? [
            {
              id: "decoy",
              name: "Haul in on the echo",
              detail: `Lose 0 hull. ${crewMember(s, s.swimmer).name} takes only ${shelteredCold} cold from exposure.`,
            },
          ]
        : []),
      {
        id: "hull",
        name: wake
          ? "Hold the line"
          : s.tide === 7
            ? "Force a landing"
            : "Let the raft take it",
        detail:
          "Lose " +
          Math.max(0, currentEvent(s)[3] - s.guard) +
          " hull after bracing.",
      },
      {
        id: "dive",
        name: wake
          ? "Follow the pull"
          : s.tide === 7
            ? "Follow the swimmer"
            : "Send the swimmer",
        detail:
          crewMember(s, s.swimmer).name +
          " takes " +
          currentEvent(s)[4] +
          " extra cold.",
      },
    ];
  }
  return [];
}

function resourceChanges(before: Voyage, after: Voyage) {
  const changes: ResourceChange[] = [
    { sailor: null, resource: "hull", amount: after.hull - before.hull },
    { sailor: null, resource: "brace", amount: after.guard - before.guard },
  ];
  after.crew.forEach((sailor, i) => {
    const previous = crewMember(before, i);
    changes.push(
      { sailor: i, resource: "cold", amount: sailor.cold - previous.cold },
      { sailor: i, resource: "ration", amount: sailor.food - previous.food },
    );
  });
  return changes.filter(({ amount }) => amount !== 0);
}

function projectTide(state: Voyage, swimmer: number, move: Move) {
  const [event, , , incoming, extraCold] = currentEvent(state);
  let route: TideResult["route"];
  let ration = swimmerRation;
  let hull = state.hull;
  let swimmerColdCost = 0;
  const find = lockerFind(state);
  const grip = underRaft(state);
  if (find && move.id === "haul-locker") {
    swimmerColdCost = extraCold;
    route = { kind: "haul-locker", cold: extraCold, find: find.name };
  } else if (find) {
    route = { kind: "leave-locker" };
  } else if (move.id === "hull" && grip) {
    hull = Math.max(0, hull - incoming);
    route = { kind: "cut", lost: state.hull - hull };
  } else if (move.id === "hull") {
    const blocked = Math.min(incoming, state.guard);
    hull = Math.max(0, hull - (incoming - blocked));
    route = { kind: "hull", incoming, blocked, lost: state.hull - hull };
  } else if (move.id === "dive") {
    swimmerColdCost = extraCold;
    route = { kind: "dive", cold: extraCold };
  } else if (move.id === "decoy") {
    route = { kind: "decoy" };
  } else if (move.id === "pry") {
    route = { kind: "pry" };
  } else if (move.id === "echo-crossing") {
    hull = Math.max(0, hull - echoCrossingDamage);
    route = { kind: "echo-crossing", lost: state.hull - hull };
  } else if (move.id === "chain") {
    const cost = chainCost(state);
    swimmerColdCost = cost.cold;
    ration = cost.ration;
    route = { kind: "chain", cold: cost.cold };
  } else if (move.id === "channel") {
    route = { kind: "channel" };
  } else {
    throw new Error("Unknown tide route: " + move.id);
  }
  const exposureCost = route.kind === "decoy" ? shelteredCold : swimmerCold;
  const exposure: number[] = [];
  const crew = state.crew.map((sailor, i) => {
    const inWater = i === swimmer;
    const beforeExposure = sailor.cold + (inWater ? swimmerColdCost : 0);
    const cold = Math.max(0, beforeExposure + (inWater ? exposureCost : -1));
    exposure.push(cold - beforeExposure);
    return { ...sailor, cold, food: sailor.food + (inWater ? ration : 0) };
  });
  const lost = crew.filter((sailor) => sailor.cold >= coldLimit);
  const outcome: RouteForecast["outcome"] =
    !hull || lost.length
      ? "lost"
      : state.tide === 7
        ? "won"
        : route.kind === "haul-locker"
          ? "recover"
          : "board";
  const result: TideResult = {
    tide: state.tide,
    event,
    choice: move.name,
    swimmer,
    route,
    exposure,
    ration,
  };
  return { hull, crew, lost, outcome, result };
}

export interface RouteForecast {
  hull: number;
  cold: number[];
  ration: number;
  outcome: "lost" | "won" | "recover" | "board";
}

export type TideRoute = Pick<Move, "id" | "name" | "detail"> & {
  forecast: RouteForecast;
};

export function previewRoutes(state: Voyage): TideRoute[] {
  const swimmer = state.swimmer;
  if (state.phase !== "event" || swimmer === null) return [];
  return moves(state).map((move) => {
    const { hull, crew, outcome, result } = projectTide(state, swimmer, move);
    return {
      id: move.id,
      name: move.name,
      detail: move.detail,
      forecast: {
        hull,
        cold: crew.map((sailor) => sailor.cold),
        ration: result.ration,
        outcome,
      },
    };
  });
}

export function play(state: Voyage, moveId: string): Voyage {
  const move = moves(state).find((option) => option.id === moveId);
  if (!move) throw new Error("This move is unavailable.");
  const s = structuredClone(state);
  const [action, who, target] = move.id.split("-");
  const cold = (i: number, amount: number) => {
    const member = crewMember(s, i);
    member.cold = Math.max(0, member.cold + amount);
  };
  if (s.phase === "salvage") {
    s.hull += action === "spar" ? 1 : -1;
    s.crew.forEach((p, i) => {
      if (action === "locker") p.food++;
      if (action === "canvas") cold(i, -1);
      if (action === "spar") cold(i, 1);
    });
    s.log.push("Salvaged " + move.name.toLowerCase() + ".");
    if (s.deck) deal(s.deck, move.id, s.rulesVersion ?? 2);
    s.phase = "board";
  } else if (s.phase === "board") {
    s.swimmer = Number(who);
    s.acted = [];
    s.plays = [];
    s.guard = 0;
    s.log.push(
      "Tide " +
        s.tide +
        " — " +
        crewMember(s, s.swimmer).name +
        " took the line.",
    );
    s.phase = "cards";
  } else if (s.phase === "cards" && s.swimmer !== null) {
    const i = Number(who);
    if (s.deck && move.card) {
      const effect = equipmentEffect(s, move.card, i);
      s.hull = Math.max(0, Math.min(maxHull, s.hull + (effect.hull ?? 0)));
      s.guard += effect.brace ?? 0;
      cold(i, effect.cold ?? 0);
      if (effect.swimmerCold) cold(s.swimmer, effect.swimmerCold);
      if (effect.swimmerFood)
        crewMember(s, s.swimmer).food += effect.swimmerFood;
      const raftCold = effect.raftCold;
      if (raftCold) {
        s.crew.forEach((_, index) => {
          if (index !== s.swimmer) cold(index, raftCold);
        });
      }
      if (effect.targetCold) cold(Number(target), effect.targetCold);
      crewMember(s, i).food += effect.food ?? 0;
      replaceCard(s.deck, i, move.card);
      if (canMarkChannel(s, move.card, i)) {
        s.channelMarked = true;
        s.log.push(
          crewMember(s, i).name + " marked the safe channel to the cutter.",
        );
      }
    } else
      switch (action) {
        case "feed":
          crewMember(s, i).food--;
          cold(Number(target), -2);
          break;
        case "sound":
          s.guard++;
          cold(i, 1);
          break;
        case "float":
          cold(i, -1);
          s.hull = Math.max(0, s.hull - 1);
          break;
        case "lash":
          s.hull = Math.min(maxHull, s.hull + 1);
          cold(i, s.deck ? 2 : 1);
          break;
        case "haul":
          cold(s.swimmer, -1);
          cold(i, 1);
          break;
      }
    s.acted.push(i);
    const targetName =
      action === "haul" || (action === "line" && i !== s.swimmer)
        ? " for " + crewMember(s, s.swimmer).name
        : action === "lash" || action === "sound"
          ? " for the raft"
          : action === "float"
            ? " for themself"
            : "";
    s.log.push(
      crewMember(s, i).name + " played " + move.name + targetName + ".",
    );
    s.plays.push({
      actor: i,
      id: move.id,
      name: move.name,
      ...(move.card ? { card: move.card } : {}),
      changes: resourceChanges(state, s),
      markedChannel: s.channelMarked === true && state.channelMarked === false,
      ...(canLureReefCreature(state, move.card, i)
        ? { luredCreature: true }
        : {}),
    });
    if (s.acted.length === s.crew.length) s.phase = "event";
  } else if (s.phase === "event" && s.swimmer !== null) {
    const projected = projectTide(state, s.swimmer, move);
    const { result, lost, outcome } = projected;
    const { ration } = result;
    s.hull = projected.hull;
    s.crew = projected.crew;
    s.tideResult = result;
    s.log.push(
      move.name +
        ". " +
        crewMember(s, s.swimmer).name +
        " recovered " +
        ration +
        (ration === 1 ? " ration." : " rations."),
    );
    if (underRaft(s) && (s.rulesVersion ?? 1) >= 10) {
      s.creatureFollowing = result.route.kind !== "pry";
      s.log.push(
        s.creatureFollowing
          ? "Its wake follows the raft."
          : "The grip breaks. Its wake falls behind.",
      );
    }
    s.phase = outcome;
    if (outcome === "lost") {
      s.log.push(
        !s.hull
          ? "The last timber came loose."
          : lost.map((p) => p.name).join(" and ") + " succumbed to cold.",
      );
    } else if (outcome === "won") {
      s.log.push("All three reached the rescue vessel.");
    } else if (outcome === "recover") {
      s.guard = 0;
    } else {
      s.tide++;
      s.swimmer = null;
    }
  } else if (
    s.phase === "recover" &&
    s.swimmer !== null &&
    s.deck &&
    s.lockerCard &&
    s.tideResult?.route.kind === "haul-locker"
  ) {
    const sailor = crewMember(s, s.swimmer).name;
    const find = s.tideResult.route.find;
    s.tideResult.route.stowed = Boolean(move.card);
    if (move.card) {
      replaceCard(s.deck, s.swimmer, move.card, s.lockerCard);
      s.log.push(`${sailor} stowed ${find}.`);
    } else {
      s.log.push(`${sailor} left ${find} in the locker.`);
    }
    s.tide++;
    s.phase = "board";
    s.swimmer = null;
  }
  return s;
}
