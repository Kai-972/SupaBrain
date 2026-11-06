// pnpm ens:brain-rules <ai-ens-name> [--status active|paused] [--scope "*"|<path/>] [--write-daily N] [--role lead|worker|observer] [--yes]
// v2 B3: change an AI's rules on ENS the way the server does (packages/ens/src/rules.ts), signed by the TEAM wallet.
// No rule flags: prints the current rules. Without --yes: prints what would change and sends nothing.
import { createRulesWriter, readBrainsConfig, ruleKeys, validateRules, type RulesPatch } from "@supabrain/ens";
import { findRootDir, loadConfig } from "@supabrain/shared/config";
import { accountFromEnv, sepoliaClient, txUrl, type Hex } from "../lib/chain";
import { hasFlag, positional } from "../lib/ensctx";

const flag = (name: string) => {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
};

async function main() {
  const name = positional()[0];
  if (!name) throw new Error("usage: pnpm ens:brain-rules <ai-ens-name> [--status ..] [--scope ..] [--write-daily N] [--role ..] [--yes]");
  const config = loadConfig();
  const keys = ruleKeys(config.app.ens.textKeys, readBrainsConfig(findRootDir()));
  const { chain, rpcUrl } = await sepoliaClient(config);
  const { http } = await import("viem");
  const team = accountFromEnv("TEAM_PRIVATE_KEY");
  const writer = createRulesWriter({ keys, parentName: `${config.app.ens.teamLabel}.eth`, txUrl: (h: Hex) => txUrl(config, h), account: team, chain, transport: http(rpcUrl) });

  const patch: RulesPatch = {};
  if (flag("status")) patch.status = flag("status") as RulesPatch["status"];
  if (flag("scope")) patch.scope = flag("scope");
  if (flag("write-daily")) patch.writeDaily = flag("write-daily");
  if (flag("role")) patch.role = flag("role") as RulesPatch["role"];

  const now = await writer.readRules(name);
  console.log(`${name} now: ${Object.entries(now).map(([k, v]) => `${k}=${v ?? "∅"}`).join(" ")}`);
  if (!Object.keys(patch).length) return;
  const want = validateRules(patch);
  const diff = Object.entries(want).filter(([k, v]) => now[k as keyof typeof now] !== v);
  if (!diff.length) { console.log("nothing to change."); return; }
  console.log(`change: ${diff.map(([k, v]) => `${k} ${now[k as keyof typeof now] ?? "∅"} → ${v}`).join(", ")}  (from team wallet ${team.address}, one multicall on the AI's resolver)`);
  if (!hasFlag("yes")) { console.log("nothing sent. Re-run with --yes to broadcast."); return; }
  const r = await writer.setRules(name, patch);
  console.log(`✓ ${r.txUrl}`);
  const after = await writer.readRules(name);
  console.log(`${name} after: ${Object.entries(after).map(([k, v]) => `${k}=${v ?? "∅"}`).join(" ")}`);
}

main().catch((e) => { console.error(e instanceof Error ? e.message.replace(/https?:\/\/\S+/g, (u) => (u.includes("etherscan") ? u : "<rpc>")) : e); process.exit(1); });
