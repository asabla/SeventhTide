---
name: seventh-tide-game-art
description: Create or revise Seventh Tide card illustrations and sea-scene artwork, from the original image and prompt through the optimized asset used in the game.
---

# Produce game artwork

Read the [art direction and source prompts](../../../art/README.md). Inspect the closest existing original and its in-game crop before generating a variation. Use the rendering or image-generation tool available for the task. Keep the object recognizable at its displayed size and keep card names, costs, and rules in HTML.

Match the illustration to its use in the game.

- **Salvage cards.** The current plate contains three equal-width panels. [The card styles](../../../web/style.css) select the left, middle, or right third. For a plate change, check all three cards for clipped objects or pieces of a neighboring panel. Each voyage offers two of the three salvage cards, so a single deal cannot show the whole plate.
- **Action cards.** Sound the depths and Haul the line each use a square JPEG. The [client](../../../web/app.ts) selects a CSS class from the move ID. The [card styles](../../../web/style.css) load the image. For a new illustrated action, check that its move displays the intended image and that the card text remains readable.
- **Sea scene.** [The initial page](../../../web/index.html) and [the Phaser scene](../../../web/sea.ts) both display the sea artwork. For a replacement, check the first paint and the scene after the engine loads. Update the HTML image description if the subject changes. Keep the raft and swimmer readable in the wide crop and on a phone-width screen.

Save the full-resolution source in `art/` and record its filename and final prompt in the art notes. Put the smaller runtime export in `web/assets/` and connect it to the requested game surface. Follow the [UX skill](../seventh-tide-ux/SKILL.md) to inspect the image in context and exercise the interaction that uses it at desktop and phone viewport widths.
