// QA D2: each namespace gets its own seed output, and the demo steps never use another namespace's keys/addresses.
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { readSeedFor, seedPath, writeSeed } from "./seed-file";

const root = () => {
  const r = mkdtempSync(join(tmpdir(), "seedfile-"));
  mkdirSync(join(r, "config", "deployments"), { recursive: true });
  return r;
};

describe("demo seed file per namespace (QA D2)", () => {
  it("writes demo-seed.<namespace>.json and reads it back", () => {
    const r = root();
    writeSeed(r, { namespace: "ns-b", attackerAddress: "0xb", keys: { M2: "0x2" } });
    expect(seedPath(r, "ns-b")).toBe(join(r, "config", "deployments", "demo-seed.ns-b.json"));
    expect(JSON.parse(readFileSync(seedPath(r, "ns-b"), "utf8"))).toMatchObject({ namespace: "ns-b", attackerAddress: "0xb" });
    expect(readSeedFor(r, "ns-b")).toMatchObject({ attackerAddress: "0xb", keys: { M2: "0x2" } });
  });

  it("seeding one namespace never overwrites another's file", () => {
    const r = root();
    writeSeed(r, { namespace: "ns-dev", attackerAddress: "0xdev" });
    writeSeed(r, { namespace: "ns-b", attackerAddress: "0xb" });
    expect(readSeedFor(r, "ns-dev").attackerAddress).toBe("0xdev");
    expect(readSeedFor(r, "ns-b").attackerAddress).toBe("0xb");
  });

  it("falls back to the legacy demo-seed.json only when its namespace matches", () => {
    const r = root();
    writeFileSync(join(r, "config", "deployments", "demo-seed.json"), JSON.stringify({ namespace: "ns-dev", attackerAddress: "0xdev" }));
    expect(readSeedFor(r, "ns-dev").attackerAddress).toBe("0xdev");
    expect(readSeedFor(r, "ns-b")).toEqual({}); // another namespace's keys would make demo:step pay the wrong address
  });

  it("refuses namespace names that could escape the deployments folder", () => {
    expect(() => seedPath(root(), "../x")).toThrow(/namespace/);
  });
});
