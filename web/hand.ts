import {
  crewMember,
  moves,
  play,
  start,
  type Move,
  type Voyage,
} from "@seventh-tide/rules";
import { equipmentImage } from "./equipment-art.ts";

function required(id: string) {
  const node = document.getElementById(id);
  if (!node) throw new Error("Missing hand study element " + id);
  return node;
}
function showTotals(voyage: Voyage) {
  required("hull").textContent = voyage.hull + " / 5";
  required("brace").textContent = String(voyage.guard);
  required("crew-totals").replaceChildren(
    ...voyage.crew.map((member) => {
      const row = document.createElement("tr");
      const name = document.createElement("th");
      name.scope = "row";
      name.textContent = member.name;
      const cold = document.createElement("td");
      cold.textContent = member.cold + " / 5";
      const food = document.createElement("td");
      food.textContent = String(member.food);
      row.append(name, cold, food);
      return row;
    }),
  );
}
const deal = document.querySelector<HTMLSelectElement>("#deal");
if (!deal) throw new Error("Missing equipment deals");
const dealSelect = deal;
let study: Voyage;
const cards = required("cards");
const receipt = required("receipt");
const reset = required("reset");
const area = required("play-area");
const dropSurface = document.querySelector<HTMLButtonElement>("#place-card");
if (!dropSurface) throw new Error("Missing drop area");
const destination = dropSurface;
const playedFace = required("played-face");
type Card = { button: HTMLButtonElement; move: Move; image: string };
let selected: Card | null = null;
let drag: {
  card: Card;
  id: number;
  x: number;
  y: number;
  moved: boolean;
} | null = null;

function selectCard(card: Card) {
  selected?.button.setAttribute("aria-pressed", "false");
  selected = card;
  card.button.setAttribute("aria-pressed", "true");
  destination.disabled = false;
  area.classList.add("ready");
  receipt.textContent = card.move.name + " · " + card.move.detail;
}

function endDrag() {
  if (!drag) return;
  const { card, id } = drag;
  drag = null;
  area.classList.remove("over");
  card.button.classList.remove("dragging");
  card.button.style.removeProperty("translate");
  card.button.style.removeProperty("scale");
  card.button.style.removeProperty("transform-origin");
  if (card.button.hasPointerCapture(id)) card.button.releasePointerCapture(id);
}

function placeCard() {
  const card = selected;
  if (!card || destination.disabled) return;
  const origin = card.button.getBoundingClientRect();
  endDrag();
  selected = null;
  destination.disabled = true;
  study = play(study, card.move.id);
  showTotals(study);
  for (const choice of cards.querySelectorAll("button")) choice.disabled = true;
  card.button.hidden = true;
  const mark = new Image();
  mark.src = card.image;
  mark.alt = "";
  playedFace.replaceChildren(mark);
  area.classList.remove("ready");
  area.classList.add("resolved");
  receipt.textContent =
    "Mara played " + card.move.name + ". " + card.move.detail;
  if (!matchMedia("(prefers-reduced-motion: reduce)").matches) {
    const end = mark.getBoundingClientRect();
    mark.animate(
      [
        {
          transform:
            "translate(" +
            (origin.x + origin.width / 2 - end.x - end.width / 2) +
            "px, " +
            (origin.y + origin.height / 2 - end.y - end.height / 2) +
            "px) rotate(-4deg)",
        },
        { transform: "none" },
      ],
      { duration: 200, easing: "ease-out" },
    );
  }
  reset.hidden = false;
  reset.focus({ preventScroll: true });
}

// Measure to the nearest edge so that entering anywhere in the tray gives the same size.
function distanceToTray(x: number, y: number, box: DOMRect) {
  return Math.hypot(
    Math.max(box.left - x, 0, x - box.right),
    Math.max(box.top - y, 0, y - box.bottom),
  );
}

function cancelPointer(event: PointerEvent) {
  if (drag?.id === event.pointerId) endDrag();
}

function connectCard(card: Card) {
  const button = card.button;
  button.addEventListener("pointerdown", (event) => {
    if (!event.isPrimary || event.button !== 0 || drag) return;
    selectCard(card);
    button.setPointerCapture(event.pointerId);
    drag = {
      card,
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
      button.classList.add("dragging");
      const bounds = button.getBoundingClientRect();
      button.style.transformOrigin =
        drag.x - bounds.left + "px " + (drag.y - bounds.top) + "px";
    }
    const tray = area.getBoundingClientRect();
    const distance = distanceToTray(event.clientX, event.clientY, tray);
    const startDistance = Math.max(1, distanceToTray(drag.x, drag.y, tray));
    const progress = 1 - Math.min(1, distance / startDistance);
    button.style.scale = String(1 - 0.22 * progress);
    button.style.translate = dx + "px " + dy + "px";
    area.classList.toggle("over", distance === 0);
  });
  button.addEventListener("pointerup", (event) => {
    if (!drag || drag.id !== event.pointerId) return;
    if (
      drag.moved &&
      distanceToTray(
        event.clientX,
        event.clientY,
        area.getBoundingClientRect(),
      ) === 0
    )
      placeCard();
    else endDrag();
  });
  button.addEventListener("pointercancel", cancelPointer);
  button.addEventListener("lostpointercapture", cancelPointer);
  button.addEventListener("click", (event) => {
    if (button.disabled) return;
    selectCard(card);
    if (event.detail === 0) destination.focus();
  });
}
function renderHand() {
  const water = document.querySelector('input[value="water"]:checked') !== null;
  // Each seed deals the two illustrated cards named in the selector.
  const boarding = play(start(Number(dealSelect.value), 5), "locker");
  crewMember(boarding, 1).cold = 2;
  study = play(boarding, water ? "swim-0" : "swim-1");
  showTotals(study);
  endDrag();
  receipt.textContent =
    "Drag a card here, or select a card and then this space.";
  selected = null;

  playedFace.replaceChildren();
  area.classList.remove("ready", "resolved");
  destination.disabled = true;
  reset.hidden = true;
  cards.replaceChildren();
  for (const move of moves(study)) {
    if (move.actor !== 0 || !move.card) continue;
    const image = equipmentImage(move.card, water);
    if (!image) throw new Error("Missing study illustration for " + move.name);
    const [actionText, benefitText, ...costText] =
      move.detail.split(/(?<=\.)\s+/);
    const button = document.createElement("button");
    button.type = "button";
    button.className = "card";
    button.setAttribute("aria-pressed", "false");
    const name = document.createElement("strong");
    name.textContent = move.name;
    const art = new Image();
    art.src = image;
    art.alt = "";
    art.draggable = false;
    const action = document.createElement("span");
    action.className = "action";
    action.textContent = actionText ?? "";
    const effect = document.createElement("span");
    effect.className = "effect";
    effect.textContent = benefitText ?? "";
    const cost = document.createElement("span");
    cost.className = "cost";
    cost.textContent = costText.length
      ? "Cost · " + costText.join(" ")
      : "Cost · Card only";
    button.append(name, art, action, effect, cost);
    const flecks = document.createElement("span");
    flecks.className = "salt";
    flecks.setAttribute("aria-hidden", "true");
    flecks.append(
      document.createElement("i"),
      document.createElement("i"),
      document.createElement("i"),
    );
    button.append(flecks);
    connectCard({ button, move, image });
    cards.append(button);
  }
}
for (const position of document.querySelectorAll('input[name="position"]')) {
  position.addEventListener("change", renderHand);
}
dealSelect.addEventListener("change", renderHand);
destination.addEventListener("click", placeCard);
window.addEventListener("blur", endDrag);
window.addEventListener("keydown", (event) => {
  if (event.key === "Escape") endDrag();
});
reset.addEventListener("click", () => {
  renderHand();
  cards.querySelector("button")?.focus({ preventScroll: true });
});
renderHand();
