export const crewSignals = ["warmth", "brace", "ration"] as const;
export type CrewSignal = (typeof crewSignals)[number];

export function isCrewSignal(value: unknown): value is CrewSignal {
  return crewSignals.some((signal) => signal === value);
}
