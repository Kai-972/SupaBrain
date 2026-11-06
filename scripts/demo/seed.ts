// pnpm demo:seed [--base <url>]   Seed the "bank details changed" story (docs/lanes/C-UI.md §5) into the RUNNING server's
// namespace through REAL MCP calls as each agent and the owner's dashboard API, so the lineage on Arkiv is real.
// Content comes from config/demo-scenario.json; attacker addresses are fresh burners. Writes
// config/deployments/demo-seed.json (memory keys by fixture name + attacker addresses) for Lane B's demo:step fallbacks.
// Run within 2 days of judging (memories fade), against a fresh namespace (SUPABRAIN_APP_NAMESPACE on the server).
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { issueAgentToken } from "@supabrain/server/tokens";
import { findRootDir, loadConfig, readEnv, requireEnv } from "@supabrain/shared/config";

const arg = (n: string) => { const i = process.argv.indexOf(`--${n}`); return i >= 0 ? process.argv[i + 1] : undefined; };
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
type Result = { isError?: boolean; content?: { text?: string }[]; structuredContent?: Record<string, unknown> };

async function main() {
  const config = loadConfig();
  const s = config.demo as unknown as {
    vendor: string; budget: { text: string; folder: string }; invoice: { text: string; folder: string };
    email: { sourceId: string; body: string; followUp: string };
  };
  const base = (arg("base") ?? readEnv().PUBLIC_BASE_URL ?? `http://localhost:${config.app.server.port}`).replace(/\/+$/, ""); // hardcode-ok: local fallback when PUBLIC_BASE_URL is unset
  const secret = requireEnv("TOKEN_SIGNING_SECRET");
  const vendorEns = `${s.vendor}.${config.app.ens.teamLabel}.eth`;
  const attacker = privateKeyToAccount(generatePrivateKey()).address;
  const partner = privateKeyToAccount(generatePrivateKey()).address;
  const fill = (t: string) => t.replace("{attackerAddress}", attacker).replace("{attackerPartnerAddress}", partner);
  const health = (await (await fetch(`${base}/healthz`)).json()) as { app: string; team: string };
  console.log(`seeding ${health.app}/${health.team} via ${base}\n`);

  const login = await fetch(`${base}/api/admin/login`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ passphrase: requireEnv("DASHBOARD_ADMIN_PASSPHRASE") }) });
  if (login.status !== 200) throw new Error(`owner login failed (${login.status})`);
  const cookie = login.headers.get("set-cookie")?.split(";")[0] ?? "";
  const human = async (body: Record<string, unknown>) => {
    const r = await fetch(`${base}/api/memory/human`, { method: "POST", headers: { "content-type": "application/json", cookie }, body: JSON.stringify(body) });
    const j = (await r.json()) as { key?: string; message?: string };
    if (!j.key) throw new Error(`add context failed: ${j.message}`);
    return j.key;
  };
  const agents: Record<string, Client> = {};
  for (const label of ["lead-claude", "gem-research", "gpt-writer"]) {
    const c = new Client({ name: `seed-${label}`, version: "1.0.0" });
    await c.connect(new StreamableHTTPClientTransport(new URL(`${base}/mcp`), { requestInit: { headers: { Authorization: `Bearer ${issueAgentToken({ label, ttlSec: 3600, secret })}` } } }));
    agents[label] = c;
  }
  const call = async (label: string, name: string, args: Record<string, unknown>) => {
    const r = (await agents[label]!.callTool({ name, arguments: args })) as Result;
    if (r.isError) throw new Error(`${label} ${name} failed: ${r.content?.[0]?.text}`);
    return r.structuredContent ?? {};
  };
  const remember = async (label: string, args: Record<string, unknown>) => String((await call(label, "remember", args)).key);
  const keys: Record<string, string> = {};
  const step = (name: string, key: string, what: string) => { keys[name] = key; console.log(`  ${name.padEnd(3)} ${key}  ${what}`); };

  step("H1", await human({ text: s.invoice.text, kind: "plan", folder: s.invoice.folder, subject: vendorEns }), "owner: the invoice to pay (trust 3)");
  step("H2", await human({ text: s.budget.text, kind: "decision", folder: s.budget.folder }), "owner: the budget (trust 3)");
  step("E1", await remember("gem-research", { text: fill(s.email.body), kind: "evidence", folder: "research", subject: vendorEns, address: attacker, source: { type: "email", id: s.email.sourceId } }), "Gemini stores the email (trust 1)");
  await call("gem-research", "recall", { query: "payout wallet changed" });
  step("M1", await remember("gem-research", { text: `${s.vendor}'s new payout address is ${attacker}`, kind: "address", folder: "research", subject: vendorEns, address: attacker, cites: [keys.E1] }), "Gemini: the new address");
  await call("lead-claude", "recall", { query: "invoice payout address logo" });
  step("M2", await remember("lead-claude", { text: `Pay invoice #12 to ${attacker}`, kind: "plan", folder: "finance", cites: [keys.H1, keys.M1] }), "Claude plans the payment on it");
  await call("gpt-writer", "recall", { query: "pay invoice" });
  step("M3", await remember("gpt-writer", { text: "Draft: confirming payment to your new wallet", kind: "plan", folder: "comms", cites: [keys.M2] }), "GPT drafts the confirmation");
  await call("lead-claude", "recall", { query: "tools budget" });
  step("M4", await remember("lead-claude", { text: "Keep tools spend under budget", kind: "decision", folder: "finance", cites: [keys.H2] }), "Claude: a good decision (stays green)");
  step("E2", await remember("lead-claude", { text: fill(s.email.followUp), kind: "evidence", folder: "finance", address: partner, source: { type: "email", id: s.email.sourceId } }), "the follow-up email");
  await call("lead-claude", "recall", { query: "partner Pixel Labs" });
  step("M5", await remember("lead-claude", { text: `Pixel Labs address ${partner}`, kind: "address", folder: "finance", address: partner, cites: [keys.E2] }), "Claude: the partner's address");

  const want = Object.values(keys);
  const t0 = Date.now();
  for (; Date.now() - t0 < 120_000; await sleep(2000)) {
    const g = (await (await fetch(`${base}/api/graph`)).json()) as { nodes: { key: string; pending?: boolean }[] };
    if (want.every((k) => g.nodes.some((n) => n.key === k && !n.pending))) break;
  }
  console.log(`\nall ${want.length} memories confirmed on Arkiv in ${((Date.now() - t0) / 1000).toFixed(1)} s`);
  for (const c of Object.values(agents)) await c.close();

  const out = { namespace: health.app, team: health.team, server: base, seededAt: new Date().toISOString(), vendorEns, source: s.email.sourceId, attackerAddress: attacker, attackerPartnerAddress: partner, keys };
  writeFileSync(join(findRootDir(), "config", "deployments", "demo-seed.json"), JSON.stringify(out, null, 2) + "\n");
  console.log("wrote config/deployments/demo-seed.json (for pnpm demo:step blocked|approve)");
}
main().catch((e) => { console.error(e instanceof Error ? e.message : e); process.exit(1); });
