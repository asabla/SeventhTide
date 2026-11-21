import { names } from "@seventh-tide/rules";
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

function isSnapshot(value: unknown): value is RoomSnapshot {
  return (
    record(value) &&
    typeof value.id === "string" &&
    typeof value.revision === "number" &&
    typeof value.phase === "string" &&
    ["salvage", "board", "cards", "event", "lost", "won"].includes(
      value.phase,
    ) &&
    typeof value.tide === "number" &&
    typeof value.hull === "number" &&
    typeof value.guard === "number" &&
    (value.swimmer === null || typeof value.swimmer === "number") &&
    (value.forecast === null || typeof value.forecast === "string") &&
    (value.event === null ||
      (record(value.event) &&
        typeof value.event.title === "string" &&
        typeof value.event.description === "string")) &&
    Array.isArray(value.crew) &&
    value.crew.length === names.length &&
    value.crew.every(
      (p: unknown) =>
        record(p) &&
        typeof p.name === "string" &&
        typeof p.cold === "number" &&
        typeof p.food === "number",
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
    body: JSON.stringify({ players }),
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
  | { sailor: number; offer: boolean };

export async function readTurn(
  room: Room,
  move?: RoomAction & { expectedRevision: number },
): Promise<RoomSnapshot> {
  const path = "/api/voyages/" + encodeURIComponent(room.id);
  const headers = {
    Authorization: "Bearer " + room.token,
    "Content-Type": "application/json",
  };
  const volunteer = move && "offer" in move;
  const response = await fetch(
    move ? path + (volunteer ? "/volunteers" : "/moves") : path,
    move
      ? {
          method: volunteer ? "PUT" : "POST",
          headers,
          body: JSON.stringify(move),
        }
      : { headers },
  );
  if (response.status === 409 || response.status === 422)
    throw new TurnConflict(
      "The crew made another choice. Check the latest turn and choose again.",
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
