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
import type { CrewSignal } from "../shared/crew-signals.ts";
import { crewSignalStation } from "./crew-signals.ts";
import { parseSavedRun, type SavedRun } from "./saved-run.ts";
import { deckTool, equipmentArt } from "./equipment-art.ts";
import { element, select } from "./dom.ts";
import { renderTable, type CardOrigin, type TableState } from "./table.ts";
import { playCue, soundToggle } from "./sound.ts";
import { cardDrag, cardFace, equipmentCard } from "./cards.ts";
import {
  start,
  rulesVersion,
  bellBuoy,
  secondWake,
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
function wakeIn(voyage: Voyage | RoomSnapshot) {
  return "events" in voyage ? secondWake(voyage) : voyage.wake;
}

function buoyIn(voyage: Voyage | RoomSnapshot) {
  return "events" in voyage ? bellBuoy(voyage) : voyage.buoy;
}

function landingAt({ tide, channelMarked }: Voyage | RoomSnapshot) {
  if (channelMarked === undefined || tide < 6) return undefined;
  return tide === 6 ? "approach" : "reef";
}
const roomId = new URLSearchParams(location.search).get("room");
const room = roomId ? readRoom(roomId) : null;
let turn: RoomSnapshot | undefined;
let sending = false;
let signaling = false;
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
const deckSide = select("deck-side");
const assist = select("crew-assist");
let deferredCover = "";
const roomPanel = select("room-panel");
const modePanel = select("mode-panel");
const crewLobby = select("crew-lobby");
const launchButton = select("launch-voyage");
const inviteFields: HTMLInputElement[] = [];
const shipLog = select("ship-log");
const compactLog = select("compact-log");
const startSolo = select("start-solo");
const openEntries = select("open-entries");
const openRules = select("open-rules");
const openInvites = select("open-invites");
const resume = element("button", "Resume voyage with friends", "resume-room");
resume.type = "button";
resume.hidden = true;
roomPanel.before(resume);
const drag = cardDrag(tray);
const renderSignals = crewSignalStation(sendSignal);
compactLog.addEventListener("click", () =>
  setLogOpen(!shipLog.hasAttribute("data-open")),
);
shipLog.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && shipLog.hasAttribute("data-open")) {
    setLogOpen(false);
    compactLog.focus({ preventScroll: true });
  }
});
let selectedMove:
  | { button: HTMLButtonElement; moves: Move[]; targets: HTMLElement }
  | undefined;
let selectedTool:
  { button: HTMLButtonElement; commit: HTMLElement } | undefined;

function setLogOpen(open: boolean) {
  shipLog.toggleAttribute("data-open", open);
  compactLog.setAttribute("aria-expanded", String(open));
}

function clearSelection() {
  drag.cancel();
  clearTool();
  selectedMove?.button.setAttribute("aria-pressed", "false");
  selectedMove?.targets.replaceChildren();
  selectedMove = undefined;
  placeCard.disabled = true;
  tray.classList.remove("ready");
  trayNote.textContent = trayHint;
}

function clearTool() {
  if (!selectedTool) return;
  selectedTool.button.setAttribute("aria-pressed", "false");
  selectedTool.commit.hidden = true;
  selectedTool.commit.replaceChildren();
  selectedTool = undefined;
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
  const options = element("div", "", "ration-crew");
  for (const move of variants) {
    const name = move.name
      .split(" · ")
      .at(-1)
      ?.replace(/^Share with /, "");
    const target = element("button", name);
    target.type = "button";
    const seat = (turn ?? state).crew.findIndex(
      (sailor) => sailor.name === name,
    );
    if (seat >= 0) target.prepend(crewPortrait(seat));
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
  clearTool();
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
        (next.offerRevision < turn.offerRevision ||
          (next.offerRevision === turn.offerRevision &&
            next.crewRevision <= turn.crewRevision))))
  )
    return;
  const previous = turn;
  const joined = !previous;
  turn = next;
  if (joined) renderInvites(next);
  const finished = next.phase === "won" || next.phase === "lost";
  if (room && next.seat === 0 && (joined || finished))
    storeHostRoom(room, finished);
  if (
    previous?.crewLaunched &&
    next.crewLaunched &&
    next.revision === previous.revision &&
    next.offerRevision === previous.offerRevision
  ) {
    renderSignals(next, next.seat, next.players, true, next.signals);
    return;
  }
  render(previous, origin);
  if (previous && !previous.crewLaunched && next.crewLaunched)
    select("heading").focus();
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
    const next = await readTurn(room, turn ? undefined : "seat");
    if (
      !turn ||
      next.revision > turn.revision ||
      next.crewRevision > turn.crewRevision ||
      connectionFailed
    )
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

async function sendSignal(signal: CrewSignal) {
  if (!room || turn?.phase !== "cards" || signaling) return false;
  const status = select("signal-status");
  signaling = true;
  status.textContent = "";
  try {
    const selected = signal === turn.signals[turn.seat] ? null : signal;
    setTurn(await readTurn(room, { tide: turn.tide, signal: selected }));
    return true;
  } catch (error) {
    if (error instanceof TurnConflict) await refreshRoom();
    status.textContent =
      error instanceof Error ? error.message : "Could not send the signal.";
    return false;
  } finally {
    signaling = false;
  }
}

async function sendMove(action: RoomAction, origin?: CardOrigin) {
  if (!room || !turn || sending) return;
  const volunteering = "offer" in action;
  sending = true;
  choiceArea.inert = !volunteering;
  assist.inert = true;
  deckSide.inert = true;
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
    assist.inert = false;
    deckSide.inert = false;
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
  const targets = element("div", "", "equipment-targets");
  function connectCard(
    button: HTMLButtonElement,
    name: string,
    variants: Move[],
  ) {
    drag.connect(
      button,
      () => selectMove(button, name, variants, targets),
      playSelection,
      (event) => {
        if (event.detail === 0) placeCard.focus();
      },
    );
  }
  if (usesCrewDeck()) {
    const held = turn ? turn.hands[actor] : handPreview(state.deck, actor);
    const deck = element("div", "", "equipment-cards");
    deck.setAttribute("role", "group");
    deck.setAttribute("aria-label", "Your cards");
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
        connectCard(button, card.name, variants);
      } else {
        button.disabled = true;
        button.append(element("span", "Requires 1 ration", "card-lock"));
      }
      deck.append(button);
    }
    const actions = crewActions(
      actorOptions.filter((move) => !move.card),
      s.crew,
    );
    if (actions) deckSide.prepend(actions);
    section.append(targets, deck);
  } else {
    const cards = element("div", "", "action-hand");
    cards.setAttribute("role", "group");
    cards.setAttribute("aria-label", "Your crew action cards");
    const shares = actorOptions.filter(({ id }) => id.startsWith("feed-"));
    for (const move of actorOptions) {
      const share = move.id.startsWith("feed-");
      if (share && move !== shares[0]) continue;
      const name = share && shares.length > 1 ? "Share a ration" : move.name;
      const face = cardFace("button", name, deckTool(move.id));
      face.type = "button";
      face.setAttribute("aria-pressed", "false");
      face.append(
        element(
          "span",
          share ? "Spend 1 ration. One sailor sheds 2 cold." : move.detail,
          "effect",
        ),
      );
      connectCard(face, name, share ? shares : [move]);
      cards.append(face);
    }
    section.append(targets, cards);
  }
  return section;
}

function crewActions(options: Move[], crew: Voyage["crew"]) {
  if (!options.length) return undefined;
  const rail = element("section", "", "crew-actions");
  rail.setAttribute("aria-label", "Crew actions");
  const tools = element("div", "", "crew-tools");
  const commit = element("div", "", "crew-commit");
  commit.hidden = true;
  const rations = options.filter(({ id }) => id.startsWith("feed-"));
  for (const move of options)
    if (!move.id.startsWith("feed-"))
      tools.append(actionChoice(move.name, move.detail, [move], commit, crew));
  if (rations.length)
    tools.append(
      actionChoice(
        "Share a ration",
        "Remove 2 cold. Spend 1 ration.",
        rations,
        commit,
        crew,
      ),
    );
  rail.append(
    element("h2", "Crew actions"),
    element("p", "Use your turn. Keep both cards."),
    tools,
    commit,
  );
  rail.addEventListener("keydown", (event) => {
    if (event.key !== "Escape" || selectedTool?.commit !== commit) return;
    const { button } = selectedTool;
    clearTool();
    button.focus({ preventScroll: true });
  });
  return rail;
}

function actionChoice(
  name: string,
  detail: string,
  options: Move[],
  commit: HTMLElement,
  crew: Voyage["crew"],
) {
  const [effect, cost = ""] = detail.split(/(?<=\.)\s+/);
  const button = element("button", "", "crew-tool");
  button.type = "button";
  button.setAttribute("aria-pressed", "false");
  const art = deckTool(options[0]?.id ?? "");
  if (art) button.append(art);
  const copy = element("span", "", "crew-tool-copy");
  copy.append(
    element("strong", name),
    element("span", effect),
    element(
      "small",
      cost.replace(/^The trailing line strains the raft for /, "Lose "),
    ),
  );
  button.append(copy);
  button.addEventListener("click", (event) => {
    const alreadySelected = selectedTool?.button === button;
    clearSelection();
    if (alreadySelected) return;
    selectedTool = { button, commit };
    button.setAttribute("aria-pressed", "true");
    const sharing = options[0]?.id.startsWith("feed-");
    const actions = element(
      "div",
      "",
      sharing ? "ration-crew" : "crew-commit-actions",
    );
    for (const move of options) {
      const target = sharing ? Number(move.id.split("-")[2]) : -1;
      const sailor = crew[target];
      const action = element("button");
      action.type = "button";
      if (sailor) {
        action.setAttribute("aria-label", "Give one ration to " + sailor.name);
        action.append(crewPortrait(target), element("strong", sailor.name));
      } else action.textContent = name;
      action.addEventListener("click", () => act(move.id, action));
      actions.append(action);
    }
    commit.append(
      element("p", sharing ? "Who gets the ration?" : "Use your turn?"),
      actions,
    );
    commit.hidden = false;
    if (event.detail === 0) actions.querySelector("button")?.focus();
    if (commit.getBoundingClientRect().bottom > innerHeight)
      commit.scrollIntoView({ block: "nearest" });
  });
  return button;
}

type TideRoute = Pick<Move, "name" | "detail"> & { id?: string };

function routeChart(routes: readonly TideRoute[], canChoose: boolean) {
  const chart = element("section", "", "route-chart");
  chart.setAttribute("aria-label", "Tide routes");
  const stops = element("ul", "", "chart-stops");
  for (const route of routes) {
    const { id } = route;
    const row = element("li");
    const stop = id && canChoose ? element("button") : element("div");
    stop.className = "chart-stop";
    stop.append(element("strong", route.name), element("span", route.detail));
    if (stop instanceof HTMLButtonElement && id) {
      stop.type = "button";
      stop.addEventListener("click", () => act(id));
    }
    row.append(stop);
    stops.append(row);
  }
  chart.append(element("div", "", "chart-engraving"), stops);
  return chart;
}

function encounterDecision(
  routes: readonly TideRoute[],
  canChoose: boolean,
  encounter: "wake" | "buoy" | "reef",
) {
  const scene = element("section", "", "encounter-decision");
  scene.dataset.encounter = encounter;
  scene.setAttribute(
    "aria-label",
    {
      wake: "Respond to the second wake",
      buoy: "Respond to the bell buoy",
      reef: "Choose the landing route",
    }[encounter],
  );
  for (const { id, name, detail } of routes) {
    const choice = canChoose && id ? element("button") : element("div");
    choice.className = "encounter-response";
    if (id === "channel") choice.setAttribute("data-marked", "");
    const card =
      encounter === "reef"
        ? id === "channel"
          ? "lantern"
          : id === "hull"
            ? "hatch"
            : "line"
        : encounter === "buoy"
          ? id === "chain"
            ? "bell"
            : "hatch"
          : id === "decoy"
            ? "bell"
            : "line";
    const art = equipmentArt(card, id === "dive" || id === "chain");
    if (art) choice.append(art);
    choice.append(element("strong", name), element("span", detail));
    if (choice instanceof HTMLButtonElement && id) {
      choice.type = "button";
      choice.addEventListener("click", () => act(id));
    }
    scene.append(choice);
  }
  return scene;
}

function buoyCadence(buoy: NonNullable<ReturnType<typeof bellBuoy>>) {
  const clue = element("ol", "", "buoy-cadence");
  clue.setAttribute("aria-label", "The order of the sounds");
  const knocks = element("li", "Two chain knocks", "chain-knocks");
  const bell = element("li", "Bell rings", "buoy-ring");
  clue.append(...(buoy === "chain" ? [knocks, bell] : [bell, knocks]));
  return clue;
}

function crewPortrait(seat: number) {
  const portrait = element("span", "", "crew-portrait");
  portrait.dataset.sailor = String(seat);
  portrait.setAttribute("aria-hidden", "true");
  return portrait;
}

function boarding(s: Pick<Voyage, "crew">) {
  const board = element("section", "", "boarding");
  board.setAttribute("aria-label", "Pass the swimmer’s line");
  const crew = element("div", "", "boarding-crew");
  const scouts = turn?.channelScouts ?? channelScouts(state);
  const mySeat = turn?.seat ?? 0;
  const players = turn?.players ?? 1;
  s.crew.forEach((sailor, i) => {
    const seat = element("section", "", "boarding-seat");
    const role = [jobs[i], i === mySeat ? "You" : i >= players ? "Bot" : ""]
      .filter(Boolean)
      .join(" · ");
    const offered = element("span", "Volunteered", "volunteer-mark");
    offered.hidden = true;
    const projected = sailor.cold + swimmerCold;
    const cold = element("p", "", "boarding-cold");
    const reading = element(
      "span",
      `${sailor.cold} → ${projected}/${coldLimit}`,
    );
    reading.setAttribute("aria-hidden", "true");
    cold.append(
      element("span", "Cold", "cold-label"),
      reading,
      element(
        "span",
        `${sailor.cold} of ${coldLimit} cold now. ${projected} of ${coldLimit} after exposure.`,
        "signal-announcement",
      ),
    );
    seat.append(
      crewPortrait(i),
      element("h3", sailor.name),
      element("p", role, "boarding-role"),
      cold,
      offered,
    );
    if (projected >= coldLimit)
      seat.append(element("p", "Needs warmth", "exposure-warning"));
    if (scouts.includes(i))
      seat.append(element("p", "Can mark channel", "channel-mark"));

    const controls = element("div", "", "boarding-controls");
    if (mySeat === 0) {
      const assign = element("button", "Send " + sailor.name, "assign-swimmer");
      assign.type = "button";
      assign.setAttribute("aria-label", "Send " + sailor.name + " swimming");
      assign.addEventListener("click", () => act("swim-" + i));
      controls.append(assign);
    }
    if (turn?.offerSeats.includes(i)) {
      const offer = element("button", "", "volunteer-swim");
      offer.type = "button";
      offer.addEventListener(
        "click",
        () =>
          void sendMove({ sailor: i, offer: !turn?.volunteers.includes(i) }),
      );
      controls.append(offer);
    }
    seat.append(controls);
    crew.append(seat);
  });

  board.append(
    element(
      "p",
      `The swimmer takes ${swimmerCold} cold and recovers ${swimmerRation} ration.`,
      "boarding-scale",
    ),
    crew,
  );
  const cards = turn ? turn.hands[mySeat] : handPreview(state.deck, mySeat);
  if (cards?.length) {
    const equipment = element("section", "", "boarding-equipment");
    equipment.setAttribute("aria-label", "Your hand");
    const faces = element("div", "", "boarding-equipment-faces");
    for (const card of cards) {
      const face = cardFace("div", card.name, equipmentArt(card.id, false));
      const effects = element("dl");
      for (const [location, detail] of [
        ["On the raft", card.raft],
        ["In the water", card.water],
      ] as const) {
        const effect = element("div");
        effect.append(element("dt", location), element("dd", detail));
        effects.append(effect);
      }
      face.append(effects);
      faces.append(face);
    }
    equipment.append(element("h2", "Your hand"), faces);
    board.append(equipment);
  }
  return board;
}

function updateBoarding(board: HTMLElement, choices: Move[]) {
  board.querySelectorAll(".boarding-seat").forEach((seat, i) => {
    const offered = turn?.volunteers.includes(i) ?? false;
    const mark = seat.querySelector<HTMLElement>(".volunteer-mark");
    if (mark) mark.hidden = !offered;
    const canAssign = choices.some(({ id }) => id === "swim-" + i);
    const offer = seat.querySelector<HTMLButtonElement>(".volunteer-swim");
    const label = offered ? "Withdraw offer" : "Volunteer";
    if (offer) {
      offer.hidden = canAssign && !offered;
      if (offer.textContent !== label) offer.textContent = label;
    }
    const assign = seat.querySelector<HTMLButtonElement>(".assign-swimmer");
    if (assign) assign.hidden = !canAssign;
  });
}

function showPlayMode() {
  modePanel.hidden = !showLobby;
  const ready = !showLobby && (!room || Boolean(turn?.crewLaunched));
  shipLog.hidden = !ready;
  choiceArea.hidden = !ready;
  crewLobby.hidden = !turn || turn.crewLaunched;
  openEntries.hidden = !ready;
  openRules.hidden = !ready;
  openInvites.hidden =
    !ready ||
    !turn?.invites.length ||
    turn.phase === "won" ||
    turn.phase === "lost";
}

function renderAssists(
  s: Voyage | RoomSnapshot,
  players: number,
  status: string,
) {
  const sailors = s.acted.includes(0) ? (turn?.assistSeats ?? []) : [];
  const key = sailors.length
    ? `${turn?.id}:${s.tide}:${sailors.join(",")}`
    : "";
  const deferred = key !== "" && deferredCover === key;
  const view = deferred ? key + ":waiting" : key;
  const message = key && !deferred ? "" : status;
  if (feedback.textContent !== message) feedback.textContent = message;
  assist.hidden = !key;
  if (assist.dataset.view === view) return;
  assist.dataset.view = view;
  assist.toggleAttribute("data-waiting", deferred);
  assist.replaceChildren();
  if (!key) return;

  const waiting = sailors.filter((i) => i < players);
  const controls = element("div", "", "waiting-controls");
  if (deferred) {
    const reopen = element("button", "Let a bot take a turn?");
    reopen.type = "button";
    reopen.addEventListener("click", () => {
      deferredCover = "";
      renderAssists(s, players, status);
      assist.querySelector("button")?.focus();
    });
    controls.append(reopen);
  } else {
    const sailor =
      waiting.length === 1 ? s.crew[waiting[0] ?? -1]?.name : undefined;
    const question = sailor
      ? `Let a bot play for ${sailor} this tide?`
      : waiting.length
        ? "Should a bot cover a crewmate this tide?"
        : "Let the bots finish the tide?";
    const heading = element("h2", question);
    heading.setAttribute("role", "status");
    assist.append(heading);
    if (waiting.length) {
      const wait = element("button", "Keep waiting");
      wait.type = "button";
      wait.addEventListener("click", () => {
        deferredCover = key;
        renderAssists(s, players, status);
        assist.querySelector("button")?.focus();
      });
      controls.append(wait);
    }
    for (const i of sailors) {
      const name = s.crew[i]?.name ?? "";
      const cover = element(
        "button",
        i < players ? `Cover ${name} this turn` : `Let ${name} play`,
      );
      cover.type = "button";
      cover.addEventListener("click", () => void sendMove({ assistSailor: i }));
      controls.append(cover);
    }
  }
  assist.append(controls);
}

function render(previous?: Voyage | RoomSnapshot, origin?: CardOrigin) {
  showPlayMode();
  if (turn && !turn.crewLaunched) {
    renderCrewLobby(turn);
    return;
  }
  const s = turn ?? state;
  const wake = wakeIn(s);
  const buoy = buoyIn(s);
  const landing = landingAt(s);
  const phase = s.phase;
  const phaseRope = select("phase-rope");
  phaseRope.hidden = showLobby;
  const current = phase === "won" || phase === "lost" ? "end" : phase;
  for (const knot of phaseRope.children) {
    if (!(knot instanceof HTMLElement)) continue;
    const step = knot.dataset.phase;
    knot.hidden = (step === "end" || step === "salvage") && step !== current;
    if (step === current) knot.setAttribute("aria-current", "step");
    else knot.removeAttribute("aria-current");
  }
  select("voyage-closeout").hidden = phase !== "won" && phase !== "lost";
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
    deckSide.querySelector(".crew-actions")?.remove();
    choiceArea.replaceChildren();
  }
  select("heading")
    .closest("main")
    ?.toggleAttribute("data-table", s.phase !== "won" && s.phase !== "lost");
  const showHand = s.phase === "cards" && options.length > 0;
  tray.hidden =
    !showHand || (usesCrewDeck() && !options.some(({ card }) => card));
  table.toggleAttribute("data-hand", showHand && usesCrewDeck());
  table.toggleAttribute("data-boarding", s.phase === "board");
  deckSide.hidden = !showHand || !usesCrewDeck();
  if (!deckSide.hidden && played.parentElement !== deckSide)
    deckSide.append(played);
  else if (deckSide.hidden && played.previousElementSibling !== assist)
    assist.after(played);
  const seeLights = landing && !(phase === "event" && (wake || buoy));
  const seaWake = seeLights ? undefined : wake;
  const seaBuoy = seeLights ? undefined : buoy;
  const encounter =
    landing === "reef" ? "reef" : buoy ? "buoy" : wake ? "wake" : undefined;
  const scene = select("scene");
  scene.hidden = !seeLights && !seaWake && !seaBuoy;
  scene.dataset.wake = seaWake ?? "";
  scene.dataset.buoy = seaBuoy ?? "";
  scene.dataset.landing = seeLights ? landing : "";
  scene.dataset.landfall = phase === "won" || phase === "lost" ? phase : "";
  scene.toggleAttribute(
    "data-channel-marked",
    Boolean(seeLights && s.channelMarked),
  );
  scene.toggleAttribute("data-reveal", Boolean(seaWake && phase === "event"));
  select("approach-art").hidden = !(seeLights && landing === "approach");
  select("landing-art").hidden = !(seeLights && landing === "reef");
  select("wake-art").hidden = !seaWake;
  select("buoy-art").hidden = !seaBuoy;
  table.toggleAttribute("data-routes", phase === "event");
  table.toggleAttribute(
    "data-encounter",
    Boolean(encounter && phase === "event"),
  );
  select("landing-rules").hidden = s.channelMarked === undefined;
  select("wake-rules").hidden = (s.rulesVersion ?? 1) < 6;
  select("buoy-rules").hidden = (s.rulesVersion ?? 1) < 7;
  const localEvent = room ? null : currentEvent(state);
  const eventDescription = turn?.event?.description ?? localEvent?.[2] ?? "";
  const choosingRoute = phase === "event";
  const forecast = choosingRoute
    ? eventDescription
    : (turn?.forecast ?? localEvent?.[1] ?? "");
  const logAtTable = phase === "cards" || phase === "event";
  shipLog.toggleAttribute("data-compact", logAtTable);
  if (!logAtTable || (previous && previous.tide !== s.tide)) setLogOpen(false);
  const clue = select("forecast");
  clue.hidden =
    !forecast || (!choosingRoute && phase !== "cards" && phase !== "board");
  if (clue.textContent !== forecast) clue.textContent = forecast;
  select("deck-rules").hidden = !usesCrewDeck();
  const heads = {
    salvage: "What can you save?",
    board: "Who will swim?",
    cards: turn?.forecastTitle ?? localEvent?.[0] ?? "Play the crew’s hand",
    event: turn?.event?.title ?? localEvent?.[0] ?? "",
    won: "Three souls ashore",
    lost: "Lost at sea",
  };
  const instructions = {
    salvage:
      "The ship is sinking. Take one salvage card for the crew before you board the raft.",
    board: "",
    cards: "",
    event: encounter ? "" : "Choose a route.",
    won:
      landing === "reef" ? "" : "All three sailors survived the seventh tide.",
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
        ? `You’re ${s.crew[seat]?.name}. Waiting for the host to choose salvage.`
        : `Waiting for ${s.crew[0]?.name ?? "the host"} to choose a route.`;
  }
  let turnText = "";
  if (phase === "cards") {
    const waiting = s.crew
      .filter((_, i) => i < players && i !== seat && !s.acted.includes(i))
      .map((p) => p.name);
    if (options.length) turnText = tray.hidden ? "Your move." : "";
    else {
      const done =
        turn?.assistedTide === s.tide ? "" : "Your turn is complete. ";
      turnText =
        done +
        (waiting.length
          ? `Waiting for ${new Intl.ListFormat("en").format(waiting)}.`
          : "The bots can take their turns.");
    }
  }
  const assisted = turn?.assistedTide;
  const notice = select("seat-notice");
  const noticeText =
    assisted === s.tide
      ? phase === "won" || phase === "lost"
        ? "A bot played your move on the last tide."
        : "A bot played your move this tide. You can play again next tide."
      : assisted === s.tide - 1 &&
          (phase === "board" || (phase === "cards" && !s.acted.includes(seat)))
        ? `A bot played for you on tide ${assisted}. You can take your next turn.`
        : "";
  if (notice.textContent !== noticeText) notice.textContent = noticeText;
  if (phase === "board") {
    if (turn) {
      if (seat === 0)
        instruction = turn.volunteers.length
          ? players < s.crew.length
            ? "Choose a volunteer or a bot to swim."
            : "Choose a volunteer to swim."
          : "Your friends can volunteer.";
      else
        instruction = turn.volunteers.includes(seat)
          ? "You volunteered. The host confirms who swims."
          : "You can volunteer. The host passes the line.";
    }
    const list =
      choiceArea.querySelector<HTMLElement>(".boarding") ?? boarding(s);
    updateBoarding(list, options);
    if (!list.isConnected) choiceArea.append(list);
  } else if (phase === "cards") {
    if (!keepHand) choiceArea.append(renderHand(s, seat, options));
  } else if (phase === "event") {
    const routes = options.length ? options : (turn?.event?.routes ?? []);
    if (buoy) choiceArea.append(buoyCadence(buoy));
    choiceArea.append(
      encounter
        ? encounterDecision(routes, options.length > 0, encounter)
        : routeChart(routes, options.length > 0),
    );
  } else if (options.length) choiceArea.append(buttons(options));
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
    identity.append(
      element("small", location),
      element("span", "", "crew-signal-label"),
    );
    row.append(
      identity,
      element("td", `${p.cold} / ${coldLimit}`),
      element("td", String(p.food)),
    );
    crew.append(row);
  });
  renderSignals(s, seat, players, Boolean(turn), turn?.signals ?? []);
  select("hull").textContent = `${s.hull} / ${maxHull}`;
  select("brace").textContent = String(
    phase === "cards" || phase === "event" ? s.guard : 0,
  );
  const entries = select("entries");
  if (entries.childElementCount !== s.log.length)
    entries.replaceChildren(...s.log.map((line) => element("li", line)));
  select("empty-entries").hidden = s.log.length > 0;
  renderTable(
    s,
    { seat, players, coveredSeats: turn?.coveredSeats ?? [] },
    previous,
    origin,
  );
  renderAssists(s, players, turnText);
  if (previous) {
    const result =
      s.tideResult?.tide !== previous.tideResult?.tide ? s.tideResult : null;
    if (buoy && phase === "event" && previous.phase !== "event")
      playCue(buoy === "chain" ? "buoy-chain" : "buoy-echo");
    else if (wake === "drawn-off" && wakeIn(previous) !== "drawn-off")
      playCue("wake-bell");
    else if (
      wake === "following" &&
      phase === "event" &&
      previous.phase !== "event"
    )
      playCue("wake");
    else if (
      (s.channelMarked && !previous.channelMarked) ||
      result?.route.kind === "channel"
    )
      playCue("channel");
    else if (
      landing &&
      (previous.tide !== s.tide ||
        (landing === "reef" && phase === "event" && previous.phase !== "event"))
    )
      playCue(landing);
    else if (result?.route.kind === "hull" && result.route.blocked > 0)
      playCue("brace");
    else if (previous.phase === "board" && phase === "cards") playCue("rope");
  }
}

function renderCrewLobby(snapshot: RoomSnapshot) {
  const heading = select("heading");
  heading.textContent = "Assemble your crew";
  const list = select("lobby-seats");
  const copyStatus = select("lobby-copy-status");
  const host = snapshot.seat === 0;
  if (!list.childElementCount) {
    snapshot.crew.forEach((sailor, seat) => {
      const row = element("li", "", "lobby-seat");
      const name = sailor.name + (seat === snapshot.seat ? " · You" : "");
      const status = element("span", "", "lobby-seat-status");
      status.setAttribute("aria-live", "polite");
      row.append(element("strong", name), status);
      const field = inviteFields[seat - 1];
      if (host && field) {
        const copy = element("button", "Copy " + sailor.name + "’s link");
        copy.type = "button";
        copy.addEventListener("click", () =>
          copyInvite(field, copyStatus, () => {
            const dialog = select("crew-invites");
            if (dialog instanceof HTMLDialogElement) dialog.showModal();
            field.focus();
            return select("invite-status");
          }),
        );
        row.append(copy);
      }
      list.append(row);
    });
  }
  for (const [seat, row] of Array.from(list.children).entries()) {
    const label = row.querySelector(".lobby-seat-status");
    const text =
      seat === 0
        ? "Host"
        : seat >= snapshot.players
          ? "Bot"
          : snapshot.joinedSeats.includes(seat)
            ? "Joined"
            : "Invite pending";
    if (label && label.textContent !== text) label.textContent = text;
  }
  const waiting = snapshot.joinedSeats.length < snapshot.players;
  const prompt = select("instruction");
  const text = host
    ? waiting
      ? "Share a private link with each friend. Friends can join after you begin."
      : "Your crew is ready. You choose the salvage."
    : `You’ll play ${snapshot.crew[snapshot.seat]?.name}. ${snapshot.crew[0]?.name} begins the voyage and chooses salvage.`;
  if (prompt.textContent !== text) prompt.textContent = text;
  launchButton.hidden = !host;
  launchButton.textContent = waiting ? "Begin with open seats" : "Begin voyage";
}

launchButton.addEventListener("click", () => void launchVoyage());

async function launchVoyage() {
  if (!room || turn?.crewLaunched || sending) return;
  sending = true;
  launchButton.setAttribute("disabled", "");
  try {
    const next = await readTurn(room, "launch");
    select("room-status").textContent = "";
    setTurn(next);
  } catch (error) {
    showRoomError(error);
  } finally {
    launchButton.removeAttribute("disabled");
    sending = false;
  }
}

function copyInvite(
  field: HTMLInputElement,
  status: HTMLElement,
  fallback: () => HTMLElement | void,
) {
  const selectLink = () => {
    const fallbackStatus = fallback();
    field.select();
    (fallbackStatus ?? status).textContent = "Copy the selected invite link.";
  };
  if (!navigator.clipboard) {
    selectLink();
    return;
  }
  void navigator.clipboard.writeText(field.value).then(() => {
    status.textContent = "Invite link copied.";
  }, selectLink);
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
    inviteFields.push(field);
    field.addEventListener("focus", () => field.select());
    label.append(field);
    const copy = element("button", "Copy " + name + "’s link");
    copy.type = "button";
    copy.addEventListener("click", () =>
      copyInvite(field, status, () => field.focus()),
    );
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

soundToggle(select("sound-toggle"), select("sound-state"), () => {
  const s = turn ?? state;
  const buoy = buoyIn(s);
  if (s.phase === "event" && buoy)
    return buoy === "chain" ? "buoy-chain" : "buoy-echo";
  const wake = wakeIn(s);
  const landing = landingAt(s);
  if (landing && !(s.phase === "event" && wake)) return landing;
  return wake === "drawn-off" ? "wake-bell" : wake ? "wake" : "brace";
});

if (room) {
  const leave = select("leave-voyage");
  leave.setAttribute("href", location.pathname);
  leave.hidden = false;
  window.addEventListener("hashchange", () => {
    if (/^#[\w-]{43}$/.test(location.hash)) location.reload();
  });
  showPlayMode();
  select("heading").textContent = "Joining the crew";
  void refreshRoom();
  window.setInterval(() => void refreshRoom(), 2500);
  document.addEventListener("visibilitychange", () => void refreshRoom());
  window.addEventListener("pageshow", (event) => {
    if (event.persisted) void refreshRoom();
  });
} else {
  const restart = select("choose-crew");
  restart.addEventListener("click", () => act("again"));
  restart.hidden = false;
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
    paintSea = mountSea(select("scene"), select("sea"));
  })
  .catch((error: unknown) => console.warn("Sea scene unavailable", error));
