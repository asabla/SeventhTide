# Seventh Tide

Use direct, formal language. Use ASD-STE100 Simplified Technical English for technical explanations. Use emojis and time estimates only when requested.

Develop from the project checkout in the selected Codex cloud environment. Use the README commands to test and serve the game. Use the built-in Browser for browser interaction and verification. Use Playwright only if the user explicitly requests it.

Keep game rules independent of the interface. Build on the production stack documented in the README. Keep solo and online play on the same rules package. Store original generated art and its prompt in art/ and use a smaller export in web/assets/.

Run `npm run check` for code changes. When a test PostgreSQL database is available, set `TEST_DATABASE_URL` and run `npm run check:ci` for the full gate. Use `npm run format` to apply the repository formatter.
