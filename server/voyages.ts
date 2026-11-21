import { createHash, createHmac, randomBytes, randomUUID } from "node:crypto";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { Pool } from "pg";
import {
  currentEvent,
  handPreview,
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
  volunteer_mask: number;
  offer_revision: number;
  guests: number;
  seat: number;
}

function replay(row: Row) {
  return row.moves.reduce(play, start(Number(row.seed), row.rules_version));
}

function guestToken(owner: string, seat: number) {
  return createHmac("sha256", owner)
    .update("crew-seat-" + seat)
    .digest("base64url");
}

function controls(row: Row, sailor: number) {
  return row.seat === (sailor > row.guests ? 0 : sailor);
}

function volunteered(row: Row, sailor: number) {
  return (row.volunteer_mask & (1 << sailor)) !== 0;
}

function crewChoices(row: Row, state: Voyage) {
  return moves(state).filter(({ actor, id }) => {
    if (state.phase === "board" && row.volunteer_mask)
      return row.seat === 0 && volunteered(row, Number(id.slice(5)));
    if (actor === undefined) return row.seat === 0;
    return controls(row, actor);
  });
}

function snapshot(row: Row, state: Voyage, token: string) {
  const event = currentEvent(state);
  return {
    id: row.id,
    revision: row.revision,
    rulesVersion: row.rules_version,
    phase: state.phase,
    tide: state.tide,
    hull: state.hull,
    crew: state.crew,
    hands: state.crew.map((_, i) =>
      controls(row, i) ? handPreview(state.deck, i) : [],
    ),
    swimmer: state.swimmer,
    acted: state.acted,
    guard: state.guard,
    log: state.log,
    forecast: state.phase === "salvage" ? null : event[1],
    event:
      state.phase === "event"
        ? { title: event[0], description: event[2] }
        : null,
    choices: crewChoices(row, state),
    offerRevision: row.offer_revision,
    volunteers: state.crew.flatMap((_, i) => (volunteered(row, i) ? [i] : [])),
    offerSeats:
      state.phase === "board" && row.guests > 0
        ? state.crew.flatMap((_, i) => (controls(row, i) ? [i] : []))
        : [],
    seat: row.seat,
    players: row.guests + 1,
    invites:
      row.seat === 0
        ? Array.from({ length: row.guests }, (_, i) => guestToken(token, i + 1))
        : [],
  };
}

export type RoomSnapshot = ReturnType<typeof snapshot>;

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
      return undefined;
    }
    const result = await pool.query<Row>(
      `SELECT id, rules_version, seed, moves, revision, volunteer_mask, offer_revision, cardinality(guest_digests) AS guests,
              COALESCE(array_position(guest_digests, $2::bytea), 0) AS seat
         FROM voyages WHERE id = $1 AND (owner_digest = $2 OR $2 = ANY(guest_digests))`,
      [request.params.id, digest(token)],
    );
    const row = result.rows[0];
    if (!row) reply.code(404).send({ error: "Voyage unavailable." });
    return row && { row, token };
  }

  app.post<{ Body: { players?: number } | null }>(
    "/",
    {
      schema: {
        body: {
          type: ["object", "null"],
          additionalProperties: false,
          properties: {
            players: { type: "integer", enum: [2, 3] },
          },
        },
      },
    },
    async (request, reply) => {
      const token = randomBytes(32).toString("base64url");
      const guests = Array.from(
        { length: (request.body?.players ?? 1) - 1 },
        (_, i) => digest(guestToken(token, i + 1)),
      );
      const result = await pool.query<Row>(
        "INSERT INTO voyages (id, owner_digest, rules_version, seed, guest_digests) VALUES ($1, $2, $3, $4, $5) RETURNING id, rules_version, seed, moves, revision, volunteer_mask, offer_revision, cardinality(guest_digests) AS guests, 0 AS seat",
        [
          randomUUID(),
          digest(token),
          rulesVersion,
          randomBytes(4).readUInt32BE(),
          guests,
        ],
      );
      const row = result.rows[0];
      if (!row) throw new Error("Created voyage is missing.");
      return reply
        .code(201)
        .send({ ...snapshot(row, replay(row), token), token });
    },
  );

  app.get<{ Params: { id: string } }>(
    "/:id",
    { schema: { params } },
    async (request, reply) => {
      const session = await load(request, reply);
      return session
        ? snapshot(session.row, replay(session.row), session.token)
        : reply;
    },
  );

  app.put<{
    Params: { id: string };
    Body: { expectedRevision: number; sailor: number; offer: boolean };
  }>(
    "/:id/volunteers",
    {
      schema: {
        params,
        body: {
          type: "object",
          required: ["expectedRevision", "sailor", "offer"],
          properties: {
            expectedRevision: {
              type: "integer",
              minimum: 0,
              maximum: 2147483647,
            },
            sailor: { type: "integer", minimum: 0, maximum: 2 },
            offer: { type: "boolean" },
          },
        },
      },
    },
    async (request, reply) => {
      const session = await load(request, reply);
      if (!session) return reply;
      const { row, token } = session;
      const { expectedRevision, sailor, offer } = request.body;
      if (row.revision !== expectedRevision)
        return reply.code(409).send({ error: "The voyage has changed." });
      const state = replay(row);
      if (state.phase !== "board" || !row.guests || !controls(row, sailor))
        return reply
          .code(422)
          .send({ error: "This sailor cannot volunteer now." });
      const update = await pool.query<
        Pick<Row, "volunteer_mask" | "offer_revision">
      >(
        `UPDATE voyages SET volunteer_mask = CASE WHEN $3 THEN volunteer_mask | $4 ELSE volunteer_mask & ~$4 END,
          offer_revision = offer_revision + CASE WHEN ((volunteer_mask & $4) <> 0) = $3 THEN 0 ELSE 1 END
        WHERE id = $1 AND revision = $2 RETURNING volunteer_mask, offer_revision`,
        [row.id, expectedRevision, offer, 1 << sailor],
      );
      const saved = update.rows[0];
      if (!saved) return reply.code(409).send({ error: "Boarding has ended." });
      return snapshot({ ...row, ...saved }, state, token);
    },
  );

  app.post<{
    Params: { id: string };
    Body: {
      expectedRevision: number;
      moveId: string;
      expectedOfferRevision?: number;
    };
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
            expectedOfferRevision: {
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
      const session = await load(request, reply);
      if (!session) return reply;
      const { row, token } = session;
      const { expectedRevision, moveId } = request.body;
      const conflict = () =>
        reply
          .code(409)
          .send({ error: "Voyage changed. Reload before choosing a move." });
      if (
        row.revision !== expectedRevision ||
        (request.body.expectedOfferRevision !== undefined &&
          request.body.expectedOfferRevision !== row.offer_revision)
      )
        return conflict();
      const before = replay(row);
      if (!crewChoices(row, before).some((move) => move.id === moveId)) {
        return reply.code(422).send({ error: "This move is unavailable." });
      }
      const next = play(before, moveId);
      // PostgreSQL checks this condition again after waiting for a concurrent writer.
      const updated = await pool.query<
        Pick<Row, "revision" | "volunteer_mask">
      >(
        "UPDATE voyages SET moves = array_append(moves, $1::text), volunteer_mask = 0 WHERE id = $2 AND revision = $3 AND offer_revision = $4 RETURNING revision, volunteer_mask",
        [moveId, row.id, expectedRevision, row.offer_revision],
      );
      const saved = updated.rows[0];
      if (!saved) return conflict();
      return snapshot({ ...row, ...saved }, next, token);
    },
  );
}
