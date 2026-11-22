import { nextSeed, shuffle } from "./random.ts";
import {
  cardInfo,
  deal,
  replaceCard,
  salvageCard,
  type CardId,
  type Deck,
} from "./hands.ts";
export { handPreview } from "./hands.ts";

export function salvagePreview(id: string) {
  return cardInfo(salvageCard(id));
}
export const rulesVersion = 5;
export type RulesVersion = 1 | 2 | 3 | 4 | 5;
export function isRulesVersion(value: unknown): value is RulesVersion {
  return (
    typeof value === "number" &&
    Number.isInteger(value) &&
    value >= 1 &&
    value <= rulesVersion
  );
}

export type Phase = "salvage" | "board" | "cards" | "event" | "won" | "lost";

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
  kind: "card" | "action";
  changes: ResourceChange[];
  markedChannel: boolean;
}

export interface TideResult {
  tide: number;
  event: string;
  choice: string;
  swimmer: number;
  route:
    | { kind: "hull"; incoming: number; blocked: number; lost: number }
    | { kind: "dive"; cold: number }
    | { kind: "channel" };
  exposure: number[];
  ration: number;
}

export interface Voyage {
  rulesVersion?: number;
  channelMarked?: boolean;
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
    "The split seam",
    "Water beads along a seam.",
    "The lowest timber splits.",
    2,
    1,
  ],
  [
    "The black squall",
    "Rain flattens the water ahead.",
    "A squall drives spray over the bow.",
    1,
    2,
  ],
  [
    "The bell buoy",
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
    "The second wake",
    "Another wake follows your own.",
    "Something pulls on the swimmer’s line.",
    2,
    1,
  ],
];

const finalTide: TideEvent = [
  "The answering light",
  "Two lanterns answer across the water.",
  "One light moves against the current. The swimmer can sound a safe path, or the crew can force a landing.",
  3,
  1,
];

const answeringLight: TideEvent = [
  "The answering light",
  "One lantern drifts against the current. Forcing a landing costs 4 hull before brace. Scouting ahead costs the swimmer 2 extra cold.",
  "The cutter is crossing the reef. Choose your landing route.",
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

export function currentEvent(voyage: Voyage) {
  const event = voyage.events[voyage.tide - 1];
  if (!event) throw new RangeError("Unknown tide: " + voyage.tide);
  if (voyage.channelMarked !== undefined && voyage.tide === 6) {
    const sighting = voyage.channelMarked
      ? "The swimmer has marked the channel to the rescue cutter."
      : "Two lanterns appear. The swimmer can play Sounding line this tide to mark a safe channel for landing.";
    return [
      event[0],
      sighting + " " + event[1],
      event[2],
      event[3],
      event[4],
    ] satisfies TideEvent;
  }
  if (voyage.channelMarked !== undefined && voyage.tide === 7) {
    const route = voyage.channelMarked
      ? "The marked channel adds no hull damage or cold."
      : "The crew reaches the reef without a marked channel.";
    return [
      event[0],
      route + " " + event[1],
      route + " " + event[2],
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
  return {
    ...(version >= 4 ? { rulesVersion: version } : {}),
    ...(version >= 3 ? { channelMarked: false } : {}),
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
    salvage: shuffle(salvage, random).slice(0, 2),
    events: [
      ...shuffle(waters, random),
      version >= 3 ? answeringLight : finalTide,
    ],
    log: ["The ship is going down. Two seats remain on the raft."],
  };
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
        const effect = i === s.swimmer ? definition.water : definition.raft;
        if (p.food + (effect.food ?? 0) < 0) continue;
        const option = {
          card,
          actor: i,
          name: definition.name,
          detail:
            effect.text +
            (canMarkChannel(s, card, i)
              ? " Mark the safe channel for tide seven."
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
  if (s.phase === "event" && s.swimmer !== null)
    return [
      ...(s.tide === 7 && s.channelMarked
        ? [
            {
              id: "channel",
              name: "Follow the marked channel",
              detail:
                "Lose 0 hull and take 0 extra cold. The swimmer still gains 2 cold from exposure.",
            },
          ]
        : []),
      {
        id: "hull",
        name: s.tide === 7 ? "Force a landing" : "Let the raft take it",
        detail:
          "Lose " +
          Math.max(0, currentEvent(s)[3] - s.guard) +
          " hull after bracing.",
      },
      {
        id: "dive",
        name:
          s.tide === 7
            ? s.channelMarked === undefined
              ? "Follow the swimmer"
              : "Scout the reef"
            : "Send the swimmer",
        detail:
          crewMember(s, s.swimmer).name +
          " takes " +
          currentEvent(s)[4] +
          " extra cold.",
      },
    ];
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
      const definition = cardInfo(move.card);
      const effect = i === s.swimmer ? definition.water : definition.raft;
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
      kind: move.card ? "card" : "action",
      changes: resourceChanges(state, s),
      markedChannel: s.channelMarked === true && state.channelMarked === false,
    });
    if (s.acted.length === s.crew.length) s.phase = "event";
  } else if (s.phase === "event" && s.swimmer !== null) {
    const [event, , , incoming, extraCold] = currentEvent(s);
    let route: TideResult["route"] = { kind: "channel" };
    if (action === "hull") {
      const blocked = Math.min(incoming, s.guard);
      s.hull = Math.max(0, s.hull - (incoming - blocked));
      route = { kind: "hull", incoming, blocked, lost: state.hull - s.hull };
    } else if (action === "dive") {
      cold(s.swimmer, extraCold);
      route = { kind: "dive", cold: extraCold };
    }
    const exposure = s.crew.map((sailor, i) => {
      const before = sailor.cold;
      cold(i, i === s.swimmer ? swimmerCold : -1);
      return sailor.cold - before;
    });
    crewMember(s, s.swimmer).food += swimmerRation;
    s.tideResult = {
      tide: s.tide,
      event,
      choice: move.name,
      swimmer: s.swimmer,
      route,
      exposure,
      ration: swimmerRation,
    };
    s.log.push(
      move.name +
        ". " +
        crewMember(s, s.swimmer).name +
        " recovered " +
        swimmerRation +
        " ration.",
    );
    const lost = s.crew.filter((p) => p.cold >= coldLimit);
    if (!s.hull || lost.length) {
      s.phase = "lost";
      s.log.push(
        !s.hull
          ? "The last timber came loose."
          : lost.map((p) => p.name).join(" and ") + " succumbed to cold.",
      );
    } else if (s.tide === 7) {
      s.phase = "won";
      s.log.push("All three reached the rescue vessel.");
    } else {
      s.tide++;
      s.phase = "board";
      s.swimmer = null;
    }
  }
  return s;
}
