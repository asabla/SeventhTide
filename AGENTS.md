# Seventh Tide

Use direct, formal language. Use ASD-STE100 Simplified Technical English for technical explanations. Use emojis and time estimates only when requested.

## Working in this repository

Use the project checkout in the selected Codex cloud environment for development. Use the local checkout for verification and play with friends. Follow the [mise setup](README.md#set-up-the-development-tools) in a fresh checkout. Use `mise exec --` for npm commands in shells without mise activation.

- Implement game decisions in `packages/rules/`. Both solo play and the voyage API use this package. The client displays legal choices and their costs.
- Keep card text and controls in HTML. Use Phaser for the sea scene. Store original generated art and its prompt in `art/` and use a smaller export in `web/assets/`.
- For browser interaction and verification, use the built-in Browser. Use Playwright only when the user explicitly requests it.

## Verification

Run `npm run check` for code changes. When a test PostgreSQL database is available, set `TEST_DATABASE_URL` and run `npm run check:ci` for the full gate. Use `npm run format` to apply the repository formatter. The [quality guide](README.md#code-quality) describes what each command covers.

## Commits and pull requests

Use [Conventional Commits 1.0.0](https://www.conventionalcommits.org/en/v1.0.0/). Give each commit one purpose and a concise imperative subject, such as `fix(rules): award the swimmer ration once`. Fold fixups into the commits they correct before merge.

Write the PR body in short, direct paragraphs. Open with why the change is needed and what it lets the player, developer, or operator do. Include a design decision or limitation when it affects review. For a configuration change, give a minimal usage example. Leave file inventories to the diff and routine test results to CI.

For UX changes, add one or more comments on the PR. Show the affected interaction with a screenshot, a before-and-after pair, or a short recording as appropriate. Add a brief caption that tells the reviewer what to look for. Keep other comments focused on actionable feedback or essential reviewer context.

Use [stacked PRs](https://docs.github.com/en/pull-requests/reference/stacked-pull-requests) when one reviewable change depends on another. Target `main` with the first PR and the preceding branch with each dependent PR. Independent PRs can target `main` directly. When a lower branch changes, rebase the branches above it. Land each PR from the bottom up with **Rebase and merge** to keep the history on `main` linear.
