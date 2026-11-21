export interface SavedRun {
  rulesVersion?: 1 | 2;
  seed: number;
  history: string[];
}
export function parseSavedRun(saved: string): SavedRun {
  const value: unknown = JSON.parse(saved);
  if (
    typeof value !== "object" ||
    value === null ||
    !("seed" in value) ||
    typeof value.seed !== "number" ||
    !Number.isInteger(value.seed) ||
    value.seed < 0 ||
    value.seed > 0xffffffff ||
    !("history" in value) ||
    !Array.isArray(value.history) ||
    !value.history.every(
      (move: unknown): move is string => typeof move === "string",
    )
  ) {
    throw new Error("Invalid saved voyage.");
  }
  const run: SavedRun = { seed: value.seed, history: value.history };
  if ("rulesVersion" in value) {
    if (value.rulesVersion !== 1 && value.rulesVersion !== 2)
      throw new Error("Invalid saved voyage.");
    run.rulesVersion = value.rulesVersion;
  }
  return run;
}
