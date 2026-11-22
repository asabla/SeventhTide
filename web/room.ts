import { names } from "@seventh-tide/rules";
import { isCrewSignal, type CrewSignal } from "../shared/crew-signals.ts";
import type { RoomSnapshot } from "../server/voyages.ts";

export interface Room {
  id: string;
  token: string;
}

const hostSave = "seventh-tide-host-room";
export function savedHostRoom(): Room | null {
  try {
    const saved: unknown = JSON.parse(localStorage.getItem(hostSave) ?? "null");
    if (
      record(saved) &&
      typeof saved.id === "string" &&
      /^[a-f0-9-]{36}$/.test(saved.id) &&
      typeof saved.token === "string" &&
      /^[\w-]{43}$/.test(saved.token)
    )
      return { id: saved.id, token: saved.token };
  } catch {
    /* Storage is optional. */
  }
  return null;
}

export function storeHostRoom(room: Room, finished = false) {
  try {
    if (!finished) localStorage.setItem(hostSave, JSON.stringify(room));
    else if (savedHostRoom()?.id === room.id) localStorage.removeItem(hostSave);
  } catch {
    /* The seat remains available in this tab. */
  }
}

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function sailor(value: unknown) {
  return (
    typeof value === "number" &&
    Number.isInteger(value) &&
    value >= 0 &&
    value < names.length
  );
}

function isCrewPlay(value: unknown) {
  return (
    record(value) &&
    sailor(value.actor) &&
    typeof value.id === "string" &&
    typeof value.name === "string" &&
    (value.card === undefined || typeof value.card === "string") &&
    typeof value.markedChannel === "boolean" &&
    Array.isArray(value.changes) &&
    value.changes.every(
      (change: unknown) =>
        record(change) &&
        typeof change.amount === "number" &&
        (change.sailor === null
          ? change.resource === "hull" || change.resource === "brace"
          : sailor(change.sailor) &&
            (change.resource === "cold" || change.resource === "ration")),
    )
  );
}

function isTideResult(value: unknown) {
  return (
    record(value) &&
    typeof value.tide === "number" &&
    typeof value.event === "string" &&
    typeof value.choice === "string" &&
    sailor(value.swimmer) &&
    typeof value.ration === "number" &&
    Array.isArray(value.exposure) &&
    value.exposure.length === names.length &&
    value.exposure.every((cold: unknown) => typeof cold === "number") &&
    record(value.route) &&
    (value.route.kind === "channel" ||
      value.route.kind === "decoy" ||
      (value.route.kind === "chain" && typeof value.route.cold === "number") ||
      (value.route.kind === "dive" && typeof value.route.cold === "number") ||
      (value.route.kind === "hull" &&
        typeof value.route.incoming === "number" &&
        typeof value.route.blocked === "number" &&
        typeof value.route.lost === "number"))
  );
}

function isSnapshot(value: unknown): value is RoomSnapshot {
  return (
    record(value) &&
    typeof value.id === "string" &&
    typeof value.revision === "number" &&
    typeof value.crewLaunched === "boolean" &&
    typeof value.crewRevision === "number" &&
    Array.isArray(value.signals) &&
    value.signals.length === names.length &&
    value.signals.every(
      (signal: unknown) => signal === null || isCrewSignal(signal),
    ) &&
    Array.isArray(value.joinedSeats) &&
    value.joinedSeats.every(sailor) &&
    (value.assistedTide === null || typeof value.assistedTide === "number") &&
    Array.isArray(value.coveredSeats) &&
    value.coveredSeats.every(sailor) &&
    typeof value.phase === "string" &&
    ["salvage", "board", "cards", "event", "lost", "won"].includes(
      value.phase,
    ) &&
    typeof value.tide === "number" &&
    (value.channelMarked === undefined ||
      typeof value.channelMarked === "boolean") &&
    (value.wake === undefined ||
      value.wake === "following" ||
      value.wake === "drawn-off") &&
    (value.buoy === undefined ||
      value.buoy === "chain" ||
      value.buoy === "echo") &&
    typeof value.hull === "number" &&
    typeof value.guard === "number" &&
    (value.swimmer === null || typeof value.swimmer === "number") &&
    Array.isArray(value.plays) &&
    value.plays.every(isCrewPlay) &&
    (value.tideResult === null || isTideResult(value.tideResult)) &&
    (value.forecast === null || typeof value.forecast === "string") &&
    (value.forecastTitle === null || typeof value.forecastTitle === "string") &&
    (value.event === null ||
      (record(value.event) &&
        typeof value.event.title === "string" &&
        typeof value.event.description === "string" &&
        Array.isArray(value.event.routes) &&
        value.event.routes.every(
          (route: unknown) =>
            record(route) &&
            (route.id === undefined || typeof route.id === "string") &&
            typeof route.name === "string" &&
            typeof route.detail === "string",
        ))) &&
    Array.isArray(value.crew) &&
    value.crew.length === names.length &&
    value.crew.every(
      (p: unknown) =>
        record(p) &&
        typeof p.name === "string" &&
        typeof p.cold === "number" &&
        typeof p.food === "number",
    ) &&
    Array.isArray(value.hands) &&
    value.hands.length === names.length &&
    value.hands.every(
      (hand: unknown) =>
        Array.isArray(hand) &&
        hand.every(
          (card: unknown) =>
            record(card) &&
            typeof card.name === "string" &&
            typeof card.water === "string" &&
            typeof card.raft === "string",
        ),
    ) &&
    Array.isArray(value.choices) &&
    value.choices.every(
      (p: unknown) =>
        record(p) &&
        typeof p.id === "string" &&
        typeof p.name === "string" &&
        typeof p.detail === "string" &&
        (p.actor === undefined || typeof p.actor === "number"),
    ) &&
    Array.isArray(value.log) &&
    value.log.every((line: unknown) => typeof line === "string") &&
    typeof value.offerRevision === "number" &&
    Array.isArray(value.volunteers) &&
    value.volunteers.every((i: unknown) => typeof i === "number") &&
    Array.isArray(value.offerSeats) &&
    value.offerSeats.every((i: unknown) => typeof i === "number") &&
    Array.isArray(value.assistSeats) &&
    value.assistSeats.every(sailor) &&
    Array.isArray(value.channelScouts) &&
    value.channelScouts.every(sailor) &&
    typeof value.seat === "number" &&
    typeof value.players === "number" &&
    Array.isArray(value.invites) &&
    value.invites.every((token: unknown) => typeof token === "string") &&
    typeof value.rulesVersion === "number" &&
    Array.isArray(value.acted) &&
    value.acted.every((i: unknown) => typeof i === "number")
  );
}

export function roomUrl({ id, token }: Room) {
  const url = new URL(location.pathname, location.origin);
  url.searchParams.set("room", id);
  url.hash = token;
  return url.href;
}

export function readRoom(id: string): Room {
  const key = "seventh-tide-room-" + id;
  const fragment = location.hash.slice(1);
  let token = /^[\w-]{43}$/.test(fragment) ? fragment : "";
  try {
    if (token) {
      sessionStorage.setItem(key, token);
      history.replaceState(null, "", location.pathname + location.search);
    } else token = sessionStorage.getItem(key) ?? "";
  } catch {
    // The invite fragment still works when browser storage is unavailable.
  }
  return { id, token };
}

export async function hostRoom(players: number) {
  const response = await fetch("/api/voyages", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ players, prepareCrew: true }),
  });
  if (!response.ok)
    throw new Error(
      "Could not open a crew room. Check that the server has a database.",
    );
  const value: unknown = await response.json();
  if (
    !isSnapshot(value) ||
    !("token" in value) ||
    typeof value.token !== "string"
  )
    throw new Error("Invalid room response.");
  const room = { id: value.id, token: value.token };
  storeHostRoom(room);
  location.assign(roomUrl(room));
}

export class TurnConflict extends Error {}

export type RoomAction =
  | { moveId: string; expectedOfferRevision?: number }
  | { assistSailor: number }
  | { sailor: number; offer: boolean };

export async function readTurn(
  room: Room,
  action?:
    | "seat"
    | "launch"
    | (RoomAction & { expectedRevision: number })
    | { tide: number; signal: CrewSignal | null },
): Promise<RoomSnapshot> {
  const path = "/api/voyages/" + encodeURIComponent(room.id);
  const move = typeof action === "object" ? action : undefined;
  const volunteer = move && "offer" in move;
  const signaling = move && "signal" in move;
  let endpoint = "";
  if (typeof action === "string") endpoint = action;
  else if (move)
    endpoint = signaling ? "signal" : volunteer ? "volunteers" : "moves";
  const headers: Record<string, string> = {
    Authorization: "Bearer " + room.token,
  };
  if (move) headers["Content-Type"] = "application/json";
  const response = await fetch(endpoint ? path + "/" + endpoint : path, {
    method: endpoint === "moves" ? "POST" : endpoint ? "PUT" : "GET",
    headers,
    ...(move ? { body: JSON.stringify(move) } : {}),
  });
  if (response.status === 409 || response.status === 422)
    throw new TurnConflict(
      signaling
        ? "The tide changed. Check the crew signals and try again."
        : "The crew made another choice. Check the latest turn and choose again.",
    );
  if (response.status === 401 || response.status === 404)
    throw new Error(
      "This seat is unavailable. Open your private invite link again.",
    );
  if (!response.ok)
    throw new Error("Could not update the room. Check your connection.");
  const value: unknown = await response.json();
  if (!isSnapshot(value)) throw new Error("Invalid room response.");
  return value;
}
