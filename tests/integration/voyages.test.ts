import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { createInterface } from "node:readline";
import test, { type TestContext } from "node:test";
import { Pool } from "pg";
import { start, play, moves, rulesVersion } from "@seventh-tide/rules";

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
