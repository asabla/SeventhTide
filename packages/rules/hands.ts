import { nextSeed, shuffle } from "./random.ts";
export type CardId =
  | "line"
  | "hook"
  | "patch"
  | "tin"
  | "wrap"
  | "belt"
  | "anchor"
  | "net"
  | "iron"
  | "block"
  | "kettle"
  | "mitts"
  | "cask"
  | "lantern"
  | "glass"
  | "bell"
  | "hatch"
  | "comb";

interface Effect {
  text: string;
  hull?: number;
  brace?: number;
  cold?: number;
  swimmerCold?: number;
  raftCold?: number;
  swimmerFood?: number;
  food?: number;
  targetCold?: number;
}

interface Card {
  name: string;
  raft: Effect;
  water: Effect;
}

const cards: Record<CardId, Card> = {
  iron: {
    name: "Caulking iron",
    raft: {
      text: "Drive oakum into the seam. Repair 2 hull. Spend 1 ration.",
      hull: 2,
      food: -1,
    },
    water: { text: "Plug the seam from below. Repair 1 hull.", hull: 1 },
  },
  block: {
    name: "Snatch block",
    raft: {
      text: "Hoist the swimmer clear. They shed 2 cold. Take 1 cold.",
      swimmerCold: -2,
      cold: 1,
    },
    water: {
      text: "Haul a spar alongside. Repair 2 hull. Spend 1 ration.",
      hull: 2,
      food: -1,
    },
  },
  kettle: {
    name: "Galley kettle",
    raft: {
      text: "Pass the hot broth. Both raft sailors shed 1 cold. Spend 1 ration.",
      raftCold: -1,
      food: -1,
    },
    water: {
      text: "Hug the warm copper. Shed 2 cold. Spend 1 ration.",
      cold: -2,
      food: -1,
    },
  },
  mitts: {
    name: "Tarred mitts",
    raft: {
      text: "Grip the shifting beams. Gain 1 brace and shed 1 cold.",
      brace: 1,
      cold: -1,
    },
    water: {
      text: "Pass the mitts aboard. Both raft sailors shed 1 cold.",
      raftCold: -1,
    },
  },
  cask: {
    name: "Breaker cask",
    raft: {
      text: "Tap the last fresh water. You and the swimmer each gain 1 ration.",
      food: 1,
      swimmerFood: 1,
    },
    water: { text: "Lash the cask alongside. Gain 2 brace.", brace: 2 },
  },
  lantern: {
    name: "Storm lantern",
    raft: {
      text: "Light the lee of the raft. Gain 1 brace and lower the swimmer’s cold by 1.",
      brace: 1,
      swimmerCold: -1,
    },
    water: {
      text: "Find a tin by lamplight. Gain 1 ration and 1 brace. Take 1 cold.",
      food: 1,
      brace: 1,
      cold: 1,
    },
  },
  glass: {
    name: "Black-glass float",
    raft: {
      text: "Hang a fender. Gain 2 brace. Spend 1 ration.",
      brace: 2,
      food: -1,
    },
    water: {
      text: "Cling to the glass. Shed 2 cold. Both raft sailors take 1 cold.",
      cold: -2,
      raftCold: 1,
    },
  },
  bell: {
    name: "Wreck bell",
    raft: {
      text: "Ring before the swell. Gain 3 brace. Take 2 cold.",
      brace: 3,
      cold: 2,
    },
    water: {
      text: "Wedge the bell in the breach. Repair 3 hull. Take 2 cold.",
      hull: 3,
      cold: 2,
    },
  },
  hatch: {
    name: "Hatch cover",
    raft: {
      text: "Fasten the cross-cleats. Repair 1 hull and gain 1 brace.",
      hull: 1,
      brace: 1,
    },
    water: {
      text: "Float the stores clear. Gain 1 ration and shed 1 cold. Lose 1 hull.",
      food: 1,
      cold: -1,
      hull: -1,
    },
  },
  comb: {
    name: "Bone comb",
    raft: {
      text: "Rake mussels from kelp. Gain 2 rations. Take 1 cold.",
      food: 2,
      cold: 1,
    },
    water: {
      text: "Free the fouled bridle. Gain 2 brace. Lose 1 hull.",
      brace: 2,
      hull: -1,
    },
  },
  belt: {
    name: "Cork belt",
    raft: {
      text: "Cut the corks loose for the swimmer. The swimmer sheds 2 cold. Lose 1 hull.",
      swimmerCold: -2,
      hull: -1,
    },
    water: {
      text: "Rest on the corks. Shed 1 cold.",
      cold: -1,
    },
  },
  anchor: {
    name: "Sea anchor",
    raft: {
      text: "Set the sea anchor against the swell. Gain 3 brace. Lose 1 hull.",
      brace: 3,
      hull: -1,
    },
    water: {
      text: "Shelter behind the canvas cone. Gain 1 brace and shed 1 cold.",
      brace: 1,
      cold: -1,
    },
  },
  net: {
    name: "Drift net",
    raft: {
      text: "Haul the loaded net over a timber. Gain 1 ration. Lose 1 hull.",
      food: 1,
      hull: -1,
    },
    water: {
      text: "Dive for the tins caught in the mesh. Gain 2 rations. Take 2 cold.",
      food: 2,
      cold: 2,
    },
  },
  line: {
    name: "Sounding line",
    raft: {
      text: "Haul the swimmer in. They shed 1 cold. Take 1 cold.",
      swimmerCold: -1,
      cold: 1,
    },
    water: {
      text: "Sound the depths. Gain 1 brace. Take 1 cold.",
      brace: 1,
      cold: 1,
    },
  },
  hook: {
    name: "Boathook",
    raft: {
      text: "Wedge the hook between timbers. Gain 2 brace. Take 1 cold.",
      brace: 2,
      cold: 1,
    },
    water: {
      text: "Hook floating timber. Repair 2 hull. Take 1 cold.",
      hull: 2,
      cold: 1,
    },
  },
  patch: {
    name: "Emergency Patch",
    raft: {
      text: "Splice a timber. Repair 2 hull. Take 1 cold.",
      hull: 2,
      cold: 1,
    },
    water: {
      text: "Plug the seam from below. Repair 1 hull and gain 1 brace. Take 1 cold.",
      hull: 1,
      brace: 1,
      cold: 1,
    },
  },
  tin: {
    name: "Pass the Tin",
    raft: {
      text: "Give a sailor the last bite. They shed 2 cold. Take 1 cold.",
      targetCold: -2,
      cold: 1,
    },
    water: {
      text: "Catch a floating tin. Gain 1 ration. Take 1 cold.",
      food: 1,
      cold: 1,
    },
  },
  wrap: {
    name: "Canvas Sling",
    raft: {
      text: "Shelter a sailor. They shed 2 cold. Lose 1 hull to rig the sling.",
      targetCold: -2,
      hull: -1,
    },
    water: {
      text: "Rest in the sling. Shed 2 cold. Lose 1 hull to drag.",
      cold: -2,
      hull: -1,
    },
  },
};

export interface Deck {
  random: number;
  draw: CardId[];
  discard: CardId[];
  hands: CardId[][];
}

export function cardInfo(id: CardId) {
  return cards[id];
}

export function salvageCard(id: string): CardId {
  switch (id) {
    case "spar":
      return "patch";
    case "locker":
      return "tin";
    case "canvas":
      return "wrap";
    default:
      throw new Error("Unknown salvage.");
  }
}

function shuffledPile(deck: Deck, pile: CardId[]) {
  return shuffle(pile, () => {
    deck.random = nextSeed(deck.random);
    return deck.random / 4294967296;
  });
}

function draw(deck: Deck) {
  if (!deck.draw.length) {
    deck.draw = shuffledPile(deck, deck.discard);
    deck.discard = [];
  }
  const card = deck.draw.pop();
  if (!card) throw new Error("Empty crew deck.");
  return card;
}

export function deal(deck: Deck, salvage: string, version: number) {
  const bonus = salvageCard(salvage);
  const pile: CardId[] = [
    "line",
    "line",
    "line",
    "hook",
    "hook",
    "hook",
    "wrap",
    "patch",
    bonus,
    bonus,
  ];
  if (version >= 4) pile.push("belt", "anchor", "net");
  if (version >= 5)
    pile.push(
      "iron",
      "block",
      "kettle",
      "mitts",
      "cask",
      "lantern",
      "glass",
      "bell",
      "hatch",
      "comb",
    );
  deck.draw = shuffledPile(deck, pile);
  deck.hands = Array.from({ length: 3 }, () => [draw(deck), draw(deck)]);
}

export function replaceCard(deck: Deck, actor: number, card: CardId) {
  const hand = deck.hands[actor];
  const slot = hand?.indexOf(card) ?? -1;
  if (!hand || slot < 0) throw new Error("Sailor does not hold this card.");
  deck.discard.push(card);
  hand[slot] = draw(deck);
}

export function handPreview(deck: Deck | undefined, sailor: number) {
  return (deck?.hands[sailor] ?? []).map((id) => ({
    id,
    name: cards[id].name,
    water: cards[id].water.text,
    raft: cards[id].raft.text,
  }));
}
