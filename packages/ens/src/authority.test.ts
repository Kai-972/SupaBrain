import { describe, expect, it } from "vitest";
import type { EnsDeployment } from "@supabrain/shared";
import { createEnsAuthority, EnsUnavailableError, type EnsChain } from "./authority";
import { labelhashOf } from "./names";

const OWNER = "0x00000000000000000000000000000000000000a1" as const;
const GEM = "0x6c57ACAA7116c8b539EbA60698B7b644C6b4590c" as const;
const LEAD = "0xEd4ae94521A00BE3e432173F00009AFB90641bfC" as const;
const OTHER = "0x00000000000000000000000000000000000000b2" as const;
const REGISTRY = "0xd5bC492deE1A41873Fa382fF17017F6D5506c41c" as const;
const ACME = "0x9F20000000000000000000000000000000000002" as const;
const ZERO = "0x0000000000000000000000000000000000000000" as const;
const NOW = 1_800_000_000_000; // ms

const app = {
  team: { id: "team1", displayName: "Demo" },
  ens: { teamLabel: "supabrain", cacheTtlSec: 10, textKeys: { role: "sb.role", scope: "sb.scope", payCap: "sb.pay.cap", payDaily: "sb.pay.daily", status: "sb.status", memoryHead: "sb.memory.head", vendor: "sb.vendor", agentContext: "agent-context", agentEndpointMcp: "agent-endpoint[mcp]" } },
  agents: [{ label: "gem-research" }, { label: "lead-claude" }],
  vendors: [{ label: "acme", displayName: "Acme" }],
} as never;

const deployments = {
  network: "sepolia", chainId: 11155111, vendors: {},
  teamRegistry: { address: REGISTRY },
  agents: {
    "gem-research": { label: "gem-research", ens: "gem-research.supabrain.eth", labelhash: labelhashOf("gem-research"), wallet: GEM, resolver: OTHER, expiry: 0, txs: {}, records: {} },
    "lead-claude": { label: "lead-claude", ens: "lead-claude.supabrain.eth", labelhash: labelhashOf("lead-claude"), wallet: LEAD, resolver: OTHER, expiry: 0, txs: {}, records: {} },
  },
} as unknown as EnsDeployment;

/** A scriptable chain. `calls` counts reads so cache behaviour is observable. */
function fakeChain(over: Partial<{ owner: Record<string, `0x${string}`>; expiry: Record<string, number>; texts: Record<string, Record<string, string | null>>; names: Record<string, `0x${string}` | null>; fail: boolean }> = {}) {
  const st = {
    owner: { "gem-research": GEM, "lead-claude": LEAD, ...over.owner } as Record<string, `0x${string}`>,
    expiry: { "gem-research": NOW / 1000 + 86_400, "lead-claude": NOW / 1000 + 86_400, ...over.expiry } as Record<string, number>,
    texts: {
      "gem-research.supabrain.eth": { "sb.role": "worker", "sb.scope": "research", "sb.pay.cap": "2", "sb.pay.daily": "4", "sb.status": "active", "sb.vendor": "gemini" },
      "lead-claude.supabrain.eth": { "sb.role": "lead", "sb.scope": "*", "sb.pay.cap": "4", "sb.pay.daily": "30", "sb.status": "active", "sb.vendor": "claude" },
      ...over.texts,
    } as Record<string, Record<string, string | null>>,
    names: { "acme.supabrain.eth": ACME, ...over.names } as Record<string, `0x${string}` | null>,
    fail: over.fail ?? false,
    calls: 0,
  };
  const idOf = (id: bigint) => (id === BigInt(labelhashOf("gem-research")) ? "gem-research" : "lead-claude");
  const chain: EnsChain = {
    async getOwner(_r, id) { st.calls++; if (st.fail) throw new Error("rpc down"); return st.owner[idOf(id)]!; },
    async getExpiry(_r, id) { st.calls++; if (st.fail) throw new Error("rpc down"); return st.expiry[idOf(id)]!; },
    async getEnsAddress(name) { st.calls++; if (st.fail) throw new Error("rpc down"); return st.names[name] ?? (name in st.texts ? (name.startsWith("gem") ? GEM : LEAD) : null); },
    async getEnsText(name, key) { st.calls++; if (st.fail) throw new Error("rpc down"); return st.texts[name]?.[key] ?? null; },
  };
  return { chain, st };
}

const make = (chain: EnsChain, clock = { t: NOW }) =>
  Object.assign(createEnsAuthority({ app, deployments, chain, now: () => clock.t }), { clock });

describe("getAgentAuthority", () => {
  it("reads rules live from ENS records, not from config", async () => {
    const { chain } = fakeChain({ texts: { "gem-research.supabrain.eth": { "sb.role": "worker", "sb.scope": "research", "sb.pay.cap": "7", "sb.pay.daily": "9", "sb.status": "active", "sb.vendor": "gemini" } } });
    const a = await make(chain).getAgentAuthority("gem-research");
    expect(a).toMatchObject({ label: "gem-research", ens: "gem-research.supabrain.eth", wallet: GEM, registered: true, status: "active", role: "worker", scope: "research", payCap: "7", payDaily: "9", vendor: "gemini", recordsOk: true });
    expect(a.leaseExpiresAt).toBe(NOW + 86_400_000);
  });

  it("is unregistered when the name has no owner (killed)", async () => {
    const { chain } = fakeChain({ owner: { "gem-research": ZERO } });
    const a = await make(chain).getAgentAuthority("gem-research");
    expect(a.registered).toBe(false);
    expect(a.status).toBe("unregistered");
  });

  it("is expired when the lease ran out", async () => {
    const { chain } = fakeChain({ owner: { "gem-research": ZERO }, expiry: { "gem-research": NOW / 1000 - 5 } });
    const a = await make(chain).getAgentAuthority("gem-research");
    expect(a.registered).toBe(false);
    expect(a.status).toBe("expired");
  });

  it("does not trust a name owned by a different wallet than the agent's", async () => {
    const { chain } = fakeChain({ owner: { "gem-research": OTHER } });
    const a = await make(chain).getAgentAuthority("gem-research");
    expect(a.registered).toBe(false);
    expect(a.status).toBe("unregistered");
    expect(a.wallet).toBe(GEM);
  });

  it("reports quarantined from sb.status", async () => {
    const { chain } = fakeChain({ texts: { "gem-research.supabrain.eth": { "sb.role": "worker", "sb.scope": "research", "sb.pay.cap": "2", "sb.pay.daily": "4", "sb.status": "quarantined", "sb.vendor": "gemini" } } });
    const a = await make(chain).getAgentAuthority("gem-research");
    expect(a.registered).toBe(true);
    expect(a.status).toBe("quarantined");
  });

  it("flags unusable records so callers can fail closed", async () => {
    const badRecords: Record<string, string>[] = [{ "sb.role": "worker", "sb.scope": "research", "sb.pay.cap": "lots", "sb.pay.daily": "4", "sb.status": "active", "sb.vendor": "gemini" }, { "sb.role": "emperor", "sb.scope": "research", "sb.pay.cap": "2", "sb.pay.daily": "4", "sb.status": "active", "sb.vendor": "gemini" }, { "sb.role": "worker", "sb.pay.cap": "2", "sb.pay.daily": "4", "sb.status": "active", "sb.vendor": "gemini" }];
    for (const bad of badRecords) {
      const { chain } = fakeChain({ texts: { "gem-research.supabrain.eth": bad } });
      expect((await make(chain).getAgentAuthority("gem-research")).recordsOk).toBe(false);
    }
  });

  it("fails closed when ENS cannot be read", async () => {
    const { chain } = fakeChain({ fail: true });
    await expect(make(chain).getAgentAuthority("gem-research")).rejects.toBeInstanceOf(EnsUnavailableError);
  });

  it("never serves a stale answer once the cache expired and ENS is down", async () => {
    const f = fakeChain();
    const auth = make(f.chain);
    await auth.getAgentAuthority("gem-research");
    f.st.fail = true;
    auth.clock.t += 11_000;
    await expect(auth.getAgentAuthority("gem-research")).rejects.toBeInstanceOf(EnsUnavailableError);
  });

  it("caches within the TTL and refreshes after it, so an unregister is seen", async () => {
    const f = fakeChain();
    const auth = make(f.chain);
    await auth.getAgentAuthority("gem-research");
    const afterFirst = f.st.calls;
    await auth.getAgentAuthority("gem-research");
    expect(f.st.calls).toBe(afterFirst); // served from cache
    f.st.owner["gem-research"] = ZERO;
    auth.clock.t += 11_000;
    expect((await auth.getAgentAuthority("gem-research")).registered).toBe(false);
  });

  it("rejects labels that are not team agents", async () => {
    await expect(make(fakeChain().chain).getAgentAuthority("mallory")).rejects.toThrow(/unknown agent/);
  });
});

describe("names and vendors", () => {
  it("lists team vendor ENS names from config", () => {
    expect(make(fakeChain().chain).teamVendors()).toEqual(["acme.supabrain.eth"]);
  });

  it("resolveEns returns null for an unknown name but throws when ENS is down", async () => {
    const auth = make(fakeChain().chain);
    expect(await auth.resolveEns("acme.supabrain.eth")).toBe(ACME);
    expect(await auth.resolveEns("nobody.supabrain.eth")).toBeNull();
    await expect(make(fakeChain({ fail: true }).chain).resolveEns("acme.supabrain.eth")).rejects.toBeInstanceOf(EnsUnavailableError);
  });

  it("findVendorEns matches an address to a team vendor case-insensitively", async () => {
    const auth = make(fakeChain().chain);
    expect(await auth.findVendorEns(ACME.toLowerCase() as `0x${string}`)).toBe("acme.supabrain.eth");
    expect(await auth.findVendorEns(OTHER)).toBeNull();
  });

  it("exposes the registry ref the vault needs", () => {
    const ref = make(fakeChain().chain).agentRegistryRef("gem-research");
    expect(ref).toEqual({ registry: REGISTRY, labelhash: labelhashOf("gem-research") });
    expect(() => make(fakeChain().chain).agentRegistryRef("mallory")).toThrow(/unknown agent/);
  });
});
