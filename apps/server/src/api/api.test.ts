import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import { afterEach, describe, expect, it } from "vitest";
import type { AgentView } from "@supabrain/shared";
import { FakeEns } from "@supabrain/shared/testing";
import { findRootDir, loadConfigFrom } from "@supabrain/shared/config";
import { createApp } from "../app";
import { createPaymentsDisabled } from "../payments-disabled";
import { createRuntime } from "../runtime";
import { FakeMemoryStore } from "../memory/fake-store";

const config = loadConfigFrom(findRootDir());
const W = { lead: ("0x" + "1a".repeat(20)) as `0x${string}`, gem: ("0x" + "2b".repeat(20)) as `0x${string}`, team: ("0x" + "4d".repeat(20)) as `0x${string}` };
const view = (label: string, wallet: `0x${string}`, o: Partial<AgentView> = {}): AgentView => ({
  label, ens: `${label}.supabrain.eth`, vendor: "claude", role: "worker", scope: "research", wallet, registered: true,
  leaseExpiresAt: Date.now() + 86_400_000, status: "active", payCap: "0", payDaily: "0", ...o,
});
const PASS = "correct horse battery staple";
const json = async (p: Promise<Response>): Promise<any> => (await p).json();

let server: Server | undefined;
afterEach(() => { server?.close(); server = undefined; });

function start(o: { ensFailing?: boolean; passphrase?: string | null } = {}) {
  const ens = new FakeEns({ agents: { "lead-claude": view("lead-claude", W.lead, { role: "lead", scope: "*" }), "gem-research": view("gem-research", W.gem, { vendor: "gemini" }) }, vendors: ["acme.supabrain.eth"] });
  ens.failing = !!o.ensFailing;
  const runtime = createRuntime({ config, ens, store: new FakeMemoryStore({ "lead-claude": W.lead, "gem-research": W.gem, team: W.team }) });
  const app = createApp({ config, payments: createPaymentsDisabled(), ens, runtime, tokenSecret: "t".repeat(40), adminPassphrase: o.passphrase === null ? undefined : (o.passphrase ?? PASS) });
  server = app.listen(0);
  return { base: `http://127.0.0.1:${(server.address() as AddressInfo).port}`, runtime, ens };
}

describe("dashboard API", () => {
  it("GET /api/team: live agents from ENS, vendors, counts", async () => {
    const { base, runtime } = start();
    await runtime.service.remember("lead-claude", { text: "Budget is 10 USDC", kind: "decision", folder: "finance" });
    const t = await (await fetch(`${base}/api/team`)).json() as any;
    expect(t.team).toMatchObject({ id: "team1", ens: "supabrain.eth" });
    expect(t.agents.map((a: AgentView) => [a.label, a.status, a.registered])).toEqual([["lead-claude", "active", true], ["gem-research", "active", true], ["gpt-writer", "unknown", false]]);
    expect(t.agents[0]).toMatchObject({ authority: "live", lastWriteAt: expect.any(Number) });
    expect(t.vendors).toEqual(["acme.supabrain.eth"]);
    expect(t.counts).toMatchObject({ memories: 1, active: 1 });
  });

  it("GET /api/team says when ENS authority is unknown instead of guessing", async () => {
    const { base } = start({ ensFailing: true });
    const t = await (await fetch(`${base}/api/team`)).json() as any;
    expect(t.agents.every((a: { authority: string }) => a.authority === "unavailable")).toBe(true);
  });

  it("GET /api/graph?since and GET /api/memory/:key (lineage + readers)", async () => {
    const { base, runtime } = start();
    const s = runtime.service;
    const ev = await s.remember("gem-research", { text: "Acme says the wallet changed", kind: "evidence", folder: "research", source: { type: "email", id: "email:acme-0611" } });
    await s.recall("lead-claude", { query: "acme wallet" });
    const m = await s.remember("lead-claude", { text: "Pay the new Acme wallet", kind: "plan", folder: "finance" });
    const g = await (await fetch(`${base}/api/graph`)).json() as any;
    expect(g.nodes.map((n: { key: string }) => n.key)).toEqual([ev.key, m.key]);
    expect(g.edges).toEqual([{ parent: ev.key, child: m.key }]);
    expect(g.seq).toBe(2);
    const since = await (await fetch(`${base}/api/graph?since=1`)).json() as any;
    expect(since.nodes.map((n: { key: string }) => n.key)).toEqual([m.key]);
    const one = await (await fetch(`${base}/api/memory/${ev.key}`)).json() as any;
    expect(one).toMatchObject({ key: ev.key, readers: ["lead-claude"], lineage: [[ev.key]] });
    expect((await fetch(`${base}/api/memory/0xnope`)).status).toBe(404);
  });

  it("GET /api/stream replays from ?since and then streams live events", async () => {
    const { base, runtime } = start();
    await runtime.service.remember("lead-claude", { text: "first", kind: "fact", folder: "f" });
    const ac = new AbortController();
    const res = await fetch(`${base}/api/stream?since=0`, { signal: ac.signal });
    expect(res.headers.get("content-type")).toMatch(/text\/event-stream/);
    const reader = res.body!.getReader();
    let buf = "";
    const until = async (pred: () => boolean) => { while (!pred()) buf += new TextDecoder().decode((await reader.read()).value); };
    await until(() => buf.includes('"t":"confirmed"'));
    await runtime.service.remember("lead-claude", { text: "second", kind: "fact", folder: "f" });
    await until(() => (buf.match(/"t":"memory"/g) ?? []).length >= 2);
    expect(buf).toMatch(/^retry: \d+/m);
    expect(buf).toMatch(/^id: 1$/m);
    ac.abort();
  });

  it("admin login: wrong passphrase 401, right one sets an httpOnly cookie that /api/admin/me accepts", async () => {
    const { base } = start();
    const bad = await fetch(`${base}/api/admin/login`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ passphrase: "nope" }) });
    expect(bad.status).toBe(401);
    const ok = await fetch(`${base}/api/admin/login`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ passphrase: PASS }) });
    expect(ok.status).toBe(200);
    const cookie = ok.headers.get("set-cookie")!;
    expect(cookie).toMatch(/^sb_admin=[A-Za-z0-9_-]+;/);
    expect(cookie).toMatch(/HttpOnly/);
    expect(cookie).toMatch(/SameSite=Lax/);
    expect(await json(fetch(`${base}/api/admin/me`))).toEqual({ admin: false });
    expect(await json(fetch(`${base}/api/admin/me`, { headers: { cookie: cookie.split(";")[0]! } }))).toEqual({ admin: true });
    expect(await json(fetch(`${base}/api/admin/me`, { headers: { cookie: "sb_admin=forged" } }))).toEqual({ admin: false });
  });

  it("an MCP agent token is not an admin session (separate signing keys)", async () => {
    const { base } = start();
    const { issueAgentToken } = await import("../auth/tokens");
    const agentToken = issueAgentToken({ label: "lead-claude", ttlSec: 600, secret: "t".repeat(40) });
    expect(await json(fetch(`${base}/api/admin/me`, { headers: { cookie: `sb_admin=${agentToken}` } }))).toEqual({ admin: false });
  });

  it("admin login is off (503) without a passphrase, and rate-limits guessing", async () => {
    const off = start({ passphrase: null });
    expect((await fetch(`${off.base}/api/admin/login`, { method: "POST", headers: { "content-type": "application/json" }, body: "{}" })).status).toBe(503);
    server!.close();
    const { base } = start();
    let last = 0;
    for (let i = 0; i < 12; i++) last = (await fetch(`${base}/api/admin/login`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ passphrase: `guess${i}` }) })).status;
    expect(last).toBe(429);
  });

  it("CORS: allowed dashboard origins get credentials; others get nothing", async () => {
    const { base } = start();
    const allowed = config.app.server.allowedOrigins[0]!;
    const pre = await fetch(`${base}/api/team`, { method: "OPTIONS", headers: { origin: allowed, "access-control-request-method": "POST" } });
    expect(pre.status).toBe(204);
    expect(pre.headers.get("access-control-allow-origin")).toBe(allowed);
    expect(pre.headers.get("access-control-allow-credentials")).toBe("true");
    const evil = await fetch(`${base}/api/team`, { headers: { origin: "https://evil.example" } });
    expect(evil.headers.get("access-control-allow-origin")).toBeNull();
  });

  it("owner actions refuse without the admin session (401), every one of them", async () => {
    const { base } = start();
    const post = (path: string, body: unknown) => fetch(`${base}${path}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    for (const [path, body] of [
      ["/api/dryrun", { target: { type: "source", id: "email:x" } }],
      ["/api/revoke", { target: { type: "source", id: "email:x" } }],
      ["/api/memory/human", { text: "x", kind: "fact", folder: "finance" }],
      ["/api/memory/0xabc/keep", {}],
      ["/api/memory/0xabc/correct", { text: "x" }],
    ] as const) expect((await post(path, body)).status, path).toBe(401);
  });

  it("owner flow over HTTP: add context → agent builds on email → dry run → revoke → keep refused → correct", async () => {
    const { base, runtime } = start();
    const login = await fetch(`${base}/api/admin/login`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ passphrase: PASS }) });
    const cookie = login.headers.get("set-cookie")!.split(";")[0]!;
    const post = async (path: string, body: unknown) => {
      const r = await fetch(`${base}${path}`, { method: "POST", headers: { "content-type": "application/json", cookie }, body: JSON.stringify(body) });
      return { status: r.status, body: (await r.json()) as any };
    };
    const h = await post("/api/memory/human", { text: "Pay Acme 5 USDC for the logo", kind: "plan", folder: "finance", subject: "acme.supabrain.eth" });
    expect(h.status).toBe(200);
    expect(runtime.graph.get(h.body.key)).toMatchObject({ trust: 3, agent: "owner" });
    const ev = await runtime.service.remember("gem-research", { text: "Acme says the wallet changed", kind: "evidence", folder: "research", source: { type: "email", id: "email:acme-0611" } });
    await runtime.service.recall("lead-claude", { query: "acme wallet logo" });
    const plan = await runtime.service.remember("lead-claude", { text: "Pay the new Acme wallet", kind: "plan", folder: "finance" });
    await new Promise((r) => setTimeout(r, 0));

    const dry = await post("/api/dryrun", { target: { type: "source", id: "email:acme-0611" } });
    expect(dry.status).toBe(200);
    expect([...dry.body.memories].sort()).toEqual([ev.key, plan.key].sort());
    expect(dry.body.readers).toEqual(["lead-claude"]);

    const rev = await post("/api/revoke", { target: { type: "source", id: "email:acme-0611" }, reason: "phishing" });
    expect(rev.status).toBe(200);
    expect(rev.body).toMatchObject({ affected: expect.arrayContaining([ev.key, plan.key]), arkivUrl: expect.any(String) });
    expect((await post("/api/revoke", { target: { type: "source", id: "email:acme-0611" } })).status).toBe(409);
    expect((await post(`/api/memory/${plan.key}/keep`, { days: 3 })).status).toBe(409);
    const kept = await post(`/api/memory/${h.body.key}/keep`, { days: 3 });
    expect(kept.status).toBe(200);
    expect(kept.body.days).toBe(3);

    const corr = await post(`/api/memory/${h.body.key}/correct`, { text: "Pay Acme 5 USDC to the address on acme.supabrain.eth" });
    expect(corr.status).toBe(200);
    expect(runtime.graph.get(corr.body.newKey)).toMatchObject({ supersedes: h.body.key, trust: 3 });
    expect(runtime.graph.status(h.body.key)).toBe("quarantined");
    expect((await post("/api/dryrun", { target: { type: "teleport", id: "x" } })).status).toBe(400);
  });
});
