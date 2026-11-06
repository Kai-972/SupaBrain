// pnpm demo:step blocked [--payee 0x…] [--cites k1,k2] [--server URL] — demo beat 4 (P1): the agent tries to pay the
// address from the "bank details changed" email; ENS says the vendor's address is different → BLOCKED (ENS_MISMATCH).
import { stepBlocked } from "../../packages/payments/src/demo/steps";
import { demoContext, opt } from "./lib";

export async function runBlocked(): Promise<boolean> {
  const { config, client, seed } = await demoContext();
  const payee = opt("payee") ?? seed.attackerAddress;
  if (!payee) throw new Error("no attacker address: pass --payee 0x… or run pnpm demo:seed against this server (config/deployments/demo-seed.<namespace>.json)");
  const cites = opt("cites")?.split(",") ?? (seed.keys?.M2 ? [seed.keys.M2] : undefined);
  const inv = (config.demo as { invoice?: { amountUsdc?: string; memo?: string } }).invoice ?? {};
  const r = await stepBlocked(client, { payee, amount: inv.amountUsdc ?? "5", memo: inv.memo ?? "invoice", cites });
  await client.close();
  console.log(r.ok ? "\n✓ P1 BLOCKED by ENS, nothing moved" : "\n✗ P1 did not block as expected");
  return r.ok;
}
