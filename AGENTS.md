# Seventh Tide

Use direct, formal language. Use ASD-STE100 Simplified Technical English for technical explanations. Use emojis and time estimates only when requested.

## Working in this repository

Use the project checkout in the selected Codex cloud environment for development. Use the local checkout for verification and play with friends. See the [README](README.md) for the stack, build commands, and database setup.

- Implement game decisions in `packages/rules/`. Both solo play and the voyage API use this package. The client displays legal choices and their costs.
- Keep card text and controls in HTML. Use Phaser for the sea scene. Store original generated art and its prompt in `art/` and use a smaller export in `web/assets/`.
- For browser interaction and verification, use the built-in Browser. Use Playwright only when the user explicitly requests it.

## Verification

Run `npm run check` for code changes. When a test PostgreSQL database is available, set `TEST_DATABASE_URL` and run `npm run check:ci` for the full gate. Use `npm run format` to apply the repository formatter. The [quality guide](README.md#code-quality) describes what each command covers.
