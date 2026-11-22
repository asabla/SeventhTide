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

export function crewSignalTabs(onChange: (signal: CrewSignal) => void) {
  const list = select("compact-signals");
  const options = select("signal-options");
  const announce = select("signal-announcement");
  const status = select("signal-status");
  const choices = crewSignals.map((signal) => {
    const choice = element("button", labels[signal], "signal-tag");
    choice.type = "button";
    choice.setAttribute("aria-pressed", "false");
    choice.setAttribute("aria-describedby", "signal-help");
    const clear = element("span", "×", "signal-tag-clear");
    clear.setAttribute("aria-hidden", "true");
    choice.append(clear);
    choice.addEventListener("click", () => onChange(signal));
    return choice;
  });
  options.prepend(...choices);
  const narrow = matchMedia("(max-width: 700px)");
  function placeTabs() {
    const focused = choices.find((choice) => choice === document.activeElement);
    select(narrow.matches ? "compact-signal-tabs" : "log-signal-tabs").append(
      options,
    );
    focused?.focus({ preventScroll: true });
  }
  narrow.addEventListener("change", placeTabs);
  placeTabs();

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
    const lines = s.crew.flatMap(({ name }, i) =>
      labelsBySeat[i] ? [`${name}: ${labelsBySeat[i]}`] : [],
    );
    for (const [i, row] of Array.from(select("crew").children).entries()) {
      const badge = row.querySelector(".crew-signal-label");
      const label = labelsBySeat[i] ?? "";
      if (badge && badge.textContent !== label) badge.textContent = label;
    }
    const canSend = online && s.phase === "cards";
    if (!canSend && options.contains(document.activeElement))
      select("heading").focus({ preventScroll: true });
    options.hidden = !canSend;
    list.hidden = !canSend && !lines.length;
    if (!canSend) status.textContent = "";
    for (const [i, choice] of choices.entries()) {
      const pressed = crewSignals[i] === manual[seat];
      choice.setAttribute("aria-pressed", String(pressed));
      choice.title = pressed ? "Select again to clear the signal" : "";
    }
    const message = lines.join(". ");
    if (announce.textContent !== message) {
      announce.textContent = message;
      list.replaceChildren(...lines.map((line) => element("li", line)));
    }
  };
}
