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
import { playWithBots, seatMoves } from "@seventh-tide/rules/crew";

const databaseUrl = process.env.TEST_DATABASE_URL;
if (!databaseUrl)
  throw new Error("Set TEST_DATABASE_URL to a test PostgreSQL database.");

await test("a returning guest can see the marked landing routes and only the host can commit one", async (t) => {
  const server = await launch(t);
  const base = server.address + "/api/voyages";
  const room = await readSnapshot(
    await fetch(base, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ players: 2 }),
    }),
  );
  assert.ok(typeof room.token === "string" && Array.isArray(room.invites));
  const guest: unknown = room.invites[0];
  assert.ok(typeof guest === "string");
  const history =
    "canvas swim-0 float-0 lash-1 lash-2 hull swim-1 float-1 feed-0-1 lash-2 dive swim-2 float-2 feed-1-2 lash-0 hull swim-0 float-0 feed-2-0 lash-1 dive swim-1 float-1 feed-0-1 lash-2 dive swim-2 line-2 feed-1-2 lash-0 dive swim-0 float-0 feed-2-0 lash-1".split(
      " ",
    );
  const pool = new Pool({ connectionString: databaseUrl });
  t.after(async () => {
    try {
      await pool.query("DELETE FROM voyages WHERE id=$1", [room.id]);
    } finally {
      await pool.end();
    }
  });
  await pool.query(
    "UPDATE voyages SET seed=$1, moves=$2, rules_version=3 WHERE id=$3",
    [4203543429, history, room.id],
  );
  const url = base + "/" + room.id;
  const view = await readSnapshot(
    await fetch(url, { headers: { Authorization: "Bearer " + guest } }),
  );
  assert.equal(view.channelMarked, true);
  assert.deepEqual(view.choices, []);
  assert.ok(isRecord(view.event) && Array.isArray(view.event.landingRoutes));
  assert.deepEqual(
    view.event.landingRoutes,
    moves(history.reduce(play, start(4203543429, 3))).map(
      ({ name, detail }) => ({
        name,
        detail,
      }),
    ),
  );
  const land = (token: string) =>
    fetch(url + "/moves", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer " + token,
      },
      body: JSON.stringify({
        expectedRevision: history.length,
        moveId: "channel",
      }),
    });
  assert.equal((await land(guest)).status, 422);
  assert.equal((await readSnapshot(await land(room.token))).phase, "won");
});

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
    assert.deepEqual(before.choices, seatMoves(expected, 0, 1));

    await server.stop();
    server = await launch(t);
    assert.deepEqual(await read(), before);
    const [nextChoice] = before.choices;
    assert.ok(nextChoice);
    const continued = await post(nextChoice.id, before.revision);
    assert.equal(continued.status, 200);
    const next = await readSnapshot(continued);
    assert.equal(next.revision, 5);
    const advanced = playWithBots(expected, nextChoice.id, 1);
    assert.equal(next.phase, "event");
    assert.deepEqual(next.plays, advanced.state.plays);
    assert.deepEqual(
      (
        await pool.query<{ moves: string[] }>(
          "SELECT moves FROM voyages WHERE id = $1",
          [id],
        )
      ).rows[0]?.moves,
      [...row.moves, ...advanced.history],
    );
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
      const boarding = await read(ivo);
      assert.deepEqual(boarding.offerSeats, [1]);
      assert.ok(Array.isArray(boarding.hands));
      assert.deepEqual(
        boarding.hands.map((h: unknown) => (Array.isArray(h) ? h.length : -1)),
        [0, 2, 0],
      );
      assert.equal(boarding.deck, undefined);
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
      assert.equal(
        offered.choices.some(({ id }) => id === "swim-2"),
        players === 2,
      );
      if (players === 3)
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
      assert.equal(onRaft.includes("lash-2"), false);
      assert.deepEqual(
        (await read(host)).assistSeats,
        players === 2 ? [1] : [1, 2],
      );
      assert.equal(
        (await read(ivo)).choices.every((c) => c.id.split("-")[1] === "1"),
        true,
      );
      const hand = (await read(ivo)).choices;
      const held =
        hand.find((c) => c.id !== "float-1" && !c.id.startsWith("feed-")) ??
        hand[0];
      assert.ok(held);
      assert.equal((await playCard(host, held.id, 2)).status, 422);
      const cards = [
        [host, "lash-0"],
        [ivo, held.id],
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
      if (players === 3)
        assert.equal((await playCard(third, "lash-2", 4)).status, 200);
      else assert.equal((await playCard(host, "lash-2", 4)).status, 409);
      const event = await read(ivo);
      assert.equal(event.phase, "event");
      assert.ok(isRecord(event.event) && Array.isArray(event.event.routes));
      assert.equal(event.event.routes.length, 2);
      assert.ok(Array.isArray(event.plays));
      assert.equal(event.plays.length, 3);
      assert.ok(
        event.plays.some(
          (move: unknown) =>
            isRecord(move) && move.actor === 1 && move.id === held.id,
        ),
      );
      assert.equal(event.tideResult, null);
      assert.equal((await playCard(ivo, "hull", 5)).status, 422);
      assert.equal((await playCard(host, "hull", 5)).status, 200);
      const after = await read(ivo);
      assert.equal(after.revision, 6);
      const hostAfter = await read(host);
      assert.deepEqual(after.log, hostAfter.log);
      assert.deepEqual(after.plays, hostAfter.plays);
      assert.deepEqual(after.tideResult, hostAfter.tideResult);
      assert.ok(isRecord(after.tideResult));
      assert.equal(after.tideResult.tide, 1);
    },
  );
}

await test("a stored version-one room can rejoin and complete all seven tides", async (t) => {
  const server = await launch(t);
  const base = server.address + "/api/voyages";
  const room = await readSnapshot(
    await fetch(base, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ players: 3 }),
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
  await pool.query("UPDATE voyages SET seed=$1, rules_version=1 WHERE id=$2", [
    seed,
    room.id,
  ]);
  assert.ok(typeof room.token === "string" && Array.isArray(room.invites));
  const host = room.token;
  const guest: unknown = room.invites[0];
  const third: unknown = room.invites[1];
  assert.ok(typeof guest === "string" && typeof third === "string");
  let expected = start(seed, 1);
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
    const seat = (index: number) =>
      index === 1 ? guest : index === 2 ? third : host;
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

await test("prepare a crew, launch with an open seat, and restore a covered turn on rejoin", async (t) => {
  const server = await launch(t);
  const base = server.address + "/api/voyages";
  const room = await readSnapshot(
    await fetch(base, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ players: 3, prepareCrew: true }),
    }),
  );
  assert.ok(typeof room.token === "string" && Array.isArray(room.invites));
  const host = room.token;
  const invites: unknown[] = room.invites;
  const [ivo, nell] = invites;
  assert.ok(typeof ivo === "string" && typeof nell === "string");
  const pool = new Pool({ connectionString: databaseUrl });
  t.after(async () => {
    try {
      await pool.query("DELETE FROM voyages WHERE id=$1", [room.id]);
    } finally {
      await pool.end();
    }
  });
  await pool.query("UPDATE voyages SET seed = 318 WHERE id = $1", [room.id]);
  const url = base + "/" + room.id;
  const read = async (token: string) =>
    readSnapshot(
      await fetch(url, { headers: { Authorization: "Bearer " + token } }),
    );
  const put = (token: string, endpoint: "seat" | "launch") =>
    fetch(url + "/" + endpoint, {
      method: "PUT",
      headers: { Authorization: "Bearer " + token },
    });
  const act = (
    token: string,
    expectedRevision: number,
    action: { moveId: string } | { assistSailor: number },
  ) =>
    fetch(url + "/moves", {
      method: "POST",
      headers: {
        Authorization: "Bearer " + token,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ expectedRevision, ...action }),
    });

  assert.equal(room.crewLaunched, false);
  assert.deepEqual(room.joinedSeats, [0]);
  assert.deepEqual(room.choices, []);
  assert.equal((await act(host, 0, { moveId: "locker" })).status, 422);
  assert.equal((await put(ivo, "launch")).status, 403);

  const joins = await Promise.all([put(ivo, "seat"), put(ivo, "seat")]);
  for (const join of joins) {
    assert.equal(join.status, 200);
    const guest = await readSnapshot(join);
    assert.equal(guest.seat, 1);
    assert.deepEqual(guest.invites, []);
    assert.deepEqual(guest.joinedSeats, [0, 1]);
    assert.equal(guest.crewRevision, 1);
  }
  assert.deepEqual((await read(host)).joinedSeats, [0, 1]);
  const launched = await readSnapshot(await put(host, "launch"));
  assert.equal(launched.crewLaunched, true);
  assert.equal(launched.revision, 0);
  assert.equal(launched.crewRevision, 2);
  assert.deepEqual(launched.joinedSeats, [0, 1]);
  assert.equal((await readSnapshot(await put(host, "launch"))).crewRevision, 2);

  assert.equal((await act(host, 0, { moveId: "locker" })).status, 200);
  assert.equal((await act(host, 1, { moveId: "swim-0" })).status, 200);
  assert.equal((await act(host, 2, { moveId: "line-0" })).status, 200);
  assert.equal((await act(host, 3, { assistSailor: 1 })).status, 200);
  const returned = await readSnapshot(await put(ivo, "seat"));
  assert.equal(returned.assistedTide, 1);
  assert.deepEqual(returned.coveredSeats, [1]);
  assert.deepEqual(returned.choices, []);
  assert.deepEqual(returned.acted, [0, 1]);
  const lateGuest = await readSnapshot(await put(nell, "seat"));
  assert.deepEqual(lateGuest.joinedSeats, [0, 1, 2]);
  assert.equal(lateGuest.assistedTide, null);
  assert.equal(lateGuest.seat, 2);
  assert.equal((await act(nell, 4, { moveId: "lash-2" })).status, 200);
  assert.equal((await act(host, 5, { moveId: "hull" })).status, 200);
  assert.equal((await act(host, 6, { moveId: "swim-0" })).status, 200);
  const next = await read(ivo);
  assert.equal(next.tide, 2);
  assert.equal(next.assistedTide, 1);
  assert.deepEqual(next.coveredSeats, []);
  assert.ok(next.choices.some(({ id }) => id === "lash-1"));
  assert.equal((await act(ivo, 7, { moveId: "lash-1" })).status, 200);
});

await test("crew signals stay with their authenticated seats and clear when the tide resolves", async (t) => {
  const server = await launch(t);
  const base = server.address + "/api/voyages";
  const room = await readSnapshot(
    await fetch(base, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ players: 2 }),
    }),
  );
  const host = room.token;
  assert.ok(typeof host === "string" && Array.isArray(room.invites));
  const guest: unknown = room.invites[0];
  assert.ok(typeof guest === "string");
  const pool = new Pool({ connectionString: databaseUrl });
  t.after(async () => {
    try {
      await pool.query("DELETE FROM voyages WHERE id=$1", [room.id]);
    } finally {
      await pool.end();
    }
  });
  const url = base + "/" + room.id;
  const read = (token: string) =>
    fetch(url, { headers: { Authorization: "Bearer " + token } }).then(
      readSnapshot,
    );
  const request = (
    token: string,
    endpoint: string,
    method: string,
    body: Record<string, unknown>,
  ) =>
    fetch(url + "/" + endpoint, {
      method,
      headers: {
        Authorization: "Bearer " + token,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });
  const signal = (token: string, tide: number, value: string | null) =>
    request(token, "signal", "PUT", { tide, signal: value });
  const act = (token: string, expectedRevision: number, moveId: string) =>
    request(token, "moves", "POST", { expectedRevision, moveId });

  assert.deepEqual(room.signals, [null, null, null]);
  assert.equal((await signal(guest, 1, "warmth")).status, 409);
  assert.equal((await signal("", 1, "brace")).status, 401);
  await pool.query("UPDATE voyages SET seed=$1, moves=$2 WHERE id=$3", [
    318,
    ["locker", "swim-0"],
    room.id,
  ]);
  assert.equal((await signal(guest, 1, "invalid")).status, 400);
  const outputs = await Promise.all([
    signal(guest, 1, "warmth"),
    signal(host, 1, "brace"),
  ]);
  for (const output of outputs) {
    assert.equal(output.status, 200);
    assert.equal((await readSnapshot(output)).revision, 2);
  }
  const shared = await read(guest);
  assert.deepEqual(shared.signals, ["brace", "warmth", null]);
  assert.equal(shared.crewRevision, 2);
  assert.deepEqual((await read(host)).signals, shared.signals);
  assert.equal(
    (await readSnapshot(await signal(host, 1, "brace"))).crewRevision,
    2,
  );
  assert.deepEqual((await readSnapshot(await signal(host, 1, null))).signals, [
    null,
    "warmth",
    null,
  ]);
  assert.deepEqual(
    (await readSnapshot(await signal(guest, 1, "ration"))).signals,
    [null, "ration", null],
  );
  assert.equal((await act(host, 2, "line-0")).status, 200);
  const event = await readSnapshot(await act(guest, 3, "hook-1"));
  assert.equal(event.phase, "event");
  assert.deepEqual(event.signals, [null, "ration", null]);
  assert.equal((await signal(guest, 1, "brace")).status, 409);
  const board = await readSnapshot(await act(host, 5, "hull"));
  assert.equal(board.tide, 2);
  assert.deepEqual(board.signals, [null, null, null]);
  assert.equal((await act(host, 6, "swim-0")).status, 200);
  assert.equal((await signal(guest, 1, "warmth")).status, 409);
  assert.deepEqual((await read(guest)).signals, [null, null, null]);
});

await test("assistance and a returning friend cannot both play the same turn", async (t) => {
  const server = await launch(t);
  const base = server.address + "/api/voyages";
  const room = await readSnapshot(
    await fetch(base, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ players: 2 }),
    }),
  );
  assert.ok(typeof room.token === "string" && Array.isArray(room.invites));
  const guest: unknown = room.invites[0];
  assert.ok(typeof guest === "string");
  const host = room.token;
  const url = base + "/" + room.id;
  const response = (
    token: string,
    payload: { moveId?: string; assistSailor?: number },
  ) =>
    fetch(url + "/moves", {
      method: "POST",
      headers: {
        Authorization: "Bearer " + token,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ expectedRevision: 3, ...payload }),
    });
  const read = (token: string) =>
    fetch(url, { headers: { Authorization: "Bearer " + token } }).then(
      readSnapshot,
    );
  const pool = new Pool({ connectionString: databaseUrl });
  t.after(async () => {
    try {
      await pool.query("DELETE FROM voyages WHERE id = $1", [room.id]);
    } finally {
      await pool.end();
    }
  });
  const seed = 318;
  const history = ["locker", "swim-0", "line-0"];
  await pool.query("UPDATE voyages SET seed=$1, moves=$2 WHERE id=$3", [
    seed,
    history,
    room.id,
  ]);
  assert.deepEqual((await read(host)).assistSeats, [1]);
  assert.deepEqual((await read(guest)).assistSeats, []);
  assert.equal((await response(guest, { assistSailor: 1 })).status, 422);
  assert.equal((await response(host, { assistSailor: 2 })).status, 422);
  assert.equal(
    (await response(host, { assistSailor: 1, moveId: "hook-1" })).status,
    400,
  );
  const attempts = await Promise.all([
    response(host, { assistSailor: 1 }),
    response(guest, { moveId: "hook-1" }),
  ]);
  assert.deepEqual(
    attempts.map((r) => r.status).toSorted((a, b) => a - b),
    [200, 409],
  );
  const next = await read(guest);
  assert.equal(next.revision, 5);
  assert.equal(next.phase, "event");
  assert.deepEqual(next.acted, [0, 1, 2]);
  const { rows } = await pool.query<{ moves: string[] }>(
    "SELECT moves FROM voyages WHERE id = $1",
    [room.id],
  );
  const recorded = rows[0]?.moves;
  assert.ok(recorded);
  assert.equal(recorded.length, 5);
  assert.deepEqual(next.crew, recorded.reduce(play, start(seed)).crew);

  // An older two-player room can stop here before its host plays the third hand.
  await pool.query("UPDATE voyages SET moves=$1 WHERE id=$2", [
    [...history, "hook-1"],
    room.id,
  ]);
  const recovered = await read(host);
  assert.equal(recovered.phase, "cards");
  assert.deepEqual(recovered.assistSeats, [2]);
  const continued = await fetch(url + "/moves", {
    method: "POST",
    headers: {
      Authorization: "Bearer " + host,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      expectedRevision: recovered.revision,
      assistSailor: 2,
    }),
  });
  assert.equal(continued.status, 200);
  assert.equal((await readSnapshot(continued)).phase, "event");
});
