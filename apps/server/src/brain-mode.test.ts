// v2 brain mode: the server serves one pre-made brain from config/deployments/brains.sepolia.json.
import { describe, expect, it } from "vitest";
import { findRootDir, loadConfigFrom } from "@supabrain/shared/config";
import { brainMode } from "./brain-mode";

const root = findRootDir();
const config = loadConfigFrom(root);

describe("brainMode", () => {
  it("turns the brain's three AIs into the server's agents, named in the brain's own ENS registry", () => {
    const bm = brainMode(config, root, "otter");
    expect(bm.config.app.agents.map((a) => a.label)).toEqual(["claude", "gemini", "openai"]);
    expect(bm.config.app.agents.map((a) => a.vendor)).toEqual(["claude", "gemini", "openai"]);
    expect(bm.config.app.team.id).toBe("otter"); // Arkiv entities carry team = otter: each brain is its own history
    expect(`${bm.config.app.agents[1]!.label}.${bm.config.app.ens.teamLabel}.eth`).toBe("gemini.otter.supabrain.eth");
    expect(bm.deployments.teamRegistry?.address).toBe(bm.brain.registry);
    expect(bm.deployments.agents.gemini?.wallet).toBe(bm.brain.agents.gemini.wallet);
    expect(bm.config.app.vendors).toEqual([]); // no payments in brains
    expect(bm.parentName).toBe("supabrain.eth");
  });

  it("refuses a mnemonic that does not derive the recorded wallets (wrong secret = no writes as someone else)", () => {
    expect(() => brainMode(config, root, "otter", "test test test test test test test test test test test junk")).toThrow(/does not derive/);
  });

  it("an unknown brain is an error, not a guess", () => {
    expect(() => brainMode(config, root, "nope")).toThrow(/no brain "nope"/);
  });
});
