import { wreckBellWakeEffect } from "@seventh-tide/rules";
import { element } from "./dom.ts";

export function cardFace<K extends "button" | "div">(
  tag: K,
  name: string,
  art?: HTMLElement,
) {
  const face = element(tag, "", "card");
  face.append(element("strong", name));
  if (art) face.append(art);
  return face;
}

export function cardImage(src: string) {
  const art = element("img");
  art.src = src;
  art.alt = "";
  art.draggable = false;
  return art;
}

function isEffect(line: string) {
  return (
    line === wreckBellWakeEffect || line.startsWith("Mark the safe channel")
  );
}

export function equipmentCard(name: string, detail: string, art?: HTMLElement) {
  const [action, effect, ...rest] = detail.split(/(?<=\.)\s+/);
  const costs = rest.filter((line) => !isEffect(line));
  const button = cardFace("button", name, art);
  button.type = "button";
  button.setAttribute("aria-pressed", "false");
  button.append(
    element("span", action, "action"),
    element("span", effect, "effect"),
    ...rest.filter(isEffect).map((line) => element("span", line, "effect")),
    element(
      "span",
      costs.length ? "Cost · " + costs.join(" ") : "Cost · Card only",
      "cost",
    ),
  );
  const flecks = element("span", "", "salt");
  flecks.setAttribute("aria-hidden", "true");
  flecks.append(element("i"), element("i"), element("i"));
  button.append(flecks);
  return button;
}

// Measure to the nearest edge so the card reaches the same size anywhere in the tray.
function distanceToTray(x: number, y: number, box: DOMRect) {
  return Math.hypot(
    Math.max(box.left - x, 0, x - box.right),
    Math.max(box.top - y, 0, y - box.bottom),
  );
}

export function cardDrag(tray: HTMLElement) {
  let drag:
    | {
        button: HTMLButtonElement;
        id: number;
        x: number;
        y: number;
        moved: boolean;
      }
    | undefined;

  function cancel() {
    if (!drag) return;
    const { button, id } = drag;
    drag = undefined;
    tray.classList.remove("over");
    button.classList.remove("dragging");
    button.style.removeProperty("translate");
    button.style.removeProperty("scale");
    button.style.removeProperty("transform-origin");
    if (button.hasPointerCapture(id)) button.releasePointerCapture(id);
  }

  function connect(
    button: HTMLButtonElement,
    select: () => void,
    drop: () => void,
    onSelectClick: (event: MouseEvent) => void,
  ) {
    let suppressClick = false;
    button.addEventListener("pointerdown", (event) => {
      if (!event.isPrimary || event.button !== 0 || drag) return;
      suppressClick = false;
      select();
      button.setPointerCapture(event.pointerId);
      drag = {
        button,
        id: event.pointerId,
        x: event.clientX,
        y: event.clientY,
        moved: false,
      };
    });
    button.addEventListener("pointermove", (event) => {
      if (!drag || drag.id !== event.pointerId) return;
      const dx = event.clientX - drag.x;
      const dy = event.clientY - drag.y;
      if (!drag.moved && Math.hypot(dx, dy) < 5) return;
      if (!drag.moved) {
        drag.moved = true;
        const bounds = button.getBoundingClientRect();
        button.classList.add("dragging");
        button.style.transformOrigin = `${drag.x - bounds.left}px ${drag.y - bounds.top}px`;
      }
      const box = tray.getBoundingClientRect();
      const distance = distanceToTray(event.clientX, event.clientY, box);
      const startDistance = Math.max(1, distanceToTray(drag.x, drag.y, box));
      const progress = 1 - Math.min(1, distance / startDistance);
      button.style.scale = String(1 - 0.22 * progress);
      button.style.translate = `${dx}px ${dy}px`;
      tray.classList.toggle("over", distance === 0);
    });
    button.addEventListener("pointerup", (event) => {
      if (!drag || drag.id !== event.pointerId) return;
      suppressClick = drag.moved;
      if (
        drag.moved &&
        !distanceToTray(
          event.clientX,
          event.clientY,
          tray.getBoundingClientRect(),
        )
      )
        drop();
      cancel();
    });
    for (const name of ["pointercancel", "lostpointercapture"] as const) {
      button.addEventListener(name, (event) => {
        if (drag?.id === event.pointerId) cancel();
      });
    }
    button.addEventListener("click", (event) => {
      if (button.disabled || (event.detail !== 0 && suppressClick)) return;
      select();
      onSelectClick(event);
    });
  }

  window.addEventListener("blur", cancel);
  window.addEventListener("keydown", (event) => {
    if (event.key === "Escape") cancel();
  });
  return { connect, cancel };
}
