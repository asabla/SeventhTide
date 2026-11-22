import { execFileSync } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { checkEncounters } from "./check-encounters.ts";
import { checkProgress } from "./check-progress.ts";
import { compileReference } from "./reference.ts";

execFileSync("bend", ["PROOF.bend", "--verdict"], { stdio: "inherit" });
const directory = await mkdtemp(join(tmpdir(), "seventh-tide-proof-"));
try {
  const [encounters, progress] = await Promise.all([
    compileReference(directory, "Encounter"),
    compileReference(directory, "Progress"),
  ]);
  checkEncounters(encounters);
  checkProgress(progress);
} finally {
  await rm(directory, { recursive: true, force: true });
}
