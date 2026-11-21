---
name: seventh-tide-voyage-rules
description: Change Seventh Tide card effects, legal moves, tide resolution, or balance values while preserving deterministic replay for solo and stored voyages.
---

# Change a voyage rule

Start in [the shared rules](../../../packages/rules/voyage.ts). Trace the requested change through `start(seed)`, `moves(state)`, and `play(state, moveId)`. Check what the player is told before choosing, when the cost is paid, and what the next player sees. For example, the swimmer earns the ration when the tide resolves. Moving that payment to boarding changes which cards the swimmer can afford during the tide.

**Check replay before editing a rule that affects existing saves.** Capture a seed, accepted move IDs, and the expected outcome from the existing version. A change to draw order, a move ID, or an effect can alter a voyage even when its saved data still parses.

- The [solo client](../../../web/app.ts) reads a versioned storage key. Its [save payload](../../../web/saved-run.ts) contains a seed and history. Check the old key and replay path when changing their meaning.
- The [server](../../../server/voyages.ts) stores a rules version and replays accepted moves. Incrementing the version alone makes earlier rows unreadable under the current implementation. For an incompatible change, retain a replay path for the old version or migrate the affected saves with a verified result.

Use [the voyage tests](../../../tests/voyage.test.ts) to exercise the choice through the public rules functions. Assert the specific cost or outcome and the legal next moves that the change affects. For compatibility work, replay the captured history and compare it with the recorded expectation. Replaying it twice with the new implementation only checks repeatability.

For a change to the conditions for loss, landfall, or continuation, review the [tide outcome laws](../../../verification/tide/LAWS.bend) and the [comparison with the game](../../../verification/tide/verify.ts). The comparison maps the crew’s cold and the tide number to the model inputs. Update the affected boundaries and run the [tide law check](../../../README.md#verify-the-tide-outcome-laws).
