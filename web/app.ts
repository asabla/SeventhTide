import {
  hostRoom,
  readRoom,
  readTurn,
  roomUrl,
  TurnConflict,
  savedHostRoom,
  storeHostRoom,
  type RoomAction,
} from "./room.ts";
import type { RoomSnapshot } from "../server/voyages.ts";
import { parseSavedRun, type SavedRun } from "./saved-run.ts";
import { equipmentImage } from "./equipment-art.ts";
import lanterns from "./assets/answering-light.jpg";
import firstWater from "./assets/first-water.jpg";
import {
  start,
  rulesVersion,
  handPreview,
  salvagePreview,
  play,
  moves,
  currentEvent,
  jobs,
  maxHull,
  coldLimit,
  swimmerCold,
  swimmerRation,
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
    rulesVersion,
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
  state = run.history.reduce(play, start(run.seed, run.rulesVersion ?? 1));
} catch {
  run = newRun();
  state = start(run.seed);
}
let paintSea: (() => void) | undefined;
const roomId = new URLSearchParams(location.search).get("room");
const room = roomId ? readRoom(roomId) : null;
let turn: RoomSnapshot | undefined;
let sending = false;
let refreshing = false;
let connectionFailed = false;

function showRoomError(error: unknown) {
  select("room-status").textContent =
    error instanceof Error ? error.message : "Could not reach the room.";
}

function setTurn(next: RoomSnapshot) {
  if (
    turn &&
    (next.revision < turn.revision ||
      (next.revision === turn.revision &&
        next.offerRevision <= turn.offerRevision))
  )
    return;
  const joined = !turn;
  turn = next;
  if (joined) roomControls(next);
  const finished = next.phase === "won" || next.phase === "lost";
  if (room && next.seat === 0 && (joined || finished))
    storeHostRoom(room, finished);
  render();
  paintSea?.();
}

async function refreshRoom() {
  if (
    !room ||
    refreshing ||
    document.hidden ||
    turn?.phase === "won" ||
    turn?.phase === "lost"
  )
    return;
  refreshing = true;
  try {
    const next = await readTurn(room);
    if (!turn || next.revision > turn.revision || connectionFailed)
      select("room-status").textContent = "";
    connectionFailed = false;
    setTurn(next);
  } catch (error) {
    connectionFailed = true;
    showRoomError(error);
  } finally {
    refreshing = false;
  }
}

async function sendMove(action: RoomAction) {
  if (!room || !turn || sending) return;
  sending = true;
  select("choices").setAttribute("inert", "");
  try {
    const next = await readTurn(room, {
      expectedRevision: turn.revision,
      ...(turn.phase === "board" && "moveId" in action
        ? { expectedOfferRevision: turn.offerRevision }
        : {}),
      ...action,
    });
    setTurn(next);
    select("room-status").textContent = "";
    select("heading").focus();
  } catch (error) {
    if (error instanceof TurnConflict) await refreshRoom();
    showRoomError(error);
  } finally {
    select("choices").removeAttribute("inert");
    sending = false;
  }
}
function act(id: string) {
  if (room) {
    void sendMove({ moveId: id });
    return;
  }
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
function usesCrewDeck() {
  return turn ? turn.rulesVersion >= 2 : Boolean(state.deck);
}
function buttons(options: Move[]) {
  const group = element("div", "", "choices");
  for (const move of options) {
    const btn = element("button");
    if ((turn ?? state).phase === "salvage") {
      btn.className = "salvage";
      btn.append(element("span", "", "item " + move.id));
    }
    if (move.id.startsWith("sound-") || move.id.startsWith("haul-")) {
      btn.className = move.id.startsWith("sound-")
        ? "action-art sound"
        : "action-art haul";
      btn.append(element("span", "", "engraving"));
    }
    if (move.card) {
      const image = equipmentImage(
        move.card,
        move.actor === (turn ?? state).swimmer,
      );
      if (image) {
        btn.className = "action-art";
        const art = element("img", "", "engraving");
        art.alt = "";
        art.src = image;
        btn.append(art);
      }
    }
    const copy = element("span");
    copy.append(
      element("strong", move.name),
      element(
        "small",
        move.detail +
          (usesCrewDeck() && move.actor !== undefined
            ? move.card
              ? " Discard and draw one."
              : " Keep both cards."
            : ""),
      ),
    );
    btn.append(copy);
    btn.addEventListener("click", () => act(move.id));
    if (usesCrewDeck() && (turn ?? state).phase === "salvage") {
      const item = element("div", "", "salvage-choice");
      const preview = element("details");
      const card = salvagePreview(move.id);
      preview.append(
        element("summary", card.name + " effects"),
        element("p", "On the raft · " + card.raft.text),
        element("p", "In the water · " + card.water.text),
      );
      item.append(btn, preview);
      group.append(item);
    } else group.append(btn);
  }
  return group;
}
function boarding(s: Pick<Voyage, "crew">, choices: Move[]) {
  const list = element("div", "", "boarding");
  s.crew.forEach((sailor, i) => {
    const offered = turn?.volunteers.includes(i);
    const row = element("section", "", "boarding-sailor");
    row.append(element("h3", sailor.name + (offered ? " · Volunteered" : "")));
    const projected = sailor.cold + swimmerCold;
    row.append(
      element(
        "p",
        sailor.cold +
          " cold · " +
          sailor.food +
          (sailor.food === 1 ? " ration" : " rations"),
      ),
    );
    row.append(
      element(
        "p",
        "Swimming ends with " +
          projected +
          " cold and " +
          (sailor.food + swimmerRation) +
          (sailor.food + swimmerRation === 1 ? " ration." : " rations.") +
          (projected >= coldLimit
            ? " Needs help to stay below " + coldLimit + " cold."
            : ""),
      ),
    );
    const cards = turn ? turn.hands[i] : handPreview(state.deck, i);
    for (const card of cards ?? []) {
      const item = element("details");
      item.append(
        element("summary", card.name),
        element("p", "In the water · " + card.water),
        element("p", "On the raft · " + card.raft),
      );
      row.append(item);
    }
    if (turn?.offerSeats.includes(i)) {
      const offer = element(
        "button",
        (offered ? "Withdraw " : "Volunteer ") + sailor.name,
      );
      offer.type = "button";
      offer.addEventListener(
        "click",
        () => void sendMove({ sailor: i, offer: !offered }),
      );
      row.append(offer);
    }
    const move = choices.find((m) => m.id === "swim-" + i);
    if (move) {
      const confirm = element("button", "Assign " + sailor.name + " to swim");
      confirm.type = "button";
      confirm.addEventListener("click", () => act(move.id));
      row.append(confirm);
    }
    list.append(row);
  });
  return list;
}

function render() {
  const s = turn ?? state;
  const sighted = s.channelMarked !== undefined && s.tide >= 6;
  const scene = document.querySelector<HTMLImageElement>(".scene img");
  if (scene && scene.classList.contains("lanterns") !== sighted) {
    scene.src = sighted ? lanterns : firstWater;
    scene.alt = sighted
      ? "An amber lantern hangs from a rescue cutter. A pale lantern floats alone across the reef."
      : "Two sailors on a timber raft hold a line to a swimmer reaching for a ration tin.";
    scene.classList.toggle("lanterns", sighted);
  }
  select("landing-rules").hidden = s.channelMarked === undefined;
  const localEvent = room ? null : currentEvent(state);
  const forecast = turn?.forecast ?? localEvent?.[1] ?? "";
  const phase = s.phase;
  select("deck-rules").hidden = !usesCrewDeck();
  const heads = {
    salvage: "What can you save?",
    board: "Who takes the line?",
    cards: "Play the crew’s hand",
    event: turn?.event?.title ?? localEvent?.[0] ?? "",
    won: "Three souls ashore",
    lost: "Lost at sea",
  };
  const instructions = {
    salvage:
      "The ship is sinking. Take one salvage card for the crew before you board the raft.",
    board:
      forecast +
      " Choose one swimmer. They gain 2 cold and 1 personal ration at tide’s end. The two on the raft each shed 1 cold.",
    cards:
      forecast +
      " Play one card per sailor, in any order. Check for loss after the event.",
    event:
      (turn?.event?.description ?? localEvent?.[2] ?? "") +
      " Then apply cold, warmth, and the swimmer’s ration.",
    won: "All three sailors survived the seventh tide.",
    lost: s.log.at(-1) ?? "",
  };
  select("location").textContent =
    phase === "salvage"
      ? "Aboard the sinking ship"
      : sighted
        ? "The answering light"
        : "Adrift in the wreck field";
  select("step").textContent =
    (phase === "salvage" ? "Prologue" : "Tide " + s.tide + " of 7") +
    "  /  " +
    phaseName[phase];
  select("heading").textContent = heads[phase];
  select("instruction").textContent = instructions[phase];
  const choices = select("choices");
  choices.replaceChildren();
  const options = turn?.choices ?? moves(state);
  if (turn && !options.length && (phase === "salvage" || phase === "event")) {
    select("instruction").textContent =
      phase === "salvage"
        ? "Waiting for the host to choose salvage."
        : "Waiting for the host to resolve the tide.";
    for (const route of turn.event?.landingRoutes ?? [])
      choices.append(element("h3", route.name), element("p", route.detail));
  }
  const feedback = select("turn-feedback");
  let turnText = "";
  if (phase === "cards" || phase === "event") {
    const remaining = s.crew
      .filter((_, i) => !s.acted.includes(i))
      .map((p) => p.name);
    const pending = remaining.length
      ? "Waiting for " + new Intl.ListFormat("en").format(remaining) + "."
      : "All three sailors have played.";
    turnText = (s.acted.length ? (s.log.at(-1) ?? "") + " " : "") + pending;
  }
  if (feedback.textContent !== turnText) feedback.textContent = turnText;
  if (phase === "board") {
    if (turn)
      select("instruction").textContent =
        forecast +
        (turn.seat === 0
          ? " Choose a volunteer to swim, or assign anyone if nobody volunteers."
          : " You can volunteer your sailor. The host confirms who swims.") +
        " Sailors on the raft shed 1 cold at tide’s end.";
    select("instruction").append(
      " The preview shows the result before cards and events.",
    );
    choices.append(boarding(s, options));
  } else if (phase === "cards") {
    s.crew.forEach((p, i) => {
      const hand = options.filter((o) => o.actor === i);
      if (hand.length) {
        choices.append(
          element(
            "h3",
            p.name + (s.swimmer === i ? " · in the water" : " · on the raft"),
          ),
        );
        if (usesCrewDeck()) {
          const held =
            (turn ? turn.hands[i] : handPreview(state.deck, i)) ?? [];
          const playableCards = hand.filter((move) => move.card);
          choices.append(
            element("p", "In hand · " + held.map((c) => c.name).join(" / ")),
            buttons(playableCards),
          );
          for (const card of held) {
            if (
              card.id &&
              !playableCards.some((move) => move.card === card.id)
            ) {
              choices.append(
                element("small", card.name + " requires 1 ration to play."),
              );
            }
          }
          choices.append(
            element("h4", "Basic actions"),
            buttons(hand.filter((o) => !o.card)),
          );
        } else choices.append(buttons(hand));
      }
    });
  } else if (options.length) choices.append(buttons(options));
  else if (!room)
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
function soloLink() {
  const link = element("a", "Return to solo voyage");
  link.href = location.pathname;
  return link;
}

function roomControls(snapshot: RoomSnapshot) {
  const controls = select("room-controls");
  const sailor = snapshot.crew[snapshot.seat]?.name ?? "";
  const role =
    snapshot.seat === 0
      ? "Host · " + sailor + (snapshot.players === 2 ? " and Nell" : "")
      : "Playing as " + sailor;
  select("room-label").textContent = role;
  controls.replaceChildren();
  if (snapshot.invites.length) {
    controls.append(
      element(
        "p",
        "Send each private link to the player who will control that sailor.",
      ),
    );
    snapshot.invites.forEach((token, i) => {
      const label = element(
        "label",
        snapshot.crew[i + 1]?.name + "’s invite link",
      );
      const field = element("input");
      field.readOnly = true;
      field.value = roomUrl({ id: snapshot.id, token });
      field.addEventListener("focus", () => field.select());
      label.append(field);
      const copy = element(
        "button",
        "Copy " + snapshot.crew[i + 1]?.name + "’s link",
      );
      copy.type = "button";
      copy.addEventListener("click", () => {
        field.focus();
        field.select();
        if (!navigator.clipboard) {
          select("room-status").textContent = "Copy the selected invite link.";
          return;
        }
        void navigator.clipboard.writeText(field.value).then(
          () => {
            select("room-status").textContent = "Invite link copied.";
          },
          () => {
            select("room-status").textContent =
              "Copy the selected invite link.";
          },
        );
      });
      controls.append(label, copy);
    });
  }
  controls.append(soloLink());
}

if (room) {
  window.addEventListener("hashchange", () => {
    if (/^#[\w-]{43}$/.test(location.hash)) location.reload();
  });
  const panel = select("room-panel");
  panel.setAttribute("open", "");
  select("room-label").textContent = "Crew room";
  select("room-controls").replaceChildren(soloLink());
  select("heading").textContent = "Joining the crew";
  void refreshRoom();
  window.setInterval(() => void refreshRoom(), 2500);
  document.addEventListener("visibilitychange", () => void refreshRoom());
} else {
  const resume = element("button", "Resume crew voyage", "resume-room");
  resume.type = "button";
  resume.hidden = !savedHostRoom();
  resume.addEventListener("click", () => {
    const previous = savedHostRoom();
    if (previous) location.assign(roomUrl(previous));
    else resume.hidden = true;
  });
  select("room-panel").before(resume);
  window.addEventListener("pageshow", (event) => {
    if (event.persisted) {
      select("room-controls").removeAttribute("inert");
      select("room-status").textContent = "";
      resume.hidden = !savedHostRoom();
    }
  });
  for (const [id, players] of [
    ["host-two", 2],
    ["host-three", 3],
  ] as const) {
    select(id).addEventListener("click", () => {
      select("room-controls").setAttribute("inert", "");
      select("room-status").textContent = "Opening a crew room…";
      void hostRoom(players).catch((error: unknown) => {
        select("room-controls").removeAttribute("inert");
        showRoomError(error);
      });
    });
  }
  render();
}

// The crew controls are ready before the presentation engine finishes loading.
void import("./sea.ts")
  .then(({ mountSea }) => {
    paintSea = mountSea(select("sea"), () => turn ?? state);
  })
  .catch((error: unknown) => console.warn("Sea scene unavailable", error));
