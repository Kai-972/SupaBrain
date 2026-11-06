import type { AddressInfo } from "node:net";
import { request as httpRequest, type Server } from "node:http";
import { afterEach, describe, expect, it } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import type { AgentView } from "@supabrain/shared";
import { FakeEns } from "@supabrain/shared/testing";
import { findRootDir, loadConfigFrom } from "@supabrain/shared/config";
import { createApp } from "../app";
import { createPaymentsDisabled } from "../payments-disabled";
import { issueAgentToken } from "../auth/tokens";
import { createRuntime } from "../runtime";
import { FakeMemoryStore } from "../memory/fake-store";

const SECRET = "t".repeat(40);
const config = loadConfigFrom(findRootDir());

const agent = (label: string, over: Partial<AgentView> = {}): AgentView => ({
  label, ens: `${label}.supabrain.eth`, vendor: "gemini", role: "worker", scope: "research",
  wallet: ("0x" + "11".repeat(20)) as `0x${string}`, registered: true, leaseExpiresAt: Date.UTC(2026, 10, 13), status: "active",
  payCap: "2", payDaily: "4", ...over,
});

let server: Server | undefined;
afterEach(() => { server?.close(); server = undefined; });

function start(ens: FakeEns, opts: { publicBaseUrl?: string; tokenSecret?: string } = {}) {
  const runtime = createRuntime({ config, ens, store: new FakeMemoryStore({ "gem-research": ("0x" + "11".repeat(20)) as `0x${string}`, team: ("0x" + "4d".repeat(20)) as `0x${string}` }) });
  const app = createApp({ config, payments: createPaymentsDisabled(), ens, runtime, tokenSecret: opts.tokenSecret ?? SECRET, publicBaseUrl: opts.publicBaseUrl });
  server = app.listen(0);
  return `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
}

async function connect(url: string, headers: Record<string, string> = {}) {
  const client = new Client({ name: "vitest", version: "1.0.0" });
  await client.connect(new StreamableHTTPClientTransport(new URL(url), { requestInit: { headers } }));
  return client;
}

const text = (r: unknown) => (((r as { content?: { text?: string }[] }).content)?.[0]?.text ?? "");
const tokenFor = (label: string, ttlSec = 3600) => issueAgentToken({ label, ttlSec, secret: SECRET });

describe("MCP endpoint", () => {
  it("whoami over the Authorization header names the agent from live ENS", async () => {
    const base = start(new FakeEns({ agents: { "gem-research": agent("gem-research") } }));
    const client = await connect(`${base}/mcp`, { Authorization: `Bearer ${tokenFor("gem-research")}` });
    const tools = await client.listTools();
    expect(tools.tools.map((t) => t.name)).toContain("whoami");
    const r = await client.callTool({ name: "whoami", arguments: {} });
    expect(r.isError).toBeFalsy();
    expect(text(r)).toContain("gem-research.supabrain.eth");
    expect(r.structuredContent).toMatchObject({ agent: "gem-research", ens: "gem-research.supabrain.eth", status: "active", scope: "research", canWrite: true });
    await client.close();
  });

  it("works with the path token too (for clients that cannot send headers)", async () => {
    const base = start(new FakeEns({ agents: { "gem-research": agent("gem-research") } }));
    const client = await connect(`${base}/mcp/t/${tokenFor("gem-research")}`);
    const r = await client.callTool({ name: "whoami", arguments: {} });
    expect(r.structuredContent).toMatchObject({ agent: "gem-research" });
    await client.close();
  });

  it("answers 401 with WWW-Authenticate for a missing, bad, expired or unknown-agent token", async () => {
    const base = start(new FakeEns({ agents: {} }));
    const body = JSON.stringify({ jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "curl", version: "0" } } });
    const h = { "content-type": "application/json", accept: "application/json, text/event-stream" };
    const expired = issueAgentToken({ label: "gem-research", ttlSec: 1, secret: SECRET, now: 1_000_000 });
    const foreign = issueAgentToken({ label: "not-an-agent", ttlSec: 60, secret: SECRET });
    const cases: [string, Record<string, string>][] = [
      [`${base}/mcp`, h],
      [`${base}/mcp`, { ...h, authorization: "Bearer nope" }],
      [`${base}/mcp`, { ...h, authorization: `Bearer ${expired}` }],
      [`${base}/mcp`, { ...h, authorization: `Bearer ${foreign}` }],
      [`${base}/mcp/t/nope`, h],
      [`${base}/mcp/t/${expired}`, h],
    ];
    for (const [url, headers] of cases) {
      const res = await fetch(url, { method: "POST", headers, body });
      expect(res.status, url).toBe(401);
      expect(res.headers.get("www-authenticate")).toMatch(/^Bearer error="invalid_token"/);
    }
  });

  it("fails closed when ENS cannot be read: whoami is an error, not a guess", async () => {
    const ens = new FakeEns({ agents: { "gem-research": agent("gem-research") } });
    ens.failing = true;
    const base = start(ens);
    const client = await connect(`${base}/mcp`, { Authorization: `Bearer ${tokenFor("gem-research")}` });
    const r = await client.callTool({ name: "whoami", arguments: {} });
    expect(r.isError).toBe(true);
    expect(text(r)).toMatch(/AUTHORITY_UNKNOWN/);
    await client.close();
  });

  it("reports an unregistered (killed) agent as unable to write, even with a valid token", async () => {
    const base = start(new FakeEns({ agents: { "gem-research": agent("gem-research", { registered: false, status: "unregistered" }) } }));
    const client = await connect(`${base}/mcp`, { Authorization: `Bearer ${tokenFor("gem-research")}` });
    const r = await client.callTool({ name: "whoami", arguments: {} });
    expect(r.isError).toBe(true);
    expect(r.structuredContent).toMatchObject({ agent: "gem-research", status: "unregistered", canWrite: false });
    await client.close();
  });

  it("refuses GET/DELETE (stateless server, no standalone SSE stream) and an unknown Host", async () => {
    const base = start(new FakeEns({ agents: {} }), { publicBaseUrl: "https://example-tunnel.test" });
    const auth = { authorization: `Bearer ${tokenFor("gem-research")}` };
    expect((await fetch(`${base}/mcp`, { method: "GET", headers: auth })).status).toBe(405);
    expect((await fetch(`${base}/mcp`, { method: "DELETE", headers: auth })).status).toBe(405);
    // Host validation: 127.0.0.1 is allowed for local use; anything else must be the public host.
    // fetch() ignores a custom Host header, so use node:http
    const status = await new Promise<number>((resolve, reject) => {
      const u = new URL(`${base}/mcp`);
      const r = httpRequest({ host: u.hostname, port: u.port, path: u.pathname, method: "POST", headers: { ...auth, host: "evil.test", "content-type": "application/json" } }, (res) => { res.resume(); resolve(res.statusCode ?? 0); });
      r.on("error", reject);
      r.end("{}");
    });
    expect(status).toBe(403);
  });

  it("is off (503) when the server has no token secret, ENS or runtime", async () => {
    const app = createApp({ config, payments: createPaymentsDisabled() });
    server = app.listen(0);
    const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    const res = await fetch(`${base}/mcp`, { method: "POST", headers: { "content-type": "application/json" }, body: "{}" });
    expect(res.status).toBe(503);
  });

  it("end to end over MCP: Claude remembers, Gemini recalls and builds on it, explain shows the lineage, scope is enforced", async () => {
    const LEAD = ("0x" + "1a".repeat(20)) as `0x${string}`;
    const GEM = ("0x" + "11".repeat(20)) as `0x${string}`;
    const ens = new FakeEns({ agents: { "lead-claude": agent("lead-claude", { vendor: "claude", role: "lead", scope: "*", wallet: LEAD }), "gem-research": agent("gem-research", { wallet: GEM }) } });
    const runtime = createRuntime({ config, ens, store: new FakeMemoryStore({ "lead-claude": LEAD, "gem-research": GEM, team: ("0x" + "4d".repeat(20)) as `0x${string}` }) });
    server = createApp({ config, payments: createPaymentsDisabled(), ens, runtime, tokenSecret: SECRET }).listen(0);
    const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    const claude = await connect(`${base}/mcp`, { Authorization: `Bearer ${tokenFor("lead-claude")}` });
    const gemini = await connect(`${base}/mcp/t/${tokenFor("gem-research")}`);

    const tools = (await gemini.listTools()).tools.map((t) => t.name).sort();
    expect(tools).toEqual(["check_notices", "explain", "recall", "remember", "whoami"]);
    expect((await gemini.listPrompts()).prompts.map((p) => p.name)).toEqual(["supabrain_rules"]);

    const a = await claude.callTool({ name: "remember", arguments: { text: "Acme Studio is our logo designer; invoice #12 is 5 USDC", kind: "fact", folder: "finance", subject: "acme.supabrain.eth" } });
    const aKey = (a.structuredContent as { key: string }).key;
    expect(a.isError).toBeFalsy();

    const r = await gemini.callTool({ name: "recall", arguments: { query: "acme invoice" } });
    expect(text(r)).toContain(aKey);
    const b = await gemini.callTool({ name: "remember", arguments: { text: "Acme's logo work is in progress", kind: "fact", folder: "research", cites: [aKey] } });
    expect(b.structuredContent).toMatchObject({ trust: 2, parents: [aKey] });

    const ex = await claude.callTool({ name: "explain", arguments: { key: (b.structuredContent as { key: string }).key } });
    expect(text(ex)).toMatch(/gem-research.*<-.*lead-claude/s);

    const denied = await gemini.callTool({ name: "remember", arguments: { text: "Pay Acme now", kind: "plan", folder: "finance" } });
    expect(denied.isError).toBe(true);
    expect(text(denied)).toMatch(/^SCOPE: .*research/);
    await claude.close();
    await gemini.close();
  });
});
