# Hosting multiplayer

The Fastify server serves the production build. Set `DATABASE_URL` to enable multiplayer. On startup, the server applies pending migrations in a transaction, so the database user needs permission to create and alter the game tables.

## Start a local server

Complete the [local setup and build](../README.md#run-locally). Install Docker with the Compose plugin and start the Docker engine. Run these commands from the repository root.

```sh
docker compose up -d --wait db
export DATABASE_URL=postgres://seventh_tide:local-development@127.0.0.1:55432/seventh_tide
mise exec -- npm start
```

If the solo server is already running, stop it before starting this server on the same port. Open [127.0.0.1:4173](http://127.0.0.1:4173). The database uses a named volume. Run `docker compose stop db` to stop it between sessions.

## Invite friends on other devices

For players on the same network, stop the local server and run this command in the same shell with `DATABASE_URL` set.

```sh
HOST=0.0.0.0 mise exec -- npm start
```

Open the game using the host computer’s LAN address on every device, including the host. Create the invite from that address so it points to the same server when a friend opens it. For remote play, use a shared HTTPS address. Choose **Invite one friend** or **Invite two friends** from the launch table and share each private seat link. [See how crew seats work](playing.md#start-a-voyage)

`HOST` defaults to `127.0.0.1` and `PORT` defaults to `4173`. Check `GET /api/health` to confirm the server is running.

## Voyage API

A create request without a body starts a single-owner voyage with two bots. Send `{"players":2,"prepareCrew":true}` for a two-player lobby or use `3` for three players. Omit `prepareCrew` to start at salvage. The host receives a token and one private token per guest in `invites`. Send the seat token in the `Authorization: Bearer <token>` header for subsequent requests. The server stores token digests and checks which choices each seat can make.

| Request                                      | Result                                                                                                             |
| -------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| `POST /api/voyages`                          | Creates a voyage and returns the state, choices, and owner token.                                                  |
| `GET /api/voyages/{id}`                      | Replays the move history and returns the current state and the caller’s choices.                                   |
| `PUT /api/voyages/{id}/seat`                 | Marks the caller’s seat as joined.                                                                                 |
| `PUT /api/voyages/{id}/launch`               | Lets the host or helm begin a prepared voyage.                                                                     |
| `PUT /api/voyages/{id}/presence`             | Records presence when the caller is at the helm.                                                                   |
| `PUT /api/voyages/{id}/helm`                 | Lets a joined friend take an unattended helm.                                                                      |
| `PUT /api/voyages/{id}/signal`               | Sets or clears the caller’s signal during card play.                                                               |
| `PUT /api/voyages/{id}/route-recommendation` | Records a guest’s route recommendation. Send `expectedRevision` and an available `routeId`, or `null` to withdraw. |
| `PUT /api/voyages/{id}/volunteers`           | Offers or withdraws a sailor during boarding. Send `expectedRevision`, the sailor index, and the boolean `offer`.  |
| `POST /api/voyages/{id}/moves`               | Accepts a move such as `{"expectedRevision":0,"moveId":"locker"}` from the caller’s legal choices.                 |
| `POST /api/voyages/{id}/rematch`             | Lets the host or current helm prepare the next voyage after rescue or loss.                                        |

Each voyage stores its starting seed, rules version, and ordered move IDs. A single conditional update appends the chosen move and any automatic bot moves at the expected revision. The revision is the number of recorded moves. The helm can send `assistSailor` in place of `moveId` for a sailor in `assistSeats`.

Volunteer changes increment `offerRevision`. When assigning the swimmer, send it with the move as `expectedOfferRevision` to detect changes to the volunteer list. The server returns HTTP 409 when a submitted revision is stale and HTTP 422 when a move is unavailable at the current revision.

See [the server routes](../server/voyages.ts) for the request schemas.
