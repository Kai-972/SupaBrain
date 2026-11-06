// pnpm demo:step approve [--cites k1] [--server URL] — demo beat 7 (P3): pay the vendor's ENS name the invoice amount,
// over the agent's ENS cap → PENDING HUMAN → approve in World App → PAID through BrainVault (Sepolia tx printed).
import { stepApprove } from "../../packages/payments/src/demo/steps";
import { demoContext, opt } from "./lib";

export async function runApprove(): Promise<boolean> {
  const { config, client, seed } = await demoContext();
  const vendor = (config.demo as { vendor?: string }).vendor ?? config.app.vendors[0]?.label;
  const team = config.app.ens.teamLabel;
  if (!vendor || !team) throw new Error("demo vendor or ENS team label missing from config");
  const inv = (config.demo as { invoice?: { amountUsdc?: string; memo?: string } }).invoice ?? {};
  const cites = opt("cites")?.split(",") ?? (seed.keys?.H1 ? [seed.keys.H1] : undefined);
  const r = await stepApprove(client, { payee: `${vendor}.${team}.eth`, amount: inv.amountUsdc ?? "5", memo: inv.memo ?? "invoice", cites }, {
    onPending: (a) => console.log(`\n>>> Approve in World App now (ref ${a.userCode}): ${a.verificationUri}\n    (the dashboard shows this as a QR; it expires ${new Date(a.expiresAt).toISOString()})\n`),
  });
  await client.close();
  console.log(r.ok ? "\n✓ P3 approved by a human in World App and PAID" : `\n✗ P3 ended ${r.decision.status}`);
  return r.ok;
}
