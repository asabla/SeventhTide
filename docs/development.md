# Development and verification

Follow the [local quick start](../README.md#run-locally) to install dependencies and build the game. mise reads the Node.js version from [`.nvmrc`](../.nvmrc), the same file used in CI. The setup task runs `npm ci` against the lockfile. Rerun `mise run setup` after the lockfile changes.

If npm reports an unreviewed dependency install script, review it before you record an approval or denial in [package.json](../package.json). The project denies the install script for `fsevents`, Vite’s optional macOS watcher.

## Work on the game

Run `mise exec -- npm run dev` for Vite’s development server with live updates. `mise exec -- npm start` serves the production build on port 4173. The browser keeps a separate solo save for each origin, including each port. See [Hosting](hosting.md) for server and PostgreSQL configuration.

- [`web/`](../web/) contains the client. Phaser draws the sea scene. HTML supplies the game controls, text, and keyboard focus.
- [`packages/rules/`](../packages/rules/) contains the shared TypeScript rules for solo play and the voyage API.
- [`server/`](../server/) contains the Fastify service, voyage routes, and database migrations.
- [`tests/`](../tests/) covers shared rules, browser saves, and the voyage API with PostgreSQL.
- [`verification/`](../verification/) contains seeded simulations and the Bend model and proofs.
- [`art/`](../art/) contains original illustrations and generation notes. The browser uses optimized assets from [`web/assets/`](../web/assets/).

Follow [the repository conventions](../AGENTS.md) and review player-facing changes in the running game with the [UX guide](ux.md). For a rule change, follow the [replay compatibility steps](../.agents/skills/seventh-tide-voyage-rules/SKILL.md).

### Preview the illustrated hand

Open [`/hand.html`](http://127.0.0.1:4173/hand.html) on the local game server. Choose an equipment pair and switch Mara between the raft and water to see both card faces. Drag a card into **Mara’s play** or select it and activate the tray. The Ship’s log shows what changed. Release outside the tray or press Escape during a drag to return the card to the hand. **Try another play** resets the study.

## Code quality

`mise exec -- npm run check` checks formatting, TypeScript and lint rules, HTML, CSS, test coverage, and the production build. The shared rules need at least 95% line coverage, 90% branch coverage, and 95% function coverage. Use `mise exec -- npm run format` to apply formatting, or `npm run lint` and `npm run typecheck` in a shell with mise activated for focused checks.

To run the main CI job locally, set `TEST_DATABASE_URL` to a separate PostgreSQL test database and run `mise exec -- npm run check:ci`. It runs `check`, database integration tests, voyage simulation, and the route and landfall audits. The database tests cover persistence, concurrent moves, bot assistance, private seats, and complete voyages.

## Simulate voyages

Run these commands from the repository root.

| Command                                              | What it checks                                                                                                                                                                                        |
| ---------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `mise exec -- npm run simulate -- 1024 2048`         | Simulates 1,024 deals from index 2,048. Checks that turns advance, voyages finish within 37 recorded moves, and replay reproduces the result. Counts rescue, hull loss, cold loss, and combined loss. |
| `mise exec -- npm run balance -- 512 1024 11`        | Plays both salvage choices on the same 512 deals from index 1,024 with rules version 11. Compares the routes offered and the choices that were the only way to survive a tide.                        |
| `mise exec -- npm run audit:routes -- 128 1024`      | Follows each legal route from the same position, then continues with the same play policy. Reports tide survival, final rescue, and replayable examples when choices led to different endings.        |
| `mise exec -- npm run audit:landfall -- 16 1024`     | Tries every legal final-tide sequence from the positions reached by mixed play. Checks the forecast and actual ending for each landing route.                                                         |
| `mise exec -- node verification/landing/simulate.ts` | Compares spending and saving Sounding line across 1,024 deals. Counts landings by crews that never held the card.                                                                                     |

The simulator defaults to 512 seeds. Crew setups cover solo play, two or three human players, a missing friend, and a missing host. The main simulation uses cautious and random choices. Balance runs also use a mixed policy that sometimes chooses a random legal card or crew action.

Add `--all-decisions` to the route audit to include salvage, swimmer selection, card and crew actions, and equipment swaps. Pass a rules version as the third argument to compare identical deals across versions. The landfall audit uses the actual bot policy and checks every legal human play sequence from each sampled entry. It records a replay when the mixed policy missed a rescue.

CI runs the simulation on 384 seeds with `--require-all-endings` so each crew setup must reach all four endings. It runs the route and landfall audits on four deals each.

## Verify the tide outcome laws

Review [the verification toolchain](../verification/tide/mise.toml), then run these commands from the repository root.

```sh
mise trust verification/tide/mise.toml
mise -C verification/tide run verify
```

The GitHub Actions job `tide-laws` runs the same verification. The [Bend laws](../verification/tide/LAWS.bend) cover route availability, tide outcomes, and turn progress. The progress model assigns a budget of 36 moves plus one possible equipment swap. A legal move spends one from that budget. This bound assumes that the sailor with permission to act takes the move.

The verification compares the Bend model with the TypeScript rules at hull and cold boundaries and in replayed states from every rules version. It checks legal moves, resources, results, crew turn order, and seat permissions. The simulations exercise full voyages separately.
