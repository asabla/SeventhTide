# Seventh Tide

Seventh Tide is a cooperative maritime horror card game for browsers and phones, with a solo mode and seven tides per voyage. Play solo, share a screen, or invite one or two friends to play on separate devices.

## Set up the development tools

On macOS with Homebrew, run `brew install mise`. For other systems, follow the [mise installation guide](https://mise.jdx.dev/installing-mise.html).

Review `mise.toml`, then run these commands from the repository root.

```sh
mise trust
mise install
mise run setup
```

mise reads the Node.js version from `.nvmrc`, the same file used by CI. Node.js includes npm. The setup task runs `npm ci` to install the compiler, linters, formatter, and game dependencies from `package-lock.json`. Run `mise run setup` again when the lockfile changes.

If npm reports an unreviewed dependency install script, setup and CI stop. Review the script before you record an approval or denial in the root `package.json`. We deny install scripts for Vite's optional macOS watcher, `fsevents`, because it ships its native binary.

## Build and run

From the repository root, check and start the game.

```sh
mise exec -- npm run check
mise exec -- npm start
```

For the plain `npm` commands below, activate mise in your shell or prefix each command with `mise exec --`. See the [mise shell setup guide](https://mise.jdx.dev/shell-setup.html).

Open http://127.0.0.1:4173. Fastify serves the built game from `web/dist/`. Set `PORT` to use a different port. For client development, `npm run dev` starts Vite with live updates. Saves belong to the browser origin, so the development and production ports have separate saves.

## Code quality

Run `npm run check` before committing. It checks formatting, type-aware code lint, CSS, HTML, TypeScript, unit tests with coverage, and the production build. Run `npm run format` to apply formatting. Use `npm run lint` or `npm run typecheck` for a focused check.

Oxlint rejects unsafe use of `any`, unhandled promises, import cycles, and unused lint suppressions. TypeScript checks both source and tests, including indexed reads, optional properties, unused parameters, and missing returns. Stylelint checks CSS. HTML Validate checks markup structure and built-in accessibility rules. Prettier checks supported source, configuration, and documentation files. The gate excludes generated bundles and installed packages.

The rule tests must cover at least 95% of lines, 90% of branches, and 95% of functions in the shared rules they load. CI runs two jobs. The first runs `npm run check:ci`, which includes `check` and the PostgreSQL integration tests. To run it locally, set `TEST_DATABASE_URL` to a separate test database. If `check` has already passed, run only `npm run test:db`. The suite starts the built game server and checks persistence after a restart, concurrent moves, seat permissions, swimmer volunteers, and a complete two-player voyage. The second job checks the tide outcome laws.

### Verify the tide outcome laws

From the repository root, run `mise trust verification/tide/mise.toml` once, then `mise -C verification/tide run verify`. The verification configuration pins Bend and Lean for macOS and Linux. The GitHub Actions job `tide-laws` runs the same verification command.

The laws in `verification/tide/LAWS.bend` describe the outcome after all event effects have resolved. Zero hull or any sailor at five or more cold ends the voyage. A surviving crew lands on tide seven and continues on earlier tides. Bend checks the model with the independent kernel. The verification script then compares the model with the phase returned by the TypeScript game rules on boundary cases. This comparison covers outcome selection. The rule tests cover how cards and events change the resources used to select the outcome.

The game imports only the TypeScript rules. The checker generates its reference module in a temporary directory and removes it after the comparison.

## Technology decisions

| Layer          | Choice and responsibility                                                                                                                                                                                                        |
| -------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Client         | TypeScript, Phaser 4, HTML, and CSS. Phaser draws the sea scene. HTML provides card controls, text, focus, and touch interaction. The client loads the engine separately so a player can use the controls while the scene loads. |
| Rules          | A shared TypeScript package. A seed and a list of legal moves reproduce the voyage. Solo play runs the rules on the device. The voyage API runs the same rules before it records a move.                                         |
| Build          | npm workspaces, a committed lockfile, strict TypeScript, Vite, and the Node test runner.                                                                                                                                         |
| Online service | Node.js and Fastify serve the game and expose `GET /api/health`. With PostgreSQL, the server also provides the voyage API. Active rooms poll the API while the tab is visible. WebSockets are planned for future room updates.   |
| Distribution   | Serve the web build to desktop and phone browsers first. Use Tauri 2 for future installable builds. Native packaging and signing will have their own build jobs.                                                                 |

Phaser supplies the 2D rendering and scene tools the illustrated table needs. Using TypeScript on both sides lets a rule change apply to solo and co-op together. The client can use generated paintings, sprite sheets, and rendered views of 3D models as ordinary game art. Keep source art and generation prompts in `art/` and ship optimized images from `web/assets/`.

[Phaser documentation](https://phaser.io/oss/docs) · [Vite production builds](https://vite.dev/guide/build) · [Fastify plugins](https://fastify.dev/ecosystem/) · [Tauri platform support](https://v2.tauri.app/start/)

## Repository layout

- `web/` contains the game client and the Phaser sea scene.
- `packages/rules/` owns the voyage state, legal actions, and tide resolution. It has no dependency on the browser, renderer, or server.
- `server/` contains the Fastify service, voyage routes, and database migrations.
- `tests/` covers voyage rules and browser save data. Its `integration/` suite exercises the HTTP API against PostgreSQL.
- `verification/tide/` contains the tide outcome model, laws, proof, and comparison with the game rules.
- `art/` contains the original illustrations. The [art notes](art/README.md) include the prompts and links to the web exports.

## Crew hands

On new voyages, the first salvage adds two copies of a card to the shared ten-card deck. The ration locker adds Pass the Tin, spare timber adds Emergency Patch, and dry canvas adds Canvas Sling. Each sailor draws two cards before boarding. During boarding, open a card to compare its raft and water effects. Each device shows the hands of the sailors it controls.

Play a held card to discard it and draw its replacement. Basic actions and ration sharing take the sailor’s turn and keep both cards for later. When the draw pile is empty, the crew reshuffles the discard pile. Existing solo saves and stored rooms finish with their original rules.

## The answering light

On tide six, two lanterns appear at the reef. Play Sounding line as the swimmer to mark a channel to the rescue cutter. The card still gives one brace and costs one cold. On tide seven the host can follow that channel without paying a landing cost. The swimmer still gains two cold from exposure. Without the mark, force a landing for four hull before brace, or scout the reef for two extra cold.

Run `mise exec -- node verification/landing/simulate.ts` to compare spending and saving the line on the same 1,024 starting deals. The output includes replayable voyages and a separate count of landings by crews that never held a line.

## Play with friends

Start the server with [PostgreSQL](#durable-voyages). For friends on the same Wi-Fi, set `HOST=0.0.0.0` when starting the server. Open the game using the host computer’s LAN address on **all** devices, including the host. An invite created on `localhost` or `127.0.0.1` points back to the device that opens it. For remote play, use a shared HTTPS address.

Open **Play on separate devices** and choose two or three players. Send each guest their private seat link. The host plays Mara and makes the salvage, boarding, and event decisions. The second player plays Ivo. In a two-player room the host also plays Nell. In a three-player room the third player plays Nell.

During boarding, each player can volunteer or withdraw a sailor they control. The host assigns a volunteer, or any sailor if nobody has volunteered. The preview shows exposure and rations before cards and events change the outcome.

Each device shows the cards its player can use, the last card played, and the sailors still to act. An open room refreshes while its tab is visible. Refreshing the page restores the seat in the same tab. After closing the tab, the host can open the game in the same browser and select **Resume crew voyage** for the most recently hosted room. Guests can also rejoin with their invite link. Anyone with that link can play the seat.

## Durable voyages

The browser saves solo voyages on the device. To enable the voyage API, set `DATABASE_URL` when starting Fastify. On startup, the server applies pending migrations in a transaction. The database user needs permission to create and alter the game tables. For a local database, install Docker with the Compose plugin and start the Docker engine. After building the game, run these commands from the repository root.

```sh
docker compose up -d --wait db
DATABASE_URL=postgres://seventh_tide:local-development@127.0.0.1:55432/seventh_tide npm start
```

The database uses a named volume. Use `docker compose stop db` to stop it between sessions.

| Request                            | Result                                                                                                                                                                                                      |
| ---------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `POST /api/voyages`                | Creates a voyage at revision zero. Returns its ID, current state, legal choices, and an owner token.                                                                                                        |
| `GET /api/voyages/{id}`            | Replays the recorded moves and returns the current state and choices.                                                                                                                                       |
| `POST /api/voyages/{id}/moves`     | Accepts a JSON body such as `{"expectedRevision":0,"moveId":"locker"}`. Select a move ID from the current choices. Returns the new state and revision.                                                      |
| `PUT /api/voyages/{id}/volunteers` | Offers or withdraws a sailor during crew boarding. Send the current `expectedRevision`, a sailor index from `offerSeats`, and `offer` (`true` to volunteer, `false` to withdraw). Returns the updated room. |

To create a single-owner voyage, send the create request without a body. Send `{"players":2}` or `{"players":3}` to create a crew room. The host receives one private token per guest in `invites`. For all subsequent requests, send the seat token in the `Authorization: Bearer <token>` header. The server stores token digests. It filters choices and checks each request against the caller’s seat.

Each voyage stores its initial seed, rules version, and ordered move IDs. Its revision is the number of stored moves. A single conditional database update appends a legal move at the expected revision. A competing write or a repeated submission at an old revision receives HTTP 409. Read the current state before making the next choice. An unavailable move at the current revision receives HTTP 422.

Volunteer changes increment `offerRevision` and leave the voyage revision unchanged. When assigning the swimmer, the client sends the displayed `offerRevision` as `expectedOfferRevision` with the move. If the volunteers have changed, the server returns HTTP 409 so the host can review the current choices.

The server replays voyages with the current rules version and rejects an unsupported version. Before changing a released rule, follow the [replay compatibility steps](.agents/skills/seventh-tide-voyage-rules/SKILL.md).

## Preview the illustrated hand

Open [/hand.html](http://127.0.0.1:4173/hand.html) on the running game server. This standalone study shows Mara using a Sounding line or Boathook. Switch her position to see the other face of each card. Drag a card into **Mara’s play** to apply its effect and cost. You can also select a card, then activate the drop area. Release outside the area or press Escape during a drag to return the card to the hand. Select **Try another play** to reset the study.

[View the equipment hand at phone width](docs/images/equipment-hand-phone.jpg).
