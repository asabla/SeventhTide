import {
  coldLimit,
  maxHull,
  type ResourceChange,
  type TideResult,
  type Voyage,
} from "@seventh-tide/rules";
import { element, select } from "./dom.ts";
import { cardFace } from "./cards.ts";
import { actionArt, equipmentArt } from "./equipment-art.ts";

export type TableState = Pick<
  Voyage,
  | "tide"
  | "phase"
  | "swimmer"
  | "crew"
  | "hull"
  | "guard"
  | "plays"
  | "tideResult"
>;

export interface CardOrigin {
  id: string;
  x: number;
  y: number;
}

interface CrewView {
  seat: number;
  players: number;
  coveredSeats: number[];
}

function signed(value: number) {
  return value > 0 ? "+" + value : String(value).replace("-", "−");
}

function changeText(s: TableState, change: ResourceChange) {
  const { sailor, resource, amount } = change;
  const target = sailor === null ? "Raft" : s.crew[sailor]?.name;
  const unit =
    resource === "ration" && Math.abs(amount) > 1 ? "rations" : resource;
  return target + " " + signed(amount) + " " + unit;
}

function atTable(s: TableState) {
  return s.phase === "cards" || s.phase === "event";
}

function tidePlays(
  s: TableState,
  view: CrewView,
  previous?: TableState,
  origin?: CardOrigin,
) {
  const section = select("tide-plays");
  const list = select("crew-plays");
  section.hidden = !atTable(s) || !s.plays.length;
  if (section.hidden) {
    list.replaceChildren();
    return;
  }

  const sameTide = previous && atTable(previous) && s.tide === previous.tide;
  if (!sameTide) list.replaceChildren();
  let playedHere: HTMLElement | undefined;
  for (const play of s.plays.slice(sameTide ? previous.plays.length : 0)) {
    const { actor } = play;
    const role = view.coveredSeats.includes(actor)
      ? " · Bot cover"
      : actor === view.seat
        ? " · You"
        : actor >= view.players
          ? " · Bot"
          : "";
    const slot = element("li", "", "played-card");
    const [name, target] = play.id.startsWith("feed-")
      ? ["Share a ration", play.name.replace(/^Share with /, "")]
      : play.name.split(" · ");
    const face = cardFace(
      "div",
      name ?? play.name,
      play.card
        ? equipmentArt(play.card, actor === s.swimmer)
        : actionArt(play.id),
    );
    face.classList.add("table-card");
    if (target) face.append(element("span", "For " + target, "action"));
    if (play.changes.length) {
      const changes = element("ul", "", "resource-changes");
      changes.append(
        ...play.changes.map((change) => element("li", changeText(s, change))),
      );
      face.append(changes);
    } else if (!play.markedChannel) {
      face.append(element("small", "No resource change", "resource-changes"));
    }
    if (play.markedChannel)
      face.append(element("small", "Channel marked", "channel-mark"));

    if (sameTide) {
      slot.classList.add("card-arrival");
      if (origin?.id === play.id) playedHere = slot;
    }
    slot.append(face, element("p", s.crew[actor]?.name + role, "played-by"));
    list.append(slot);
  }
  if (
    playedHere &&
    origin &&
    !matchMedia("(prefers-reduced-motion: reduce)").matches
  ) {
    const rect = playedHere.getBoundingClientRect();
    playedHere.style.setProperty(
      "--card-x",
      origin.x - (rect.left + rect.width / 2 + scrollX) + "px",
    );
    playedHere.style.setProperty(
      "--card-y",
      origin.y - (rect.top + rect.height / 2 + scrollY) + "px",
    );
  }
}

function tideResult(s: TableState, previous?: TableState) {
  const section = select("tide-result");
  const result = s.tideResult;
  section.hidden =
    !result || (s.phase !== "board" && s.phase !== "won" && s.phase !== "lost");
  if (!result || section.hidden) {
    section.replaceChildren();
    return;
  }
  if (section.dataset.tide === String(result.tide) && section.childElementCount)
    return;
  section.dataset.tide = String(result.tide);
  section.classList.toggle(
    "reveal-result",
    Boolean(previous && previous.tideResult?.tide !== result.tide),
  );
  const swimmer = s.crew[result.swimmer]?.name;
  const details = element("ol", "", "tide-beats");
  details.append(...routeBeats(result, swimmer));

  const exposure = element("li", "", "exposure-beat");
  exposure.append(
    element("strong", "Exposure and recovery"),
    element(
      "span",
      `${swimmer} ${signed(result.exposure[result.swimmer] ?? 0)} cold, +${result.ration} ration`,
    ),
  );
  result.exposure.forEach((amount, i) => {
    if (i !== result.swimmer && amount)
      exposure.append(
        element("span", `${s.crew[i]?.name} ${signed(amount)} cold`),
      );
  });
  details.append(exposure);

  const heading = element("h3", `Tide ${result.tide} result`);
  const loss = s.phase === "lost" ? lossDetails(s) : [];
  section.replaceChildren(
    heading,
    ...loss,
    element("p", `${result.event} · ${result.choice}`),
    details,
  );
}

function lossDetails(s: TableState) {
  const coldSeats = s.crew.flatMap(({ cold }, seat) =>
    cold >= coldLimit ? [seat] : [],
  );
  const lostHull = s.hull === 0;
  const causes = [
    ...(lostHull ? [`The raft reached 0/${maxHull} hull.`] : []),
    ...coldSeats.map((seat) => {
      const sailor = s.crew[seat];
      return `${sailor?.name} reached ${sailor?.cold}/${coldLimit} cold.`;
    }),
  ];
  const summary = element("p", causes.join(" "), "loss-summary");
  const costs = element("ul", "", "loss-costs");
  for (const play of s.plays) {
    const changes = play.changes.filter(
      ({ sailor, resource, amount }) =>
        (lostHull && resource === "hull" && amount < 0) ||
        (resource === "cold" &&
          sailor !== null &&
          coldSeats.includes(sailor) &&
          amount > 0),
    );
    if (changes.length)
      costs.append(
        element(
          "li",
          `${s.crew[play.actor]?.name} played ${play.name}. ${changes.map((change) => changeText(s, change)).join(", ")}.`,
        ),
      );
  }
  return costs.childElementCount
    ? [
        summary,
        element("h4", "Costs from the crew’s plays", "loss-costs-heading"),
        costs,
      ]
    : [summary];
}

function routeBeats({ route }: TideResult, swimmer: string | undefined) {
  if (route.kind === "hull")
    return [
      element("li", `${route.incoming} incoming hull damage`),
      element("li", `${route.blocked} blocked by brace`),
      element("li", `${route.lost} hull lost`),
    ];
  if (route.kind === "dive")
    return [element("li", `${swimmer} +${route.cold} cold from the event`)];
  return [
    element(
      "li",
      "Marked channel · 0 hull damage, 0 extra cold",
      "channel-mark",
    ),
  ];
}

export function renderTable(
  s: TableState,
  view: CrewView,
  previous?: TableState,
  origin?: CardOrigin,
) {
  tidePlays(s, view, previous, origin);
  tideResult(s, previous);
  const swimmer = s.swimmer === null ? undefined : s.crew[s.swimmer];
  const stats = [`Hull ${s.hull}/${maxHull}`, `Brace ${s.guard}`];
  if (swimmer) stats.push(`${swimmer.name} ${swimmer.cold}/${coldLimit} cold`);
  select("raft-condition").textContent = stats.join(" · ");
}
