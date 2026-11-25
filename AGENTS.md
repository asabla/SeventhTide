# Seventh Tide

Use direct, formal language. Use ASD-STE100 Simplified Technical English for technical explanations. Use emojis and time estimates only when requested.

## Working in this repository

Follow the [local quick start](README.md#run-locally) in a fresh checkout. Use `mise exec --` for npm commands in shells without mise activation.

- Implement voyage rules in `packages/rules/`. Solo play and the voyage API use the same rules. The API filters legal moves by crew seat and boarding volunteers. The client displays the available choices and their costs. Follow the [voyage rules skill](.agents/skills/seventh-tide-voyage-rules/SKILL.md) when a change affects game rules or replay.
- Keep card text and controls in HTML. Use Phaser for the sea scene. Follow the [game art skill](.agents/skills/seventh-tide-game-art/SKILL.md) when adding or replacing illustrations.
- Follow the [UX skill](.agents/skills/seventh-tide-ux/SKILL.md) and [UX guide](docs/ux.md) for changes to player-facing design, assets, or behavior. Visually inspect and exercise each changed interaction in the running game before calling it complete.
- For browser interaction and verification, use the built-in Browser. Use Playwright only when the user explicitly requests it.

## Verification

Run `npm run check` for code changes. When a separate PostgreSQL test database is available, set `TEST_DATABASE_URL` and run `npm run check:ci`. It includes `check` and the database tests. For changes to tide outcomes or their verification, also run the [tide law check](docs/development.md#verify-the-tide-outcome-laws). Use `npm run format` to apply the repository formatter. See the [quality guide](docs/development.md#code-quality).

## Commits and pull requests

Use [Conventional Commits 1.0.0](https://www.conventionalcommits.org/en/v1.0.0/). Give each commit one purpose and a concise imperative subject, such as `fix(rules): award the swimmer ration once`. Fold fixups into the commits they correct before merge.

Write the PR body in short, direct paragraphs. Open with why the change is needed and what it lets the player, developer, or operator do. Include a design decision or limitation when it affects review. For a configuration change, give a minimal usage example. Leave file inventories to the diff and routine test results to CI.

Review every PR in three passes. First check the desktop game design, including the layout, assets, and interaction. Then check correctness and whether the change serves the voyage. Finally check structure, reuse, and the cost of maintaining the change.

For UX changes, add one or more comments on the PR. Show the affected interaction with a screenshot, a before-and-after pair, or a short recording as appropriate. Add a brief caption that tells the reviewer what to look for. Keep other comments focused on actionable feedback or essential reviewer context.

Use [stacked PRs](https://docs.github.com/en/pull-requests/reference/stacked-pull-requests) when one reviewable change depends on another. Target `main` with the first PR and the preceding branch with each dependent PR. Independent PRs can target `main` directly. When a lower branch changes, rebase the branches above it. Land each PR from the bottom up with **Rebase and merge** to keep the history on `main` linear.
