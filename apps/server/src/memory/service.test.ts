import { describe, expect, it } from "vitest";
import type { AgentView, StreamEvent } from "@supabrain/shared";
import { FakeEns } from "@supabrain/shared/testing";
import { findRootDir, loadConfigFrom } from "@supabrain/shared/config";
import { MemoryGraph } from "../engine/graph";
import { NoticeBox, ReadLog, ReadSets } from "../engine/session";
import { EventBus } from "../events";
import { FakeMemoryStore } from "./fake-store";
import { createMemoryService, ToolError } from "./service";

const config = loadConfigFrom(findRootDir());
const W = { lead: ("0x" + "1a".repeat(20)) as `0x${string}`, gem: ("0x" + "2b".repeat(20)) as `0x${string}`, gpt: ("0x" + "3c".repeat(20)) as `0x${string}`, team: ("0x" + "4d".repeat(20)) as `0x${string}` };
const view = (label: string, wallet: `0x${string}`, o: Partial<AgentView> = {}): AgentView => ({
  label, ens: `${label}.supabrain.eth`, vendor: "claude", role: "worker", scope: "research", wallet, registered: true,
  leaseExpiresAt: Date.now() + 86_400_000, status: "active", payCap: "0", payDaily: "0", ...o,
});

function setup(o: { agents?: Record<string, AgentView>; wallets?: Record<string, `0x${string}`> } = {}) {
  const ens = new FakeEns({
    agents: o.agents ?? {
      "lead-claude": view("lead-claude", W.lead, { role: "lead", scope: "*", vendor: "claude" }),
      "gem-research": view("gem-research", W.gem, { vendor: "gemini" }),
      "gpt-writer": view("gpt-writer", W.gpt, { scope: "comms", vendor: "openai" }),
    },
  });
  const store = new FakeMemoryStore(o.wallets ?? { "lead-claude": W.lead, "gem-research": W.gem, "gpt-writer": W.gpt, team: W.team });
  const graph = new MemoryGraph();
  const bus = new EventBus();
  const events: StreamEvent[] = [];
  bus.subscribe((e) => events.push(e.event));
  const readSets = new ReadSets(config.app.readSet.ttlSec);
  const svc = createMemoryService({ config, ens, store, graph, readSets, readLog: new ReadLog(), notices: new NoticeBox(), bus });
  return { svc, ens, store, graph, events, readSets };
}
const flush = () => new Promise((r) => setTimeout(r, 0));
const code = async (p: Promise<unknown>) => { try { await p; return "OK"; } catch (e) { return e instanceof ToolError ? e.code : `UNEXPECTED: ${e}`; } };

describe("remember", () => {
  it("writes optimistically (pending), then confirms with a proof link; the read-set resets", async () => {
    const { svc, store, graph, events } = setup();
    store.holdCommits = true;
    const r = await svc.remember("lead-claude", { text: "We pay vendors in USDC on Sepolia", kind: "decision", folder: "finance" });
    expect(r).toMatchObject({ trust: 2, parents: [], roots: [], pending: true });
    expect(graph.get(r.key)).toMatchObject({ pending: true, status: "active", agent: "lead-claude", vendor: "claude", creator: W.lead });
    expect(events.map((e) => e.t)).toEqual(["memory"]);
    store.release();
    await flush();
    expect(graph.get(r.key)).toMatchObject({ pending: false, proofUrl: `https://explorer.test/tx/${r.key}` });
    expect(events.map((e) => e.t)).toEqual(["memory", "confirmed"]);
    expect(store.written[0]).toMatchObject({ signer: "lead-claude" });
  });

  it("lineage across vendors: Gemini builds on Claude's memory; trust = min, roots = union", async () => {
    const { svc } = setup();
    const ev = await svc.remember("gem-research", { text: "Acme says their payout wallet changed", kind: "evidence", folder: "research", source: { type: "email", id: "email:acme-0611" } });
    expect(ev).toMatchObject({ trust: 1, roots: ["email:acme-0611"] });
    await flush();
    const rec = await svc.recall("lead-claude", { query: "acme payout wallet" });
    expect(rec.memories.map((m) => m.key)).toContain(ev.key);
    const plan = await svc.remember("lead-claude", { text: "Pay invoice #12 to the new Acme wallet", kind: "plan", folder: "finance" });
    expect(plan).toMatchObject({ trust: 1, parents: [ev.key], roots: ["email:acme-0611"] });
  });

  it("cites must have been recalled first", async () => {
    const { svc } = setup();
    const a = await svc.remember("lead-claude", { text: "Budget is 10 USDC", kind: "decision", folder: "finance" });
    expect(await code(svc.remember("gem-research", { text: "x", kind: "fact", folder: "research", cites: [a.key] }))).toBe("CITE_NOT_READ");
    await svc.recall("gem-research", { query: "budget" });
    expect((await svc.remember("gem-research", { text: "Budget noted", kind: "fact", folder: "research", cites: [a.key] })).parents).toEqual([a.key]);
  });

  it("enforces the ENS folder scope (lead '*' anywhere, worker only its folder)", async () => {
    const { svc } = setup();
    expect(await code(svc.remember("gem-research", { text: "x", kind: "fact", folder: "finance" }))).toBe("SCOPE");
    expect(await code(svc.remember("gem-research", { text: "x", kind: "fact", folder: "research/acme" }))).toBe("OK");
    expect(await code(svc.remember("lead-claude", { text: "x", kind: "fact", folder: "comms" }))).toBe("OK");
  });

  it("the kill switch: an unregistered or paused agent cannot write (or read), even with a valid token", async () => {
    const { svc } = setup({ agents: { "gem-research": view("gem-research", W.gem, { registered: false, status: "unregistered" }), "lead-claude": view("lead-claude", W.lead, { status: "quarantined" }) } });
    expect(await code(svc.remember("gem-research", { text: "x", kind: "fact", folder: "research" }))).toBe("NOT_AUTHORIZED");
    expect(await code(svc.recall("gem-research", { query: "x" }))).toBe("NOT_AUTHORIZED");
    expect(await code(svc.remember("lead-claude", { text: "x", kind: "fact", folder: "research" }))).toBe("NOT_AUTHORIZED");
  });

  it("fails closed when ENS cannot be read", async () => {
    const { svc, ens } = setup();
    ens.failing = true;
    expect(await code(svc.remember("lead-claude", { text: "x", kind: "fact", folder: "finance" }))).toBe("AUTHORITY_UNKNOWN");
    expect(await code(svc.recall("lead-claude", { query: "x" }))).toBe("AUTHORITY_UNKNOWN");
  });

  it("observers cannot write; and the server key must match the agent's ENS wallet", async () => {
    const obs = setup({ agents: { "gem-research": view("gem-research", W.gem, { role: "observer" }) } });
    expect(await code(obs.svc.remember("gem-research", { text: "x", kind: "fact", folder: "research" }))).toBe("NOT_AUTHORIZED");
    const wrong = setup({ wallets: { "gem-research": W.gpt, team: W.team } });
    expect(await code(wrong.svc.remember("gem-research", { text: "x", kind: "fact", folder: "research" }))).toBe("KEY_MISMATCH");
  });

  it("validates kinds: evidence needs a source, address needs an address, refs are checked", async () => {
    const { svc } = setup();
    expect(await code(svc.remember("lead-claude", { text: "x", kind: "evidence", folder: "f" }))).toBe("INVALID");
    expect(await code(svc.remember("lead-claude", { text: "x", kind: "address", folder: "f" }))).toBe("INVALID");
    expect(await code(svc.remember("lead-claude", { text: "x", kind: "address", folder: "f", address: "0x123" as `0x${string}` }))).toBe("INVALID");
    expect(await code(svc.remember("lead-claude", { text: "x", kind: "ref", folder: "f", ref: { kind: "github", locator: "a/b:c.md", label: "Spec" } }))).toBe("INVALID");
    expect(await code(svc.remember("lead-claude", { text: "", kind: "fact", folder: "f" }))).toBe("INVALID");
    expect(await code(svc.remember("lead-claude", { text: "x", kind: "fact", folder: "Bad Folder" }))).toBe("INVALID");
  });

  it("refuses an over-large implicit parent set and asks the agent to cite", async () => {
    const { svc, readSets } = setup();
    const keys: string[] = [];
    for (let i = 0; i < config.app.readSet.maxParents + 1; i++) keys.push((await svc.remember("lead-claude", { text: `fact ${i}`, kind: "fact", folder: "f" })).key);
    readSets.add("gem-research", keys);
    expect(await code(svc.remember("gem-research", { text: "x", kind: "fact", folder: "research" }))).toBe("TOO_MANY_PARENTS");
  });

  it("a write that does not land is removed and announced (write_failed)", async () => {
    const { svc, store, graph, events } = setup();
    store.failNextCommit = "reverted";
    const r = await svc.remember("lead-claude", { text: "x", kind: "fact", folder: "f" });
    await flush();
    expect(graph.has(r.key)).toBe(false);
    expect(events.at(-1)).toMatchObject({ t: "write_failed", key: r.key });
  });
});

describe("recall / explain / notices / whoami", () => {
  it("flags quarantined memories with a reason and keeps them out of the read-set; logs readers and the recall", async () => {
    const { svc, graph, readSets } = setup();
    const ev = await svc.remember("gem-research", { text: "Acme wallet changed to 0xBAD", kind: "evidence", folder: "research", source: { type: "email", id: "email:acme-0611" } });
    const ok = await svc.remember("lead-claude", { text: "Acme wallet per ENS is 0x9F2", kind: "fact", folder: "finance" });
    graph.applyRevocation({ type: "source", id: "email:acme-0611" });
    const r = await svc.recall("gpt-writer", { query: "acme wallet" });
    const bad = r.memories.find((m) => m.key === ev.key)!;
    expect(bad).toMatchObject({ status: "quarantined" });
    expect(bad.why).toMatch(/email:acme-0611/);
    expect(readSets.keys("gpt-writer")).toEqual([ok.key]);
    expect(svc.readers([ev.key, ok.key])).toEqual(["gpt-writer"]);
    expect(svc.recallLog().at(-1)).toMatchObject({ agent: "gpt-writer", query: "acme wallet" });
  });

  it("explain shows each path to the roots with trust and status per hop", async () => {
    const { svc } = setup();
    const ev = await svc.remember("gem-research", { text: "Acme wallet changed", kind: "evidence", folder: "research", source: { type: "email", id: "email:acme-0611" } });
    await svc.recall("lead-claude", { query: "acme" });
    const m = await svc.remember("lead-claude", { text: "Use the new wallet", kind: "plan", folder: "finance" });
    const ex = await svc.explain("lead-claude", m.key);
    expect(ex.roots).toEqual(["email:acme-0611"]);
    expect(ex.paths).toHaveLength(1);
    expect(ex.paths[0]!.map((h) => [h.key, h.trust, h.agent])).toEqual([[m.key, 1, "lead-claude"], [ev.key, 1, "gem-research"]]);
    expect(await code(svc.explain("lead-claude", "0xnope"))).toBe("NOT_FOUND");
  });

  it("every result carries unread notices until check_notices marks them read", async () => {
    const { svc } = setup();
    svc.notices.add("lead-claude", { revocation: "0xR", text: "email:acme-0611 was retracted", affected: [], at: 1 });
    expect((await svc.recall("lead-claude", { query: "x" })).notices).toHaveLength(1);
    expect(await svc.checkNotices("lead-claude")).toHaveLength(1);
    expect((await svc.recall("lead-claude", { query: "x" })).notices).toHaveLength(0);
  });

  it("whoami emits `connected` once per token", async () => {
    const { svc, events } = setup();
    await svc.whoami("lead-claude", { tokenId: "t1", client: "claude-code 2.1" });
    await svc.whoami("lead-claude", { tokenId: "t1", client: "claude-code 2.1" });
    await svc.whoami("lead-claude", { tokenId: "t2", client: "claude-ai" });
    expect(events.filter((e) => e.t === "connected")).toEqual([
      { t: "connected", agent: "lead-claude", client: "claude-code 2.1" },
      { t: "connected", agent: "lead-claude", client: "claude-ai" },
    ]);
  });
});
