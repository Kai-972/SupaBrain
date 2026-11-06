import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import { afterEach, describe, expect, it } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import type { AgentView, ApprovalView, PayDecision, Payment, Payments, PaymentsDeps, StreamEvent } from "@supabrain/shared";
import { FakeEns } from "@supabrain/shared/testing";
import { findRootDir, loadConfigFrom } from "@supabrain/shared/config";
import { createApp } from "../app";
import { issueAgentToken } from "../auth/tokens";
import { FakeMemoryStore } from "../memory/fake-store";
import { createRuntime } from "../runtime";
import { mountPayments } from "./mount";

const config = loadConfigFrom(findRootDir());
const SECRET = "p".repeat(40);
const PASS = "owner passphrase for tests";
const W = { lead: ("0x" + "1a".repeat(20)) as `0x${string}`, gem: ("0x" + "2b".repeat(20)) as `0x${string}`, team: ("0x" + "4d".repeat(20)) as `0x${string}` };
const ACME = ("0x" + "ac".repeat(20)) as `0x${string}`;
const view = (label: string, wallet: `0x${string}`, o: Partial<AgentView> = {}): AgentView => ({
  label, ens: `${label}.supabrain.eth`, vendor: "claude", role: "lead", scope: "*", wallet, registered: true,
  leaseExpiresAt: Date.now() + 86_400_000, status: "active", payCap: "4", payDaily: "30", ...o,
});
const approval: ApprovalView = { id: "A1", intentId: "P3", agent: "lead-claude", payee: ACME, payeeEns: "acme.supabrain.eth", amount: "5", reasons: [{ code: "OVER_CAP", cap: "4", amount: "5" }], userCode: "ABCD-1234", verificationUri: "https://world.test/connect?key=SECRET", expiresAt: Date.now() + 300_000 }; // hardcode-ok: test fake

/** A fake createPayments that keeps the deps it was given, so the test can drive emit/writePayment like the engine. */
function fakeFactory(decide: (agent: string) => PayDecision = () => ({ status: "blocked", reasons: [{ code: "ENS_MISMATCH", ensName: "acme.supabrain.eth", ensAddress: ACME, claimedAddress: "0xbad" }], path: ["0xM2"], intentId: "P1" })) {
  const box: { deps?: PaymentsDeps; calls: string[]; cancelled: string[] } = { calls: [], cancelled: [] };
  const factory = (deps: PaymentsDeps): Payments => {
    box.deps = deps;
    return {
      async pay(agent) { box.calls.push(agent); return decide(agent); },
      async status(id) { return { status: "denied", intentId: id }; },
      async onRevoke() { return { cancelled: [] }; },
      async pauseAgent() { return {}; },
      list: () => [],
      approvals: () => [approval],
      async cancel(id) { box.cancelled.push(id); },
    };
  };
  return { factory, box };
}

function setup(factory?: (d: PaymentsDeps) => Payments) {
  const ens = new FakeEns({ agents: { "lead-claude": view("lead-claude", W.lead), "gem-research": view("gem-research", W.gem, { role: "worker", scope: "research", vendor: "gemini" }) } });
  const store = new FakeMemoryStore({ "lead-claude": W.lead, "gem-research": W.gem, team: W.team });
  const runtime = createRuntime({ config, ens, store });
  const logs: string[] = [];
  const payments = mountPayments({ config, ens, runtime, log: (l) => logs.push(l), ...(factory ? { factory } : {}) });
  return { ens, store, runtime, payments, logs };
}

let server: Server | undefined;
afterEach(() => { server?.close(); server = undefined; });
const flush = () => new Promise((r) => setTimeout(r, 0));

describe("mountPayments (A-BRAIN S5)", () => {
  it("falls back to the honest disabled stub when createPayments cannot start, and says why", () => {
    const { payments, logs } = setup(() => { throw new Error("POLICY_SIGNER_PRIVATE_KEY is not set"); });
    expect(payments.enabled).toBe(false);
    expect(logs.join("\n")).toMatch(/payments disabled: POLICY_SIGNER_PRIVATE_KEY/);
  });

  it("gives payments the real graph, an Arkiv payment writer and the live event stream", async () => {
    const { factory, box } = fakeFactory();
    const { runtime, store, payments } = setup(factory);
    expect(payments.enabled).toBe(true);
    const m = await runtime.service.remember("lead-claude", { text: "Acme invoice #12 is 5 USDC", kind: "fact", folder: "finance" });
    expect(box.deps!.graph.get(m.key)?.key).toBe(m.key);
    const events: StreamEvent[] = [];
    runtime.bus.subscribe((e) => events.push(e.event));
    box.deps!.emit({ t: "approval", approval });
    expect(events).toEqual([{ t: "approval", approval }]);
    const p: Payment = { intentId: "P1", agent: "lead-claude", payee: ACME, amount: "5", memo: "invoice #12", decision: { status: "blocked", reasons: [], path: [], intentId: "P1" }, createdAt: Date.now(), lineage: [] };
    const w = await box.deps!.arkiv.writePayment(p);
    expect(store.payments).toEqual([p]);
    expect(w.proofUrl).toMatch(/explorer\.test/);
  });

  it("after a PAID decision the paying agent writes a payment memory built on the payment's lineage (once)", async () => {
    const { factory, box } = fakeFactory();
    const { runtime, store } = setup(factory);
    const h = await runtime.service.remember("lead-claude", { text: "Pay Acme 5 USDC for the logo", kind: "plan", folder: "finance" });
    await flush();
    const paid: Payment = { intentId: "P3", agent: "lead-claude", payee: ACME, payeeEns: "acme.supabrain.eth", amount: "5", memo: "invoice #12", createdAt: Date.now(), lineage: [h.key, "0xgone"],
      decision: { status: "paid", txHash: ("0x" + "77".repeat(32)) as `0x${string}`, txUrl: "https://sepolia.test/tx/0x77", intentId: "P3" } }; // hardcode-ok: test fake
    box.deps!.emit({ t: "payment", payment: paid });
    box.deps!.emit({ t: "payment", payment: paid });
    await flush();
    const mem = store.written.filter((w) => w.draft.kind === "payment");
    expect(mem).toHaveLength(1);
    expect(mem[0]).toMatchObject({ signer: "lead-claude", draft: { kind: "payment", folder: "finance", parents: [h.key], trust: 2, subject: "acme.supabrain.eth", address: ACME } });
    expect(mem[0]!.draft.text).toMatch(/Paid 5 USDC to acme\.supabrain\.eth/);
    expect(runtime.graph.get(mem[0]!.key)?.kind).toBe("payment");
  });

  it("an agent the owner revoked cannot pay, even if ENS still lists it", async () => {
    const { factory, box } = fakeFactory();
    const { runtime, payments } = setup(factory);
    runtime.graph.applyRevocation({ type: "agent", id: "gem-research" });
    const d = await payments.pay("gem-research", { payee: "acme.supabrain.eth", amount: "1", memo: "x" });
    expect(d).toMatchObject({ status: "failed", error: expect.stringMatching(/revoked/) });
    expect(box.calls).toEqual([]);
  });
});

describe("payments over MCP and the dashboard API", () => {
  it("pay / pay_status are MCP tools; the agent comes from the token only", async () => {
    const { factory, box } = fakeFactory();
    const s = setup(factory);
    server = createApp({ config, payments: s.payments, ens: s.ens, runtime: s.runtime, tokenSecret: SECRET }).listen(0);
    const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    const c = new Client({ name: "t", version: "1" });
    await c.connect(new StreamableHTTPClientTransport(new URL(`${base}/mcp`), { requestInit: { headers: { Authorization: `Bearer ${issueAgentToken({ label: "lead-claude", ttlSec: 600, secret: SECRET })}` } } }));
    expect((await c.listTools()).tools.map((t) => t.name)).toEqual(expect.arrayContaining(["pay", "pay_status"]));
    const r = await c.callTool({ name: "pay", arguments: { payee: "acme.supabrain.eth", amount: "5", memo: "invoice #12" } });
    expect(box.calls).toEqual(["lead-claude"]);
    expect((r.structuredContent as { decision: PayDecision }).decision.status).toBe("blocked");
    expect(((r.content as { text: string }[])[0]!.text)).toMatch(/BLOCKED/);
    await c.close();
  });

  it("GET /api/payments and /api/approvals; World links only for the owner; cancel needs the owner", async () => {
    const { factory, box } = fakeFactory();
    const s = setup(factory);
    server = createApp({ config, payments: s.payments, ens: s.ens, runtime: s.runtime, tokenSecret: SECRET, adminPassphrase: PASS }).listen(0);
    const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    expect(await (await fetch(`${base}/api/payments`)).json()).toEqual([]);
    const pub = (await (await fetch(`${base}/api/approvals`)).json()) as ApprovalView[];
    expect(pub[0]).toMatchObject({ id: "A1", userCode: "ABCD-1234" });
    expect(pub[0]!.verificationUri).toBe("");
    expect((await fetch(`${base}/api/approvals/A1/cancel`, { method: "POST" })).status).toBe(401);
    const login = await fetch(`${base}/api/admin/login`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ passphrase: PASS }) });
    const cookie = login.headers.get("set-cookie")!.split(";")[0]!;
    const full = (await (await fetch(`${base}/api/approvals`, { headers: { cookie } })).json()) as ApprovalView[];
    expect(full[0]!.verificationUri).toBe(approval.verificationUri);
    expect((await fetch(`${base}/api/approvals/A1/cancel`, { method: "POST", headers: { cookie } })).status).toBe(204);
    expect(box.cancelled).toEqual(["A1"]);
    expect(((await (await fetch(`${base}/healthz`)).json()) as { payments: string }).payments).toBe("enabled");
  });
});
