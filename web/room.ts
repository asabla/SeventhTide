import { names } from "@seventh-tide/rules";
import type { RoomSnapshot } from "../server/voyages.ts";

export interface Room {
  id: string;
  token: string;
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
  location.assign(roomUrl({ id: value.id, token: value.token }));
}

export class TurnConflict extends Error {}

export async function readTurn(
  room: Room,
  move?: { expectedRevision: number; moveId: string },
): Promise<RoomSnapshot> {
  const path = "/api/voyages/" + encodeURIComponent(room.id);
  const headers = {
    Authorization: "Bearer " + room.token,
    "Content-Type": "application/json",
  };
  const response = await fetch(
    move ? path + "/moves" : path,
    move
      ? { method: "POST", headers, body: JSON.stringify(move) }
      : { headers },
  );
  if (response.status === 409)
    throw new TurnConflict(
      "The crew played another card. Choose again from the current hand.",
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
