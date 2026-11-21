# Seventh Tide

Seventh Tide is a cooperative maritime horror card game for browsers and phones, with a solo mode and seven tides per voyage. The current build supports solo and shared-screen play.

## Build and run

Use the Node.js version in `.nvmrc` and npm. Run these commands from the repository root in a local or Codex cloud checkout.

```sh
npm ci
npm run check
npm start
```

Open http://127.0.0.1:4173. Fastify serves the built game from `web/dist/`. Use `HOST=0.0.0.0 npm start` when a cloud environment's private preview needs an external binding. Set `PORT` to use a different port. For client development, `npm run dev` starts Vite with live updates. Saves belong to the browser origin, so the development and production ports have separate saves.

## Technology decisions

| Layer | Choice and responsibility |
| --- | --- |
| Client | TypeScript, Phaser 4, HTML, and CSS. Phaser draws the sea scene. HTML provides card controls, text, focus, and touch interaction. The client loads the engine separately so a player can use the controls while the scene loads. |
| Rules | A shared TypeScript package. A seed and a list of legal moves reproduce the voyage. Solo play runs the rules on the device. The online server will run the same rules for a shared voyage. |
| Build | npm workspaces, a committed lockfile, strict TypeScript, Vite, and the Node test runner. The Linux CI workflow uses the same check command as development. |
| Online service | Node.js and Fastify. The first server serves the game and exposes `GET /api/health`. WebSockets are the selected transport for online play. PostgreSQL is the selected store for voyages and accepted moves. Room handling and database integration are upcoming work. |
| Distribution | Serve the web build to desktop and phone browsers first. Use Tauri 2 for future installable builds. Native packaging and signing will have their own build jobs. |

Phaser supplies the 2D rendering and scene tools the illustrated table needs. Using TypeScript on both sides lets a rule change apply to solo and co-op together. The client can use generated paintings, sprite sheets, and rendered views of 3D models as ordinary game art. Keep source art and generation prompts in `art/` and ship optimized images from `web/assets/`.

[Phaser documentation](https://phaser.io/oss/docs) · [Vite production builds](https://vite.dev/guide/build) · [Fastify plugins](https://fastify.dev/ecosystem/) · [Tauri platform support](https://v2.tauri.app/start/)

## Repository layout

- `web/` contains the game client and the Phaser sea scene.
- `packages/rules/` owns the voyage state, legal actions, and tide resolution. It has no dependency on the browser, renderer, or server.
- `server/` contains the Fastify service entry point.
- `tests/` covers card order, swimmer rewards, replay, and both voyage outcomes.
- `art/` contains original illustrations and their production notes.

## Next foundation change

Add durable voyage storage to the server. Record the rules version, seed, and ordered moves. Accept a move only for the expected voyage revision. Commit the move and the new revision together, then rebuild the same voyage after a server restart. This gives rooms, player ownership, and reconnects a single source of truth.
