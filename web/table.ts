import {
  coldLimit,
  maxHull,
  type ResourceChange,
  type TideResult,
  type Voyage,
} from "@seventh-tide/rules";
import { element, select } from "./dom.ts";
import { equipmentImage } from "./equipment-art.ts";

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

function playSlots(
  s: TableState,
  view: CrewView,
  previous?: TableState,
  origin?: CardOrigin,
) {
  const table = select("crew-table");
  table.hidden = !atTable(s);
  if (table.hidden) return;

  const sameTable = previous && atTable(previous) && s.tide === previous.tide;
  if (sameTable && previous.plays.length === s.plays.length) return;

  const slots = select("crew-plays");
  let playedHere: HTMLElement | undefined;
  slots.replaceChildren(
    ...s.crew.map((sailor, i) => {
      const slot = element("li", "", "crew-slot");
      const bot = i >= view.players;
      const role = i === view.seat ? " · You" : bot ? " · Bot" : "";
      slot.append(
        element("strong", sailor.name + role),
        element("small", i === s.swimmer ? "In the water" : "On the raft"),
      );
      const play = s.plays.find(({ actor }) => actor === i);
      if (!play) {
        slot.append(
          element(
            "p",
            bot
              ? "Plays after players"
              : i === view.seat
                ? "Your move"
                : "Waiting to play",
            "empty-slot",
          ),
        );
        return slot;
      }
      const card = element("div", "", "played-card");
      const artwork = play.card && equipmentImage(play.card, i === s.swimmer);
      if (artwork) {
        const image = element("img");
        image.alt = "";
        image.src = artwork;
        card.append(image);
      }
      card.append(element("strong", play.name));
      if (play.changes.length) {
        const changes = element("ul", "", "resource-changes");
        changes.replaceChildren(
          ...play.changes.map((change) => element("li", changeText(s, change))),
        );
        card.append(changes);
      } else card.append(element("small", "No resource change"));
      if (play.markedChannel)
        card.append(element("small", "Channel marked", "channel-mark"));

      if (
        previous &&
        previous.tide === s.tide &&
        !(sameTable && previous.plays.some(({ actor }) => actor === i))
      ) {
        card.classList.add("card-arrival");
        if (origin?.id === play.id) playedHere = card;
      }
      slot.append(card);
      return slot;
    }),
  );
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
  section.replaceChildren(
    heading,
    element("p", `${result.event} · ${result.choice}`),
    details,
  );
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
  playSlots(s, view, previous, origin);
  tideResult(s, previous);
  const status = select("raft-status");
  status.hidden = s.phase === "salvage";
  const swimmer = s.swimmer === null ? undefined : s.crew[s.swimmer];
  const stats = [`Hull ${s.hull}/${maxHull}`];
  if (atTable(s)) stats.push(`Brace ${s.guard}`);
  if (swimmer) stats.push(`${swimmer.name} ${swimmer.cold}/${coldLimit} cold`);
  status.textContent = stats.join(" · ");
}
