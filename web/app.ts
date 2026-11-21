import { parseSavedRun, type SavedRun } from "./saved-run.ts";
import {
  start,
  play,
  moves,
  currentEvent,
  jobs,
  maxHull,
  coldLimit,
  type Voyage,
  type Move,
} from "@seventh-tide/rules";
function select(id: string): HTMLElement {
  const node = document.getElementById(id);
  if (!node) throw new Error("Missing interface element: " + id);
  return node;
}
const saveKey = "seventh-tide-v1";
function newRun(): SavedRun {
  return {
    seed: new DataView(
      crypto.getRandomValues(new Uint8Array(4)).buffer,
    ).getUint32(0),
    history: [],
  };
}
let run: SavedRun, state: Voyage;
try {
  const saved = localStorage.getItem(saveKey);
  run = saved ? parseSavedRun(saved) : newRun();
  state = run.history.reduce(play, start(run.seed));
} catch {
  run = newRun();
  state = start(run.seed);
}
let paintSea: (() => void) | undefined;
function act(id: string) {
  if (id === "again") {
    run = newRun();
    state = start(run.seed);
  } else {
    state = play(state, id);
    run.history.push(id);
  }
  try {
    localStorage.setItem(saveKey, JSON.stringify(run));
  } catch {
    /* Play continues in memory. */
  }
  render();
  paintSea?.();
  select("heading").focus();
}
const phaseName = {
  salvage: "Abandon ship",
  board: "Board the raft",
  cards: "Play cards",
  event: "Resolve the tide",
  won: "Landfall",
  lost: "Voyage lost",
};
function element<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  text?: string,
  className?: string,
) {
  const el = document.createElement(tag);
  if (text) el.textContent = text;
  if (className) el.className = className;
  return el;
}
function buttons(options: Move[]) {
  const group = element("div", "", "choices");
  for (const move of options) {
    const btn = element("button");
    if (state.phase === "salvage") {
      btn.className = "salvage";
      btn.append(element("span", "", "item " + move.id));
    }
    const copy = element("span");
    copy.append(element("strong", move.name), element("small", move.detail));
    btn.append(copy);
    btn.addEventListener("click", () => act(move.id));
    group.append(btn);
  }
  return group;
}
function render() {
  const s = state;
  const event = currentEvent(s);
  const phase = s.phase;
  const heads = {
    salvage: "What can you save?",
    board: "Who takes the line?",
    cards: "Play the crew’s hand",
    event: event[0],
    won: "Three souls ashore",
    lost: "Lost at sea",
  };
  const instructions = {
    salvage:
      "The ship is sinking. Take one salvage card for the crew before you board the raft.",
    board:
      event[1] +
      " Choose one swimmer. They gain 2 cold and 1 personal ration at tide’s end. The two on the raft each shed 1 cold.",
    cards:
      event[1] +
      " Play one card per sailor, in any order. Check for loss after the event.",
    event:
      event[2] +
      " Choose who pays. Then apply cold, warmth, and the swimmer’s ration.",
    won: "All three sailors survived the seventh tide.",
    lost: s.log.at(-1) ?? "",
  };
  select("location").textContent =
    phase === "salvage"
      ? "Aboard the sinking ship"
      : "Adrift in the wreck field";
  select("step").textContent =
    (phase === "salvage" ? "Prologue" : "Tide " + s.tide + " of 7") +
    "  /  " +
    phaseName[phase];
  select("heading").textContent = heads[phase];
  select("instruction").textContent = instructions[phase];
  const choices = select("choices");
  choices.replaceChildren();
  const options = moves(s);
  if (phase === "cards") {
    s.crew.forEach((p, i) => {
      const hand = options.filter((o) => o.actor === i);
      if (hand.length)
        choices.append(
          element(
            "h3",
            p.name + (s.swimmer === i ? " · in the water" : " · on the raft"),
          ),
          buttons(hand),
        );
    });
  } else if (options.length) choices.append(buttons(options));
  else
    choices.append(
      buttons([
        {
          id: "again",
          name: "Start another voyage",
          detail: "Draw new salvage and tide events.",
        },
      ]),
    );
  const crew = select("crew");
  crew.replaceChildren();
  s.crew.forEach((p, i) => {
    const row = element("div", "", "crewline");
    const identity = element("div");
    const location =
      s.swimmer === null
        ? jobs[i]
        : i === s.swimmer
          ? "In the water"
          : "On the raft";
    identity.append(element("strong", p.name), element("small", location));
    const vitals = element(
      "div",
      p.cold + "/" + coldLimit + " cold",
      "numbers",
    );
    vitals.append(
      element("small", p.food + (p.food === 1 ? " ration" : " rations")),
    );
    row.append(identity, vitals);
    crew.append(row);
  });
  select("hull").textContent =
    "Hull " +
    s.hull +
    "/" +
    maxHull +
    (["cards", "event"].includes(phase) ? "  ·  Brace " + s.guard : "");
  select("entries").replaceChildren(
    ...s.log.map((line) => element("li", line)),
  );
}
render();

// The crew controls are ready before the presentation engine finishes loading.
void import("./sea.ts")
  .then(({ mountSea }) => {
    paintSea = mountSea(select("sea"), () => state);
  })
  .catch((error: unknown) => console.warn("Sea scene unavailable", error));
