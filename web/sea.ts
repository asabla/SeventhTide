import { CANVAS, Game, Scene } from "phaser";
import seaUrl from "./assets/first-water.jpg";
import lanternsUrl from "./assets/answering-light.jpg";
import reefUrl from "./assets/answering-light-reef.webp";
import wakeUrl from "./assets/second-wake.webp";
import buoyUrl from "./assets/bell-buoy.webp";
import gripUrl from "./assets/under-raft.webp";

const framing = {
  buoy: [0.6, 0.51],
  grip: [0.61, 0.52],
  wake: [0.62, 0.54],
  reef: [0.57, 0.39],
  approach: [0.5, 0.43],
  "wreck-field": [0.5, 0.64],
} as const;

// The image below the canvas is also the first paint while the engine loads.
export function mountSea(frame: HTMLElement, parent: HTMLElement) {
  let backdrop: Phaser.GameObjects.Image;
  const lights = parent.querySelector<HTMLElement>("#lantern-glows");
  const motion = parent.querySelector<HTMLElement>("#wake-motion");
  class SeaScene extends Scene {
    preload() {
      this.load.image("wreck-field", seaUrl);
      this.load.image("approach", lanternsUrl);
      this.load.image("reef", reefUrl);
      this.load.image("wake", wakeUrl);
      this.load.image("buoy", buoyUrl);
      this.load.image("grip", gripUrl);
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
    const { landing, wake, buoy } = frame.dataset;
    const texture = frame.hasAttribute("data-grip")
      ? "grip"
      : buoy
        ? "buoy"
        : wake
          ? "wake"
          : landing === "reef"
            ? "reef"
            : landing === "approach"
              ? "approach"
              : "wreck-field";
    const [x, y] = framing[texture];
    backdrop.setTexture(texture);
    const scale = Math.max(width / backdrop.width, height / backdrop.height);
    game.scale.resize(width, height);
    backdrop.setScale(scale);
    backdrop.setPosition(
      (width - backdrop.displayWidth) * x,
      (height - backdrop.displayHeight) * y,
    );
    if (lights) lights.hidden = !landing;
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
