// pnpm e2e:memory [--base <url>]   Live end-to-end check of the memory core through REAL MCP calls as each agent
// (the same path Claude Code / Claude.ai / Antigravity use), against a running server. Writes real Arkiv entities into
// the server's namespace, so point the server at a -dev namespace (SUPABRAIN_APP_NAMESPACE) for testing.
//   1. whoami as each agent (live ENS)          4. GPT recalls, drafts in comms citing Claude's plan
//   2. Gemini stores an email as evidence       5. every write lands on Arkiv (confirmed + proof link)
//   3. Claude recalls it and plans on it        6. explain shows the lineage; trust = min; roots carried
//                                               7. a worker writing outside its ENS folder is refused
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { issueAgentToken } from "@supabrain/server/tokens";
import { loadConfig, readEnv, requireEnv } from "@supabrain/shared/config";

const arg = (n: string) => { const i = process.argv.indexOf(`--${n}`); return i >= 0 ? process.argv[i + 1] : undefined; };
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
let failures = 0;
const check = (name: string, ok: boolean, detail = "") => { if (!ok) failures++; console.log(`${ok ? "✓" : "✗"} ${name}${detail ? `  ${detail}` : ""}`); };
type Result = { isError?: boolean; content?: { text?: string }[]; structuredContent?: Record<string, unknown> };

async function main() {
  const config = loadConfig();
  const base = arg("base") ?? readEnv().PUBLIC_BASE_URL ?? `http://localhost:${config.app.server.port}`; // hardcode-ok: local fallback when PUBLIC_BASE_URL is unset
  const secret = requireEnv("TOKEN_SIGNING_SECRET");
  const run = Date.now().toString(36);
  const connect = async (label: string) => {
    const c = new Client({ name: `e2e-${label}`, version: "1.0.0" });
    await c.connect(new StreamableHTTPClientTransport(new URL(`${base}/mcp`), { requestInit: { headers: { Authorization: `Bearer ${issueAgentToken({ label, ttlSec: 3600, secret })}` } } }));
    return c;
  };
  const call = async (c: Client, name: string, args: Record<string, unknown> = {}) => {
    const t = Date.now();
    const r = (await c.callTool({ name, arguments: args })) as Result;
    return { r, ms: Date.now() - t, text: r.content?.[0]?.text ?? "", s: r.structuredContent ?? {} };
  };

  console.log(`server ${base} · run ${run}\n`);
  const health = (await (await fetch(`${base}/healthz`)).json()) as { app: string };
  console.log(`namespace ${health.app}\n`);
  const claude = await connect("lead-claude");
  const gemini = await connect("gem-research");
  const gpt = await connect("gpt-writer");

  for (const [label, c] of [["lead-claude", claude], ["gem-research", gemini], ["gpt-writer", gpt]] as const) {
    const w = await call(c, "whoami");
    check(`whoami ${label}`, !w.r.isError && w.s.agent === label, `${w.s.ens} scope=${w.s.scope} (${w.ms} ms)`);
  }

  const source = `email:acme-${run}`;
  const attacker = privateKeyToAccount(generatePrivateKey()).address; // a fresh burner, as in config/demo-scenario.json
  const ev = await call(gemini, "remember", { text: `Acme Studio email (run ${run}): our payout wallet changed to ${attacker}`, kind: "evidence", folder: "research", subject: "acme.supabrain.eth", source: { type: "email", id: source } });
  check("Gemini stores the email as evidence (trust 1, rooted in the email)", ev.s.trust === 1 && (ev.s.roots as string[])?.[0] === source, `${ev.s.key} (${ev.ms} ms)`);

  const rc = await call(claude, "recall", { query: `acme payout wallet ${run}` });
  check("Claude recalls Gemini's evidence", rc.text.includes(String(ev.s.key)), `(${rc.ms} ms)`);
  const plan = await call(claude, "remember", { text: `Plan (run ${run}): pay Acme invoice #12 to the new wallet from the email`, kind: "plan", folder: "finance", subject: "acme.supabrain.eth", cites: [ev.s.key] });
  check("Claude's plan inherits trust 1 and the email root", plan.s.trust === 1 && (plan.s.parents as string[])?.[0] === ev.s.key && (plan.s.roots as string[])?.includes(source), `${plan.s.key} (${plan.ms} ms)`);

  const rg = await call(gpt, "recall", { query: `acme invoice plan ${run}` });
  check("GPT recalls Claude's plan", rg.text.includes(String(plan.s.key)));
  const draft = await call(gpt, "remember", { text: `Draft email (run ${run}): confirming payment of invoice #12 to your new wallet`, kind: "plan", folder: "comms", cites: [plan.s.key] });
  check("GPT drafts in comms, lineage carried across three vendors", draft.s.trust === 1 && (draft.s.roots as string[])?.includes(source), `${draft.s.key}`);

  const denied = await call(gemini, "remember", { text: "Pay Acme now", kind: "plan", folder: "finance" });
  check("Gemini (scope research) cannot write to finance", !!denied.r.isError && denied.text.startsWith("SCOPE"), denied.text.slice(0, 90));

  const keys = [ev.s.key, plan.s.key, draft.s.key] as string[];
  const t0 = Date.now();
  let confirmed: { key: string; proofUrl?: string; pending?: boolean; creator?: string; agent: string }[] = [];
  while (Date.now() - t0 < 120_000) {
    const g = (await (await fetch(`${base}/api/graph`)).json()) as { nodes: typeof confirmed };
    confirmed = g.nodes.filter((n) => keys.includes(n.key));
    if (confirmed.length === 3 && confirmed.every((n) => !n.pending && n.proofUrl)) break;
    await sleep(2000);
  }
  check("all three writes confirmed on Arkiv", confirmed.length === 3 && confirmed.every((n) => !n.pending), `in ${((Date.now() - t0) / 1000).toFixed(1)} s after the last write`);
  for (const n of confirmed) console.log(`    ${n.agent.padEnd(13)} ${n.key}  ${n.proofUrl}`);

  const ex = await call(claude, "explain", { key: draft.s.key });
  check("explain walks GPT → Claude → Gemini → email", /gpt-writer.*<-.*lead-claude.*<-.*gem-research/s.test(ex.text) && ex.text.includes(source));
  const mem = (await (await fetch(`${base}/api/memory/${ev.s.key}`)).json()) as { readers: string[] };
  check("read log: Claude read the email evidence", mem.readers.includes("lead-claude"), `readers=${mem.readers.join(",")}`);

  for (const c of [claude, gemini, gpt]) await c.close();
  console.log(`\n${failures ? `✗ ${failures} check(s) failed` : "✓ all checks passed"}`);
  process.exit(failures ? 1 : 0);
}
main().catch((e) => { console.error(e instanceof Error ? e.message : e); process.exit(1); });
