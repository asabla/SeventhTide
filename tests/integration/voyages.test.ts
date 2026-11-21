import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { createInterface } from "node:readline";
import test, { type TestContext } from "node:test";
import { Pool } from "pg";
import {
  start,
  play,
  moves,
  rulesVersion,
  currentEvent,
  crewMember,
} from "@seventh-tide/rules";

const databaseUrl = process.env.TEST_DATABASE_URL;
if (!databaseUrl)
  throw new Error("Set TEST_DATABASE_URL to a test PostgreSQL database.");

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

interface Snapshot extends Record<string, unknown> {
  id: string;
  revision: number;
  choices: { id: string }[];
}

async function readSnapshot(response: Response): Promise<Snapshot> {
  const value: unknown = await response.json();
  assertSnapshot(value);
  return value;
}

function assertSnapshot(value: unknown): asserts value is Snapshot {
  assert.ok(isRecord(value));
  assert.ok(typeof value.id === "string");
  assert.ok(
    typeof value.revision === "number" && Number.isInteger(value.revision),
  );
  assert.ok(
    Array.isArray(value.choices) &&
      value.choices.every(
        (choice: unknown) => isRecord(choice) && typeof choice.id === "string",
      ),
  );
}

async function launch(t: TestContext) {
  const child = spawn(process.execPath, ["server/start.ts"], {
    env: {
      ...process.env,
      DATABASE_URL: databaseUrl,
      PORT: "0",
      HOST: "127.0.0.1",
    },
    stdio: ["ignore", "pipe", "inherit"],
  });
  const exited = once(child, "exit");
  async function stop() {
    if (child.exitCode === null && child.signalCode === null) child.kill();
    await exited;
  }
  t.after(stop);
  const lines = createInterface({ input: child.stdout });
  // Fastify logs its bound port after database migration and HTTP startup.
  for await (const line of lines) {
    const log: unknown = JSON.parse(line);
    if (!isRecord(log) || typeof log.msg !== "string") continue;
    const address = log.msg.match(/^Server listening at (http:\/\/\S+)$/)?.[1];
    if (address) {
      child.stdout.resume();
      return { address, stop };
    }
  }
  throw new Error("Server exited before it accepted connections.");
}

await test(
  "persist moves, reject competing writes, and recover after process restart",
  { timeout: 30000 },
  async (t) => {
    let server = await launch(t);
    const base = "/api/voyages";
    const create = await fetch(server.address + base, { method: "POST" });
    assert.equal(create.status, 201);
    const voyage = await readSnapshot(create);
    const { token, id } = voyage;
    assert.ok(typeof token === "string");
    const [firstChoice] = voyage.choices;
    assert.ok(firstChoice);
    const pool = new Pool({ connectionString: databaseUrl });
    t.after(async () => {
      try {
        await pool.query("DELETE FROM voyages WHERE id = $1", [id]);
      } finally {
        await pool.end();
      }
    });
    assert.equal(voyage.revision, 0);
    assert.equal(voyage.rulesVersion, rulesVersion);
    assert.equal(voyage.seed, undefined);
    assert.equal(voyage.events, undefined);
    const url = () => server.address + base + "/" + id;
    const auth = { Authorization: "Bearer " + token };
    const read = async () => {
      const response = await fetch(url(), { headers: auth });
      assert.equal(response.status, 200);
      return readSnapshot(response);
    };
    const post = (moveId: string, expectedRevision: number) =>
      fetch(url() + "/moves", {
        method: "POST",
        headers: { ...auth, "Content-Type": "application/json" },
        body: JSON.stringify({ moveId, expectedRevision }),
      });
    assert.equal((await fetch(url())).status, 401);
    const other = { Authorization: "Bearer " + "x".repeat(43) };
    assert.equal((await fetch(url(), { headers: other })).status, 404);
    assert.equal(
      (
        await fetch(url() + "/moves", {
          method: "POST",
          headers: { ...other, "Content-Type": "application/json" },
          body: JSON.stringify({
            expectedRevision: 0,
            moveId: firstChoice.id,
          }),
        })
      ).status,
      404,
    );
    assert.equal((await post("swim-1", 0)).status, 422);
    assert.equal((await post("swim-1", -1)).status, 400);
    const writes = await Promise.all(
      voyage.choices.map((choice) => post(choice.id, 0)),
    );
    assert.deepEqual(
      writes.map((r) => r.status).toSorted((a, b) => a - b),
      [200, 409],
    );
    const accepted =
      voyage.choices[writes.findIndex((r) => r.status === 200)]?.id;
    assert.ok(accepted);
    assert.equal((await post(accepted, 0)).status, 409);
    assert.equal((await post("swim-1", 1)).status, 200);
    const before = await read();
    assert.equal(before.revision, 2);
    assert.equal(before.token, undefined);
    const {
      rows: [row],
    } = await pool.query<{
      seed: string;
      rules_version: number;
      moves: string[];
    }>("SELECT seed, rules_version, moves, revision FROM voyages WHERE id=$1", [
      id,
    ]);
    assert.ok(row);
    assert.equal(row.rules_version, rulesVersion);
    assert.deepEqual(row.moves, [accepted, "swim-1"]);
    const expected = row.moves.reduce(play, start(Number(row.seed)));
    assert.deepEqual(before.crew, expected.crew);
    assert.deepEqual(before.choices, moves(expected));

    await server.stop();
    server = await launch(t);
    assert.deepEqual(await read(), before);
    const [nextChoice] = before.choices;
    assert.ok(nextChoice);
    const continued = await post(nextChoice.id, before.revision);
    assert.equal(continued.status, 200);
    assert.equal((await readSnapshot(continued)).revision, 3);
  },
);

for (const players of [2, 3]) {
  await test(
    players + " players share a tide with separate crew seats",
    async (t) => {
      const server = await launch(t);
      const base = server.address + "/api/voyages";
      const create = await fetch(base, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ players }),
      });
      assert.equal(create.status, 201);
      const room = await readSnapshot(create);
      t.after(async () => {
        const pool = new Pool({ connectionString: databaseUrl });
        try {
          await pool.query("DELETE FROM voyages WHERE id=$1", [room.id]);
        } finally {
          await pool.end();
        }
      });
      assert.equal(room.players, players);
      const host = room.token;
      assert.ok(typeof host === "string");
      const invites = room.invites;
      assert.ok(Array.isArray(invites));
      assert.equal(invites.length, players - 1);
      const ivo: unknown = invites[0];
      const nell: unknown = invites[1];
      assert.ok(typeof ivo === "string");
      const third = players === 3 ? nell : host;
      assert.ok(typeof third === "string");
      const url = base + "/" + room.id;
      const read = async (token: string) =>
        readSnapshot(
          await fetch(url, { headers: { Authorization: "Bearer " + token } }),
        );
      const playCard = (
        token: string,
        moveId: string,
        expectedRevision: number,
        expectedOfferRevision?: number,
      ) =>
        fetch(url + "/moves", {
          method: "POST",
          headers: {
            Authorization: "Bearer " + token,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            moveId,
            expectedRevision,
            expectedOfferRevision,
          }),
        });
      const offer = (
        token: string,
        sailor: number,
        volunteer: boolean,
        expectedRevision = 1,
      ) =>
        fetch(url + "/volunteers", {
          method: "PUT",
          headers: {
            Authorization: "Bearer " + token,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ expectedRevision, sailor, offer: volunteer }),
        });
      const guest = await read(ivo);
      assert.equal(guest.seat, 1);
      assert.deepEqual(guest.invites, []);
      assert.deepEqual(guest.choices, []);
      const salvage = room.choices[0];
      assert.ok(salvage);
      assert.equal((await playCard(ivo, salvage.id, 0)).status, 422);
      assert.equal((await playCard(host, salvage.id, 0)).status, 200);
      assert.deepEqual((await read(ivo)).offerSeats, [1]);
      assert.equal((await offer(ivo, 0, true)).status, 422);
      const offers = await Promise.all([
        offer(ivo, 1, true),
        offer(host, 0, true),
      ]);
      assert.deepEqual(
        offers.map((r) => r.status),
        [200, 200],
      );
      const offered = await read(host);
      assert.deepEqual(offered.volunteers, [0, 1]);
      assert.equal(offered.revision, 1);
      assert.equal(offered.offerRevision, 2);
      assert.equal(
        (await readSnapshot(await offer(ivo, 1, true))).offerRevision,
        2,
      );
      assert.equal((await playCard(host, "swim-2", 1)).status, 422);
      assert.deepEqual(
        (await readSnapshot(await offer(host, 0, false))).volunteers,
        [1],
      );
      assert.deepEqual(
        (await readSnapshot(await offer(ivo, 1, false))).choices,
        [],
      );
      assert.equal((await read(host)).choices.length, 3);
      assert.equal((await playCard(host, "swim-1", 1, 2)).status, 409);
      await offer(ivo, 1, true);
      assert.equal((await playCard(host, "swim-1", 1)).status, 200);
      assert.deepEqual((await read(ivo)).volunteers, []);
      assert.equal((await offer(ivo, 1, true)).status, 409);
      assert.equal((await offer(ivo, 1, true, 2)).status, 422);
      assert.equal((await playCard(host, "float-1", 2)).status, 422);
      assert.equal((await playCard(ivo, "lash-2", 2)).status, 422);
      const onRaft = (await read(host)).choices.map((c) => c.id);
      assert.equal(onRaft.includes("lash-2"), players === 2);
      assert.equal(
        (await read(ivo)).choices.every(
          (c) =>
            c.id.startsWith("feed-1-") ||
            c.id === "sound-1" ||
            c.id === "float-1",
        ),
        true,
      );
      const cards = [
        [host, "lash-0"],
        [ivo, "float-1"],
      ] as const;
      const results = await Promise.all(
        cards.map(([token, card]) => playCard(token, card, 2)),
      );
      assert.deepEqual(
        results.map((r) => r.status).toSorted((left, right) => left - right),
        [200, 409],
      );
      const retry = cards[results.findIndex((r) => r.status === 409)];
      assert.ok(retry);
      assert.equal((await playCard(retry[0], retry[1], 3)).status, 200);
      assert.equal((await playCard(third, "lash-2", 4)).status, 200);
      assert.equal((await read(ivo)).phase, "event");
      assert.equal((await playCard(ivo, "hull", 5)).status, 422);
      assert.equal((await playCard(host, "hull", 5)).status, 200);
      const after = await read(ivo);
      assert.equal(after.revision, 6);
      assert.deepEqual(after.log, (await read(host)).log);
    },
  );
}

await test("two seats complete all seven tides and the host rejoins mid-voyage", async (t) => {
  const server = await launch(t);
  const base = server.address + "/api/voyages";
  const room = await readSnapshot(
    await fetch(base, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ players: 2 }),
    }),
  );
  const pool = new Pool({ connectionString: databaseUrl });
  t.after(async () => {
    try {
      await pool.query("DELETE FROM voyages WHERE id=$1", [room.id]);
    } finally {
      await pool.end();
    }
  });
  const seed = 111;
  await pool.query("UPDATE voyages SET seed=$1 WHERE id=$2", [seed, room.id]);
  assert.ok(typeof room.token === "string" && Array.isArray(room.invites));
  const host = room.token;
  const guest: unknown = room.invites[0];
  assert.ok(typeof guest === "string");
  let expected = start(seed);
  let revision = 0;
  async function act(id: string, token: string) {
    const response = await fetch(base + "/" + room.id + "/moves", {
      method: "POST",
      headers: {
        Authorization: "Bearer " + token,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ moveId: id, expectedRevision: revision }),
    });
    assert.equal(response.status, 200);
    expected = play(expected, id);
    const next = await readSnapshot(response);
    assert.equal(next.revision, ++revision);
    assert.equal(next.phase, expected.phase);
    assert.deepEqual(next.crew, expected.crew);
  }
  const salvage = expected.salvage[0];
  assert.ok(salvage);
  await act(salvage.id, host);
  for (let tide = 1; tide <= 7; tide++) {
    if (tide === 4) {
      const restored = await readSnapshot(
        await fetch(base + "/" + room.id, {
          headers: { Authorization: "Bearer " + host },
        }),
      );
      assert.equal(restored.revision, revision);
      assert.deepEqual(restored.invites, room.invites);
      assert.equal(restored.tide, tide);
    }
    const swimmer = (tide - 1) % 3;
    const seat = (index: number) => (index === 1 ? guest : host);
    await act("swim-" + swimmer, host);
    await act("sound-" + swimmer, seat(swimmer));
    const mates = [0, 1, 2].filter((i) => i !== swimmer);
    const helper =
      mates.find((i) => crewMember(expected, i).food > 0) ?? mates[0];
    assert.ok(helper !== undefined);
    const repairer = mates.find((i) => i !== helper);
    assert.ok(repairer !== undefined);
    await act(
      crewMember(expected, helper).food
        ? "feed-" + helper + "-" + swimmer
        : "haul-" + helper,
      seat(helper),
    );
    await act("lash-" + repairer, seat(repairer));
    await act(
      expected.hull > currentEvent(expected)[3] - expected.guard
        ? "hull"
        : "dive",
      host,
    );
  }
  assert.equal(expected.phase, "won");
});
