// S1 World spike (World ID 4 / IDKit, Human-in-the-loop pattern):
//   server signs rp_context for `${prefix}:${intentHash}` → World App link/QR → human approves or denies
//   → proof checked locally + POST /api/v4/verify/{rp_id} → nullifier consumed once.
//   pnpm --filter @supabrain/payments world:spike                       (approve or deny on your phone)
//   pnpm --filter @supabrain/payments world:spike -- --cancel-after 20  (app-side cancel path)
//   overrides for probing (config/world.json stays the source of truth): --credentials proof_of_human,selfie --legacy
// The intent hash is random and labelled as a spike: no payment exists behind it and nothing can move.
// Prints public values only: never the signing key or the raw nullifier.
import { randomBytes } from "node:crypto";
import { loadConfig, requireEnv } from "@supabrain/shared/config";
import { IdkitConfigSchema, parseWorldConfig } from "../src/world/config";
import { InMemoryReplayStore, startHumanApproval, waitForHumanApproval, type Hex32 } from "../src/world/humanApproval";
import { idkitDeps } from "../src/world/idkitAdapter";

const args = process.argv.slice(2);
const opt = (name: string) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
};

async function main() {
  const world = parseWorldConfig(loadConfig().world);
  const creds = opt("--credentials");
  if (creds) world.idkit.credentials = IdkitConfigSchema.shape.credentials.parse(creds.split(","));
  if (args.includes("--legacy")) world.idkit.allowLegacyProofs = true;
  const deps = idkitDeps({
    appId: requireEnv("WORLD_APP_ID"),
    rpId: requireEnv("WORLD_RP_ID"),
    signingKeyHex: requireEnv("WORLD_SIGNING_KEY"),
    cfg: world.idkit,
    replay: new InMemoryReplayStore(),
  });

  const intentHash = `0x${randomBytes(32).toString("hex")}` as Hex32;
  const t0 = Date.now();
  const p = await startHumanApproval(deps, { intentHash, description: "Supabrain spike: approve a test payment (nothing moves)" });
  console.log(`environment: ${world.idkit.environment} · credentials: ${world.idkit.credentials.join(" | ")} · legacy: ${world.idkit.allowLegacyProofs}`);
  console.log(`action: ${p.action}`);
  console.log(`\n  Open in World App (scan as QR or open on the phone):\n  ${p.connectorURI}\n`);
  console.log(`  Ref ${p.userCode} · expires in ${Math.round((p.expiresAtMs - Date.now()) / 1000)}s\n`);

  const ac = new AbortController();
  const cancelAfter = Number(opt("--cancel-after") ?? 0);
  if (cancelAfter > 0) setTimeout(() => ac.abort(), cancelAfter * 1000);

  const d = await waitForHumanApproval(deps, p, { signal: ac.signal });
  const secs = ((Date.now() - t0) / 1000).toFixed(1);
  if (d.status === "approved") {
    console.log(`APPROVED ✓ in ${secs}s (verified by World + bound to this intent)`, {
      credential: d.credential,
      nullifier: `${d.nullifier.slice(0, 6)}…`,
    });
  } else {
    console.log(`${d.status.toUpperCase()} after ${secs}s, nothing would move`, "reason" in d ? d.reason : "error" in d ? d.error : "");
  }
}

main().catch((e) => {
  console.error("world spike failed:", (e as Error).message);
  process.exit(1);
});
