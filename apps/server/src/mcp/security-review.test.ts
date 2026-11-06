// Lane B security review of the MCP token design (B-MONEY S4). Each test is a confirmed finding, written as the
// behaviour we WANT. They were `it.fails` while the hole was open; Lane A fixed F1–F3 (+ D4) and flipped them to `it`.
// Findings: docs/PROGRESS.md (Requests, B → A) and SECURITY.md §7.
import type { AddressInfo } from "node:net";
import { request as httpRequest, type Server } from "node:http";
import { afterEach, describe, expect, it } from "vitest";
import type { AgentView } from "@supabrain/shared";
import { FakeEns } from "@supabrain/shared/testing";
import { findRootDir, loadConfigFrom } from "@supabrain/shared/config";
import { createApp } from "../app";
import { createPaymentsDisabled } from "../payments-disabled";
import { issueAgentToken } from "../auth/tokens";
import { createRuntime } from "../runtime";
import { FakeMemoryStore } from "../memory/fake-store";

const SECRET = "r".repeat(40);
const config = loadConfigFrom(findRootDir());
const agent = (label: string): AgentView => ({
  label, ens: `${label}.supabrain.eth`, vendor: "gemini", role: "worker", scope: "research",
  wallet: ("0x" + "22".repeat(20)) as `0x${string}`, registered: true, leaseExpiresAt: Date.UTC(2026, 10, 13), status: "active",
  payCap: "2", payDaily: "4",
});

let server: Server | undefined;
afterEach(() => { server?.close(); server = undefined; });

function start(lines: string[]) {
  const ens = new FakeEns({ agents: { "gem-research": agent("gem-research") } });
  // A-BRAIN S2: MCP is only mounted with the memory runtime (without it every route answers 503, which would make
  // these findings "fail" for the wrong reason).
  const runtime = createRuntime({ config, ens, store: new FakeMemoryStore({ "gem-research": agent("gem-research").wallet, team: ("0x" + "4d".repeat(20)) as `0x${string}` }) });
  const app = createApp({ config, payments: createPaymentsDisabled(), ens, runtime, tokenSecret: SECRET, log: (l) => lines.push(l) });
  server = app.listen(0);
  return (server.address() as AddressInfo).port;
}

const initialize = (clientName = "review") =>
  JSON.stringify({ jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: clientName, version: "0" } } });

function post(port: number, path: string, body: string, headers: Record<string, string> = {}) {
  return new Promise<{ status: number; body: string }>((resolve, reject) => {
    const r = httpRequest(
      { host: "127.0.0.1", port, path, method: "POST", headers: { "content-type": "application/json", accept: "application/json, text/event-stream", ...headers } },
      (res) => {
        let b = "";
        res.setEncoding("utf8");
        res.on("data", (c) => (b += c));
        res.on("end", () => resolve({ status: res.statusCode ?? 0, body: b }));
      },
    );
    r.on("error", reject);
    r.end(body);
  });
}
const settle = () => new Promise((r) => setTimeout(r, 20)); // the log line is written on res "finish"

describe("MCP token design review (Lane B)", () => {
  it("F1: a path token is never written to the log, whatever the URL's letter case", async () => {
    // Express matches routes case-insensitively, so /MCP/T/<token> authenticates; the redaction regex is lowercase-only.
    const lines: string[] = [];
    const port = start(lines);
    const token = issueAgentToken({ label: "gem-research", ttlSec: 3600, secret: SECRET });
    for (const path of [`/mcp/t/${token}`, `/MCP/T/${token}`, `/Mcp/t/${token}`, `/mcp/T/${token}`]) {
      const r = await post(port, path, initialize());
      expect(r.status, path.replace(token, "<token>")).toBe(200);
    }
    await settle();
    expect(lines.length).toBeGreaterThanOrEqual(4);
    for (const l of lines) expect(l, "log line leaks the path token").not.toContain(token);
  });

  it("F2: a malformed JSON body gets a JSON-RPC parse error, not a stack trace (unauthenticated)", async () => {
    const port = start([]);
    const r = await post(port, "/mcp", "{not json");
    expect(r.status).toBe(400);
    expect(r.body).not.toMatch(/\bat\s+\S+\s+\(|node_modules|SyntaxError/); // no stack, paths or parser internals
    expect(() => JSON.parse(r.body)).not.toThrow();
  });

  it("F3: an authenticated client can't forge log lines through clientInfo", async () => {
    const lines: string[] = [];
    const port = start(lines);
    const token = issueAgentToken({ label: "gem-research", ttlSec: 3600, secret: SECRET });
    const forged = "x\nmcp POST /mcp agent=lead-claude client=? method=tools/call tool=pay → 200 1ms";
    await post(port, "/mcp", initialize(forged), { authorization: `Bearer ${token}` });
    await settle();
    const all = lines.join("\n");
    expect(all.split("\n").filter((l) => l.startsWith("mcp ")).length, "one request must be one log line").toBe(1);
  });

  it("D4: a 401 does not say why a token was rejected (the reason goes to the server log only)", async () => {
    const lines: string[] = [];
    const port = start(lines);
    const expired = issueAgentToken({ label: "gem-research", ttlSec: 1, secret: SECRET, now: 1_000_000 });
    const forged = issueAgentToken({ label: "gem-research", ttlSec: 3600, secret: "x".repeat(40) });
    const a = await post(port, "/mcp", initialize(), { authorization: `Bearer ${expired}` });
    const b = await post(port, "/mcp", initialize(), { authorization: `Bearer ${forged}` });
    expect([a.status, b.status]).toEqual([401, 401]);
    expect(a.body).toBe(b.body);
    await settle();
    expect(lines.some((l) => l.includes("expired"))).toBe(true);
    expect(lines.some((l) => l.includes("bad_signature"))).toBe(true);
  });
});
