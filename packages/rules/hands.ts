import { nextSeed, shuffle } from "./random.ts";
export type CardId = "line" | "hook" | "patch" | "tin" | "wrap";

interface Effect {
  text: string;
  hull?: number;
  brace?: number;
  cold?: number;
  swimmerCold?: number;
  food?: number;
  targetCold?: number;
}

interface Card {
  name: string;
  raft: Effect;
  water: Effect;
}

const cards: Record<CardId, Card> = {
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

export function deal(deck: Deck, salvage: string) {
  const bonus = salvageCard(salvage);
  deck.draw = shuffledPile(deck, [
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
  ]);
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
    name: cards[id].name,
    water: cards[id].water.text,
    raft: cards[id].raft.text,
  }));
}
