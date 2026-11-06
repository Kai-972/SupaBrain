// pnpm arkiv:reach [--apps a,b,c]   READ-ONLY. Live counts of Supabrain entities on Arkiv Rabdi, by signing wallet
// ($creator) and by entity type, for each app namespace, for arkiv/reach.md. Only entities created by our known wallets
// (config/deployments/arkiv.rabdi.json) count: anyone can write entities with our attributes, so we always filter.
// Expired entities are gone from Arkiv and are not counted; the numbers are "live right now".
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { and, eq } from "@arkiv-network/sdk/query";
import { connectArkiv, Edge, Memory, Notice, Payment, Revocation, Taint } from "@supabrain/arkiv";
import { findRootDir, loadConfig, requireEnv } from "@supabrain/shared/config";
import type { Hex } from "viem";
import { flagValue } from "../lib/arkivctx";

const PAGE = 100;
// The SDK types each query by its schema; this counter runs one query shape over six schemas, so it uses a loose view.
type Query = { from(s: unknown): { where(e: unknown): { createdBy(c: Hex): { limit(n: number): { offset(n: number): { fetch(): Promise<{ entities: unknown[]; skipped: number }> } } } } } };
const SCHEMAS = { memory: Memory, edge: Edge, taint: Taint, revocation: Revocation, notice: Notice, payment: Payment } as const;

async function main() {
  const config = loadConfig();
  const dep = JSON.parse(readFileSync(join(findRootDir(), "config", "deployments", "arkiv.rabdi.json"), "utf8")) as { knownCreators: Record<string, Hex> };
  const base = config.app.appNamespace;
  const apps = (flagValue("apps")?.split(",") ?? [base, `${base}-dev`, `${base}-b`]).map((a) => a.trim()).filter(Boolean);
  const { arkiv } = await connectArkiv({ accessKey: requireEnv("ARKIV_ACCESS_KEY"), expectedChainId: config.networks.rabdi.chainId });
  const team = config.app.team.id;

  const count = async (schema: (typeof SCHEMAS)[keyof typeof SCHEMAS], app: string, creator: Hex): Promise<number> => {
    let n = 0;
    for (let offset = 0; ; ) {
      const page = await (arkiv.select({ $key: true }) as unknown as Query).from(schema).where(and(eq("app", app), eq("team", team))).createdBy(creator).limit(PAGE).offset(offset).fetch();
      n += page.entities.length;
      const covered = page.entities.length + page.skipped;
      if (covered < PAGE) return n;
      offset += covered;
    }
  };

  const grand: Record<string, number> = {};
  console.log(`Arkiv Rabdi (chain ${config.networks.rabdi.chainId}) · team "${team}" · live entities by $creator\n`);
  for (const app of apps) {
    const rows: { who: string; wallet: Hex; counts: Record<string, number>; total: number }[] = [];
    for (const [who, wallet] of Object.entries(dep.knownCreators)) {
      const counts: Record<string, number> = {};
      for (const [name, schema] of Object.entries(SCHEMAS)) counts[name] = await count(schema, app, wallet);
      const total = Object.values(counts).reduce((a, b) => a + b, 0);
      rows.push({ who, wallet, counts, total });
    }
    const appTotal = rows.reduce((a, r) => a + r.total, 0);
    grand[app] = appTotal;
    console.log(`## ${app}: ${appTotal} live entities`);
    console.log(`| signer ($creator) | wallet | ${Object.keys(SCHEMAS).join(" | ")} | total |`);
    console.log(`|---|---|${Object.keys(SCHEMAS).map(() => "---:").join("|")}|---:|`);
    for (const r of rows) console.log(`| ${r.who} | \`${r.wallet}\` | ${Object.values(r.counts).join(" | ")} | ${r.total} |`);
    console.log("");
  }
  console.log(`queried at ${new Date().toISOString()} · totals: ${Object.entries(grand).map(([a, n]) => `${a}=${n}`).join(", ")}`);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message.replace(/https?:\/\/\S+/g, "<rpc>") : e);
  process.exit(1);
});
