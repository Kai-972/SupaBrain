// pnpm verify:memory (supermemory-plan.md #4): prove who wrote a memory and what it was built on using ONLY Arkiv and
// ENS, no Supabrain server. The pure walk is tested here with fakes; the CLI wires real Arkiv + Sepolia reads.
import { describe, expect, it } from "vitest";
import { verifyLineage, type EntityView, type VerifyDeps } from "./verify-lib";

const TEAM = "0x4eA717986244B28B8af633f698FdDf8308D35A56" as const;
const GEM = "0x6c57ACAA7116c8b539EbA60698B7b644C6b4590c" as const;
const LEAD = "0xEd4ae94521A00BE3e432173F00009AFB90641bfC" as const;
const EVIL = "0x000000000000000000000000000000000000dEaD" as const;

const e = (key: string, o: Partial<EntityView>): EntityView => ({ key, creator: GEM, owner: TEAM, agent: "gem-research", kind: "fact", trust: 2, parents: [], roots: [], ...o });

function deps(entities: EntityView[], o: Partial<VerifyDeps> = {}): VerifyDeps {
  const byKey = new Map(entities.map((x) => [x.key, x]));
  const owners: Record<string, `0x${string}` | null> = { "gem-research": GEM, "lead-claude": LEAD };
  return { fetch: async (k) => byKey.get(k), ensOwner: async (a) => owners[a] ?? null, teamWallet: TEAM, revocations: [], ...o };
}

describe("verifyLineage", () => {
  it("an agent memory signed by the wallet ENS says owns the agent's name, held by the team → verified", async () => {
    const r = await verifyLineage("0xM1", deps([e("0xM1", {})]));
    expect(r.ok).toBe(true);
    expect(r.hops[0]).toMatchObject({ key: "0xM1", agent: "gem-research", creator: GEM, ensOwner: GEM, signedBy: "agent", ownerIsTeam: true, ok: true });
  });

  it("creator is not the wallet ENS names for that agent → not verified, says why", async () => {
    const r = await verifyLineage("0xM1", deps([e("0xM1", { creator: EVIL })]));
    expect(r.ok).toBe(false);
    expect(r.hops[0]?.problem).toMatch(/not the wallet ENS says owns gem-research/);
  });

  it("the agent's ENS name is unregistered now → not verified (registered NOW is what we can prove)", async () => {
    const r = await verifyLineage("0xM1", deps([e("0xM1", {})], { ensOwner: async () => null }));
    expect(r.ok).toBe(false);
    expect(r.hops[0]?.problem).toMatch(/not registered on ENS now/);
  });

  it("an owner (human) memory must be signed by the team wallet", async () => {
    expect((await verifyLineage("0xH1", deps([e("0xH1", { agent: "owner", creator: TEAM, trust: 3 })]))).ok).toBe(true);
    const bad = await verifyLineage("0xH1", deps([e("0xH1", { agent: "owner", creator: GEM, trust: 3 })]));
    expect(bad.ok).toBe(false);
    expect(bad.hops[0]?.problem).toMatch(/team wallet/);
  });

  it("walks the parents breadth first; an expired (missing) parent is reported, not fatal", async () => {
    const r = await verifyLineage("0xM2", deps([
      e("0xM2", { agent: "lead-claude", creator: LEAD, parents: ["0xH1", "0xM1"] }),
      e("0xH1", { agent: "owner", creator: TEAM, trust: 3 }),
      e("0xM1", { parents: ["0xE1"] }),
    ]));
    expect(r.hops.map((h) => h.key)).toEqual(["0xM2", "0xH1", "0xM1"]);
    expect(r.missing).toEqual(["0xE1"]);
    expect(r.ok).toBe(true);
  });

  it("lists team-signed revocations that cover a hop (by source root, memory or agent)", async () => {
    const r = await verifyLineage("0xM1", deps([e("0xM1", { roots: ["email:acme-0611"] })], {
      revocations: [{ type: "source", id: "email:acme-0611" }, { type: "agent", id: "gpt-writer" }],
    }));
    expect(r.hops[0]?.revokedBy).toEqual(["source:email:acme-0611"]);
    expect(r.revoked).toBe(true);
  });

  it("an entity not handed to the team wallet is flagged", async () => {
    const r = await verifyLineage("0xM1", deps([e("0xM1", { owner: GEM })]));
    expect(r.hops[0]?.ownerIsTeam).toBe(false);
    expect(r.ok).toBe(false);
  });

  it("the root memory missing entirely → not verified; cycles and long chains stop", async () => {
    expect((await verifyLineage("0xNONE", deps([]))).ok).toBe(false);
    const r = await verifyLineage("0xA", deps([e("0xA", { parents: ["0xB"] }), e("0xB", { parents: ["0xA"] })]));
    expect(r.hops.map((h) => h.key)).toEqual(["0xA", "0xB"]);
  });
});
