import {
  crewMember,
  moves,
  play,
  start,
  type Move,
  type Voyage,
} from "@seventh-tide/rules";
import { equipmentImage } from "./equipment-art.ts";
import { cardDrag, cardImage, equipmentCard } from "./cards.ts";

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
const drag = cardDrag(area);

function selectCard(card: Card) {
  selected?.button.setAttribute("aria-pressed", "false");
  selected = card;
  card.button.setAttribute("aria-pressed", "true");
  destination.disabled = false;
  area.classList.add("ready");
  receipt.textContent = card.move.name + " · " + card.move.detail;
}

function placeCard() {
  const card = selected;
  if (!card || destination.disabled) return;
  const origin = card.button.getBoundingClientRect();
  drag.cancel();
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

function renderHand() {
  const water = document.querySelector('input[value="water"]:checked') !== null;
  // Each seed deals the two illustrated cards named in the selector.
  const boarding = play(start(Number(dealSelect.value), 5), "locker");
  crewMember(boarding, 1).cold = 2;
  study = play(boarding, water ? "swim-0" : "swim-1");
  showTotals(study);
  drag.cancel();
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
    const button = equipmentCard(move.name, move.detail, cardImage(image));
    drag.connect(
      button,
      () => selectCard({ button, move, image }),
      placeCard,
      () => destination.focus(),
    );
    cards.append(button);
  }
}
for (const position of document.querySelectorAll('input[name="position"]')) {
  position.addEventListener("change", renderHand);
}
dealSelect.addEventListener("change", renderHand);
destination.addEventListener("click", placeCard);
reset.addEventListener("click", () => {
  renderHand();
  cards.querySelector("button")?.focus({ preventScroll: true });
});
renderHand();
