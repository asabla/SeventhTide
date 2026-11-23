# Seventh Tide

Seventh Tide is a cooperative maritime horror card game designed for a desktop browser. Survive seven tides with two bot crewmates or invite one or two friends to join from their own devices.

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

For player-facing changes, follow the [UX guide](docs/ux.md) and verify the interaction in the running game.

Run `npm run check` before committing. It checks formatting, type-aware code lint, CSS, HTML, TypeScript, unit tests with coverage, and the production build. Run `npm run format` to apply formatting. Use `npm run lint` or `npm run typecheck` for a focused check.

Oxlint rejects unsafe use of `any`, unhandled promises, import cycles, and unused lint suppressions. TypeScript checks both source and tests, including indexed reads, optional properties, unused parameters, and missing returns. Stylelint checks CSS. HTML Validate checks markup structure and built-in accessibility rules. Prettier checks supported source, configuration, and documentation files. The gate excludes generated bundles and installed packages.

The rule tests must cover at least 95% of lines, 90% of branches, and 95% of functions in the shared rules they load. CI runs two jobs. The first runs `npm run check:ci`. It includes `check`, PostgreSQL integration tests, and a seeded simulation. Set `TEST_DATABASE_URL` to a separate test database to run it locally. The integration suite checks persistence, concurrent moves and bot assistance, private seats, and complete voyages. The second job checks the tide outcome laws.

### Simulate voyages

Run `mise exec -- npm run simulate` to check 512 seeds. Use `mise exec -- npm run simulate -- 1024 2048` to check 1,024 seeds from index 2,048. The simulator uses the same seat and bot functions as the game. It runs solo, two-player, three-player, and absent-friend voyages with cautious and random choices. It checks that pending turns advance, each voyage ends within 37 recorded moves, and replay reproduces the exact result. The JSON report includes sample seeds and move histories for rescues and losses. CI runs the same simulation on 256 seeds.

Run `mise exec -- npm run balance -- 512 1024 11` to play both offered salvage choices on the same 512 deals, starting at index 1,024 with rules version 11. The report separates crew sizes and policies. The mixed policy chooses one legal card or crew action at random on half of its turns and uses cautious boarding and route decisions. Run again with version 10 to compare the same deals against the previous opening. Each encounter lists the routes offered, the times each survived the tide, and the times it was the only surviving choice. The report distinguishes voyages that had a safe route from voyages that reached a decision with no path to survival.

Run `mise exec -- npm run audit:routes -- 128 1024` to follow every legal route at each decision reached on the sampled deals. Each continuation starts from the same crew, hull, deck, and policy state. The report counts immediate survival and final rescue separately. For each pair of routes offered together, it counts which route led to rescue and gives replayable examples when their outcomes differed. The optional third argument selects a rules version. CI runs the audit on four deals.

### Verify the tide outcome laws

From the repository root, run `mise trust verification/tide/mise.toml` once, then `mise -C verification/tide run verify`. The verification configuration pins Bend and Lean for macOS and Linux. The GitHub Actions job `tide-laws` runs the same verification command.

The [Bend laws](verification/tide/LAWS.bend) cover route availability and resolution for The Second Wake, The Bell Buoy, and The Answering Light. They prove which bell play opens the echo route, how brace changes the chain costs, and which play marks the landing channel. Zero hull or any sailor at five or more cold ends the voyage. A surviving crew lands on tide seven and continues on earlier tides.

The turn model gives each active stage a legal move and starts with a budget of 36 moves plus one for a possible equipment swap at The drifting locker. Every move reduces the budget. A voyage that ends early discards its unused moves. A pending player can act, the host can cover a pending guest, and bots act when the humans finish. The bound counts recorded moves in a launched voyage. It assumes that the host or the player who can act takes the move.

Bend proves these properties of the model. The checker compares the model with the TypeScript game on hull and cold boundaries and on replayed states from every rules version. It checks route availability, resources, the next phase, all crew turn orders, and seat permissions. Seeded simulations exercise full voyages separately. The checker compiles its reference modules into a temporary directory and removes them after the comparison.

## Technology decisions

| Layer          | Choice and responsibility                                                                                                                                                                                                        |
| -------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Client         | TypeScript, Phaser 4, HTML, and CSS. Phaser draws the sea scene. HTML provides card controls, text, focus, and touch interaction. The client loads the engine separately so a player can use the controls while the scene loads. |
| Rules          | A shared TypeScript package. A seed and a list of legal moves reproduce the voyage. Solo play runs the rules on the device. The voyage API runs the same rules before it records a move.                                         |
| Build          | npm workspaces, a committed lockfile, strict TypeScript, Vite, and the Node test runner.                                                                                                                                         |
| Online service | Node.js and Fastify serve the game and expose `GET /api/health`. With PostgreSQL, the server also provides the voyage API. Active rooms poll the API while the tab is visible. WebSockets are planned for future room updates.   |
| Distribution   | Serve the web build with desktop browsers as the primary platform. Use Tauri 2 for future installable builds. Native packaging and signing will have their own build jobs.                                                       |

Phaser supplies the 2D rendering and scene tools the illustrated table needs. Using TypeScript on both sides lets a rule change apply to solo and co-op together. The client can use generated paintings, sprite sheets, and rendered views of 3D models as ordinary game art. Keep source art and generation prompts in `art/` and ship optimized images from `web/assets/`.

[Phaser documentation](https://phaser.io/oss/docs) · [Vite production builds](https://vite.dev/guide/build) · [Fastify plugins](https://fastify.dev/ecosystem/) · [Tauri platform support](https://v2.tauri.app/start/)

## Repository layout

- `web/` contains the game client and the Phaser sea scene.
- `packages/rules/` owns the voyage state, legal actions, and tide resolution. It has no dependency on the browser, renderer, or server.
- `server/` contains the Fastify service, voyage routes, and database migrations.
- `tests/` covers voyage rules and browser save data. Its `integration/` suite exercises the HTTP API against PostgreSQL.
- `verification/` contains the seeded voyage and landing simulations and the Bend tide outcome model and proof.
- `art/` contains the original illustrations. The [art notes](art/README.md) include the prompts and links to the web exports.

## Crew hands

On new voyages, the crew shares a deck of 23 cards. This includes one copy of each of the 13 equipment cards added since the original deck. Salvage determines two cards in the deck. The ration locker adds Pass the Tin, spare timber adds Emergency Patch, and dry canvas adds Canvas Sling. Each sailor draws two cards before boarding. Open one of your cards during boarding to compare its raft and water effects. A sailor must hold a ration to play a face that spends one. Each device shows one private hand and the crew’s public plays.

Play a held equipment card to discard it and draw its replacement. Use the crew action rail for moves such as Lash the timbers and Share a ration. These use the sailor’s turn and keep both equipment cards. When the draw pile is empty, the crew reshuffles the discard pile. Saved voyages replay their recorded moves with their original rules version. Open seats become bots on the next turn that needs them.

## The answering light

On tide six, the cutter’s lamp holds steady while a pale light moves against the swell. Play Sounding line as the swimmer to mark a channel to the cutter. The card gives one brace and costs one cold. On tide seven, following the marked channel spares the hull. The swimmer still gains two cold from exposure. Force a landing for up to four hull damage after brace, or scout the reef for four cold in all. Each tide’s route choices forecast the resulting hull and swimmer cold. A warning names any sailor whose cold will be fatal after recovery.

During **The second wake**, hold the line and let brace absorb the pull, or follow the pull and take extra cold on the swimmer. A sailor on the raft can ring the Wreck bell to unlock **Haul in on the echo**. This spares the hull and reduces the swimmer’s exposure from 2 cold to 1. The sailor who rings the bell still takes the card’s cost. The swimmer recovers one ration on every route.

During **The bell buoy**, brace to feel the chain in the timbers. Two knocks before the bell tell the crew the chain is real. Follow it to recover 3 rations at the cost of 1 extra cold on the swimmer. Voyages through rules version 11 recover 2 rations on this route. If the bell comes first, following it costs 2 extra cold and yields 1 ration. Break away to let brace absorb the hull damage and give the swimmer normal exposure and recovery.

When **Something under the raft** grabs the timbers, use Sounding line from the water and Boathook from the raft to pry it loose. Cutting a timber costs 1 hull. Hauling the swimmer through costs 1 extra cold with at least 2 brace, or 2 extra cold otherwise. Voyages on rules versions 8 through 12 take 2 extra cold with any amount of brace. From rules version 10, the creature follows either fallback route toward the reef.

At **The towline**, let the rope drag to absorb up to 2 hull damage with brace, or slip the line to spare the hull at the cost of 1 extra cold for the swimmer. Voyages through rules version 13 take 2 extra cold on the swimmer’s route.

Run `mise exec -- node verification/landing/simulate.ts` to compare spending and saving the line on the same 1,024 starting deals. The output includes replayable voyages and a separate count of landings by crews that never held a line.

## Play solo or with friends

Choose **Play solo** to play Mara with Ivo and Nell as bot crewmates. You choose salvage, assign the swimmer, play Mara’s move, and resolve the tide. Ivo and Nell play after you. Solo play runs in the browser and saves the voyage on the device.

Start the server with [PostgreSQL](#durable-voyages). For friends on the same Wi-Fi, set `HOST=0.0.0.0` when starting the server. Open the game using the host computer’s LAN address on **all** devices, including the host. An invite created on `localhost` or `127.0.0.1` points back to the device that opens it. For remote play, use a shared HTTPS address.

Choose **Invite one friend** or **Invite two friends** from the launch table. Copy each friend’s private link from the crew lobby. A seat shows **Joined** once the friend opens it. The host plays Mara and makes the salvage, boarding, and event decisions. The first friend plays Ivo. Nell is a bot in a two-player room, and the second friend plays Nell in a three-player room. The host can begin with open seats, and friends can still join through their links.

During boarding, each player can volunteer or withdraw their sailor. The host assigns a volunteer or a bot. With no volunteers, the host can assign any sailor. The preview shows exposure and rations before cards and events change the outcome. On tide six, the crew can see which sailors can mark the channel.

Players can act in any order. Bots play after the human turns. After the host plays, the game asks whether to wait for a friend or let a bot take their turn. The returning friend sees which tide the bot covered and can act again on the next tide. An open room refreshes while its tab is visible. Refreshing the page restores the seat in the same tab. The host can reopen the latest room with **Resume voyage with friends**. Guests can rejoin with their invite link. Anyone with that link can play the seat.

If the sailor at the helm has been away from the table for 90 seconds, a connected friend can take the helm. They make the public choices and can ask a bot to cover another sailor. Each player keeps their own hand and seat, including the returning host.

During card play, open the signal pennant beside the other header tools. Choose a flag to ask for warmth or brace, or to offer a ration. The Ship’s log marks active signals beside each sailor. On narrow screens, the log shows a short condition summary and the active callouts. Open it to see every sailor’s cold and rations. Select your raised flag again to lower it. All signals clear when the tide resolves. Bot callouts reflect the crew’s public resources.

When the tide calls for a route, each friend can select a route to place their pennant beside it. Select a different route to move your pennant, or select the same route again to withdraw it. The host chooses when to commit, and the tide clears the pennants.

After rescue or loss, the host can choose **Sail again with this crew**. Each friend can join from the finished voyage with their own seat. The new voyage starts with a fresh deal in the crew lobby. A player who wants to leave can keep reading the result and return to the launch table when ready.

## Durable voyages

The browser saves solo voyages on the device. To enable the voyage API, set `DATABASE_URL` when starting Fastify. On startup, the server applies pending migrations in a transaction. The database user needs permission to create and alter the game tables. For a local database, install Docker with the Compose plugin and start the Docker engine. After building the game, run these commands from the repository root.

```sh
docker compose up -d --wait db
DATABASE_URL=postgres://seventh_tide:local-development@127.0.0.1:55432/seventh_tide npm start
```

The database uses a named volume. Use `docker compose stop db` to stop it between sessions.

| Request                                      | Result                                                                                                                                                                                                      |
| -------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `POST /api/voyages`                          | Creates a voyage at revision zero. Returns its ID, current state, legal choices, and an owner token.                                                                                                        |
| `GET /api/voyages/{id}`                      | Replays the recorded moves and returns the current state and choices.                                                                                                                                       |
| `PUT /api/voyages/{id}/seat`                 | Marks the authenticated seat as joined and returns the current room.                                                                                                                                        |
| `PUT /api/voyages/{id}/launch`               | Lets the host begin a prepared voyage and returns the first choices.                                                                                                                                        |
| `PUT /api/voyages/{id}/signal`               | Sets or clears a signal for the authenticated seat during card play.                                                                                                                                        |
| `PUT /api/voyages/{id}/route-recommendation` | Sets a guest’s recommendation for the current decision. Send `expectedRevision` and an available `routeId`, or `null` to withdraw.                                                                          |
| `POST /api/voyages/{id}/moves`               | Accepts a JSON body such as `{"expectedRevision":0,"moveId":"locker"}`. Select a move ID from the current choices. Returns the new state and revision.                                                      |
| `PUT /api/voyages/{id}/volunteers`           | Offers or withdraws a sailor during crew boarding. Send the current `expectedRevision`, a sailor index from `offerSeats`, and `offer` (`true` to volunteer, `false` to withdraw). Returns the updated room. |

To create a single-owner voyage with two bots, send the create request without a body. Send `{"players":2,"prepareCrew":true}` to create a two-player room that starts in the lobby. Use `3` for three players. Omit `prepareCrew` to start at salvage. The host receives one private token per guest in `invites`. For all subsequent requests, send the seat token in the `Authorization: Bearer <token>` header. The server stores token digests. It filters choices and checks each request against the caller’s seat.

Each voyage stores its initial seed, rules version, and ordered move IDs. Its revision is the number of stored moves. A single conditional database update appends a legal move and any automatic bot moves at the expected revision. Replay uses the recorded bot moves. A host can send `assistSailor` in place of `moveId` for a sailor listed in `assistSeats`. A competing write or repeated submission at an old revision receives HTTP 409. An unavailable move at the current revision receives HTTP 422.

Volunteer changes increment `offerRevision` and leave the voyage revision unchanged. When assigning the swimmer, the client sends the displayed `offerRevision` as `expectedOfferRevision` with the move. If the volunteers have changed, the server returns HTTP 409 so the host can review the current choices.

The server replays each voyage with the rules version stored when the voyage began. Before changing a released rule, follow the [replay compatibility steps](.agents/skills/seventh-tide-voyage-rules/SKILL.md).

## Preview the illustrated hand

Open [/hand.html](http://127.0.0.1:4173/hand.html) on the running game server. Choose an equipment pair and switch Mara’s position to see the other face of each card. Each pair uses a fixed voyage deal. Drag a card into **Mara’s play** to apply its effect and cost. You can also select a card, then activate the drop area. Check the ship’s log to see how the play affects each sailor. Release outside the area or press Escape during a drag to return the card to the hand. Select **Try another play** to reset the study.

[View the equipment hand at phone width](docs/images/equipment-hand-phone.jpg).
