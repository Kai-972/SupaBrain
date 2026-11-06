// Lane B security review of the MCP token design (B-MONEY S4). Each test is a confirmed finding, written as the
// behaviour we WANT. They are marked `it.fails` so main stays green while the hole is open: when Lane A's fix lands,
// the test starts passing, `it.fails` turns red, and the fix flips it to `it(...)`.
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
  const app = createApp({
    config, payments: createPaymentsDisabled(), ens: new FakeEns({ agents: { "gem-research": agent("gem-research") } }),
    tokenSecret: SECRET, log: (l) => lines.push(l),
  });
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
  it.fails("F1: a path token is never written to the log, whatever the URL's letter case", async () => {
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

  it.fails("F2: a malformed JSON body gets a JSON-RPC parse error, not a stack trace (unauthenticated)", async () => {
    const port = start([]);
    const r = await post(port, "/mcp", "{not json");
    expect(r.status).toBe(400);
    expect(r.body).not.toMatch(/\bat\s+\S+\s+\(|node_modules|SyntaxError/); // no stack, paths or parser internals
    expect(() => JSON.parse(r.body)).not.toThrow();
  });

  it.fails("F3: an authenticated client can't forge log lines through clientInfo", async () => {
    const lines: string[] = [];
    const port = start(lines);
    const token = issueAgentToken({ label: "gem-research", ttlSec: 3600, secret: SECRET });
    const forged = "x\nmcp POST /mcp agent=lead-claude client=? method=tools/call tool=pay → 200 1ms";
    await post(port, "/mcp", initialize(forged), { authorization: `Bearer ${token}` });
    await settle();
    const all = lines.join("\n");
    expect(all.split("\n").filter((l) => l.startsWith("mcp ")).length, "one request must be one log line").toBe(1);
  });
});
