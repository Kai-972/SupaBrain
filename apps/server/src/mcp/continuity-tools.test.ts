import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import { afterEach, describe, expect, it } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import type { AgentView } from "@supabrain/shared";
import { FakeEns } from "@supabrain/shared/testing";
import { findRootDir, loadConfigFrom } from "@supabrain/shared/config";
import { createApp } from "../app";
import { issueAgentToken } from "../auth/tokens";
import { FakeMemoryStore } from "../memory/fake-store";
import { createPaymentsDisabled } from "../payments-disabled";
import { createRuntime } from "../runtime";

const SECRET = "v".repeat(40);
const config = loadConfigFrom(findRootDir());
const W = { lead: ("0x" + "1a".repeat(20)) as `0x${string}`, gem: ("0x" + "2b".repeat(20)) as `0x${string}`, team: ("0x" + "4d".repeat(20)) as `0x${string}` };
const view = (label: string, wallet: `0x${string}`, o: Partial<AgentView> = {}): AgentView => ({
  label, ens: `${label}.supabrain.eth`, vendor: "claude", role: "lead", scope: "*", wallet, registered: true,
  leaseExpiresAt: Date.now() + 86_400_000, status: "active", payCap: "0", payDaily: "0", ...o,
});
const text = (r: unknown) => (((r as { content?: { text?: string }[] }).content)?.[0]?.text ?? "");

let server: Server | undefined;
afterEach(() => { server?.close(); server = undefined; });

async function start() {
  const ens = new FakeEns({ agents: { "lead-claude": view("lead-claude", W.lead), "gem-research": view("gem-research", W.gem, { vendor: "gemini", role: "worker" }) } });
  const runtime = createRuntime({ config, ens, store: new FakeMemoryStore({ "lead-claude": W.lead, "gem-research": W.gem, team: W.team }) });
  server = createApp({ config, payments: createPaymentsDisabled(), ens, runtime, tokenSecret: SECRET, legacyTools: false }).listen(0);
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const connect = async (label: string, name: string) => {
    const c = new Client({ name, version: "1.0" });
    await c.connect(new StreamableHTTPClientTransport(new URL(`${base}/mcp/t/${issueAgentToken({ label, ttlSec: 600, secret: SECRET })}`)));
    return c;
  };
  return { connect, runtime };
}

describe("v2 tools over MCP (production surface)", () => {
  it("the AIs see continue, checkpoint, checkout (and pay); the v1 tools are hidden; the continue prompt exists", async () => {
    const { connect } = await start();
    const c = await connect("lead-claude", "claude-code");
    expect((await c.listTools()).tools.map((t) => t.name).sort()).toEqual(["checkout", "checkpoint", "continue", "pay", "pay_status"]);
    expect((await c.listPrompts()).prompts.map((p) => p.name)).toContain("continue");
    expect((c.getInstructions() ?? "")).toMatch(/says continue/);
    await c.close();
  });

  it("Claude Code builds and saves; Antigravity says continue, checks out, finishes the task; Claude sees it", async () => {
    const { connect, runtime } = await start();
    const claude = await connect("lead-claude", "claude-code");
    const saved = await claude.callTool({ name: "checkpoint", arguments: {
      summary: "Scaffolded a React to-do app (add/delete, localStorage)", next: "dark mode", add_tasks: ["Dark mode"],
      files: [{ path: "src/App.tsx", content: "export default function App() { return null; }\n" }],
    } });
    expect(saved.isError).toBeFalsy();
    expect(text(saved)).toMatch(/Saved checkpoint 0x[0-9a-f]{64}.*Files saved: src\/App\.tsx.*New tasks: t:[0-9a-f]{8} Dark mode/s);

    const gem = await connect("gem-research", "antigravity");
    const cont = await gem.callTool({ name: "continue", arguments: {} });
    expect(text(cont)).toMatch(/lead-claude \(claude\): "Scaffolded a React to-do app/);
    expect(text(cont)).toMatch(/Tell the user in two lines/);
    const taskId = /\[ \] (t:[0-9a-f]{8}) Dark mode/.exec(text(cont))![1]!;
    const co = await gem.callTool({ name: "checkout", arguments: {} });
    expect(text(co)).toMatch(/=== src\/App\.tsx \(\d+ B, by lead-claude\) ===\nexport default function App/);
    const done = await gem.callTool({ name: "checkpoint", arguments: { summary: "Added dark mode", done: [taskId], files: [{ path: "src/App.tsx", content: "export default function App() { return 'dark'; }\n" }] } });
    expect(done.isError).toBeFalsy();

    const back = await claude.callTool({ name: "continue", arguments: {} });
    expect(text(back)).toMatch(/gem-research \(gemini\): "Added dark mode"/);
    expect(text(back)).toMatch(/\[x\] t:[0-9a-f]{8} Dark mode · gem-research/);
    const cps = runtime.graph.all().filter((n) => n.kind === "checkpoint");
    expect(cps.map((n) => n.checkpoint?.client)).toEqual(["claude-code 1.0", "antigravity 1.0"]);
    await claude.close();
    await gem.close();
  });

  it("an unknown brain is a clear error", async () => {
    const { connect } = await start();
    const c = await connect("lead-claude", "claude-ai");
    const r = await c.callTool({ name: "continue", arguments: { brain: "nope" } });
    expect(r.isError).toBe(true);
    expect(text(r)).toMatch(/no brain "nope"/);
    await c.close();
  });
});
