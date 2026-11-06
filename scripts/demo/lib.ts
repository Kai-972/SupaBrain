// Shared setup for the demo fallbacks (scripts/demo/step-*.ts, Lane B). They connect to the RUNNING server's MCP
// endpoint as a real agent (token signed with TOKEN_SIGNING_SECRET), so every step goes through the same createPayments
// path a live model uses. Nothing is simulated: on-chain steps are real Sepolia transactions.
import { issueAgentToken } from "@supabrain/server/tokens";
import { findRootDir, loadConfig, readEnv, requireEnv } from "@supabrain/shared/config";
import { connectAsAgent } from "../../packages/payments/src/demo/steps";
import { readSeedFor } from "./seed-file";

export const opt = (name: string) => {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
};

export type { DemoSeed } from "./seed-file";

export async function demoContext() {
  const config = loadConfig();
  const env = readEnv();
  const agent = opt("agent") ?? config.app.agents.find((a) => a.role === "lead")?.label;
  if (!agent) throw new Error("no lead agent in config/app.json");
  const base = (opt("server") ?? env.PUBLIC_BASE_URL ?? `http://localhost:${config.app.server.port}`).replace(/\/+$/, ""); // hardcode-ok: local fallback when PUBLIC_BASE_URL is unset
  const token = issueAgentToken({ label: agent, ttlSec: 900, secret: requireEnv("TOKEN_SIGNING_SECRET") });
  console.log(`demo step as ${agent} → ${base}/mcp (same pay tool and createPayments path as a live model)\n`);
  const health = (await (await fetch(`${base}/healthz`)).json()) as { app: string };
  const seed = readSeedFor(findRootDir(), health.app); // this server's namespace only (QA D2)
  console.log(`namespace ${health.app} · seed ${seed.attackerAddress ? "found" : "not found (pass --payee/--cites)"}`);
  const client = await connectAsAgent({ url: `${base}/mcp`, token });
  const who = await client.callTool({ name: "whoami", arguments: {} });
  console.log(((who.content as { text?: string }[]) ?? []).map((x) => x.text).join(" "), "\n");
  return { config, client, seed, agent };
}
