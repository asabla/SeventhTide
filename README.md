# Seventh Tide

A browser playtest for one voyage with three crew, two seats, and seven tides. One person can operate all three sailors. Friends in the same room can each choose a sailor and take turns on one shared screen.

## Run the playtest

Use Node.js 22 or later, npm, and Python 3. The prototype uses standard browser APIs and has no package dependencies.

```sh
npm test
npm start
```

Open http://127.0.0.1:4173. Progress is saved in the current browser after each choice. Finish the voyage to start a fresh draw. To preview the game in a managed cloud workspace, serve the same web directory through the environment's private port preview if it has one:

```sh
python3 -m http.server 4173 --bind 0.0.0.0 --directory web
```

This serves the client. Each browser runs its own voyage. A shared online voyage will require a server that owns the game state.

## First playtest

Choose one of two salvage cards, assign the swimmer, and play one card per sailor in any order. Resolve the revealed event. At the end of each tide, the swimmer recovers one sealed ration and gains two cold. Each seated sailor sheds one cold. Spending a personal ration takes the owner's next available card action and removes two cold from any sailor. Keep all three crew below five cold and the hull above zero at each tide's end.

The immediate experiment is whether owning the recovered ration makes someone volunteer. Watch who asks to swim, what they ask for in return, and whether the ration later goes to them or someone else. In solo play, record whether the same seat rotation solves every tide. Use the ship's log during the debrief. Hydration, hunger, and hidden roles are future experiments. The current rules and values are provisional.

## Development in Codex

Use the Git checkout as the source of code and art for each cloud task. Select the project repository and revision when starting a task. Run the tests before and after a rule change. The prototype runs without a package install, external fonts, an API key, or access to a separate art service.

- `web/rules/voyage.js` contains the rules. A seed and the sequence of legal choices reproduce a voyage.
- `web/app.js` presents the board and saves the current run. The first slice uses plain JavaScript modules. A future client or game server can call the rules without a browser.
- `art/` holds the original illustrations and generation prompts. `web/assets/` holds the smaller runtime images.
- `tests/` checks the swimmer's reward, phase boundaries, replay, and end conditions.

For the next multiplayer slice, have two browsers join the same voyage and allow a returning player to reclaim their sailor. Keep the current shared-screen game as a way to test rules and art locally.
