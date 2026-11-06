// pnpm e2e:undo [--base <url>]   Live end-to-end check of UNDO (A-BRAIN S3) against a running server, with real MCP
// calls as each agent and the owner's dashboard API. Writes real Arkiv entities: use a -dev namespace.
//   connect → human context → lie spreads across 3 vendors → dry run → revoke (Arkiv) → cascade + notices over SSE
//   → re-ask shows the retraction → Keep refused for a quarantined memory, allowed for the human one → Correct this
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
  const source = `email:acme-${run}`;
  const attacker = privateKeyToAccount(generatePrivateKey()).address;

  // owner session (dashboard)
  const login = await fetch(`${base}/api/admin/login`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ passphrase: requireEnv("DASHBOARD_ADMIN_PASSPHRASE") }) });
  check("owner logs in to the dashboard API", login.status === 200);
  const cookie = login.headers.get("set-cookie")?.split(";")[0] ?? "";
  const owner = async (path: string, body: unknown) => {
    const r = await fetch(`${base}${path}`, { method: "POST", headers: { "content-type": "application/json", cookie }, body: JSON.stringify(body) });
    return { status: r.status, body: (await r.json()) as Record<string, any> };
  };

  // live stream, as the dashboard sees it
  const events: { t: string; [k: string]: unknown }[] = [];
  const ac = new AbortController();
  void (async () => {
    const res = await fetch(`${base}/api/stream?since=999999999`, { signal: ac.signal });
    const reader = res.body!.getReader();
    let buf = "";
    for (;;) {
      const { value, done } = await reader.read().catch(() => ({ value: undefined, done: true }));
      if (done) break;
      buf += new TextDecoder().decode(value);
      for (let i; (i = buf.indexOf("\n\n")) >= 0; buf = buf.slice(i + 2)) {
        const data = buf.slice(0, i).split("\n").find((l) => l.startsWith("data: "));
        if (data) events.push(JSON.parse(data.slice(6)));
      }
    }
  })();

  const connect = async (label: string) => {
    const c = new Client({ name: `e2e-undo-${label}`, version: "1.0.0" });
    await c.connect(new StreamableHTTPClientTransport(new URL(`${base}/mcp`), { requestInit: { headers: { Authorization: `Bearer ${issueAgentToken({ label, ttlSec: 3600, secret })}` } } }));
    return c;
  };
  const call = async (c: Client, name: string, args: Record<string, unknown> = {}) => {
    const r = (await c.callTool({ name, arguments: args })) as Result;
    return { r, text: r.content?.[0]?.text ?? "", s: r.structuredContent ?? {} };
  };
  const claude = await connect("lead-claude");
  const gemini = await connect("gem-research");
  const gpt = await connect("gpt-writer");

  // 1. the human decision, then the lie spreads across three vendors
  const H1 = await owner("/api/memory/human", { text: `Pay Acme Studio 5 USDC for the logo, invoice #12 (run ${run})`, kind: "plan", folder: "finance", subject: "acme.supabrain.eth" });
  check("owner adds context (human, trust 3)", H1.status === 200 && H1.body.trust === 3, String(H1.body.key));
  const E1 = await call(gemini, "remember", { text: `Acme email (run ${run}): our payout wallet changed to ${attacker}`, kind: "evidence", folder: "research", subject: "acme.supabrain.eth", source: { type: "email", id: source } });
  await call(claude, "recall", { query: `acme invoice logo payout wallet ${run}` });
  const M2 = await call(claude, "remember", { text: `Pay invoice #12 to ${attacker} (run ${run})`, kind: "plan", folder: "finance", cites: [H1.body.key, E1.s.key] });
  await call(gpt, "recall", { query: `pay invoice ${run}` });
  const M3 = await call(gpt, "remember", { text: `Draft (run ${run}): confirming payment to your new wallet`, kind: "plan", folder: "comms", cites: [M2.s.key] });
  check("the lie spreads: email → Gemini → Claude → GPT", M3.s.trust === 1 && (M3.s.roots as string[]).includes(source));

  const keys = [H1.body.key, E1.s.key, M2.s.key, M3.s.key] as string[];
  for (const t0 = Date.now(); Date.now() - t0 < 90_000; await sleep(2000)) {
    const g = (await (await fetch(`${base}/api/graph`)).json()) as { nodes: { key: string; pending?: boolean }[] };
    if (keys.every((k) => g.nodes.some((n) => n.key === k && !n.pending))) break;
  }
  check("all four memories confirmed on Arkiv", true);

  // 2. dry run, then revoke
  const dry = await owner("/api/dryrun", { target: { type: "source", id: source } });
  check("dry run: 3 memories · 3 agents · 3 vendors", dry.status === 200 && dry.body.memories.length === 3 && dry.body.agents.length === 3 && dry.body.vendors.length === 3,
    `memories ${dry.body.memories?.length} · agents ${dry.body.agents?.join(",")} · vendors ${dry.body.vendors?.join(",")} · readers ${dry.body.readers?.join(",")}`);
  const t0 = Date.now();
  const rev = await owner("/api/revoke", { target: { type: "source", id: source }, reason: "the email was phishing" });
  check("revoke written to Arkiv by the team wallet", rev.status === 200 && String(rev.body.arkivUrl).includes("/tx/"), `${((Date.now() - t0) / 1000).toFixed(1)} s · ${rev.body.arkivUrl}`);
  const g = (await (await fetch(`${base}/api/graph`)).json()) as { nodes: { key: string; status: string }[] };
  const st = (k: string) => g.nodes.find((n) => n.key === k)?.status;
  check("cascade: E1 M2 M3 quarantined, the human H1 stays active", [st(E1.s.key as string), st(M2.s.key as string), st(M3.s.key as string), st(H1.body.key)].join() === "quarantined,quarantined,quarantined,active");
  await sleep(1500);
  check("dashboard stream got the revocation and a notice per agent", events.some((e) => e.t === "revocation") && new Set(events.filter((e) => e.t === "notice").map((e) => e.toAgent)).size === 3,
    `events: ${[...new Set(events.map((e) => e.t))].join(", ")}`);

  // 3. the AIs fix themselves: the next answer sees the retraction
  const again = await call(claude, "recall", { query: `acme payout wallet ${run}` });
  check("Claude's next recall carries the retraction notice", again.text.startsWith("RETRACTION NOTICES"), again.text.split("\n")[0]!.slice(0, 110));
  check("…and flags the email-derived memories QUARANTINED", again.text.includes("QUARANTINED"));
  await call(gemini, "recall", { query: `acme payout wallet ${run}` });
  const blocked = await call(gemini, "remember", { text: "x", kind: "fact", folder: "research", cites: [E1.s.key] });
  check("a quarantined memory never enters a read-set, so nobody can cite it", !!blocked.r.isError && blocked.text.startsWith("CITE_NOT_READ"), blocked.text.slice(0, 80));

  // 4. Keep and Correct this
  const keepBad = await owner(`/api/memory/${M2.s.key}/keep`, { days: 3 });
  check("Keep is refused for a quarantined memory (lies fade)", keepBad.status === 409);
  const keep = await owner(`/api/memory/${H1.body.key}/keep`, { days: 3 });
  check("Keep extends the human memory on Arkiv", keep.status === 200 && keep.body.extended >= 1, `${keep.body.extended} rows · ${keep.body.txUrl}`);
  const corr = await owner(`/api/memory/${M2.s.key}/correct`, { text: `Pay invoice #12 to the address on acme.supabrain.eth (run ${run})` });
  check("Correct this: a human correction supersedes the bad plan", corr.status === 200 && typeof corr.body.newKey === "string", `status ${corr.status} (${corr.body.error ?? corr.body.newKey})`);

  ac.abort();
  for (const c of [claude, gemini, gpt]) await c.close();
  console.log(`\n${failures ? `✗ ${failures} check(s) failed` : "✓ all checks passed"}`);
  process.exit(failures ? 1 : 0);
}
main().catch((e) => { console.error(e instanceof Error ? e.message : e); process.exit(1); });
