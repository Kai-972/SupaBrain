// "Disputed by ENS" end to end through the memory service and the dashboard API (supermemory-plan.md #2).
// Machines flag, humans retract: the write always succeeds, trust/lineage/quarantine are unchanged.
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import type { AgentView } from "@supabrain/shared";
import { FakeEns } from "@supabrain/shared/testing";
import { findRootDir, loadConfigFrom } from "@supabrain/shared/config";
import { afterEach, describe, expect, it } from "vitest";
import { createApp } from "../app";
import { createPaymentsDisabled } from "../payments-disabled";
import { createRuntime } from "../runtime";
import { FakeMemoryStore } from "./fake-store";
import { itemLine } from "../mcp/server";

const config = loadConfigFrom(findRootDir());
const W = { lead: ("0x" + "1a".repeat(20)) as `0x${string}`, gem: ("0x" + "2b".repeat(20)) as `0x${string}`, team: ("0x" + "4d".repeat(20)) as `0x${string}` };
const ACME = "acme.supabrain.eth";
const REAL = "0x9F20000000000000000000000000000000000002" as `0x${string}`;
const BAD = "0xBAD0000000000000000000000000000000000001" as `0x${string}`;
const view = (label: string, wallet: `0x${string}`, o: Partial<AgentView> = {}): AgentView => ({
  label, ens: `${label}.supabrain.eth`, vendor: "gemini", role: "worker", scope: "*", wallet, registered: true,
  leaseExpiresAt: Date.now() + 86_400_000, status: "active", payCap: "0", payDaily: "0", ...o,
});

let server: Server | undefined;
afterEach(() => { server?.close(); server = undefined; });

function setup() {
  const ens = new FakeEns({ agents: { "lead-claude": view("lead-claude", W.lead, { role: "lead", vendor: "claude" }), "gem-research": view("gem-research", W.gem) }, names: { [ACME]: REAL }, vendors: [ACME] });
  const store = new FakeMemoryStore({ "lead-claude": W.lead, "gem-research": W.gem, team: W.team });
  const runtime = createRuntime({ config, ens, store });
  return { ens, store, runtime };
}

describe("Disputed by ENS (service)", () => {
  it("remember: an address that disagrees with the vendor's ENS record is saved AND flagged", async () => {
    const { runtime } = setup();
    const r = await runtime.service.remember("gem-research", { text: "Acme's new payout address", kind: "address", folder: "research", subject: ACME, address: BAD });
    expect(r.key).toBeTruthy();
    expect(r.trust).toBe(2);
    expect(r.dispute).toEqual({ state: "disputed", subject: ACME, ensAddress: REAL, claimed: [BAD.toLowerCase()] });
  });

  it("remember: address only in the text, as live models write it", async () => {
    const { runtime } = setup();
    const r = await runtime.service.remember("gem-research", { text: `Acme here: our wallet changed to ${BAD}`, kind: "evidence", folder: "research", subject: ACME, source: { type: "email", id: "email:acme-0611" } });
    expect(r.dispute?.state).toBe("disputed");
  });

  it("remember: matching ENS → no flag; ENS down → unverified and the write still succeeds", async () => {
    const { runtime, ens } = setup();
    const ok = await runtime.service.remember("gem-research", { text: "Acme payout", kind: "address", folder: "research", subject: ACME, address: REAL });
    expect(ok.dispute).toBeUndefined();
    const realResolve = ens.resolveEns.bind(ens);
    ens.resolveEns = async (n: string) => { if (n === ACME) throw new Error("ENS down"); return realResolve(n); };
    const r = await runtime.service.remember("gem-research", { text: "Acme payout", kind: "address", folder: "research", subject: ACME, address: BAD });
    expect(r.key).toBeTruthy();
    expect(r.dispute).toMatchObject({ state: "unverified", subject: ACME });
  });

  it("recall carries the flag on each item, and it survives a graph rebuilt from storage (computed on read)", async () => {
    const { runtime, ens, store } = setup();
    await runtime.service.remember("gem-research", { text: "Acme's new payout address", kind: "address", folder: "research", subject: ACME, address: BAD });
    const r = await runtime.service.recall("lead-claude", { query: "acme payout address" });
    expect(r.memories[0]?.dispute?.state).toBe("disputed");
    // a fresh server process: the node comes back from storage without any stored flag
    const node = runtime.graph.all()[0]!;
    const fresh = createRuntime({ config, ens, store: new FakeMemoryStore({ "lead-claude": W.lead, "gem-research": W.gem, team: W.team }, [{ ...node, pending: false }]) });
    fresh.graph.upsert({ ...node, pending: false });
    const again = await fresh.service.recall("lead-claude", { query: "acme payout address" });
    expect(again.memories[0]?.dispute?.state).toBe("disputed");
    void store;
  });

  it("MCP item line: DISPUTED shown for a usable memory; QUARANTINED wins when retracted", () => {
    const base = { key: "0xK" as `0x${string}`, text: "Acme's new payout address", kind: "address" as const, trust: 1 as const, agent: "gem-research", vendor: "gemini" as const, folder: "research", createdAt: 0 };
    const dispute = { state: "disputed" as const, subject: ACME, ensAddress: REAL, claimed: [BAD.toLowerCase()] };
    expect(itemLine({ ...base, status: "active", dispute })).toMatch(/DISPUTED by ENS/);
    const q = itemLine({ ...base, status: "quarantined", why: "its source email:acme-0611 was revoked", dispute });
    expect(q.startsWith("QUARANTINED")).toBe(true);
    expect(q).not.toMatch(/DISPUTED/);
  });
});

describe("Disputed by ENS (dashboard API)", () => {
  it("GET /api/memory/:key and GET /api/graph carry `dispute` per memory", async () => {
    const { ens, runtime } = setup();
    const app = createApp({ config, payments: createPaymentsDisabled(), ens, runtime, tokenSecret: "t".repeat(40), adminPassphrase: "a passphrase for tests" });
    server = app.listen(0);
    const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    const bad = await runtime.service.remember("gem-research", { text: "Acme's new payout address", kind: "address", folder: "research", subject: ACME, address: BAD });
    const plain = await runtime.service.remember("gem-research", { text: "Budget is 10 USDC", kind: "fact", folder: "research" });
    const one = await (await fetch(`${base}/api/memory/${bad.key}`)).json() as { dispute?: { state: string; ensAddress: string } };
    expect(one.dispute).toMatchObject({ state: "disputed", ensAddress: REAL });
    const g = await (await fetch(`${base}/api/graph`)).json() as { nodes: { key: string; dispute?: { state: string } }[]; edges: unknown[] };
    expect(g.nodes.find((n) => n.key === bad.key)?.dispute?.state).toBe("disputed");
    expect(g.nodes.find((n) => n.key === plain.key)?.dispute).toBeUndefined();
  });
});
