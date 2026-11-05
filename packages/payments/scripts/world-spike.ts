// S1 World spike: discovery → device code → human approves/denies in World App → backend validation.
//   pnpm --filter @supabrain/payments world:spike -- --discover     (no credentials needed)
//   pnpm --filter @supabrain/payments world:spike                   (approve or deny on your phone)
//   pnpm --filter @supabrain/payments world:spike -- --cancel-after 20   (app-side cancel path)
// Prints public values only: never the client secret, the raw id_token, or the raw `sub`.
import { createRemoteJWKSet } from "jose";
import { loadConfig, requireEnv } from "@supabrain/shared/config";
import { discover } from "../src/world/discovery";
import { startDeviceAuthorization, waitForDecision } from "../src/world/deviceFlow";
import { IdTokenValidator } from "../src/world/idToken";
import { parseWorldConfig } from "../src/world/config";

const args = process.argv.slice(2);
const flag = (name: string) => args.includes(name);
const opt = (name: string) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
};

async function main() {
  const cfg = loadConfig();
  const world = parseWorldConfig(cfg.world);
  const t0 = Date.now();

  const d = await discover(world.issuer);
  console.log("discovery ✓", {
    issuer: d.issuer,
    device_authorization_endpoint: d.deviceAuthorizationEndpoint,
    token_endpoint: d.tokenEndpoint,
    jwks_uri: d.jwksUri,
    algorithms: d.algorithms,
  });
  if (flag("--discover")) return;

  const creds = { clientId: requireEnv("WORLD_CLIENT_ID"), clientSecret: requireEnv("WORLD_CLIENT_SECRET") };
  const validator = new IdTokenValidator({
    issuer: d.issuer,
    clientId: creds.clientId,
    jwks: createRemoteJWKSet(new URL(d.jwksUri)),
    algorithms: d.algorithms,
    authTimeSkewSec: world.authTimeSkewSec,
    requireEnrolledSub: world.requireEnrolledSub,
    approverSubHash: process.env.WORLD_APPROVER_SUB_HASH || undefined,
  });

  const h = await startDeviceAuthorization(d, creds, world.scope);
  console.log("\n  Open on your phone / World App:", h.verificationUriComplete ?? h.verificationUri);
  console.log("  User code:", h.userCode);
  console.log(`  Expires in ${Math.round((h.expiresAtMs - Date.now()) / 1000)}s, polling every ${h.intervalSec}s\n`);

  const ac = new AbortController();
  const cancelAfter = Number(opt("--cancel-after") ?? 0);
  if (cancelAfter > 0) setTimeout(() => ac.abort(), cancelAfter * 1000);

  const r = await waitForDecision({ discovery: d, creds, handle: h, validator, signal: ac.signal, maxIntervalSec: world.pollMaxIntervalSec });
  const secs = ((Date.now() - t0) / 1000).toFixed(1);
  if (r.status === "approved") {
    const c = r.claims;
    console.log(`APPROVED ✓ in ${secs}s (validated on the backend)`, {
      iss: c.iss,
      sub_hash: IdTokenValidator.subHash(c.iss, c.sub).slice(0, 12) + "…",
      auth_time: new Date(c.auth_time * 1000).toISOString(),
      acr: c.acr,
      amr: c.amr,
      jti: c.jti.slice(0, 6) + "…",
    });
  } else {
    console.log(`${r.status.toUpperCase()} after ${secs}s — nothing would move`, r.status === "failed" ? r.error : "");
  }
}

main().catch((e) => {
  console.error("world spike failed:", (e as Error).message);
  process.exit(1);
});
