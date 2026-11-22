import type { Move } from "@seventh-tide/rules";
import lineRaft from "./assets/line-raft.jpg";
import lineWater from "./assets/line-water.jpg";
import hookRaft from "./assets/boathook-raft.jpg";
import hookWater from "./assets/boathook-water.jpg";
import beltRaft from "./assets/belt-raft.webp";
import beltWater from "./assets/belt-water.webp";
import anchorRaft from "./assets/anchor-raft.webp";
import anchorWater from "./assets/anchor-water.webp";
import netRaft from "./assets/net-raft.webp";
import netWater from "./assets/net-water.webp";
import ironRaft from "./assets/iron-raft.webp";
import ironWater from "./assets/iron-water.webp";
import blockRaft from "./assets/block-raft.webp";
import blockWater from "./assets/block-water.webp";
import kettleRaft from "./assets/kettle-raft.webp";
import kettleWater from "./assets/kettle-water.webp";
import mittsRaft from "./assets/mitts-raft.webp";
import mittsWater from "./assets/mitts-water.webp";
import caskRaft from "./assets/cask-raft.webp";
import caskWater from "./assets/cask-water.webp";
import lanternRaft from "./assets/lantern-raft.webp";
import lanternWater from "./assets/lantern-water.webp";
import glassRaft from "./assets/glass-raft.webp";
import glassWater from "./assets/glass-water.webp";
import bellRaft from "./assets/bell-raft.webp";
import bellWater from "./assets/bell-water.webp";
import hatchRaft from "./assets/hatch-raft.webp";
import hatchWater from "./assets/hatch-water.webp";
import combRaft from "./assets/comb-raft.webp";
import combWater from "./assets/comb-water.webp";

const artwork: Partial<
  Record<NonNullable<Move["card"]>, { raft: string; water: string }>
> = {
  line: { raft: lineRaft, water: lineWater },
  hook: { raft: hookRaft, water: hookWater },
  belt: { raft: beltRaft, water: beltWater },
  anchor: { raft: anchorRaft, water: anchorWater },
  net: { raft: netRaft, water: netWater },
  iron: { raft: ironRaft, water: ironWater },
  block: { raft: blockRaft, water: blockWater },
  kettle: { raft: kettleRaft, water: kettleWater },
  mitts: { raft: mittsRaft, water: mittsWater },
  cask: { raft: caskRaft, water: caskWater },
  lantern: { raft: lanternRaft, water: lanternWater },
  glass: { raft: glassRaft, water: glassWater },
  bell: { raft: bellRaft, water: bellWater },
  hatch: { raft: hatchRaft, water: hatchWater },
  comb: { raft: combRaft, water: combWater },
};

export function equipmentImage(
  card: NonNullable<Move["card"]>,
  water: boolean,
) {
  return artwork[card]?.[water ? "water" : "raft"];
}
