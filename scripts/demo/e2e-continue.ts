// pnpm e2e:continue [--base <url>]   Live check of v2 step 1 (docs/PLAN.md §4) against a RUNNING server, with real MCP
// calls as two AIs: Claude saves a checkpoint with tasks and files → Gemini says continue, checks out the files, finishes
// a task → Claude's next continue shows Gemini's work; everything confirmed on Arkiv. Writes real entities: use a -dev
// namespace. Gemini writes under its ENS scope (sb.scope), so the file path follows that record.
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { issueAgentToken } from "@supabrain/server/tokens";
import { loadConfig, readEnv, requireEnv } from "@supabrain/shared/config";

const arg = (n: string) => { const i = process.argv.indexOf(`--${n}`); return i >= 0 ? process.argv[i + 1] : undefined; };
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
let failures = 0;
const check = (name: string, ok: boolean, detail = "") => { if (!ok) failures++; console.log(`${ok ? "✓" : "✗"} ${name}${detail ? `  ${detail}` : ""}`); };
type Result = { isError?: boolean; content?: { text?: string }[]; structuredContent?: Record<string, any> };

async function main() {
  const config = loadConfig();
  const base = (arg("base") ?? readEnv().PUBLIC_BASE_URL ?? `http://localhost:${config.app.server.port}`).replace(/\/+$/, ""); // hardcode-ok: local fallback when PUBLIC_BASE_URL is unset
  const secret = requireEnv("TOKEN_SIGNING_SECRET");
  const run = Date.now().toString(36);
  const gemScope = config.app.agents.find((a) => a.label === "gem-research")?.scope ?? "*";
  const gemPath = gemScope === "*" ? "src/Filters.tsx" : `${gemScope}/filters-${run}.md`;

  const connect = async (label: string, name: string) => {
    const c = new Client({ name, version: "e2e" });
    await c.connect(new StreamableHTTPClientTransport(new URL(`${base}/mcp/t/${issueAgentToken({ label, ttlSec: 3600, secret })}`)));
    return c;
  };
  const call = async (c: Client, name: string, args: Record<string, unknown> = {}) => {
    const r = (await c.callTool({ name, arguments: args })) as Result;
    return { r, text: r.content?.[0]?.text ?? "", s: r.structuredContent ?? {} };
  };
  const brainId = config.app.team.id;
  const getJson = async (p: string) => (await fetch(`${base}${p}`)).json() as Promise<any>;
  const waitConfirmed = async (keys: string[], ms = 120_000) => {
    const t0 = Date.now();
    for (; Date.now() - t0 < ms; await sleep(2000)) {
      const g = await getJson("/api/graph");
      if (keys.every((k) => g.nodes.some((n: any) => n.key === k && !n.pending))) return (Date.now() - t0) / 1000;
    }
    return -1;
  };

  const claude = await connect("lead-claude", "claude-code");
  const tools = (await claude.listTools()).tools.map((t) => t.name).sort();
  check("the AIs see continue / checkpoint / checkout", ["checkout", "checkpoint", "continue"].every((t) => tools.includes(t)), tools.join(", "));

  // a mid-size file too, to measure what file contents cost on Arkiv
  const big = Array.from({ length: 400 }, (_, i) => `export const todo${i} = { id: ${i}, title: "Task ${i}", done: false }; // ${run}`).join("\n");
  const app = `import { useState } from "react";\n// run ${run}\nexport default function App() {\n  const [todos, setTodos] = useState<string[]>([]);\n  return <ul>{todos.map((t) => <li key={t}>{t}</li>)}</ul>;\n}\n`;
  const c1 = await call(claude, "checkpoint", {
    summary: `Scaffolded a React to-do app with add/delete (run ${run})`, next: "filters, then dark mode",
    add_tasks: [`Add filters (run ${run})`, `Dark mode (run ${run})`],
    files: [{ path: "src/App.tsx", content: app }, { path: "src/seed.ts", content: big }],
    notes: [{ text: `Todos are stored in localStorage, no backend (run ${run})`, kind: "decision" }],
  });
  check("Claude saves a checkpoint with 2 tasks, 2 files and a note in one write", !c1.r.isError && c1.s.tasksAdded?.length === 2 && c1.s.files?.saved?.length === 2, c1.text.slice(0, 140));
  const t1 = Date.now();
  const k1 = [c1.s.key, ...(c1.s.tasksAdded ?? []).map((t: any) => t.key), ...(c1.s.notes ?? [])];
  const s1 = await waitConfirmed(k1);
  check("…confirmed on Arkiv", s1 >= 0, `${s1.toFixed(1)} s (src/seed.ts is ${Buffer.byteLength(big)} bytes)`);

  const gem = await connect("gem-research", "antigravity");
  const cont = await call(gem, "continue", { focus: "filters" });
  check("Gemini's continue shows where Claude left off", cont.text.includes(`Scaffolded a React to-do app with add/delete (run ${run})`), cont.text.split("\n").find((l) => l.includes("lead-claude")) ?? "");
  const taskId = new RegExp(`\\[ \\] (t:[0-9a-f]{8}) Add filters \\(run ${run}\\)`).exec(cont.text)?.[1];
  check("…and the open task with its id", !!taskId, taskId ?? "");
  const co = await call(gem, "checkout", { paths: ["src/App.tsx"] });
  check("Gemini checks out src/App.tsx (Claude's version)", co.text.includes(`// run ${run}`) && co.text.includes("by lead-claude"));
  const c2 = await call(gem, "checkpoint", { summary: `Added filters all/active/done (run ${run})`, done: taskId ? [taskId] : [], files: [{ path: gemPath, content: `# Filters\nall · active · done (run ${run})\n` }] });
  check("Gemini saves a checkpoint that ticks the task", !c2.r.isError && c2.s.done?.length === 1, c2.text.slice(0, 160));
  check("…and its commit descends from Claude's", (c2.s.parents ?? []).includes(c1.s.key));
  const s2 = await waitConfirmed([c2.s.key]);
  check("…confirmed on Arkiv", s2 >= 0, `${s2.toFixed(1)} s`);

  const back = await call(claude, "continue", {});
  check("Claude's next continue shows Gemini's work and the ticked task", back.text.includes(`Added filters all/active/done (run ${run})`) && new RegExp(`\\[x\\] t:[0-9a-f]{8} Add filters \\(run ${run}\\) · gem-research`).test(back.text));

  const cps = await getJson(`/api/brains/${brainId}/checkpoints`);
  const mine = cps.filter((c: any) => c.summary.includes(run));
  check("the website API lists both commits with the app that made them", mine.length === 2 && mine.every((c: any) => c.client && c.proofUrl), mine.map((c: any) => `${c.agent}@${c.client} ${c.proofUrl}`).join(" | "));
  const tasks = await getJson(`/api/brains/${brainId}/tasks`);
  check("…and the task as done by gem-research", tasks.some((t: any) => t.title === `Add filters (run ${run})` && t.status === "done" && t.doneBy === "gem-research"));
  console.log(`\nend to end ${((Date.now() - t1) / 1000).toFixed(1)} s after Claude's checkpoint`);

  await claude.close();
  await gem.close();
  console.log(`\n${failures ? `✗ ${failures} check(s) failed` : "✓ all checks passed"}  (run ${run})`);
  process.exit(failures ? 1 : 0);
}
main().catch((e) => { console.error(e instanceof Error ? e.message : e); process.exit(1); });
