// pnpm mcp:token <agent> [--days N] [--client claude-code|claude-ai|antigravity|gemini-cli|chatgpt]
// Issues an agent bearer token (signed with TOKEN_SIGNING_SECRET) and prints the connection snippet per client.
// The token is a credential for that agent: share it only with the person connecting that AI.
import { issueAgentToken } from "@supabrain/server/tokens";
import { snippets, type Client } from "@supabrain/server/pairing";
import { loadConfig, readEnv, requireEnv } from "@supabrain/shared/config";

const arg = (n: string) => { const i = process.argv.indexOf(`--${n}`); return i >= 0 ? process.argv[i + 1] : undefined; };

function main() {
  const config = loadConfig();
  const label = process.argv.slice(2).find((a, i, all) => !a.startsWith("--") && !(all[i - 1] ?? "").startsWith("--"));
  const labels = config.app.agents.map((a) => a.label);
  if (!label || !labels.includes(label)) throw new Error(`usage: pnpm mcp:token <agent> [--days N] [--client ...]; agents: ${labels.join(", ")}`);
  const days = Number(arg("days") ?? config.app.mcp.tokenTtlDays);
  const base = readEnv().PUBLIC_BASE_URL ?? `http://localhost:${config.app.server.port}`; // hardcode-ok: local fallback when PUBLIC_BASE_URL is unset
  const token = issueAgentToken({ label, ttlSec: Math.round(days * 86400), secret: requireEnv("TOKEN_SIGNING_SECRET") });
  const all = snippets({ baseUrl: base, token, agent: label });
  const only = arg("client") as Client | undefined;
  console.log(`agent ${label} · expires in ${days} day(s) · server ${base}\n`);
  for (const [client, text] of Object.entries(all)) if (!only || only === client) console.log(`── ${client}\n${text}\n`);
}
try { main(); } catch (e) { console.error(e instanceof Error ? e.message : e); process.exit(1); }
