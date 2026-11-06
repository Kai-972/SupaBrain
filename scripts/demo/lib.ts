// Shared setup for the demo fallbacks (scripts/demo/step-*.ts, Lane B). They connect to the RUNNING server's MCP
// endpoint as a real agent (token signed with TOKEN_SIGNING_SECRET), so every step goes through the same createPayments
// path a live model uses. Nothing is simulated: on-chain steps are real Sepolia transactions.
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { issueAgentToken } from "@supabrain/server/tokens";
import { findRootDir, loadConfig, readEnv, requireEnv } from "@supabrain/shared/config";
import { connectAsAgent } from "../../packages/payments/src/demo/steps";

export const opt = (name: string) => {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
};

/** Written by Lane A's seed (scripts/demo/seed.ts): the attacker addresses and memory keys of the seeded story. */
export interface DemoSeed {
  attackerAddress?: string;
  attackerPartnerAddress?: string;
  keys?: Record<string, string>;
}
export function readSeed(): DemoSeed {
  const f = join(findRootDir(), "config", "deployments", "demo-seed.json");
  return existsSync(f) ? (JSON.parse(readFileSync(f, "utf8")) as DemoSeed) : {};
}

export async function demoContext() {
  const config = loadConfig();
  const env = readEnv();
  const agent = opt("agent") ?? config.app.agents.find((a) => a.role === "lead")?.label;
  if (!agent) throw new Error("no lead agent in config/app.json");
  const base = (opt("server") ?? env.PUBLIC_BASE_URL ?? `http://localhost:${config.app.server.port}`).replace(/\/+$/, ""); // hardcode-ok: local fallback when PUBLIC_BASE_URL is unset
  const token = issueAgentToken({ label: agent, ttlSec: 900, secret: requireEnv("TOKEN_SIGNING_SECRET") });
  console.log(`demo step as ${agent} → ${base}/mcp (same pay tool and createPayments path as a live model)\n`);
  const client = await connectAsAgent({ url: `${base}/mcp`, token });
  const who = await client.callTool({ name: "whoami", arguments: {} });
  console.log(((who.content as { text?: string }[]) ?? []).map((x) => x.text).join(" "), "\n");
  return { config, client, seed: readSeed(), agent };
}
