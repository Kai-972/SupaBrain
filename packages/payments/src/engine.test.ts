import { FakeArkivWriter, FakeEns, FakeGraph } from "@supabrain/shared/testing";
import type { AgentView, DryRun, MemoryNode, Payment, StreamEvent } from "@supabrain/shared";
import { getAddress, recoverTypedDataAddress, type Hex } from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { beforeEach, describe, expect, it } from "vitest";
import { createPaymentsEngine, type ApprovalProvider, type PaymentsRuntime } from "./engine";
import { intentHash, PAYMENT_TYPES, rootHash, type VaultDomain, type VaultPayment } from "./vault/attestation";
import { VaultRevert } from "./vault/client";
import type { HumanDecision } from "./world/humanApproval";

// Test-only fixture (same story as policy.test.ts).
const TEAM = "demo.eth";
const ACME = `acme.${TEAM}`;
const ACME_ADDR = getAddress("0x9F20000000000000000000000000000000000002");
const ACME_NEW = getAddress("0x9F2000000000000000000000000000000000000A");
const BAD = getAddress("0xBAD0000000000000000000000000000000000001");
const BAD2 = getAddress("0xBAD2000000000000000000000000000000000003");
const EMAIL = "email:acme-0611";
const U = 1_000_000n;
const T0 = 1_762_400_000_000;
const DOMAIN: VaultDomain = { name: "BrainVault", version: "1", chainId: 31337, verifyingContract: "0xF62849F9A0B5Bf2913b396098F7c7019b51A820a" };

const leadKey = generatePrivateKey();
const lead = privateKeyToAccount(leadKey);
const policy = privateKeyToAccount(generatePrivateKey());
const guardian = privateKeyToAccount(generatePrivateKey());
const signer = (a: { address: Hex }) => ({ account: a }) as never;

const agentView = (label: string, wallet: Hex, over: Partial<AgentView> = {}): AgentView => ({
  label, ens: `${label}.${TEAM}`, vendor: "claude", role: "lead", scope: "*", wallet,
  registered: true, leaseExpiresAt: 0, status: "active", payCap: "4", payDaily: "30", ...over,
});
const node = (key: string, extra: Partial<MemoryNode>): MemoryNode => ({
  key: key as Hex, text: key, kind: "fact", folder: "finance", trust: 2, agent: "lead-claude", vendor: "claude",
  seq: 0, createdAt: 0, expiresAt: 0, parents: [], roots: [], status: "active", ...extra,
});

type Deferred = { resolve: (d: HumanDecision) => void; signal?: AbortSignal; intentHash: Hex; description: string };

function setup() {
  let clock = T0;
  const graph = new FakeGraph([
    node("0xH1", { trust: 3, agent: "owner", vendor: "human", subject: ACME, roots: ["0xH1"] }),
    node("0xE1", { trust: 1, kind: "evidence", subject: ACME, address: BAD, source: { type: "email", id: EMAIL }, roots: [EMAIL] }),
    node("0xM1", { trust: 1, kind: "address", subject: ACME, address: BAD, parents: ["0xE1"], roots: [EMAIL] }),
    node("0xM2", { trust: 1, kind: "plan", parents: ["0xH1", "0xM1"], roots: ["0xH1", EMAIL] }),
    node("0xE2", { trust: 1, kind: "evidence", address: BAD2, source: { type: "email", id: EMAIL }, roots: [EMAIL] }),
    node("0xM5", { trust: 1, kind: "address", address: BAD2, parents: ["0xE2"], roots: [EMAIL] }),
  ]);
  const ens = new FakeEns({
    agents: { "lead-claude": agentView("lead-claude", lead.address), "gpt-writer": agentView("gpt-writer", lead.address, { payCap: "0" }) },
    names: { [ACME]: ACME_ADDR },
    vendors: [ACME],
  });
  const arkiv = new FakeArkivWriter();
  const events: StreamEvent[] = [];
  const pays: Array<{ by: Hex; p: VaultPayment; sig: Hex }> = [];
  const vaultCalls: string[] = [];
  const pending: Deferred[] = [];
  const vault = {
    spent: 0n,
    payError: undefined as Error | undefined,
    adminError: undefined as Error | undefined,
    spentError: undefined as Error | undefined,
    async spentToday() {
      if (vault.spentError) throw vault.spentError;
      return vault.spent;
    },
    async pay(by: { account: { address: Hex } }, p: VaultPayment, sig: Hex) {
      if (vault.payError) throw vault.payError;
      pays.push({ by: by.account.address, p, sig });
      vault.spent += p.amount;
      return { hash: `0x${"aa".repeat(32)}` as Hex, txUrl: "test://tx/pay" };
    },
    async revokeRoot(_by: unknown, root: Hex) {
      if (vault.adminError) throw vault.adminError;
      vaultCalls.push(`revokeRoot ${root}`);
      return { hash: `0x${"bb".repeat(32)}` as Hex, txUrl: "test://tx/revoke" };
    },
    async pauseAgent(_by: unknown, wallet: Hex) {
      if (vault.adminError) throw vault.adminError;
      vaultCalls.push(`pauseAgent ${wallet}`);
      return { hash: `0x${"cc".repeat(32)}` as Hex, txUrl: "test://tx/pause" };
    },
    async cancelIntent(_by: unknown, id: Hex) {
      vaultCalls.push(`cancelIntent ${id}`);
      return { hash: `0x${"dd".repeat(32)}` as Hex, txUrl: "test://tx/cancel" };
    },
  };
  let seq = 0;
  const approvals: ApprovalProvider = {
    async start({ intentHash, description }) {
      const id = `appr-${++seq}`;
      let resolve!: (d: HumanDecision) => void;
      const result = new Promise<HumanDecision>((r) => (resolve = r));
      const d: Deferred = { resolve, intentHash, description };
      pending.push(d);
      return {
        id,
        userCode: `CODE-000${seq}`,
        verificationUri: `test://approve/${id}`,
        expiresAtMs: clock + 300_000,
        wait: (signal) => {
          d.signal = signal;
          signal.addEventListener("abort", () => resolve({ status: "cancelled" }), { once: true });
          return result;
        },
      };
    },
  };
  const runtime: PaymentsRuntime = {
    vault: vault as never,
    domain: DOMAIN,
    decimals: 6,
    tokenSymbol: "USDC",
    maxRoots: 8,
    intentTtlSec: 900,
    attestationTtlSec: 300,
    agentSigner: (label) => (label === "lead-claude" || label === "gpt-writer" ? signer(lead) : undefined),
    policySigner: policy,
    guardian: signer(guardian),
    approvals,
    now: () => clock,
  };
  const engine = createPaymentsEngine({ ens, graph, arkiv, emit: (e) => events.push(e), config: {} as never }, runtime);
  return { engine, ens, graph, arkiv, events, pays, vault, vaultCalls, pending, advance: (ms: number) => (clock += ms) };
}

function setupWith(extra: Partial<PaymentsRuntime>) {
  const base = setup();
  const rt = (base.engine as unknown as { __rt?: PaymentsRuntime }).__rt;
  if (!rt) throw new Error("engine does not expose its runtime for tests");
  const engine = createPaymentsEngine({ ens: base.ens, graph: base.graph, arkiv: base.arkiv, emit: (e) => base.events.push(e), config: {} as never }, { ...rt, ...extra });
  return { ...base, engine };
}

let s: ReturnType<typeof setup>;
beforeEach(() => {
  s = setup();
});

const approve: HumanDecision = { status: "approved", credential: "proof_of_human", nullifier: "abc" };
const recovered = (x: { p: VaultPayment; sig: Hex }) =>
  recoverTypedDataAddress({ domain: DOMAIN, types: PAYMENT_TYPES, primaryType: "Payment", message: { ...x.p }, signature: x.sig });

describe("pay: no human needed", () => {
  it("allow → signs a fresh attestation and pays through the vault", async () => {
    const d = await s.engine.pay("lead-claude", { payee: ACME, amount: "3", memo: "invoice #12", cites: ["0xH1"] });
    expect(d).toMatchObject({ status: "paid", txUrl: "test://tx/pay" });
    expect(s.pays).toHaveLength(1);
    const [x] = s.pays;
    expect(x!.by).toBe(lead.address);
    expect(x!.p).toMatchObject({ agent: lead.address, payee: ACME_ADDR, amount: 3n * U, humanApproved: false, roots: [rootHash("0xH1")] });
    expect(x!.p.deadline).toBe(BigInt(T0 / 1000 + 300));
    expect(x!.p.intentId).toBe(d.intentId);
    expect(await recovered(x!)).toBe(policy.address);
  });

  it("records the decision in Arkiv and emits it, and status/list reflect it", async () => {
    const d = await s.engine.pay("lead-claude", { payee: ACME, amount: "1", memo: "m" });
    expect(s.arkiv.payments.at(-1)!.decision.status).toBe("paid");
    const ev = s.events.filter((e): e is Extract<StreamEvent, { t: "payment" }> => e.t === "payment");
    expect(ev.at(-1)!.payment).toMatchObject({ intentId: d.intentId, agent: "lead-claude", payee: ACME_ADDR, payeeEns: ACME, amount: "1", memo: "m" });
    expect(await s.engine.status(d.intentId)).toEqual(d);
    expect(s.engine.list().map((p: Payment) => p.intentId)).toEqual([d.intentId]);
  });

  it("P1 blocked → no attestation, no vault call, reasons + path recorded", async () => {
    const d = await s.engine.pay("lead-claude", { payee: BAD, amount: "5", memo: "invoice #12", cites: ["0xM2"] });
    expect(d.status).toBe("blocked");
    if (d.status !== "blocked") throw new Error();
    expect(d.reasons[0]!.code).toBe("ENS_MISMATCH");
    expect(d.path).toEqual(["0xM2", "0xM1", "0xE1"]);
    expect(s.pays).toHaveLength(0);
    expect(s.arkiv.payments.at(-1)!.lineage).toEqual(expect.arrayContaining(["0xE1", "0xM1"]));
  });

  it("malformed input fails without touching the vault", async () => {
    const d = await s.engine.pay("lead-claude", { payee: ACME, amount: "-1", memo: "" });
    expect(d).toMatchObject({ status: "failed", error: expect.stringMatching(/amount/) });
    expect(s.pays).toHaveLength(0);
  });

  it("an agent without a configured key fails closed", async () => {
    s.ens.agents["ghost"] = agentView("ghost", lead.address);
    const d = await s.engine.pay("ghost", { payee: ACME, amount: "1", memo: "" });
    expect(d).toMatchObject({ status: "failed", error: expect.stringMatching(/no signing key/) });
  });

  it("an agent key that isn't the ENS-registered wallet is blocked", async () => {
    s.ens.agents["lead-claude"] = agentView("lead-claude", guardian.address);
    const d = await s.engine.pay("lead-claude", { payee: ACME, amount: "1", memo: "" });
    expect(d.status).toBe("blocked");
    if (d.status !== "blocked") throw new Error();
    expect(d.reasons).toEqual([{ code: "AGENT_NOT_AUTHORIZED", detail: expect.stringMatching(/wallet/) }]);
    expect(s.pays).toHaveLength(0);
  });

  it("a vault read failure fails closed (no spend data, no payment)", async () => {
    s.vault.spentError = new Error("rpc down");
    const d = await s.engine.pay("lead-claude", { payee: ACME, amount: "1", memo: "" });
    expect(d).toMatchObject({ status: "failed", error: expect.stringMatching(/vault/) });
    expect(s.pays).toHaveLength(0);
  });

  it("a vault revert is reported by name, not hidden", async () => {
    s.vault.payError = new VaultRevert("RootRevoked", ["0x01"]);
    const d = await s.engine.pay("lead-claude", { payee: ACME, amount: "1", memo: "" });
    expect(d).toMatchObject({ status: "failed", error: expect.stringMatching(/RootRevoked/) });
  });

  it("uses the vault's spentToday for the daily limit", async () => {
    s.vault.spent = 29n * U;
    const d = await s.engine.pay("lead-claude", { payee: ACME, amount: "2", memo: "" });
    expect(d.status).toBe("pending_human");
  });

  it("an Arkiv outage doesn't stop the decision (it's reported, not swallowed silently)", async () => {
    (s.arkiv as unknown as { writePayment: () => Promise<never> }).writePayment = async () => {
      throw new Error("arkiv 429");
    };
    const d = await s.engine.pay("lead-claude", { payee: ACME, amount: "1", memo: "" });
    expect(d.status).toBe("paid");
  });
});

describe("pay: human approval (World)", () => {
  async function p3() {
    const d = await s.engine.pay("lead-claude", { payee: ACME, amount: "5", memo: "invoice #12", cites: ["0xH1"] });
    if (d.status !== "pending_human") throw new Error(`expected pending_human, got ${d.status}`);
    return d;
  }

  it("P3 over cap → pending_human with an approval card bound to the intent hash", async () => {
    const d = await p3();
    expect(d.reasons).toEqual([{ code: "OVER_CAP", cap: "4", amount: "5" }]);
    expect(d.approval).toMatchObject({
      id: "appr-1", intentId: d.intentId, agent: "lead-claude", payee: ACME_ADDR, payeeEns: ACME, amount: "5",
      userCode: "CODE-0001", verificationUri: "test://approve/appr-1", expiresAt: T0 + 300_000,
    });
    const expected = intentHash({
      agent: lead.address, payee: ACME_ADDR, amount: 5n * U, roots: [rootHash("0xH1")], intentId: d.intentId as Hex,
      intentExpiry: BigInt(T0 / 1000 + 900),
    });
    expect(s.pending[0]!.intentHash).toBe(expected);
    expect(s.pending[0]!.description).toMatch(/5 USDC.*acme\.demo\.eth/);
    expect(s.engine.approvals().map((a) => a.id)).toEqual(["appr-1"]);
    expect(s.events.some((e) => e.t === "approval")).toBe(true);
    expect(s.pays).toHaveLength(0);
  });

  it("approved → re-checks live, signs humanApproved=true and pays", async () => {
    const d = await p3();
    s.advance(60_000);
    s.pending[0]!.resolve(approve);
    const final = await s.engine.settled(d.intentId);
    expect(final).toMatchObject({ status: "paid", intentId: d.intentId });
    expect(s.pays).toHaveLength(1);
    expect(s.pays[0]!.p).toMatchObject({ humanApproved: true, amount: 5n * U, payee: ACME_ADDR, intentId: d.intentId });
    expect(s.pays[0]!.p.deadline).toBe(BigInt((T0 + 60_000) / 1000 + 300)); // fresh deadline at approval time
    expect(await recovered(s.pays[0]!)).toBe(policy.address);
    expect(s.engine.approvals()).toEqual([]);
    expect(await s.engine.status(d.intentId)).toEqual(final);
  });

  it.each([
    [{ status: "denied", reason: "verification_rejected" } as HumanDecision, "denied"],
    [{ status: "expired" } as HumanDecision, "expired"],
    [{ status: "cancelled" } as HumanDecision, "cancelled"],
  ])("World %j → %s, nothing moves", async (h, status) => {
    const d = await p3();
    s.pending[0]!.resolve(h);
    expect(await s.engine.settled(d.intentId)).toEqual({ status, intentId: d.intentId });
    expect(s.pays).toHaveLength(0);
    expect(s.engine.approvals()).toEqual([]);
    expect(s.arkiv.payments.at(-1)!.decision.status).toBe(status);
  });

  it("a World failure is failed, never paid", async () => {
    const d = await p3();
    s.pending[0]!.resolve({ status: "failed", error: "World verify returned 400" });
    expect(await s.engine.settled(d.intentId)).toMatchObject({ status: "failed", error: expect.stringMatching(/World/) });
    expect(s.pays).toHaveLength(0);
  });

  it("an approval after the intent expired counts as expired", async () => {
    const d = await p3();
    s.advance(901_000);
    s.pending[0]!.resolve(approve);
    expect(await s.engine.settled(d.intentId)).toEqual({ status: "expired", intentId: d.intentId });
    expect(s.pays).toHaveLength(0);
  });

  it("the agent unregistered while waiting → blocked after approval, nothing moves", async () => {
    const d = await p3();
    s.ens.unregister("lead-claude");
    s.pending[0]!.resolve(approve);
    expect(await s.engine.settled(d.intentId)).toMatchObject({ status: "blocked" });
    expect(s.pays).toHaveLength(0);
  });

  it("the vendor's ENS re-pointed while waiting → blocked: the human approved a different address", async () => {
    const d = await p3();
    s.ens.names[ACME] = ACME_NEW;
    s.pending[0]!.resolve(approve);
    const final = await s.engine.settled(d.intentId);
    expect(final.status).toBe("blocked");
    if (final.status !== "blocked") throw new Error();
    expect(final.reasons[0]).toEqual({ code: "ENS_MISMATCH", ensName: ACME, ensAddress: ACME_NEW, claimedAddress: ACME_ADDR });
    expect(s.pays).toHaveLength(0);
  });

  it("cancel(approvalId) cancels the intent", async () => {
    const d = await p3();
    await s.engine.cancel(d.approval.id);
    expect(await s.engine.settled(d.intentId)).toEqual({ status: "cancelled", intentId: d.intentId });
    expect(s.pays).toHaveLength(0);
  });

  it("an approval that arrives after a cancel changes nothing", async () => {
    const d = await p3();
    await s.engine.cancel(d.approval.id);
    s.pending[0]!.resolve(approve);
    await new Promise((r) => setTimeout(r, 10));
    expect(await s.engine.status(d.intentId)).toEqual({ status: "cancelled", intentId: d.intentId });
    expect(s.pays).toHaveLength(0);
  });

  it("a cancel while the vault payment is in flight is refused: the record says paid, matching the chain", async () => {
    const d = await p3();
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    const realPay = s.vault.pay.bind(s.vault);
    s.vault.pay = (async (...a: Parameters<typeof realPay>) => {
      await gate;
      return realPay(...a);
    }) as typeof realPay;
    s.pending[0]!.resolve(approve);
    await new Promise((r) => setTimeout(r, 10)); // now inside vault.pay
    await s.engine.cancel(d.approval.id);
    const r = await s.engine.onRevoke({ target: { type: "memory", id: "0xH1" }, memories: ["0xH1"], agents: [], vendors: [], readers: [], pendingPayments: [d.intentId], roots: [] }, { type: "memory", id: "0xH1" });
    expect(r.cancelled).toEqual([]);
    release();
    expect(await s.engine.settled(d.intentId)).toMatchObject({ status: "paid" });
    expect(s.pays).toHaveLength(1);
  });

  it("after one approved payment to a new payee, it is no longer NEW_PAYEE", async () => {
    const first = await s.engine.pay("lead-claude", { payee: BAD2, amount: "1", memo: "partner" });
    expect(first.status).toBe("pending_human");
    s.pending[0]!.resolve(approve);
    expect((await s.engine.settled(first.intentId)).status).toBe("paid");
    const second = await s.engine.pay("lead-claude", { payee: BAD2, amount: "1", memo: "partner" });
    if (second.status !== "pending_human") throw new Error();
    expect(second.reasons.map((r) => r.code)).toEqual(["OUTSIDE_CONTENT_PAYEE"]);
  });
});

describe("onRevoke / pauseAgent", () => {
  const dry = (memories: string[], pendingPayments: string[] = []): DryRun => ({
    target: { type: "source", id: EMAIL }, memories, agents: [], vendors: [], readers: [], pendingPayments, roots: [],
  });

  it("source → guardian revokeRoot(keccak(rootId)) and cancels pending intents in the blast radius", async () => {
    const p2 = await s.engine.pay("lead-claude", { payee: BAD2, amount: "2", memo: "partner", cites: ["0xM5"] });
    const clean = await s.engine.pay("lead-claude", { payee: ACME, amount: "5", memo: "invoice", cites: ["0xH1"] });
    const r = await s.engine.onRevoke(dry(["0xE2", "0xM5"]), { type: "source", id: EMAIL });
    expect(r).toEqual({ vaultTxUrl: "test://tx/revoke", cancelled: [p2.intentId] });
    expect(s.vaultCalls).toEqual([`revokeRoot ${rootHash(EMAIL)}`]);
    expect(await s.engine.settled(p2.intentId)).toEqual({ status: "cancelled", intentId: p2.intentId });
    expect((await s.engine.status(clean.intentId)).status).toBe("pending_human");
  });

  it("also cancels intents the dry run lists explicitly", async () => {
    const p = await s.engine.pay("lead-claude", { payee: ACME, amount: "5", memo: "invoice" });
    const r = await s.engine.onRevoke(dry([], [p.intentId]), { type: "memory", id: "0xH1" });
    expect(r.cancelled).toEqual([p.intentId]);
  });

  it("agent → guardian pauseAgent(wallet) and cancels that agent's pending intents", async () => {
    const p = await s.engine.pay("lead-claude", { payee: ACME, amount: "5", memo: "invoice" });
    const r = await s.engine.onRevoke({ ...dry([]), target: { type: "agent", id: "lead-claude" } }, { type: "agent", id: "lead-claude" });
    expect(s.vaultCalls).toEqual([`pauseAgent ${lead.address}`]);
    expect(r).toEqual({ vaultTxUrl: "test://tx/pause", cancelled: [p.intentId] });
  });

  it("memory → no vault call", async () => {
    const r = await s.engine.onRevoke(dry(["0xM2"]), { type: "memory", id: "0xM2" });
    expect(s.vaultCalls).toEqual([]);
    expect(r).toEqual({ cancelled: [] });
  });

  it("a failed vault step returns an error, still cancels, and never throws", async () => {
    const p2 = await s.engine.pay("lead-claude", { payee: BAD2, amount: "2", memo: "partner" });
    s.vault.adminError = new VaultRevert("NotOwnerOrGuardian");
    const r = await s.engine.onRevoke(dry(["0xM5"]), { type: "source", id: EMAIL });
    expect(r).toEqual({ cancelled: [p2.intentId], error: expect.stringMatching(/NotOwnerOrGuardian/) });
  });

  it("pauseAgent(label) pauses the ENS wallet; errors come back as data", async () => {
    expect(await s.engine.pauseAgent("lead-claude")).toEqual({ txUrl: "test://tx/pause" });
    s.vault.adminError = new Error("rpc down");
    expect(await s.engine.pauseAgent("lead-claude")).toEqual({ error: expect.stringMatching(/rpc down/) });
  });

  it("status of an unknown intent is failed", async () => {
    expect(await s.engine.status("0xnope")).toEqual({ status: "failed", error: "unknown intent", intentId: "0xnope" });
  });
});

describe("V3 red team round 2: engine", () => {
  it("R3: concurrent payments can't jointly exceed the ENS daily limit", async () => {
    // lead-claude: cap 4, daily 30 (ENS). Eight concurrent 4 USDC payments = 32 > 30.
    const realPay = s.vault.pay.bind(s.vault);
    s.vault.pay = (async (...a: Parameters<typeof realPay>) => {
      await new Promise((r) => setTimeout(r, 5)); // chain latency: spend lands only when mined
      return realPay(...a);
    }) as typeof realPay;
    const ds = await Promise.all(Array.from({ length: 8 }, () => s.engine.pay("lead-claude", { payee: ACME, amount: "4", memo: "split" })));
    const paid = ds.filter((d) => d.status === "paid").length;
    expect(paid).toBe(7);
    expect(s.vault.spent).toBe(28n * U);
    const held = ds.find((d) => d.status === "pending_human");
    if (!held || held.status !== "pending_human") throw new Error("expected one payment to need a human");
    expect(held.reasons.map((r) => r.code)).toEqual(["OVER_DAILY"]);
  });

  it("R1 wiring: the runtime's protected payees reach the policy", async () => {
    const d = await setupWith({ protectedPayees: new Map([[BAD2.toLowerCase(), "agent wallet x"]]) }).engine.pay("lead-claude", { payee: BAD2, amount: "1", memo: "" });
    expect(d.status).toBe("blocked");
  });
});
