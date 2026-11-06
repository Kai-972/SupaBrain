// pnpm arkiv:query [--spike] [--folder <name>]   The README's runnable Arkiv query: live memories for this app+team,
// written by known wallets only (anyone can write entities with our attributes, so we always filter by $creator).
// Read-only. Sorted on the client (ORDER BY is not relied on).
import { decodeBody, Memory } from "@supabrain/arkiv";
import { and, eq } from "@arkiv-network/sdk/query";
import { loadConfig, requireEnv } from "@supabrain/shared/config";
import { connectArkiv } from "@supabrain/arkiv";
import type { Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { agentKeyEnvName } from "@supabrain/shared";
import { flagValue, hasFlag } from "../lib/arkivctx";

const val = (x: unknown): unknown => (x && typeof x === "object" && "value" in (x as object) ? (x as { value: unknown }).value : x);

async function main() {
  const config = loadConfig();
  const { arkiv, rpc } = await connectArkiv({ accessKey: requireEnv("ARKIV_ACCESS_KEY"), expectedChainId: config.networks.rabdi.chainId });
  const app = config.app.appNamespace + (hasFlag("spike") ? "-spike" : "");
  const folder = flagValue("folder");
  const creators = config.app.agents.map((a) => privateKeyToAccount(requireEnv(agentKeyEnvName(a.label)) as Hex).address);
  const head = await rpc.getBlockNumber();
  const secondsPerBlock = (await arkiv.getBlockTiming()).blockDuration;

  const rows: Record<string, unknown>[] = [];
  for (const creator of creators) {
    const page = await arkiv
      .select({ $key: true, $creator: true, $owner: true, $expiresAt: true, kind: true, trust: true, agent: true, folder: true, seq: true, body: true })
      .from(Memory)
      .where(folder ? and(eq("app", app), eq("team", config.app.team.id), eq("folder", folder)) : and(eq("app", app), eq("team", config.app.team.id)))
      .createdBy(creator)
      .limit(100)
      .fetch();
    rows.push(...(page.entities as unknown as Record<string, unknown>[]));
  }
  rows.sort((a, b) => Number(val(a.seq)) - Number(val(b.seq)));

  console.log(`app "${app}" · team "${config.app.team.id}" · ${rows.length} live memories · head block ${head}`);
  for (const r of rows) {
    const left = Number(BigInt(val(r.$expiresAt) as bigint) - head) * secondsPerBlock;
    const text = (decodeBody(val(r.body) as Uint8Array) as { text?: string }).text ?? "";
    console.log(`#${val(r.seq)} ${String(val(r.kind)).padEnd(8)} trust ${val(r.trust)} ${String(val(r.agent)).padEnd(13)} ${String(val(r.$key)).slice(0, 10)}… expires in ${(left / 3600).toFixed(1)} h · ${text}`);
  }
}
main().catch((e) => { console.error(e instanceof Error ? e.message : e); process.exit(1); });
