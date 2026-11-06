// QA P7 (live run 2026-11-06): after a server restart, GET /api/payments lost P1 although its sb.payment row is on
// Arkiv. The mount now reloads payment history from the store at startup and merges it under the live engine's list.
import type { AgentView, PayDecision, Payment, Payments, PaymentsDeps } from "@supabrain/shared";
import { FakeEns } from "@supabrain/shared/testing";
import { findRootDir, loadConfigFrom } from "@supabrain/shared/config";
import { describe, expect, it } from "vitest";
import { FakeMemoryStore } from "../memory/fake-store";
import { createRuntime } from "../runtime";
import { mountPayments } from "./mount";

const config = loadConfigFrom(findRootDir());
const W = { lead: ("0x" + "1a".repeat(20)) as `0x${string}`, team: ("0x" + "4d".repeat(20)) as `0x${string}` };
const ACME = ("0x" + "ac".repeat(20)) as `0x${string}`;
const view = (label: string, wallet: `0x${string}`): AgentView => ({
  label, ens: `${label}.supabrain.eth`, vendor: "claude", role: "lead", scope: "*", wallet, registered: true,
  leaseExpiresAt: Date.now() + 86_400_000, status: "active", payCap: "4", payDaily: "30",
});
const pay = (intentId: string, decision: PayDecision, createdAt: number): Payment => ({
  intentId, agent: "lead-claude", payee: ACME, payeeEns: "acme.supabrain.eth", amount: "5", memo: "invoice #12", decision, createdAt, lineage: [],
});

function setup(engineList: Payment[] = []) {
  const ens = new FakeEns({ agents: { "lead-claude": view("lead-claude", W.lead) } });
  const store = new FakeMemoryStore({ "lead-claude": W.lead, team: W.team });
  // what a previous server process recorded on Arkiv (rows in write order: a pending row, then its final row)
  store.payments.push(
    pay("P1", { status: "blocked", reasons: [{ code: "ENS_MISMATCH", ensName: "acme.supabrain.eth", ensAddress: ACME, claimedAddress: "0xbad" }], path: ["0xM1"], intentId: "P1" }, 1000),
    pay("P3", { status: "pending_human", reasons: [{ code: "OVER_CAP", cap: "4", amount: "5" }], intentId: "P3", approval: { id: "A", intentId: "P3", agent: "lead-claude", payee: ACME, amount: "5", reasons: [], userCode: "X", verificationUri: "u", expiresAt: 0 } }, 2000),
    pay("P3", { status: "paid", txHash: ("0x" + "77".repeat(32)) as `0x${string}`, txUrl: "https://sepolia.test/tx/0x77", intentId: "P3" }, 2000), // hardcode-ok: test fake
    pay("P4", { status: "pending_human", reasons: [], intentId: "P4", approval: { id: "B", intentId: "P4", agent: "lead-claude", payee: ACME, amount: "5", reasons: [], userCode: "Y", verificationUri: "u", expiresAt: 0 } }, 3000),
  );
  const runtime = createRuntime({ config, ens, store });
  const factory = (_deps: PaymentsDeps): Payments => ({
    async pay() { return { status: "failed", error: "unused", intentId: "" }; },
    async status(id) { return engineList.find((p) => p.intentId === id)?.decision ?? { status: "failed", error: "unknown intent", intentId: id }; },
    async onRevoke() { return { cancelled: [] }; },
    async pauseAgent() { return {}; },
    list: () => engineList,
    approvals: () => [],
    async cancel() {},
  });
  const payments = mountPayments({ config, ens, runtime, factory });
  return { payments, store };
}

describe("payment history survives a server restart (QA P7)", () => {
  it("lists decisions recorded on Arkiv by a previous process, newest first, one row per intent (latest status)", async () => {
    const { payments } = setup();
    await payments.historyLoaded;
    expect(payments.list().map((p) => [p.intentId, p.decision.status])).toEqual([["P4", "expired"], ["P3", "paid"], ["P1", "blocked"]]);
    const p1 = payments.list().find((p) => p.intentId === "P1")!;
    expect(p1.decision).toMatchObject({ status: "blocked", reasons: [{ code: "ENS_MISMATCH" }], path: ["0xM1"] });
  });

  it("a pending approval from before the restart can no longer complete, so it shows as expired (nothing can move)", async () => {
    const { payments } = setup();
    await payments.historyLoaded;
    expect(await payments.status("P4")).toEqual({ status: "expired", intentId: "P4" });
  });

  it("status() falls back to history; the live engine wins for the same intent", async () => {
    const live = pay("P1", { status: "denied", intentId: "P1" }, 5000);
    const { payments } = setup([live]);
    await payments.historyLoaded;
    expect(await payments.status("P3")).toMatchObject({ status: "paid", txUrl: "https://sepolia.test/tx/0x77" }); // hardcode-ok: test fake
    expect(await payments.status("P1")).toEqual({ status: "denied", intentId: "P1" });
    expect(payments.list().filter((p) => p.intentId === "P1")).toEqual([live]);
  });

  it("a history load failure is logged and the server keeps serving the live list", async () => {
    const { store } = setup();
    store.failLoadPayments = "arkiv 429";
    const ens = new FakeEns({ agents: { "lead-claude": view("lead-claude", W.lead) } });
    const logs: string[] = [];
    const runtime = createRuntime({ config, ens, store });
    const payments = mountPayments({ config, ens, runtime, log: (l) => logs.push(l), factory: () => ({
      async pay() { return { status: "failed", error: "x", intentId: "" }; }, async status(id) { return { status: "failed", error: "unknown intent", intentId: id }; },
      async onRevoke() { return { cancelled: [] }; }, async pauseAgent() { return {}; }, list: () => [], approvals: () => [], async cancel() {},
    }) });
    await payments.historyLoaded;
    expect(payments.list()).toEqual([]);
    expect(logs.join("\n")).toMatch(/payment history not loaded: arkiv 429/);
  });
});
