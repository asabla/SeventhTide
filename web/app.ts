import { hostRoom, readRoom, readTurn, roomUrl, TurnConflict } from "./room.ts";
import type { RoomSnapshot } from "../server/voyages.ts";
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
  if (turn && next.revision <= turn.revision) return;
  const joined = !turn;
  turn = next;
  if (joined) roomControls(next);
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

async function sendMove(id: string) {
  if (!room || !turn || sending) return;
  sending = true;
  select("choices").setAttribute("inert", "");
  try {
    const next = await readTurn(room, {
      expectedRevision: turn.revision,
      moveId: id,
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
    void sendMove(id);
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
function buttons(options: Move[]) {
  const group = element("div", "", "choices");
  for (const move of options) {
    const btn = element("button");
    if ((turn ?? state).phase === "salvage") {
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
  const s = turn ?? state;
  const localEvent = room ? null : currentEvent(state);
  const forecast = turn?.forecast ?? localEvent?.[1] ?? "";
  const phase = s.phase;
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
  const options = turn?.choices ?? moves(state);
  if (turn && !options.length && phase !== "won" && phase !== "lost") {
    select("instruction").textContent =
      phase === "cards"
        ? "Waiting for the other sailors to play their cards."
        : "Waiting for the host to " +
          {
            salvage: "choose salvage",
            board: "assign the swimmer",
            event: "resolve the tide",
          }[phase] +
          ".";
  }
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
  window.addEventListener("pageshow", (event) => {
    if (event.persisted) {
      select("room-controls").removeAttribute("inert");
      select("room-status").textContent = "";
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
