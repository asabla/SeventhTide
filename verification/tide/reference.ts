import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

export type BendCall = (name: string, ...args: unknown[]) => unknown;

export function tag<Name extends string>(name: Name) {
  return { $: name };
}

export function record(
  value: unknown,
): asserts value is Record<string, unknown> {
  assert.ok(typeof value === "object" && value !== null);
}

export async function compileReference(
  directory: string,
  source: string,
): Promise<BendCall> {
  const output = join(directory, source + ".mjs");
  execFileSync("bend", [source + ".bend", "-o", output], { stdio: "inherit" });
  const module: unknown = await import(pathToFileURL(output).href);
  record(module);
  const model = module.default;
  record(model);
  return (name, ...args) => {
    const call = model[name];
    assert.ok(typeof call === "function", source + "." + name);
    return Reflect.apply(call, undefined, args) as unknown;
  };
}
