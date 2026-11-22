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
import { element, select } from "./dom.ts";
import { renderTable, type CardOrigin, type TableState } from "./table.ts";
import { playCue, soundToggle } from "./sound.ts";
import { cardDrag, equipmentCard } from "./cards.ts";
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
let activeSailor: number | undefined;
const tray = select("crew-table");
const trayButton = select("place-card");
if (!(trayButton instanceof HTMLButtonElement))
  throw new Error("Missing card control");
const placeCard = trayButton;
const trayNote = select("tray-note");
const handControls = select("hand-controls");
const drag = cardDrag(tray);
let selectedCard:
  | { button: HTMLButtonElement; moves: Move[]; targets: HTMLElement }
  | undefined;

function clearCardSelection() {
  drag.cancel();
  selectedCard?.button.setAttribute("aria-pressed", "false");
  selectedCard?.targets.replaceChildren();
  selectedCard = undefined;
  placeCard.disabled = true;
  tray.classList.remove("ready");
  trayNote.hidden = true;
}

function playSelectedCard() {
  if (!selectedCard || sending) return;
  const { button, moves: variants, targets } = selectedCard;
  const first = variants[0];
  if (!first) return;
  if (variants.length === 1) {
    act(first.id, button);
    return;
  }
  const options = element("div", "", "choices");
  for (const move of variants) {
    const target = element("button", move.name.split(" · ").at(-1));
    target.type = "button";
    target.addEventListener("click", () => act(move.id, button));
    options.append(target);
  }
  placeCard.disabled = true;
  tray.classList.remove("ready");
  trayNote.hidden = true;
  targets.replaceChildren(element("h3", "Choose a sailor"), options);
  options.querySelector("button")?.focus();
}

placeCard.addEventListener("click", playSelectedCard);

function showRoomError(error: unknown) {
  select("room-status").textContent =
    error instanceof Error ? error.message : "Could not reach the room.";
}

function setTurn(next: RoomSnapshot, origin?: CardOrigin) {
  if (
    turn &&
    (next.revision < turn.revision ||
      (next.revision === turn.revision &&
        next.offerRevision <= turn.offerRevision))
  )
    return;
  const previous = turn;
  const joined = !previous;
  turn = next;
  if (joined) roomControls(next);
  const finished = next.phase === "won" || next.phase === "lost";
  if (room && next.seat === 0 && (joined || finished))
    storeHostRoom(room, finished);
  render(previous, origin);
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

async function sendMove(action: RoomAction, origin?: CardOrigin) {
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
    setTurn(next, origin);
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
function act(id: string, source?: HTMLElement) {
  const rect = source?.getBoundingClientRect();
  const origin = rect && {
    id,
    x: rect.left + rect.width / 2 + scrollX,
    y: rect.top + rect.height / 2 + scrollY,
  };
  if (room) {
    void sendMove({ moveId: id }, origin);
    return;
  }
  const previous = id === "again" ? undefined : state;
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
  render(previous, origin);
  paintSea?.();
  select("heading").focus();
}
function usesCrewDeck() {
  return turn ? turn.rulesVersion >= 2 : Boolean(state.deck);
}
function buttons(options: Move[]) {
  const group = element("div", "", "choices");
  for (const move of options) {
    const btn = element("button");
    btn.type = "button";
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
    btn.addEventListener("click", () =>
      act(move.id, move.actor === undefined ? undefined : btn),
    );
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

function renderHand(s: TableState, options: Move[]) {
  const section = element("div", "", "voyage-hand");
  const actors = new Set(
    options.flatMap(({ actor }) => (actor === undefined ? [] : [actor])),
  );
  handControls.replaceChildren();
  handControls.hidden = actors.size < 2;
  if (activeSailor === undefined || !actors.has(activeSailor))
    activeSailor = actors.values().next().value;
  const actor = activeSailor;
  if (actor === undefined) return section;
  const sailor = s.crew[actor];
  if (!sailor) return section;
  const water = actor === s.swimmer;
  const actorOptions = options.filter((move) => move.actor === actor);
  if (actors.size > 1) {
    s.crew.forEach((member, index) => {
      if (!actors.has(index)) return;
      const control = element("button", member.name);
      control.type = "button";
      control.setAttribute("aria-pressed", String(index === actor));
      control.addEventListener("click", () => {
        clearCardSelection();
        activeSailor = index;
        select("choices").replaceChildren(renderHand(s, options));
        handControls
          .querySelector<HTMLElement>("[aria-pressed='true']")
          ?.focus({ preventScroll: true });
      });
      handControls.append(control);
    });
  }
  section.append(element("h2", `${sailor.name}’s hand`, "hand-heading"));
  if (usesCrewDeck()) {
    const held = turn ? turn.hands[actor] : handPreview(state.deck, actor);
    const deck = element("div", "", "equipment-cards");
    const targets = element("div", "", "equipment-targets");
    for (const card of held ?? []) {
      const variants = actorOptions.filter(
        (move) => move.card && move.card === card.id,
      );
      const image = card.id ? equipmentImage(card.id, water) : undefined;
      const button = equipmentCard(
        card.name,
        variants[0]?.detail ?? (water ? card.water : card.raft),
        image,
      );
      const salvage =
        card.id === "tin"
          ? "locker"
          : card.id === "patch"
            ? "spar"
            : card.id === "wrap"
              ? "canvas"
              : undefined;
      if (salvage) {
        const art = element("span", "", "item equipment-salvage " + salvage);
        art.setAttribute("aria-hidden", "true");
        button.firstElementChild?.after(art);
      }
      if (variants.length) {
        drag.connect(
          button,
          () => {
            selectedCard?.button.setAttribute("aria-pressed", "false");
            targets.replaceChildren();
            selectedCard = { button, moves: variants, targets };
            button.setAttribute("aria-pressed", "true");
            trayNote.textContent = `${card.name} selected. Activate the tray to play it.`;
            trayNote.hidden = false;
            placeCard.disabled = false;
            tray.classList.add("ready");
          },
          playSelectedCard,
          () => placeCard.focus(),
        );
      } else {
        button.disabled = true;
        button.append(element("span", "Requires 1 ration", "card-lock"));
      }
      deck.append(button);
    }
    const hasPlayableCard = actorOptions.some((move) => move.card);
    trayNote.hidden = !hasPlayableCard;
    if (hasPlayableCard)
      trayNote.textContent =
        "Drag a card here, or select a card and then this tray.";
    section.append(targets, deck);
    const basic = element("details", "", "basic-actions");
    basic.append(
      element("summary", "Basic actions"),
      buttons(actorOptions.filter((move) => !move.card)),
    );
    section.append(basic);
  } else section.append(buttons(actorOptions));
  return section;
}

function boarding(s: Pick<Voyage, "crew">, choices: Move[]) {
  const list = element("div", "", "boarding");
  s.crew.forEach((sailor, i) => {
    const offered = turn?.volunteers.includes(i);
    const row = element("section", "", "boarding-sailor");
    row.append(element("h3", sailor.name + (offered ? " · Volunteered" : "")));
    const projected = sailor.cold + swimmerCold;
    const forecast = element("p", "", "exposure-preview");
    forecast.append(
      element("span", `${sailor.cold}/${coldLimit} cold now`),
      element(
        "strong",
        `${projected}/${coldLimit} cold after swimming`,
        projected >= coldLimit ? "exposure-warning" : "",
      ),
    );
    row.append(
      forecast,
      element(
        "p",
        `${sailor.food} ${sailor.food === 1 ? "ration" : "rations"} now · +${swimmerRation} after swimming`,
      ),
    );
    if (projected >= coldLimit)
      row.append(
        element(
          "p",
          "Needs help to stay below " + coldLimit + " cold.",
          "exposure-warning",
        ),
      );
    const cards = turn ? turn.hands[i] : handPreview(state.deck, i);
    for (const card of cards ?? []) {
      const item = element("details");
      const effects = element("dl", "", "card-effects");
      for (const [location, detail] of [
        ["In the water", card.water],
        ["On the raft", card.raft],
      ] as const) {
        const effect = element("div");
        effect.append(element("dt", location), element("dd", detail));
        effects.append(effect);
      }
      item.append(element("summary", card.name), effects);
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

function render(
  previous?: TableState & { channelMarked?: boolean | undefined },
  origin?: CardOrigin,
) {
  const s = turn ?? state;
  clearCardSelection();
  if (s.phase !== "cards") {
    activeSailor = undefined;
    handControls.hidden = true;
    handControls.replaceChildren();
  }
  select("heading").closest("main")?.setAttribute("data-phase", s.phase);
  const sighted = s.channelMarked !== undefined && s.tide >= 6;
  select("scene").hidden = !sighted;
  select("landing-rules").hidden = s.channelMarked === undefined;
  const localEvent = room ? null : currentEvent(state);
  const forecast = turn?.forecast ?? localEvent?.[1] ?? "";
  const phase = s.phase;
  const clue = select("forecast");
  clue.hidden = !forecast || (phase !== "cards" && phase !== "board");
  clue.textContent = forecast;
  select("deck-rules").hidden = !usesCrewDeck();
  const heads = {
    salvage: "What can you save?",
    board: "Who takes the line?",
    cards: turn?.forecastTitle ?? localEvent?.[0] ?? "Play the crew’s hand",
    event: turn?.event?.title ?? localEvent?.[0] ?? "",
    won: "Three souls ashore",
    lost: "Lost at sea",
  };
  const instructions = {
    salvage:
      "The ship is sinking. Take one salvage card for the crew before you board the raft.",
    board:
      "Choose one swimmer. They gain 2 cold and 1 ration at the end of the tide. Each sailor on the raft sheds 1 cold.",
    cards: "",
    event:
      (turn?.event?.description ?? localEvent?.[2] ?? "") +
      " Then apply cold, warmth, and the swimmer’s ration.",
    won: "All three sailors survived the seventh tide.",
    lost: s.log.at(-1) ?? "",
  };
  const numerals = ["", "I", "II", "III", "IV", "V", "VI", "VII"];
  select("step").textContent =
    phase === "salvage" ? "Prologue" : `Tide ${numerals[s.tide]} of VII`;
  select("heading").textContent = heads[phase];
  select("heading").classList.toggle(
    "event-arrival",
    previous?.phase === "cards" && phase === "event",
  );
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
        (turn.seat === 0
          ? " Choose a volunteer to swim, or assign anyone if nobody volunteers."
          : " You can volunteer your sailor. The host confirms who swims.") +
        " Sailors on the raft shed 1 cold at tide’s end.";
    select("instruction").append(
      " The preview shows the result before cards and events.",
    );
    choices.append(boarding(s, options));
  } else if (phase === "cards") {
    choices.append(renderHand(s, options));
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
    const row = element("tr");
    const identity = element("th", p.name);
    identity.scope = "row";
    const location =
      phase === "won"
        ? "Ashore"
        : s.swimmer === null
          ? jobs[i]
          : i === s.swimmer
            ? "In the water"
            : "On the raft";
    identity.append(element("small", location));
    row.append(
      identity,
      element("td", `${p.cold} / ${coldLimit}`),
      element("td", String(p.food)),
    );
    crew.append(row);
  });
  select("hull").textContent = `${s.hull} / ${maxHull}`;
  select("brace").textContent = String(
    phase === "cards" || phase === "event" ? s.guard : 0,
  );
  select("entries").replaceChildren(
    ...s.log.map((line) => element("li", line)),
  );
  renderTable(s, previous, origin);
  if (previous) {
    const result =
      s.tideResult?.tide !== previous.tideResult?.tide ? s.tideResult : null;
    if (
      (s.channelMarked && !previous.channelMarked) ||
      result?.route.kind === "channel"
    )
      playCue("channel");
    else if (result?.route.kind === "hull" && result.route.blocked > 0)
      playCue("brace");
    else if (previous.phase === "board" && phase === "cards") playCue("rope");
  }
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

soundToggle(select("sound-toggle"), select("sound-state"));

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
