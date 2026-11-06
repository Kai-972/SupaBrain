// The demo seed's output (memory keys by fixture name + the burner attacker addresses), one file per Arkiv namespace,
// so seeding a rehearsal namespace never clobbers another's and demo:step never pays another namespace's address.
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

export interface DemoSeed {
  namespace?: string;
  attackerAddress?: string;
  attackerPartnerAddress?: string;
  keys?: Record<string, string>;
  [k: string]: unknown;
}

const NS = /^[a-z0-9-]+$/; // same rule as SUPABRAIN_APP_NAMESPACE

export function seedPath(root: string, namespace: string): string {
  if (!NS.test(namespace)) throw new Error(`invalid namespace "${namespace}"`);
  return join(root, "config", "deployments", `demo-seed.${namespace}.json`);
}

export function writeSeed(root: string, seed: DemoSeed & { namespace: string }): string {
  const f = seedPath(root, seed.namespace);
  writeFileSync(f, JSON.stringify(seed, null, 2) + "\n");
  return f;
}

/** The seed for `namespace`; the legacy demo-seed.json only if it names the same namespace; else {}. */
export function readSeedFor(root: string, namespace: string): DemoSeed {
  const f = seedPath(root, namespace);
  if (existsSync(f)) return JSON.parse(readFileSync(f, "utf8")) as DemoSeed;
  const legacy = join(root, "config", "deployments", "demo-seed.json");
  if (existsSync(legacy)) {
    const s = JSON.parse(readFileSync(legacy, "utf8")) as DemoSeed;
    if (s.namespace === namespace) return s;
  }
  return {};
}
