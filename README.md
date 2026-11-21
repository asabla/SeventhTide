# Seventh Tide

Seventh Tide is a cooperative maritime horror card game for browsers and phones, with a solo mode and seven tides per voyage. Play solo, share a screen, or invite one or two friends to play on separate devices.

## Set up the development tools

Install mise on the development machine or cloud image. On macOS with Homebrew, run `brew install mise`. For other systems, follow the [mise installation guide](https://mise.jdx.dev/installing-mise.html).

Review `mise.toml`, then run these commands from the repository root.

```sh
mise trust
mise install
mise run setup
```

mise reads the Node.js version from `.nvmrc`, the same file used by CI. Node.js includes npm. The setup task runs `npm ci` to install the compiler, linters, formatter, and game dependencies from `package-lock.json`. Run `mise run setup` again when the lockfile changes.

If npm reports an unreviewed dependency install script, setup and CI stop. Review the script before you record an approval or denial in the root `package.json`. We deny install scripts for Vite's optional macOS watcher, `fsevents`, because it ships its native binary.

## Build and run

Use these commands to check and start the game in a local terminal or a cloud checkout.

```sh
mise exec -- npm run check
mise exec -- npm start
```

For the plain `npm` commands below, activate mise in your shell or prefix each command with `mise exec --`. See the [mise shell setup guide](https://mise.jdx.dev/shell-setup.html).

Open http://127.0.0.1:4173. Fastify serves the built game from `web/dist/`. Use `HOST=0.0.0.0 npm start` when a cloud environment's private preview needs an external binding. Set `PORT` to use a different port. For client development, `npm run dev` starts Vite with live updates. Saves belong to the browser origin, so the development and production ports have separate saves.

## Code quality

Run `npm run check` before committing. It checks formatting, type-aware code lint, CSS, HTML, TypeScript, unit tests with coverage, and the production build. Run `npm run format` to apply formatting. Use `npm run lint` or `npm run typecheck` for a focused check.

Oxlint rejects unsafe use of `any`, unhandled promises, import cycles, and unused lint suppressions. TypeScript checks both source and tests, including indexed reads, optional properties, unused parameters, and missing returns. Stylelint checks CSS. HTML Validate checks markup structure and built-in accessibility rules. Prettier checks supported source, configuration, and documentation files. The gate excludes generated bundles and installed packages.

The rule tests must cover at least 95% of lines, 90% of branches, and 95% of functions in the shared rules they load. CI runs `npm run check:ci`, which also runs the PostgreSQL integration suite. To run the CI gate locally, set `TEST_DATABASE_URL` to a test database.

### Verify the tide outcome laws

From the repository root, run `mise trust verification/tide/mise.toml` once, then `mise -C verification/tide run verify`. The verification configuration pins Bend and Lean for macOS and Linux. The GitHub Actions job `tide-laws` runs the same verification command.

The laws in `verification/tide/LAWS.bend` describe the outcome after all event effects have resolved. Zero hull or any sailor at five or more cold ends the voyage. A surviving crew lands on tide seven and continues on earlier tides. Bend checks the model with the independent kernel. The verification script then compares the model with the phase returned by the TypeScript game rules on boundary cases. This comparison covers outcome selection. The rule tests cover how cards and events change the resources used to select the outcome.

The game imports only the TypeScript rules. The checker generates its reference module in a temporary directory and removes it after the comparison.

## Technology decisions

| Layer          | Choice and responsibility                                                                                                                                                                                                        |
| -------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Client         | TypeScript, Phaser 4, HTML, and CSS. Phaser draws the sea scene. HTML provides card controls, text, focus, and touch interaction. The client loads the engine separately so a player can use the controls while the scene loads. |
| Rules          | A shared TypeScript package. A seed and a list of legal moves reproduce the voyage. Solo play runs the rules on the device. The voyage API runs the same rules before it records a move.                                         |
| Build          | npm workspaces, a committed lockfile, strict TypeScript, Vite, and the Node test runner. The Linux CI workflow uses the same check command as development.                                                                       |
| Online service | Node.js and Fastify serve the game, expose `GET /api/health`, and provide an HTTP API for durable voyages in PostgreSQL. WebSockets are the selected transport for future room updates.                                          |
| Distribution   | Serve the web build to desktop and phone browsers first. Use Tauri 2 for future installable builds. Native packaging and signing will have their own build jobs.                                                                 |

Phaser supplies the 2D rendering and scene tools the illustrated table needs. Using TypeScript on both sides lets a rule change apply to solo and co-op together. The client can use generated paintings, sprite sheets, and rendered views of 3D models as ordinary game art. Keep source art and generation prompts in `art/` and ship optimized images from `web/assets/`.

[Phaser documentation](https://phaser.io/oss/docs) · [Vite production builds](https://vite.dev/guide/build) · [Fastify plugins](https://fastify.dev/ecosystem/) · [Tauri platform support](https://v2.tauri.app/start/)

## Repository layout

- `web/` contains the game client and the Phaser sea scene.
- `packages/rules/` owns the voyage state, legal actions, and tide resolution. It has no dependency on the browser, renderer, or server.
- `server/` contains the Fastify service, voyage routes, and database migrations.
- `tests/` covers card order, swimmer rewards, replay, and both voyage outcomes.
- `art/` contains original illustrations and their production notes.

## Play with friends

Start the server with PostgreSQL using the commands below. For friends on the same Wi-Fi, set `HOST=0.0.0.0` and open the game using the host computer’s LAN address on **all** devices, including the host. An invite created on `localhost` or `127.0.0.1` points back to the device that opens it. For remote play, use a shared HTTPS address.

Open **Play on separate devices** and choose two or three players. Send each guest their private seat link. The host plays Mara and makes the salvage, boarding, and event decisions. The second player plays Ivo. In a two-player room the host also plays Nell. In a three-player room the third player plays Nell.

During boarding, each player can volunteer or withdraw a sailor they control. The host assigns a volunteer, or any sailor if nobody has volunteered. The preview shows exposure and rations before cards and events change the outcome.

Each device shows the cards its player can use, the last card played, and the sailors still to act. An open room refreshes while its tab is visible. Refreshing the page restores the seat in the same tab. After closing the tab, the host can open the game in the same browser and select **Resume crew voyage** for the most recently hosted room. Guests can also rejoin with their invite link. Anyone with that link can play the seat.

## Durable voyages

The browser currently saves solo voyages on the device. To enable the server's voyage API, set `DATABASE_URL` to a PostgreSQL connection URL. On startup the server applies pending migrations in a transaction. The database user needs permission to create tables. For a local database, install Docker with the Compose plugin and start the Docker engine. Then run the following after the build.

```sh
docker compose up -d --wait db
DATABASE_URL=postgres://seventh_tide:local-development@127.0.0.1:55432/seventh_tide npm start
```

The database uses a named volume. Use `docker compose stop db` to stop it between sessions. In a cloud environment, supply the connection URL for the attached database.

| Request                        | Result                                                                                                                                                 |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `POST /api/voyages`            | Creates a voyage at revision zero. Returns its ID, current state, legal choices, and an owner token.                                                   |
| `GET /api/voyages/{id}`        | Replays the recorded moves and returns the current state and choices.                                                                                  |
| `POST /api/voyages/{id}/moves` | Accepts a JSON body such as `{"expectedRevision":0,"moveId":"locker"}`. Select a move ID from the current choices. Returns the new state and revision. |

For reads and moves, send the token in the `Authorization: Bearer <token>` header. The server stores its digest. A request without a body creates a single-owner voyage. Send `{"players":2}` or `{"players":3}` to create a crew room. The host receives one private token per guest in `invites`. A guest uses their token for the same read and move endpoints. The server filters choices and checks each move against the caller’s seat.

Each voyage stores its initial seed, rules version, and ordered move IDs. Its revision is the number of stored moves. A single conditional database update appends a legal move at the expected revision. A competing write or a repeated submission at an old revision receives HTTP 409. Read the current state before making the next choice. An unavailable move at the current revision receives HTTP 422.

Keep a compatible replay implementation for each released rules version before changing rules that affect saved voyages. The server rejects an unsupported version during replay.

After `npm run check`, run `npm run test:db` with `TEST_DATABASE_URL` set to a separate PostgreSQL test database. The test starts two successive server processes, exercises the HTTP API, and removes its test voyage. CI supplies its own PostgreSQL service.
