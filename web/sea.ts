import { CANVAS, Game, Scene } from "phaser";
import seaUrl from "./assets/first-water.jpg";
import type { Voyage } from "@seventh-tide/rules";

// The image below the canvas is also the first paint while the engine loads.
export function mountSea(
  parent: HTMLElement,
  readVoyage: () => Pick<Voyage, "tide">,
) {
  let backdrop: Phaser.GameObjects.Image;
  class SeaScene extends Scene {
    preload() {
      this.load.image("wreck-field", seaUrl);
    }
    create() {
      backdrop = this.add.image(0, 0, "wreck-field").setOrigin(0, 0);
      paint();
    }
  }

  const game = new Game({
    type: CANVAS,
    parent,
    width: Math.max(1, parent.clientWidth),
    height: Math.max(1, parent.clientHeight),
    banner: false,
    transparent: true,
    audio: { noAudio: true },
    input: { keyboard: false, mouse: false, touch: false, gamepad: false },
    scene: SeaScene,
  });

  function paint() {
    if (!backdrop) return;
    const width = parent.clientWidth;
    const height = parent.clientHeight;
    if (!width || !height) return;
    const voyage = readVoyage();
    const zoom = 1 + (voyage.tide - 1) * 0.015;
    const scale =
      Math.max(width / backdrop.width, height / backdrop.height) * zoom;
    game.scale.resize(width, height);
    backdrop.setScale(scale);
    backdrop.setPosition(
      (width - backdrop.displayWidth) / 2,
      (height - backdrop.displayHeight) * 0.64,
    );
    // This scene only changes on a turn or resize. Stop rendering between them.
    game.loop.wake();
    game.events.once("postrender", () => game.loop.sleep());
  }

  const observer = new ResizeObserver(paint);
  observer.observe(parent);
  if (import.meta.hot)
    import.meta.hot.dispose(() => {
      observer.disconnect();
      game.loop.wake();
      game.destroy(true);
    });
  return paint;
}
