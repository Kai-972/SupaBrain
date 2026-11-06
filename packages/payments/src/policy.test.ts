import { FakeEns, FakeGraph } from "@supabrain/shared/testing";
import type { AgentView, MemoryNode, PayReason } from "@supabrain/shared";
import { getAddress, keccak256, stringToHex } from "viem";
import { beforeEach, describe, expect, it } from "vitest";
import { decidePayment, type PolicyContext } from "./policy";

// Test-only fixture: the "bank details changed" story from C-UI.md §5, with concrete addresses.
const TEAM = "demo.eth";
const ACME = `acme.${TEAM}`;
const ACME_ADDR = "0x9F20000000000000000000000000000000000002";
const BAD = "0xBAD0000000000000000000000000000000000001"; // attacker, from the email
const BAD2 = "0xBAD2000000000000000000000000000000000003"; // attacker's "partner", from the follow-up
const HUMAN_PAYEE = "0x1234500000000000000000000000000000000004"; // owner-entered, paid before
const EMAIL = "email:acme-0611";
const U = 1_000_000n; // USDC base units

const agent = (label: string, over: Partial<AgentView> = {}): AgentView => ({
  label, ens: `${label}.${TEAM}`, vendor: "claude", role: "lead", scope: "*", wallet: "0xA000000000000000000000000000000000000001",
  registered: true, leaseExpiresAt: 0, status: "active", payCap: "4", payDaily: "30", ...over,
});

const node = (key: string, extra: Partial<MemoryNode>): MemoryNode => ({
  key: key as `0x${string}`, text: key, kind: "fact", folder: "finance", trust: 2, agent: "lead-claude", vendor: "claude",
  seq: 0, createdAt: 0, expiresAt: 0, parents: [], roots: [], status: "active", ...extra,
});

function fixture() {
  const graph = new FakeGraph([
    node("0xH1", { trust: 3, agent: "owner", vendor: "human", kind: "plan", subject: ACME, roots: ["0xH1"] }),
    node("0xH2", { trust: 3, agent: "owner", vendor: "human", kind: "decision", roots: ["0xH2"] }),
    node("0xE1", { trust: 1, kind: "evidence", subject: ACME, address: BAD, source: { type: "email", id: EMAIL }, roots: [EMAIL] }),
    node("0xM1", { trust: 1, kind: "address", subject: ACME, address: BAD, parents: ["0xE1"], roots: [EMAIL] }),
    node("0xM2", { trust: 1, kind: "plan", parents: ["0xH1", "0xM1"], roots: ["0xH1", EMAIL] }),
    node("0xM3", { trust: 1, kind: "plan", parents: ["0xM2"], roots: ["0xH1", EMAIL] }),
    node("0xM4", { trust: 2, kind: "decision", parents: ["0xH2"], roots: ["0xH2"] }),
    node("0xE2", { trust: 1, kind: "evidence", address: BAD2, source: { type: "email", id: EMAIL }, roots: [EMAIL] }),
    node("0xM5", { trust: 1, kind: "address", address: BAD2, parents: ["0xE2"], roots: [EMAIL] }),
    node("0xH3", { trust: 3, agent: "owner", vendor: "human", kind: "address", address: HUMAN_PAYEE, roots: ["0xH3"] }),
  ]);
  const ens = new FakeEns({
    agents: {
      "lead-claude": agent("lead-claude"),
      "gem-research": agent("gem-research", { role: "worker", scope: "research", payCap: "2", payDaily: "4" }),
      "gpt-writer": agent("gpt-writer", { role: "worker", scope: "comms", payCap: "0", payDaily: "0" }),
      watcher: agent("watcher", { role: "observer" }),
    },
    names: { [ACME]: ACME_ADDR, "attacker.eth": BAD },
    vendors: [ACME],
  });
  const paid = new Set<string>([HUMAN_PAYEE.toLowerCase()]);
  const ctx: PolicyContext = {
    ens,
    graph,
    hasPaid: (a) => paid.has(a.toLowerCase()),
    spentTodayUnits: 0n,
    maxRoots: 8,
    decimals: 6,
  };
  return { ctx, ens, graph, paid };
}

const REVOKED = ["0xE1", "0xM1", "0xM2", "0xM3", "0xE2", "0xM5"];
const codes = (r: PayReason[]) => r.map((x) => x.code);
const rootHash = (id: string) => keccak256(stringToHex(id));

let f: ReturnType<typeof fixture>;
beforeEach(() => {
  f = fixture();
});

describe("decidePayment: demo steps (C-UI.md §5)", () => {
  it("P1: pay(0xBAD, 5) is BLOCKED by the ENS mismatch, and says it came from outside content", async () => {
    const d = await decidePayment(f.ctx, { agent: "lead-claude", payee: BAD, amount: "5", cites: ["0xM2"] });
    expect(d.outcome).toBe("blocked");
    if (d.outcome === "error") throw new Error();
    expect(d.hard).toEqual([{ code: "ENS_MISMATCH", ensName: ACME, ensAddress: getAddress(ACME_ADDR), claimedAddress: getAddress(BAD) }]);
    expect(d.reasons).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: "ENS_MISMATCH" }),
      { code: "OUTSIDE_CONTENT_PAYEE", sources: [EMAIL] },
    ]));
    expect(codes(d.reasons)[0]).toBe("ENS_MISMATCH"); // hard reasons first
    expect(d.path).toEqual(["0xM2", "0xM1", "0xE1"]);
    expect(d.payeeVerified).toBe(false);
  });

  it("P2: pay(0xBAD2, 2) is PENDING_HUMAN [OUTSIDE_CONTENT_PAYEE, NEW_PAYEE]", async () => {
    const d = await decidePayment(f.ctx, { agent: "lead-claude", payee: BAD2, amount: "2", cites: ["0xM5"] });
    expect(d.outcome).toBe("pending_human");
    if (d.outcome === "error") throw new Error();
    expect(d.reasons).toEqual([{ code: "OUTSIDE_CONTENT_PAYEE", sources: [EMAIL] }, { code: "NEW_PAYEE" }]);
    expect(d.hard).toEqual([]);
  });

  it("P3 after the revoke: pay(acme, 5) is PENDING_HUMAN [OVER_CAP] with only clean roots", async () => {
    for (const k of REVOKED) f.graph.setStatus(k, "quarantined");
    const d = await decidePayment(f.ctx, { agent: "lead-claude", payee: ACME, amount: "5", cites: ["0xH1"] });
    expect(d.outcome).toBe("pending_human");
    if (d.outcome === "error") throw new Error();
    expect(d.reasons).toEqual([{ code: "OVER_CAP", cap: "4", amount: "5" }]);
    expect(d.payee).toBe(getAddress(ACME_ADDR));
    expect(d.payeeEns).toBe(ACME);
    expect(d.payeeVerified).toBe(true);
    expect(d.amountUnits).toBe(5n * U);
    // the revoked email root must not ride along, or the vault would revert RootRevoked
    expect(d.rootIds).toEqual(["0xH1"]);
    expect(d.roots).toEqual([rootHash("0xH1")]);
  });

  it("P3 under the cap is ALLOWED without a human", async () => {
    for (const k of REVOKED) f.graph.setStatus(k, "quarantined");
    const d = await decidePayment(f.ctx, { agent: "lead-claude", payee: ACME, amount: "3.5" });
    expect(d.outcome).toBe("allow");
  });

  it("P1 again after the revoke is still BLOCKED (mismatch + quarantined lineage)", async () => {
    for (const k of REVOKED) f.graph.setStatus(k, "quarantined");
    const d = await decidePayment(f.ctx, { agent: "lead-claude", payee: BAD, amount: "1" });
    expect(d.outcome).toBe("blocked");
    if (d.outcome === "error") throw new Error();
    expect(codes(d.hard).sort()).toEqual(["ENS_MISMATCH", "QUARANTINED_LINEAGE"]);
    const q = d.hard.find((r) => r.code === "QUARANTINED_LINEAGE") as Extract<PayReason, { code: "QUARANTINED_LINEAGE" }>;
    expect(q.revoked.sort()).toEqual(["0xE1", "0xM1"]);
  });
});

describe("decidePayment: red team (V3)", () => {
  it("an email-supplied attacker.eth is not a verified payee", async () => {
    f.graph.add(node("0xE9", { trust: 1, kind: "evidence", subject: "attacker.eth", source: { type: "email", id: "email:x" }, roots: ["email:x"] }));
    const d = await decidePayment(f.ctx, { agent: "lead-claude", payee: "attacker.eth", amount: "1" });
    expect(d.outcome).not.toBe("allow");
    if (d.outcome === "error") throw new Error();
    expect(d.payeeVerified).toBe(false);
    expect(codes(d.reasons)).toEqual(expect.arrayContaining(["OUTSIDE_CONTENT_PAYEE", "NEW_PAYEE"]));
  });

  it("a clean non-team name (no mismatch to lean on) is still not verified", async () => {
    f.ens.names["pixel-labs.eth"] = BAD2; // the attacker's "partner", named in the follow-up email
    const d = await decidePayment(f.ctx, { agent: "lead-claude", payee: "pixel-labs.eth", amount: "1" });
    expect(d.outcome).toBe("pending_human");
    if (d.outcome === "error") throw new Error();
    expect(d.payeeVerified).toBe(false);
    expect(d.hard).toEqual([]);
    expect(codes(d.reasons)).toEqual(["OUTSIDE_CONTENT_PAYEE", "NEW_PAYEE"]);
  });

  it("a vendor address that another memory ties to a different team name is mismatched, not verified", async () => {
    f.ens.names[`beta.${TEAM}`] = "0xBE7A000000000000000000000000000000000005";
    f.ens.vendors.push(`beta.${TEAM}`);
    f.graph.add(node("0xE7", { trust: 1, kind: "evidence", subject: `beta.${TEAM}`, address: ACME_ADDR, source: { type: "email", id: "email:y" }, roots: ["email:y"] }));
    const d = await decidePayment(f.ctx, { agent: "lead-claude", payee: ACME_ADDR, amount: "1" });
    expect(d.outcome).toBe("blocked");
    if (d.outcome === "error") throw new Error();
    expect(d.payeeVerified).toBe(false);
    expect(codes(d.hard)).toEqual(["ENS_MISMATCH"]);
    expect(codes(d.soft)).toContain("OUTSIDE_CONTENT_PAYEE");
  });

  it("an unknown .eth that resolves nowhere is a hard UNKNOWN_PAYEE", async () => {
    const d = await decidePayment(f.ctx, { agent: "lead-claude", payee: "nobody.eth", amount: "1" });
    expect(d.outcome).toBe("blocked");
    if (d.outcome === "error") throw new Error();
    expect(d.hard).toEqual([{ code: "UNKNOWN_PAYEE" }]);
  });

  it("a cleared read-set / empty cites can't hide a poisoned address: the whole graph is used", async () => {
    for (const cites of [undefined, []]) {
      const d = await decidePayment(f.ctx, { agent: "lead-claude", payee: BAD, amount: "1", cites });
      expect(d.outcome).toBe("blocked");
    }
  });

  it("citing a human memory outside the read-set can't launder an outside-content payee", async () => {
    const d = await decidePayment(f.ctx, { agent: "lead-claude", payee: BAD2, amount: "1", cites: ["0xH1", "0xH2", "0xH3"] });
    expect(d.outcome).toBe("pending_human");
    if (d.outcome === "error") throw new Error();
    expect(codes(d.reasons)).toContain("OUTSIDE_CONTENT_PAYEE");
  });

  it("a quarantined ancestor blocks even when the payee node itself looks active", async () => {
    f.graph.setStatus("0xE2", "quarantined"); // M5 (status active in this fake) derives from E2
    const d = await decidePayment(f.ctx, { agent: "lead-claude", payee: BAD2, amount: "1" });
    expect(d.outcome).toBe("blocked");
    if (d.outcome === "error") throw new Error();
    expect(d.hard).toEqual([{ code: "QUARANTINED_LINEAGE", revoked: ["0xE2"] }]);
  });

  it.each([
    ["an observer", "watcher", /observer/],
    ["payCap 0", "gpt-writer", /pay cap is 0/],
  ])("%s can't pay at all", async (_n, label, detail) => {
    const d = await decidePayment(f.ctx, { agent: label, payee: ACME, amount: "1" });
    expect(d.outcome).toBe("blocked");
    if (d.outcome === "error") throw new Error();
    expect(d.hard).toEqual([{ code: "AGENT_NOT_AUTHORIZED", detail: expect.stringMatching(detail) }]);
  });

  it("an unregistered agent can't pay (ENS kill switch)", async () => {
    f.ens.unregister("lead-claude");
    const d = await decidePayment(f.ctx, { agent: "lead-claude", payee: ACME, amount: "1" });
    expect(d.outcome).toBe("blocked");
    if (d.outcome === "error") throw new Error();
    expect(d.hard).toEqual([{ code: "AGENT_NOT_AUTHORIZED", detail: expect.stringMatching(/not registered/) }]);
  });

  it.each(["quarantined", "expired"] as const)("an agent with status %s can't pay", async (status) => {
    f.ens.agents["lead-claude"] = agent("lead-claude", { status });
    const d = await decidePayment(f.ctx, { agent: "lead-claude", payee: ACME, amount: "1" });
    expect(d.outcome).toBe("blocked");
  });

  it("inconsistent ENS records fail closed", async () => {
    f.ens.agents["lead-claude"] = { ...agent("lead-claude"), recordsOk: false };
    const d = await decidePayment(f.ctx, { agent: "lead-claude", payee: ACME, amount: "1" });
    expect(d.outcome).toBe("blocked");
  });

  it("an ENS outage fails closed (authority unknown)", async () => {
    f.ens.failing = true;
    const d = await decidePayment(f.ctx, { agent: "lead-claude", payee: ACME, amount: "1" });
    expect(d.outcome).toBe("blocked");
    if (d.outcome === "error") throw new Error();
    expect(d.hard).toEqual([{ code: "AGENT_NOT_AUTHORIZED", detail: expect.stringMatching(/ENS unavailable/) }]);
  });

  it("an unknown agent label is not authorized", async () => {
    const d = await decidePayment(f.ctx, { agent: "ghost", payee: ACME, amount: "1" });
    expect(d.outcome).toBe("blocked");
  });

  it("over the daily limit needs a human", async () => {
    f.ctx.spentTodayUnits = 28n * U;
    const d = await decidePayment(f.ctx, { agent: "lead-claude", payee: ACME, amount: "3" });
    expect(d.outcome).toBe("pending_human");
    if (d.outcome === "error") throw new Error();
    expect(d.reasons).toEqual([{ code: "OVER_DAILY", daily: "30", spentToday: "28" }]);
  });

  it("exactly at the cap and the daily limit is allowed", async () => {
    f.ctx.spentTodayUnits = 26n * U;
    const d = await decidePayment(f.ctx, { agent: "lead-claude", payee: ACME, amount: "4" });
    expect(d.outcome).toBe("allow");
  });

  it("more lineage roots than the attestation allows is an error, never a silent truncation", async () => {
    const roots = Array.from({ length: 9 }, (_, i) => `github:demo/doc${i}`);
    f.graph.add(node("0xH9", { trust: 3, agent: "owner", vendor: "human", kind: "address", subject: ACME, roots }));
    const d = await decidePayment(f.ctx, { agent: "lead-claude", payee: ACME, amount: "1" });
    expect(d).toEqual({ outcome: "error", error: expect.stringMatching(/10 lineage roots.*max 8/) });
  });

  it("a mismatch on the vendor's own ENS is found even when no memory names the subject", async () => {
    // payee address appears in no memory, but it IS a team vendor address → verified, no reasons
    const d = await decidePayment(f.ctx, { agent: "lead-claude", payee: ACME_ADDR.toLowerCase(), amount: "1" });
    expect(d.outcome).toBe("allow");
    if (d.outcome === "error") throw new Error();
    expect(d.payeeVerified).toBe(true);
    expect(d.payeeEns).toBe(ACME);
    expect(d.payee).toBe(getAddress(ACME_ADDR));
  });

  it("an address that appears nowhere is a new, unknown payee (needs a human)", async () => {
    const d = await decidePayment(f.ctx, { agent: "lead-claude", payee: "0x00000000000000000000000000000000000000ff", amount: "1" });
    expect(d.outcome).toBe("pending_human");
    if (d.outcome === "error") throw new Error();
    expect(codes(d.reasons)).toEqual(["NEW_PAYEE", "UNKNOWN_PAYEE"]);
  });

  it("an owner-entered address paid before goes through under the cap", async () => {
    const d = await decidePayment(f.ctx, { agent: "lead-claude", payee: HUMAN_PAYEE, amount: "1" });
    expect(d.outcome).toBe("allow");
    if (d.outcome === "error") throw new Error();
    expect(d.rootIds).toEqual(["0xH3"]);
  });

  it("matches the vendor name case-insensitively", async () => {
    const d = await decidePayment(f.ctx, { agent: "lead-claude", payee: "ACME.demo.eth", amount: "1" });
    expect(d.outcome).toBe("allow");
  });

  it.each(["0", "-1", "1.0000001", "abc", "1e3", "", " 1"])("rejects amount %j", async (amount) => {
    const d = await decidePayment(f.ctx, { agent: "lead-claude", payee: ACME, amount });
    expect(d).toEqual({ outcome: "error", error: expect.stringMatching(/amount/) });
  });

  it.each(["0x123", "not a payee", "0xBAD000000000000000000000000000000000000G"])("rejects payee %j", async (payee) => {
    const d = await decidePayment(f.ctx, { agent: "lead-claude", payee, amount: "1" });
    expect(d).toEqual({ outcome: "error", error: expect.stringMatching(/payee/) });
  });

  it("before any revoke, the honest vendor's roots exclude the phishing memories about the same subject", async () => {
    const d = await decidePayment(f.ctx, { agent: "lead-claude", payee: ACME, amount: "1" });
    if (d.outcome === "error") throw new Error();
    expect(d.outcome).toBe("allow");
    expect(d.rootIds).toEqual(["0xH1"]); // not email:acme-0611 (E1/M1 claim 0xBAD)
  });

  it("a cited memory that is itself a root contributes its own root", async () => {
    // H2 (owner budget) has no ancestors; before GraphView.get it added nothing
    const d = await decidePayment(f.ctx, { agent: "lead-claude", payee: ACME, amount: "1", cites: ["0xH2"] });
    if (d.outcome === "error") throw new Error();
    expect(d.rootIds).toEqual(["0xH1", "0xH2"]);
  });

  it("roots come from the cited lineage too, deduplicated and without quarantined parts", async () => {
    for (const k of REVOKED) f.graph.setStatus(k, "quarantined");
    const d = await decidePayment(f.ctx, { agent: "lead-claude", payee: ACME, amount: "1", cites: ["0xM4", "0xH1"] });
    if (d.outcome === "error") throw new Error();
    expect(d.rootIds).toEqual(["0xH1", "0xH2"]);
  });
});

describe("decidePayment: V3 red team round 2 (each was ALLOWED before the fix)", () => {
  const AGENT_W = "0xA000000000000000000000000000000000000001" as const; // lead-claude's wallet in this fixture
  const VAULT = "0x2DA794b8dD00AfC970B372D7Cf960EcD1f190Ec8";
  const TOKEN = "0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238";
  const ZERO = "0x0000000000000000000000000000000000000000";
  const guarded = () => {
    f.ctx.protectedPayees = new Map([
      [AGENT_W.toLowerCase(), "agent wallet lead-claude"],
      [VAULT.toLowerCase(), "BrainVault"],
      [TOKEN.toLowerCase(), "USDC token"],
    ]);
  };

  it.each([
    ["an agent's own (server-held) wallet", AGENT_W],
    ["the vault itself", VAULT],
    ["the token contract", TOKEN],
  ])("R1/R2: %s can't be paid even after a prior approval and a clean memory", async (_n, addr) => {
    guarded();
    f.paid.add(addr.toLowerCase()); // a human approved one payment there before
    f.graph.add(node("0xR1", { trust: 2, kind: "address", address: addr as `0x${string}`, roots: [] })); // a clean agent memory
    const d = await decidePayment(f.ctx, { agent: "lead-claude", payee: addr, amount: "1" });
    expect(d.outcome).toBe("blocked");
    if (d.outcome === "error") throw new Error();
    expect(d.hard).toEqual([{ code: "PROTECTED_PAYEE", label: expect.stringMatching(/agent wallet lead-claude|BrainVault|USDC token/) }]);
  });

  it("R1: an agent's ENS name (which resolves to its wallet) can't be paid either", async () => {
    guarded();
    f.ens.names[`lead-claude.${TEAM}`] = AGENT_W;
    f.paid.add(AGENT_W.toLowerCase());
    f.graph.add(node("0xR2", { trust: 2, kind: "address", subject: `lead-claude.${TEAM}`, address: AGENT_W, roots: [] }));
    const d = await decidePayment(f.ctx, { agent: "gem-research", payee: `lead-claude.${TEAM}`, amount: "1" });
    expect(d.outcome).toBe("blocked");
    if (d.outcome === "error") throw new Error();
    expect(d.hard).toEqual([{ code: "PROTECTED_PAYEE", label: "agent wallet lead-claude" }]);
  });

  it("R2: the zero address is never a payee", async () => {
    f.paid.add(ZERO);
    f.graph.add(node("0xR3", { trust: 2, kind: "address", address: ZERO, roots: [] }));
    const d = await decidePayment(f.ctx, { agent: "lead-claude", payee: ZERO, amount: "1" });
    expect(d.outcome).toBe("blocked");
    if (d.outcome === "error") throw new Error();
    expect(d.hard).toEqual([{ code: "PROTECTED_PAYEE", label: "zero address" }]);
  });

  it("control: the owner/refund address is still payable (not team-controlled by the server)", async () => {
    guarded();
    const d = await decidePayment(f.ctx, { agent: "lead-claude", payee: HUMAN_PAYEE, amount: "1" });
    expect(d.outcome).toBe("allow");
  });
});
