import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { moves, play, start } from "../../packages/rules/voyage.ts";

function eventState() {
  return ["locker", "swim-1", "bell-0", "float-1", "lash-2"].reduce(
    play,
    start(456),
  );
}

function checkOutcomes(
  classify: (hull: number, exposed: boolean, last: boolean) => unknown,
) {
  const event = eventState();
  const outcomes = {
    lost: "VoyageLost",
    won: "VoyageRescued",
    board: "VoyageAdrift",
  };
  let count = 0;
  let chainChecks = 0;
  for (let tide = 1; tide <= 7; tide++) {
    for (const hull of [0, 1, 2, 5]) {
      for (const guard of [0, 1]) {
        for (const sailor of [0, 1, 2]) {
          for (const cold of [0, 2, 3, 4, 5, 6]) {
            const before = structuredClone(event);
            Object.assign(before, { tide, hull, guard });
            before.channelMarked = tide === 7;
            const member = before.crew[sailor];
            assert.ok(member);
            member.cold = cold;
            for (const move of moves(before)) {
              const after = play(before, move.id);
              const verdict = classify(
                after.hull,
                after.crew.some((p) => p.cold >= 5),
                tide === 7,
              );
              assert.ok(
                typeof verdict === "object" &&
                  verdict !== null &&
                  "$" in verdict,
              );
              assert.ok(
                after.phase === "lost" ||
                  after.phase === "won" ||
                  after.phase === "board",
              );
              assert.equal(
                outcomes[after.phase],
                verdict.$,
                JSON.stringify({
                  tide,
                  hull,
                  guard,
                  sailor,
                  cold,
                  move: move.id,
                }),
              );
              count++;
              if (move.id === "chain") chainChecks++;
            }
          }
        }
      }
    }
  }
  assert.equal(count, 2304);
  assert.equal(chainChecks, 144);
  console.log(
    `${count} TypeScript event outcomes agree with Bend, including ${chainChecks} Bell Buoy chain choices.`,
  );
}

execFileSync("bend", ["PROOF.bend", "--verdict"], { stdio: "inherit" });
const directory = await mkdtemp(join(tmpdir(), "seventh-tide-proof-"));
try {
  const output = join(directory, "tide.mjs");
  execFileSync("bend", ["Tide.bend", "-o", output], { stdio: "inherit" });
  const module: unknown = await import(pathToFileURL(output).href);
  assert.ok(
    typeof module === "object" && module !== null && "default" in module,
  );
  const model = module.default;
  assert.ok(typeof model === "object" && model !== null && "finish" in model);
  const finish = model.finish;
  assert.ok(typeof finish === "function");
  checkOutcomes(
    (hull, exposed, last) =>
      Reflect.apply(finish, undefined, [hull, exposed, last]) as unknown,
  );
} finally {
  await rm(directory, { recursive: true, force: true });
}
