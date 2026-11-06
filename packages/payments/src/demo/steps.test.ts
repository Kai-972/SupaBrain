// The demo fallbacks (`pnpm demo:step blocked|approve`) drive the server's own MCP `pay` / `pay_status` tools as a
// real agent, so the stage demo never depends on a model being fooled live. Here they run against an in-process MCP
// server built exactly like the real one (registerPaymentTools over the payments engine), with unit-test fakes behind it.
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import type { AuthInfo } from "@modelcontextprotocol/sdk/server/auth/types.js";
import { FakeArkivWriter, FakeEns, FakeGraph } from "@supabrain/shared/testing";
import type { AgentView, MemoryNode } from "@supabrain/shared";
import { getAddress, type Hex } from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { afterEach, describe, expect, it } from "vitest";
import { createPaymentsEngine, type ApprovalProvider } from "../engine";
import { describeDecision, registerPaymentTools } from "../mcp-tools";
import type { HumanDecision } from "../world/humanApproval";
import { connectAsAgent, stepApprove, stepBlocked } from "./steps";

// Test-only fixture (the C-UI §5 story).
const TEAM = "demo.eth";
const ACME = `acme.${TEAM}`;
const ACME_ADDR = getAddress("0x9F20000000000000000000000000000000000002");
const BAD = getAddress("0xBAD0000000000000000000000000000000000001");
const EMAIL = "email:acme-0611";
const lead = privateKeyToAccount(generatePrivateKey());

const node = (key: string, extra: Partial<MemoryNode>): MemoryNode => ({
  key: key as Hex, text: key, kind: "fact", folder: "finance", trust: 2, agent: "lead-claude", vendor: "claude",
  seq: 0, createdAt: 0, expiresAt: 0, parents: [], roots: [], status: "active", ...extra,
});
const agentView: AgentView = {
  label: "lead-claude", ens: `lead-claude.${TEAM}`, vendor: "claude", role: "lead", scope: "*", wallet: lead.address,
  registered: true, leaseExpiresAt: 0, status: "active", payCap: "4", payDaily: "30",
};

let http: Server | undefined;
afterEach(() => {
  http?.close();
  http = undefined;
});

function startServer(opts: { authenticated?: boolean } = {}) {
  const graph = new FakeGraph([
    node("0xH1", { trust: 3, agent: "owner", vendor: "human", subject: ACME, roots: ["0xH1"] }),
    node("0xE1", { trust: 1, kind: "evidence", subject: ACME, address: BAD, source: { type: "email", id: EMAIL }, roots: [EMAIL] }),
    node("0xM1", { trust: 1, kind: "address", subject: ACME, address: BAD, parents: ["0xE1"], roots: [EMAIL] }),
    node("0xM2", { trust: 1, kind: "plan", parents: ["0xH1", "0xM1"], roots: ["0xH1", EMAIL] }),
  ]);
  const ens = new FakeEns({ agents: { "lead-claude": agentView }, names: { [ACME]: ACME_ADDR }, vendors: [ACME] });
  const pays: Array<{ humanApproved: boolean; amount: bigint; payee: Hex }> = [];
  let resolveHuman!: (d: HumanDecision) => void;
  const human = new Promise<HumanDecision>((r) => (resolveHuman = r));
  const approvals: ApprovalProvider = {
    start: async () => ({ id: "appr-1", userCode: "AB12-CD34", verificationUri: "test://world/approve", expiresAtMs: Date.now() + 300_000, wait: () => human }),
  };
  const payments = createPaymentsEngine({ ens, graph, arkiv: new FakeArkivWriter(), emit: () => undefined, config: {} as never }, {
    vault: {
      spentToday: async () => 0n,
      pay: async (_by: unknown, p: { humanApproved: boolean; amount: bigint; payee: Hex }) => {
        pays.push(p);
        return { hash: `0x${"ab".repeat(32)}` as Hex, txUrl: "test://tx/paid" };
      },
    } as never,
    domain: { name: "BrainVault", version: "1", chainId: 31337, verifyingContract: "0xF62849F9A0B5Bf2913b396098F7c7019b51A820a" },
    decimals: 6, tokenSymbol: "USDC", maxRoots: 8, intentTtlSec: 900, attestationTtlSec: 300,
    agentSigner: (l) => (l === "lead-claude" ? ({ account: lead } as never) : undefined),
    policySigner: privateKeyToAccount(generatePrivateKey()), guardian: { account: lead } as never, approvals, now: () => Date.now(),
  });

  http = createServer(async (req, res) => {
    let raw = "";
    for await (const c of req) raw += c;
    if (opts.authenticated !== false) {
      (req as typeof req & { auth?: AuthInfo }).auth = { token: "t", clientId: "lead-claude", scopes: [], extra: { agent: "lead-claude" } };
    }
    const server = new McpServer({ name: "supabrain-test", version: "0" });
    registerPaymentTools(server, { payments, agentOf: (a) => a?.extra?.agent as string | undefined });
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
    res.on("close", () => { void transport.close(); void server.close(); });
    await server.connect(transport);
    await transport.handleRequest(req, res, raw ? JSON.parse(raw) : undefined);
  }).listen(0);
  const url = `http://127.0.0.1:${(http.address() as AddressInfo).port}/mcp`;
  return { url, pays, approve: (d: HumanDecision) => resolveHuman(d) };
}

const quiet = { log: () => undefined, pollMs: 10 };

describe("pnpm demo:step blocked (P1)", () => {
  it("pays the email's address through the server's pay tool and gets BLOCKED by the ENS mismatch", async () => {
    const s = startServer();
    const client = await connectAsAgent({ url: s.url, token: "t" });
    const r = await stepBlocked(client, { payee: BAD, amount: "5", memo: "invoice #12", cites: ["0xM2"] }, quiet);
    expect(r.ok).toBe(true);
    if (r.decision.status !== "blocked") throw new Error();
    expect(r.decision.reasons[0]).toMatchObject({ code: "ENS_MISMATCH", ensName: ACME, ensAddress: ACME_ADDR, claimedAddress: BAD });
    expect(r.decision.path).toEqual(["0xM2", "0xM1", "0xE1"]);
    expect(s.pays).toHaveLength(0);
    await client.close();
  });

  it("reports failure (ok=false) if the payment was NOT blocked, so the operator knows the stage beat broke", async () => {
    const s = startServer();
    const client = await connectAsAgent({ url: s.url, token: "t" });
    const r = await stepBlocked(client, { payee: ACME, amount: "1", memo: "x" }, quiet);
    expect(r.ok).toBe(false);
    await client.close();
  });
});

describe("pnpm demo:step approve (P3)", () => {
  it("over cap → PENDING HUMAN with the World link → human approves → PAID with humanApproved", async () => {
    const s = startServer();
    const client = await connectAsAgent({ url: s.url, token: "t" });
    let shown: { userCode: string; verificationUri: string } | undefined;
    const done = stepApprove(client, { payee: ACME, amount: "5", memo: "invoice #12", cites: ["0xH1"] }, {
      ...quiet,
      onPending: (a) => {
        shown = a;
        s.approve({ status: "approved", credential: "proof_of_human", nullifier: "1" });
      },
    });
    const r = await done;
    expect(shown).toMatchObject({ userCode: "AB12-CD34", verificationUri: "test://world/approve" });
    expect(r.ok).toBe(true);
    expect(r.decision).toMatchObject({ status: "paid", txUrl: "test://tx/paid" });
    expect(s.pays).toEqual([expect.objectContaining({ humanApproved: true, amount: 5_000_000n, payee: ACME_ADDR })]);
    await client.close();
  });

  it("a human deny ends DENIED and nothing moves", async () => {
    const s = startServer();
    const client = await connectAsAgent({ url: s.url, token: "t" });
    const r = await stepApprove(client, { payee: ACME, amount: "5", memo: "invoice #12" }, {
      ...quiet,
      onPending: () => s.approve({ status: "denied", reason: "verification_rejected" }),
    });
    expect(r.ok).toBe(false);
    expect(r.decision.status).toBe("denied");
    expect(s.pays).toHaveLength(0);
    await client.close();
  });
});

describe("MCP pay tools", () => {
  it("refuse an unauthenticated caller", async () => {
    const s = startServer({ authenticated: false });
    const client = await connectAsAgent({ url: s.url, token: "t" });
    const r = await client.callTool({ name: "pay", arguments: { payee: ACME, amount: "1", memo: "x" } });
    expect(r.isError).toBe(true);
    await client.close();
  });

  it("describe each decision in words an agent can relay", () => {
    expect(describeDecision({ status: "blocked", intentId: "i", path: ["0xM2"], reasons: [{ code: "ENS_MISMATCH", ensName: ACME, ensAddress: ACME_ADDR, claimedAddress: BAD }] }))
      .toMatch(/BLOCKED.*acme\.demo\.eth.*0x9F2/s);
    expect(describeDecision({
      status: "pending_human", intentId: "i", reasons: [{ code: "OVER_CAP", cap: "4", amount: "5" }],
      approval: { id: "a", intentId: "i", agent: "lead-claude", payee: ACME_ADDR, payeeEns: ACME, amount: "5", reasons: [], userCode: "AB12-CD34", verificationUri: "test://w", expiresAt: 0 },
    })).toMatch(/human.*World App.*AB12-CD34/is);
    expect(describeDecision({ status: "paid", intentId: "i", txHash: "0x01", txUrl: "test://tx" })).toMatch(/PAID.*test:\/\/tx/);
    expect(describeDecision({ status: "denied", intentId: "i" })).toMatch(/DENIED.*nothing/i);
  });
});
