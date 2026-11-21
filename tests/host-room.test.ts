import test from "node:test";
import assert from "node:assert/strict";
import { savedHostRoom, storeHostRoom } from "../web/room.ts";

await test("the host can recover an unfinished room after tab storage is gone", (t) => {
  const device = new Map<string, string>();
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    value: {
      getItem: (key: string) => device.get(key) ?? null,
      setItem: (key: string, value: string) => device.set(key, value),
      removeItem: (key: string) => device.delete(key),
    },
  });
  t.after(() => {
    Reflect.deleteProperty(globalThis, "localStorage");
  });
  const room = {
    id: "43b94e51-b238-42ca-8d7a-60be0a64d021",
    token: "a".repeat(43),
  };
  assert.equal(savedHostRoom(), null);
  storeHostRoom(room);
  assert.deepEqual(savedHostRoom(), room);
  storeHostRoom({ ...room, id: "99b94e51-b238-42ca-8d7a-60be0a64d021" }, true);
  assert.deepEqual(savedHostRoom(), room);
  storeHostRoom(room, true);
  assert.equal(savedHostRoom(), null);
});
