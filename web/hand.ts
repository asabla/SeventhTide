import lineRaft from "./assets/line-raft.jpg";
import lineWater from "./assets/line-water.jpg";
import hookRaft from "./assets/boathook-raft.jpg";
import hookWater from "./assets/boathook-water.jpg";

// Fixed before-and-after examples for the hand study. A live voyage uses the rules package.
const equipment = [
  {
    name: "Sounding line",
    raft: {
      image: lineRaft,
      action: "Haul the swimmer in.",
      effect: "Swimmer sheds 1 cold.",
      result: { swimmer: 1 },
    },
    water: {
      image: lineWater,
      action: "Sound the depths.",
      effect: "Gain 1 brace.",
      result: { brace: 1 },
    },
  },
  {
    name: "Boathook",
    raft: {
      image: hookRaft,
      action: "Wedge the hook between timbers.",
      effect: "Gain 2 brace.",
      result: { brace: 2 },
    },
    water: {
      image: hookWater,
      action: "Hook floating timber.",
      effect: "Repair 2 hull.",
      result: { hull: 5 },
    },
  },
];
const initial = { cold: 1, hull: 3, brace: 0, swimmer: 2 };
function required(id: string) {
  const node = document.getElementById(id);
  if (!node) throw new Error("Missing hand study element " + id);
  return node;
}
function showTotals(totals: typeof initial) {
  required("cold").textContent = totals.cold + " / 5";
  required("hull").textContent = totals.hull + " / 5";
  required("brace").textContent = String(totals.brace);
  required("swimmer").textContent = totals.swimmer + " / 5";
}
const cards = required("cards");
const receipt = required("receipt");
const reset = required("reset");
const play = document.querySelector<HTMLButtonElement>("#play");
if (!play) throw new Error("Missing play button");
const playButton = play;
const playedFace = required("played-face");
let selected: HTMLButtonElement | null = null;
let resolvePlay: (() => void) | null = null;

function renderHand() {
  const water = document.querySelector('input[value="water"]:checked') !== null;
  required("swimmer-row").hidden = water;
  showTotals(initial);
  receipt.textContent = "Select one equipment card.";
  selected = null;
  resolvePlay = null;
  playedFace.replaceChildren();
  required("play-area").classList.remove("resolved");
  playButton.hidden = false;
  playButton.disabled = true;
  reset.hidden = true;
  cards.replaceChildren();
  for (const item of equipment) {
    const face = water ? item.water : item.raft;
    const button = document.createElement("button");
    button.type = "button";
    button.className = "card";
    button.setAttribute("aria-pressed", "false");
    const name = document.createElement("strong");
    name.textContent = item.name;
    const art = new Image();
    art.src = face.image;
    art.alt = "";
    const action = document.createElement("span");
    action.className = "action";
    action.textContent = face.action;
    const effect = document.createElement("span");
    effect.className = "effect";
    effect.textContent = face.effect;
    const cost = document.createElement("span");
    cost.className = "cost";
    cost.textContent = "Cost · Take 1 cold";
    button.append(name, art, action, effect, cost);
    button.addEventListener("click", () => {
      selected?.setAttribute("aria-pressed", "false");
      selected = button;
      button.setAttribute("aria-pressed", "true");
      playButton.disabled = false;
      receipt.textContent =
        item.name + " selected. " + face.effect + " Take 1 cold.";
      resolvePlay = () => {
        const origin = art.getBoundingClientRect();
        showTotals({ ...initial, cold: 2, ...face.result });
        for (const choice of cards.querySelectorAll("button"))
          choice.disabled = true;
        button.hidden = true;
        const mark = new Image();
        mark.src = face.image;
        mark.alt = "";
        playedFace.replaceChildren(mark);
        required("play-area").classList.add("resolved");
        receipt.textContent =
          "Mara played " +
          item.name +
          ". " +
          face.effect +
          " Mara takes 1 cold.";
        if (!matchMedia("(prefers-reduced-motion: reduce)").matches) {
          const end = mark.getBoundingClientRect();
          mark.animate(
            [
              {
                transform:
                  "translate(" +
                  (origin.x - end.x) +
                  "px, " +
                  (origin.y - end.y) +
                  "px) rotate(-5deg)",
              },
              { transform: "none" },
            ],
            { duration: 280, easing: "ease-out" },
          );
        }
        playButton.hidden = true;
        reset.hidden = false;
        reset.focus({ preventScroll: true });
        resolvePlay = null;
      };
    });
    cards.append(button);
  }
}
for (const position of document.querySelectorAll('input[name="position"]')) {
  position.addEventListener("change", renderHand);
}
playButton.addEventListener("click", () => resolvePlay?.());
reset.addEventListener("click", () => {
  renderHand();
  cards.querySelector("button")?.focus({ preventScroll: true });
});
renderHand();
