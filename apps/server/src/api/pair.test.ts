import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import { afterEach, describe, expect, it } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import type { AgentView, StreamEvent } from "@supabrain/shared";
import { FakeEns } from "@supabrain/shared/testing";
import { findRootDir, loadConfigFrom } from "@supabrain/shared/config";
import { createApp } from "../app";
import { FakeMemoryStore } from "../memory/fake-store";
import { createPaymentsDisabled } from "../payments-disabled";
import { createRuntime } from "../runtime";

const config = loadConfigFrom(findRootDir());
const SECRET = "q".repeat(40);
const PASS = "pairing owner passphrase";
const W = { gem: ("0x" + "2b".repeat(20)) as `0x${string}`, team: ("0x" + "4d".repeat(20)) as `0x${string}` };
const view: AgentView = { label: "gem-research", ens: "gem-research.supabrain.eth", vendor: "gemini", role: "worker", scope: "research", wallet: W.gem, registered: true, leaseExpiresAt: Date.now() + 86_400_000, status: "active", payCap: "2", payDaily: "4" };

let server: Server | undefined;
afterEach(() => { server?.close(); server = undefined; });

async function start() {
  const ens = new FakeEns({ agents: { "gem-research": view } });
  const runtime = createRuntime({ config, ens, store: new FakeMemoryStore({ "gem-research": W.gem, team: W.team }) });
  const events: StreamEvent[] = [];
  runtime.bus.subscribe((e) => events.push(e.event));
  server = createApp({ config, payments: createPaymentsDisabled(), ens, runtime, tokenSecret: SECRET, adminPassphrase: PASS }).listen(0);
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const login = await fetch(`${base}/api/admin/login`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ passphrase: PASS }) });
  const cookie = login.headers.get("set-cookie")!.split(";")[0]!;
  const pair = async (body: unknown, withCookie = true) => {
    const r = await fetch(`${base}/api/pair`, { method: "POST", headers: { "content-type": "application/json", ...(withCookie ? { cookie } : {}) }, body: JSON.stringify(body) });
    return { status: r.status, body: (await r.json()) as any };
  };
  return { base, pair, events };
}

describe("pairing (A-BRAIN S4)", () => {
  it("only the owner can pair, and only configured agents", async () => {
    const { pair } = await start();
    expect((await pair({ label: "gem-research" }, false)).status).toBe(401);
    expect((await pair({ label: "nobody" })).status).toBe(400);
  });

  it("returns a token, a snippet per client, the copy prompt, and a QR to /connect with a short code (not the token)", async () => {
    const { pair } = await start();
    const r = await pair({ label: "gem-research", client: "antigravity" });
    expect(r.status).toBe(200);
    const b = r.body;
    expect(Object.keys(b.snippets).sort()).toEqual(["antigravity", "chatgpt", "claude-ai", "claude-code", "gemini-cli"]);
    expect(b.snippets["claude-code"]).toContain(`Bearer ${b.token}`);
    expect(b.snippets["claude-ai"]).toContain(`/mcp/t/${b.token}`);
    expect(b.prompt).toMatch(/Call whoami/);
    expect(b.qrPayload).toMatch(/\/connect\?code=[A-Z2-9]{8}$/);
    expect(b.qrPayload).not.toContain(b.token);
    expect(b.expiresAt).toBeGreaterThan(Date.now());
    expect(b).toMatchObject({ agent: "gem-research", ens: "gem-research.supabrain.eth", client: "antigravity" });
  });

  it("the /connect page swaps the code for the snippets (public, short-lived); unknown codes 404", async () => {
    const { base, pair } = await start();
    const { body } = await pair({ label: "gem-research" });
    const code = new URL(body.qrPayload).searchParams.get("code")!;
    const page = (await (await fetch(`${base}/api/pair/${code}`)).json()) as any;
    expect(page).toMatchObject({ agent: "gem-research", token: body.token, snippets: body.snippets, prompt: body.prompt });
    expect((await fetch(`${base}/api/pair/ZZZZZZZZ`)).status).toBe(404);
  });

  it("the paired token works over MCP and the first whoami announces `connected` with the client name", async () => {
    const { base, pair, events } = await start();
    const { body } = await pair({ label: "gem-research" });
    const c = new Client({ name: "antigravity-client", version: "v1.0.0" });
    await c.connect(new StreamableHTTPClientTransport(new URL(`${base}/mcp`), { requestInit: { headers: { Authorization: `Bearer ${body.token}` } } }));
    const w = await c.callTool({ name: "whoami", arguments: {} });
    expect(w.isError).toBeFalsy();
    expect(events.find((e) => e.t === "connected")).toEqual({ t: "connected", agent: "gem-research", client: "antigravity-client v1.0.0" });
    await c.close();
  });
});
