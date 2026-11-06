import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import { afterEach, describe, expect, it } from "vitest";
import type { AgentView } from "@supabrain/shared";
import { FakeEns } from "@supabrain/shared/testing";
import { findRootDir, loadConfigFrom } from "@supabrain/shared/config";
import { createApp } from "../app";
import { FakeMemoryStore } from "../memory/fake-store";
import { createPaymentsDisabled } from "../payments-disabled";
import { createRuntime } from "../runtime";

const config = loadConfigFrom(findRootDir());
const PASS = "brain api owner passphrase";
const W = { lead: ("0x" + "1a".repeat(20)) as `0x${string}`, team: ("0x" + "4d".repeat(20)) as `0x${string}` };
const view: AgentView = { label: "lead-claude", ens: "lead-claude.supabrain.eth", vendor: "claude", role: "lead", scope: "*", wallet: W.lead, registered: true, leaseExpiresAt: Date.now() + 86_400_000, status: "active", payCap: "0", payDaily: "0" };
const flush = () => new Promise((r) => setTimeout(r, 0));

let server: Server | undefined;
afterEach(() => { server?.close(); server = undefined; });

async function start() {
  const ens = new FakeEns({ agents: { "lead-claude": view } });
  const runtime = createRuntime({ config, ens, store: new FakeMemoryStore({ "lead-claude": W.lead, team: W.team }) });
  server = createApp({ config, payments: createPaymentsDisabled(), ens, runtime, tokenSecret: "b".repeat(40), adminPassphrase: PASS }).listen(0);
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const get = async (p: string) => { const r = await fetch(`${base}${p}`); return { status: r.status, body: (await r.json()) as any }; };
  const login = await fetch(`${base}/api/admin/login`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ passphrase: PASS }) });
  const cookie = login.headers.get("set-cookie")!.split(";")[0]!;
  const post = async (p: string, body: unknown, withCookie = true) => {
    const r = await fetch(`${base}${p}`, { method: "POST", headers: { "content-type": "application/json", ...(withCookie ? { cookie } : {}) }, body: JSON.stringify(body) });
    return { status: r.status, body: (await r.json()) as any };
  };
  return { runtime, get, post, id: config.app.team.id };
}

describe("website API v2 (docs/API_V2.md, work part)", () => {
  it("brains, summary, checkpoints, tasks, files (no contents in lists), file content with versions, notes", async () => {
    const { runtime, get, post, id } = await start();
    expect((await post(`/api/brains/${id}/tasks`, { title: "Dark mode" }, false)).status).toBe(401);
    const t = await post(`/api/brains/${id}/tasks`, { title: "Dark mode" });
    expect(t.body).toMatchObject({ title: "Dark mode", status: "open", createdBy: "owner", trust: 3 });
    await runtime.continuity.checkpoint("lead-claude", { summary: "v1", files: [{ path: "src/App.tsx", content: "one" }], notes: [{ text: "Use localStorage", kind: "decision" }] }, "claude-code 2.1");
    await flush();
    await runtime.continuity.checkpoint("lead-claude", { summary: "v2", done: [t.body.key], files: [{ path: "src/App.tsx", content: "two" }] });
    await flush();

    const brains = await get("/api/brains");
    expect(brains.body[0]).toMatchObject({ id, counts: { checkpoints: 2, tasksOpen: 0, tasksDone: 1, files: 1 } });
    expect((await get(`/api/brains/${id}/summary`)).body.text).toMatch(/WHERE WE LEFT OFF/);
    const cps = (await get(`/api/brains/${id}/checkpoints`)).body;
    expect(cps.map((c: any) => c.summary)).toEqual(["v2", "v1"]);
    expect(cps[1]).toMatchObject({ client: "claude-code 2.1", files: ["src/App.tsx"] });
    expect((await get(`/api/brains/${id}/tasks`)).body[0]).toMatchObject({ status: "done", doneBy: "lead-claude" });
    const files = (await get(`/api/brains/${id}/files`)).body;
    expect(files).toEqual([expect.objectContaining({ path: "src/App.tsx", versions: 2 })]);
    const content = (await get(`/api/brains/${id}/files/content?path=src/App.tsx`)).body;
    expect(content).toMatchObject({ content: "two", versions: [expect.objectContaining({ agent: "lead-claude" }), expect.anything()] });
    const old = (await get(`/api/brains/${id}/files/content?path=src/App.tsx&key=${content.versions[1].key}`)).body;
    expect(old.content).toBe("one");
    expect((await get(`/api/brains/${id}/notes`)).body.map((n: any) => n.text)).toEqual(["Use localStorage"]);
    const graph = (await get("/api/graph")).body;
    expect(graph.nodes.filter((n: any) => n.kind === "file").every((n: any) => n.text === "")).toBe(true);
    expect((await get("/api/brains/other/tasks")).status).toBe(404);
  });
});
