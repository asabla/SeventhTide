import { CANVAS, Game, Scene } from "phaser";
import seaUrl from "./assets/first-water.jpg";
import lanternsUrl from "./assets/answering-light.jpg";
import wakeUrl from "./assets/second-wake.webp";
import buoyUrl from "./assets/bell-buoy.webp";
import type { bellBuoy, secondWake, Voyage } from "@seventh-tide/rules";

// The image below the canvas is also the first paint while the engine loads.
export function mountSea(
  parent: HTMLElement,
  readVoyage: () => {
    tide: Voyage["tide"];
    channelMarked?: boolean | undefined;
    wake: ReturnType<typeof secondWake>;
    buoy: ReturnType<typeof bellBuoy>;
  },
) {
  let backdrop: Phaser.GameObjects.Image;
  const lights = parent.querySelector<HTMLElement>("#lantern-glows");
  const motion = parent.querySelector<HTMLElement>("#wake-motion");
  class SeaScene extends Scene {
    preload() {
      this.load.image("wreck-field", seaUrl);
      this.load.image("lanterns", lanternsUrl);
      this.load.image("wake", wakeUrl);
      this.load.image("buoy", buoyUrl);
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
    const wake = Boolean(voyage.wake);
    const buoy = Boolean(voyage.buoy);
    const encounter = wake || buoy;
    const sighted =
      !encounter && voyage.channelMarked !== undefined && voyage.tide >= 6;
    backdrop.setTexture(
      buoy ? "buoy" : wake ? "wake" : sighted ? "lanterns" : "wreck-field",
    );
    const zoom = encounter ? 1 : 1 + (voyage.tide - 1) * 0.015;
    const scale =
      Math.max(width / backdrop.width, height / backdrop.height) * zoom;
    game.scale.resize(width, height);
    backdrop.setScale(scale);
    backdrop.setPosition(
      (width - backdrop.displayWidth) * (buoy ? 0.6 : wake ? 0.62 : 0.5),
      (height - backdrop.displayHeight) *
        (buoy ? 0.51 : wake ? 0.54 : sighted ? 0.44 : 0.64),
    );
    if (lights) lights.hidden = !sighted;
    if (motion) motion.hidden = !wake;
    for (const overlay of [lights, motion]) {
      if (!overlay || overlay.hidden) continue;
      overlay.style.left = backdrop.x + "px";
      overlay.style.top = backdrop.y + "px";
      overlay.style.width = backdrop.displayWidth + "px";
      overlay.style.height = backdrop.displayHeight + "px";
    }
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
