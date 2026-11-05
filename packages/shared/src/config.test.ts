import { cpSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { findRootDir, loadConfigFrom, readEnv, requireEnv } from "./config";

const root = findRootDir();

function tempRootWith(file: string, edit: (json: any) => void): string {
  const dir = mkdtempSync(join(tmpdir(), "sb-config-"));
  cpSync(join(root, "config"), join(dir, "config"), { recursive: true });
  const path = join(dir, "config", file);
  const json = JSON.parse(readFileSync(path, "utf8"));
  edit(json);
  writeFileSync(path, JSON.stringify(json));
  return dir;
}

describe("config loader", () => {
  it("loads the repo config", () => {
    const c = loadConfigFrom(root);
    expect(c.app.appNamespace).toBe("supabrain-mumbai26");
    expect(c.app.agents.map((a) => a.label)).toEqual(["lead-claude", "gem-research", "gpt-writer"]);
    expect(c.tokens.usdc.decimals).toBe(6);
    expect(c.networks.rabdi.chainId).toBeGreaterThan(0);
  });

  it("throws on an invalid value and names the path", () => {
    const dir = tempRootWith("app.json", (j) => { j.agents[0].payCapUsdc = "four"; });
    expect(() => loadConfigFrom(dir)).toThrow(/agents\.0\.payCapUsdc/);
  });

  it("throws when keep.maxDays would outlive revocations", () => {
    const dir = tempRootWith("app.json", (j) => { j.keep.maxDays = 365; });
    expect(() => loadConfigFrom(dir)).toThrow(/keep\.maxDays/);
  });

  it("throws on duplicate agent labels", () => {
    const dir = tempRootWith("app.json", (j) => { j.agents[1].label = j.agents[0].label; });
    expect(() => loadConfigFrom(dir)).toThrow(/unique/);
  });

  it("throws on unparseable JSON and on a missing required file", () => {
    const dir = tempRootWith("app.json", () => {});
    writeFileSync(join(dir, "config", "tokens.sepolia.json"), "{ not json");
    expect(() => loadConfigFrom(dir)).toThrow(/tokens\.sepolia\.json is not valid JSON/);
    expect(() => loadConfigFrom(join(dir, "nowhere"))).toThrow(/missing .*app\.json/);
  });
});

describe("env", () => {
  it("treats empty values as unset and validates key formats without echoing values", () => {
    expect(readEnv({ OWNER_PRIVATE_KEY: "" }).OWNER_PRIVATE_KEY).toBeUndefined();
    const secret = "0xnotakey";
    let msg = "";
    try { readEnv({ OWNER_PRIVATE_KEY: secret }); } catch (e) { msg = (e as Error).message; }
    expect(msg).toMatch(/OWNER_PRIVATE_KEY/);
    expect(msg).not.toContain(secret);
  });

  it("requireEnv names the missing variable", () => {
    expect(() => requireEnv("ARKIV_ACCESS_KEY", {})).toThrow(/ARKIV_ACCESS_KEY/);
    expect(requireEnv("X", { X: " v " })).toBe("v");
  });
});
