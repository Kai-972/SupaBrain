// pnpm verify:memory <memoryKey> [--app <namespace>]   READ-ONLY. Anyone can run this: it proves who wrote a Supabrain
// memory and what it was built on using ONLY Arkiv (Rabdi) and ENSv2 (Sepolia). No Supabrain server is involved.
// For each hop: $creator must be the wallet that owns <agent>.<team>.eth on ENS now (owner memories: the team wallet),
// $owner must be the team wallet, and any team-signed revocation covering it is listed. The entity query deliberately
// does NOT filter by creator, so a forged entity with our attributes is caught, not hidden.
// Needs ARKIV_ACCESS_KEY (the keyless Rabdi RPC rate-limits with 429s) and SEPOLIA_RPC_URL; no private keys.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { and, eq } from "@arkiv-network/sdk/query";
import { key as keyValue } from "@arkiv-network/sdk/schema";
import { connectArkiv, decodeBody, Memory, Revocation } from "@supabrain/arkiv";
import { labelhashId } from "@supabrain/ens";
import { userRegistryAbi } from "@supabrain/ens/abis";
import { findRootDir, loadConfig, readEnv, requireEnv } from "@supabrain/shared/config";
import { sepoliaClient } from "../lib/chain";
import { flagValue } from "../lib/arkivctx";
import { verifyLineage, type EntityView, type Hex, type RevocationView } from "./verify-lib";

const val = (x: unknown): unknown => (x && typeof x === "object" && "value" in (x as object) ? (x as { value: unknown }).value : x);
type Row = Record<string, unknown>;
// one loose query shape over two schemas (the SDK types each query by its schema)
type Query = { from(s: unknown): { where(e: unknown): { createdBy(c: Hex): Fetchable } & Fetchable } };
type Fetchable = { limit(n: number): { offset(n: number): { fetch(): Promise<{ entities: unknown[]; skipped: number }> }; fetch(): Promise<{ entities: unknown[]; skipped: number }> } };

async function main() {
  const key = process.argv.slice(2).find((a, i, all) => !a.startsWith("--") && !(all[i - 1] ?? "").startsWith("--"));
  if (!key || !/^0x[0-9a-fA-F]{64}$/.test(key)) throw new Error("usage: pnpm verify:memory <0x…64-hex memory key> [--app <namespace>]");
  const config = loadConfig();
  const app = flagValue("app") ?? readEnv().SUPABRAIN_APP_NAMESPACE ?? config.app.appNamespace;
  const team = config.app.team.id;
  const teamLabel = config.app.ens.teamLabel;
  const root = findRootDir();
  const arkivDep = JSON.parse(readFileSync(join(root, "config", "deployments", "arkiv.rabdi.json"), "utf8")) as { knownCreators: Record<string, Hex> };
  const teamWallet = arkivDep.knownCreators.team;
  if (!teamWallet) throw new Error("config/deployments/arkiv.rabdi.json has no team wallet");
  const registry = config.deployments.ens?.teamRegistry?.address as Hex | undefined;
  if (!registry) throw new Error("config/deployments/ens.sepolia.json has no team registry");

  const { arkiv } = await connectArkiv({ accessKey: requireEnv("ARKIV_ACCESS_KEY"), expectedChainId: config.networks.rabdi.chainId });
  const { client: sepolia } = await sepoliaClient(config);
  const qMemory = () => arkiv.select({ $key: true, $creator: true, $owner: true, $expiresAt: true, agent: true, kind: true, trust: true, body: true }) as unknown as Query;
  const qRevocation = () => arkiv.select({ $key: true, targetType: true, target: true }) as unknown as Query;

  const fetchEntity = async (k: string): Promise<EntityView | undefined> => {
    const page = await qMemory().from(Memory).where(and(eq("$key", keyValue(k as Hex)), eq("app", app), eq("team", team))).limit(1).fetch();
    const row = page.entities[0] as Row | undefined;
    if (!row) return undefined;
    let body: { parents?: string[]; roots?: string[] } = {};
    try { body = decodeBody(val(row.body) as Uint8Array) as typeof body; } catch { /* not ours: no lineage to follow */ }
    return {
      key: String(val(row.$key)), creator: String(val(row.$creator)) as Hex, owner: String(val(row.$owner)) as Hex,
      agent: String(val(row.agent)), kind: String(val(row.kind)), trust: Number(val(row.trust)),
      parents: body.parents ?? [], roots: body.roots ?? [], expiresAtBlock: BigInt(val(row.$expiresAt) as bigint),
    };
  };
  const ensCache = new Map<string, Hex | null>();
  const ensOwner = async (agent: string): Promise<Hex | null> => {
    if (!ensCache.has(agent)) {
      const owner = (await sepolia.readContract({ address: registry, abi: userRegistryAbi, functionName: "getOwner", args: [labelhashId(agent)] })) as Hex;
      ensCache.set(agent, /^0x0{40}$/i.test(owner) ? null : owner);
    }
    return ensCache.get(agent)!;
  };
  const revocations: RevocationView[] = [];
  for (let offset = 0; ; ) {
    const page = await qRevocation().from(Revocation).where(and(eq("app", app), eq("team", team))).createdBy(teamWallet).limit(100).offset(offset).fetch();
    for (const r of page.entities as Row[]) revocations.push({ type: String(val(r.targetType)) as RevocationView["type"], id: String(val(r.target)) });
    if (page.entities.length + page.skipped < 100) break;
    offset += page.entities.length + page.skipped;
  }

  console.log(`verify ${key}\n  Arkiv Rabdi (chain ${config.networks.rabdi.chainId}) · namespace ${app}/${team} · ENSv2 registry ${registry} (Sepolia) · team-signed revocations: ${revocations.length}\n`);
  const r = await verifyLineage(key, { fetch: fetchEntity, ensOwner, teamWallet, revocations });
  for (const h of r.hops) {
    const who = h.signedBy === "owner" ? "owner (team wallet)" : `${h.agent}.${teamLabel}.eth`;
    console.log(`${h.ok ? "✓" : "✗"} ${h.key.slice(0, 12)}… ${h.kind.padEnd(8)} trust ${h.trust} · ${who}`);
    console.log(`    signed by ${h.creator}${h.signedBy === "agent" ? ` · ENS owner now ${h.ensOwner ?? "none"}` : ""} · held by team: ${h.ownerIsTeam ? "yes" : "NO"}`);
    if (h.revokedBy.length) console.log(`    REVOKED by the team: ${h.revokedBy.join(", ")}`);
    if (h.problem) console.log(`    problem: ${h.problem}`);
  }
  if (r.missing.length) console.log(`\n${r.missing.length} parent(s) no longer on Arkiv (expired after 2 days, or never written): ${r.missing.map((m) => `${m.slice(0, 12)}…`).join(", ")}`);
  console.log(`\n${r.ok ? "VERIFIED" : "NOT VERIFIED"}: ${r.hops.length} entit${r.hops.length === 1 ? "y" : "ies"} checked against Arkiv + ENS only${r.revoked ? " · this lineage includes REVOKED content" : ""}.`);
  console.log("Proves: each signer owns its agent's ENS name now, and the team holds each record. It cannot prove ownership at write time.");
  process.exit(r.ok ? 0 : 1);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message.replace(/https?:\/\/\S+/g, "<rpc>") : e);
  process.exit(2);
});
