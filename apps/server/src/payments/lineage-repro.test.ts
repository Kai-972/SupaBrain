// Lane B repro (live run 2026-11-06): after `demo:seed` + P1 on the live server, M1 and M2 lost their parents in the
// in-memory graph (edges 6 → 3) while Arkiv still had them (a restart rebuilt them correctly). This drives the same
// sequence through Lane A's runtime (FakeMemoryStore) and Lane B's REAL payments engine, to locate the step that drops them.
import type { AgentView } from "@supabrain/shared";
import { FakeEns } from "@supabrain/shared/testing";
import { findRootDir, loadConfigFrom } from "@supabrain/shared/config";
import { createPaymentsEngine } from "@supabrain/payments";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { describe, expect, it } from "vitest";
import { FakeMemoryStore } from "../memory/fake-store";
import { createRuntime } from "../runtime";

const config = loadConfigFrom(findRootDir());
const W = { lead: ("0x" + "1a".repeat(20)) as `0x${string}`, gem: ("0x" + "2b".repeat(20)) as `0x${string}`, team: ("0x" + "4d".repeat(20)) as `0x${string}` };
const ACME = ("0x" + "ac".repeat(20)) as `0x${string}`;
const BAD = ("0x" + "ba".repeat(20)) as `0x${string}`;
const view = (label: string, wallet: `0x${string}`, o: Partial<AgentView> = {}): AgentView => ({
  label, ens: `${label}.supabrain.eth`, vendor: "claude", role: "lead", scope: "*", wallet, registered: true,
  leaseExpiresAt: Date.now() + 86_400_000, status: "active", payCap: "4", payDaily: "30", ...o,
});
const flush = () => new Promise((r) => setTimeout(r, 5));

describe("lineage survives the demo sequence (Lane B repro of a live run; it.fails until graph.walk is fixed)", () => {
  it.fails("M1 ← E1 and M2 ← M1 keep their parents after seeding, confirmations and a blocked P1", async () => {
    const ens = new FakeEns({
      agents: { "lead-claude": view("lead-claude", W.lead), "gem-research": view("gem-research", W.gem, { role: "worker", scope: "research", vendor: "gemini" }) },
      names: { "acme.supabrain.eth": ACME }, vendors: ["acme.supabrain.eth"],
    });
    const store = new FakeMemoryStore({ "lead-claude": W.lead, "gem-research": W.gem, team: W.team });
    const rt = createRuntime({ config, ens, store });
    const { service, graph } = rt;
    const parentsOf = (k: string) => graph.get(k)?.parents;

    const e1 = await service.remember("gem-research", { text: "email: payout wallet changed", kind: "evidence", folder: "research", subject: "acme.supabrain.eth", address: BAD, source: { type: "email", id: "email:acme-0611" } } as never);
    await flush();
    await service.recall("gem-research", { query: "payout wallet" });
    const m1 = await service.remember("gem-research", { text: "Acme's new payout address", kind: "address", folder: "research", subject: "acme.supabrain.eth", address: BAD, cites: [e1.key] } as never);
    await flush();
    await service.recall("lead-claude", { query: "acme payout address" });
    const m2 = await service.remember("lead-claude", { text: "Pay invoice #12 to the new address", kind: "plan", folder: "finance", cites: [m1.key] } as never);
    await flush();
    expect(parentsOf(m1.key), "M1 after seeding").toEqual([e1.key]);
    expect(parentsOf(m2.key), "M2 after seeding").toEqual([m1.key]);

    const payments = createPaymentsEngine({ ens, graph, arkiv: { writePayment: (p) => store.writePayment(p) }, emit: (e) => rt.bus.emit(e), config }, {
      vault: { spentToday: async () => 0n } as never,
      domain: { name: "BrainVault", version: "1", chainId: 31337, verifyingContract: W.team },
      decimals: 6, tokenSymbol: "USDC", maxRoots: 8, intentTtlSec: 900, attestationTtlSec: 300,
      agentSigner: (l) => (l === "lead-claude" ? ({ account: { address: W.lead } } as never) : undefined),
      policySigner: privateKeyToAccount(generatePrivateKey()), guardian: { account: { address: W.team } } as never,
      approvals: { start: async () => { throw new Error("not in this test"); } }, now: () => Date.now(),
    });
    const d = await payments.pay("lead-claude", { payee: BAD, amount: "5", memo: "invoice #12", cites: [m2.key] });
    await flush();
    expect(d.status).toBe("blocked");
    expect(parentsOf(m1.key), "M1 after a blocked P1").toEqual([e1.key]);
    expect(parentsOf(m2.key), "M2 after a blocked P1").toEqual([m1.key]);
  });
});
