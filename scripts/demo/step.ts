// pnpm demo:step blocked|approve — stage fallbacks that never depend on a model being fooled live (CLAUDE.md §9).
// Also: pnpm demo:step-kill <agent> (scripts/demo/step-kill.ts).
import { runApprove } from "./step-approve";
import { runBlocked } from "./step-blocked";

const steps: Record<string, () => Promise<boolean>> = { blocked: runBlocked, approve: runApprove };
const which = process.argv[2];
const run = which ? steps[which] : undefined;
if (!run) {
  console.error(`usage: pnpm demo:step ${Object.keys(steps).join("|")} [--server URL] [--payee 0x…] [--cites k1,k2]`);
  process.exit(2);
}
run().then((ok) => process.exit(ok ? 0 : 1), (e) => {
  console.error(`demo:step ${which} failed: ${e instanceof Error ? e.message : e}`);
  process.exit(1);
});
