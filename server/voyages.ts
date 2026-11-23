import { createHash, createHmac, randomBytes, randomUUID } from "node:crypto";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { Pool } from "pg";
import {
  bellBuoy,
  currentEvent,
  handPreview,
  moves,
  play,
  previewRoutes,
  secondWake,
  reefPursuit,
  underRaft,
  lockerFind,
  start,
  rulesVersion,
  type Voyage,
} from "@seventh-tide/rules";
import {
  assistSeats,
  botMove,
  channelScouts,
  playWithBots,
  seatMoves,
} from "@seventh-tide/rules/crew";
import { crewSignals, type CrewSignal } from "../shared/crew-signals.ts";
import { migrate } from "./storage.ts";

interface Row {
  id: string;
  seed: string; // PostgreSQL bigint
  rules_version: number;
  moves: string[];
  revision: number;
  volunteer_mask: number;
  offer_revision: number;
  crew_launched: boolean;
  joined_mask: number;
  crew_revision: number;
  assisted_tides: Record<number, number>;
  crew_signals: Partial<Record<number, CrewSignal>>;
  route_recommendations: Partial<Record<number, string>>;
  rematch_id: string | null;
  previous_voyage: string | null;
  helm_seat: number;
  helm_away: boolean;
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

function volunteered(row: Row, sailor: number) {
  return (row.volunteer_mask & (1 << sailor)) !== 0;
}

function crewChoices(row: Row, state: Voyage) {
  if (!row.crew_launched) return [];
  const volunteers = state.crew.flatMap((_, i) =>
    volunteered(row, i) ? [i] : [],
  );
  return seatMoves(state, row.seat, row.guests + 1, volunteers, row.helm_seat);
}

function snapshot(row: Row, state: Voyage, token: string) {
  const event = currentEvent(state);
  const routes = previewRoutes(state);
  return {
    id: row.id,
    revision: row.revision,
    rulesVersion: row.rules_version,
    crewLaunched: row.crew_launched,
    joinedSeats: Array.from({ length: row.guests + 1 }, (_, i) => i).filter(
      (i) => (row.joined_mask & (1 << i)) !== 0,
    ),
    crewRevision: row.crew_revision,
    rematchId: row.rematch_id,
    sameCrew: row.previous_voyage !== null,
    helmSeat: row.helm_seat,
    helmAway:
      row.crew_launched &&
      row.guests > 0 &&
      row.helm_away &&
      state.phase !== "won" &&
      state.phase !== "lost",
    signals: state.crew.map((_, i) =>
      state.phase === "cards" || state.phase === "event"
        ? (row.crew_signals[i] ?? null)
        : null,
    ),
    routeRecommendations: state.crew.map((_, seat) =>
      row.crew_launched &&
      state.phase === "event" &&
      seat !== row.helm_seat &&
      seat <= row.guests
        ? (row.route_recommendations[seat] ?? null)
        : null,
    ),
    assistedTide: row.assisted_tides[row.seat] ?? null,
    coveredSeats: state.crew.flatMap((_, i) =>
      row.assisted_tides[i] === state.tide ? [i] : [],
    ),
    phase: state.phase,
    tide: state.tide,
    channelMarked: state.channelMarked,
    wake: secondWake(state),
    reefPursuit: reefPursuit(state),
    buoy: bellBuoy(state),
    underRaft: underRaft(state),
    lockerFind: lockerFind(state),
    hull: state.hull,
    crew: state.crew,
    hands: state.crew.map((_, i) =>
      i === row.seat ? handPreview(state.deck, i) : [],
    ),
    swimmer: state.swimmer,
    acted: state.acted,
    plays: state.plays,
    tideResult: state.tideResult,
    guard: state.guard,
    log: state.log,
    forecast: state.phase === "salvage" ? null : event[1],
    forecastTitle: state.phase === "cards" ? event[0] : null,
    event:
      state.phase === "event"
        ? {
            title: event[0],
            description: event[2],
            routes,
            landingRoutes:
              state.tide === 7 && state.channelMarked !== undefined
                ? routes.map(({ name, detail }) => ({ name, detail }))
                : [],
          }
        : null,
    choices: crewChoices(row, state),
    assistSeats: assistSeats(state, row.seat, row.guests + 1, row.helm_seat),
    channelScouts: state.phase === "board" ? channelScouts(state) : [],
    offerRevision: row.offer_revision,
    volunteers: state.crew.flatMap((_, i) => (volunteered(row, i) ? [i] : [])),
    offerSeats: state.phase === "board" && row.guests > 0 ? [row.seat] : [],
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

const helmExpired = "helm_seen_at + interval '90 seconds' <= now()";
const crewColumns = `crew_launched, joined_mask, crew_revision, assisted_tides, crew_signals, route_recommendations,
  helm_seat, (${helmExpired}) AS helm_away`;
const roomColumns = `id, rules_version, seed, moves, revision, volunteer_mask, offer_revision,
  ${crewColumns}, previous_voyage, cardinality(guest_digests) AS guests,
  (SELECT next.id FROM voyages AS next WHERE next.previous_voyage = voyages.id) AS rematch_id`;
type CrewState = Pick<
  Row,
  | "crew_launched"
  | "joined_mask"
  | "crew_revision"
  | "assisted_tides"
  | "crew_signals"
  | "route_recommendations"
  | "helm_seat"
  | "helm_away"
>;

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
      `SELECT ${roomColumns},
              COALESCE(array_position(guest_digests, $2::bytea), 0) AS seat
         FROM voyages WHERE id = $1 AND (owner_digest = $2 OR $2 = ANY(guest_digests))`,
      [request.params.id, digest(token)],
    );
    const row = result.rows[0];
    if (!row) reply.code(404).send({ error: "Voyage unavailable." });
    return row && { row, token };
  }

  app.post<{ Body: { players?: number; prepareCrew?: boolean } | null }>(
    "/",
    {
      schema: {
        body: {
          type: ["object", "null"],
          additionalProperties: false,
          properties: {
            players: { type: "integer", enum: [2, 3] },
            prepareCrew: { type: "boolean" },
          },
          dependencies: { prepareCrew: ["players"] },
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
        `INSERT INTO voyages (id, owner_digest, rules_version, seed, guest_digests, crew_launched)
          VALUES ($1, $2, $3, $4, $5, $6) RETURNING ${roomColumns}, 0 AS seat`,
        [
          randomUUID(),
          digest(token),
          rulesVersion,
          randomBytes(4).readUInt32BE(),
          guests,
          !request.body?.prepareCrew,
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

  app.post<{ Params: { id: string } }>(
    "/:id/rematch",
    { schema: { params } },
    async (request, reply) => {
      const session = await load(request, reply);
      if (!session) return reply;
      const { row } = session;
      if (row.seat !== 0)
        return reply
          .code(403)
          .send({ error: "Only the host can prepare another voyage." });
      const { phase } = replay(row);
      if (!row.guests || (phase !== "won" && phase !== "lost"))
        return reply
          .code(422)
          .send({ error: "The crew must finish this voyage first." });
      if (row.rematch_id) return { id: row.rematch_id };

      // A unique predecessor allows only one successor even when hosts retry together.
      const created = await pool.query<{ id: string }>(
        `INSERT INTO voyages (id, owner_digest, rules_version, seed, guest_digests, crew_launched, previous_voyage)
          SELECT $2, owner_digest, $3, $4, guest_digests, false, id FROM voyages WHERE id = $1
          ON CONFLICT (previous_voyage) DO NOTHING RETURNING id`,
        [row.id, randomUUID(), rulesVersion, randomBytes(4).readUInt32BE()],
      );
      if (created.rows[0]) return created.rows[0];
      const existing = await pool.query<{ id: string }>(
        "SELECT id FROM voyages WHERE previous_voyage = $1",
        [row.id],
      );
      if (!existing.rows[0])
        return reply.code(404).send({ error: "Voyage unavailable." });
      return existing.rows[0];
    },
  );

  app.put<{ Params: { id: string } }>(
    "/:id/seat",
    { schema: { params } },
    async (request, reply) => {
      const session = await load(request, reply);
      if (!session) return reply;
      const { row, token } = session;
      const seatBit = 1 << row.seat;
      if (row.joined_mask & seatBit) return snapshot(row, replay(row), token);
      const joined = await pool.query<Row>(
        `UPDATE voyages SET joined_mask = joined_mask | $3,
          crew_revision = crew_revision + CASE WHEN (joined_mask & $3) = 0 THEN 1 ELSE 0 END
          WHERE id = $1 RETURNING ${roomColumns}, $2::integer AS seat`,
        [row.id, row.seat, seatBit],
      );
      const saved = joined.rows[0];
      if (!saved) return reply.code(404).send({ error: "Voyage unavailable." });
      return snapshot(saved, replay(saved), token);
    },
  );

  app.put<{ Params: { id: string } }>(
    "/:id/launch",
    { schema: { params } },
    async (request, reply) => {
      const session = await load(request, reply);
      if (!session) return reply;
      const { row, token } = session;
      if (row.seat !== 0)
        return reply
          .code(403)
          .send({ error: "Only the host can begin the voyage." });
      if (row.crew_launched) return snapshot(row, replay(row), token);
      const launched = await pool.query<Row>(
        `UPDATE voyages SET crew_launched = true,
          helm_seen_at = now(),
          crew_revision = crew_revision + CASE WHEN crew_launched THEN 0 ELSE 1 END
          WHERE id = $1 RETURNING ${roomColumns}, 0 AS seat`,
        [row.id],
      );
      const saved = launched.rows[0];
      if (!saved) return reply.code(404).send({ error: "Voyage unavailable." });
      return snapshot(saved, replay(saved), token);
    },
  );

  app.put<{ Params: { id: string } }>(
    "/:id/presence",
    { schema: { params } },
    async (request, reply) => {
      const session = await load(request, reply);
      if (!session) return reply;
      const { row, token } = session;
      if (!row.crew_launched || !row.guests || row.seat !== row.helm_seat)
        return snapshot(row, replay(row), token);
      const updated = await pool.query<Row>(
        `UPDATE voyages SET helm_seen_at = now()
          WHERE id = $1 AND helm_seat = $2 AND helm_seen_at + interval '15 seconds' <= now()
          RETURNING ${roomColumns}, $2::integer AS seat`,
        [row.id, row.seat],
      );
      const present = updated.rows[0] ?? row;
      return snapshot(present, replay(present), token);
    },
  );

  app.put<{ Params: { id: string } }>(
    "/:id/helm",
    { schema: { params } },
    async (request, reply) => {
      const session = await load(request, reply);
      if (!session) return reply;
      const { row, token } = session;
      const state = replay(row);
      if (
        !row.crew_launched ||
        !row.guests ||
        state.phase === "won" ||
        state.phase === "lost"
      )
        return reply
          .code(422)
          .send({ error: "The crew cannot change the helm right now." });
      if (row.seat === row.helm_seat) return snapshot(row, state, token);
      const updated = await pool.query<Row>(
        `UPDATE voyages SET helm_seat = $2, helm_seen_at = now(), crew_revision = crew_revision + 1,
          route_recommendations = route_recommendations - $2::text
          WHERE id = $1 AND revision = $3 AND helm_seat = $4 AND (${helmExpired})
            AND (joined_mask & (1 << $2::integer)) <> 0
          RETURNING ${roomColumns}, $2::integer AS seat`,
        [row.id, row.seat, row.revision, row.helm_seat],
      );
      const lead = updated.rows[0];
      if (!lead)
        return reply.code(409).send({ error: "The helm is no longer open." });
      return snapshot(lead, state, token);
    },
  );

  app.put<{
    Params: { id: string };
    Body: { tide: number; signal: CrewSignal | null };
  }>(
    "/:id/signal",
    {
      schema: {
        params,
        body: {
          type: "object",
          required: ["tide", "signal"],
          additionalProperties: false,
          properties: {
            tide: { type: "integer", minimum: 1, maximum: 7 },
            signal: {
              anyOf: [{ type: "string", enum: crewSignals }, { type: "null" }],
            },
          },
        },
      },
    },
    async (request, reply) => {
      const session = await load(request, reply);
      if (!session) return reply;
      const { row, token } = session;
      const { tide, signal } = request.body;
      const state = replay(row);
      if (state.tide !== tide || state.phase !== "cards")
        return reply
          .code(409)
          .send({ error: "Signals are open during card play." });
      const result = await pool.query<Row>(
        `UPDATE voyages SET
          crew_signals = CASE WHEN $4::text IS NULL THEN crew_signals - $3::text
            ELSE crew_signals || jsonb_build_object($3::text, $4::text) END,
          crew_revision = crew_revision + CASE WHEN crew_signals ->> $3::text IS DISTINCT FROM $4::text THEN 1 ELSE 0 END
          WHERE id = $1 AND revision = $2 RETURNING ${roomColumns}, $3::integer AS seat`,
        [row.id, row.revision, row.seat, signal],
      );
      const saved = result.rows[0];
      if (!saved) return reply.code(409).send({ error: "The tide changed." });
      return snapshot(saved, state, token);
    },
  );

  app.put<{
    Params: { id: string };
    Body: { expectedRevision: number; routeId: string | null };
  }>(
    "/:id/route-recommendation",
    {
      schema: {
        params,
        body: {
          type: "object",
          required: ["expectedRevision", "routeId"],
          additionalProperties: false,
          properties: {
            expectedRevision: {
              type: "integer",
              minimum: 0,
              maximum: 2147483647,
            },
            routeId: {
              anyOf: [
                { type: "string", minLength: 1, maxLength: 64 },
                { type: "null" },
              ],
            },
          },
        },
      },
    },
    async (request, reply) => {
      const session = await load(request, reply);
      if (!session) return reply;
      const { row, token } = session;
      const { expectedRevision, routeId } = request.body;
      if (row.seat === row.helm_seat)
        return reply
          .code(403)
          .send({ error: "The sailor at the helm chooses the route." });
      const conflict = () =>
        reply.code(409).send({ error: "The route decision has changed." });
      if (!row.crew_launched || row.revision !== expectedRevision)
        return conflict();
      const state = replay(row);
      if (state.phase !== "event") return conflict();
      if (routeId !== null && !moves(state).some(({ id }) => id === routeId))
        return reply.code(422).send({ error: "This route is unavailable." });
      const result = await pool.query<Row>(
        `UPDATE voyages SET
          route_recommendations = CASE WHEN $4::text IS NULL THEN route_recommendations - $3::text
            ELSE route_recommendations || jsonb_build_object($3::text, $4::text) END,
          crew_revision = crew_revision + CASE WHEN route_recommendations ->> $3::text IS DISTINCT FROM $4::text THEN 1 ELSE 0 END
          WHERE id = $1 AND revision = $2 AND helm_seat = $5
          RETURNING ${roomColumns}, $3::integer AS seat`,
        [row.id, expectedRevision, row.seat, routeId, row.helm_seat],
      );
      const saved = result.rows[0];
      if (!saved) return conflict();
      return snapshot(saved, state, token);
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
      if (state.phase !== "board" || !row.guests || sailor !== row.seat)
        return reply
          .code(422)
          .send({ error: "This sailor cannot volunteer now." });
      const update = await pool.query<
        Pick<Row, "volunteer_mask" | "offer_revision"> & CrewState
      >(
        `UPDATE voyages SET volunteer_mask = CASE WHEN $3 THEN volunteer_mask | $4 ELSE volunteer_mask & ~$4 END,
          offer_revision = offer_revision + CASE WHEN ((volunteer_mask & $4) <> 0) = $3 THEN 0 ELSE 1 END
        WHERE id = $1 AND revision = $2
        RETURNING volunteer_mask, offer_revision, ${crewColumns}`,
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
      moveId?: string;
      assistSailor?: number;
      expectedOfferRevision?: number;
    };
  }>(
    "/:id/moves",
    {
      schema: {
        params,
        body: {
          type: "object",
          required: ["expectedRevision"],
          oneOf: [{ required: ["moveId"] }, { required: ["assistSailor"] }],
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
            assistSailor: { type: "integer", minimum: 0, maximum: 2 },
          },
        },
      },
    },
    async (request, reply) => {
      const session = await load(request, reply);
      if (!session) return reply;
      const { row, token } = session;
      const { expectedRevision, moveId, assistSailor } = request.body;
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
      const players = row.guests + 1;
      const choice =
        assistSailor === undefined
          ? crewChoices(row, before).find((move) => move.id === moveId)
          : assistSeats(before, row.seat, players, row.helm_seat).includes(
                assistSailor,
              )
            ? botMove(before, assistSailor)
            : undefined;
      if (!choice) {
        return reply.code(422).send({ error: "This move is unavailable." });
      }
      const next = playWithBots(before, choice.id, players);
      const assisted =
        assistSailor !== undefined && assistSailor < players
          ? { [assistSailor]: before.tide }
          : {};
      // PostgreSQL checks this condition again after waiting for a concurrent writer.
      const updated = await pool.query<
        Pick<Row, "revision" | "volunteer_mask"> & CrewState
      >(
        `UPDATE voyages SET moves = moves || $1::text[], volunteer_mask = 0,
          assisted_tides = assisted_tides || $5::jsonb,
          crew_signals = CASE WHEN $6::boolean THEN '{}'::jsonb ELSE crew_signals END,
          route_recommendations = CASE WHEN $6::boolean THEN '{}'::jsonb ELSE route_recommendations END,
          helm_seen_at = CASE WHEN helm_seat = $8 THEN now() ELSE helm_seen_at END
          WHERE id = $2 AND revision = $3 AND offer_revision = $4 AND helm_seat = $7
          RETURNING revision, volunteer_mask, ${crewColumns}`,
        [
          next.history,
          row.id,
          expectedRevision,
          row.offer_revision,
          JSON.stringify(assisted),
          before.phase === "event",
          row.helm_seat,
          row.seat,
        ],
      );
      const saved = updated.rows[0];
      if (!saved) return conflict();
      return snapshot({ ...row, ...saved }, next.state, token);
    },
  );
}
