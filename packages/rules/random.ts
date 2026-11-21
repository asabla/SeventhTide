export function nextSeed(seed: number) {
  return (Math.imul(seed, 1664525) + 1013904223) >>> 0;
}

export function shuffle<T>(items: T[], random: () => number) {
  const deck = [...items];
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    const left = deck[i];
    const right = deck[j];
    if (left === undefined || right === undefined)
      throw new RangeError("Missing card in deck.");
    deck[i] = right;
    deck[j] = left;
  }
  return deck;
}
