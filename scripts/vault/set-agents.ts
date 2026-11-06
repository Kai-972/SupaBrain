// pnpm vault:set-agents [--yes] — register each deployed agent in BrainVault (owner key):
//   setAgent(wallet, teamRegistry, uint256(labelhash), parseUnits(vaultDailyCeilingUsdc))
// wallet / registry / labelhash come from config/deployments/ens.sepolia.json; the ceiling from config/app.json.
// Throwaway agents are skipped. Agents already set with the same values are skipped.
import { parseUnits } from "viem";
import type { Hex } from "../lib/chain";
import { requireOk, type TxStep } from "../lib/tx";
import { brainVaultAbi, readVaultDeployment, vaultContext } from "./common";

async function main() {
  const ctx = await vaultContext();
  const { config, runner, ens } = ctx;
  const vault = readVaultDeployment();
  if (!vault) throw new Error("no config/deployments/vault.sepolia.json: run vault:deploy first");
  const registry = ens.teamRegistry?.address;
  if (!registry) throw new Error("ens.sepolia.json has no teamRegistry (Lane A S1)");
  const owner = ctx.owner();
  const decimals = config.tokens.usdc.decimals;

  let n = 0;
  for (const a of config.app.agents) {
    const e = ens.agents[a.label];
    if (!e) {
      console.log(`\n- ${a.label}: not in ens.sepolia.json, skipped`);
      continue;
    }
    if (e.throwaway) continue;
    const labelhash = BigInt(e.labelhash);
    const ceiling = parseUnits(a.vaultDailyCeilingUsdc, decimals);
    const cur = (await runner.pub.readContract({ address: vault.address, abi: brainVaultAbi, functionName: "agentOf", args: [e.wallet as Hex] })) as {
      registry: Hex; labelhash: bigint; dailyCeiling: bigint;
    };
    if (cur.registry.toLowerCase() === registry.toLowerCase() && cur.labelhash === labelhash && cur.dailyCeiling === ceiling) {
      console.log(`\n- ${a.label}: already set (ceiling ${a.vaultDailyCeilingUsdc} ${config.tokens.usdc.symbol}), skipped`);
      continue;
    }
    const step: TxStep = {
      id: `setAgent:${a.label}`,
      title: `setAgent ${a.label}.${ens.team?.label ?? "?"}.eth · daily ceiling ${a.vaultDailyCeilingUsdc} ${config.tokens.usdc.symbol}`,
      address: vault.address, target: "BrainVault", abi: brainVaultAbi as never, functionName: "setAgent",
      args: [e.wallet, registry, labelhash, ceiling],
    };
    requireOk(await runner.run(owner, "owner", step, String(++n)));
  }
  if (!n) console.log("\nnothing to do");
}

main().catch((e) => {
  console.error(`vault:set-agents failed: ${(e as Error).message}`);
  process.exit(1);
});
