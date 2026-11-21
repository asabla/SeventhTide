import { createHash, randomBytes, randomUUID } from "node:crypto";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { Pool } from "pg";
import {
  moves,
  play,
  start,
  rulesVersion,
  type Voyage,
} from "@seventh-tide/rules";
import { migrate } from "./storage.ts";

interface Row {
  id: string;
  seed: string; // PostgreSQL bigint
  rules_version: number;
  moves: string[];
  revision: number;
}

function replay(row: Row) {
  if (row.rules_version !== rulesVersion)
    throw new Error("Unsupported voyage rules version.");
  return row.moves.reduce(play, start(Number(row.seed)));
}

function snapshot(row: Row, state: Voyage) {
  const event = state.events[state.tide - 1];
  return {
    id: row.id,
    revision: row.revision,
    rulesVersion: row.rules_version,
    phase: state.phase,
    tide: state.tide,
    hull: state.hull,
    crew: state.crew,
    swimmer: state.swimmer,
    acted: state.acted,
    guard: state.guard,
    log: state.log,
    forecast: state.phase === "salvage" ? null : event[1],
    event:
      state.phase === "event"
        ? { title: event[0], description: event[2] }
        : null,
    choices: moves(state),
  };
}

const params = {
  type: "object",
  required: ["id"],
  properties: { id: { type: "string", format: "uuid" } },
};

function digest(token: string) {
  return createHash("sha256").update(token).digest();
}

export async function voyageRoutes(
  app: FastifyInstance,
  options: { databaseUrl: string },
) {
  const pool = new Pool({
    connectionString: options.databaseUrl,
    connectionTimeoutMillis: 5000,
  });
  pool.on("error", (err) =>
    app.log.error({ err }, "Idle database connection failed"),
  );
  app.addHook("onClose", () => pool.end());
  try {
    await migrate(pool);
  } catch (error) {
    await pool.end();
    throw error;
  }

  app.addHook("onRequest", async (_request, reply) => {
    reply.header("Cache-Control", "no-store");
  });
  app.setErrorHandler(
    (error: Error & { statusCode?: number }, request, reply) => {
      if (error.statusCode && error.statusCode < 500)
        return reply.code(error.statusCode).send({ error: error.message });
      request.log.error({ err: error }, "Voyage operation failed");
      return reply.code(500).send({ error: "Voyage operation failed." });
    },
  );

  async function load(
    request: FastifyRequest<{ Params: { id: string } }>,
    reply: FastifyReply,
  ) {
    const token = /^Bearer ([A-Za-z0-9_-]{43})$/.exec(
      request.headers.authorization ?? "",
    )?.[1];
    if (!token) {
      reply
        .header("WWW-Authenticate", "Bearer")
        .code(401)
        .send({ error: "Voyage token required." });
      return;
    }
    const result = await pool.query<Row>(
      "SELECT id, rules_version, seed, moves, revision FROM voyages WHERE id = $1 AND owner_digest = $2",
      [request.params.id, digest(token)],
    );
    const row = result.rows[0];
    if (!row) reply.code(404).send({ error: "Voyage unavailable." });
    return row;
  }

  app.post("/", async (_request, reply) => {
    const token = randomBytes(32).toString("base64url");
    const result = await pool.query<Row>(
      "INSERT INTO voyages (id, owner_digest, rules_version, seed) VALUES ($1, $2, $3, $4) RETURNING id, rules_version, seed, moves, revision",
      [
        randomUUID(),
        digest(token),
        rulesVersion,
        randomBytes(4).readUInt32BE(),
      ],
    );
    const row = result.rows[0];
    return reply.code(201).send({ ...snapshot(row, replay(row)), token });
  });

  app.get<{ Params: { id: string } }>(
    "/:id",
    { schema: { params } },
    async (request, reply) => {
      const row = await load(request, reply);
      if (row) return snapshot(row, replay(row));
    },
  );

  app.post<{
    Params: { id: string };
    Body: { expectedRevision: number; moveId: string };
  }>(
    "/:id/moves",
    {
      schema: {
        params,
        body: {
          type: "object",
          required: ["expectedRevision", "moveId"],
          properties: {
            expectedRevision: {
              type: "integer",
              minimum: 0,
              maximum: 2147483647,
            },
            moveId: { type: "string", minLength: 1, maxLength: 64 },
          },
        },
      },
    },
    async (request, reply) => {
      const row = await load(request, reply);
      if (!row) return;
      const { expectedRevision, moveId } = request.body;
      const conflict = () =>
        reply
          .code(409)
          .send({ error: "Voyage changed. Reload before choosing a move." });
      if (row.revision !== expectedRevision) return conflict();
      const before = replay(row);
      if (!moves(before).some((move) => move.id === moveId)) {
        return reply.code(422).send({ error: "This move is unavailable." });
      }
      const next = play(before, moveId);
      // PostgreSQL checks this condition again after waiting for a concurrent writer.
      const updated = await pool.query<Row>(
        "UPDATE voyages SET moves = array_append(moves, $1::text) WHERE id = $2 AND revision = $3 RETURNING id, rules_version, seed, moves, revision",
        [moveId, row.id, expectedRevision],
      );
      if (!updated.rowCount) return conflict();
      return snapshot(updated.rows[0], next);
    },
  );
}
