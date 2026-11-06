// pnpm ens:status — live ENSv2 authority for every configured agent, via the real EnsAuthority (what the server will use).
import { createEnsAuthority, createViemEnsChain, EnsUnavailableError } from "@supabrain/ens";
import { loadConfig } from "@supabrain/shared/config";
import { sepoliaClient } from "../lib/chain";
import { readEnsDeployment } from "../lib/deployments";

async function main() {
  const config = loadConfig();
  const { client } = await sepoliaClient(config);
  const deployments = readEnsDeployment(config);
  const auth = createEnsAuthority({ app: config.app, deployments, chain: createViemEnsChain(client) });
  console.log(`team ${config.app.ens.teamLabel}.eth · registry ${deployments.teamRegistry?.address}\n`);
  let bad = 0;
  for (const a of config.app.agents) {
    try {
      const v = await auth.getAgentAuthority(a.label);
      const flag = v.registered && v.recordsOk && v.status === "active" ? "✓" : "✗";
      if (flag === "✗") bad++;
      console.log(`${flag} ${v.ens.padEnd(32)} ${v.status.padEnd(12)} role=${v.role} scope=${v.scope} cap=${v.payCap} daily=${v.payDaily} vendor=${v.vendor} lease→${new Date(v.leaseExpiresAt).toISOString().slice(0, 16)}Z recordsOk=${v.recordsOk}`);
    } catch (e) {
      bad++;
      console.log(`✗ ${a.label}: ${e instanceof EnsUnavailableError ? "AUTHORITY UNKNOWN (fail closed) " : ""}${e instanceof Error ? e.message : e}`);
    }
  }
  console.log(`\nvendors: ${auth.teamVendors().join(", ")}`);
  for (const v of auth.teamVendors()) console.log(`  ${v} → ${(await auth.resolveEns(v)) ?? "null (not set up yet: S5)"}`);
  const ref = auth.agentRegistryRef(config.app.agents[0]!.label);
  console.log(`vault ref for ${config.app.agents[0]!.label}: registry ${ref.registry} labelhash ${ref.labelhash}`);
  process.exit(bad ? 1 : 0);
}
main().catch((e) => { console.error(e instanceof Error ? e.message : e); process.exit(1); });
