import { coldLimit, swimmerCold, type Voyage } from "@seventh-tide/rules";
import { crewSignals, type CrewSignal } from "../shared/crew-signals.ts";
import { element, select } from "./dom.ts";

const labels: Record<CrewSignal, string> = {
  warmth: "Need warmth",
  brace: "Need brace",
  ration: "Can share a ration",
};

type SignalState = Pick<
  Voyage,
  "phase" | "crew" | "swimmer" | "hull" | "guard" | "acted"
>;

function currentSignals(
  s: SignalState,
  players: number,
  manual: (CrewSignal | null)[],
) {
  if (s.phase !== "cards" && s.phase !== "event") return [];
  if (s.phase === "event") return manual;
  const needWarmth = s.crew.map(
    ({ cold }, seat) =>
      cold + (seat === s.swimmer ? swimmerCold : -1) >= coldLimit ||
      manual[seat] === "warmth",
  );
  const braceSeat =
    s.hull <= 2 && s.guard === 0 && !manual.includes("brace")
      ? s.crew.findIndex(
          (_, seat) =>
            seat >= players && !needWarmth[seat] && !s.acted.includes(seat),
        )
      : -1;
  return s.crew.map(({ food }, seat) => {
    if (seat < players) return manual[seat] ?? null;
    if (needWarmth[seat]) return "warmth";
    if (seat === braceSeat) return "brace";
    if (
      food > 0 &&
      !s.acted.includes(seat) &&
      needWarmth.some((need, i) => i !== seat && need)
    )
      return "ration";
    return null;
  });
}

export function crewSignalStation(
  onChange: (signal: CrewSignal) => Promise<boolean>,
) {
  const control = select("signal-station");
  const flag = select("signal-flag");
  const mast = control.parentElement;
  if (!(control instanceof HTMLDetailsElement) || !mast)
    throw new Error("Missing signal station.");
  const station = control;
  const list = select("compact-signals");
  const options = select("signal-options");
  const announce = select("signal-announcement");
  const status = select("signal-status");
  function closeStation() {
    if (!station.open) return;
    if (options.contains(document.activeElement))
      flag.focus({ preventScroll: true });
    station.open = false;
  }

  async function selectFlag(signal: CrewSignal) {
    if (await onChange(signal)) closeStation();
  }

  const choices = crewSignals.map((signal) => {
    const choice = element("button", labels[signal], "signal-pennant");
    choice.type = "button";
    choice.dataset.signal = signal;
    choice.setAttribute("aria-pressed", "false");
    choice.setAttribute("aria-describedby", "signal-help");
    const clear = element("span", "×", "signal-pennant-clear");
    clear.setAttribute("aria-hidden", "true");
    choice.append(clear);
    choice.addEventListener("click", () => void selectFlag(signal));
    return choice;
  });
  options.prepend(...choices);
  const narrow = matchMedia("(max-width: 700px)");
  const compact = select("compact-signal-anchor");
  function placeStation() {
    const focused = document.activeElement;
    const anchor = narrow.matches ? compact : mast;
    anchor?.append(station);
    if (focused instanceof HTMLElement && station.contains(focused))
      focused.focus({ preventScroll: true });
  }
  narrow.addEventListener("change", placeStation);
  placeStation();
  document.addEventListener("pointerdown", (event) => {
    if (
      station.open &&
      event.target instanceof Node &&
      !station.contains(event.target)
    )
      station.open = false;
  });
  station.addEventListener("keydown", (event) => {
    if (event.key === "Escape") closeStation();
  });

  return function renderSignals(
    s: SignalState,
    seat: number,
    players: number,
    online: boolean,
    manual: (CrewSignal | null)[],
  ) {
    const signals = currentSignals(s, players, manual);
    const labelsBySeat = s.crew.map((_, i) => {
      const signal = signals[i];
      return signal ? labels[signal] : "";
    });
    const notes = s.crew.flatMap(({ name }, i) => {
      const signal = signals[i];
      return signal ? [{ signal, text: `${name}: ${labels[signal]}` }] : [];
    });
    for (const [i, row] of Array.from(select("crew").children).entries()) {
      const badge = row.querySelector(".crew-signal-label");
      const label = labelsBySeat[i] ?? "";
      if (badge instanceof HTMLElement && badge.textContent !== label) {
        badge.textContent = label;
        badge.dataset.signal = signals[i] ?? "";
      }
    }
    const canSend = online && s.phase === "cards";
    if (!canSend && station.contains(document.activeElement))
      select("heading").focus({ preventScroll: true });
    station.hidden = !canSend;
    station.dataset.signal = manual[seat] ?? "";
    list.hidden = !canSend && !notes.length;
    if (!canSend) {
      closeStation();
      status.textContent = "";
    }
    for (const [i, choice] of choices.entries()) {
      const pressed = crewSignals[i] === manual[seat];
      choice.setAttribute("aria-pressed", String(pressed));
      choice.title = pressed ? "Select again to clear the signal" : "";
    }
    const message = notes.map(({ text }) => text).join(". ");
    if (announce.textContent !== message) {
      announce.textContent = message;
      list.replaceChildren(
        ...notes.map(({ signal, text }) => {
          const note = element("li", text);
          note.dataset.signal = signal;
          return note;
        }),
      );
    }
  };
}
