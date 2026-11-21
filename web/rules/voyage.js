export const names = ["Mara", "Ivo", "Nell"];
export const jobs = ["Boatswain", "Shipwright", "Lookout"];
export const maxHull = 5;
export const coldLimit = 5;
export const swimmerRation = 1;

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

const waters = [
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
  [
    "The answering light",
    "Two lanterns answer across the water.",
    "One light moves against the current. The swimmer can sound a safe path, or the crew can force a landing.",
    3,
    1,
  ],
];

function shuffle(items, random) {
  const deck = [...items];
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  return deck;
}

export function start(seed) {
  let bits = seed >>> 0;
  const random = () => {
    bits = (Math.imul(bits, 1664525) + 1013904223) >>> 0;
    return bits / 4294967296;
  };
  return {
    tide: 1,
    phase: "salvage",
    hull: 4,
    swimmer: null,
    acted: [],
    guard: 0,
    crew: names.map((name) => ({ name, cold: 1, food: 0 })),
    salvage: shuffle(salvage, random).slice(0, 2),
    events: [...shuffle(waters.slice(0, 6), random), waters[6]],
    log: ["The ship is going down. Two seats remain on the raft."],
  };
}

export function moves(s) {
  if (s.phase === "salvage") return s.salvage;
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
                detail: "Repair 1 hull. Take 1 cold.",
              },
              {
                id: "haul",
                name: "Haul the line",
                detail: "The swimmer sheds 1 cold. Take 1 cold yourself.",
              },
            ];
      const hand = options.map((o) => ({ ...o, id: o.id + "-" + i, actor: i }));
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
  if (s.phase === "event")
    return [
      {
        id: "hull",
        name: s.tide === 7 ? "Force a landing" : "Let the raft take it",
        detail:
          "Lose " +
          Math.max(0, s.events[s.tide - 1][3] - s.guard) +
          " hull after bracing.",
      },
      {
        id: "dive",
        name: s.tide === 7 ? "Follow the swimmer" : "Send the swimmer",
        detail:
          s.crew[s.swimmer].name +
          " takes " +
          s.events[s.tide - 1][4] +
          " extra cold.",
      },
    ];
  return [];
}

export function play(state, moveId) {
  const move = moves(state).find((option) => option.id === moveId);
  if (!move) throw new Error("This move is unavailable.");
  const s = structuredClone(state);
  const [action, who, target] = move.id.split("-");
  const cold = (i, amount) => {
    s.crew[i].cold = Math.max(0, s.crew[i].cold + amount);
  };
  if (s.phase === "salvage") {
    s.hull += action === "spar" ? 1 : -1;
    s.crew.forEach((p, i) => {
      if (action === "locker") p.food++;
      if (action === "canvas") cold(i, -1);
      if (action === "spar") cold(i, 1);
    });
    s.log.push("Salvaged " + move.name.toLowerCase() + ".");
    s.phase = "board";
  } else if (s.phase === "board") {
    s.swimmer = Number(who);
    s.acted = [];
    s.guard = 0;
    s.log.push("Tide " + s.tide + " — " + names[s.swimmer] + " took the line.");
    s.phase = "cards";
  } else if (s.phase === "cards") {
    const i = move.actor;
    switch (action) {
      case "feed":
        s.crew[i].food--;
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
        cold(i, 1);
        break;
      case "haul":
        cold(s.swimmer, -1);
        cold(i, 1);
        break;
    }
    s.acted.push(i);
    s.log.push(names[i] + " played " + move.name + ".");
    if (s.acted.length === s.crew.length) s.phase = "event";
  } else {
    if (action === "hull")
      s.hull = Math.max(
        0,
        s.hull - Math.max(0, s.events[s.tide - 1][3] - s.guard),
      );
    else cold(s.swimmer, s.events[s.tide - 1][4]);
    s.crew.forEach((p, i) => cold(i, i === s.swimmer ? 2 : -1));
    s.crew[s.swimmer].food += swimmerRation;
    s.log.push(
      move.name +
        ". " +
        names[s.swimmer] +
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
