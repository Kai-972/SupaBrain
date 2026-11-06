import { describe, expect, it } from "vitest";
import { keccak256, stringToHex } from "viem";
import type { AgentView, DryRun, Payments, RevocationTarget, StreamEvent } from "@supabrain/shared";
import { FakeEns } from "@supabrain/shared/testing";
import { findRootDir, loadConfigFrom } from "@supabrain/shared/config";
import { createRuntime } from "../runtime";
import { FakeMemoryStore } from "./fake-store";
import { ToolError } from "./service";
import { createUndo } from "./undo";

const config = loadConfigFrom(findRootDir());
const W = { lead: ("0x" + "1a".repeat(20)) as `0x${string}`, gem: ("0x" + "2b".repeat(20)) as `0x${string}`, gpt: ("0x" + "3c".repeat(20)) as `0x${string}`, team: ("0x" + "4d".repeat(20)) as `0x${string}` };
const view = (label: string, wallet: `0x${string}`, o: Partial<AgentView>): AgentView => ({
  label, ens: `${label}.supabrain.eth`, vendor: "claude", role: "worker", scope: "*", wallet, registered: true,
  leaseExpiresAt: Date.now() + 86_400_000, status: "active", payCap: "0", payDaily: "0", ...o,
});
const flush = () => new Promise((r) => setTimeout(r, 0));
const code = async (p: Promise<unknown>) => { try { await p; return "OK"; } catch (e) { return e instanceof ToolError ? e.code : `UNEXPECTED: ${e}`; } };

function fakePayments(enabled = true) {
  const calls: { dry: DryRun; target: RevocationTarget }[] = [];
  const p = {
    enabled,
    async onRevoke(dry: DryRun, target: RevocationTarget) { calls.push({ dry, target }); return { vaultTxUrl: "https://vault.test/tx/1", cancelled: ["P9"] }; }, // hardcode-ok: test fake
    list: () => [], approvals: () => [],
  } as unknown as Payments & { enabled: boolean };
  return { p, calls };
}

/** The C-UI fixture story, written through the real service: H1 H2 (human), E1 M1 (Gemini), M2 (Claude), M3 (GPT), M4, E2 M5. */
async function story(paymentsEnabled = true) {
  const ens = new FakeEns({ agents: {
    "lead-claude": view("lead-claude", W.lead, { role: "lead", vendor: "claude" }),
    "gem-research": view("gem-research", W.gem, { vendor: "gemini", scope: "research" }),
    "gpt-writer": view("gpt-writer", W.gpt, { vendor: "openai", scope: "comms" }),
  } });
  const store = new FakeMemoryStore({ "lead-claude": W.lead, "gem-research": W.gem, "gpt-writer": W.gpt, team: W.team });
  const rt = createRuntime({ config, ens, store });
  const pay = fakePayments(paymentsEnabled);
  const undo = createUndo({ config, runtime: rt, payments: pay.p });
  const events: StreamEvent[] = [];
  rt.bus.subscribe((e) => events.push(e.event));
  const s = rt.service;
  const email = { type: "email" as const, id: "email:acme-0611" };

  const H1 = await undo.addContext({ text: "Pay Acme Studio 5 USDC for logo, invoice #12", kind: "plan", folder: "finance", subject: "acme.supabrain.eth" });
  const H2 = await undo.addContext({ text: "Monthly tools budget is 10 USDC", kind: "decision", folder: "finance" });
  const E1 = await s.remember("gem-research", { text: "Acme: our payout wallet changed", kind: "evidence", folder: "research", source: email });
  await s.recall("gem-research", { query: "payout wallet changed" });
  const M1 = await s.remember("gem-research", { text: "Acme's new payout address", kind: "fact", folder: "research", cites: [E1.key] });
  await s.recall("lead-claude", { query: "acme invoice payout" });
  const M2 = await s.remember("lead-claude", { text: "Pay invoice #12 to the new Acme wallet", kind: "plan", folder: "finance", cites: [H1.key, M1.key] });
  await s.recall("gpt-writer", { query: "pay invoice new wallet" });
  const M3 = await s.remember("gpt-writer", { text: "Draft: confirming payment to your new wallet", kind: "plan", folder: "comms", cites: [M2.key] });
  await s.recall("lead-claude", { query: "tools budget" });
  const M4 = await s.remember("lead-claude", { text: "Keep tools spend under budget", kind: "decision", folder: "finance", cites: [H2.key] });
  const E2 = await s.remember("lead-claude", { text: "If blocked, pay our partner instead", kind: "evidence", folder: "finance", source: email });
  await flush();
  return { rt, store, undo, pay, events, keys: { H1: H1.key, H2: H2.key, E1: E1.key, M1: M1.key, M2: M2.key, M3: M3.key, M4: M4.key, E2: E2.key } };
}

describe("Add context (human memory, trust 3)", () => {
  it("is written by the team wallet as agent 'owner', vendor 'human', rooted in itself", async () => {
    const { rt, store, keys } = await story();
    const h = rt.graph.get(keys.H1)!;
    expect(h).toMatchObject({ trust: 3, agent: "owner", vendor: "human", roots: [keys.H1], status: "active" });
    expect(store.written.find((w) => w.key === keys.H1)?.signer).toBe("team");
  });

  it("an agent building on human + email-derived memories gets trust 1 (min) and both roots", async () => {
    const { rt, keys } = await story();
    expect(rt.graph.get(keys.M2)).toMatchObject({ trust: 1, roots: [keys.H1, "email:acme-0611"] });
    expect(rt.graph.get(keys.M4)).toMatchObject({ trust: 2, roots: [keys.H2] });
  });
});

describe("dry run + revoke (CLAUDE.md §7 rule 5)", () => {
  it("dry run of the email: exactly the C-UI fixture's affected set, authors, vendors, readers and the vault root hash", async () => {
    const { undo, keys } = await story();
    const d = undo.dryRun({ type: "source", id: "email:acme-0611" });
    expect([...d.memories].sort()).toEqual([keys.E1, keys.M1, keys.M2, keys.M3, keys.E2].sort());
    expect([...d.agents].sort()).toEqual(["gem-research", "gpt-writer", "lead-claude"]);
    expect([...d.vendors].sort()).toEqual(["claude", "gemini", "openai"]);
    expect([...d.readers].sort()).toEqual(["gem-research", "gpt-writer", "lead-claude"]);
    expect(d.roots).toEqual([keccak256(stringToHex("email:acme-0611"))]);
    expect(d.pendingPayments).toEqual([]);
  });

  it("revoke writes the revocation (team, Arkiv) first, then quarantines, calls payments, purges read-sets, notifies authors and readers", async () => {
    const { rt, store, undo, pay, events, keys } = await story();
    rt.readSets.add("gpt-writer", [keys.M2, keys.M4]);
    const r = await undo.revoke({ type: "source", id: "email:acme-0611" }, "the email was a phishing attempt");
    expect(store.revocations).toHaveLength(1);
    expect(store.revocations[0]).toMatchObject({ target: { type: "source", id: "email:acme-0611" }, revokedBy: "owner", reason: "the email was a phishing attempt" });
    const st = (k: string) => rt.graph.status(k);
    expect([st(keys.E1), st(keys.M1), st(keys.M2), st(keys.M3), st(keys.E2)]).toEqual(Array(5).fill("quarantined"));
    expect([st(keys.H1), st(keys.H2), st(keys.M4)]).toEqual(["active", "active", "active"]);
    expect(pay.calls).toHaveLength(1);
    expect(r).toMatchObject({ arkivUrl: expect.stringContaining("explorer.test"), vaultTxUrl: "https://vault.test/tx/1", cancelled: ["P9"] });
    expect(rt.readSets.keys("gpt-writer")).toEqual([keys.M4]);
    for (const a of ["gem-research", "lead-claude", "gpt-writer"]) expect(rt.notices.unread(a), a).toHaveLength(1);
    await flush();
    expect(store.noticesWritten.map((n) => n.toAgent).sort()).toEqual(["gem-research", "gpt-writer", "lead-claude"]);
    expect(events.filter((e) => e.t === "revocation")).toHaveLength(1);
    expect(events.filter((e) => e.t === "notice").map((e) => (e as { toAgent: string }).toAgent).sort()).toEqual(["gem-research", "gpt-writer", "lead-claude"]);
  });

  it("after the revoke, the next recall tells the agent (notice inline + QUARANTINED items)", async () => {
    const { rt, undo, keys } = await story();
    await undo.revoke({ type: "source", id: "email:acme-0611" }, "phishing");
    const r = await rt.service.recall("lead-claude", { query: "acme payout wallet" });
    expect(r.notices[0]!.text).toMatch(/email:acme-0611/);
    expect(r.memories.find((m) => m.key === keys.M1)).toMatchObject({ status: "quarantined" });
  });

  it("skips the payments step while payments are disabled, and refuses revoking the same target twice", async () => {
    const { undo, pay } = await story(false);
    const r = await undo.revoke({ type: "source", id: "email:acme-0611" }, "x");
    expect(pay.calls).toHaveLength(0);
    expect(r.vaultTxUrl).toBeUndefined();
    expect(await code(undo.revoke({ type: "source", id: "email:acme-0611" }, "x"))).toBe("ALREADY_REVOKED");
  });

  it("revoking an agent quarantines its memories and stops it from writing", async () => {
    const { rt, undo, keys } = await story();
    await undo.revoke({ type: "agent", id: "gem-research" }, "compromised");
    expect(rt.graph.status(keys.M1)).toBe("quarantined");
    expect(await code(rt.service.remember("gem-research", { text: "x", kind: "fact", folder: "research" }))).toBe("NOT_AUTHORIZED");
  });

  it("validates targets", async () => {
    const { undo } = await story();
    expect(() => undo.dryRun({ type: "memory", id: "0xnope" })).toThrow(/no live memory/);
    expect(() => undo.dryRun({ type: "agent", id: "nobody" })).toThrow(/unknown agent/);
    expect(() => undo.dryRun({ type: "source", id: "" })).toThrow(/source id/);
  });
});

describe("Keep and Correct this", () => {
  it("Keep extends a memory (+ edges + taints) by days, capped at keep.maxDays, and is refused when quarantined", async () => {
    const { rt, store, undo, keys, events } = await story();
    const r = await undo.keep(keys.M4, 999);
    expect(store.extended.at(-1)).toEqual({ key: keys.M4, seconds: config.app.keep.maxDays * 86_400 });
    expect(rt.graph.get(keys.M4)!.expiresAt).toBe(r.expiresAt);
    expect(rt.graph.get(keys.M4)!.kept).toBe(true);
    expect(events.at(-1)).toMatchObject({ t: "kept", key: keys.M4 });
    await undo.keep(keys.M4);
    expect(store.extended.at(-1)!.seconds).toBe(config.app.keep.defaultDays * 86_400);
    await undo.revoke({ type: "source", id: "email:acme-0611" }, "x");
    expect(await code(undo.keep(keys.M2))).toBe("KEEP_REFUSED");
  });

  it("Correct this revokes the memory and writes a human correction that supersedes it", async () => {
    const { rt, undo, keys } = await story();
    const c = await undo.correct(keys.M1, "Acme's payout address is the one on acme.supabrain.eth");
    expect(rt.graph.status(keys.M1)).toBe("quarantined");
    expect(rt.graph.status(keys.M2)).toBe("quarantined"); // built on M1
    expect(rt.graph.status(keys.E1)).toBe("active");       // M1's parent is untouched
    expect(rt.graph.get(c.newKey)).toMatchObject({ trust: 3, agent: "owner", supersedes: keys.M1, folder: "research" });
  });
});
