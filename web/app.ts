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
import { equipmentArt } from "./equipment-art.ts";
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
  currentEvent,
  jobs,
  maxHull,
  coldLimit,
  swimmerCold,
  swimmerRation,
  type Voyage,
  type Move,
} from "@seventh-tide/rules";
import {
  channelScouts,
  finishBotTurns,
  playWithBots,
  seatMoves,
} from "@seventh-tide/rules/crew";
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
let showLobby = !room && run.history.length === 0;
let renderedHand: string | undefined;
const tray = select("personal-tray");
const trayButton = select("place-card");
if (!(trayButton instanceof HTMLButtonElement))
  throw new Error("Missing card control");
const placeCard = trayButton;
const trayNote = select("tray-note");
const trayHint = trayNote.textContent.trim();
const choiceArea = select("choices");
const table = select("raft-table");
const played = select("tide-plays");
const feedback = select("turn-feedback");
const roomPanel = select("room-panel");
const modePanel = select("mode-panel");
const shipLog = select("ship-log");
const startSolo = select("start-solo");
const openEntries = select("open-entries");
const openRules = select("open-rules");
const openInvites = select("open-invites");
const resume = element("button", "Resume voyage with friends", "resume-room");
resume.type = "button";
resume.hidden = true;
roomPanel.before(resume);
const drag = cardDrag(tray);
let selectedMove:
  | { button: HTMLButtonElement; moves: Move[]; targets: HTMLElement }
  | undefined;

function clearSelection() {
  drag.cancel();
  selectedMove?.button.setAttribute("aria-pressed", "false");
  selectedMove?.targets.replaceChildren();
  selectedMove = undefined;
  placeCard.disabled = true;
  tray.classList.remove("ready");
  trayNote.textContent = trayHint;
}

function playSelection() {
  if (!selectedMove || sending) return;
  const { button, moves: variants, targets } = selectedMove;
  const first = variants[0];
  if (!first) return;
  if (variants.length === 1) {
    act(first.id, button);
    return;
  }
  const options = element("div", "", "choices");
  for (const move of variants) {
    const name = move.name
      .split(" · ")
      .at(-1)
      ?.replace(/^Share with /, "");
    const target = element("button", name);
    target.type = "button";
    target.addEventListener("click", () => act(move.id, button));
    options.append(target);
  }
  placeCard.disabled = true;
  tray.classList.remove("ready");
  targets.replaceChildren(element("h3", "Choose a sailor"), options);
  options.querySelector("button")?.focus();
}

placeCard.addEventListener("click", playSelection);

function selectMove(
  button: HTMLButtonElement,
  name: string,
  moves: Move[],
  targets: HTMLElement,
) {
  selectedMove?.button.setAttribute("aria-pressed", "false");
  targets.replaceChildren();
  selectedMove = { button, moves, targets };
  button.setAttribute("aria-pressed", "true");
  trayNote.textContent = `${name} selected.`;
  placeCard.disabled = false;
  tray.classList.add("ready");
}

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
  if (joined) renderInvites(next);
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
  const volunteering = "offer" in action;
  sending = true;
  choiceArea.inert = !volunteering;
  select("crew-assist").inert = true;
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
    if (!volunteering) select("heading").focus();
  } catch (error) {
    if (error instanceof TurnConflict) await refreshRoom();
    showRoomError(error);
  } finally {
    choiceArea.inert = false;
    select("crew-assist").inert = false;
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
    showLobby = true;
    resume.hidden = !savedHostRoom();
  } else {
    const next = playWithBots(state, id, 1);
    state = next.state;
    run.history.push(...next.history);
  }
  saveRun();
  render(previous, origin);
  paintSea?.();
  select("heading").focus();
}

function saveRun() {
  try {
    localStorage.setItem(saveKey, JSON.stringify(run));
  } catch {
    /* Play continues in memory. */
  }
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
    const copy = element("span", "", "action-copy");
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

function renderHand(s: TableState, actor: number, actorOptions: Move[]) {
  const section = element("div", "", "voyage-hand");
  const sailor = s.crew[actor];
  if (!sailor || !actorOptions.length) return section;
  const water = actor === s.swimmer;
  if (usesCrewDeck()) {
    const held = turn ? turn.hands[actor] : handPreview(state.deck, actor);
    const deck = element("div", "", "equipment-cards");
    deck.setAttribute("role", "group");
    deck.setAttribute("aria-label", "Your cards");
    const targets = element("div", "", "equipment-targets");
    for (const card of held ?? []) {
      const variants = actorOptions.filter(
        (move) => move.card && move.card === card.id,
      );
      const button = equipmentCard(
        card.name,
        variants[0]?.detail ?? (water ? card.water : card.raft),
        equipmentArt(card.id, water),
      );
      if (variants.length) {
        drag.connect(
          button,
          () => selectMove(button, card.name, variants, targets),
          playSelection,
          () => placeCard.focus(),
        );
      } else {
        button.disabled = true;
        button.append(element("span", "Requires 1 ration", "card-lock"));
      }
      deck.append(button);
    }
    const actions = element("div", "", "hand-actions");
    actions.setAttribute("role", "group");
    actions.setAttribute("aria-label", "Moves that keep both cards");
    const shares: Move[] = [];
    for (const move of actorOptions) {
      if (move.card) continue;
      if (move.id.startsWith("feed-")) shares.push(move);
      else
        actions.append(actionChoice(move.name, move.detail, [move], targets));
    }
    if (shares.length)
      actions.append(
        actionChoice(
          "Share a ration",
          "Spend 1 ration. The chosen sailor sheds 2 cold.",
          shares,
          targets,
        ),
      );
    const canPlayCard = actorOptions.some((move) => move.card);
    section.append(
      targets,
      ...(canPlayCard ? [deck, actions] : [actions, deck]),
    );
  } else section.append(buttons(actorOptions));
  return section;
}

function actionChoice(
  name: string,
  detail: string,
  options: Move[],
  targets: HTMLElement,
) {
  const button = element("button", "", "action-slip");
  button.type = "button";
  button.setAttribute("aria-pressed", "false");
  button.append(element("strong", name), element("small", detail));
  button.addEventListener("click", () => {
    selectMove(button, name, options, targets);
    placeCard.focus();
  });
  return button;
}

function boarding(s: Pick<Voyage, "crew">) {
  const list = element("div", "", "boarding");
  const scouts = turn?.channelScouts ?? channelScouts(state);
  const mySeat = turn?.seat ?? 0;
  const players = turn?.players ?? 1;
  s.crew.forEach((sailor, i) => {
    const row = element("section", "", "boarding-sailor");
    const role = i === mySeat ? " · You" : i >= players ? " · Bot" : "";
    const name = element("h3", sailor.name + role);
    const offerMark = element("span", " · Volunteered", "volunteer-mark");
    offerMark.hidden = true;
    name.append(offerMark);
    row.append(name);
    if (scouts.includes(i))
      row.append(
        element(
          "p",
          "Can mark the channel with Sounding line.",
          "channel-mark",
        ),
      );
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
    const cards =
      i === mySeat ? (turn ? turn.hands[i] : handPreview(state.deck, i)) : [];
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
      const offer = element("button", "", "volunteer-swim");
      offer.type = "button";
      offer.addEventListener(
        "click",
        () =>
          void sendMove({ sailor: i, offer: !turn?.volunteers.includes(i) }),
      );
      row.append(offer);
    }
    if (mySeat === 0) {
      const confirm = element(
        "button",
        "Assign " + sailor.name + " to swim",
        "assign-swimmer",
      );
      confirm.type = "button";
      confirm.addEventListener("click", () => act("swim-" + i));
      row.append(confirm);
    }
    list.append(row);
  });
  return list;
}

function updateBoarding(list: HTMLElement, choices: Move[]) {
  Array.from(list.children).forEach((row, i) => {
    const offered = turn?.volunteers.includes(i) ?? false;
    const mark = row.querySelector<HTMLElement>(".volunteer-mark");
    if (mark) mark.hidden = !offered;
    const canAssign = choices.some(({ id }) => id === "swim-" + i);
    const offer = row.querySelector<HTMLButtonElement>(".volunteer-swim");
    const label = offered ? "Withdraw offer" : "Volunteer to swim";
    if (offer) {
      offer.hidden = canAssign && !offered;
      if (offer.textContent !== label) offer.textContent = label;
    }
    const assign = row.querySelector<HTMLButtonElement>(".assign-swimmer");
    if (assign) assign.hidden = !canAssign;
  });
}

function showPlayMode() {
  modePanel.hidden = !showLobby;
  shipLog.hidden = showLobby;
  choiceArea.hidden = showLobby;
  const ready = !showLobby && (!room || Boolean(turn));
  openEntries.hidden = !ready;
  openRules.hidden = !ready;
  openInvites.hidden =
    !turn?.invites.length || turn.phase === "won" || turn.phase === "lost";
}

function renderAssists(s: TableState, players: number) {
  const panel = select("crew-assist");
  const sailors = turn?.assistSeats ?? [];
  const waitingFriend = sailors.some((i) => i < players);
  panel.hidden = sailors.length === 0;
  if (panel.hidden) panel.removeAttribute("open");
  else if (!waitingFriend) panel.setAttribute("open", "");
  select("assist-label").textContent = waitingFriend
    ? "Help a waiting sailor"
    : "Continue with bots";
  select("assist-help").hidden = !waitingFriend;
  select("assist-actions").replaceChildren(
    ...sailors.map((i) => {
      const name = s.crew[i]?.name ?? "";
      const button = element(
        "button",
        i < players ? `Let a bot play for ${name}` : `Let ${name} play`,
      );
      button.type = "button";
      button.addEventListener(
        "click",
        () => void sendMove({ assistSailor: i }),
      );
      return button;
    }),
  );
}

function render(
  previous?: TableState & { channelMarked?: boolean | undefined },
  origin?: CardOrigin,
) {
  const s = turn ?? state;
  const seat = turn?.seat ?? 0;
  const players = turn?.players ?? 1;
  const options = turn?.choices ?? seatMoves(state, seat, players);
  const hand =
    s.phase === "cards" ? JSON.stringify([s.tide, options]) : undefined;
  const keepHand = hand !== undefined && hand === renderedHand;
  const keepBoard =
    previous?.phase === "board" &&
    s.phase === "board" &&
    previous.tide === s.tide;
  renderedHand = hand;
  if (!keepHand && !keepBoard) {
    clearSelection();
    choiceArea.replaceChildren();
  }
  showPlayMode();
  select("heading")
    .closest("main")
    ?.toggleAttribute("data-table", s.phase !== "won" && s.phase !== "lost");
  tray.hidden = s.phase !== "cards" || !options.length || !usesCrewDeck();
  table.toggleAttribute("data-hand", !tray.hidden);
  table.toggleAttribute("data-boarding", s.phase === "board");
  if (!tray.hidden && played.previousElementSibling !== choiceArea)
    choiceArea.after(played);
  else if (tray.hidden && played.nextElementSibling !== feedback)
    feedback.before(played);
  if (!keepHand && !tray.hidden && !options.some((move) => move.card))
    trayNote.textContent = "Choose a move below, then use this tray.";
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
      (turn?.event?.description ?? localEvent?.[2] ?? "") + " Choose a route.",
    won: "All three sailors survived the seventh tide.",
    lost: s.log.at(-1) ?? "",
  };
  const numerals = ["", "I", "II", "III", "IV", "V", "VI", "VII"];
  select("step").textContent = showLobby
    ? ""
    : phase === "salvage"
      ? "Prologue"
      : `Tide ${numerals[s.tide]} of VII`;
  select("heading").textContent = showLobby ? "Choose your crew" : heads[phase];
  select("heading").classList.toggle(
    "event-arrival",
    previous?.phase === "cards" && phase === "event",
  );
  let instruction = showLobby
    ? "Guide three sailors through seven tides."
    : instructions[phase];
  if (turn && !options.length && (phase === "salvage" || phase === "event")) {
    instruction =
      phase === "salvage"
        ? "Waiting for the host to choose salvage."
        : `${turn.event?.description ?? ""} Waiting for ${s.crew[0]?.name ?? "the host"} to choose a route.`;
    if (turn.event) {
      const routes = element("ul", "", "route-preview");
      for (const route of turn.event.routes) {
        const row = element("li");
        row.append(element("strong", route.name), element("p", route.detail));
        routes.append(row);
      }
      choiceArea.append(routes);
    }
  }
  let turnText = "";
  if (phase === "cards") {
    const waiting = s.crew
      .filter((_, i) => i < players && i !== seat && !s.acted.includes(i))
      .map((p) => p.name);
    if (options.length) turnText = tray.hidden ? "Your move." : "";
    else
      turnText = waiting.length
        ? `Your turn is complete. Waiting for ${new Intl.ListFormat("en").format(waiting)}.`
        : "The bots can take their turns.";
  }
  if (feedback.textContent !== turnText) feedback.textContent = turnText;
  if (phase === "board") {
    if (turn) {
      if (seat === 0)
        instruction = turn.volunteers.length
          ? players < s.crew.length
            ? "Choose a volunteer or a bot to swim."
            : "Choose a volunteer to swim."
          : "Choose who swims. Your friends can volunteer.";
      else
        instruction = turn.volunteers.includes(seat)
          ? "You volunteered. The host confirms who swims."
          : "You can volunteer to swim. The host makes the final choice.";
    }
    const list =
      choiceArea.querySelector<HTMLElement>(".boarding") ?? boarding(s);
    updateBoarding(list, options);
    if (!list.isConnected) choiceArea.append(list);
  } else if (phase === "cards") {
    if (!keepHand) choiceArea.append(renderHand(s, seat, options));
  } else if (options.length) choiceArea.append(buttons(options));
  else if (phase === "won" || phase === "lost") {
    if (room) {
      const link = element("a", "Return to Seventh Tide", "crew-return");
      link.href = location.pathname;
      choiceArea.append(link);
    } else {
      const restart = element("button", "Choose your crew", "crew-return");
      restart.type = "button";
      restart.addEventListener("click", () => act("again"));
      choiceArea.append(restart);
    }
  }
  const prompt = select("instruction");
  if (prompt.textContent !== instruction) prompt.textContent = instruction;
  const crew = select("crew");
  crew.replaceChildren();
  s.crew.forEach((p, i) => {
    const row = element("tr");
    const role = i === seat ? " · You" : i >= players ? " · Bot" : "";
    const identity = element("th", p.name + role);
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
  const entries = select("entries");
  if (entries.childElementCount !== s.log.length)
    entries.replaceChildren(...s.log.map((line) => element("li", line)));
  select("empty-entries").hidden = s.log.length > 0;
  renderTable(s, { seat, players }, previous, origin);
  renderAssists(s, players);
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
function renderInvites(snapshot: RoomSnapshot) {
  const links = select("invite-links");
  const status = select("invite-status");
  snapshot.invites.forEach((token, i) => {
    const name = snapshot.crew[i + 1]?.name;
    const label = element("label", name + "’s invite link");
    const field = element("input");
    field.readOnly = true;
    field.value = roomUrl({ id: snapshot.id, token });
    field.addEventListener("focus", () => field.select());
    label.append(field);
    const copy = element("button", "Copy " + name + "’s link");
    copy.type = "button";
    copy.addEventListener("click", () => {
      field.focus();
      field.select();
      if (!navigator.clipboard) {
        status.textContent = "Copy the selected invite link.";
        return;
      }
      void navigator.clipboard.writeText(field.value).then(
        () => {
          status.textContent = "Invite link copied.";
        },
        () => {
          status.textContent = "Copy the selected invite link.";
        },
      );
    });
    links.append(label, copy);
  });
}

for (const [button, id] of [
  [openEntries, "voyage-entries"],
  [openRules, "voyage-rules"],
  [openInvites, "crew-invites"],
] as const) {
  const dialog = select(id);
  if (!(dialog instanceof HTMLDialogElement))
    throw new Error("Missing voyage dialog: " + id);
  button.addEventListener("click", () => dialog.showModal());
}

soundToggle(select("sound-toggle"), select("sound-state"));

if (room) {
  window.addEventListener("hashchange", () => {
    if (/^#[\w-]{43}$/.test(location.hash)) location.reload();
  });
  showPlayMode();
  select("heading").textContent = "Joining the crew";
  void refreshRoom();
  window.setInterval(() => void refreshRoom(), 2500);
  document.addEventListener("visibilitychange", () => void refreshRoom());
} else {
  const restored = finishBotTurns(state, 1);
  if (restored.history.length) {
    state = restored.state;
    run.history.push(...restored.history);
    saveRun();
  }
  resume.hidden = !savedHostRoom();
  startSolo.addEventListener("click", () => {
    showLobby = false;
    render();
    select("heading").focus();
  });
  resume.addEventListener("click", () => {
    const previous = savedHostRoom();
    if (previous) location.assign(roomUrl(previous));
    else resume.hidden = true;
  });
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
